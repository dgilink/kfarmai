#!/usr/bin/env python3
"""Prepare the scoped KFarmAI standing-approval publication registry patch.

This command does not commit, push, deploy, or assert PUBLISHED. Its output is
only a locally verified publication plan. Git changes must be made on a review
branch and release requires all repo gates plus anonymous Production readback.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path

from five_slot_editorial_preflight import APPROVAL, BLOCKED, gate
from kfarmai_review_approval import derive_sitemap

REGISTRY = "automation/daily_registry.json"
SITEMAP = "sitemap.xml"
APPROVAL_RECORD = "USER_STANDING_AUTO_APPROVAL_20261127"


def plan(candidate: dict, root: Path, *, kst_date: str | None = None) -> dict:
    root = Path(root).resolve()
    registry = json.loads((root / REGISTRY).read_text(encoding="utf-8"))
    verdict = gate(candidate, root, registry, kst_date=kst_date)
    if verdict["status"] != "READY_FOR_REVIEWED_COMMIT":
        return {"status": BLOCKED, "problems": verdict["problems"],
                "published": False, "changes": {}}
    slug, date = candidate["slug"], candidate["date_kst"]
    url = f"https://kfarmai.com/kb/{slug}.html"
    registry_item = {
        "date": date, "title": candidate["title"], "slug": slug,
        "url": url, "category": candidate["category"],
        "publication_mode": "USER_DIRECT_APPROVAL",
        "approval_source": APPROVAL, "approval_record": APPROVAL_RECORD,
        "approved_at_kst": "2026-11-27",
        "source_automation_id": candidate["source_automation_id"],
        "source_run_id": candidate["run_id"],
        "topic_id": candidate["topic_id"], "bucket": candidate["bucket"],
        "source_urls": [s["url"] for s in candidate["sources"]],
        "artifact_files": [candidate["article"]["path"]]
                          + [a["path"] for a in candidate["media"]]
                          + [REGISTRY, SITEMAP],
        "html_sha256": candidate["article"]["sha256"],
        "media_sha256": {m["path"]: m["sha256"] for m in candidate["media"]},
        "published_at": None, "production_verified_at": None,
        "post_publish_audit_status": "PENDING",
    }
    current = (root / SITEMAP).read_bytes()
    try:
        sitemap = derive_sitemap(current, {"url": url, "date": date})
    except Exception as exc:
        return {"status": BLOCKED, "problems": ["SITEMAP_CONFLICT_OR_INVALID"],
                "published": False, "changes": {}}
    registry["items"].append(registry_item)
    body = (json.dumps(registry, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    return {"status": "READY_FOR_SCOPED_REVIEW", "published": False,
            "changes": {REGISTRY: body, SITEMAP: sitemap},
            "record": registry_item,
            "change_hashes": {REGISTRY: hashlib.sha256(body).hexdigest(),
                              SITEMAP: hashlib.sha256(sitemap).hexdigest()}}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", type=Path, required=True)
    ap.add_argument("--candidate", type=Path, required=True)
    ap.add_argument("--kst-date", default=None)
    ap.add_argument("--write", action="store_true",
                    help="Write only scoped registry/sitemap edits; never commit or push")
    args = ap.parse_args()
    candidate = json.loads(args.candidate.read_text(encoding="utf-8"))
    result = plan(candidate, args.root, kst_date=args.kst_date)
    if args.write and result["status"] == "READY_FOR_SCOPED_REVIEW":
        for path, data in result["changes"].items():
            (args.root / path).write_bytes(data)
    print(json.dumps({k: v for k, v in result.items() if k != "changes"},
                     ensure_ascii=False, sort_keys=True))
    return 0 if result["status"] == "READY_FOR_SCOPED_REVIEW" else 2


if __name__ == "__main__":
    raise SystemExit(main())
