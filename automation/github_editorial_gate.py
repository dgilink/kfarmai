"""GitHub-native daily editorial claim and bounded model-call state.

This module is only for operator-authored agricultural information. Community
posts, comments, profiles and authentication remain in Supabase.  A GitHub
Issue is created *before* the paid model call so one KST day has one durable,
visible claim without requiring the community database.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import urllib.request

from durable_budget import BudgetBlocked, fingerprint
from kfarmai_review_approval import Blocked, canonical, metadata, parse_json, require


REPOSITORY = "dgilink/kfarmai"
CLAIM_MARKER = re.compile(r"<!-- kfarmai-editorial-claim\n(.*?)\n-->", re.S)
INTERNAL_STATES = frozenset({"GENERATING", "DISPATCHED", "SETTLED", "HOLD", "REVIEW"})
TRANSITIONS = {
    "GENERATING": frozenset({"DISPATCHED", "HOLD"}),
    "DISPATCHED": frozenset({"SETTLED", "HOLD"}),
    "SETTLED": frozenset({"REVIEW", "HOLD"}),
    "HOLD": frozenset(),
    "REVIEW": frozenset(),
}


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class GitHubIssueClient:
    """Small Issues-only adapter; response bodies are never logged."""
    def __init__(self, token, repository=REPOSITORY):
        require(isinstance(token, str) and bool(token), "BLOCKED_GITHUB_TOKEN")
        require(repository == REPOSITORY, "BLOCKED_REPOSITORY")
        self.token = token
        self.repository = repository

    def request(self, path, method="GET", payload=None):
        request = urllib.request.Request(
            "https://api.github.com/repos/" + self.repository + path,
            method=method,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            data=canonical(payload) if payload is not None else None,
        )
        try:
            with urllib.request.build_opener(_NoRedirect).open(request, timeout=20) as response:
                raw = response.read(1048577)
                require(len(raw) <= 1048576, "BLOCKED_GITHUB_RESPONSE")
                value = json.loads(raw)
                require(isinstance(value, (dict, list)), "BLOCKED_GITHUB_RESPONSE")
                return value
        except Exception:
            raise Blocked("BLOCKED_GITHUB_CALL_NO_RETRY") from None


def claim_metadata(issue):
    matches = CLAIM_MARKER.findall(issue.get("body", ""))
    require(len(matches) == 1, "BLOCKED_EDITORIAL_CLAIM")
    try:
        value = parse_json(matches[0].encode("utf-8"))
    except (TypeError, ValueError):
        raise Blocked("BLOCKED_EDITORIAL_CLAIM") from None
    require(isinstance(value, dict)
            and value.get("repository") == REPOSITORY
            and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(value.get("date", "")))
            and type(value.get("run_id")) is int and value["run_id"] > 0
            and re.fullmatch(r"[a-f0-9]{40}", str(value.get("head_sha", "")))
            and value.get("state") in INTERNAL_STATES,
            "BLOCKED_EDITORIAL_CLAIM")
    return value


def _trusted_author(issue):
    user = issue.get("user", {})
    return ((user.get("login") == "github-actions[bot]" and user.get("id") == 41898282)
            or (str(user.get("login", "")).casefold() == "dgilink"
                and user.get("id") == 293838055))


def _marker(value):
    return "<!-- kfarmai-editorial-claim\n" + canonical(value).decode("utf-8") + "\n-->"


class GitHubEditorialGate:
    """One durable GitHub Issue claim for one KST editorial generation day."""
    def __init__(self, *, token, run_id, head_sha, environment, client=None):
        self.run_id = run_id
        self.head_sha = head_sha
        self.env = dict(environment)
        require(type(run_id) is int and run_id > 0
                and re.fullmatch(r"[a-f0-9]{40}", head_sha),
                "BLOCKED_RUN_IDENTITY")
        require(self.env.get("GITHUB_REPOSITORY") == REPOSITORY
                and self.env.get("GITHUB_RUN_ID") == str(run_id)
                and self.env.get("GITHUB_SHA") == head_sha
                and self.env.get("GITHUB_RUN_ATTEMPT") == "1",
                "DAILY_GITHUB_CONTEXT_MISMATCH")
        self.client = client or GitHubIssueClient(token)

    def _issues(self):
        issues = []
        for page in range(1, 21):
            batch = self.client.request(f"/issues?state=all&per_page=100&page={page}")
            require(isinstance(batch, list), "BLOCKED_GITHUB_RESPONSE")
            issues.extend(item for item in batch if not item.get("pull_request"))
            if len(batch) < 100:
                return issues
        raise Blocked("BLOCKED_ISSUE_SCAN_INCOMPLETE")

    def claim(self, date):
        try:
            require(dt.date.fromisoformat(date).isoformat() == date,
                    "BLOCKED_BUDGET_DATE")
        except ValueError:
            raise Blocked("BLOCKED_BUDGET_DATE") from None
        matches = []
        for issue in self._issues():
            markers = CLAIM_MARKER.findall(issue.get("body", ""))
            if markers and _trusted_author(issue):
                value = claim_metadata(issue)
                if value["date"] == date:
                    matches.append(issue)
        require(not matches, "DAILY_GENERATION_ALREADY_CLAIMED")
        value = {
            "repository": REPOSITORY,
            "date": date,
            "run_id": self.run_id,
            "head_sha": self.head_sha,
            "state": "GENERATING",
            "published": False,
        }
        issue = self.client.request("/issues", method="POST", payload={
            "title": f"[KFarmAI Daily][GENERATING] {date}",
            "body": "\n".join([
                "농업정보 정적 콘텐츠의 검수 패키지를 생성하는 중입니다.",
                "공개 게시: false",
                "상태: GENERATING",
                "",
                _marker(value),
            ]),
        })
        require(type(issue.get("number")) is int and issue["number"] > 0
                and _trusted_author(issue)
                and claim_metadata(issue) == value,
                "BLOCKED_EDITORIAL_CLAIM")
        return issue

    def current(self, number):
        issue = self.client.request(f"/issues/{number}")
        require(isinstance(issue, dict) and issue.get("number") == number,
                "BLOCKED_EDITORIAL_CLAIM")
        require(issue.get("state") == "open" and _trusted_author(issue),
                "BLOCKED_EDITORIAL_CLAIM")
        value = claim_metadata(issue)
        require(value["run_id"] == self.run_id and value["head_sha"] == self.head_sha,
                "BLOCKED_EDITORIAL_CLAIM")
        return issue, value

    def transition(self, number, state, **receipt):
        issue, current = self.current(number)
        if current["state"] == state:
            require(all(current.get(key) == value for key, value in receipt.items()),
                    "BLOCKED_RECEIPT")
            return issue
        require(state in TRANSITIONS[current["state"]], "BLOCKED_STATE_TRANSITION")
        protected = {"repository", "date", "run_id", "head_sha", "state", "published"}
        require(not protected.intersection(receipt), "BLOCKED_RECEIPT")
        value = {**current, **receipt, "state": state}
        reason = f"\n사유: {value['reason']}" if value.get("reason") else ""
        body = "\n".join([
            "농업정보 정적 콘텐츠 검수 실행 기록입니다.",
            "공개 게시: false",
            f"상태: {state}{reason}",
            "",
            _marker(value),
        ])
        title = f"[KFarmAI Daily][{state}] {value['date']}"
        updated = self.client.request(f"/issues/{number}", method="PATCH",
                                      payload={"title": title, "body": body})
        require(claim_metadata(updated) == value, "BLOCKED_EDITORIAL_CLAIM")
        return updated

    def hold(self, number, reason):
        require(isinstance(reason, str) and re.fullmatch(r"[A-Z0-9_]{3,96}", reason),
                "BLOCKED_FAILURE_CODE")
        issue, value = self.current(number)
        if value["state"] == "HOLD":
            return issue
        if value["state"] == "REVIEW":
            raise Blocked("BLOCKED_STATE_TRANSITION")
        return self.transition(number, "HOLD", reason=reason)

    def finalize(self, number, rendered):
        issue, current = self.current(number)
        require(current["state"] == "SETTLED", "BLOCKED_STATE_TRANSITION")
        review = rendered["metadata"]
        require(review["repository"] == REPOSITORY
                and review["run_id"] == self.run_id
                and rendered["title"].startswith("[KFarmAI Daily][REVIEW]"),
                "BLOCKED_ISSUE_BINDING")
        value = {**current, "state": "REVIEW", "approval_id": review["approval_id"],
                 "manifest_sha256": review["manifest_sha256"],
                 "artifact_id": review["artifact_id"]}
        updated = self.client.request(f"/issues/{number}", method="PATCH", payload={
            "title": rendered["title"],
            "body": rendered["body"] + "\n\n" + _marker(value),
        })
        require(metadata(updated) == review and claim_metadata(updated) == value,
                "BLOCKED_ISSUE_BINDING")
        return updated


class GitHubEditorialBudget:
    """One-call budget bounded by code and persisted in the claim Issue."""
    def __init__(self, gate, issue, *, daily_limit=150000, request_limit=22528):
        require(type(daily_limit) is int and type(request_limit) is int
                and 0 < request_limit <= daily_limit, "INVALID_MAXIMUM")
        self.gate = gate
        self.issue_number = issue["number"]
        self.daily_limit = daily_limit
        self.request_limit = request_limit
        self.reserved = False

    def reserve(self, run_id, operation, channel, maximum, identity):
        if (self.reserved or operation != "content" or channel != "REVIEW"
                or type(maximum) is not int or maximum <= 0
                or maximum > self.request_limit or maximum > self.daily_limit):
            raise BudgetBlocked("INVALID_MAXIMUM")
        self.reserved = True
        return {"run_id": str(run_id), "operation": operation, "channel": channel,
                "maximum": maximum, "fingerprint": fingerprint(identity)}

    def execute(self, reservation, transport, settle_usage):
        if not self.reserved or reservation.get("maximum") > self.request_limit:
            raise BudgetBlocked("DISPATCH_BLOCKED")
        try:
            self.gate.transition(self.issue_number, "DISPATCHED",
                                 maximum_microusd=reservation["maximum"],
                                 request_fingerprint=reservation["fingerprint"])
            response = transport()
        except Exception:
            try:
                self.gate.hold(self.issue_number, "CALL_UNCONFIRMED_NO_RETRY")
            except Exception:
                pass
            raise BudgetBlocked("CALL_UNCONFIRMED_NO_RETRY") from None
        try:
            actual, receipt = settle_usage(response)
            if type(actual) is not int or actual < 0 or actual > reservation["maximum"]:
                raise ValueError("invalid usage")
            receipt_hash = fingerprint(receipt)
            self.gate.transition(self.issue_number, "SETTLED",
                                 actual_microusd=actual, receipt_sha256=receipt_hash)
        except Exception:
            try:
                self.gate.hold(self.issue_number, "USAGE_UNVERIFIED_NO_RETRY")
            except Exception:
                pass
            raise BudgetBlocked("USAGE_UNVERIFIED_NO_RETRY") from None
        return response
