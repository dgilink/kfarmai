-- Applied as production migration 20261012053234. Credential provisioning is separate.
-- No table, public Budget wrapper, or other private RPC access is granted.
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
create function kfarmai_private.daily_review_budget(command text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(payload) is distinct from 'object' or command not in
    ('status','reserve','dispatch','settle','unknown','freeze',
     'issue_claim','issue_creating','issue_complete') then
    raise exception 'DAILY_RPC_DENIED';
  end if;
  if command = 'reserve' and
    (coalesce(payload->>'run_id','') !~ '^[0-9]{8}$'
     or payload->>'operation' is distinct from 'content'
     or payload->>'channel' is distinct from 'REVIEW'
     or payload->>'maximum' is distinct from '22528') then
    raise exception 'DAILY_REVIEW_RESERVATION_ONLY';
  end if;
  if command like 'issue_%' and
    coalesce(payload->>'approval_id','') !~ '^review-[0-9]+-r1-[a-f0-9]{12}$' then
    raise exception 'DAILY_REVIEW_ISSUE_ONLY';
  end if;
  return kfarmai_private.budget(command,payload);
end $$;
revoke all on function kfarmai_private.daily_review_budget(text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function kfarmai_private.daily_review_budget(text,jsonb)
  to kfarmai_daily_runner;
commit;
