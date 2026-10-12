"""Isolated PostgreSQL regression for the two high-risk public log tables."""

from pathlib import Path
import unittest

from postgres_budget_harness import CONTAINER, sql


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261012052816_gate3_log_rls_least_privilege.sql"


@unittest.skipUnless(CONTAINER, "requires isolated PostgreSQL fixture")
class Gate3LogRlsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sql("""
            do $$ begin
              if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
              if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
              if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
            end $$;
            create table if not exists public.ai_diagnosis_logs (id bigint generated always as identity, query_text text);
            create table if not exists public.search_logs (id bigint generated always as identity, query_text text);
            grant all on public.ai_diagnosis_logs, public.search_logs to anon, authenticated, service_role;
            grant all on sequence public.ai_diagnosis_logs_id_seq, public.search_logs_id_seq
              to anon, authenticated, service_role;
        """)
        sql(MIGRATION.read_text(encoding="utf-8"))

    def test_browser_roles_have_no_table_access(self):
        for table in ("ai_diagnosis_logs", "search_logs"):
            for role in ("anon", "authenticated"):
                for privilege in ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"):
                    with self.subTest(table=table, role=role, privilege=privilege):
                        self.assertEqual("f", sql(f"select has_table_privilege('{role}', 'public.{table}', '{privilege}');"))
                self.assertEqual("f", sql(f"select has_sequence_privilege('{role}', 'public.{table}_id_seq', 'USAGE');"))
                self.assertEqual("f", sql(f"select has_sequence_privilege('{role}', 'public.{table}_id_seq', 'UPDATE');"))
                with self.subTest(table=table, role=role, operation="select"):
                    with self.assertRaisesRegex(RuntimeError, "permission denied"):
                        sql(f"set role {role}; select * from public.{table};")
                for operation in (
                    f"insert into public.{table}(query_text) values ('blocked')",
                    f"update public.{table} set query_text='blocked'",
                    f"delete from public.{table}",
                ):
                    with self.subTest(table=table, role=role, operation=operation.split()[0]):
                        with self.assertRaisesRegex(RuntimeError, "permission denied"):
                            sql(f"set role {role}; {operation};")

    def test_rls_enabled_and_service_access_preserved(self):
        for table in ("ai_diagnosis_logs", "search_logs"):
            with self.subTest(table=table):
                self.assertEqual("t", sql(f"select relrowsecurity from pg_class where oid='public.{table}'::regclass;"))
                self.assertEqual("t", sql(f"select has_table_privilege('service_role', 'public.{table}', 'SELECT');"))
                self.assertEqual("0", sql(f"select count(*) from pg_policies where schemaname='public' and tablename='{table}';"))
                self.assertEqual("server-only", sql(
                    f"set role service_role; insert into public.{table}(query_text) values ('server-only'); "
                    f"select query_text from public.{table} order by id desc limit 1;"))


if __name__ == "__main__":
    unittest.main()
