-- Existing public reference datasets remain readable but not browser-writable.
-- This does not modify rows or service_role privileges.
begin;
do $$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
        and c.relname in ('agri_companies','agri_events','agri_products',
                          'market_prices','pesticide_registry','pesticide_shops','subsidies')) <> 7
     or (select count(*) from pg_policies where schemaname='public'
         and tablename in ('agri_companies','agri_events','agri_products',
                           'market_prices','pesticide_registry','pesticide_shops','subsidies')) <> 0 then
    raise exception 'PUBLIC_REFERENCE_RLS_BASELINE_CHANGED';
  end if;
end $$;

alter table public.agri_companies enable row level security;
alter table public.agri_events enable row level security;
alter table public.agri_products enable row level security;
alter table public.market_prices enable row level security;
alter table public.pesticide_registry enable row level security;
alter table public.pesticide_shops enable row level security;
alter table public.subsidies enable row level security;

revoke all privileges on table public.agri_companies, public.agri_events,
  public.agri_products, public.market_prices, public.pesticide_registry,
  public.pesticide_shops, public.subsidies from public, anon, authenticated;
grant select on table public.agri_companies, public.agri_events,
  public.agri_products, public.market_prices, public.pesticide_registry,
  public.pesticide_shops, public.subsidies to anon, authenticated;

revoke all privileges on sequence public.agri_companies_id_seq,
  public.agri_events_id_seq, public.agri_products_id_seq,
  public.market_prices_id_seq, public.pesticide_registry_id_seq,
  public.pesticide_shops_id_seq, public.subsidies_id_seq
  from public, anon, authenticated;

create policy agri_companies_public_read on public.agri_companies
  for select to anon, authenticated using (true);
create policy agri_events_public_read on public.agri_events
  for select to anon, authenticated using (true);
create policy agri_products_public_read on public.agri_products
  for select to anon, authenticated using (true);
create policy market_prices_public_read on public.market_prices
  for select to anon, authenticated using (true);
create policy pesticide_registry_public_read on public.pesticide_registry
  for select to anon, authenticated using (true);
create policy pesticide_shops_public_read on public.pesticide_shops
  for select to anon, authenticated using (true);
create policy subsidies_public_read on public.subsidies
  for select to anon, authenticated using (true);
commit;
