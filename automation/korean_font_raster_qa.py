"""Fail-closed Korean font preparation for a private SVG raster derivative."""
from __future__ import annotations

import argparse
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

from fontTools.ttLib import TTCollection, TTFont

FONT_FAMILY = "Noto Sans CJK KR"
FONT_CHAIN = '"Noto Sans CJK KR","Noto Sans KR",sans-serif'
FONT_LICENSE = "SIL Open Font License 1.1"


def korean(codepoint: int) -> bool:
    return (0x1100 <= codepoint <= 0x11FF or 0x3130 <= codepoint <= 0x318F
            or 0xAC00 <= codepoint <= 0xD7A3)


def cmap(path: Path) -> set[int]:
    fonts = TTCollection(str(path), lazy=True).fonts if path.suffix.lower() == ".ttc" else [TTFont(str(path), lazy=True)]
    result: set[int] = set()
    try:
        for font in fonts:
            for table in font["cmap"].tables:
                if table.isUnicode():
                    result.update(table.cmap)
    finally:
        for font in fonts:
            font.close()
    return result


def prepare(source: Path, font_path: Path, output: Path, report_path: Path) -> dict:
    if re.fullmatch(r"NotoSansCJK(?:-[A-Za-z0-9]+)?\.(?:ttc|otf)", font_path.name) is None:
        raise SystemExit("BLOCKED_KOREAN_FONT_IDENTITY")
    raw = source.read_bytes()
    text = raw.decode("utf-8")
    if "\ufffd" in text or "\u25a1" in text:
        raise SystemExit("BLOCKED_SVG_BROKEN_TEXT")
    root = ET.fromstring(raw)
    codepoints = sorted({ord(char) for value in root.itertext() for char in value if korean(ord(char))})
    if not codepoints:
        raise SystemExit("BLOCKED_SVG_KOREAN_TEXT_MISSING")
    available = cmap(font_path)
    missing = [value for value in codepoints if value not in available]
    if missing:
        raise SystemExit("BLOCKED_KOREAN_FONT_GLYPHS:" + ",".join(f"U+{value:04X}" for value in missing))
    changed = 0
    for node in root.iter():
        if "font-family" in node.attrib:
            node.set("font-family", FONT_CHAIN)
            changed += 1
    if changed == 0:
        raise SystemExit("BLOCKED_SVG_FONT_FAMILY_MISSING")
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    output.write_bytes(ET.tostring(root, encoding="utf-8", xml_declaration=True))
    report = {
        "font_family": FONT_FAMILY,
        "font_file": font_path.name,
        "font_license": FONT_LICENSE,
        "korean_codepoint_count": len(codepoints),
        "missing_codepoint_count": 0,
        "font_family_nodes": changed,
        "source_svg_changed": False,
        "raster_input_only": True,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-svg", required=True, type=Path)
    parser.add_argument("--font-file", required=True, type=Path)
    parser.add_argument("--output-svg", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    prepare(args.source_svg, args.font_file, args.output_svg, args.report)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
