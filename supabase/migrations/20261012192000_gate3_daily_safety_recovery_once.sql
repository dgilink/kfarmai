-- One final owner-authorized REVIEW attempt after run 38222769553 settled
-- successfully but was blocked by the deterministic safety notice gate.
-- This is an additive forward migration: no role, grant, or base budget change.
begin;
do $$
begin
  if md5(pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure))
     <> '0cb285a3217ba790da620616ccf69464' then
    raise exception 'DAILY_WRAPPER_BASELINE_CHANGED';
  end if;
end $$;

create or replace function kfarmai_private.daily_review_budget(command text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  is_previous_recovery boolean;
  is_final_recovery boolean;
  is_safety_recovery boolean;
  result jsonb;
begin
  if jsonb_typeof(payload) is distinct from 'object' or command not in
    ('status','reserve','dispatch','settle','unknown','freeze',
     'issue_claim','issue_creating','issue_complete') then
    raise exception 'DAILY_RPC_DENIED';
  end if;
  if command = 'reserve' then
    is_previous_recovery := payload->>'run_id' = '20261012999999999999';
    is_final_recovery := payload->>'run_id' = '20261012888888888888';
    is_safety_recovery := payload->>'run_id' = '20261012777777777777';
    if (coalesce(payload->>'run_id','') !~ '^[0-9]{8}$'
        and not is_previous_recovery and not is_final_recovery and not is_safety_recovery)
       or payload->>'operation' is distinct from 'content'
       or payload->>'channel' is distinct from 'REVIEW'
       or payload->>'maximum' is distinct from '22528' then
      raise exception 'DAILY_REVIEW_RESERVATION_ONLY';
    end if;
    if is_previous_recovery and (
       (clock_timestamp() at time zone 'Asia/Seoul')::date <> date '2026-10-12'
       or not exists (
         select 1 from kfarmai_private.reservations
         where id='09b7a95f-8205-5a00-a227-b373810ab353'::uuid
           and run_id='20261012' and state='SETTLED' and actual=22528
           and receipt='f864685ca8717c129c5bb395c344f024b29ded7b6dfe7cdebfbb4ec57e33b7b2')
       or exists (select 1 from kfarmai_private.reservations
                  where run_id='20261012999999999999')
       ) then
      raise exception 'DAILY_RECOVERY_ALREADY_USED_OR_UNVERIFIED';
    end if;
    if is_final_recovery and (
       (clock_timestamp() at time zone 'Asia/Seoul')::date <> date '2026-10-12'
       or not exists (
         select 1 from kfarmai_private.reservations
         where id='09b7a95f-8205-5a00-a227-b373810ab353'::uuid
           and run_id='20261012' and state='SETTLED' and actual=22528
           and receipt='f864685ca8717c129c5bb395c344f024b29ded7b6dfe7cdebfbb4ec57e33b7b2')
       or not exists (
         select 1 from kfarmai_private.reservations
         where id='d255a3e1-f71a-5a68-9621-733a3216efbb'::uuid
           and run_id='20261012999999999999' and state='SETTLED' and actual=22528
           and receipt='068719a7fc68b4cb900522bd20eeea07a9393380261d229855cfdf972d72de0b')
       or exists (select 1 from kfarmai_private.reservations
                  where run_id='20261012888888888888')
       ) then
      raise exception 'DAILY_FINAL_RECOVERY_ALREADY_USED_OR_UNVERIFIED';
    end if;
    if is_safety_recovery and (
       (clock_timestamp() at time zone 'Asia/Seoul')::date <> date '2026-10-12'
       or (select count(*) from kfarmai_private.reservations where day_kst=date '2026-10-12') <> 3
       or not exists (
         select 1 from kfarmai_private.reservations
         where id='09b7a95f-8205-5a00-a227-b373810ab353'::uuid
           and run_id='20261012' and day_kst=date '2026-10-12'
           and operation='content' and channel='REVIEW' and maximum=22528
           and state='SETTLED' and actual=22528
           and receipt='f864685ca8717c129c5bb395c344f024b29ded7b6dfe7cdebfbb4ec57e33b7b2')
       or not exists (
         select 1 from kfarmai_private.reservations
         where id='d255a3e1-f71a-5a68-9621-733a3216efbb'::uuid
           and run_id='20261012999999999999' and day_kst=date '2026-10-12'
           and operation='content' and channel='REVIEW' and maximum=22528
           and state='SETTLED' and actual=22528
           and receipt='068719a7fc68b4cb900522bd20eeea07a9393380261d229855cfdf972d72de0b')
       or not exists (
         select 1 from kfarmai_private.reservations
         where id='dbc865a8-c073-55a1-9267-b44deff70b0c'::uuid
           and run_id='20261012888888888888' and day_kst=date '2026-10-12'
           and operation='content' and channel='REVIEW' and maximum=22528
           and state='SETTLED' and actual=836
           and receipt='320863dbc4b54a4678699dcc0ea6fa717f14266d5057481cc188699952955a19')
       or exists (select 1 from kfarmai_private.reservations where state <> 'SETTLED')
       or (select coalesce(sum(actual),0) from kfarmai_private.reservations
           where day_kst=date '2026-10-12') + 22528 > 150000
       or exists (select 1 from kfarmai_private.reservations
                  where run_id='20261012777777777777')
       ) then
      raise exception 'DAILY_SAFETY_RECOVERY_ALREADY_USED_OR_UNVERIFIED';
    end if;
  end if;
  if command like 'issue_%' and
    coalesce(payload->>'approval_id','') !~ '^review-[0-9]+-r1-[a-f0-9]{12}$' then
    raise exception 'DAILY_REVIEW_ISSUE_ONLY';
  end if;
  result := kfarmai_private.budget(command,payload);
  -- The new one-shot attempt cannot leave the global circuit open after a
  -- terminal transition, including missing usage and over-reserve failures.
  if command in ('settle','unknown','freeze') and exists (
    select 1 from kfarmai_private.reservations
    where id=(payload->>'id')::uuid and run_id='20261012777777777777'
  ) then
    update kfarmai_private.budget_policy
       set enabled=false, daily_microusd=0 where singleton;
  end if;
  return result;
end $$;
commit;
