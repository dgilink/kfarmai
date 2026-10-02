# kFarmAI V3 안전기반 Production 적용 Runbook

이 문서는 Phase 1 보안 변경의 적용 순서와 rollback 기준을 정의한다. 명령은 승인된 배포 세션에서만 실행하며, 이 문서 작성 단계에서는 실행하지 않는다.

## 적용 대상

- 비밀댓글 RLS: `supabase/migrations/20261002090000_secure_secret_comments.sql`
- 계정삭제 요청 큐: `supabase/migrations/20261002091000_account_deletion_requests.sql`
- 계정삭제 함수: `supabase/functions/request-account-deletion/index.ts`
- 프론트엔드: `index.html`, `diagnosis.html`, 공통 AI client와 safe Markdown renderer

## Pre-check

1. 승인된 release commit과 Production 기준 commit을 기록한다.

   ```bash
   git status -sb
   git rev-parse HEAD
   git log --oneline -5
   git diff --check
   ```

2. 사용자 미추적 파일과 secret 파일이 staging 대상에 포함되지 않았는지 확인한다. `git add .`와 `git add -A`는 사용하지 않는다.
3. Supabase Dashboard 또는 read-only SQL로 `comments`, `posts`, 기존 RLS 정책, `is_secret`, `parent_id`, `deleted_at` 구조를 export한다. 정책명과 SQL을 rollback 기록에 보관한다.
4. `comments`와 신규 요청 테이블의 schema-only backup을 만들고, 필요한 경우 비밀댓글 행 수만 별도 기록한다. 댓글 본문은 배포 로그에 출력하지 않는다.
5. 현재 공개 anon 요청으로 비밀댓글이 노출되는 재현 결과를 식별정보 없이 기록한다.
6. clean release worktree에서만 Production project link를 설정하고, link된 project ref가 승인된 Production ref와 정확히 일치하는지 두 사람이 확인한다.
7. migration dry-run 결과에 이번 두 migration 외 변경이 없음을 확인한다.
8. Edge Function에 필요한 secret 이름 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`가 존재하는지만 확인한다. 값은 출력하거나 복사하지 않는다.
9. 현재 Edge Function과 Pages 배포 commit/tag를 rollback 기준으로 기록한다.

## Deploy Order

### 1. DB migration

승인된 clean release worktree에서 migration dry-run을 다시 확인한 다음 두 migration만 순서대로 적용한다. 적용 도중 다른 schema 변경이 보이면 즉시 중단한다.

### 2. RLS 검증

`supabase/tests/secret-comments-access-check.sql` 또는 동일한 REST 검증으로 다음을 확인한다.

- anon: 공개댓글 조회 가능, 비밀댓글 행·본문 조회 불가
- 비밀댓글 작성자: 해당 비밀댓글 본문 조회 가능
- 게시글 작성자: 해당 게시글의 비밀댓글 본문 조회 가능
- unrelated authenticated user: 비밀댓글 행·본문 조회 불가
- 공개 답글과 비밀 답글의 `parent_id` 관계가 유지됨

RLS 검증이 실패하면 Edge Function과 frontend 배포로 진행하지 않는다.

### 3. Edge Function deploy

승인된 project ref를 명시해 `request-account-deletion`만 배포한다.

```bash
supabase functions deploy request-account-deletion --project-ref "$PRODUCTION_PROJECT_REF"
```

### 4. Edge Function smoke test

- 미인증 요청은 401
- 잘못된 확인 값은 400
- 유효 JWT 요청은 `pending`
- 조작한 `user_id`·이메일은 무시되고 JWT 사용자가 기록됨
- 중복 요청은 같은 사용자 요청으로 병합됨
- DB 오류에는 성공 응답이 없음

실제 Auth 사용자 삭제 또는 사용자 콘텐츠 변경은 수행하지 않는다.

### 5. Frontend deploy

검증된 release commit만 `main`에 반영한다. 현재 Pages workflow가 `main` push를 즉시 배포하므로 merge 전에 DB와 Edge Function 검증이 모두 완료돼야 한다.

### 6. Production smoke test

- 홈·로그인·로그아웃
- Google 및 이메일 OTP 진입
- 게시글 CRUD, 댓글·답글·비밀댓글, 사진 첨부
- AI 입력과 실패 화면
- safe Markdown 공격 문자열
- 날씨·시세·공공정보 진입

과금 가능한 실제 AI inference는 별도 승인 없이는 호출하지 않는다.

## Rollback

### RLS rollback

이전의 전체 공개 SELECT 정책으로 되돌리면 비밀댓글이 다시 노출되므로 금지한다. 참여자 정책에 장애가 있으면 우선 비밀댓글을 모든 일반 사용자에게 숨기는 안전 축소 정책으로 전환한다.

```sql
begin;
drop policy if exists comments_select_public_or_participant on public.comments;
create policy comments_select_public_only
on public.comments for select to anon, authenticated
using (coalesce(is_secret, false) = false);
commit;
```

원래 정책 복구는 비밀댓글 데이터가 없거나 별도 보호 조치가 확인된 경우에만 사전 export한 SQL로 수행한다.

### account deletion migration rollback

1. frontend의 탈퇴 버튼을 비활성화하거나 이전 release로 되돌린다.
2. Edge Function을 이전 검증 version으로 복구하거나, 최초 배포였다면 함수를 비활성화한다.
3. 요청 테이블은 즉시 drop하지 않고 접근을 차단한 채 보존한다.
4. 요청 기록을 승인된 안전 위치로 export하고 보존 필요성을 확인한 뒤에만 별도 승인으로 table drop을 검토한다.

### Edge Function rollback

이전 release tag의 함수 소스를 checkout한 clean worktree에서 같은 함수 이름으로 재배포한다. 이전 version이 없다면 Dashboard 또는 승인된 CLI 절차로 함수를 비활성화한다. secret 값은 변경 로그에 남기지 않는다.

### Frontend rollback

Pages에 배포된 문제 commit은 reset 대신 `git revert <release-commit>`으로 되돌리고 검토 후 `main`에 반영한다. 긴급 조치 전 현재 정상 commit과 Pages deployment ID를 기록한다.

## Rollback 판단 기준

- anon 또는 unrelated 사용자가 비밀댓글 본문을 한 건이라도 조회함
- 공개댓글이 전체 차단되거나 작성자·게시글 작성자가 필요한 비밀댓글을 조회하지 못함
- 계정삭제 요청이 다른 사용자 ID로 기록됨
- 서버 저장 실패인데 성공 메시지 또는 로그아웃이 발생함
- 로그인, 게시글, 댓글, 사진 첨부 핵심 흐름이 중단됨
- frontend에 service-role 또는 private secret이 노출됨

## Post-check

- anon secret body leakage: 0건
- 계정삭제 미인증 401, 유효 JWT만 `pending`
- 조작 ID 방어 및 중복 요청 확인
- XSS 4개 공격 문자열 실행 불가
- 로그인·댓글·답글·사진 regression 정상
- Edge Function과 Supabase error log에 반복 오류 없음
- 배포 commit, migration version, function version, 확인자, 확인 시각 기록

## Phase 2A 당시 환경 결과

Phase 2A 당시 작업 환경에는 별도 staging project, `supabase/config.toml`, Docker/local Supabase가 없었다. 따라서 당시에는 실제 RLS/JWT E2E 검증을 수행하지 않았다.

## Phase 2B local 검증 결과

Docker 기반 local Supabase에서 두 migration을 실제 PostgreSQL에 적용했다. Production ref나 Production 데이터는 사용하지 않았다.

- 비밀댓글 RLS: local REST/JWT 8개 계약 통과, anon·무관 사용자 비밀본문 노출 0건
- 계정삭제 요청: local Edge Function/JWT/DB 9개 계약 통과
- DB 장애 응답, 조작된 `user_id`·이메일 무시, 성공 이후 로그아웃 순서 확인
- 실제 Auth 사용자 삭제와 사용자 콘텐츠 삭제는 수행하지 않음
