# Gate 3 Daily AutoPublish readiness (2026-10-12)

This is an evidence inventory, not an activation receipt. Keep the existing
Daily workflow disabled and all production budget/publish switches off.

| Link | Status | Evidence / missing condition |
| --- | --- | --- |
| Schedule → Daily executor | DISABLED | Workflow 377121327 is `disabled_manually`, has literal `if: false`, and cron `0 21 * * *` (06:00 KST). GitHub schedule can be delayed or dropped. |
| Topic selection / dedupe | FIXTURE | `topic_seed.json` and `existing_titles()` exist; no durable daily topic claim. |
| Official source verification | FIXTURE | `autopublish_pipeline.source_validation()` trusts fixture-provided text and HTTP status; no live retrieval/claim verification. |
| Model router | LOCAL POLICY | `model_router.py` selects a tier; it does not execute a model request. |
| Durable budget | ISOLATED TEST | `durable_budget.py` and RPC tests exist. The live Daily workflow has no trusted budget transport and hardcodes USD 0. |
| Content generation / QA | FIXTURE | `autopublish_pipeline.generate()` accepts only `is_fixture=True`; the legacy Daily runner returns `LIVE_REVIEW_GENERATION_NOT_IMPLEMENTED`. |
| Media / immutable REVIEW package | FIXTURE + PRIOR ONE-OFF LIVE | The fixture pipeline requires a generated WebP. The verified Gate C/D workflow is bound to one approved greenhouse article and cannot accept arbitrary Daily output. |
| Artifact / REVIEW Issue | PRIOR ONE-OFF LIVE | `review_submission.py` pins a single source descriptor and slug. No general Daily upload/Issue adapter exists. |
| Human approval → publish → Pages → audit → registry | PRIOR ONE-OFF LIVE | The existing contracts worked for the approved greenhouse article, but Daily output has no verified binding to them. No Daily publication is authorized. |

## Cost and operating decision

The existing `autopublish_pipeline.COST` and `IMAGE_COST` values explicitly
describe synthetic fixture ceilings; they are not provider quotations. The
configured USD 0.15/day is only a candidate, not a proven maximum. The current
fixture pipeline may call discovery/search, text generation and image generation.
Official [gpt-6-luna rates](https://developers.openai.com/api/docs/models/gpt-6-luna)
for Standard short-context are USD 0.10/M input and USD 0.50/M output tokens;
[web search pricing](https://developers.openai.com/api/docs/pricing) includes a
per-call fee plus content tokens. [GPT Image 2.5 Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare)
is token-billed, and its output-token bound has not been
attested for this Daily payload. Token counting and regional pricing also need
to be accounted for before a pre-call reservation can cover all charges.

Initial policy remains REVIEW ONLY; HIGH, paid search and automatic image
generation are disabled until bounded and separately verified. Never label a
missing hero image or unverified source as a completed artifact. No response,
usage or source fetch may silently fall back to a fixture.

## Production RLS review

Security Advisor reports RLS disabled on nine exposed public tables. All nine
have broad `anon` and `authenticated` table grants and no policies. This is a
production exposure, independent of whether the table is currently empty.

| Table | Observed use / treatment |
| --- | --- |
| `ai_diagnosis_logs`, `search_logs` | HIGH: potential user queries, image URLs and AI text. No references in the official application or Edge Function tree. The accompanying forward-migration candidate enables RLS and removes all browser table grants; service-role grants remain. Do not apply until external clients are checked. |
| `pesticide_shops`, `agri_companies` | Existing nonempty public data (3,019 and about 120 rows); preserve read availability while designing read-only policies. Broad browser writes still need removal. |
| `agri_products`, `pesticide_registry`, `market_prices`, `subsidies`, `agri_events` | Empty or no observed direct official-code access, but all remain exposed. Review external clients and desired public read access before migration. |

No production RLS change is included in this code commit. The two-log migration
is a reviewed candidate only; its local negative tests must pass. The other
seven tables need separate access contracts, not an indiscriminate RLS toggle.

## Activation blocker

Do not enable workflow 377121327, `KFARMAI_AUTOPUBLISH_ENABLED`, review
publishing or the Global Budget until a real bounded live provider, immutable
Daily Artifact/Issue binding, durable once-per-KST-day claim, confirmed cost
ceiling, source QA and emergency stop have passed end-to-end. The previous
one-off Gate C/D evidence cannot substitute for a Daily live run.
