-- Forward-only replacement of the one-shot identity. The role, signatures,
-- SECURITY DEFINER settings and existing EXECUTE grants remain unchanged.
-- Do not apply until the r4 approval and deployment are separately authorized.
begin;
do $migration$
declare
  function_name text;
  definition text;
  replaced text;
  actual_body_md5 text;
  expected_body_md5 text;
begin
  if not exists (select 1 from pg_roles where rolname='kfarmai_canary_runner') then
    raise exception 'DEDICATED_ROLE_MISSING';
  end if;
  foreach function_name in array array[
    'kfarmai_private.bootstrap_canary_control(text,jsonb)',
    'kfarmai_private.bootstrap_canary_budget(text,jsonb)'
  ] loop
    -- Ignore only edge whitespace introduced by migration transport. The
    -- executable body must otherwise match the inspected production body.
    select pg_get_functiondef(p.oid),md5(btrim(p.prosrc,E' \t\r\n'))
      into definition,actual_body_md5
      from pg_proc p where p.oid=to_regprocedure(function_name);
    expected_body_md5 := case function_name
      when 'kfarmai_private.bootstrap_canary_control(text,jsonb)'
        then '0aa5b886831f8c9da050aaf6c5f5c089'
      when 'kfarmai_private.bootstrap_canary_budget(text,jsonb)'
        then '290a48020c89e0e9efebb41d9978fb73'
      else null end;
    if definition is null or definition not like '%SECURITY DEFINER%'
      or actual_body_md5 is distinct from expected_body_md5
      or definition not like '%SET search_path TO %'
      or definition not like '%gateb-light-canary-20261011-r3%'
      or definition like '%gateb-light-canary-20261012-r4%'
      or not has_function_privilege('kfarmai_canary_runner',
                                    to_regprocedure(function_name), 'EXECUTE') then
      raise exception 'OLD_BOOTSTRAP_CONTRACT_MISMATCH: %',function_name;
    end if;
    replaced := replace(definition,
      'gateb-light-canary-20261011-r3','gateb-light-canary-20261012-r4');
    replaced := replace(replaced,
      'gateb-model-20261011-r3','gateb-model-20261012-r4');
    replaced := replace(replaced,
      'gateb-budget-20261011-r3','gateb-budget-20261012-r4');
    replaced := replace(replaced,
      '7c08a5e2-6aef-5c2c-8c55-2e62ff649fd0',
      '12ec65a4-4cea-5f28-bee0-3bd0e604f1f8');
    replaced := replace(replaced,
      '65e783b16d7e6fa3269415c9649aebc7427b75cd423d0eb17a63d18c6946b9e7',
      '7bd00d37776ef1d05e51f6d42776f5b11f429b0ef59fd655729490f228704f14');
    replaced := replace(replaced,
      '90097568610081786075','90830278032750352057');
    if replaced = definition or replaced like '%gateb-light-canary-20261011-r3%' then
      raise exception 'IDENTITY_REPLACEMENT_INCOMPLETE: %',function_name;
    end if;
    execute replaced;
  end loop;
end;
$migration$;
commit;
