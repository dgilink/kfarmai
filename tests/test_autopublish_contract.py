"""Protect existing LOW/REVIEW behavior without credentials or generation calls."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'automation'))
import kfarmai_daily_autopublish as daily


class AutoPublishContracts(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / 'automation/config.json').read_text(encoding='utf-8'))

    def test_offline_selftest_never_calls_provider(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(daily, 'api', side_effect=AssertionError('provider forbidden')):
            daily.selftest(ROOT, Path(temp))
            result = json.loads((Path(temp) / 'outcome.json').read_text(encoding='utf-8'))
            self.assertEqual('DRY_RUN_PASS', result['status'])
            self.assertEqual(0, result['estimated_cost_usd'])

    def test_low_general_maintenance_stays_low(self):
        risk, _ = daily.risk_gate({'title': '유량계 외관 확인', 'summary': '누수 확인', 'category': '스마트팜', 'risk': 'LOW', 'sections': []}, self.config)
        self.assertEqual('LOW', risk)

    def test_review_terms_still_require_review(self):
        for term in self.config['review_terms']:
            risk, _ = daily.risk_gate({'title': term, 'summary': '', 'category': '스마트팜', 'risk': 'LOW', 'sections': []}, self.config)
            self.assertEqual('REVIEW', risk, term)

    def test_block_stays_block_on_general_category(self):
        risk, _ = daily.risk_gate({'title': '확인 필요', 'summary': '', 'category': '스마트팜', 'risk': 'BLOCK', 'sections': []}, self.config)
        self.assertEqual('BLOCK', risk)


if __name__ == '__main__':
    unittest.main()
