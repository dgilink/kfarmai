# kFarmAI 파일구조 설계

작성일: 2026-07-06

이 문서는 kFarmAI가 농업정보, 영상, 연구동향, 재배가이드, 재배달력, 농업날씨, 농자재, 커뮤니티, 관리자 기능까지 확장될 때 `index.html`이 더 비대해지지 않도록 하기 위한 파일구조 설계 문서다.

이번 문서는 설계 전용이다. 실제 코드 수정, 파일 이동, 기능 리팩터링은 수행하지 않는다.

---

## 1. 현재 구조 요약

### 1.1 루트 HTML 파일

현재 루트에는 모바일 웹 주요 화면과 보조 화면 HTML이 함께 있다.

- 핵심 진입: `index.html`
- 농업정보 상세: `agri-videos.html`, `agri-research.html`
- 농업날씨: `agri-weather.html`
- 재배정보: `crop-guide.html`, `crop-calendar.html`
- 커뮤니티: `channel.html`, `post.html`
- 농자재/도구: `mfg.html`, `seed.html`, `santo.html`, `fert.html`, `cpa.html`, `tools-*.html`
- 기타 정보: `market-prices.html`, `public-data.html`, `subsidy-calendar.html`, `knowledge-hub.html`, `related-sites.html`
- 인증/진단: `auth-callback.html`, `diagnosis.html`, `diagnosis-cases.html`, `ai-safety.html`

확인 결과 `index.html`은 약 331KB로, 홈, 탭 UI, 검색, AI 참고 진단, 마이페이지, 농업정보 일부 렌더링, Supabase 연동 코드가 많이 모여 있다.

### 1.2 data 폴더

현재 `data/` 루트에 기능별 JSON이 섞여 있다.

- 농업정보: `agri-videos.json`, `agri-video-sources.json`, `agri-research-trends.json`
- 작물/재배: `crop-guide-index.json`, `crop-calendar-index.json`, `crops_mvp.json`, `crop_guides.json`, `crop_calendar.json`
- 날씨: `weather-crop-profiles.json`, `weather-regions.json`, `agri_weather.json`
- 농자재: `agri-input-categories.json`, `agri-material-decision-map.json`, `kfarmai-agri-material-flow.json`
- 커뮤니티/검색: `community_threads.json`, `community-question-index.json`, `search_index.json`
- 공공자료/시세/보조사업: `public_data_sources.json`, `public-info-index.json`, `market_prices.json`, `market-price-types.json`, `subsidy_programs.json`, `support-program-index.json`

현재는 파일 수가 아직 감당 가능한 수준이지만, 영상/연구동향/작물/공공데이터가 늘어나면 기능별 하위 폴더가 필요하다.

### 1.3 static 폴더

현재 `static/`에는 공통 정적 파일, 작물 이미지, 기능별 데이터 JS가 섞여 있다.

- 작물 데이터/렌더 보조: `static/crop-pages.js`
- 검색 보조: `static/search-utils.js`, `static/search_db.js`
- 농자재/계산기 데이터: `static/pesticide_data.js`, `static/seed_data.js`, `static/fert_data.js`, `static/santo_data.js`, `static/cpa_data.js`
- 이미지/로고: `static/crops/`, `static/kfarmai-logo-horizontal.png`, `static/logo.*`

`static/css/`, `static/js/` 같은 기능별 코드 폴더는 아직 정리되어 있지 않다.

### 1.4 docs 폴더

현재 `docs/`에는 도메인별 설계 문서가 있다.

- 농업정보 콘텐츠화 설계
- 농업영상 큐레이션 설계
- 재배가이드/재배달력 공공데이터 설계
- 농자재 관리카테고리 설계
- 농업날씨 작물DB 설계
- 회원탈퇴/계정관리 설계
- 이미지 생성 가이드

이번 문서는 이 문서들의 상위 구조 설계 역할을 한다.

### 1.5 worker 폴더

`worker/`에는 Cloudflare Worker 구성이 있다.

- `worker/wrangler.toml`
- `worker/src/index.js`
- `.wrangler/` 로컬 캐시/임시 파일

Worker는 공공데이터, KMA, KAMIS, MAFRA 같은 외부 API 프록시와 fallback 처리의 중심이 되어야 한다.

### 1.6 index.html에 집중된 기능

현재 `index.html`에는 아래 성격의 코드가 함께 있다.

- 홈 탭/스와이프 구조
- 검색 진입과 결과 처리
- 커뮤니티 질문 카드/목록 일부
- AI 참고 진단 호출/결과 처리
- 마이페이지/내가 쓴 글
- 농업정보 탭
- 오늘의 농업 영상 렌더링
- 최신 농업연구동향 렌더링
- 이번 주 농업 이슈 카드
- `data/agri-videos.json`, `data/agri-research-trends.json` fetch

농업정보 탭은 이미 `agri-videos.html`, `agri-research.html` 상세 페이지가 있지만, 홈 탭 렌더링 로직은 여전히 `index.html` 내부에 있다.

---

## 2. 현재 문제점

1. `index.html` 비대화 가능성이 크다.
   - 홈, 커뮤니티, AI 참고 진단, 마이페이지, 농업정보 코드가 한 파일에 누적되어 있다.

2. 농업정보 탭 코드가 계속 늘어날 가능성이 크다.
   - 영상, 연구동향, 이슈, 공공자료, 더보기 화면이 모두 확장 대상이다.

3. 영상/연구동향/이슈 데이터가 늘어나면 `data/` 루트가 복잡해진다.
   - 현재 `data/agri-videos.json`, `data/agri-research-trends.json`처럼 루트에 있다.

4. CSS와 JS가 HTML 내부에 섞이면 유지보수가 어려워진다.
   - 모바일 스크롤, 스와이프, sticky header, 카드 UI처럼 민감한 스타일이 많다.

5. 공공데이터/공식자료 연동 상태를 추적하기 어렵다.
   - API 상태, 출처, active/pending/hidden 상태를 기능별로 분리할 필요가 있다.

6. 커뮤니티와 게시글 수정 기능은 안정성이 중요하다.
   - 게시글 상세, 마이페이지, 댓글/답글/비밀댓글이 같은 데이터를 다루므로 파일 분리 시 회귀 위험이 높다.

7. 관리자 기능이 추가되면 인증/권한/집계 코드가 또 늘어난다.
   - `admin.html`, `admin.js`, `admin.css`를 별도 설계해야 한다.

---

## 3. 추천 최종 폴더 구조

아래 구조는 즉시 이동하라는 뜻이 아니라, 단계별 분리의 목표 구조다.

```text
kfarmai-web/
├─ index.html
├─ agri-videos.html
├─ agri-research.html
├─ agri-weather.html
├─ crop-guide.html
├─ crop-calendar.html
├─ channel.html
├─ post.html
├─ admin.html
│
├─ static/
│  ├─ css/
│  │  ├─ base.css
│  │  ├─ home.css
│  │  ├─ agri-info.css
│  │  ├─ agri-videos.css
│  │  ├─ agri-research.css
│  │  ├─ crop-guide.css
│  │  ├─ crop-calendar.css
│  │  ├─ agri-weather.css
│  │  ├─ community.css
│  │  ├─ mypage.css
│  │  └─ admin.css
│  │
│  ├─ js/
│  │  ├─ app.js
│  │  ├─ supabase-client.js
│  │  ├─ auth.js
│  │  ├─ search.js
│  │  ├─ community.js
│  │  ├─ post-editor.js
│  │  ├─ mypage.js
│  │  ├─ admin.js
│  │  │
│  │  ├─ agri-info/
│  │  │  ├─ agri-info.js
│  │  │  ├─ agri-videos.js
│  │  │  ├─ agri-research-trends.js
│  │  │  ├─ agri-issues.js
│  │  │  └─ agri-info-utils.js
│  │  │
│  │  ├─ crop/
│  │  │  ├─ crop-guide.js
│  │  │  ├─ crop-calendar.js
│  │  │  └─ crop-utils.js
│  │  │
│  │  ├─ weather/
│  │  │  ├─ agri-weather.js
│  │  │  └─ weather-utils.js
│  │  │
│  │  └─ inputs/
│  │     ├─ agri-inputs.js
│  │     └─ agri-input-utils.js
│  │
│  └─ crops/
│
├─ data/
│  ├─ agri-info/
│  │  ├─ agri-videos.json
│  │  ├─ agri-video-sources.json
│  │  ├─ agri-research-trends.json
│  │  ├─ agri-weekly-issues.json
│  │  └─ agri-content-categories.json
│  │
│  ├─ crops/
│  │  ├─ crop-guide-index.json
│  │  ├─ crop-calendar-index.json
│  │  ├─ crop-region-groups.json
│  │  └─ crop-cultivation-types.json
│  │
│  ├─ weather/
│  │  ├─ weather-crop-profiles.json
│  │  └─ weather-regions.json
│  │
│  ├─ inputs/
│  │  └─ agri-input-categories.json
│  │
│  └─ public-data/
│     ├─ data-sources.json
│     └─ api-status.json
│
├─ docs/
│  ├─ kFarmAI_파일구조_설계.md
│  ├─ kFarmAI_농업정보_콘텐츠화_설계.md
│  ├─ kFarmAI_농업영상_큐레이션_설계.md
│  ├─ kFarmAI_재배가이드_재배달력_공공데이터_설계.md
│  └─ kFarmAI_농자재_관리카테고리_설계.md
│
├─ worker/
└─ AGENTS.md
```

---

## 4. 기능별 파일 역할

### 홈

- HTML: `index.html`
- CSS: `static/css/home.css`
- JS: `static/js/app.js`
- 역할:
  - 탭 전환
  - 홈 카드 렌더링
  - 기본 검색 진입
  - 주요 기능 바로가기

### 농업정보 탭

- CSS: `static/css/agri-info.css`
- JS: `static/js/agri-info/agri-info.js`
- DATA: `data/agri-info/*`
- 역할:
  - 오늘의 농업 영상
  - 최신 농업연구동향
  - 이번 주 농업 이슈
  - 재배가이드/농업날씨/공공자료 바로가기 조합

### 오늘의 농업 영상

- HTML 상세: `agri-videos.html`
- CSS: `static/css/agri-videos.css`
- JS: `static/js/agri-info/agri-videos.js`
- DATA: `data/agri-info/agri-videos.json`, `data/agri-info/agri-video-sources.json`
- 역할:
  - active 영상만 표시
  - YouTube iframe은 클릭 후 로드
  - autoplay off 유지
  - 국내 공식/해외 참고 구분
  - 출처, 채널명, 원본 링크 표시

### 최신 농업연구동향

- HTML 상세: `agri-research.html`
- CSS: `static/css/agri-research.css`
- JS: `static/js/agri-info/agri-research-trends.js`
- DATA: `data/agri-info/agri-research-trends.json`
- 역할:
  - active 연구 카드만 표시
  - 홈에서는 제목 중심 compact 목록
  - 상세 화면에서는 클릭 확장형 목록
  - 원문 나열이 아니라 쉬운 제목/요약 중심 재가공

### 이번 주 농업 이슈

- JS: `static/js/agri-info/agri-issues.js`
- DATA: `data/agri-info/agri-weekly-issues.json`
- 역할:
  - 날씨, 재배흐름, 정책, 시세 참고 카드
  - 데이터가 부족하면 compact 준비 중 표시
  - 농업날씨/재배가이드/시세 화면으로 연결

### 재배가이드

- HTML: `crop-guide.html`
- CSS: `static/css/crop-guide.css`
- JS: `static/js/crop/crop-guide.js`
- DATA: `data/crops/crop-guide-index.json`, `static/crop-pages.js`에서 분리 예정
- 역할:
  - 작물별 관리 가이드
  - 지역/재배유형 관리 포인트
  - 생육단계별 관리
  - 공식자료 확인 영역

### 재배달력

- HTML: `crop-calendar.html`
- CSS: `static/css/crop-calendar.css`
- JS: `static/js/crop/crop-calendar.js`
- DATA: `data/crops/crop-calendar-index.json`
- 역할:
  - 이번 달 할 일
  - 다음 달 준비
  - 월별 작업
  - 지역권역/재배유형별 보정

### 농업날씨

- HTML: `agri-weather.html`
- CSS: `static/css/agri-weather.css`
- JS: `static/js/weather/agri-weather.js`
- DATA: `data/weather/weather-crop-profiles.json`, `data/weather/weather-regions.json`
- 역할:
  - 권역/지역/재배유형/작물 선택
  - 해당지역 기상 항목
  - 오늘 날씨요약
  - 작물별 체크포인트
  - 농작업 참고카드

### 농자재·관리

- HTML: `mfg.html`, `seed.html`, `santo.html`, `fert.html`, `cpa.html`
- CSS: `static/css/agri-inputs.css` 또는 기능별 CSS
- JS: `static/js/inputs/agri-inputs.js`
- DATA: `data/inputs/agri-input-categories.json`
- 역할:
  - 농자재 종류 확인
  - 제조사 공식정보 확인
  - 지역 판매점 확인
  - 작물보호제 안전사용기준 확인 안내

### 검색

- JS: `static/js/search.js`
- DATA: `data/search_index.json`, 향후 기능별 인덱스
- 역할:
  - 질문글, 증상, 작물, 재배가이드, 재배달력, 농업날씨, 농자재 정보 검색
  - 결과 유형 배지 표시
  - 전체 화면 view 또는 별도 목록 화면으로 이동

### 커뮤니티

- HTML: `channel.html`
- CSS: `static/css/community.css`
- JS: `static/js/community.js`
- 역할:
  - 채널 목록
  - 질문 목록
  - 댓글 수 표시
  - 답글/비밀댓글 데이터 조회와 연동

### 게시글 상세/수정

- HTML: `post.html`
- CSS: `static/css/community.css`
- JS: `static/js/post-editor.js`
- 역할:
  - 게시글 상세
  - 본인 글 수정/삭제
  - 사진 추가/유지/제거
  - 댓글/답글/비밀댓글 표시

### 마이페이지

- CSS: `static/css/mypage.css`
- JS: `static/js/mypage.js`
- 역할:
  - 닉네임 인라인 수정
  - 내가 쓴 글 목록
  - 내 진단 기록
  - 계정 관리

### 관리자 페이지

- HTML: `admin.html`
- CSS: `static/css/admin.css`
- JS: `static/js/admin.js`
- 역할:
  - 관리자 권한 확인
  - 가입자/게시글/댓글/AI 진단 기록 집계
  - 최근 게시글/댓글 모니터링
  - 일반 사용자 접근 제한

---

## 5. 농업정보 탭 1차 분리 상세안

농업정보 탭은 1차 분리 대상으로 적합하다. 이유는 홈 전체 로직과 비교적 느슨하게 연결되어 있고, 영상/연구동향/이슈 데이터가 계속 늘어날 가능성이 높기 때문이다.

### 5.1 추천 파일

- `static/js/agri-info/agri-info.js`
- `static/js/agri-info/agri-videos.js`
- `static/js/agri-info/agri-research-trends.js`
- `static/js/agri-info/agri-issues.js`
- `static/js/agri-info/agri-info-utils.js`
- `static/css/agri-info.css`
- `data/agri-info/agri-videos.json`
- `data/agri-info/agri-video-sources.json`
- `data/agri-info/agri-research-trends.json`
- `data/agri-info/agri-weekly-issues.json`

### 5.2 파일별 역할

#### `agri-info.js`

- 농업정보 탭 전체 초기화
- 영상/연구동향/이슈 모듈 호출
- 더보기 링크 연결
- 탭 진입 시 lazy init 처리

#### `agri-videos.js`

- `agri-videos.json` 로드
- active 영상 필터
- 대표 영상 카드 렌더링
- 가로 영상 목록 렌더링
- 클릭 후 YouTube iframe 로드
- 스와이프와 세로 스크롤 충돌 최소화

#### `agri-research-trends.js`

- `agri-research-trends.json` 로드
- active 연구동향 필터
- 홈 compact 목록 렌더링
- 상세 목록 렌더링
- 항목 클릭 시 확장 카드 표시

#### `agri-issues.js`

- 주간 농업 이슈 카드 렌더링
- 농업날씨/재배가이드/시세 링크 연결
- 데이터가 없을 때 compact fallback 표시

#### `agri-info-utils.js`

- HTML escape
- 날짜 표시
- 배지 생성
- active/pending/hidden 필터
- YouTube thumbnail/embed URL 생성

#### `agri-info.css`

- 농업정보 탭 공통 섹션
- 영상 카드/썸네일/재생 버튼
- 연구동향 compact 카드
- 카테고리 칩
- 모바일 가로 스크롤

### 5.3 fetch 경로 변경 후보

실제 이동 전에는 아래 경로 변경 목록을 먼저 점검해야 한다.

```text
data/agri-videos.json
→ data/agri-info/agri-videos.json

data/agri-video-sources.json
→ data/agri-info/agri-video-sources.json

data/agri-research-trends.json
→ data/agri-info/agri-research-trends.json

data/agri-weekly-issues.json
→ data/agri-info/agri-weekly-issues.json
```

---

## 6. 단계별 분리 우선순위

### 1단계: 농업정보 탭 JS/CSS/DATA 분리

- 목적: `index.html`에서 영상/연구동향/이슈 코드를 먼저 제거한다.
- 이동/생성할 파일:
  - `static/js/agri-info/*`
  - `static/css/agri-info.css`
  - `data/agri-info/*`
- 수정해야 할 참조 경로:
  - `index.html` script/link
  - `agri-videos.html` fetch 경로
  - `agri-research.html` fetch 경로
- 위험도: 중간
- 테스트 항목:
  - 농업정보 탭 표시
  - 영상 클릭 전 iframe 미로드
  - 영상 클릭 후 재생
  - 연구동향 compact 목록
  - 연구 더보기 화면

### 2단계: `agri-videos.html`, `agri-research.html` 전용 JS/CSS 분리

- 목적: 상세 페이지 내부 script/style을 줄인다.
- 이동/생성할 파일:
  - `static/js/agri-info/agri-videos-page.js`
  - `static/js/agri-info/agri-research-page.js`
  - `static/css/agri-videos.css`
  - `static/css/agri-research.css`
- 수정해야 할 참조 경로:
  - 각 HTML의 inline script/style 제거 후 외부 파일 연결
- 위험도: 낮음~중간
- 테스트 항목:
  - 영상 전체 목록
  - 연구 전체 목록
  - 연구 항목 클릭 확장
  - 모바일 뒤로가기

### 3단계: 재배가이드/재배달력 데이터와 JS 분리

- 목적: `static/crop-pages.js`에 집중된 작물 데이터/렌더링 로직을 기능별로 나눈다.
- 이동/생성할 파일:
  - `static/js/crop/crop-guide.js`
  - `static/js/crop/crop-calendar.js`
  - `static/js/crop/crop-utils.js`
  - `data/crops/crop-guide-index.json`
  - `data/crops/crop-calendar-index.json`
  - `data/crops/crop-region-groups.json`
  - `data/crops/crop-cultivation-types.json`
- 수정해야 할 참조 경로:
  - `crop-guide.html`
  - `crop-calendar.html`
  - `index.html`의 작물 관련 링크/검색
- 위험도: 높음
- 테스트 항목:
  - 23개 대표 작물 표시
  - 대표 이미지 표시
  - 지역/재배유형 선택
  - 이번 달 할 일
  - 공공자료 확인 영역

### 4단계: 농업날씨 JS/CSS/DATA 분리

- 목적: 농업날씨 화면의 API/fallback/UI 로직을 분리한다.
- 이동/생성할 파일:
  - `static/js/weather/agri-weather.js`
  - `static/js/weather/weather-utils.js`
  - `static/css/agri-weather.css`
  - `data/weather/weather-crop-profiles.json`
  - `data/weather/weather-regions.json`
- 수정해야 할 참조 경로:
  - `agri-weather.html`
  - 농업정보 이슈 카드의 농업날씨 링크
- 위험도: 중간
- 테스트 항목:
  - 권역/지역/재배유형/작물 선택
  - 해당지역 기상 항목
  - KMA API fallback
  - 공식정보 확인 위치

### 5단계: 농자재·관리 데이터와 JS 분리

- 목적: 농자재 화면을 판매가 아닌 관리정보 허브로 유지하면서 구조화한다.
- 이동/생성할 파일:
  - `static/js/inputs/agri-inputs.js`
  - `static/js/inputs/agri-input-utils.js`
  - `static/css/agri-inputs.css`
  - `data/inputs/agri-input-categories.json`
- 수정해야 할 참조 경로:
  - `mfg.html`
  - `seed.html`, `santo.html`, `fert.html`, `cpa.html`
- 위험도: 중간
- 테스트 항목:
  - 상토/종자/비료/작물보호 카테고리
  - 구매 유도 문구 없음
  - 제조사 공식정보/지역 판매점 구분

### 6단계: 커뮤니티/게시글/마이페이지 JS 분리

- 목적: 핵심 쓰기/수정/삭제 기능을 모듈화한다.
- 이동/생성할 파일:
  - `static/js/community.js`
  - `static/js/post-editor.js`
  - `static/js/mypage.js`
  - `static/css/community.css`
  - `static/css/mypage.css`
- 수정해야 할 참조 경로:
  - `index.html`
  - `channel.html`
  - `post.html`
- 위험도: 높음
- 테스트 항목:
  - 질문 작성
  - 내가 쓴 글 수정
  - 게시글 상세 수정/삭제
  - 사진 유지/추가/삭제
  - 댓글/답글/비밀댓글 수정/삭제
  - 댓글 수

### 7단계: 관리자 페이지 구현 시 분리

- 목적: 운영자 기능을 일반 사용자 기능과 분리한다.
- 이동/생성할 파일:
  - `admin.html`
  - `static/js/admin.js`
  - `static/css/admin.css`
- 수정해야 할 참조 경로:
  - 관리자 진입 링크
  - Supabase profiles/users role 조회
- 위험도: 중간~높음
- 테스트 항목:
  - 관리자 접근 가능
  - 일반 사용자 접근 제한
  - 가입자/게시글/댓글/진단 기록 집계
  - service_role 프론트 노출 없음

---

## 7. 데이터 이동 원칙

1. 실제 이동은 이 문서 작업에서 하지 않는다.
2. 이동 전 반드시 fetch 경로 변경 목록을 만든다.
3. 이동은 기능별 1단계씩만 진행한다.
4. `active`, `pending`, `hidden` 상태 구조를 유지한다.
5. 영상/연구동향은 사람 검수 후 `active`로 전환한다.
6. 정확하지 않은 URL은 넣지 않는다.
7. 가짜 공식자료 링크를 만들지 않는다.
8. API key, secret, token은 `data/`에 저장하지 않는다.
9. `.env.local`, Wrangler secret, Supabase Dashboard secret만 사용한다.
10. 공공데이터 원문은 그대로 나열하지 않고 사용자 문제 해결 흐름으로 재가공한다.

---

## 8. CSS 분리 원칙

### 8.1 base.css

`static/css/base.css`에는 앱 전체 공통 규칙만 둔다.

- 색상 변수
- 공통 카드
- 공통 버튼
- 공통 입력 요소
- sticky header 기본값
- 한글 줄바꿈
- safe-area
- 공통 접근성 보조 클래스

기본 원칙:

```css
body {
  word-break: keep-all;
  overflow-wrap: break-word;
  line-break: strict;
}

button,
.chip,
.badge {
  white-space: nowrap;
}

a,
.url,
.source-link {
  overflow-wrap: anywhere;
}
```

### 8.2 기능별 CSS

기능별 CSS는 해당 화면/모듈에서만 쓰는 클래스를 둔다.

- `agri-info-*`
- `agri-video-*`
- `agri-research-*`
- `crop-guide-*`
- `crop-calendar-*`
- `weather-*`
- `community-*`
- `mypage-*`
- `admin-*`

### 8.3 전역 스타일 제한

- `div`, `button`, `section` 같은 태그 전역 스타일 남발 금지
- 기존 화면에 영향 줄 수 있는 `body overflow`, `position: fixed`, `height: 100vh`는 신중히 사용
- 모바일 우선
- 가로 스크롤 방지
- 이유 없는 큰 빈공간 금지

---

## 9. JS 전역 함수/namespace 원칙

현재 프로젝트가 번들러 기반 모듈 구조가 아니므로, 1차 분리는 `window` namespace 방식이 현실적이다.

추천 namespace:

- `window.KFAgriInfo`
- `window.KFAgriVideos`
- `window.KFAgriResearch`
- `window.KFAgriIssues`
- `window.KFCommunity`
- `window.KFPostEditor`
- `window.KFMyPage`
- `window.KFAdmin`

예시:

```js
window.KFAgriVideos = {
  async loadVideos() {},
  renderHero(container, videos) {},
  renderStrip(container, videos) {},
  play(videoId, target) {}
};
```

### 9.1 script 로드 순서 예시

```html
<link rel="stylesheet" href="/static/css/base.css">
<link rel="stylesheet" href="/static/css/home.css">
<link rel="stylesheet" href="/static/css/agri-info.css">

<script src="/static/js/supabase-client.js"></script>
<script src="/static/js/auth.js"></script>
<script src="/static/js/search.js"></script>

<script src="/static/js/agri-info/agri-info-utils.js"></script>
<script src="/static/js/agri-info/agri-videos.js"></script>
<script src="/static/js/agri-info/agri-research-trends.js"></script>
<script src="/static/js/agri-info/agri-issues.js"></script>
<script src="/static/js/agri-info/agri-info.js"></script>

<script src="/static/js/app.js"></script>
```

### 9.2 inline onclick 줄이기

신규 분리 파일에서는 가능하면 이벤트 위임 또는 `addEventListener`를 사용한다.

다만 기존 inline onclick을 한 번에 제거하면 회귀 위험이 있으므로, 1단계에서는 기존 동작을 유지하면서 namespace 함수만 안정적으로 노출한다.

---

## 10. 실제 리팩터링 전 체크리스트

- [ ] `git status -sb` 확인
- [ ] 작업과 무관한 변경 파일 확인
- [ ] secret 후보 txt 파일이 커밋 대상에 없는지 확인
- [ ] `git add .` 사용 금지
- [ ] 현재 기능을 브라우저에서 먼저 확인
- [ ] 이동할 파일과 변경할 fetch 경로 목록 작성
- [ ] 한 번에 한 기능만 분리
- [ ] HTML script/link 로드 순서 확인
- [ ] JSON fetch 경로 확인
- [ ] `node --check` 가능한 JS 파일 확인
- [ ] `git diff --check` 확인
- [ ] 모바일 수동 확인
- [ ] 홈/질문/댓글/AI진단/MY 회귀 확인

---

## 11. AGENTS.md에 추가하면 좋은 원칙

이 문서는 제안만 한다. AGENTS.md는 직접 수정하지 않는다.

추가 제안:

1. `index.html`에 신규 대형 기능을 계속 추가하지 않는다.
2. 신규 기능은 가능한 한 `static/js/{feature}/`, `static/css/{feature}.css`, `data/{feature}/` 구조로 설계 후 구현한다.
3. 공공데이터는 원문 나열이 아니라 작물, 지역, 재배유형, 시기, 사용자 증상 기준으로 재가공한다.
4. 영상/연구동향은 `active/pending/hidden` 상태를 유지하고, 검수 전 자료는 화면에 노출하지 않는다.
5. 코드 이동 작업은 한 번에 한 기능만 진행하고, 이동 전후 fetch 경로와 모바일 화면을 확인한다.
6. secret 후보 파일은 내용 열람 없이 저장소 밖으로 분리하거나 `.gitignore`에 등록한다.

---

## 12. 다음 Codex 작업 지시어 초안

### 12.1 농업정보 탭 1단계 파일 분리 지시어

```text
C:\Users\user\PERSONAL\dev\kfarmai-web 폴더에서 작업한다.

먼저 AGENTS.md와 docs/kFarmAI_파일구조_설계.md를 읽는다.

이번 작업은 농업정보 탭 1단계 분리만 한다.
index.html 안의 오늘의 농업 영상, 최신 농업연구동향, 이번 주 농업 이슈 관련 JS/CSS를 별도 파일로 분리한다.

수정 범위:
- index.html
- static/js/agri-info/agri-info-utils.js
- static/js/agri-info/agri-videos.js
- static/js/agri-info/agri-research-trends.js
- static/js/agri-info/agri-issues.js
- static/js/agri-info/agri-info.js
- static/css/agri-info.css

이번 작업에서는 data 파일 이동은 하지 않는다.
fetch 경로는 기존 data/agri-videos.json, data/agri-research-trends.json을 유지한다.

주의:
- 홈/질문/댓글/AI진단/MY 기능 깨지지 않게 한다.
- 영상은 클릭 전 iframe을 로드하지 않는다.
- autoplay는 끈다.
- pending/hidden 데이터는 화면에 표시하지 않는다.
- git add, commit, push 하지 않는다.

완료 후 수정 파일, 분리한 함수, 테스트 결과, git diff --stat, 추천 커밋 메시지를 보고한다.
```

### 12.2 secret 후보 txt 파일 .gitignore 처리 지시어

```text
C:\Users\user\PERSONAL\dev\kfarmai-web 폴더에서 작업한다.

먼저 AGENTS.md를 읽는다.

이번 작업은 secret/API 메모 후보 파일을 Git 커밋 위험에서 분리하는 작업이다.
파일 내용은 절대 열람하거나 출력하지 않는다.
코드 수정, 기능 수정은 하지 않는다.

대상 파일:
- resend api key.txt
- 농진청, 공공데이터, 경매, 농사로등 api.txt
- 농촌진흥청_농약안전사용지침  공공데이터포털.txt

작업:
1. C:\Users\user\PERSONAL\secrets\kfarmai 폴더가 없으면 만든다.
2. 대상 파일이 프로젝트 루트에 있으면 해당 폴더로 이동한다.
3. .gitignore에 로컬 secret/API 메모 파일 패턴을 추가한다.
4. git status --short로 대상 파일이 더 이상 untracked에 없는지 확인한다.

주의:
- 파일 내용 열람 금지.
- git add, commit, push 금지.
- git add . 금지.

완료 후 이동한 파일명, 이동 대상 폴더, .gitignore 추가 내용, git status --short 결과, 파일 내용 미열람 확인을 보고한다.
```

