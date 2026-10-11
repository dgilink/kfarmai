"""Operational edge cases against the actual isolated PostgreSQL RPC."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation'))
from durable_budget import DurableBudget, BudgetBlocked, fingerprint
import model_cost_contract as costs
from postgres_budget_harness import CONTAINER, rpc, sql, reset


class PricePreflightTests(unittest.TestCase):
    def test_bad_search_prices_and_content_bounds_fail_before_reservation(self):
        for key,value in [('microusd_per_call',-1),('microusd_per_call',True),
                          ('maximum_content_tokens_per_call',-10),('maximum_content_tokens_per_call',True)]:
            c=costs.load_contract();c['search']['maximum_content_tokens_per_call']=1000;c['search'][key]=value
            with self.subTest(key=key,value=value),self.assertRaises(BudgetBlocked):
                costs.quote(c,'LIGHT',input_tokens=100,output_tokens=100,search_calls=1,fixture=True)

    def test_malformed_price_is_a_controlled_block(self):
        c=costs.load_contract();c['models']['LIGHT']['input']='unknown'
        with self.assertRaisesRegex(BudgetBlocked,'INVALID_PRICE'):
            costs.quote(c,'LIGHT',input_tokens=100,output_tokens=100,fixture=True)

    def test_image_cannot_hide_search_calls(self):
        with self.assertRaisesRegex(BudgetBlocked,'IMAGE_SEARCH_UNSUPPORTED'):
            costs.quote(costs.load_contract(),'IMAGE',input_tokens=100,output_tokens=100,search_calls=1,fixture=True)


@unittest.skipUnless(CONTAINER,'Isolated PostgreSQL required by operational preflight')
class DatabasePreflightTests(unittest.TestCase):
    def setUp(self):
        reset(100)
        self.budget=DurableBudget(rpc)

    def reservation(self,run=1):
        return self.budget.reserve(run,'content','REVIEW',20,{'fixture':True})

    def test_invalid_usage_freezes_other_runs_not_just_failed_reservation(self):
        first=self.reservation(1);second=self.reservation(2)
        def bad_usage(_):raise BudgetBlocked('UNEXPECTED_PROVIDER_USAGE')
        with self.assertRaisesRegex(BudgetBlocked,'USAGE_UNVERIFIED_BUDGET_FROZEN'):
            self.budget.execute(first,lambda:{'fixture':'response'},bad_usage)
        status=rpc('status',{})
        self.assertFalse(status['enabled']);self.assertEqual(40,status['unconfirmed'])
        with self.assertRaises(RuntimeError):rpc('dispatch',second)
        with self.assertRaises(BudgetBlocked):self.reservation(3)

    def test_lost_settlement_reply_does_not_double_charge_or_erase_receipt(self):
        r=self.reservation();calls=[]
        def losing_reply(command,payload):
            result=rpc(command,payload)
            if command=='settle':raise TimeoutError('fixture lost reply after commit')
            return result
        with self.assertRaises(BudgetBlocked):
            DurableBudget(losing_reply).execute(r,lambda:calls.append(1),lambda _:(7,{'receipt':'fixture'}))
        self.assertEqual([1],calls)
        status=rpc('status',{});self.assertEqual((7,0),(status['settled'],status['unconfirmed']))
        self.assertTrue(rpc('settle',{**r,'actual':7,'receipt':fingerprint({'receipt':'fixture'})})['duplicate'])
        with self.assertRaises(RuntimeError):rpc('dispatch',r)

    def test_missing_policy_row_and_disabled_budget_fail_closed(self):
        sql('delete from kfarmai_private.budget_policy;')
        try:
            with self.assertRaises(BudgetBlocked):self.reservation()
        finally:
            sql('insert into kfarmai_private.budget_policy default values;')
        with self.assertRaises(BudgetBlocked):self.reservation()

    def test_definer_path_acl_bypassrls_and_table_writes(self):
        self.assertEqual('t',sql("select rolbypassrls from pg_roles where rolname='service_role';"))
        for statement in ["insert into kfarmai_private.budget_policy values(false,true,100)",
                          "update kfarmai_private.budget_policy set enabled=true",
                          "delete from kfarmai_private.reservations",
                          "truncate kfarmai_private.review_outbox"]:
            with self.subTest(statement=statement),self.assertRaises(RuntimeError):
                sql('set role service_role; '+statement+';')
        for role in ('anon','authenticated'):
            with self.subTest(role=role),self.assertRaises(RuntimeError):
                sql(f"set role {role}; select kfarmai_private.budget('status','{{}}');")
        result=sql("select prosecdef::text||':'||array_to_string(proconfig,',') from pg_proc where oid='kfarmai_private.budget(text,jsonb)'::regprocedure;")
        self.assertEqual('true:search_path=""',result)
        self.assertEqual('f',sql("select prosecdef from pg_proc where oid='public.kfarmai_budget(text,jsonb)'::regprocedure;"))

    def test_preflight_catalog_checks_run_read_only(self):
        root=Path(__file__).resolve().parents[1]
        result=sql((root/'supabase/tests/automation-budget-postflight.sql').read_text(encoding='utf-8'))
        self.assertIn('"security_ok": true',result)

    def test_additive_table_does_not_hide_rls_regression(self):
        root=Path(__file__).resolve().parents[1]
        query=(root/'supabase/tests/automation-budget-postflight.sql').read_text(encoding='utf-8')
        tables=['budget_policy']
        if sql("select to_regclass('kfarmai_private.canary_scopes') is not null;")=='t':
            tables.append('canary_scopes')
        for table in tables:
            try:
                sql(f'alter table kfarmai_private.{table} disable row level security;')
                self.assertIn('"security_ok": false',sql(query))
            finally:
                sql(f'alter table kfarmai_private.{table} enable row level security;')
