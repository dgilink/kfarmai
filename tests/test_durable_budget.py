import concurrent.futures
import json
from pathlib import Path
import sys
import subprocess
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation'))
from durable_budget import DurableBudget, BudgetBlocked, fingerprint
from postgres_budget_harness import CONTAINER, rpc, sql, reset


@unittest.skipUnless(CONTAINER, 'Requires isolated PostgreSQL; mandatory in Gate A verification')
class DurableBudgetTests(unittest.TestCase):
    def setUp(self):
        reset(100)
        self.budget = DurableBudget(rpc)

    def reserve(self, run=1, maximum=20, channel='LOW', operation='content'):
        return self.budget.reserve(run, operation, channel, maximum, {'model': 'fixture'})

    def test_concurrent_independent_connections_share_low_review_limit(self):
        def run(i):
            try:
                return bool(self.reserve(i, channel='LOW' if i % 2 else 'REVIEW'))
            except BudgetBlocked:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
            acquired = list(pool.map(run, range(1, 21)))
        self.assertEqual(5, sum(acquired))
        self.assertEqual(100, rpc('status', {})['unconfirmed'])

    def test_same_reservation_concurrency_and_new_id_retry(self):
        def run(_):
            try:
                self.reserve(); return True
            except BudgetBlocked:
                return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            self.assertEqual(1, sum(pool.map(run, range(10))))
        self.assertEqual('1', sql('select count(*) from kfarmai_private.reservations;'))
        with self.assertRaises(RuntimeError):
            rpc('reserve', dict(id='00000000-0000-0000-0000-000000000001',run_id='1',operation='content',
                                maximum=20,channel='LOW',fingerprint=fingerprint({'model':'fixture'})))

    def test_crash_after_reservation_retains_maximum(self):
        self.reserve(maximum=100)
        with self.assertRaises(BudgetBlocked):
            DurableBudget(rpc).reserve(2,'image','REVIEW',1,{'model':'fixture'})
        self.assertEqual(100, rpc('status', {})['unconfirmed'])

    def test_actual_process_exit_after_commit_retains_reservation(self):
        root=Path(__file__).resolve().parents[1]
        code="import sys,os;sys.path[:0]=['automation','tests'];from durable_budget import DurableBudget;from postgres_budget_harness import rpc;DurableBudget(rpc).reserve(88,'image','REVIEW',100,{'fixture':True});os._exit(137)"
        child=subprocess.run([sys.executable,'-c',code],cwd=root,capture_output=True)
        self.assertEqual(137,child.returncode)
        self.assertEqual(100,rpc('status',{})['unconfirmed'])
        with self.assertRaises(BudgetBlocked):self.reserve(89,1)

    def test_outbox_concurrent_claims_have_one_winner(self):
        payload={'approval_id':'review-fixture','fingerprint':'c'*64}
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            results=list(pool.map(lambda _:rpc('issue_claim',payload),range(12)))
        self.assertEqual(1,sum(r['acquired'] for r in results))
        rpc('issue_creating',payload)
        with self.assertRaises(RuntimeError):rpc('issue_creating',payload)

    def test_uncertain_call_no_retry_and_usage_recovery(self):
        r = self.reserve()
        calls=[]
        def crash():
            calls.append(1)
            raise TimeoutError('response lost')
        with self.assertRaises(BudgetBlocked): self.budget.execute(r,crash,lambda _: (0,{}))
        with self.assertRaises(BudgetBlocked): self.budget.execute(r,crash,lambda _: (0,{}))
        self.assertEqual([1], calls)
        self.assertEqual(20, rpc('status', {})['unconfirmed'])
        payload={**r,'actual':7,'receipt':fingerprint({'provider':'verified receipt'})}
        rpc('settle',payload)
        self.assertTrue(rpc('settle',payload)['duplicate'])
        self.assertEqual((7,0), tuple(rpc('status',{})[k] for k in ('settled','unconfirmed')))
        with self.assertRaises(RuntimeError): rpc('settle',{**payload,'actual':8})

    def test_over_usage_persists_global_circuit_breaker(self):
        r=self.reserve();rpc('dispatch',r)
        result=rpc('settle',{**r,'actual':21,'receipt':'a'*64})
        self.assertIn('blocked',result)
        self.assertFalse(rpc('status',{})['enabled'])
        with self.assertRaises(BudgetBlocked):self.reserve(2)

    def test_wrong_fingerprint_and_stale_day_cannot_dispatch(self):
        r=self.reserve()
        with self.assertRaises(RuntimeError):rpc('dispatch',{**r,'fingerprint':'b'*64})
        sql("update kfarmai_private.reservations set day_kst=day_kst-1;")
        with self.assertRaises(RuntimeError):rpc('dispatch',r)

    def test_kst_server_clock_not_supplied_date(self):
        r=self.reserve()
        actual=sql('select day_kst from kfarmai_private.reservations;')
        self.assertEqual(sql("select (clock_timestamp() at time zone 'Asia/Seoul')::date;"),actual)
        self.assertEqual('2026-10-11',sql("select ('2026-10-10T15:00:00Z'::timestamptz at time zone 'Asia/Seoul')::date;"))
        self.assertEqual('2026-10-10',sql("select ('2026-10-10T14:59:59Z'::timestamptz at time zone 'Asia/Seoul')::date;"))

    def test_roles_rls_and_direct_tables_are_denied(self):
        for role in ('anon','authenticated'):
            with self.subTest(role=role),self.assertRaises(RuntimeError):
                sql(f"set role {role}; select public.kfarmai_budget('status','{{}}');")
        with self.assertRaises(RuntimeError):sql('set role service_role; select * from kfarmai_private.reservations;')
        self.assertEqual('3',sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kfarmai_private' and c.relname in ('budget_policy','reservations','review_outbox') and c.relrowsecurity;"))

    def test_failed_transaction_cannot_leave_partial_reservation(self):
        r=self.reserve()
        encoded=json.dumps({**r,'id':'00000000-0000-0000-0000-000000000002','run_id':'2'}).replace("'","''")
        with self.assertRaises(RuntimeError):
            sql(f"begin; set role service_role; select public.kfarmai_budget('reserve','{encoded}'); select 1/0; commit;")
        self.assertEqual(20,rpc('status',{})['unconfirmed'])

    def test_rpc_failure_closes_before_transport(self):
        def unavailable(*_):raise OSError('private connection details')
        with self.assertRaisesRegex(BudgetBlocked,'BUDGET_RPC_BLOCKED'):
            DurableBudget(unavailable).reserve(1,'content','LOW',20,{})
