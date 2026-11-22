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
