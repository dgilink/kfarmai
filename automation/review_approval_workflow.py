"""GitHub Actions reference adapter. Candidate CLI is unconditionally disabled.

Never invoke --execute in fixture verification. The core dry-run command is
kfarmai_review_approval.py; this adapter alone owns remote state transitions.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import argparse
import re
import sys
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

from kfarmai_post_publish_audit import _default_fetch
from kfarmai_review_approval import (
    Blocked, LIMIT, REPOSITORY, apply_plan, artifact_identity, authorize, canonical,
    exact_stage, issue_body, metadata, parse_json, plan_publication, require,
    transition, verification_states, production_checks, plan_registry_finalization,
)
from kfarmai_post_publish_audit import audit_published_content


PAGES_WORKFLOW_PATH = ".github/workflows/pages.yml"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def request(self, endpoint, *, method="GET", payload=None):
        args = ["gh", "api", "--method", method, f"repos/{REPOSITORY}/{endpoint}"]
        if payload is not None:
            args += ["--input", "-"]
        result = subprocess.run(args, input=canonical(payload) if payload is not None else None,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if result.returncode:
            # Do not echo API/token/redirect response text into public reports.
            if b"HTTP 404" in result.stderr:
                raise Blocked("BLOCKED_ARTIFACT_MISSING" if endpoint.startswith("actions/artifacts/") else "BLOCKED_GITHUB_MISSING")
            if b"HTTP 410" in result.stderr:
                raise Blocked("BLOCKED_ARTIFACT_EXPIRED")
            raise Blocked("BLOCKED_GITHUB_REQUEST")
        return parse_json(result.stdout) if result.stdout else None

    def archive(self, artifact_id):
        url = f"https://api.github.com/repos/{REPOSITORY}/actions/artifacts/{artifact_id}/zip"
        request = urllib.request.Request(url, headers={"Authorization": "Bearer " + os.environ["GH_TOKEN"],
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
                and (host.endswith(".blob.core.windows.net") or host.endswith(".githubusercontent.com")), "BLOCKED_ARTIFACT_DOWNLOAD")
        # Signed download request carries no repository token and follows no redirects.
        with opener.open(urllib.request.Request(location), timeout=60) as response:
            raw = response.read(LIMIT + 1)
        require(len(raw) <= LIMIT, "BLOCKED_ARCHIVE_SIZE")
        return raw


def wait_for_pages(client, commit_sha, *, attempts=20, delay=12):
    """Require a successful Pages push run bound to the exact release commit."""
    require(re.fullmatch(r"[a-f0-9]{40}", commit_sha or ""), "BLOCKED_PAGES_RECEIPT")
    endpoint = ("actions/workflows/pages.yml/runs?event=push&head_sha="
                f"{commit_sha}&per_page=20")
    for attempt in range(attempts):
        payload = client.request(endpoint)
        runs = payload.get("workflow_runs", []) if isinstance(payload, dict) else []
        matching = [item for item in runs if
                    item.get("head_sha") == commit_sha
                    and item.get("event") == "push"
                    and item.get("path") == PAGES_WORKFLOW_PATH]
        require(len(matching) <= 1, "BLOCKED_PAGES_RECEIPT")
        if matching:
            run = matching[0]
            if run.get("status") == "completed":
                require(run.get("conclusion") == "success"
                        and isinstance(run.get("id"), int), "BLOCKED_PAGES_DEPLOY")
                return {"run_id": run["id"], "head_sha": commit_sha,
                        "conclusion": "success"}
        if attempt + 1 < attempts:
            time.sleep(delay)
    raise Blocked("BLOCKED_PAGES_TIMEOUT")

    def current(self, number):
        return self.request(f"issues/{number}")

    def command_current(self, event):
        comment = self.request(f"issues/comments/{event['comment']['id']}")
        require(comment.get("body") == event["comment"]["body"]
                and comment.get("user", {}).get("id") == event["comment"]["user"]["id"], "BLOCKED_COMMENT_CHANGED")
        page = 1
        while True:
            comments = self.request(f"issues/{event['issue']['number']}/comments?per_page=100&page={page}")
            for item in comments:
                if item["id"] > event["comment"]["id"] and item.get("user", {}).get("id") == event["repository"]["owner"]["id"]:
                    require(not item.get("body", "").strip().startswith("/kfarmai "), "BLOCKED_SUPERSEDED_COMMAND")
            if len(comments) < 100:
                break
            page += 1


def run(event, root, client):
    root = Path(root).resolve()
    issue = client.current(event["issue"]["number"])
    action, initial = authorize(event, issue)
    client.command_current(event)
    state = initial
    number = issue["number"]
    report = {"states": [state["state"]], "commit_sha": None, "status": state["state"]}
    out = root / "automation/run-output"
    out.mkdir(parents=True, exist_ok=True)

    def save():
        (out / "approval-result.json").write_bytes(canonical(report) + b"\n")

    def unchanged():
        client.command_current(event)
        fresh = client.current(number)
        require(fresh.get("state") == "open" and metadata(fresh) == state, "BLOCKED_ISSUE_CHANGED")
        return fresh

    def move(next_state, **fields):
        nonlocal state
        fresh = unchanged()
        updated = transition(state, next_state, **fields)
        client.request(f"issues/{number}", method="PATCH", payload={"body": issue_body(fresh, updated)})
        state = updated
        report["states"].append(state["state"])
        report["status"] = state["state"]
        save()

    def git(*args):
        return subprocess.check_output(["git", *args], cwd=root).decode().strip()

    try:
        if action in {"hold", "edit"}:
            move("HOLD" if action == "hold" else "EDIT_REQUESTED")
            return report
        require(not git("status", "--porcelain"), "BLOCKED_DIRTY_WORKTREE")
        base = git("rev-parse", "HEAD")
        require(git("ls-remote", "origin", "refs/heads/main").split()[0] == base, "BLOCKED_STALE_MAIN")
        artifact = client.request(f"actions/artifacts/{initial['artifact_id']}")
        artifact_identity(initial, artifact)
        source = client.request(f"actions/runs/{initial['run_id']}")
        require(source.get("repository", {}).get("full_name") == REPOSITORY
                and source.get("head_repository", {}).get("full_name") == REPOSITORY
                and source.get("path") == ".github/workflows/kfarmai-daily-autopublish.yml"
                and source.get("head_branch") == "main" and source.get("conclusion") == "success"
                and source.get("head_sha") == artifact.get("workflow_run", {}).get("head_sha"), "BLOCKED_SOURCE_RUN")
        raw = client.archive(initial["artifact_id"])
        # Idempotency must reconcile a previously pushed release, not silently
        # treat a stuck GitHub Issue as complete.
        if state["state"] == "REVIEW":
            move("APPROVED_VERIFYING")
        plan = plan_publication(root, raw, state, artifact)
        already = plan["status"] == "ALREADY_PUBLISHED"
        if state["state"] == "APPROVED_VERIFYING":
            move("APPROVED")
        published_at = (plan["record"].get("published_at") or state.get("published_at")
                        or dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"))
        if already:
            # All immutable bytes and all registry identity fields were checked by
            # plan_publication, including the sitemap entry.
            commit_sha = state.get("commit_sha") or git("rev-parse", "HEAD")
            require(re.fullmatch(r"[a-f0-9]{40}", commit_sha), "BLOCKED_RECEIPT")
            report["status"] = "RECOVERING_EXISTING_PUBLICATION"
            report["commit_sha"] = commit_sha
            save()
        else:
            unchanged()
            require(client.request(f"actions/artifacts/{initial['artifact_id']}") == artifact, "BLOCKED_ARTIFACT_CHANGED")
            artifact_identity(initial, artifact)
            names = apply_plan(root, plan)
            (out / "files_to_commit.txt").write_text("\n".join(names) + "\n", encoding="utf-8")
            subprocess.run(["node", "scripts/pages/build-pages-artifact.cjs", "--output=_site"], cwd=root, check=True)
            subprocess.run(["node", "scripts/pages/verify-pages-artifact.cjs", "_site"], cwd=root, check=True)
            unchanged()
            require(git("ls-remote", "origin", "refs/heads/main").split()[0] == base, "BLOCKED_STALE_MAIN")
            exact_stage(root, plan)
            git("-c", "user.name=kfarmai-approval", "-c", "user.email=actions@users.noreply.github.com",
                "commit", "-m", f"feat: publish approved {initial['approval_id']}")
            commit_sha = git("rev-parse", "HEAD")
            git("push", "origin", "HEAD:main")
            report["commit_sha"] = commit_sha
            save()
        if state["state"] == "APPROVED":
            move("PUBLISHED_PENDING_VERIFY", commit_sha=commit_sha, title=plan["record"]["title"],
                 production_url=plan["record"]["url"], production_verified=False,
                 audit_status="PENDING", published_at=published_at)
        # The content push must trigger the existing push-only Pages workflow.
        # A manual dispatch would create a second deployment with ambiguous identity.
        pages = wait_for_pages(client, commit_sha)
        report["pages_run_id"] = pages["run_id"]
        save()
        # The same runtime official-domain policy controls fetch, redirect and audit.
        cfg = parse_json((root / "automation/config.json").read_bytes())
        domains = cfg["official_domains"]
        def approved_fetch(url, *, method="GET", timeout=15):
            return _default_fetch(url, method=method, timeout=timeout, allowed_source_domains=domains)
        result = None
        deadline = time.monotonic() + 300
        for attempt in range(20):
            result = production_checks(plan["record"], approved_fetch)
            if result["production_verified"] or time.monotonic() >= deadline:
                break
            if attempt < 19:
                time.sleep(12)
        if not result["production_verified"]:
            raise Blocked("BLOCKED_PRODUCTION_VERIFY")
        result["audit"] = audit_published_content(root, plan["record"], network=True,
                                                   fetcher=approved_fetch, allowed_source_domains=domains)
        (out / "post-publish-audit.json").write_bytes(canonical(result["audit"]) + b"\n")
        # Read-only audit is followed by a separate deterministic receipt commit.
        # An interrupted receipt push can be reconciled on the next owner command.
        final_plan = plan_registry_finalization(root, plan["record"], result, published_at=published_at)
        if final_plan["status"] == "APPROVED":
            current = git("rev-parse", "HEAD")
            require(git("ls-remote", "origin", "refs/heads/main").split()[0] == current, "BLOCKED_STALE_MAIN")
            apply_plan(root, final_plan)
            exact_stage(root, final_plan)
            git("-c", "user.name=kfarmai-approval", "-c", "user.email=actions@users.noreply.github.com",
                "commit", "-m", f"chore: audit receipt {initial['approval_id']}")
            git("push", "origin", "HEAD:main")
            report["receipt_commit_sha"] = git("rev-parse", "HEAD")
            receipt_pages = wait_for_pages(client, report["receipt_commit_sha"])
            report["receipt_pages_run_id"] = receipt_pages["run_id"]
            # The receipt push starts a second Pages build.  Re-check the
            # public bytes after that exact deployment so an older successful
            # response cannot finalize the registry as PUBLISHED.
            receipt_result = production_checks(plan["record"], approved_fetch)
            require(receipt_result["production_verified"], "BLOCKED_PRODUCTION_VERIFY")
            save()
        if state["state"] == "PUBLISHED":
            target = "AUDIT_PASS" if result["audit"]["status"] == "PASS" else "REVIEW_REQUIRED"
            move(target)
        elif state["state"] == "PUBLISHED_PENDING_VERIFY":
            for updated in verification_states(state, result, commit_sha=commit_sha,
                                               published_at=published_at, record=plan["record"]):
                fields = {k: v for k, v in updated.items() if k not in initial and k != "state"}
                fields.update({k: updated[k] for k in ("commit_sha", "title", "production_url",
                                                        "production_verified", "audit_status", "published_at", "audit_reasons")})
                move(updated["state"], **fields)
        elif state["state"] == "AUDIT_PASS":
            report["status"] = "ALREADY_AUDITED"
            save()
        else:
            raise Blocked("BLOCKED_ISSUE_STATE")
        return report
    except (Blocked, subprocess.CalledProcessError, OSError) as error:
        report["status"] = error.code if isinstance(error, Blocked) else "BLOCKED_EXECUTION"
        save()
        # Report the cause without changing publication files or reversing the release.
        client.request(f"issues/{number}/comments", method="POST", payload={"body": canonical({
            "approval_id": initial["approval_id"], "manifest_sha256": initial["manifest_sha256"],
            "status": report["status"], "commit_sha": report["commit_sha"], "automatic_rollback": False,
        }).decode()})
        raise


def main():
    if sys.argv[1:] == ["--execute"]:
        return _activation_reference()
    raise Blocked("BLOCKED_LIVE_EXECUTION_DISABLED")


def _activation_reference():
    """Protected production adapter; disabled until the exact workflow gates pass."""
    if "--execute" not in sys.argv[1:]:
        raise Blocked("BLOCKED_LIVE_EXECUTION_DISABLED")
    parser = argparse.ArgumentParser(description="Owner-gated immutable REVIEW publication")
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    require(args.execute, "BLOCKED_LIVE_EXECUTION_DISABLED")
    # The workflow remains disabled by repository variables and its protected
    # environment until a separately approved REVIEW identity is supplied.
    require(os.getenv("KFARMAI_REVIEW_PUBLISH_ENABLED") == "true"
            and os.getenv("GITHUB_REPOSITORY") == REPOSITORY
            and os.getenv("GITHUB_ACTOR") == "dgilink"
            and bool(os.getenv("GH_TOKEN")), "BLOCKED_LIVE_EXECUTION_DISABLED")
    event_path = os.getenv("GITHUB_EVENT_PATH")
    require(bool(event_path), "BLOCKED_EVENT")
    event = parse_json(Path(event_path).read_bytes())
    expected_id = os.getenv("KFARMAI_REVIEW_PUBLISH_APPROVAL_ID", "")
    require(bool(expected_id) and expected_id == metadata(event["issue"])["approval_id"],
            "BLOCKED_CANARY_SCOPE")
    run(event, Path.cwd(), GitHub())


if __name__ == "__main__":
    main()
