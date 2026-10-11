from __future__ import annotations

import copy
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from kfarmai_post_publish_audit import (  # noqa: E402
    FetchResult,
    audit_published_content,
    build_registry_record,
    sha256_bytes,
    _default_fetch,
)


TITLE = "스마트팜 관수 전 유량계 점검"
SLUG = "smartfarm-flowmeter-check"
URL = f"https://kfarmai.com/kb/{SLUG}.html"
SOURCES = ["https://www.rda.go.kr/", "https://www.nongsaro.go.kr/"]


def page_html(*, title: str = TITLE, canonical: str = URL, extra: str = "") -> bytes:
    return f"""<!doctype html><html lang="ko"><head>
<title>{title} | kFarmAI</title>
<meta name="robots" content="index, follow">
<link rel="canonical" href="{canonical}">
</head><body><main><article><h1>{title}</h1>
<img src="/static/kb/{SLUG}-hero.webp" alt="대표 이미지">
<img src="/static/kb/{SLUG}-infographic.svg" alt="인포그래픽">
<h2>공식 참고자료</h2>
<a href="{SOURCES[0]}">농촌진흥청</a><a href="{SOURCES[1]}">농사로</a>
{extra}</article></main></body></html>""".encode("utf-8")


class AuditFixture:
    def __init__(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "kb").mkdir()
        (self.root / "static" / "kb").mkdir(parents=True)
        self.html_path = self.root / "kb" / f"{SLUG}.html"
        self.html_path.write_bytes(page_html())
        (self.root / "static" / "kb" / f"{SLUG}-hero.webp").write_bytes(b"image")
        (self.root / "static" / "kb" / f"{SLUG}-infographic.svg").write_text("<svg/>", encoding="utf-8")
        (self.root / "sitemap.xml").write_text(
            f'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>{URL}</loc></url></urlset>',
            encoding="utf-8",
        )
        article = {
            "title": TITLE,
            "sources": [{"url": value, "title": value, "claim": "공식자료"} for value in SOURCES],
        }
        self.record = build_registry_record(
            article=article,
            date="2026-10-09",
            title=TITLE,
            slug=SLUG,
            url=URL,
            category="스마트팜",
            html_bytes=self.html_path.read_bytes(),
            artifact_files=[
                f"kb/{SLUG}.html",
                f"static/kb/{SLUG}-hero.webp",
                f"static/kb/{SLUG}-infographic.svg",
                "sitemap.xml",
                "automation/daily_registry.json",
            ],
            publication_mode="LOW",
        )

    def close(self) -> None:
        self.temp.cleanup()

    def replace_html(self, body: bytes, update_hash: bool = False) -> None:
        self.html_path.write_bytes(body)
        if update_hash:
            self.record["html_sha256"] = sha256_bytes(body)


class PostPublishAuditTests(unittest.TestCase):
    def setUp(self) -> None:
        self.fx = AuditFixture()

    def tearDown(self) -> None:
        self.fx.close()

    def audit(self, **kwargs):
        return audit_published_content(
            self.fx.root,
            self.fx.record,
            checked_at="2026-10-09T10:00:00+09:00",
            **kwargs,
        )

    def test_local_html_hash_match_passes_without_network(self):
        result = self.audit()
        self.assertEqual("LOCAL_PASS_NETWORK_NOT_RUN", result["status"])
        self.assertEqual("NOT_RUN", result["network_status"])
        self.assertEqual([], result["reasons"])

    def test_tampered_html_requires_review(self):
        self.fx.html_path.write_bytes(self.fx.html_path.read_bytes() + b"<!-- tampered -->")
        result = self.audit()
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertIn("HTML_SHA256_MISMATCH", result["reasons"])

    def test_wrong_title_requires_review(self):
        self.fx.replace_html(page_html(title="다른 제목"), update_hash=True)
        result = self.audit()
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertIn("TITLE_MISMATCH", result["reasons"])

    def test_wrong_canonical_requires_review(self):
        self.fx.replace_html(page_html(canonical="https://kfarmai.com/kb/wrong.html"), update_hash=True)
        result = self.audit()
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertIn("CANONICAL_MISMATCH", result["reasons"])

    def test_missing_sitemap_requires_review(self):
        (self.fx.root / "sitemap.xml").write_text("<urlset/>", encoding="utf-8")
        result = self.audit()
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertIn("SITEMAP_URL_MISSING_OR_DUPLICATE", result["reasons"])

    def test_internal_review_marker_requires_review(self):
        self.fx.replace_html(page_html(extra="<p>approval_id: review-123</p>"), update_hash=True)
        result = self.audit()
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertIn("INTERNAL_REVIEW_METADATA_LEAK", result["reasons"])

    def test_secret_like_content_is_fail(self):
        fake_secret = "sk-" + "proj-" + "abcdefghijklmnopqrstuvwxyz123456"
        self.fx.replace_html(page_html(extra=f"<p>{fake_secret}</p>"), update_hash=True)
        result = self.audit()
        self.assertEqual("FAIL", result["status"])
        self.assertIn("SECRET_PATTERN_DETECTED", result["reasons"])

    def test_network_off_never_invokes_fetcher(self):
        def forbidden_fetch(*args, **kwargs):
            raise AssertionError("network fetcher called")

        result = self.audit(network=False, fetcher=forbidden_fetch)
        self.assertEqual("LOCAL_PASS_NETWORK_NOT_RUN", result["status"])

    def test_network_adapter_rejects_private_and_credential_urls(self):
        with patch('urllib.request.build_opener', side_effect=AssertionError('network forbidden')):
            for url in ('http://127.0.0.1/', 'https://127.0.0.1/', 'https://user:password@kfarmai.com/', 'https://example.com/'):
                with self.subTest(url=url), self.assertRaises(ValueError):
                    _default_fetch(url)

    def test_network_200_correct_is_pass(self):
        html = self.fx.html_path.read_bytes()

        def fetch(url, *, method="GET", timeout=15):
            if url == URL:
                return FetchResult(200, URL, html)
            if url == "https://kfarmai.com/sitemap.xml":
                return FetchResult(200, url, f"<loc>{URL}</loc>".encode())
            return FetchResult(200, url, b"ok")

        result = self.audit(network=True, fetcher=fetch)
        self.assertEqual("PASS", result["status"])
        self.assertEqual("AVAILABLE", result["network_status"])
        self.assertEqual("2026-10-09T10:00:00+09:00", result["registry_update_suggestion"]["production_verified_at"])

    def test_network_timeout_requires_review_without_content_fail(self):
        def fetch(url, *, method="GET", timeout=15):
            if url == URL:
                raise TimeoutError("transient")
            if url == "https://kfarmai.com/sitemap.xml":
                return FetchResult(200, url, f"<loc>{URL}</loc>".encode())
            return FetchResult(200, url, b"ok")

        result = self.audit(network=True, fetcher=fetch)
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertEqual("NETWORK_UNAVAILABLE", result["network_status"])
        self.assertIn("NETWORK_UNAVAILABLE", result["reasons"])

    def test_network_wrong_content_requires_review(self):
        def fetch(url, *, method="GET", timeout=15):
            if url == URL:
                return FetchResult(200, URL, b"<html><title>wrong</title></html>")
            if url == "https://kfarmai.com/sitemap.xml":
                return FetchResult(200, url, f"<loc>{URL}</loc>".encode())
            return FetchResult(200, url, b"ok")

        result = self.audit(network=True, fetcher=fetch)
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertIn("PRODUCTION_CONTENT_MISMATCH", result["reasons"])

    def test_network_5xx_is_network_unavailable_not_content_fail(self):
        def fetch(url, *, method="GET", timeout=15):
            if url == URL:
                return FetchResult(503, URL, b"temporary")
            if url == "https://kfarmai.com/sitemap.xml":
                return FetchResult(200, url, f"<loc>{URL}</loc>".encode())
            return FetchResult(200, url, b"ok")

        result = self.audit(network=True, fetcher=fetch)
        self.assertEqual("REVIEW_REQUIRED", result["status"])
        self.assertEqual("NETWORK_UNAVAILABLE", result["network_status"])
        self.assertIn("NETWORK_UNAVAILABLE", result["reasons"])

    def test_audit_makes_zero_mutations(self):
        before_record = copy.deepcopy(self.fx.record)
        before_files = {
            path.relative_to(self.fx.root).as_posix(): path.read_bytes()
            for path in self.fx.root.rglob("*")
            if path.is_file()
        }
        result = self.audit()
        after_files = {
            path.relative_to(self.fx.root).as_posix(): path.read_bytes()
            for path in self.fx.root.rglob("*")
            if path.is_file()
        }
        self.assertEqual(0, result["mutation_count"])
        self.assertEqual(before_record, self.fx.record)
        self.assertEqual(before_files, after_files)

    def test_registry_contract_is_shared_and_pending_until_deployment(self):
        record = self.fx.record
        self.assertEqual("LOW", record["publication_mode"])
        self.assertIsNone(record["approval_id"])
        self.assertEqual("PENDING", record["post_publish_audit_status"])
        self.assertIsNone(record["published_at"])
        self.assertIsNone(record["production_verified_at"])
        for key in ("manifest_sha256", "content_sha256", "html_sha256"):
            self.assertRegex(record[key], r"^[0-9a-f]{64}$")

    def test_review_approval_uses_same_contract_without_regeneration(self):
        html = self.fx.html_path.read_bytes()
        review_record = build_registry_record(
            article={"title": TITLE, "sources": [{"url": url} for url in SOURCES]},
            date="2026-10-09",
            title=TITLE,
            slug=SLUG,
            url=URL,
            category="식물병",
            html_bytes=html,
            artifact_files=[f"kb/{SLUG}.html"],
            publication_mode="REVIEW",
            approval_id="approval-immutable-001",
        )
        self.assertEqual("approval-immutable-001", review_record["approval_id"])
        self.assertEqual(sha256_bytes(html), review_record["html_sha256"])

    def test_review_registry_record_requires_approval_id(self):
        with self.assertRaisesRegex(ValueError, "approval_id"):
            build_registry_record(
                article={"title": TITLE, "sources": [{"url": url} for url in SOURCES]},
                date="2026-10-09",
                title=TITLE,
                slug=SLUG,
                url=URL,
                category="식물병",
                html_bytes=self.fx.html_path.read_bytes(),
                artifact_files=[f"kb/{SLUG}.html"],
                publication_mode="REVIEW",
            )


if __name__ == "__main__":
    unittest.main()
