begin;

alter table public.posts enable row level security;
alter table public.comments enable row level security;

-- PostgreSQL combines permissive policies with OR. Remove every legacy write
-- policy on these two tables before installing the single V3 ownership contract.
do $policy_cleanup$
declare
  policy_record record;
begin
  for policy_record in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and (
         (tablename = 'posts' and cmd in ('INSERT', 'UPDATE', 'DELETE'))
         or (tablename = 'comments' and cmd in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
       )
  loop
    execute format('drop policy if exists %I on public.%I', policy_record.policyname, policy_record.tablename);
  end loop;
end;
$policy_cleanup$;

-- PUBLIC/anon keep read-only access. service_role keeps its existing server-only
-- privileges and RLS bypass; browsers never receive that credential.
revoke all privileges on table public.posts, public.comments from public;
revoke all privileges on table public.posts, public.comments from anon;
revoke all privileges on table public.posts, public.comments from authenticated;

grant select on table public.posts, public.comments to anon, authenticated;
grant insert, update, delete on table public.posts, public.comments to authenticated;

-- The account-deletion Edge Function uses the server-only service role to upsert
-- and return the request row. No browser role receives direct table access.
grant select, insert, update on table public.account_deletion_requests to service_role;

create policy posts_insert_authenticated_owner
on public.posts
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id is not null
  and user_id = auth.uid()
);

create policy posts_update_authenticated_owner
on public.posts
for update
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
)
with check (
  auth.uid() is not null
  and user_id is not null
  and user_id = auth.uid()
);

create policy posts_delete_authenticated_owner
on public.posts
for delete
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
);

create policy comments_select_public
on public.comments
for select
to anon, authenticated
using (
  deleted_at is null
  and coalesce(is_secret, false) = false
);

create policy comments_select_secret_participant
on public.comments
for select
to authenticated
using (
  deleted_at is null
  and coalesce(is_secret, false) = true
  and (
    auth.uid() = user_id
    or exists (
      select 1
        from public.posts
       where posts.id = comments.post_id
         and posts.user_id = auth.uid()
    )
    or public.community_is_moderator()
    or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  )
);

create policy comments_insert_authenticated_owner
on public.comments
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id is not null
  and user_id = auth.uid()
  and coalesce(is_ai, false) = false
);

create policy comments_update_authenticated_owner
on public.comments
for update
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
  and coalesce(is_ai, false) = false
)
with check (
  auth.uid() is not null
  and user_id is not null
  and user_id = auth.uid()
  and coalesce(is_ai, false) = false
);

create policy comments_delete_authenticated_owner
on public.comments
for delete
to authenticated
using (
  auth.uid() is not null
  and user_id = auth.uid()
  and coalesce(is_ai, false) = false
);

-- Preserve the signature used by RLS and the toggle RPCs, but bind externally
-- supplied actor_id to the authenticated caller. A mismatched actor always gets
-- a non-informative false result and cannot probe another pair's block state.
create or replace function public.community_interaction_allowed(actor_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and actor_id = auth.uid()
    and target_user_id is not null
    and actor_id <> target_user_id
    and not exists (
      select 1
      from public.user_blocks blocks
      where (blocks.blocker_user_id = actor_id and blocks.blocked_user_id = target_user_id)
         or (blocks.blocker_user_id = target_user_id and blocks.blocked_user_id = actor_id)
    );
$$;

revoke all on function public.community_interaction_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.community_interaction_allowed(uuid, uuid) to authenticated;

comment on function public.community_interaction_allowed(uuid, uuid) is
  '인증 사용자 본인 actor_id만 허용하며 임의 UUID 쌍의 차단 관계 조회를 방지한다.';

notify pgrst, 'reload schema';

commit;
