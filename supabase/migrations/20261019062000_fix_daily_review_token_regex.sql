-- PostgreSQL limits bounded regex repetitions to 255.  The original range
-- expression therefore raised before an approval token could be reviewed.
-- This forward-only replacement preserves the 32-byte token minimum and every
-- approval, binding, expiry, ordering, and replay guard.
begin;

create or replace function public.daily_review_approval_review(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r kfarmai_private.daily_review_approvals%rowtype;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{32,255}$' then raise exception 'APPROVAL_TOKEN_INVALID'; end if;
  select * into strict r from kfarmai_private.daily_review_approvals
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if r.expires_at <= clock_timestamp() and r.state = 'PENDING' then
    update kfarmai_private.daily_review_approvals set state='EXPIRED', used_at=clock_timestamp()
      where approval_id=r.approval_id and approval_type=r.approval_type;
    insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
      values(r.approval_id,r.approval_type,'EXPIRED_BLOCKED',r.artifact_id,r.manifest_sha256,r.token_hash);
    raise exception 'APPROVAL_EXPIRED';
  end if;
  return jsonb_build_object('approval_id',r.approval_id,'approval_type',r.approval_type,
    'artifact_id',r.artifact_id,'artifact_digest',r.artifact_digest,'manifest_sha256',r.manifest_sha256,
    'head_sha',r.head_sha,'review_url',r.review_url,'title',r.title,'summary',r.summary,
    'official_sources',r.official_sources,'usage',r.usage,'expires_at',r.expires_at,'state',r.state);
end $$;

create or replace function public.daily_review_approval_apply(p_token text, p_action text, p_manifest_sha256 text, p_request_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r kfarmai_private.daily_review_approvals%rowtype; content kfarmai_private.daily_review_approvals%rowtype;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{32,255}$'
     or p_action not in ('CONTENT_APPROVE','PUBLISH_APPROVE')
     or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_request_fingerprint,'') !~ '^[a-f0-9]{64}$' then
    raise exception 'APPROVAL_REQUEST_INVALID';
  end if;
  select * into strict r from kfarmai_private.daily_review_approvals
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if r.manifest_sha256 <> p_manifest_sha256
     or (p_action='CONTENT_APPROVE' and r.approval_type <> 'CONTENT')
     or (p_action='PUBLISH_APPROVE' and r.approval_type <> 'PUBLISH') then
    insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash,request_fingerprint)
      values(r.approval_id,r.approval_type,'BINDING_BLOCKED',r.artifact_id,r.manifest_sha256,r.token_hash,p_request_fingerprint);
    raise exception 'APPROVAL_BINDING_MISMATCH';
  end if;
  if r.expires_at <= clock_timestamp() then
    if r.state='PENDING' then update kfarmai_private.daily_review_approvals set state='EXPIRED',used_at=clock_timestamp() where approval_id=r.approval_id and approval_type=r.approval_type; end if;
    insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash,request_fingerprint)
      values(r.approval_id,r.approval_type,'EXPIRED_BLOCKED',r.artifact_id,r.manifest_sha256,r.token_hash,p_request_fingerprint);
    raise exception 'APPROVAL_EXPIRED';
  end if;
  if r.state <> 'PENDING' then
    insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash,request_fingerprint)
      values(r.approval_id,r.approval_type,'REPLAY_BLOCKED',r.artifact_id,r.manifest_sha256,r.token_hash,p_request_fingerprint);
    raise exception 'APPROVAL_REPLAY_BLOCKED';
  end if;
  if p_action='PUBLISH_APPROVE' then
    select * into strict content from kfarmai_private.daily_review_approvals where approval_id=r.approval_id and approval_type='CONTENT' for update;
    if content.state <> 'CONTENT_APPROVED' or content.artifact_id <> r.artifact_id
       or content.manifest_sha256 <> r.manifest_sha256 or content.head_sha <> r.head_sha then
      insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash,request_fingerprint)
        values(r.approval_id,r.approval_type,'ORDER_BLOCKED',r.artifact_id,r.manifest_sha256,r.token_hash,p_request_fingerprint);
      raise exception 'CONTENT_APPROVAL_REQUIRED';
    end if;
  end if;
  update kfarmai_private.daily_review_approvals set state=case when p_action='CONTENT_APPROVE' then 'CONTENT_APPROVED' else 'PUBLISH_APPROVED' end,
    used_at=clock_timestamp() where approval_id=r.approval_id and approval_type=r.approval_type;
  insert into kfarmai_private.daily_review_approval_audit(approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash,request_fingerprint)
    values(r.approval_id,r.approval_type,case when p_action='CONTENT_APPROVE' then 'CONTENT_APPROVED' else 'PUBLISH_APPROVED' end,r.artifact_id,r.manifest_sha256,r.token_hash,p_request_fingerprint);
  return jsonb_build_object('approval_id',r.approval_id,'approval_type',r.approval_type,
    'artifact_id',r.artifact_id,'manifest_sha256',r.manifest_sha256,
    'state',case when p_action='CONTENT_APPROVE' then 'CONTENT_APPROVED' else 'PUBLISH_APPROVED' end,
    'published',false);
end $$;

revoke all on function public.daily_review_approval_review(text) from public, anon, authenticated;
revoke all on function public.daily_review_approval_apply(text,text,text,text) from public, anon, authenticated;
grant execute on function public.daily_review_approval_review(text) to service_role;
grant execute on function public.daily_review_approval_apply(text,text,text,text) to service_role;
commit;
