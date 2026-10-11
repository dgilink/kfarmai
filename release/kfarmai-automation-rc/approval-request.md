# Remaining production approvals

## Gate 1 — AI API account and one model call

Confirm the KFarmAI OpenAI organization/project, key permissions, model access, and billing. Then approve one scoped Canary authorization with TTL at most 300 seconds, one bounded token-count request if required, and one LIGHT Responses call with zero retries/search/images. Cost remains unapproved until official pricing and account eligibility are revalidated. Recovery is TTL/emergency lock plus usage reconciliation.

Approval phrase: `Gate 1 KFarmAI LIGHT Canary 승인`

## Gate 2 — one non-test REVIEW publish and audit

Approve the reviewed release allowlist, package Artifact upload, one REVIEW Issue, one owner approval command, one protected publish execution, exact content and receipt commits/pushes, corresponding Pages runs, and final receipt. Expected public impact is one reviewed article, hero image, infographic, and sitemap entry. Recovery is immediate variable lock, evidence preservation, and separately approved Git revert if needed.

Approval phrase: `Gate 2 비테스트 REVIEW 1건 제한 게시·감사 승인`

## Gate 3 — scheduled production activation

Only after Gates 1 and 2 pass, approve the exact daily budget, model allowlist, schedule/workflow enablement, and monitoring window. Expected cost must use then-current official pricing. Recovery is workflow disablement, the existing variable lock, global budget disable/0, and emergency lock.

Approval phrase: `Gate 3 자동게시 Production 활성화 승인`
