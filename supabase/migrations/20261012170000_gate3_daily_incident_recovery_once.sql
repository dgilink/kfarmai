-- One 2026-10-12 incident recovery reservation. No role or table grants change.
begin;
do $$
begin
  if md5(pg_get_functiondef('kfarmai_private.daily_review_budget(text,jsonb)'::regprocedure))
     <> '6b0ad81afe3c4504bcd3db7e8e005f11' then
    raise exception 'DAILY_WRAPPER_BASELINE_CHANGED';
  end if;
end $$;

create or replace function kfarmai_private.daily_review_budget(command text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  is_recovery boolean;
begin
  if jsonb_typeof(payload) is distinct from 'object' or command not in
    ('status','reserve','dispatch','settle','unknown','freeze',
     'issue_claim','issue_creating','issue_complete') then
    raise exception 'DAILY_RPC_DENIED';
  end if;
  if command = 'reserve' then
    is_recovery := payload->>'run_id' = '20261012999999999999';
    if (coalesce(payload->>'run_id','') !~ '^[0-9]{8}$' and not is_recovery)
       or payload->>'operation' is distinct from 'content'
       or payload->>'channel' is distinct from 'REVIEW'
       or payload->>'maximum' is distinct from '22528' then
      raise exception 'DAILY_REVIEW_RESERVATION_ONLY';
    end if;
    if is_recovery and (
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
  end if;
  if command like 'issue_%' and
    coalesce(payload->>'approval_id','') !~ '^review-[0-9]+-r1-[a-f0-9]{12}$' then
    raise exception 'DAILY_REVIEW_ISSUE_ONLY';
  end if;
  return kfarmai_private.budget(command,payload);
end $$;
commit;
