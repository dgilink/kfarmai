#!/usr/bin/env python3
"""KFarmAI Phase Model Router v1.1.

The router is policy-only: it selects a tier and records why. It does not make
HTTP requests, call a model, publish content, or mutate Production state.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Mapping, Optional, Sequence


TIER_NONE = "NONE"
TIER_LIGHT = "LIGHT"
TIER_STANDARD = "STANDARD"
TIER_HIGH = "HIGH"

OUTCOME_ROUTE = "ROUTE"
OUTCOME_RETRY = "RETRY_SAME_TIER"
OUTCOME_REVIEW = "REVIEW"
OUTCOME_BLOCK = "BLOCK"

DEFAULT_LIGHT_MODEL = "gpt-6-luna"
DEFAULT_STANDARD_MODEL = "gpt-6.1-sol"
DEFAULT_HIGH_MODEL = "gpt-6-astra"

DETERMINISTIC_TASKS = frozenset(
    {
        "http_fetch",
        "known_url_fetch",
        "rest_api_fetch",
        "xml_parse",
        "json_parse",
        "rss_parse",
        "sitemap_parse",
        "robots_parse",
        "metadata_parse",
        "html_selector_extract",
        "regex_extract",
        "date_parse",
        "price_parse",
        "dedupe",
        "hash",
        "url_validation",
        "http_status",
        "official_domain_validation",
        "source_normalization",
        "risk_gate",
        "store",
    }
)

LIGHT_TASKS = frozenset(
    {
        "content_generation",
        "query_expansion",
        "source_discovery",
        "source_relevance",
        "simple_categorization",
        "tagging",
        "short_summary",
        "messy_text_structuring",
        "title_normalization",
        "semantic_duplicate_check",
        "html_extraction_fallback",
    }
)

STANDARD_TASKS = frozenset(
    {
        "multiple_source_synthesis",
        "long_document_synthesis",
        "conflicting_source_comparison",
        "complex_claim_source_mapping",
    }
)

TECHNICAL_FAILURES = frozenset(
    {
        "http",
        "network",
        "rate_limit",
        "schema_parse",
        "source_unavailable",
        "malformed_input",
        "parser_error",
    }
)


@dataclass(frozen=True)
class TaskProfile:
    task_type: str
    source_type: str = "unknown"
    source_count: int = 0
    structured_input: bool = False
    deterministic_possible: Optional[bool] = None
    known_official_api: bool = False
    known_official_url: bool = False
    needs_search: bool = False
    needs_semantic_extraction: bool = False
    needs_synthesis: bool = False
    cross_source_synthesis: bool = False
    source_conflict: bool = False
    unresolved_source_conflict: bool = False
    critical_safety_review: bool = False
    risk: str = "LOW"
    input_chars: int = 0
    human_escalation: bool = False
    human_escalation_id: str = ""
    explicit_policy_reason: str = ""
    approved_policy_reason: str = ""
    failure_type: str = ""
    previous_tier: str = ""
    schema_repair_attempts: int = 0
    search_attempts: int = 0
    search_results_sufficient: bool = False
    semantic_insufficiency: bool = False
    daily_budget_exceeded: bool = False


@dataclass(frozen=True)
class RouteDecision:
    tier: str
    model: Optional[str]
    reasoning_effort: str
    web_search_enabled: bool
    search_context_size: Optional[str]
    max_search_calls: int
    reason: str
    estimated_budget_class: str
    outcome: str = OUTCOME_ROUTE
    review_required: bool = False
    blocked: bool = False


@dataclass(frozen=True)
class ModelConfig:
    light: str
    standard: str
    high: str
    high_tier_enabled: bool


def load_model_config(env: Optional[Mapping[str, str]] = None) -> ModelConfig:
    values = os.environ if env is None else env
    # KFARMAI_TEXT_MODEL remains a LIGHT-only compatibility fallback. It must
    # never select STANDARD or HIGH implicitly.
    light = (
        str(values.get("KFARMAI_MODEL_LIGHT", "")).strip()
        or str(values.get("KFARMAI_TEXT_MODEL", "")).strip()
        or DEFAULT_LIGHT_MODEL
    )
    standard = str(values.get("KFARMAI_MODEL_STANDARD", "")).strip() or DEFAULT_STANDARD_MODEL
    high = str(values.get("KFARMAI_MODEL_HIGH", "")).strip() or DEFAULT_HIGH_MODEL
    if light in {standard, high, DEFAULT_STANDARD_MODEL, DEFAULT_HIGH_MODEL}:
        raise ValueError("LIGHT_MODEL_TIER_COLLISION")
    if standard in {high, DEFAULT_HIGH_MODEL}:
        raise ValueError("STANDARD_MODEL_TIER_COLLISION")
    enabled = str(values.get("KFARMAI_HIGH_TIER_ENABLED", "false")).strip().lower() == "true"
    return ModelConfig(light=light, standard=standard, high=high, high_tier_enabled=enabled)


def _decision(
    tier: str,
    reason: str,
    config: ModelConfig,
    *,
    outcome: str = OUTCOME_ROUTE,
    review_required: bool = False,
    blocked: bool = False,
    web_search: bool = False,
    max_search_calls: int = 0,
) -> RouteDecision:
    models = {TIER_NONE: None, TIER_LIGHT: config.light, TIER_STANDARD: config.standard, TIER_HIGH: config.high}
    efforts = {TIER_NONE: "none", TIER_LIGHT: "none", TIER_STANDARD: "medium", TIER_HIGH: "high"}
    budgets = {TIER_NONE: "none", TIER_LIGHT: "low", TIER_STANDARD: "standard", TIER_HIGH: "high"}
    decision = RouteDecision(
        tier=tier,
        model=models[tier],
        reasoning_effort=efforts[tier],
        web_search_enabled=web_search,
        search_context_size="low" if web_search else None,
        max_search_calls=max_search_calls if web_search else 0,
        reason=reason,
        estimated_budget_class=budgets[tier],
        outcome=outcome,
        review_required=review_required,
        blocked=blocked,
    )
    validate_decision(decision)
    return decision


def validate_decision(decision: RouteDecision) -> None:
    audit_text = (decision.model or "") + " " + decision.reason
    if re.search(r"\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|gh[opusr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sb_secret_[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~-]{24,})\b", audit_text, re.I):
        raise ValueError("ROUTING_SECRET_FORBIDDEN")
    if decision.tier == TIER_NONE and decision.model is not None:
        raise ValueError("NONE_TIER_MODEL_FORBIDDEN")
    if decision.tier == TIER_STANDARD and "LIGHT_INSUFFICIENT" not in decision.reason:
        raise ValueError("STANDARD_REASON_REQUIRED")
    if decision.tier == TIER_HIGH and not (
        "human_escalation_id=" in decision.reason or "explicit_policy_reason=" in decision.reason
    ):
        raise ValueError("HIGH_AUTHORIZATION_REASON_REQUIRED")
    if decision.web_search_enabled and decision.max_search_calls not in (1, 2):
        raise ValueError("SEARCH_CALL_GUARD_INVALID")
    if not decision.web_search_enabled and decision.max_search_calls != 0:
        raise ValueError("SEARCH_DISABLED_WITH_CALLS")


def _technical_failure_route(profile: TaskProfile, config: ModelConfig) -> RouteDecision:
    previous = profile.previous_tier.upper()
    review = profile.risk.strip().upper() == "REVIEW"
    if previous == TIER_LIGHT:
        if profile.failure_type == "schema_parse" and profile.schema_repair_attempts < 1:
            return _decision(
                TIER_LIGHT,
                "TECHNICAL_FAILURE_SCHEMA_REPAIR_ONCE_SAME_TIER",
                config,
                outcome=OUTCOME_RETRY,
                review_required=review,
            )
        if profile.failure_type in {"network", "http", "rate_limit"}:
            return _decision(
                TIER_LIGHT,
                "TECHNICAL_FAILURE_RETRY_SAME_TIER_NO_ESCALATION",
                config,
                outcome=OUTCOME_RETRY,
                review_required=review,
            )
        return _decision(
            TIER_NONE,
            "TECHNICAL_FAILURE_REVIEW_NO_MODEL_ESCALATION",
            config,
            outcome=OUTCOME_REVIEW,
            review_required=True,
        )
    if previous == TIER_STANDARD:
        if profile.failure_type == "schema_parse" and profile.schema_repair_attempts < 1:
            return _decision(
                TIER_STANDARD,
                "STANDARD_REQUIRED: LIGHT_INSUFFICIENT_ALREADY_PROVEN; SCHEMA_REPAIR_ONCE",
                config,
                outcome=OUTCOME_RETRY,
                review_required=review,
            )
        if profile.failure_type in {"network", "http", "rate_limit"}:
            return _decision(
                TIER_STANDARD,
                "STANDARD_REQUIRED: LIGHT_INSUFFICIENT_ALREADY_PROVEN; TECHNICAL_FAILURE_RETRY_SAME_TIER",
                config,
                outcome=OUTCOME_RETRY,
                review_required=review,
            )
        return _decision(
            TIER_NONE,
            "TECHNICAL_FAILURE_REVIEW_NO_HIGH_FALLBACK",
            config,
            outcome=OUTCOME_REVIEW,
            review_required=True,
        )
    return _decision(
        TIER_NONE,
        "DETERMINISTIC_FAILURE_NO_MODEL_ESCALATION",
        config,
        outcome=OUTCOME_REVIEW,
        review_required=True,
    )


def route_task(profile: TaskProfile, env: Optional[Mapping[str, str]] = None) -> RouteDecision:
    config = load_model_config(env)
    # Invalid counters/tiers are policy errors, not a reason to spend tokens.
    for field in ("source_count", "input_chars", "schema_repair_attempts", "search_attempts"):
        value = getattr(profile, field)
        if type(value) is not int or value < 0:
            raise ValueError("ROUTING_INVALID_COUNTER:" + field)
    if profile.previous_tier and profile.previous_tier.strip().upper() not in {TIER_NONE, TIER_LIGHT, TIER_STANDARD, TIER_HIGH}:
        raise ValueError("ROUTING_INVALID_PREVIOUS_TIER")
    if profile.risk.strip().upper() not in {"LOW", "REVIEW", "BLOCK"}:
        raise ValueError("ROUTING_INVALID_RISK")
    profile = replace(profile, task_type=profile.task_type.strip().lower(),
                      previous_tier=profile.previous_tier.strip().upper(),
                      risk=profile.risk.strip().upper(), failure_type=profile.failure_type.strip().lower())
    task_type = profile.task_type
    risk_review = profile.risk.strip().upper() == "REVIEW"
    if profile.daily_budget_exceeded and profile.failure_type.strip().lower() in TECHNICAL_FAILURES:
        return _decision(TIER_NONE, "DAILY_BUDGET_EXCEEDED_RETRY_BLOCKED", config,
                         outcome=OUTCOME_BLOCK, review_required=True, blocked=True)

    if profile.failure_type.strip().lower() in TECHNICAL_FAILURES:
        normalized = TaskProfile(**{**asdict(profile), "failure_type": profile.failure_type.strip().lower()})
        return _technical_failure_route(normalized, config)

    deterministic = profile.deterministic_possible is True or task_type in DETERMINISTIC_TASKS
    official_discovery = task_type == "source_discovery" and (profile.known_official_api or profile.known_official_url)
    if deterministic or official_discovery:
        return _decision(
            TIER_NONE,
            "DETERMINISTIC_PATH_SUFFICIENT" if deterministic else "KNOWN_OFFICIAL_SOURCE_NO_SEARCH",
            config,
            outcome=OUTCOME_REVIEW if risk_review else OUTCOME_ROUTE,
            review_required=risk_review,
        )

    high_requested = (profile.human_escalation or bool(profile.human_escalation_id)
                      or bool(profile.approved_policy_reason)
                      or profile.unresolved_source_conflict or profile.critical_safety_review)
    if high_requested:
        if not config.high_tier_enabled:
            return _decision(
                TIER_NONE,
                "HIGH_TIER_DISABLED_SEND_TO_HUMAN_REVIEW",
                config,
                outcome=OUTCOME_REVIEW,
                review_required=True,
                blocked=True,
            )
        if profile.human_escalation or profile.human_escalation_id:
            if not profile.human_escalation_id.strip():
                return _decision(
                    TIER_NONE,
                    "HIGH_TIER_BLOCKED_MISSING_HUMAN_ESCALATION_ID",
                    config,
                    outcome=OUTCOME_BLOCK,
                    review_required=True,
                    blocked=True,
                )
            authorization = f"human_escalation_id={profile.human_escalation_id.strip()}"
        else:
            if not profile.approved_policy_reason.strip():
                return _decision(
                    TIER_NONE,
                    "HIGH_TIER_BLOCKED_MISSING_EXPLICIT_POLICY_REASON",
                    config,
                    outcome=OUTCOME_BLOCK,
                    review_required=True,
                    blocked=True,
                )
            authorization = f"explicit_policy_reason={profile.approved_policy_reason.strip()}"
        if profile.daily_budget_exceeded:
            return _decision(
                TIER_NONE,
                "DAILY_BUDGET_EXCEEDED_HIGH_ESCALATION_BLOCKED",
                config,
                outcome=OUTCOME_BLOCK,
                review_required=True,
                blocked=True,
            )
        return _decision(
            TIER_HIGH,
            f"HIGH_AUTHORIZED: {authorization}",
            config,
            review_required=True,
        )

    standard_reason = ""
    if profile.source_conflict:
        standard_reason = "LIGHT_INSUFFICIENT_CONFLICTING_OFFICIAL_SOURCES"
    elif profile.source_count >= 4 and profile.cross_source_synthesis and profile.needs_synthesis:
        standard_reason = "LIGHT_INSUFFICIENT_COMPLEX_CROSS_SOURCE_SYNTHESIS"
    elif profile.explicit_policy_reason.strip() and profile.cross_source_synthesis and profile.needs_synthesis:
        standard_reason = "LIGHT_INSUFFICIENT_POLICY_EXCEPTION:" + profile.explicit_policy_reason.strip()

    semantic_task = (
        task_type in LIGHT_TASKS
        or task_type in STANDARD_TASKS
        or profile.needs_semantic_extraction
        or profile.needs_synthesis
        or profile.needs_search
    )
    if (standard_reason or semantic_task) and profile.daily_budget_exceeded:
        return _decision(
            TIER_NONE,
            "DAILY_BUDGET_EXCEEDED_MODEL_ROUTE_BLOCKED",
            config,
            outcome=OUTCOME_BLOCK,
            review_required=risk_review,
            blocked=True,
        )

    if standard_reason:
        return _decision(
            TIER_STANDARD,
            f"STANDARD_REQUIRED: {standard_reason}",
            config,
            review_required=risk_review,
        )

    if semantic_task:
        search = profile.needs_search and not (profile.known_official_api or profile.known_official_url)
        if search and profile.search_results_sufficient:
            return _decision(TIER_NONE, "SEARCH_SUFFICIENT_NO_FURTHER_CALLS", config,
                             outcome=OUTCOME_ROUTE, review_required=risk_review)
        if search and profile.search_attempts >= 2:
            return _decision(TIER_NONE, "SEARCH_EXHAUSTED_SEND_TO_REVIEW", config,
                             outcome=OUTCOME_REVIEW, review_required=True, blocked=True)
        max_calls = 1
        return _decision(
            TIER_LIGHT,
            "LIGHT_SEMANTIC_TASK",
            config,
            review_required=risk_review,
            web_search=search,
            max_search_calls=max_calls if search else 0,
        )

    return _decision(
        TIER_NONE,
        "AMBIGUOUS_TASK_NO_COST_ESCALATION",
        config,
        outcome=OUTCOME_REVIEW,
        review_required=True,
    )


def route_autopublish_stages(
    *,
    official_source_available: bool,
    source_count: int,
    cross_source_synthesis: bool,
    source_conflict: bool,
    risk: str,
    env: Optional[Mapping[str, str]] = None,
    daily_budget_exceeded: bool = False,
) -> dict[str, RouteDecision]:
    """Plan AutoPublish stages without invoking any provider."""
    stage_a = route_task(
        TaskProfile(
            task_type="source_discovery",
            source_type="official_registry_or_api" if official_source_available else "unknown",
            known_official_api=official_source_available,
            needs_search=not official_source_available,
            daily_budget_exceeded=daily_budget_exceeded,
        ),
        env,
    )
    stage_b = route_task(TaskProfile(task_type="source_normalization", structured_input=True), env)
    stage_c = route_task(
        TaskProfile(
            task_type="multiple_source_synthesis" if cross_source_synthesis else "short_summary",
            source_count=source_count,
            structured_input=True,
            needs_synthesis=True,
            cross_source_synthesis=cross_source_synthesis,
            source_conflict=source_conflict,
            risk=risk,
            daily_budget_exceeded=daily_budget_exceeded,
        ),
        env,
    )
    stage_d = route_task(TaskProfile(task_type="risk_gate", structured_input=True, risk=risk), env)
    stage_e = _decision(
        TIER_NONE,
        "HUMAN_REVIEW_STAGE_NO_AUTOMATIC_HIGH_ESCALATION",
        load_model_config(env),
        outcome=OUTCOME_REVIEW if risk.strip().upper() == "REVIEW" else OUTCOME_ROUTE,
        review_required=risk.strip().upper() == "REVIEW",
    )
    return {
        "source_discovery": stage_a,
        "source_normalization": stage_b,
        "content_synthesis": stage_c,
        "risk_gate": stage_d,
        "review": stage_e,
    }


class RoutingLedger:
    """In-memory usage ledger that can be written to run-output on request."""

    def __init__(self) -> None:
        self.entries: list[dict] = []

    def record(self, profile: TaskProfile, decision: RouteDecision, *, web_search_calls: int = 0,
               estimated_budget: float = 0, escalated_from: str = "") -> dict:
        validate_decision(decision)
        if web_search_calls < 0 or web_search_calls > decision.max_search_calls:
            raise ValueError("SEARCH_CALL_LIMIT_EXCEEDED")
        if not decision.web_search_enabled and web_search_calls:
            raise ValueError("SEARCH_FORBIDDEN_FOR_ROUTE")
        entry = {
            "task": profile.task_type,
            "tier": decision.tier,
            "reason": decision.reason,
            "web_search_calls": web_search_calls,
            "estimated_budget_class": decision.estimated_budget_class,
            "outcome": decision.outcome,
            "model": decision.model,
            "reasoning": decision.reasoning_effort,
            "web_search_enabled": decision.web_search_enabled,
            "estimated_budget": estimated_budget,
            "escalated_from": escalated_from,
        }
        if decision.model:
            entry["model"] = decision.model
            entry["reasoning_effort"] = decision.reasoning_effort
        self.entries.append(entry)
        return entry

    def tier_counts(self) -> dict[str, int]:
        return {
            tier: sum(1 for item in self.entries if item["tier"] == tier)
            for tier in (TIER_NONE, TIER_LIGHT, TIER_STANDARD, TIER_HIGH)
        }

    def write(self, path: Path | str) -> Path:
        target = Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(self.entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return target


def decisions_to_dict(decisions: Mapping[str, RouteDecision]) -> dict[str, dict]:
    return {name: asdict(decision) for name, decision in decisions.items()}


__all__: Sequence[str] = (
    "TaskProfile",
    "RouteDecision",
    "ModelConfig",
    "RoutingLedger",
    "load_model_config",
    "route_task",
    "route_autopublish_stages",
    "decisions_to_dict",
    "validate_decision",
    "TIER_NONE",
    "TIER_LIGHT",
    "TIER_STANDARD",
    "TIER_HIGH",
)
