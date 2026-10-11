"""One-shot bootstrap checks; PostgreSQL tests use only the network-none fixture."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'automation'))
from durable_budget import BudgetBlocked
from gateb_bootstrap_runner import (BOOTSTRAP_APPROVAL_ID, BootstrapDatabase,
                                    arm_payload, run_bootstrap, verify_runner_context,
                                    verified_connection_info)
from light_canary import CanaryRunner, FIRST_CANARY_BOOTSTRAP, NORMAL_LIVE
from postgres_budget_harness import CONTAINER, sql
from scoped_canary import ScopedCanaryBudget
from test_light_canary import Provider, bound

ROOT = Path(__file__).resolve().parents[1]


class BootstrapUnitTests(unittest.TestCase):
    def test_fixed_context_and_daily_locks(self):
        env = {'GITHUB_REPOSITORY': 'dgilink/kfarmai', 'GITHUB_REF': 'refs/heads/main',
               'GITHUB_EVENT_NAME': 'workflow_dispatch', 'GITHUB_RUN_ATTEMPT': '1',
               'GITHUB_WORKFLOW_REF': 'dgilink/kfarmai/.github/workflows/kfarmai-gateb-bootstrap.yml@refs/heads/main',
               'GITHUB_ACTOR_ID': '293838055', 'GITHUB_SHA': 'a'*40,
               'KFARMAI_GATEB_BOOTSTRAP_HEAD_SHA': 'a'*40,
               'KFARMAI_GATEB_BOOTSTRAP_APPROVAL_ID': BOOTSTRAP_APPROVAL_ID,
               'KFARMAI_AUTOPUBLISH_ENABLED': 'false',
               'KFARMAI_REVIEW_PUBLISH_ENABLED': 'false',
               'KFARMAI_GATEB_CANARY_ENV_READY': 'true'}
        self.assertEqual('gpt-6-luna', verify_runner_context(env, 'a'*40)['model'])
        for key, bad in [('GITHUB_ACTOR_ID', '1'), ('GITHUB_SHA', 'b'*40),
                         ('KFARMAI_GATEB_BOOTSTRAP_APPROVAL_ID', 'r2'),
                         ('KFARMAI_AUTOPUBLISH_ENABLED', 'true'),
                         ('GITHUB_RUN_ATTEMPT', '2'),
                         ('KFARMAI_GATEB_CANARY_ENV_READY', 'false'),
                         ('KFARMAI_REVIEW_PUBLISH_ENABLED', 'true')]:
            with self.subTest(key=key), self.assertRaises(BudgetBlocked):
                verify_runner_context(dict(env, **{key: bad}), 'a'*40)

    def test_normal_mode_keeps_preexisting_live_gate(self):
        budget = ScopedCanaryBudget(lambda *_: None, BOOTSTRAP_APPROVAL_ID)
        authority = {'approval_id': BOOTSTRAP_APPROVAL_ID,
                     'model_approved': True, 'budget_approved': True,
                     'plan_sha256': budget.identity['plan_sha256'],
                     'project_id': budget.identity['project_id'],
                     'maximum_microusd': 212, 'mode': 'CANARY_ONLY',
                     'billing_multiplier': '1.10', 'live_authorized': True,
                     'bootstrap_authorized': True}
        class NonFixtureProvider:
            is_fixture = False
            def __call__(self, _):
                raise AssertionError('No model call permitted')
        counter = bound()
        counter.is_fixture = False
        with self.assertRaisesRegex(BudgetBlocked, 'LIVE_ACCOUNT_OR_AUTHORITY_UNVERIFIED'):
            CanaryRunner(budget, NonFixtureProvider(), lambda *_: authority,
                         counter, execution_mode=NORMAL_LIVE).run(BOOTSTRAP_APPROVAL_ID)
        with self.assertRaisesRegex(BudgetBlocked, 'BOOTSTRAP_SCOPE_UNVERIFIED'):
            CanaryRunner(budget, NonFixtureProvider(),
                         lambda *_: dict(authority, bootstrap_authorized=False),
                         counter, execution_mode=FIRST_CANARY_BOOTSTRAP).run(BOOTSTRAP_APPROVAL_ID)

    def test_no_arm_before_preflight_or_credentials(self):
        class FakeDB:
            def __init__(self, ready): self.ready, self.events = ready, []
            def check_role(self): self.events.append('role')
            def control(self, command, _payload):
                self.events.append(command)
                return {'ready': self.ready}
        db = FakeDB(False)
        with self.assertRaises(BudgetBlocked): run_bootstrap(db, 'fixture')
        self.assertEqual(['role', 'preflight'], db.events)
        db = FakeDB(True)
        with self.assertRaises(BudgetBlocked): run_bootstrap(db, '')
        self.assertEqual(['role', 'preflight'], db.events)

    def test_workflow_only_manual_and_no_publish_capability(self):
        workflow = (ROOT/'.github/workflows/kfarmai-gateb-bootstrap.yml').read_text()
        self.assertIn('workflow_dispatch:', workflow)
        self.assertNotIn('  schedule:', workflow)
        self.assertIn('environment: kfarmai-gateb-canary', workflow)
        self.assertIn('permissions:\n  actions: read\n  contents: read', workflow)
        self.assertNotIn('contents: write', workflow)
        self.assertIn('KFARMAI_GATEB_BOOTSTRAP_HEAD_SHA == github.sha', workflow)
        self.assertNotIn('pages: write', workflow)

    def test_database_endpoint_and_ca_are_pinned(self):
        import psycopg
        good = ('postgresql://kfarmai_canary_runner:fixture@'
                'db.xzetqijeucldbfgjuoes.supabase.co:5432/postgres')
        options = psycopg.conninfo.conninfo_to_dict(
            verified_connection_info(psycopg, good, '/tmp/project-ca.crt'))
        self.assertEqual('verify-full', options['sslmode'])
        self.assertEqual('/tmp/project-ca.crt', options['sslrootcert'])
        for bad in [good.replace('db.xzetqijeucldbfgjuoes.supabase.co', 'attacker.example'),
                    good.replace('kfarmai_canary_runner', 'postgres'),
                    good.replace('/postgres', '/other'),
                    good+'?hostaddr=127.0.0.1']:
            with self.subTest(bad=bad.rsplit('@', 1)[-1]), self.assertRaises(BudgetBlocked):
                verified_connection_info(psycopg, bad, '/tmp/project-ca.crt')


@unittest.skipUnless(CONTAINER, 'Isolated PostgreSQL 17 fixture required')
class BootstrapPostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if sql("select to_regprocedure('kfarmai_private.bootstrap_canary_control(text,jsonb)') is null;") == 't':
            sql((ROOT/'supabase/migrations/20261011104645_gateb_one_shot_bootstrap_runner.sql').read_text())

    def setUp(self):
        sql('truncate kfarmai_private.canary_scopes, kfarmai_private.reservations; '
            'update kfarmai_private.budget_policy set enabled=false,daily_microusd=0;')
        self.seed_r1(yesterday=True)

    def seed_r1(self, *, yesterday):
        day = "(clock_timestamp() at time zone 'Asia/Seoul')::date"
        if yesterday: day += "-1"
        sql("insert into kfarmai_private.canary_scopes "
            "(approval_id,id,project_id,plan_sha256,request_sha256,fingerprint,run_id,"
            "operation,channel,model_approval_id,budget_approval_id,billing_multiplier,"
            "maximum,daily_microusd,day_kst,expires_at,approved_by,state,actual,reserved_at) "
            "values ('gateb-light-canary-20261011-r1',"
            "'00000000-0000-0000-0000-000000000001',"
            "'xzetqijeucldbfgjuoes',repeat('a',64),repeat('b',64),repeat('c',64),"
            "'1','content','REVIEW','model-r1','budget-r1','1.10',212,212,"
            + day + ",clock_timestamp()-interval '1 day','postgres','SETTLED',15,"
            "clock_timestamp()-interval '1 day');")

    def runner_sql(self, statement):
        proc = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt',
                               '-v', 'ON_ERROR_STOP=1', '-U', 'kfarmai_canary_runner',
                               '-d', 'postgres'], input=statement, text=True,
                              capture_output=True, timeout=40)
        if proc.returncode: raise RuntimeError(proc.stderr)
        return proc.stdout.strip()

    def control(self, command='preflight', payload=None):
        value = json.dumps(arm_payload() if payload is None else payload).replace("'", "''")
        return json.loads(self.runner_sql(
            f"select kfarmai_private.bootstrap_canary_control('{command}',"
            f"'{value}'::jsonb);"))

    def scoped(self, command, payload=None):
        value = json.dumps(arm_payload() if payload is None else payload).replace("'", "''")
        return json.loads(self.runner_sql(
            f"select kfarmai_private.bootstrap_canary_budget('{command}',"
            f"'{value}'::jsonb);"))

    def test_one_shot_arm_and_exact_scope(self):
        self.assertTrue(self.control()['ready'])
        self.assertEqual('ARMED', self.control('arm')['state'])
        self.assertTrue(self.scoped('status')['can_reserve'])
        with self.assertRaises(RuntimeError): self.control('arm')
        with self.assertRaises(RuntimeError): self.control('preflight')

    def test_no_broad_db_grants(self):
        for statement in ["select kfarmai_private.canary_budget('status','{}');",
                          "select kfarmai_private.manage_canary('arm','{}');",
                          'select * from kfarmai_private.canary_scopes;',
                          "select kfarmai_private.bootstrap_canary_control('arm','{}');",
                          "select kfarmai_private.bootstrap_canary_budget('status','{}');"]:
            with self.subTest(statement=statement), self.assertRaises(RuntimeError):
                self.runner_sql(statement)

    def test_same_day_old_spend_blocks_new_212_reservation(self):
        sql('truncate kfarmai_private.canary_scopes;')
        self.seed_r1(yesterday=False)
        with self.assertRaises(RuntimeError): self.control()
        self.assertEqual('0', sql("select count(*) from kfarmai_private.canary_scopes where approval_id='gateb-light-canary-20261011-r3';"))

    def test_unknown_scope_blocks_bootstrap(self):
        sql("update kfarmai_private.canary_scopes set state='UNKNOWN',actual=null "
            "where approval_id='gateb-light-canary-20261011-r1';")
        with self.assertRaises(RuntimeError): self.control()

    def test_global_policy_unlock_blocks_bootstrap(self):
        sql('update kfarmai_private.budget_policy set enabled=true,daily_microusd=1;')
        with self.assertRaises(RuntimeError): self.control()

    def test_wrong_identity_cannot_use_budget(self):
        self.control('arm')
        wrong = dict(arm_payload(), approval_id='another-scope')
        with self.assertRaises(RuntimeError): self.scoped('reserve', wrong)
        self.assertEqual('ARMED', self.scoped('status')['state'])

    def test_complete_mock_canary_settles_once_without_network(self):
        from test_light_canary import response
        outer = self
        events = []
        class Database:
            def check_role(self): events.append('role')
            def control(self, command, payload):
                events.append(command)
                return outer.control(command, payload)
            def __call__(self, command, payload):
                events.append(command)
                return outer.scoped(command, payload)
        class Counter:
            is_fixture = False
            def __init__(self, _key, authority): self.authority = authority
            def __call__(self, payload):
                from canary_input import request_sha
                self_outer = outer
                self_outer.assertTrue(self.authority(request_sha(payload))['approved'])
                events.append('token-count')
                return {'object': 'response.input_tokens', 'input_tokens': 100}
        class Transport:
            is_fixture = False
            def __init__(self, _key, authority, _bound): self.authority = authority
            def __call__(self, payload):
                from durable_budget import fingerprint
                outer.assertTrue(self.authority(fingerprint(payload)))
                events.append('responses')
                return response()
        with patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('No network')):
            result = run_bootstrap(Database(), 'fixture-only',
                                   counter_factory=Counter, transport_factory=Transport)
        self.assertFalse(result['publishable'])
        self.assertEqual(1, events.count('token-count'))
        self.assertEqual(1, events.count('responses'))
        self.assertEqual('SETTLED', self.scoped('status')['state'])
        self.assertEqual(212, self.scoped('status')['maximum'])
        with self.assertRaises(RuntimeError): self.control('arm')

    def test_missing_usage_locks_without_retry(self):
        from test_light_canary import response
        outer = self
        events = []
        class Database:
            def check_role(self): pass
            def control(self, command, payload): return outer.control(command, payload)
            def __call__(self, command, payload): return outer.scoped(command, payload)
        class Counter:
            is_fixture = False
            def __init__(self, _key, _authority): pass
            def __call__(self, _payload):
                events.append('count')
                return {'object': 'response.input_tokens', 'input_tokens': 100}
        class Transport:
            is_fixture = False
            def __init__(self, _key, _authority, _bound): pass
            def __call__(self, _payload):
                events.append('response')
                value = response()
                value.pop('usage')
                return value
        with patch('urllib.request.OpenerDirector.open', side_effect=AssertionError('No network')):
            with self.assertRaises(BudgetBlocked):
                run_bootstrap(Database(), 'fixture-only',
                              counter_factory=Counter, transport_factory=Transport)
        self.assertEqual(['count', 'response'], events)
        self.assertEqual('UNKNOWN', self.scoped('status')['state'])
        self.assertIsNone(self.scoped('status')['actual'])
        with self.assertRaises(RuntimeError): self.control('arm')

