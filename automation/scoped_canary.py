"""Canary-only approval verifier and adapter for the additive scoped RPC.

No policy management HTTP path is exposed here. Only the postgres operator may
arm the private scope using separately approved SQL; service-role cannot arm it.
"""
import copy
import json
import math
import time
import uuid
import urllib.request
from durable_budget import DurableBudget, BudgetBlocked, fingerprint
from light_canary import PROJECT, plan, require, _NoRedirect

def scope_identity(approval_id):
    require(isinstance(approval_id, str) and approval_id.isascii()
            and 1 <= len(approval_id) <= 96
            and all(x.isalnum() or x in '-_' for x in approval_id), 'INVALID_APPROVAL_ID')
    expected = plan()
    run_id = '9' + str(int(fingerprint(approval_id)[:15], 16)).zfill(19)
    return {'approval_id': approval_id, 'project_id': PROJECT,
            'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f'dgilink/kfarmai/{run_id}/content')),
            'plan_sha256': fingerprint(expected), 'request_sha256': expected['request_sha256'],
            'run_id': run_id, 'operation': 'content', 'channel': 'REVIEW',
            'maximum': expected['maximum_microusd'],
            'fingerprint': fingerprint({'plan': expected, 'approval_id': approval_id})}

class ScopedCanaryBudget(DurableBudget):
    scoped_canary = True
    def __init__(self, rpc, approval_id):
        super().__init__(rpc)
        self.identity = scope_identity(approval_id)
        self._deadline = None

    def verify_authorization(self, approval, plan_sha256):
        require(approval == self.identity['approval_id']
                and plan_sha256 == self.identity['plan_sha256'], 'APPROVAL_ID_MISMATCH')
        started = time.monotonic()
        value = self.call('status', copy.deepcopy(self.identity))
        require(all(value.get(k) == v for k, v in self.identity.items()), 'SCOPE_IDENTITY_MISMATCH')
        require(value.get('can_reserve') is True and value.get('locked') is False
                and value.get('state') == 'ARMED', 'SCOPE_NOT_ARMED')
        require(isinstance(value.get('model_approval_id'), str) and value['model_approval_id']
                and isinstance(value.get('budget_approval_id'), str) and value['budget_approval_id']
                and value['model_approval_id'] != value['budget_approval_id'], 'SEPARATE_APPROVALS_REQUIRED')
        require(value.get('billing_multiplier') in {'1.00', '1.10'}, 'BILLING_REGION_UNVERIFIED')
        remaining = value.get('remaining_seconds')
        require(type(remaining) in (int, float) and math.isfinite(remaining)
                and 0 < remaining <= 300, 'SCOPE_EXPIRY_UNVERIFIED')
        # Starting before the RPC deducts round-trip time conservatively. No
        # reliance on the workstation wall clock matching the DB clock.
        self._deadline = started + remaining
        # These fields are derived from the operator-only DB record, not from
        # user JSON booleans. Account/billing/live flags remain separate gates.
        return {'approval_id': approval, 'project_id': PROJECT,
                'plan_sha256': plan_sha256, 'maximum_microusd': self.identity['maximum'],
                'mode': 'CANARY_ONLY', 'model_approved': True, 'budget_approved': True,
                'billing_multiplier': value['billing_multiplier'], 'live_authorized': True}

    def assert_call_deadline(self):
        require(self._deadline is not None and time.monotonic() < self._deadline,
                'SCOPE_EXPIRED_BEFORE_SEND')

    def reserve(self, run_id, operation, channel, maximum, identity):
        require(str(run_id) == self.identity['run_id'] and operation == 'content'
                and channel == 'REVIEW' and type(maximum) is int
                and maximum == self.identity['maximum']
                and fingerprint(identity) == self.identity['fingerprint'], 'SCOPE_RESERVATION_MISMATCH')
        payload = copy.deepcopy(self.identity)
        require(self.call('reserve', payload).get('acquired') is True, 'SCOPED_RESERVATION_DENIED')
        return payload

    def verify_locked(self, reservation):
        state = self.call('status', reservation)
        require(state.get('locked') is True and state.get('can_dispatch') is False
                and state.get('can_reserve') is False and state.get('state') == 'SETTLED',
                'POST_CALL_LOCK_UNVERIFIED')
        require(all(state.get(k) == v for k, v in self.identity.items()), 'SCOPE_IDENTITY_MISMATCH')
        return state

class ScopedBudgetRPCTransport:
    """Only scoped service RPC on the exact project; no management command."""
    def __init__(self, service_key, live_authority):
        require(callable(live_authority), 'TRUSTED_AUTHORITY_REQUIRED')
        self._key, self._authority = service_key, live_authority

    def __call__(self, command, payload):
        require(command in {'status', 'reserve', 'dispatch', 'settle', 'unknown', 'freeze'},
                'UNSUPPORTED_SCOPED_OPERATION')
        require(payload.get('project_id') == PROJECT, 'PROJECT_MISMATCH')
        require(self._authority(command, copy.deepcopy(payload)) is True, 'SCOPE_APPROVAL_REQUIRED')
        try:
            req = urllib.request.Request(
                'https://xzetqijeucldbfgjuoes.supabase.co/rest/v1/rpc/kfarmai_canary_budget',
                data=json.dumps({'command': command, 'payload': payload}, allow_nan=False).encode(),
                headers={'apikey': self._key, 'Authorization': 'Bearer ' + self._key,
                         'Content-Type': 'application/json'}, method='POST')
            with urllib.request.build_opener(_NoRedirect).open(req, timeout=20) as response:
                raw = response.read(16385)
                require(len(raw) <= 16384, 'SCOPE_RESPONSE_TOO_LARGE')
                return json.loads(raw)
        except Exception:
            raise BudgetBlocked('SCOPED_RPC_FAILED_NO_RETRY') from None
