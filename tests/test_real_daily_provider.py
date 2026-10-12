"""Same REVIEW path as production, with only HTTP/RPC/GitHub boundaries stubbed."""
import datetime as dt
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from approval_package import archive_bytes
from daily_review_issue import GitHubIssueIndex, GitHubReviewTransport, load_package
from daily_review_runner import verify_context
from durable_budget import DurableBudget
from kfarmai_review_approval import canonical, digest, metadata, read_archive
from real_daily_provider import (MODEL, MAX_INPUT, MAX_RESERVE, SAFETY_NOTE, TOPICS, RealDailyProvider,
                                 _source_evidence, estimated_cost, OpenAIResponses)


def article():
    topic = TOPICS[0]
    return {
        "title": "온실 난방 전 점검할 틈새와 배관",
        "category": topic["category"], "slug": topic["slug"],
        "meta_description": "온실 난방 전 일반적인 확인 포인트를 공공자료와 함께 정리합니다.",
        "summary": "온실 틈새와 난방 배관을 먼저 살펴보세요.",
        "sections": [{"heading": heading, "body": body} for heading, body in (
            ("온실 틈새", "온실 틈새와 파손 부위를 살펴보세요."),
            ("난방 배관", "난방 배관 누수 여부를 확인하세요."),
            ("난방기", "난방기 가동 상태를 점검하세요."),
            ("공공자료", "공식 자료와 실제 현장 상태를 함께 확인하세요."))],
        "keywords": ["온실", "난방", "배관", "틈새", "점검"],
        "tags": ["온실", "시설재배", "난방", "공공정보"],
        "kfarmai_connection": "공공정보 확인으로 이어지는 참고자료입니다.",
        "sources": [{"title": x["title"], "url": x["url"], "claim": x["claim"]}
                    for x in topic["sources"]],
        "hero_image_brief": "KFarmAI 브랜드 정적 이미지",
        "infographic_title": "온실 난방 확인 포인트",
        "infographic_items": ["틈새 확인", "배관 누수 확인", "난방기 확인"],
        "risk": "REVIEW", "risk_reason": "사람 검수 필요",
        "safety_note": "AI 작성 내용은 참고용입니다. 공공정보와 현장 상태를 확인하세요."
    }


class Source:
    def __init__(self, *, missing=False):
        self.missing = missing

    def fetch(self, url):
        source = next(x for x in TOPICS[0]["sources"] if x["url"] == url)
        claim = "다른 문장" if self.missing else source["claim"]
        return ("<html><head><title>" + source["title"] +
                "</title></head><body><main>" + (claim + " 현장 상태를 함께 확인합니다. ") * 30 +
                "</main></body></html>").encode()


class Model:
    def __init__(self, *, missing_usage=False, fail=False):
        self.calls = 0
        self.last_payload = None
        self.missing_usage = missing_usage
        self.fail = fail

    def generate(self, payload):
        self.calls += 1
        self.last_payload = payload
        if self.fail:
            raise ValueError("provider failed")
        response = {"id": "resp_fixture", "model": MODEL, "status": "completed",
                    "service_tier": "default",
                    "output": [{"type": "message", "content": [{"type": "output_text",
                    "text": json.dumps(article(), ensure_ascii=False)}]}]}
        if not self.missing_usage:
            response["usage"] = {"input_tokens": 600, "output_tokens": 400}
        return {"count_tokens": 0, "response": response}


class RPC:
    def __init__(self, *, budget=False):
        self.calls = []
        self.budget = budget
        self.reserved = False

    def __call__(self, command, payload):
        self.calls.append(command)
        if command == "reserve":
            if self.budget or self.reserved:
                return {"blocked": True}
            self.reserved = True
            return {"acquired": True}
        if command == "dispatch":
            return {"execute": True}
        if command == "settle":
            return {"state": "SETTLED"}
        if command == "issue_claim":
            return {"acquired": True}
        if command == "issue_creating":
            return {"execute": True}
        if command == "issue_complete":
            return {"state": "ISSUED"}
        return {"execute": False}


class GitHubFixture:
    is_fixture = True
    def __init__(self, package):
        self.package = package
        self.raw = archive_bytes(package)
        self.artifact = {"id": 12345, "name": "review-" + package["manifest"]["approval_id"],
                         "digest": "sha256:" + digest(self.raw), "expired": False,
                         "expires_at": "2099-01-01T00:00:00Z",
                         "workflow_run": {"id": package["manifest"]["source_run_id"],
                                          "head_sha": package["manifest"]["source_head_sha"]}}
        self.issues = []

    def find_upload(self, name, run_id):
        return {"artifact-id": "12345", "artifact-digest": digest(self.raw),
                "artifact-url": f"https://github.com/dgilink/kfarmai/actions/runs/{run_id}/artifacts/12345"}

    def download(self, artifact_id):
        return self.artifact, self.raw

    def find_issues(self, approval_id):
        return self.issues

    def create_issue(self, payload):
        issue = {**payload, "number": 9, "html_url": "https://github.com/dgilink/kfarmai/issues/9"}
        self.issues.append(issue)
        return issue


class RealDailyE2E(unittest.TestCase):
    def make(self, *, source=None, model=None, rpc=None):
        source, model, rpc = source or Source(), model or Model(), rpc or RPC()
        return RealDailyProvider(ROOT, source, model, DurableBudget(rpc),
                                 lambda slug: False), model, rpc

    def test_source_to_review_artifact_and_issue(self):
        provider, model, rpc = self.make()
        now = dt.datetime.now(dt.timezone.utc)
        date = now.astimezone(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "result"
            result = provider.run(date=date, run_id=990001,
                                  head_sha="a" * 40, output=output, now=now)
            self.assertEqual("REVIEW_PENDING_UPLOAD", result["outcome"]["status"])
            self.assertTrue(all(x["application_conditions"] and x["checked_at"]
                                and x["html_sha256"] for x in result["evidence"]))
            self.assertEqual(1, model.calls)
            self.assertEqual([], model.last_payload["tools"])
            self.assertEqual("none", model.last_payload["tool_choice"])
            self.assertNotIn("max_tool_calls", model.last_payload)
            self.assertEqual(1, rpc.calls.count("reserve"))
            self.assertEqual(1, rpc.calls.count("settle"))
            package = load_package(output / "approval-package")
            self.assertEqual(9, len(package["files"]))
            self.assertIn("RIFF", package["files"]["publish/" + package["intent"]["hero"]][:4].decode())
            self.assertIn("USDAgov/Holly Hess", package["files"]["publish/" + package["intent"]["html"]].decode())
            self.assertEqual(0, result["evidence"][0].get("image_cost_microusd", 0))
            github = GitHubFixture(package)
            issued = provider.create_review_issue(package, github)
            self.assertEqual("REVIEW", issued["state"])
            self.assertFalse(issued["published"])
            self.assertEqual(9, issued["issue"]["number"])
            self.assertEqual(package["manifest_sha256"], metadata(issued["issue"])["manifest_sha256"])
            self.assertEqual(1, rpc.calls.count("issue_claim"))

    def test_missing_source_prevents_reservation(self):
        provider, model, rpc = self.make(source=Source(missing=True))
        with self.assertRaises(Exception):
            provider.run(date=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat(),
                         run_id=990002, head_sha="a"*40, output="unused")
        self.assertEqual(0, model.calls)
        self.assertNotIn("reserve", rpc.calls)

    def test_standard_safety_notice_is_inserted_after_unsafe_content_check(self):
        provider, _, _ = self.make()
        a = article()
        a["safety_note"] = "현장을 살펴보세요."
        evidence = [{"title": x["title"], "url": x["url"], "claim": x["claim"]}
                    for x in TOPICS[0]["sources"]]
        self.assertEqual(SAFETY_NOTE, provider.classify_content(a, TOPICS[0], evidence)["safety_note"])
        a = article()
        a["sections"][0]["body"] = "오늘 방제하세요"
        with self.assertRaises(Exception):
            provider.classify_content(a, TOPICS[0], evidence)

    def test_existing_review_issue_blocks_new_day_before_paid_work(self):
        rpc, model = RPC(), Model()
        provider = RealDailyProvider(ROOT, Source(), model, DurableBudget(rpc),
                                     lambda slug: slug == TOPICS[0]["slug"])
        with tempfile.TemporaryDirectory() as temp, self.assertRaises(Exception):
            provider.run(date=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat(),
                         run_id=990007, head_sha="a"*40, output=Path(temp)/"out")
        self.assertEqual(0, model.calls)
        self.assertNotIn("reserve", rpc.calls)

    def test_issue_index_finds_unapproved_review(self):
        index = GitHubIssueIndex("test-only-token")
        index._client._request = lambda *_: [{"body": "게시 예정 URL: https://kfarmai.com/kb/" +
            TOPICS[0]["slug"] + ".html", "state": "open"}]
        self.assertTrue(index(TOPICS[0]["slug"]))

    def test_budget_block_prevents_model(self):
        provider, model, rpc = self.make(rpc=RPC(budget=True))
        with tempfile.TemporaryDirectory() as temp, self.assertRaises(Exception):
            provider.run(date=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat(),
                         run_id=990003, head_sha="a"*40, output=Path(temp)/"out")
        self.assertEqual(0, model.calls)

    def test_missing_usage_freezes_budget(self):
        provider, model, rpc = self.make(model=Model(missing_usage=True))
        with tempfile.TemporaryDirectory() as temp, self.assertRaises(Exception):
            provider.run(date=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat(),
                         run_id=990004, head_sha="a"*40, output=Path(temp)/"out")
        self.assertEqual(1, model.calls)
        self.assertIn("freeze", rpc.calls)
        self.assertNotIn("settle", rpc.calls)

    def test_model_error_no_retry_and_unknown(self):
        provider, model, rpc = self.make(model=Model(fail=True))
        with tempfile.TemporaryDirectory() as temp, self.assertRaises(Exception):
            provider.run(date=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date().isoformat(),
                         run_id=990005, head_sha="a"*40, output=Path(temp)/"out")
        self.assertEqual(1, model.calls)
        self.assertIn("unknown", rpc.calls)

    def test_cost_ceiling_and_source_tamper(self):
        self.assertEqual(22528, MAX_RESERVE)
        self.assertLessEqual(estimated_cost(0, 600, 400), MAX_RESERVE)
        with self.assertRaises(Exception):
            estimated_cost(MAX_INPUT + 1, 600, 400)
        source = TOPICS[0]["sources"][0]
        with self.assertRaises(Exception):
            _source_evidence(source, b"<html><title>other</title><body>no claim</body></html>", "2026-10-12")

    def test_openai_contract_blocks_tampered_payload_without_call(self):
        model = OpenAIResponses("not-a-live-key")
        with self.assertRaises(Exception):
            model.generate({"model": "other", "tools": []})
        self.assertFalse(model.response_used)

    def test_openai_adapter_calls_only_responses_once(self):
        model = OpenAIResponses("not-a-live-key")
        paths = []
        def fake_post(path, payload):
            paths.append(path)
            return {"id": "resp_fixture", "model": MODEL, "status": "completed",
                    "service_tier": "default", "usage": {"input_tokens": 12, "output_tokens": 4}}
        model._post = fake_post
        payload = {"model": MODEL, "max_output_tokens": 8192, "tools": [],
                   "tool_choice": "none", "service_tier": "default"}
        self.assertEqual(0, model.generate(payload)["count_tokens"])
        self.assertEqual(["responses"], paths)
        with self.assertRaises(Exception):
            model.generate(payload)

    def test_recovery_uses_one_fixed_new_budget_identity(self):
        provider, _, rpc = self.make()
        payload = {"model": MODEL}
        normal = provider.reserve_budget("2026-10-12", payload)
        self.assertEqual("20261012", normal["run_id"])
        rpc.reserved = False
        recovery = provider.reserve_budget("2026-10-12", payload, "38209820550")
        self.assertEqual("20261012999999999999", recovery["run_id"])
        rpc.reserved = False
        final_recovery = provider.reserve_budget("2026-10-12", payload, "38218191801")
        self.assertEqual("20261012888888888888", final_recovery["run_id"])
        with self.assertRaises(Exception):
            provider.reserve_budget("2026-10-12", payload, "other")
        with self.assertRaises(Exception):
            provider.reserve_budget("2026-10-13", payload, "38209820550")

    def test_openai_telemetry_no_secret_or_body(self):
        model = OpenAIResponses("secret-that-must-not-log")
        payload = {"model": MODEL, "max_output_tokens": 8192, "tools": [],
                   "tool_choice": "none", "service_tier": "default"}
        error = urllib.error.HTTPError("https://api.openai.com/v1/responses", 400,
            "bad request with secret-that-must-not-log",
            {"x-request-id": "req_safe123"}, io.BytesIO(b'{"error":{"code":"invalid_request_error","message":"secret-that-must-not-log"}}'))
        with mock.patch("urllib.request.build_opener") as opener, \
             mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
            opener.return_value.open.side_effect = error
            with self.assertRaises(Exception):
                model.generate(payload)
            request = opener.return_value.open.call_args.args[0]
        log = stderr.getvalue()
        self.assertEqual(1, opener.return_value.open.call_count)
        self.assertIn("X-client-request-id", request.headers)
        self.assertIn("req_safe123", log)
        self.assertIn('"http_status": 400', log)
        self.assertIn('"error_code": "invalid_request_error"', log)
        self.assertNotIn("secret-that-must-not-log", log)

    def test_daily_context_owner_and_head_guard(self):
        env = {"GITHUB_REPOSITORY": "dgilink/kfarmai", "GITHUB_REF": "refs/heads/main",
               "GITHUB_SHA": "a"*40, "GITHUB_RUN_ATTEMPT": "1",
               "GITHUB_EVENT_NAME": "workflow_dispatch", "GITHUB_ACTOR_ID": "293838055",
               "GITHUB_WORKFLOW_REF": "dgilink/kfarmai/.github/workflows/kfarmai-daily-autopublish.yml@refs/heads/main",
               "KFARMAI_DAILY_APPROVED_HEAD_SHA": "a"*40,
               "KFARMAI_DAILY_REVIEW_GENERATION_ENABLED": "true",
               "KFARMAI_AUTOPUBLISH_ENABLED": "false",
               "KFARMAI_REVIEW_PUBLISH_ENABLED": "false",
               "KFARMAI_DAILY_REVIEW_ONLY": "true"}
        verify_context(env, "a"*40, phase="generate")
        with self.assertRaises(Exception):
            verify_context(dict(env, GITHUB_ACTOR_ID="1"), "a"*40, phase="generate")
        with self.assertRaises(Exception):
            verify_context(dict(env, KFARMAI_DAILY_APPROVED_HEAD_SHA="b"*40), "a"*40,
                           phase="generate")

    def test_live_issue_adapter_requires_exact_workflow_and_one_create(self):
        provider, _, rpc = self.make()
        now = dt.datetime.now(dt.timezone.utc)
        date = now.astimezone(dt.timezone(dt.timedelta(hours=9))).date().isoformat()
        with tempfile.TemporaryDirectory() as temp:
            result = provider.run(date=date, run_id=990006, head_sha="a"*40,
                                  output=Path(temp)/"out", now=now)
            package = result["package"]
            fixture = GitHubFixture(package)
            env = {"GITHUB_REPOSITORY": "dgilink/kfarmai", "GITHUB_REF": "refs/heads/main",
                   "GITHUB_SHA": "a"*40, "GITHUB_RUN_ID": "990006", "GITHUB_RUN_ATTEMPT": "1",
                   "GITHUB_WORKFLOW_REF": "dgilink/kfarmai/.github/workflows/kfarmai-daily-autopublish.yml@refs/heads/main",
                   "KFARMAI_DAILY_REVIEW_GENERATION_ENABLED": "true",
                   "KFARMAI_AUTOPUBLISH_ENABLED": "false",
                   "KFARMAI_REVIEW_PUBLISH_ENABLED": "false"}
            adapter = GitHubReviewTransport(token="test-only-not-a-secret", repository="dgilink/kfarmai",
                run_id=990006, head_sha="a"*40, upload_outputs=fixture.find_upload("", 990006),
                artifact_json=fixture.artifact, artifact_zip=fixture.raw, environment=env)
            self.assertTrue(adapter.live_authorized(package["manifest"]))
            self.assertFalse(GitHubReviewTransport(token="test", repository="dgilink/kfarmai",
                run_id=990006, head_sha="a"*40, upload_outputs=fixture.find_upload("", 990006),
                artifact_json=fixture.artifact, artifact_zip=fixture.raw,
                environment=dict(env, GITHUB_WORKFLOW_REF=env["GITHUB_WORKFLOW_REF"]+"-other"))
                .live_authorized(package["manifest"]))
            def fake_request(path, method="GET", payload=None):
                if method == "GET":
                    return []
                issue = {**payload, "number": 88, "html_url": "https://github.com/dgilink/kfarmai/issues/88"}
                return issue
            adapter._request = fake_request
            issued = provider.create_review_issue(package, adapter)
            self.assertEqual(88, issued["issue"]["number"])
            self.assertEqual(package["manifest_sha256"], metadata(issued["issue"])["manifest_sha256"])
            with self.assertRaises(Exception):
                adapter.create_issue({"title": "again", "body": "again"})


if __name__ == "__main__":
    unittest.main()
