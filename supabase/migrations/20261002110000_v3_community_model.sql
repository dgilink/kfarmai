begin;

create table if not exists public.community_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  sort_order smallint not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint community_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

insert into public.community_categories (id, slug, name, description, sort_order, is_active) values
  ('41000000-0000-4000-8000-000000000001', 'question-help', '질문·문제해결', '식물과 작물 문제를 묻고 해결 경험을 나눕니다.', 1, true),
  ('41000000-0000-4000-8000-000000000002', 'cultivation-knowhow', '재배·노하우', '재배 과정과 관리 방법을 나눕니다.', 2, true),
  ('41000000-0000-4000-8000-000000000003', 'showcase-daily', '자랑·일상', '식물과 농사 일상을 편하게 공유합니다.', 3, true),
  ('41000000-0000-4000-8000-000000000004', 'agri-field-info', '농업·현장정보', '현장 소식과 공식 확인이 필요한 정보를 나눕니다.', 4, true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

create table if not exists public.community_channel_category_map (
  channel_id uuid primary key references public.channels(id) on delete restrict,
  legacy_slug text not null unique,
  category_id uuid not null references public.community_categories(id) on delete restrict,
  transition_status text not null default 'core'
    check (transition_status in ('core', 'legacy', 'archive')),
  created_at timestamptz not null default now()
);

insert into public.community_channel_category_map (channel_id, legacy_slug, category_id, transition_status)
select
  channels.id,
  channels.slug,
  categories.id,
  case when channels.slug = 'plant-share' then 'archive' else 'legacy' end
from public.channels
join public.community_categories categories on categories.slug = case
  when channels.slug in ('plant-hospital', 'plant-question', 'crop-consult') then 'question-help'
  when channels.slug = 'garden-class' then 'cultivation-knowhow'
  when channels.slug in ('plant-brag', 'plant-meet') then 'showcase-daily'
  when channels.slug in ('farmer-lounge', 'plant-share') then 'agri-field-info'
  else null
end
where channels.slug in (
  'plant-hospital', 'plant-question', 'crop-consult', 'plant-brag',
  'farmer-lounge', 'plant-share', 'garden-class', 'plant-meet'
)
on conflict (channel_id) do update set
  legacy_slug = excluded.legacy_slug,
  category_id = excluded.category_id,
  transition_status = excluded.transition_status;

alter table public.posts
  add column if not exists category_id uuid references public.community_categories(id) on delete restrict,
  add column if not exists tags text[] not null default '{}';

create or replace function public.normalize_community_tags(input_tags text[])
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(tag order by first_position), '{}'::text[])
  from (
    select tag, min(position) as first_position
    from (
      select lower(trim(both '#' from btrim(value))) as tag, position
      from unnest(coalesce(input_tags, '{}'::text[])) with ordinality as source(value, position)
    ) normalized
    where tag <> '' and char_length(tag) <= 30
    group by tag
    order by min(position)
    limit 8
  ) limited;
$$;

create or replace function public.normalize_post_tags_trigger()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.tags := public.normalize_community_tags(new.tags);
  return new;
end;
$$;

drop trigger if exists posts_normalize_tags on public.posts;
create trigger posts_normalize_tags
before insert or update of tags on public.posts
for each row execute function public.normalize_post_tags_trigger();

update public.posts posts
set category_id = mapping.category_id
from public.community_channel_category_map mapping
where posts.category_id is null
  and posts.channel_id = mapping.channel_id;

update public.posts
set tags = public.normalize_community_tags(
  coalesce(tags, '{}'::text[]) || array_remove(array[crop_tag, region_tag]::text[], null)
);

alter table public.posts drop constraint if exists posts_tags_limit;
alter table public.posts add constraint posts_tags_limit check (cardinality(tags) <= 8);

create index if not exists posts_category_created_at_idx on public.posts (category_id, created_at desc);
create index if not exists posts_tags_gin_idx on public.posts using gin (tags);

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('same_symptom', 'helpful')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction_type)
);

create table if not exists public.post_bookmarks (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references auth.users(id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment')),
  target_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_user_id, target_type, target_id)
);

create index if not exists community_reports_status_created_idx
  on public.community_reports (status, created_at desc);

create table if not exists public.user_blocks (
  blocker_user_id uuid not null references auth.users(id) on delete cascade,
  blocked_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_no_self check (blocker_user_id <> blocked_user_id)
);

create or replace function public.community_interaction_allowed(actor_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select actor_id is not null
    and target_user_id is not null
    and actor_id <> target_user_id
    and not exists (
      select 1
      from public.user_blocks blocks
      where (blocks.blocker_user_id = actor_id and blocks.blocked_user_id = target_user_id)
         or (blocks.blocker_user_id = target_user_id and blocks.blocked_user_id = actor_id)
    );
$$;

create or replace function public.validate_community_report_target()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_exists boolean;
begin
  if new.target_type = 'post' then
    select exists(select 1 from public.posts where id = new.target_id) into target_exists;
  elsif new.target_type = 'comment' then
    select exists(select 1 from public.comments where id = new.target_id) into target_exists;
  else
    target_exists := false;
  end if;
  if not target_exists then
    raise exception 'community_report_target_not_found' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists community_reports_validate_target on public.community_reports;
create trigger community_reports_validate_target
before insert or update of target_type, target_id on public.community_reports
for each row execute function public.validate_community_report_target();

create or replace function public.community_post_engagement(target_post_id uuid)
returns table (
  same_symptom_count bigint,
  helpful_count bigint,
  same_symptom_active boolean,
  helpful_active boolean,
  saved boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where reaction_type = 'same_symptom'),
    count(*) filter (where reaction_type = 'helpful'),
    coalesce(bool_or(user_id = auth.uid()) filter (where reaction_type = 'same_symptom'), false),
    coalesce(bool_or(user_id = auth.uid()) filter (where reaction_type = 'helpful'), false),
    exists(
      select 1 from public.post_bookmarks bookmarks
      where bookmarks.post_id = target_post_id and bookmarks.user_id = auth.uid()
    )
  from public.post_reactions reactions
  where reactions.post_id = target_post_id;
$$;

create or replace function public.toggle_post_reaction(target_post_id uuid, target_reaction_type text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
  post_author_id uuid;
begin
  if viewer_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if target_reaction_type not in ('same_symptom', 'helpful') then raise exception 'invalid_reaction_type' using errcode = '22023'; end if;
  select user_id into post_author_id from public.posts where id = target_post_id;
  if not found then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  if post_author_id <> viewer_id and not public.community_interaction_allowed(viewer_id, post_author_id) then
    raise exception 'interaction_blocked' using errcode = '42501';
  end if;
  delete from public.post_reactions
  where post_id = target_post_id and user_id = viewer_id and reaction_type = target_reaction_type;
  if found then return false; end if;
  insert into public.post_reactions(post_id, user_id, reaction_type)
  values (target_post_id, viewer_id, target_reaction_type);
  return true;
end;
$$;

create or replace function public.toggle_post_bookmark(target_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  viewer_id uuid := auth.uid();
  post_author_id uuid;
begin
  if viewer_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select user_id into post_author_id from public.posts where id = target_post_id;
  if not found then raise exception 'post_not_found' using errcode = 'P0002'; end if;
  if post_author_id <> viewer_id and not public.community_interaction_allowed(viewer_id, post_author_id) then
    raise exception 'interaction_blocked' using errcode = '42501';
  end if;
  delete from public.post_bookmarks where post_id = target_post_id and user_id = viewer_id;
  if found then return false; end if;
  insert into public.post_bookmarks(post_id, user_id) values (target_post_id, viewer_id);
  return true;
end;
$$;

alter table public.community_categories enable row level security;
alter table public.community_channel_category_map enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_bookmarks enable row level security;
alter table public.community_reports enable row level security;
alter table public.user_blocks enable row level security;

drop policy if exists community_categories_public_read on public.community_categories;
create policy community_categories_public_read on public.community_categories
for select to anon, authenticated using (is_active = true);

drop policy if exists community_channel_map_public_read on public.community_channel_category_map;
create policy community_channel_map_public_read on public.community_channel_category_map
for select to anon, authenticated using (true);

drop policy if exists post_reactions_owner_read on public.post_reactions;
create policy post_reactions_owner_read on public.post_reactions
for select to authenticated using (auth.uid() = user_id);
drop policy if exists post_reactions_owner_insert on public.post_reactions;
create policy post_reactions_owner_insert on public.post_reactions
for insert to authenticated with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.posts
    where posts.id = post_reactions.post_id
      and (posts.user_id = auth.uid() or public.community_interaction_allowed(auth.uid(), posts.user_id))
  )
);
drop policy if exists post_reactions_owner_delete on public.post_reactions;
create policy post_reactions_owner_delete on public.post_reactions
for delete to authenticated using (auth.uid() = user_id);

drop policy if exists post_bookmarks_owner_read on public.post_bookmarks;
create policy post_bookmarks_owner_read on public.post_bookmarks
for select to authenticated using (auth.uid() = user_id);
drop policy if exists post_bookmarks_owner_insert on public.post_bookmarks;
create policy post_bookmarks_owner_insert on public.post_bookmarks
for insert to authenticated with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.posts
    where posts.id = post_bookmarks.post_id
      and (posts.user_id = auth.uid() or public.community_interaction_allowed(auth.uid(), posts.user_id))
  )
);
drop policy if exists post_bookmarks_owner_delete on public.post_bookmarks;
create policy post_bookmarks_owner_delete on public.post_bookmarks
for delete to authenticated using (auth.uid() = user_id);

drop policy if exists community_reports_owner_read on public.community_reports;
create policy community_reports_owner_read on public.community_reports
for select to authenticated using (auth.uid() = reporter_user_id);
drop policy if exists community_reports_owner_insert on public.community_reports;
create policy community_reports_owner_insert on public.community_reports
for insert to authenticated with check (auth.uid() = reporter_user_id);

drop policy if exists user_blocks_owner_read on public.user_blocks;
create policy user_blocks_owner_read on public.user_blocks
for select to authenticated using (auth.uid() = blocker_user_id);
drop policy if exists user_blocks_owner_insert on public.user_blocks;
create policy user_blocks_owner_insert on public.user_blocks
for insert to authenticated with check (auth.uid() = blocker_user_id);
drop policy if exists user_blocks_owner_delete on public.user_blocks;
create policy user_blocks_owner_delete on public.user_blocks
for delete to authenticated using (auth.uid() = blocker_user_id);

revoke all on public.community_categories, public.community_channel_category_map,
  public.post_reactions, public.post_bookmarks, public.community_reports, public.user_blocks
  from anon, authenticated;
grant select on public.community_categories, public.community_channel_category_map to anon, authenticated;
grant select, insert, delete on public.post_reactions, public.post_bookmarks to authenticated;
grant select, insert on public.community_reports to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;

revoke all on function public.community_interaction_allowed(uuid, uuid) from public, anon, authenticated;
revoke all on function public.community_post_engagement(uuid) from public;
revoke all on function public.toggle_post_reaction(uuid, text) from public;
revoke all on function public.toggle_post_bookmark(uuid) from public;
grant execute on function public.community_post_engagement(uuid) to anon, authenticated;
grant execute on function public.community_interaction_allowed(uuid, uuid) to authenticated;
grant execute on function public.toggle_post_reaction(uuid, text) to authenticated;
grant execute on function public.toggle_post_bookmark(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
