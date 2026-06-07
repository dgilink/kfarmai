-- kFarmAI Phase 1 DB Schema
-- Supabase SQL Editor에서 실행

-- 1. users (Supabase Auth 연동)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  nickname text not null,
  email text,
  role text default 'user' check (role in ('user', 'farmer', 'admin')),
  region text,
  created_at timestamp with time zone default now()
);
alter table public.users enable row level security;
create policy "본인만 수정" on public.users for update using (auth.uid() = id);
create policy "누구나 조회" on public.users for select using (true);

-- 2. channels (게시판 종류)
create table public.channels (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  name text not null,
  target_type text default 'all' check (target_type in ('all', 'home', 'farmer'))
);
-- 초기 데이터
insert into public.channels (slug, name, target_type) values
  ('plant-hospital', '식물 병원', 'all'),
  ('plant-question', '식물 질문방', 'home'),
  ('crop-consult', '작물 상담방', 'farmer'),
  ('plant-brag', '내 식물 자랑', 'all'),
  ('farmer-lounge', '농부 사랑방', 'farmer');

-- 3. posts
create table public.posts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete set null,
  channel_id uuid references public.channels(id) on delete cascade,
  title text not null,
  content text,
  crop_tag text,
  region_tag text,
  image_urls text[] default '{}',
  view_count int default 0,
  created_at timestamp with time zone default now()
);
alter table public.posts enable row level security;
create policy "누구나 조회" on public.posts for select using (true);
create policy "로그인 사용자 작성" on public.posts for insert with check (auth.uid() = user_id);
create policy "본인만 수정" on public.posts for update using (auth.uid() = user_id);
create index on public.posts (channel_id, created_at desc);
create index on public.posts (crop_tag);
create index on public.posts (region_tag);

-- 4. comments
create table public.comments (
  id uuid default gen_random_uuid() primary key,
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  content text not null,
  is_ai boolean default false,
  created_at timestamp with time zone default now()
);
alter table public.comments enable row level security;
create policy "누구나 조회" on public.comments for select using (true);
create policy "로그인 사용자 작성" on public.comments for insert with check (auth.uid() = user_id or is_ai = true);
create index on public.comments (post_id, created_at asc);

-- 5. diagnoses
create table public.diagnoses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  image_url text not null,
  crop_type text,
  symptom_desc text,
  ai_result text,
  ai_advice text,
  is_premium boolean default false,
  created_at timestamp with time zone default now()
);
alter table public.diagnoses enable row level security;
create policy "본인만 조회" on public.diagnoses for select using (auth.uid() = user_id);
create policy "로그인 사용자 생성" on public.diagnoses for insert with check (auth.uid() = user_id);
