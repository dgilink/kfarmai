"""Deterministic visual contract for publication infographics."""
from pathlib import Path
import re
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from daily_review_preview import _validate_svg  # noqa: E402
from kfarmai_daily_autopublish import infographic_palette, render_svg  # noqa: E402


class InfographicTemplateTests(unittest.TestCase):
    def render(self, items):
        article = {"infographic_title": "겨울철 온실 난방 전 점검 포인트",
                   "infographic_items": items}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "infographic.svg"
            render_svg(article, path)
            return path.read_text(encoding="utf-8")

    def test_editorial_layout_has_no_left_stripe_or_card_backdrop(self):
        svg = self.render(["난방 배관 누수 점검", "온실 틈새와 파손 부위 확인",
                           "난방기 점검 및 청소", "현장 설비 상태에 맞춰 확인"])
        self.assertIn('width="1200" height="675" viewBox="0 0 1200 675"', svg)
        self.assertEqual(svg.count("<rect"), 1)
        self.assertNotIn('width="8"', svg)
        self.assertNotIn('rx="', svg)
        self.assertNotIn("#f4f4f4", svg)
        self.assertNotIn("AI 정보는 참고용입니다", svg)
        sizes = [int(value) for value in re.findall(r'font-size="(\d+)"', svg)]
        self.assertGreaterEqual(min(sizes), 26)
        self.assertEqual(_validate_svg(svg.encode("utf-8")), svg)

    def test_numbers_and_single_or_multiline_items_use_large_type(self):
        svg = self.render(["짧은 제목", "가" * 31, "세 번째 제목", "네 번째 제목"])
        self.assertEqual(svg.count('font-size="46"'), 4)
        self.assertGreaterEqual(svg.count('font-size="34"'), 5)
        self.assertIn(">01</text>", svg)
        self.assertIn(">04</text>", svg)

    def test_topic_identity_selects_a_deterministic_dynamic_palette(self):
        first = {"category": "스마트팜", "infographic_title": "센서 점검", "title": "A"}
        self.assertEqual(infographic_palette(first), infographic_palette(first))
        candidates = [
            {"category": "스마트팜", "infographic_title": f"센서 점검 {i}", "title": str(i)}
            for i in range(20)
        ]
        self.assertGreater(len({tuple(infographic_palette(x).items()) for x in candidates}), 1)


if __name__ == "__main__":
    unittest.main()
