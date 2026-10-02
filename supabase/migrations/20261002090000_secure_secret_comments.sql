begin;

alter table public.comments
  add column if not exists is_secret boolean not null default false;

alter table public.comments enable row level security;

-- SELECT 정책은 OR로 결합되므로 기존의 광범위한 SELECT 정책을 남기면
-- 비밀댓글이 다시 노출될 수 있다. 기존 SELECT 정책만 제거하고 쓰기 정책은 유지한다.
do $policy_cleanup$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename = 'comments'
       and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.comments', policy_record.policyname);
  end loop;
end;
$policy_cleanup$;

create policy comments_select_public_or_participant
on public.comments
for select
to anon, authenticated
using (
  coalesce(is_secret, false) = false
  or auth.uid() = user_id
  or exists (
    select 1
      from public.posts
     where posts.id = comments.post_id
       and posts.user_id = auth.uid()
  )
  or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
);

comment on policy comments_select_public_or_participant on public.comments is
  '공개 댓글은 누구나, 비밀댓글은 작성자·게시글 작성자·서버가 부여한 관리자만 조회한다.';

commit;
