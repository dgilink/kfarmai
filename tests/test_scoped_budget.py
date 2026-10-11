"""Real PostgreSQL scoped-budget contract; only network-none disposable fixtures."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest
import uuid

from postgres_budget_harness import CONTAINER, sql

MIGRATION = '20261010055244_scoped_canary_budget.sql'


def invoke(command, payload, operator=False, role='service_role'):
    encoded = json.dumps(payload, allow_nan=False).replace("'", "''")
    if operator:
        prefix, function = '', 'kfarmai_private.manage_canary'
    else:
        assert role in ('service_role', 'anon', 'authenticated')
        prefix, function = f'set role {role}; ', 'public.kfarmai_canary_budget'
    assert command.replace('_', '').isalpha()
    return json.loads(sql(f"{prefix}select {function}('{command}','{encoded}'::jsonb);"))


def identity(number=1, maximum=212):
    return dict(approval_id=f'canary-{number}', id=str(uuid.UUID(int=number)),
                project_id='xzetqijeucldbfgjuoes', plan_sha256='a'*64,
                request_sha256='b'*64, fingerprint='c'*64, run_id=str(number),
                operation='content', channel='REVIEW', maximum=maximum)


@unittest.skipUnless(CONTAINER, 'Isolated PostgreSQL 17 fixture required')
class ScopedBudgetPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sql("select to_regclass('kfarmai_private.canary_scopes') is null;") == 't':
            # Earlier durable-budget tests intentionally exercise enabled and
            # circuit-breaker states. Restore the migration precondition in
            # this disposable database before installing the scoped contract.
            sql('update kfarmai_private.budget_policy set enabled=false,daily_microusd=0;')
            sql((Path(__file__).resolve().parents[1] / 'supabase/migrations' / MIGRATION).read_text(encoding='utf-8'))

    def setUp(self):
        sql('truncate kfarmai_private.canary_scopes, kfarmai_private.reservations, kfarmai_private.review_outbox; '
            'update kfarmai_private.budget_policy set enabled=false,daily_microusd=0;')
        self.p = identity()

    def arm(self, p=None, **kwargs):
        p = self.p if p is None else p
        return invoke('arm', dict(p, model_approval_id='model-'+p['approval_id'],
                      budget_approval_id='budget-'+p['approval_id'], daily_microusd=212,
                      ttl_seconds=300, billing_multiplier='1.10', **kwargs), operator=True)

    def dispatched(self):
        self.arm()
        self.assertTrue(invoke('reserve', self.p)['acquired'])
        self.assertTrue(invoke('dispatch', self.p)['execute'])

    def assert_blocked(self, command, p=None):
        with self.assertRaises(RuntimeError):
            invoke(command, self.p if p is None else p)

    def test_initial_empty_and_global_disabled(self):
        self.assertEqual(sql("select enabled::text || ':' || daily_microusd::text from kfarmai_private.budget_policy;"), 'false:0')
        self.assertEqual(sql('select count(*) from kfarmai_private.canary_scopes;'), '0')
        self.assert_blocked('reserve')

    def test_success_locks_and_leaves_global_policy(self):
        self.dispatched()
        self.assertTrue(invoke('status', self.p)['locked'])
        result = invoke('settle', dict(self.p, actual=20, receipt='d'*64))
        self.assertEqual(result['state'], 'SETTLED')
        self.assertTrue(result['locked'])
        self.assert_blocked('dispatch')
        self.assertEqual(sql('select enabled from kfarmai_private.budget_policy;'), 'f')
        self.assertEqual(sql('select daily_microusd from kfarmai_private.budget_policy;'), '0')

    def test_scopes_do_not_enter_legacy_rpc_ledger(self):
        self.dispatched()
        self.assertEqual(sql('select count(*) from kfarmai_private.reservations;'), '0')
        with self.assertRaises(RuntimeError):
            sql("set role service_role; select public.kfarmai_budget('settle','" +
                json.dumps(dict(self.p, actual=0, receipt='d'*64)) + "'::jsonb);")
        self.assertEqual(invoke('status', self.p)['state'], 'DISPATCHED')

    def test_direct_table_all_roles_blocked(self):
        self.arm()
        for role in ('anon','authenticated','service_role'):
            for stmt in ('select * from', 'update'):
                with self.subTest(role=role, stmt=stmt), self.assertRaises(RuntimeError):
                    query = 'select * from kfarmai_private.canary_scopes' if stmt.startswith('select') else 'update kfarmai_private.canary_scopes set maximum=1'
                    sql(f'set role {role}; {query};')

    def test_anon_authenticated_rpc_blocked(self):
        self.arm()
        for role in ('anon','authenticated'):
            with self.assertRaises(RuntimeError):
                invoke('status', self.p, role=role)

    def test_management_acl_and_role_guard(self):
        for role in ('anon','authenticated','service_role'):
            with self.assertRaises(RuntimeError):
                sql(f"set role {role}; select kfarmai_private.manage_canary('arm','{{}}'::jsonb);")
        self.assertEqual(sql("select has_function_privilege('service_role','kfarmai_private.manage_canary(text,jsonb)','EXECUTE');"),'f')

    def test_security_catalog(self):
        self.assertEqual(sql("select relrowsecurity from pg_class where oid='kfarmai_private.canary_scopes'::regclass;"),'t')
        self.assertEqual(sql("select count(*) from pg_proc where oid in ('kfarmai_private.manage_canary(text,jsonb)'::regprocedure,'kfarmai_private.canary_budget(text,jsonb)'::regprocedure) and prosecdef and proconfig=array['search_path=\"\"'];"),'2')
        self.assertEqual(sql("select prosecdef from pg_proc where oid='public.kfarmai_canary_budget(text,jsonb)'::regprocedure;"),'f')

    def test_project_mismatch_arm(self):
        with self.assertRaises(RuntimeError): self.arm(dict(self.p,project_id='wrong'))

    def test_every_identity_field_checked(self):
        self.arm()
        for key,value in self.p.items():
            altered = dict(self.p)
            altered[key] = 211 if key=='maximum' else ('2' if key=='run_id' else 'wrong')
            with self.subTest(key=key): self.assert_blocked('status', altered)
            missing = dict(self.p); del missing[key]
            with self.subTest(missing=key): self.assert_blocked('reserve', missing)

    def test_json_numeric_types_and_caps(self):
        for value in (True, '212', -1, 0, 213, 1.5):
            with self.subTest(value=value),self.assertRaises(RuntimeError): self.arm(dict(self.p,maximum=value))

    def test_ttl_limit(self):
        for ttl in (0,301,True,'300',1.5):
            payload=dict(self.p,model_approval_id='m',budget_approval_id='b',billing_multiplier='1.10',daily_microusd=212,ttl_seconds=ttl)
            with self.subTest(ttl=ttl),self.assertRaises(RuntimeError): invoke('arm',payload,operator=True)

    def test_duplicate_arm_blocked_and_audit(self):
        self.arm()
        with self.assertRaises(RuntimeError): self.arm()
        self.assertEqual(sql("select audit->0->>'event' from kfarmai_private.canary_scopes;"),'ARMED')

    def test_duplicate_approval_ids_across_scopes_blocked(self):
        self.arm()
        invoke('emergency_lock', self.p, operator=True)
        p=identity(2)
        for key in ('model_approval_id','budget_approval_id'):
            payload=dict(p,model_approval_id='model-'+p['approval_id'],budget_approval_id='budget-'+p['approval_id'],billing_multiplier='1.10',daily_microusd=212,ttl_seconds=300)
            payload[key]=('model-' if key=='model_approval_id' else 'budget-')+self.p['approval_id']
            with self.assertRaises(RuntimeError): invoke('arm',payload,operator=True)

    def test_model_and_budget_approvals_separate(self):
        with self.assertRaises(RuntimeError):
            invoke('arm',dict(self.p,model_approval_id='same',budget_approval_id='same',billing_multiplier='1.10',daily_microusd=212,ttl_seconds=300),operator=True)

    def test_billing_multiplier_pinned_to_operator(self):
        self.arm()
        self.assertEqual(invoke('status',dict(self.p,billing_multiplier='1.00'))['billing_multiplier'],'1.10')
        with self.assertRaises(RuntimeError):
            sql("set role service_role; update kfarmai_private.canary_scopes set billing_multiplier='1.00';")

    def test_invalid_operator_billing_multiplier(self):
        for multiplier in ('0.00','1.11','fast',None):
            payload=dict(self.p,model_approval_id='m',budget_approval_id='b',billing_multiplier=multiplier,daily_microusd=212,ttl_seconds=300)
            with self.subTest(multiplier=multiplier),self.assertRaises(RuntimeError):invoke('arm',payload,operator=True)

    def test_freeze_before_reservation_is_effective_lock(self):
        self.arm();invoke('freeze',self.p)
        s=invoke('status',self.p)
        self.assertTrue(s['locked']);self.assertFalse(s['can_reserve']);self.assertIsNone(s['reserved_at'])

    def test_concurrent_reservation_exactly_one(self):
        self.arm()
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            rows=list(pool.map(lambda _:invoke('reserve',self.p),range(6)))
        self.assertEqual(sum(r['acquired'] for r in rows),1)

    def test_concurrent_dispatch_exactly_one(self):
        self.arm();invoke('reserve',self.p)
        def attempt(_):
            try:return invoke('dispatch',self.p)['execute']
            except RuntimeError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
            results=list(pool.map(attempt,range(6)))
        self.assertEqual(sum(results),1)

    def test_concurrent_arm_exactly_one_scope(self):
        def attempt(number):
            try:self.arm(identity(number));return True
            except RuntimeError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(attempt,range(1,5)))
        self.assertEqual(sum(results),1)

    def test_ttl_effective_lock_without_mutation_or_cron(self):
        self.arm()
        sql("update kfarmai_private.canary_scopes set expires_at=clock_timestamp()-interval '1 second';")
        status=invoke('status',self.p)
        self.assertTrue(status['locked']);self.assertFalse(status['can_reserve'])
        self.assertEqual(status['state'],'ARMED')
        self.assert_blocked('reserve'); self.assert_blocked('dispatch')

    def test_kst_day_boundary_blocks_dispatch(self):
        self.arm();invoke('reserve',self.p)
        sql("update kfarmai_private.canary_scopes set day_kst=day_kst-1;")
        self.assertTrue(invoke('status',self.p)['locked']);self.assert_blocked('dispatch')

    def test_crash_held_retains_amount_blocks_new_scope(self):
        self.arm();invoke('reserve',self.p)
        sql("update kfarmai_private.canary_scopes set expires_at=clock_timestamp()-interval '1 second';")
        self.assert_blocked('dispatch')
        with self.assertRaises(RuntimeError):self.arm(identity(2))
        s=invoke('status',self.p);self.assertEqual(s['maximum'],212);self.assertIsNone(s['actual'])

    def test_crash_dispatched_cannot_retry(self):
        self.dispatched()
        self.assertFalse(invoke('reserve',self.p)['acquired']);self.assert_blocked('dispatch')
        with self.assertRaises(RuntimeError):self.arm(identity(2))

    def test_actual_process_exit_after_dispatch_is_durable(self):
        self.arm()
        script='import sys,os;sys.path.insert(0,"tests");from test_scoped_budget import invoke,identity;invoke("reserve",identity());invoke("dispatch",identity());os._exit(37)'
        result=subprocess.run([sys.executable,'-c',script],cwd=Path(__file__).resolve().parents[1],env=os.environ.copy(),capture_output=True,timeout=40)
        self.assertEqual(result.returncode,37)
        s=invoke('status',self.p)
        self.assertEqual(s['state'],'DISPATCHED');self.assertTrue(s['locked']);self.assertIsNone(s['actual'])
        self.assert_blocked('dispatch')
        with self.assertRaises(RuntimeError):self.arm(identity(2))

    def test_status_deadline_is_server_derived(self):
        self.arm();s=invoke('status',self.p)
        self.assertGreater(s['remaining_seconds'],0);self.assertLessEqual(s['remaining_seconds'],300)
        sql("update kfarmai_private.canary_scopes set expires_at=clock_timestamp()-interval '1 second';")
        self.assertEqual(invoke('status',self.p)['remaining_seconds'],0)

    def test_status_deadline_clamped_to_kst_midnight(self):
        self.arm()
        # Force a crossing expiry in this isolated fixture, regardless of the
        # actual test clock. This exercises the installed RPC, not a mock clock.
        sql("update kfarmai_private.canary_scopes set expires_at=((day_kst+1)::timestamp at time zone 'Asia/Seoul')+interval '60 seconds';")
        before=float(sql("select extract(epoch from (((clock_timestamp() at time zone 'Asia/Seoul')::date+1)::timestamp at time zone 'Asia/Seoul')-clock_timestamp());"))
        s=invoke('status',self.p)
        self.assertGreater(s['remaining_seconds'],0)
        self.assertLessEqual(s['remaining_seconds'],before)
        # Once that KST day has ended, no remaining client authorization exists.
        sql('update kfarmai_private.canary_scopes set day_kst=day_kst-1;')
        s=invoke('status',self.p)
        self.assertEqual(s['remaining_seconds'],0);self.assertTrue(s['locked'])

    def test_network_loss_after_dispatch_retains_charge(self):
        self.dispatched();invoke('unknown',self.p)
        s=invoke('status',self.p)
        self.assertEqual(s['state'],'UNKNOWN');self.assertIsNone(s['actual']);self.assertTrue(s['locked'])
        self.assert_blocked('dispatch')

    def test_missing_usage_persists_lock(self):
        self.dispatched()
        self.assertEqual(invoke('settle',dict(self.p,receipt='d'*64))['state'],'UNKNOWN')
        self.assertEqual(invoke('status',self.p)['state'],'UNKNOWN')

    def test_invalid_usage_persists_lock(self):
        for amount in (True,-1,'20',1.5,999999):
            self.setUp();self.dispatched()
            self.assertEqual(invoke('settle',dict(self.p,actual=amount,receipt='d'*64))['state'],'UNKNOWN')

    def test_overbudget_usage_persists_lock(self):
        self.dispatched()
        self.assertEqual(invoke('settle',dict(self.p,actual=213,receipt='d'*64))['state'],'UNKNOWN')
        with self.assertRaises(RuntimeError): self.arm(identity(2))

    def test_settlement_after_ttl_allowed_but_no_reuse(self):
        self.dispatched()
        sql("update kfarmai_private.canary_scopes set expires_at=clock_timestamp()-interval '1 second';")
        self.assertEqual(invoke('settle',dict(self.p,actual=20,receipt='d'*64))['state'],'SETTLED')
        self.assert_blocked('dispatch')

    def test_settlement_idempotency_collision(self):
        self.dispatched();p=dict(self.p,actual=20,receipt='d'*64)
        invoke('settle',p)
        self.assertTrue(invoke('settle',p)['duplicate'])
        self.assert_blocked('settle',dict(p,actual=21))
        self.assert_blocked('settle',dict(p,receipt='e'*64))

    def test_emergency_lock_before_reserve(self):
        self.arm();s=invoke('emergency_lock',self.p,operator=True)
        self.assertTrue(s['locked']);self.assertEqual(s['state'],'LOCKED')
        self.assertFalse(invoke('reserve',self.p)['acquired']);self.assert_blocked('dispatch')

    def test_emergency_lock_after_dispatch_does_not_refund(self):
        self.dispatched();s=invoke('emergency_lock',self.p,operator=True)
        self.assertEqual(s['state'],'UNKNOWN');self.assertIsNone(s['actual']);self.assertEqual(s['maximum'],212)
        with self.assertRaises(RuntimeError):self.arm(identity(2))

    def test_shared_legacy_daily_accounting(self):
        sql("insert into kfarmai_private.reservations(id,run_id,operation,fingerprint,day_kst,channel,maximum,state,actual) values('00000000-0000-0000-0000-000000000099','99','content',repeat('a',64),(clock_timestamp() at time zone 'Asia/Seoul')::date,'LOW',20,'SETTLED',20);")
        with self.assertRaises(RuntimeError):self.arm()
        self.arm(identity(maximum=192))
        self.assertTrue(invoke('reserve',identity(maximum=192))['acquired'])

    def test_reserve_rechecks_daily_after_arm(self):
        self.arm()
        sql("insert into kfarmai_private.reservations(id,run_id,operation,fingerprint,day_kst,channel,maximum,state) values('00000000-0000-0000-0000-000000000099','99','content',repeat('a',64),(clock_timestamp() at time zone 'Asia/Seoul')::date,'REVIEW',1,'UNKNOWN');")
        self.assert_blocked('reserve')

    def test_previous_kst_unknown_still_blocks_arm(self):
        self.dispatched();invoke('unknown',self.p)
        sql('update kfarmai_private.canary_scopes set day_kst=day_kst-1;')
        with self.assertRaises(RuntimeError):self.arm(identity(2))

    def test_previous_kst_legacy_unknown_blocks_arm(self):
        sql("insert into kfarmai_private.reservations(id,run_id,operation,fingerprint,day_kst,channel,maximum,state) values('00000000-0000-0000-0000-000000000099','99','content',repeat('a',64),(clock_timestamp() at time zone 'Asia/Seoul')::date-1,'LOW',1,'UNKNOWN');")
        with self.assertRaisesRegex(RuntimeError,'LEGACY_USAGE_UNCONFIRMED'):self.arm()

    def test_reserve_rechecks_previous_day_legacy_crash(self):
        self.arm()
        sql("insert into kfarmai_private.reservations(id,run_id,operation,fingerprint,day_kst,channel,maximum,state) values('00000000-0000-0000-0000-000000000099','99','content',repeat('a',64),(clock_timestamp() at time zone 'Asia/Seoul')::date-1,'LOW',1,'DISPATCHED');")
        self.assert_blocked('reserve')

    def test_global_activation_fails_closed(self):
        self.arm()
        sql('update kfarmai_private.budget_policy set enabled=true;')
        self.assert_blocked('reserve');self.assert_blocked('status')

    def test_no_service_management_command(self):
        self.arm()
        for command in ('arm','emergency_lock','enable','issue_claim'):
            self.assert_blocked(command)


if __name__ == '__main__':
    unittest.main()
