# KFarmAI_HISTORY_HANDOFF_20260919

작성일: 2026-09-19  
목적: kFarmAI의 과거 개발 과정, 설계 변화, 운영 상태, 실험 트랙, 다음 작업자가 반드시 알아야 할 기준을 한 문서로 통합한다.

---

# 1. 이 문서의 역할

kFarmAI는 2026년 5월부터 기능과 사업 방향이 여러 차례 바뀌었다.

과거 대화에는 다음이 동시에 존재한다.

- 커뮤니티 중심 설계
- SEO Q&A 중심 설계
- AI 참고 진단
- 공공데이터 매칭
- 농자재 정보 허브
- 지역 농약사 지도
- 3페이지 스와이프
- 하단 5탭
- 하단 탭 제거
- 초록장터 거래 prototype
- 가상 홈가드닝 prototype
- 공모전 발표용 기능 강화
- Cloudflare Worker/API 연동
- Search Console 색인 이슈

따라서 과거 한 시점의 지시만 보고 전체 프로젝트 방향으로 착각하면 안 된다.

이 문서는 과거 기록을 시간순으로 정리하고,
**현재 kFarmAI 핵심과 분리 실험을 구분**하기 위한 handoff다.

---

# 2. 현재 기준으로 유지할 핵심 정체성

```text
kFarmAI =
공공데이터 기반
AI 농업·식물 문제해결
검색·질문·커뮤니티
모바일 중심 플랫폼
```

핵심 흐름:

```text
사용자 문제 발생
→ 검색 / 질문 / 사진·문장 입력
→ AI 참고 진단
→ 공공데이터·공식자료 확인
→ 관련 질문·커뮤니티
→ 날씨·시세·지도·재배정보·계산기 등 참고
```

농자재 판매 자체가 목적이 아니다.

---

# 3. 2026-05: 초기 정체성 정리

## 2026-05-17 전후

초기 사업 논의에서 중요한 결론은 다음과 같다.

- kFarmAI는 농자재 쇼핑몰이 아님
- 농자재 회사/판매점 디렉토리만으로 만들지 않음
- 사용자 중심
  - 홈가드닝·반려식물·텃밭 사용자
  - 실제 농업인
- 문제 발생부터 해결 경험까지 한 흐름으로 묶음

초기 선순환 구조:

```text
문제 발생
→ 검색
→ AI 답변
→ 정보 확인
→ 사람들과 소통
→ 해결 경험
→ 재방문
```

당시부터 장기적으로:

- 검색 유입
- 커뮤니티 축적
- 광고/제휴
- 업체 연결
- B2B/데이터

구조가 논의됐다.

---

# 4. 2026-06 초: 모바일 네이버형·커뮤니티 전면 설계

## 2026-06-05~06

이 시기에는 첫 화면을 매우 적극적으로 커뮤니티 중심으로 바꾸는 설계가 진행됐다.

핵심 요구:

```text
상단 검색창 유지
모바일 네이버형 카드
좌우 스와이프
커뮤니티를 첫 페이지
AI 진단을 두 번째
농자재/지역정보를 뒤쪽
```

한때 확정된 우선순위:

```text
1. 커뮤니티 카드 중심 첫 화면
2. AI 진단 두 번째 페이지
3. 농자재 DB 후순위
4. 농약사 지도 = 주변 추천
5. 하단 탭 = 홈 / 질문 / 진단 / 주변 / MY
```

또 다른 설계에서는 3페이지 스와이프 구조로 정리됐다.

```text
Page 1: 커뮤니티
Page 2: AI 진단
Page 3: 농자재·지역정보
```

당시 AI 결과 뒤 연결 순서:

```text
문제 설명
→ 원인 후보
→ 무료 일반 관리법
→ 관련 자재군
→ 접힘형 업체 정보
→ 가까운 판매점 확인
```

중요: 이 시기의 5탭/스와이프는 **역사적으로 중요한 설계지만 최신 UI 규칙은 아니다.**
7월 최신 handoff에서 하단 고정 탭은 제거 방향으로 바뀐다.

---

# 5. 2026-06-07~08: SEO·공공출처·개발 안전성 강화

이 시기부터 단순 커뮤니티보다 검색자산과 공식출처가 중요해졌다.

주요 방향:

- 실제 농민/홈가드닝 사용자가 검색하는 질문형 콘텐츠
- 농사로
- 농약안전정보
- 병해충 공공자료
- 공식 출처 연결
- FAQ
- 검색 엔진 메타데이터
- HTML/DB 입력 가능한 구조

개발 환경 관련 기록:

```text
로컬 작업 경로(당시):
C:\Users\user\PERSONAL\dev\kfarmai-web
```

개인 프로젝트 개발 장비 원칙도 정리됨:

- 개인 PC 중심 개발
- 개인 휴대폰 확인
- 회사 자산 PC/휴대폰은 개인 개발에서 제외

서비스 안전 원칙:

- 농약/병해충 답변 단정 금지
- 자동 처방 표현 금지
- 공식자료와 AI 생성정보 구분

---

# 6. 2026-06 말: 공모전·작동형 MVP·UI 복구

## 2026-06-26~30

공모전과 실제 MVP 시연을 염두에 둔 작업이 집중됐다.

서비스 설명은 다음으로 정리됐다.

```text
공공데이터 기반 AI 농업·식물 문제해결 및 지역 커뮤니티 플랫폼
```

공모전 문서 기준 실제 MVP 항목:

- 커뮤니티
- AI 참고 진단
- 통합검색
- 농업날씨
- 농산물 시세
- 지도
- 계산기
- 공공자료 연결

당시 공공데이터 축:

- 농약안전사용지침
- 병해충 발생/예찰정보
- NCPMS
- 전국 농약·비료 판매업체 표준데이터
- 기상청 단기예보
- 공영도매시장/농산물 시세

UI에서는:

- 중복 로고 제거
- 농업정보 버튼 실제 링크 확인
- 모바일 스와이프 복구
- 로그인/글쓰기 모달 UX
- 최소 수정 원칙

이 강조됐다.

Git에서는 `feature/agri-data-hub` 등 개발 브랜치와
`main` 배포 상태 사이의 문제도 경험했다.

---

# 7. 2026-07-01~06: 7일 집중 업데이트

공모전 발표 전 완성도를 끌어올리기 위한 집중 작업이 진행됐다.

## Day 1 성격

홈 검색/커뮤니티 트렌드:

- 지금 많이 보는 질문
- 나도 같은 증상
- 최근 질문
- 검색 결과에서 AI/질문/공공정보/도구 연결

2026-07-01 기록에는 `index.html` 중심 작업과
커밋 `ebb17a1`이 확인된다.

실제 로고 경로:

```text
/static/kfarmai-logo-horizontal.png
```

## Day 2 성격

AI 참고 진단 화면 안전화:

- `diagnosis.html`
- `diagnosis-cases.html`
- `ai-safety.html`

중심 개념:

```text
원인 후보
확인 포인트
AI 추정 강도
공공데이터 확인
안전사용기준
fallback
```

---

# 8. 2026-07-03~05: 홈 구조 세밀화

홈 순서가 구체적으로 조정됐다.

한 시점의 순서:

```text
로고
→ 검색창
→ 커뮤니티 / AI 참고 / 농업정보
→ AI 참고 진단
→ 채널 둘러보기
→ 지금 많이 보는 질문
→ 나도 같은 증상
→ 방금 올라온 질문
```

검색창 문구:

```text
식물·작물 증상을 검색해보세요
```

8개 채널 상세 구조도 다음 패턴으로 정리됐다.

```text
검색
소개
질문하기 / AI 참고 진단
빠른 주제
최신·인기·유사 질문
관련 정보 연결
```

모바일 하위 페이지 헤더를 통일하고
빈 공간을 줄이는 방향이 강조됐다.

---

# 9. 2026-07-05~06: GitHub Pages 배포 장애 기록

GitHub Pages에서:

```text
build 성공
→ deploy 단계 실패
```

가 여러 차례 반복된 기록이 있다.

이 경험 이후 배포 작업에서는:

- 빌드 성공만으로 운영 성공 판단 금지
- Pages deploy 상태 별도 확인
- 운영 URL 실제 접속 확인
- 모바일 실제 접속 확인

원칙이 중요해졌다.

---

# 10. 2026-07-07~12: 보안·Cloudflare·Worker·공공데이터 고도화

## 도메인/Worker

운영:

```text
kfarmai.com
```

Worker:

```text
kfarmai-api
https://kfarmai-api.dgilink.workers.dev
https://kfarmai.com/api/*
```

Cloudflare 네임서버/Route 전환 작업이 이루어졌다.

프론트엔드에 API key를 넣지 않고
Worker Secret으로 관리하는 방향이 확립됐다.

## GitHub 보안

- Secret Protection
- Push protection
- unresolved secrets 0

기록이 있다.

## 2026-07-12 handoff 기준

당시 저장소:

```text
C:\Users\user\PERSONAL\dev\kfarmai-web
branch: develop
tracking: private/develop
```

당시 최근 공개 반영 주요 커밋:

```text
45b4c33 style: refine AI diagnosis headline
47ddc4e style: compact AI symptom textarea
d67f811 feat: add public data knowledge summaries
de6d6c0 fix: support query-based public data reports
2647307 chore: verify worker secret configuration
```

이 값은 현재가 아니라 **2026-07-12 당시 기준선**이다.

---

# 11. 2026-07-12: 공공데이터 보고서 구현 상태

`public-data.html`은 URL query 기반 진단 보고서를 지원하도록 발전했다.

지원 기록:

```text
crop
symptom / symptoms / q
candidate / candidates
source
demo=1
```

localStorage도 유지:

```text
kfarmai:lastDiagnosis
kfarmai:lastAiDiagnosis
```

대표 knowledge pack:

```text
pepper-anthracnose
pepper-leaf-curl
tomato-spot
tomato-late-blight
strawberry-gray-mold
rice-blast
```

공식자료 요약형 카드:

- 증상 포인트
- 발생환경 포인트
- 재배관리 포인트
- 안전사용기준 확인 포인트

중요 원칙:

```text
정적 공식자료 요약 ≠ 실시간 API 응답
```

---

# 12. 2026-07-12: API 상태

실응답 확인 기록:

```text
/api/health
/api/ncpms/diseases
/api/kamis/prices
/api/nongsaro/service
```

부분 연동/fallback:

### PSIS

```text
/api/psis/pesticide-safety
```

- secret 존재
- fallback 중심
- serviceCode/parameter/XML parser 검증 필요

### 기상청

```text
/api/weather/forecast
```

- KMA_SERVICE_KEY 필요
- nx/ny 격자 필요

### 통합 공공정보

```text
/api/agri/public-info
```

- 여러 API 결합
- timeout 발생 가능

### NCPMS

- 실응답은 확인
- 상세 다건 호출로 느려질 수 있음

---

# 13. 2026-07-13: kFarmAI와 거래 서비스 경계

이 시기에 중요한 사업적 분리가 정리됐다.

kFarmAI:

```text
농업·식물 문제해결
AI 참고 진단
공공자료
커뮤니티
지역정보
```

별도 거래/가격 발견 서비스:

```text
거래
가격제안
경매
바로구매
```

즉 kFarmAI 진단 결과를
상품 판매/품질 보증처럼 연결하지 않는다는 원칙이 강화됐다.

---

# 14. 2026-07-15~17: 초록장터 구해요 MVP

이 시기에는 kFarmAI 저장소 안에서 별도 거래 prototype이 만들어졌다.

2026-07-17 기록 브랜치:

```text
feature/green-market-request-mvp
```

당시 최근 커밋:

```text
0181d48 feat: add match chat and trade completion flow
6815e29 feat: add private seller offer and comparison flow
f747e44 feat: add request market buyer flow prototype
d6d7749 docs: design request-first green market MVP
c65c765 feat: add transaction chat and plant history prototype
```

핵심 flow:

```text
구매자 요청 등록
→ 판매자 비공개 제안
→ 구매자 비교
→ 제안 선택
→ 판매자 확인
→ 거래 채팅
→ Mock 거래 완료
```

구현 성격:

- 정적 HTML/CSS/JS
- Mock data
- 브라우저 상태
- 실제 결제 없음
- 실제 배송/정산 없음
- 실제 Supabase 연결 없음
- 운영 웹과 분리

주요 경로:

```text
docs/green-market-request-mvp/
prototype/request-market/
```

이 트랙은 현재 kFarmAI 핵심으로 자동 간주하지 않는다.

---

# 15. 2026-07-17: 최신 UI 방향 중 중요한 변경

2026-06 설계와 충돌하는 중요한 기록:

```text
하단 고정 탭바는 제거 방향
홈/질문/진단/주변/MY 하단 탭을 다시 추가하지 않는다
```

따라서 과거 6월의 하단 5탭 설계는 현재 자동 적용하지 않는다.

또한 AI 입력 UI는:

```text
사진
증상 설명
시작 버튼
```

중심의 compact 구조로 정리되고,
보조 입력은 접기 영역 우선이었다.

textarea 기록:

```text
height: 56px
min-height: 56px
max-height: 160px
```

제목:

```text
식물 문제, AI로 먼저 확인
```

---

# 16. 2026-07 하순~08월: SEO 운영과 색인 문제

운영 기록상:

- Google 검색 클릭이 초기부터 발생
- 이후 최근 28일 클릭 수가 점진 증가한 기록
- NOINDEX 색인 제외
- 중복 페이지
- 404
- 색인 검증

문제가 있었다.

따라서 SEO는 단순 메타태그 추가만 하지 않고:

```text
canonical
noindex
404
중복 URL
sitemap
내부링크
구조화데이터
실제 원본문서
```

를 함께 확인해야 한다.

콘텐츠 전략은:

```text
kFarmAI = 원본 자산
네이버/인스타/쇼츠 등 = 유입 채널
```

로 발전했다.

---

# 17. SEO 콘텐츠 축

반복적으로 중요하게 다뤄진 콘텐츠 분야:

### 상토·분갈이

- 상토 굳음
- 곰팡이
- 하얀 가루
- 냄새
- 배수
- 분갈이 후 시듦
- 화분 흙 문제

### 벼·육묘

- 모판 변색
- 웃자람
- 곰팡이
- 물관리
- 상토 사용량

### 병해충·농약

- 총채벌레
- 탄저병
- 흰가루병
- 응애
- 희석배수
- 등록약제 확인
- 농약 안전 체크

### 홈가드닝

- 물주기
- 잎 끝 갈색
- 잎 노랗게
- 화분 벌레
- 몬스테라
- 고무나무
- 방울토마토
- 허브
- 텃밭 비료

콘텐츠는 공식출처 확인과
AI 참고 진단/공공정보/커뮤니티 연결을 가져야 한다.

---

# 18. 가상 홈가드닝 / 식물 키우기 실험

프로젝트 대화 안에서 별도의 가상 식물 키우기 기능도 실험됐다.

확인된 기능:

```text
3개 식물
성장 단계 1~5
물 주기
햇빛 받기
영양 주기
상태 확인
수확하기
localStorage 저장
초기화
```

모바일 정원 카드와 식물 상세에서 성장 단계가 표시되도록 개선했다.

깨진 localStorage 문자열이 남아 있어도
식물 이름/메시지를 보정하는 로직도 추가됐다.

build 성공 기록이 있었으나,
같은 Wi-Fi 모바일에서 접속 문제가 발생했다.

2026-09-19 사용자는 이 기능을 위한 **새 프로젝트 폴더를 만들었고 handoff 후 이동**하려고 했다.

따라서 현재 판단:

```text
가상 홈가드닝 = kFarmAI core가 아니라 분리 예정 실험
```

kFarmAI 운영 코드에 자동 재통합하지 않는다.

---

# 19. 현재 알려진 핵심 파일

운영:

```text
index.html
diagnosis.html
public-data.html
channel.html
post.html
agri-weather.html
market-prices.html
crop-calendar.html
crop-guide.html
```

공공데이터:

```text
static/js/public-data/public-data-sources.js
static/js/public-data/public-data-knowledge.js
static/js/public-data/matching-engine.js
static/js/public-data/diagnosis-report-bridge.js
```

Worker:

```text
worker/src/index.js
worker/wrangler.toml
```

prototype:

```text
prototype/request-market/
docs/green-market-request-mvp/
```

실제 2026-09-19 저장소에는 파일이 추가/삭제됐을 수 있으므로
반드시 `find`/`Get-ChildItem`/Git로 확인한다.

---

# 20. 현재 기술 부채 / 다음 확인 항목

우선순위는 다음이다.

## P0 — 실제 현재 상태 재확인

```text
현재 branch
현재 HEAD
working tree
remote
production 배포 소스
Cloudflare route
실제 운영 index
```

과거 문서의 branch를 현재로 가정하지 않는다.

## P1 — 공공데이터 안정성

- PSIS parser
- NCPMS 성능
- `/api/agri/public-info` timeout
- KMA key/grid
- fallback 구분
- 공식 출처 링크

## P1 — AI 안전성

- `AI 진단` → `AI 참고 진단`
- 특정 농약 추천 여부
- 확정 진단 표현 여부
- 공공자료와 AI 문구 혼합 여부

## P1 — 운영 SEO

- noindex
- canonical
- 404
- duplicate
- sitemap
- internal link
- Search Console validation

## P2 — 구조 정리

- 초록장터 prototype 분리 여부
- 가상 홈가드닝 분리 여부
- 과거 handoff 중복 정리
- draft/backup/archive 정리

---

# 21. 대화창 3개 구조

2026-09-19부터 kFarmAI 대화는 다음 3개를 권장한다.

## `00_KFarmAI｜총괄·현황·기획`

담당:

```text
정체성
기준선
로드맵
기능 우선순위
주요 결정
외부 사업/공모전
문서 기준
프로젝트간 경계
```

## `01_KFarmAI｜개발·UI·오류·배포`

담당:

```text
코드
UI/UX
Git
Cloudflare
Worker
Supabase
오류
성능
배포
기술 SEO
모바일 검증
```

## `02_KFarmAI｜공공데이터·AI·콘텐츠·사업화`

담당:

```text
NCPMS/PSIS/KMA/KAMIS/농사로
AI 참고 진단
공식자료
SEO 콘텐츠
농자재 정보
지역정보
광고/제휴
업체등록
B2B
공모전/제안서
```

---

# 22. 새 대화방 사용법

## 00 시작문

```text
이 대화는 00_KFarmAI｜총괄·현황·기획 방이다.
kFarmAI의 전체 기준선, 주요 의사결정, 로드맵과 handoff를 관리한다.
세부 코드 수정은 01, 공공데이터·AI·콘텐츠·사업화는 02로 분리한다.
README.md, AGENTS.md, KFarmAI_HISTORY_HANDOFF_20260919.md를 기준 문서로 사용한다.
```

## 01 시작문

```text
이 대화는 01_KFarmAI｜개발·UI·오류·배포 방이다.
작업 전 AGENTS.md, README.md, KFarmAI_HISTORY_HANDOFF_20260919.md를 읽고
git status -sb, git branch --show-current, git log --oneline -10, git diff --stat, git remote -v를 먼저 확인한다.
기존 사용자 변경을 되돌리지 않고, 이번 작업 범위 파일만 수정한다.
```

## 02 시작문

```text
이 대화는 02_KFarmAI｜공공데이터·AI·콘텐츠·사업화 방이다.
AI 참고 진단과 공공데이터를 구분하고,
농약·병해충·작물정보의 최신성이 중요한 경우 공식 출처를 우선한다.
특정 제품 판매를 우선 노출하지 않고,
검색 콘텐츠·공공정보·커뮤니티·지역정보·사업화 흐름을 다룬다.
```

---

# 23. 새 개발 세션 시작용 통합 프롬프트

```text
kFarmAI 작업을 이어간다.

먼저 다음 파일을 읽어라.
1. AGENTS.md
2. README.md
3. KFarmAI_HISTORY_HANDOFF_20260919.md

그 다음 저장소를 수정하지 말고 아래를 확인해라.
git status -sb
git branch --show-current
git log --oneline -10
git diff --stat
git remote -v

과거 문서의 branch/commit을 현재로 가정하지 마라.
기존 사용자 변경을 임의로 되돌리지 마라.
git add . / git add -A / reset --hard / clean -fd 금지.
.env, API key, secret, 보안 산출물은 절대 add/commit/push하지 마라.

현재 목표는:
[작업 목표]
```

---

# 24. 이 handoff의 최종 판단

현재 kFarmAI의 핵심은 여전히 다음이다.

```text
검색과 질문을 입구로 하고,
AI가 원인 후보를 정리하고,
공공데이터가 확인 기준을 제공하며,
커뮤니티가 해결 경험을 축적하는
농업·식물 문제해결 플랫폼
```

2026년 중간에 여러 실험이 들어왔지만:

```text
초록장터 거래 prototype
가상 식물 키우기 prototype
```

은 core와 분리해서 봐야 한다.

다음 작업자는 새 기능을 더하기 전에
**현재 production 기준선, Git 상태, 운영 파일, API 연동, SEO 색인 상태**를 먼저 확인해야 한다.

이 원칙을 지키면 과거 대화의 서로 다른 설계가 섞여
운영 서비스를 다시 흔드는 문제를 크게 줄일 수 있다.
