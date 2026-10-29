"""Protected daily REVIEW worker. No publication or Pages operation exists here."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys

from daily_review_issue import GitHubIssueIndex, GitHubReviewTransport, load_package
from durable_budget import BudgetBlocked
from github_editorial_gate import GitHubEditorialBudget, GitHubEditorialGate
from kfarmai_daily_autopublish import KST
from kfarmai_review_approval import Blocked, canonical, require
from real_daily_provider import OpenAIResponses, OfficialSourceClient, RealDailyProvider
from source_policy import load_domains


WORKFLOW_REF = "dgilink/kfarmai/.github/workflows/kfarmai-daily-autopublish.yml@refs/heads/main"


def verify_context(env, head_sha, *, phase):
    require(phase in {"generate", "finalize"}, "DAILY_PHASE_INVALID")
    require(env.get("GITHUB_REPOSITORY") == "dgilink/kfarmai"
            and env.get("GITHUB_REF") == "refs/heads/main"
            and env.get("GITHUB_SHA") == head_sha
            and env.get("GITHUB_WORKFLOW_REF") == WORKFLOW_REF
            and env.get("GITHUB_RUN_ATTEMPT") == "1"
            and env.get("GITHUB_EVENT_NAME") in {"schedule", "workflow_dispatch"}
            and env.get("KFARMAI_DAILY_APPROVED_HEAD_SHA") == head_sha
            and env.get("KFARMAI_DAILY_REVIEW_GENERATION_ENABLED") == "true"
            and env.get("KFARMAI_AUTOPUBLISH_ENABLED") == "false"
            and env.get("KFARMAI_REVIEW_PUBLISH_ENABLED") == "false"
            and env.get("KFARMAI_DAILY_REVIEW_ONLY") == "true",
            "DAILY_GITHUB_CONTEXT_MISMATCH")
    require(re.fullmatch(r"[a-f0-9]{40}", head_sha) is not None,
            "DAILY_GITHUB_CONTEXT_MISMATCH")
    if env.get("GITHUB_EVENT_NAME") == "workflow_dispatch":
        require(env.get("GITHUB_ACTOR_ID") == "293838055", "DAILY_ACTOR_MISMATCH")
    require(env.get("KFARMAI_DAILY_RECOVERY", "none") in
            {"none", "incident_38209820550", "incident_38218191801",
             "incident_38222769553"}, "DAILY_RECOVERY_INVALID")


def run_command(args, env):
    head_sha = args.head_sha
    verify_context(env, head_sha, phase=args.command)
    require(str(args.run_id) == env.get("GITHUB_RUN_ID"), "DAILY_GITHUB_CONTEXT_MISMATCH")
    if args.command == "generate":
        require(args.date == dt.datetime.now(KST).date().isoformat(), "BLOCKED_BUDGET_DATE")
    token = env.get("GH_TOKEN")
    require(isinstance(token, str) and token, "BLOCKED_GITHUB_TOKEN")
    gate = GitHubEditorialGate(token=token, run_id=args.run_id, head_sha=head_sha,
                               environment=env)
    if args.command == "generate":
        claim = gate.claim(args.date)
        budget = GitHubEditorialBudget(gate, claim)
        try:
            root = Path(args.root).resolve()
            key = env.get("OPENAI_API_KEY")
            require(isinstance(key, str) and key, "BLOCKED_OPENAI_KEY")
            provider = RealDailyProvider(root, OfficialSourceClient(load_domains(root)),
                                         OpenAIResponses(key), budget,
                                         GitHubIssueIndex(token))
            recovery = env.get("KFARMAI_DAILY_RECOVERY", "none")
            result = provider.run(date=args.date, run_id=args.run_id, head_sha=head_sha,
                                  output=args.output,
                                  recovery_from=("38209820550" if recovery == "incident_38209820550"
                                                 else "38218191801" if recovery == "incident_38218191801"
                                                 else "38222769553" if recovery == "incident_38222769553"
                                                 else None))
            outcome_path = Path(args.output) / "outcome.json"
            outcome = result["outcome"]
            outcome.update(claim_issue_number=claim["number"],
                           review_channel="github_issue", published=False)
            outcome_path.write_bytes(canonical(outcome) + b"\n")
            return outcome
        except Exception as error:
            code = (error.code if isinstance(error, Blocked) else
                    str(error) if isinstance(error, BudgetBlocked) else
                    "DAILY_EXECUTION_FAILED")
            try:
                gate.hold(claim["number"], code)
            except Exception:
                pass
            raise
    package = load_package(Path(args.output) / "approval-package")
    artifact = json.loads(Path(args.artifact_json).read_bytes())
    outputs = json.loads(Path(args.upload_outputs).read_bytes())
    raw = Path(args.artifact_zip).read_bytes()
    transport = GitHubReviewTransport(token=token,
        repository="dgilink/kfarmai", run_id=args.run_id, head_sha=head_sha,
        upload_outputs=outputs, artifact_json=artifact, artifact_zip=raw,
        environment=env)
    require(transport.live_authorized(package["manifest"]) is True,
            "LIVE_GITHUB_WRITE_DISABLED")
    from artifact_issue_contract import validate_upload_identity
    from approval_package import render_issue
    name = "review-" + package["manifest"]["approval_id"]
    found = transport.find_upload(name, package["manifest"]["source_run_id"])
    artifact_id = validate_upload_identity(found, artifact, package["manifest"])
    downloaded, downloaded_raw = transport.download(artifact_id)
    rendered = render_issue(package, downloaded, uploaded_raw=downloaded_raw)
    outcome_path = Path(args.output) / "outcome.json"
    outcome = json.loads(outcome_path.read_bytes())
    require(outcome.get("status") == "REVIEW_PENDING_UPLOAD"
            and outcome.get("date") == args.date
            and outcome.get("approval_id") == package["manifest"]["approval_id"]
            and outcome.get("manifest_sha256") == package["manifest_sha256"]
            and type(outcome.get("claim_issue_number")) is int,
            "BLOCKED_OUTCOME_BINDING")
    issue = gate.finalize(outcome["claim_issue_number"], rendered)
    outcome.update(status="REVIEW", artifact_id=artifact["id"],
                   issue_number=issue["number"], issue_url=issue.get("html_url"),
                   review_channel="github_issue", published=False)
    outcome_path.write_bytes(canonical(outcome) + b"\n")
    return outcome


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("generate", "finalize"))
    parser.add_argument("--root", default=".")
    parser.add_argument("--output", required=True)
    parser.add_argument("--date", required=True)
    parser.add_argument("--run-id", required=True, type=int)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--artifact-json")
    parser.add_argument("--upload-outputs")
    parser.add_argument("--artifact-zip")
    args = parser.parse_args(argv)
    try:
        if args.command == "finalize":
            require(all((args.artifact_json, args.upload_outputs, args.artifact_zip)),
                    "DAILY_ARTIFACT_INPUT_MISSING")
        result = run_command(args, os.environ)
        print(json.dumps({k: result.get(k) for k in
              ("status", "approval_id", "manifest_sha256", "artifact_id", "issue_number", "issue_url")},
              ensure_ascii=False, sort_keys=True))
    except Exception as error:
        code = error.code if isinstance(error, Blocked) else (
            str(error) if isinstance(error, BudgetBlocked) else "DAILY_EXECUTION_FAILED")
        print(json.dumps({"status": "HOLD", "reason": code}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
