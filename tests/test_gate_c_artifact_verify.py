from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))
from gate_c_artifact_verify import (  # noqa: E402
    Blocked,
    EXPECTED_ARCHIVE_SHA256,
    EXPECTED_FILES,
    EXPECTED_MANIFEST_SHA256,
    verify_download,
    verify_fixture,
)


FIXTURE = ROOT / "automation" / "gate-c-artifact-fixture"
WORKFLOW = ROOT / ".github" / "workflows" / "kfarmai-gate-c-artifact-canary.yml"


class GateCArtifactFixtureTests(unittest.TestCase):
    def copy_fixture(self):
        temp = tempfile.TemporaryDirectory(prefix="kfarmai-gate-c-artifact-")
        self.addCleanup(temp.cleanup)
        target = Path(temp.name) / "fixture"
        shutil.copytree(FIXTURE, target)
        return target

    def test_existing_fixture_has_exact_immutable_identity(self):
        result = verify_fixture(FIXTURE)
        self.assertEqual("PASS", result["status"])
        self.assertEqual(EXPECTED_FILES.__len__(), result["file_count"])
        self.assertEqual(EXPECTED_MANIFEST_SHA256, result["manifest_sha256"])
        self.assertEqual(EXPECTED_ARCHIVE_SHA256, result["canonical_archive_sha256"])
        self.assertTrue(result["synthetic"])
        self.assertFalse(result["publish_allowed"])

    def test_byte_tamper_is_rejected(self):
        target = self.copy_fixture()
        path = target / "article.json"
        path.write_bytes(path.read_bytes() + b" ")
        with self.assertRaisesRegex(Blocked, "BLOCKED_ARCHIVE_HASH"):
            verify_fixture(target)

    def test_extra_and_hidden_files_are_rejected(self):
        for name, code in (("extra.txt", "BLOCKED_UNEXPECTED_FILES"),
                           (".secret", "BLOCKED_HIDDEN_FILE")):
            with self.subTest(name=name):
                target = self.copy_fixture()
                (target / name).write_text("no", encoding="utf-8")
                with self.assertRaisesRegex(Blocked, code):
                    verify_fixture(target)

    def test_link_or_reparse_entry_is_rejected(self):
        target = self.copy_fixture()
        import gate_c_artifact_verify as verifier
        original = verifier._is_link_or_reparse

        def mark_article(path):
            return path.name == "article.json" or original(path)

        with mock.patch.object(verifier, "_is_link_or_reparse", side_effect=mark_article):
            with self.assertRaisesRegex(Blocked, "BLOCKED_FILE_TYPE"):
                verify_fixture(target)

    def test_download_zip_round_trip_preserves_all_bytes(self):
        target = self.copy_fixture()
        archive = target.parent / "download.zip"
        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as output:
            for path in sorted(target.rglob("*")):
                if path.is_file():
                    output.write(path, path.relative_to(target).as_posix())
        result = verify_download(archive)
        self.assertEqual(EXPECTED_MANIFEST_SHA256, result["manifest_sha256"])
        self.assertEqual(EXPECTED_ARCHIVE_SHA256, result["canonical_archive_sha256"])

    def test_download_zip_path_traversal_is_rejected(self):
        temp = tempfile.TemporaryDirectory(prefix="kfarmai-gate-c-traversal-")
        self.addCleanup(temp.cleanup)
        archive = Path(temp.name) / "malicious.zip"
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("../outside.txt", b"no")
        with self.assertRaisesRegex(Blocked, "BLOCKED_PATH"):
            verify_download(archive)

    def test_workflow_is_manual_read_only_and_pinned(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("workflow_dispatch:", text)
        for trigger in ("schedule:", "pull_request:", "push:"):
            self.assertNotIn(trigger, text)
        self.assertIn("permissions:\n  contents: read", text)
        self.assertNotIn("contents: write", text)
        self.assertNotIn("issues: write", text)
        self.assertNotIn("pages: write", text)
        self.assertIn("retention-days: 1", text)
        self.assertIn("include-hidden-files: false", text)
        self.assertIn("overwrite: false", text)
        self.assertIn("github.ref_name == 'main'", text)
        self.assertIn("GATE_C_TEST_COMMIT: d0fad706558f33753e041694ce003605114a58c3", text)
        self.assertIn("ref: ${{ env.GATE_C_TEST_COMMIT }}", text)
        self.assertIn("test \"$GATE_C_TEST_COMMIT\" != '0000000000000000000000000000000000000000'", text)
        self.assertIn("test \"$GATE_C_TEST_COMMIT\" = 'd0fad706558f33753e041694ce003605114a58c3'", text)
        self.assertIn("sparse-checkout-cone-mode: false", text)
        self.assertNotIn("secrets.", text)
        self.assertIn("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", text)
        self.assertIn("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02", text)
        self.assertIn("grep -Eq '^[a-f0-9]{64}$'", text)
        for forbidden in ("deploy-pages", "gh issue", "git push", "supabase", "OPENAI_API_KEY"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
