-- kFarmAI crop calendar/guide MVP schema extension.
-- Run in Supabase SQL Editor after reviewing existing tables.
-- User-facing screens should filter status = 'approved'.

create table if not exists public.crops (
  id text primary key,
  name_ko text not null,
  name_en text,
  category text,
  priority_grade text check (priority_grade in ('A', 'B', 'C')),
  is_featured boolean default false,
  display_order int default 999,
  aliases text[] default '{}',
  chosung text,
  description_short text,
  status text default 'needs_review' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'hidden')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.crop_variants (
  id text primary key,
  crop_id text references public.crops(id) on delete cascade,
  variant_type text not null,
  variant_name text not null,
  description text,
  is_default boolean default false,
  display_order int default 999,
  status text default 'needs_review' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'hidden')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.crop_conditions (
  id text primary key,
  crop_id text references public.crops(id) on delete cascade,
  variant_id text references public.crop_variants(id) on delete set null,
  region_group text check (region_group in ('central', 'southern', 'jeju', 'highland', 'all')),
  cultivation_type text check (cultivation_type in ('open_field', 'greenhouse', 'not_applicable')),
  is_available boolean default true,
  notes text,
  status text default 'needs_review' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'hidden')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.data_sources (
  id text primary key,
  source_type text,
  source_name text not null,
  source_url text,
  api_name text,
  api_endpoint text,
  license_type text,
  collected_at timestamp with time zone,
  raw_payload jsonb,
  content_hash text
);

create table if not exists public.crop_calendar (
  id text primary key,
  crop_id text references public.crops(id) on delete cascade,
  variant_id text references public.crop_variants(id) on delete set null,
  condition_id text references public.crop_conditions(id) on delete set null,
  month int check (month between 1 and 12),
  week int check (week between 1 and 5),
  task_type text check (task_type in ('seed', 'nursery', 'planting', 'growth_management', 'watering', 'fertilizing', 'pest_check', 'harvest', 'storage', 'pruning', 'flowering', 'fruiting')),
  task_title text not null,
  task_description text,
  importance text check (importance in ('low', 'medium', 'high')),
  source_id text references public.data_sources(id) on delete set null,
  status text default 'needs_review' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'hidden')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.crop_images (
  id text primary key,
  crop_id text references public.crops(id) on delete cascade,
  variant_id text references public.crop_variants(id) on delete set null,
  image_type text check (image_type in ('representative', 'growth_stage', 'symptom', 'disease', 'pest')),
  title text,
  description text,
  growth_stage text,
  symptom_type text,
  disease_pest_name text,
  source_name text,
  source_url text,
  license_type text,
  original_image_url text,
  local_path text,
  is_official_source boolean default false,
  status text default 'needs_review' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'hidden')),
  display_order int default 999,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.pest_disease_items (
  id text primary key,
  crop_id text references public.crops(id) on delete cascade,
  name_ko text not null,
  item_type text check (item_type in ('disease', 'pest', 'physiological_disorder', 'environment_stress', 'unknown_symptom')),
  symptoms text,
  occurrence_condition text,
  prevention text,
  control_method text,
  source_id text references public.data_sources(id) on delete set null,
  has_images boolean default false,
  status text default 'needs_review' check (status in ('draft', 'needs_review', 'approved', 'rejected', 'hidden')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.crops enable row level security;
alter table public.crop_variants enable row level security;
alter table public.crop_conditions enable row level security;
alter table public.data_sources enable row level security;
alter table public.crop_calendar enable row level security;
alter table public.crop_images enable row level security;
alter table public.pest_disease_items enable row level security;

drop policy if exists "approved crops are public" on public.crops;
create policy "approved crops are public" on public.crops for select using (status = 'approved');
drop policy if exists "approved crop variants are public" on public.crop_variants;
create policy "approved crop variants are public" on public.crop_variants for select using (status = 'approved');
drop policy if exists "approved crop conditions are public" on public.crop_conditions;
create policy "approved crop conditions are public" on public.crop_conditions for select using (status = 'approved');
drop policy if exists "data sources are public" on public.data_sources;
create policy "data sources are public" on public.data_sources for select using (true);
drop policy if exists "approved crop calendar is public" on public.crop_calendar;
create policy "approved crop calendar is public" on public.crop_calendar for select using (status = 'approved');
drop policy if exists "approved official crop images are public" on public.crop_images;
create policy "approved official crop images are public" on public.crop_images for select using (status = 'approved' and is_official_source = true);
drop policy if exists "approved pest disease items are public" on public.pest_disease_items;
create policy "approved pest disease items are public" on public.pest_disease_items for select using (status = 'approved');

create index if not exists crops_search_idx on public.crops using gin (aliases);
create index if not exists crops_chosung_idx on public.crops (chosung);
create index if not exists crop_calendar_lookup_idx on public.crop_calendar (crop_id, variant_id, condition_id, month, week);
create index if not exists crop_images_lookup_idx on public.crop_images (crop_id, image_type, status);
