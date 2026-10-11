from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from kfarmai_review_approval import Blocked  # noqa: E402
from production_environment import (  # noqa: E402
    ENVIRONMENT, environment_update, verify_environment,
)


class ProductionEnvironmentTests(unittest.TestCase):
    def reviewer(self):
        return {"id": 700001, "login": "independent-reviewer", "permission": "read"}

    def response(self):
        reviewer = self.reviewer()
        return {
            "name": ENVIRONMENT,
            "can_admins_bypass": False,
            "deployment_branch_policy": {
                "protected_branches": False, "custom_branch_policies": True,
            },
            "protection_rules": [{
                "type": "required_reviewers", "prevent_self_review": True,
                "reviewers": [{"type": "User", "reviewer": {
                    "id": reviewer["id"], "login": reviewer["login"],
                }}],
            }],
        }

    def test_exact_safe_payload_and_live_response(self):
        reviewer = self.reviewer()
        payload = environment_update(reviewer)
        self.assertTrue(payload["prevent_self_review"])
        self.assertFalse(payload["can_admins_bypass"])
        self.assertEqual([{"type": "User", "id": reviewer["id"]}],
                         payload["reviewers"])
        branches = {"total_count": 1,
                    "branch_policies": [{"name": "main", "type": "branch"}]}
        self.assertTrue(verify_environment(self.response(), branches, reviewer))

    def test_owner_or_missing_permission_is_rejected(self):
        cases = [
            {"id": 293838055, "login": "dgilink", "permission": "admin"},
            {"id": 700001, "login": "independent-reviewer", "permission": "none"},
        ]
        for reviewer in cases:
            with self.subTest(reviewer=reviewer), self.assertRaises(Blocked):
                environment_update(reviewer)

    def test_any_weakened_protection_is_rejected(self):
        reviewer = self.reviewer()
        branches = {"total_count": 1,
                    "branch_policies": [{"name": "main", "type": "branch"}]}
        for mutation in ("bypass", "self", "branch", "extra"):
            environment = self.response()
            current_branches = {**branches, "branch_policies": list(branches["branch_policies"])}
            if mutation == "bypass":
                environment["can_admins_bypass"] = True
            elif mutation == "self":
                environment["protection_rules"][0]["prevent_self_review"] = False
            elif mutation == "branch":
                current_branches = {"total_count": 1,
                                    "branch_policies": [{"name": "*", "type": "branch"}]}
            else:
                current_branches = {"total_count": 2, "branch_policies": [
                    {"name": "main", "type": "branch"},
                    {"name": "release/*", "type": "branch"},
                ]}
            with self.subTest(mutation=mutation), self.assertRaises(Blocked):
                verify_environment(environment, current_branches, reviewer)


if __name__ == "__main__":
    unittest.main()
