"""Exact short-request boundary; a local byte count is NOT a token estimate."""
import hashlib
import json
import threading
import time
import urllib.request
from durable_budget import BudgetBlocked

MAX_BYTES = 2048
MAX_INPUT = 1024
MAX_OUTPUT = 128
COUNT_FIELDS = frozenset({'model', 'input', 'instructions', 'reasoning', 'text',
                         'tools', 'tool_choice', 'parallel_tool_calls', 'truncation'})

def serialized(payload):
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True,
                     separators=(',', ':'), allow_nan=False).encode('utf-8')
    if len(raw) > MAX_BYTES:
        raise BudgetBlocked('CANARY_REQUEST_TOO_LARGE')
    return raw

def request_sha(payload):
    return hashlib.sha256(serialized(payload)).hexdigest()

def count_payload(payload):
    # These are all context-bearing fields of the fixed request. Output length,
    # storage/stream/background and service tier do not add input context.
    allowed = COUNT_FIELDS | {'max_output_tokens', 'store', 'stream',
                              'background', 'service_tier'}
    if set(payload) != allowed:
        raise BudgetBlocked('UNCOUNTED_REQUEST_FIELD')
    serialized(payload)
    return {key: payload[key] for key in sorted(COUNT_FIELDS)}

class InputBound:
    """One exact-count request, bound to immutable serialized model request.

    The injected counter must implement the official input_tokens contract.
    Network counting is disabled unless its billing is independently verified.
    A byte length alone never produces a VERIFIED token bound.
    """
    def __init__(self, counter, *, clock=time.monotonic):
        self.counter, self.clock = counter, clock
        self.is_fixture = getattr(counter, 'is_fixture', False) is True
        self._lock = threading.Lock()
        self._used = False
        self._proof = None

    def verify(self, payload):
        body_sha = request_sha(payload)
        counted = count_payload(payload)
        with self._lock:
            if self._used:
                raise BudgetBlocked('TOKEN_COUNTER_ALREADY_ATTEMPTED')
            self._used = True
        try:
            result = self.counter(counted)
            value = result['input_tokens']
            if (result.get('object') != 'response.input_tokens' or type(value) is not int
                    or not 0 < value <= MAX_INPUT):
                raise ValueError()
            self._proof = {'request_sha256': body_sha, 'input_tokens': value,
                           'count_payload_sha256': request_sha(counted),
                           'created': self.clock()}
            return {k: v for k, v in self._proof.items() if k != 'created'}
        except Exception:
            raise BudgetBlocked('INPUT_TOKEN_BOUND_UNVERIFIED_NO_RETRY') from None

    def assert_bound(self, payload):
        if (not self._proof or self._proof['request_sha256'] != request_sha(payload)
                or not 0 <= self.clock() - self._proof['created'] <= 60):
            raise BudgetBlocked('INPUT_TOKEN_BOUND_STALE_OR_MISMATCH')

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

class OfficialTokenCounter:
    """Prepared count-only endpoint. No model inference, fallback or retries.

    Its published price is not established by the model token price table.
    billing_authority must independently attest a zero incremental charge and
    explicit approval for this count request before any network I/O.
    """
    is_fixture = False
    def __init__(self, api_key, billing_authority):
        self._key, self._authority = api_key, billing_authority
        self._used, self._lock = False, threading.Lock()

    def __call__(self, payload):
        if not callable(self._authority):
            raise BudgetBlocked('TOKEN_COUNT_APPROVAL_REQUIRED')
        authority = self._authority(request_sha(payload))
        if (not isinstance(authority, dict) or authority.get('approved') is not True
                or authority.get('billing_verified') is not True
                or type(authority.get('maximum_microusd')) is not int
                or authority['maximum_microusd'] != 0
                or not authority.get('billing_evidence_sha256')):
            raise BudgetBlocked('TOKEN_COUNT_BILLING_UNVERIFIED')
        if not isinstance(self._key, str) or not self._key:
            raise BudgetBlocked('API_KEY_REQUIRED')
        with self._lock:
            if self._used:
                raise BudgetBlocked('TOKEN_COUNTER_ALREADY_ATTEMPTED')
            self._used = True
        try:
            req = urllib.request.Request('https://api.openai.com/v1/responses/input_tokens',
                data=serialized(payload), method='POST', headers={
                    'Authorization': 'Bearer ' + self._key, 'Content-Type': 'application/json'})
            with urllib.request.build_opener(_NoRedirect).open(req, timeout=20) as response:
                raw = response.read(4097)
                if len(raw) > 4096:
                    raise ValueError()
                return json.loads(raw)
        except Exception:
            raise BudgetBlocked('TOKEN_COUNT_REQUEST_FAILED_NO_RETRY') from None
