-- READ ONLY: identity must ALSO be checked in the Dashboard/TLS connection.
-- Database name alone is not a unique Supabase project identifier.
begin read only;
select current_database(), current_user, current_setting('server_version'),
       (clock_timestamp() at time zone 'Asia/Seoul')::date as day_kst;
select rolname, rolcanlogin, rolbypassrls from pg_roles
where rolname in ('postgres','anon','authenticated','service_role') order by rolname;
select to_regnamespace('kfarmai_private') as existing_private_schema,
       to_regprocedure('public.kfarmai_budget(text,jsonb)') as existing_wrapper;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='kfarmai_budget';
-- Any existing object/overload requires reconciliation, never DROP or overwrite.
rollback;
