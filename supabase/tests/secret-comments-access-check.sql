-- Staging/preview DB에 migration을 적용한 뒤 실행하는 읽기 전용 계약 검증 스크립트입니다.
-- 실제 UUID로 아래 psql 변수를 지정해야 합니다.
-- \set public_post_id '...'
-- \set public_comment_id '...'
-- \set secret_comment_id '...'
-- \set secret_comment_author_id '...'
-- \set secret_post_owner_id '...'
-- \set unrelated_user_id '...'
-- \set public_reply_id '...'
-- \set secret_reply_id '...'

begin read only;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
select count(*) = 1 as public_comment_visible
  from public.comments
 where id = :'public_comment_id'::uuid
   and post_id = :'public_post_id'::uuid;
select count(*) = 0 as secret_comment_hidden_from_anon
  from public.comments
 where id = :'secret_comment_id'::uuid;
select count(*) = 1 as public_reply_visible_to_anon
  from public.comments
 where id = :'public_reply_id'::uuid
   and parent_id is not null;
select count(*) = 0 as secret_reply_hidden_from_anon
  from public.comments
 where id = :'secret_reply_id'::uuid;
rollback;

begin read only;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'secret_comment_author_id', 'role', 'authenticated')::text,
  true
);
select count(*) = 1 as secret_comment_visible_to_author
  from public.comments
 where id = :'secret_comment_id'::uuid;
rollback;

begin read only;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'secret_post_owner_id', 'role', 'authenticated')::text,
  true
);
select count(*) = 1 as secret_comment_visible_to_post_owner
  from public.comments
 where id = :'secret_comment_id'::uuid;
rollback;

begin read only;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', :'unrelated_user_id', 'role', 'authenticated')::text,
  true
);
select count(*) = 0 as secret_comment_hidden_from_unrelated_user
  from public.comments
 where id = :'secret_comment_id'::uuid;
select count(*) = 0 as secret_reply_hidden_from_unrelated_user
  from public.comments
 where id = :'secret_reply_id'::uuid;
rollback;
