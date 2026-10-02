# V3 Phase 3A 농업정보 Provider 계약

## 목적

`/api/agri-feed`는 기존 provider별 응답을 화면에서 직접 추측하지 않도록 하나의 읽기 전용 계약으로 정규화한다. Provider를 실제로 호출했는지와 자료의 기준일이 최신인지는 서로 다른 정보이므로 `status`, `dataDate`, `fetchedAt`, `freshness`, `isFallback`을 함께 확인해야 한다.

## 공통 상태

- `LIVE`: provider 응답과 사용 가능한 자료가 있으며 freshness 기준을 넘지 않았다.
- `STALE`: provider 응답은 사용 가능하지만 기준일이 provider별 freshness 기준을 넘었거나 역사 통계다.
- `FALLBACK`: provider 자료 대신 저장 참고자료 또는 공식 확인 링크를 제공한다.
- `UNAVAILABLE`: 표시 가능한 provider 자료가 없다.

Fallback 또는 stale 자료에는 기준일을 숨기지 않는다. 저장 자료가 있으면 `현재 최신 데이터를 불러오지 못해 YYYY-MM-DD 기준 자료를 표시하고 있습니다.` 계약을 사용한다.

## Provider 설정

| Provider | timeout | cache TTL | freshness 기준 | 현재 코드 상태 |
|---|---:|---:|---|---|
| KMA | 8초 | 15분 | 예보 기준일 6시간 | 단기예보 endpoint 연결. 좌표·키·정상 응답이 있어야 `LIVE` |
| KAMIS | 8초 | 15분 | 공표일 72시간 | 일일 시세 연결. 2026-07-02 저장 자료는 항상 `FALLBACK` |
| NCPMS | 12초 | 6시간 | 공식 참고자료 | 목록·상세 XML/JSON parser 연결. 실패 시 빈 `UNAVAILABLE` |
| PSIS | 10초 | 6시간 | 공식 안전사용 참고자료 | `SVC01` 연결. 전용 키/endpoint/parameter 실환경 확인 필요 |
| 농사로 | 8초 | 12시간 | 공식 기술 참고자료 | OpenAPI XML/HTML parser 연결 |
| MAFRA | 8초 | 6시간 | 역사 통계/자료 기준일 | 시설채소·화훼 endpoint 연결. 오래된 생산연도는 `STALE` |
| 경매정보 | 8초 | 15분 | 공표일 72시간 | 인증 여부와 별개로 검증된 endpoint가 없어 `UNAVAILABLE`/`FALLBACK` |

TTL과 timeout은 `worker/src/agri-contract.js`의 `PROVIDER_CONFIG` 한 곳에서 관리한다. 외부 요청은 `fetchProvider()`를 거쳐 `AbortController`가 적용되며 한 provider 실패로 feed 전체가 실패하지 않는다.

## 실패 원인 계약

- 인증 누락: `missing_service_key`, `missing_kamis_credentials`
- timeout: `<provider>_timeout`
- HTTP 오류: 기존 provider별 `<provider>_..._http_<status>` 또는 `kamis_http_error`
- 응답은 성공했지만 빈 자료: `<provider>_empty_items`
- 미구현/검증 대기: `period_api_pending`, `auction_endpoint_unverified`, `auction_not_integrated`
- 복수 MAFRA 자료 중 일부 실패: `mafra_partial_failure`

PSIS는 농사로 키를 암묵적으로 재사용하지 않는다. `PSIS_API_KEY` 또는 기존 PSIS 호환 키가 없으면 인증 누락으로 분류한다. MAFRA는 키를 URL path segment로 전달하는 현재 계약을 유지하되 HTTP 상태, timeout, 빈 자료를 서로 다른 error code로 보존한다.

## `/api/agri-feed`

응답 최상위:

- `generatedAt`
- `overallStatus`
- `partial`
- `sections.weather`
- `sections.pestDisease`
- `sections.pesticideSafety`
- `sections.market`
- `sections.cultivation`
- `sections.support`
- `providers.kma|kamis|ncpms|psis|nongsaro|mafra|auction`

각 provider와 item은 다음 필드를 항상 가진다.

`provider`, `category`, `status`, `title`, `summary`, `dataDate`, `publishedAt`, `fetchedAt`, `source`, `sourceUrl`, `freshness`, `isFallback`, `errorCode`

## Production 적용 전 확인

- 현재 Phase에서는 Worker를 배포하지 않는다.
- 실제 secret 값은 출력하거나 저장소에 기록하지 않는다.
- PSIS와 MAFRA는 배포 전 분리 환경에서 read-only smoke test로 인증 방식과 실제 응답 형태를 다시 확인한다.
- 경매정보는 공식 endpoint와 파라미터가 검증되기 전 `LIVE`로 표시하지 않는다.
