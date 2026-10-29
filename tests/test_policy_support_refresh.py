import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from policy_support_refresh import build_review_artifact, normalize_record  # noqa: E402


class PolicySupportRefreshTest(unittest.TestCase):
    def setUp(self):
        fixture = ROOT / "tests" / "fixtures" / "policy-support" / "bojo-open-api.json"
        self.payload = json.loads(fixture.read_text(encoding="utf-8"))

    def test_fixture_is_deduplicated_and_unverified_url_is_rejected(self):
        artifact = build_review_artifact(
            self.payload,
            "bojo-open-api",
            "2026-10-29T00:00:00+00:00",
        )
        self.assertEqual(artifact["publishMode"], "review_only")
        self.assertEqual(artifact["counts"], {"received": 3, "pending": 1, "duplicates": 1, "rejected": 1})
        self.assertEqual(len(artifact["items"]), 1)
        self.assertEqual(artifact["items"][0]["reviewStatus"], "pending")
        self.assertEqual(len(artifact["items"][0]["sourceHash"]), 64)

    def test_missing_required_identity_never_becomes_candidate(self):
        self.assertIsNone(normalize_record({"title": "식별자 없음", "officialUrl": "https://bojo.go.kr"}, "bojo-open-api"))
        self.assertIsNone(normalize_record({"id": "id-1", "title": "외부 링크", "officialUrl": "https://example.com/detail"}, "bojo-open-api"))
        self.assertIsNone(normalize_record({"id": "id-1", "title": "유사 도메인", "officialUrl": "https://bojo.go.kr.evil.test/detail"}, "bojo-open-api"))

    def test_hash_is_stable_for_same_source_record(self):
        record = {
            "id": "same-id",
            "title": "동일 공고",
            "officialUrl": "https://www.bojo.go.kr/detail/same-id",
        }
        first = normalize_record(record, "bojo-open-api")
        second = normalize_record(record, "bojo-open-api")
        self.assertEqual(first["sourceHash"], second["sourceHash"])


if __name__ == "__main__":
    unittest.main()
