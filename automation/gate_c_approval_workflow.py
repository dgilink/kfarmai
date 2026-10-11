"""GitHub Actions adapter for Gate C approval only.

The adapter downloads and verifies the existing REVIEW artifact, validates the
owner's permission via GitHub API, and writes one idempotent receipt comment.
It has no Git, publishing, deployment, AI, or database operation.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request

from gate_c_approval import bind_review, authorize_action, decide, HOLD, KNOWN_TEST_ARTIFACTS
from kfarmai_review_approval import Blocked, LIMIT, REPOSITORY, canonical, parse_json, require

RECEIPT_PREFIX = "<!-- kfarmai-gate-c-receipt\n"
RECEIPT_SUFFIX = "\n-->"
TEST_TITLE = "[KFarmAI Daily][REVIEW][TEST/CANARY] Gate C Approval Workflow"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def request(self, endpoint, *, method="GET", payload=None):
        args = ["gh", "api", "--method", method, f"repos/{REPOSITORY}/{endpoint}"]
        if payload is not None:
            args += ["--input", "-"]
        proc = subprocess.run(args, input=canonical(payload) if payload is not None else None,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        require(proc.returncode == 0, "BLOCKED_GITHUB_REQUEST")
        return parse_json(proc.stdout) if proc.stdout else None

    def archive(self, artifact_id):
        request = urllib.request.Request(
            f"https://api.github.com/repos/{REPOSITORY}/actions/artifacts/{artifact_id}/zip",
            headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
                     "Accept": "application/vnd.github+json"})
        opener = urllib.request.build_opener(NoRedirect)
        try:
            opener.open(request, timeout=30)
            raise Blocked("BLOCKED_ARTIFACT_DOWNLOAD")
        except urllib.error.HTTPError as error:
            require(error.code == 302, "BLOCKED_ARTIFACT_EXPIRED" if error.code == 410 else "BLOCKED_ARTIFACT_DOWNLOAD")
            location = error.headers.get("Location", "")
        parsed = urllib.parse.urlparse(location)
        host = parsed.hostname or ""
        require(parsed.scheme == "https" and not parsed.username and not parsed.password
                and (host.endswith(".blob.core.windows.net") or host.endswith(".githubusercontent.com")),
                "BLOCKED_ARTIFACT_DOWNLOAD")
        with opener.open(urllib.request.Request(location), timeout=60) as response:
            raw = response.read(LIMIT + 1)
        require(len(raw) <= LIMIT, "BLOCKED_ARCHIVE_SIZE")
        return raw


def _receipt_body(receipt):
    label = "게시 후보 확정 (게시 안 함)" if receipt["state"] == "PUBLISH_CANDIDATE" else "TEST/CANARY 게시 차단"
    return f"[KFarmAI Gate C] {label}\n\n{RECEIPT_PREFIX}{canonical(receipt).decode()}{RECEIPT_SUFFIX}"


def _receipts(comments, command_id):
    found = []
    for comment in comments:
        body = comment.get("body", "")
        if RECEIPT_PREFIX not in body:
            continue
        require(comment.get("user", {}).get("login") == "github-actions[bot]"
                and comment.get("user", {}).get("id") == 41898282,
                "BLOCKED_RECEIPT_AUTHOR")
        try:
            raw = body.split(RECEIPT_PREFIX, 1)[1].split(RECEIPT_SUFFIX, 1)[0]
            value = parse_json(raw.encode())
        except (IndexError, Blocked):
            raise Blocked("BLOCKED_RECEIPT")
        if value.get("decision_command_id") == command_id:
            found.append(value)
    require(len(found) <= 1, "BLOCKED_DUPLICATE_RECEIPT")
    return found


def _all_comments(client, issue_number):
    result = []
    page = 1
    while True:
        batch = client.request(f"issues/{issue_number}/comments?per_page=100&page={page}")
        require(isinstance(batch, list), "BLOCKED_GITHUB_RESPONSE")
        result.extend(batch)
        if len(batch) < 100:
            return result
        page += 1


def live_contract_from_env():
    try:
        contract = {
            "issue_number": int(os.environ["GATE_C_TEST_ISSUE_ID"]),
            "comment_id": int(os.environ["GATE_C_OWNER_COMMENT_ID"]),
            "owner_actor_id": int(os.environ["GATE_C_OWNER_ACTOR_ID"]),
            "run_id": int(os.environ["GATE_C_RUN_ID"]),
            "artifact_id": int(os.environ["GATE_C_ARTIFACT_ID"]),
            "manifest_sha256": os.environ["GATE_C_MANIFEST_SHA256"],
        }
    except (KeyError, TypeError, ValueError) as error:
        raise Blocked("BLOCKED_LIVE_CONTRACT") from error
    require(contract["issue_number"] > 0 and contract["comment_id"] > 0
            and contract["owner_actor_id"] > 0
            and contract["run_id"] > 0 and contract["artifact_id"] > 0
            and len(contract["manifest_sha256"]) == 64,
            "BLOCKED_LIVE_CONTRACT")
    return contract


def run_repository_dispatch(trigger, client, contract):
    """Resolve the pre-existing exact owner comment from a one-shot dispatch."""
    require(trigger.get("action") == "kfarmai-gate-c-approval-canary"
            and trigger.get("repository", {}).get("full_name") == REPOSITORY
            and trigger.get("sender", {}).get("id") == contract["owner_actor_id"]
            and trigger.get("client_payload") in ({}, None),
            "BLOCKED_LIVE_TRIGGER")
    issue = client.request(f"issues/{contract['issue_number']}")
    comment = client.request(f"issues/comments/{contract['comment_id']}")
    require(comment.get("issue_url", "").endswith(f"/issues/{contract['issue_number']}"),
            "BLOCKED_LIVE_CONTRACT")
    event = {
        "action": "created", "repository": trigger["repository"],
        "issue": issue, "comment": comment, "sender": trigger["sender"],
    }
    return run(event, client, contract)


def run(event, client, contract=None):
    if contract is not None:
        require(event.get("issue", {}).get("number") == contract["issue_number"]
                and event.get("issue", {}).get("title") == TEST_TITLE
                and event.get("issue", {}).get("state") == "open"
                and event.get("comment", {}).get("user", {}).get("id") == contract["owner_actor_id"],
                "BLOCKED_LIVE_CONTRACT")
    issue = client.request(f"issues/{event['issue']['number']}")
    permission = client.request(f"collaborators/{event['comment']['user']['login']}/permission")
    action, meta = authorize_action(event, issue, actor_permission=permission)
    if contract is not None:
        require(meta["run_id"] == contract["run_id"]
                and meta["artifact_id"] == contract["artifact_id"]
                and meta["manifest_sha256"] == contract["manifest_sha256"],
                "BLOCKED_LIVE_CONTRACT")
    comment = client.request(f"issues/comments/{event['comment']['id']}")
    require(comment.get("body") == event["comment"]["body"]
            and comment.get("user", {}).get("id") == event["comment"]["user"]["id"],
            "BLOCKED_COMMENT_CHANGED")
    artifact = client.request(f"actions/artifacts/{meta['artifact_id']}")
    source = client.request(f"actions/runs/{meta['run_id']}")
    require(source.get("repository", {}).get("full_name") == REPOSITORY
            and source.get("head_repository", {}).get("full_name") == REPOSITORY
            and source.get("conclusion") == "success"
            and source.get("head_sha") == artifact.get("workflow_run", {}).get("head_sha"),
            "BLOCKED_SOURCE_RUN")
    identity = (meta["run_id"], meta["artifact_id"], meta["manifest_sha256"])
    expected_path = (".github/workflows/kfarmai-gate-c-artifact-canary.yml"
                     if identity in KNOWN_TEST_ARTIFACTS
                     else ".github/workflows/kfarmai-daily-autopublish.yml")
    require(source.get("path") == expected_path, "BLOCKED_SOURCE_RUN")
    archive = client.archive(meta["artifact_id"])
    record = bind_review(issue, artifact, archive)
    try:
        states = decide(record, action, meta, command_id=event["comment"]["id"],
                        decided_at=event["comment"]["created_at"])
        final = states[-1]
    except Blocked as error:
        if error.code != "BLOCKED_TEST_PACKAGE":
            raise
        final = {**record, "state": HOLD, "reason": "TEST_CANARY_NOT_PUBLISHABLE",
                 "decision_command_id": event["comment"]["id"],
                 "decided_at": event["comment"]["created_at"], "auto_publish": False}
    receipt = {key: final[key] for key in (
        "state", "repository", "approval_id", "manifest_sha256", "run_id",
        "artifact_id", "issue_number", "package_kind", "decision_command_id",
        "decided_at", "auto_publish") if key in final}
    comments = _all_comments(client, issue["number"])
    existing = _receipts(comments, event["comment"]["id"])
    if existing:
        require(existing[0] == receipt, "BLOCKED_RECEIPT_CONFLICT")
        return {"status": "RECONCILED", "receipt": receipt, "github_write": 0}
    try:
        created = client.request(f"issues/{issue['number']}/comments", method="POST",
                                 payload={"body": _receipt_body(receipt)})
    except Blocked:
        # A lost response must never cause a second POST. Read once and reconcile
        # the exact bot-authored receipt; otherwise fail closed.
        recovered = _receipts(_all_comments(client, issue["number"]),
                              event["comment"]["id"])
        if recovered:
            require(recovered[0] == receipt, "BLOCKED_RECEIPT_CONFLICT")
            return {"status": "RECONCILED", "receipt": receipt, "github_write": 0}
        raise
    require(created.get("body") == _receipt_body(receipt), "BLOCKED_RECEIPT_RESPONSE")
    return {"status": receipt["state"], "receipt": receipt, "github_write": 1}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    require(args.execute and os.environ.get("KFARMAI_GATE_C_APPROVAL_ENABLED") == "true",
            "LIVE_GATE_C_DISABLED")
    event = parse_json(Path(os.environ["GITHUB_EVENT_PATH"]).read_bytes())
    result = run_repository_dispatch(event, GitHub(), live_contract_from_env())
    out = Path("automation/run-output/gate-c-approval-result.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(canonical(result) + b"\n")
    print(json.dumps({"status": result["status"], "github_write": result["github_write"]}))


if __name__ == "__main__":
    try:
        main()
    except Blocked as error:
        print(json.dumps({"status": error.code, "github_write": 0}))
        raise SystemExit(2)
