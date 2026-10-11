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
    def response(self):
        return {
            "name": ENVIRONMENT,
            "can_admins_bypass": False,
            "deployment_branch_policy": {
                "protected_branches": False, "custom_branch_policies": True,
            },
            "protection_rules": [{"type": "wait_timer", "wait_timer": 1}],
        }

    def test_exact_safe_payload_and_live_response(self):
        payload = environment_update()
        self.assertEqual(1, payload["wait_timer"])
        self.assertFalse(payload["prevent_self_review"])
        self.assertFalse(payload["can_admins_bypass"])
        self.assertEqual([], payload["reviewers"])
        branches = {"total_count": 1,
                    "branch_policies": [{"name": "main", "type": "branch"}]}
        self.assertTrue(verify_environment(self.response(), branches))

    def test_any_weakened_protection_is_rejected(self):
        branches = {"total_count": 1,
                    "branch_policies": [{"name": "main", "type": "branch"}]}
        for mutation in ("bypass", "self", "wait", "branch", "extra"):
            environment = self.response()
            current_branches = {**branches, "branch_policies": list(branches["branch_policies"])}
            if mutation == "bypass":
                environment["can_admins_bypass"] = True
            elif mutation == "self":
                environment["protection_rules"].append({
                    "type": "required_reviewers", "prevent_self_review": False,
                    "reviewers": [],
                })
            elif mutation == "wait":
                environment["protection_rules"][0]["wait_timer"] = 0
            elif mutation == "branch":
                current_branches = {"total_count": 1,
                                    "branch_policies": [{"name": "*", "type": "branch"}]}
            else:
                current_branches = {"total_count": 2, "branch_policies": [
                    {"name": "main", "type": "branch"},
                    {"name": "release/*", "type": "branch"},
                ]}
            with self.subTest(mutation=mutation), self.assertRaises(Blocked):
                verify_environment(environment, current_branches)


if __name__ == "__main__":
    unittest.main()
