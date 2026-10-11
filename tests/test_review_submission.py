import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from approval_package import archive_bytes  # noqa: E402
from kfarmai_review_approval import Blocked, digest  # noqa: E402
from review_submission import (  # noqa: E402
    PREVIEW_MANIFEST_SHA256, SOURCE_ID, SUBMISSION_ARTIFACT_NAME,
    build_submission, create_issue_payload, load_package, load_source,
    recover_issue_payload,
)


SOURCE = ROOT / "automation/review-submissions" / SOURCE_ID


class ReviewSubmissionTests(unittest.TestCase):
    def temp_source(self):
        temp = tempfile.TemporaryDirectory(prefix="kfarmai-review-source-")
        self.addCleanup(temp.cleanup)
        target = Path(temp.name) / SOURCE_ID
        shutil.copytree(SOURCE, target)
        return target

    def build(self, run_id=456, head="a" * 40):
        temp = tempfile.TemporaryDirectory(prefix="kfarmai-review-build-")
        self.addCleanup(temp.cleanup)
        out = Path(temp.name) / "package"
        result = build_submission(SOURCE, out, run_id=run_id, head_sha=head)
        return out, result

    def artifact(self, package, run_id=456, head="a" * 40, artifact_id=789):
        raw = archive_bytes(package)
        artifact = {
            "id": artifact_id, "name": SUBMISSION_ARTIFACT_NAME,
            "expired": False, "expires_at": "2099-01-01T00:00:00Z",
            "digest": "sha256:" + digest(raw),
            "workflow_run": {"id": run_id, "head_sha": head},
        }
        outputs = {
            "artifact-id": str(artifact_id), "artifact-digest": digest(raw),
            "artifact-url": f"https://github.com/dgilink/kfarmai/actions/runs/{run_id}/artifacts/{artifact_id}",
        }
        return raw, artifact, outputs

    def test_source_is_exact_preview_content(self):
        descriptor, files = load_source(SOURCE)
        self.assertEqual(PREVIEW_MANIFEST_SHA256, descriptor["preview_manifest_sha256"])
        self.assertEqual(5, len(files))
        self.assertEqual("2c67ec8d4c65cd25433511484280367b4e25d4aaf0bb4b23c4b838354c4b3afd",
                         descriptor["files"]["article.json"])

    def test_run_identity_rebinds_metadata_but_not_publish_bytes(self):
        out, result = self.build(run_id=456, head="b" * 40)
        package = load_package(out)
        self.assertNotEqual(result["preview_approval_id"], result["approval_id"])
        self.assertEqual(456, package["manifest"]["source_run_id"])
        self.assertEqual("b" * 40, package["manifest"]["source_head_sha"])
        _, source_files = load_source(SOURCE)
        for name in package["manifest"]["immutable_files"]:
            path = name["path"]
            self.assertEqual(source_files[path], package["files"][path])

    def test_real_artifact_contract_renders_full_human_review(self):
        out, _ = self.build()
        package = load_package(out)
        raw, artifact, outputs = self.artifact(package)
        issue = create_issue_payload(out, artifact, raw, outputs)
        for value in ("전체 본문 검수", "공공자료에서 확인한 내용", "KFarmAI 정리 참고정보",
                      "Hero 검수 경로", "Infographic 검수 경로", "농촌진흥청", "농사로",
                      "/kfarmai approve", "/kfarmai edit", "/kfarmai hold"):
            self.assertIn(value, issue["body"])
        self.assertIn("kfarmai-review-content-sha256", issue["body"])

    def test_crash_after_upload_recovers_same_artifact_without_rebuild(self):
        out, result = self.build(run_id=456, head="c" * 40)
        package = load_package(out)
        raw, artifact, _ = self.artifact(package, run_id=456, head="c" * 40)
        recovered = recover_issue_payload(SOURCE, artifact, raw)
        self.assertIn(result["approval_id"], recovered["body"])
        self.assertEqual(artifact["id"], recovered["metadata"]["artifact_id"])
        self.assertEqual(SUBMISSION_ARTIFACT_NAME,
                         recovered["metadata"]["artifact_name"])

    def test_recovery_rejects_other_content_and_other_artifact_name(self):
        out, _ = self.build()
        package = load_package(out)
        raw, artifact, _ = self.artifact(package)
        wrong = dict(artifact, name="review-other")
        with self.assertRaisesRegex(Blocked, "BLOCKED_ARTIFACT_IDENTITY"):
            recover_issue_payload(SOURCE, wrong, raw)
        changed = bytearray(raw); changed[-1] ^= 1
        with self.assertRaises(Blocked):
            recover_issue_payload(SOURCE, artifact, bytes(changed))

    def test_source_tamper_and_extra_file_fail_closed(self):
        for mutation, code in (("tamper", "BLOCKED_SOURCE_HASH"),
                               ("extra", "BLOCKED_SOURCE_FILES")):
            with self.subTest(mutation=mutation):
                source = self.temp_source()
                if mutation == "tamper":
                    (source / "article.json").write_bytes((source / "article.json").read_bytes() + b" ")
                else:
                    (source / ".secret").write_text("no", encoding="utf-8")
                with self.assertRaisesRegex(Blocked, code):
                    load_source(source)

    def test_source_descriptor_tamper_is_blocked(self):
        source = self.temp_source()
        descriptor_path = source / "source.json"
        descriptor = json.loads(descriptor_path.read_text(encoding="utf-8"))
        descriptor["review_reason"] = "변조된 검수 사유"
        descriptor_path.write_text(
            json.dumps(descriptor, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        with self.assertRaisesRegex(Blocked, "BLOCKED_SOURCE_DESCRIPTOR_HASH"):
            load_source(source)

    def test_wrong_upload_digest_run_or_download_bytes_fail(self):
        out, _ = self.build()
        package = load_package(out)
        raw, artifact, outputs = self.artifact(package)
        cases = [
            (artifact, {**outputs, "artifact-digest": "0" * 64}, raw),
            ({**artifact, "workflow_run": {"id": 999, "head_sha": "a" * 40}}, outputs, raw),
            (artifact, outputs, raw + b"tamper"),
        ]
        for changed_artifact, changed_outputs, changed_raw in cases:
            with self.subTest(), self.assertRaises(Blocked):
                create_issue_payload(out, changed_artifact, changed_raw, changed_outputs)

    def test_invalid_run_and_head_are_rejected(self):
        for run_id, head in ((0, "a" * 40), (1, "A" * 40), (1, "a" * 39)):
            temp = tempfile.TemporaryDirectory(prefix="kfarmai-review-invalid-")
            self.addCleanup(temp.cleanup)
            with self.subTest(run_id=run_id, head=head), self.assertRaises(Blocked):
                build_submission(SOURCE, Path(temp.name) / "package", run_id=run_id, head_sha=head)


if __name__ == "__main__":
    unittest.main()
