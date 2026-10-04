# V3 Phase 5A 농자재·스마트농업 구조 감사

기준일: 2026-10-04
범위: 공개 정보구조와 로컬 소스. Production 데이터·배포는 변경하지 않는다.

## 분류 감사와 전환표

기존 `data/agri-input-categories.json`의 8개 분류는 삭제하지 않고 호환 데이터로 유지한다. 사용자 화면의 상위 탐색만 6개 canonical 분류로 단순화한다.

| 기존 ID | 기존 이름 | V3 canonical | 처리 | 보존 방식 |
|---|---|---|---|---|
| `santo` | 상토 | 토양·영양 | MERGE | 기존 데이터와 `santo.html`, query 호환 유지 |
| `seed` | 종자 | 종자·육묘 | MOVE | 기존 데이터와 `seed.html`, query 호환 유지 |
| `fertilizer` | 비료 | 토양·영양 | MERGE | 기존 데이터와 `fert.html`, query 호환 유지 |
| `crop-protection` | 작물보호 | 작물보호 | KEEP | 기존 데이터와 `cpa.html`, alias 호환 유지 |
| `irrigation-facility` | 관수·시설자재 | 시설·관수 | MOVE | 기존 query를 canonical 상세로 연결 |
| `home-gardening-tools` | 화분·도구 | 원예·도구 | MOVE | 기존 query를 canonical 상세로 연결 |
| `smartfarm` | 스마트팜 | 스마트농업 > 스마트팜 | MOVE | 기존 query를 스마트팜 하위영역으로 연결 |
| `machinery-safety` | 농기계·안전용품 | 시설·관수 중심, 작물보호·원예 안전 태그 | HIDE | 독립 상위메뉴만 숨기고 기존 데이터와 query 유지 |

## 공개 화면·URL 분류

| 대상 | 상태 | 공개 노출 정책 |
|---|---|---|
| `mfg.html` | KEEP / REFACTOR | 6개 canonical 분류의 주 진입점 |
| `santo.html`, `seed.html`, `cpa.html`, `fert.html` | KEEP | 기존 상세 데이터와 외부 URL 호환 |
| 기존 `mfg.html?category=<legacy>` | KEEP | mapping layer로 canonical 상세 연결 |
| `knowledge-hub.html` | ARCHIVE | 현행 농자재 navigation에서 사용하지 않으며 후속 SEO 감사 대상 |
| 업체·제조사 목록 | MOVE | 기술·분류·공식정보 다음의 접힌 보조영역 |
| 보조사업·관련기관 | MOVE | 농업정보의 지원·공고 및 공식 확인 경로로 연결 |
| 비어 있는 메뉴·단순 준비중 CTA | HIDE | 정식 핵심 navigation에서 노출하지 않음 |

## 스마트농업 범위

- 스마트팜: 온도, 습도, CO₂, 일사, 토양수분, EC, pH, 관수, 양액, 센서, 환경제어, 자동화, 에너지, EMS, 시설재배, 데이터 활용.
- 육상 아쿠아팜: 수온, DO, pH, 염분, ORP, 암모니아·질소계 수질, RAS, 수처리, 펌프, 산소공급, 센서, 모니터링, 자동제어, 에너지·EMS, 육상양식. 해조류·김은 향후 확장어로만 둔다.
- 특정 과제명, 비공개 사업기획, 제품 순위, 판매 우선순위, 가짜 실시간 측정값은 공개 데이터에 포함하지 않는다.

## 서비스 영역별 역할

| 영역 | 역할 | 포함하지 않는 것 |
|---|---|---|
| 농업정보 | 최신 공공자료·공식 기술자료와 기준일·출처 표시 | 자재 taxonomy 중복, 특정 업체 우선노출 |
| 농자재·스마트농업 | 기술 분야·센서·설비·자재의 구조적 탐색 | 가짜 상품, 가격비교, 자동 처방 |
| 커뮤니티 | 실제 사용자 질문·경험과 반응 | 공식 통계로 오해할 수 있는 과장 |

## 업체 정보 원칙

정보 → 기술·분류 → 필요한 경우 업체 공식정보 순서를 유지한다. 업체 목록은 기본 접힘 상태이며, 협회 공개 목록과 공식 사이트를 출처로 삼는다. 목록 순서는 추천·순위·후원 의미가 아니다. 상품 판매, 최저가, 장바구니, 결제 기능은 이 구조에 포함하지 않는다.

## URL·SEO 준비

- `mfg.html`을 canonical 후보로 둔다.
- query 기반 상세 화면에는 `noindex,follow`를 적용해 얇은 중복 URL의 색인을 피한다.
- 기존 상세 페이지와 legacy query는 즉시 삭제하거나 끊지 않는다.
- 스마트팜·육상 아쿠아팜은 실제 설명 항목이 있으므로 탐색 가능하게 하되, 별도 indexable 페이지 생성과 sitemap 반영은 후속 SEO 단계에서 결정한다.
