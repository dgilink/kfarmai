-- One further owner-authorized 2026-10-12 REVIEW attempt after two settled failures.
-- Internal full-reserve settlements are upper bounds, not confirmed API charges.
-- No roles, grants, tables, or general budget rules change.
begin;
do $$
begin
  if md5(pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure))
     <> 'd2402792969c731e251b0fe6f2ecff2d' then
    raise exception 'DAILY_WRAPPER_BASELINE_CHANGED';
  end if;
end $$;

create or replace function kfarmai_private.daily_review_budget(command text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  is_previous_recovery boolean;
  is_final_recovery boolean;
begin
  if jsonb_typeof(payload) is distinct from 'object' or command not in
    ('status','reserve','dispatch','settle','unknown','freeze',
     'issue_claim','issue_creating','issue_complete') then
    raise exception 'DAILY_RPC_DENIED';
  end if;
  if command = 'reserve' then
    is_previous_recovery := payload->>'run_id' = '20261012999999999999';
    is_final_recovery := payload->>'run_id' = '20261012888888888888';
    if (coalesce(payload->>'run_id','') !~ '^[0-9]{8}$'
        and not is_previous_recovery and not is_final_recovery)
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
  end if;
  if command like 'issue_%' and
    coalesce(payload->>'approval_id','') !~ '^review-[0-9]+-r1-[a-f0-9]{12}$' then
    raise exception 'DAILY_REVIEW_ISSUE_ONLY';
  end if;
  return kfarmai_private.budget(command,payload);
end $$;
commit;
