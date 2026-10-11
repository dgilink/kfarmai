-- READ ONLY. Run only against an explicitly identified, authorized target.
begin read only;
select jsonb_build_object(
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'kst_day', (clock_timestamp() at time zone 'Asia/Seoul')::date,
  'security_ok',
    (select count(*)=3 and bool_and(c.relrowsecurity)
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='kfarmai_private' and c.relkind='r'
         and c.relname in ('budget_policy','reservations','review_outbox'))
    -- Additive private tables are allowed, but none may silently lose RLS.
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='kfarmai_private' and c.relkind='r' and not c.relrowsecurity
    )
    and (select prosecdef and proconfig @> array['search_path=""']
           from pg_proc where oid='kfarmai_private.budget(text,jsonb)'::regprocedure)
    and (select not prosecdef and proconfig @> array['search_path=""']
           from pg_proc where oid='public.kfarmai_budget(text,jsonb)'::regprocedure)
    and has_function_privilege('service_role','public.kfarmai_budget(text,jsonb)','EXECUTE')
    and not exists (
      select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid in ('public.kfarmai_budget(text,jsonb)'::regprocedure,
                      'kfarmai_private.budget(text,jsonb)'::regprocedure)
        and a.grantee not in (p.proowner, 'service_role'::regrole::oid)
    )
    and not exists (
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace,
           lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where n.nspname='kfarmai_private' and c.relkind='r' and a.grantee<>c.relowner
    )
);
-- Global unresolved totals are distinct from the current KST day's status.
select day_kst, state, count(*) as reservations,
       sum(maximum) as reserved_microusd, sum(actual) as settled_microusd
from kfarmai_private.reservations group by day_kst,state order by day_kst,state;
select singleton, enabled, daily_microusd from kfarmai_private.budget_policy;
select state, count(*) from kfarmai_private.review_outbox group by state;
rollback;
