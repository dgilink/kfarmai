"""Protected daily REVIEW worker. No publication or Pages operation exists here."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import sys
import tempfile

from daily_review_issue import GitHubIssueIndex, GitHubReviewTransport, load_package
from durable_budget import DurableBudget, BudgetBlocked
from kfarmai_daily_autopublish import KST
from kfarmai_review_approval import Blocked, canonical, require
from real_daily_provider import OpenAIResponses, OfficialSourceClient, RealDailyProvider
from source_policy import load_domains


ROLE = "kfarmai_daily_runner"
PROJECT_REF = "xzetqijeucldbfgjuoes"
WORKFLOW_REF = "dgilink/kfarmai/.github/workflows/kfarmai-daily-autopublish.yml@refs/heads/main"
COMMANDS = frozenset({"reserve", "dispatch", "settle", "unknown", "freeze",
                      "issue_claim", "issue_creating", "issue_complete", "status"})


def verified_connection_info(psycopg, dsn, ca_file):
    require(isinstance(dsn, str) and dsn and isinstance(ca_file, str) and ca_file,
            "DAILY_DATABASE_CREDENTIAL_MISSING")
    options = psycopg.conninfo.conninfo_to_dict(dsn)
    host = options.get("host", "")
    direct = host == f"db.{PROJECT_REF}.supabase.co" and options.get("user") == ROLE
    session = (re.fullmatch(r"aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com", host)
               and options.get("user") == f"{ROLE}.{PROJECT_REF}")
    require((direct or session) and options.get("dbname") == "postgres"
            and str(options.get("port", "5432")) == "5432"
            and options.get("hostaddr") is None and options.get("service") is None
            and options.get("passfile") is None and options.get("options") is None,
            "DAILY_DATABASE_TARGET_MISMATCH")
    return psycopg.conninfo.make_conninfo(dsn, sslmode="verify-full",
                                         sslrootcert=ca_file, connect_timeout=10)


class DailyBudgetDatabase:
    def __init__(self, connection):
        self.connection = connection

    def check_role(self):
        require(self.connection.pgconn.ssl_in_use is True, "DAILY_DATABASE_TLS_REQUIRED")
        with self.connection.cursor() as cursor:
            cursor.execute("select session_user, current_user, current_database()")
            role, effective, database = cursor.fetchone()
        require(role == ROLE and effective == ROLE and database == "postgres",
                "DAILY_DATABASE_ROLE_REQUIRED")

    def __call__(self, command, payload):
        require(command in COMMANDS and isinstance(payload, dict), "DAILY_RPC_DENIED")
        with self.connection.cursor() as cursor:
            cursor.execute("select kfarmai_private.daily_review_budget(%s,%s::jsonb)",
                           (command, json.dumps(payload, sort_keys=True)))
            value = cursor.fetchone()[0]
        require(isinstance(value, dict), "DAILY_RPC_UNCONFIRMED")
        return value


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
    dsn, ca_pem = env.get("KFARMAI_DAILY_DB_DSN"), env.get("KFARMAI_DAILY_DB_CA_PEM")
    require(isinstance(ca_pem, str) and ca_pem.startswith("-----BEGIN CERTIFICATE-----")
            and ca_pem.strip().endswith("-----END CERTIFICATE-----") and dsn,
            "DAILY_DATABASE_CREDENTIAL_MISSING")
    import psycopg
    with tempfile.NamedTemporaryFile(mode="w", encoding="ascii", suffix=".crt", delete=True) as ca:
        ca.write(ca_pem)
        ca.flush()
        connection_info = verified_connection_info(psycopg, dsn, ca.name)
        with psycopg.connect(connection_info, autocommit=True) as connection:
            rpc = DailyBudgetDatabase(connection)
            rpc.check_role()
            budget = DurableBudget(rpc)
            if args.command == "generate":
                status = budget.call("status", {})
                require(status.get("enabled") is True
                        and status.get("day_kst") == args.date
                        and status.get("limit") == 150000
                        and status.get("unconfirmed") == 0,
                        "DAILY_BUDGET_NOT_READY")
                root = Path(args.root).resolve()
                key = env.get("OPENAI_API_KEY")
                require(isinstance(key, str) and key, "BLOCKED_OPENAI_KEY")
                provider = RealDailyProvider(root, OfficialSourceClient(load_domains(root)),
                                             OpenAIResponses(key), budget,
                                             GitHubIssueIndex(env.get("GH_TOKEN")))
                recovery = env.get("KFARMAI_DAILY_RECOVERY", "none")
                result = provider.run(date=args.date, run_id=args.run_id, head_sha=head_sha,
                                      output=args.output,
                                      recovery_from=("38209820550" if recovery == "incident_38209820550"
                                                     else "38218191801" if recovery == "incident_38218191801"
                                                     else "38222769553" if recovery == "incident_38222769553"
                                                     else None))
                return result["outcome"]
            package = load_package(Path(args.output) / "approval-package")
            artifact = json.loads(Path(args.artifact_json).read_bytes())
            outputs = json.loads(Path(args.upload_outputs).read_bytes())
            raw = Path(args.artifact_zip).read_bytes()
            transport = GitHubReviewTransport(token=env.get("GH_TOKEN"),
                repository="dgilink/kfarmai", run_id=args.run_id, head_sha=head_sha,
                upload_outputs=outputs, artifact_json=artifact, artifact_zip=raw,
                environment=env)
            from artifact_issue_contract import review_report
            result = review_report(package, transport, budget)
            outcome_path = Path(args.output) / "outcome.json"
            outcome = json.loads(outcome_path.read_bytes())
            require(outcome.get("status") == "REVIEW_PENDING_UPLOAD"
                    and outcome.get("date") == args.date
                    and outcome.get("approval_id") == package["manifest"]["approval_id"]
                    and outcome.get("manifest_sha256") == package["manifest_sha256"],
                    "BLOCKED_OUTCOME_BINDING")
            outcome.update(status="REVIEW", artifact_id=artifact["id"],
                           issue_number=result["issue"]["number"],
                           issue_url=result["issue"].get("html_url"), published=False)
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
