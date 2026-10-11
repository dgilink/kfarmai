-- OFFLINE CANDIDATE. Separate approval is required before production application.
-- Existing global policy and RPC definitions are intentionally unchanged.
begin;
do $$ begin
  if not exists(select 1 from kfarmai_private.budget_policy where singleton and not enabled and daily_microusd=0) then
    raise exception 'GLOBAL_POLICY_NOT_LOCKED';
  end if;
end $$;
create table kfarmai_private.canary_scopes (
  approval_id text primary key check (approval_id ~ '^[A-Za-z0-9_-]{1,96}$'),
  id uuid not null unique,
  project_id text not null check (project_id='xzetqijeucldbfgjuoes'),
  plan_sha256 text not null check (plan_sha256 ~ '^[a-f0-9]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[a-f0-9]{64}$'),
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  run_id text not null unique check (run_id ~ '^[0-9]{1,20}$'),
  operation text not null check (operation='content'),
  channel text not null check (channel='REVIEW'),
  model_approval_id text not null unique check (model_approval_id ~ '^[A-Za-z0-9_-]{1,96}$'),
  budget_approval_id text not null unique check (budget_approval_id ~ '^[A-Za-z0-9_-]{1,96}$'),
  billing_multiplier text not null check (billing_multiplier in ('1.00','1.10')),
  maximum bigint not null check (maximum between 1 and 212),
  daily_microusd bigint not null check (daily_microusd between 1 and 212),
  day_kst date not null,
  expires_at timestamptz not null,
  state text not null default 'ARMED' check (state in ('ARMED','HELD','DISPATCHED','SETTLED','UNKNOWN','LOCKED')),
  actual bigint check (actual >= 0 and actual <= maximum), receipt text,
  reserved_at timestamptz, dispatched_at timestamptz,
  approved_by name not null, approved_at timestamptz not null default clock_timestamp(),
  audit jsonb not null default '[]'::jsonb,
  check (maximum <= daily_microusd),
  check (model_approval_id <> budget_approval_id)
);
alter table kfarmai_private.canary_scopes enable row level security;
revoke all on table kfarmai_private.canary_scopes from public, anon, authenticated, service_role;

-- No Data API wrapper exists for management. Only the trusted SQL operator can arm.
create function kfarmai_private.manage_canary(command text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p kfarmai_private.budget_policy%rowtype;
  s kfarmai_private.canary_scopes%rowtype;
  ttl bigint; cap bigint; lim bigint; used numeric; d date;
begin
  -- EXECUTE ACL is authoritative. session_user additionally rejects inherited or
  -- accidentally granted callers; request JSON/JWT claims cannot authorize here.
  if session_user <> 'postgres' or current_setting('role') not in ('none','postgres') then
    raise exception 'OPERATOR_REQUIRED';
  end if;
  select * into strict p from kfarmai_private.budget_policy where singleton for update;
  if p.enabled or p.daily_microusd<>0 then raise exception 'GLOBAL_POLICY_NOT_LOCKED'; end if;
  if jsonb_typeof(payload)<>'object' then raise exception 'INVALID_PAYLOAD'; end if;
  if command='arm' then
    if coalesce(payload->>'project_id','') <> 'xzetqijeucldbfgjuoes'
       or jsonb_typeof(payload->'maximum') is distinct from 'number'
       or jsonb_typeof(payload->'daily_microusd') is distinct from 'number'
       or jsonb_typeof(payload->'ttl_seconds') is distinct from 'number'
       or coalesce(payload->>'maximum','') !~ '^[0-9]+$'
       or coalesce(payload->>'daily_microusd','') !~ '^[0-9]+$'
       or coalesce(payload->>'ttl_seconds','') !~ '^[0-9]+$' then raise exception 'INVALID_APPROVAL'; end if;
    ttl := (payload->>'ttl_seconds')::bigint; cap := (payload->>'maximum')::bigint;
    lim := (payload->>'daily_microusd')::bigint;
    if ttl not between 1 and 300 or cap not between 1 and 212 or lim not between cap and 212 then
      raise exception 'APPROVAL_LIMIT';
    end if;
    d := (clock_timestamp() at time zone 'Asia/Seoul')::date;
    -- Never recycle unknown spend, including a previous KST day's crash.
    if exists(select 1 from kfarmai_private.canary_scopes where
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
      into used from kfarmai_private.canary_scopes where day_kst=d and reserved_at is not null;
    if used+cap>lim then raise exception 'BUDGET_EXHAUSTED'; end if;
    insert into kfarmai_private.canary_scopes
      (approval_id,id,project_id,plan_sha256,request_sha256,fingerprint,run_id,operation,channel,
       model_approval_id,budget_approval_id,billing_multiplier,maximum,daily_microusd,day_kst,expires_at,approved_by,audit)
    values(payload->>'approval_id',(payload->>'id')::uuid,payload->>'project_id',payload->>'plan_sha256',
       payload->>'request_sha256',payload->>'fingerprint',payload->>'run_id',payload->>'operation',payload->>'channel',
       payload->>'model_approval_id',payload->>'budget_approval_id',payload->>'billing_multiplier',cap,lim,d,
       clock_timestamp()+ttl*interval '1 second',session_user,
       jsonb_build_array(jsonb_build_object('event','ARMED','at',clock_timestamp(),'operator',session_user)))
    returning * into s;
    return to_jsonb(s)||jsonb_build_object('locked',false,'can_reserve',true,'can_dispatch',false);
  elsif command='emergency_lock' then
    select * into strict s from kfarmai_private.canary_scopes where approval_id=payload->>'approval_id';
    if (to_jsonb(s) - 'audit') @> jsonb_build_object(
      'id',payload->>'id','project_id',payload->>'project_id','plan_sha256',payload->>'plan_sha256',
      'request_sha256',payload->>'request_sha256','fingerprint',payload->>'fingerprint',
      'run_id',payload->>'run_id','operation',payload->>'operation','channel',payload->>'channel',
      'maximum',payload->'maximum') is not true then raise exception 'IDENTITY_COLLISION'; end if;
    update kfarmai_private.canary_scopes set
      state=case when s.state='SETTLED' then 'SETTLED' when s.reserved_at is null then 'LOCKED' else 'UNKNOWN' end,
      audit=audit||jsonb_build_array(jsonb_build_object('event','EMERGENCY_LOCK','at',clock_timestamp(),'operator',session_user))
      where approval_id=s.approval_id returning * into s;
    return to_jsonb(s)||'{"locked":true,"can_reserve":false,"can_dispatch":false}'::jsonb;
  end if;
  raise exception 'INVALID_COMMAND';
end $$;
revoke all on function kfarmai_private.manage_canary(text,jsonb) from public,anon,authenticated,service_role;

create function kfarmai_private.canary_budget(command text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  p kfarmai_private.budget_policy%rowtype;
  s kfarmai_private.canary_scopes%rowtype;
  d date; used numeric; amount bigint; usable boolean;
begin
  select * into strict p from kfarmai_private.budget_policy where singleton for update;
  if p.enabled or p.daily_microusd<>0 then raise exception 'GLOBAL_POLICY_NOT_LOCKED'; end if;
  if jsonb_typeof(payload)<>'object' then raise exception 'INVALID_PAYLOAD'; end if;
  select * into strict s from kfarmai_private.canary_scopes where approval_id=payload->>'approval_id';
  if (to_jsonb(s) - 'audit') @> jsonb_build_object(
    'id',payload->>'id','project_id',payload->>'project_id','plan_sha256',payload->>'plan_sha256',
    'request_sha256',payload->>'request_sha256','fingerprint',payload->>'fingerprint',
    'run_id',payload->>'run_id','operation',payload->>'operation','channel',payload->>'channel',
    'maximum',payload->'maximum') is not true then raise exception 'IDENTITY_COLLISION'; end if;
  d := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  usable := s.expires_at>clock_timestamp() and s.day_kst=d;
  if command='status' then
    return (to_jsonb(s)-'audit')||jsonb_build_object('locked',not (usable and s.state in ('ARMED','HELD')),
      'can_reserve',usable and s.state='ARMED','can_dispatch',usable and s.state='HELD',
      -- The grant also ends at KST midnight, even when TTL crosses that edge.
      'server_now',clock_timestamp(),'remaining_seconds',greatest(0,extract(epoch from (
        least(s.expires_at, (s.day_kst+1)::timestamp at time zone 'Asia/Seoul')-clock_timestamp()))));
  elsif command='reserve' then
    if not usable then raise exception 'EXPIRED'; end if;
    if s.state<>'ARMED' then return (to_jsonb(s)-'audit')||'{"acquired":false}'::jsonb; end if;
    if exists(select 1 from kfarmai_private.reservations where state<>'SETTLED') then
      raise exception 'LEGACY_USAGE_UNCONFIRMED';
    end if;
    select coalesce(sum(case when state='SETTLED' then actual else maximum end),0)
      into used from kfarmai_private.reservations where day_kst=d;
    select used+coalesce(sum(case when state='SETTLED' then actual else maximum end),0)
      into used from kfarmai_private.canary_scopes where day_kst=d and reserved_at is not null;
    if used+s.maximum>s.daily_microusd then raise exception 'BUDGET_EXHAUSTED'; end if;
    update kfarmai_private.canary_scopes set state='HELD',reserved_at=clock_timestamp(),
      audit=audit||jsonb_build_array(jsonb_build_object('event','RESERVED','at',clock_timestamp()))
      where approval_id=s.approval_id returning * into s;
    return (to_jsonb(s)-'audit')||'{"acquired":true}'::jsonb;
  elsif command='dispatch' then
    if not usable or s.state<>'HELD' then raise exception 'RETRY_OR_STALE_BLOCKED'; end if;
    update kfarmai_private.canary_scopes set state='DISPATCHED',dispatched_at=clock_timestamp(),
      audit=audit||jsonb_build_array(jsonb_build_object('event','DISPATCHED','at',clock_timestamp()))
      where approval_id=s.approval_id;
    return '{"execute":true,"locked":true,"can_reserve":false,"can_dispatch":false}'::jsonb;
  elsif command in ('unknown','freeze') then
    if s.state in ('ARMED','HELD','DISPATCHED','UNKNOWN') then
      update kfarmai_private.canary_scopes set state=case when reserved_at is null then 'LOCKED' else 'UNKNOWN' end,
        audit=audit||jsonb_build_array(jsonb_build_object('event','UNKNOWN','at',clock_timestamp()))
        where approval_id=s.approval_id returning * into s;
    end if;
    return jsonb_build_object('state',s.state,'execute',false,'locked',true);
  elsif command='settle' then
    -- Persist the lock on malformed/excess usage; raising would undo the lock.
    if s.state not in ('DISPATCHED','UNKNOWN','SETTLED') then raise exception 'INVALID_STATE'; end if;
    if jsonb_typeof(payload->'actual') is distinct from 'number'
       or coalesce(payload->>'actual','') !~ '^[0-9]{1,3}$'
       or coalesce(payload->>'receipt','') !~ '^[a-f0-9]{64}$' then
      if s.state='SETTLED' then raise exception 'SETTLEMENT_COLLISION'; end if;
      update kfarmai_private.canary_scopes set state='UNKNOWN',
        audit=audit||jsonb_build_array(jsonb_build_object('event','UNKNOWN','reason','INVALID_USAGE','at',clock_timestamp()))
        where approval_id=s.approval_id;
      return '{"state":"UNKNOWN","locked":true,"blocked":"INVALID_USAGE"}'::jsonb;
    end if;
    amount := (payload->>'actual')::bigint;
    if s.state='SETTLED' then
      if s.actual<>amount or s.receipt<>payload->>'receipt' then raise exception 'SETTLEMENT_COLLISION'; end if;
      return '{"state":"SETTLED","locked":true,"duplicate":true}'::jsonb;
    end if;
    if amount>s.maximum then
      update kfarmai_private.canary_scopes set state='UNKNOWN',
        audit=audit||jsonb_build_array(jsonb_build_object('event','UNKNOWN','reason','USAGE_EXCEEDS_RESERVED_MAXIMUM','at',clock_timestamp()))
        where approval_id=s.approval_id;
      return '{"state":"UNKNOWN","locked":true,"blocked":"USAGE_EXCEEDS_RESERVED_MAXIMUM"}'::jsonb;
    end if;
    update kfarmai_private.canary_scopes set state='SETTLED',actual=amount,receipt=payload->>'receipt',
      audit=audit||jsonb_build_array(jsonb_build_object('event','SETTLED','at',clock_timestamp(),'actual',amount))
      where approval_id=s.approval_id;
    return '{"state":"SETTLED","locked":true,"duplicate":false}'::jsonb;
  end if;
  raise exception 'INVALID_COMMAND';
end $$;
revoke all on function kfarmai_private.canary_budget(text,jsonb) from public,anon,authenticated;
grant execute on function kfarmai_private.canary_budget(text,jsonb) to service_role;
create function public.kfarmai_canary_budget(command text,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select kfarmai_private.canary_budget(command,payload);
$$;
revoke all on function public.kfarmai_canary_budget(text,jsonb) from public,anon,authenticated;
grant execute on function public.kfarmai_canary_budget(text,jsonb) to service_role;
commit;
