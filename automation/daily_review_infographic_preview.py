"""Build a private PNG preview request from an immutable REVIEW Artifact."""
from __future__ import annotations

import argparse
import base64
import json
import re
import struct
from hashlib import sha256
from pathlib import Path

from daily_review_issue import load_package
from kfarmai_review_approval import canonical, parse_json, read_archive, require, verify_package

APPROVAL_ID = "review-39236736411-r2-fb2cfdd0ee4c"
ARTIFACT_ID = 12179407364
MANIFEST_SHA256 = "127932cab29cd6659947fda744e312a7f90c0042c6ed6600e1b9233ccec73d3a"
ARTIFACT_NAME = "review-review-39236736411-r2-fb2cfdd0ee4c"
RUN_ID = 39236736411
SLUG = "greenhouse-heating-preflight-notes"


def digest(value: bytes) -> str:
    return sha256(value).hexdigest()


def request(args) -> dict:
    package = load_package(args.package)
    artifact = parse_json(Path(args.artifact_json).read_bytes())
    require(artifact.get("id") == ARTIFACT_ID and artifact.get("name") == ARTIFACT_NAME
            and artifact.get("expired") is False, "BLOCKED_PREVIEW_ARTIFACT")
    meta = {"repository": "dgilink/kfarmai", "approval_id": APPROVAL_ID,
            "manifest_sha256": MANIFEST_SHA256, "run_id": RUN_ID,
            "artifact_id": ARTIFACT_ID, "artifact_name": ARTIFACT_NAME,
            "artifact_digest": artifact.get("digest"), "state": "REVIEW"}
    intent, _, _ = verify_package(Path(args.artifact_zip).read_bytes(), meta, artifact)
    require(package["manifest"]["approval_id"] == APPROVAL_ID
            and package["manifest_sha256"] == MANIFEST_SHA256
            and intent["slug"] == SLUG, "BLOCKED_PREVIEW_BINDING")
    files = read_archive(Path(args.artifact_zip).read_bytes())
    svg_path = "publish/" + intent["infographic"]
    svg = files[svg_path]
    svg_entry = next((item for item in package["manifest"]["immutable_files"]
                      if item["path"] == svg_path), None)
    require(svg_entry is not None and digest(svg) == svg_entry["sha256"], "BLOCKED_PREVIEW_SVG")
    text = svg.decode("utf-8")
    root = re.match(r'^<svg\s+[^>]*width="([0-9]+)"[^>]*height="([0-9]+)"[^>]*viewBox="0 0 ([0-9]+) ([0-9]+)"', text)
    require(root is not None, "BLOCKED_PREVIEW_SVG_DIMENSIONS")
    width, height, view_width, view_height = map(int, root.groups())
    require((width, height) == (view_width, view_height), "BLOCKED_PREVIEW_SVG_DIMENSIONS")
    lowered = text.lower().replace("http://www.w3.org/2000/svg", "")
    forbidden = (r'<!doctype|<!entity|<\s*(script|foreignobject|image|use|iframe|object|embed|style|a)([ >])'
                 r'|\son[a-z]+\s*=|(^|[^a-z])(href|xlink:href|src)\s*=|url\s*\(|javascript:|data:|https?://')
    require(re.search(forbidden, lowered) is None, "BLOCKED_PREVIEW_SVG_UNSAFE")
    png = Path(args.png).read_bytes()
    require(png[:8] == b"\x89PNG\r\n\x1a\n" and len(png) >= 33, "BLOCKED_PREVIEW_PNG")
    png_width, png_height = struct.unpack(">II", png[16:24])
    require((png_width, png_height) == (width, height), "BLOCKED_PREVIEW_PNG_DIMENSIONS")
    font = parse_json(Path(args.font_report).read_bytes())
    require(font.get("font_family") == "Noto Sans CJK KR"
            and font.get("font_license") == "SIL Open Font License 1.1"
            and font.get("missing_codepoint_count") == 0
            and isinstance(font.get("korean_codepoint_count"), int)
            and font["korean_codepoint_count"] > 0
            and font.get("source_svg_changed") is False
            and font.get("raster_input_only") is True, "BLOCKED_PREVIEW_FONT")
    value = {"operation": "INFOGRAPHIC_PREVIEW", "approval_id": APPROVAL_ID,
             "artifact_id": ARTIFACT_ID, "manifest_sha256": MANIFEST_SHA256,
             "source_svg_sha256": digest(svg), "preview_png_sha256": digest(png),
             "preview_png_base64": base64.b64encode(png).decode("ascii"),
             "width": width, "height": height,
             "replace_preview_sha256": args.replace_preview_sha256,
             "font_family": font["font_family"], "font_file": font["font_file"],
             "font_license": font["font_license"],
             "korean_codepoint_count": font["korean_codepoint_count"]}
    Path(args.output).write_bytes(canonical(value) + b"\n")
    return value


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--package", required=True)
    parser.add_argument("--artifact-json", required=True)
    parser.add_argument("--artifact-zip", required=True)
    parser.add_argument("--png", required=True)
    parser.add_argument("--font-report", required=True)
    parser.add_argument("--replace-preview-sha256", required=True)
    parser.add_argument("--output", required=True)
    request(parser.parse_args())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
