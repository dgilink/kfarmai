-- Rotation is additive and preserves the immutable package identity.  A
-- token_version is non-secret input to the server HMAC; the raw token is
-- never stored in Postgres.
begin;

alter table kfarmai_private.daily_review_approvals
  add column if not exists token_version text not null default 'legacy'
  check (token_version ~ '^[A-Za-z0-9_-]{1,96}$');

alter table kfarmai_private.daily_review_approval_audit
  drop constraint if exists daily_review_approval_audit_event_check;
alter table kfarmai_private.daily_review_approval_audit
  add constraint daily_review_approval_audit_event_check
  check (event in ('ISSUED','CONTENT_APPROVED','PUBLISH_APPROVED','REPLAY_BLOCKED',
                  'EXPIRED_BLOCKED','ORDER_BLOCKED','BINDING_BLOCKED',
                  'TOKEN_REVOKED','TOKEN_ROTATED'));

create or replace function public.daily_review_email_claim(p_approval_id text, p_approval_type text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o kfarmai_private.daily_review_email_outbox%rowtype;
declare a kfarmai_private.daily_review_approvals%rowtype;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$' or p_approval_type not in ('CONTENT','PUBLISH') then
    raise exception 'REVIEW_EMAIL_CLAIM_INVALID';
  end if;
  select * into strict o from kfarmai_private.daily_review_email_outbox
    where approval_id=p_approval_id and approval_type=p_approval_type for update;
  select * into strict a from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type=p_approval_type;
  if o.delivery_state='SENT' then return jsonb_build_object('state','SENT','published',false); end if;
  if o.delivery_state='HELD' then return jsonb_build_object('state','HELD','published',false); end if;
  if o.delivery_state='SENDING' and o.created_at > clock_timestamp()-interval '15 minutes' then
    return jsonb_build_object('state','SENDING','published',false);
  end if;
  update kfarmai_private.daily_review_email_outbox set delivery_state='SENDING'
    where approval_id=p_approval_id and approval_type=p_approval_type;
  return jsonb_build_object('state','SENDING','approval_id',o.approval_id,'approval_type',o.approval_type,
    'recipient',o.recipient,'from_address',o.from_address,'email_context',o.email_context,
    'idempotency_key',o.idempotency_key,'token_version',a.token_version,'published',false);
end $$;

create function public.daily_review_email_rotate(
  p_approval_id text, p_artifact_id bigint, p_manifest_sha256 text,
  p_content_token_hash text, p_publish_token_hash text, p_token_version text,
  p_expires_at timestamptz, p_content_idempotency_key text, p_publish_idempotency_key text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c kfarmai_private.daily_review_approvals%rowtype;
declare pub kfarmai_private.daily_review_approvals%rowtype;
declare display text;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$'
     or p_artifact_id <= 0 or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_content_token_hash,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_publish_token_hash,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_token_version,'') !~ '^[A-Za-z0-9_-]{1,96}$'
     or p_expires_at <= clock_timestamp()
     or coalesce(p_content_idempotency_key,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_publish_idempotency_key,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'REVIEW_EMAIL_ROTATE_INVALID';
  end if;
  select * into strict c from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type='CONTENT' for update;
  select * into strict pub from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type='PUBLISH' for update;
  if c.artifact_id <> p_artifact_id or pub.artifact_id <> p_artifact_id
     or c.manifest_sha256 <> p_manifest_sha256 or pub.manifest_sha256 <> p_manifest_sha256
     or c.state <> 'PENDING' or pub.state <> 'PENDING' or c.used_at is not null or pub.used_at is not null then
    raise exception 'REVIEW_EMAIL_ROTATE_BINDING';
  end if;
  insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
  values (c.approval_id,'CONTENT','TOKEN_REVOKED',c.artifact_id,c.manifest_sha256,c.token_hash),
         (pub.approval_id,'PUBLISH','TOKEN_REVOKED',pub.artifact_id,pub.manifest_sha256,pub.token_hash);
  update kfarmai_private.daily_review_approvals set token_hash=p_content_token_hash, token_version=p_token_version,
      expires_at=p_expires_at, state='PENDING', used_at=null
    where approval_id=p_approval_id and approval_type='CONTENT';
  update kfarmai_private.daily_review_approvals set token_hash=p_publish_token_hash, token_version=p_token_version,
      expires_at=p_expires_at, state='PENDING', used_at=null
    where approval_id=p_approval_id and approval_type='PUBLISH';
  insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
  values (c.approval_id,'CONTENT','TOKEN_ROTATED',c.artifact_id,c.manifest_sha256,p_content_token_hash),
         (pub.approval_id,'PUBLISH','TOKEN_ROTATED',pub.artifact_id,pub.manifest_sha256,p_publish_token_hash);
  display := format('input_tokens=%s, output_tokens=%s, reasoning_tokens=%s',
    coalesce(c.usage #>> '{usage,input_tokens}','unknown'),
    coalesce(c.usage #>> '{usage,output_tokens}','unknown'),
    coalesce(c.usage #>> '{usage,output_tokens_details,reasoning_tokens}','unknown'));
  update kfarmai_private.daily_review_email_outbox set delivery_state='PENDING', provider_message_id=null,
      sent_at=null, idempotency_key=p_content_idempotency_key,
      email_context=jsonb_set(email_context,'{input_output_usage}',to_jsonb(display),true)
    where approval_id=p_approval_id and approval_type='CONTENT';
  update kfarmai_private.daily_review_email_outbox set delivery_state='HELD', provider_message_id=null,
      sent_at=null, idempotency_key=p_publish_idempotency_key,
      email_context=jsonb_set(email_context,'{input_output_usage}',to_jsonb(display),true)
    where approval_id=p_approval_id and approval_type='PUBLISH';
  return jsonb_build_object('approval_id',p_approval_id,'state','ROTATED','published',false);
end $$;

revoke all on function public.daily_review_email_claim(text,text) from public, anon, authenticated;
revoke all on function public.daily_review_email_rotate(text,bigint,text,text,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.daily_review_email_claim(text,text) to service_role;
grant execute on function public.daily_review_email_rotate(text,bigint,text,text,text,text,timestamptz,text,text) to service_role;
commit;
