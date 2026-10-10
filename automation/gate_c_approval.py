"""Gate C REVIEW approval state machine.

This module is deliberately side-effect free.  It verifies the GitHub event,
immutable Artifact package and exact publication plan, then stops at
``PUBLISH_CANDIDATE``.  Publishing remains a separate Gate D operation.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from pathlib import Path
import tempfile

from kfarmai_review_approval import (
    Blocked,
    authorize,
    metadata,
    parse_json,
    plan_publication,
    read_archive,
    require,
    verify_package,
    artifact_identity,
    digest,
)

REVIEW_PENDING = "REVIEW_PENDING"
APPROVED = "APPROVED"
REVISION_REQUESTED = "REVISION_REQUESTED"
HOLD = "HOLD"
PUBLISH_CANDIDATE = "PUBLISH_CANDIDATE"
PUBLISHED = "PUBLISHED"
AUDIT_FAILED = "AUDIT_FAILED"

STATES = {
    REVIEW_PENDING,
    APPROVED,
    REVISION_REQUESTED,
    HOLD,
    PUBLISH_CANDIDATE,
    PUBLISHED,
    AUDIT_FAILED,
}
TRANSITIONS = {
    REVIEW_PENDING: {APPROVED, REVISION_REQUESTED, HOLD},
    APPROVED: {PUBLISH_CANDIDATE, HOLD},
    PUBLISH_CANDIDATE: {PUBLISHED, HOLD},
    PUBLISHED: {AUDIT_FAILED},
    REVISION_REQUESTED: set(),
    HOLD: set(),
    AUDIT_FAILED: set(),
}

# Artifact proven by Integration-19.  It is useful only for connection tests.
# Its legacy manifest predates package_kind and can never become publishable.
KNOWN_TEST_ARTIFACTS = {
    (38055669124, 11672110118,
     "87ab0c8eec36818ec236506fde351f0d7f7b32979e47c6c1d4bef27f575e1633")
}


def _transition(record, state, **receipt):
    require(state in TRANSITIONS[record["state"]], "BLOCKED_STATE_TRANSITION")
    protected = {"approval_id", "manifest_sha256", "run_id", "artifact_id", "state"}
    require(not protected.intersection(receipt), "BLOCKED_RECEIPT")
    return {**record, **receipt, "state": state}


def _package_kind(manifest, meta):
    kind = manifest.get("package_kind")
    publish_intent = manifest.get("publish_intent")
    if kind is None:
        identity = (meta["run_id"], meta["artifact_id"], meta["manifest_sha256"])
        require(identity in KNOWN_TEST_ARTIFACTS, "BLOCKED_PACKAGE_CLASS_UNVERIFIED")
        return "TEST_CANARY", False
    require(kind in {"REVIEW", "TEST_CANARY"}, "BLOCKED_PACKAGE_KIND")
    require(type(publish_intent) is bool, "BLOCKED_PUBLISH_INTENT")
    require((kind == "REVIEW") == publish_intent, "BLOCKED_PUBLISH_INTENT")
    require(isinstance(manifest.get("generated_at"), str) and manifest["generated_at"],
            "BLOCKED_GENERATED_AT")
    return kind, publish_intent


def bind_review(issue, artifact, archive, *, now=None):
    """Bind an open Issue to exact downloaded bytes and create pending state."""
    require(issue.get("state") == "open", "BLOCKED_ISSUE_CLOSED")
    meta = metadata(issue)
    require(meta["state"] == "REVIEW", "BLOCKED_ISSUE_STATE")
    artifact_identity(meta, artifact, now=now)
    identity = (meta["run_id"], meta["artifact_id"], meta["manifest_sha256"])
    if identity in KNOWN_TEST_ARTIFACTS:
        require(digest(archive) == artifact["digest"][7:], "BLOCKED_HASH_MISMATCH")
        from gate_c_artifact_verify import verify_download
        with tempfile.TemporaryDirectory(prefix="kfarmai-gate-c-download-") as temp:
            path = Path(temp) / "artifact.zip"
            path.write_bytes(archive)
            verified = verify_download(path)
        require(verified["manifest_sha256"] == meta["manifest_sha256"]
                and verified["approval_id"] == meta["approval_id"]
                and verified["synthetic"] is True and verified["publish_allowed"] is False,
                "BLOCKED_TEST_PACKAGE_IDENTITY")
        manifest = {"revision": 1}
        kind, publish_intent = "TEST_CANARY", False
    else:
        _, _, manifest = verify_package(archive, meta, artifact)
        kind, publish_intent = _package_kind(manifest, meta)
    return {
        "state": REVIEW_PENDING,
        "repository": meta["repository"],
        "approval_id": meta["approval_id"],
        "manifest_sha256": meta["manifest_sha256"],
        "run_id": meta["run_id"],
        "artifact_id": meta["artifact_id"],
        "artifact_name": meta["artifact_name"],
        "artifact_digest": meta["artifact_digest"],
        "issue_number": issue["number"],
        "package_kind": kind,
        "publish_intent": publish_intent,
        "revision": manifest["revision"],
    }


def authorize_action(event, current_issue, *, actor_permission):
    """Verify API-backed actor identity and repository permission."""
    action, meta = authorize(event, current_issue=current_issue)
    permission = actor_permission or {}
    actor = event["comment"]["user"]
    require(permission.get("user", {}).get("id") == actor.get("id")
            and permission.get("user", {}).get("login", "").casefold() == actor.get("login", "").casefold(),
            "BLOCKED_PERMISSION_IDENTITY")
    require(permission.get("permission") in {"admin", "maintain"}, "BLOCKED_PERMISSION")
    return action, meta


def decide(record, action, meta, *, command_id, decided_at):
    """Apply one human decision. Approval stops before any file mutation."""
    require(record["state"] == REVIEW_PENDING, "BLOCKED_DUPLICATE_DECISION")
    require(all(record[k] == meta[k] for k in
                ("approval_id", "manifest_sha256", "run_id", "artifact_id",
                 "artifact_name", "artifact_digest", "repository")),
            "BLOCKED_ISSUE_BINDING")
    require(isinstance(command_id, int) and command_id > 0, "BLOCKED_COMMAND_ID")
    receipt = {"decision_command_id": command_id, "decided_at": decided_at}
    if action == "edit":
        return [_transition(record, REVISION_REQUESTED, **receipt)]
    if action == "hold":
        return [_transition(record, HOLD, **receipt)]
    require(action == "approve", "BLOCKED_COMMAND")
    approved = _transition(record, APPROVED, **receipt)
    require(record["package_kind"] == "REVIEW" and record["publish_intent"] is True,
            "BLOCKED_TEST_PACKAGE")
    candidate = _transition(approved, PUBLISH_CANDIDATE,
                            ai_regeneration_count=0, image_regeneration_count=0,
                            auto_publish=False)
    return [approved, candidate]


def resume_approved(record):
    """Crash recovery for a persisted APPROVED receipt; no re-approval needed."""
    require(record["state"] == APPROVED, "BLOCKED_STATE_TRANSITION")
    require(record["package_kind"] == "REVIEW" and record["publish_intent"] is True,
            "BLOCKED_TEST_PACKAGE")
    return _transition(record, PUBLISH_CANDIDATE,
                       ai_regeneration_count=0, image_regeneration_count=0,
                       auto_publish=False)


def exact_candidate_plan(root, archive, issue, artifact):
    """Reuse the verified planner but never apply or stage its result."""
    meta = metadata(issue)
    plan = plan_publication(root, archive, meta, artifact)
    require(plan["status"] in {"APPROVED", "ALREADY_PUBLISHED"}, "BLOCKED_PLAN")
    return plan


def post_publish_state(record, *, audit_status):
    """Gate D may report a result later; audit failure can never be completion."""
    require(record["state"] == PUBLISHED, "BLOCKED_STATE_TRANSITION")
    if audit_status != "PASS":
        return _transition(record, AUDIT_FAILED, audit_status=audit_status)
    return {**record, "audit_status": "PASS"}


def record_gate_d_publish(record, *, commit_sha, published_at, production_url):
    """Validate a later Gate D receipt without performing a publication."""
    import re
    require(record["state"] == PUBLISH_CANDIDATE, "BLOCKED_STATE_TRANSITION")
    require(isinstance(commit_sha, str) and re.fullmatch(r"[a-f0-9]{40}", commit_sha),
            "BLOCKED_PUBLISH_RECEIPT")
    require(isinstance(published_at, str) and published_at
            and isinstance(production_url, str)
            and production_url.startswith("https://kfarmai.com/kb/"),
            "BLOCKED_PUBLISH_RECEIPT")
    return _transition(record, PUBLISHED, commit_sha=commit_sha,
                       published_at=published_at, production_url=production_url)


@dataclass
class DecisionRegistry:
    """Small deterministic registry used by the fixture and durable adapter tests."""
    records: dict = field(default_factory=dict)
    commands: dict = field(default_factory=dict)

    def add(self, record):
        key = record["approval_id"]
        prior = self.records.get(key)
        require(prior is None or prior == record, "BLOCKED_REGISTRY_CONFLICT")
        self.records[key] = dict(record)
        return dict(self.records[key])

    def apply(self, record, action, meta, *, command_id, decided_at):
        existing = self.commands.get(command_id)
        identity = (record["approval_id"], action, meta["manifest_sha256"])
        if existing is not None:
            require(existing["identity"] == identity, "BLOCKED_COMMAND_REPLAY")
            return [dict(item) for item in existing["states"]]
        states = decide(record, action, meta, command_id=command_id, decided_at=decided_at)
        self.commands[command_id] = {"identity": identity, "states": [dict(x) for x in states]}
        self.records[record["approval_id"]] = dict(states[-1])
        return states
