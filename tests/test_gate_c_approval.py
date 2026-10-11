"""Integration-20 Gate C approval-only fixtures; no network or repository writes."""
import copy
import datetime as dt
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import io
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

import approval_package
import gate_c_approval as gate
import gate_c_approval_workflow as live
import kfarmai_review_approval as core
from test_kfarmai_post_publish_audit import page_html, TITLE, SLUG, SOURCES


class GateCFixture:
    def __init__(self, *, revision=1, package_kind="REVIEW", run_id=820001):
        self.owner = {"login": "dgilink", "id": 999}
        self.article = {
            "slug": SLUG, "title": TITLE,
            "category": "식물병", "summary": "공공정보와 현장 기록을 함께 확인합니다.",
            "risk": "REVIEW", "safety_note": "AI 참고 진단이며 최종 처방이 아닙니다.",
            "sources": [{"title": "공식자료", "url": url} for url in SOURCES],
        }
        self.package = approval_package.prepare_package(
            article=self.article, review_reason="사람의 출처·안전성 검토 필요",
            source_check={"status": "PASS", "urls": SOURCES},
            html_bytes=page_html(), hero_bytes=b"RIFF" + bytes(4) + b"WEBPfixture",
            svg_bytes=b'<svg xmlns="http://www.w3.org/2000/svg"><text>fixture</text></svg>',
            date="2026-10-10", run_id=run_id, head_sha="a" * 40,
            revision=revision, generated_at="2026-10-10T18:00:00+09:00",
            package_kind=package_kind,
        )
        self.raw = approval_package.archive_bytes(self.package)
        self.artifact = {
            "id": 910001 + revision, "name": "review-" + self.package["manifest"]["approval_id"],
            "expired": False, "expires_at": "2099-01-01T00:00:00Z",
            "digest": "sha256:" + core.digest(self.raw),
            "workflow_run": {"id": run_id, "head_sha": "a" * 40},
        }
        rendered = approval_package.render_issue(self.package, self.artifact, uploaded_raw=self.raw)
        self.issue = {"number": 82 + revision, "state": "open", "user": self.owner, **rendered}
        self.meta = core.metadata(self.issue)
        self.event = {
            "action": "created", "repository": {"full_name": core.REPOSITORY, "owner": self.owner},
            "issue": copy.deepcopy(self.issue), "sender": self.owner,
            "comment": {"id": 700 + revision, "user": self.owner,
                        "created_at": "2026-10-10T18:01:00+09:00",
                        "body": f"/kfarmai approve {self.meta['approval_id']} {self.meta['manifest_sha256']}"},
        }
        self.permission = {"permission": "admin", "user": self.owner}

    def bind(self):
        return gate.bind_review(self.issue, self.artifact, self.raw)

    def authorize(self, permission=None):
        return gate.authorize_action(self.event, self.issue,
                                     actor_permission=self.permission if permission is None else permission)


class GateCApprovalTests(unittest.TestCase):
    def setUp(self):
        self.fx = GateCFixture()

    def blocked(self, code, fn):
        with self.assertRaisesRegex(core.Blocked, "^" + code + "$"):
            fn()

    def decision(self, fx=None):
        fx = fx or self.fx
        record = fx.bind()
        action, meta = fx.authorize()
        return gate.decide(record, action, meta, command_id=fx.event["comment"]["id"],
                           decided_at="2026-10-10T18:01:00+09:00")

    def test_01_normal_review_package_stops_at_publish_candidate(self):
        states = self.decision()
        self.assertEqual([gate.APPROVED, gate.PUBLISH_CANDIDATE], [x["state"] for x in states])
        self.assertFalse(states[-1]["auto_publish"])
        self.assertEqual((0, 0), (states[-1]["ai_regeneration_count"], states[-1]["image_regeneration_count"]))

    def test_02_authorized_account_requires_api_permission_identity(self):
        self.assertEqual("approve", self.fx.authorize()[0])
        self.blocked("BLOCKED_PERMISSION", lambda: self.fx.authorize(
            {"permission": "read", "user": self.fx.owner}))

    def test_03_unauthorized_account_is_rejected(self):
        self.blocked("BLOCKED_PERMISSION_IDENTITY", lambda: self.fx.authorize(
            {"permission": "admin", "user": {"login": "other", "id": 10}}))

    def test_04_forged_comment_cannot_grant_authority(self):
        self.fx.event["comment"]["user"] = {"login": "other", "id": 10}
        self.blocked("BLOCKED_COMMENTER", lambda: self.fx.authorize())

    def test_05_duplicate_approval_is_idempotent_by_comment_id(self):
        record = self.fx.bind(); action, meta = self.fx.authorize()
        registry = gate.DecisionRegistry(); registry.add(record)
        first = registry.apply(record, action, meta, command_id=701, decided_at="now")
        second = registry.apply(record, action, meta, command_id=701, decided_at="now")
        self.assertEqual(first, second)
        self.blocked("BLOCKED_DUPLICATE_DECISION", lambda: gate.decide(
            first[-1], action, meta, command_id=702, decided_at="later"))

    def test_06_revision_request_is_terminal_for_old_package(self):
        self.fx.event["comment"]["body"] = self.fx.event["comment"]["body"].replace(" approve ", " edit ")
        action, meta = self.fx.authorize(); record = self.fx.bind()
        old = gate.decide(record, action, meta, command_id=701, decided_at="now")[-1]
        self.assertEqual(gate.REVISION_REQUESTED, old["state"])
        replacement = GateCFixture(revision=2)
        self.assertNotEqual(record["approval_id"], replacement.bind()["approval_id"])
        self.assertNotEqual(record["manifest_sha256"], replacement.bind()["manifest_sha256"])
        self.blocked("BLOCKED_DUPLICATE_DECISION", lambda: gate.decide(
            old, "approve", meta, command_id=702, decided_at="later"))

    def test_07_hold_blocks_approval(self):
        self.fx.event["comment"]["body"] = self.fx.event["comment"]["body"].replace(" approve ", " hold ")
        action, meta = self.fx.authorize(); held = gate.decide(
            self.fx.bind(), action, meta, command_id=701, decided_at="now")[-1]
        self.assertEqual(gate.HOLD, held["state"])
        self.blocked("BLOCKED_DUPLICATE_DECISION", lambda: gate.decide(
            held, "approve", meta, command_id=702, decided_at="later"))

    def test_08_expired_artifact_blocks_binding(self):
        self.fx.artifact["expired"] = True
        self.blocked("BLOCKED_ARTIFACT_EXPIRED", self.fx.bind)

    def test_09_sha_mismatch_blocks_binding(self):
        self.fx.raw += b"tamper"
        self.blocked("BLOCKED_HASH_MISMATCH", self.fx.bind)

    def test_10_issue_identity_mismatch_blocks_decision(self):
        record = self.fx.bind(); action, meta = self.fx.authorize(); meta = {**meta, "artifact_id": 99}
        self.blocked("BLOCKED_ISSUE_BINDING", lambda: gate.decide(
            record, action, meta, command_id=701, decided_at="now"))

    def test_11_different_run_artifact_is_rejected(self):
        self.fx.artifact["workflow_run"] = {"id": 999, "head_sha": "a" * 40}
        self.blocked("BLOCKED_ARTIFACT_IDENTITY", self.fx.bind)

    def test_12_test_package_cannot_be_promoted(self):
        fixture = GateCFixture(package_kind="TEST_CANARY")
        self.assertEqual("TEST_CANARY", fixture.bind()["package_kind"])
        self.blocked("BLOCKED_TEST_PACKAGE", lambda: self.decision(fixture))

    def test_13_exact_candidate_plan_has_only_manifest_paths(self):
        with tempfile.TemporaryDirectory(prefix="gate-c-plan-") as temp:
            root = Path(temp); (root / "automation").mkdir()
            (root / "automation/config.json").write_bytes((ROOT / "automation/config.json").read_bytes())
            (root / core.REGISTRY).write_bytes(b'{"items":[]}\n')
            (root / "sitemap.xml").write_text(
                f'<urlset xmlns="{core.NS}"><url><loc>https://kfarmai.com/</loc></url></urlset>', encoding="utf-8")
            plan = gate.exact_candidate_plan(root, self.fx.raw, self.fx.issue, self.fx.artifact)
            self.assertEqual(sorted(self.fx.package["manifest"]["expected_publish_files"]), sorted(plan["files"]))
            self.assertFalse(any(path.exists() for path in (root / name for name in plan["files"] if name.startswith("kb/"))))
            core.apply_plan(root, plan)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "config", "core.autocrlf", "false"], cwd=root, check=True)
            (root / "unrelated.txt").write_text("preserve", encoding="utf-8")
            self.assertEqual(sorted(plan["files"]), core.exact_stage(root, plan))
            staged = subprocess.check_output(["git", "diff", "--cached", "--name-only"], cwd=root, text=True).splitlines()
            self.assertNotIn("unrelated.txt", staged)

    def test_14_registry_replay_conflict_is_blocked(self):
        record = self.fx.bind(); registry = gate.DecisionRegistry(); registry.add(record)
        action, meta = self.fx.authorize(); registry.apply(record, action, meta, command_id=701, decided_at="now")
        self.blocked("BLOCKED_COMMAND_REPLAY", lambda: registry.apply(
            record, "hold", meta, command_id=701, decided_at="now"))

    def test_15_approval_never_regenerates_ai_or_images(self):
        states = self.decision()
        self.assertEqual(0, states[-1]["ai_regeneration_count"])
        self.assertEqual(0, states[-1]["image_regeneration_count"])

    def test_16_crash_after_approved_resumes_without_new_decision(self):
        approved = self.decision()[0]
        resumed = gate.resume_approved(approved)
        self.assertEqual(gate.PUBLISH_CANDIDATE, resumed["state"])
        self.assertEqual(approved["decision_command_id"], resumed["decision_command_id"])

    def test_17_post_publish_audit_failure_is_not_completion(self):
        published = gate.record_gate_d_publish(
            self.decision()[-1], commit_sha="b" * 40,
            published_at="2026-10-10T20:00:00+09:00",
            production_url="https://kfarmai.com/kb/smartfarm-flowmeter-check.html")
        failed = gate.post_publish_state(published, audit_status="REVIEW_REQUIRED")
        self.assertEqual(gate.AUDIT_FAILED, failed["state"])

    def test_18_partial_success_cannot_claim_published(self):
        candidate = self.decision()[-1]
        self.blocked("BLOCKED_STATE_TRANSITION", lambda: gate.post_publish_state(
            candidate, audit_status="PASS"))
        self.blocked("BLOCKED_PUBLISH_RECEIPT", lambda: gate.record_gate_d_publish(
            candidate, commit_sha="bad", published_at="", production_url=""))

    def test_issue_has_human_review_fields_and_timestamp(self):
        for label in ("제목:", "핵심 내용:", "REVIEW 사유:", "위험도:", "공식 출처:",
                      "AI 생성 참고정보", "생성 시각:", "Artifact identity:", "Manifest SHA:",
                      "승인 / 수정 / 보류"):
            self.assertIn(label, self.fx.issue["body"])

    def test_live_adapter_writes_one_idempotent_receipt_and_never_publishes(self):
        class FakeClient:
            def __init__(self, fx):
                self.fx = fx; self.comments = [fx.event["comment"]]; self.writes = 0
                self.lose_once = False
            def archive(self, artifact_id):
                self.assert_id = artifact_id; return self.fx.raw
            def request(self, endpoint, method="GET", payload=None):
                if endpoint == f"issues/{self.fx.issue['number']}": return self.fx.issue
                if endpoint.startswith("collaborators/"): return self.fx.permission
                if endpoint.startswith("issues/comments/"): return self.fx.event["comment"]
                if endpoint.startswith("actions/artifacts/"): return self.fx.artifact
                if endpoint.startswith("actions/runs/"):
                    return {"repository": {"full_name": core.REPOSITORY},
                            "head_repository": {"full_name": core.REPOSITORY},
                            "conclusion": "success", "head_sha": "a" * 40,
                            "path": ".github/workflows/kfarmai-daily-autopublish.yml"}
                if "/comments?per_page=100&page=" in endpoint:
                    page = int(endpoint.rsplit("=", 1)[1])
                    return self.comments if page == 1 else []
                if endpoint.endswith("/comments") and method == "POST":
                    self.writes += 1
                    made = {"body": payload["body"],
                            "user": {"login": "github-actions[bot]", "id": 41898282}}
                    self.comments.append(made)
                    if self.lose_once:
                        self.lose_once = False
                        raise core.Blocked("BLOCKED_GITHUB_REQUEST")
                    return made
                raise AssertionError((endpoint, method))
        client = FakeClient(self.fx)
        first = live.run(self.fx.event, client)
        second = live.run(self.fx.event, client)
        self.assertEqual(("PUBLISH_CANDIDATE", "RECONCILED"), (first["status"], second["status"]))
        self.assertEqual(1, client.writes)
        self.assertFalse(first["receipt"]["auto_publish"])
        lost = FakeClient(self.fx); lost.lose_once = True
        recovered = live.run(self.fx.event, lost)
        self.assertEqual(("RECONCILED", 1), (recovered["status"], lost.writes))

    def test_fake_receipt_text_from_human_is_rejected(self):
        receipt = {"decision_command_id": 701}
        comments = [{"body": live.RECEIPT_PREFIX + core.canonical(receipt).decode() + live.RECEIPT_SUFFIX,
                     "user": self.fx.owner}]
        self.blocked("BLOCKED_RECEIPT_AUTHOR", lambda: live._receipts(comments, 701))

    def test_verified_integration19_artifact_is_test_only(self):
        fixture = ROOT / "automation/gate-c-artifact-fixture"
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(fixture.rglob("*")):
                if path.is_file(): archive.write(path, path.relative_to(fixture).as_posix())
        raw = out.getvalue()
        meta = {"repository": core.REPOSITORY, "approval_id": "review-915001-r1-10b198ee467b",
                "manifest_sha256": "87ab0c8eec36818ec236506fde351f0d7f7b32979e47c6c1d4bef27f575e1633",
                "run_id": 38055669124, "artifact_id": 11672110118,
                "artifact_name": "kfarmai-gate-c-review-fixture-87ab0c8e", "state": "REVIEW",
                "artifact_digest": "sha256:" + core.digest(raw)}
        issue = {"number": 83, "state": "open", "title": "[KFarmAI Daily][REVIEW] TEST/CANARY",
                 "user": self.fx.owner,
                 "body": "TEST/CANARY — 실제 게시 금지\n<!-- kfarmai-review\n" + core.canonical(meta).decode() + "\n-->"}
        artifact = {"id": meta["artifact_id"], "name": meta["artifact_name"], "expired": False,
                    "expires_at": "2099-01-01T00:00:00Z", "digest": meta["artifact_digest"],
                    "workflow_run": {"id": meta["run_id"], "head_sha": "a" * 40}}
        record = gate.bind_review(issue, artifact, raw)
        self.assertEqual("TEST_CANARY", record["package_kind"])
        self.assertFalse(record["publish_intent"])


if __name__ == "__main__":
    unittest.main()
