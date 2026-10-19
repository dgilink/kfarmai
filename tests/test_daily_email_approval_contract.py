"""No-network checks for the REVIEW email approval boundary."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "supabase/migrations/20261014010926_daily_email_approvals.sql").read_text(encoding="utf-8")
EDGE = (ROOT / "supabase/functions/daily-review-approval/index.ts").read_text(encoding="utf-8")
PREVIEW_SQL = (ROOT / "supabase/migrations/20261019074353_daily_review_full_preview.sql").read_text(encoding="utf-8")
REVISION_SQL = (ROOT / "supabase/migrations/20261019100628_daily_review_revision_supersede.sql").read_text(encoding="utf-8")
INFOGRAPHIC_SQL = (ROOT / "supabase/migrations/20261019111706_daily_review_infographic_png_preview.sql").read_text(encoding="utf-8")
KOREAN_FONT_SQL = (ROOT / "supabase/migrations/20261019114158_daily_review_infographic_korean_font_replace.sql").read_text(encoding="utf-8")


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
        for value in ("request.method===\"GET\"", "request.method!==\"POST\"", "csrfValue!==readCookie", "csrfValue!==await csrf(token)", "HttpOnly; Secure; SameSite=None", "no-store"):
            self.assertIn(value, EDGE)
        self.assertNotIn("console.log", EDGE)
        self.assertIn("{32,255}", EDGE)

    def test_review_html_is_explicit_utf8_and_rotation_is_server_only(self):
        rotation = (ROOT / "supabase/migrations/20261019065147_daily_review_email_token_rotation.sql").read_text(encoding="utf-8")
        workflow = (ROOT / ".github/workflows/kfarmai-review-email-reissue.yml").read_text(encoding="utf-8")
        review_page = (ROOT / "daily-review.html").read_text(encoding="utf-8")
        review_script = (ROOT / "static/daily-review.js").read_text(encoding="utf-8")
        self.assertIn('Content-Type","text/html; charset=UTF-8', EDGE)
        self.assertIn('<meta charset="UTF-8">', EDGE)
        self.assertIn('redirectToReview(token,value)', EDGE)
        self.assertIn('<meta charset="UTF-8">', review_page)
        self.assertIn('콘텐츠 검수 승인', review_script)
        self.assertIn("daily_review_email_rotate", EDGE)
        self.assertIn("TOKEN_REVOKED", rotation)
        self.assertIn("TOKEN_ROTATED", rotation)
        self.assertIn("id-token: write", workflow)
        self.assertNotIn("RESEND_API_KEY", workflow)

    def test_full_preview_is_artifact_bound_and_active_svg_is_rejected(self):
        page = (ROOT / "daily-review.html").read_text(encoding="utf-8")
        script = (ROOT / "static/daily-review.js").read_text(encoding="utf-8")
        for value in ("daily_review_preview_store", "daily_review_preview_get", "daily_review_preview_asset"):
            self.assertIn(value, PREVIEW_SQL)
            self.assertIn(value, EDGE)
        for value in ("script|foreignobject|image|use|iframe|object|embed|style|a", "APPROVAL_NOT_AVAILABLE", "enable row level security"):
            self.assertIn(value, PREVIEW_SQL)
        self.assertIn("CONTENT_REVIEW_RESET", PREVIEW_SQL)
        self.assertIn("c.state not in ('PENDING','CONTENT_APPROVED')", PREVIEW_SQL)
        self.assertIn("pub.state<>'PENDING'", PREVIEW_SQL)
        self.assertIn("hero_url", EDGE)
        self.assertIn("infographic_url", EDGE)
        self.assertIn("content_id:\"kfarmai-review-hero\"", EDGE)
        self.assertIn("게시 예정 화면", page)
        self.assertIn("참고 정리", page)
        self.assertIn("review-hero", page)
        self.assertIn("review-infographic", page)
        self.assertIn("naturalWidth", script)
        self.assertNotIn("innerHTML", script)

    def test_revision_supersedes_old_identity_and_separates_review_ui(self):
        page = (ROOT / "daily-review.html").read_text(encoding="utf-8")
        workflow = (ROOT / ".github/workflows/kfarmai-review-content-revision.yml").read_text(encoding="utf-8")
        self.assertIn("daily_review_email_revision_issue", REVISION_SQL)
        self.assertIn("PACKAGE_SUPERSEDED", REVISION_SQL)
        self.assertIn("old_content.state not in ('PENDING','CONTENT_APPROVED')", REVISION_SQL)
        self.assertIn("old_publish.state<>'PENDING'", REVISION_SQL)
        self.assertIn("revisionWorkflow", EDGE)
        self.assertIn('raw.operation==="REVISION"', EDGE)
        self.assertIn("게시 예정 화면", page)
        self.assertIn("내부 검수 정보", page)
        self.assertIn("id-token: write", workflow)
        self.assertIn("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02", workflow)
        self.assertNotIn("OPENAI_API_KEY", workflow)

    def test_infographic_png_preview_is_private_bound_and_preview_only(self):
        workflow = (ROOT / ".github/workflows/kfarmai-review-infographic-preview-fix.yml").read_text(encoding="utf-8")
        helper = (ROOT / "automation/daily_review_infographic_preview.py").read_text(encoding="utf-8")
        for value in ("daily_review_infographic_preview_store", "source_svg_sha256", "image/png",
                      "INFOGRAPHIC_PREVIEW_BINDING", "INFOGRAPHIC_PREVIEW_IMMUTABLE"):
            self.assertIn(value, INFOGRAPHIC_SQL)
        self.assertIn('value.content_type==="image/png"', EDGE)
        self.assertIn("infographicPreviewWorkflow", EDGE)
        self.assertIn('raw.operation==="INFOGRAPHIC_PREVIEW"', EDGE)
        self.assertIn("github.actor_id == '293838055'", workflow)
        self.assertIn("google-chrome --headless=new", workflow)
        self.assertNotIn("OPENAI_API_KEY", workflow)
        self.assertIn("verify_package", helper)
        self.assertIn("BLOCKED_PREVIEW_SVG_UNSAFE", helper)
        self.assertIn("preview_png_sha256", helper)

    def test_infographic_korean_font_fix_is_fail_closed_and_derivative_only(self):
        workflow = (ROOT / ".github/workflows/kfarmai-review-infographic-preview-fix.yml").read_text(encoding="utf-8")
        font_qa = (ROOT / "automation/korean_font_raster_qa.py").read_text(encoding="utf-8")
        for value in ("daily_review_infographic_preview_replace", "p_previous_preview_sha256",
                      "INFOGRAPHIC_FONT_PREVIEW_BINDING", "Noto Sans CJK KR",
                      "SIL Open Font License 1.1", "PREVIEW_REPLACED"):
            self.assertIn(value, KOREAN_FONT_SQL)
        self.assertIn("daily_review_infographic_preview_replace", EDGE)
        self.assertIn("fonts-noto-cjk", workflow)
        self.assertIn("fc-match", workflow)
        self.assertIn("korean_font_raster_qa.py", workflow)
        self.assertIn("BLOCKED_KOREAN_FONT_GLYPHS", font_qa)
        self.assertIn('"source_svg_changed": False', font_qa)
        self.assertNotIn("OPENAI_API_KEY", workflow)


if __name__ == "__main__":
    unittest.main()
