"""Deterministic visual contract for publication infographics."""
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from daily_review_preview import _validate_svg  # noqa: E402
from kfarmai_daily_autopublish import INFOGRAPHIC_PALETTE, render_svg  # noqa: E402


class InfographicTemplateTests(unittest.TestCase):
    def render(self, items):
        article = {"infographic_title": "겨울철 온실 난방 전 점검 포인트",
                   "infographic_items": items}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "infographic.svg"
            render_svg(article, path)
            return path.read_text(encoding="utf-8")

    def test_carbon_palette_and_footer_removal(self):
        svg = self.render(["난방 배관 누수 점검", "온실 틈새와 파손 부위 확인",
                           "난방기 점검 및 청소", "현장 설비 상태에 맞춰 확인"])
        for color in ("#0f62fe", "#ffffff", "#f4f4f4", "#e0e0e0", "#161616", "#525252"):
            self.assertIn(color, svg)
        for old in ("#2e7d4f", "#f4f8f2", "#d8e4d4", "AI 정보는 참고용입니다",
                    "일반 참고정보입니다", "최신 공식자료와 현장 상태"):
            self.assertNotIn(old, svg)
        self.assertTrue(set(INFOGRAPHIC_PALETTE.values()) >=
                        {"#0f62fe", "#ffffff", "#f4f4f4", "#e0e0e0", "#161616", "#525252"})
        self.assertEqual(_validate_svg(svg.encode("utf-8")), svg)

    def test_badges_and_single_or_multiline_titles_are_vertically_centered(self):
        svg = self.render(["짧은 제목", "가" * 31, "세 번째 제목", "네 번째 제목"])
        self.assertEqual(svg.count('<circle cx="108"'), 4)
        self.assertEqual(svg.count('dominant-baseline="middle"'), 9)
        self.assertIn('y="393" dominant-baseline="middle"', svg)
        self.assertIn('y="431" dominant-baseline="middle"', svg)
        self.assertNotIn("textLength=", svg)


if __name__ == "__main__":
    unittest.main()
