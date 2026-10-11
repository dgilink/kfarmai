import copy
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"automation"))
from durable_budget import DurableBudget, BudgetBlocked
from canary_input import InputBound
from light_canary import (CanaryRunner, ResponsesTransport, BudgetRPCTransport, PROJECT,
                          plan, fingerprint, ceiling_microusd, request_payload)
from postgres_budget_harness import CONTAINER, rpc as pg_rpc, reset, sql

class Counter:
    is_fixture=True
    def __call__(self,payload):
        return {"object":"response.input_tokens","input_tokens":100}

def bound():return InputBound(Counter())

def response():
    return {"id":"resp_fixture", "model":"gpt-6-luna","service_tier":"default","status":"completed",
        "usage":{"input_tokens":100,"input_tokens_details":{"cached_tokens":0,"cache_write_tokens":0},
                 "output_tokens":20,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":120},
        "output":[{"type":"message","role":"assistant","content":[{"type":"output_text",
            "text":json.dumps({"mode":"CANARY_ONLY","items":["water supply","pipes","pressure"]})}]}]}

class Provider:
    is_fixture=True
    def __init__(self,value=None,error=None):
        self.value=response() if value is None else value
        self.error=error;self.calls=[]
    def __call__(self,payload):
        self.calls.append(payload)
        if self.error:raise self.error
        return copy.deepcopy(self.value)

def authority(approval,sha):
    if approval != "mock-explicit-model-and-budget":return None
    return {"model_approved":True,"budget_approved":True,"plan_sha256":sha,
            "project_id":PROJECT,"maximum_microusd":ceiling_microusd(),"mode":"CANARY_ONLY",
            "approval_id":"fixture-one","billing_multiplier":"1.00","live_authorized":False}

class Ledger:
    def __init__(self,enabled=True,limit=212):
        self.enabled,self.limit=enabled,limit
        self.rows={};self.events=[];self.lock=threading.Lock()
    def __call__(self,command,payload):
        with self.lock:
            self.events.append(command)
            if command=="reserve":
                if not payload["run_id"].isdigit() or len(payload["run_id"])>20 or payload["operation"]!="content":
                    raise ValueError("existing RPC identity contract")
                if not self.enabled or payload["maximum"]>self.limit:raise ValueError("disabled/exhausted")
                if payload["id"] in self.rows:return {"acquired":False}
                self.rows[payload["id"]]={**payload,"state":"HELD"}
                return {"acquired":True}
            row=self.rows[payload["id"]]
            if payload["fingerprint"]!=row["fingerprint"]:raise ValueError("identity")
            if command=="dispatch":
                if not self.enabled or row["state"]!="HELD":raise ValueError("duplicate")
                row["state"]="DISPATCHED";return {"execute":True}
            if command=="freeze":
                self.enabled=False;row["state"]="UNKNOWN";return {"state":"UNKNOWN"}
            if command=="unknown":return {"execute":False}
            if command=="settle":
                row.update(state="SETTLED",actual=payload["actual"]);return {"state":"SETTLED"}
            raise AssertionError(command)

class CanaryTests(unittest.TestCase):
    def setUp(self):
        self.net=patch("urllib.request.OpenerDirector.open",side_effect=AssertionError("network prohibited"))
        self.net.start();self.addCleanup(self.net.stop)
        self.ledger=Ledger()
    def run_canary(self,provider=None,approval="mock-explicit-model-and-budget",env=None):
        provider=provider or Provider()
        return CanaryRunner(DurableBudget(self.ledger),provider,authority,bound()).run(approval,env)
    def test_A_model_precedence_and_default(self):
        for env in [{},{"KFARMAI_TEXT_MODEL":"gpt-6-luna"},{"KFARMAI_MODEL_LIGHT":"gpt-6-luna","KFARMAI_TEXT_MODEL":"invalid"}]:
            self.assertEqual("gpt-6-luna",plan(env)["model"])
        with self.assertRaises(BudgetBlocked):plan({"KFARMAI_TEXT_MODEL":"unsupported"})
    def test_B_unsupported_model_error_freezes_no_retry(self):
        p=Provider(error=ValueError("unsupported model sensitive provider body"))
        with self.assertRaises(BudgetBlocked) as cm:self.run_canary(p)
        self.assertNotIn("sensitive",str(cm.exception))
        self.assertEqual(1,len(p.calls));self.assertFalse(self.ledger.enabled)
    def test_C_budget_disabled_zero_calls(self):
        self.ledger.enabled=False;p=Provider()
        with self.assertRaises(BudgetBlocked):self.run_canary(p)
        self.assertEqual([],p.calls)
    def test_D_budget_zero_zero_calls(self):
        self.ledger.limit=0;p=Provider()
        with self.assertRaises(BudgetBlocked):self.run_canary(p)
        self.assertEqual([],p.calls)
    def test_E_one_light_call_canary_only(self):
        p=Provider();r=self.run_canary(p)
        self.assertEqual(1,len(p.calls));self.assertEqual("CANARY_ONLY",r["mode"])
        self.assertFalse(r["publishable"]);self.assertNotIn("items",r)
        self.assertEqual(["reserve","dispatch","settle"],self.ledger.events)
    def test_F_output_ceiling_and_max_cost(self):
        p=Provider();self.run_canary(p)
        self.assertEqual(128,p.calls[0]["max_output_tokens"])
        self.assertEqual(212,ceiling_microusd())
        self.assertEqual(1024,plan()["max_input_tokens"])
    def test_G_usage_settled_actual_not_reservation(self):
        result=self.run_canary()
        self.assertEqual(20,result["actual_microusd"])
        self.assertEqual("SETTLED",next(iter(self.ledger.rows.values()))["state"])
    def test_H_missing_usage_freezes_and_holds_full_cap(self):
        r=response();r.pop("usage")
        with self.assertRaisesRegex(BudgetBlocked,"USAGE_UNVERIFIED"):self.run_canary(Provider(r))
        row=next(iter(self.ledger.rows.values()))
        self.assertEqual("UNKNOWN",row["state"]);self.assertEqual(212,row["maximum"])
        self.assertNotIn("actual",row);self.assertFalse(self.ledger.enabled)
    def test_I_network_error_no_retry(self):
        p=Provider(error=TimeoutError("private key must not escape"))
        runner=CanaryRunner(DurableBudget(self.ledger),p,authority,bound())
        for _ in range(2):
            with self.assertRaises(BudgetBlocked):runner.run("mock-explicit-model-and-budget")
        self.assertEqual(1,len(p.calls));self.assertFalse(self.ledger.enabled)
    def test_J_standard_high_configuration_blocked(self):
        for model in ["gpt-6.1-sol","gpt-6-astra"]:
            with self.subTest(model=model),self.assertRaises(ValueError):
                self.run_canary(env={"KFARMAI_MODEL_LIGHT":model})
        self.assertEqual([],self.ledger.events)
    def test_K_no_tools_search_image_and_unexpected_response_freezes(self):
        payload=request_payload()
        self.assertEqual([],payload["tools"]);self.assertEqual("none",payload["tool_choice"])
        r=response();r["output"].append({"type":"web_search_call"})
        with self.assertRaises(BudgetBlocked):self.run_canary(Provider(r))
        self.assertFalse(self.ledger.enabled)
    def test_L_unapproved_zero_calls_and_zero_budget_mutations(self):
        p=Provider()
        with self.assertRaises(BudgetBlocked):self.run_canary(p,approval=None)
        self.assertEqual([],p.calls);self.assertEqual([],self.ledger.events)
    def test_missing_one_of_separate_approvals(self):
        for key in ["model_approved","budget_approved"]:
            def verifier(a,s):
                r=authority(a,s);r[key]=False;return r
            with self.assertRaises(BudgetBlocked):
                CanaryRunner(DurableBudget(self.ledger),Provider(),verifier,bound()).run("mock-explicit-model-and-budget")
        self.assertEqual([],self.ledger.events)
    def test_duplicate_across_runner_instances(self):
        p=Provider();self.run_canary(p)
        with self.assertRaises(BudgetBlocked):self.run_canary(p)
        self.assertEqual(1,len(p.calls))
    def test_cache_cost_and_long_context(self):
        r=response();r["usage"]["input_tokens_details"]={"cached_tokens":40,"cache_write_tokens":20}
        self.assertEqual(17,self.run_canary(Provider(r))["actual_microusd"])
    def test_invalid_usage_cases_freeze(self):
        for field,value in [("input_tokens",True),("input_tokens",-1),("input_tokens",1025),
                            ("output_tokens",129),("total_tokens",119)]:
            self.ledger=Ledger();r=response();r["usage"][field]=value
            with self.subTest(field=field,value=value),self.assertRaises(BudgetBlocked):self.run_canary(Provider(r))
            self.assertFalse(self.ledger.enabled)
    def test_missing_cache_write_not_assumed_zero(self):
        r=response();del r["usage"]["input_tokens_details"]["cache_write_tokens"]
        with self.assertRaises(BudgetBlocked):self.run_canary(Provider(r))
        self.assertFalse(self.ledger.enabled)
    def test_refusal_settles_charge_no_retry(self):
        r=response();r["output"][0]["content"]=[{"type":"refusal","refusal":"no"}]
        p=Provider(r)
        with self.assertRaises(BudgetBlocked):self.run_canary(p)
        self.assertEqual(1,len(p.calls));self.assertEqual("SETTLED",next(iter(self.ledger.rows.values()))["state"])
    def test_self_attested_approval_cannot_enable_live(self):
        p=Provider();p.is_fixture=False
        with self.assertRaisesRegex(BudgetBlocked,"LIVE_ACCOUNT"):self.run_canary(p)
        self.assertEqual([],p.calls);self.assertEqual([],self.ledger.events)
    def test_transport_denies_unapproved_and_tampered_payloads(self):
        transport=ResponsesTransport("fixture",lambda _:False)
        with self.assertRaises(BudgetBlocked):transport(request_payload())
        transport=ResponsesTransport("fixture",lambda _:True)
        bad=request_payload();bad["tools"]=[{"type":"web_search"}]
        with self.assertRaises(BudgetBlocked):transport(bad)
    def test_budget_transport_no_policy_mutator(self):
        t=BudgetRPCTransport("fixture",lambda *_:True)
        for cmd in ["enable","configure","update","status"]:
            with self.assertRaises(BudgetBlocked):t(cmd,{})
    def test_concurrent_runner_calls_only_one(self):
        import concurrent.futures
        p=Provider();runner=CanaryRunner(DurableBudget(self.ledger),p,authority,bound())
        def call(_):
            try:return runner.run("mock-explicit-model-and-budget")["model_calls"]
            except BudgetBlocked:return 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            self.assertEqual(1,sum(pool.map(call,range(4))))
        self.assertEqual(1,len(p.calls))

@unittest.skipUnless(CONTAINER,"isolated PostgreSQL required")
class CanaryPostgresTests(unittest.TestCase):
    def setUp(self):reset(212)
    def test_actual_rpc_with_mock_light_settlement_and_duplicate(self):
        p=Provider();b=DurableBudget(pg_rpc)
        r=CanaryRunner(b,p,authority,bound()).run("mock-explicit-model-and-budget")
        self.assertEqual(20,r["actual_microusd"])
        self.assertEqual(20,pg_rpc("status",{})["settled"])
        with self.assertRaises(BudgetBlocked):
            CanaryRunner(b,p,authority,bound()).run("mock-explicit-model-and-budget")
        self.assertEqual(1,len(p.calls))
    def test_actual_rpc_usage_missing_freezes(self):
        r=response();r["usage"]=None
        with self.assertRaises(BudgetBlocked):
            CanaryRunner(DurableBudget(pg_rpc),Provider(r),authority,bound()).run("mock-explicit-model-and-budget")
        state=pg_rpc("status",{})
        self.assertFalse(state["enabled"]);self.assertEqual(212,state["unconfirmed"])
    def test_actual_rpc_disabled_and_zero_block_before_model(self):
        for statement in ["update kfarmai_private.budget_policy set enabled=false;",
                          "update kfarmai_private.budget_policy set enabled=true,daily_microusd=0;"]:
            sql(statement);p=Provider()
            with self.assertRaises(BudgetBlocked):
                CanaryRunner(DurableBudget(pg_rpc),p,authority,bound()).run("mock-explicit-model-and-budget")
            self.assertEqual([],p.calls)
    def test_actual_rpc_network_failure_locks(self):
        p=Provider(error=TimeoutError("synthetic"))
        with self.assertRaises(BudgetBlocked):
            CanaryRunner(DurableBudget(pg_rpc),p,authority,bound()).run("mock-explicit-model-and-budget")
        s=pg_rpc("status",{});self.assertFalse(s["enabled"]);self.assertEqual(212,s["unconfirmed"])
