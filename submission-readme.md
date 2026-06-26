# kFarmAI 제출 패키지 안내

## 서비스명
- kFarmAI

## 출품명
- kFarmAI: 공공데이터 기반 AI 농업·식물 문제해결 및 지역 커뮤니티 플랫폼

## 핵심 메시지
- kFarmAI는 농업·식물 문제를 AI가 진단하고, 공공데이터가 검증하며, 커뮤니티가 해결 경험을 축적하는 실제 작동형 MVP 플랫폼이다.

## 서비스 URL
- https://kfarmai.com/

## 심사용 데모 URL
- https://kfarmai.com/contest-demo.html

## 주요 페이지 URL
- 홈/커뮤니티: https://kfarmai.com/
- AI 진단: https://kfarmai.com/diagnosis.html
- 공공자료 기반 진단사례: https://kfarmai.com/diagnosis-cases.html
- 공공데이터 검증 레이어: https://kfarmai.com/public-data.html
- 커뮤니티 채널: https://kfarmai.com/channel.html
- 농약사 지도: https://kfarmai.com/agri_map.html
- AI 진단 안전 원칙: https://kfarmai.com/ai-safety.html
- 농업·식물 지식 허브: https://kfarmai.com/knowledge-hub.html
- 농업 관련 사이트: https://kfarmai.com/related-sites.html

## 제출 파일 목록
- `contest-demo.html`
- `ai-safety.html`
- `knowledge-hub.html`
- `diagnosis.html`
- `diagnosis-cases.html`
- `public-data.html`
- `channel.html`
- `agri_map.html`
- `data/diagnosis_cases.json`
- `data/public_data_sources.json`
- `data/community_threads.json`
- `demo-script.md`
- `submission-readme.md`

## 시연 영상 파일명 추천
- `kfarmai_contest_demo_90sec.mp4`

## 발표자료 파일명 추천
- `kfarmai_contest_presentation_v1.pdf`

## 사업계획서 파일명 추천
- `kfarmai_business_plan_v1.pdf`

## 녹화 가이드
- 모바일 폭 390px~430px 기준으로 `contest-demo.html`에서 시작합니다.
- 브라우저 개발자도구 모바일 뷰 또는 실기기 화면 녹화를 사용합니다.
- 영상 화면에 KT, 시간, 와이파이, 배터리 등 기기 상태바가 포함되지 않도록 브라우저 영역만 녹화합니다.
- 추천 순서는 `contest-demo.html` → `diagnosis.html` → `diagnosis-cases.html` → `public-data.html` → `agri_map.html` → `channel.html` → `ai-safety.html`입니다.

## 공공데이터 활용 요약
- 전국농약및비료판매업체표준데이터: 공공데이터 기반 1차 정제 데이터 3,019개 지도화
- 농약안전사용지침: 농약 사용 전 등록 작물·병해충 여부와 안전사용기준 확인 유도
- 작목별 병해충 정보 / 병해충 발생정보: 공공자료 기반 진단사례 6개 구성
- 기상청 단기예보 조회서비스: 병해충 발생환경과 작업환경 참고 정보로 고도화 예정
- 지자체 농업 보조사업·농업뉴스: 지역 지원사업과 농업뉴스 연결
- 농업 관련 공공기관 정보: 신뢰 가능한 정보 확인 경로 제공

## 현재 구현
- 모바일 웹 MVP 운영
- AI 진단 독립 페이지
- 공공자료 기반 진단사례 6개
- 공공데이터 검증 레이어
- Kakao Maps 기반 농약사 지도/로드뷰
- 공공데이터 기반 1차 정제 데이터 3,019개 지도화
- 커뮤니티 채널과 데모 fallback 질문
- q/ 질문형 콘텐츠 100개
- kb/ 농업 지식 콘텐츠 56개
- 상토·액비·농약 계산기
- GA4 분석 환경과 sitemap 제출 구조

## 고도화 예정
- 실제 진단 사례의 동의 기반 축적과 비식별화
- 사진 EXIF/GPS 메타데이터 제거 자동화
- 농약안전사용지침과 병해충 발생정보의 더 깊은 연결
- 기상청 단기예보 기반 병해충 위험 참고 정보
- 공공기관·농업단체 PoC

## 제한 기능 없음
- 농약 직접 구매 기능 없음
- 시세 비교 기능 없음
- 담기형 구매 흐름 없음
- 온라인 대금 처리 기능 없음
- 통화 주문 유도 없음
- 특정 농약 단정 처방 없음
