# Phase Approval-2 — Immutable REVIEW Publisher Candidate

> Historical reference. Integration-2 current status and superseding contracts: [automation-integration2.md](../automation/automation-integration2.md). Production Pages is preserved; Canary remains HOLD.

Baseline: `b768656c95eb5f511deb637f74281a2dae4fa10f`. This extends the existing PostPublish-1 Candidate only. No Model Router files are imported. No remote Issue mutation, publication, deployment, commit or push was executed during verification.

## Entry points and operation

- `automation/kfarmai_review_approval.py`: pure package verification, read-only plan, explicit local exact apply, exact-stage verification, production verification fixtures and state transition contracts.
- `automation/review_approval_workflow.py`: GitHub Actions adapter for future authorized use. The executable path requires `--execute`, `GITHUB_ACTIONS=true`, the exact repository/event and `KFARMAI_REVIEW_PUBLISH_ENABLED=true`. Unset/false keeps it disabled.
- `.github/workflows/kfarmai-review-approval.yml`: owner-only `issue_comment: created`, main checkout, shared LOW/REVIEW concurrency, no provider credential or model configuration.
- `automation/kfarmai_post_publish_audit.py`: existing read-only shared auditor, with optional `source_run_id` added to the shared LOW record builder.

The existing Daily workflow still produces draft-only REVIEW artifacts. This phase does not regenerate them or change generation policy. A future package producer must supply the contract below before enabling the approval workflow; merely enabling the switch does not make old drafts publishable.

## Approval and Issue contract

The Issue title must begin `[KFarmAI Daily][REVIEW]`, must be open and must not be a pull-request Issue. The Issue author must be the repository owner or the GitHub Actions bot (login plus numeric ID). The comment author must match both the repository owner's login and numeric ID; `sender.id` must also match. Fresh Issue and comment API reads are checked again before applying and committing. A newer owner command supersedes an older in-flight command.

Commands are full-line exact matches:

```text
/kfarmai approve <approval_id> <manifest_sha256>
/kfarmai hold <approval_id> <manifest_sha256>
/kfarmai edit <approval_id> <manifest_sha256>
```

Issue body contains exactly one machine marker:

```text
<!-- kfarmai-review
{"repository":"dgilink/kfarmai","approval_id":"example-r1","manifest_sha256":"<64 lowercase hex>","run_id":123,"artifact_id":456,"artifact_name":"review-example-r1","state":"REVIEW"}
-->
```

Values above are schema examples, not an approval or a real artifact identity. The owner comment must match this marker. The executor updates only this marker, retaining Issue prose.

States:

```text
REVIEW → APPROVED_VERIFYING → APPROVED → PUBLISHED_PENDING_VERIFY
→ PUBLISHED → AUDIT_PASS
             └→ REVIEW_REQUIRED
```

Failed production verification goes from `PUBLISHED_PENDING_VERIFY` to `REVIEW_REQUIRED`. Hash/identity failures produce a blocked receipt/comment before any commit or push. HOLD and EDIT_REQUESTED stop before artifact download or Git execution. Both retain the original artifact. A revision requires a new approval ID, manifest and REVIEW Issue; no in-place edit is supported.

Final PUBLISHED/AUDIT_PASS marker fields include approval ID, manifest hash, commit SHA, title, production URL, production verification flag, audit status and publication timestamp. Audit discrepancies never cause content rewriting, rollback or unpublishing.

## Package v1 format

ZIP contains exactly seven regular files, no wrapper directory entries:

```text
manifest.json
manifest.sha256
publish-intent.json
content.json
kb/<slug>.html
static/kb/<slug>-hero.webp
static/kb/<slug>-infographic.svg
```

Canonical JSON is UTF-8, sorted keys, compact separators, unescaped Unicode and no NaN. Duplicate JSON keys are rejected. `manifest.json` and `content.json` must already have canonical bytes. `manifest.sha256` is the lowercase canonical manifest digest followed by exactly one LF.

Manifest fields:

- `version: 1`, `repository`, `approval_id`, `revision` (positive integer);
- `source_run_id`, `source_head_sha`;
- `files`: a map of exact paths to SHA-256 for content JSON, publish intent and all three immutable publication files. The manifest cannot contain itself in this map.

Publish intent has exactly these fields:

```text
approval_id, revision, source_run_id,
slug, title, url, category, date, source_urls, content_sha256,
html, hero, infographic
```

`content.json` is the already-reviewed article object with `risk=REVIEW`, matching title and source URLs. The publisher hashes it but never renders it. Its hash and the approved HTML byte hash have distinct meanings. The manifest hash in the registry is the exact owner-approved package manifest hash, not a newly reconstructed replacement hash.

## Verification and extraction boundary

1. Fetch only `/actions/artifacts/{artifact_id}`; match its name and workflow-run ID to the Issue.
2. Check expired flag and expiry timestamp, and require the GitHub SHA-256 digest.
3. Fetch the exact source workflow run; require this repository, main branch, successful Daily AutoPublish workflow and matching head SHA.
4. Download that artifact ID's ZIP. The signed storage download receives no repository token.
5. Verify archive digest, manifest checksum, canonical manifest, every file hash and publish intent.
6. Validate immutable file types, source/HTML contracts, local audit and absence of secret-like content.
7. Compare current target state, then apply exact bytes and re-check them before staging and again from the Git index.

No “latest artifact”, list-and-select or alternate-run fallback exists. Missing and expired artifacts receive `BLOCKED_ARTIFACT_MISSING` / `BLOCKED_ARTIFACT_EXPIRED`. Hash mismatches receive `BLOCKED_HASH_MISMATCH`.

ZIPs are parsed in memory rather than extracted onto the checkout. Parent traversal, absolute/drive paths, backslashes, Windows alternate streams/device names, duplicate names, symlinks, UNIX hardlink metadata, encrypted entries, unexpected members and unsupported file types are blocked. File count and expanded/archive sizes are bounded. The only immutable publish paths are exact slug-specific files under `kb/` and `static/kb/`. Local targets reject symbolic links, junctions and hardlinks. A changed target or derived-file hash between plan and apply yields `BLOCKED_TOCTOU`.

Reference contracts: [GitHub artifact REST API](https://docs.github.com/en/rest/actions/artifacts), [issue_comment workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issue_comment).

## Exact publication, registry and idempotency

Only three approved files are copied byte-for-byte. There is no HTML rewrite, minify, formatting, image recompression or SVG rebuild. Derived updates are limited to sitemap XML and `automation/daily_registry.json`. They use the approved intent values and current checkout state; prior records and sitemap entries remain intact. The old published-content index is not introduced.

Both LOW and REVIEW records carry `approval_id`, `manifest_sha256`, `content_sha256`, `html_sha256`, `source_run_id`, `published_at`, `production_verified_at`, and `post_publish_audit_status`. LOW uses a null approval ID. REVIEW uses the approved package hash. A prepared commit is not evidence of production success: timestamps remain null and audit status PENDING in the prepared registry. Actual publication/verification receipts are recorded in the Issue and run artifact after deploy, not fabricated before deployment. The read-only auditor's registry update suggestion is not automatically committed; this phase introduces no second post-audit publication commit.

If approval ID, manifest and slug already match the registry, immutable files and sitemap must also match before returning `ALREADY_PUBLISHED`. No second commit/push is made. A same-slug/different-manifest record, changed artifact bytes, partial local target or duplicate approval record yields `BLOCKED_TARGET_CONFLICT`.

`files_to_commit.txt` contains precisely the three immutable files plus sitemap and registry. Staging enumerates these exact names, requires an initially clean index and checks staged names and bytes. No wildcard or all-files staging is used. The isolated runner checks main freshness and uses an ordinary fast-forward push; concurrent main changes stop publication without force-push or automatic rebase.

## Production verification and audit

Before final Issue states, the live adapter verifies HTTP 200, title, canonical, index/follow without noindex/nofollow, hero HTTP 200, infographic HTTP 200 and the actual sitemap URL. It waits within a bounded deployment window, then invokes the existing shared post-publish auditor. Tests inject mock responses for every request.

The exact immutable HTML hash is checked by the auditor. Official source reachability remains an audit condition; timeout/provider errors request human review and never regenerate content. All network/Issue/Git/deploy actions in the full workflow test use an in-memory client and mocked subprocesses. The separate exact staging test uses a temporary repository with no commits.

## Legacy October 7 REVIEW

Run `37585711991`, artifact `11466139781`, is represented by the supplied legacy fixture containing only `draft.json` and `outcome.json`. It deterministically produces `LEGACY_REVIEW_PACKAGE_INCOMPLETE` and cannot publish. The live legacy artifact was not downloaded or modified. No regeneration or image generation was attempted.

## Sitemap tests and review/rollback

Phase 6B/6C tests now parse XML and check URL uniqueness, production origin, absence of internal/preview/candidate/private routes, expected published pages and matching generated Pages sitemap. The count is derived from XML, never a fixed 180/182 constant. Additional fixtures reject malformed XML, duplicate and private URLs.

Candidate changes remain uncommitted in the isolated worktree. Review the changed files there. Rollback during this phase means leaving the candidate unapplied; original workspace, baseline commit and legacy reference remain intact. Workflow activation, publishing and merging require a separate authorized phase.

## Verification record — 2026-10-09

- Python compile: PASS for all four automation modules.
- Python fixtures: 73/73 PASS (52 approval, 17 post-publish, 4 existing AutoPublish contracts).
- JavaScript regression: all 25 test files passed, including both repaired sitemap contracts and the new semantic fixtures. One Windows Chrome profile cleanup EPERM in Phase 5A passed on isolated retry; no application assertion failed.
- Worker fixtures: 21/21 PASS.
- Pages build/security: 415 public files, 182 sitemap URLs; internal approval files absent. The URL count is reported, not used as a fixed assertion.
- Workflow YAML and explicit event/owner/main-checkout/env/concurrency contracts: PASS. No live Actions run was dispatched; actionlint was not used.
- Changed/new Candidate file secret scan: PASS; no credential values recorded.
- Tracked and untracked patch whitespace checks: PASS.
- Exact staging simulation: a disposable repository, exact expected paths/bytes, no commit created.
- Actual GitHub Issue writes, generation calls, image generation, publication, production mutation, commit, push, deploy: zero.
- Original workspace remains at `d47aa9d`; Candidate HEAD remains at the specified official baseline. No Model Router merge or duplicate published index.
