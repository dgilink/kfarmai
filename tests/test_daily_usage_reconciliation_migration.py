"""Static contract checks for the evidence-bound production migration."""
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase/migrations/20261014101500_reconcile_verified_daily_usage_once.sql").read_text(encoding="utf-8")


class DailyUsageReconciliationMigrationTests(unittest.TestCase):
    def test_only_the_verified_unknown_reservation_can_be_settled(self):
        self.assertIn("618ca125-38a6-5b7f-a502-4ca79e3dc41b", SQL)
        self.assertIn("38235823867", SQL)
        self.assertIn("current_row.state <> 'UNKNOWN'", SQL)
        self.assertIn("current_row.actual is not null", SQL)
        self.assertIn("DAILY_USAGE_RECONCILIATION_ALREADY_APPLIED", SQL)
        self.assertNotRegex(SQL.lower(), r"\b(delete|truncate|reset)\b")

    def test_usage_evidence_and_exact_internal_amount_are_bound(self):
        for value in ("gpt-6-luna", "default", "1170", "1167", "8192", "4667",
                      "0a811ca1c7596406015e2674a79b5d2136fc4858bfa9af450a8bfcb5fde371da"):
            self.assertIn(value, SQL)
        self.assertIn("cost_csv_daily_total_microusd', 5044", SQL)
        self.assertIn("daily_usage_reconciliations", SQL)
        self.assertIn("state <> 'SETTLED'", SQL)


if __name__ == "__main__":
    unittest.main()
