# KFarmAI Model Router v1.1 — Integration Candidate

> Historical reference. Integration-2 current status and superseding contracts: [automation-integration2.md](../automation/automation-integration2.md). Production Pages is preserved; Canary remains HOLD.

상태: Automation Integration-1의 fixture-only 실행기에 연결됨. 실제 모델/API availability·가격·응답 품질 검증은 하지 않았다. Production activation은 범위 밖이다.

## Task matrix

| Tier | 기본 모델 | 조건 | reasoning / search |
|---|---|---|---|
| NONE | 없음 | HTTP/API/XML/JSON/RSS/HTML selector/metadata/robots/sitemap/date/normalization/dedupe/hash/URL/domain/risk gate | 모델·검색 0 |
| LIGHT | gpt-6-luna | source discovery, tagging, relevance, short summary, 일반 content generation | none; discovery만 low |
| STANDARD | gpt-6.1-sol | 공식자료 충돌 또는 source_count >= 2 AND needs_synthesis AND cross_source_synthesis | medium; 검색 0 |
| HIGH | gpt-6-astra | enabled AND human_escalation_id 또는 approved_policy_reason | high; 기본 DISABLED |

source_count, 문서 길이, risk REVIEW, 기술 오류, 두 번 검색 실패만으로 승격하지 않는다.
STANDARD reason에는 LIGHT_INSUFFICIENT가 필수다.
HIGH reason에는 승인 식별자가 필수다. deprecated explicit_policy_reason 필드만으로는 승인되지 않는다.

## Configuration

```dotenv
KFARMAI_MODEL_LIGHT=gpt-6-luna
KFARMAI_MODEL_STANDARD=gpt-6.1-sol
KFARMAI_MODEL_HIGH=gpt-6-astra
KFARMAI_HIGH_TIER_ENABLED=false
KFARMAI_DAILY_BUDGET_USD=0.15
```

KFARMAI_TEXT_MODEL은 LIGHT fallback만 유지한다. LIGHT가 알려진 STANDARD/HIGH 모델명이나 상위 tier 설정과 같으면 BLOCK한다. STANDARD가 HIGH 모델이면 BLOCK한다. 환경변수 모델명은 사용자 지정 계약이며 유료 호출로 지원 여부를 확인하지 않았다.

## Routing flow

deterministic 가능한 작업은 NONE이다. semantic 작업은 LIGHT가 기본이며, 명시적 교차 종합/충돌 증거만 STANDARD를 허용한다. HIGH는 별도 승인과 enable 모두 필요하다. 모호하면 낮은 tier 또는 REVIEW/BLOCK이다.

REVIEW는 사람에게 전달하는 상태다. 공식자료가 충분해도 위험 주제는 REVIEW를 유지한다. Worker KMA/KAMIS/NCPMS/NONGSARO/PSIS/MAFRA와 AI 참고 진단 경로는 수정하지 않았다.

## Search guard

- known official URL/API는 0회.
- discovery는 LIGHT, context low, 첫 요청 max_tool_calls=1.
- 충분하면 즉시 종료. 부족하면 query rewrite로 한 번만 추가 요청.
- 전체 2회 뒤 부족하면 BLOCK/REVIEW. STANDARD 자동 재실행 없음.
- 생성 단계에는 검색 tool을 전달하지 않는다.
- provider가 허용치 초과 호출을 보고하면 후속 단계 차단.

Responses max_tool_calls는 built-in tool 호출의 상한이다. 이 Candidate는 transport payload와 반환 계수를 fixture로 검증한다. [공식 Responses API 문서](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create), [web search 문서](https://developers.openai.com/api/docs/guides/tools-web-search).

## Budget and ledger

autopublish_pipeline.py는 전체 projected 비용을 첫 호출 전에 검사하고 각 요청 비용을 transport 전에 reserve한다. 실패한 요청을 자동 환불하지 않는다. 같은 날짜/출력 디렉터리의 budget.json을 다시 읽어 누적한다. 초과 시 모델·이미지 호출 없이 BLOCK한다.

예약값 LIGHT 0.03, STANDARD 0.10, HIGH 0.25, discovery 0.015/회, image 0.05 USD는 합성 테스트용 ceiling이며 실제 provider 요금표가 아니다. 실운영 전 실제 가격·토큰/이미지 한도와 중앙 일별 예산 저장소를 별도 승인해야 한다. 현재 CLI는 실 API를 호출할 수 없다.

model-routing.json 필드:
task, tier, model, reason, reasoning, web_search_enabled, web_search_calls, estimated_budget, escalated_from.
NONE도 기록하며 secret/token/input 본문은 ledger에 기록하지 않는다. 이미지 예약액은 budget.json과 outcome 비용에 포함되며 텍스트 tier로 위장하지 않는다.

## Failure handling

HTTP/network/rate limit은 같은 tier retry 정책을 반환한다. schema repair는 최대 1회 정책이다. 통합 fixture 실행기는 기술 실패 시 안전하게 BLOCK하고 재시도/상급모델 호출을 하지 않는다. source discovery만 명시적 query rewrite를 구현했다.

## Cache

공식 API의 기존 Worker cache는 유지한다. discovery cache는 아직 도입하지 않는다. 후속 cache key는 normalized query/URL + 날짜 범위 + domain filter로 분리하고, immutable artifact 재승인에서는 source 재검색을 하지 않는다.

## Integrated stages

SOURCE → Router → fixture generation → QA/risk gate.
LOW는 기존 위험정책을 유지해 임시 사이트에 모의 적용한다.
REVIEW는 schema v2 package와 Issue payload를 만든 뒤 중단한다.
승인은 Router/AI/본문·이미지 재생성을 호출하지 않고 동일 bytes를 적용한다.

전체 계약과 검증 범위: [Automation Integration-1](../automation/automation-integration-v1.md).
