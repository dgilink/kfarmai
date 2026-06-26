# kFarmAI 5차 최종 QA 리포트

## 변경/확인 파일 목록
- `contest-demo.html`
- `diagnosis.html`
- `diagnosis-cases.html`
- `public-data.html`
- `channel.html`
- `agri_map.html`
- `ai-safety.html`
- `knowledge-hub.html`
- `related-sites.html`
- `tools-soil.html`
- `tools-fertilizer.html`
- `tools-pesticide.html`
- `data/diagnosis_cases.json`
- `data/public_data_sources.json`
- `data/community_threads.json`
- `demo-script.md`
- `submission-readme.md`
- `sitemap.xml`
- `robots.txt`

## 핵심 URL HTTP 200 확인 결과
- `/`: 200
- `/index.html`: 200
- `/contest-demo.html`: 200
- `/diagnosis.html`: 200
- `/diagnosis-cases.html`: 200
- `/public-data.html`: 200
- `/channel.html`: 200
- `/agri_map.html`: 200
- `/ai-safety.html`: 200
- `/knowledge-hub.html`: 200
- `/related-sites.html`: 200
- `/tools-soil.html`: 200
- `/tools-fertilizer.html`: 200
- `/tools-pesticide.html`: 200

## JSON 파싱 확인 결과
- `data/diagnosis_cases.json`: 6개 사례 파싱 성공
- `data/public_data_sources.json`: 6개 공공데이터 항목 파싱 성공
- `data/community_threads.json`: 12개 데모 질문 파싱 성공
- `data/community_threads.json`: 상세 데모 대상 채널 4개 포함

## 시연 동선 확인 결과
- `contest-demo.html` → `diagnosis.html`: 링크 대상 존재
- `contest-demo.html` → `diagnosis-cases.html`: 링크 대상 존재
- `contest-demo.html` → `public-data.html`: 링크 대상 존재
- `contest-demo.html` → `agri_map.html`: 링크 대상 존재
- `contest-demo.html` → `channel.html`: 링크 대상 존재
- `contest-demo.html` → `knowledge-hub.html`: 링크 대상 존재
- `contest-demo.html` → `ai-safety.html`: 링크 대상 존재

## 문구 통일 확인 결과
- `AI 참고 진단`: 주요 진단/안전/시연 문서에 반영
- `공공데이터 확인`: 진단 결과, 커뮤니티, 공공데이터 페이지에 반영
- `공공자료 기반 데모 사례`: 진단사례 데이터와 카드 라벨에 반영
- `공공데이터 기반 1차 정제 데이터 3,019개`: 제출/시연 핵심 문구에 반영
- `시제품 1차 구축 데이터`: 3,019개 안전 문구에 반영
- `향후 지자체별 추가 공개자료와 업체 직접 등록을 통해 커버리지 확대`: 시연/공공데이터 문구에 반영

## 금지 문구 검색 결과
- 5차 프롬프트에서 지정한 구매 유도, 단정 처방, 검증되지 않은 수치 강조, 전국 전체 수록 오인 표현 전체 검색 결과: 결과 없음

## 보안 키 노출 검색 결과
- 서비스 권한 키, 외부 AI 키, 장문 API 키 패턴 검색 결과: 결과 없음
- 참고: 내부 개발 문서에는 환경 비밀 파일을 커밋하지 말라는 안전 규칙 문구가 존재할 수 있으나, 실제 비밀 파일 내용이나 키 값 노출은 확인되지 않았습니다.

## 모바일 확인 결과
- 주요 신규 페이지는 `max-width: 480px` 모바일 중심 레이아웃으로 구성됨
- CTA는 390px~430px 폭에서 2열 또는 1열로 접히도록 CSS 구성됨
- `contest-demo.html` 첫 화면은 로고, 데모 라벨, 핵심 문장, 보조 문장이 카드 없이 바로 노출됨
- 영상 녹화 가이드는 `submission-readme.md`에 상태바가 포함되지 않도록 명시함
- 현재 환경에 Playwright가 설치되어 있지 않아 자동 스크린샷 기반 픽셀 검증은 수행하지 못함

## sitemap/robots 확인 결과
- `sitemap.xml` 포함 확인:
  - `https://kfarmai.com/contest-demo.html`
  - `https://kfarmai.com/diagnosis-cases.html`
  - `https://kfarmai.com/public-data.html`
  - `https://kfarmai.com/ai-safety.html`
  - `https://kfarmai.com/knowledge-hub.html`
- `robots.txt`가 `https://kfarmai.com/sitemap.xml`을 가리킴

## Git 점검 결과
- `git diff --check`: 공백 오류 없음
- `git diff --stat`: 변경 통계 확인 완료
- `git status`: 기존 미추적 파일이 다수 있어 커밋 시 필요한 파일만 선별 필요

## 남은 위험
- 실제 `diagnosis.html`의 외부 AI 호출은 키와 서버 환경이 필요한 흐름이므로 로컬 HTTP 200과 UI 구조 중심으로 확인함
- `channel.html`은 실제 Supabase 게시글이 있으면 데모 fallback보다 실제 데이터가 우선 표시됨
- 390px~430px 실기기 화면 녹화 전 마지막 육안 확인 필요
- 환경 비밀 파일 관련 문자열은 내부 안전 문서에서 금지 규칙으로 언급되지만, 비밀값 노출은 아님

## 배포 전 확인 방법
1. 로컬 서버 실행: `python -m http.server 5177 --bind 127.0.0.1`
2. `http://127.0.0.1:5177/contest-demo.html`에서 시연 동선 클릭
3. `submission-readme.md`의 녹화 가이드에 따라 상태바 제외 녹화
4. `git status`에서 커밋 대상 파일만 선별
5. `git diff --check` 재실행

## 배포 후 확인 방법
1. `https://kfarmai.com/contest-demo.html` 접속
2. 주요 CTA 링크 7개 확인
3. `https://kfarmai.com/sitemap.xml`에 신규 URL 포함 확인
4. 모바일 브라우저에서 첫 화면, CTA, 카드 폭 확인
5. GA4 실시간 또는 이벤트 수집 여부 확인
