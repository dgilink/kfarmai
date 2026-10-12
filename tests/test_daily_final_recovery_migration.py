"""The third, separately authorized attempt is one-shot on isolated PostgreSQL."""
import datetime as dt
import json
from pathlib import Path
import unittest

from postgres_budget_harness import CONTAINER, reset, sql


ROOT = Path(__file__).resolve().parents[1]
OLD = ROOT / "supabase/migrations/20261012170000_gate3_daily_incident_recovery_once.sql"
NEW = ROOT / "supabase/migrations/20261012171100_gate3_daily_final_recovery_once.sql"
RUN = "20261012888888888888"


@unittest.skipUnless(CONTAINER, "requires isolated PostgreSQL fixture")
class DailyFinalRecoveryMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        body = sql("select pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure)")
        if "20261012999999999999" not in body:
            sql(OLD.read_text(encoding="utf-8"))
        body = sql("select pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure)")
        if RUN not in body:
            sql(NEW.read_text(encoding="utf-8"))

    def setUp(self):
        reset(limit=150000)

    def reserve(self):
        p = {"id": "00000000-0000-0000-0000-000000000102", "run_id": RUN,
             "operation": "content", "channel": "REVIEW", "maximum": 22528,
             "fingerprint": "b" * 64}
        encoded = json.dumps(p).replace("'", "''")
        return sql("set role kfarmai_daily_runner; select kfarmai_private.daily_review_budget"
                   f"('reserve','{encoded}'::jsonb)")

    def test_requires_both_exact_settlements_and_is_once(self):
        if dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat() != "2026-10-12":
            self.skipTest("incident date expired")
        with self.assertRaisesRegex(RuntimeError, "DAILY_FINAL_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            self.reserve()
        sql("insert into kfarmai_private.reservations"
            "(id,run_id,operation,fingerprint,day_kst,channel,maximum,state,actual,receipt) values"
            "('09b7a95f-8205-5a00-a227-b373810ab353','20261012','content',repeat('a',64),"
            "date '2026-10-12','REVIEW',22528,'SETTLED',22528,"
            "'f864685ca8717c129c5bb395c344f024b29ded7b6dfe7cdebfbb4ec57e33b7b2'),"
            "('d255a3e1-f71a-5a68-9621-733a3216efbb','20261012999999999999','content',repeat('a',64),"
            "date '2026-10-12','REVIEW',22528,'SETTLED',22528,"
            "'068719a7fc68b4cb900522bd20eeea07a9393380261d229855cfdf972d72de0b')")
        self.assertTrue(json.loads(self.reserve())["acquired"])
        with self.assertRaisesRegex(RuntimeError, "DAILY_FINAL_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            self.reserve()
        self.assertEqual("f", sql("select has_table_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.reservations','SELECT')"))
        self.assertEqual("f", sql("select has_function_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.budget(text,jsonb)','EXECUTE')"))


if __name__ == "__main__":
    unittest.main()
