"""Pure contract for the protected production publication environment.

This module performs no GitHub requests and cannot create or update an
environment.  It builds and verifies the exact REST payload used only after a
separate operator approval.
"""
from __future__ import annotations

from kfarmai_review_approval import require


ENVIRONMENT = "kfarmai-production-publish"
OWNER_LOGIN = "dgilink"
OWNER_ID = 293838055
ALLOWED_PERMISSIONS = frozenset({"read", "triage", "write", "maintain", "admin"})


def environment_update(reviewer: dict) -> dict:
    require(isinstance(reviewer, dict), "BLOCKED_REVIEWER")
    reviewer_id = reviewer.get("id")
    login = reviewer.get("login")
    permission = reviewer.get("permission")
    require(type(reviewer_id) is int and reviewer_id > 0 and reviewer_id != OWNER_ID,
            "BLOCKED_SELF_REVIEW")
    require(isinstance(login, str) and login and login != OWNER_LOGIN,
            "BLOCKED_SELF_REVIEW")
    require(permission in ALLOWED_PERMISSIONS, "BLOCKED_REVIEWER_PERMISSION")
    return {
        "wait_timer": 0,
        "prevent_self_review": True,
        "reviewers": [{"type": "User", "id": reviewer_id}],
        "deployment_branch_policy": {
            "protected_branches": False,
            "custom_branch_policies": True,
        },
        "can_admins_bypass": False,
    }


def verify_environment(environment: dict, branch_policies: dict,
                       reviewer: dict) -> bool:
    expected = environment_update(reviewer)
    require(environment.get("name") == ENVIRONMENT
            and environment.get("can_admins_bypass") is False,
            "BLOCKED_ENVIRONMENT")
    require(environment.get("deployment_branch_policy")
            == expected["deployment_branch_policy"], "BLOCKED_ENVIRONMENT_BRANCH")
    rules = environment.get("protection_rules")
    require(isinstance(rules, list), "BLOCKED_ENVIRONMENT")
    required = [rule for rule in rules if rule.get("type") == "required_reviewers"]
    require(len(required) == 1 and required[0].get("prevent_self_review") is True,
            "BLOCKED_ENVIRONMENT_REVIEW")
    users = [entry.get("reviewer", {}) for entry in required[0].get("reviewers", [])
             if entry.get("type") == "User"]
    require(len(users) == 1 and users[0].get("id") == reviewer["id"]
            and users[0].get("login") == reviewer["login"],
            "BLOCKED_ENVIRONMENT_REVIEW")
    policies = branch_policies.get("branch_policies")
    require(branch_policies.get("total_count") == 1 and isinstance(policies, list)
            and len(policies) == 1 and policies[0].get("name") == "main"
            and policies[0].get("type") == "branch",
            "BLOCKED_ENVIRONMENT_BRANCH")
    return True

