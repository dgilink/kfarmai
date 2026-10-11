"""Offline account/billing failure cases; no provider endpoint is contacted."""
import io
from pathlib import Path
import sys
import unittest
import urllib.error
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation'))
from durable_budget import BudgetBlocked, DurableBudget
from light_canary import CanaryRunner, contract
from test_light_canary import Provider, Ledger, authority, bound

class AccountFailureTests(unittest.TestCase):
    def check_provider_failure(self, code, error_code):
        ledger = Ledger()
        error = urllib.error.HTTPError('https://api.openai.com/v1/responses',
            code, 'synthetic', {}, io.BytesIO(
                ('{"error":{"code":"' + error_code + '"}}').encode()))
        provider = Provider(error=error)
        runner = CanaryRunner(DurableBudget(ledger), provider, authority, bound())
        with patch('urllib.request.OpenerDirector.open',
                   side_effect=AssertionError('External I/O forbidden')):
            with self.assertRaises(BudgetBlocked):
                runner.run('mock-explicit-model-and-budget')
            retry = CanaryRunner(DurableBudget(ledger), provider, authority, bound())
            with self.assertRaises(BudgetBlocked):
                retry.run('mock-explicit-model-and-budget')
        self.assertEqual(1, len(provider.calls))
        self.assertNotIn('settle', ledger.events)
        self.assertFalse(ledger.enabled)
        row = next(iter(ledger.rows.values()))
        self.assertEqual('UNKNOWN', row['state'])
        self.assertEqual(212, row['maximum'])
        self.assertNotIn('actual', row)

    def test_account_http_errors_hold_reservation_without_retry(self):
        for status in (401, 403, 404):
            with self.subTest(status=status):
                self.check_provider_failure(status, 'model_access_denied')

    def test_billing_error_does_not_assume_zero_charge(self):
        self.check_provider_failure(429, 'insufficient_quota')

    def test_unverified_account_or_billing_blocks_before_count_reserve(self):
        for field in ('account_compatibility', 'account_billing_context'):
            with self.subTest(field=field):
                spec = contract()
                spec.update(live_enabled=True, account_compatibility='VERIFIED',
                    account_billing_context='VERIFIED', token_counter_billing='VERIFIED_ZERO')
                spec[field] = 'UNVERIFIED'
                ledger = Ledger()
                budget = DurableBudget(ledger)
                budget.scoped_canary = True
                provider = Provider()
                provider.is_fixture = False
                def verifier(a, s):
                    result = authority(a, s)
                    result['live_authorized'] = True
                    return result
                with patch('light_canary.contract', return_value=spec), patch(
                    'urllib.request.OpenerDirector.open',
                    side_effect=AssertionError('External I/O forbidden')):
                    with self.assertRaisesRegex(BudgetBlocked, 'LIVE_ACCOUNT_OR_AUTHORITY_UNVERIFIED'):
                        CanaryRunner(budget, provider, verifier, bound()).run(
                            'mock-explicit-model-and-budget')
                self.assertEqual([], provider.calls)
                self.assertEqual([], ledger.events)
