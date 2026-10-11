"""Integration-22 Gate D offline publication and audit contracts."""
from __future__ import annotations

import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

import gate_c_approval as gate
import gate_d_publish as gate_d
import kfarmai_review_approval as core
from kfarmai_post_publish_audit import FetchResult
from test_gate_c_approval import GateCFixture
from test_kfarmai_post_publish_audit import SOURCES


class GateDFixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gate-d-")
        self.root = Path(self.temp.name)
        (self.root / "automation").mkdir(parents=True)
        (self.root / "automation/config.json").write_bytes(
            (ROOT / "automation/config.json").read_bytes())
        (self.root / core.REGISTRY).write_bytes(b'{"items":[]}\n')
        (self.root / "sitemap.xml").write_text(
            f'<urlset xmlns="{core.NS}"><url><loc>https://kfarmai.com/</loc></url></urlset>',
            encoding="utf-8")
        self.gate_c = GateCFixture()
        record = self.gate_c.bind()
        action, meta = self.gate_c.authorize()
        self.candidate = gate.decide(
            record, action, meta, command_id=self.gate_c.event["comment"]["id"],
            decided_at="2026-10-10T18:01:00+09:00")[-1]
        self.prepared = gate_d.prepare_candidate(
            self.root, self.gate_c.raw, self.gate_c.issue,
            self.gate_c.artifact, self.candidate)

    def close(self):
        self.temp.cleanup()

    def apply(self, actual_index=False):
        if actual_index:
            subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
            subprocess.run(["git", "config", "core.autocrlf", "false"], cwd=self.root, check=True)
            subprocess.run(["git", "add", "--", "automation/config.json", core.REGISTRY,
                            "sitemap.xml"], cwd=self.root, check=True)
            subprocess.run(["git", "-c", "user.name=test", "-c", "user.email=test@example.invalid",
                            "commit", "-qm", "baseline"], cwd=self.root, check=True)
        return gate_d.apply_and_stage(self.root, self.prepared, actual_index=actual_index)

    def pending(self):
        return gate_d.record_deployment(
            self.prepared, commit_sha="b" * 40, deployment_id=991,
            deployed_at="2026-10-10T20:00:00+09:00",
            production_url=self.prepared["plan"]["record"]["url"],
            deployed_head_sha="b" * 40)

    def fetch(self, *, stale=False, missing_hero=False, missing_sitemap=False,
              source_error=False):
        plan = self.prepared["plan"]
        record = plan["record"]
        mapping = {
            record["url"]: plan["files"][f"kb/{record['slug']}.html"],
            f"https://kfarmai.com/static/kb/{record['slug']}-hero.webp":
                plan["files"][f"static/kb/{record['slug']}-hero.webp"],
            f"https://kfarmai.com/static/kb/{record['slug']}-infographic.svg":
                plan["files"][f"static/kb/{record['slug']}-infographic.svg"],
            "https://kfarmai.com/sitemap.xml": plan["files"]["sitemap.xml"],
        }
        if stale:
            mapping[record["url"]] = b"<html><title>old</title></html>"
        if missing_hero:
            mapping.pop(f"https://kfarmai.com/static/kb/{record['slug']}-hero.webp")
        if missing_sitemap:
            mapping["https://kfarmai.com/sitemap.xml"] = b'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>'

        def fetch(url, *, method="GET", timeout=15):
            if source_error and url in SOURCES:
                raise TimeoutError("fixture")
            if url in SOURCES:
                return FetchResult(200, url, b"official")
            if url not in mapping:
                return FetchResult(404, url, b"")
            return FetchResult(200, url, b"" if method == "HEAD" else mapping[url])
        return fetch


class GateDTests(unittest.TestCase):
    def setUp(self):
        self.fx = GateDFixture()

    def tearDown(self):
        self.fx.close()

    def blocked(self, code, fn):
        with self.assertRaisesRegex(core.Blocked, "^" + code + "$"):
            fn()

    def test_full_gate_c_to_d_reaches_published_only_after_audit(self):
        staged = self.fx.apply()
        pending = self.fx.pending()
        self.assertEqual(gate.PUBLISH_PENDING, pending["state"])
        final = gate_d.finalize_after_audit(
            self.fx.root, self.fx.prepared, pending, self.fx.fetch(),
            checked_at="2026-10-10T20:01:00+09:00")
        self.assertEqual(gate.PUBLISHED, final["state"])
        self.assertEqual("PASS", final["audit_status"])
        self.assertEqual(sorted(self.fx.prepared["plan"]["files"]), staged)
        self.assertTrue(self.fx.prepared["content_policy"]["safe_ai_reference"])

    def test_forbidden_diagnostic_or_commerce_language_is_blocked(self):
        content = copy.deepcopy(self.fx.gate_c.article)
        for phrase in ("확정 진단", "확정 처방", "추천 농약", "가격비교"):
            content["summary"] = phrase
            self.blocked("BLOCKED_CONTENT_POLICY", lambda c=copy.deepcopy(content):
                         gate_d.enforce_content_policy(c, b"<html></html>"))

    def test_missing_approval_is_blocked(self):
        candidate = {**self.fx.candidate, "state": gate.REVIEW_PENDING}
        self.blocked("BLOCKED_STATE_TRANSITION", lambda: gate_d.prepare_candidate(
            self.fx.root, self.fx.gate_c.raw, self.fx.gate_c.issue,
            self.fx.gate_c.artifact, candidate))

    def test_forged_approval_identity_is_blocked(self):
        candidate = {**self.fx.candidate, "decision_command_id": 999,
                     "manifest_sha256": "f" * 64}
        self.blocked("BLOCKED_ISSUE_BINDING", lambda: gate_d.prepare_candidate(
            self.fx.root, self.fx.gate_c.raw, self.fx.gate_c.issue,
            self.fx.gate_c.artifact, candidate))

    def test_expired_artifact_is_blocked(self):
        artifact = {**self.fx.gate_c.artifact, "expired": True}
        self.blocked("BLOCKED_ARTIFACT_EXPIRED", lambda: gate_d.prepare_candidate(
            self.fx.root, self.fx.gate_c.raw, self.fx.gate_c.issue,
            artifact, self.fx.candidate))

    def test_manifest_or_archive_tamper_is_blocked(self):
        self.blocked("BLOCKED_HASH_MISMATCH", lambda: gate_d.prepare_candidate(
            self.fx.root, self.fx.gate_c.raw + b"x", self.fx.gate_c.issue,
            self.fx.gate_c.artifact, self.fx.candidate))

    def test_exact_real_index_has_only_manifest_paths(self):
        staged = self.fx.apply(actual_index=True)
        actual = subprocess.check_output(
            ["git", "diff", "--cached", "--name-only"], cwd=self.fx.root,
            text=True).splitlines()
        self.assertEqual(staged, actual)

    def test_preexisting_staged_file_is_blocked(self):
        subprocess.run(["git", "init", "-q"], cwd=self.fx.root, check=True)
        (self.fx.root / "unrelated.txt").write_text("x", encoding="utf-8")
        subprocess.run(["git", "add", "--", "unrelated.txt"], cwd=self.fx.root, check=True)
        core.apply_plan(self.fx.root, self.fx.prepared["plan"])
        self.blocked("BLOCKED_PREEXISTING_INDEX", lambda: core.exact_stage(
            self.fx.root, self.fx.prepared["plan"]))

    def test_path_symlink_and_existing_target_fail_closed(self):
        target = self.fx.root / "kb"
        target.mkdir(); (target / "smartfarm-flowmeter-check.html").write_bytes(b"old")
        self.blocked("BLOCKED_TARGET_CONFLICT", lambda: gate_d.prepare_candidate(
            self.fx.root, self.fx.gate_c.raw, self.fx.gate_c.issue,
            self.fx.gate_c.artifact, self.fx.candidate))

    def test_deployment_head_mismatch_is_blocked(self):
        self.blocked("BLOCKED_DEPLOYMENT_RECEIPT", lambda: gate_d.record_deployment(
            self.fx.prepared, commit_sha="b" * 40, deployment_id=1,
            deployed_at="2026-10-10T20:00:00Z",
            production_url=self.fx.prepared["plan"]["record"]["url"],
            deployed_head_sha="c" * 40))

    def test_push_or_deploy_failure_never_creates_published_state(self):
        for code in ("BLOCKED_GIT_PUSH", "BLOCKED_PAGES_DEPLOY",
                     "BLOCKED_NETWORK_INTERRUPTED"):
            stopped = gate_d.abort_before_deployment(self.fx.prepared, code)
            self.assertEqual(gate.PUBLISH_CANDIDATE, stopped["state"])
            self.assertFalse(stopped["publish_attempted"])

    def test_stale_http_200_is_audit_failed(self):
        self.fx.apply(); result = gate_d.finalize_after_audit(
            self.fx.root, self.fx.prepared, self.fx.pending(), self.fx.fetch(stale=True),
            checked_at="2026-10-10T20:01:00+09:00")
        self.assertEqual((gate.AUDIT_FAILED, "BLOCKED_PRODUCTION_BYTES"),
                         (result["state"], result["audit_status"]))

    def test_missing_image_is_audit_failed(self):
        self.fx.apply(); result = gate_d.finalize_after_audit(
            self.fx.root, self.fx.prepared, self.fx.pending(), self.fx.fetch(missing_hero=True),
            checked_at="2026-10-10T20:01:00+09:00")
        self.assertEqual(gate.AUDIT_FAILED, result["state"])

    def test_missing_sitemap_is_audit_failed(self):
        self.fx.apply(); result = gate_d.finalize_after_audit(
            self.fx.root, self.fx.prepared, self.fx.pending(), self.fx.fetch(missing_sitemap=True),
            checked_at="2026-10-10T20:01:00+09:00")
        self.assertEqual((gate.AUDIT_FAILED, "BLOCKED_PRODUCTION_SITEMAP"),
                         (result["state"], result["audit_status"]))

    def test_source_network_failure_is_audit_failed(self):
        self.fx.apply(); result = gate_d.finalize_after_audit(
            self.fx.root, self.fx.prepared, self.fx.pending(), self.fx.fetch(source_error=True),
            checked_at="2026-10-10T20:01:00+09:00")
        self.assertEqual((gate.AUDIT_FAILED, "BLOCKED_POST_PUBLISH_AUDIT"),
                         (result["state"], result["audit_status"]))

    def test_registry_write_failure_prevents_published(self):
        self.fx.apply(); (self.fx.root / core.REGISTRY).write_bytes(b"broken")
        result = gate_d.finalize_after_audit(
            self.fx.root, self.fx.prepared, self.fx.pending(), self.fx.fetch(),
            checked_at="2026-10-10T20:01:00+09:00")
        self.assertEqual(gate.AUDIT_FAILED, result["state"])

    def test_duplicate_reservation_is_idempotent(self):
        registry = gate_d.PublicationRegistry()
        self.assertEqual(registry.reserve(self.fx.prepared), registry.reserve(self.fx.prepared))
        self.assertEqual(1, len(registry.records))

    def test_crash_after_deployment_resumes_same_identity(self):
        self.fx.apply(); pending = self.fx.pending()
        registry = gate_d.PublicationRegistry(); registry.reserve(self.fx.prepared); registry.save(pending)
        recovered = copy.deepcopy(registry.records[pending["publication_key"]])
        final = gate_d.finalize_after_audit(
            self.fx.root, self.fx.prepared, recovered, self.fx.fetch(),
            checked_at="2026-10-10T20:01:00+09:00")
        self.assertEqual(gate.PUBLISHED, final["state"])

    def test_test_canary_hold_and_revision_are_never_publishable(self):
        for state in (gate.HOLD, gate.REVISION_REQUESTED):
            blocked = {**self.fx.candidate, "state": state}
            self.blocked("BLOCKED_STATE_TRANSITION", lambda b=blocked: gate_d.prepare_candidate(
                self.fx.root, self.fx.gate_c.raw, self.fx.gate_c.issue,
                self.fx.gate_c.artifact, b))
        test_fixture = GateCFixture(package_kind="TEST_CANARY")
        test_record = test_fixture.bind()
        self.blocked("BLOCKED_TEST_PACKAGE", lambda: gate.decide(
            test_record, "approve", test_fixture.meta, command_id=1, decided_at="now"))

    def test_no_ai_image_or_live_transport_capability(self):
        source = (ROOT / "automation/gate_d_publish.py").read_text(encoding="utf-8")
        for forbidden in ("openai_api_key", "/responses", "images/generations",
                          "gh api", "git push", "workflow_dispatch", "supabase"):
            self.assertNotIn(forbidden, source.lower())


if __name__ == "__main__":
    unittest.main()
