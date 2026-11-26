"""Standing-approval publication plan is explicit and never a deploy assertion."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))
sys.path.insert(0, str(ROOT / "tests"))
from five_slot_editorial_apply import plan, REGISTRY, SITEMAP
from test_five_slot_editorial_preflight import FiveSlotEditorialPreflightTests as Fixture


class FiveSlotEditorialPlanTests(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture("test_all_required_checks_allow_ready_not_published")
        self.fixture.setUp()
        self.root = self.fixture.root
        self.fixture.c["category"] = "재배노하우"
        (self.root / "automation").mkdir()
        (self.root / REGISTRY).write_text('{"items":[]}', encoding="utf-8")
        (self.root / SITEMAP).write_text(
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
            encoding="utf-8")

    def tearDown(self):
        self.fixture.tearDown()

    def test_safe_prepared_plan_never_claims_published(self):
        out = plan(self.fixture.c, self.root, kst_date="2026-11-27")
        self.assertEqual("READY_FOR_SCOPED_REVIEW", out["status"])
        self.assertFalse(out["published"])
        self.assertEqual({REGISTRY, SITEMAP}, set(out["changes"]))
        self.assertEqual("USER_DIRECT_APPROVAL", out["record"]["publication_mode"])
        self.assertEqual("USER_STANDING_AUTO_APPROVAL_20261127",
                         out["record"]["approval_record"])
        self.assertIn("unique-agri-topic.html", out["changes"][SITEMAP].decode())
        self.assertEqual("[]", json.dumps(json.loads((self.root / REGISTRY).read_text())["items"]))

    def test_duplicate_publication_blocks(self):
        (self.root / REGISTRY).write_text(
            json.dumps({"items": [{"slug": "unique-agri-topic"}]}), encoding="utf-8")
        out = plan(self.fixture.c, self.root, kst_date="2026-11-27")
        self.assertEqual("KFARMAI_GATE_BLOCKED", out["status"])
        self.assertIn("DUPLICATE_ARTICLE", out["problems"])
        self.assertFalse(out["changes"])

    def test_missing_mobile_approval_blocks(self):
        self.fixture.c["mobile_390"] = "UNVERIFIED"
        out = plan(self.fixture.c, self.root, kst_date="2026-11-27")
        self.assertEqual("KFARMAI_GATE_BLOCKED", out["status"])
        self.assertIn("MOBILE_GATE_MISSING", out["problems"])

    def test_sitemap_conflict_blocks(self):
        sitemap = (self.root / SITEMAP)
        sitemap.write_text('<urlset><url><loc>https://kfarmai.com/kb/unique-agri-topic.html</loc>'
                           '</url></urlset>', encoding='utf-8')
        out = plan(self.fixture.c, self.root, kst_date="2026-11-27")
        self.assertEqual("KFARMAI_GATE_BLOCKED", out["status"])
        self.assertEqual(["SITEMAP_CONFLICT_OR_INVALID"], out["problems"])


if __name__ == "__main__":
    unittest.main()
