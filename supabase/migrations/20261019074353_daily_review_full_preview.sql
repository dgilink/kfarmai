-- Immutable, token-gated REVIEW preview material. Browser roles never receive
-- table access; all reads are bound to an active one-time approval token.
begin;

alter table kfarmai_private.daily_review_approval_audit
  drop constraint if exists daily_review_approval_audit_event_check;
alter table kfarmai_private.daily_review_approval_audit
  add constraint daily_review_approval_audit_event_check
  check (event in ('ISSUED','CONTENT_APPROVED','PUBLISH_APPROVED','REPLAY_BLOCKED',
                  'EXPIRED_BLOCKED','ORDER_BLOCKED','BINDING_BLOCKED',
                  'TOKEN_REVOKED','TOKEN_ROTATED','CONTENT_REVIEW_RESET'));

create table kfarmai_private.daily_review_previews (
  approval_id text primary key,
  artifact_id bigint not null check (artifact_id > 0),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  article_sha256 text not null check (article_sha256 ~ '^[a-f0-9]{64}$'),
  html_sha256 text not null check (html_sha256 ~ '^[a-f0-9]{64}$'),
  hero_sha256 text not null check (hero_sha256 ~ '^[a-f0-9]{64}$'),
  infographic_sha256 text not null check (infographic_sha256 ~ '^[a-f0-9]{64}$'),
  article jsonb not null check (jsonb_typeof(article) = 'object'),
  review jsonb not null check (jsonb_typeof(review) = 'object'),
  source_check jsonb not null check (jsonb_typeof(source_check) = 'object'),
  article_html text not null check (octet_length(article_html) between 1 and 100000),
  hero_base64 text not null check (length(hero_base64) between 16 and 3000000),
  infographic_svg text not null check (octet_length(infographic_svg) between 1 and 200000),
  created_at timestamptz not null default clock_timestamp()
);

alter table kfarmai_private.daily_review_previews enable row level security;
revoke all on table kfarmai_private.daily_review_previews from public, anon, authenticated, service_role;

create function public.daily_review_preview_store(
  p_approval_id text, p_artifact_id bigint, p_manifest_sha256 text,
  p_article_sha256 text, p_html_sha256 text, p_hero_sha256 text, p_infographic_sha256 text,
  p_article jsonb, p_review jsonb, p_source_check jsonb,
  p_article_html text, p_hero_base64 text, p_infographic_svg text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c kfarmai_private.daily_review_approvals%rowtype;
declare pub kfarmai_private.daily_review_approvals%rowtype;
declare existing kfarmai_private.daily_review_previews%rowtype;
declare svg_check text;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$'
     or p_artifact_id <= 0 or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_article_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_html_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_hero_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_infographic_sha256,'') !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(p_article) <> 'object' or jsonb_typeof(p_review) <> 'object'
     or jsonb_typeof(p_source_check) <> 'object'
     or octet_length(coalesce(p_article_html,'')) not between 1 and 100000
     or length(coalesce(p_hero_base64,'')) not between 16 and 3000000
     or octet_length(coalesce(p_infographic_svg,'')) not between 1 and 200000 then
    raise exception 'REVIEW_PREVIEW_INVALID';
  end if;
  select * into strict c from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type='CONTENT' for update;
  select * into strict pub from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type='PUBLISH' for update;
  if c.artifact_id<>p_artifact_id or pub.artifact_id<>p_artifact_id
     or c.manifest_sha256<>p_manifest_sha256 or pub.manifest_sha256<>p_manifest_sha256
     or c.state not in ('PENDING','CONTENT_APPROVED') or pub.state<>'PENDING'
     or (c.state='PENDING' and c.used_at is not null)
     or (c.state='CONTENT_APPROVED' and c.used_at is null) or pub.used_at is not null
     or p_article->>'title'<>c.title or p_review->>'approval_id'<>p_approval_id
     or p_review->>'title'<>c.title or p_source_check->>'status'<>'PASS' then
    raise exception 'REVIEW_PREVIEW_BINDING';
  end if;
  begin
    if encode(extensions.digest(convert_to(p_article_html,'UTF8'),'sha256'),'hex')<>p_html_sha256
       or encode(extensions.digest(decode(p_hero_base64,'base64'),'sha256'),'hex')<>p_hero_sha256
       or encode(extensions.digest(convert_to(p_infographic_svg,'UTF8'),'sha256'),'hex')<>p_infographic_sha256
       or substring(decode(p_hero_base64,'base64') from 1 for 4)<>decode('52494646','hex')
       or substring(decode(p_hero_base64,'base64') from 9 for 4)<>decode('57454250','hex') then
      raise exception 'REVIEW_PREVIEW_HASH';
    end if;
  exception when others then
    raise exception 'REVIEW_PREVIEW_HASH';
  end;
  svg_check := replace(lower(p_infographic_svg),'http://www.w3.org/2000/svg','');
  if p_infographic_svg !~ '^<svg[ >]' or p_infographic_svg !~ '</svg>$'
     or svg_check ~ '<!doctype|<!entity|<\s*(script|foreignobject|image|use|iframe|object|embed|style|a)([ >])'
     or svg_check ~ '\son[a-z]+\s*=|(^|[^a-z])(href|xlink:href|src)\s*=|url\s*\(|javascript:|data:|https?://' then
    raise exception 'REVIEW_PREVIEW_SVG_UNSAFE';
  end if;
  insert into kfarmai_private.daily_review_previews
    (approval_id,artifact_id,manifest_sha256,article_sha256,html_sha256,hero_sha256,infographic_sha256,
     article,review,source_check,article_html,hero_base64,infographic_svg)
  values
    (p_approval_id,p_artifact_id,p_manifest_sha256,p_article_sha256,p_html_sha256,p_hero_sha256,p_infographic_sha256,
     p_article,p_review,p_source_check,p_article_html,p_hero_base64,p_infographic_svg)
  on conflict (approval_id) do nothing;
  select * into strict existing from kfarmai_private.daily_review_previews where approval_id=p_approval_id;
  if existing.artifact_id<>p_artifact_id or existing.manifest_sha256<>p_manifest_sha256
     or existing.article_sha256<>p_article_sha256 or existing.html_sha256<>p_html_sha256
     or existing.hero_sha256<>p_hero_sha256 or existing.infographic_sha256<>p_infographic_sha256 then
    raise exception 'REVIEW_PREVIEW_IMMUTABLE';
  end if;
  return jsonb_build_object('approval_id',p_approval_id,'state','PREVIEW_BOUND','published',false);
end $$;

create function public.daily_review_preview_get(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a kfarmai_private.daily_review_approvals%rowtype;
declare p kfarmai_private.daily_review_previews%rowtype;
begin
  if coalesce(p_token,'') !~ '^[A-Za-z0-9_-]{32,255}$' then raise exception 'APPROVAL_TOKEN_INVALID'; end if;
  select * into strict a from kfarmai_private.daily_review_approvals
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if a.state<>'PENDING' or a.used_at is not null or a.expires_at<=clock_timestamp() then
    raise exception 'APPROVAL_NOT_AVAILABLE';
  end if;
  select * into strict p from kfarmai_private.daily_review_previews where approval_id=a.approval_id;
  if p.artifact_id<>a.artifact_id or p.manifest_sha256<>a.manifest_sha256 then
    raise exception 'REVIEW_PREVIEW_BINDING';
  end if;
  return jsonb_build_object('approval_id',a.approval_id,'approval_type',a.approval_type,
    'artifact_id',a.artifact_id,'manifest_sha256',a.manifest_sha256,'state',a.state,'expires_at',a.expires_at,
    'article',p.article,'review',p.review,'source_check',p.source_check,
    'article_sha256',p.article_sha256,'html_sha256',p.html_sha256,
    'hero_sha256',p.hero_sha256,'infographic_sha256',p.infographic_sha256,'usage',a.usage,
    'review_url',a.review_url,'published',false);
end $$;

create function public.daily_review_preview_asset(p_token text, p_asset text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a kfarmai_private.daily_review_approvals%rowtype;
declare p kfarmai_private.daily_review_previews%rowtype;
begin
  if coalesce(p_token,'') !~ '^[A-Za-z0-9_-]{32,255}$' or p_asset not in ('hero','infographic') then
    raise exception 'REVIEW_ASSET_INVALID';
  end if;
  select * into strict a from kfarmai_private.daily_review_approvals
    where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
  if a.state<>'PENDING' or a.used_at is not null or a.expires_at<=clock_timestamp() then
    raise exception 'APPROVAL_NOT_AVAILABLE';
  end if;
  select * into strict p from kfarmai_private.daily_review_previews where approval_id=a.approval_id;
  if p.artifact_id<>a.artifact_id or p.manifest_sha256<>a.manifest_sha256 then
    raise exception 'REVIEW_PREVIEW_BINDING';
  end if;
  if p_asset='hero' then
    return jsonb_build_object('content_type','image/webp','body_base64',p.hero_base64,'sha256',p.hero_sha256);
  end if;
  return jsonb_build_object('content_type','image/svg+xml; charset=UTF-8','body_text',p.infographic_svg,'sha256',p.infographic_sha256);
end $$;

-- A CONTENT approval made before the immutable full preview existed is not
-- sufficient evidence of full-content review. Rotation may reopen only that
-- narrow state; PUBLISH must still be pending and unused.
create or replace function public.daily_review_email_rotate(
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
  if c.artifact_id<>p_artifact_id or pub.artifact_id<>p_artifact_id
     or c.manifest_sha256<>p_manifest_sha256 or pub.manifest_sha256<>p_manifest_sha256
     or c.state not in ('PENDING','CONTENT_APPROVED') or pub.state<>'PENDING'
     or (c.state='PENDING' and c.used_at is not null)
     or (c.state='CONTENT_APPROVED' and c.used_at is null) or pub.used_at is not null then
    raise exception 'REVIEW_EMAIL_ROTATE_BINDING';
  end if;
  if c.state='CONTENT_APPROVED' then
    insert into kfarmai_private.daily_review_approval_audit
      (approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
    values (c.approval_id,'CONTENT','CONTENT_REVIEW_RESET',c.artifact_id,c.manifest_sha256,c.token_hash);
  end if;
  insert into kfarmai_private.daily_review_approval_audit
    (approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
  values (c.approval_id,'CONTENT','TOKEN_REVOKED',c.artifact_id,c.manifest_sha256,c.token_hash),
         (pub.approval_id,'PUBLISH','TOKEN_REVOKED',pub.artifact_id,pub.manifest_sha256,pub.token_hash);
  update kfarmai_private.daily_review_approvals
    set token_hash=p_content_token_hash, token_version=p_token_version,
        expires_at=p_expires_at, state='PENDING', used_at=null
    where approval_id=p_approval_id and approval_type='CONTENT';
  update kfarmai_private.daily_review_approvals
    set token_hash=p_publish_token_hash, token_version=p_token_version,
        expires_at=p_expires_at, state='PENDING', used_at=null
    where approval_id=p_approval_id and approval_type='PUBLISH';
  insert into kfarmai_private.daily_review_approval_audit
    (approval_id,approval_type,event,artifact_id,manifest_sha256,token_hash)
  values (c.approval_id,'CONTENT','TOKEN_ROTATED',c.artifact_id,c.manifest_sha256,p_content_token_hash),
         (pub.approval_id,'PUBLISH','TOKEN_ROTATED',pub.artifact_id,pub.manifest_sha256,p_publish_token_hash);
  display := format('input_tokens=%s, output_tokens=%s, reasoning_tokens=%s',
    coalesce(c.usage #>> '{usage,input_tokens}','unknown'),
    coalesce(c.usage #>> '{usage,output_tokens}','unknown'),
    coalesce(c.usage #>> '{usage,output_tokens_details,reasoning_tokens}','unknown'));
  update kfarmai_private.daily_review_email_outbox
    set delivery_state='PENDING', provider_message_id=null, sent_at=null,
        idempotency_key=p_content_idempotency_key,
        email_context=jsonb_set(email_context,'{input_output_usage}',to_jsonb(display),true)
    where approval_id=p_approval_id and approval_type='CONTENT';
  update kfarmai_private.daily_review_email_outbox
    set delivery_state='HELD', provider_message_id=null, sent_at=null,
        idempotency_key=p_publish_idempotency_key,
        email_context=jsonb_set(email_context,'{input_output_usage}',to_jsonb(display),true)
    where approval_id=p_approval_id and approval_type='PUBLISH';
  return jsonb_build_object('approval_id',p_approval_id,'state','ROTATED','published',false);
end $$;

revoke all on function public.daily_review_preview_store(text,bigint,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,text) from public, anon, authenticated;
revoke all on function public.daily_review_preview_get(text) from public, anon, authenticated;
revoke all on function public.daily_review_preview_asset(text,text) from public, anon, authenticated;
grant execute on function public.daily_review_preview_store(text,bigint,text,text,text,text,text,jsonb,jsonb,jsonb,text,text,text) to service_role;
grant execute on function public.daily_review_preview_get(text) to service_role;
grant execute on function public.daily_review_preview_asset(text,text) to service_role;
revoke all on function public.daily_review_email_rotate(text,bigint,text,text,text,text,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.daily_review_email_rotate(text,bigint,text,text,text,text,timestamptz,text,text) to service_role;

commit;
