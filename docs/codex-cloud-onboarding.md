# KFarmAI — Codex Cloud onboarding and Dev Loop validation

Status: **ONBOARDING_PREPARED**, not **CLOUD_CONNECTED** and not **RELEASED**.

Official repository: `dgilink/kfarmai` (GitHub repository ID `1270079933`). Main is the source of truth. Keep personal/legacy KFarmAI repositories separate. This document contains **no credentials** and does not configure or touch AWS Lightsail.

## 1. Create the account-owned cloud environment (web/desktop action)

In ChatGPT (web or desktop), open **Codex → Work in → Cloud → Select environment → Create environment**, or Settings → Codex Cloud → Environments → Create environment.

- Choose the **dgilink** GitHub identity and select **dgilink/kfarmai** only. GitHub connection/authorization is a user action; an existing ChatGPT GitHub plugin connection does not prove the Codex Cloud environment is connected.
- Start with branch `main`, not the old `kfarmai-private` or a local dirty worktree. The main branch includes `scripts/dev-loop/check.cjs` and `.github/workflows/kfarmai-dev-loop-pr.yml`.
- Use managed Cloud resources, not AWS. No database or production site credentials. No Lightsail SSH keys. Do not enable broad internet access unless the setup actually requires a specific dependency registry.
- Allow Codex to prepare dependencies; Node.js 20+ and Python 3 are necessary for the read-only core checks. Existing GitHub Actions runs the full Python and **Windows** browser gates; Codex Cloud is not a Windows Chrome runner.
- Run a read-only preflight. Review the resulting configuration and select **Publish** only if the environment is healthy. The published environment must show up on web/mobile.
- A published environment is a setup configuration; it is **not** a deployed website.

Reference: https://learn.chatgpt.com/docs/environments/cloud-environments

## 2. First Cloud task: read-only proof, no code changes

Use this prompt with the newly published environment:

> KFarmAI Codex Cloud 연결 검증만 수행한다. AGENTS.md와 docs/dev-loop-v1.md를 먼저 읽는다. 공식 GitHub 저장소 dgilink/kfarmai(Repository ID 1270079933), origin, 현재 브랜치·HEAD를 확인한다. 시크릿과 전체 환경변수는 출력하지 않는다. Node 20+, Python 3 가용성을 확인하고, 저장소 루트에서 `node scripts/dev-loop/check.cjs`를 1회 실행한다. CORE_PASS 여부, 실행 PASS/FAIL, 미실행 FULL/Windows/실기기/인증 E2E를 구별한다. git diff/status와 변경 파일 0개를 확인한다. 파일 수정, commit, push, PR, 서비스·AWS·DB·Storage·Edge 변경, Production 배포는 하지 않는다. 결과만 간결하게 보고한다. 실패 시 HOLD하고 원인을 보고한다.

Expected outcome: `CORE_PASS | FULL_NOT_RUN | RELEASE_HOLD` from the core runner, no source diff. Do **not** equate core success to full release approval.

## 3. Second Cloud task: write-to-PR proof (only after step 2 passes)

> Codex Cloud에서 KFarmAI GitHub Draft PR 생성 가능 여부를 검증한다. AGENTS.md를 읽고 저장소 owner/name/ID/main/remote/HEAD를 확인한다. main에서 새로운 격리 브랜치 `validation/codex-cloud-first-task-20261028`를 만들되 동일 이름이 이미 존재하면 중단한다. 신규 파일 `docs/codex-cloud-first-task-evidence.md` 한 개에 cloud task 식별 정보(비밀값 제외), 기준 커밋 SHA, 코어 검증 결과, FULL 및 Windows 미실행 사실, Production 변경 없음만 적는다. 해당 파일만 stage해 diff/secret을 확인한 후 해당 격리 브랜치로 non-force push하고 **Draft PR**을 연다. 사용자 승인 없이 main에 merge하거나 공개발행하지 않는다. GitHub PR CI에서 Core·Python·Windows Chrome 결과를 확인하고 PR/Actions 링크를 보고한다. GitHub 권한 오류가 나면 임의 토큰을 요구하지 말고 접근 권한 미완료로 HOLD한다.

This checks the actual chain: **Codex Cloud task → GitHub separate branch → Draft PR → GitHub Actions checks**. It makes no main/Production changes.

## 4. Approvals and failure policy

- Existing `pages.yml` deploys only from `main`. Draft PRs cannot auto-deploy.
- Existing PR CI is `kfarmai-dev-loop-pr.yml` with CJS/Pages/KB Core, Python REVIEW + full unittest discovery, and Windows Chrome touch smoke.
- Distinguish PASS/FAIL/ERROR/SKIP/NOT_RUN; never hide the 98 environment skips from older Python suites.
- If a test fails, fix root cause in a separate change, do not weaken a test to force PASS.
- No raw log uploads containing credentials. Do not output secrets, full environment variables, remote access tokens, or private user files.
- KB approved original bytes/hash must be preserved. Maintain Auth/RLS, Storage direct insert restrictions, upload Gateway, approvals, daily AutoPublish and public-data connections.
- Production releases and any AWS operations require a separate explicit approval.

## 5. Readiness definitions

- **GITHUB_READY**: The PR CI already exists on `main`. This is independently verifiable with GitHub.
- **CLOUD_CONNECTED**: The account has published a Codex Cloud environment that can inspect `dgilink/kfarmai`. Requires user setup and an observed Codex task.
- **CLOUD_CORE_PASS**: Read-only cloud task actually returned `CORE_PASS`; not inferred from GitHub CI.
- **CLOUD_PR_PASS**: A branch and Draft PR originating from the actual cloud task were confirmed, and all GitHub checks passed.
- **RELEASE_READY**: Separate real-device visual review, security and release approval completed. Never infer this from CI alone.

No part of this runbook presumes that the Cloud setup steps have already happened.
