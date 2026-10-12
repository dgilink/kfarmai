"""Live GitHub REVIEW adapter for an already-uploaded immutable package.

The upload is performed once by actions/upload-artifact. This module validates
its downloaded bytes before the durable Issue outbox can mutate GitHub.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import urllib.parse
import urllib.request

from approval_package import prepare_package
from kfarmai_review_approval import Blocked, canonical, digest, require


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def load_package(directory):
    directory = Path(directory)
    article = json.loads((directory / "article.json").read_bytes())
    review = json.loads((directory / "review.json").read_bytes())
    check = json.loads((directory / "source-check.json").read_bytes())
    manifest = json.loads((directory / "manifest.json").read_bytes())
    intent = json.loads((directory / "publish-intent.json").read_bytes())
    package = prepare_package(article=article, review_reason=review["reason"],
        source_check=check,
        html_bytes=(directory / "publish" / intent["html"]).read_bytes(),
        hero_bytes=(directory / "publish" / intent["hero"]).read_bytes(),
        svg_bytes=(directory / "publish" / intent["infographic"]).read_bytes(),
        date=intent["date"], run_id=manifest["source_run_id"],
        head_sha=manifest["source_head_sha"], revision=manifest["revision"],
        generated_at=manifest["generated_at"], package_kind=manifest["package_kind"])
    require(package["manifest"] == manifest and package["intent"] == intent
            and package["review"] == review, "BLOCKED_IMMUTABLE_PACKAGE_CHANGED")
    for name, body in package["files"].items():
        require((directory / name).read_bytes() == body,
                "BLOCKED_IMMUTABLE_PACKAGE_CHANGED")
    actual_files = {p.relative_to(directory).as_posix() for p in directory.rglob("*") if p.is_file()}
    require(actual_files == set(package["files"]), "BLOCKED_UNEXPECTED_FILES")
    return package


class GitHubReviewTransport:
    is_fixture = False

    def __init__(self, *, token, repository, run_id, head_sha, upload_outputs,
                 artifact_json, artifact_zip, environment=None):
        self.token = token
        self.repository = repository
        self.run_id = run_id
        self.head_sha = head_sha
        self.outputs = upload_outputs
        self.artifact = artifact_json
        self.raw = artifact_zip
        self.env = dict(os.environ if environment is None else environment)
        self.issue_attempted = False

    def live_authorized(self, manifest):
        return (self.repository == "dgilink/kfarmai"
                and self.env.get("GITHUB_REPOSITORY") == self.repository
                and self.env.get("GITHUB_REF") == "refs/heads/main"
                and self.env.get("GITHUB_SHA") == self.head_sha == manifest["source_head_sha"]
                and str(self.run_id) == str(self.env.get("GITHUB_RUN_ID"))
                and self.env.get("GITHUB_RUN_ATTEMPT") == "1"
                and self.run_id == manifest["source_run_id"]
                and self.env.get("KFARMAI_AUTOPUBLISH_ENABLED") == "true"
                and self.env.get("KFARMAI_REVIEW_PUBLISH_ENABLED") == "false"
                and self.env.get("GITHUB_WORKFLOW_REF") ==
                    "dgilink/kfarmai/.github/workflows/kfarmai-daily-autopublish.yml@refs/heads/main"
                and isinstance(self.token, str) and bool(self.token))

    def find_upload(self, name, run_id):
        if run_id != self.run_id or self.artifact.get("name") != name:
            raise Blocked("BLOCKED_ARTIFACT_IDENTITY")
        return self.outputs

    def download(self, artifact_id):
        require(self.artifact.get("id") == artifact_id, "BLOCKED_ARTIFACT_IDENTITY")
        return self.artifact, self.raw

    def _request(self, path, method="GET", payload=None):
        url = "https://api.github.com/repos/" + self.repository + path
        request = urllib.request.Request(url, method=method,
            headers={"Authorization": "Bearer " + self.token,
                     "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28",
                     "Content-Type": "application/json"},
            data=canonical(payload) if payload is not None else None)
        try:
            with urllib.request.build_opener(_NoRedirect).open(request, timeout=20) as response:
                raw = response.read(1048577)
                require(len(raw) <= 1048576, "BLOCKED_GITHUB_RESPONSE")
                return json.loads(raw)
        except Exception:
            raise Blocked("BLOCKED_GITHUB_CALL_NO_RETRY") from None

    def find_issues(self, approval_id):
        matches = []
        for page in range(1, 21):
            issues = self._request(f"/issues?state=all&per_page=100&page={page}")
            require(isinstance(issues, list), "BLOCKED_GITHUB_RESPONSE")
            for issue in issues:
                if not issue.get("pull_request") and approval_id in (issue.get("body") or ""):
                    matches.append(issue)
            if len(issues) < 100:
                return matches
        raise Blocked("BLOCKED_ISSUE_SCAN_INCOMPLETE")

    def create_issue(self, payload):
        require(not self.issue_attempted, "BLOCKED_GITHUB_ISSUE_RETRY")
        self.issue_attempted = True
        return self._request("/issues", method="POST", payload=payload)


class GitHubIssueIndex:
    """Read-only duplicate guard, including unapproved and closed REVIEWs."""
    def __init__(self, token):
        require(isinstance(token, str) and bool(token), "BLOCKED_GITHUB_TOKEN")
        self._client = GitHubReviewTransport(token=token, repository="dgilink/kfarmai",
            run_id=0, head_sha="", upload_outputs={}, artifact_json={}, artifact_zip=b"")
        self._issues = None

    def __call__(self, slug):
        require(isinstance(slug, str) and bool(slug), "BLOCKED_SLUG")
        if self._issues is None:
            issues = []
            for page in range(1, 21):
                batch = self._client._request(f"/issues?state=all&per_page=100&page={page}")
                require(isinstance(batch, list), "BLOCKED_GITHUB_RESPONSE")
                issues.extend(x for x in batch if not x.get("pull_request"))
                if len(batch) < 100:
                    self._issues = issues
                    break
            require(self._issues is not None, "BLOCKED_ISSUE_SCAN_INCOMPLETE")
        marker = f"게시 예정 URL: https://kfarmai.com/kb/{slug}.html"
        return any(marker in (issue.get("body") or "") for issue in self._issues)
