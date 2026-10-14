-- Evidence-bound, one-shot settlement for GitHub run 38235823867 only.
-- The OpenAI Usage Dashboard export proves one default-tier gpt-6-luna request:
-- 3 uncached input * 0.10 + 1,167 cache writes * 0.125 + 8,192 output * 0.50,
-- then the established 1.10 internal multiplier, rounded up to micro-USD = 4,667.
-- The daily CSV total (5,044 micro-USD) is intentionally recorded as corroboration,
-- never used as this call's amount.
begin;

create table kfarmai_private.daily_usage_reconciliations (
  reservation_id uuid primary key references kfarmai_private.reservations(id),
  run_id text not null check (run_id ~ '^[0-9]{1,20}$'),
  provider text not null check (provider = 'openai'),
  model text not null check (model = 'gpt-6-luna'),
  service_tier text not null check (service_tier = 'default'),
  request_id text not null,
  response_id text not null,
  input_tokens integer not null check (input_tokens = 1170),
  uncached_input_tokens integer not null check (uncached_input_tokens = 3),
  cache_write_tokens integer not null check (cache_write_tokens = 1167),
  output_tokens integer not null check (output_tokens = 8192),
  actual_microusd bigint not null check (actual_microusd = 4667),
  evidence_fingerprint text not null unique check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence jsonb not null,
  reconciled_at timestamptz not null default clock_timestamp()
);
alter table kfarmai_private.daily_usage_reconciliations enable row level security;
revoke all on table kfarmai_private.daily_usage_reconciliations from public, anon, authenticated, service_role;

do $$
declare
  target constant uuid := '618ca125-38a6-5b7f-a502-4ca79e3dc41b';
  expected_fingerprint constant text := '0a811ca1c7596406015e2674a79b5d2136fc4858bfa9af450a8bfcb5fde371da';
  expected_actual constant bigint := 4667;
  current_row kfarmai_private.reservations%rowtype;
  settled jsonb;
  evidence jsonb := jsonb_build_object(
    'evidence_source', 'OpenAI Usage Dashboard export plus GitHub Actions run 38235823867',
    'run_id', '38235823867',
    'request_id', 'req_ec7fe8ce55ed4a3b8d23f0601c30e7ac',
    'response_id', 'resp_016af8709a209941016accb504651487d08600de9e2bb2201d',
    'model', 'gpt-6-luna',
    'service_tier', 'default',
    'input_tokens', 1170,
    'uncached_input_tokens', 3,
    'cache_write_tokens', 1167,
    'output_tokens', 8192,
    'cost_csv_daily_total_microusd', 5044
  );
begin
  -- The migration cannot be replayed or broadened to any other reservation.
  if exists (select 1 from kfarmai_private.daily_usage_reconciliations) then
    raise exception 'DAILY_USAGE_RECONCILIATION_ALREADY_APPLIED';
  end if;
  select * into strict current_row from kfarmai_private.reservations where id = target for update;
  if current_row.id <> target
     or current_row.run_id <> '20261012777777777777'
     or current_row.operation <> 'content'
     or current_row.channel <> 'REVIEW'
     or current_row.maximum <> 22528
     or current_row.state <> 'UNKNOWN'
     or current_row.actual is not null then
    raise exception 'DAILY_USAGE_RECONCILIATION_TARGET_MISMATCH';
  end if;
  -- The fingerprint was calculated from canonical compact JSON outside PostgreSQL;
  -- compare the value object here without relying on extension availability or
  -- PostgreSQL's presentation whitespace for jsonb::text.
  if evidence <> '{"cache_write_tokens":1167,"cost_csv_daily_total_microusd":5044,"evidence_source":"OpenAI Usage Dashboard export plus GitHub Actions run 38235823867","input_tokens":1170,"model":"gpt-6-luna","output_tokens":8192,"request_id":"req_ec7fe8ce55ed4a3b8d23f0601c30e7ac","response_id":"resp_016af8709a209941016accb504651487d08600de9e2bb2201d","run_id":"38235823867","service_tier":"default","uncached_input_tokens":3}'::jsonb then
    raise exception 'DAILY_USAGE_RECONCILIATION_EVIDENCE_MISMATCH';
  end if;
  settled := kfarmai_private.budget('settle', jsonb_build_object(
    'id', target::text,
    'fingerprint', current_row.fingerprint,
    'actual', expected_actual,
    'receipt', expected_fingerprint
  ));
  if settled->>'state' <> 'SETTLED' or coalesce((settled->>'duplicate')::boolean, false) then
    raise exception 'DAILY_USAGE_RECONCILIATION_SETTLEMENT_FAILED';
  end if;
  insert into kfarmai_private.daily_usage_reconciliations (
    reservation_id, run_id, provider, model, service_tier, request_id, response_id,
    input_tokens, uncached_input_tokens, cache_write_tokens, output_tokens,
    actual_microusd, evidence_fingerprint, evidence
  ) values (
    target, '38235823867', 'openai', 'gpt-6-luna', 'default',
    'req_ec7fe8ce55ed4a3b8d23f0601c30e7ac',
    'resp_016af8709a209941016accb504651487d08600de9e2bb2201d',
    1170, 3, 1167, 8192, expected_actual, expected_fingerprint, evidence
  );
  if exists (select 1 from kfarmai_private.reservations where state <> 'SETTLED') then
    raise exception 'DAILY_USAGE_RECONCILIATION_UNCONFIRMED_REMAINS';
  end if;
end $$;

commit;
