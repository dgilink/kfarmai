"""Pure contract for the solo protected publication environment.

This module performs no GitHub requests and cannot create or update an
environment.  It builds and verifies the exact REST payload used only after a
separate operator approval.
"""
from __future__ import annotations

from kfarmai_review_approval import require


ENVIRONMENT = "kfarmai-production-publish"
OWNER_LOGIN = "dgilink"
OWNER_ID = 293838055


def environment_update() -> dict:
    """No reviewer claim: two owner commands are enforced by the publisher."""
    return {
        "wait_timer": 1,
        "prevent_self_review": False,
        "reviewers": [],
        "deployment_branch_policy": {
            "protected_branches": False,
            "custom_branch_policies": True,
        },
        "can_admins_bypass": False,
    }


def verify_environment(environment: dict, branch_policies: dict) -> bool:
    expected = environment_update()
    require(environment.get("name") == ENVIRONMENT
            and environment.get("can_admins_bypass") is False,
            "BLOCKED_ENVIRONMENT")
    require(environment.get("deployment_branch_policy")
            == expected["deployment_branch_policy"], "BLOCKED_ENVIRONMENT_BRANCH")
    rules = environment.get("protection_rules")
    require(isinstance(rules, list), "BLOCKED_ENVIRONMENT")
    required = [rule for rule in rules if rule.get("type") == "required_reviewers"]
    require(not required, "BLOCKED_ENVIRONMENT_REVIEW")
    waits = [rule for rule in rules if rule.get("type") == "wait_timer"]
    require(len(waits) == 1 and waits[0].get("wait_timer") == 1,
            "BLOCKED_ENVIRONMENT_WAIT_TIMER")
    policies = branch_policies.get("branch_policies")
    require(branch_policies.get("total_count") == 1 and isinstance(policies, list)
            and len(policies) == 1 and policies[0].get("name") == "main"
            and policies[0].get("type") == "branch",
            "BLOCKED_ENVIRONMENT_BRANCH")
    return True

