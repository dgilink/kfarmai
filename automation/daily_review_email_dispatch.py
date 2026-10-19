"""Build the bounded server-side REVIEW email request from an immutable package.

This module cannot send mail.  The GitHub workflow obtains an OIDC token and
the Supabase Edge Function performs the only Resend request.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re

from daily_review_issue import load_package
from kfarmai_review_approval import Blocked, canonical, require


def build_request(package_dir: str | Path, artifact: dict, outcome: dict) -> dict:
    package = load_package(Path(package_dir))
    manifest, article, review, intent = (package["manifest"], package["article"],
                                         package["review"], package["intent"])
    artifact_id = artifact.get("id")
    require(type(artifact_id) is int and artifact_id > 0
            and re.fullmatch(r"sha256:[a-f0-9]{64}", str(artifact.get("digest", ""))),
            "EMAIL_ARTIFACT_INVALID")
    require(outcome.get("status") == "REVIEW" and outcome.get("published") is False
            and outcome.get("approval_id") == manifest["approval_id"]
            and outcome.get("manifest_sha256") == package["manifest_sha256"]
            and isinstance(outcome.get("issue_url"), str)
            and re.fullmatch(r"https://github\.com/dgilink/kfarmai/issues/[1-9][0-9]*", outcome["issue_url"]),
            "EMAIL_OUTCOME_BINDING")
    source = json.loads(package["files"]["source-check.json"])
    usage = outcome.get("model_usage")
    require(isinstance(usage, dict) and isinstance(source, dict)
            and isinstance(source.get("evidence"), list), "EMAIL_USAGE_INVALID")
    return {
        "approval_id": manifest["approval_id"],
        "artifact_id": artifact_id,
        "artifact_digest": artifact["digest"],
        "manifest_sha256": package["manifest_sha256"],
        "head_sha": manifest["source_head_sha"],
        "review_url": outcome["issue_url"],
        "title": review["title"],
        "summary": review["summary"],
        "official_sources": intent["source_urls"],
        "usage": usage,
        "email_context": {
            "category": article["category"],
            "review_reason": review["reason"],
            "source_checked_at": source.get("checked_at", "recorded-in-artifact"),
            "hero": intent["hero"],
            "infographic": intent["infographic"],
            "model": "gpt-6-luna",
            "input_output_usage": json.dumps({k: usage.get(k) for k in ("input_tokens", "output_tokens")},
                                               ensure_ascii=False, sort_keys=True),
            "cost_microusd": usage.get("estimated_microusd"),
        },
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True)
    parser.add_argument("--artifact", required=True)
    parser.add_argument("--outcome", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args(argv)
    try:
        result = build_request(args.package, json.loads(Path(args.artifact).read_bytes()),
                               json.loads(Path(args.outcome).read_bytes()))
        Path(args.output).write_bytes(canonical(result) + b"\n")
    except (Blocked, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        raise SystemExit("EMAIL_REQUEST_BLOCKED") from error
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
