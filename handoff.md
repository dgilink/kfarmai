# kFarmAI 작업 인수인계

마지막 업데이트: 2026-07-05

## 현재 상태

- 현재 브랜치: `main`
- 원격 반영 완료 최신 커밋: `b964fb5 feat: improve question flows and diagnosis UI`
- 작업트리 특이사항: `resend api key.txt` 미추적 파일이 있음
- `resend api key.txt`는 secret 가능성이 높으므로 절대 `git add`, commit, push 하지 말 것
- Resend API key는 코드에 넣지 않고 Supabase Dashboard의 SMTP Settings에만 입력하는 구조

## 최근 완료 작업

1. Google 로그인
- Google 로그인 버튼 무한 로딩 복구 로직 추가
- OAuth `redirectTo`는 `https://kfarmai.com/auth-callback.html` 기준
- Google 화면의 `supabase.co` 표시 제거는 코드 문제가 아니라 Supabase Auth Custom Domain 유료 설정 필요

2. 이메일 OTP 로그인
- 8자리 OTP 입력 가능
- OTP 발송 실패 시 Supabase 이메일 발송 한도 메시지 표시
- Resend + Supabase Custom SMTP 설정으로 OTP 발송 정상화 확인
- OTP/Magic Link 템플릿은 `{{ .Token }}` 사용

3. 홈 질문 섹션
- `지금 많이 보는 질문`, `나도 같은 증상`, `방금 올라온 질문`에 더보기 흐름 추가
- `방금 올라온 질문`은 실제 Supabase `posts` 최신순 조회 우선
- 기존에 `loadFeed()`와 `searchPosts()`가 실제 조회 전에 fallback/빈 배열로 빠지던 문제 수정

4. 마이페이지
- MY 패널 진입 시 로그인 사용자 기준 글/진단 카운트 재조회
- 질문 작성 성공 직후 `loadMyCounts(userId)` 호출
- 내가 쓴 글 목록 진입 시 최신 목록 재조회 유지

5. 게시글 수정
- `post.html` 수정 모달에서 기존 사진 유지/삭제, 새 사진 추가 가능
- 기존 `posts.image_urls` 컬럼과 `post-images` Storage bucket 사용
- Storage/RLS 설정 문제가 있으면 코드가 아니라 Supabase Dashboard에서 확인 필요

6. AI 참고 진단
- `index.html` AI 참고 탭에 작물명/재배환경 입력 추가
- 사진 없이 텍스트만으로 AI 참고 진단 요청 가능
- `diagnosis.html` 화면을 `index.html` AI 참고 탭과 같은 밝은 카드형 UI로 맞춤
- `diagnosis.html`은 진입 즉시 카메라 권한 요청하지 않고 촬영/앨범 버튼 클릭 시 진행
- 금지 표현 중 `최종 처방`은 `확정 판단`으로 대체

## 중요한 보안 주의

- API key, secret, `.env.local`, Resend key를 HTML/JS/JSON/문서에 넣지 말 것
- `resend api key.txt`는 저장소 밖으로 옮기거나 로컬에서 삭제 권장
- `git add .` 금지
- 필요한 파일만 직접 지정해서 add
- Supabase `service_role` key를 브라우저 코드에 넣지 말 것
- Supabase Auth 사용자 삭제는 브라우저에서 하지 말 것

## 다음 세션 시작 체크

반드시 먼저 실행:

```powershell
git status -sb
git branch --show-current
git log --oneline -5
git diff --stat
```

확인할 것:

- `resend api key.txt`가 아직 미추적이면 절대 스테이징하지 말 것
- 작업트리가 깨끗하지 않으면 사용자가 만든 변경인지 먼저 확인
- 기능 수정 전 `AGENTS.md`와 이 파일을 먼저 읽기

## 현재 남은 확인/후속 작업 후보

1. 실제 모바일 화면 확인
- 홈 질문 섹션 더보기 3종 클릭
- 방금 올라온 질문에 실제 다른 사용자 글이 표시되는지 확인
- 게시글 작성 후 MY 카운트 즉시 갱신 확인
- 게시글 수정에서 사진 추가/삭제 확인
- `diagnosis.html`과 홈 AI 참고 탭의 시각 통일성 확인

2. Supabase 설정 확인
- `posts` RLS가 공개 읽기를 허용하는지 확인
- `posts.image_urls` 컬럼이 실제 운영 DB에 존재하는지 확인
- `post-images` Storage bucket 업로드/공개 URL 접근 정책 확인
- Custom SMTP는 Supabase Dashboard에만 저장되어야 함

3. AI 진단 구조 개선
- `diagnosis.html`은 현재 브라우저에서 AI API 직접 호출 구조가 남아 있음
- 장기적으로는 Worker/Edge Function 프록시로 옮겨 secret 노출을 막아야 함
- 단, 대규모 리팩터링은 별도 작업으로 분리 권장

## 최근 테스트 결과

- `index.html`, `post.html`, `diagnosis.html` 인라인 JS 문법 검사 통과
- 금지 표현 검색에서 지정 금지 문구 제거 확인
- `service_role`, `.env.local`, admin delete 관련 신규 노출 없음

## 추천 커밋 메시지 후보

다음 작업이 이어질 경우 작업 내용에 맞춰 사용:

```text
fix: harden post image editing flow
fix: refresh community question lists from posts
feat: polish diagnosis page mobile layout
chore: update project handoff notes
```

## 2026-07-05 작물별 재배달력·재배가이드 MVP 추가

- 정적 HTML 구조에 맞춰 `crop-calendar.html`, `crop-guide.html`을 `data/crops_mvp.json` 기반 화면으로 교체.
- 23개 작물 seed, 추천 인기작물, 작물명/초성/별칭 검색, 지역/시설·노지/variant 선택 구조 추가.
- 딸기 `육묘용/재배용`, 토마토 `방울토마토/육묘용/재배용`, 고추 `육묘용/재배용` variant 구조 추가.
- 사용자 화면은 `approved` 데이터만 읽고, 공식 이미지가 검수 전이면 “공식 사진 준비 중”으로 표시.
- `crop_images` seed는 모두 `needs_review` 상태이며 공식 이미지 URL, 원문 URL, 라이선스 확인 후만 `approved`로 전환 필요.
- API 커버리지 리포트 재생성 결과: `FULL` 22개, `PARTIAL` 1개. `NONGSARO_API_KEY`는 `.env.local`에서 정상 인식됨.
- 추가 스크립트: `scripts/crops/seed-crops.cjs`, `scripts/crops/probe-api-coverage.cjs`, `scripts/crops/review-status.cjs` 등.
- DB 적용 후보 스키마는 `docs/crops_mvp_schema.sql`에 분리. 운영 Supabase 적용 전 SQL Editor에서 검토 필요.

남은 TODO:

- 농사로 세부 operation별 원문 필드 매핑을 보강하고, `node scripts/crops/probe-api-coverage.cjs`로 커버리지를 재확인.
- 공식 이미지 원문/라이선스 검수 후 `crop_images`를 `approved` 및 `is_official_source=true`로 전환.
- 운영 DB에 `docs/crops_mvp_schema.sql` 적용 여부 결정.
- 필요 시 `data/crops_mvp.json` seed를 Supabase insert/upsert 스크립트로 확장.
