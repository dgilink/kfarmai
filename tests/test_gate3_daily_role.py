"""Dedicated daily RPC role permissions in a disposable PostgreSQL 17 fixture."""
from pathlib import Path
import unittest

from postgres_budget_harness import CONTAINER, sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261012053234_gate3_daily_review_rpc_role.sql"


@unittest.skipUnless(CONTAINER, "requires isolated PostgreSQL fixture")
class DailyRoleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sql("select to_regrole('kfarmai_daily_runner') is null;") == "t":
            sql(MIGRATION.read_text(encoding="utf-8"))

    def test_exact_rpc_is_available_without_table_access(self):
        self.assertEqual("f", sql("select has_function_privilege('kfarmai_daily_runner',"
                                  "'public.kfarmai_budget(text,jsonb)','EXECUTE');"))
        self.assertEqual("f", sql("select has_function_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.budget(text,jsonb)','EXECUTE');"))
        self.assertEqual("t", sql("select has_function_privilege('kfarmai_daily_runner',"
                                  "'kfarmai_private.daily_review_budget(text,jsonb)','EXECUTE');"))
        for function in ("manage_canary", "canary_budget", "bootstrap_canary_control",
                         "bootstrap_canary_budget"):
            if sql(f"select to_regprocedure('kfarmai_private.{function}(text,jsonb)') is not null;") == "t":
                self.assertEqual("f", sql("select has_function_privilege('kfarmai_daily_runner',"
                    f"'kfarmai_private.{function}(text,jsonb)','EXECUTE');"))
        for table in ("budget_policy", "reservations", "review_outbox"):
            for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                self.assertEqual("f", sql(f"select has_table_privilege('kfarmai_daily_runner',"
                                          f"'kfarmai_private.{table}','{privilege}');"))
        self.assertIn("day_kst", sql("set role kfarmai_daily_runner; "
            "select kfarmai_private.daily_review_budget('status','{}'::jsonb);"))
        with self.assertRaisesRegex(RuntimeError, "permission denied"):
            sql("set role kfarmai_daily_runner; select kfarmai_private.budget('status','{}'::jsonb);")
        with self.assertRaisesRegex(RuntimeError, "DAILY_REVIEW_RESERVATION_ONLY"):
            sql("set role kfarmai_daily_runner; select kfarmai_private.daily_review_budget"
                "('reserve','{\"run_id\":\"20261012\",\"operation\":\"image\","
                "\"channel\":\"LOW\",\"maximum\":\"22528\"}'::jsonb);")
        with self.assertRaisesRegex(RuntimeError, "permission denied"):
            sql("set role kfarmai_daily_runner; select * from kfarmai_private.reservations;")
        with self.assertRaisesRegex(RuntimeError, "permission denied"):
            sql("set role kfarmai_daily_runner; update kfarmai_private.budget_policy set enabled=true;")

    def test_password_is_not_bootstrapped_or_logged(self):
        self.assertEqual("t|t", sql("select rolcanlogin, rolpassword is null "
                                     "from pg_authid where rolname='kfarmai_daily_runner';"))


if __name__ == "__main__":
    unittest.main()
