# Approved November editorial batch

The owner approved the reviewed 17 manuscripts and their photographs, and explicitly
instructed publication in the conversation on 2026-11-28: “승인할게 게시 배포해.”
Approval identity: `review-20261128-fc4ae41e30ff4239`. Three duplicate policy topics
are excluded. The source HTML, shared CSS and 18 photo placements retain their
reviewed SHA-256 values. No new editorial generation, paid API, or Daily REVIEW
approval is enabled by this queue.

## Registered release plan (KST)

| Date | Nominal slots | Count |
|---|---|---:|
| 2026-11-29 | 09:00, 09:30, 10:00, 10:30, 11:00 | 5 |
| 2026-11-30 | 09:00, 09:30, 10:00, 10:30, 11:00 | 5 |
| 2026-12-01 | 09:00, 09:30, 10:00, 10:30, 11:00 | 5 |
| 2026-12-02 | 09:00, 09:30 | 2 |

The finite workflow `kfarmai-approved-batch-20261128.yml` polls at :07 and :37
from 09:07 to 23:37 KST on these dates. GitHub Actions schedules can be delayed;
nominal timestamps are eligibility times, not proof of public availability.
At most one article is released per run, at least 30 minutes after the preceding
public verification, and no more than five registry articles on the actual KST
day, including other publications. A missed day's articles are held, never
silently rolled into another day. The workflow disables itself upon completing
all 17 or at the December 3 expiry check.

## Execution and evidence

1. Verify explicit approval, the full immutable content hash set and release window.
2. Check registry, source files and sitemap for duplicates. Check current official
   source facts and readable attachment hashes. Source changes or errors stop release.
   Exception: the Kimhae corn notice times out from hosted runners. Its official
   page was rechecked in Ego Lite at 2026-11-28 14:04 KST, including price, deadline
   and quantity restriction. Only a connection timeout may use this hashed browser
   evidence, only until December 1 00:00 KST and at most 72 hours after verification.
   A changed response, HTTP rejection, or expired evidence still blocks release.
   Receipts label this fallback and never call it a successful live recheck.
3. Copy exact approved bytes to kb/static, update the registry and sitemap, then run
   the existing Pages build, security verifier, SEO tests and git diff check.
4. Commit and push only selected article/assets, registry/sitemap and state. Dispatch
   the existing `pages.yml` deployment, because pushes using GITHUB_TOKEN do not start
   another push workflow. No deployment route or Daily REVIEW workflow is replaced.
5. Wait for the matching Pages run, verify public HTML against the built artifact,
   photo hashes, sitemap and home/agriculture listings. Save the run URL, commit and
   actual verification time in `state.json` and the Actions receipt artifact.

An unverified release blocks the next one. A maintainer must reconcile a failed
deployment against its Pages run and live URLs before editing the receipt. No
failure is converted to a success and no content is automatically rewritten.
Disable this specific workflow to pause the queue; use revert for a published
article rollback. The original Daily REVIEW cron and Supabase are unchanged.

The build resolves portable `../static/kb/` photo references for listing thumbnails
without modifying approved HTML. Only public allowlisted directories enter Pages;
this approval manifest, future manuscripts, source guards, and receipts do not.

## Validation before activation

- 37 approved file references verified; 17 manuscripts / 18 photo placements.
- Isolated all-article build: 986 files, 425 sitemap URLs; security and SEO 7/7 PASS.
- Mobile integration: 34 article checks (360/390 px), no overflow/broken images.
- New queue/relative-photo tests: 14 PASS.
- Python regression: 423 tests, 325 passed / 98 skipped / 0 failed.
- JavaScript regression: 88 tests, 83 passed / 5 existing baseline failures.
  Existing failures concern legacy thumbnail contracts, favicon contracts and the
  existing KB search contract. The dedicated Pages security verifier passes.
- Hosted Pages Python audit retains 7 existing static-hero errors (419 tests,
  98 skipped); the previous baseline deployment has the same errors. Local Python
  includes the installed image dependency and passes as recorded above.

The original research-day records were not located. Topic-to-day/bucket attribution
uses the owner's 30-topic list, not a reconstructed historical search log.
