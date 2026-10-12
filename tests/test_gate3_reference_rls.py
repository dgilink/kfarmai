"""Public reference data stays readable; browser mutations are denied."""
from pathlib import Path
import unittest

from postgres_budget_harness import CONTAINER, sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261012173000_gate3_public_reference_read_only.sql"
TABLES = ("agri_companies", "agri_events", "agri_products", "market_prices",
          "pesticide_registry", "pesticide_shops", "subsidies")


@unittest.skipUnless(CONTAINER, "requires isolated PostgreSQL fixture")
class ReferenceRlsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        for table in TABLES:
            sql(f"create table if not exists public.{table} "
                "(id bigint generated always as identity, label text);")
        if sql("select relrowsecurity from pg_class where oid='public.agri_companies'::regclass") == "f":
            for table in TABLES:
                sql(f"grant all on public.{table} to anon, authenticated, service_role; "
                    f"grant all on sequence public.{table}_id_seq to anon, authenticated, service_role;")
            sql(MIGRATION.read_text(encoding="utf-8"))

    def test_read_preserved_and_browser_write_denied(self):
        for table in TABLES:
            with self.subTest(table=table):
                self.assertEqual("t", sql(f"select relrowsecurity from pg_class "
                                          f"where oid='public.{table}'::regclass"))
                self.assertEqual("1", sql(f"select count(*) from pg_policies where schemaname='public' "
                                          f"and tablename='{table}' and cmd='SELECT'"))
                for role in ("anon", "authenticated"):
                    self.assertEqual("t", sql(f"select has_table_privilege('{role}',"
                                              f"'public.{table}','SELECT')"))
                    self.assertEqual("0", sql(f"set role {role}; select count(*) "
                                              f"from public.{table}"))
                    for privilege in ("INSERT", "UPDATE", "DELETE", "TRUNCATE"):
                        self.assertEqual("f", sql(f"select has_table_privilege('{role}',"
                                                  f"'public.{table}','{privilege}')"))
                    self.assertEqual("f", sql(f"select has_sequence_privilege('{role}',"
                                              f"'public.{table}_id_seq','USAGE')"))
                    with self.assertRaisesRegex(RuntimeError, "permission denied"):
                        sql(f"set role {role}; insert into public.{table}(label) values ('blocked')")
                self.assertEqual("t", sql(f"select has_table_privilege('service_role',"
                                          f"'public.{table}','INSERT')"))


if __name__ == "__main__":
    unittest.main()
