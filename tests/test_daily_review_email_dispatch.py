from pathlib import Path
import io
import json
import sys
import tempfile
import unittest

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from approval_package import prepare_package, write_package  # noqa: E402
from daily_review_email_dispatch import build_request  # noqa: E402
from kfarmai_review_approval import digest  # noqa: E402


class DispatchTests(unittest.TestCase):
    def test_request_binds_artifact_issue_and_manifest(self):
        article = {"risk":"REVIEW","slug":"mail-fixture","title":"검수 메일 fixture","category":"스마트팜","summary":"핵심 내용","sections":[{"heading":"확인 포인트","body":"전체 본문"}],"kfarmai_connection":"공공자료 확인","sources":[{"title":"농촌진흥청","claim":"공식자료","url":"https://www.rda.go.kr/"}],"safety_note":"참고자료"}
        source = {"status":"PASS","evidence":[],"checked_at":"2026-10-19T00:00:00Z","cost_evidence":{"model":"gpt-6-luna","estimated_microusd":3,"usage":{"input_tokens":1,"output_tokens":2,"output_tokens_details":{"reasoning_tokens":3}}}}
        hero = io.BytesIO()
        Image.new("RGB", (800, 450), "green").save(hero, format="WEBP")
        html = f'<!doctype html><html lang="ko"><body>{article["title"]}{article["safety_note"]}</body></html>'.encode()
        package = prepare_package(article=article, review_reason="사람 검수 필요", source_check=source,
            html_bytes=html, hero_bytes=hero.getvalue(), svg_bytes=b'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="845"><text x="20" y="30">preview</text></svg>', date="2026-10-19", run_id=777001, head_sha="a" * 40)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "package"; write_package(root, package)
            artifact = {"id": 777001, "digest": "sha256:" + digest(b"artifact")}
            outcome = {"status":"REVIEW","published":False,"approval_id":package["manifest"]["approval_id"],"manifest_sha256":package["manifest_sha256"],"issue_url":"https://github.com/dgilink/kfarmai/issues/77","model_usage":{"usage":{"input_tokens":1,"output_tokens":2,"output_tokens_details":{"reasoning_tokens":3}},"estimated_microusd":3}}
            result = build_request(root, artifact, outcome)
        self.assertEqual(package["manifest_sha256"], result["manifest_sha256"])
        self.assertEqual(777001, result["artifact_id"])
        self.assertEqual("gpt-6-luna", result["email_context"]["model"])
        self.assertIn('"input_tokens": 1', result["email_context"]["input_output_usage"])
        self.assertEqual(article["title"], result["preview"]["article"]["title"])
        self.assertTrue(result["preview"]["hero_base64"])


if __name__ == "__main__":
    unittest.main()
