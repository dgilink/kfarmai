"""No-network checks for the REVIEW email approval boundary."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase/migrations/20261014010926_daily_email_approvals.sql").read_text(encoding="utf-8")
EDGE = (ROOT / "supabase/functions/daily-review-approval/index.ts").read_text(encoding="utf-8")


class DailyEmailApprovalContractTests(unittest.TestCase):
    def test_private_tables_and_service_only_rpcs(self):
        for table in ("daily_review_approvals", "daily_review_approval_audit", "daily_review_email_outbox"):
            self.assertIn(table, SQL)
        self.assertIn("enable row level security", SQL)
        self.assertIn("from public, anon, authenticated", SQL)
        self.assertIn("grant execute on function public.daily_review_approval_review(text) to service_role", SQL)
        self.assertIn("grant execute on function public.daily_review_approval_apply(text,text,text,text) to service_role", SQL)

    def test_resend_transport_is_server_side_and_oidc_bound(self):
        transport = (ROOT / "supabase/migrations/20261019060000_daily_review_resend_transport.sql").read_text(encoding="utf-8")
        self.assertIn("daily_review_email_issue", transport)
        self.assertIn("idempotency_key", transport)
        self.assertIn("daily_review_email_outbox", transport)
        self.assertIn("api.resend.com/emails", EDGE)
        self.assertIn("token.actions.githubusercontent.com", EDGE)
        self.assertIn("workflow_ref", EDGE)
        self.assertIn("Idempotency-Key", EDGE)
        self.assertNotIn("RESEND_API_KEY", (ROOT / ".github/workflows/kfarmai-daily-autopublish.yml").read_text(encoding="utf-8"))

    def test_separate_one_time_content_and_publish_tokens(self):
        for value in ("'CONTENT','PUBLISH'", "CONTENT_APPROVED", "PUBLISH_APPROVED", "APPROVAL_REPLAY_BLOCKED", "CONTENT_APPROVAL_REQUIRED", "APPROVAL_BINDING_MISMATCH"):
            self.assertIn(value, SQL)
        self.assertIn("token_hash", SQL)
        self.assertNotIn("raw_token", SQL.lower())

    def test_postgres_token_regex_stays_within_postgres_bound(self):
        fix = (ROOT / "supabase/migrations/20261019062000_fix_daily_review_token_regex.sql").read_text(encoding="utf-8")
        self.assertIn("{32,255}", fix)
        self.assertNotIn("{32,256}", fix)

    def test_edge_requires_get_token_and_post_csrf(self):
        for value in ("request.method===\"GET\"", "request.method!==\"POST\"", "csrfValue!==readCookie", "csrfValue!==await csrf(token)", "HttpOnly; Secure; SameSite=Strict", "no-store"):
            self.assertIn(value, EDGE)
        self.assertNotIn("console.log", EDGE)
        self.assertIn("{32,255}", EDGE)


if __name__ == "__main__":
    unittest.main()
