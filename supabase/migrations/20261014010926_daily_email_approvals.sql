-- Private, token-hash-only, two-step REVIEW approval ledger.
-- Browser roles receive neither table access nor executable approval functions.
begin;

create table kfarmai_private.daily_review_approvals (
  approval_id text not null check (approval_id ~ '^review-[A-Za-z0-9_-]{1,96}$'),
  approval_type text not null check (approval_type in ('CONTENT','PUBLISH')),
  artifact_id bigint not null check (artifact_id > 0),
  artifact_digest text not null check (artifact_digest ~ '^sha256:[a-f0-9]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  head_sha text not null check (head_sha ~ '^[a-f0-9]{40}$'),
  review_url text not null check (review_url ~ '^https://github\.com/dgilink/kfarmai/issues/[1-9][0-9]*$'),
  title text not null check (length(title) between 1 and 160),
  summary text not null check (length(summary) <= 600),
  official_sources jsonb not null check (jsonb_typeof(official_sources) = 'array'),
  usage jsonb not null check (jsonb_typeof(usage) = 'object'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  state text not null default 'PENDING' check (state in ('PENDING','CONTENT_APPROVED','PUBLISH_APPROVED','EXPIRED','HELD')),
  used_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  primary key (approval_id, approval_type),
  check (expires_at > created_at),
  check ((state = 'PENDING' and used_at is null) or (state <> 'PENDING' and used_at is not null))
);

create table kfarmai_private.daily_review_approval_audit (
  id bigint generated always as identity primary key,
  approval_id text not null,
  approval_type text not null check (approval_type in ('CONTENT','PUBLISH')),
  event text not null check (event in ('ISSUED','CONTENT_APPROVED','PUBLISH_APPROVED','REPLAY_BLOCKED','EXPIRED_BLOCKED','ORDER_BLOCKED','BINDING_BLOCKED')),
  artifact_id bigint not null,
  manifest_sha256 text not null,
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint text,
  created_at timestamptz not null default clock_timestamp()
);

create table kfarmai_private.daily_review_email_outbox (
  approval_id text not null,
  approval_type text not null check (approval_type in ('CONTENT','PUBLISH')),
  provider text not null check (provider in ('resend','fake')),
  delivery_state text not null check (delivery_state in ('PENDING','SENT','FAILED','SKIPPED')),
  provider_message_id text,
  idempotency_key text not null unique check (idempotency_key ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  sent_at timestamptz,
  primary key (approval_id, approval_type),
  foreign key (approval_id, approval_type)
    references kfarmai_private.daily_review_approvals(approval_id, approval_type)
);

alter table kfarmai_private.daily_review_approvals enable row level security;
alter table kfarmai_private.daily_review_approval_audit enable row level security;
alter table kfarmai_private.daily_review_email_outbox enable row level security;
revoke all on table kfarmai_private.daily_review_approvals,
  kfarmai_private.daily_review_approval_audit,
  kfarmai_private.daily_review_email_outbox from public, anon, authenticated, service_role;

create function public.daily_review_approval_review(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r kfarmai_private.daily_review_approvals%rowtype;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{32,256}$' then raise exception 'APPROVAL_TOKEN_INVALID'; end if;
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

create function public.daily_review_approval_apply(p_token text, p_action text, p_manifest_sha256 text, p_request_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r kfarmai_private.daily_review_approvals%rowtype; content kfarmai_private.daily_review_approvals%rowtype;
begin
  if coalesce(p_token, '') !~ '^[A-Za-z0-9_-]{32,256}$'
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
