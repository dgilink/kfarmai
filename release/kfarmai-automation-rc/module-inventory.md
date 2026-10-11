# KFarmAI Automation Release Candidate inventory

Official baseline: `df111dddd509e43317ba459ecdf2193f94827dbc`

| Module | Status | Evidence |
|---|---|---|
| A. Agricultural collection | IMPLEMENTED | `automation/autopublish_pipeline.py`, guarded provider and synthetic tests |
| B. Source verification | IMPLEMENTED | `automation/source_policy.py`, allowlist and redirect tests |
| C. AI content generation | BLOCKED_LIVE | generator exists; account/model access remains blocked by HTTP 403 |
| D. AUTO/REVIEW/HOLD | IMPLEMENTED | risk routing and policy regression tests |
| E. Cost/model router | IMPLEMENTED_BLOCKED_LIVE | router and cost contract pass offline; live compatibility is blocked |
| F. Durable/scoped budget | IMPLEMENTED | applied migrations plus Python/PostgreSQL RPC tests; global budget remains disabled/0 |
| G. Artifact/Manifest | IMPLEMENTED_LIVE_VALIDATED | immutable SHA-256 package and Gate C Artifact live PASS |
| H. GitHub Issue | IMPLEMENTED_LIVE_VALIDATED | Issue API live PASS and artifact-to-Issue contracts |
| I. Human approval | IMPLEMENTED_LIVE_VALIDATED | actor/API permission checks and Gate C approval live PASS |
| J. Exact publish staging | IMPLEMENTED | isolated index, allowlist and byte comparison |
| K. Pages connection | IMPLEMENTED_DISABLED | default-disabled workflow and exact push-run/head receipt |
| L. Post-publish audit | IMPLEMENTED_BLOCKED_LIVE | byte, canonical, sitemap, image and source audit; non-test live publish is not approved |
| M. Idempotency/crash recovery | IMPLEMENTED | registry state machine, replay and recovery tests |

Production files on official main were retained as the baseline. Candidate modules were selected only where the Integration test record is more complete. Live-validated Gate C and Gate D contracts were preserved. No legacy working tree was copied into this candidate.
