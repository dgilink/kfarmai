# KFarmAI Dev Loop v1

Status: DRAFT PR. Does not auto-merge or deploy. Existing Pages and content-approval workflows are unchanged.

## What is automated
- One natural-language task: guarded local Codex CLI editing in a clean Preview worktree.
- Immediately afterward: all CJS contracts, Python KB approval/presentation audit, Pages builder/security, Git diff check and JSON QA report.
- Optional -Full: complete Python unittest discovery and Windows Chrome mobile-touch smoke.
- On every PR to main: read-only core checks via GitHub Actions and a 7-day JSON report artifact.
- Never interpret core PASS as approval to deploy. Auth/RLS/Storage/Gateway writing tests and human visual review remain explicit separate gates.

## Safety
Official repo: dgilink/kfarmai, ID 1270079933. Check actual remote and current HEAD every time.
Codex task mode rejects main, unrelated remote, staged/dirty changes and missing Codex CLI. No git push, commit or production deploy.
Never delete/reset/clean user files. No secret printing, no private screenshots uploaded to PR artifacts.
GitHub PR workflow has contents:read only; it cannot deploy Pages.

## One-time setup — Windows PowerShell 7+

Open Warp (as PowerShell). Start from your existing original KFarmAI worktree; DO NOT modify existing dirty files.

~~~powershell
cd "C:\Users\user\PERSONAL\dev\kfarmai-v4-phase7-20261024"
git status -sb
git remote -v
git fetch origin "refs/heads/automation/dev-loop-v1-20261028:refs/remotes/origin/automation/dev-loop-v1-20261028"
git worktree add -b preview/devloop-first-run "C:\Users\user\PERSONAL\dev\kfarmai-devloop-first-run" origin/automation/dev-loop-v1-20261028
cd "C:\Users\user\PERSONAL\dev\kfarmai-devloop-first-run"
node --version
codex --version
~~~

Use an unused worktree destination. Do not overwrite an existing path. The temporary branch above includes the draft Dev Loop scripts before any merge.

## One task, one command

~~~powershell
pwsh -NoProfile -File .\scripts\dev-loop.ps1 -Task "Fix KFarmAI mobile community loading transition without changing Auth/RLS/KB or production." -Full
~~~

Or run verification with no Codex modifications:

~~~powershell
pwsh -NoProfile -File .\scripts\dev-loop.ps1 -VerifyOnly -Full
~~~

The report is saved to your system temporary directory as kfarmai-dev-loop-v1-report.json. On failures, the locally saved redacted diagnostic log is kfarmai-dev-loop-v1-failures.log. The report separates CORE_PASS/FAIL from FULL_PASS/FAIL/NOT_RUN; full tests are not silently counted as passed. Never publish raw local diagnostic logs or credentials. The Codex activity log, when present, is local only. The script never stages, commits, pushes or deploys.

## Pull request process

When local changes are ready, carefully review the diff and create a Preview pull request under your own Git controls. The PR automatically runs core checks on GitHub. **This is not enough to merge.** Before manually approving a release, additionally verify actual mobile appearance, real data loading, allowed browser interaction, isolated Auth/Gateway/RLS tests, KB immutable hash and release diff.

Existing pages.yml deploys on main push. Do not merge this Draft PR or any UI PR without explicit release authorization.

## Constraints / next iteration

- No direct automatic transfer from ChatGPT text to Codex. The user types a short task once in Warp/Codex, or supplies -TaskFile for a saved request.
- PR core CI cannot run Windows-only mobile Chrome tests or isolated Supabase writing E2E; those are NOT_RUN, not PASS.
- The Python full suite can SKIP Docker-dependent tests. Report this separately.
- The dev loop checks only the official remote owner/name locally; numeric repository ID is supplied by GitHub Actions and checked against the project record in review.
- No changes to AGENTS.md, Daily AutoPublish, REVIEW, DB, Storage, Edge or deployment credentials.
