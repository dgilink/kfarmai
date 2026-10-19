-- Atomically supersede an unapproved package and issue revision approvals.
begin;

alter table kfarmai_private.daily_review_approval_audit
  drop constraint if exists daily_review_approval_audit_event_check;
alter table kfarmai_private.daily_review_approval_audit
  add constraint daily_review_approval_audit_event_check
  check (event in ('ISSUED','CONTENT_APPROVED','PUBLISH_APPROVED','REPLAY_BLOCKED',
                  'EXPIRED_BLOCKED','ORDER_BLOCKED','BINDING_BLOCKED',
                  'TOKEN_REVOKED','TOKEN_ROTATED','CONTENT_REVIEW_RESET',
                  'PACKAGE_SUPERSEDED'));

create function public.daily_review_email_revision_issue(
  p_old_approval_id text, p_old_artifact_id bigint, p_old_manifest_sha256 text,
  p_approval_id text, p_artifact_id bigint, p_artifact_digest text,
  p_manifest_sha256 text, p_head_sha text, p_review_url text,
  p_title text, p_summary text, p_official_sources jsonb, p_usage jsonb,
  p_content_token_hash text, p_publish_token_hash text, p_expires_at timestamptz,
  p_recipient text, p_from_address text, p_email_context jsonb,
  p_content_idempotency_key text, p_publish_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare old_content kfarmai_private.daily_review_approvals%rowtype;
declare old_publish kfarmai_private.daily_review_approvals%rowtype;
begin
  if coalesce(p_old_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$'
     or p_old_artifact_id<=0 or coalesce(p_old_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$'
     or p_approval_id=p_old_approval_id or p_artifact_id<=0
     or coalesce(p_artifact_digest,'') !~ '^sha256:[a-f0-9]{64}$'
     or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or p_manifest_sha256=p_old_manifest_sha256
     or coalesce(p_head_sha,'') !~ '^[a-f0-9]{40}$'
     or coalesce(p_review_url,'') !~ '^https://github\.com/dgilink/kfarmai/issues/5$'
     or length(coalesce(p_title,'')) not between 1 and 160
     or length(coalesce(p_summary,''))>600
     or jsonb_typeof(p_official_sources)<>'array' or jsonb_typeof(p_usage)<>'object'
     or coalesce(p_content_token_hash,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_publish_token_hash,'') !~ '^[a-f0-9]{64}$'
     or p_expires_at<=clock_timestamp() or coalesce(p_recipient,'')=''
     or coalesce(p_from_address,'')='' or jsonb_typeof(p_email_context)<>'object'
     or coalesce(p_content_idempotency_key,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_publish_idempotency_key,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'REVIEW_REVISION_INVALID';
  end if;
  select * into strict old_content from kfarmai_private.daily_review_approvals
    where approval_id=p_old_approval_id and approval_type='CONTENT' for update;
  select * into strict old_publish from kfarmai_private.daily_review_approvals
    where approval_id=p_old_approval_id and approval_type='PUBLISH' for update;
  if old_content.artifact_id<>p_old_artifact_id or old_publish.artifact_id<>p_old_artifact_id
     or old_content.manifest_sha256<>p_old_manifest_sha256
     or old_publish.manifest_sha256<>p_old_manifest_sha256
     or old_content.state not in ('PENDING','CONTENT_APPROVED')
     or old_publish.state<>'PENDING'
     or (old_content.state='PENDING' and old_content.used_at is not null)
     or (old_content.state='CONTENT_APPROVED' and old_content.used_at is null)
     or old_publish.used_at is not null then
    raise exception 'REVIEW_REVISION_SOURCE_BINDING';
  end if;
  update kfarmai_private.daily_review_approvals
    set state='HELD',used_at=clock_timestamp()
    where approval_id=p_old_approval_id and approval_type in ('CONTENT','PUBLISH');
  update kfarmai_private.daily_review_email_outbox
    set delivery_state='HELD'
    where approval_id=p_old_approval_id and approval_type in ('CONTENT','PUBLISH');
  insert into kfarmai_private.daily_review_approval_audit
    (approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
  values (old_content.approval_id,'CONTENT','PACKAGE_SUPERSEDED',old_content.artifact_id,
          old_content.manifest_sha256,old_content.token_hash),
         (old_publish.approval_id,'PUBLISH','PACKAGE_SUPERSEDED',old_publish.artifact_id,
          old_publish.manifest_sha256,old_publish.token_hash);
  insert into kfarmai_private.daily_review_approvals
    (approval_id,approval_type,artifact_id,artifact_digest,manifest_sha256,head_sha,
     review_url,title,summary,official_sources,usage,token_hash,expires_at)
  values
    (p_approval_id,'CONTENT',p_artifact_id,p_artifact_digest,p_manifest_sha256,p_head_sha,
     p_review_url,p_title,p_summary,p_official_sources,p_usage,p_content_token_hash,p_expires_at),
    (p_approval_id,'PUBLISH',p_artifact_id,p_artifact_digest,p_manifest_sha256,p_head_sha,
     p_review_url,p_title,p_summary,p_official_sources,p_usage,p_publish_token_hash,p_expires_at);
  insert into kfarmai_private.daily_review_email_outbox
    (approval_id,approval_type,provider,delivery_state,idempotency_key,recipient,from_address,email_context)
  values
    (p_approval_id,'CONTENT','resend','PENDING',p_content_idempotency_key,p_recipient,p_from_address,p_email_context),
    (p_approval_id,'PUBLISH','resend','HELD',p_publish_idempotency_key,p_recipient,p_from_address,p_email_context);
  insert into kfarmai_private.daily_review_approval_audit
    (approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
  values (p_approval_id,'CONTENT','ISSUED',p_artifact_id,p_manifest_sha256,p_content_token_hash),
         (p_approval_id,'PUBLISH','ISSUED',p_artifact_id,p_manifest_sha256,p_publish_token_hash);
  return jsonb_build_object('approval_id',p_approval_id,'state','ISSUED',
                            'superseded_approval_id',p_old_approval_id,'published',false);
end $$;

create or replace function public.daily_review_preview_get(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a kfarmai_private.daily_review_approvals%rowtype;
declare content_state text;
declare publish_state text;
declare p kfarmai_private.daily_review_previews%rowtype;
begin
  if coalesce(p_token,'') !~ '^[A-Za-z0-9_-]{32,255}$' then raise exception 'APPROVAL_TOKEN_INVALID'; end if;
  select * into strict a from kfarmai_private.daily_review_approvals
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if a.state<>'PENDING' or a.used_at is not null or a.expires_at<=clock_timestamp() then
    raise exception 'APPROVAL_NOT_AVAILABLE';
  end if;
  select state into strict content_state from kfarmai_private.daily_review_approvals
    where approval_id=a.approval_id and approval_type='CONTENT';
  select state into strict publish_state from kfarmai_private.daily_review_approvals
    where approval_id=a.approval_id and approval_type='PUBLISH';
  select * into strict p from kfarmai_private.daily_review_previews where approval_id=a.approval_id;
  if p.artifact_id<>a.artifact_id or p.manifest_sha256<>a.manifest_sha256 then
    raise exception 'REVIEW_PREVIEW_BINDING';
  end if;
  return jsonb_build_object('approval_id',a.approval_id,'approval_type',a.approval_type,
    'content_state',content_state,'publish_state',publish_state,
    'artifact_id',a.artifact_id,'manifest_sha256',a.manifest_sha256,'state',a.state,'expires_at',a.expires_at,
    'article',p.article,'review',p.review,'source_check',p.source_check,
    'article_sha256',p.article_sha256,'html_sha256',p.html_sha256,
    'hero_sha256',p.hero_sha256,'infographic_sha256',p.infographic_sha256,'usage',a.usage,
    'review_url',a.review_url,'published',false);
end $$;

revoke all on function public.daily_review_email_revision_issue(
  text,bigint,text,text,bigint,text,text,text,text,text,text,jsonb,jsonb,text,text,
  timestamptz,text,text,jsonb,text,text) from public, anon, authenticated;
grant execute on function public.daily_review_email_revision_issue(
  text,bigint,text,text,bigint,text,text,text,text,text,text,jsonb,jsonb,text,text,
  timestamptz,text,text,jsonb,text,text) to service_role;

commit;
