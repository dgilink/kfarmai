import copy
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation'))
from durable_budget import BudgetBlocked, DurableBudget, fingerprint
from canary_input import (InputBound, OfficialTokenCounter, serialized, request_sha,
                         count_payload, MAX_INPUT)
from light_canary import (CanaryRunner, ResponsesTransport, plan, request_payload,
                          reconcile, contract)
from scoped_canary import ScopedCanaryBudget, ScopedBudgetRPCTransport, scope_identity
from test_light_canary import Ledger, Provider, authority, response, bound

class FakeCounter:
    is_fixture = True
    def __init__(self, count=100, error=None):
        self.count, self.error, self.calls = count, error, []
    def __call__(self, payload):
        self.calls.append(copy.deepcopy(payload))
        if self.error:
            raise self.error
        return {'object': 'response.input_tokens', 'input_tokens': self.count}

class InputBoundaryTests(unittest.TestCase):
    def setUp(self):
        guard = patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('No network'))
        guard.start(); self.addCleanup(guard.stop)

    def run_count(self, counter, provider=None):
        ledger, provider = Ledger(), provider or Provider()
        runner = CanaryRunner(DurableBudget(ledger), provider, authority, InputBound(counter))
        return runner, ledger, provider

    def test_missing_counter_blocks_before_budget(self):
        ledger, provider = Ledger(), Provider()
        with self.assertRaisesRegex(BudgetBlocked, 'INPUT_COUNTER'):
            CanaryRunner(DurableBudget(ledger), provider, authority).run('mock-explicit-model-and-budget')
        self.assertEqual([], ledger.events); self.assertEqual([], provider.calls)

    def test_short_serialized_request_and_all_context_fields_counted(self):
        payload = request_payload(); raw = serialized(payload)
        self.assertLessEqual(len(raw), 2048)
        self.assertEqual(payload, json.loads(raw))
        counted = count_payload(payload)
        for field in ['input', 'instructions', 'text', 'reasoning', 'tools']:
            self.assertEqual(payload[field], counted[field])
        self.assertNotIn('previous_response_id', counted)
        self.assertEqual(plan()['request_sha256'], request_sha(payload))

    def test_bytes_do_not_claim_token_bound(self):
        counter = FakeCounter(count=1025)
        runner, ledger, provider = self.run_count(counter)
        with self.assertRaises(BudgetBlocked): runner.run('mock-explicit-model-and-budget')
        self.assertEqual([], ledger.events); self.assertEqual([], provider.calls)

    def test_bad_counter_and_missing_schema_response_fail_closed(self):
        for count in [True, 0, -1, '100', 1025, None]:
            with self.subTest(count=count):
                runner, ledger, provider = self.run_count(FakeCounter(count=count))
                with self.assertRaises(BudgetBlocked): runner.run('mock-explicit-model-and-budget')
                self.assertEqual([], provider.calls); self.assertEqual([], ledger.events)

    def test_unknown_fields_and_oversize_rejected_before_count(self):
        for field, value in [('previous_response_id', 'resp_x'), ('input', 'x' * 4096),
                             ('conversation', 'conv_x'), ('attachments', ['file_x'])]:
            p = request_payload(); p[field] = value; counter = FakeCounter()
            with self.assertRaises(BudgetBlocked): InputBound(counter).verify(p)
            self.assertEqual([], counter.calls)

    def test_count_failure_no_retry_no_model_no_reservation(self):
        c = FakeCounter(error=TimeoutError('sensitive-body'))
        runner, ledger, provider = self.run_count(c)
        for _ in range(2):
            with self.assertRaises(BudgetBlocked) as error: runner.run('mock-explicit-model-and-budget')
            self.assertNotIn('sensitive-body', str(error.exception))
        self.assertEqual(1, len(c.calls)); self.assertEqual([], provider.calls)
        self.assertEqual([], ledger.events)

    def test_counter_bound_cannot_be_reused_for_changed_request(self):
        clock = [10.0]; b = InputBound(FakeCounter(), clock=lambda: clock[0])
        p = request_payload(); b.verify(p); b.assert_bound(p)
        changed = copy.deepcopy(p); changed['input'] += 'x'
        with self.assertRaises(BudgetBlocked): b.assert_bound(changed)
        clock[0] = 71.0
        with self.assertRaises(BudgetBlocked): b.assert_bound(p)
        with self.assertRaises(BudgetBlocked): b.verify(p)

    def test_count_and_actual_usage_mismatch_freezes(self):
        runner, ledger, provider = self.run_count(FakeCounter(count=99))
        with self.assertRaisesRegex(BudgetBlocked, 'USAGE_UNVERIFIED'):
            runner.run('mock-explicit-model-and-budget')
        self.assertEqual(1, len(provider.calls))
        row = next(iter(ledger.rows.values()))
        self.assertEqual('UNKNOWN', row['state']); self.assertEqual(212, row['maximum'])
        self.assertNotIn('actual', row)

    def test_maximum_reserves_worst_short_cache_write_and_region(self):
        r = response(); r['usage'].update(input_tokens=1024, output_tokens=128, total_tokens=1152)
        r['usage']['input_tokens_details'].update(cached_tokens=0, cache_write_tokens=1024)
        self.assertEqual(212, reconcile(r, '1.10')[0]); self.assertEqual(212, plan()['maximum_microusd'])
        r['usage']['input_tokens'] = 1025
        with self.assertRaises(BudgetBlocked): reconcile(r, '1.10')

    def test_token_counter_unverified_billing_never_sends(self):
        for receipt in [{}, {'approved': True, 'billing_verified': False},
                        {'approved': True, 'billing_verified': True, 'maximum_microusd': 1}]:
            with self.assertRaisesRegex(BudgetBlocked, 'BILLING_UNVERIFIED'):
                OfficialTokenCounter('fixture', lambda _: receipt)(count_payload(request_payload()))
        self.assertEqual('UNVERIFIED', contract()['token_counter_billing'])
        self.assertFalse(contract()['live_enabled'])

    def test_provider_metadata_does_not_escape_numeric_usage(self):
        r = response(); r['usage']['unexpected'] = 'synthetic-sensitive-metadata'
        r['usage']['input_tokens_details']['unexpected'] = 'synthetic-sensitive-metadata'
        runner, ledger, _ = self.run_count(FakeCounter(), Provider(r))
        result = runner.run('mock-explicit-model-and-budget')
        self.assertNotIn('synthetic-sensitive-metadata', json.dumps(result))

    def test_exact_transmitted_bytes_are_counted_no_redirect_retry(self):
        p = request_payload(); b = bound(); b.verify(p)
        transport = ResponsesTransport('fixture', lambda _: True, b)
        mock_response = io.BytesIO(json.dumps(response()).encode())
        with patch('urllib.request.OpenerDirector.open', return_value=mock_response) as opener:
            transport(p)
            req = opener.call_args.args[0]
            self.assertEqual(serialized(p), req.data)
            self.assertEqual('https://api.openai.com/v1/responses', req.full_url)
            with self.assertRaises(BudgetBlocked): transport(p)
            self.assertEqual(1, opener.call_count)

class ScopedAdapterTests(unittest.TestCase):
    def test_untrusted_user_booleans_cannot_authorize(self):
        called = []
        budget = ScopedCanaryBudget(lambda *args: called.append(args), 'test-scope')
        with self.assertRaises(BudgetBlocked):
            budget.verify_authorization({'model_approved': True, 'budget_approved': True}, fingerprint(plan()))
        self.assertEqual([], called)

    def test_unknown_expired_or_mismatched_server_approval_denied(self):
        identity = scope_identity('test-scope')
        good = {**identity, 'can_reserve': True, 'locked': False, 'state': 'ARMED',
                'model_approval_id': 'model-approval', 'budget_approval_id': 'budget-approval',
                'billing_multiplier': '1.10', 'remaining_seconds': 299}
        for key, value in [('id', 'other'), ('request_sha256', '0'*64), ('project_id', 'other'),
                           ('can_reserve', False), ('locked', True), ('state', 'DISPATCHED'),
                           ('budget_approval_id', 'model-approval')]:
            bad = {**good, key: value}
            b = ScopedCanaryBudget(lambda *_: bad, 'test-scope')
            with self.subTest(key=key), self.assertRaises(BudgetBlocked):
                b.verify_authorization('test-scope', fingerprint(plan()))

    def test_billing_multiplier_only_from_operator_record(self):
        identity = scope_identity('test-scope')
        record = {**identity, 'can_reserve': True, 'locked': False, 'state': 'ARMED',
                  'model_approval_id': 'model-approval', 'budget_approval_id': 'budget-approval',
                  'billing_multiplier': '1.10', 'remaining_seconds': 299}
        budget = ScopedCanaryBudget(lambda *_: record, 'test-scope')
        self.assertEqual('1.10', budget.verify_authorization('test-scope', fingerprint(plan()))['billing_multiplier'])
        record['billing_multiplier'] = None
        with self.assertRaises(BudgetBlocked): budget.verify_authorization('test-scope', fingerprint(plan()))

    def test_db_connection_failure_no_model(self):
        def offline(*_): raise TimeoutError('private connection string')
        budget = ScopedCanaryBudget(offline, 'test-scope'); p = Provider()
        with self.assertRaises(BudgetBlocked) as result:
            CanaryRunner(budget, p, budget.verify_authorization, bound()).run('test-scope')
        self.assertNotIn('private', str(result.exception)); self.assertEqual([], p.calls)

    def test_transport_management_and_wrong_project_rejected(self):
        transport = ScopedBudgetRPCTransport('fixture', lambda *_: True)
        with patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('No network')):
            for command in ['arm', 'enable', 'emergency_lock', 'update']:
                with self.assertRaises(BudgetBlocked): transport(command, scope_identity('test-scope'))
            with self.assertRaises(BudgetBlocked): transport('status', {'project_id': 'other'})

    def test_db_lock_unverified_never_claims_success(self):
        b = ScopedCanaryBudget(lambda *_: {'state': 'SETTLED', 'locked': False}, 'test-scope')
        with self.assertRaisesRegex(BudgetBlocked, 'LOCK_UNVERIFIED'): b.verify_locked(b.identity)
