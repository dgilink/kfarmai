"""Fail-closed verifier for the immutable Gate C synthetic Artifact fixture."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile

EXPECTED_MANIFEST_SHA256 = "87ab0c8eec36818ec236506fde351f0d7f7b32979e47c6c1d4bef27f575e1633"
EXPECTED_ARCHIVE_SHA256 = "ca8c90d53db078d2bb666efc136cc70bb0b97f5a34ebca44c3c1bd444ccaaed3"
EXPECTED_FILES = frozenset({
    "article.json",
    "manifest.json",
    "manifest.sha256",
    "publish-intent.json",
    "publish/kb/synthetic-review-check.html",
    "publish/static/kb/synthetic-review-check-hero.webp",
    "publish/static/kb/synthetic-review-check-infographic.svg",
    "review.json",
    "source-check.json",
})
EXPECTED_DIRECTORIES = frozenset(
    parent.as_posix()
    for name in EXPECTED_FILES
    for parent in PurePosixPath(name).parents
    if parent.as_posix() != "."
)
MAX_TOTAL_BYTES = 32 * 1024 * 1024


class Blocked(ValueError):
    """A non-sensitive fail-closed verification result."""


def _blocked(code: str) -> None:
    raise Blocked(code)


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _json(data: bytes) -> object:
    try:
        return json.loads(data)
    except (UnicodeError, ValueError, TypeError) as error:
        raise Blocked("BLOCKED_SCHEMA") from error


def _canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"),
                      allow_nan=False).encode("utf-8")


def _archive_bytes(files: dict[str, bytes]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, body in sorted(files.items()):
            info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, body)
    return output.getvalue()


def _is_link_or_reparse(path: Path) -> bool:
    if path.is_symlink():
        return True
    attrs = getattr(path.lstat(), "st_file_attributes", 0)
    return bool(attrs & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0))


def load_fixture(root: Path) -> dict[str, bytes]:
    root = root.resolve(strict=True)
    if not root.is_dir() or _is_link_or_reparse(root):
        _blocked("BLOCKED_FILE_TYPE")
    files: dict[str, bytes] = {}
    total = 0
    for path in sorted(root.rglob("*")):
        if _is_link_or_reparse(path):
            _blocked("BLOCKED_FILE_TYPE")
        relative = path.relative_to(root)
        name = PurePosixPath(*relative.parts).as_posix()
        if any(part.startswith(".") for part in relative.parts):
            _blocked("BLOCKED_HIDDEN_FILE")
        if path.is_dir():
            continue
        if not path.is_file() or name in files:
            _blocked("BLOCKED_FILE_TYPE")
        body = path.read_bytes()
        total += len(body)
        if total > MAX_TOTAL_BYTES:
            _blocked("BLOCKED_ARCHIVE_SIZE")
        files[name] = body
    if set(files) != EXPECTED_FILES:
        _blocked("BLOCKED_UNEXPECTED_FILES")
    return files


def load_download_archive(path: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    total = 0
    try:
        with zipfile.ZipFile(path) as archive:
            for info in archive.infolist():
                name = info.filename
                normalized = name[:-1] if info.is_dir() and name.endswith("/") else name
                pure = PurePosixPath(normalized)
                if (pure.is_absolute() or pure.as_posix() != normalized
                        or any(part in {"", ".", ".."} or part.startswith(".")
                               for part in pure.parts)):
                    _blocked("BLOCKED_PATH")
                mode = info.external_attr >> 16
                if info.is_dir():
                    if normalized not in EXPECTED_DIRECTORIES:
                        _blocked("BLOCKED_UNEXPECTED_FILES")
                    continue
                if stat.S_IFMT(mode) not in {0, stat.S_IFREG} or name.casefold() in {
                        existing.casefold() for existing in files}:
                    _blocked("BLOCKED_FILE_TYPE")
                body = archive.read(info)
                total += len(body)
                if total > MAX_TOTAL_BYTES:
                    _blocked("BLOCKED_ARCHIVE_SIZE")
                files[name] = body
    except (zipfile.BadZipFile, OSError, RuntimeError) as error:
        if isinstance(error, Blocked):
            raise
        raise Blocked("BLOCKED_ARCHIVE") from error
    if set(files) != EXPECTED_FILES:
        _blocked("BLOCKED_UNEXPECTED_FILES")
    return files


def verify_files(files: dict[str, bytes]) -> dict[str, object]:
    if set(files) != EXPECTED_FILES:
        _blocked("BLOCKED_UNEXPECTED_FILES")
    archive_sha = _digest(_archive_bytes(files))
    if archive_sha != EXPECTED_ARCHIVE_SHA256:
        _blocked("BLOCKED_ARCHIVE_HASH")
    manifest_bytes = files["manifest.json"]
    manifest_sha = _digest(manifest_bytes)
    if (manifest_sha != EXPECTED_MANIFEST_SHA256
            or files["manifest.sha256"] != (manifest_sha + "\n").encode("ascii")):
        _blocked("BLOCKED_HASH_MISMATCH")
    manifest = _json(manifest_bytes)
    if not isinstance(manifest, dict) or manifest_bytes != _canonical(manifest):
        _blocked("BLOCKED_SCHEMA")
    if (manifest.get("schema_version") != 2
            or manifest.get("repository") != "dgilink/kfarmai"
            or manifest.get("source_head_sha") != "b768656c95eb5f511deb637f74281a2dae4fa10f"
            or manifest.get("source_run_id") != 915001
            or manifest.get("approval_id") != "review-915001-r1-10b198ee467b"):
        _blocked("BLOCKED_MANIFEST_IDENTITY")
    direct = {
        "article.json": "article_sha256",
        "review.json": "review_sha256",
        "source-check.json": "source_check_sha256",
        "publish-intent.json": "publish_intent_sha256",
    }
    for filename, field in direct.items():
        if _digest(files[filename]) != manifest.get(field):
            _blocked("BLOCKED_HASH_MISMATCH")
    immutable = manifest.get("immutable_files")
    if not isinstance(immutable, list) or len(immutable) != 3:
        _blocked("BLOCKED_SCHEMA")
    for entry in immutable:
        if (not isinstance(entry, dict) or entry.get("path") not in files
                or entry.get("size") != len(files[entry["path"]])
                or entry.get("sha256") != _digest(files[entry["path"]])):
            _blocked("BLOCKED_HASH_MISMATCH")
    article = _json(files["article.json"])
    review = _json(files["review.json"])
    intent = _json(files["publish-intent.json"])
    source = _json(files["source-check.json"])
    if (not all(isinstance(value, dict) for value in (article, review, intent, source))
            or article.get("risk") != "REVIEW"
            or review.get("risk") != "REVIEW"
            or source.get("status") != "PASS"
            or intent.get("approval_id") != manifest["approval_id"]
            or review.get("approval_id") != manifest["approval_id"]):
        _blocked("BLOCKED_CANARY_PACKAGE")
    return {
        "status": "PASS",
        "file_count": len(files),
        "total_bytes": sum(map(len, files.values())),
        "manifest_sha256": manifest_sha,
        "canonical_archive_sha256": archive_sha,
        "approval_id": manifest["approval_id"],
        "synthetic": True,
        "publish_allowed": False,
    }


def verify_fixture(root: Path) -> dict[str, object]:
    return verify_files(load_fixture(root))


def verify_download(path: Path) -> dict[str, object]:
    return verify_files(load_download_archive(path))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--download-zip", action="store_true")
    args = parser.parse_args()
    try:
        result = verify_download(args.path) if args.download_zip else verify_fixture(args.path)
    except (Blocked, OSError, ValueError) as error:
        print(json.dumps({"status": "BLOCKED", "reason": str(error)}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
