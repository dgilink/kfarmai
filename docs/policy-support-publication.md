# 정책·지원 페이지 게시 계약

`subsidy-calendar.html`은 공고와 사업 유형을 분리한다. `data/subsidy_programs.json`의 12개 유형은 탐색용 참고자료이며 신청 중인 공고가 아니다. 실제 공고 영역은 `data/policy-support-notices.json`에 등록한 승인 항목만 읽는다. 현재 승인 공고는 0건이다.

## 공고 게시 절차

1. `data/policy-support-sources.json`에 등록된 공식 제공처의 원문을 확인한다. `automation/policy_support_refresh.py` 결과의 `pending`은 후보일 뿐이며 공개 승인이 아니다.
2. 담당자가 공고명, 운영기관, 지역, 대상, 접수 시작·종료일과 마감 시간, 지원 내용, 자부담, 원문 URL, 공고 변경 여부를 원문과 대조한다. 날짜가 없으면 추정하지 않는다.
3. 검수한 항목만 `data/policy-support-notices.json`의 `items`에 옮기고 `reviewStatus: "approved"`, `verifiedAt`(KST 날짜), `sourceId`, `externalId`, `sourceHash`, `officialUrl`을 포함한다. `sourceHash`는 검수한 후보의 SHA-256 값 그대로 유지한다. 같은 원문의 변경된 해시는 재검수한다.
4. 공개 산출물 검증(`node scripts/pages/verify-pages-artifact.cjs _site`)을 통과해야 게시한다. `pending`, 중복 ID, 비공식 URL, 필수 메타데이터 누락은 빌드 검증에서 거부한다.
5. 게시 후 원문과 페이지를 다시 확인하고, 종료·변경 공고는 갱신한다. 임의로 “접수중”을 입력하지 않고 유효한 날짜가 있으면 한국시간 기준으로 계산한다. 시간이 중요한 접수 마감은 원문을 우선한다.

공개 JSON은 오직 승인된 데이터만 담는다. 관리용 후보·비공개 메모·API 키는 파일에 넣지 않는다. 지역별 지자체 원문은 공식 `.go.kr` 또는 `.gov.kr` HTTPS 주소를 사용한다. 페이지의 검색·필터는 두 데이터 묶음을 각각 걸러서 보여주며, 공고가 없거나 요청에 실패하면 공식 검색처로 안내한다. 외부 API를 브라우저에서 직접 호출하지 않는다.
