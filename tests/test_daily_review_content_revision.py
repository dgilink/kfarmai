from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from daily_review_content_revision import revised_article  # noqa: E402
from kfarmai_daily_autopublish import render_html  # noqa: E402
from real_daily_provider import (  # noqa: E402
    FACILITY_SAFETY_NOTE, PESTICIDE_SAFETY_NOTE, topic_safety_notice,
)


class ContentRevisionTests(unittest.TestCase):
    def article(self):
        return {
            "slug": "greenhouse-heating-preflight-notes", "category": "스마트팜",
            "title": "겨울철 온실 난방 전 틈새·난방기·배관 확인 포인트",
            "meta_description": "온실 난방 점검", "summary": "핵심 내용",
            "sections": [
                {"heading": "배관 누수 확인", "body": "배관을 확인하세요."},
                {"heading": "틈새와 파손 부위", "body": "틈새를 확인하세요."},
                {"heading": "난방기 관리", "body": "난방기를 확인하세요."},
                {"heading": "현장 조건 확인", "body": "AI·편집 참고자료입니다."},
            ],
            "keywords": ["온실", "난방"], "tags": ["스마트팜"],
            "kfarmai_connection": "AI·편집 참고자료로 정리했습니다.",
            "sources": [{"title": "농촌진흥청", "url": "https://www.rda.go.kr/", "claim": "난방 배관"}],
            "infographic_title": "온실 점검", "public_facts": ["난방 배관"],
            "risk": "REVIEW", "risk_reason": "검수", "safety_note": "이 글은 AI가 편집했습니다.",
        }

    def test_revision_public_html_has_no_internal_metadata_or_repeated_ai_wording(self):
        article = revised_article(self.article())
        page = render_html(article, "2026-10-19", "static/kb/hero.webp",
                           "static/kb/info.svg", "https://kfarmai.com",
                           hero_caption="공식 출처 확인 이미지")
        for forbidden in ("AI·편집", "AI가 편집", "REVIEW", "PENDING", "published=false",
                          "Approval ID", "Artifact ID", "Manifest SHA", "response_id",
                          "input_tokens", "reasoning_tokens", "micro-USD", "농약 사용 전"):
            self.assertNotIn(forbidden, page)
        for expected in ("공식자료에서 확인한 내용", "참고 정리", "최근 확인: 2026-10-19",
                         "제조사 설명서"):
            self.assertIn(expected, page)

    def test_topic_aware_safety_keeps_pesticide_contract(self):
        facility = self.article()
        self.assertEqual(FACILITY_SAFETY_NOTE, topic_safety_notice(
            facility, {"category": "스마트팜", "subject": facility["title"]}))
        pesticide = {**facility, "title": "농약 안전사용기준 확인", "keywords": ["농약"]}
        self.assertEqual(PESTICIDE_SAFETY_NOTE, topic_safety_notice(
            pesticide, {"category": "작물보호", "subject": pesticide["title"]}))
        for term in ("등록 작물", "대상 병해충", "희석배수", "사용시기", "사용횟수", "제품 라벨"):
            self.assertIn(term, PESTICIDE_SAFETY_NOTE)


if __name__ == "__main__":
    unittest.main()
