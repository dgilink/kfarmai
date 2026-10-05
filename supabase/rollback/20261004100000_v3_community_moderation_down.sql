begin;

alter table public.community_reports drop constraint if exists community_reports_status_check;
update public.community_reports set status = 'resolved' where status in ('reviewed', 'actioned');
alter table public.community_reports add constraint community_reports_status_check
  check (status in ('pending', 'reviewing', 'resolved', 'dismissed'));

drop policy if exists community_reports_moderator_update on public.community_reports;
drop policy if exists community_reports_owner_or_moderator_read on public.community_reports;
drop policy if exists community_reports_owner_read on public.community_reports;
create policy community_reports_owner_read on public.community_reports
for select to authenticated using (auth.uid() = reporter_user_id);

revoke update on public.community_reports from authenticated;
drop function if exists public.moderate_community_report(uuid, text);
drop function if exists public.community_report_queue(text, integer, integer);
drop function if exists public.community_is_moderator();
alter table public.community_reports drop column if exists reviewed_at;
alter table public.community_reports drop column if exists reviewed_by;
drop table if exists public.community_user_roles;

notify pgrst, 'reload schema';
commit;
