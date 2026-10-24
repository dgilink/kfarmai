-- LOCAL-ONLY fixture matching the operator-reported Production metadata.
-- Never run against Production. No existing objects are modified.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, null, null)
on conflict (id) do nothing;

create policy post_images_insert_authenticated on storage.objects
  for insert to authenticated
  with check (bucket_id = 'post-images');

create policy post_images_select_public on storage.objects
  for select to public
  using (bucket_id = 'post-images');
