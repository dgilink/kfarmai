"""One incident-only forward migration on disposable PostgreSQL 17."""
import datetime as dt
import json
from pathlib import Path
import unittest

from postgres_budget_harness import CONTAINER, sql, reset


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261012170000_gate3_daily_incident_recovery_once.sql"


@unittest.skipUnless(CONTAINER, "requires isolated PostgreSQL fixture")
class DailyRecoveryMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sql("select to_regrole('kfarmai_daily_runner') is null") == "t":
            sql((ROOT / "supabase/migrations/20261012053234_gate3_daily_review_rpc_role.sql")
                .read_text(encoding="utf-8"))
        if "20261012999999999999" not in sql("select pg_get_functiondef("
                "'kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure)"):
            sql(MIGRATION.read_text(encoding="utf-8"))

    def setUp(self):
        reset(limit=150000)

    def test_recovery_rejected_without_exact_settled_incident(self):
        p = {"id": "00000000-0000-0000-0000-000000000101",
             "run_id": "20261012999999999999", "operation": "content",
             "channel": "REVIEW", "maximum": 22528, "fingerprint": "a" * 64}
        encoded = json.dumps(p).replace("'", "''")
        with self.assertRaisesRegex(RuntimeError, "DAILY_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            sql("set role kfarmai_daily_runner; select kfarmai_private.daily_review_budget"
                f"('reserve','{encoded}'::jsonb)")

    def test_exact_recovery_once_and_no_privilege_growth(self):
        if dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat() != "2026-10-12":
            self.skipTest("incident date expired")
        sql("insert into kfarmai_private.reservations(id,run_id,operation,fingerprint,day_kst,"
            "channel,maximum,state,actual,receipt) values ("
            "'09b7a95f-8205-5a00-a227-b373810ab353','20261012','content',repeat('a',64),"
            "date '2026-10-12','REVIEW',22528,'SETTLED',22528,"
            "'f864685ca8717c129c5bb395c344f024b29ded7b6dfe7cdebfbb4ec57e33b7b2')")
        p = {"id": "00000000-0000-0000-0000-000000000101",
             "run_id": "20261012999999999999", "operation": "content",
             "channel": "REVIEW", "maximum": 22528, "fingerprint": "a" * 64}
        encoded = json.dumps(p).replace("'", "''")
        result = sql("set role kfarmai_daily_runner; select kfarmai_private.daily_review_budget"
                     f"('reserve','{encoded}'::jsonb)")
        self.assertTrue(json.loads(result)["acquired"])
        with self.assertRaisesRegex(RuntimeError, "DAILY_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            sql("set role kfarmai_daily_runner; select kfarmai_private.daily_review_budget"
                f"('reserve','{encoded}'::jsonb)")
        self.assertEqual("f", sql("select has_table_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.reservations','SELECT')"))
        self.assertEqual("f", sql("select has_function_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.budget(text,jsonb)','EXECUTE')"))


if __name__ == "__main__":
    unittest.main()
