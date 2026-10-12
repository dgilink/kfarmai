-- Candidate only. Applying this migration and setting a password require
-- separate production approval. No table or RLS permissions are granted.
begin;
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'kfarmai_private' and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PRIVATE_FUNCTION_PUBLIC_EXECUTE';
  end if;
  if exists (select 1 from pg_roles where rolname = 'kfarmai_daily_runner') then
    raise exception 'DAILY_ROLE_ALREADY_EXISTS';
  end if;
  create role kfarmai_daily_runner login password null noinherit;
end $$;
grant usage on schema kfarmai_private to kfarmai_daily_runner;
grant execute on function kfarmai_private.budget(text,jsonb) to kfarmai_daily_runner;
commit;
