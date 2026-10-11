# KFarmAI Automation Human Review Fix-1 — Controlled Canary Gate

> Historical Fix-1 reference. The Integration-3 section below supersedes the historical gate list. Production Pages remains unchanged; live Canary is HOLD.

> Integration-4 운영 사전검수와 승인 대상: [integration4-preflight.txt](integration4-preflight.txt).
> 현재 Candidate는 usage 검증 실패 시 전역 budget freeze도 적용한다. 운영 연결/활성화 승인은 없다.

## Integration-3 — current contract (2026-10-10)

Official baseline: `b768656c95eb5f511deb637f74281a2dae4fa10f`.
Integration-2 sources are reused in a separate detached TEMP worktree.

### Durable budget Candidate

`supabase/migrations/20261010011009_automation_durable_budget.sql` is unapplied to
any existing database. Only a disposable PostgreSQL 17.11 container with no
network, published port, host mount or persistent volume receives the migration.
An administrator must separately review and authorize installation and the daily
micro-USD limit. The migration defaults to disabled with limit zero.

The private policy row is locked in one transaction for each operation. LOW and
REVIEW, text, search, repair and image reservations share that row and daily sum.
The server computes the KST date; clients cannot select a date or raise the limit.
Unique `(run_id, operation)` plus a deterministic reservation UUID prevent replay,
including new reservation IDs for an old run/operation. Use GitHub `run_id`, not
`run_attempt`, so job retries retain the same operation identity. Monetary values
are integer micro-USD; settled spend and held maxima are returned separately.

HELD -> DISPATCHED is committed before transport. A lost reply or process crash
retains the full maximum. There is no automatic expiry refund or retry. Confirmed
provider usage may settle DISPATCHED/UNKNOWN exactly once; mismatched repeated
receipts fail. An over-cap receipt persists a global disabled circuit breaker.
Reservations belong to their original KST day. Undispatched previous-day holds
cannot dispatch on a new day. No automatic refund of unresolved prior-day calls.

Only `service_role` can invoke the public SECURITY INVOKER RPC wrapper. Its private
SECURITY DEFINER implementation has an empty search path, RLS tables, no direct
table grants and no PUBLIC/anon/authenticated execution. No credentials, content
or billing ledger is written to this public repository. The Python RPC protocol
is dependency-injected; a production HTTP/credential adapter is not installed.

### Model and price evidence

`automation/model-pricing-20261010.json` versions the public standard/global prices
and source URLs. Public IDs and reasoning choices are documented for LIGHT
`gpt-6-luna`, STANDARD `gpt-6.1-sol`, HIGH `gpt-6-astra`; HIGH stays disabled.
IMAGE is `gpt-image-2.5-flare`, explicit low quality, one 1024x1024 WebP.
Public documentation is not account entitlement, request acceptance or billing
verification. Account access, complete input token accounting and the normalized
usage adapter are UNVERIFIED. No model-list or inference API has been called.

Text reservation uses the larger of input/cache-write rates, full input ceiling
and full output ceiling (including reasoning). Requests cap input at 16,000 and
output at 4,000 tokens, pin standard service tier and forbid implicit history.
At most two search operations exist for a run. Search per-call fees are documented,
but search content token maxima are not established. Image output token consumption
is also not a guaranteed maximum from the cost calculator. Both live paths fail
closed; no invented flat image price or search token bound is used.

The fixture adapter supplies explicitly hypothetical bounds and complete billing
categories solely to test pre-call reservation and settlement. It cannot accept
a live transport. Complete LOW/REVIEW flows exercise this guard against real local
PostgreSQL. Legacy fixture `budget.json` is not a live shared budget backend.

Sources checked: [OpenAI pricing](https://developers.openai.com/api/docs/pricing),
[Responses limits](https://developers.openai.com/api/reference/resources/responses/methods/create),
[image options and usage](https://developers.openai.com/api/docs/guides/image-generation),
[Supabase function security](https://supabase.com/docs/guides/database/functions),
[Postgres row locks](https://www.postgresql.org/docs/current/explicit-locking.html).
The Supabase changelog was checked, including the September 25 PostgreSQL
15.19/17.11 extension compatibility notice. This migration uses no extensions.

### Artifact and Issue contract

Upload the nine immutable package files at ZIP root, with `overwrite: false` and
`if-no-files-found: error`; do not upload a nested package ZIP. Use the exact name
`review-{approval_id}` and record `artifact-id`, `artifact-url`, `artifact-digest`.
Resolve an existing same-run upload on retries. Download by numeric ID and validate
the REST metadata, run ID, head SHA, retention, full downloaded ZIP digest, exact
file bytes and manifest SHA before creating any Issue. Service ZIP compression and
timestamps may differ from the local ZIP; the manifest still protects each byte.

A private durable outbox claims the approval identity before Issue creation.
Concurrent claims have one winner. A failed or lost create response is never
blindly retried. Only one exactly matching Issue can reconcile CREATING -> ISSUED;
zero/ambiguous/mismatched search results remain blocked. An orphaned CLAIMED record
requires operator investigation. No automatic reset/delete RPC is exposed.
`artifact_issue_contract.py` accepts fixture transports only. GitHub upload and
Issue creation adapters are absent and real writes remain unverified.
The connected REVIEW pipeline stops after its report. The existing owner/exact
command/hash/artifact checks, zero-AI approval and exact Git staging remain.

[GitHub upload outputs](https://github.com/actions/upload-artifact#outputs) define
the transport shape; real serialization and REST download behavior need Gate C.

### Separate activation gates

- A: offline implementation and all current regressions, including real local
  PostgreSQL concurrency/security tests. Passing A does not authorize writes.
- B: HOLD until separately approved one-call REVIEW-only plan, applied durable
  budget, verified input/usage/price bounds and account prerequisites. No image
  or search call may be smuggled into the one-call approval.
- C: HOLD until separately approved artifact/Issue-only integration against a
  protected environment and the installed durable outbox. No model or publication.
- D: LOCKED. Separate owner approval for exact manifest and publication/deployment.

Both automation jobs retain literal false locks, read-only permissions and shared
concurrency. Their named protected environments are proposed configuration, not
verified repository protection. A mandatory activation CLI also always blocks;
removing false or setting environment variables alone cannot activate publication.
The approval-receipt validator is a fixture contract, never a trusted authorization
source. Future activation requires a reviewed environment/owner verifier, protected
secrets, prevention of self-approval/bypass and separately scoped permissions.
`pages.yml` remains byte-equivalent to official main.

### Reproduce and retain evidence

Run the Python suite with an isolated PostgreSQL fixture. `tests/postgres_budget_harness.py`
rejects arbitrary database URLs and non-isolated containers. Gate A must reject
skipped database tests. Run browser tests sequentially on Windows, because parallel
headless Chrome startup/profile cleanup can race. Preserve the adjacent TEMP logs,
`verification.json`, changed-file hashes and final report. There is no project
commit or deployed change to roll back. Never reset/clean the original worktree.

## 판정

**CONDITIONAL PASS (오프라인 Candidate / 2026-10-10)**. 150개 Python fixture 테스트 PASS. **실제 Canary 실행 승인 아님**.

- 근거: 사용자가 업로드한 `zip.zip` + `automation-human-review-missing.zip`의 2026-10-09 Integration-1 소스. 이 ZIP에는 2026-10-10 로컬 Router 보완본 원문이 없으므로 보고된 정책을 기준으로 동일한 동작을 재구현했다. 사용자 로컬 저장소에 아직 적용하지 않았다.
- 이번 Candidate는 업로드본에 대한 **수정 제안/오버레이**이며 운영 `dgilink/kfarmai/main`에 설치되지 않았다.
- 승인 게시자의 **실제 Git index**에 `git add -- <정확한 경로>`로 stage한 뒤 index byte hash를 검증한다. 오프라인 시뮬레이터는 `simulate_exact_stage`로 분리했다.
- 기존 게시물은 포괄적 registry identity와 본문/이미지/SVG hash/sitemap 대조 없이 `ALREADY_PUBLISHED`로 처리할 수 없다.
- 메인 push 뒤 Issue 갱신이 실패하면 재실행 시 정확한 게시물만 식별해 `PUBLISHED_PENDING_VERIFY → AUDIT_PASS`로 복구할 수 있는 경로가 있으며 재생성하지 않는다.
- Registry 최종 상태 변경은 read-only 감사가 아니라 별도의 검증된 **registry-only receipt plan**을 exact-stage하여 별도 커밋하도록 했다. 재실행 시 동일 receipt의 중복 커밋은 건너뛴다.
- Router는 단순 2~3개 source에서 LIGHT를 쓰고 `4+ source + 복합 종합`, 공식 출처 충돌 때 STANDARD를 허용한다. budget 소진 뒤 재시도와 search 2회 이상을 막고 STANDARD schema repair는 최대 한 번이다.
- 발견/예약 비용은 오프라인 fixture 정책으로 `LIGHT model + web search`를 합산한다. **실제 모델 요금표 및 제공 API 지원 검증 결과는 아님**. Live 비용 estimator는 근거 있는 provider price, 토큰/검색 상한, 누적 예산 상태가 검증될 때까지 비활성으로 유지한다.

## Canary 전 HARD GATE — 현재 모두 미승인

1. **Local source reconcile**: 실제 `C:\Users\user\PERSONAL\dev\kfarmai-web`의 Router 최신 변경본과 본 오버레이를 Codex로 diff 검토. 원본 미추적 파일을 덮어쓰지 말 것. 공식 `public/main` 기반 **새 clean temp worktree**에서만 병합. 임의 cherry-pick 금지.
2. **Production workflow restore**: 이 ZIP의 Integration-1 `.github/workflows/kfarmai-daily-autopublish.yml`은 오프라인 fixture 전용이다. `pages.yml`은 테스트용 잠금 상태이므로 **절대 운영에 덮어쓰거나 적용하지 말 것**. 운영본은 `public/main`에서 유지하고 안전 패치만 적용한다.
3. **New REVIEW package generating job**: 기존 실제 schedule의 LOW 정책·API 호출·risk gate를 보존한 채 immutable approval-package v2, Issue body, 업로드된 artifact ID/digest 연결. 배포 가능한 새 REVIEW 1건은 본문/hero/SVG/manifest 완비가 필수. Legacy 2026-10-07 2-file artifact 사용 금지.
4. **Separate review owner gate**: workflow는 현재 `false &&`, `contents:read`, `issues:read`로 HARD LOCK. 프로덕션-ready 최소 권한(승인 job의 `contents:write`, `issues:write`, Pages dispatch를 사용할 때만 `actions:write`), 정확한 `KFARMAI_CANARY_APPROVAL_ID`, user explicit owner approval, concurrency, secret 수칙 검수. Gate 승인 전 어떠한 잠금도 풀지 말 것.
5. **Models/pricing**: 실제 API에서 모델 명칭 및 `reasoning.effort` 지원 확인. 운영비 추정이 실 가격/토큰/검색 호출 비용과 연결되기 전에는 실 AI 호출 금지. 현재 fixture 상한은 견적이 아니다. 누적 예산은 매 실행 `run-output/budget.json`만으로 여러 별도 GitHub Actions run 사이에 공유되지 않으므로 **durable daily budget guard** 마련 필요.
6. **Automated checks**: 통합 clean worktree에서 전체 Python/JS/Worker/Pages regression, 실제 browser, SEO, sitemap semantic, artifact allowlist, secrets, workflow YAML/shell, `git diff --check`, Git index exact staged content; 첫 실행은 permission 없는 mock/dry-run.
7. **Canary gate**: 위 내용이 모두 PASS한 뒤 사용자에게 제목·내용·REVIEW 이유·출처·위험·image 상태·package hash·예상 요금을 보여주고 **명시적 승인**을 받아 단 1개의 synthetic/real REVIEW Canary(실비/Issue/게시 선택을 분리해 승인)를 진행. 이 문서 자체는 게시 권한을 부여하지 않는다.
8. **V4 UI 별도**: UI V4-2 Candidate는 이번 자동화 Candidate와 병합하지 않는다.

## 반영 파일

- `automation/model_router.py`
- `automation/autopublish_pipeline.py`
- `automation/kfarmai_review_approval.py`
- `automation/review_approval_workflow.py`
- `automation/kfarmai_post_publish_audit.py`
- `automation/synthetic_e2e.py` (오프라인 시뮬레이터 호출 정리)
- `tests/test_model_router.py`, `tests/test_automation_integration.py`, `tests/test_review_approval.py`, `tests/test_canary_readiness.py`

## 수동 검수에서 남긴 위험

- **HIGH**: 서비스 비용/모델 API 지원 및 durable daily budget 미검증, 실제 GitHub Actions/GitHub Pages dry-run 미검증.
- **MEDIUM**: source context ZIP이 실제 official full repo가 아니므로 Pages/Worker/전체 JS regression 미실행. Workflow 활성화 권한/배포 cutover 미승인.
- **HARD_GATE**: 실 Issue mutation, 실 AI, commit/push, Production 게시·배포 전부 미승인.

## 검수 자료의 완결성

본 오버레이는 실제 원본 후보에 적용하기 위한 *review patch*다. `automation/daily_registry.json`, `automation/topic_seed.json`, `sitemap.xml` 및 `.github/workflows/pages.yml`은 로컬 오프라인 테스트 재현을 위해 생성/구비한 fixture로, 전달 오버레이에 포함하지 않는다. 기존 웹페이지, 주요 source, 설정 및 안전 승인 로직을 임의로 갱신하지 않는다.
