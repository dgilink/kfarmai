begin;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  content text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  is_ai boolean not null default false,
  parent_id uuid references public.comments(id) on delete cascade,
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.posts enable row level security;
alter table public.comments enable row level security;

grant select on public.posts, public.comments to anon, authenticated;

drop policy if exists posts_select_public on public.posts;
create policy posts_select_public on public.posts for select to anon, authenticated using (true);

commit;
