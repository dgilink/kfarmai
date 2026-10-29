#!/usr/bin/env python3
"""Normalize policy-support API responses into a review-only artifact.

This module deliberately does not call a provider or publish data. The provider
operation URL must come from its approved OpenAPI specification, and every new
record remains pending until a reviewer verifies the official announcement.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse


ALIASES = {
    "externalId": ("externalId", "id", "pbancId", "pbancSn", "공고번호"),
    "title": ("title", "pbancNm", "bizNm", "공모명", "사업명"),
    "summary": ("summary", "bizCn", "pbancCn", "사업내용", "지원내용"),
    "agency": ("agency", "instNm", "pbancInstNm", "공모기관", "시행기관"),
    "applicationStart": ("applicationStart", "rcptBgngYmd", "aplyBgngYmd", "접수시작일"),
    "applicationEnd": ("applicationEnd", "rcptEndYmd", "aplyEndYmd", "접수종료일"),
    "publishedAt": ("publishedAt", "pbancYmd", "regYmd", "공고일"),
    "updatedAt": ("updatedAt", "mdfcnDt", "updtDt", "수정일"),
    "officialUrl": ("officialUrl", "detailUrl", "pbancUrl", "공고URL"),
    "region": ("region", "regions", "지역"),
    "targets": ("targets", "target", "지원대상"),
    "categories": ("categories", "category", "분야"),
}


def _first(record: dict[str, Any], names: Iterable[str]) -> Any:
    for name in names:
        value = record.get(name)
        if value not in (None, "", []):
            return value
    return None


def _text(value: Any, limit: int | None = None) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit] if limit else text


def _list(value: Any, default: str | None = None) -> list[str]:
    if isinstance(value, list):
        items = value
    elif value in (None, ""):
        items = [default] if default else []
    else:
        items = str(value).replace("|", ",").split(",")
    return list(dict.fromkeys(_text(item) for item in items if _text(item)))


def _date(value: Any) -> str | None:
    digits = "".join(character for character in str(value or "") if character.isdigit())
    if len(digits) >= 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:8]}"
    text = _text(value)
    return text or None


def _official_url(value: Any) -> str | None:
    text = _text(value)
    parsed = urlparse(text)
    if parsed.scheme != "https" or parsed.hostname not in {"bojo.go.kr", "www.bojo.go.kr"} or parsed.username or parsed.password:
        return None
    return text


def extract_records(payload: Any) -> list[dict[str, Any]]:
    """Extract records from a plain list or common public-API response wrappers."""
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for path in (("response", "body", "items", "item"), ("body", "items", "item"), ("items", "item"), ("items",), ("data",)):
        value: Any = payload
        for key in path:
            if not isinstance(value, dict) or key not in value:
                value = None
                break
            value = value[key]
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            return [value]
    return []


def normalize_record(record: dict[str, Any], source_id: str) -> dict[str, Any] | None:
    values = {field: _first(record, aliases) for field, aliases in ALIASES.items()}
    external_id = _text(values["externalId"])
    title = _text(values["title"], 180)
    official_url = _official_url(values["officialUrl"])
    if not external_id or not title or not official_url:
        return None

    normalized: dict[str, Any] = {
        "sourceId": source_id,
        "externalId": external_id,
        "title": title,
        "summary": _text(values["summary"], 300),
        "region": _list(values["region"], "전국"),
        "targets": _list(values["targets"]),
        "categories": _list(values["categories"]),
        "agency": _text(values["agency"]),
        "applicationStart": _date(values["applicationStart"]),
        "applicationEnd": _date(values["applicationEnd"]),
        "publishedAt": _date(values["publishedAt"]),
        "updatedAt": _text(values["updatedAt"]) or None,
        "officialUrl": official_url,
        "reviewStatus": "pending",
    }
    hash_fields = {key: normalized[key] for key in normalized if key not in {"sourceHash", "reviewStatus"}}
    canonical = json.dumps(hash_fields, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    normalized["sourceHash"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return normalized


def build_review_artifact(payload: Any, source_id: str, generated_at: str | None = None) -> dict[str, Any]:
    records: dict[tuple[str, str, str], dict[str, Any]] = {}
    rejected = 0
    duplicates = 0
    raw_records = extract_records(payload)
    for raw in raw_records:
        item = normalize_record(raw, source_id)
        if item is None:
            rejected += 1
            continue
        key = (item["sourceId"], item["externalId"], item["sourceHash"])
        if key in records:
            duplicates += 1
        records[key] = item
    return {
        "schemaVersion": 1,
        "publishMode": "review_only",
        "generatedAt": generated_at or datetime.now(timezone.utc).isoformat(),
        "sourceId": source_id,
        "counts": {"received": len(raw_records), "pending": len(records), "duplicates": duplicates, "rejected": rejected},
        "items": sorted(records.values(), key=lambda item: (item["applicationEnd"] or "", item["title"])),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Provider response JSON")
    parser.add_argument("--output", required=True, type=Path, help="Review artifact JSON")
    parser.add_argument("--source-id", default="bojo-open-api")
    parser.add_argument("--generated-at")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    artifact = build_review_artifact(payload, args.source_id, args.generated_at)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
