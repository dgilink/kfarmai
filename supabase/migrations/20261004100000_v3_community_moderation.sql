begin;

create table if not exists public.community_user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('moderator')),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.community_user_roles enable row level security;

drop policy if exists community_user_roles_self_read on public.community_user_roles;
create policy community_user_roles_self_read on public.community_user_roles
for select to authenticated using (user_id = auth.uid());

create or replace function public.community_is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.community_user_roles
    where user_id = auth.uid() and role = 'moderator'
  );
$$;

alter table public.community_reports
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.community_reports drop constraint if exists community_reports_status_check;
update public.community_reports set status = 'pending' where status = 'reviewing';
update public.community_reports set status = 'reviewed' where status = 'resolved';
alter table public.community_reports add constraint community_reports_status_check
  check (status in ('pending', 'reviewed', 'dismissed', 'actioned'));

drop policy if exists community_reports_owner_read on public.community_reports;
drop policy if exists community_reports_owner_or_moderator_read on public.community_reports;
create policy community_reports_owner_or_moderator_read on public.community_reports
for select to authenticated using (
  auth.uid() = reporter_user_id or public.community_is_moderator()
);

drop policy if exists community_reports_moderator_update on public.community_reports;
create policy community_reports_moderator_update on public.community_reports
for update to authenticated
using (public.community_is_moderator())
with check (public.community_is_moderator());

create or replace function public.community_report_queue(
  status_filter text default null,
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  id uuid,
  reporter_user_id uuid,
  target_type text,
  target_id uuid,
  target_preview text,
  target_author_id uuid,
  reason text,
  status text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.community_is_moderator() then
    raise exception 'moderator_required' using errcode = '42501';
  end if;
  if status_filter is not null and status_filter not in ('pending', 'reviewed', 'dismissed', 'actioned') then
    raise exception 'invalid_report_status' using errcode = '22023';
  end if;
  return query
  select reports.id,
    reports.reporter_user_id,
    reports.target_type,
    reports.target_id,
    left(coalesce(
      case when reports.target_type = 'post' then posts.title || E'\n' || posts.content else comments.content end,
      '[삭제되었거나 조회할 수 없는 콘텐츠]'
    ), 240) as target_preview,
    case when reports.target_type = 'post' then posts.user_id else comments.user_id end,
    reports.reason,
    reports.status,
    reports.created_at,
    reports.reviewed_at,
    reports.reviewed_by
  from public.community_reports reports
  left join public.posts posts on reports.target_type = 'post' and posts.id = reports.target_id
  left join public.comments comments on reports.target_type = 'comment' and comments.id = reports.target_id
  where status_filter is null or reports.status = status_filter
  order by reports.created_at desc
  limit least(greatest(page_limit, 1), 100)
  offset greatest(page_offset, 0);
end;
$$;

create or replace function public.moderate_community_report(report_id uuid, next_status text)
returns table (id uuid, status text, reviewed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.community_is_moderator() then
    raise exception 'moderator_required' using errcode = '42501';
  end if;
  if next_status not in ('reviewed', 'dismissed', 'actioned') then
    raise exception 'invalid_report_status' using errcode = '22023';
  end if;
  return query
  update public.community_reports reports
  set status = next_status, reviewed_at = now(), reviewed_by = auth.uid()
  where reports.id = report_id
  returning reports.id, reports.status, reports.reviewed_at;
  if not found then raise exception 'report_not_found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on public.community_user_roles from public, anon, authenticated;
grant select on public.community_user_roles to authenticated;
grant update on public.community_reports to authenticated;
revoke all on function public.community_is_moderator() from public, anon, authenticated;
revoke all on function public.community_report_queue(text, integer, integer) from public, anon, authenticated;
revoke all on function public.moderate_community_report(uuid, text) from public, anon, authenticated;
grant execute on function public.community_is_moderator() to authenticated;
grant execute on function public.community_report_queue(text, integer, integer) to authenticated;
grant execute on function public.moderate_community_report(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
