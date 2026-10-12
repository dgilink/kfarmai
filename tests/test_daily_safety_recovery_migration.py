"""The 2026-10-12 safety recovery is one-shot and relocks its global budget."""
import datetime as dt
import json
from pathlib import Path
import unittest

from postgres_budget_harness import CONTAINER, reset, sql


ROOT = Path(__file__).resolve().parents[1]
ROLE = ROOT / "supabase/migrations/20261012053234_gate3_daily_review_rpc_role.sql"
INCIDENT = ROOT / "supabase/migrations/20261012170000_gate3_daily_incident_recovery_once.sql"
PRIOR = ROOT / "supabase/migrations/20261012171100_gate3_daily_final_recovery_once.sql"
CURRENT = ROOT / "supabase/migrations/20261012101917_gate3_daily_safety_recovery_once.sql"
RUN = "20261012777777777777"


@unittest.skipUnless(CONTAINER, "requires isolated PostgreSQL fixture")
class DailySafetyRecoveryMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sql("select to_regrole('kfarmai_daily_runner') is null") == "t":
            sql(ROLE.read_text(encoding="utf-8"))
        body = sql("select pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure)")
        if "20261012999999999999" not in body:
            sql(INCIDENT.read_text(encoding="utf-8"))
        body = sql("select pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure)")
        if "20261012888888888888" not in body:
            sql(PRIOR.read_text(encoding="utf-8"))
        body = sql("select pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure)")
        if RUN not in body:
            sql(CURRENT.read_text(encoding="utf-8"))

    def setUp(self):
        reset(limit=150000)

    def seed(self, *, third_actual=836, third_receipt=None):
        third_receipt = third_receipt or "320863dbc4b54a4678699dcc0ea6fa717f14266d5057481cc188699952955a19"
        sql("insert into kfarmai_private.reservations"
            "(id,run_id,operation,fingerprint,day_kst,channel,maximum,state,actual,receipt) values"
            "('09b7a95f-8205-5a00-a227-b373810ab353','20261012','content',repeat('a',64),"
            "date '2026-10-12','REVIEW',22528,'SETTLED',22528,"
            "'f864685ca8717c129c5bb395c344f024b29ded7b6dfe7cdebfbb4ec57e33b7b2'),"
            "('d255a3e1-f71a-5a68-9621-733a3216efbb','20261012999999999999','content',repeat('a',64),"
            "date '2026-10-12','REVIEW',22528,'SETTLED',22528,"
            "'068719a7fc68b4cb900522bd20eeea07a9393380261d229855cfdf972d72de0b'),"
            "('dbc865a8-c073-55a1-9267-b44deff70b0c','20261012888888888888','content',repeat('a',64),"
            f"date '2026-10-12','REVIEW',22528,'SETTLED',{third_actual},'{third_receipt}')")

    def call(self, command="reserve", *, run=RUN, maximum=22528, id_suffix="103", extra=None):
        payload = {"id": "00000000-0000-0000-0000-000000000" + id_suffix,
                   "run_id": run, "operation": "content", "channel": "REVIEW",
                   "maximum": maximum, "fingerprint": "b" * 64}
        payload.update(extra or {})
        encoded = json.dumps(payload).replace("'", "''")
        return json.loads(sql("set role kfarmai_daily_runner; select kfarmai_private.daily_review_budget"
                              f"('{command}','{encoded}'::jsonb)"))

    def test_three_exact_settlements_and_one_shot(self):
        if dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat() != "2026-10-12":
            self.skipTest("one-day incident window expired")
        with self.assertRaisesRegex(RuntimeError, "DAILY_SAFETY_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            self.call()
        self.seed()
        self.assertTrue(self.call()["acquired"])
        with self.assertRaisesRegex(RuntimeError, "DAILY_SAFETY_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            self.call()

    def test_wrong_receipt_and_unconfirmed_hold(self):
        self.seed(third_receipt="0" * 64)
        with self.assertRaisesRegex(RuntimeError, "DAILY_SAFETY_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            self.call()
        reset(limit=150000)
        self.seed()
        sql("insert into kfarmai_private.reservations"
            "(id,run_id,operation,fingerprint,day_kst,channel,maximum,state) values"
            "('00000000-0000-0000-0000-000000000099','2026101290','content',repeat('a',64),"
            "date '2026-10-12','REVIEW',22528,'HELD')")
        with self.assertRaisesRegex(RuntimeError, "DAILY_SAFETY_RECOVERY_ALREADY_USED_OR_UNVERIFIED"):
            self.call()

    def test_identity_channel_and_cap(self):
        self.seed()
        for kwargs in ({"run": "20261012999999999998"}, {"maximum": 22529},
                       {"extra": {"channel": "LOW"}}):
            with self.assertRaisesRegex(RuntimeError, "DAILY_REVIEW_RESERVATION_ONLY"):
                self.call(**kwargs)
        self.assertEqual("f", sql("select has_table_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.reservations','SELECT')"))
        self.assertEqual("f", sql("select has_function_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.budget(text,jsonb)','EXECUTE')"))

    def test_settlement_relocks_global_policy(self):
        self.seed()
        self.call()
        self.assertTrue(self.call("dispatch")["execute"])
        self.assertEqual("SETTLED", self.call("settle", extra={"actual": 836, "receipt": "c" * 64})["state"])
        self.assertEqual("false|0", sql("select enabled::text || '|' || daily_microusd::text "
                                    "from kfarmai_private.budget_policy"))
        self.assertEqual("SETTLED", sql("select state from kfarmai_private.reservations "
                                         "where run_id='20261012777777777777'"))

    def test_unknown_relocks_global_policy(self):
        self.seed()
        self.call()
        self.call("dispatch")
        self.assertFalse(self.call("unknown")["execute"])
        self.assertEqual("false|0", sql("select enabled::text || '|' || daily_microusd::text "
                                    "from kfarmai_private.budget_policy"))
        self.assertEqual("UNKNOWN", sql("select state from kfarmai_private.reservations "
                                         "where run_id='20261012777777777777'"))


if __name__ == "__main__":
    unittest.main()
