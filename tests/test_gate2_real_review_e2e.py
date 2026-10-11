from pathlib import Path
import tempfile
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from approval_package import archive_bytes  # noqa: E402
import gate_c_approval as gate_c  # noqa: E402
import gate_d_publish as gate_d  # noqa: E402
from kfarmai_post_publish_audit import FetchResult  # noqa: E402
from kfarmai_review_approval import REGISTRY, NS, digest  # noqa: E402
from review_submission import (  # noqa: E402
    SOURCE_ID, SUBMISSION_ARTIFACT_NAME, build_submission, load_package,
    recover_issue_payload,
)

SOURCE = ROOT / "automation/review-submissions" / SOURCE_ID


class Gate2RealReviewE2E(unittest.TestCase):
    def test_real_fixed_content_reaches_published_only_after_mock_audit(self):
        with tempfile.TemporaryDirectory(prefix="kfarmai-gate2-real-") as td:
            work = Path(td)
            package_dir = work / "package"
            build_submission(SOURCE, package_dir, run_id=881001, head_sha="a" * 40)
            package = load_package(package_dir)
            raw = archive_bytes(package)
            artifact = {
                "id": 991001, "name": SUBMISSION_ARTIFACT_NAME,
                "expired": False, "expires_at": "2099-01-01T00:00:00Z",
                "digest": "sha256:" + digest(raw),
                "workflow_run": {"id": 881001, "head_sha": "a" * 40},
            }
            rendered = recover_issue_payload(SOURCE, artifact, raw)
            issue = {"number": 501, "state": "open",
                     "user": {"login": "github-actions[bot]", "id": 41898282},
                     **rendered}
            owner = {"login": "dgilink", "id": 293838055}
            event = {
                "action": "created",
                "repository": {"full_name": "dgilink/kfarmai", "owner": owner},
                "issue": issue, "sender": owner,
                "comment": {"id": 601, "user": owner,
                            "created_at": "2026-10-11T12:00:00+09:00",
                            "body": (f"/kfarmai approve {rendered['metadata']['approval_id']} "
                                     f"{rendered['metadata']['manifest_sha256']}")},
            }
            record = gate_c.bind_review(issue, artifact, raw)
            action, meta = gate_c.authorize_action(
                event, issue,
                actor_permission={"permission": "admin", "user": owner},
            )
            candidate = gate_c.decide(
                record, action, meta, command_id=601,
                decided_at="2026-10-11T12:00:00+09:00")[-1]

            root = work / "site"
            (root / "automation").mkdir(parents=True)
            (root / "automation/config.json").write_bytes(
                (ROOT / "automation/config.json").read_bytes())
            (root / REGISTRY).write_bytes(b'{"items":[]}\n')
            (root / "sitemap.xml").write_text(
                f'<urlset xmlns="{NS}"><url><loc>https://kfarmai.com/</loc></url></urlset>',
                encoding="utf-8")
            prepared = gate_d.prepare_candidate(root, raw, issue, artifact, candidate)
            staged = gate_d.apply_and_stage(root, prepared)
            self.assertEqual(5, len(staged))
            pending = gate_d.record_deployment(
                prepared, commit_sha="b" * 40, deployment_id=7001,
                deployed_at="2026-10-11T12:05:00+09:00",
                production_url=prepared["plan"]["record"]["url"],
                deployed_head_sha="b" * 40)
            plan = prepared["plan"]
            record_data = plan["record"]
            mapping = {
                record_data["url"]: plan["files"][f"kb/{record_data['slug']}.html"],
                f"https://kfarmai.com/static/kb/{record_data['slug']}-hero.webp":
                    plan["files"][f"static/kb/{record_data['slug']}-hero.webp"],
                f"https://kfarmai.com/static/kb/{record_data['slug']}-infographic.svg":
                    plan["files"][f"static/kb/{record_data['slug']}-infographic.svg"],
                "https://kfarmai.com/sitemap.xml": plan["files"]["sitemap.xml"],
            }

            def fetch(url, *, method="GET", timeout=15):
                if url in record_data["source_urls"]:
                    return FetchResult(200, url, b"official")
                body = mapping.get(url)
                return FetchResult(200 if body is not None else 404, url,
                                   b"" if method == "HEAD" and body is not None else body or b"")

            final = gate_d.finalize_after_audit(
                root, prepared, pending, fetch,
                checked_at="2026-10-11T12:06:00+09:00")
            self.assertEqual(gate_c.PUBLISHED, final["state"])
            self.assertEqual("PASS", final["audit_status"])


if __name__ == "__main__":
    unittest.main()
