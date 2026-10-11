# Integration-10 scoped budget contract

This is an offline candidate. No SQL from this phase was sent to Production.
The existing `20261010011009_automation_durable_budget.sql` remains byte-for-byte
unchanged. The additive migration is
`supabase/migrations/20261010055244_scoped_canary_budget.sql`, created using
`supabase migration new scoped_canary_budget`.

## Exact added objects and privileges

One table: `kfarmai_private.canary_scopes`. Its primary key and four unique
constraints generate five indexes. No new schema, role, policy or trigger is
created. No existing table, function definition, policy or ACL is modified.
The migration rejects a global policy other than `enabled=false` and
`daily_microusd=0` before creating objects. The new table starts empty and grants
no implicit permission to run a Canary.

Three functions are added:

| Signature | Security | EXECUTE |
|---|---|---|
| `kfarmai_private.manage_canary(text,jsonb) returns jsonb` | DEFINER, empty search_path | owner only; additionally requires session_user postgres and no switched role |
| `kfarmai_private.canary_budget(text,jsonb) returns jsonb` | DEFINER, empty search_path | service_role and owner |
| `public.kfarmai_canary_budget(text,jsonb) returns jsonb` | INVOKER, empty search_path | service_role and owner |

The private table uses RLS with no policies. PUBLIC, anon, authenticated and
service_role receive no table privileges. Management has no public/Data API
wrapper. Every table/function reference is schema qualified. The existing
service_role private-schema USAGE from the original migration is reused.

Production owner, exact-name conflicts and API schema-cache exposure still need
a separately authorized preflight; this offline run makes no claim about them.
The management operator requires a trusted PostgreSQL session; JSON booleans,
request claims and user_metadata are not approval authorities. A different
operational SQL session_user fails closed and is not automatically allowed.

## Operator approval and service protocol

`manage_canary('arm', payload)` is a separately approved future operation.
Required identity: approval_id, id (reservation UUID), project_id fixed to
`xzetqijeucldbfgjuoes`, plan_sha256, request_sha256, fingerprint, numeric run_id,
operation `content`, channel `REVIEW`, and maximum (integer 1..212 microUSD).
Arm also requires distinct immutable model_approval_id and budget_approval_id,
daily_microusd between maximum and 212, ttl_seconds between 1 and 300, and
billing_multiplier `1.00` or `1.10` based on account billing evidence.
All approval IDs are unique and cannot be recycled, including after expiry.

Service commands are reserve, dispatch, settle, unknown, freeze and status.
Every service command repeats the full identity above; absent or mismatched
fields fail closed. Settle additionally takes actual integer microUSD and a
SHA-256 receipt. Status returns immutable approval bindings, effective locking,
can_reserve/can_dispatch, server_now and remaining_seconds. The executor derives
a conservative monotonic deadline from the timestamp before the status request
and the server-reported remaining duration, clamped to the earlier of scope
expiry and the next KST midnight. A delayed dispatch reply cannot authorize a
new call in the next budget day.

Management emergency_lock requires the same complete identity. It closes an
unreserved approval without inventing a spend; after reservation it keeps the
full amount unconfirmed. It never refunds, deletes or re-arms a scope.

## Atomicity, expiry and crash contract

All management/service operations first lock the singleton legacy policy row
`FOR UPDATE`. The global policy must remain false/0. This serializes against
the existing Budget RPC and against every scoped arm/reserve/dispatch operation.
The KST day is computed using server clock_timestamp and Asia/Seoul.

Daily accounting sums settled actual amounts and unresolved maximum amounts in
both the existing reservations and new scope ledger. Any unresolved existing
reservation, including one from an earlier KST day, blocks arm and reserve.
Only one unexpired ARMED scope or unresolved scoped reservation can exist.
An unknown scoped reservation blocks later scopes even across a day boundary.
There is no automatic refund or midnight reset of an unresolved authorization.

The scope ledger is separate because the existing service-role Budget RPC can
settle legacy rows using its older fingerprint contract. Placing new scoped
reservations in that table would let the old endpoint bypass the stronger
identity requirement. The new RPC does not change the old endpoint.

ARMED -> HELD -> DISPATCHED -> SETTLED is the successful path. Dispatch is an
atomic, irreversible one-shot grant. Concurrent reserve acquires once;
concurrent dispatch executes once. DISPATCHED/UNKNOWN cannot be dispatched
again. Successful settlement preserves consumed identity; duplicate settlement
is accepted only for the same actual amount and receipt.

Expiry is an effective authorization predicate in every reserve/dispatch,
not a future scheduled UPDATE. An expired row can physically remain ARMED or
HELD while status reports locked; no cron or running process is required.
Reserve/dispatch also reject a different KST day. Settlement may complete after
expiry so real usage is not lost, but it never restores permission to call.

Crashes after reservation retain the maximum and prevent another scope.
Crashes after dispatch retain a consumed grant and prevent another call.
Missing, malformed or excessive usage records UNKNOWN and preserves maximum;
these cases return blocked instead of raising after UPDATE so the lock commits.
An audit array records operator arm/lock and reserve/dispatch/settlement/error.
Usage recovery requires verified evidence and must never assume cost zero.

## Offline verification and approval boundary

`tests/test_scoped_budget.py` exercises real PostgreSQL 17 in a network-none,
tmpfs-only Docker fixture with no ports or DB connection strings. Coverage
includes ACL/RLS/catalog checks, full identity, separate approvals, account fee
binding, real concurrent sessions, effective TTL, KST rollover, abrupt child
process exit after dispatch, durable unknown usage, emergency lock, shared
legacy accounting and prevention of old-RPC bypass. This is not a Production
load test or a Data API write test.

Applying this migration alone does not enable a budget or create a scope.
Future approvals must be separate: (1) this one exact migration after fresh
hash/conflict/backup checks; (2) an operator arm payload bound to the approved
Canary and account billing evidence; (3) the bounded model call and any token
count API operation. No rollback or production SQL is automatic. A destructive
reverse migration would remove audit/budget evidence and requires its own
approval; prefer stopping calls and preserving unresolved amounts.

References reviewed: [Supabase database functions](https://supabase.com/docs/guides/database/functions),
[PostgreSQL 17 row locks](https://www.postgresql.org/docs/17/explicit-locking.html),
and [Supabase changelog](https://supabase.com/changelog).
