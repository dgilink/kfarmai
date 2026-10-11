"""Offline fixtures only: no remote calls, commits, push, deploy, or AI."""
import copy
import datetime as dt
import io
import json
import os
from pathlib import Path
import socket
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))
import kfarmai_review_approval as approval
import review_approval_workflow as workflow
from kfarmai_post_publish_audit import FetchResult, audit_published_content
from test_kfarmai_post_publish_audit import TITLE, SLUG, URL, SOURCES, page_html


class Fixture:
    def __init__(self):
        self.temp = tempfile.TemporaryDirectory(prefix="kfarmai-approval-test-")
        self.root = Path(self.temp.name)
        (self.root / "automation").mkdir()
        (self.root / "automation/config.json").write_bytes((ROOT / "automation/config.json").read_bytes())
        (self.root / approval.REGISTRY).write_bytes(b'{"items":[]}\n')
        (self.root / "sitemap.xml").write_bytes(f'<urlset xmlns="{approval.NS}"><url><loc>https://kfarmai.com/</loc></url></urlset>'.encode())
        self.content = {"title": TITLE, "risk": "REVIEW", "sources": [{"url": x} for x in SOURCES]}
        self.intent = {"approval_id": "fixture-r1", "revision": 1, "slug": SLUG, "title": TITLE,
                       "url": URL, "category": "식물병", "date": "2026-10-09", "source_urls": SOURCES,
                       "source_run_id": 123, "content_sha256": approval.digest(approval.canonical(self.content)),
                       "html": f"kb/{SLUG}.html", "hero": f"static/kb/{SLUG}-hero.webp",
                       "infographic": f"static/kb/{SLUG}-infographic.svg"}
        self.files = {"content.json": approval.canonical(self.content), "publish-intent.json": approval.canonical(self.intent),
                      self.intent["html"]: page_html(), self.intent["hero"]: b"RIFF" + bytes(4) + b"WEBPfixture",
                      self.intent["infographic"]: b'<svg xmlns="http://www.w3.org/2000/svg"><text>fixture</text></svg>'}
        self.manifest = {"version": 1, "repository": approval.REPOSITORY, "approval_id": "fixture-r1", "revision": 1,
                         "source_run_id": 123, "source_head_sha": "a" * 40,
                         "files": {name: approval.digest(value) for name, value in self.files.items()}}
        self.files["manifest.json"] = approval.canonical(self.manifest)
        self.hash = approval.digest(self.files["manifest.json"])
        self.files["manifest.sha256"] = (self.hash + "\n").encode()
        self.meta = {"repository": approval.REPOSITORY, "approval_id": "fixture-r1", "manifest_sha256": self.hash,
                     "run_id": 123, "artifact_id": 456, "artifact_name": "review-fixture-r1", "state": "REVIEW"}
        self.owner = {"login": "dgilink", "id": 999}
        self.issue = {"number": 42, "title": "[KFarmAI Daily][REVIEW] fixture", "state": "open", "user": self.owner,
                      "body": "Review this immutable package.\n<!-- kfarmai-review\n" + approval.canonical(self.meta).decode() + "\n-->"}
        self.event = {"action": "created", "repository": {"full_name": approval.REPOSITORY, "owner": self.owner},
                      "issue": self.issue, "sender": self.owner,
                      "comment": {"id": 111, "user": self.owner, "body": f"/kfarmai approve fixture-r1 {self.hash}"}}
        self.raw = self.zip()
        self.artifact = {"id": 456, "name": self.meta["artifact_name"], "expired": False,
                         "expires_at": "2099-01-01T00:00:00Z", "digest": "sha256:" + approval.digest(self.raw),
                         "workflow_run": {"id": 123, "head_sha": "a" * 40}}
        self.meta["artifact_digest"] = self.artifact["digest"]
        self.issue["body"] = "Review this immutable package.\n<!-- kfarmai-review\n" + approval.canonical(self.meta).decode() + "\n-->"

    def zip(self, files=None, infos=None):
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in (files or self.files).items():
                archive.writestr((infos or {}).get(name, name), data)
        return out.getvalue()

    def archive_for(self, files, infos=None):
        raw = self.zip(files, infos)
        for name in files:
            if "\\" in name:
                raw = raw.replace(name.replace("\\", "/").encode(), name.encode())
        artifact = {**self.artifact, "digest": "sha256:" + approval.digest(raw)}
        self.meta["artifact_digest"] = artifact["digest"]
        return raw, artifact

    def plan(self):
        return approval.plan_publication(self.root, self.raw, self.meta, self.artifact)

    def resign(self):
        self.manifest['files'] = {name: approval.digest(data) for name, data in self.files.items() if name not in {'manifest.json', 'manifest.sha256'}}
        self.files['manifest.json'] = approval.canonical(self.manifest)
        self.hash = approval.digest(self.files['manifest.json'])
        self.files['manifest.sha256'] = (self.hash + '\n').encode()
        self.meta['manifest_sha256'] = self.hash
        self.raw, self.artifact = self.archive_for(self.files)

    def fetch(self, url, *, method="GET", timeout=15, allowed_source_domains=None):
        if url == URL:
            return FetchResult(200, url, self.files[self.intent["html"]])
        if url == "https://kfarmai.com/sitemap.xml":
            return FetchResult(200, url, (self.root / "sitemap.xml").read_bytes())
        return FetchResult(200, url, b"ok")


class ApprovalTests(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()
        self.network = patch.object(socket, "create_connection", side_effect=AssertionError("external network forbidden"))
        self.network.start()

    def tearDown(self):
        self.network.stop()
        self.fx.temp.cleanup()

    def blocked(self, code, call):
        with self.assertRaisesRegex(approval.Blocked, "^" + code + "$"):
            call()

    def test_valid_package_and_owner_command(self):
        self.assertEqual(approval.authorize(self.fx.event), ("approve", self.fx.meta))
        intent, files, manifest = approval.verify_package(self.fx.raw, self.fx.meta, self.fx.artifact)
        self.assertEqual(intent, self.fx.intent)
        self.assertEqual(files, self.fx.files)
        self.assertEqual(manifest, self.fx.manifest)

    def test_wrong_commenter(self):
        event = copy.deepcopy(self.fx.event)
        event["comment"]["user"] = {"login": "stranger", "id": 1234}
        self.blocked("BLOCKED_COMMENTER", lambda: approval.authorize(event))

    def test_spoofed_owner_login_wrong_numeric_id(self):
        event = copy.deepcopy(self.fx.event)
        event["comment"]["user"]["id"] = 1234
        event["repository"]["owner"] = self.fx.owner
        self.blocked("BLOCKED_COMMENTER", lambda: approval.authorize(event))

    def test_wrong_approval_id(self):
        event = copy.deepcopy(self.fx.event)
        event["comment"]["body"] = event["comment"]["body"].replace("fixture-r1", "fixture-r2")
        self.blocked("BLOCKED_APPROVAL_ID", lambda: approval.authorize(event))

    def test_wrong_manifest_command(self):
        event = copy.deepcopy(self.fx.event)
        event["comment"]["body"] = f"/kfarmai approve fixture-r1 {'b' * 64}"
        self.blocked("BLOCKED_HASH_MISMATCH", lambda: approval.authorize(event))

    def test_pr_issue_rejected(self):
        self.fx.issue["pull_request"] = {"url": "fixture"}
        self.blocked("BLOCKED_PR_ISSUE", lambda: approval.authorize(self.fx.event))

    def test_untrusted_issue_author_rejected(self):
        self.fx.issue["user"] = {"id": 12345, "login": "unknown"}
        self.blocked("BLOCKED_ISSUE_AUTHOR", lambda: approval.authorize(self.fx.event))

    def test_metadata_changed_after_comment(self):
        current = copy.deepcopy(self.fx.issue)
        current["body"] = approval.issue_body(current, {**self.fx.meta, "artifact_id": 987})
        self.blocked("BLOCKED_ISSUE_CHANGED", lambda: approval.authorize(self.fx.event, current))

    def test_command_has_no_extra_shell_text(self):
        self.fx.event["comment"]["body"] += "\nmalicious command"
        self.blocked("BLOCKED_COMMAND", lambda: approval.authorize(self.fx.event))

    def test_tampered_html(self):
        self.tamper(self.fx.intent["html"])

    def test_tampered_hero(self):
        self.tamper(self.fx.intent["hero"])

    def test_tampered_infographic(self):
        self.tamper(self.fx.intent["infographic"])

    def tamper(self, name):
        files = {**self.fx.files, name: self.fx.files[name] + b"tamper"}
        raw, artifact = self.fx.archive_for(files)
        self.blocked("BLOCKED_HASH_MISMATCH", lambda: approval.verify_package(raw, self.fx.meta, artifact))

    def test_archive_digest_mismatch(self):
        self.blocked("BLOCKED_HASH_MISMATCH", lambda: approval.verify_package(self.fx.raw + b"tamper", self.fx.meta, self.fx.artifact))

    def test_manifest_swap(self):
        self.tamper("manifest.json")

    def test_manifest_digest_file_tampered(self):
        self.tamper("manifest.sha256")

    def test_publish_intent_tampered(self):
        self.tamper("publish-intent.json")

    def test_missing_artifact(self):
        self.blocked("BLOCKED_ARTIFACT_MISSING", lambda: approval.verify_package(self.fx.raw, self.fx.meta, None))

    def test_expired_artifact(self):
        self.blocked("BLOCKED_ARTIFACT_EXPIRED", lambda: approval.verify_package(self.fx.raw, self.fx.meta, {**self.fx.artifact, "expired": True}))

    def test_past_expiry_date(self):
        self.blocked("BLOCKED_ARTIFACT_EXPIRED", lambda: approval.verify_package(self.fx.raw, self.fx.meta, {**self.fx.artifact, "expires_at": "2020-01-01T00:00:00Z"}))

    def test_artifact_swap_id_run_and_name(self):
        for change in ({"id": 999}, {"name": "latest"}, {"workflow_run": {"id": 999}}):
            with self.subTest(change=change):
                self.blocked("BLOCKED_ARTIFACT_IDENTITY", lambda: approval.verify_package(self.fx.raw, self.fx.meta, {**self.fx.artifact, **change}))

    def test_path_traversal_absolute_drive_and_backslash(self):
        for name in ("../escape", "/absolute", "C:/drive", "kb/../../bad", "kb\\bad", "kb/CON.html", "kb/x.html:stream"):
            with self.subTest(path=name):
                raw, artifact = self.fx.archive_for({**self.fx.files, name: b"x"})
                self.blocked("BLOCKED_PATH", lambda: approval.verify_package(raw, self.fx.meta, artifact))

    def test_symlink_archive(self):
        name = self.fx.intent["html"]
        info = zipfile.ZipInfo(name)
        info.create_system = 3
        info.external_attr = (stat.S_IFLNK | 0o777) << 16
        raw, artifact = self.fx.archive_for(self.fx.files, {name: info})
        self.blocked("BLOCKED_FILE_TYPE", lambda: approval.verify_package(raw, self.fx.meta, artifact))

    def test_hardlink_extra_metadata(self):
        name = self.fx.intent["html"]
        info = zipfile.ZipInfo(name)
        info.extra = b"\x0d\x00\x04\x00link"
        raw, artifact = self.fx.archive_for(self.fx.files, {name: info})
        self.blocked("BLOCKED_FILE_TYPE", lambda: approval.verify_package(raw, self.fx.meta, artifact))

    def test_unexpected_file(self):
        raw, artifact = self.fx.archive_for({**self.fx.files, "unexpected.txt": b"x"})
        self.blocked("BLOCKED_UNEXPECTED_FILES", lambda: approval.verify_package(raw, self.fx.meta, artifact))

    def test_valid_hashes_do_not_bypass_secret_detection(self):
        self.fx.files[self.fx.intent['html']] += ('github_' + 'pat_' + 'X' * 40).encode()
        self.fx.resign()
        self.blocked('BLOCKED_SECRET', self.fx.plan)

    def test_valid_hashes_do_not_bypass_internal_metadata_detection(self):
        self.fx.files[self.fx.intent['html']] += b'<!-- sourceSnapshotHash=internal -->'
        self.fx.resign()
        self.blocked('BLOCKED_LOCAL_AUDIT', self.fx.plan)

    def test_unsafe_svg_is_blocked_even_with_valid_hash(self):
        self.fx.files[self.fx.intent['infographic']] = b'<svg><script>alert(1)</script></svg>'
        self.fx.resign()
        self.blocked('BLOCKED_FILE_TYPE', self.fx.plan)

    def test_publish_allowlist_cannot_be_bypassed_by_signed_intent(self):
        html = self.fx.files.pop(self.fx.intent['html'])
        self.fx.intent['html'] = 'automation/injected.html'
        self.fx.files[self.fx.intent['html']] = html
        self.fx.files['publish-intent.json'] = approval.canonical(self.fx.intent)
        self.fx.resign()
        self.blocked('BLOCKED_PATH', self.fx.plan)

    def test_conflicting_robots_is_blocked(self):
        name = self.fx.intent['html']
        self.fx.files[name] = self.fx.files[name].replace(b'index, follow', b'index, follow, noindex')
        self.fx.resign()
        self.blocked('BLOCKED_LOCAL_AUDIT', self.fx.plan)

    def test_target_conflict(self):
        path = self.fx.root / self.fx.intent["html"]
        path.parent.mkdir()
        path.write_bytes(b"existing")
        self.blocked("BLOCKED_TARGET_CONFLICT", self.fx.plan)

    def test_duplicate_approval_idempotent(self):
        plan = self.fx.plan()
        approval.apply_plan(self.fx.root, plan)
        before = self.snapshot()
        again = self.fx.plan()
        self.assertEqual("ALREADY_PUBLISHED", again["status"])
        self.assertEqual({}, again["files"])
        self.assertEqual(before, self.snapshot())

    def test_same_slug_different_manifest(self):
        approval.apply_plan(self.fx.root, self.fx.plan())
        reg = json.loads((self.fx.root / approval.REGISTRY).read_bytes())
        reg["items"][0]["manifest_sha256"] = "b" * 64
        (self.fx.root / approval.REGISTRY).write_bytes(approval.canonical(reg))
        self.blocked("BLOCKED_TARGET_CONFLICT", self.fx.plan)

    def test_hold_and_edit_stop_before_artifact_or_publish(self):
        for command, state in (("hold", "HOLD"), ("edit", "EDIT_REQUESTED")):
            with self.subTest(state=state):
                event = copy.deepcopy(self.fx.event)
                event["comment"]["body"] = event["comment"]["body"].replace(" approve ", f" {command} ")
                action, meta = approval.authorize(event)
                self.assertEqual(command, action)
                held = approval.transition(meta, state)
                event["issue"]["body"] = approval.issue_body(event["issue"], held)
                self.blocked(state, lambda: approval.authorize(event))

    def test_legacy_october_07_incomplete(self):
        meta = {**self.fx.meta, "run_id": 37585711991, "artifact_id": 11466139781}
        raw, artifact = self.fx.archive_for({"draft.json": b"{}", "outcome.json": b'{"status":"REVIEW"}'})
        artifact.update(id=11466139781, workflow_run={"id": 37585711991})
        meta["artifact_digest"] = artifact["digest"]
        self.blocked("LEGACY_REVIEW_PACKAGE_INCOMPLETE", lambda: approval.verify_package(raw, meta, artifact))

    def test_plan_is_read_only(self):
        before = self.snapshot()
        plan = self.fx.plan()
        self.assertEqual("APPROVED", plan["status"])
        self.assertEqual(before, self.snapshot())

    def snapshot(self):
        return {str(p.relative_to(self.fx.root)): p.read_bytes() for p in self.fx.root.rglob("*") if p.is_file()}

    def test_exact_file_apply(self):
        plan = self.fx.plan()
        names = approval.apply_plan(self.fx.root, plan)
        for role in ("html", "hero", "infographic"):
            name = self.fx.intent[role]
            self.assertEqual(self.fx.files[name], (self.fx.root / name).read_bytes())
        self.assertEqual(sorted(plan["files"]), names)

    def test_sitemap_and_registry_deterministic(self):
        a, b = self.fx.plan(), self.fx.plan()
        self.assertEqual(a["files"], b["files"])
        self.assertEqual(["https://kfarmai.com/", URL], approval.sitemap_urls(a["files"]["sitemap.xml"]))
        record = json.loads(a["files"][approval.REGISTRY])["items"][0]
        self.assertEqual(self.fx.hash, record["manifest_sha256"])
        self.assertEqual(123, record["source_run_id"])
        self.assertIsNone(record["published_at"])
        self.assertEqual("PENDING", record["post_publish_audit_status"])
        self.assertEqual(approval.digest(self.fx.files[self.fx.intent["html"]]), record["html_sha256"])

    def test_toctou_derived_file_changed(self):
        plan = self.fx.plan()
        (self.fx.root / "sitemap.xml").write_bytes(b"changed after verify")
        self.blocked("BLOCKED_TOCTOU", lambda: approval.apply_plan(self.fx.root, plan))
        self.assertFalse((self.fx.root / self.fx.intent["html"]).exists())

    def test_toctou_target_created(self):
        plan = self.fx.plan()
        path = self.fx.root / self.fx.intent["html"]
        path.parent.mkdir()
        path.write_bytes(b"racing writer")
        self.blocked("BLOCKED_TOCTOU", lambda: approval.apply_plan(self.fx.root, plan))

    def test_filesystem_hardlink_is_rejected(self):
        path = self.fx.root / "sitemap.xml"
        os.link(path, self.fx.root / "linked.xml")
        self.blocked("BLOCKED_FILE_TYPE", self.fx.plan)

    def test_exact_stage_disposable_git_no_commit(self):
        subprocess.run(["git", "init", "-q", str(self.fx.root)], check=True)
        plan = self.fx.plan()
        approval.apply_plan(self.fx.root, plan)
        names = approval.simulate_exact_stage(self.fx.root, plan)
        self.assertEqual(sorted(plan["files"]), names)
        self.assertNotEqual(0, subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=self.fx.root, capture_output=True).returncode)

    def test_stage_detects_changed_immutable_bytes(self):
        subprocess.run(["git", "init", "-q", str(self.fx.root)], check=True)
        plan = self.fx.plan()
        approval.apply_plan(self.fx.root, plan)
        (self.fx.root / self.fx.intent["hero"]).write_bytes(b"tamper")
        self.blocked("BLOCKED_TOCTOU", lambda: approval.simulate_exact_stage(self.fx.root, plan))

    def test_production_verification_and_audit_pass(self):
        plan = self.fx.plan()
        approval.apply_plan(self.fx.root, plan)
        result = approval.verify_production(self.fx.root, plan["record"], self.fx.fetch)
        self.assertTrue(result["production_verified"])
        self.assertEqual("PASS", result["audit"]["status"])
        state = {**self.fx.meta, "state": "PUBLISHED_PENDING_VERIFY"}
        states = approval.verification_states(state, result, commit_sha="b" * 40, published_at="2026-10-09T01:00:00Z", record=plan["record"])
        self.assertEqual(["PUBLISHED"], [s["state"] for s in states])
        for key in ("approval_id", "manifest_sha256", "commit_sha", "title", "production_url", "production_verified", "audit_status", "published_at"):
            self.assertIn(key, states[-1])

    def test_audit_review_required_no_rollback(self):
        plan = self.fx.plan()
        approval.apply_plan(self.fx.root, plan)
        before = self.snapshot()
        def fetch(url, **kwargs):
            if url in SOURCES:
                raise TimeoutError("fixture")
            return self.fx.fetch(url, **kwargs)
        result = approval.verify_production(self.fx.root, plan["record"], fetch)
        self.assertTrue(result["production_verified"])
        self.assertEqual("REVIEW_REQUIRED", result["audit"]["status"])
        states = approval.verification_states({**self.fx.meta, "state": "PUBLISHED_PENDING_VERIFY"}, result,
                                              commit_sha="b" * 40, published_at="2026-10-09T01:00:00Z", record=plan["record"])
        self.assertEqual("REVIEW_REQUIRED", states[-1]["state"])
        self.assertEqual(before, self.snapshot())

    def test_production_timeout_requires_review(self):
        plan = self.fx.plan()
        approval.apply_plan(self.fx.root, plan)
        def timeout(*args, **kwargs):
            raise TimeoutError("fixture")
        result = approval.verify_production(self.fx.root, plan["record"], timeout)
        self.assertFalse(result["production_verified"])
        states = approval.verification_states({**self.fx.meta, "state": "PUBLISHED_PENDING_VERIFY"}, result,
                                              commit_sha="b" * 40, published_at="2026-10-09T01:00:00Z", record=plan["record"])
        self.assertEqual(["REVIEW_REQUIRED"], [s["state"] for s in states])

    def test_no_ai_or_image_generation_in_approval(self):
        sources = [(ROOT / path).read_text(encoding="utf-8") for path in (
            "automation/kfarmai_review_approval.py", "automation/review_approval_workflow.py", ".github/workflows/kfarmai-review-approval.yml")]
        for source in sources:
            for forbidden in ("OPENAI_API_KEY", "KFARMAI_MODEL_", "/responses", "images/generations", "web_search", "render_html", "render_svg", "model_router", "git add .", "git add -A"):
                self.assertNotIn(forbidden, source)

    def test_live_adapter_disabled_by_default(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, "argv", ["runner"]):
            self.blocked("BLOCKED_LIVE_EXECUTION_DISABLED", workflow.main)

    def test_live_adapter_execute_still_requires_all_activation_guards(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(sys, "argv", ["runner", "--execute"]):
            self.blocked("BLOCKED_LIVE_EXECUTION_DISABLED", workflow.main)

    def test_pages_receipt_binds_exact_successful_push_run(self):
        client = FakeGitHub(self.fx)
        receipt = workflow.wait_for_pages(client, "b" * 40, attempts=1, delay=0)
        self.assertEqual({"run_id": 8001, "head_sha": "b" * 40,
                          "conclusion": "success"}, receipt)
        client.pages_conclusion = "failure"
        self.blocked("BLOCKED_PAGES_DEPLOY", lambda: workflow.wait_for_pages(
            client, "b" * 40, attempts=1, delay=0))

    def test_state_cannot_skip_integrity_or_verification(self):
        self.blocked("BLOCKED_STATE_TRANSITION", lambda: approval.transition(self.fx.meta, "PUBLISHED"))
        self.blocked("BLOCKED_RECEIPT", lambda: approval.transition({**self.fx.meta, "state": "PUBLISHED_PENDING_VERIFY"}, "PUBLISHED"))

    def test_sitemap_semantics_reject_invalid_duplicate_private(self):
        for data in (b"broken", f'<urlset xmlns="{approval.NS}"><url><loc>https://kfarmai.com/preview/x</loc></url></urlset>'.encode(),
                     f'<urlset xmlns="{approval.NS}"><url><loc>https://kfarmai.com/</loc></url><url><loc>https://kfarmai.com/</loc></url></urlset>'.encode()):
            self.blocked("BLOCKED_SITEMAP", lambda: approval.sitemap_urls(data))

    def test_full_workflow_fixture_states_and_exact_artifact(self):
        client = FakeGitHub(self.fx)
        git_calls = []
        def git(args, **kwargs):
            git_calls.append(args)
            if args[1:3] == ["status", "--porcelain"]:
                return b""
            if args[1] == "ls-remote":
                return (("b" if any("commit" in x for x in git_calls) else "a") * 40 + "\trefs/heads/main").encode()
            if args[1:3] == ["rev-parse", "HEAD"]:
                return (("b" if any("commit" in x for x in git_calls) else "a") * 40).encode()
            return b""
        with patch.object(workflow.subprocess, "check_output", side_effect=git), \
             patch.object(workflow.subprocess, "run", return_value=subprocess.CompletedProcess([], 0)), \
             patch.object(workflow, "exact_stage", return_value=[]), \
             patch.object(workflow, "_default_fetch", side_effect=self.fx.fetch):
            result = workflow.run(self.fx.event, self.fx.root, client)
        self.assertEqual(["REVIEW", "APPROVED_VERIFYING", "APPROVED", "PUBLISHED_PENDING_VERIFY", "PUBLISHED"], result["states"])
        self.assertEqual("PUBLISHED", result["status"])
        self.assertEqual([456], client.downloads)
        self.assertEqual("PUBLISHED", approval.metadata(client.issue)["state"])
        self.assertEqual(2, len([x for x in git_calls if "commit" in x]))
        self.assertEqual(2, len([x for x in git_calls if "push" in x]))
        self.assertFalse(any("reset" in x or "revert" in x for x in git_calls))

    def test_workflow_hold_and_edit_do_not_download_or_call_git(self):
        for command, state in (("hold", "HOLD"), ("edit", "EDIT_REQUESTED")):
            event = copy.deepcopy(self.fx.event)
            event["comment"]["body"] = event["comment"]["body"].replace(" approve ", f" {command} ")
            client = FakeGitHub(self.fx)
            with patch.object(workflow.subprocess, "check_output", side_effect=AssertionError("git not allowed")):
                result = workflow.run(event, self.fx.root, client)
            self.assertEqual(state, result["status"])
            self.assertEqual([], client.downloads)

    def test_workflow_hash_mismatch_never_commits(self):
        client = FakeGitHub(self.fx)
        client.raw += b"tampered"
        calls = []
        def git(args, **kwargs):
            calls.append(args)
            if args[1] == "status":
                return b""
            if args[1] == "ls-remote":
                return (("b" if any("commit" in x for x in calls) else "a") * 40 + "\trefs/heads/main").encode()
            return ("a" * 40).encode()
        with patch.object(workflow.subprocess, "check_output", side_effect=git):
            self.blocked("BLOCKED_HASH_MISMATCH", lambda: workflow.run(self.fx.event, self.fx.root, client))
        self.assertFalse(any("commit" in x or "push" in x for x in calls))
        self.assertFalse((self.fx.root / self.fx.intent["html"]).exists())


class FakeGitHub:
    """In-memory API simulation. Never sends an Issue mutation or dispatch."""
    def __init__(self, fx):
        self.fx = fx
        self.issue = copy.deepcopy(fx.issue)
        self.raw = fx.raw
        self.downloads = []
        self.calls = []
        self.pages_conclusion = "success"

    def current(self, number):
        return copy.deepcopy(self.issue)

    def command_current(self, event):
        pass

    def archive(self, artifact_id):
        self.downloads.append(artifact_id)
        return self.raw

    def request(self, endpoint, *, method="GET", payload=None):
        self.calls.append((endpoint, method, payload))
        if endpoint == "issues/42" and method == "PATCH":
            self.issue["body"] = payload["body"]
            return self.issue
        if endpoint == "actions/artifacts/456":
            return copy.deepcopy(self.fx.artifact)
        if endpoint == "actions/runs/123":
            return {"repository": {"full_name": approval.REPOSITORY}, "head_repository": {"full_name": approval.REPOSITORY},
                    "path": ".github/workflows/kfarmai-daily-autopublish.yml", "head_branch": "main", "conclusion": "success", "head_sha": "a" * 40}
        if endpoint.startswith("actions/workflows/pages.yml/runs?"):
            head = endpoint.split("head_sha=", 1)[1].split("&", 1)[0]
            return {"workflow_runs": [{"id": 8001, "head_sha": head, "event": "push",
                                       "path": workflow.PAGES_WORKFLOW_PATH,
                                       "status": "completed", "conclusion": self.pages_conclusion}]}
        if endpoint == "issues/42/comments":
            return None
        raise AssertionError(endpoint)


if __name__ == "__main__":
    unittest.main()
