-- Phase 7 final cutover: apply only after the verified V4 Pages/Gateway gate.
-- Existing public object URLs and existing object rows are intentionally untouched.
begin;

do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'post-images' and public is true
      and file_size_limit is null and allowed_mime_types is null
  ) then
    raise exception 'post-images bucket baseline differs; stop and reconcile';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'post_images_insert_authenticated' and cmd = 'INSERT'
      and 'authenticated' = any(roles)
      and regexp_replace(coalesce(with_check, ''), '\s+', '', 'g')
          = regexp_replace('(bucket_id = ''post-images''::text)', '\s+', '', 'g')
  ) then
    raise exception 'post-images INSERT policy baseline differs; stop and reconcile';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'post_images_select_public' and cmd = 'SELECT'
      and 'public' = any(roles)
  ) then
    raise exception 'post-images SELECT policy baseline differs; stop and reconcile';
  end if;
end $$;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/webp']::text[]
where id = 'post-images';

-- Only the authenticated Edge Function may upload, via server-only service role.
-- Existing objects and public SELECT are unchanged. Do not restore this policy on rollback.
drop policy post_images_insert_authenticated on storage.objects;

commit;
