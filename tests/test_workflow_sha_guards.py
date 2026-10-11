"""Prevent fixed workflow checkout SHA guards from comparing against themselves."""
from pathlib import Path
import re
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
ZERO = "0" * 40


class WorkflowShaGuardTests(unittest.TestCase):
    def assert_guard(self, filename, variable):
        path = ROOT / ".github/workflows" / filename
        text = path.read_text(encoding="utf-8")
        parsed = yaml.load(text, Loader=yaml.BaseLoader)
        job = next(iter(parsed["jobs"].values()))
        approved = job["env"][variable]
        self.assertRegex(approved, r"^[a-f0-9]{40}$")
        self.assertNotEqual(ZERO, approved)
        scripts = "\n".join(step.get("run", "") for step in job["steps"])
        self.assertIn("^[a-f0-9]{40}$", scripts)
        self.assertIn(f'test "${variable}" != \'{ZERO}\'', scripts)
        self.assertIn(f'test "${variable}" = \'{approved}\'', scripts)
        self.assertNotIn(f'test "${variable}" != \'{approved}\'', scripts)
        checkout = next(step for step in job["steps"]
                        if str(step.get("uses", "")).startswith("actions/checkout@"))
        self.assertEqual("${{ env." + variable + " }}", checkout["with"]["ref"])
        self.assertRegex(scripts, r'git rev-parse HEAD.*\$' + re.escape(variable))

    def test_gate_c_fixed_sha_guard(self):
        self.assert_guard("kfarmai-gate-c-artifact-canary.yml", "GATE_C_TEST_COMMIT")

    def test_gate_d_fixed_sha_guard(self):
        self.assert_guard("kfarmai-review-publish.yml", "GATE_D_TEST_COMMIT")


if __name__ == "__main__":
    unittest.main()
