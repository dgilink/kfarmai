"""Build and verify one immutable live REVIEW submission.

The module has no network client and cannot publish. GitHub Actions supplies the
actual run/head identity, uploads the returned nine files, downloads the
artifact ZIP, and then uses the pure verification path here before creating a
human-review Issue.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re

from approval_package import prepare_package, render_issue, write_package
from artifact_issue_contract import validate_upload_identity
from kfarmai_review_approval import (
    REPOSITORY, canonical, digest, parse_json, read_archive, require, safe_name,
)


SOURCE_FILES = (
    "article.json",
    "source-check.json",
    "publish/kb/greenhouse-irrigation-precheck.html",
    "publish/static/kb/greenhouse-irrigation-precheck-hero.webp",
    "publish/static/kb/greenhouse-irrigation-precheck-infographic.svg",
)
SOURCE_ID = "greenhouse-irrigation-precheck-20261011-r1"
PREVIEW_MANIFEST_SHA256 = "827400954b9e38af38ab894f0050ad5135b994ad14f7a5daf6697a67d0d84fff"
SOURCE_DESCRIPTOR_SHA256 = "d85f2fa9dd68acfc98e91dcd7b2a50b718a43ab12447b7cf2e4bd6ef41ea120e"
SUBMISSION_ARTIFACT_NAME = "kfarmai-review-greenhouse-irrigation-precheck-2c67ec8d4c65"


def _read_file(root: Path, name: str) -> bytes:
    name = safe_name(name)
    path = root / name
    require(path.is_file() and not path.is_symlink(), "BLOCKED_SOURCE_FILE")
    require(path.resolve().is_relative_to(root.resolve()), "BLOCKED_PATH")
    return path.read_bytes()


def load_source(directory: str | Path) -> tuple[dict, dict[str, bytes]]:
    root = Path(directory).resolve()
    require(root.is_dir() and not root.is_symlink(), "BLOCKED_SOURCE_FILE")
    descriptor_raw = _read_file(root, "source.json")
    require(digest(descriptor_raw) == SOURCE_DESCRIPTOR_SHA256,
            "BLOCKED_SOURCE_DESCRIPTOR_HASH")
    descriptor = parse_json(descriptor_raw)
    required = {
        "schema_version", "repository", "source_id", "preview_approval_id",
        "preview_manifest_sha256", "preview_archive_sha256", "date", "revision",
        "generated_at", "review_reason", "files",
    }
    require(isinstance(descriptor, dict) and set(descriptor) == required,
            "BLOCKED_SOURCE_SCHEMA")
    require(descriptor["schema_version"] == 1
            and descriptor["repository"] == REPOSITORY
            and descriptor["source_id"] == SOURCE_ID
            and descriptor["preview_manifest_sha256"] == PREVIEW_MANIFEST_SHA256,
            "BLOCKED_SOURCE_IDENTITY")
    require(re.fullmatch(r"[a-f0-9]{64}", descriptor["preview_archive_sha256"]),
            "BLOCKED_SOURCE_IDENTITY")
    require(type(descriptor["revision"]) is int and descriptor["revision"] > 0,
            "BLOCKED_SOURCE_SCHEMA")
    require(isinstance(descriptor["review_reason"], str)
            and bool(descriptor["review_reason"].strip()), "BLOCKED_SOURCE_SCHEMA")
    require(set(descriptor["files"]) == set(SOURCE_FILES), "BLOCKED_SOURCE_FILES")
    actual = {name: _read_file(root, name) for name in SOURCE_FILES}
    for name, body in actual.items():
        require(re.fullmatch(r"[a-f0-9]{64}", str(descriptor["files"].get(name, "")))
                and digest(body) == descriptor["files"][name], "BLOCKED_SOURCE_HASH")
    tracked = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    require(tracked == set(SOURCE_FILES) | {"source.json"}, "BLOCKED_SOURCE_FILES")
    return descriptor, actual


def build_submission(source: str | Path, output: str | Path, *, run_id: int,
                     head_sha: str) -> dict:
    require(type(run_id) is int and run_id > 0, "BLOCKED_RUN_ID")
    require(re.fullmatch(r"[a-f0-9]{40}", head_sha or ""), "BLOCKED_HEAD_SHA")
    descriptor, files = load_source(source)
    article = parse_json(files["article.json"])
    source_check = parse_json(files["source-check.json"])
    require(canonical(article) == files["article.json"], "BLOCKED_SOURCE_CANONICAL")
    require(canonical(source_check) == files["source-check.json"], "BLOCKED_SOURCE_CANONICAL")
    slug = article.get("slug")
    require(slug == "greenhouse-irrigation-precheck", "BLOCKED_SOURCE_IDENTITY")
    package = prepare_package(
        article=article,
        review_reason=descriptor["review_reason"],
        source_check=source_check,
        html_bytes=files[f"publish/kb/{slug}.html"],
        hero_bytes=files[f"publish/static/kb/{slug}-hero.webp"],
        svg_bytes=files[f"publish/static/kb/{slug}-infographic.svg"],
        date=descriptor["date"], run_id=run_id, head_sha=head_sha,
        revision=descriptor["revision"], generated_at=descriptor["generated_at"],
    )
    require(package["manifest"]["package_kind"] == "REVIEW"
            and package["manifest"]["publish_intent"] is True,
            "BLOCKED_PACKAGE_KIND")
    write_package(output, package)
    return {
        "approval_id": package["manifest"]["approval_id"],
        "manifest_sha256": package["manifest_sha256"],
        "artifact_name": SUBMISSION_ARTIFACT_NAME,
        "content_sha256": package["manifest"]["article_sha256"],
        "preview_approval_id": descriptor["preview_approval_id"],
        "preview_manifest_sha256": descriptor["preview_manifest_sha256"],
        "source_id": descriptor["source_id"],
    }


def _package_from_files(raw: dict[str, bytes]) -> dict:
    require(len(raw) == 9 and set(raw) == {
        "article.json", "source-check.json", "review.json", "publish-intent.json",
        "manifest.json", "manifest.sha256",
        "publish/kb/greenhouse-irrigation-precheck.html",
        "publish/static/kb/greenhouse-irrigation-precheck-hero.webp",
        "publish/static/kb/greenhouse-irrigation-precheck-infographic.svg",
    }, "BLOCKED_UNEXPECTED_FILES")
    manifest = parse_json(raw["manifest.json"])
    manifest_sha = digest(raw["manifest.json"])
    require(raw["manifest.sha256"] == (manifest_sha + "\n").encode(),
            "BLOCKED_HASH_MISMATCH")
    return {
        "files": raw, "manifest": manifest, "manifest_sha256": manifest_sha,
        "article": parse_json(raw["article.json"]),
        "review": parse_json(raw["review.json"]),
        "intent": parse_json(raw["publish-intent.json"]),
    }


def load_package(directory: str | Path) -> dict:
    root = Path(directory).resolve()
    raw = {p.relative_to(root).as_posix(): p.read_bytes()
           for p in root.rglob("*") if p.is_file() and not p.is_symlink()}
    return _package_from_files(raw)


def _upload_outputs(artifact: dict) -> dict:
    artifact_id = artifact.get("id")
    run_id = artifact.get("workflow_run", {}).get("id")
    artifact_digest = str(artifact.get("digest", ""))
    require(type(artifact_id) is int and artifact_id > 0 and type(run_id) is int
            and run_id > 0 and re.fullmatch(r"sha256:[a-f0-9]{64}", artifact_digest),
            "BLOCKED_ARTIFACT_IDENTITY")
    return {
        "artifact-id": str(artifact_id),
        "artifact-digest": artifact_digest[7:],
        "artifact-url": (f"https://github.com/{REPOSITORY}/actions/runs/"
                         f"{run_id}/artifacts/{artifact_id}"),
    }


def recover_issue_payload(source_dir: str | Path, artifact: dict, archive: bytes) -> dict:
    """Recover an uploaded package after a runner/Issue response interruption."""
    _, source_files = load_source(source_dir)
    package = _package_from_files(read_archive(archive))
    manifest = package["manifest"]
    require(manifest.get("package_kind") == "REVIEW"
            and manifest.get("publish_intent") is True
            and manifest.get("article_sha256") == digest(source_files["article.json"]),
            "BLOCKED_SOURCE_IDENTITY")
    for name in SOURCE_FILES:
        require(package["files"][name] == source_files[name], "BLOCKED_SOURCE_HASH")
    outputs = _upload_outputs(artifact)
    validate_upload_identity(outputs, artifact, manifest,
                             expected_name=SUBMISSION_ARTIFACT_NAME)
    issue = render_issue(package, artifact, uploaded_raw=archive)
    require("/kfarmai approve " + manifest["approval_id"] in issue["body"],
            "BLOCKED_ISSUE_COMMANDS")
    return issue


def create_issue_payload(package_dir: str | Path, artifact: dict, archive: bytes,
                         upload_outputs: dict) -> dict:
    package = load_package(package_dir)
    validate_upload_identity(upload_outputs, artifact, package["manifest"],
                             expected_name=SUBMISSION_ARTIFACT_NAME)
    require(read_archive(archive) == package["files"], "BLOCKED_UPLOADED_PACKAGE_CHANGED")
    issue = render_issue(package, artifact, uploaded_raw=archive)
    require("/kfarmai approve " + package["manifest"]["approval_id"] in issue["body"],
            "BLOCKED_ISSUE_COMMANDS")
    return issue


def _write_output(path: str | Path, value: dict) -> None:
    Path(path).write_bytes(canonical(value) + b"\n")


def main() -> int:
    parser = argparse.ArgumentParser(description="Immutable KFarmAI REVIEW submission")
    sub = parser.add_subparsers(dest="command", required=True)
    build = sub.add_parser("build")
    build.add_argument("--source", required=True)
    build.add_argument("--output", required=True)
    build.add_argument("--run-id", required=True, type=int)
    build.add_argument("--head-sha", required=True)
    build.add_argument("--result", required=True)
    issue = sub.add_parser("issue")
    issue.add_argument("--package", required=True)
    issue.add_argument("--artifact", required=True)
    issue.add_argument("--archive", required=True)
    issue.add_argument("--upload-outputs", required=True)
    issue.add_argument("--result", required=True)
    recover = sub.add_parser("recover-issue")
    recover.add_argument("--source", required=True)
    recover.add_argument("--artifact", required=True)
    recover.add_argument("--archive", required=True)
    recover.add_argument("--result", required=True)
    args = parser.parse_args()
    if args.command == "build":
        result = build_submission(args.source, args.output, run_id=args.run_id,
                                  head_sha=args.head_sha)
    elif args.command == "issue":
        result = create_issue_payload(
            args.package,
            parse_json(Path(args.artifact).read_bytes()),
            Path(args.archive).read_bytes(),
            parse_json(Path(args.upload_outputs).read_bytes()),
        )
    else:
        result = recover_issue_payload(
            args.source,
            parse_json(Path(args.artifact).read_bytes()),
            Path(args.archive).read_bytes(),
        )
    _write_output(args.result, result)
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output and args.command == "build":
        with Path(github_output).open("a", encoding="utf-8", newline="\n") as target:
            for key in ("approval_id", "manifest_sha256", "artifact_name", "content_sha256"):
                target.write(f"{key}={result[key]}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
