"""Create Issue #5 revision 2 without any model or image generation."""
from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path

from approval_package import prepare_package, render_issue, write_package
from daily_review_email_dispatch import build_request
from daily_review_issue import load_package
from kfarmai_daily_autopublish import render_html
from kfarmai_review_approval import (
    REPOSITORY, canonical, parse_json, read_archive, require, verify_package,
)
from real_daily_provider import FACILITY_SAFETY_NOTE

OLD_APPROVAL = "review-39202263746-r1-3c9cc026df02"
OLD_ARTIFACT = 12164561335
OLD_MANIFEST = "9f5da97da769967a1f68cb95ddb3287288e300d3af347be35d837cdfd0144d30"
OLD_RUN = 39202263746
OLD_HEAD = "44b2f68e60c6eb53037b0eb2c354acb843376dd1"
ISSUE_URL = "https://github.com/dgilink/kfarmai/issues/5"
SLUG = "greenhouse-heating-preflight-notes"
HERO_CAPTION = ("온실 참고 사진: USDAgov/Holly Hess, 미국 연방정부 퍼블릭 도메인. "
                "한국 현장 진단 증거가 아닙니다.")


def _old_package(raw: bytes, artifact: dict) -> tuple[dict[str, bytes], dict, dict]:
    meta = {
        "repository": REPOSITORY, "approval_id": OLD_APPROVAL,
        "manifest_sha256": OLD_MANIFEST, "run_id": OLD_RUN,
        "artifact_id": OLD_ARTIFACT, "artifact_name": "review-" + OLD_APPROVAL,
        "artifact_digest": artifact.get("digest"), "state": "REVIEW",
    }
    intent, _, manifest = verify_package(raw, meta, artifact)
    require(manifest["revision"] == 1 and manifest["source_head_sha"] == OLD_HEAD
            and intent["slug"] == SLUG, "BLOCKED_REVISION_SOURCE")
    return read_archive(raw), intent, manifest


def revised_article(old: dict) -> dict:
    article = copy.deepcopy(old)
    require(article.get("slug") == SLUG and article.get("category") == "스마트팜",
            "BLOCKED_REVISION_SOURCE")
    require(len(article.get("sections", [])) == 4, "BLOCKED_REVISION_SOURCE")
    article["sections"][3]["body"] = (
        "설비 구조와 장비 사양에 맞춰 점검 항목을 확인하세요. 구체적인 점검 방법은 "
        "제조사 설명서와 관련 공식자료를 함께 살펴보세요."
    )
    article["kfarmai_connection"] = (
        "공식자료에서 확인한 점검 항목과 이해하기 쉽게 정리한 설명을 함께 제공합니다. "
        "시설 구조와 장비 사양을 확인해 활용하세요."
    )
    article["safety_note"] = FACILITY_SAFETY_NOTE
    article["risk"] = "REVIEW"
    article["risk_reason"] = "공개 콘텐츠와 내부 검수정보 분리 및 시설 안전문구 사용자 재검수 필요"
    article["editorial_checkpoints"] = [item["body"] for item in article["sections"]]
    return article


def build(args) -> dict:
    artifact = parse_json(Path(args.old_artifact_json).read_bytes())
    require(artifact.get("id") == OLD_ARTIFACT and artifact.get("expired") is False,
            "BLOCKED_REVISION_SOURCE")
    files, intent, old_manifest = _old_package(Path(args.old_artifact_zip).read_bytes(), artifact)
    old_article = parse_json(files["article.json"])
    article = revised_article(old_article)
    source_check = parse_json(files["source-check.json"])
    html_bytes = render_html(
        article, intent["date"], intent["hero"], intent["infographic"],
        "https://kfarmai.com", hero_caption=HERO_CAPTION,
    ).encode("utf-8")
    package = prepare_package(
        article=article, review_reason=article["risk_reason"], source_check=source_check,
        html_bytes=html_bytes, hero_bytes=files["publish/" + intent["hero"]],
        svg_bytes=files["publish/" + intent["infographic"]], date=intent["date"],
        run_id=args.run_id, head_sha=args.head_sha, revision=2,
        generated_at=old_manifest["generated_at"],
    )
    require(package["files"]["publish/" + intent["hero"]] == files["publish/" + intent["hero"]]
            and package["files"]["publish/" + intent["infographic"]] == files["publish/" + intent["infographic"]],
            "BLOCKED_IMAGE_REGENERATION")
    public_html = html_bytes.decode("utf-8")
    forbidden = ("AI·편집", "AI가 편집", "AI 생성 참고정보", "REVIEW 사유", "PENDING",
                 "published=false", "Approval ID", "Artifact ID", "Manifest SHA",
                 "response_id", "gpt-", "input_tokens", "reasoning_tokens", "micro-USD",
                 "github.com/dgilink/kfarmai/issues")
    require(not any(value in public_html for value in forbidden), "BLOCKED_PRODUCTION_METADATA")
    require("농약 사용 전" not in public_html and FACILITY_SAFETY_NOTE in public_html
            and "공식자료에서 확인한 내용" in public_html and "참고 정리" in public_html,
            "BLOCKED_PRODUCTION_CONTENT")
    write_package(args.output, package)
    result = {
        "approval_id": package["manifest"]["approval_id"],
        "manifest_sha256": package["manifest_sha256"],
        "artifact_name": "review-" + package["manifest"]["approval_id"],
        "content_sha256": package["manifest"]["article_sha256"],
        "old_approval_id": OLD_APPROVAL, "old_artifact_id": OLD_ARTIFACT,
        "old_manifest_sha256": OLD_MANIFEST,
    }
    Path(args.result).write_bytes(canonical(result) + b"\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8", newline="\n") as target:
            for key, value in result.items():
                target.write(f"{key}={value}\n")
    return result


def request(args) -> dict:
    package = load_package(args.package)
    source_check = parse_json(package["files"]["source-check.json"])
    outcome = {
        "status": "REVIEW", "published": False,
        "approval_id": package["manifest"]["approval_id"],
        "manifest_sha256": package["manifest_sha256"], "issue_url": ISSUE_URL,
        "model_usage": source_check["cost_evidence"],
    }
    value = build_request(args.package, parse_json(Path(args.artifact_json).read_bytes()), outcome)
    value["operation"] = "REVISION"
    value["supersedes"] = {
        "approval_id": OLD_APPROVAL, "artifact_id": OLD_ARTIFACT,
        "manifest_sha256": OLD_MANIFEST,
    }
    Path(args.output).write_bytes(canonical(value) + b"\n")
    return value


def issue(args) -> dict:
    package = load_package(args.package)
    artifact = parse_json(Path(args.artifact_json).read_bytes())
    payload = render_issue(package, artifact, uploaded_raw=Path(args.artifact_zip).read_bytes())
    Path(args.output).write_bytes(canonical(payload) + b"\n")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    build_parser = sub.add_parser("build")
    build_parser.add_argument("--old-artifact-json", required=True)
    build_parser.add_argument("--old-artifact-zip", required=True)
    build_parser.add_argument("--output", required=True)
    build_parser.add_argument("--result", required=True)
    build_parser.add_argument("--run-id", required=True, type=int)
    build_parser.add_argument("--head-sha", required=True)
    request_parser = sub.add_parser("request")
    request_parser.add_argument("--package", required=True)
    request_parser.add_argument("--artifact-json", required=True)
    request_parser.add_argument("--output", required=True)
    issue_parser = sub.add_parser("issue")
    issue_parser.add_argument("--package", required=True)
    issue_parser.add_argument("--artifact-json", required=True)
    issue_parser.add_argument("--artifact-zip", required=True)
    issue_parser.add_argument("--output", required=True)
    args = parser.parse_args()
    {"build": build, "request": request, "issue": issue}[args.command](args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
