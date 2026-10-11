-- CANDIDATE ONLY. Requires explicit authorization for the identified DB.
-- Preserve all reservations/receipts/outbox records, including unsettled calls.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
update kfarmai_private.budget_policy set enabled=false where singleton;
revoke execute on function public.kfarmai_budget(text,jsonb) from service_role;
revoke execute on function kfarmai_private.budget(text,jsonb) from service_role;
commit;
-- Do not DROP/TRUNCATE the ledger, reset reservations, or blindly restore backups.
-- Authorized DB owner can still inspect/settle receipts after reconciliation.
