# KFarmAI Model Routing Inventory Audit

> Historical reference. Integration-2 current status and superseding contracts: [automation-integration2.md](../automation/automation-integration2.md). Production Pages is preserved; Canary remains HOLD.

## Integration-1 적용 현황 (2026-10-09)

아래 원본 inventory는 legacy working tree와 public/main을 조사한 역사적 기록이다. 해당 legacy 파일들을 Candidate에 복원했다는 뜻이 아니다.
새 Candidate는 official baseline b768656c95eb5f511deb637f74281a2dae4fa10f에서 생성했다.
현재 Daily 실행기는 autopublish_pipeline.py → model_router.py v1.1에 연결되었고 fixture-only다.
Responses/Images live transport와 publish CLI는 차단됐다. daily/approval/Pages workflow job은 hard-disabled다.
공공 API와 UI/AI 참고 진단 코드는 baseline 그대로다. approval executor와 auditor에는 생성 모델을 추가하지 않았다.
최신 계약은 kfarmai-model-routing-v1.md 및 ../automation/automation-integration-v1.md를 따른다.

## 원본 조사 기록

검사 기준: 2026-10-09, 작업 브랜치 `refactor/kfarmai-v3-smart-agriculture`, 시작 HEAD `d47aa9d`.

이번 Inventory는 저장소 HEAD와 AutoPublish가 존재하는 로컬 원격 추적 ref `public/main`을 읽기 전용으로 조사했다. 실제 OpenAI·이미지·검색·공공데이터 API는 호출하지 않았다.

## 핵심 결론

- 현재 작업 브랜치에서 OpenAI API를 직접 호출하는 코드는 없다.
- 현재 AutoPublish 구현은 작업 브랜치에 없고 `public/main`의 `automation/kfarmai_daily_autopublish.py`에만 존재한다.
- 해당 AutoPublish는 기본 `gpt-6-luna`, reasoning `none`, `web_search` context `low`를 한 Responses 호출에서 결합한다.
- Worker의 KMA, KAMIS, NCPMS, NONGSARO, PSIS, MAFRA 경로는 직접 fetch와 결정적 JSON/XML 정규화다. AI를 사용하지 않으며 Router 적용 대상이 아니다.
- 브라우저 AI 참고 진단은 `static/js/ai/diagnosis-client.js`가 Supabase Edge Function `bright-action`을 호출한다. 실제 provider/model 코드는 이 저장소에 없으므로 별도 routing 계약으로 분리하고 이번 Phase에서 변경하지 않는다.
- 규칙 기반 SEO 생성기와 Phase 6 콘텐츠 파이프라인은 모델 없이 동작한다.

## 모델·생성 경로

| 파일/ref | task | network source | AI used? | model / reasoning / search | 비용 관련성 및 판정 |
|---|---|---|---|---|---|
| `public/main:automation/kfarmai_daily_autopublish.py` | source discovery, 공식출처 제한 검색, 기사 JSON 생성, 이미지 생성, HTML/sitemap 준비 | OpenAI Responses, OpenAI Images | YES | text: `KFARMAI_TEXT_MODEL` 또는 `gpt-6-luna`; reasoning `none`; web_search `required`, context `low`; image: `gpt-image-2.5-flare` | 현재 text/search/generation 결합. known API/URL에도 검색을 생략할 stage가 없음. 비용 추정과 budget 판정이 호출 뒤에 있어 Router 이관 필요 |
| `public/main:.github/workflows/kfarmai-daily-autopublish.yml` | schedule/manual run, review artifact, LOW 결과 commit/push/Pages dispatch | GitHub Actions, GitHub API, Production URL | 간접 | 위 환경변수 전달 | Production 변이 가능 경로. 이번 Phase에서 실행·수정하지 않음 |
| `public/main:automation/config.json` | AutoPublish 모델·도메인·예산 설정 | 없음 | 설정만 | Luna, image model, USD 0.15 | 새 3-tier 환경변수로 점진 이관 필요 |
| `static/js/ai/diagnosis-client.js` | AI 참고 진단 요청 payload 및 Edge Function 호출 | Supabase `bright-action` | 간접/불명 | provider/model/reasoning 불명 | 별도 계약. 임의 변경 금지, migration proposal만 유지 |
| `kfarmai_10h_seo_worker.py` | 질문 분류, 공식 출처 선택, SEO 초안 | 없음 | NO | 규칙 기반 | TIER 0. 주석상 미래 provider 교체점만 존재 |

## 공공 API·직접 수집 경로

모든 항목은 TIER 0이며 AI 또는 web_search를 추가하지 않는다.

| 파일 | task | network source | parser / normalization | AI used? | 비용 관련성 |
|---|---|---|---|---|---|
| `worker/src/index.js` | KMA 예보, KAMIS 가격, NCPMS 병해충, NONGSARO 재배정보, PSIS 안전사용기준, MAFRA 시설채소·화훼 시세 proxy | 각 공식 API endpoint | `fetch`, JSON parse, XML tag parse, 결정적 normalizer, cache/fallback | NO | 모델 비용 0 |
| `worker/src/agri-contract.js` | 농업 피드 schema/freshness 계약 | 없음 | 결정적 schema/날짜/상태 | NO | 모델 비용 0 |
| `scripts/fetch-weather.cjs` | 기상청 단기예보 수집 | data.go.kr KMA | JSON, 날짜·기상값 정규화 | NO | 모델 비용 0 |
| `scripts/fetch-market-prices.cjs` | 도매시장 시세 수집 | data.go.kr 농산물 거래 API | JSON, 가격·단위 정규화 | NO | 모델 비용 0 |
| `scripts/fetch-ncpms.cjs` | NCPMS 병해충 수집 | NCPMS | JSON 우선, XML regex fallback, field normalization | NO | 모델 비용 0 |
| `scripts/crops/probe-api-coverage.cjs` | 23개 작물의 NCPMS/NONGSARO coverage probe | NCPMS, NONGSARO | XML tag/count/keyword 검사 | NO | 모델 비용 0; 운영 key가 있을 때만 직접 호출 |
| `scripts/crops/fetch-pest-disease.cjs` | NCPMS wrapper | 위 `fetch-ncpms.cjs` | 동일 | NO | 모델 비용 0 |
| `scripts/crops/fetch-crop-guides.cjs` | 미래 농사로 guide fetch placeholder | 없음 | 미구현 | NO | 모델 추가 금지 |
| `scripts/crops/fetch-weekly-farming.cjs` | 미래 주간농사정보 fetch placeholder | 없음 | 미구현 | NO | 모델 추가 금지 |
| `scripts/crops/fetch-official-images.cjs` | 공식 이미지 검수 placeholder | 없음 | 관리자 검수 안내 | NO | 이미지 검색/모델 자동화 없음 |

## 콘텐츠 수집·파싱·검증 경로

| 파일 | task | network source | AI used? | routing 판정 |
|---|---|---|---|---|
| `scripts/content-pipeline/publish-approved.cjs` | robots 확인, bounded source GET, 최종 source/rights/hash 검증 | 승인된 공식 URL | NO | fetch/robots/hash는 TIER 0 |
| `scripts/content-pipeline/source-adapters.cjs` | MAFRA/RDA/MOF HTML fragment·KOGL·본문·날짜 파싱 | 이미 수집된 HTML | NO | CSS-template 성격의 결정적 adapter, TIER 0 |
| `scripts/content-pipeline/shadow-run.cjs` | private input 검증, adapter 실행, 중복/판정 | 로컬 private input | NO | TIER 0 |
| `scripts/content-pipeline/rights-remediation.cjs` | 권리 evidence와 source snapshot 재검증 | 주입된 검증 결과 | NO | TIER 0 |
| `scripts/content-pipeline/engine.cjs` | 권리, 최신성, 위험, 중복, URL, hash 판정 | 없음 | NO | TIER 0 risk gate |
| `scripts/content-pipeline/claim-language.cjs` | 허용된 자연문 variant 매핑 | 없음 | NO | 결정적 template, TIER 0 |
| `scripts/content-pipeline/claim-graph.cjs` | claim-to-fact graph 검증·렌더 | 없음 | NO | 결정적 graph 검증, TIER 0 |
| `scripts/content-pipeline/safety-classifier.cjs` | 처방/진단/안전 표현 분류 | 없음 | NO | 규칙 기반 TIER 0. REVIEW가 HIGH를 뜻하지 않음 |
| `scripts/content-pipeline/owner-workflow.cjs` | 검토·대표승인·quota·binding | 없음 | NO | 사람 승인 계약, 모델 fallback 금지 |
| `scripts/content-pipeline/content-index.cjs` | published duplicate/fingerprint/week count | 없음 | NO | TIER 0 |
| `scripts/content-pipeline/controlled-pages.cjs` | 승인된 단일 Pages artifact 준비·receipt 기록 | 주입된 source probe | NO | TIER 0 |
| `scripts/content-pipeline/post-publish-audit.cjs` | 게시 후 artifact/source integrity audit | 기본 로컬, 선택적 주입 probe | NO | TIER 0 |
| `scripts/build-search-index.cjs` | 로컬 HTML/JSON 검색색인 생성 | 로컬 파일 | NO | parse/dedupe/normalize, TIER 0 |
| `scripts/pages/build-pages-artifact.cjs` | 공개 allowlist artifact 생성 | 로컬 파일 | NO | TIER 0 |
| `scripts/pages/verify-pages-artifact.cjs` | sitemap/link/security 검증 | 로컬 artifact | NO | TIER 0 |

## 브라우저 fetch 소비 경로

이 경로들은 UI data loader 또는 Supabase CRUD다. 콘텐츠 의미 해석을 모델로 대체하지 않는다.

| 파일 | task / source | AI used? | routing 판정 |
|---|---|---|---|
| `agri-weather.html` | 로컬 weather/profile JSON 및 Worker weather/public-info | NO | TIER 0 |
| `market-prices.html` | Worker KAMIS/MAFRA 및 로컬 fallback | NO | TIER 0 |
| `public-data.html` | Worker NCPMS enrichment | NO | TIER 0 |
| `static/js/agri-info/agri-feed-ui.js` | Worker `/api/agri-feed`, 로컬 detail data | NO | TIER 0 |
| `static/js/agri/official-source-registry.js` | 로컬 official-source registry JSON | NO | TIER 0 |
| `agri-research.html`, `static/js/agri-info/agri-research-trends.js` | 로컬 research JSON | NO | TIER 0 |
| `agri-videos.html`, `static/js/agri-info/agri-videos.js` | 로컬 video JSON, 사용자 선택 후 YouTube iframe | NO | TIER 0 |
| `static/js/agri-info/agri-issues.js` | 로컬 issue JSON | NO | TIER 0 |
| `index.html` | 로컬 search index, Supabase auth/account deletion | NO direct model | TIER 0; 진단은 별도 client 계약 |
| `diagnosis.html` | 로컬 community index와 `diagnosis-client` 사용 | 간접/불명 | AI 진단 별도 migration proposal 대상 |
| `post.html` | Supabase 게시글·댓글·이미지 CRUD | NO | TIER 0 |
| `mfg.html` | 로컬 taxonomy/decision/support JSON | NO | TIER 0 |
| `contest-demo.html`, `diagnosis-cases.html`, `subsidy-calendar.html` | 로컬 JSON fixture/content | NO | TIER 0 |

브라우저·DB·Worker 테스트의 localhost/CDP/fetch는 검증용 네트워크이며 운영 source discovery가 아니다.

## 현재 AutoPublish 호출 분석

현재 `public/main` 구현은 한 Responses 요청이 다음 세 역할을 함께 수행한다.

1. `web_search`로 공식자료 발견
2. 출처 적합성 판단 및 source JSON 작성
3. 완성 기사 구조 생성

따라서 다음을 구분해 측정하지 못한다.

- known official URL/API를 사용해 검색 0회로 끝낼 수 있는지
- 검색이 1회에 충분했는지
- deterministic normalization이 가능한지
- Luna로 부족해 STANDARD가 필요한 정확한 이유
- task별 tier 사용량

또한 `KFARMAI_TEXT_MODEL` 하나로 임의 모델을 지정할 수 있어 STANDARD/HIGH reason guard가 없다. risk `REVIEW`는 현재 사람 검토로 보내지만, Router 계약으로 이를 명시해야 한다.

## Migration 경계

- 이번 브랜치에는 기존 AutoPublish 파일·workflow·config가 없으므로 구버전을 복사하거나 Production 경로를 재작성하지 않았다.
- 신규 `automation/model_router.py`는 provider/network 독립 정책 모듈이다.
- `docs/ai/kfarmai-model-routing-v1.md`에 `public/main` AutoPublish의 단계별 이관 순서를 제시한다.
- AI 참고 진단 Edge Function은 구현·model 정보가 저장소 밖에 있으므로 별도 inventory 없이는 연결하지 않는다.

## Audit 이슈

| 심각도 | 내용 | 처리 |
|---|---|---|
| MEDIUM | AutoPublish source discovery와 article generation이 한 Responses call로 결합됨 | Stage A~E migration proposal 작성 |
| MEDIUM | `KFARMAI_TEXT_MODEL` 단일 override에 STANDARD/HIGH reason guard 없음 | Router가 LIGHT-only legacy fallback으로 제한 |
| MEDIUM | 현재 비용 guard가 호출 전 route 차단 및 tier별 기록을 제공하지 않음 | Router budget block와 `model-routing.json` ledger 구현 |
| LOW | query/URL/date-window discovery cache가 없음 | v1 후속 항목으로 유지 |

BLOCKER와 HIGH는 발견하지 않았다. 다만 실제 AutoPublish 연결 전까지 routing 변경은 활성화되지 않는다.
