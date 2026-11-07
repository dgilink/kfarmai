-- One human button atomically approves the immutable content and publication
-- bindings, then records an idempotent server-side GitHub dispatch receipt.
-- The agricultural article remains in the GitHub Artifact/static publishing
-- path; this private schema stores approval metadata only.
begin;

create table kfarmai_private.daily_review_publish_dispatch (
  approval_id text primary key,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  state text not null default 'PENDING' check (state in ('PENDING','DISPATCHED')),
  content_comment_id bigint check (content_comment_id > 0),
  publish_comment_id bigint check (publish_comment_id > 0),
  created_at timestamptz not null default clock_timestamp(),
  dispatched_at timestamptz,
  check ((state='PENDING' and content_comment_id is null and publish_comment_id is null and dispatched_at is null)
    or (state='DISPATCHED' and content_comment_id is not null and publish_comment_id is not null and dispatched_at is not null))
);

alter table kfarmai_private.daily_review_publish_dispatch enable row level security;
revoke all on table kfarmai_private.daily_review_publish_dispatch from public, anon, authenticated, service_role;

create function public.daily_review_approval_apply_combined(
  p_token text,
  p_manifest_sha256 text,
  p_request_fingerprint text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  content kfarmai_private.daily_review_approvals%rowtype;
  publish kfarmai_private.daily_review_approvals%rowtype;
  dispatch kfarmai_private.daily_review_publish_dispatch%rowtype;
begin
  if coalesce(p_token,'') !~ '^[A-Za-z0-9_-]{32,255}$'
     or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_request_fingerprint,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'APPROVAL_REQUEST_INVALID';
  end if;

  select * into strict content from kfarmai_private.daily_review_approvals
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if content.approval_type <> 'CONTENT' or content.manifest_sha256 <> p_manifest_sha256 then
    raise exception 'APPROVAL_BINDING_MISMATCH';
  end if;
  select * into strict publish from kfarmai_private.daily_review_approvals
    where approval_id=content.approval_id and approval_type='PUBLISH' for update;

  if publish.artifact_id <> content.artifact_id
     or publish.artifact_digest <> content.artifact_digest
     or publish.manifest_sha256 <> content.manifest_sha256
     or publish.head_sha <> content.head_sha
     or publish.review_url <> content.review_url then
    raise exception 'APPROVAL_BINDING_MISMATCH';
  end if;
  if not exists (
    select 1 from kfarmai_private.daily_review_previews p
    where p.approval_id=content.approval_id
      and p.artifact_id=content.artifact_id
      and p.manifest_sha256=content.manifest_sha256
  ) then
    raise exception 'APPROVAL_PREVIEW_REQUIRED';
  end if;
  if content.expires_at <= clock_timestamp() or publish.expires_at <= clock_timestamp() then
    raise exception 'APPROVAL_EXPIRED';
  end if;

  if content.state='CONTENT_APPROVED' and publish.state='PUBLISH_APPROVED' then
    select * into strict dispatch from kfarmai_private.daily_review_publish_dispatch
      where approval_id=content.approval_id for update;
    if dispatch.manifest_sha256 <> content.manifest_sha256
       or dispatch.request_fingerprint <> p_request_fingerprint then
      raise exception 'APPROVAL_REPLAY_BLOCKED';
    end if;
  elsif content.state='PENDING' and publish.state='PENDING' then
    update kfarmai_private.daily_review_approvals
      set state='CONTENT_APPROVED', used_at=clock_timestamp()
      where approval_id=content.approval_id and approval_type='CONTENT';
    update kfarmai_private.daily_review_approvals
      set state='PUBLISH_APPROVED', used_at=clock_timestamp()
      where approval_id=content.approval_id and approval_type='PUBLISH';
    insert into kfarmai_private.daily_review_approval_audit
      (approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash,request_fingerprint)
      values
      (content.approval_id,'CONTENT','CONTENT_APPROVED',content.artifact_id,content.manifest_sha256,content.token_hash,p_request_fingerprint),
      (publish.approval_id,'PUBLISH','PUBLISH_APPROVED',publish.artifact_id,publish.manifest_sha256,publish.token_hash,p_request_fingerprint);
    insert into kfarmai_private.daily_review_publish_dispatch
      (approval_id,manifest_sha256,request_fingerprint)
      values(content.approval_id,content.manifest_sha256,p_request_fingerprint)
      returning * into dispatch;
  else
    raise exception 'APPROVAL_REPLAY_BLOCKED';
  end if;

  return jsonb_build_object(
    'approval_id',content.approval_id,
    'artifact_id',content.artifact_id,
    'manifest_sha256',content.manifest_sha256,
    'head_sha',content.head_sha,
    'review_url',content.review_url,
    'state','PUBLISH_APPROVED',
    'dispatch_state',dispatch.state,
    'published',false
  );
end $$;

create function public.daily_review_publish_dispatch_complete(
  p_approval_id text,
  p_manifest_sha256 text,
  p_content_comment_id bigint,
  p_publish_comment_id bigint
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare dispatch kfarmai_private.daily_review_publish_dispatch%rowtype;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$'
     or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or p_content_comment_id <= 0 or p_publish_comment_id <= p_content_comment_id then
    raise exception 'DISPATCH_RECEIPT_INVALID';
  end if;
  select * into strict dispatch from kfarmai_private.daily_review_publish_dispatch
    where approval_id=p_approval_id for update;
  if dispatch.manifest_sha256 <> p_manifest_sha256 then
    raise exception 'DISPATCH_BINDING_MISMATCH';
  end if;
  if dispatch.state='DISPATCHED' then
    if dispatch.content_comment_id <> p_content_comment_id or dispatch.publish_comment_id <> p_publish_comment_id then
      raise exception 'DISPATCH_REPLAY_CONFLICT';
    end if;
  else
    update kfarmai_private.daily_review_publish_dispatch
      set state='DISPATCHED',content_comment_id=p_content_comment_id,
          publish_comment_id=p_publish_comment_id,dispatched_at=clock_timestamp()
      where approval_id=p_approval_id
      returning * into dispatch;
  end if;
  return jsonb_build_object('approval_id',dispatch.approval_id,'state',dispatch.state,
    'content_comment_id',dispatch.content_comment_id,'publish_comment_id',dispatch.publish_comment_id);
end $$;

revoke all on function public.daily_review_approval_apply_combined(text,text,text) from public, anon, authenticated;
revoke all on function public.daily_review_publish_dispatch_complete(text,text,bigint,bigint) from public, anon, authenticated;
grant execute on function public.daily_review_approval_apply_combined(text,text,text) to service_role;
grant execute on function public.daily_review_publish_dispatch_complete(text,text,bigint,bigint) to service_role;

commit;
