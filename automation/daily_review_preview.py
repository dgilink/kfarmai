"""Build a read-only REVIEW preview from already sealed Artifact bytes."""
from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

from PIL import Image

from kfarmai_review_approval import (
    REPOSITORY, canonical, digest, parse_json, read_archive, require, verify_package,
)

ALLOWED_SVG_TAGS = {"svg", "rect", "circle", "text"}
ALLOWED_SVG_ATTRS = {
    "xmlns", "width", "height", "viewBox", "x", "y", "rx", "r", "cx", "cy",
    "fill", "stroke", "font-size", "font-weight", "font-family", "text-anchor",
    "dominant-baseline",
}


def _validate_svg(data: bytes) -> str:
    require(len(data) <= 200_000 and not re.search(
        rb"<!DOCTYPE|<!ENTITY|<script|<foreignObject|<image|<use|<iframe|<object|<embed|<style|"
        rb"\bon\w+\s*=|(?:href|xlink:href|src)\s*=|url\s*\(|javascript:|data:", data, re.I),
        "BLOCKED_PREVIEW_SVG")
    try:
        text = data.decode("utf-8")
        root = ET.fromstring(data)
    except (UnicodeError, ET.ParseError) as error:
        raise ValueError("BLOCKED_PREVIEW_SVG") from error
    for element in root.iter():
        require(element.tag.rsplit("}", 1)[-1] in ALLOWED_SVG_TAGS, "BLOCKED_PREVIEW_SVG")
        for name, value in element.attrib.items():
            require(name.rsplit("}", 1)[-1] in ALLOWED_SVG_ATTRS
                    and not re.search(r"url\s*\(|javascript:|data:|https?://", value, re.I),
                    "BLOCKED_PREVIEW_SVG")
    return text


def _preview(files: dict[str, bytes], manifest: dict, intent: dict) -> dict:
    article = parse_json(files["article.json"])
    review = parse_json(files["review.json"])
    source = parse_json(files["source-check.json"])
    html_path = "publish/" + intent["html"]
    hero_path = "publish/" + intent["hero"]
    svg_path = "publish/" + intent["infographic"]
    html = files[html_path]
    hero = files[hero_path]
    svg = files[svg_path]
    entries = {item["path"]: item for item in manifest["immutable_files"]}
    require(set(entries) == {html_path, hero_path, svg_path}, "BLOCKED_PREVIEW_BINDING")
    for path, body in ((html_path, html), (hero_path, hero), (svg_path, svg)):
        require(entries[path]["size"] == len(body) and entries[path]["sha256"] == digest(body),
                "BLOCKED_PREVIEW_BINDING")
    try:
        article_html = html.decode("utf-8")
    except UnicodeError as error:
        raise ValueError("BLOCKED_PREVIEW_HTML") from error
    require(article_html.startswith("<!doctype html><html lang=\"ko\">")
            and article["title"] in article_html and article["safety_note"] in article_html,
            "BLOCKED_PREVIEW_HTML")
    with Image.open(io.BytesIO(hero)) as image:
        require(image.format == "WEBP" and image.width >= 800 and image.height >= 450,
                "BLOCKED_PREVIEW_HERO")
        image.verify()
    svg_text = _validate_svg(svg)
    return {
        "article": article,
        "review": review,
        "source_check": source,
        "article_html": article_html,
        "hero_base64": base64.b64encode(hero).decode("ascii"),
        "infographic_svg": svg_text,
        "article_sha256": manifest["article_sha256"],
        "html_sha256": entries[html_path]["sha256"],
        "hero_sha256": entries[hero_path]["sha256"],
        "infographic_sha256": entries[svg_path]["sha256"],
    }


def from_package_directory(directory: str | Path) -> dict:
    directory = Path(directory)
    files = {path.relative_to(directory).as_posix(): path.read_bytes()
             for path in directory.rglob("*") if path.is_file()}
    manifest = parse_json(files["manifest.json"])
    intent = parse_json(files["publish-intent.json"])
    require(files["manifest.json"] == canonical(manifest)
            and files["manifest.sha256"] == (digest(files["manifest.json"]) + "\n").encode(),
            "BLOCKED_PREVIEW_BINDING")
    return _preview(files, manifest, intent)


def from_artifact(raw: bytes, artifact: dict, approval_id: str, artifact_id: int,
                  manifest_sha256: str) -> dict:
    run_id = artifact.get("workflow_run", {}).get("id")
    meta = {
        "repository": REPOSITORY, "approval_id": approval_id,
        "manifest_sha256": manifest_sha256, "run_id": run_id,
        "artifact_id": artifact_id, "artifact_name": artifact.get("name"),
        "artifact_digest": artifact.get("digest"), "state": "REVIEW",
    }
    intent, _, manifest = verify_package(raw, meta, artifact)
    files = read_archive(raw)
    return _preview(files, manifest, intent)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-json", required=True)
    parser.add_argument("--artifact-zip", required=True)
    parser.add_argument("--approval-id", required=True)
    parser.add_argument("--artifact-id", required=True, type=int)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    artifact = json.loads(Path(args.artifact_json).read_bytes())
    require(artifact.get("id") == args.artifact_id and artifact.get("expired") is False,
            "BLOCKED_ARTIFACT_IDENTITY")
    preview = from_artifact(Path(args.artifact_zip).read_bytes(), artifact, args.approval_id,
                            args.artifact_id, args.manifest_sha256)
    request = {
        "operation": "ROTATE", "approval_id": args.approval_id,
        "artifact_id": args.artifact_id, "manifest_sha256": args.manifest_sha256,
        "preview": preview,
    }
    Path(args.output).write_bytes(canonical(request) + b"\n")


if __name__ == "__main__":
    main()
