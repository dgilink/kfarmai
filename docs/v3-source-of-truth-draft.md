# kFarmAI V3 Source of Truth 초안

## 목표

정적 사이트, Cloudflare Worker, Supabase migration과 Edge Function이 서로 다른 이력에서 배포되지 않도록 하나의 승인된 Git commit을 release 기준으로 사용한다.

## 단순 branch 흐름

```text
feature/* 또는 refactor/*
→ 검증 및 review
→ main
→ Production
```

- `feature/*`, `fix/*`, `refactor/*`: 기능별 작업과 검증용 branch
- `main`: 유일한 release branch. Pages, Worker, Supabase 배포는 승인된 `main` commit 또는 그 commit의 release tag만 사용
- 장기 develop branch나 환경별 복잡한 branch는 만들지 않는다.

## 저장소와 배포 기준

1. private 저장소의 `main`을 개발·release의 canonical source로 정한다.
2. 공개 GitHub Pages 저장소가 별도로 필요하면 canonical `main`의 동일 commit을 public `main`에 fast-forward 방식으로 mirror한다. 별도 cherry-pick으로 서로 다른 commit 이력을 만들지 않는다.
3. GitHub Pages는 현재처럼 public `main`만 배포하되, mirror된 commit hash와 release tag를 배포 기록에 남긴다.
4. Cloudflare Worker는 같은 release commit의 `worker/`만 배포한다. 로컬 수정본이나 다른 branch에서 직접 배포하지 않는다.
5. Supabase migration과 Edge Function의 source는 같은 저장소의 `supabase/`로 고정한다. Dashboard에서 직접 수정했다면 즉시 동등한 migration/source를 Git에 먼저 반영하고 다음 release 전에 drift를 해소한다.

## Release tag

- 검증 완료 commit에 `prod-YYYYMMDD-HHMM-<shortsha>` 형식의 annotated tag를 만든다.
- tag에는 Pages commit, Worker source commit, Supabase migration 마지막 version, Edge Function version을 release note로 기록한다.
- rollback은 가장 최근 정상 production tag를 기준으로 한다.

## 현재 이력 정리 원칙

- 현재 Production 정적 기준선은 `public/main@7c67ec1`이고 로컬 안전기반은 `86e93d9`에서 시작했다.
- 두 이력은 `45b4c33`을 공통 조상으로 하며 OAuth commit이 병렬로 존재한다. 기존 commit을 rewrite하지 않고, 검증된 안전기반 변경을 canonical `main`에 정상 merge한 뒤 public `main`을 그 동일 commit으로 맞춘다.
- KAMIS 최신성 수정과 Phase 1 보안 변경을 release 후보에 함께 포함하되, Production 반영 전 staging 검증과 승인 checkpoint를 통과해야 한다.

## Release 기록 최소 항목

- canonical commit과 release tag
- public Pages에 배포된 동일 commit
- Worker 배포 source commit
- 적용된 Supabase migration version
- Edge Function 이름과 배포 시각
- smoke test 결과와 rollback 기준 commit

이 초안은 merge, push, 배포를 실행하지 않으며 실제 remote 운영 방식은 대표 승인 후 확정한다.

## Phase 5D-1 Production integration audit

기준일은 2026-10-04이며 이 절은 Production을 변경하지 않은 read-only 조사와 로컬 simulation 결과를 기록한다.

### 기준선과 divergence

- 현재 Production 정적 기준선: `public/main@7c67ec1569207a127357129cf1fe6704619cc6af`
- V3 release candidate: `4c5d6d6c65428a74718ed4051b9fa044e09682f5`
- 공통 조상: `45b4c33893e58501b2ec07f68fc03c40312e830a`
- `public/main` 전용 commit은 `7c67ec1 Add personal OAuth information pages` 1개다.
- V3 쪽의 `86e93d9 Add personal OAuth information pages`는 `7c67ec1`과 patch-id가 같고 `oauth/index.html`, `oauth/privacy/index.html` 내용도 같다. OAuth 공개 페이지는 release 통합 시 반드시 보존한다.
- V3 전용 commit은 KAMIS 수정 2개와 V3 checkpoint 10개를 포함해 13개다.
- `public/main` 기준 release branch에서 V3 RC를 정상 merge한 로컬 simulation은 충돌 없이 완료됐고 전체 정적·브라우저·Worker 검증이 통과했다. 기존 commit을 rewrite하거나 public/main을 RC로 강제 덮어쓰지 않는다.

### Runtime layer manifest

| Layer | Release source | 현재 Production | V3 의존성 | Required before |
|---|---|---|---|---|
| GitHub Pages | 동일 release commit의 정적 파일 | `public/main@7c67ec1` | V3 community는 신규 DB column/table/RPC, 농업정보는 `/api/agri-feed` 사용 | DB, Edge Function, Worker smoke 완료 |
| Cloudflare Worker | 동일 release commit의 `worker/` | 기존 12개 API route, `/api/agri-feed` 없음 | 기존 route 유지 + `/api/agri-feed` 추가 | Pages 전에 deploy 및 legacy route regression |
| Supabase DB | `supabase/migrations/` 5개 | 신규 community/account-deletion 객체 미적용 | posts category/tags, reaction/bookmark/report/block, feed/moderation RPC | Edge Function과 Pages 전에 migration/RLS 검증 |
| Supabase Edge Function | `request-account-deletion` | endpoint 미배포 | JWT 검증 후 account deletion request 기록 | account deletion table migration |

현재 Production read-only probe에서는 `posts.category_id`, `posts.tags`, 신규 community table/RPC, `account_deletion_requests`가 없고 `/api/agri-feed` 및 `request-account-deletion`이 404였다. 따라서 전체 V3 Pages를 먼저 배포하면 community 조회/작성과 계정삭제가 DB 계약 불일치로 실패하고 농업정보가 Worker fallback에 머문다.

### Migration gate

적용 순서는 다음과 같다.

1. `20261002090000_secure_secret_comments.sql`
2. `20261002091000_account_deletion_requests.sql`
3. `20261002110000_v3_community_model.sql`
4. `20261002130000_v3_community_feed_metrics.sql`
5. `20261004100000_v3_community_moderation.sql`

모든 migration은 table/column 삭제 없이 기존 객체를 유지하지만 단순 schema-only 변경은 아니다.

- secret comments migration은 기존 comments SELECT policy 전체를 교체하므로 적용 전 정책 export와 anon/작성자/게시글 작성자/무관 사용자 검증이 필수다.
- community model은 신규 table과 posts column을 추가하고 기존 posts를 category/tag로 backfill한다.
- feed metrics는 archive channel 게시글의 신규 `category_id`를 `null`로 조정한다. legacy `channel_id`와 게시글 자체는 유지한다.
- moderation은 신규 role table과 RPC를 추가하고 신규 report queue의 상태 값을 변환한다.
- rollback SQL은 신규 community 데이터 제거 가능성이 있으므로 자동 적용하지 않는다. 먼저 데이터 export와 대표 승인을 거친다.

### Static-only backport 판정

`060ed0f`, `7fc9052`, `ea605c7`, `4c5d6d6` 네 commit은 `public/main` 기반 임시 branch에 충돌 없이 cherry-pick됐고 해당 Phase 5 테스트는 통과했다. 그러나 신규 RAS·수질관리 페이지가 Phase 3B에서 추가된 `/agri-info.html`을 연결하며, 이 페이지는 `/api/agri-feed`를 사용한다. 네 commit만 적용한 candidate에는 `/agri-info.html`이 없어 내부 링크가 깨진다.

따라서 네 commit의 무수정 cherry-pick은 안전한 static-only release가 아니다. 별도 backport 전용 링크 수정과 축소 검증 없이 일부 파일을 임의로 배포하지 않는다. 현재 선택 전략은 전체 V3 계약을 같은 release commit으로 맞추는 coordinated release다.

### Selected release strategy

`FULL-STACK COORDINATED RELEASE`를 선택한다.

1. `public/main` 기준 release branch에서 V3 RC를 정상 merge하고 OAuth 동등 patch가 보존되는지 확인한다.
2. 전체 regression, secret scan, diff check를 통과한 merge commit 하나를 release SHA로 승인한다.
3. 승인된 동일 commit을 private canonical `main`에 반영한다. 이 단계에서는 public Pages를 아직 trigger하지 않는다.
4. Production schema와 RLS policy를 backup하고 migration dry-run 및 실제 schema prerequisite를 확인한다.
5. 위 5개 migration을 순서대로 적용하고 각 단계의 RLS/REST/RPC gate를 통과한다.
6. `request-account-deletion` Edge Function을 같은 release SHA에서 배포하고 401/400/JWT/upsert/DB-error smoke를 통과한다.
7. Worker를 같은 release SHA에서 배포하고 기존 12개 route와 `/api/health`, `/api/agri-feed`를 검증한다. Worker 환경변수 이름은 기존 Production과 동일하며 신규 secret은 없다.
8. 마지막으로 동일 release commit을 public `main`에 반영해 Pages를 배포한다.
9. 공개 도메인에서 auth, community, secret comments, account deletion, agri-feed, legacy URL, RAS/수질관리, SEO/favicon smoke를 수행한다.

DB와 Worker 변경은 기존 Production frontend가 사용하지 않는 신규 객체/route를 우선 추가하며 기존 table/route를 유지한다. 따라서 Pages 전까지의 중간 상태는 backward compatible하게 구성할 수 있다. 단 secret-comment RLS 변경은 공개 노출 차단을 강화하므로 적용 즉시 비밀댓글 참여자 계약을 검증해야 한다.

### Layer rollback

- Pages: 문제 release를 reset하지 않고 승인된 revert commit 또는 직전 정상 Pages artifact로 복구한다. 기준 SHA는 `7c67ec1`이다.
- Worker: 직전 Production Worker source인 `7c67ec1`의 `worker/`를 재배포한다. legacy route smoke 후 Pages rollback 여부를 판단한다.
- Edge Function: 계정삭제 UI를 먼저 이전 Pages로 되돌린 뒤 Function을 직전 version으로 복구하거나 비활성화한다. request table은 즉시 삭제하지 않는다.
- DB: secret comments 정책은 과거 전체 공개 정책으로 되돌리지 않는다. 장애 시 공개댓글만 허용하는 안전 축소 정책을 사용한다. 신규 community rollback은 데이터 export와 별도 승인 없이 실행하지 않는다.

### Production smoke and rollback gates

다음 중 하나라도 발생하면 다음 layer로 진행하지 않거나 즉시 rollback을 판단한다.

- anon 또는 무관 사용자의 비밀댓글 본문 노출
- 기존 로그인, 게시글, 댓글, 이미지 기능 중단
- 신규 category/tag 조회의 PostgREST schema 오류
- reaction/bookmark/report/block 또는 moderator RPC 오류
- 계정삭제 실패인데 성공 UI나 로그아웃 발생
- 기존 Worker route regression 또는 `/api/agri-feed` 계약 실패
- index/mfg/legacy URL/RAS/수질관리 페이지의 5xx, blank, broken core link
- canonical/sitemap/ORP HOLD 파손
- secret, service-role, private path 노출

Release 기록에는 통합 merge SHA, DB migration version 5개, Edge Function version, Worker deployment identifier, Pages deployment identifier, smoke 결과와 각 layer rollback SHA/version을 남긴다.
