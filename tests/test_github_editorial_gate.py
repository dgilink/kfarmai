import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "automation"))

from github_editorial_gate import (GitHubEditorialBudget, GitHubEditorialGate,
                                    claim_metadata)
from kfarmai_review_approval import Blocked, canonical, metadata


HEAD = "a" * 40
RUN_ID = 41000000001
DATE = "2026-10-29"


class FakeIssues:
    def __init__(self):
        self.items = []
        self.next_number = 1

    def request(self, path, method="GET", payload=None):
        if path.startswith("/issues?const="):
            raise AssertionError("unexpected path")
        if path.startswith("/issues?"):
            return [dict(item) for item in self.items]
        if path == "/issues" and method == "POST":
            issue = {**payload, "number": self.next_number,
                     "html_url": f"https://github.com/dgilink/kfarmai/issues/{self.next_number}",
                     "state": "open",
                     "user": {"login": "github-actions[bot]", "id": 41898282}}
            self.next_number += 1
            self.items.append(issue)
            return dict(issue)
        if path.startswith("/issues/"):
            number = int(path.rsplit("/", 1)[-1])
            issue = next(item for item in self.items if item["number"] == number)
            if method == "PATCH":
                issue.update(payload)
            return dict(issue)
        raise AssertionError((path, method))


def environment():
    return {"GITHUB_REPOSITORY": "dgilink/kfarmai", "GITHUB_RUN_ID": str(RUN_ID),
            "GITHUB_SHA": HEAD, "GITHUB_RUN_ATTEMPT": "1"}


def rendered_review(run_id=RUN_ID, artifact_id=91):
    value = {"repository": "dgilink/kfarmai", "approval_id": "review-fixture-r1",
             "manifest_sha256": "b" * 64, "run_id": run_id,
             "artifact_id": artifact_id, "artifact_name": "review-review-fixture-r1",
             "artifact_digest": "sha256:" + "c" * 64, "state": "REVIEW"}
    body = "\n".join(["검수 패키지", "<!-- kfarmai-review",
                       canonical(value).decode(), "-->"])
    return {"title": "[KFarmAI Daily][REVIEW] 검수 글", "body": body,
            "metadata": value}


class GitHubEditorialGateTests(unittest.TestCase):
    def make(self):
        client = FakeIssues()
        gate = GitHubEditorialGate(token="fixture", run_id=RUN_ID, head_sha=HEAD,
                                   environment=environment(), client=client)
        return gate, client

    def test_claim_is_created_before_dispatch_and_same_day_is_fail_closed(self):
        gate, client = self.make()
        issue = gate.claim(DATE)
        self.assertEqual("GENERATING", claim_metadata(issue)["state"])
        self.assertFalse(claim_metadata(issue)["published"])
        with self.assertRaises(Blocked) as context:
            gate.claim(DATE)
        self.assertEqual("DAILY_GENERATION_ALREADY_CLAIMED", context.exception.code)
        self.assertEqual(1, len(client.items))

    def test_untrusted_public_issue_cannot_spoof_daily_claim(self):
        gate, client = self.make()
        gate.claim(DATE)
        client.items[0]["user"] = {"login": "external-user", "id": 99}
        trusted = gate.claim(DATE)
        self.assertEqual(2, trusted["number"])
        self.assertEqual("github-actions[bot]", trusted["user"]["login"])

    def test_bounded_one_call_settles_in_issue_and_rejects_second_reservation(self):
        gate, _ = self.make()
        issue = gate.claim(DATE)
        budget = GitHubEditorialBudget(gate, issue)
        reservation = budget.reserve(20261029, "content", "REVIEW", 22528,
                                     {"model": "fixture"})
        result = budget.execute(reservation, lambda: {"usage": 1},
                                lambda response: (1200, response))
        self.assertEqual({"usage": 1}, result)
        _, state = gate.current(issue["number"])
        self.assertEqual("SETTLED", state["state"])
        self.assertEqual(1200, state["actual_microusd"])
        with self.assertRaises(Exception):
            budget.reserve(20261029, "content", "REVIEW", 22528, {})

    def test_failed_model_call_holds_claim_without_retry(self):
        gate, _ = self.make()
        issue = gate.claim(DATE)
        budget = GitHubEditorialBudget(gate, issue)
        reservation = budget.reserve(20261029, "content", "REVIEW", 22528, {})
        with self.assertRaises(Exception):
            budget.execute(reservation, lambda: (_ for _ in ()).throw(OSError("lost")),
                           lambda response: (1, response))
        _, state = gate.current(issue["number"])
        self.assertEqual("HOLD", state["state"])
        self.assertEqual("CALL_UNCONFIRMED_NO_RETRY", state["reason"])

    def test_uploaded_artifact_turns_same_claim_into_standard_review_issue(self):
        gate, client = self.make()
        issue = gate.claim(DATE)
        gate.transition(issue["number"], "DISPATCHED", maximum_microusd=22528,
                        request_fingerprint="d" * 64)
        gate.transition(issue["number"], "SETTLED", actual_microusd=1000,
                        receipt_sha256="e" * 64)
        updated = gate.finalize(issue["number"], rendered_review())
        self.assertEqual(issue["number"], updated["number"])
        self.assertEqual("REVIEW", claim_metadata(updated)["state"])
        self.assertEqual("REVIEW", metadata(updated)["state"])
        self.assertEqual(1, len(client.items))

    def test_daily_path_has_no_supabase_or_database_runtime_dependency(self):
        workflow = (ROOT / ".github/workflows/kfarmai-daily-autopublish.yml").read_text()
        runner = (ROOT / "automation/daily_review_runner.py").read_text()
        requirements = (ROOT / "automation/requirements-daily-review.txt").read_text()
        combined = workflow + runner + requirements
        for forbidden in ("KFARMAI_DAILY_DB_DSN", "KFARMAI_DAILY_DB_CA_PEM",
                          "daily-review-approval", "psycopg", "xzetqijeucldbfgjuoes"):
            self.assertNotIn(forbidden, combined)
        self.assertNotIn("id-token: write", workflow)
        self.assertIn("issues: write", workflow)
        self.assertIn("GitHubEditorialGate", runner)


if __name__ == "__main__":
    unittest.main()
