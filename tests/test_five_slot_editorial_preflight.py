import hashlib
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "automation"))
from five_slot_editorial_preflight import gate, official_url


class FiveSlotEditorialPreflightTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "kb").mkdir()
        (self.root / "static" / "kb").mkdir(parents=True)
        self.article = self.root / "kb" / "unique-agri-topic.html"
        self.hero = self.root / "static" / "kb" / "unique-agri-topic-hero.svg"
        self.info = self.root / "static" / "kb" / "unique-agri-topic-info.svg"
        self.article.write_text("<!doctype html><title>Farm</title>", encoding="utf-8")
        self.hero.write_text("<svg></svg>", encoding="utf-8")
        self.info.write_text("<svg></svg>", encoding="utf-8")
        scores = {"fact": 25, "mobile": 25, "layout": 20, "visual": 20, "brand": 10}
        self.c = {
            "date_kst": "2026-11-27", "slot_time": "07:00", "bucket": "TODAY",
            "approval_source": "OWNER_STANDING_SCHEDULED_EDITORIAL",
            "source_automation_id": "6ae7c146b4908191b195b79c8a671059",
            "run_id": "20261127-0500", "topic_id": "official-topic-1",
            "slug": "unique-agri-topic", "title": "Winter agricultural information field guide",
            "status": "PASS", "facts_verified": True,
            "sources": [
                {"url": "https://www.rda.go.kr/a", "fact_checked": True, "checked_at_kst": "2026-11-27T06:00"},
                {"url": "https://www.mafra.go.kr/b", "fact_checked": True, "checked_at_kst": "2026-11-27T06:00"},
            ],
            "article": {"path": "kb/unique-agri-topic.html", "sha256": self.hash(self.article)},
            "media": [
                {"path": "static/kb/unique-agri-topic-hero.svg", "role": "hero_photo",
                 "sha256": self.hash(self.hero), "alt": "Farm illustration", "rights_verified": True,
                 "quality_scores": scores, "critical_defect": False},
                {"path": "static/kb/unique-agri-topic-info.svg", "role": "infographic",
                 "sha256": self.hash(self.info), "alt": "Farm infographic", "rights_verified": True,
                 "quality_scores": scores, "critical_defect": False},
            ],
            "mobile_360": "PASS", "mobile_390": "PASS",
            "security_review": "PASS", "duplicate_review": "PASS"
        }

    def tearDown(self):
        self.tmp.cleanup()

    def hash(self, path):
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def check(self, **kwargs):
        self.c.update(kwargs)
        return gate(self.c, self.root, {"items": []}, kst_date="2026-11-27")

    def test_all_required_checks_allow_ready_not_published(self):
        result = self.check()
        self.assertEqual(result["status"], "READY_FOR_REVIEWED_COMMIT")
        self.assertFalse(result["published"])

    def test_wrong_slot_blocks(self):
        self.assertIn("SLOT_MISMATCH", self.check(slot_time="09:00")["problems"])

    def test_wrong_day_blocks(self):
        self.assertIn("DATE_MISMATCH", self.check(date_kst="2026-11-26")["problems"])

    def test_hold_blocks(self):
        self.assertIn("SOURCE_HOLD_OR_NOT_VERIFIED", self.check(status="HOLD")["problems"])

    def test_different_source_automation_blocks(self):
        self.assertIn("SOURCE_AUTOMATION_MISMATCH", self.check(source_automation_id="other")["problems"])

    def test_unapproved_blocks(self):
        self.assertIn("APPROVAL_MISSING", self.check(approval_source="")["problems"])

    def test_duplicate_slug_blocks(self):
        self.assertIn("DUPLICATE_ARTICLE", gate(self.c, self.root,
                       {"items": [{"slug": "unique-agri-topic"}]}, kst_date="2026-11-27")["problems"])

    def test_missing_media_blocks(self):
        self.hero.unlink()
        self.assertIn("ARTIFACT_PATH_INVALID", self.check()["problems"])

    def test_modified_html_blocks(self):
        self.article.write_text("modified", encoding="utf-8")
        self.assertIn("ARTIFACT_HASH_MISMATCH", self.check()["problems"])

    def test_mobile_not_checked_blocks(self):
        self.assertIn("MOBILE_GATE_MISSING", self.check(mobile_390="UNVERIFIED")["problems"])

    def test_low_media_score_blocks(self):
        self.c["media"][0]["quality_scores"]["visual"] = 0
        self.assertIn("MEDIA_QA_NOT_APPROVED", self.check()["problems"])

    def test_nonofficial_and_insecure_urls_block(self):
        self.c["sources"][0]["url"] = "http://www.rda.go.kr/a"
        self.assertIn("OFFICIAL_SOURCES_INVALID", self.check()["problems"])

    def test_url_userinfo_not_allowed(self):
        self.assertFalse(official_url("https://evil.example@rda.go.kr/a"))
        self.assertFalse(official_url("https://www.rda.go.kr:8443/a"))
        self.assertTrue(official_url("https://www.rda.go.kr/a"))


if __name__ == "__main__":
    unittest.main()
