#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Read-only post-publish verification for KFarmAI knowledge articles.

The auditor never changes published files or the publication registry.  Its JSON
result contains a suggested registry update which a separate, authorized
workflow may apply after review.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable, Iterable

KST = dt.timezone(dt.timedelta(hours=9))
MAX_NETWORK_BYTES = 8 * 1024 * 1024
SLUG_RE = re.compile(r"[a-z0-9][a-z0-9-]{4,80}\Z")
from source_policy import DEFAULT_OFFICIAL_DOMAINS, load_domains, validate_domains

INTERNAL_MARKERS = (
    "approval_id",
    "manifest_sha256",
    "content_sha256",
    "html_sha256",
    "post_publish_audit_status",
    "review_required_reason",
    "claimgraphhash",
    "sourcesnapshothash",
    "safetycontracthash",
    "approvalhash",
    "rightsevidence",
    "candidateindex",
    "source_run_id",
    "approval package",
)
SECRET_PATTERNS = (
    ("OPENAI_KEY", re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b")),
    ("SUPABASE_SECRET", re.compile(r"\bsb_secret_[A-Za-z0-9_-]{16,}\b")),
    ("GITHUB_TOKEN", re.compile(r"\bgh[opusr]_[A-Za-z0-9]{20,}\b")),
    ("GITHUB_FINE_GRAINED", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b")),
    ("SERVICE_ROLE", re.compile(r"service[_-]?role[^\r\n]{0,50}(?:=|:)[^\r\n]{12,}", re.I)),
    ("PRIVATE_KEY", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("BEARER_TOKEN", re.compile(r"\bBearer\s+[A-Za-z0-9._~-]{24,}", re.I)),
)


@dataclass(frozen=True)
class FetchResult:
    status: int
    url: str
    body: bytes = b""
    headers: dict[str, str] | None = None


class PageFacts(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title = ""
        self.h1: list[str] = []
        self.h2: list[str] = []
        self.canonical = ""
        self.robots = ""
        self.links: list[str] = []
        self.images: list[str] = []
        self._capture: str | None = None
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key.lower(): value or "" for key, value in attrs}
        tag = tag.lower()
        if tag in {"title", "h1", "h2"}:
            self._capture = tag
            self._buffer = []
        elif tag == "link":
            rel = {part.lower() for part in values.get("rel", "").split()}
            if "canonical" in rel:
                self.canonical = values.get("href", "").strip()
        elif tag == "meta" and values.get("name", "").lower() == "robots":
            self.robots = values.get("content", "").strip()
        elif tag == "a" and values.get("href"):
            self.links.append(values["href"].strip())
        elif tag == "img" and values.get("src"):
            self.images.append(values["src"].strip())

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag != self._capture:
            return
        value = " ".join("".join(self._buffer).split())
        if tag == "title":
            self.title = value
        elif tag == "h1":
            self.h1.append(value)
        elif tag == "h2":
            self.h2.append(value)
        self._capture = None
        self._buffer = []


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def build_registry_record(
    *,
    article: dict[str, Any],
    date: str,
    title: str,
    slug: str,
    url: str,
    category: str,
    html_bytes: bytes,
    artifact_files: Iterable[str],
    publication_mode: str,
    approval_id: str | None = None,
    source_run_id: int | None = None,
) -> dict[str, Any]:
    """Build the shared LOW/REVIEW registry contract without claiming deployment."""
    if publication_mode not in {"LOW", "REVIEW"}:
        raise ValueError("publication_mode must be LOW or REVIEW")
    if publication_mode == "REVIEW" and not approval_id:
        raise ValueError("REVIEW publication requires approval_id")
    content_sha256 = sha256_bytes(_canonical_json(article))
    html_sha256 = sha256_bytes(html_bytes)
    source_urls = [
        source.get("url", "")
        for source in article.get("sources", [])
        if isinstance(source, dict) and source.get("url")
    ]
    manifest = {
        "approval_id": approval_id,
        "source_run_id": source_run_id,
        "artifact_files": sorted(set(artifact_files)),
        "category": category,
        "content_sha256": content_sha256,
        "date": date,
        "html_sha256": html_sha256,
        "publication_mode": publication_mode,
        "slug": slug,
        "source_urls": source_urls,
        "title": title,
        "url": url,
    }
    return {
        "date": date,
        "title": title,
        "slug": slug,
        "url": url,
        "category": category,
        "publication_mode": publication_mode,
        "approval_id": approval_id,
        "source_run_id": source_run_id,
        "manifest_sha256": sha256_bytes(_canonical_json(manifest)),
        "content_sha256": content_sha256,
        "html_sha256": html_sha256,
        "source_urls": source_urls,
        "artifact_files": manifest["artifact_files"],
        "published_at": None,
        "production_verified_at": None,
        "post_publish_audit_status": "PENDING",
    }


def _parse_html(body: bytes) -> PageFacts:
    parser = PageFacts()
    parser.feed(body.decode("utf-8", errors="replace"))
    parser.close()
    return parser


def _title_matches(actual: str, expected: str) -> bool:
    actual = re.sub(r"\s*\|\s*kFarmAI\s*$", "", actual, flags=re.I).strip()
    return actual == expected.strip()


def _sitemap_urls(path: Path) -> list[str]:
    tree = ET.parse(path)
    return [
        (element.text or "").strip()
        for element in tree.getroot().iter()
        if element.tag.rsplit("}", 1)[-1] == "loc"
    ]


def _host_is(host: str, expected: str) -> bool:
    host = host.lower().rstrip(".")
    expected = expected.lower().rstrip(".")
    return host == expected or host.endswith("." + expected)


def _same_site_url(candidate: str, production_url: str) -> bool:
    parsed = urllib.parse.urlparse(candidate)
    expected = urllib.parse.urlparse(production_url)
    return parsed.scheme == expected.scheme == "https" and parsed.hostname == expected.hostname


def _default_fetch(url: str, *, method: str = "GET", timeout: float = 15,
                   allowed_source_domains: Iterable[str] = DEFAULT_OFFICIAL_DOMAINS) -> FetchResult:
    domains = validate_domains(tuple(allowed_source_domains))
    def allowed(target):
        parsed = urllib.parse.urlparse(target)
        host = parsed.hostname or ""
        return (parsed.scheme == "https" and not parsed.username and not parsed.password
                and parsed.port in (None, 443)
                and (host == "kfarmai.com" or any(_host_is(host, d) for d in domains)))

    class AuditRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            if not allowed(newurl):
                raise ValueError("audit redirect outside allowed public domains")
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    if not allowed(url):
        raise ValueError("audit URL outside allowed public domains")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "KFarmAI-PostPublish-Audit/1.0", "Accept": "*/*"},
        method=method,
    )
    try:
        with urllib.request.build_opener(AuditRedirect).open(request, timeout=timeout) as response:
            length = int(response.headers.get("Content-Length", "0") or 0)
            if length > MAX_NETWORK_BYTES:
                raise ValueError("response exceeds audit size limit")
            body = b"" if method == "HEAD" else response.read(MAX_NETWORK_BYTES + 1)
            if len(body) > MAX_NETWORK_BYTES:
                raise ValueError("response exceeds audit size limit")
            return FetchResult(
                status=response.status,
                url=response.geturl(),
                body=body,
                headers=dict(response.headers.items()),
            )
    except urllib.error.HTTPError as error:
        body = b"" if method == "HEAD" else error.read(MAX_NETWORK_BYTES)
        return FetchResult(error.code, error.geturl(), body, dict(error.headers.items()))


def _probe_with_get_fallback(
    fetch: Callable[..., FetchResult], url: str, timeout: float
) -> FetchResult:
    result = fetch(url, method="HEAD", timeout=timeout)
    if result.status in {400, 403, 405, 501}:
        return fetch(url, method="GET", timeout=timeout)
    return result


def _add(checks: dict[str, Any], reasons: list[str], key: str, ok: bool, reason: str, **details: Any) -> None:
    checks[key] = {"ok": ok, **details}
    if not ok:
        reasons.append(reason)


def audit_published_content(
    root: str | Path,
    record: dict[str, Any],
    network: bool = False,
    *,
    fetcher: Callable[..., FetchResult] | None = None,
    timeout: float = 15,
    checked_at: str | None = None,
    allowed_source_domains: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Audit one registry record. Published content and registry are never changed."""
    root_path = Path(root).resolve()
    checked_at = checked_at or dt.datetime.now(KST).isoformat(timespec="seconds")
    checks: dict[str, Any] = {}
    reasons: list[str] = []
    fatal_reasons: list[str] = []
    slug = str(record.get("slug", ""))
    production_url = str(record.get("url", ""))
    expected_title = str(record.get("title", ""))
    if allowed_source_domains is None:
        allowed_source_domains = load_domains(root_path) if (root_path / "automation/config.json").is_file() else DEFAULT_OFFICIAL_DOMAINS
    allowed_domains = validate_domains(tuple(allowed_source_domains))

    valid_slug = bool(SLUG_RE.fullmatch(slug))
    _add(checks, reasons, "safe_target", valid_slug, "INVALID_TARGET_SLUG", slug=slug)
    parsed_production = urllib.parse.urlparse(production_url)
    valid_route = (
        parsed_production.scheme == "https"
        and parsed_production.hostname == "kfarmai.com"
        and parsed_production.path == f"/kb/{slug}.html"
        and not parsed_production.query
        and not parsed_production.fragment
    )
    _add(checks, reasons, "production_route", valid_route, "PRODUCTION_ROUTE_INVALID", url=production_url)
    target_candidate = root_path / "kb" / f"{slug}.html"
    target_is_symlink = target_candidate.is_symlink()
    target = target_candidate.resolve()
    if root_path not in target.parents:
        valid_slug = False
        reasons.append("TARGET_OUTSIDE_ROOT")
    exists = valid_slug and target.is_file() and not target_is_symlink
    _add(checks, reasons, "target_exists", exists, "TARGET_HTML_MISSING", path=str(target))
    body = target.read_bytes() if exists else b""
    facts = _parse_html(body) if body else PageFacts()

    expected_hash = str(record.get("html_sha256", ""))
    actual_hash = sha256_bytes(body) if body else ""
    _add(
        checks,
        reasons,
        "html_sha256",
        bool(expected_hash) and actual_hash == expected_hash,
        "HTML_SHA256_MISMATCH" if expected_hash else "EXPECTED_HTML_SHA256_MISSING",
        expected=expected_hash,
        actual=actual_hash,
    )
    _add(checks, reasons, "document_title", _title_matches(facts.title, expected_title), "TITLE_MISMATCH", actual=facts.title)
    _add(checks, reasons, "h1_title", facts.h1 == [expected_title], "H1_TITLE_MISMATCH", actual=facts.h1)
    _add(checks, reasons, "canonical", facts.canonical == production_url, "CANONICAL_MISMATCH", actual=facts.canonical)
    robots = {token.strip().lower() for token in re.split(r"[,\s]+", facts.robots) if token.strip()}
    _add(checks, reasons, "robots", {"index", "follow"}.issubset(robots) and not {"noindex", "nofollow", "none"}.intersection(robots), "ROBOTS_NOT_INDEX_FOLLOW", actual=facts.robots)

    expected_sources = [str(url) for url in record.get("source_urls", []) if url]
    heading_present = "공식 참고자료" in facts.h2
    source_links_present = bool(expected_sources) and all(url in facts.links for url in expected_sources)
    source_domains_official = bool(expected_sources) and all(
        (host := (urllib.parse.urlparse(url).hostname or ""))
        and urllib.parse.urlparse(url).scheme == "https"
        and any(_host_is(host, domain) for domain in allowed_domains)
        for url in expected_sources
    )
    _add(
        checks,
        reasons,
        "official_sources",
        heading_present and source_links_present and source_domains_official,
        "OFFICIAL_SOURCE_MARKER_MISSING",
        heading_present=heading_present,
        expected_sources=expected_sources,
        domains_official=source_domains_official,
    )

    sitemap_path = root_path / "sitemap.xml"
    sitemap_urls: list[str] = []
    sitemap_error = ""
    try:
        if sitemap_path.is_file():
            sitemap_urls = _sitemap_urls(sitemap_path)
        else:
            sitemap_error = "missing"
    except (ET.ParseError, OSError) as error:
        sitemap_error = str(error)
    _add(
        checks,
        reasons,
        "sitemap",
        sitemap_urls.count(production_url) == 1,
        "SITEMAP_URL_MISSING_OR_DUPLICATE",
        count=sitemap_urls.count(production_url),
        error=sitemap_error,
    )

    text = body.decode("utf-8", errors="replace")
    marker_hits = [marker for marker in INTERNAL_MARKERS if marker in text.lower()]
    _add(checks, reasons, "internal_metadata", not marker_hits, "INTERNAL_REVIEW_METADATA_LEAK", hits=marker_hits)
    secret_hits = [name for name, pattern in SECRET_PATTERNS if pattern.search(text)]
    checks["secrets"] = {"ok": not secret_hits, "hits": secret_hits}
    if secret_hits:
        fatal_reasons.append("SECRET_PATTERN_DETECTED")

    network_status = "NOT_RUN"
    if network and not fatal_reasons:
        fetch = fetcher or (lambda url, *, method="GET", timeout=15: _default_fetch(
            url, method=method, timeout=timeout, allowed_source_domains=allowed_domains))
        network_status = "AVAILABLE"
        transient = (TimeoutError, socket.timeout, urllib.error.URLError, ConnectionError, OSError, ValueError)

        try:
            live = fetch(production_url, method="GET", timeout=timeout)
            live_facts = _parse_html(live.body)
            live_ok = (
                live.status == 200
                and live.url == production_url
                and sha256_bytes(live.body) == expected_hash
                and _title_matches(live_facts.title, expected_title)
                and live_facts.canonical == production_url
                and {"index", "follow"}.issubset(
                    {token.strip().lower() for token in re.split(r"[,\s]+", live_facts.robots) if token.strip()}
                )
            )
            _add(
                checks,
                reasons,
                "network_page",
                live_ok,
                "PRODUCTION_CONTENT_MISMATCH",
                status=live.status,
                final_url=live.url,
            )
            if live.status >= 500:
                network_status = "NETWORK_UNAVAILABLE"
                reasons.append("NETWORK_UNAVAILABLE")
        except transient as error:
            checks["network_page"] = {"ok": False, "error": type(error).__name__}
            reasons.append("NETWORK_UNAVAILABLE")
            network_status = "NETWORK_UNAVAILABLE"
            live = None

        for label, suffix in (("hero", "-hero.webp"), ("infographic", "-infographic.svg")):
            matching = [src for src in facts.images if src.split("?", 1)[0].endswith(suffix)]
            asset_url = urllib.parse.urljoin(production_url, matching[0]) if matching else ""
            if not asset_url or not _same_site_url(asset_url, production_url):
                _add(checks, reasons, f"network_{label}", False, f"{label.upper()}_URL_INVALID", url=asset_url)
                continue
            try:
                result = _probe_with_get_fallback(fetch, asset_url, timeout)
                _add(
                    checks,
                    reasons,
                    f"network_{label}",
                    200 <= result.status < 300,
                    f"{label.upper()}_NETWORK_UNAVAILABLE",
                    status=result.status,
                    final_url=result.url,
                )
                if result.status >= 500:
                    network_status = "NETWORK_UNAVAILABLE"
                    reasons.append("NETWORK_UNAVAILABLE")
                if result.url and not _same_site_url(result.url, production_url):
                    checks[f"network_{label}"]["ok"] = False
                    checks[f"network_{label}"]["final_url_valid"] = False
                    reasons.append(f"{label.upper()}_FINAL_URL_INVALID")
            except transient as error:
                checks[f"network_{label}"] = {"ok": False, "error": type(error).__name__}
                reasons.append(f"{label.upper()}_NETWORK_UNAVAILABLE")
                network_status = "NETWORK_UNAVAILABLE"

        sitemap_url = urllib.parse.urljoin(production_url, "/sitemap.xml")
        try:
            result = fetch(sitemap_url, method="GET", timeout=timeout)
            in_live_sitemap = result.status == 200 and production_url.encode("utf-8") in result.body
            _add(checks, reasons, "network_sitemap", in_live_sitemap, "PRODUCTION_SITEMAP_MISSING", status=result.status)
            if result.status >= 500:
                network_status = "NETWORK_UNAVAILABLE"
                reasons.append("NETWORK_UNAVAILABLE")
        except transient as error:
            checks["network_sitemap"] = {"ok": False, "error": type(error).__name__}
            reasons.append("NETWORK_UNAVAILABLE")
            network_status = "NETWORK_UNAVAILABLE"

        production_host = urllib.parse.urlparse(production_url).hostname or ""
        for index, source_url in enumerate(expected_sources):
            source_host = urllib.parse.urlparse(source_url).hostname or ""
            source_is_official = any(_host_is(source_host, domain) for domain in allowed_domains)
            if not source_host or _host_is(source_host, production_host) or not source_is_official:
                _add(checks, reasons, f"network_source_{index}", False, "SOURCE_URL_INVALID", url=source_url)
                continue
            try:
                result = _probe_with_get_fallback(fetch, source_url, timeout)
                ok = 200 <= result.status < 400
                _add(
                    checks,
                    reasons,
                    f"network_source_{index}",
                    ok,
                    "SOURCE_NETWORK_UNAVAILABLE",
                    status=result.status,
                    final_url=result.url,
                )
                if result.status >= 500:
                    network_status = "NETWORK_UNAVAILABLE"
                    reasons.append("NETWORK_UNAVAILABLE")
                final_host = urllib.parse.urlparse(result.url).hostname or ""
                final_is_official = any(_host_is(final_host, domain) for domain in allowed_domains)
                if not final_host or not final_is_official:
                    checks[f"network_source_{index}"]["ok"] = False
                    checks[f"network_source_{index}"]["final_url_valid"] = False
                    reasons.append("SOURCE_FINAL_URL_INVALID")
            except transient as error:
                checks[f"network_source_{index}"] = {"ok": False, "error": type(error).__name__}
                reasons.append("SOURCE_NETWORK_UNAVAILABLE")
                network_status = "NETWORK_UNAVAILABLE"

    reasons = list(dict.fromkeys(reasons))
    fatal_reasons = list(dict.fromkeys(fatal_reasons))
    if fatal_reasons:
        status = "FAIL"
    elif reasons:
        status = "REVIEW_REQUIRED"
    elif network:
        status = "PASS"
    else:
        status = "LOCAL_PASS_NETWORK_NOT_RUN"
    all_reasons = fatal_reasons + reasons
    registry_update = {
        "post_publish_audit_status": status,
        "production_verified_at": checked_at if status == "PASS" else None,
    }
    return {
        "status": status,
        "network_status": network_status,
        "checked_at": checked_at,
        "record": {"slug": slug, "url": production_url},
        "reasons": all_reasons,
        "checks": checks,
        "registry_update_suggestion": registry_update,
        "mutation_count": 0,
    }


def _load_record(registry_path: Path, slug: str) -> dict[str, Any]:
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    matches = [item for item in registry.get("items", []) if item.get("slug") == slug]
    if len(matches) != 1:
        raise ValueError(f"expected one registry record for slug {slug!r}, found {len(matches)}")
    return matches[0]


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only KFarmAI post-publish audit")
    parser.add_argument("--root", default=".")
    parser.add_argument("--registry", default="automation/daily_registry.json")
    parser.add_argument("--slug", required=True)
    parser.add_argument("--network", action="store_true")
    parser.add_argument("--timeout", type=float, default=15)
    parser.add_argument("--output", default="automation/run-output/post-publish-audit.json")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    registry_path = (root / args.registry).resolve()
    if root not in registry_path.parents:
        raise ValueError("registry path must stay inside root")
    record = _load_record(registry_path, args.slug)
    config_path = root / "automation" / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.is_file() else {}
    allowed_domains = config.get("official_domains", DEFAULT_OFFICIAL_DOMAINS)
    result = audit_published_content(
        root,
        record,
        args.network,
        timeout=args.timeout,
        allowed_source_domains=allowed_domains,
    )
    output = (root / args.output).resolve()
    if root not in output.parents:
        raise ValueError("output path must stay inside root")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "reasons": result["reasons"]}, ensure_ascii=False))
    return 0 if result["status"] in {"PASS", "LOCAL_PASS_NETWORK_NOT_RUN"} else 2 if result["status"] == "REVIEW_REQUIRED" else 3


if __name__ == "__main__":
    raise SystemExit(main())
