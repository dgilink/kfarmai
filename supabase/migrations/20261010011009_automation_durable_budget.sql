-- Candidate only: never apply to a linked/production database in this phase.
-- One policy row serializes reservations across LOW/REVIEW and all cost types.
begin;
create schema kfarmai_private;
revoke all on schema kfarmai_private from public, anon, authenticated;
create table kfarmai_private.budget_policy (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  daily_microusd bigint not null default 0 check (daily_microusd >= 0)
);
insert into kfarmai_private.budget_policy default values;
create table kfarmai_private.reservations (
  id uuid primary key, run_id text not null, operation text not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  day_kst date not null, channel text not null check (channel in ('LOW','REVIEW')),
  maximum bigint not null check (maximum > 0),
  state text not null check (state in ('HELD','DISPATCHED','SETTLED','UNKNOWN')),
  actual bigint check (actual >= 0), receipt text,
  created_at timestamptz not null default clock_timestamp(),
  unique (run_id, operation)
);
create index reservations_day on kfarmai_private.reservations(day_kst);
create table kfarmai_private.review_outbox (
  approval_id text primary key, fingerprint text not null,
  state text not null check (state in ('CLAIMED','CREATING','ISSUED')),
  issue_number bigint check (issue_number > 0)
);
alter table kfarmai_private.budget_policy enable row level security;
alter table kfarmai_private.reservations enable row level security;
alter table kfarmai_private.review_outbox enable row level security;
revoke all on all tables in schema kfarmai_private from public, anon, authenticated, service_role;

create function kfarmai_private.budget(command text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  policy kfarmai_private.budget_policy%rowtype;
  r kfarmai_private.reservations%rowtype;
  o kfarmai_private.review_outbox%rowtype;
  d date; used numeric; held numeric; cap bigint; amount bigint; rid uuid;
begin
  -- The PUBLIC invoker wrapper and private entry point are service_role only.
  select * into strict policy from kfarmai_private.budget_policy where singleton for update;
  d := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  if command like 'issue_%' then
    if coalesce(payload->>'approval_id','') !~ '^[A-Za-z0-9_-]{1,96}$'
       or coalesce(payload->>'fingerprint','') !~ '^[a-f0-9]{64}$' then
      raise exception 'INVALID_IDENTITY';
    end if;
    select * into o from kfarmai_private.review_outbox where approval_id=payload->>'approval_id';
    if found and o.fingerprint <> payload->>'fingerprint' then raise exception 'IDENTITY_COLLISION'; end if;
    if command='issue_claim' then
      if o.approval_id is not null then return to_jsonb(o)||'{"acquired":false}'::jsonb; end if;
      insert into kfarmai_private.review_outbox values(payload->>'approval_id',payload->>'fingerprint','CLAIMED',null) returning * into o;
      return to_jsonb(o)||'{"acquired":true}'::jsonb;
    elsif command='issue_creating' then
      if o.state is distinct from 'CLAIMED' then raise exception 'ISSUE_RETRY_BLOCKED'; end if;
      update kfarmai_private.review_outbox set state='CREATING' where approval_id=o.approval_id;
      return '{"execute":true}'::jsonb;
    elsif command='issue_complete' then
      if o.state not in ('CREATING','ISSUED') or o.state is null then raise exception 'ISSUE_STATE'; end if;
      amount := (payload->>'issue_number')::bigint;
      if amount is null or amount <= 0 or (o.issue_number is not null and o.issue_number <> amount) then raise exception 'ISSUE_IDENTITY'; end if;
      update kfarmai_private.review_outbox set state='ISSUED',issue_number=amount where approval_id=o.approval_id;
      return jsonb_build_object('state','ISSUED','issue_number',amount);
    end if;
    raise exception 'INVALID_COMMAND';
  end if;
  if command='reserve' then
    if not policy.enabled then raise exception 'BUDGET_DISABLED'; end if;
    rid := (payload->>'id')::uuid; cap := (payload->>'maximum')::bigint;
    if rid is null or cap is null or cap <= 0 or cap > policy.daily_microusd
       or coalesce(payload->>'run_id','') !~ '^[0-9]{1,20}$'
       or coalesce(payload->>'operation','') not in ('content','search-1','search-2','image','schema-repair')
       or coalesce(payload->>'channel','') not in ('LOW','REVIEW')
       or coalesce(payload->>'fingerprint','') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_RESERVATION'; end if;
    select * into r from kfarmai_private.reservations where id=rid or (run_id=payload->>'run_id' and operation=payload->>'operation');
    if found then
      if r.id<>rid or r.run_id<>payload->>'run_id' or r.operation<>payload->>'operation'
         or r.fingerprint<>payload->>'fingerprint' or r.maximum<>cap or r.channel<>payload->>'channel' then raise exception 'IDENTITY_COLLISION'; end if;
      return to_jsonb(r)||'{"acquired":false}'::jsonb;
    end if;
    select coalesce(sum(actual) filter(where state='SETTLED'),0),
           coalesce(sum(maximum) filter(where state<>'SETTLED'),0) into used,held
      from kfarmai_private.reservations where day_kst=d;
    if used+held+cap > policy.daily_microusd then raise exception 'BUDGET_EXHAUSTED'; end if;
    insert into kfarmai_private.reservations(id,run_id,operation,fingerprint,day_kst,channel,maximum,state)
      values(rid,payload->>'run_id',payload->>'operation',payload->>'fingerprint',d,payload->>'channel',cap,'HELD') returning * into r;
    return to_jsonb(r)||'{"acquired":true}'::jsonb;
  elsif command='status' then
    select coalesce(sum(actual) filter(where state='SETTLED'),0),
           coalesce(sum(maximum) filter(where state<>'SETTLED'),0) into used,held
      from kfarmai_private.reservations where day_kst=d;
    return jsonb_build_object('day_kst',d,'settled',used,'unconfirmed',held,'limit',policy.daily_microusd,'enabled',policy.enabled);
  end if;
  select * into strict r from kfarmai_private.reservations where id=(payload->>'id')::uuid;
  if r.fingerprint is distinct from payload->>'fingerprint' then raise exception 'IDENTITY_COLLISION'; end if;
  if command='dispatch' then
    if not policy.enabled or r.state<>'HELD' or r.day_kst<>d then raise exception 'RETRY_OR_STALE_BLOCKED'; end if;
    update kfarmai_private.reservations set state='DISPATCHED' where id=r.id;
    return '{"execute":true}'::jsonb;
  elsif command='freeze' then
    if r.state not in ('DISPATCHED','UNKNOWN') then raise exception 'INVALID_STATE'; end if;
    update kfarmai_private.budget_policy set enabled=false where singleton;
    update kfarmai_private.reservations set state='UNKNOWN' where id=r.id;
    return '{"state":"UNKNOWN","enabled":false}'::jsonb;
  elsif command='unknown' then
    if r.state in ('HELD','DISPATCHED') then
      update kfarmai_private.reservations set state='UNKNOWN' where id=r.id;
    end if;
    return '{"execute":false}'::jsonb;
  elsif command='settle' then
    amount := (payload->>'actual')::bigint;
    if amount is null or amount<0 or coalesce(payload->>'receipt','') !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_USAGE'; end if;
    if r.state='SETTLED' then
      if r.actual<>amount or r.receipt<>payload->>'receipt' then raise exception 'SETTLEMENT_COLLISION'; end if;
      return '{"state":"SETTLED","duplicate":true}'::jsonb;
    end if;
    if r.state not in ('DISPATCHED','UNKNOWN') then raise exception 'INVALID_STATE'; end if;
    if amount>r.maximum then
      -- Return rather than raise: persist the circuit breaker in this transaction.
      update kfarmai_private.budget_policy set enabled=false where singleton;
      update kfarmai_private.reservations set state='UNKNOWN' where id=r.id;
      return '{"state":"UNKNOWN","blocked":"USAGE_EXCEEDS_RESERVED_MAXIMUM"}'::jsonb;
    end if;
    update kfarmai_private.reservations set actual=amount,receipt=payload->>'receipt',state='SETTLED' where id=r.id;
    return '{"state":"SETTLED","duplicate":false}'::jsonb;
  end if;
  raise exception 'INVALID_COMMAND';
end $$;
revoke all on function kfarmai_private.budget(text,jsonb) from public, anon, authenticated;
grant usage on schema kfarmai_private to service_role;
grant execute on function kfarmai_private.budget(text,jsonb) to service_role;
create function public.kfarmai_budget(command text,payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select kfarmai_private.budget(command,payload);
$$;
revoke all on function public.kfarmai_budget(text,jsonb) from public, anon, authenticated;
grant execute on function public.kfarmai_budget(text,jsonb) to service_role;
commit;
