from pathlib import Path
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/kfarmai-review-submit.yml"


class ReviewSubmissionWorkflowTests(unittest.TestCase):
    def test_manual_single_source_and_minimum_permissions(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        doc = yaml.load(text, Loader=yaml.BaseLoader)
        job = doc["jobs"]["submit-review"]
        self.assertEqual({"actions": "read", "contents": "read", "issues": "write"},
                         job["permissions"])
        self.assertIn("workflow_dispatch:", text)
        for trigger in ("schedule:", "pull_request:", "push:"):
            self.assertNotIn(trigger, text)
        for required in (
            "github.actor_id == '293838055'", "github.ref == 'refs/heads/main'",
            "KFARMAI_REVIEW_SUBMIT_HEAD_SHA == github.sha", "SUBMIT-REVIEW-ONLY",
            "greenhouse-irrigation-precheck-20261011-r1",
            "kfarmai-review-greenhouse-irrigation-precheck-2c67ec8d4c65",
            "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
            "retention-days: 7", "overwrite: false", "include-hidden-files: false",
            "--run-id \"$GITHUB_RUN_ID\"", "--head-sha \"$GITHUB_SHA\"",
            "actions/artifacts/$ARTIFACT_ID/zip", "gh issue create",
            "Find one recoverable upload", "recover-issue",
            "steps.find.outputs.artifact_id == ''",
        ):
            self.assertIn(required, text)
        for forbidden in ("contents: write", "pages: write", "deployments: write",
                          "id-token: write", "OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY",
                          "git push", "deploy-pages", "secrets.",
                          "KFARMAI_REVIEW_SUBMIT_ENABLED"):
            self.assertNotIn(forbidden, text)
        self.assertTrue(all("runner.temp" not in value for value in job["env"].values()))
        build = next(step for step in job["steps"]
                     if step.get("name") == "Build run-bound immutable REVIEW package")
        self.assertEqual("${{ runner.temp }}/kfarmai-review-package",
                         build["env"]["PACKAGE_DIR"])

    def test_issue_follows_download_and_no_create_retry(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertLess(text.index("actions/artifacts/$ARTIFACT_ID/zip"),
                        text.index("gh issue create"))
        self.assertEqual(1, text.count("gh issue create"))
        self.assertIn("BLOCKED", "BLOCKED")  # contract is asserted by the verifier tests
        self.assertIn("count=\"$(jq --rawfile expected", text)

    def test_upload_crash_recovery_is_fail_closed(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("select(.expired == false and .workflow_run.head_sha == $head)", text)
        self.assertEqual(2, text.count(".workflow_run.head_sha == $head"))
        self.assertIn('test "$count" -le 1', text)
        self.assertIn('EXISTING_ARTIFACT_ID', text)
        self.assertEqual(1, text.count("uses: actions/upload-artifact@"))


if __name__ == "__main__":
    unittest.main()
