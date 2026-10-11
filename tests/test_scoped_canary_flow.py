"""Complete scoped approval -> count -> reserve -> model mock -> settle path."""
import concurrent.futures
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation'))
from durable_budget import BudgetBlocked
from light_canary import CanaryRunner
from scoped_canary import ScopedCanaryBudget, scope_identity
from test_light_canary import Provider, response, bound
from test_scoped_budget import invoke
from postgres_budget_harness import CONTAINER, sql

@unittest.skipUnless(CONTAINER, 'Isolated PostgreSQL 17 required')
class ScopedCanaryFlowTests(unittest.TestCase):
    def setUp(self):
        sql('truncate kfarmai_private.canary_scopes, kfarmai_private.reservations; '
            'update kfarmai_private.budget_policy set enabled=false,daily_microusd=0;')
        self.approval = 'scoped-runner-fixture'
        self.identity = scope_identity(self.approval)
        self.events = []
        self.arm = {**self.identity, 'model_approval_id': 'model-approved-fixture',
                    'budget_approval_id': 'budget-approved-fixture', 'daily_microusd': 212,
                    'ttl_seconds': 300, 'billing_multiplier': '1.00'}
        invoke('arm', self.arm, operator=True)
        guard = patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('No external I/O'))
        guard.start(); self.addCleanup(guard.stop)

    def rpc(self, command, payload):
        self.events.append(command)
        return invoke(command, payload)

    def runner(self, provider=None, rpc=None):
        budget = ScopedCanaryBudget(rpc or self.rpc, self.approval)
        return CanaryRunner(budget, provider or Provider(), budget.verify_authorization, bound())

    def state(self): return invoke('status', self.identity)

    def test_whole_flow_and_verified_post_call_lock(self):
        result = self.runner().run(self.approval)
        self.assertEqual(20, result['actual_microusd'])
        self.assertFalse(result['publishable']); self.assertEqual(1, result['model_calls'])
        self.assertEqual(['status', 'reserve', 'dispatch', 'settle', 'status'], self.events)
        self.assertEqual('SETTLED', self.state()['state']); self.assertTrue(self.state()['locked'])
        self.assertEqual('f', sql('select enabled from kfarmai_private.budget_policy;'))
        self.assertEqual('0', sql('select daily_microusd from kfarmai_private.budget_policy;'))

    def test_real_concurrent_runners_model_once(self):
        provider = Provider()
        def run(_):
            try: return self.runner(provider).run(self.approval)['model_calls']
            except BudgetBlocked: return 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(1, sum(pool.map(run, range(4))))
        self.assertEqual(1, len(provider.calls)); self.assertTrue(self.state()['locked'])

    def test_missing_usage_preserves_full_amount_and_rejects_next(self):
        r = response(); r.pop('usage'); provider = Provider(r)
        with self.assertRaises(BudgetBlocked): self.runner(provider).run(self.approval)
        self.assertEqual('UNKNOWN', self.state()['state'])
        self.assertEqual(212, self.state()['maximum']); self.assertIsNone(self.state()['actual'])
        with self.assertRaises(BudgetBlocked): self.runner(provider).run(self.approval)
        self.assertEqual(1, len(provider.calls))

    def test_network_failure_locked_no_retry(self):
        provider = Provider(error=TimeoutError('synthetic'))
        with self.assertRaises(BudgetBlocked): self.runner(provider).run(self.approval)
        with self.assertRaises(BudgetBlocked): self.runner(provider).run(self.approval)
        self.assertEqual(1, len(provider.calls)); self.assertEqual('UNKNOWN', self.state()['state'])

    def test_lost_reserve_reply_no_paid_call_and_holds_budget(self):
        def rpc(command, payload):
            result = self.rpc(command, payload)
            if command == 'reserve': raise TimeoutError('lost reply')
            return result
        provider = Provider()
        with self.assertRaises(BudgetBlocked): self.runner(provider, rpc).run(self.approval)
        with self.assertRaises(BudgetBlocked): self.runner(provider).run(self.approval)
        self.assertEqual([], provider.calls); self.assertEqual('HELD', self.state()['state'])

    def test_lost_dispatch_reply_no_paid_call_and_consumed_grant(self):
        def rpc(command, payload):
            result = self.rpc(command, payload)
            if command == 'dispatch': raise TimeoutError('lost reply')
            return result
        provider = Provider()
        with self.assertRaises(BudgetBlocked): self.runner(provider, rpc).run(self.approval)
        self.assertEqual([], provider.calls); self.assertTrue(self.state()['locked'])
        with self.assertRaises(BudgetBlocked): self.runner(provider).run(self.approval)

    def test_lost_settle_reply_never_repeats_model(self):
        def rpc(command, payload):
            result = self.rpc(command, payload)
            if command == 'settle': raise TimeoutError('lost reply')
            return result
        provider = Provider()
        with self.assertRaises(BudgetBlocked): self.runner(provider, rpc).run(self.approval)
        self.assertEqual('SETTLED', self.state()['state'])
        with self.assertRaises(BudgetBlocked): self.runner(provider).run(self.approval)
        self.assertEqual(1, len(provider.calls))

    def test_emergency_lock_during_count_prevents_call(self):
        runner = self.runner()
        def counter(payload):
            invoke('emergency_lock', self.identity, operator=True)
            return {'object': 'response.input_tokens', 'input_tokens': 100}
        runner.input_bound.counter = counter
        with self.assertRaises(BudgetBlocked): runner.run(self.approval)
        self.assertEqual([], runner.transport.calls); self.assertTrue(self.state()['locked'])

    def test_ttl_expired_between_dispatch_and_send_prevents_call(self):
        runner = self.runner()
        real_execute = runner.budget.execute
        def execute(reservation, transport, settle_usage):
            def late_transport():
                runner.budget._deadline = time.monotonic() - 1
                return transport()
            return real_execute(reservation, late_transport, settle_usage)
        runner.budget.execute = execute
        with self.assertRaises(BudgetBlocked): runner.run(self.approval)
        self.assertEqual([], runner.transport.calls); self.assertEqual('UNKNOWN', self.state()['state'])
