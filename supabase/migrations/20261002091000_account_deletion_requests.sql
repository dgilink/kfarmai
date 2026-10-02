begin;

create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'completed', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text
);

alter table public.account_deletion_requests enable row level security;

-- 브라우저의 anon/authenticated 역할에는 직접 접근 정책을 만들지 않는다.
-- JWT를 검증한 Edge Function이 service-role로만 요청을 기록한다.
revoke all on table public.account_deletion_requests from anon, authenticated;

comment on table public.account_deletion_requests is
  '계정 삭제 실행 전 운영 검토를 위한 서버 검증형 요청 큐. 사용자 콘텐츠는 이 테이블 생성만으로 변경되지 않는다.';

commit;
