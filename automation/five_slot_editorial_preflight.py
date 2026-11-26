#!/usr/bin/env python3
"""Read-only deterministic gate for owner-approved five-slot KFarmAI editorial files.

This validates *evidence metadata and local artifact integrity*, not the truth of
an external claim. A publishing job must still independently verify official
web pages, image content/rights and production deployment before publication.
The existing REVIEW-only and Gate C/D workflows are never modified here.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

SLOTS = {"TODAY": "07:00", "7D": "09:00", "30D": "11:00",
         "60D": "13:00", "90D": "15:00"}
APPROVAL = "OWNER_STANDING_SCHEDULED_EDITORIAL"
SOURCE_AUTOMATION = "6ae7c146b4908191b195b79c8a671059"
SLUG_RE = re.compile(r"[a-z0-9](?:[a-z0-9-]{3,79}[a-z0-9])?\Z")
HEX_RE = re.compile(r"[a-f0-9]{64}\Z")
OFFICIAL_HOSTS = {"korea.kr", "rda.go.kr", "mafra.go.kr",
                  "nongsaro.go.kr", "kamis.or.kr", "data.go.kr"}
BLOCKED = "KFARMAI_GATE_BLOCKED"


def official_url(url: object) -> bool:
    if not isinstance(url, str):
        return False
    try:
        v = urlsplit(url)
        host = (v.hostname or "").lower()
        return (v.scheme == "https" and not v.username and not v.password
                and v.port in (None, 443)
                and host != ""
                and (host in OFFICIAL_HOSTS
                     or any(host.endswith("." + x) for x in OFFICIAL_HOSTS)
                     or host.endswith(".go.kr")
                     or host.endswith(".gov.kr")))
    except ValueError:
        return False


def safe_local_path(root: Path, raw: object, allowed_prefix: str) -> Path | None:
    if not isinstance(raw, str) or not raw.startswith(allowed_prefix):
        return None
    path = Path(raw)
    if path.is_absolute() or any(p in (".", "..") for p in path.parts):
        return None
    result = (root / path).resolve()
    try:
        result.relative_to(root.resolve())
    except ValueError:
        return None
    return result if result.is_file() else None


def gate(candidate: dict, root: Path, registry: dict, *,
         kst_date: str | None = None) -> dict:
    problems: list[str] = []
    date = kst_date or dt.datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat()
    bucket = candidate.get("bucket")
    slug = candidate.get("slug")
    if candidate.get("date_kst") != date:
        problems.append("DATE_MISMATCH")
    if bucket not in SLOTS or candidate.get("slot_time") != SLOTS.get(bucket):
        problems.append("SLOT_MISMATCH")
    if candidate.get("approval_source") != APPROVAL:
        problems.append("APPROVAL_MISSING")
    if candidate.get("source_automation_id") != SOURCE_AUTOMATION:
        problems.append("SOURCE_AUTOMATION_MISMATCH")
    if candidate.get("status") != "PASS":
        problems.append("SOURCE_HOLD_OR_NOT_VERIFIED")
    if not isinstance(candidate.get("run_id"), str) or not candidate["run_id"].strip():
        problems.append("RUN_ID_MISSING")
    if not isinstance(candidate.get("topic_id"), str) or not candidate["topic_id"].strip():
        problems.append("TOPIC_ID_MISSING")
    if not isinstance(slug, str) or not SLUG_RE.fullmatch(slug):
        problems.append("SLUG_INVALID")
    if not isinstance(candidate.get("title"), str) or len(candidate["title"].strip()) < 12:
        problems.append("TITLE_INVALID")

    sources = candidate.get("sources")
    if not isinstance(sources, list) or len(sources) < 2:
        problems.append("OFFICIAL_SOURCES_INSUFFICIENT")
    else:
        urls = [s.get("url") if isinstance(s, dict) else None for s in sources]
        if len(set(map(str, urls))) < 2 or not all(official_url(u) for u in urls):
            problems.append("OFFICIAL_SOURCES_INVALID")
        if not all(isinstance(s, dict) and s.get("fact_checked") is True
                   and isinstance(s.get("checked_at_kst"), str) and s["checked_at_kst"]
                   for s in sources):
            problems.append("SOURCE_FACT_CHECK_INCOMPLETE")
    if candidate.get("facts_verified") is not True:
        problems.append("FACT_GATE_MISSING")

    if isinstance(slug, str):
        for item in registry.get("items", []):
            if (item.get("slug") == slug
                or (item.get("date") == date
                    and item.get("bucket") == bucket
                    and item.get("topic_id") == candidate.get("topic_id"))):
                problems.append("DUPLICATE_ARTICLE")
                break

    def check_file(entry: object, prefix: str, permitted_ext: set[str]) -> None:
        if not isinstance(entry, dict):
            problems.append("ARTIFACT_MISSING")
            return
        path = safe_local_path(root, entry.get("path"), prefix)
        h = entry.get("sha256")
        if not path or path.suffix.lower() not in permitted_ext:
            problems.append("ARTIFACT_PATH_INVALID")
        elif not isinstance(h, str) or not HEX_RE.fullmatch(h) or hashlib.sha256(path.read_bytes()).hexdigest() != h:
            problems.append("ARTIFACT_HASH_MISMATCH")

    article = candidate.get("article")
    if isinstance(article, dict) and isinstance(slug, str) and article.get("path") != f"kb/{slug}.html":
        problems.append("ARTICLE_PATH_MISMATCH")
    check_file(article, "kb/", {".html"})

    media = candidate.get("media")
    if not isinstance(media, list) or len(media) < 2:
        problems.append("MEDIA_INSUFFICIENT")
    else:
        roles = {m.get("role") for m in media if isinstance(m, dict)}
        if not {"hero_photo", "infographic"}.issubset(roles):
            problems.append("MEDIA_ROLES_MISSING")
        for m in media:
            check_file(m, "static/kb/", {".svg", ".png", ".webp", ".jpg", ".jpeg"})
            if not isinstance(m, dict):
                continue
            if m.get("rights_verified") is not True or not m.get("alt"):
                problems.append("MEDIA_RIGHTS_OR_ALT_MISSING")
            scores = m.get("quality_scores")
            limits = {"fact": 25, "mobile": 25, "layout": 20, "visual": 20, "brand": 10}
            if (not isinstance(scores, dict)
                or any(not isinstance(scores.get(k), int) or not 0 <= scores[k] <= maxv
                       for k, maxv in limits.items())
                or sum(scores.get(k, 0) for k in limits) < 85
                or m.get("critical_defect") is not False):
                problems.append("MEDIA_QA_NOT_APPROVED")
    if candidate.get("mobile_360") != "PASS" or candidate.get("mobile_390") != "PASS":
        problems.append("MOBILE_GATE_MISSING")
    if candidate.get("security_review") != "PASS":
        problems.append("SECURITY_GATE_MISSING")
    if candidate.get("duplicate_review") != "PASS":
        problems.append("DUPLICATE_REVIEW_MISSING")
    return {"status": "READY_FOR_REVIEWED_COMMIT" if not problems else BLOCKED,
            "date_kst": date, "bucket": bucket, "topic_id": candidate.get("topic_id"),
            "problems": sorted(set(problems)),
            "published": False}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--registry", type=Path, required=True)
    parser.add_argument("--kst-date", default=None)
    args = parser.parse_args()
    result = gate(json.loads(args.candidate.read_text(encoding="utf-8")),
                  args.root, json.loads(args.registry.read_text(encoding="utf-8")),
                  kst_date=args.kst_date)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0 if result["status"] == "READY_FOR_REVIEWED_COMMIT" else 2


if __name__ == "__main__":
    raise SystemExit(main())
