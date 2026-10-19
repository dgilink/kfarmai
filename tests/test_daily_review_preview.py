from pathlib import Path
import io
import sys
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from approval_package import prepare_package, write_package  # noqa: E402
from daily_review_preview import from_package_directory  # noqa: E402


class DailyReviewPreviewTests(unittest.TestCase):
    def package(self, svg: bytes):
        article = {
            "risk": "REVIEW", "slug": "preview-fixture", "title": "전체 검수 fixture",
            "category": "스마트팜", "summary": "요약", "sections": [{"heading": "본문", "body": "내용"}],
            "kfarmai_connection": "공공자료 확인", "sources": [{"title": "농촌진흥청", "claim": "근거", "url": "https://www.rda.go.kr/"}],
            "safety_note": "AI 참고자료이며 공식자료를 확인하세요.",
        }
        hero = io.BytesIO()
        Image.new("RGB", (800, 450), "#176b3a").save(hero, format="WEBP")
        html = f'<!doctype html><html lang="ko"><body>{article["title"]}{article["safety_note"]}</body></html>'.encode()
        source = {"status": "PASS", "checked_at": "2026-10-19T00:00:00Z", "evidence": []}
        return prepare_package(article=article, review_reason="검수 필요", source_check=source,
                               html_bytes=html, hero_bytes=hero.getvalue(), svg_bytes=svg,
                               date="2026-10-19", run_id=777002, head_sha="b" * 40)

    def render(self, package):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "package"
            write_package(target, package)
            return from_package_directory(target)

    def test_uses_exact_sealed_bytes_and_hashes(self):
        package = self.package('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="845"><rect width="1200" height="845" fill="#fff"/><text x="20" y="30">전체 검수</text></svg>'.encode())
        preview = self.render(package)
        self.assertEqual(package["article"]["title"], preview["article"]["title"])
        self.assertEqual(package["manifest"]["article_sha256"], preview["article_sha256"])
        self.assertIn("전체 검수", preview["infographic_svg"])
        self.assertGreater(len(preview["hero_base64"]), 100)

    def test_rejects_active_svg(self):
        package = self.package(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
        with self.assertRaises(Exception):
            self.render(package)


if __name__ == "__main__":
    unittest.main()
