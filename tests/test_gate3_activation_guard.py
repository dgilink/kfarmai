"""Keep the legacy daily path fail-closed until a reviewed live adapter exists."""

import json
from pathlib import Path
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from kfarmai_daily_autopublish import api, main as daily_main
from autopublish_pipeline import generate
from kfarmai_review_approval import Blocked
from activation_contract import validate_approval


class Gate3ActivationGuard(unittest.TestCase):
    def test_schedule_is_review_only_and_not_actor_blocked(self):
        workflow = (ROOT / ".github/workflows/kfarmai-daily-autopublish.yml").read_text(encoding="utf-8")
        self.assertIn("github.event_name == 'schedule'", workflow)
        self.assertIn("github.event_name == 'workflow_dispatch' && github.actor_id == '293838055'", workflow)
        self.assertIn("vars.KFARMAI_DAILY_REVIEW_GENERATION_ENABLED == 'true'", workflow)
        self.assertIn("vars.KFARMAI_AUTOPUBLISH_ENABLED == 'false'", workflow)
        self.assertIn("vars.KFARMAI_REVIEW_PUBLISH_ENABLED == 'false'", workflow)
        self.assertIn('cron: "0 21 * * *"', workflow)
        self.assertIn("options: [dry_run, review_only]", workflow)
        self.assertIn("KFARMAI_DAILY_APPROVED_HEAD_SHA", workflow)
        self.assertIn("daily_review_runner.py generate", workflow)
        self.assertIn("daily_review_runner.py finalize", workflow)
        self.assertIn("daily_review_email_dispatch.py", workflow)
        self.assertIn("id-token: write", workflow)
        self.assertNotIn("git push", workflow)

    def test_legacy_paid_transport_stays_disabled(self):
        with self.assertRaisesRegex(RuntimeError, "CANDIDATE_PAID_API_DISABLED"):
            api("unused", "/responses", {})

    def test_legacy_publish_mode_stays_blocked(self):
        with tempfile.TemporaryDirectory() as temp:
            original = sys.argv
            try:
                sys.argv = ["daily", "--root", str(ROOT), "--mode", "publish", "--output", temp]
                self.assertEqual(2, daily_main())
            finally:
                sys.argv = original
            outcome = json.loads((Path(temp) / "outcome.json").read_text(encoding="utf-8"))
            self.assertEqual("BLOCK", outcome["status"])
            self.assertFalse(outcome["published"])

    def test_dry_run_uses_only_offline_selftest(self):
        with tempfile.TemporaryDirectory() as temp:
            original = sys.argv
            try:
                sys.argv = ["daily", "--root", str(ROOT), "--mode", "dry_run", "--output", temp]
                self.assertEqual(0, daily_main())
            finally:
                sys.argv = original
            outcome = json.loads((Path(temp) / "outcome.json").read_text(encoding="utf-8"))
            self.assertEqual("DRY_RUN_PASS", outcome["status"])
            self.assertEqual(0, outcome["estimated_cost_usd"])

    def test_review_only_cannot_create_synthetic_issue(self):
        with tempfile.TemporaryDirectory() as temp:
            original = sys.argv
            try:
                sys.argv = ["daily", "--root", str(ROOT), "--mode", "review_only", "--output", temp]
                self.assertEqual(2, daily_main())
            finally:
                sys.argv = original
            outcome = json.loads((Path(temp) / "outcome.json").read_text(encoding="utf-8"))
            self.assertEqual("BLOCK", outcome["status"])
            self.assertEqual("LIVE_REVIEW_GENERATION_NOT_IMPLEMENTED", outcome["reason"])
            self.assertFalse((Path(temp) / "issue-payload.json").exists())

    def test_fixture_pipeline_rejects_live_provider(self):
        class LiveProvider:
            is_fixture = False

        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(Blocked) as context:
                generate(ROOT, Path(temp), LiveProvider())
            self.assertEqual("CANDIDATE_PAID_API_DISABLED", context.exception.code)

    def test_fixture_approval_never_grants_live_authority(self):
        receipt = {"gate": "D", "repository": "dgilink/kfarmai", "head_sha": "head",
                   "config_sha256": "config", "owner_verified": True,
                   "environment_protection_verified": True, "explicit_human_approval": True,
                   "mode": "APPROVED_PUBLICATION"}
        result = validate_approval(receipt, "D", "head", "config")
        self.assertFalse(result["live_authorized"])


if __name__ == "__main__":
    unittest.main()
