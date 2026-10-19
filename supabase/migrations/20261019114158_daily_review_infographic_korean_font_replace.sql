-- Replace only the defective private REVIEW raster derivative after fail-closed
-- Korean glyph validation. Publication bytes and approval identity are unchanged.
begin;

alter table kfarmai_private.daily_review_previews
  add column infographic_preview_font_family text,
  add column infographic_preview_font_file text,
  add column infographic_preview_font_license text,
  add column infographic_preview_korean_codepoints integer;

create function public.daily_review_infographic_preview_replace(
  p_approval_id text, p_artifact_id bigint, p_manifest_sha256 text,
  p_source_svg_sha256 text, p_previous_preview_sha256 text,
  p_preview_png_sha256 text, p_preview_png_base64 text,
  p_width integer, p_height integer, p_font_family text,
  p_font_file text, p_font_license text, p_korean_codepoint_count integer
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
     or coalesce(p_previous_preview_sha256,'') !~ '^[a-f0-9]{64}$'
     or coalesce(p_preview_png_sha256,'') !~ '^[a-f0-9]{64}$'
     or p_previous_preview_sha256=p_preview_png_sha256
     or length(coalesce(p_preview_png_base64,'')) not between 100 and 5000000
     or p_width not between 320 and 2400 or p_height not between 200 and 4000
     or p_font_family<>'Noto Sans CJK KR'
     or p_font_license<>'SIL Open Font License 1.1'
     or length(coalesce(p_font_file,'')) not between 1 and 160
     or p_korean_codepoint_count not between 1 and 11172 then
    raise exception 'INFOGRAPHIC_FONT_PREVIEW_INVALID';
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
     or preview.infographic_sha256<>p_source_svg_sha256
     or preview.infographic_preview_sha256<>p_previous_preview_sha256 then
    raise exception 'INFOGRAPHIC_FONT_PREVIEW_BINDING';
  end if;
  begin
    png := decode(p_preview_png_base64,'base64');
    if substring(png from 1 for 8)<>decode('89504e470d0a1a0a','hex')
       or octet_length(png)<33
       or encode(extensions.digest(png,'sha256'),'hex')<>p_preview_png_sha256 then
      raise exception 'INFOGRAPHIC_FONT_PREVIEW_PNG';
    end if;
    actual_width := get_byte(png,16)::bigint*16777216 + get_byte(png,17)::bigint*65536
                    + get_byte(png,18)::bigint*256 + get_byte(png,19)::bigint;
    actual_height := get_byte(png,20)::bigint*16777216 + get_byte(png,21)::bigint*65536
                     + get_byte(png,22)::bigint*256 + get_byte(png,23)::bigint;
    if actual_width<>p_width or actual_height<>p_height then
      raise exception 'INFOGRAPHIC_FONT_PREVIEW_DIMENSIONS';
    end if;
  exception when others then
    raise exception 'INFOGRAPHIC_FONT_PREVIEW_PNG';
  end;
  update kfarmai_private.daily_review_previews
    set infographic_preview_base64=p_preview_png_base64,
        infographic_preview_sha256=p_preview_png_sha256,
        infographic_preview_width=p_width,
        infographic_preview_height=p_height,
        infographic_preview_font_family=p_font_family,
        infographic_preview_font_file=p_font_file,
        infographic_preview_font_license=p_font_license,
        infographic_preview_korean_codepoints=p_korean_codepoint_count
    where approval_id=p_approval_id;
  return jsonb_build_object('approval_id',p_approval_id,'state','PREVIEW_REPLACED',
    'source_svg_sha256',p_source_svg_sha256,'previous_preview_sha256',p_previous_preview_sha256,
    'preview_png_sha256',p_preview_png_sha256,'width',p_width,'height',p_height,
    'font_family',p_font_family,'korean_codepoint_count',p_korean_codepoint_count,
    'published',false);
end $$;

revoke all on function public.daily_review_infographic_preview_replace(text,bigint,text,text,text,text,text,integer,integer,text,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.daily_review_infographic_preview_replace(text,bigint,text,text,text,text,text,integer,integer,text,text,text,integer)
  to service_role;

commit;
