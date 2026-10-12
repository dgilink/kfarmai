"""One-shot Gate B bootstrap. Invoked only by the protected manual workflow.

This module has no import-time network or database effects. The database role
can arm one pinned scope and invoke only the existing scoped budget protocol.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

from canary_input import (InputBound, OfficialTokenCounter, TOKEN_COUNT_MAXIMUM_MICROUSD,
                          count_payload, request_sha)
from durable_budget import BudgetBlocked, fingerprint
from light_canary import (BOOTSTRAP_APPROVAL_ID, FIRST_CANARY_BOOTSTRAP, CanaryRunner,
                          ResponsesTransport, contract, plan, request_payload, require)
from scoped_canary import ScopedCanaryBudget, scope_identity

REPOSITORY = "dgilink/kfarmai"
DB_ROLE = "kfarmai_canary_runner"
PROJECT_REF = "xzetqijeucldbfgjuoes"
MODEL_APPROVAL = "gateb-model-20261011-r3"
BUDGET_APPROVAL = "gateb-budget-20261011-r3"
ALLOWED_COMMANDS = frozenset({"status", "reserve", "dispatch", "settle", "unknown", "freeze"})


def verified_connection_info(psycopg, dsn, ca_file):
    """Require a project-specific Supabase endpoint with full TLS identity check."""
    require(isinstance(dsn, str) and dsn and isinstance(ca_file, str) and ca_file,
            "BOOTSTRAP_DATABASE_CREDENTIAL_MISSING")
    options = psycopg.conninfo.conninfo_to_dict(dsn)
    host = options.get("host", "")
    direct = host == f"db.{PROJECT_REF}.supabase.co" and options.get("user") == DB_ROLE
    session = (re.fullmatch(r"aws-[0-9]+-[a-z0-9-]+\.pooler\.supabase\.com", host)
               is not None and options.get("user") == f"{DB_ROLE}.{PROJECT_REF}")
    require((direct or session) and options.get("dbname") == "postgres" and
            str(options.get("port", "5432")) == "5432" and
            options.get("hostaddr") is None and
            options.get("service") is None and
            options.get("passfile") is None and
            options.get("options") is None,
            "BOOTSTRAP_DATABASE_TARGET_MISMATCH")
    return psycopg.conninfo.make_conninfo(dsn, sslmode="verify-full",
                                         sslrootcert=ca_file, connect_timeout=10)


def arm_payload():
    return {**scope_identity(BOOTSTRAP_APPROVAL_ID),
            "model_approval_id": MODEL_APPROVAL,
            "budget_approval_id": BUDGET_APPROVAL,
            "daily_microusd": 212, "ttl_seconds": 300,
            "billing_multiplier": "1.10"}


def verify_runner_context(env, checkout_sha):
    require(env.get("GITHUB_REPOSITORY") == REPOSITORY and
            env.get("GITHUB_REF") == "refs/heads/main" and
            env.get("GITHUB_EVENT_NAME") == "workflow_dispatch" and
            env.get("GITHUB_RUN_ATTEMPT") == "1" and
            env.get("GITHUB_WORKFLOW_REF") ==
            f"{REPOSITORY}/.github/workflows/kfarmai-gateb-bootstrap.yml@refs/heads/main" and
            env.get("GITHUB_ACTOR_ID") == "293838055" and
            env.get("GITHUB_SHA") == checkout_sha and
            env.get("KFARMAI_GATEB_BOOTSTRAP_HEAD_SHA") == checkout_sha and
            env.get("KFARMAI_GATEB_BOOTSTRAP_APPROVAL_ID") == BOOTSTRAP_APPROVAL_ID,
            "BOOTSTRAP_GITHUB_CONTEXT_MISMATCH")
    require(env.get("KFARMAI_AUTOPUBLISH_ENABLED") == "false" and
            env.get("KFARMAI_REVIEW_PUBLISH_ENABLED") == "false" and
            env.get("KFARMAI_GATEB_CANARY_ENV_READY") == "true",
            "AUTOPUBLISH_LOCK_UNVERIFIED")
    expected = plan()
    require(expected["model"] == "gpt-6-luna" and
            expected["maximum_microusd"] == 212 and
            expected["max_input_tokens"] == 512 and
            expected["max_output_tokens"] == 128 and
            expected["calls"] == 1 and expected["retries"] == 0 and
            expected["search"] == 0 and expected["images"] == 0 and
            contract()["live_enabled"] is False and
            contract()["token_counter_billing"] == "CONSERVATIVE_SECOND_INPUT_PASS" and
            TOKEN_COUNT_MAXIMUM_MICROUSD == 71,
            "BOOTSTRAP_PLAN_MISMATCH")
    return expected


class BootstrapDatabase:
    """Dedicated direct Postgres login; never accepts an arbitrary SQL command."""
    def __init__(self, connection):
        self.connection = connection

    def check_role(self):
        # pg_stat_ssl describes the pooler -> Postgres hop, not this client's TLS.
        # The connection is opened with verify-full by verified_connection_info().
        require(self.connection.pgconn.ssl_in_use is True,
                "DEDICATED_DATABASE_ROLE_OR_TLS_REQUIRED")
        with self.connection.cursor() as cursor:
            cursor.execute("select session_user, current_user, current_database()")
            role, effective, database = cursor.fetchone()
        require(role == DB_ROLE and effective == DB_ROLE and database == "postgres",
                "DEDICATED_DATABASE_ROLE_OR_TLS_REQUIRED")

    def control(self, command, payload):
        require(command in {"preflight", "arm"} and payload == arm_payload(),
                "BOOTSTRAP_CONTROL_DENIED")
        with self.connection.cursor() as cursor:
            cursor.execute("select kfarmai_private.bootstrap_canary_control(%s,%s::jsonb)",
                           (command, json.dumps(payload, sort_keys=True)))
            value = cursor.fetchone()[0]
        require(isinstance(value, dict), "BOOTSTRAP_CONTROL_UNCONFIRMED")
        return value

    def __call__(self, command, payload):
        require(command in ALLOWED_COMMANDS and payload.get("approval_id") ==
                BOOTSTRAP_APPROVAL_ID and
                all(payload.get(k) == v for k, v in scope_identity(BOOTSTRAP_APPROVAL_ID).items()),
                "BOOTSTRAP_RPC_DENIED")
        with self.connection.cursor() as cursor:
            cursor.execute("select kfarmai_private.bootstrap_canary_budget(%s,%s::jsonb)",
                           (command, json.dumps(payload, sort_keys=True)))
            value = cursor.fetchone()[0]
        require(isinstance(value, dict), "BOOTSTRAP_RPC_UNCONFIRMED")
        return value


def run_bootstrap(database, api_key, *, counter_factory=OfficialTokenCounter,
                  transport_factory=ResponsesTransport):
    """Complete preflight before arm, then reserve/count/dispatch/settle in one call."""
    database.check_role()
    expected = plan()
    require(database.control("preflight", arm_payload()).get("ready") is True,
            "BOOTSTRAP_PREFLIGHT_BLOCKED")
    require(isinstance(api_key, str) and bool(api_key), "OPENAI_KEY_REQUIRED")
    budget = ScopedCanaryBudget(database, BOOTSTRAP_APPROVAL_ID)
    input_hash = request_sha(count_payload(expected["payload"]))
    pricing_hash = fingerprint({"model": expected["model"],
                                "approval_id": BOOTSTRAP_APPROVAL_ID,
                                "counter_maximum_microusd": 71,
                                "total_maximum_microusd": 212,
                                "billing_multiplier": "1.10"})

    def authorize_count(sha):
        if sha != input_hash:
            return None
        return {"approved": True, "conservative_reservation": True,
                "maximum_microusd": 71, "pricing_evidence_sha256": pricing_hash}

    bound = InputBound(counter_factory(api_key, authorize_count))

    def authorize_response(sha):
        if sha != fingerprint(expected["payload"]):
            return False
        status = budget.call("status", budget.identity)
        budget.assert_call_deadline()
        return (status.get("state") == "DISPATCHED" and
                status.get("locked") is True and
                status.get("can_dispatch") is False)

    transport = transport_factory(api_key, authorize_response, bound)
    runner = CanaryRunner(budget, transport, budget.verify_authorization, bound,
                          execution_mode=FIRST_CANARY_BOOTSTRAP)
    armed = database.control("arm", arm_payload())
    require(armed.get("state") == "ARMED" and armed.get("approval_id") ==
            BOOTSTRAP_APPROVAL_ID, "BOOTSTRAP_ARM_UNCONFIRMED")
    return runner.run(BOOTSTRAP_APPROVAL_ID)


def main():
    try:
        root = Path(__file__).resolve().parents[1]
        checkout_sha = subprocess.check_output(["git", "rev-parse", "HEAD"],
                                                cwd=root, text=True, timeout=5).strip()
        verify_runner_context(os.environ, checkout_sha)
        import psycopg
        dsn = os.environ.get("KFARMAI_CANARY_DB_DSN")
        ca_pem = os.environ.get("KFARMAI_CANARY_DB_CA_PEM")
        api_key = os.environ.get("OPENAI_API_KEY")
        require(bool(dsn) and bool(api_key) and isinstance(ca_pem, str) and
                ca_pem.startswith("-----BEGIN CERTIFICATE-----") and
                ca_pem.strip().endswith("-----END CERTIFICATE-----"),
                "BOOTSTRAP_CREDENTIAL_MISSING")
        with tempfile.NamedTemporaryFile(mode="w", encoding="ascii", suffix=".crt",
                                         delete=True) as ca_file:
            ca_file.write(ca_pem)
            ca_file.flush()
            connection_info = verified_connection_info(psycopg, dsn, ca_file.name)
            with psycopg.connect(connection_info, autocommit=True) as connection:
                result = run_bootstrap(BootstrapDatabase(connection), api_key)
        print(json.dumps({k: result[k] for k in
              ("mode", "publishable", "item_count", "output_sha256", "usage",
               "actual_microusd", "reservation_id", "model_calls",
               "token_count_requests", "search_calls", "image_calls", "retries")},
              sort_keys=True))
    except Exception as exc:
        # Never print provider bodies, DSNs, keys, SQL parameters or raw output.
        code = str(exc) if isinstance(exc, BudgetBlocked) else "BOOTSTRAP_EXECUTION_FAILED"
        print(json.dumps({"status": "HOLD", "reason": code}), file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
