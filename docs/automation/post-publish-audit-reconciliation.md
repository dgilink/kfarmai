# Current AutoPublish Post-Publish Audit Reconciliation

> Historical reference. Integration-2 current status and superseding contracts: [automation-integration2.md](../automation/automation-integration2.md). Production Pages is preserved; Canary remains HOLD.

Phase Approval-2 follow-up: the immutable REVIEW executor and Issue transitions are now implemented in this Candidate; see [review-approval-v1.md](review-approval-v1.md). Statements below about the missing approval publisher describe the original official baseline, not the extended Candidate.

## Scope and baselines

- Current baseline: official `main` at `b768656c95eb5f511deb637f74281a2dae4fa10f`.
- Legacy reference only: `d47aa9d` (`feat: add read-only post-publish audit`).
- Current source of truth: `automation/daily_registry.json`.
- This candidate does not cherry-pick the legacy commit, restore `scripts/content-pipeline`, publish content, change production, commit, or push.

The legacy implementation is used only to recover the useful read-only verification contract. The current implementation is Python because the active generator and registry are Python/JSON under `automation/`.

## Architecture comparison

| Function | Legacy `d47aa9d` | Official baseline | Current candidate |
|---|---|---|---|
| Publish registry | `scripts/content-pipeline/published-content-index.json` with strict v1 records | `automation/daily_registry.json` with minimal date/title/slug/url/category records | Keeps `daily_registry.json` as the only SoT; future records are backward-compatible enriched records |
| Content hash | `contentHash`, fact/source fingerprints | None in daily record | `content_sha256` over canonical article JSON |
| Published HTML hash | `htmlHash` written by controlled publisher | None | `html_sha256` over the exact UTF-8 artifact bytes |
| Production URL | Strict `canonical` route in legacy record | `url` in daily record | Uses current `url`, validates safe slug and local route |
| Canonical | Exact HTML and production probe comparison | Generated, but post-publish workflow did not fully audit it | Exact local and network comparison |
| Source verification | Source URLs/fingerprints plus optional injected probes | Prepublish official-domain check and generated source section | Exact expected source-link marker locally; reachability-only probe on network audit |
| Sitemap verification | Local URL exactly once; optional probe evidence | Generator appends URL; no post-publish sitemap audit | Local XML URL exactly once and deployed sitemap contains URL |
| Secret/internal leakage | Shared `sensitive()` plus internal pipeline marker regex | Pages artifact security checks only | Article-level high-confidence secret patterns and internal approval/hash marker checks |
| Network probe | Caller-injected probe receipts with freshness checks | Shell `curl` title/robots readiness loop | Explicit `--network`; production HTML, media, sitemap, and source reachability; tests inject mocks |
| `REVIEW_REQUIRED` | Audit status and recommended human actions | No post-publish classification | Local/content/network discrepancies return `REVIEW_REQUIRED`; secret-like content returns `FAIL` |
| Rollback behavior | Recommended review actions only; `automaticMutation: false` | No post-audit rollback | No edit, unpublish, revert, or rollback; issue records the reason |

## Reused concepts

- Exact published HTML SHA-256.
- Expected document title and H1 verification.
- Exact canonical URL verification.
- Local and deployed sitemap verification.
- Official source section and expected source URL marker verification.
- Internal review/approval metadata leak detection.
- High-confidence secret pattern detection.
- `PASS`, `LOCAL_PASS_NETWORK_NOT_RUN`, `REVIEW_REQUIRED`, and `FAIL` outcomes.
- Read-only operation with an explicit mutation count of zero.

## Rejected legacy components

The following are intentionally not copied or revived:

- legacy scheduler;
- legacy automatic/controlled publisher;
- legacy owner approval state machine;
- legacy content generation and claim-graph pipeline;
- legacy `published-content-index.json` registry;
- source-body-change logic that could imply automatic article regeneration or unpublishing;
- legacy rollback recommendations as executable actions.

`published-content-index.json` is a migration reference, not an active registry. Operating it beside `daily_registry.json` would create two authorities and is prohibited.

## Current registry contract

New LOW records are produced by `build_registry_record()` with the existing fields plus:

| Field | Meaning |
|---|---|
| `publication_mode` | `LOW` or `REVIEW` |
| `approval_id` | Immutable approval identifier for REVIEW; `null` for LOW |
| `manifest_sha256` | Hash of canonical publication metadata and artifact paths |
| `content_sha256` | Hash of canonical generated article JSON |
| `html_sha256` | Hash of exact local HTML bytes |
| `source_urls` | Official source links expected in the page |
| `artifact_files` | Explicit release file allowlist |
| `published_at` | `null` until an actual deployment receipt is available |
| `production_verified_at` | `null` until a network audit passes |
| `post_publish_audit_status` | Initially `PENDING` |

Historical minimal records remain readable. They are not silently backfilled because their original article manifest and exact release evidence cannot be reconstructed safely. Auditing such a record reports missing evidence for human review rather than inventing hashes.

The auditor returns `registry_update_suggestion`, but never writes it. A later authorized receipt writer can apply `production_verified_at` and `post_publish_audit_status`. This avoids a second hidden registry mutation in a read-only phase.

## Audit contract

`audit_published_content(root, record, network=False)` performs local checks only by default.

Local checks:

- safe slug and expected `kb/<slug>.html` file;
- exact SHA-256;
- `<title>` and one exact H1;
- exact canonical;
- robots contains `index` and `follow`;
- `공식 참고자료` section and every recorded source URL;
- sitemap URL exactly once;
- no internal approval/hash metadata;
- no high-confidence secret pattern.

Local success is `LOCAL_PASS_NETWORK_NOT_RUN`. A content/integrity discrepancy is `REVIEW_REQUIRED`. A high-confidence secret is `FAIL` and blocks an audit pass; the auditor still performs no mutation.

With `--network`, the auditor additionally checks:

- production URL is HTTP 200, has the expected final URL, bytes/hash, title, canonical, and robots;
- hero and infographic URLs are reachable;
- deployed sitemap contains the production URL;
- official source URLs are reachable.

Media and source probes try HEAD first and fall back to GET when a server rejects HEAD. Production HTML and sitemap use GET because their bodies must be verified. DNS errors, timeouts, 5xx responses, and provider transients are `NETWORK_UNAVAILABLE` / `REVIEW_REQUIRED`, not content failure. A source-body change is not used to rewrite or unpublish an article.

## Flow integration

LOW candidate flow:

```text
generate → prepublish policy/QA → publish commit → Pages → readiness verify
→ shared Python post-publish audit → PASS or human-review issue
```

The workflow uploads the JSON audit receipt. On `REVIEW_REQUIRED` or `FAIL`, it opens an issue containing reasons and `mutation_count: 0`. It never edits or unpublishes the article.

REVIEW approval integration contract:

```text
immutable approved article + approved HTML + approval_id
→ build_registry_record(publication_mode="REVIEW")
→ publish without regeneration → Pages → same auditor
→ AUDIT_PASS or REVIEW_REQUIRED
```

At the specified official SHA there is no current REVIEW approval publisher or issue state transition implementation to wire into. The candidate therefore supplies the shared record/audit contract and a test proving REVIEW uses the same immutable HTML hash. It does not restore or invent the legacy approval state machine. A future current-architecture approval publisher should call the same helper, preserve the approved bytes, and map the receipt to `APPROVED → PUBLISHED → AUDIT_PASS` or `PUBLISHED → REVIEW_REQUIRED`.

## Status and mutation policy

| Condition | Result | Automatic action |
|---|---|---|
| Local checks pass, network disabled | `LOCAL_PASS_NETWORK_NOT_RUN` | Record receipt only |
| Local and network checks pass | `PASS` | Suggest registry verification fields |
| Hash/title/canonical/source/sitemap/internal marker mismatch | `REVIEW_REQUIRED` | Open human-review issue |
| DNS/timeout/5xx/transient provider problem | `REVIEW_REQUIRED`, `NETWORK_UNAVAILABLE` | Retry/review; no content change |
| High-confidence secret-like content | `FAIL` | Block audit pass and open issue |

No result automatically regenerates, modifies, reverts, or unpublishes content.

## Test strategy

All network tests use an injected fake fetcher. Required cases cover local hash success, tampering, wrong title/canonical, missing sitemap, internal marker leakage, secret-like content, network disabled, correct network content, timeout, wrong production content, zero mutation, and a shared REVIEW approval contract. No paid API or production endpoint is called.
