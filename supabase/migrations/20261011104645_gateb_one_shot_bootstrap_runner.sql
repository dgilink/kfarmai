-- CANDIDATE ONLY: deploy only with separate production DB and credential approval.
-- The login has no password until an operator provisions it outside Git/Actions logs.
begin;
create role kfarmai_canary_runner login password null noinherit
  nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant usage on schema kfarmai_private to kfarmai_canary_runner;

-- One immutable approval. The scope can be armed once; the existing scoped
-- budget function performs every later reservation/dispatch/settlement.
create function kfarmai_private.bootstrap_canary_control(command text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p kfarmai_private.budget_policy%rowtype;
  s kfarmai_private.canary_scopes%rowtype;
  d date;
  used numeric;
  previous_state text;
  previous_actual bigint;
begin
  if session_user <> 'kfarmai_canary_runner' or current_setting('role') <> 'none' then
    raise exception 'DEDICATED_RUNNER_REQUIRED';
  end if;
  if command not in ('preflight','arm') then raise exception 'INVALID_COMMAND'; end if;
  if payload is distinct from jsonb_build_object(
    'approval_id','gateb-light-canary-20261011-r3',
    'id','7c08a5e2-6aef-5c2c-8c55-2e62ff649fd0',
    'project_id','xzetqijeucldbfgjuoes',
    'plan_sha256','eb85c8abcd966e3ca2fef0066bc4ff7be5fec026b31c2b92c514d320064e88cf',
    'request_sha256','40321f01ecacbc65785e210b52fa48d1de0881713e06802a64442268d9d0a220',
    'fingerprint','65e783b16d7e6fa3269415c9649aebc7427b75cd423d0eb17a63d18c6946b9e7',
    'run_id','90097568610081786075',
    'operation','content','channel','REVIEW','maximum',212,
    'model_approval_id','gateb-model-20261011-r3',
    'budget_approval_id','gateb-budget-20261011-r3',
    'daily_microusd',212,'ttl_seconds',300,'billing_multiplier','1.10'
  ) then raise exception 'BOOTSTRAP_IDENTITY_MISMATCH'; end if;

  select * into strict p from kfarmai_private.budget_policy where singleton for update;
  if p.enabled or p.daily_microusd <> 0 then raise exception 'GLOBAL_POLICY_NOT_LOCKED'; end if;
  select state,actual into previous_state,previous_actual
    from kfarmai_private.canary_scopes
    where approval_id='gateb-light-canary-20261011-r1';
  if previous_state is distinct from 'SETTLED' or previous_actual is distinct from 15 then
    raise exception 'PRIOR_SCOPE_NOT_RECONCILED';
  end if;
  d := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  if exists(select 1 from kfarmai_private.canary_scopes where
      approval_id='gateb-light-canary-20261011-r3' or
      (reserved_at is not null and state<>'SETTLED') or
      (state='ARMED' and expires_at>clock_timestamp() and day_kst=d)) then
    raise exception 'SCOPE_ALREADY_ACTIVE_OR_UNCONFIRMED';
  end if;
  if exists(select 1 from kfarmai_private.reservations where state<>'SETTLED') then
    raise exception 'LEGACY_USAGE_UNCONFIRMED';
  end if;
  select coalesce(sum(case when state='SETTLED' then actual else maximum end),0)
    into used from kfarmai_private.reservations where day_kst=d;
  select used+coalesce(sum(case when state='SETTLED' then actual else maximum end),0)
    into used from kfarmai_private.canary_scopes
    where day_kst=d and reserved_at is not null;
  if used+212>212 then raise exception 'BUDGET_EXHAUSTED'; end if;
  if command='preflight' then
    return jsonb_build_object('ready',true,'scope','NOT_CREATED',
      'day_kst',d,'server_now',clock_timestamp());
  end if;
  insert into kfarmai_private.canary_scopes
    (approval_id,id,project_id,plan_sha256,request_sha256,fingerprint,run_id,
     operation,channel,model_approval_id,budget_approval_id,billing_multiplier,
     maximum,daily_microusd,day_kst,expires_at,approved_by,audit)
  values ('gateb-light-canary-20261011-r3',
    '7c08a5e2-6aef-5c2c-8c55-2e62ff649fd0'::uuid,
    'xzetqijeucldbfgjuoes',
    'eb85c8abcd966e3ca2fef0066bc4ff7be5fec026b31c2b92c514d320064e88cf',
    '40321f01ecacbc65785e210b52fa48d1de0881713e06802a64442268d9d0a220',
    '65e783b16d7e6fa3269415c9649aebc7427b75cd423d0eb17a63d18c6946b9e7',
    '90097568610081786075','content','REVIEW',
    'gateb-model-20261011-r3','gateb-budget-20261011-r3','1.10',
    212,212,d,clock_timestamp()+interval '300 seconds',session_user,
    jsonb_build_array(jsonb_build_object('event','ARMED','at',clock_timestamp(),
      'operator',session_user))) returning * into s;
  return jsonb_build_object('state',s.state,'approval_id',s.approval_id,
    'expires_at',s.expires_at,'locked',false);
end $$;
revoke all on function kfarmai_private.bootstrap_canary_control(text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function kfarmai_private.bootstrap_canary_control(text,jsonb)
  to kfarmai_canary_runner;

-- The runner cannot invoke the general scoped-budget function for another
-- approval. This wrapper pins every command to the one approved r3 scope.
create function kfarmai_private.bootstrap_canary_budget(command text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if session_user <> 'kfarmai_canary_runner' or current_setting('role') <> 'none' then
    raise exception 'DEDICATED_RUNNER_REQUIRED';
  end if;
  if command not in ('status','reserve','dispatch','settle','unknown','freeze') then
    raise exception 'INVALID_COMMAND';
  end if;
  if not (payload @> jsonb_build_object(
    'approval_id','gateb-light-canary-20261011-r3',
    'id','7c08a5e2-6aef-5c2c-8c55-2e62ff649fd0',
    'project_id','xzetqijeucldbfgjuoes',
    'plan_sha256','eb85c8abcd966e3ca2fef0066bc4ff7be5fec026b31c2b92c514d320064e88cf',
    'request_sha256','40321f01ecacbc65785e210b52fa48d1de0881713e06802a64442268d9d0a220',
    'fingerprint','65e783b16d7e6fa3269415c9649aebc7427b75cd423d0eb17a63d18c6946b9e7',
    'run_id','90097568610081786075',
    'operation','content','channel','REVIEW','maximum',212)) then
    raise exception 'BOOTSTRAP_IDENTITY_MISMATCH';
  end if;
  if command='settle' and (jsonb_typeof(payload->'actual') is distinct from 'number'
      or coalesce(payload->>'actual','') !~ '^[0-9]{1,3}$'
      or coalesce(payload->>'receipt','') !~ '^[a-f0-9]{64}$') then
    raise exception 'INVALID_SETTLEMENT';
  end if;
  return kfarmai_private.canary_budget(command,payload);
end $$;
revoke all on function kfarmai_private.bootstrap_canary_budget(text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function kfarmai_private.bootstrap_canary_budget(text,jsonb)
  to kfarmai_canary_runner;
commit;
