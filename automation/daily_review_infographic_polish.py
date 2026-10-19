"""Create Issue #5 revision 3 with a deterministic infographic-only polish."""
from __future__ import annotations

import argparse
import base64
import os
import re
import struct
import tempfile
from hashlib import sha256
from pathlib import Path

from approval_package import prepare_package, render_issue, write_package
from daily_review_email_dispatch import build_request
from daily_review_issue import load_package
from kfarmai_daily_autopublish import INFOGRAPHIC_PALETTE, render_svg
from kfarmai_review_approval import REPOSITORY, canonical, parse_json, read_archive, require, verify_package

OLD_APPROVAL = "review-39236736411-r2-fb2cfdd0ee4c"
OLD_ARTIFACT = 12179407364
OLD_MANIFEST = "127932cab29cd6659947fda744e312a7f90c0042c6ed6600e1b9233ccec73d3a"
OLD_RUN = 39236736411
OLD_HEAD = "aa8e77cd032e2a35809136d4692ee3eaf7798577"
OLD_SVG_SHA256 = "41cfae54eb87468799ce6ae24f2396c1fee4208c2430458f5823dae24f4045a8"
ISSUE_URL = "https://github.com/dgilink/kfarmai/issues/5"
SLUG = "greenhouse-heating-preflight-notes"


def digest(value: bytes) -> str:
    return sha256(value).hexdigest()


def old_package(raw: bytes, artifact: dict) -> tuple[dict[str, bytes], dict, dict]:
    meta = {
        "repository": REPOSITORY, "approval_id": OLD_APPROVAL,
        "manifest_sha256": OLD_MANIFEST, "run_id": OLD_RUN,
        "artifact_id": OLD_ARTIFACT, "artifact_name": "review-" + OLD_APPROVAL,
        "artifact_digest": artifact.get("digest"), "state": "REVIEW",
    }
    intent, _, manifest = verify_package(raw, meta, artifact)
    require(manifest["revision"] == 2 and manifest["source_head_sha"] == OLD_HEAD
            and intent["slug"] == SLUG, "BLOCKED_POLISH_SOURCE")
    files = read_archive(raw)
    require(digest(files["publish/" + intent["infographic"]]) == OLD_SVG_SHA256,
            "BLOCKED_POLISH_SOURCE")
    return files, intent, manifest


def validate_svg(svg: bytes) -> None:
    text = svg.decode("utf-8")
    colors = {value.lower() for value in INFOGRAPHIC_PALETTE.values()}
    used = {value.lower() for value in re.findall(r"#[0-9a-fA-F]{6}", text)}
    require(used <= colors and {"#0f62fe", "#ffffff", "#f4f4f4", "#e0e0e0",
                                "#161616", "#525252"} <= used,
            "BLOCKED_POLISH_PALETTE")
    require(text.count('<circle cx="108"') == 4
            and text.count('dominant-baseline="middle"') == 8,
            "BLOCKED_POLISH_ALIGNMENT")
    forbidden = ("AI 정보는 참고용입니다", "일반 참고정보입니다", "최신 공식자료와 현장 상태")
    require(not any(value in text for value in forbidden), "BLOCKED_POLISH_FOOTER")
    require("#2e7d4f" not in text and "#f4f8f2" not in text and "#d8e4d4" not in text,
            "BLOCKED_POLISH_PALETTE")


def build(args) -> dict:
    artifact = parse_json(Path(args.old_artifact_json).read_bytes())
    require(artifact.get("id") == OLD_ARTIFACT and artifact.get("expired") is False,
            "BLOCKED_POLISH_SOURCE")
    files, intent, old_manifest = old_package(Path(args.old_artifact_zip).read_bytes(), artifact)
    article = parse_json(files["article.json"])
    source_check = parse_json(files["source-check.json"])
    with tempfile.TemporaryDirectory(prefix="kfarmai-infographic-polish-") as directory:
        svg_path = Path(directory) / "infographic.svg"
        render_svg(article, svg_path)
        svg = svg_path.read_bytes()
    validate_svg(svg)
    package = prepare_package(
        article=article,
        review_reason="인포그래픽 AI footer 제거, 카드 중앙 정렬, IBM Carbon 팔레트 최종 검수 필요",
        source_check=source_check,
        html_bytes=files["publish/" + intent["html"]],
        hero_bytes=files["publish/" + intent["hero"]],
        svg_bytes=svg, date=intent["date"], run_id=args.run_id,
        head_sha=args.head_sha, revision=3, generated_at=old_manifest["generated_at"],
    )
    require(package["files"]["article.json"] == files["article.json"]
            and package["files"]["source-check.json"] == files["source-check.json"]
            and package["files"]["publish/" + intent["html"]] == files["publish/" + intent["html"]]
            and package["files"]["publish/" + intent["hero"]] == files["publish/" + intent["hero"]]
            and package["files"]["publish/" + intent["infographic"]] != files["publish/" + intent["infographic"]],
            "BLOCKED_POLISH_SCOPE")
    write_package(args.output, package)
    result = {
        "approval_id": package["manifest"]["approval_id"],
        "manifest_sha256": package["manifest_sha256"],
        "artifact_name": "review-" + package["manifest"]["approval_id"],
        "old_approval_id": OLD_APPROVAL, "old_artifact_id": OLD_ARTIFACT,
        "old_manifest_sha256": OLD_MANIFEST, "svg_sha256": digest(svg),
    }
    Path(args.result).write_bytes(canonical(result) + b"\n")
    if os.environ.get("GITHUB_OUTPUT"):
        with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8", newline="\n") as target:
            for key, value in result.items():
                target.write(f"{key}={value}\n")
    return result


def font_preview(png_path: Path, report_path: Path, svg: bytes) -> dict:
    png = png_path.read_bytes()
    require(png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) >= 33, "BLOCKED_POLISH_PNG")
    width, height = struct.unpack(">II", png[16:24])
    report = parse_json(report_path.read_bytes())
    require(report.get("font_family") == "Noto Sans CJK KR"
            and report.get("font_license") == "SIL Open Font License 1.1"
            and report.get("missing_codepoint_count") == 0
            and isinstance(report.get("korean_codepoint_count"), int)
            and report["korean_codepoint_count"] > 0,
            "BLOCKED_POLISH_FONT")
    return {
        "source_svg_sha256": digest(svg), "preview_png_sha256": digest(png),
        "preview_png_base64": base64.b64encode(png).decode("ascii"),
        "width": width, "height": height, "font_family": report["font_family"],
        "font_file": report["font_file"], "font_license": report["font_license"],
        "korean_codepoint_count": report["korean_codepoint_count"],
    }


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
    value["infographic_preview"] = font_preview(
        Path(args.png), Path(args.font_report),
        package["files"]["publish/" + package["intent"]["infographic"]],
    )
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
    for name in ("old-artifact-json", "old-artifact-zip", "output", "result", "head-sha"):
        build_parser.add_argument("--" + name, required=True)
    build_parser.add_argument("--run-id", required=True, type=int)
    request_parser = sub.add_parser("request")
    for name in ("package", "artifact-json", "png", "font-report", "output"):
        request_parser.add_argument("--" + name, required=True)
    issue_parser = sub.add_parser("issue")
    for name in ("package", "artifact-json", "artifact-zip", "output"):
        issue_parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    {"build": build, "request": request, "issue": issue}[args.command](args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
