-- Gate 3 security candidate. The official application does not read or write
-- either log table from a browser or Edge Function. Preserve the server-only
-- service_role grant while removing broad browser access to potentially
-- sensitive search terms, image URLs and AI response text.
begin;

alter table public.ai_diagnosis_logs enable row level security;
alter table public.search_logs enable row level security;

revoke all privileges on table public.ai_diagnosis_logs, public.search_logs from public;
revoke all privileges on table public.ai_diagnosis_logs, public.search_logs from anon;
revoke all privileges on table public.ai_diagnosis_logs, public.search_logs from authenticated;

-- The existing bigint ID sequences are also callable by browser roles today.
-- Revoke them with their parent tables so nextval/setval cannot be invoked
-- independently after logging is disabled.
revoke all privileges on sequence public.ai_diagnosis_logs_id_seq,
  public.search_logs_id_seq from public;
revoke all privileges on sequence public.ai_diagnosis_logs_id_seq,
  public.search_logs_id_seq from anon;
revoke all privileges on sequence public.ai_diagnosis_logs_id_seq,
  public.search_logs_id_seq from authenticated;

-- There are intentionally no browser policies. A future client logging path
-- needs a separate, reviewed write-only contract; do not restore broad grants.
commit;
