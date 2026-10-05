# V3 Phase 3B 농업정보 UI 감사 및 분류

## 분류 기준

- `KEEP`: 실제 상세 확인에 필요하고 현재 목적이 명확함
- `MERGE`: `/api/agri-feed` 첫 화면에서 요약한 뒤 상세 화면으로 연결
- `SIMPLIFY`: 핵심 정보와 공식 확인 경로만 남김
- `HIDE`: 첫 화면 핵심영역에서 제외하되 직접 URL은 유지
- `REMOVE-LATER`: 다음 Archive 단계에서 사용량·갱신 책임을 확인한 뒤 제거 검토

## 현재 공개 UI

| 화면/기능 | 분류 | Phase 3B 처리 |
|---|---|---|
| 홈 농업정보 영역 | `SIMPLIFY` | 기준일·출처가 있는 요약 4개와 더보기만 표시 |
| 농업정보 탭 | `MERGE` | 영상·연구·링크·농자재·계산기 나열을 제거하고 feed 요약과 5개 분야 진입만 유지 |
| `agri-info.html` | `KEEP` | V3 농업정보 첫 화면으로 신규 구성, `/api/agri-feed` 기본 사용 |
| `agri-weather.html` | `KEEP` | 지역 선택과 작물별 날씨 확인용 상세 화면으로 유지 |
| `market-prices.html` | `KEEP` | 품목별 KAMIS 시세와 저장자료 기준일 확인용 상세 화면으로 유지 |
| `public-data.html` | `KEEP` | NCPMS·PSIS·농약안전 등 상세 확인 경로로 유지 |
| `crop-guide.html` / `crop-calendar.html` | `MERGE` | 첫 화면의 재배·기술 영역에서 상세 화면으로 연결 |
| `subsidy-calendar.html` | `KEEP` | 지원·공고 공식 확인 경로로 유지 |
| `agri-news.html` | `SIMPLIFY` | 지원·공고 영역의 보조 링크로 이동, 발행일이 있는 자료만 표시 |
| `agri-research.html` | `HIDE` | 첫 화면 핵심영역에서 제외하고 재배·기술 보조자료로 직접 URL 유지 |
| `agri-videos.html` | `HIDE` | 게시일 미확인 자료가 많아 첫 화면에서 제외하고 직접 URL 유지 |
| 기존 농업링크·지도·계산기 묶음 | `HIDE` | 농업정보 첫 화면에서 제거, 각 기존 URL과 검색 진입은 유지 |
| 오래된 영상·연구·이슈 정적 데이터 | `REMOVE-LATER` | 삭제하지 않음. 갱신 책임과 이용 여부 확인 후 Archive 검토 |

## V3 IA

1. 오늘 확인할 정보
2. 날씨·재해
3. 병해충·농약안전
4. 농산물 시세
5. 재배·기술
6. 지원·공고

스마트팜과 육상 아쿠아팜은 이번 화면에서 독립 대형 메뉴로 확장하지 않는다. 향후 검증된 재배·기술 자료가 생기면 해당 영역에서 연결한다.

## 표시 계약

- `LIVE` → `최신 자료`
- `STALE` → `최신 갱신 지연`
- `FALLBACK` → `이전 기준 자료`
- `UNAVAILABLE` → `현재 자료 확인 불가`

영어 enum, 내부 error code, provider exception은 사용자 화면에 노출하지 않는다. 모든 데이터 카드에는 자료 기준, 출처, 마지막 확인을 표시한다. 기준일을 확인할 수 없는 경우 `확인 필요`로 표시하며 임의 날짜를 만들지 않는다.
