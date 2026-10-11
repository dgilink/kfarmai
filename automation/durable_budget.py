"""Service-only RPC protocol. No credentials, HTTP client or live activation here."""
import hashlib
import json
import uuid


class BudgetBlocked(ValueError):
    pass


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     allow_nan=False).encode()).hexdigest()


class DurableBudget:
    def __init__(self, rpc):
        self.rpc = rpc

    def call(self, command, payload):
        try:
            value = self.rpc(command, payload)
            if not isinstance(value, dict) or value.get('blocked'):
                raise BudgetBlocked('BUDGET_RPC_BLOCKED')
            return value
        except Exception:
            # Never emit connection strings, payloads, provider bodies or secrets.
            raise BudgetBlocked('BUDGET_RPC_BLOCKED') from None

    def reserve(self, run_id, operation, channel, maximum, identity):
        if type(maximum) is not int or maximum <= 0:
            raise BudgetBlocked('INVALID_MAXIMUM')
        key = f'dgilink/kfarmai/{run_id}/{operation}'
        payload = dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL, key)), run_id=str(run_id),
                       operation=operation, channel=channel, maximum=maximum,
                       fingerprint=fingerprint(identity))
        result = self.call('reserve', payload)
        if result.get('acquired') is not True:
            raise BudgetBlocked('DUPLICATE_RUN_OPERATION')
        return payload

    def execute(self, reservation, transport, settle_usage):
        if self.call('dispatch', reservation).get('execute') is not True:
            raise BudgetBlocked('DISPATCH_BLOCKED')
        try:
            response = transport()
        except Exception:
            self.call('unknown', reservation)
            raise BudgetBlocked('CALL_UNCONFIRMED_NO_RETRY') from None
        try:
            actual, receipt = settle_usage(response)
            if type(actual) is not int or actual < 0:
                raise BudgetBlocked('INVALID_USAGE')
            receipt_hash = fingerprint(receipt)
        except Exception:
            # Unverifiable usage can invalidate the assumed maximum. Persist a
            # global circuit breaker before allowing any other run to dispatch.
            self.call('freeze', reservation)
            raise BudgetBlocked('USAGE_UNVERIFIED_BUDGET_FROZEN') from None
        try:
            result = self.call('settle', {**reservation, 'actual': actual,
                                         'receipt': receipt_hash})
            if result.get('state') != 'SETTLED':
                raise BudgetBlocked('UNCONFIRMED_USAGE')
            return response
        except Exception:
            # A lost reply is NOT evidence of a free call. Hold the maximum.
            # No timeout refunds or automatic provider retries.
            self.call('unknown', reservation)
            raise BudgetBlocked('CALL_UNCONFIRMED_NO_RETRY') from None
