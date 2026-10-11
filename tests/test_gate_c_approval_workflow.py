from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/kfarmai-review-approval.yml"


class GateCApprovalWorkflowContractTests(unittest.TestCase):
    def test_registered_canary_is_identity_locked_minimal_and_publish_free(self):
        text = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("repository_dispatch:", text)
        self.assertIn("kfarmai-gate-c-approval-canary", text)
        self.assertNotIn("workflow_dispatch:", text)
        self.assertNotIn("issue_comment:", text)
        self.assertIn("contents: read", text)
        self.assertIn("actions: read", text)
        self.assertIn("issues: write", text)
        for forbidden in ("contents: write", "pages: write", "id-token: write",
                          "review_approval_workflow.py", "deploy-pages", "git push",
                          "OPENAI_API_KEY", "supabase"):
            self.assertNotIn(forbidden, text)
        self.assertIn("GATE_C_APPROVAL_TEST_COMMIT: b2e70b709254e393ce18d1684fe6f389febef0af", text)
        self.assertIn("GATE_C_TEST_ISSUE_ID: '3'", text)
        self.assertIn("GATE_C_OWNER_COMMENT_ID: '6098383420'", text)
        self.assertIn("ref: ${{ env.GATE_C_APPROVAL_TEST_COMMIT }}", text)
        self.assertIn("grep -Eq '^[a-f0-9]{40}$'", text)
        self.assertIn("actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683", text)
        self.assertIn("actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065", text)
        self.assertIn("python automation/gate_c_approval_workflow.py --execute", text)


if __name__ == "__main__":
    unittest.main()
