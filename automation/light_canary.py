"""Gate B preparation: fixed synthetic input; no CLI or implicit live authorization."""
from __future__ import annotations
import copy
from decimal import Decimal, ROUND_CEILING
import json
from pathlib import Path
import threading
import urllib.request
from durable_budget import BudgetBlocked, DurableBudget, fingerprint
from model_router import TaskProfile, route_task
from canary_input import MAX_INPUT, MAX_OUTPUT, MAX_BYTES, serialized, request_sha

PROJECT = "xzetqijeucldbfgjuoes"
CONFIG = Path(__file__).with_name("light-canary-contract.json")
FIXED_INPUT = "온실 관수 설비를 점검하기 전에 확인할 일반적인 항목 3개를 JSON 배열로 반환하라."
MODEL = "gpt-6-luna"
SCHEMA = {"type": "object", "properties": {
    "mode": {"type": "string", "enum": ["CANARY_ONLY"]},
    "items": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 3}},
    "required": ["mode", "items"], "additionalProperties": False}

def require(value, code):
    if not value:
        raise BudgetBlocked(code)

def integer(value, maximum):
    require(type(value) is int and 0 <= value <= maximum, "INVALID_USAGE_COUNTER")
    return value

def contract():
    return json.loads(CONFIG.read_text(encoding="utf-8"))

def request_payload(env=None):
    route = route_task(TaskProfile("content_generation", source_count=0,
                                  input_chars=len(FIXED_INPUT)), env={} if env is None else env)
    require(route.tier == "LIGHT" and route.model == MODEL and not route.blocked
            and not route.web_search_enabled and route.outcome == "ROUTE", "LIGHT_ONLY")
    return {"model": MODEL, "input": FIXED_INPUT,
            "instructions": "Synthetic CANARY_ONLY test. No personal data, tools, sources or pesticide advice. Put the three-item array in items.",
            "reasoning": {"effort": "none"}, "max_output_tokens": MAX_OUTPUT,
            "tools": [], "tool_choice": "none", "parallel_tool_calls": False,
            "store": False, "stream": False, "background": False,
            "service_tier": "default", "truncation": "disabled",
            "text": {"format": {"type": "json_schema", "name": "canary_only",
                                "strict": True, "schema": copy.deepcopy(SCHEMA)}}}

def ceiling_microusd():
    # Short input only; reserve the highest applicable input rate (cache write)
    # and regional premium, even when ordinary uncached billing is cheaper.
    return int(((Decimal("0.125") * MAX_INPUT + Decimal("0.50") * MAX_OUTPUT)
                * Decimal("1.10")).to_integral_value(rounding=ROUND_CEILING))

def plan(env=None):
    spec = contract()
    require(spec["model"] == MODEL and spec["version"] == "integration10-2026-10-10",
            "UNVERIFIED_MODEL_CONTRACT")
    # Pin the published billing contract instead of trusting editable rates.
    require(spec["rates_per_million"] == {
        "short": {"input": "0.10", "cached": "0.01", "cache_write": "0.125", "output": "0.50"},
        "long": {"input": "0.20", "cached": "0.02", "cache_write": "0.25", "output": "0.75"}}
        and spec["max_input_tokens"] == MAX_INPUT and spec["max_output_tokens"] == MAX_OUTPUT
        and spec["max_serialized_bytes"] == MAX_BYTES
        and spec["reservation_region_multiplier"] == "1.10"
        and spec["long_threshold"] == 272000, "PRICE_CONTRACT_TAMPERED")
    payload = request_payload(env)
    return {"mode": "CANARY_ONLY", "tier": "LIGHT", "model": MODEL,
            "maximum_microusd": ceiling_microusd(), "max_input_tokens": MAX_INPUT,
            "request_sha256": request_sha(payload), "serialized_bytes": len(serialized(payload)),
            "max_output_tokens": MAX_OUTPUT, "calls": 1, "retries": 0, "search": 0,
            "images": 0, "payload": payload, "contract_sha256": fingerprint(spec)}

def reconcile(response, billing_multiplier):
    plan()  # Revalidate the pinned billing rates before settlement.
    require(response.get("model") == MODEL and response.get("service_tier") == "default"
            and isinstance(response.get("id"), str) and response["id"].startswith("resp_"),
            "RESPONSE_IDENTITY_UNVERIFIED")
    require(response.get("status") in {"completed", "incomplete", "failed"},
            "RESPONSE_STATUS_UNVERIFIED")
    usage = response["usage"]
    inp = integer(usage["input_tokens"], MAX_INPUT)
    out = integer(usage["output_tokens"], MAX_OUTPUT)
    require(integer(usage["total_tokens"], MAX_INPUT + MAX_OUTPUT) == inp + out, "USAGE_TOTAL_MISMATCH")
    details = usage["input_tokens_details"]
    cached = integer(details["cached_tokens"], inp)
    written = integer(details["cache_write_tokens"], inp)
    require(cached + written <= inp, "CACHE_USAGE_OVERLAP")
    reasoning = integer(usage["output_tokens_details"]["reasoning_tokens"], out)
    require(all(item.get("type") in {"message", "reasoning"} for item in response["output"]),
            "UNEXPECTED_TOOL_USAGE")
    require(billing_multiplier in {"1.00", "1.10"}, "BILLING_REGION_UNVERIFIED")
    rates = contract()["rates_per_million"]["long" if inp > 272000 else "short"]
    cost = ((inp-cached-written)*Decimal(rates["input"]) + cached*Decimal(rates["cached"])
            + written*Decimal(rates["cache_write"]) + out*Decimal(rates["output"]))
    amount = int((cost*Decimal(billing_multiplier)).to_integral_value(rounding=ROUND_CEILING))
    # Never carry provider-added metadata into receipts or user-visible logs.
    clean_usage = {"input_tokens": inp, "output_tokens": out, "total_tokens": inp + out,
                   "input_tokens_details": {"cached_tokens": cached, "cache_write_tokens": written},
                   "output_tokens_details": {"reasoning_tokens": reasoning}}
    return amount, {"response_id": response["id"], "model": MODEL,
                    "usage": clean_usage, "billing_multiplier": billing_multiplier}

class CanaryRunner:
    """Authorization verifier is host-injected. No JSON boolean enables live I/O.

    The current Candidate supplies no trusted live verifier. A fixture verifier
    only authorizes transports explicitly marked as fixtures.
    """
    def __init__(self, budget, transport, authorization_verifier, input_bound=None):
        self.budget, self.transport, self.verifier = budget, transport, authorization_verifier
        self.input_bound = input_bound
        self._lock, self._used = threading.Lock(), False

    def run(self, approval, env=None):
        expected = plan(env)
        authority = self.verifier(approval, fingerprint(expected)) if self.verifier else None
        require(isinstance(authority, dict) and authority.get("model_approved") is True
                and authority.get("budget_approved") is True
                and authority.get("plan_sha256") == fingerprint(expected)
                and authority.get("project_id") == PROJECT
                and authority.get("maximum_microusd") == expected["maximum_microusd"]
                and authority.get("mode") == "CANARY_ONLY", "SEPARATE_APPROVALS_REQUIRED")
        approval_id = authority.get("approval_id")
        require(isinstance(approval_id, str) and approval_id.isascii() and
                1 <= len(approval_id) <= 96 and all(x.isalnum() or x in "-_" for x in approval_id),
                "INVALID_APPROVAL_ID")
        fixture = getattr(self.transport, "is_fixture", False) is True
        if not fixture:
            # A trusted verifier must return an independent live grant. The
            # published Candidate contract is intentionally still UNVERIFIED.
            require(authority.get("live_authorized") is True and
                    contract()["live_enabled"] is True and
                    contract()["account_compatibility"] == "VERIFIED" and
                    contract()["account_billing_context"] == "VERIFIED" and
                    contract()["token_counter_billing"] == "VERIFIED_ZERO" and
                    getattr(self.budget, "scoped_canary", False) is True,
                    "LIVE_ACCOUNT_OR_AUTHORITY_UNVERIFIED")
        require(authority.get("billing_multiplier") in {"1.00", "1.10"},
                "BILLING_REGION_UNVERIFIED")
        require(self.input_bound is not None and
                (fixture == (getattr(self.input_bound, "is_fixture", False) is True)),
                "VERIFIED_INPUT_COUNTER_REQUIRED")
        with self._lock:
            require(not self._used, "CANARY_ALREADY_ATTEMPTED")
            self._used = True
        proof = self.input_bound.verify(copy.deepcopy(expected["payload"]))
        # Existing RPC accepts a numeric run_id (1..20 digits) and its content
        # operation. The approval fingerprint supplies stable retry identity;
        # REVIEW here is the shared cost channel, never a publishable package.
        run_id = "9" + str(int(fingerprint(approval_id)[:15], 16)).zfill(19)
        reservation = self.budget.reserve(run_id, "content", "REVIEW",
            expected["maximum_microusd"], {"plan": expected, "approval_id": approval_id})
        def invoke():
            try:
                self.input_bound.assert_bound(expected["payload"])
                if getattr(self.budget, "scoped_canary", False):
                    self.budget.assert_call_deadline()
                return self.transport(copy.deepcopy(expected["payload"]))
            except Exception:
                # Network errors may be billed. Freeze and hold the entire
                # reservation; never retry, refund, or call another model.
                self.budget.call("freeze", reservation)
                raise BudgetBlocked("MODEL_ERROR_NO_RETRY") from None
        def settle(r):
            require(r.get("usage", {}).get("input_tokens") == proof["input_tokens"],
                    "COUNT_USAGE_MISMATCH")
            amount, receipt = reconcile(r, authority["billing_multiplier"])
            return amount, {**receipt, "input_bound": proof}
        response = self.budget.execute(reservation, invoke, settle)
        if getattr(self.budget, "scoped_canary", False):
            self.budget.verify_locked(reservation)
        # Settle a valid charge even when the model refused/truncated the output.
        # A failed content check never causes a second request.
        try:
            require(response["status"] == "completed", "CANARY_OUTPUT_INCOMPLETE")
            messages = [x for x in response["output"] if x["type"] == "message"]
            require(len(messages) == 1 and messages[0].get("role") == "assistant",
                    "CANARY_OUTPUT_INVALID")
            content = messages[0]["content"]
            require(len(content) == 1 and content[0]["type"] == "output_text",
                    "CANARY_OUTPUT_REFUSED")
            value = json.loads(content[0]["text"])
            require(set(value) == {"mode", "items"} and value["mode"] == "CANARY_ONLY"
                    and type(value["items"]) is list and len(value["items"]) == 3
                    and all(type(s) is str and 0 < len(s) <= 500 for s in value["items"]),
                    "CANARY_OUTPUT_INVALID")
        except Exception:
            raise BudgetBlocked("CANARY_OUTPUT_INVALID_NO_RETRY") from None
        # No response text is returned/logged or converted into REVIEW artifacts.
        amount, receipt = reconcile(response, authority["billing_multiplier"])
        return {"mode": "CANARY_ONLY", "publishable": False, "item_count": 3,
                "output_sha256": fingerprint(value), "usage": receipt["usage"],
                "actual_microusd": amount, "reservation_id": reservation["id"],
                "model_calls": 1, "token_count_requests": 1, "input_bound": proof,
                "search_calls": 0, "image_calls": 0, "retries": 0}

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

class ResponsesTransport:
    """Prepared stdlib transport: exact endpoint/payload, no redirects/retries."""
    is_fixture = False
    def __init__(self, api_key, live_authority, input_bound=None):
        require(callable(live_authority), "TRUSTED_AUTHORITY_REQUIRED")
        self._key, self._authority, self._used = api_key, live_authority, False
        self.input_bound = input_bound
        self._lock = threading.Lock()
    def __call__(self, payload):
        require(self._authority(fingerprint(payload)) is True, "LIVE_AUTHORITY_REQUIRED")
        require(payload == request_payload(), "CANARY_PAYLOAD_TAMPERED")
        require(self.input_bound is not None, "VERIFIED_INPUT_COUNTER_REQUIRED")
        self.input_bound.assert_bound(payload)
        require(isinstance(self._key, str) and self._key, "API_KEY_REQUIRED")
        with self._lock:
            require(not self._used, "TRANSPORT_ALREADY_ATTEMPTED")
            self._used = True
        try:
            request = urllib.request.Request("https://api.openai.com/v1/responses",
                data=serialized(payload),
                headers={"Authorization": "Bearer "+self._key, "Content-Type": "application/json"},
                method="POST")
            with urllib.request.build_opener(_NoRedirect).open(request, timeout=60) as response:
                raw = response.read(1048577)
                require(len(raw) <= 1048576, "RESPONSE_TOO_LARGE")
                return json.loads(raw)
        except Exception:
            raise BudgetBlocked("PROVIDER_REQUEST_FAILED_NO_RETRY") from None

class BudgetRPCTransport:
    """Prepared existing service-role RPC route; no table or policy writes."""
    def __init__(self, service_key, live_authority):
        require(callable(live_authority), "TRUSTED_AUTHORITY_REQUIRED")
        self._key, self._authority = service_key, live_authority
    def __call__(self, command, payload):
        require(command in {"reserve", "dispatch", "settle", "unknown", "freeze"},
                "UNSUPPORTED_BUDGET_OPERATION")
        require(self._authority(command, payload) is True, "BUDGET_APPROVAL_REQUIRED")
        try:
            request = urllib.request.Request(
                "https://xzetqijeucldbfgjuoes.supabase.co/rest/v1/rpc/kfarmai_budget",
                data=json.dumps({"command":command,"payload":payload}).encode(),
                headers={"apikey":self._key,"Authorization":"Bearer "+self._key,
                         "Content-Type":"application/json"}, method="POST")
            with urllib.request.build_opener(_NoRedirect).open(request,timeout=20) as response:
                return json.load(response)
        except Exception:
            raise BudgetBlocked("BUDGET_RPC_FAILED_NO_RETRY") from None
