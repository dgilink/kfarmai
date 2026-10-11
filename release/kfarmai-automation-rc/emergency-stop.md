# Emergency stop

1. Set `KFARMAI_REVIEW_PUBLISH_ENABLED=false`.
2. Disable the REVIEW publish workflow if a run has not started. Preserve evidence after a content push.
3. Keep Daily AutoPublish disabled and global/scoped budgets locked.
4. Record the Issue, approval ID, Artifact ID, run ID, commit SHA, and Pages run state.
5. Do not delete production data or run a destructive rollback. Use a separately approved Git revert only after reviewing the content and audit receipt commits.
6. Leave the state pending or audit-failed until the exact deployment can be verified.
