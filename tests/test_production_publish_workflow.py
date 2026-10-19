"""Default lock and protected-environment contract for the live publisher."""
from pathlib import Path
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]


class ProductionPublishWorkflowTests(unittest.TestCase):
    def test_revised_review_artifacts_are_valid_publish_sources(self):
        adapter = (ROOT / "automation" / "review_approval_workflow.py").read_text(encoding="utf-8")
        self.assertIn(
            '".github/workflows/kfarmai-review-content-revision.yml"',
            adapter,
        )

    def test_publish_job_is_scoped_and_environment_fail_closed(self):
        path = ROOT / ".github/workflows/kfarmai-review-publish-production.yml"
        text = path.read_text(encoding="utf-8")
        doc = yaml.load(text, Loader=yaml.BaseLoader)
        job = doc["jobs"]["publish-approved-review"]
        self.assertEqual("kfarmai-production-publish", job["environment"])
        self.assertEqual({"actions": "read", "contents": "write", "issues": "write"},
                         job["permissions"])
        self.assertIn("KFARMAI_REVIEW_PUBLISH_ENABLED == 'true'", job["if"])
        self.assertIn("KFARMAI_REVIEW_PUBLISH_APPROVAL_ID != ''", job["if"])
        self.assertIn("startsWith(github.event.comment.body, '/kfarmai publish ')", job["if"])
        self.assertIn("environments/kfarmai-production-publish", text)
        self.assertIn(".can_admins_bypass == false", text)
        self.assertIn('select(.type == "required_reviewers")', text)
        self.assertIn('length == 0', text)
        self.assertNotIn('.prevent_self_review == true', text)
        self.assertIn('.type == "wait_timer" and .wait_timer == 1', text)
        self.assertIn('.deployment_branch_policy.protected_branches == false', text)
        self.assertIn('.deployment_branch_policy.custom_branch_policies == true', text)
        self.assertIn('deployment-branch-policies', text)
        self.assertIn('.total_count == 1 and .branch_policies[0].name == "main"', text)
        for forbidden in ("pages: write", "deployments: write", "id-token: write",
                          "OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
            self.assertNotIn(forbidden, text)


if __name__ == "__main__":
    unittest.main()
