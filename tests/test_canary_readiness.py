"""Canary readiness fixes - isolated/offline tests; never contact GitHub."""
import copy
import json
import pathlib
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'automation'))
from test_review_approval import Fixture, FakeGitHub
import kfarmai_review_approval as a
import model_router as router
import review_approval_workflow as workflow
from kfarmai_post_publish_audit import _default_fetch


class CanaryFixTests(unittest.TestCase):
    def setUp(self):
        self.fx=Fixture()
        self.addCleanup(self.fx.temp.cleanup)
        shield=patch.object(socket,'create_connection',side_effect=AssertionError('network forbidden'))
        shield.start()
        self.addCleanup(shield.stop)

    def test_actual_index_staging_exact_names_and_bytes(self):
        subprocess.run(['git','init','-q',str(self.fx.root)],check=True)
        plan=self.fx.plan()
        a.apply_plan(self.fx.root,plan)
        self.assertEqual(sorted(plan['files']),a.exact_stage(self.fx.root,plan))
        names=subprocess.check_output(['git','diff','--cached','--name-only'],cwd=self.fx.root).decode().splitlines()
        self.assertEqual(sorted(plan['files']),sorted(names))
        for name,expected in plan['files'].items():
            self.assertEqual(expected,subprocess.check_output(['git','show',':'+name],cwd=self.fx.root))
        self.assertNotEqual(0,subprocess.run(['git','rev-parse','--verify','HEAD'],cwd=self.fx.root,capture_output=True).returncode)

    def test_preexisting_staged_file_fails(self):
        subprocess.run(['git','init','-q',str(self.fx.root)],check=True)
        (self.fx.root/'unrelated.txt').write_text('keep')
        subprocess.run(['git','add','--','unrelated.txt'],cwd=self.fx.root,check=True)
        plan=self.fx.plan()
        a.apply_plan(self.fx.root,plan)
        with self.assertRaisesRegex(a.Blocked,'BLOCKED_PREEXISTING_INDEX'):
            a.exact_stage(self.fx.root,plan)

    def test_byte_change_after_application_fails(self):
        subprocess.run(['git','init','-q',str(self.fx.root)],check=True)
        plan=self.fx.plan()
        a.apply_plan(self.fx.root,plan)
        (self.fx.root/self.fx.intent['html']).write_bytes(b'altered')
        with self.assertRaisesRegex(a.Blocked,'BLOCKED_TOCTOU'):
            a.exact_stage(self.fx.root,plan)

    def test_registry_tamper_every_identity_field_fails(self):
        plan=self.fx.plan()
        a.apply_plan(self.fx.root,plan)
        p=self.fx.root/a.REGISTRY
        original=p.read_bytes()
        for key in ('approval_id','manifest_sha256','slug','title','url','category',
                    'content_sha256','html_sha256','source_run_id','source_urls','publication_mode','artifact_files','date'):
            data=json.loads(original)
            data['items'][0][key]='tampered'
            p.write_bytes(a.canonical(data)+b'\n')
            with self.subTest(key=key),self.assertRaisesRegex(a.Blocked,'BLOCKED_TARGET_CONFLICT'):
                self.fx.plan()
        p.write_bytes(original)
        self.assertEqual('ALREADY_PUBLISHED',self.fx.plan()['status'])

    def test_deterministic_registry_audit_finalization(self):
        plan=self.fx.plan()
        a.apply_plan(self.fx.root,plan)
        original=(self.fx.root/a.REGISTRY).read_bytes()
        result=a.verify_production(self.fx.root,plan['record'],self.fx.fetch)
        self.assertTrue(result['production_verified'])
        self.assertEqual('PASS',result['audit']['status'])
        update=a.plan_registry_finalization(self.fx.root,plan['record'],result,published_at='2026-10-09T01:00:00Z')
        self.assertEqual('APPROVED',update['status'])
        self.assertEqual(original,(self.fx.root/a.REGISTRY).read_bytes())
        a.apply_plan(self.fx.root,update)
        entry=json.loads((self.fx.root/a.REGISTRY).read_bytes())['items'][0]
        self.assertEqual('AUDIT_PASS',entry['post_publish_audit_status'])
        self.assertEqual('2026-10-09T01:00:00Z',entry['published_at'])
        self.assertEqual('ALREADY_FINALIZED',a.plan_registry_finalization(self.fx.root,plan['record'],result,published_at='2026-10-09T01:00:00Z')['status'])

    def test_receipt_identity_conflict_blocks(self):
        plan=self.fx.plan();a.apply_plan(self.fx.root,plan)
        result=a.verify_production(self.fx.root,plan['record'],self.fx.fetch)
        bad={**plan['record'],'title':'tampered'}
        with self.assertRaisesRegex(a.Blocked,'BLOCKED_TARGET_CONFLICT'):
            a.plan_registry_finalization(self.fx.root,bad,result,published_at='t')

    def test_budget_blocks_same_tier_retries(self):
        for tier in ('LIGHT','STANDARD'):
            for fail in ('schema_parse','network','rate_limit'):
                decision=router.route_task(router.TaskProfile(task_type='content_generation',previous_tier=tier,
                      failure_type=fail,daily_budget_exceeded=True),{})
                with self.subTest(tier=tier,fail=fail):
                    self.assertTrue(decision.blocked)
                    self.assertEqual('NONE',decision.tier)

    def test_standard_one_schema_repair_and_no_second(self):
        for attempts,expected in ((0,'STANDARD'),(1,'NONE')):
            d=router.route_task(router.TaskProfile(task_type='content_generation',previous_tier='STANDARD',
                         failure_type='schema_parse',schema_repair_attempts=attempts),{})
            self.assertEqual(expected,d.tier)

    def test_count_escalation_policy(self):
        for count in (2,3):
            d=router.route_task(router.TaskProfile(task_type='content_generation',source_count=count,
                          cross_source_synthesis=True,needs_synthesis=True),{})
            self.assertEqual('LIGHT',d.tier)
        d=router.route_task(router.TaskProfile(task_type='content_generation',source_count=4,
                          cross_source_synthesis=True,needs_synthesis=True),{})
        self.assertEqual('STANDARD',d.tier)
        d=router.route_task(router.TaskProfile(task_type='content_generation',source_count=5,
                          cross_source_synthesis=False,needs_synthesis=True),{})
        self.assertEqual('LIGHT',d.tier)

    def test_search_exhausted_or_sufficient_prevents_more_search(self):
        for options in ({'search_attempts':2},{'search_results_sufficient':True,'search_attempts':1}):
            d=router.route_task(router.TaskProfile(task_type='source_discovery',needs_search=True,**options),{})
            self.assertEqual('NONE',d.tier)
            self.assertFalse(d.web_search_enabled)

    def test_invalid_counter_tier_risk(self):
        for kwargs in ({'search_attempts':-1},{'source_count':-1},{'schema_repair_attempts':-1},
                       {'previous_tier':'weird'},{'risk':'broken'}, {'search_attempts':True}):
            with self.subTest(kwargs=kwargs),self.assertRaises(ValueError):
                router.route_task(router.TaskProfile(task_type='tagging',**kwargs),{})

    def test_recover_existing_published_bytes_without_duplicate_publish(self):
        from unittest.mock import patch
        plan=self.fx.plan()
        a.apply_plan(self.fx.root,plan)
        client=FakeGitHub(self.fx)
        owner_command=copy.deepcopy(self.fx.event)
        approved=a.transition(self.fx.meta,"APPROVED_VERIFYING")
        approved=a.transition(approved,"APPROVED")
        client.issue['body']=a.issue_body(client.issue,approved)
        owner_command['issue']['body']=client.issue['body']
        calls=[]
        def fake_git(args,**kwargs):
            calls.append(args)
            if args[1:3]==['status','--porcelain']:return b''
            if args[1]=='ls-remote':return ("b"*40+"\trefs/heads/main").encode()
            if args[1:3]==['rev-parse','HEAD']:return ("b"*40).encode()
            return b''
        with patch.object(workflow.subprocess,'check_output',side_effect=fake_git), \
             patch.object(workflow.subprocess,'run',return_value=subprocess.CompletedProcess([],0)), \
             patch.object(workflow,'exact_stage',return_value=[a.REGISTRY]), \
             patch.object(workflow,'_default_fetch',side_effect=self.fx.fetch):
            outcome=workflow.run(owner_command,self.fx.root,client)
        self.assertEqual('PUBLISHED',outcome['status'])
        self.assertEqual('PUBLISHED',a.metadata(client.issue)['state'])
        self.assertEqual(0,sum(1 for args in calls if 'feat: publish approved' in str(args)))
        self.assertEqual(1,sum(1 for args in calls if 'chore: audit receipt' in str(args)))
        self.assertEqual(0,sum(1 for endpoint,_,_ in client.calls if 'pages.yml/dispatches' in endpoint))
        self.assertEqual('AUDIT_PASS',json.loads((self.fx.root/a.REGISTRY).read_bytes())['items'][0]['post_publish_audit_status'])

    def test_dynamic_allowlist_rejects_unconfigured_without_network(self):
        with self.assertRaises(ValueError):
            _default_fetch('https://allowed.example.invalid/path',allowed_source_domains=['rda.go.kr'])
        # Domain can be added only by explicit runtime config; no network call here.
        class Dummy:
            status=200
            headers={}
            def geturl(self):return 'https://allowed.example.invalid/path'
            def read(self,n):return b'ok'
            def __enter__(self):return self
            def __exit__(self,*a):return None
        class Opener:
            def open(self,*args,**kwargs):return Dummy()
        with patch('urllib.request.build_opener',return_value=Opener()):
            result=_default_fetch('https://allowed.example.invalid/path',allowed_source_domains=['allowed.example.invalid'])
        self.assertEqual(200,result.status)

if __name__=='__main__':unittest.main()
