"""Offline Gate D publication planner and post-publish audit coordinator.

The module has no remote-write, deployment, database, or model-call adapter.
It accepts already downloaded immutable bytes, prepares an exact Git plan in a
disposable checkout, and only returns ``PUBLISHED`` after deployment evidence,
live byte identity, the full content audit, and registry finalization all pass.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
from pathlib import Path
from urllib.parse import urljoin

from gate_c_approval import (
    AUDIT_FAILED,
    PUBLISHED,
    PUBLISH_CANDIDATE,
    PUBLISH_PENDING,
    _transition,
    post_publish_state,
    record_gate_d_publish,
)
from kfarmai_post_publish_audit import audit_published_content
from kfarmai_review_approval import (
    REGISTRY,
    apply_plan,
    canonical,
    digest,
    exact_stage,
    metadata,
    parse_json,
    plan_publication,
    plan_registry_finalization,
    require,
    safe_target,
    simulate_exact_stage,
    verify_package,
)
from source_policy import load_domains


FORBIDDEN_PUBLICATION_PHRASES = (
    "정확한 진단", "확정 진단", "확정 처방", "추천 농약", "이 농약을 쓰세요",
    "가격비교", "장바구니", "결제",
)


def enforce_content_policy(content, html):
    """Require safe AI-reference wording and explicit official source evidence."""
    require(isinstance(content, dict), "BLOCKED_CONTENT_POLICY")
    safety = content.get("safety_note", "")
    sources = content.get("sources", [])
    require(isinstance(safety, str) and "AI 참고 진단" in safety,
            "BLOCKED_CONTENT_POLICY")
    require(isinstance(sources, list) and sources
            and all(isinstance(item, dict) and str(item.get("url", "")).startswith("https://")
                    for item in sources), "BLOCKED_CONTENT_POLICY")
    text = canonical(content).decode("utf-8") + "\n" + html.decode("utf-8", errors="replace")
    require(not any(phrase in text for phrase in FORBIDDEN_PUBLICATION_PHRASES),
            "BLOCKED_CONTENT_POLICY")
    return {"safe_ai_reference": True, "official_sources": len(sources)}


def publication_key(record):
    """Stable replay key binding approval, decision, Issue, run and Artifact."""
    fields = {
        "repository": record.get("repository"),
        "issue_number": record.get("issue_number"),
        "decision_command_id": record.get("decision_command_id"),
        "approval_id": record.get("approval_id"),
        "run_id": record.get("run_id"),
        "artifact_id": record.get("artifact_id"),
        "artifact_digest": record.get("artifact_digest"),
        "manifest_sha256": record.get("manifest_sha256"),
    }
    require(fields["repository"] == "dgilink/kfarmai", "BLOCKED_REPOSITORY")
    require(all(fields[name] for name in fields), "BLOCKED_PUBLISH_IDENTITY")
    return hashlib.sha256(canonical(fields)).hexdigest()


def prepare_candidate(root, archive, issue, artifact, approved):
    """Revalidate Gate C identity and build a byte-exact, unapplied plan."""
    require(approved.get("state") == PUBLISH_CANDIDATE, "BLOCKED_STATE_TRANSITION")
    require(approved.get("package_kind") == "REVIEW"
            and approved.get("publish_intent") is True
            and approved.get("auto_publish") is False, "BLOCKED_NOT_PUBLISHABLE")
    require(approved.get("ai_regeneration_count") == 0
            and approved.get("image_regeneration_count") == 0, "BLOCKED_REGENERATION")
    meta = metadata(issue)
    for name in ("repository", "approval_id", "manifest_sha256", "run_id",
                 "artifact_id", "artifact_name", "artifact_digest"):
        require(approved.get(name) == meta.get(name), "BLOCKED_ISSUE_BINDING")
    intent, verified_files, _ = verify_package(archive, meta, artifact)
    policy = enforce_content_policy(parse_json(verified_files["content.json"]),
                                    verified_files[intent["html"]])
    plan = plan_publication(root, archive, meta, artifact)
    require(plan.get("status") == "APPROVED", "BLOCKED_DUPLICATE_PUBLICATION")
    expected = set(plan["record"]["artifact_files"])
    require(set(plan["files"]) == expected and REGISTRY in expected
            and "sitemap.xml" in expected, "BLOCKED_STAGED_FILES")
    return {"publication_key": publication_key(approved), "plan": plan,
            "candidate": dict(approved), "content_policy": policy}


def apply_and_stage(root, prepared, *, actual_index=False):
    """Apply approved bytes and verify an isolated or real disposable index."""
    plan = prepared["plan"]
    names = apply_plan(root, plan)
    staged = exact_stage(root, plan) if actual_index else simulate_exact_stage(root, plan)
    require(names == staged == sorted(plan["files"]), "BLOCKED_STAGED_FILES")
    for name in staged:
        require(safe_target(root, name).read_bytes() == plan["files"][name],
                "BLOCKED_HASH_MISMATCH")
    return staged


def record_deployment(prepared, *, commit_sha, deployment_id, deployed_at,
                      production_url, deployed_head_sha):
    """Create PUBLISH_PENDING evidence; never claim PUBLISHED here."""
    require(isinstance(deployment_id, int) and deployment_id > 0,
            "BLOCKED_DEPLOYMENT_RECEIPT")
    require(deployed_head_sha == commit_sha, "BLOCKED_DEPLOYMENT_RECEIPT")
    try:
        parsed = dt.datetime.fromisoformat(deployed_at.replace("Z", "+00:00"))
        require(parsed.tzinfo is not None, "BLOCKED_DEPLOYMENT_RECEIPT")
    except (AttributeError, ValueError) as error:
        raise _blocked("BLOCKED_DEPLOYMENT_RECEIPT") from error
    pending = record_gate_d_publish(
        prepared["candidate"], commit_sha=commit_sha,
        published_at=deployed_at, production_url=production_url)
    require(pending["state"] == PUBLISH_PENDING
            and production_url == prepared["plan"]["record"]["url"],
            "BLOCKED_DEPLOYMENT_RECEIPT")
    return {**pending, "deployment_id": deployment_id,
            "deployed_head_sha": deployed_head_sha,
            "publication_key": prepared["publication_key"]}


def abort_before_deployment(prepared, code):
    """Persist a pre-deployment failure without manufacturing deployment proof."""
    require(code in {"BLOCKED_GIT_PUSH", "BLOCKED_PAGES_DEPLOY",
                     "BLOCKED_NETWORK_INTERRUPTED"}, "BLOCKED_FAILURE_CODE")
    return {**prepared["candidate"], "publication_key": prepared["publication_key"],
            "last_error": code, "publish_attempted": False}


def _blocked(code):
    from kfarmai_review_approval import Blocked
    return Blocked(code)


def _get(fetcher, url):
    response = fetcher(url, method="GET", timeout=15)
    require(response.status == 200 and response.url == url, "BLOCKED_PRODUCTION_VERIFY")
    return response.body


def finalize_after_audit(root, prepared, pending, fetcher, *, checked_at):
    """Return PUBLISHED only after live bytes, audit, and registry receipt pass."""
    plan = prepared["plan"]
    record = plan["record"]
    require(pending.get("state") == PUBLISH_PENDING
            and pending.get("publication_key") == prepared["publication_key"]
            and pending.get("commit_sha") == pending.get("deployed_head_sha")
            and pending.get("production_url") == record["url"],
            "BLOCKED_DEPLOYMENT_RECEIPT")
    intent_html = f"kb/{record['slug']}.html"
    hero = f"static/kb/{record['slug']}-hero.webp"
    infographic = f"static/kb/{record['slug']}-infographic.svg"
    urls = {
        intent_html: record["url"],
        hero: urljoin(record["url"], "/" + hero),
        infographic: urljoin(record["url"], "/" + infographic),
    }
    try:
        for path, url in urls.items():
            require(digest(_get(fetcher, url)) == digest(plan["files"][path]),
                    "BLOCKED_PRODUCTION_BYTES")
        sitemap_body = _get(fetcher, "https://kfarmai.com/sitemap.xml")
        require(record["url"].encode() in sitemap_body, "BLOCKED_PRODUCTION_SITEMAP")
        audit = audit_published_content(
            root, record, network=True, fetcher=fetcher, checked_at=checked_at,
            allowed_source_domains=load_domains(root))
        require(audit["status"] == "PASS", "BLOCKED_POST_PUBLISH_AUDIT")
        result = {"production_verified": True, "audit": audit}
        finalization = plan_registry_finalization(
            root, record, result, published_at=pending["published_at"])
        require(finalization["status"] in {"APPROVED", "ALREADY_FINALIZED"},
                "BLOCKED_REGISTRY_FINALIZATION")
        if finalization["status"] == "APPROVED":
            apply_plan(root, finalization)
            simulate_exact_stage(root, finalization)
        return post_publish_state({**pending, "audit_checked_at": checked_at,
                                   "registry_status": finalization["status"]},
                                  audit_status="PASS")
    except Exception as error:
        code = getattr(error, "code", "BLOCKED_POST_PUBLISH_AUDIT")
        return post_publish_state(pending, audit_status=code)


class PublicationRegistry:
    """Durable-adapter contract model for replay and crash-recovery fixtures."""
    def __init__(self):
        self.records = {}

    def reserve(self, prepared):
        key = prepared["publication_key"]
        existing = self.records.get(key)
        if existing is None:
            self.records[key] = {"state": PUBLISH_CANDIDATE,
                                 "manifest_sha256": prepared["candidate"]["manifest_sha256"]}
        else:
            require(existing["manifest_sha256"] == prepared["candidate"]["manifest_sha256"],
                    "BLOCKED_REGISTRY_CONFLICT")
        return dict(self.records[key])

    def save(self, record):
        key = record["publication_key"]
        prior = self.records.get(key, {})
        if prior.get("state") == PUBLISHED:
            require(record == prior, "BLOCKED_DUPLICATE_PUBLICATION")
        self.records[key] = dict(record)
        return dict(record)
