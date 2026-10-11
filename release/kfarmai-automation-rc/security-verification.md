# Security verification

The production REVIEW workflow is disabled unless repository variables match the exact approval scope and the protected `kfarmai-production-publish` environment grants the job. It revalidates repository, owner actor ID, Issue identity, Artifact identity, Manifest bytes, current main, exact Git index, and exact Pages push receipts.

Token permissions are limited to `actions: read`, `contents: write`, and `issues: write` in the protected publish job. No Pages, deployments, OIDC, Supabase, or OpenAI secret is referenced. TEST_CANARY, HOLD, expired or tampered artifacts, unexpected paths, symlinks, duplicate approvals, and duplicate publication keys fail closed.

Secret scans must be rerun before integration. The local REVIEW package contains only public source URLs and generated package identifiers.
