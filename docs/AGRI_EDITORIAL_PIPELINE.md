# KFarmAI 농업정보 정적 편집 파이프라인

## 결정

농업정보와 사용자 커뮤니티의 저장·운영 경계를 분리한다.

| 영역 | 기준 시스템 |
|---|---|
| 회원, 로그인, 질문, 댓글, 좋아요, 프로필, 사용자 이미지 | Supabase |
| 운영자가 제공하는 농업정보 글, 대표 이미지, 인포그래픽 | GitHub 정적 Artifact와 Pages |
| 일일 생성 선점, 중복 실행 방지, 비용 영수증, 검수 상태 | GitHub Issue |
| 최종 공개 | 소유자의 콘텐츠 승인과 별도 공개 승인 후 기존 Gate C/D |

Supabase의 커뮤니티 테이블, Auth, Storage, RLS는 이 파이프라인에서 변경하지 않는다.

## REVIEW-only 흐름

```text
GitHub Actions 06:00 KST
→ 날짜별 GENERATING Issue 선점
→ 공식자료 확인
→ 상한이 고정된 AI 호출 1회
→ 사용량을 같은 Issue에 기록
→ immutable Artifact 업로드
→ 같은 Issue를 표준 REVIEW Issue로 전환
→ 사용자 콘텐츠 승인
→ 별도 공개 승인
→ 정적 파일 반영·Pages·Production 감사
```

## 안전 계약

- Issue 선점이 성공하기 전에는 유료 모델을 호출하지 않는다.
- 같은 KST 날짜의 선점 Issue가 하나라도 있으면 새 호출을 차단한다.
- GitHub Actions concurrency와 `GITHUB_RUN_ATTEMPT=1`을 함께 유지한다.
- 요청별 최대 예약액은 22,528 micro-USD, 일일 상한은 150,000 micro-USD다.
- 호출 응답 또는 사용량 확인이 불가능하면 자동 재시도하지 않고 Issue를 HOLD로 전환한다.
- REVIEW 생성 작업에는 게시, Pages 배포, `git push` 권한을 부여하지 않는다.
- 공개는 기존 소유자 댓글 기반 콘텐츠 승인과 별도 공개 승인 이후에만 가능하다.
- 커뮤니티 Supabase의 key, table, migration, RLS, Auth, Storage는 변경하지 않는다.


## 소유자 직접 승인 원고 발행

KFarmAI 자체 조사 원고와 이미지를 소유자가 검토한 뒤 공개를 직접 지시한 경우, 기존 `USER_DIRECT_APPROVAL` 편집 발행 이력을 따른다. 이 절차는 검토가 끝난 원고에 적용한다. GitHub Daily REVIEW 결과의 공개는 위 Gate C/D 절차를 따른다.

1. 승인 범위에서 원고와 이미지 파일의 해시를 검증하고 공식 원문과 접수 상태를 확인한다. 원고 목록, `automation/daily_registry.json`, `sitemap.xml`에서 제목과 slug 중복을 확인한다.
2. 본문은 `kb/{slug}.html`로 저장한다. 기존 사이트 스타일을 적용하고, 공개 주소와 canonical, 검색 허용, 공유 이미지, Article 메타데이터를 확인한다. 대표 이미지와 인포그래픽에는 각각 `hero_photo`, `infographic` 역할을 지정한다. 목록용 썸네일이 필요하면 대표 이미지에서 만든다.
3. 레지스트리에 공개 승인 방식 `USER_DIRECT_APPROVAL`, 제목·분류·날짜, 공개 주소, 출처, 이미지 경로, 최종 파일 해시를 기록한다. 사이트맵에 공개 주소를 한 번 추가한다. Pages 빌드가 홈과 농업정보 목록을 생성한다.
4. Pages 빌드, 보안·SEO 검사, 360px·390px 화면 및 이미지 확인 후 저장소의 정상 반영 절차를 따른다. Pages 실행이 끝나면 공개 주소와 이미지의 HTTP 응답, canonical, 홈과 목록의 노출, 사이트맵을 확인한다.
5. 배포가 막히면 해당 커밋의 Pages 실행과 실패 단계를 확인한다. 권한 또는 환경 승인이 필요한 경우 기존 GitHub 절차에서 이어간다. 동일 slug는 다시 추가하기 전에 레지스트리와 운영 주소를 대조한다.

## 검증 주제 공급

- `automation/daily_topic_queue.json`만 Daily REVIEW의 주제 공급원으로 사용한다.
- 각 주제는 고유 우선순위·slug·제목·허용 카테고리와 서로 다른 공식 출처 2~4개를 가진다.
- 출처마다 기관, 원문 제목, 원문에서 다시 확인할 정확한 문구, 적용 조건을 사전 기록한다.
- `ready`는 자동 공개 가능이라는 뜻이 아니라, 실행 시 원문 재검증을 시작할 수 있다는 뜻이다.
- 큐 형식, 공식 도메인, 중복, 길이 제한 중 하나라도 맞지 않으면 네트워크 확인과 유료 모델 호출 전에 차단한다.
- 게시 이력, 기존 문서 또는 미완료 REVIEW Issue와 겹치는 주제는 건너뛰고 다음 우선순위를 선택한다.
- 선택 뒤에도 공식 원문 제목과 주장 문구를 당일 HTML에서 다시 확인하며, 2개 출처가 모두 통과해야 모델 비용을 예약한다.
- 운영자는 미사용 `ready` 주제가 2개가 되기 전에 공식자료를 조사해 최소 3개로 보충하고, PR 테스트와 사람 검토를 거친다.
- 큐가 소진되면 `BLOCKED_NO_VERIFIED_TOPIC`으로 HOLD하며 임의 주제 생성이나 자동 유료 재시도를 하지 않는다.

## 운영 전환

1. PR 회귀 테스트와 보호 규칙을 통과한다.
2. `KFARMAI_DAILY_APPROVED_HEAD_SHA`를 병합된 main HEAD로 갱신한다.
3. 공개 기능은 계속 끈 상태에서 `review_only`를 1회 실행한다.
4. Issue, Artifact, 본문, 이미지, 비용 기록을 확인한다.
5. 사용자가 콘텐츠를 승인한 뒤 별도 공개 승인으로 시험 게시한다.
6. Production URL과 모바일 화면 감사가 PASS인 경우에만 일일 REVIEW 일정을 유지한다.

## 롤백

새 Daily workflow와 `github_editorial_gate.py` 변경을 revert하면 기존 Supabase 기반
Daily 운영 코드로 돌아갈 수 있다. 커뮤니티 데이터와 스키마에는 롤백 작업이 없다.

## 2026-11-27 소유자 상시 승인: 하루 5회 농업정보 편집 발행

기존 `KFarmAI Daily AutoPublish` GitHub Actions의 **REVIEW-only 경로와 Gate C/D**는 그대로 유지한다. `KFARMAI_AUTOPUBLISH_ENABLED` 및 `KFARMAI_REVIEW_PUBLISH_ENABLED`의 보호 조건을 이 승인만으로 변경하거나 무력화하지 않는다. 아래는 이 보호된 REVIEW 작업과 **별개인** ChatGPT 통합 순차발행 편집 작업에 소유자가 부여한 정기 자동 공개 승인 범위이다.

- 05:00 KST: 농업정보 Radar `6ae7c146b4908191b195b79c8a671059`에서 TODAY, 7D, 30D, 60D, 90D 후보를 각각 1건 조사. 최우선 YES는 5개 중 하나의 우선순위이며 다른 PASS 후보 발행을 막지 않는다.
- 07:00/09:00/11:00/13:00/15:00 KST: 통합 예약 `6af8d51db1f88191bc04eb92e6083dc4`가 각 버킷별 최대 한 건, 총 다섯 건의 **공식 근거 검증 완료 콘텐츠만** 독립적으로 편집·공개한다. 06:00 호출은 인증·권한 점검만 한다. 실제 발행 시각은 보장하지 않는다.
- 소유자의 상시 승인은 시간표와 *검증을 통과한* 콘텐츠 범위에 대한 공개 지시이다. 원고·이미지가 불충분하거나 공식 출처가 HOLD/충돌/만료된 경우는 승인된 게시물로 간주하지 않고 건너뛴다. 공고 날짜·지원금·지역·대상·농약 처방 등 고위험 주장은 공식 원문을 반드시 재확인한다.
- 게시 전 오늘 레이더의 KST 날짜+run_id+bucket+topic_id, 공식 HTTPS 근거 2개 이상(서로 독립 기관 또는 문서), 제목과 slug의 중복, 기존 `automation/daily_registry.json`·`kb`·공개 URL 및 예약/검토 항목 중복을 확인한다. 최종 배포 파일의 해시와 권리 증빙을 기록한다.
- 검증된 한국 국내 실사/적법 공식 이미지를 우선하며 없으면 실사로 가장하지 않는 원본 그래픽으로 대체할 수 있다. 대표 이미지와 별도 인포그래픽, ALT, 모바일 360px·390px, 대비 및 텍스트·공식링크 클릭을 확인한다. 자동 이미지 평가 목표는 개별 자산 85점 이상이다. 오류·권리 불명·이미지 전송 불가 시 공개 금지.
- 안전한 편집 경로는 별도 작업 브랜치에서 해당 `kb/{slug}.html`, `static/kb/` 대표 이미지/인포그래픽, `automation/daily_registry.json`, `sitemap.xml`만 수정하는 것이다. 누적 인덱스는 기존 Pages 빌드 계약으로 생성한다. PR의 전체 regression·개별 핵심 테스트·빌드·차단기능·diff 검증을 통과한 경우에만 머지하고 Pages 배포 및 비로그인 공개 URL·이미지·목록·canonical·sitemap을 재조회한다. 저장만 한 것은 게시 완료가 아니다.
- 레지스트리에는 기존 `USER_DIRECT_APPROVAL` 편집 발행 모드를 유지하고, `approval_source: OWNER_STANDING_SCHEDULED_EDITORIAL`, 승인일, 버킷, 원천 자동화 ID, topic_id, 기사/시각자료 SHA256과 공식 근거를 추가 기록한다. 기존 REVIEW Artifact는 이 경로로 재포장하거나 Gate C/D를 우회해 발행하지 않는다.
- KFarmAI의 정책지원 공고 자동갱신, 회원·커뮤니티·Supabase·RLS·Auth·Secrets, 기존 Pages/REVIEW 워크플로, DGI PICK 및 다른 블로그는 변경 범위 밖이다.
- 실행 가능 여부의 단일 계약은 `automation/five_slot_editorial_approval.json`에 기록한다. 최초 각 슬롯에서 실제 도메인 공개 재조회가 PASS 될 때까지 설정 완료와 발행 성공을 구분한다.

