# kFarmAI V3 Source of Truth 초안

## 목표

정적 사이트, Cloudflare Worker, Supabase migration과 Edge Function이 서로 다른 이력에서 배포되지 않도록 하나의 승인된 Git commit을 release 기준으로 사용한다.

## 단순 branch 흐름

```text
feature/* 또는 refactor/*
→ 검증 및 review
→ main
→ Production
```

- `feature/*`, `fix/*`, `refactor/*`: 기능별 작업과 검증용 branch
- `main`: 유일한 release branch. Pages, Worker, Supabase 배포는 승인된 `main` commit 또는 그 commit의 release tag만 사용
- 장기 develop branch나 환경별 복잡한 branch는 만들지 않는다.

## 저장소와 배포 기준

1. private 저장소의 `main`을 개발·release의 canonical source로 정한다.
2. 공개 GitHub Pages 저장소가 별도로 필요하면 canonical `main`의 동일 commit을 public `main`에 fast-forward 방식으로 mirror한다. 별도 cherry-pick으로 서로 다른 commit 이력을 만들지 않는다.
3. GitHub Pages는 현재처럼 public `main`만 배포하되, mirror된 commit hash와 release tag를 배포 기록에 남긴다.
4. Cloudflare Worker는 같은 release commit의 `worker/`만 배포한다. 로컬 수정본이나 다른 branch에서 직접 배포하지 않는다.
5. Supabase migration과 Edge Function의 source는 같은 저장소의 `supabase/`로 고정한다. Dashboard에서 직접 수정했다면 즉시 동등한 migration/source를 Git에 먼저 반영하고 다음 release 전에 drift를 해소한다.

## Release tag

- 검증 완료 commit에 `prod-YYYYMMDD-HHMM-<shortsha>` 형식의 annotated tag를 만든다.
- tag에는 Pages commit, Worker source commit, Supabase migration 마지막 version, Edge Function version을 release note로 기록한다.
- rollback은 가장 최근 정상 production tag를 기준으로 한다.

## 현재 이력 정리 원칙

- 현재 Production 정적 기준선은 `public/main@7c67ec1`이고 로컬 안전기반은 `86e93d9`에서 시작했다.
- 두 이력은 `45b4c33`을 공통 조상으로 하며 OAuth commit이 병렬로 존재한다. 기존 commit을 rewrite하지 않고, 검증된 안전기반 변경을 canonical `main`에 정상 merge한 뒤 public `main`을 그 동일 commit으로 맞춘다.
- KAMIS 최신성 수정과 Phase 1 보안 변경을 release 후보에 함께 포함하되, Production 반영 전 staging 검증과 승인 checkpoint를 통과해야 한다.

## Release 기록 최소 항목

- canonical commit과 release tag
- public Pages에 배포된 동일 commit
- Worker 배포 source commit
- 적용된 Supabase migration version
- Edge Function 이름과 배포 시각
- smoke test 결과와 rollback 기준 commit

이 초안은 merge, push, 배포를 실행하지 않으며 실제 remote 운영 방식은 대표 승인 후 확정한다.
