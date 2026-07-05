# kFarmAI 재배가이드·재배달력 공공데이터 설계

이 문서는 재배가이드, 재배달력, 농업날씨, 시세, 병해충·농약안전 공식확인 동선을 연결하기 위한 공공데이터/API 구조를 정리한다. 모든 화면 표현은 참고자료 성격을 유지하며, 확정 판단이나 처방처럼 보이는 문구를 사용하지 않는다.

## 기본 원칙

- 재배가이드와 재배달력은 공공데이터와 내부 정리 데이터를 함께 사용하는 참고자료다.
- 공식자료 URL이 확인되지 않은 항목에는 가짜 링크를 넣지 않는다.
- 병해충 정보는 “자주 확인할 문제”와 “공식정보 확인” 수준으로만 표시한다.
- 작물보호제 관련 문구는 농약안전정보시스템과 제품 라벨의 등록정보·안전사용기준 확인으로 제한한다.
- KAMIS 시세는 시장 흐름 참고자료로만 표시하고 판매·구매 판단을 유도하지 않는다.
- 호출 실패 또는 fallback 상태인 API는 성공 연동처럼 표현하지 않는다.

## 현재 데이터 구조

- `static/crop-pages.js`: 23개 core 작물의 상세 데이터, 지역권역, 재배유형, 월별 달력, 공공데이터 연결, 대표 이미지 연결
- `data/crop-guide-index.json`: 재배가이드 검색/색인용 내부 데이터
- `data/crop-calendar-index.json`: 재배달력 검색/색인용 내부 데이터
- `data/weather-crop-profiles.json`: 작물·반려식물별 농업날씨/관리 체크포인트
- `data/weather-regions.json`: 기상청 단기예보 격자 좌표
- `data/agri-input-categories.json`: 농자재·관리 카테고리 참고 정보

## API 진단표

| 데이터명 | endpoint/파일 | key 존재 | 호출 성공 | 응답 데이터 | 활용 가능 화면 | 비고 |
|---|---|---|---|---|---|---|
| Worker health | `/api/health` | 불필요 | 성공 | `ok`, `service` | API 상태 진단 | 배포 Worker 정상 |
| KMA 단기예보 | `/api/weather/forecast` | 배포 Worker secret 존재로 추정 | 성공 | 지역, baseDate/baseTime, 예보 items | 농업날씨, 재배가이드, 재배달력 | 서울 nx/ny 샘플 `fallback:false` |
| KAMIS/aT 시세 | `/api/kamis/prices` | 배포 Worker secret 존재로 추정 | 성공 | 품목별 시세 items | 농산물 시세, 작물 페이지 시세 참고 | 토마토 샘플 `fallback:false` |
| KAMIS 가격 요약 | `/api/kamis/price-summary` | 배포 Worker secret 존재로 추정 | 성공 | 소매/도매 등 요약 items | 농산물 시세 참고 | 토마토 샘플 `fallback:false` |
| NCPMS 병해충 정보 | `/api/ncpms/diseases` | 배포 Worker secret 존재로 추정 | 성공 | 작물명, 병해충명, 증상, 공식 URL | 자주 확인할 문제, 공공정보 확인 | 고추 샘플 `fallback:false` |
| 농사로 작목별 정보 | `/api/nongsaro/service` | 배포 Worker secret 존재로 추정 | 성공 | 작목별 참고자료 items | 재배가이드 공식자료 후보 | `cropEbook/mainCategoryList` 샘플 성공 |
| 공공정보 통합 | `/api/agri/public-info` | 일부 secret 존재로 추정 | 성공 | NCPMS, 농사로, PSIS 등 sections | AI 참고 진단 후 공공정보 확인 | 고추 샘플 `fallback:false` |
| PSIS 농약안전 | `/api/psis/pesticide-safety` | endpoint 있음 | fallback | 안전사용기준 확인 fallback item | 작물보호제 공식확인 동선 | 운영 key 또는 파라미터 검증 필요 |
| MAFRA 시설채소 | `/api/mafra/facility-vegetables` | endpoint 있음 | fallback | fallback notice | 시설채소 참고 예정 | service key 또는 데이터 파라미터 검증 필요 |
| MAFRA 화훼 시세 | `/api/mafra/flower-prices` | endpoint 있음 | fallback | fallback notice | 화훼 basic 작물 확장 후보 | service key 또는 데이터 파라미터 검증 필요 |
| aT 경매정보 | `/api/auction/prices` | endpoint 있음 | fallback | fallback item | 시세 확장 후보 | 공식 엔드포인트 검증 전 fallback 유지 |
| 실내식물 참고 | `data/weather-crop-profiles.json` | 불필요 | 내부 데이터 사용 | 광량, 물주기, 계절별 관리, 과습/통풍 체크 | 반려식물/홈가드닝 basic 작물 | API가 아니라 내부 정리 데이터 |
| 농자재 카테고리 | `data/agri-input-categories.json` | 불필요 | 내부 데이터 사용 | 상토, 종자, 비료, 작물보호, 관수, 스마트팜 | 농자재 정보, 검색 | 구매 유도 없이 공식정보 확인 중심 |

## 재배가이드 반영

- 23개 core 작물은 요약, 재배유형, 재배시기, 생육단계, 관리 포인트, 자주 확인할 문제, 농업날씨 체크포인트, 관련 농자재 종류를 제공한다.
- KMA 농업날씨, NCPMS 병해충 정보, 농사로 작목별 참고자료, 공공정보 통합 endpoint를 공공데이터 참고 항목으로 연결한다.
- PSIS 농약안전 endpoint는 현재 fallback 상태이므로 `농약안전사용기준 확인` 동선으로만 표시한다.
- MAFRA 시설채소는 fallback 상태라 시설재배 작물에서 연동 예정 참고자료로만 표시한다.

## 재배달력 반영

- 23개 core 작물은 1월~12월 전체 월별 달력 구조를 갖는다.
- 현재 월 기준 “이번 달 할 일”과 “다음 달 준비”를 월별 달력 데이터에서 계산한다.
- 지역권역과 재배유형 선택에 따라 선택 기준, 지역 관리 포인트, 재배유형별 참고 문구를 표시한다.
- 농업날씨 체크포인트와 농업날씨 페이지 이동 동선을 유지한다.

## 지역권역·재배유형

지역권역은 발표용 시제품 기준으로 다음 그룹을 사용한다.

- 전국 공통
- 수도권·중부
- 강원·고랭지
- 충청권
- 전북·전남
- 경북·경남
- 제주·도서

재배유형은 작물별로 필요한 항목만 표시한다.

- 노지·텃밭
- 시설재배
- 과수원
- 스마트팜

## 병해충·농약안전 공식확인 동선

- NCPMS는 실제 응답이 확인되어 “병해충 정보 확인”으로 연결한다.
- PSIS는 fallback 상태이므로 “농약안전사용기준 확인” 동선을 제공하되, 성공 연동으로 표현하지 않는다.
- 작물보호제 사용 전에는 농약안전정보시스템과 제품 라벨의 등록정보·안전사용기준을 확인해야 한다는 안내만 표시한다.

## 반려식물·실내식물 연결

- 몬스테라, 스투키, 산세베리아, 고무나무, 다육식물, 허브류 등 basic 작물은 `weather-crop-profiles.json` 기반의 내부 참고 데이터를 사용한다.
- 광량, 물주기, 계절별 관리, 겨울 최저온도, 과습·통풍 체크를 반려식물 관리 참고로 연결한다.
- 재배가이드와 재배달력 basic 상세에서도 공공데이터 참고 블록을 표시한다.

## 검색 연동

홈 검색의 동적 작물 검색 인덱스에 다음 키워드를 추가 반영한다.

- 공공데이터, 공공정보
- NCPMS, 농사로
- 농약안전사용기준, 안전사용기준
- KAMIS, 농산물 시세
- 농자재 정보, 상토, 종자, 비료, 관수, 토양검정
- 실내식물 물주기

## 추가로 필요한 API/secret 설정

- PSIS 농약안전사용기준 정상 호출용 key 또는 파라미터 검증
- MAFRA 시설채소 생산실적 정상 호출 구조 검증
- MAFRA 화훼류 시세현황 정상 호출 구조 검증
- 농촌진흥청 농작업일정 정보 API 신청 또는 Worker endpoint 추가
- 농촌진흥청 주간농사정보 API 신청 또는 Worker endpoint 추가
- 농업기상 기본 관측데이터 endpoint 검토
- 실내정원용 식물 공식 API 신청 또는 내부 데이터 출처 검증
