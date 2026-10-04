# kFarmAI V3 Preview 검증 체크리스트

## Pre-check

- release 후보 SHA, 현재 정상 Production SHA, rollback SHA를 기록한다.
- Production이 아닌 Preview Supabase/Worker/frontend 대상인지 project ref와 hostname을 두 번 확인한다.
- DB schema와 Storage 정책을 백업하고 migration dry-run 결과를 보관한다.
- 테스트 일반 계정 2개와 moderator 계정 1개를 준비한다. moderator 역할은 신뢰된 DB 운영 절차로만 부여한다.
- Worker/Edge Function secret 이름만 대조하고 값은 로그나 문서에 출력하지 않는다.

## Migration order

1. `20261002090000_secure_secret_comments.sql`
2. `20261002091000_account_deletion_requests.sql`
3. `20261002110000_v3_community_model.sql`
4. `20261002130000_v3_community_feed_metrics.sql`
5. `20261004100000_v3_community_moderation.sql`
6. anon/일반/moderator JWT로 RLS 검증 후 다음 단계로 이동

## Preview deploy order

1. Preview DB migration
2. RLS와 report queue smoke test
3. Preview Edge Function deploy와 계정삭제 요청 smoke test
4. Preview Worker deploy와 `/api/health`, `/api/agri-feed` smoke test
5. Preview frontend deploy
6. 모바일/PC 통합 smoke test

## Smoke test

- 로그인, 로그아웃, 이메일 OTP/Google callback 진입
- 4분류 Feed, 검색, 작성/수정/삭제, 댓글/비밀댓글, 사진 업로드
- same symptom/helpful/bookmark, block/unblock, 신고 중복
- anon/일반 사용자 관리자 차단, moderator 신고 목록/상태 변경
- fixture AI 결과 → 질문 초안 → 수정 → 취소/게시, 게시 전 Storage 객체 0
- EXIF/GPS/원본 파일명 비노출
- 계정삭제 요청 접수, AI XSS, 농업정보 partial/fallback

## Rollback

- frontend는 기록한 이전 release SHA로 되돌린다.
- Worker/Edge Function은 직전 Preview version으로 되돌린다.
- migration rollback은 역순의 `supabase/rollback/*_down.sql`을 사용하되 먼저 신고 상태와 역할 데이터를 export한다.
- rollback 판단 기준은 비밀댓글 노출, 일반 사용자의 관리자 데이터 접근, 게시 실패 후 Storage orphan, 로그인/작성 불가, fatal console 오류다.

## Preview → Production gate

- RLS/E2E, security regression, responsive smoke가 모두 PASS다.
- BLOCKER/HIGH가 0이고 MEDIUM은 대표 승인과 rollback 계획이 있다.
- 개인정보 삭제 정책과 moderator 지정자가 승인됐다.
- Production 적용 창, 담당자, 모니터링, rollback 결정을 명시적으로 승인한 뒤에만 진행한다.
