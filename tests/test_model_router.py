from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from automation.model_router import (
    OUTCOME_BLOCK,
    OUTCOME_REVIEW,
    OUTCOME_RETRY,
    TIER_HIGH,
    TIER_LIGHT,
    TIER_NONE,
    TIER_STANDARD,
    RouteDecision,
    RoutingLedger,
    TaskProfile,
    load_model_config,
    route_autopublish_stages,
    route_task,
    validate_decision,
)


DEFAULT_ENV = {
    "KFARMAI_MODEL_LIGHT": "gpt-6-luna",
    "KFARMAI_MODEL_STANDARD": "gpt-6.1-sol",
    "KFARMAI_MODEL_HIGH": "gpt-6-astra",
    "KFARMAI_HIGH_TIER_ENABLED": "false",
}


class ModelRouterTests(unittest.TestCase):
    def route(self, task_type: str, **kwargs):
        return route_task(TaskProfile(task_type=task_type, **kwargs), DEFAULT_ENV)

    def test_simple_api_fetch_uses_none(self):
        decision = self.route("rest_api_fetch", known_official_api=True)
        self.assertEqual(decision.tier, TIER_NONE)
        self.assertIsNone(decision.model)

    def test_json_parsing_uses_none(self):
        self.assertEqual(self.route("json_parse", structured_input=True).tier, TIER_NONE)

    def test_html_selector_extract_uses_none(self):
        self.assertEqual(self.route("html_selector_extract").tier, TIER_NONE)

    def test_metadata_parse_uses_none(self):
        self.assertEqual(self.route("metadata_parse").tier, TIER_NONE)

    def test_simple_relevance_uses_luna(self):
        decision = self.route("source_relevance", needs_semantic_extraction=True)
        self.assertEqual((decision.tier, decision.model, decision.reasoning_effort), (TIER_LIGHT, "gpt-6-luna", "none"))

    def test_simple_tagging_uses_luna(self):
        self.assertEqual(self.route("tagging", needs_semantic_extraction=True).model, "gpt-6-luna")

    def test_three_source_simple_summary_stays_light(self):
        decision = self.route("short_summary", source_count=3, needs_synthesis=True)
        self.assertEqual(decision.tier, TIER_LIGHT)

    def test_five_source_complex_synthesis_uses_standard(self):
        decision = self.route(
            "multiple_source_synthesis",
            source_count=5,
            needs_synthesis=True,
            cross_source_synthesis=True,
        )
        self.assertEqual((decision.tier, decision.model), (TIER_STANDARD, "gpt-6.1-sol"))
        self.assertIn("LIGHT_INSUFFICIENT", decision.reason)

    def test_source_conflict_uses_standard_not_high(self):
        decision = self.route(
            "conflicting_source_comparison",
            source_count=2,
            needs_synthesis=True,
            source_conflict=True,
            risk="REVIEW",
        )
        self.assertEqual(decision.tier, TIER_STANDARD)
        self.assertTrue(decision.review_required)

    def test_review_risk_alone_never_calls_high(self):
        decision = self.route("human_review", risk="REVIEW")
        self.assertEqual(decision.tier, TIER_NONE)
        self.assertEqual(decision.outcome, OUTCOME_REVIEW)
        self.assertIsNone(decision.model)

    def test_human_escalation_enabled_uses_astra(self):
        env = {**DEFAULT_ENV, "KFARMAI_HIGH_TIER_ENABLED": "true"}
        decision = route_task(
            TaskProfile(task_type="critical_cross_check", human_escalation=True, human_escalation_id="owner-42"),
            env,
        )
        self.assertEqual((decision.tier, decision.model), (TIER_HIGH, "gpt-6-astra"))
        self.assertIn("human_escalation_id=owner-42", decision.reason)

    def test_human_escalation_disabled_goes_to_review(self):
        decision = self.route("critical_cross_check", human_escalation=True, human_escalation_id="owner-42")
        self.assertEqual((decision.tier, decision.outcome), (TIER_NONE, OUTCOME_REVIEW))
        self.assertTrue(decision.blocked)

    def test_high_enabled_without_authorization_id_is_blocked(self):
        env = {**DEFAULT_ENV, "KFARMAI_HIGH_TIER_ENABLED": "true"}
        decision = route_task(TaskProfile(task_type="critical_cross_check", human_escalation=True), env)
        self.assertEqual((decision.tier, decision.outcome), (TIER_NONE, OUTCOME_BLOCK))

    def test_unresolved_conflict_needs_explicit_policy_reason_for_high(self):
        env = {**DEFAULT_ENV, "KFARMAI_HIGH_TIER_ENABLED": "true"}
        blocked = route_task(TaskProfile(task_type="critical_cross_check", unresolved_source_conflict=True), env)
        allowed = route_task(
            TaskProfile(
                task_type="critical_cross_check",
                unresolved_source_conflict=True,
                approved_policy_reason="owner-approved-final-conflict-cross-check",
            ),
            env,
        )
        self.assertEqual((blocked.tier, blocked.outcome), (TIER_NONE, OUTCOME_BLOCK))
        self.assertEqual(allowed.tier, TIER_HIGH)
        self.assertIn("explicit_policy_reason=", allowed.reason)

    def test_network_error_retries_same_tier_without_sol_fallback(self):
        decision = self.route("source_relevance", failure_type="network", previous_tier="LIGHT")
        self.assertEqual((decision.tier, decision.outcome), (TIER_LIGHT, OUTCOME_RETRY))
        self.assertNotEqual(decision.model, "gpt-6.1-sol")

    def test_parser_error_does_not_call_a_model(self):
        decision = self.route("html_selector_extract", failure_type="parser_error")
        self.assertEqual(decision.tier, TIER_NONE)
        self.assertIsNone(decision.model)

    def test_schema_error_has_only_one_same_tier_repair(self):
        repair = self.route("messy_text_structuring", failure_type="schema_parse", previous_tier="LIGHT", schema_repair_attempts=0)
        held = self.route("messy_text_structuring", failure_type="schema_parse", previous_tier="LIGHT", schema_repair_attempts=1)
        self.assertEqual((repair.tier, repair.outcome), (TIER_LIGHT, OUTCOME_RETRY))
        self.assertEqual((held.tier, held.outcome), (TIER_NONE, OUTCOME_REVIEW))

    def test_known_official_api_disables_web_search(self):
        decision = self.route("source_discovery", known_official_api=True, needs_search=True)
        self.assertEqual(decision.tier, TIER_NONE)
        self.assertFalse(decision.web_search_enabled)
        self.assertEqual(decision.max_search_calls, 0)

    def test_first_search_sufficient_caps_calls_at_one(self):
        decision = self.route("source_discovery", needs_search=True, search_attempts=1, search_results_sufficient=True)
        self.assertEqual(decision.tier, TIER_NONE)
        self.assertFalse(decision.web_search_enabled)
        self.assertEqual(decision.max_search_calls, 0)

    def test_search_defaults_to_one_call_and_light(self):
        decision = self.route("source_discovery", needs_search=True)
        self.assertEqual((decision.tier, decision.max_search_calls), (TIER_LIGHT, 1))

    def test_query_retry_exhaustion_requires_explicit_semantic_insufficiency_for_standard(self):
        decision = self.route(
            "source_discovery",
            needs_search=True,
            search_attempts=2,
            semantic_insufficiency=True,
        )
        self.assertEqual(decision.tier, TIER_NONE)
        self.assertTrue(decision.blocked)
        self.assertIn("SEARCH_EXHAUSTED", decision.reason)

    def test_daily_budget_exceeded_blocks_model_route(self):
        decision = self.route("tagging", needs_semantic_extraction=True, daily_budget_exceeded=True)
        self.assertEqual((decision.tier, decision.outcome), (TIER_NONE, OUTCOME_BLOCK))
        self.assertTrue(decision.blocked)

    def test_daily_budget_does_not_block_deterministic_parse(self):
        decision = self.route("json_parse", daily_budget_exceeded=True)
        self.assertEqual(decision.tier, TIER_NONE)
        self.assertFalse(decision.blocked)

    def test_legacy_text_model_is_light_only(self):
        config = load_model_config({"KFARMAI_TEXT_MODEL": "legacy-light", "KFARMAI_HIGH_TIER_ENABLED": "false"})
        self.assertEqual(config.light, "legacy-light")
        self.assertEqual(config.standard, "gpt-6.1-sol")
        self.assertEqual(config.high, "gpt-6-astra")

    def test_environment_specific_models_take_precedence(self):
        env = {
            "KFARMAI_MODEL_LIGHT": "light-x",
            "KFARMAI_MODEL_STANDARD": "standard-x",
            "KFARMAI_MODEL_HIGH": "high-x",
            "KFARMAI_TEXT_MODEL": "legacy",
            "KFARMAI_HIGH_TIER_ENABLED": "true",
        }
        config = load_model_config(env)
        self.assertEqual((config.light, config.standard, config.high), ("light-x", "standard-x", "high-x"))

    def test_standard_without_light_insufficient_reason_is_rejected(self):
        bad = RouteDecision(TIER_STANDARD, "gpt-6.1-sol", "medium", False, None, 0, "because", "standard")
        with self.assertRaisesRegex(ValueError, "STANDARD_REASON_REQUIRED"):
            validate_decision(bad)

    def test_high_without_explicit_authorization_reason_is_rejected(self):
        bad = RouteDecision(TIER_HIGH, "gpt-6-astra", "high", False, None, 0, "because", "high")
        with self.assertRaisesRegex(ValueError, "HIGH_AUTHORIZATION_REASON_REQUIRED"):
            validate_decision(bad)

    def test_routing_ledger_tracks_tiers_and_search_calls(self):
        profile = TaskProfile(task_type="source_discovery", needs_search=True)
        decision = route_task(profile, DEFAULT_ENV)
        ledger = RoutingLedger()
        ledger.record(profile, decision, web_search_calls=1)
        ledger.record(TaskProfile(task_type="json_parse"), self.route("json_parse"))
        self.assertEqual(ledger.tier_counts(), {TIER_NONE: 1, TIER_LIGHT: 1, TIER_STANDARD: 0, TIER_HIGH: 0})
        with tempfile.TemporaryDirectory() as directory:
            path = ledger.write(Path(directory) / "run-output" / "model-routing.json")
            data = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(data[0]["web_search_calls"], 1)

    def test_routing_ledger_blocks_excess_search_calls(self):
        profile = TaskProfile(task_type="source_discovery", needs_search=True)
        decision = route_task(profile, DEFAULT_ENV)
        with self.assertRaisesRegex(ValueError, "SEARCH_CALL_LIMIT_EXCEEDED"):
            RoutingLedger().record(profile, decision, web_search_calls=3)

    def test_autopublish_stage_plan_keeps_fetch_normalize_risk_and_review_model_free(self):
        stages = route_autopublish_stages(
            official_source_available=True,
            source_count=3,
            cross_source_synthesis=False,
            source_conflict=False,
            risk="REVIEW",
            env=DEFAULT_ENV,
        )
        self.assertEqual(stages["source_discovery"].tier, TIER_NONE)
        self.assertEqual(stages["source_normalization"].tier, TIER_NONE)
        self.assertEqual(stages["content_synthesis"].tier, TIER_LIGHT)
        self.assertEqual(stages["risk_gate"].tier, TIER_NONE)
        self.assertEqual(stages["review"].tier, TIER_NONE)
        self.assertTrue(stages["review"].review_required)

    def test_autopublish_five_source_cross_synthesis_uses_standard_only_for_stage_c(self):
        stages = route_autopublish_stages(
            official_source_available=False,
            source_count=5,
            cross_source_synthesis=True,
            source_conflict=False,
            risk="LOW",
            env=DEFAULT_ENV,
        )
        self.assertEqual(stages["source_discovery"].tier, TIER_LIGHT)
        self.assertEqual(stages["content_synthesis"].tier, TIER_STANDARD)
        self.assertNotIn(TIER_HIGH, [decision.tier for decision in stages.values()])

    def test_router_module_contains_no_provider_or_network_client(self):
        source = Path("automation/model_router.py").read_text(encoding="utf-8").lower()
        for forbidden in ("api.openai.com", "responses.create", "urllib.request", "requests.", "httpx.", "fetch("):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
