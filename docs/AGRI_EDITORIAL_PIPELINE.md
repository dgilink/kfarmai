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
