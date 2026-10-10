"""Immutable REVIEW package verification and local publication planning. No AI.

Network/Issue operations live in review_approval_workflow.py. This module has no
Git commit, push, deployment or remote mutation capability.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import tempfile
import urllib.error
import xml.etree.ElementTree as ET
import zipfile

from kfarmai_post_publish_audit import audit_published_content, SECRET_PATTERNS, _parse_html, _title_matches
from source_policy import load_domains

REPOSITORY = "dgilink/kfarmai"
MARKER = re.compile(r"<!-- kfarmai-review\n(.*?)\n-->", re.S)
HEX = re.compile(r"[a-f0-9]{64}\Z")
ID = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}\Z")
LIMIT = 32 * 1024 * 1024
REGISTRY = "automation/daily_registry.json"
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
TRANSITIONS = {
    "REVIEW": {"APPROVED_VERIFYING", "HOLD", "EDIT_REQUESTED"},
    "APPROVED_VERIFYING": {"APPROVED", "HOLD", "EDIT_REQUESTED", "REVIEW_REQUIRED"},
    "APPROVED": {"PUBLISHED_PENDING_VERIFY", "HOLD", "EDIT_REQUESTED", "REVIEW_REQUIRED"},
    "PUBLISHED_PENDING_VERIFY": {"PUBLISHED", "REVIEW_REQUIRED"},
    "PUBLISHED": {"AUDIT_PASS", "REVIEW_REQUIRED"},
    "AUDIT_PASS": set(), "REVIEW_REQUIRED": set(), "HOLD": set(), "EDIT_REQUESTED": set(),
}


class Blocked(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def require(condition, code):
    if not condition:
        raise Blocked(code)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def parse_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "BLOCKED_SCHEMA")
            result[key] = value
        return result
    try:
        return json.loads(data, object_pairs_hook=unique, parse_constant=lambda _: require(False, "BLOCKED_SCHEMA"))
    except (ValueError, UnicodeError, TypeError) as error:
        if isinstance(error, Blocked):
            raise
        raise Blocked("BLOCKED_SCHEMA") from error


def metadata(issue):
    require(issue.get("title", "").startswith("[KFarmAI Daily][REVIEW]"), "BLOCKED_ISSUE_PREFIX")
    require(not issue.get("pull_request"), "BLOCKED_PR_ISSUE")
    matches = MARKER.findall(issue.get("body", ""))
    require(len(matches) == 1, "BLOCKED_ISSUE_METADATA")
    value = parse_json(matches[0])
    require(isinstance(value, dict), "BLOCKED_ISSUE_METADATA")
    require(value.get("repository") == REPOSITORY, "BLOCKED_REPOSITORY")
    require(ID.fullmatch(str(value.get("approval_id", ""))), "BLOCKED_APPROVAL_ID")
    require(HEX.fullmatch(str(value.get("manifest_sha256", ""))), "BLOCKED_HASH_MISMATCH")
    require(re.fullmatch(r"sha256:[a-f0-9]{64}", str(value.get("artifact_digest", ""))), "BLOCKED_ARTIFACT_IDENTITY")
    for name in ("run_id", "artifact_id"):
        require(type(value.get(name)) is int and value[name] > 0, "BLOCKED_ARTIFACT_IDENTITY")
    require(re.fullmatch(r"[A-Za-z0-9_-]{1,128}", str(value.get("artifact_name", ""))), "BLOCKED_ARTIFACT_IDENTITY")
    require(value.get("state") in TRANSITIONS, "BLOCKED_ISSUE_STATE")
    return value


def authorize(event, current_issue=None):
    repo = event.get("repository", {})
    owner = repo.get("owner", {})
    comment = event.get("comment", {})
    actor = comment.get("user", {})
    require(event.get("action") == "created" and repo.get("full_name") == REPOSITORY, "BLOCKED_EVENT")
    require(owner.get("login", "").casefold() == "dgilink" and actor.get("login", "").casefold() == "dgilink"
            and owner.get("id") and actor.get("id") == owner["id"], "BLOCKED_COMMENTER")
    require(event.get("sender", {}).get("id") == actor["id"], "BLOCKED_COMMENTER")
    issue = current_issue or event.get("issue", {})
    require(issue.get("number") == event.get("issue", {}).get("number"), "BLOCKED_ISSUE_METADATA")
    author = issue.get("user", {})
    require(author.get("id") == owner["id"] or
            (author.get("login") == "github-actions[bot]" and author.get("id") == 41898282), "BLOCKED_ISSUE_AUTHOR")
    meta = metadata(issue)
    require(meta == metadata(event["issue"]), "BLOCKED_ISSUE_CHANGED")
    match = re.fullmatch(r"/kfarmai (approve|hold|edit) ([A-Za-z0-9_-]+) ([a-f0-9]{64})", comment.get("body", "").strip())
    require(match is not None, "BLOCKED_COMMAND")
    action, approval_id, manifest_hash = match.groups()
    require(approval_id == meta["approval_id"], "BLOCKED_APPROVAL_ID")
    require(manifest_hash == meta["manifest_sha256"], "BLOCKED_HASH_MISMATCH")
    require(issue.get("state") == "open", "BLOCKED_ISSUE_CLOSED")
    require(meta["state"] not in {"HOLD", "EDIT_REQUESTED"}, meta["state"])
    return action, meta


def transition(meta, state, **receipt):
    require(state in TRANSITIONS.get(meta["state"], set()), "BLOCKED_STATE_TRANSITION")
    require(not ({"approval_id", "manifest_sha256", "run_id", "artifact_id", "artifact_name", "artifact_digest", "repository", "state"} & receipt.keys()), "BLOCKED_RECEIPT")
    result = {**meta, **receipt, "state": state}
    if state in {"PUBLISHED", "AUDIT_PASS"}:
        require(all(result.get(key) for key in ("approval_id", "manifest_sha256", "commit_sha", "title", "production_url", "published_at", "audit_status")), "BLOCKED_RECEIPT")
        require(re.fullmatch(r"[a-f0-9]{40}", result["commit_sha"]) and result.get("production_verified") is True, "BLOCKED_RECEIPT")
    if state == "AUDIT_PASS":
        require(result.get("audit_status") == "PASS", "BLOCKED_AUDIT_NOT_PASSED")
    return result


def issue_body(issue, new_metadata):
    # Only replace the one machine marker; preserve the author's prose.
    metadata(issue)
    return MARKER.sub(lambda _: "<!-- kfarmai-review\n" + canonical(new_metadata).decode() + "\n-->", issue["body"])


def artifact_identity(meta, artifact, now=None):
    require(artifact is not None, "BLOCKED_ARTIFACT_MISSING")
    require(not artifact.get("expired"), "BLOCKED_ARTIFACT_EXPIRED")
    now = now or dt.datetime.now(dt.timezone.utc)
    try:
        expires = dt.datetime.fromisoformat(artifact["expires_at"].replace("Z", "+00:00"))
        require(expires > now, "BLOCKED_ARTIFACT_EXPIRED")
    except (KeyError, ValueError, TypeError) as error:
        if isinstance(error, Blocked):
            raise
        raise Blocked("BLOCKED_ARTIFACT_IDENTITY") from error
    require(artifact.get("id") == meta["artifact_id"] and artifact.get("name") == meta["artifact_name"]
            and artifact.get("workflow_run", {}).get("id") == meta["run_id"], "BLOCKED_ARTIFACT_IDENTITY")
    require(re.fullmatch(r"sha256:[a-f0-9]{64}", artifact.get("digest", "")), "BLOCKED_HASH_MISMATCH")
    require(meta.get("artifact_digest") == artifact["digest"], "BLOCKED_ARTIFACT_IDENTITY")


def safe_name(name):
    require(isinstance(name, str) and len(name) <= 200 and not any(c in name for c in ("\\", ":", "\x00")), "BLOCKED_PATH")
    p = PurePosixPath(name)
    require(not p.is_absolute() and p.as_posix() == name and all(part not in {".", "..", ""} for part in name.split("/")), "BLOCKED_PATH")
    require(all(re.fullmatch(r"[a-zA-Z0-9_.-]+", part) and not part.endswith((".", " ")) for part in p.parts), "BLOCKED_PATH")
    require(all(part.split(".")[0].upper() not in {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(10)), *(f"LPT{i}" for i in range(10))} for part in p.parts), "BLOCKED_PATH")
    return name


def read_archive(raw):
    require(len(raw) <= LIMIT, "BLOCKED_ARCHIVE_SIZE")
    files = {}
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            infos = archive.infolist()
            require(len(infos) <= 10 and sum(i.file_size for i in infos) <= LIMIT, "BLOCKED_ARCHIVE_SIZE")
            names = set()
            for info in infos:
                safe_name(info.orig_filename)
                name = safe_name(info.filename)
                require(name.casefold() not in names, "BLOCKED_UNEXPECTED_FILES")
                names.add(name.casefold())
                mode = info.external_attr >> 16
                require(not info.is_dir() and stat.S_IFMT(mode) in {0, stat.S_IFREG}
                        and not info.flag_bits & 1 and not info.external_attr & 0x10, "BLOCKED_FILE_TYPE")
                # Reject ZIP UNIX link metadata (incl. hardlinks); only timestamp extras accepted.
                extra = info.extra
                while extra:
                    require(len(extra) >= 4, "BLOCKED_FILE_TYPE")
                    kind, size = int.from_bytes(extra[:2], "little"), int.from_bytes(extra[2:4], "little")
                    require(kind in {0x5455, 0x000A} and len(extra) >= size + 4, "BLOCKED_FILE_TYPE")
                    extra = extra[size + 4:]
                files[name] = archive.read(info)
    except (zipfile.BadZipFile, RuntimeError, OSError) as error:
        raise Blocked("BLOCKED_ARCHIVE") from error
    return files


def verify_package(raw, meta, artifact):
    artifact_identity(meta, artifact)
    require(digest(raw) == artifact["digest"][7:], "BLOCKED_HASH_MISMATCH")
    files = read_archive(raw)
    require({"manifest.json", "manifest.sha256", "publish-intent.json"} <= files.keys(), "LEGACY_REVIEW_PACKAGE_INCOMPLETE")
    require(digest(files["manifest.json"]) == meta["manifest_sha256"], "BLOCKED_HASH_MISMATCH")
    manifest = parse_json(files["manifest.json"])
    require(isinstance(manifest, dict), "BLOCKED_SCHEMA")
    if manifest.get("schema_version") == 2:
        return verify_v2_files(files, meta, artifact, manifest)
    require("content.json" in files, "LEGACY_REVIEW_PACKAGE_INCOMPLETE")
    manifest_hash = digest(canonical(manifest))
    require(files["manifest.sha256"] == (manifest_hash + "\n").encode()
            and meta["manifest_sha256"] == manifest_hash
            and files["manifest.json"] == canonical(manifest), "BLOCKED_HASH_MISMATCH")
    require(manifest.get("version") == 1 and manifest.get("repository") == REPOSITORY
            and manifest.get("approval_id") == meta["approval_id"] and manifest.get("source_run_id") == meta["run_id"], "BLOCKED_MANIFEST_IDENTITY")
    require(type(manifest.get("revision")) is int and manifest["revision"] >= 1, "BLOCKED_SCHEMA")
    require(manifest.get("source_head_sha") == artifact["workflow_run"].get("head_sha")
            and re.fullmatch(r"[a-f0-9]{40}", str(manifest.get("source_head_sha", ""))), "BLOCKED_ARTIFACT_IDENTITY")
    hashes = manifest.get("files")
    require(isinstance(hashes, dict) and set(files) == set(hashes) | {"manifest.json", "manifest.sha256"}, "BLOCKED_UNEXPECTED_FILES")
    for name, expected in hashes.items():
        safe_name(name)
        require(isinstance(expected, str) and HEX.fullmatch(expected) and digest(files[name]) == expected, "BLOCKED_HASH_MISMATCH")
    return validate_content(files, meta, artifact, manifest)


def validate_content(files, meta, artifact, manifest):
    hashes = manifest["files"]
    intent = parse_json(files["publish-intent.json"])
    keys = {"approval_id", "revision", "slug", "title", "url", "category", "date", "source_urls", "source_run_id", "content_sha256", "html", "hero", "infographic"}
    require(isinstance(intent, dict) and set(intent) == keys, "BLOCKED_PUBLISH_INTENT")
    require(intent["approval_id"] == meta["approval_id"] and intent["source_run_id"] == meta["run_id"]
            and intent["revision"] == manifest["revision"], "BLOCKED_PUBLISH_INTENT")
    slug = intent["slug"]
    require(isinstance(slug, str) and re.fullmatch(r"[a-z0-9][a-z0-9-]{4,80}", slug), "BLOCKED_PATH")
    require(intent["url"] == f"https://kfarmai.com/kb/{slug}.html", "BLOCKED_PUBLISH_INTENT")
    expected_paths = {"html": f"kb/{slug}.html", "hero": f"static/kb/{slug}-hero.webp", "infographic": f"static/kb/{slug}-infographic.svg"}
    require(all(intent[k] == v for k, v in expected_paths.items()) and set(hashes) == set(expected_paths.values()) | {"content.json", "publish-intent.json"}, "BLOCKED_PATH")
    require(all(isinstance(intent[k], str) and 0 < len(intent[k]) < 300 for k in ("title", "category", "date")), "BLOCKED_PUBLISH_INTENT")
    require(not re.search(r"[<>\r\n]", intent["title"] + intent["category"]), "BLOCKED_PUBLISH_INTENT")
    try:
        require(dt.date.fromisoformat(intent["date"]).isoformat() == intent["date"], "BLOCKED_PUBLISH_INTENT")
    except ValueError as error:
        raise Blocked("BLOCKED_PUBLISH_INTENT") from error
    content = parse_json(files["content.json"])
    require(files["content.json"] == canonical(content) and digest(files["content.json"]) == intent["content_sha256"], "BLOCKED_HASH_MISMATCH")
    require(isinstance(content, dict) and content.get("title") == intent["title"] and content.get("risk") == "REVIEW"
            and isinstance(content.get("sources"), list)
            and [s.get("url") for s in content["sources"] if isinstance(s, dict)] == intent["source_urls"], "BLOCKED_PUBLISH_INTENT")
    for body in files.values():
        require(not any(pattern.search(body.decode("utf-8", errors="replace")) for _, pattern in SECRET_PATTERNS), "BLOCKED_SECRET")
    hero = files[intent["hero"]]
    require(hero[:4] == b"RIFF" and hero[8:12] == b"WEBP", "BLOCKED_FILE_TYPE")
    svg = files[intent["infographic"]]
    require(not re.search(rb"<!DOCTYPE|<!ENTITY|<script|\bon\w+\s*=|<foreignObject|(?:href|src)\s*=\s*['\"](?:https?:|data:|javascript:)", svg, re.I), "BLOCKED_FILE_TYPE")
    try:
        require(ET.fromstring(svg).tag.rsplit("}", 1)[-1] == "svg", "BLOCKED_FILE_TYPE")
    except ET.ParseError as error:
        raise Blocked("BLOCKED_FILE_TYPE") from error
    return intent, files, manifest


def verify_v2_files(files, meta, artifact, manifest):
    """Verify the generated nine-file package without regenerating any bytes."""
    require(files["manifest.json"] == canonical(manifest)
            and files["manifest.sha256"] == (meta["manifest_sha256"] + "\n").encode(), "BLOCKED_HASH_MISMATCH")
    require(manifest.get("repository") == REPOSITORY and manifest.get("approval_id") == meta["approval_id"]
            and manifest.get("source_run_id") == meta["run_id"]
            and manifest.get("source_head_sha") == artifact["workflow_run"].get("head_sha"), "BLOCKED_MANIFEST_IDENTITY")
    require(re.fullmatch(r"[a-f0-9]{40}", str(manifest.get("source_head_sha", "")))
            and type(manifest.get("revision")) is int and manifest["revision"] > 0, "BLOCKED_SCHEMA")
    metadata_files = {"article.json": "article_sha256", "review.json": "review_sha256",
                      "source-check.json": "source_check_sha256", "publish-intent.json": "publish_intent_sha256"}
    for name, field in metadata_files.items():
        require(name in files and digest(files[name]) == manifest.get(field), "BLOCKED_HASH_MISMATCH")
        require(files[name] == canonical(parse_json(files[name])), "BLOCKED_SCHEMA")
    entries = manifest.get("immutable_files")
    require(isinstance(entries, list) and len(entries) == 3, "BLOCKED_UNEXPECTED_FILES")
    paths = []
    for entry in entries:
        require(isinstance(entry, dict) and set(entry) == {"path", "size", "sha256"}, "BLOCKED_SCHEMA")
        path = safe_name(entry["path"])
        require(path.startswith("publish/") and path in files, "BLOCKED_PATH")
        require(type(entry["size"]) is int and len(files[path]) == entry["size"]
                and digest(files[path]) == entry["sha256"], "BLOCKED_HASH_MISMATCH")
        paths.append(path)
    require(len(set(paths)) == 3 and set(files) == set(paths) | set(metadata_files) | {"manifest.json", "manifest.sha256"}, "BLOCKED_UNEXPECTED_FILES")
    intent = parse_json(files["publish-intent.json"])
    require(isinstance(intent, dict) and all(isinstance(intent.get(k), str) for k in ("html", "hero", "infographic")), "BLOCKED_PUBLISH_INTENT")
    expected = sorted([intent[k] for k in ("html", "hero", "infographic")] + ["sitemap.xml", REGISTRY])
    require(manifest.get("expected_publish_files") == expected
            and set(paths) == {"publish/" + intent[k] for k in ("html", "hero", "infographic")}, "BLOCKED_PATH")
    review, source = parse_json(files["review.json"]), parse_json(files["source-check.json"])
    require(review.get("approval_id") == meta["approval_id"] and review.get("risk") == "REVIEW"
            and review.get("title") == intent.get("title") and review.get("reason"), "BLOCKED_REVIEW")
    require(source.get("status") == "PASS" and source.get("urls") == intent.get("source_urls"), "BLOCKED_SOURCE_CHECK")
    for body in files.values():
        require(not any(p.search(body.decode("utf-8", errors="replace")) for _, p in SECRET_PATTERNS), "BLOCKED_SECRET")
    # A verified in-memory path view; the ZIP and manifest bytes are never rewritten.
    normalized = {path.removeprefix("publish/"): files[path] for path in paths}
    normalized.update({"content.json": files["article.json"], "publish-intent.json": files["publish-intent.json"]})
    view = {**manifest, "files": {name: digest(body) for name, body in normalized.items()}}
    return validate_content(normalized, meta, artifact, view)


def safe_target(root, name):
    safe_name(name)
    root = Path(root).resolve()
    target = root / name
    for path in [target, *target.parents]:
        if path == root:
            break
        require(not path.is_symlink() and not (hasattr(path, "is_junction") and path.is_junction()), "BLOCKED_PATH")
        if path.exists():
            require(path.is_dir() or (path.is_file() and path.stat().st_nlink == 1), "BLOCKED_FILE_TYPE")
    require(target.resolve().is_relative_to(root), "BLOCKED_PATH")
    return target


def sitemap_urls(data):
    require(b"<!DOCTYPE" not in data.upper() and b"<!ENTITY" not in data.upper(), "BLOCKED_SITEMAP")
    try:
        tree = ET.fromstring(data)
    except ET.ParseError as error:
        raise Blocked("BLOCKED_SITEMAP") from error
    require(tree.tag == f"{{{NS}}}urlset", "BLOCKED_SITEMAP")
    urls = [element.text or "" for element in tree.findall(f"{{{NS}}}url/{{{NS}}}loc")]
    require(len(urls) == len(set(urls)) and len(urls) == len(tree), "BLOCKED_SITEMAP")
    require(all(re.fullmatch(r"https://kfarmai\.com/[^\s<>?#]*", url) and not re.search(r"localhost|127\.0\.0\.1|preview|candidate|private|/automation/|/tests/|/docs/", url, re.I) for url in urls), "BLOCKED_SITEMAP")
    return urls


def derive_sitemap(data, intent):
    urls = sitemap_urls(data)
    require(intent["url"] not in urls, "BLOCKED_TARGET_CONFLICT")
    require(data.count(b"</urlset>") == 1, "BLOCKED_SITEMAP")
    entry = f'  <url><loc>{intent["url"]}</loc><lastmod>{intent["date"]}</lastmod></url>\n'.encode()
    result = data.replace(b"</urlset>", entry + b"</urlset>")
    require(sitemap_urls(result) == urls + [intent["url"]], "BLOCKED_SITEMAP")
    return result


def plan_publication(root, raw, meta, artifact):
    intent, files, manifest = verify_package(raw, meta, artifact)
    root = Path(root).resolve()
    reg_bytes = safe_target(root, REGISTRY).read_bytes()
    sitemap = safe_target(root, "sitemap.xml").read_bytes()
    registry = parse_json(reg_bytes)
    require(isinstance(registry, dict) and isinstance(registry.get("items"), list), "BLOCKED_REGISTRY")
    existing = [r for r in registry["items"] if r.get("slug") == intent["slug"] or r.get("approval_id") == meta["approval_id"]]
    record = {
        **{k: intent[k] for k in ("date", "title", "slug", "url", "category", "source_urls", "source_run_id", "approval_id", "content_sha256")},
        "publication_mode": "REVIEW", "manifest_sha256": meta["manifest_sha256"],
        "html_sha256": digest(files[intent["html"]]),
        "artifact_files": sorted([intent[k] for k in ("html", "hero", "infographic")] + ["sitemap.xml", REGISTRY]),
        "published_at": None, "production_verified_at": None, "post_publish_audit_status": "PENDING",
    }
    if existing:
        identity_keys = (
            "approval_id", "manifest_sha256", "slug", "title", "url", "category",
            "content_sha256", "html_sha256", "source_run_id", "source_urls", "publication_mode",
            "artifact_files", "date",
        )
        require(len(existing) == 1 and all(existing[0].get(k) == record[k] for k in identity_keys), "BLOCKED_TARGET_CONFLICT")
        require(all(safe_target(root, intent[k]).is_file() and safe_target(root, intent[k]).read_bytes() == files[intent[k]] for k in ("html", "hero", "infographic")), "BLOCKED_TARGET_CONFLICT")
        require(intent["url"] in sitemap_urls(sitemap), "BLOCKED_TARGET_CONFLICT")
        return {"status": "ALREADY_PUBLISHED", "record": existing[0], "files": {}, "before": {}}
    require(meta["state"] in {"REVIEW", "APPROVED_VERIFYING", "APPROVED"}, "BLOCKED_ISSUE_STATE")
    updates = {intent[k]: files[intent[k]] for k in ("html", "hero", "infographic")}
    for name in updates:
        require(not safe_target(root, name).exists(), "BLOCKED_TARGET_CONFLICT")
    updates["sitemap.xml"] = derive_sitemap(sitemap, intent)
    updates[REGISTRY] = canonical({**registry, "items": [*registry["items"], record]}) + b"\n"
    with tempfile.TemporaryDirectory(prefix="kfarmai-approval-qa-") as temp:
        for name, body in updates.items():
            path = Path(temp) / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        result = audit_published_content(temp, record, allowed_source_domains=load_domains(root))
        require(result["status"] == "LOCAL_PASS_NETWORK_NOT_RUN", "BLOCKED_LOCAL_AUDIT")
    return {"status": "APPROVED", "record": record, "files": updates,
            "before": {name: digest(safe_target(root, name).read_bytes()) if safe_target(root, name).exists() else None for name in updates}}


def apply_plan(root, plan):
    """Explicit local operation for a disposable fixture or authorized runner checkout."""
    require(plan["status"] == "APPROVED", "BLOCKED_PLAN")
    for name, expected in plan["before"].items():
        path = safe_target(root, name)
        actual = digest(path.read_bytes()) if path.exists() else None
        require(actual == expected, "BLOCKED_TOCTOU")
    for name, body in plan["files"].items():
        path = safe_target(root, name)
        path.parent.mkdir(parents=True, exist_ok=True)
        # New immutable files are exclusive-created. Derived files are atomically replaced.
        if plan["before"][name] is None:
            with path.open("xb") as output:
                output.write(body)
        else:
            with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
                output.write(body)
                replacement = output.name
            os.replace(replacement, path)
        require(path.read_bytes() == body, "BLOCKED_HASH_MISMATCH")
    return sorted(plan["files"])


def simulate_exact_stage(root, plan, *, index_file=None):
    """Offline only. Isolated Git index; does not stage the caller's checkout."""
    require(plan["status"] == "APPROVED", "BLOCKED_PLAN")
    for name, body in plan["files"].items():
        require(safe_target(root, name).read_bytes() == body, "BLOCKED_TOCTOU")
    names = sorted(plan["files"])
    with tempfile.TemporaryDirectory(prefix="kfarmai-index-simulation-") as temp:
        subprocess.run(["git", "init", "-q", temp], check=True)
        def git(*args, data=None):
            return subprocess.check_output(["git", *args], cwd=temp, input=data)
        for name in names:
            blob = git("hash-object", "-w", "--stdin", data=plan["files"][name]).decode().strip()
            git("update-index", "--add", "--cacheinfo", "100644", blob, name)
        actual = git("diff", "--cached", "--name-only", "-z").decode().split("\0")[:-1]
        require(sorted(actual) == names, "BLOCKED_STAGED_FILES")
        for name in names:
            require(git("show", ":" + name) == plan["files"][name], "BLOCKED_HASH_MISMATCH")
        git("-c", "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol", "diff", "--cached", "--check")
    return names


def exact_stage(root, plan):
    """Stage ONLY approved plan files in the actual disposable checkout index.

    Caller must independently ensure it is a clean authorized worktree. Never
    stage all, rewrite another index, or hide a mismatch behind simulation.
    """
    require(plan["status"] == "APPROVED", "BLOCKED_PLAN")
    root = Path(root).resolve()
    def git(*args):
        proc = subprocess.run(["git", *args], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        require(proc.returncode == 0, "BLOCKED_GIT_INDEX")
        return proc.stdout
    top = Path(git("rev-parse", "--show-toplevel").decode().strip()).resolve()
    require(top == root, "BLOCKED_GIT_ROOT")
    require(not git("diff", "--cached", "--name-only", "-z"), "BLOCKED_PREEXISTING_INDEX")
    names = sorted(plan["files"])
    for name in names:
        safe_name(name)
        body = plan["files"][name]
        require(safe_target(root, name).is_file() and safe_target(root, name).read_bytes() == body, "BLOCKED_TOCTOU")
    # Reject all changed bytes before touching any part of the caller's index.
    for name in names:
        git("add", "--", name)
    staged = sorted(x for x in git("diff", "--cached", "--name-only", "-z").decode().split("\0") if x)
    require(staged == names, "BLOCKED_STAGED_FILES")
    for name in names:
        require(git("show", ":" + name) == plan["files"][name], "BLOCKED_HASH_MISMATCH")
        flags = git("ls-files", "--stage", "--", name).decode().split()
        require(bool(flags) and flags[0] == "100644", "BLOCKED_STAGED_FILE_MODE")
    # Preserve approved Windows bytes while retaining trailing-space checks.
    git("-c", "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol", "diff", "--cached", "--check")
    return names


def plan_registry_finalization(root, record, result, *, published_at):
    """Deterministically prepare a registry-only post-deploy receipt update.

    This is NOT a read-only audit and never changes files on its own. An approved
    runner must apply and exact-stage the separate plan after production checks.
    """
    root = Path(root).resolve()
    require(result.get("production_verified") is True, "BLOCKED_PRODUCTION_VERIFY")
    audit = result.get("audit", {})
    require(audit.get("status") in {"PASS", "REVIEW_REQUIRED"}, "BLOCKED_AUDIT_RECEIPT")
    require(bool(published_at), "BLOCKED_RECEIPT")
    require(audit.get("record") == {"slug": record.get("slug"), "url": record.get("url")}, "BLOCKED_AUDIT_RECEIPT")
    registry_path = safe_target(root, REGISTRY)
    raw = registry_path.read_bytes()
    registry = parse_json(raw)
    require(isinstance(registry, dict) and isinstance(registry.get("items"), list), "BLOCKED_REGISTRY")
    matches = [(i, item) for i, item in enumerate(registry["items"])
               if item.get("approval_id") == record.get("approval_id")]
    require(len(matches) == 1, "BLOCKED_REGISTRY")
    index, existing = matches[0]
    identity_keys = ("approval_id", "manifest_sha256", "slug", "title", "url",
                     "category", "content_sha256", "html_sha256", "source_run_id",
                     "source_urls", "publication_mode", "artifact_files", "date")
    require(all(existing.get(k) == record.get(k) for k in identity_keys), "BLOCKED_TARGET_CONFLICT")
    html_file = safe_target(root, "kb/" + record["slug"] + ".html")
    require(html_file.is_file() and digest(html_file.read_bytes()) == record["html_sha256"], "BLOCKED_HASH_MISMATCH")
    status = "AUDIT_PASS" if audit["status"] == "PASS" else "REVIEW_REQUIRED"
    verified_at = audit.get("checked_at")
    require(isinstance(verified_at, str) and bool(verified_at), "BLOCKED_AUDIT_RECEIPT")
    if (existing.get("post_publish_audit_status") == status
            and existing.get("published_at") and existing.get("production_verified_at")):
        return {"status": "ALREADY_FINALIZED", "record": existing, "files": {}, "before": {}}
    final = {**existing, "published_at": existing.get("published_at") or published_at,
             "production_verified_at": verified_at,
             "post_publish_audit_status": status}
    if final == existing:
        return {"status": "ALREADY_FINALIZED", "record": final, "files": {}, "before": {}}
    registry["items"][index] = final
    return {"status": "APPROVED", "record": final,
            "files": {REGISTRY: canonical(registry) + b"\n"},
            "before": {REGISTRY: digest(raw)}}


def production_checks(record, fetcher):
    checks = {}
    try:
        page = fetcher(record["url"], method="GET", timeout=15)
        facts = _parse_html(page.body)
        robots = set(re.split(r"[,\s]+", facts.robots.lower()))
        checks["page"] = (page.status == 200 and page.url == record["url"]
                          and _title_matches(facts.title, record["title"])
                          and facts.canonical == record["url"]
                          and {"index", "follow"} <= robots and not {"noindex", "nofollow", "none"} & robots)
        for label, suffix in (("hero", "-hero.webp"), ("infographic", "-infographic.svg")):
            path = f"/static/kb/{record['slug']}{suffix}"
            url = "https://kfarmai.com" + path
            response = fetcher(url, method="GET", timeout=15)
            checks[label] = response.status == 200 and response.url == url and path in facts.images
        url = "https://kfarmai.com/sitemap.xml"
        response = fetcher(url, method="GET", timeout=15)
        checks["sitemap"] = response.status == 200 and response.url == url and record["url"] in sitemap_urls(response.body)
    except (OSError, ValueError, urllib.error.URLError):
        checks["network"] = False
    return {"production_verified": len(checks) == 4 and all(checks.values()), "production_checks": checks}


def verify_production(root, record, fetcher):
    result = production_checks(record, fetcher)
    # The shared read-only auditor runs after the production checks, including on failure.
    audit = audit_published_content(root, record, network=True, fetcher=fetcher, allowed_source_domains=load_domains(root))
    return {**result, "audit": audit}


def verification_states(meta, result, *, commit_sha, published_at, record):
    receipt = {"approval_id": record["approval_id"], "manifest_sha256": record["manifest_sha256"]}
    require(all(meta[k] == v for k, v in receipt.items()), "BLOCKED_RECEIPT")
    fields = {"commit_sha": commit_sha, "title": record["title"], "production_url": record["url"],
              "production_verified": result["production_verified"], "audit_status": result["audit"]["status"],
              "published_at": published_at, "audit_reasons": result["audit"]["reasons"]}
    if not result["production_verified"]:
        return [transition(meta, "REVIEW_REQUIRED", **fields)]
    published = transition(meta, "PUBLISHED", **fields)
    final = transition(published, "AUDIT_PASS" if result["audit"]["status"] == "PASS" else "REVIEW_REQUIRED")
    return [published, final]


def main():
    parser = argparse.ArgumentParser(description="Offline approval package dry-run; no publish")
    parser.add_argument("--root", required=True)
    parser.add_argument("--event", required=True)
    parser.add_argument("--artifact-metadata", required=True)
    parser.add_argument("--archive", required=True)
    args = parser.parse_args()
    try:
        action, meta = authorize(parse_json(Path(args.event).read_bytes()))
        if action != "approve":
            print(json.dumps({"status": "HOLD" if action == "hold" else "EDIT_REQUESTED", "mutation_count": 0}))
            return 0
        plan = plan_publication(args.root, Path(args.archive).read_bytes(), meta, parse_json(Path(args.artifact_metadata).read_bytes()))
        print(json.dumps({"status": plan["status"], "files_to_commit": sorted(plan["files"]), "mutation_count": 0}))
        return 0
    except Blocked as error:
        print(json.dumps({"status": error.code, "mutation_count": 0}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
