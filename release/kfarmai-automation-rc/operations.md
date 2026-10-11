# Production transition procedure

1. Integrate only the release allowlist after review and rerun the recorded checks.
2. Protect the `kfarmai-production-publish` environment and restrict reviewers to the repository owner.
3. Keep `KFARMAI_AUTOPUBLISH_ENABLED=false`, Daily AutoPublish disabled, global budget disabled, and daily limit 0.
4. For one non-test REVIEW, upload the exact package as one Artifact, record its REST identity, and create one Issue containing the exact manifest metadata.
5. After human review, set the approval ID variable to that one identity and enable publishing only for the protected run.
6. The adapter re-downloads and verifies the Artifact, stages only manifest files, pushes content, waits for the exact Pages push run, audits public bytes, writes the audit receipt, waits for its Pages run, rechecks public bytes, then marks PUBLISHED.
7. Return the publish variable to false and verify the Daily workflow and budget locks.

No TEST_ONLY package may enter this procedure. A failed or uncertain step remains pending or failed.
