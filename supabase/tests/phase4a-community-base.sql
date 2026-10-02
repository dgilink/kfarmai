begin;

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  target_type text not null default 'all'
);

insert into public.channels(id, slug, name, target_type) values
  ('d88ba519-68fd-488f-8311-e316838ac4cf', 'plant-hospital', '식물 병원', 'all'),
  ('c7315bd6-eb60-484c-9c07-6def8f93ddc1', 'plant-question', '식물 질문방', 'home'),
  ('f586c6a8-882a-45d0-89e6-6d20fd9675de', 'crop-consult', '작물 상담방', 'farmer'),
  ('9191bf52-84b6-42ca-b2c7-c886bde5d450', 'plant-brag', '내 식물 자랑', 'all'),
  ('364c2c71-c313-47fc-a986-3124393bf381', 'farmer-lounge', '농부 사랑방', 'farmer'),
  ('4619a407-a214-4555-8e63-06fa96ed87a2', 'plant-share', '나눔·직거래', 'all'),
  ('a6095ae4-1d7e-4671-a6b1-4277d343e586', 'garden-class', '원예 클래스', 'all'),
  ('ae71a389-0723-4e76-b421-789a1474fd49', 'plant-meet', '식집사 모임', 'home')
on conflict (slug) do update set name = excluded.name, target_type = excluded.target_type;

alter table public.posts
  add column if not exists channel_id uuid references public.channels(id) on delete restrict,
  add column if not exists crop_tag text,
  add column if not exists region_tag text,
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists view_count integer not null default 0;

alter table public.channels enable row level security;
drop policy if exists channels_public_read on public.channels;
create policy channels_public_read on public.channels for select to anon, authenticated using (true);
grant select on public.channels to anon, authenticated;

drop policy if exists posts_insert_owner on public.posts;
create policy posts_insert_owner on public.posts for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists posts_update_owner on public.posts;
create policy posts_update_owner on public.posts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists posts_delete_owner on public.posts;
create policy posts_delete_owner on public.posts for delete to authenticated using (auth.uid() = user_id);
grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

drop policy if exists comments_insert_owner on public.comments;
create policy comments_insert_owner on public.comments for insert to authenticated with check (auth.uid() = user_id and is_ai = false);
drop policy if exists comments_update_owner on public.comments;
create policy comments_update_owner on public.comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists comments_delete_owner on public.comments;
create policy comments_delete_owner on public.comments for delete to authenticated using (auth.uid() = user_id);
grant insert, update, delete on public.comments to authenticated;

commit;
