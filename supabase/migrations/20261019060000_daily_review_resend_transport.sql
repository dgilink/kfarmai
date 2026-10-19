-- Server-side REVIEW mail transport.  This is additive: existing approval
-- tokens and browser-facing approval RPC contracts remain unchanged.
begin;

alter table kfarmai_private.daily_review_email_outbox
  drop constraint if exists daily_review_email_outbox_delivery_state_check;
alter table kfarmai_private.daily_review_email_outbox
  add constraint daily_review_email_outbox_delivery_state_check
  check (delivery_state in ('PENDING','SENDING','SENT','FAILED','SKIPPED','HELD'));
alter table kfarmai_private.daily_review_email_outbox
  add column if not exists recipient text,
  add column if not exists from_address text,
  add column if not exists email_context jsonb;

create or replace function public.daily_review_email_issue(
  p_approval_id text, p_artifact_id bigint, p_artifact_digest text,
  p_manifest_sha256 text, p_head_sha text, p_review_url text,
  p_title text, p_summary text, p_official_sources jsonb, p_usage jsonb,
  p_content_token_hash text, p_publish_token_hash text, p_expires_at timestamptz,
  p_recipient text, p_from_address text, p_email_context jsonb,
  p_content_idempotency_key text, p_publish_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing kfarmai_private.daily_review_approvals%rowtype;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$'
     or p_artifact_id <= 0 or coalesce(p_artifact_digest,'') !~ '^sha256:[a-f0-9]{64}$'
     or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_head_sha,'') !~ '^[a-f0-9]{40}$'
     or coalesce(p_review_url,'') !~ '^https://github\.com/dgilink/kfarmai/issues/[1-9][0-9]*$'
     or length(coalesce(p_title,'')) not between 1 and 160 or length(coalesce(p_summary,'')) > 600
     or jsonb_typeof(p_official_sources) <> 'array' or jsonb_typeof(p_usage) <> 'object'
     or coalesce(p_content_token_hash,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_publish_token_hash,'') !~ '^[a-f0-9]{64}$'
     or p_expires_at <= clock_timestamp() or coalesce(p_recipient,'') = ''
     or coalesce(p_from_address,'') = '' or jsonb_typeof(p_email_context) <> 'object'
     or coalesce(p_content_idempotency_key,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_publish_idempotency_key,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'REVIEW_EMAIL_ISSUE_INVALID';
  end if;
  insert into kfarmai_private.daily_review_approvals
    (approval_id,approval_type,artifact_id,artifact_digest,manifest_sha256,head_sha,review_url,title,summary,official_sources,usage,token_hash,expires_at)
  values
    (p_approval_id,'CONTENT',p_artifact_id,p_artifact_digest,p_manifest_sha256,p_head_sha,p_review_url,p_title,p_summary,p_official_sources,p_usage,p_content_token_hash,p_expires_at),
    (p_approval_id,'PUBLISH',p_artifact_id,p_artifact_digest,p_manifest_sha256,p_head_sha,p_review_url,p_title,p_summary,p_official_sources,p_usage,p_publish_token_hash,p_expires_at)
  on conflict (approval_id,approval_type) do nothing;
  select * into strict existing from kfarmai_private.daily_review_approvals
   where approval_id=p_approval_id and approval_type='CONTENT' for update;
  if existing.artifact_id <> p_artifact_id or existing.artifact_digest <> p_artifact_digest
     or existing.manifest_sha256 <> p_manifest_sha256 or existing.head_sha <> p_head_sha
     or existing.token_hash <> p_content_token_hash then raise exception 'REVIEW_EMAIL_BINDING_MISMATCH'; end if;
  select * into strict existing from kfarmai_private.daily_review_approvals
   where approval_id=p_approval_id and approval_type='PUBLISH' for update;
  if existing.artifact_id <> p_artifact_id or existing.manifest_sha256 <> p_manifest_sha256
     or existing.token_hash <> p_publish_token_hash then raise exception 'REVIEW_EMAIL_BINDING_MISMATCH'; end if;
  insert into kfarmai_private.daily_review_email_outbox
    (approval_id,approval_type,provider,delivery_state,idempotency_key,recipient,from_address,email_context)
  values
    (p_approval_id,'CONTENT','resend','PENDING',p_content_idempotency_key,p_recipient,p_from_address,p_email_context),
    (p_approval_id,'PUBLISH','resend','HELD',p_publish_idempotency_key,p_recipient,p_from_address,p_email_context)
  on conflict (approval_id,approval_type) do nothing;
  return jsonb_build_object('approval_id',p_approval_id,'state','ISSUED','published',false);
end $$;

create or replace function public.daily_review_email_claim(p_approval_id text, p_approval_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o kfarmai_private.daily_review_email_outbox%rowtype;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$' or p_approval_type not in ('CONTENT','PUBLISH') then
    raise exception 'REVIEW_EMAIL_CLAIM_INVALID';
  end if;
  select * into strict o from kfarmai_private.daily_review_email_outbox
    where approval_id=p_approval_id and approval_type=p_approval_type for update;
  if o.delivery_state='SENT' then return jsonb_build_object('state','SENT','published',false); end if;
  if o.delivery_state='HELD' then return jsonb_build_object('state','HELD','published',false); end if;
  if o.delivery_state='SENDING' and o.created_at > clock_timestamp()-interval '15 minutes' then
    return jsonb_build_object('state','SENDING','published',false);
  end if;
  update kfarmai_private.daily_review_email_outbox set delivery_state='SENDING'
    where approval_id=p_approval_id and approval_type=p_approval_type;
  return jsonb_build_object('state','SENDING','approval_id',o.approval_id,'approval_type',o.approval_type,
    'recipient',o.recipient,'from_address',o.from_address,'email_context',o.email_context,
    'idempotency_key',o.idempotency_key,'published',false);
end $$;

create or replace function public.daily_review_email_complete(
  p_approval_id text, p_approval_type text, p_provider_message_id text, p_success boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o kfarmai_private.daily_review_email_outbox%rowtype;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$' or p_approval_type not in ('CONTENT','PUBLISH') then
    raise exception 'REVIEW_EMAIL_COMPLETE_INVALID';
  end if;
  select * into strict o from kfarmai_private.daily_review_email_outbox
    where approval_id=p_approval_id and approval_type=p_approval_type for update;
  if o.delivery_state='SENT' then return jsonb_build_object('state','SENT','published',false); end if;
  if p_success is true and coalesce(p_provider_message_id,'') <> '' then
    update kfarmai_private.daily_review_email_outbox set delivery_state='SENT',provider_message_id=p_provider_message_id,sent_at=clock_timestamp()
      where approval_id=p_approval_id and approval_type=p_approval_type;
    return jsonb_build_object('state','SENT','provider_message_id',p_provider_message_id,'published',false);
  end if;
  update kfarmai_private.daily_review_email_outbox set delivery_state='FAILED'
    where approval_id=p_approval_id and approval_type=p_approval_type;
  return jsonb_build_object('state','FAILED','published',false);
end $$;

create or replace function public.daily_review_email_activate_publish(p_approval_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare content kfarmai_private.daily_review_approvals%rowtype;
begin
  select * into strict content from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type='CONTENT';
  if content.state <> 'CONTENT_APPROVED' then raise exception 'CONTENT_APPROVAL_REQUIRED'; end if;
  update kfarmai_private.daily_review_email_outbox set delivery_state='PENDING'
    where approval_id=p_approval_id and approval_type='PUBLISH' and delivery_state='HELD';
  return jsonb_build_object('state','PENDING','published',false);
end $$;

revoke all on function public.daily_review_email_issue(text,bigint,text,text,text,text,text,text,jsonb,jsonb,text,text,timestamptz,text,text,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.daily_review_email_claim(text,text) from public, anon, authenticated;
revoke all on function public.daily_review_email_complete(text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.daily_review_email_activate_publish(text) from public, anon, authenticated;
grant execute on function public.daily_review_email_issue(text,bigint,text,text,text,text,text,text,jsonb,jsonb,text,text,timestamptz,text,text,jsonb,text,text) to service_role;
grant execute on function public.daily_review_email_claim(text,text) to service_role;
grant execute on function public.daily_review_email_complete(text,text,text,boolean) to service_role;
grant execute on function public.daily_review_email_activate_publish(text) to service_role;
commit;
