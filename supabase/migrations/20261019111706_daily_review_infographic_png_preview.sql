-- Browser-compatible raster preview for an already-bound, sanitized SVG.
-- The immutable publication SVG and its manifest hash are never changed.
begin;

alter table kfarmai_private.daily_review_previews
  add column infographic_preview_base64 text,
  add column infographic_preview_sha256 text,
  add column infographic_preview_width integer,
  add column infographic_preview_height integer;

alter table kfarmai_private.daily_review_previews
  add constraint daily_review_infographic_preview_complete check (
    num_nonnulls(infographic_preview_base64,infographic_preview_sha256,
      infographic_preview_width,infographic_preview_height) in (0,4)
    and (infographic_preview_sha256 is null or
      (length(infographic_preview_base64) between 100 and 5000000
      and infographic_preview_sha256 ~ '^[a-f0-9]{64}$'
      and infographic_preview_width between 320 and 2400
      and infographic_preview_height between 200 and 4000))
  );

create function public.daily_review_infographic_preview_store(
  p_approval_id text, p_artifact_id bigint, p_manifest_sha256 text,
  p_source_svg_sha256 text, p_preview_png_sha256 text,
  p_preview_png_base64 text, p_width integer, p_height integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare c kfarmai_private.daily_review_approvals%rowtype;
declare pub kfarmai_private.daily_review_approvals%rowtype;
declare preview kfarmai_private.daily_review_previews%rowtype;
declare png bytea;
declare actual_width bigint;
declare actual_height bigint;
begin
  if coalesce(p_approval_id,'') !~ '^review-[A-Za-z0-9_-]{1,96}$'
     or p_artifact_id<=0 or coalesce(p_manifest_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_source_svg_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_preview_png_sha256,'') !~ '^[a-f0-9]{64}$'
     or length(coalesce(p_preview_png_base64,'')) not between 100 and 5000000
     or p_width not between 320 and 2400 or p_height not between 200 and 4000 then
    raise exception 'INFOGRAPHIC_PREVIEW_INVALID';
  end if;
  select * into strict c from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type='CONTENT' for update;
  select * into strict pub from kfarmai_private.daily_review_approvals
    where approval_id=p_approval_id and approval_type='PUBLISH' for update;
  select * into strict preview from kfarmai_private.daily_review_previews
    where approval_id=p_approval_id for update;
  if c.state<>'PENDING' or c.used_at is not null or pub.state<>'PENDING' or pub.used_at is not null
     or c.artifact_id<>p_artifact_id or pub.artifact_id<>p_artifact_id
     or c.manifest_sha256<>p_manifest_sha256 or pub.manifest_sha256<>p_manifest_sha256
     or preview.artifact_id<>p_artifact_id or preview.manifest_sha256<>p_manifest_sha256
     or preview.infographic_sha256<>p_source_svg_sha256 then
    raise exception 'INFOGRAPHIC_PREVIEW_BINDING';
  end if;
  begin
    png := decode(p_preview_png_base64,'base64');
    if substring(png from 1 for 8)<>decode('89504e470d0a1a0a','hex')
       or octet_length(png)<33
       or encode(extensions.digest(png,'sha256'),'hex')<>p_preview_png_sha256 then
      raise exception 'INFOGRAPHIC_PREVIEW_PNG';
    end if;
    actual_width := get_byte(png,16)::bigint*16777216 + get_byte(png,17)::bigint*65536
                    + get_byte(png,18)::bigint*256 + get_byte(png,19)::bigint;
    actual_height := get_byte(png,20)::bigint*16777216 + get_byte(png,21)::bigint*65536
                     + get_byte(png,22)::bigint*256 + get_byte(png,23)::bigint;
    if actual_width<>p_width or actual_height<>p_height then
      raise exception 'INFOGRAPHIC_PREVIEW_DIMENSIONS';
    end if;
  exception when others then
    raise exception 'INFOGRAPHIC_PREVIEW_PNG';
  end;
  if preview.infographic_preview_sha256 is not null then
    if preview.infographic_preview_sha256<>p_preview_png_sha256
       or preview.infographic_preview_width<>p_width or preview.infographic_preview_height<>p_height then
      raise exception 'INFOGRAPHIC_PREVIEW_IMMUTABLE';
    end if;
  else
    update kfarmai_private.daily_review_previews
      set infographic_preview_base64=p_preview_png_base64,
          infographic_preview_sha256=p_preview_png_sha256,
          infographic_preview_width=p_width,
          infographic_preview_height=p_height
      where approval_id=p_approval_id;
  end if;
  return jsonb_build_object('approval_id',p_approval_id,'state','PREVIEW_READY',
    'source_svg_sha256',p_source_svg_sha256,'preview_png_sha256',p_preview_png_sha256,
    'width',p_width,'height',p_height,'published',false);
end $$;

create or replace function public.daily_review_preview_asset(p_token text, p_asset text)
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
  if p.infographic_preview_base64 is not null then
    return jsonb_build_object('content_type','image/png','body_base64',p.infographic_preview_base64,
      'sha256',p.infographic_preview_sha256,'source_svg_sha256',p.infographic_sha256,
      'width',p.infographic_preview_width,'height',p.infographic_preview_height);
  end if;
  return jsonb_build_object('content_type','image/svg+xml; charset=UTF-8','body_text',p.infographic_svg,'sha256',p.infographic_sha256);
end $$;

revoke all on function public.daily_review_infographic_preview_store(text,bigint,text,text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.daily_review_infographic_preview_store(text,bigint,text,text,text,text,integer,integer)
  to service_role;

commit;
