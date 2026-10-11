"""Gate D production-safe dry-run entrypoint.

This executable builds a local synthetic REVIEW contract, revalidates its
approval and immutable package, and exercises the exact Git staging path in a
disposable repository.  It has no network client and no publication adapter.
Its only terminal state is ``DRY_RUN_BLOCKED``.
"""
from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
import subprocess
import tempfile

import approval_package
import gate_c_approval as gate
import gate_d_publish
import kfarmai_review_approval as core


DRY_RUN_STATE = "DRY_RUN_BLOCKED"
PACKAGE_TYPE = "TEST_ONLY"
SYNTHETIC_RUN_ID = 923001
SYNTHETIC_ARTIFACT_ID = 923101
SYNTHETIC_HEAD_SHA = "d" * 40
SOURCES = ("https://www.rda.go.kr/", "https://www.nongsaro.go.kr/")
SLUG = "gate-d-synthetic-dry-run"
TITLE = "온실 관수 설비 점검 참고자료"


def _run_git(root: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args], cwd=root, check=True, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    return completed.stdout.strip()


def _html() -> bytes:
    return f"""<!doctype html><html lang="ko"><head>
<title>{TITLE} | kFarmAI</title>
<meta name="robots" content="index, follow">
<link rel="canonical" href="https://kfarmai.com/kb/{SLUG}.html">
</head><body><main><article><h1>{TITLE}</h1>
<img src="/static/kb/{SLUG}-hero.webp" alt="합성 대표 이미지">
<img src="/static/kb/{SLUG}-infographic.svg" alt="합성 인포그래픽">
<p>AI 참고 진단의 원인 후보와 확인 포인트를 공공정보로 다시 확인합니다.</p>
<h2>공식 참고자료</h2>
<a href="{SOURCES[0]}">농촌진흥청</a><a href="{SOURCES[1]}">농사로</a>
</article></main></body></html>""".encode("utf-8")


def build_fixture(*, package_kind="REVIEW"):
    """Return deterministic, entirely local approval inputs."""
    owner = {"login": "dgilink", "id": 293838055}
    article = {
        "slug": SLUG, "title": TITLE, "category": "스마트팜",
        "summary": "합성 데이터로 관수 전 확인 포인트를 검증합니다.",
        "risk": "REVIEW",
        "safety_note": "이 자료는 AI 참고 진단이며 최종 처방이 아닙니다.",
        "sources": [{"title": "공식자료", "url": url} for url in SOURCES],
    }
    package = approval_package.prepare_package(
        article=article, review_reason="합성 dry-run 승인 계약 검증",
        source_check={"status": "PASS", "urls": list(SOURCES)},
        html_bytes=_html(), hero_bytes=b"RIFF" + bytes(4) + b"WEBPfixture",
        svg_bytes=b'<svg xmlns="http://www.w3.org/2000/svg"><text>TEST ONLY</text></svg>',
        date="2026-10-11", run_id=SYNTHETIC_RUN_ID,
        head_sha=SYNTHETIC_HEAD_SHA, generated_at="2026-10-11T12:00:00+09:00",
        package_kind=package_kind,
    )
    raw = approval_package.archive_bytes(package)
    artifact = {
        "id": SYNTHETIC_ARTIFACT_ID,
        "name": "gate-d-local-synthetic-review",
        "expired": False, "expires_at": "2099-01-01T00:00:00Z",
        "digest": "sha256:" + core.digest(raw),
        "workflow_run": {"id": SYNTHETIC_RUN_ID, "head_sha": SYNTHETIC_HEAD_SHA},
    }
    rendered = approval_package.render_issue(package, artifact, uploaded_raw=raw)
    issue = {"number": 923, "state": "open", "user": owner, **rendered}
    meta = core.metadata(issue)
    event = {
        "action": "created",
        "repository": {"full_name": core.REPOSITORY, "owner": owner},
        "issue": copy.deepcopy(issue), "sender": owner,
        "comment": {
            "id": 923201, "user": owner,
            "created_at": "2026-10-11T12:01:00+09:00",
            "body": f"/kfarmai approve {meta['approval_id']} {meta['manifest_sha256']}",
        },
    }
    permission = {"permission": "admin", "user": owner}
    return package, raw, artifact, issue, event, permission


def execute_dry_run(*, workspace: str | Path | None = None):
    """Exercise verification and staging, then stop before publication."""
    package, raw, artifact, issue, event, permission = build_fixture()
    pending = gate.bind_review(issue, artifact, raw)
    action, meta = gate.authorize_action(event, issue, actor_permission=permission)
    approved = gate.decide(
        pending, action, meta, command_id=event["comment"]["id"],
        decided_at=event["comment"]["created_at"],
    )[-1]

    managed = None
    if workspace is None:
        managed = tempfile.TemporaryDirectory(prefix="kfarmai-gate-d-dry-run-")
        root = Path(managed.name)
    else:
        root = Path(workspace).resolve()
        root.mkdir(parents=True, exist_ok=False)
    try:
        (root / "automation").mkdir(parents=True)
        config_source = Path(__file__).with_name("config.json")
        (root / "automation" / "config.json").write_bytes(config_source.read_bytes())
        (root / core.REGISTRY).write_bytes(b'{"items":[]}\n')
        (root / "sitemap.xml").write_text(
            f'<urlset xmlns="{core.NS}"><url><loc>https://kfarmai.com/</loc></url></urlset>',
            encoding="utf-8",
        )
        _run_git(root, "init", "-q")
        _run_git(root, "config", "core.autocrlf", "false")
        _run_git(root, "add", "--", "automation/config.json", core.REGISTRY, "sitemap.xml")
        _run_git(root, "-c", "user.name=gate-d-dry-run",
                 "-c", "user.email=gate-d@example.invalid",
                 "commit", "-qm", "synthetic baseline")

        prepared = gate_d_publish.prepare_candidate(root, raw, issue, artifact, approved)
        staged = gate_d_publish.apply_and_stage(root, prepared, actual_index=True)
        actual = _run_git(root, "diff", "--cached", "--name-only").splitlines()
        core.require(staged == actual == sorted(prepared["plan"]["files"]),
                     "BLOCKED_STAGED_FILES")
        core.require(_run_git(root, "rev-list", "--count", "HEAD") == "1",
                     "BLOCKED_DRY_RUN_COMMIT")
        core.require(not _run_git(root, "remote"), "BLOCKED_DRY_RUN_REMOTE")
        hashes = {name: core.digest((root / name).read_bytes()) for name in staged}
        expected = {name: core.digest(body) for name, body in prepared["plan"]["files"].items()}
        core.require(hashes == expected, "BLOCKED_HASH_MISMATCH")
        return {
            "state": DRY_RUN_STATE,
            "package_type": PACKAGE_TYPE,
            "package_classification_exercised": package["manifest"]["package_kind"],
            "fixture_source": "LOCAL_SYNTHETIC",
            "actual_non_test_package": "NOT_AVAILABLE",
            "approval_id": package["manifest"]["approval_id"],
            "manifest_sha256": package["manifest_sha256"],
            "artifact_source": "LOCAL_MEMORY_ONLY",
            "artifact_verified": True,
            "approval_verified": True,
            "exact_staging": True,
            "staged_files": staged,
            "staged_sha256": hashes,
            "baseline_commit_count": 1,
            "remote_count": 0,
            "publish_commit": 0,
            "publish_push": 0,
            "pages_deploy": 0,
            "issue_writes": 0,
            "production_db_writes": 0,
            "paid_ai_calls": 0,
            "public_url_created": False,
        }
    finally:
        if managed is not None:
            managed.cleanup()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--execute-dry-run", action="store_true")
    args = parser.parse_args()
    if not args.execute_dry_run:
        parser.error("--execute-dry-run is required")
    print(json.dumps(execute_dry_run(), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
