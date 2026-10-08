# GIS review premise priority fix v1

Status: implemented and [source-accepted](gis-review-premise-priority-acceptance-20261008.md),
2026-10-08; originally proposed before implementation. Role: one bounded source
fix in the current session; navigation: [NEXT_STEPS](NEXT_STEPS.md).
Evidence: [disputed live verdict](gis-prelaunch-successor-operational-20261007.md),
canonical run `muyhl0fp-hq10k`, and current `buildReviewerPrompt` code.
Private verification evidence: `queues/gis-review-premise-fix-20261008/`.

The legacy reviewer receives task scope containing a historical instruction to
change an em dash to ASCII. The actual prepared primary content and pinned product
blob both return U+2014. The scope labels the assignment but does not explicitly
distinguish its factual premises from source evidence. This is a confirmed prompt
ambiguity; it does not prove why the live model issued its contradictory verdict.

Make assignment facts, proposed corrections and historical reviewer quotations
explicitly subject to current source inspection. Require source-based correction
of a false descriptive premise, not modification of valid output to satisfy it.
Explicitly authorized desired changes remain requirements: current source still
implementing old behavior is an unimplemented-change defect. For GIS, require
each response's corresponding current bundle primary content and separate missing
context limitations; keep required source reads bounded to exact supplied paths.
Preserve Unicode literals and all assignment/verification evidence. Do not hide a
claim, synthesize approval, rerun a reviewer or change budgets and authorization.

Scope: `server/index.ts` reviewer prompt construction, focused prompt contract
tests in `server/index.test.ts` and GIS prompt fixtures in
`server/gis-quality.integration.test.ts`, this document and `docs/NEXT_STEPS.md`. Test both
U+2014 source / U+002D proposed correction and the inverse, with missing evidence
remaining a limitation, plus explicitly requested literal changes left unimplemented
in both directions. Run focused prompt and existing production recovery gates,
check/build, context smoke and explicit-PYTHON Context Budget, Node22 focused
coverage, full regression and independent source/evidence review. Source acceptance
does not prove model obedience or installed/live recovery.

The existing `RecoveryTaskBindingV1` path supports a failed verified result with
`changes_requested`; a separately authorized recovery produces a fresh bounded
patch result and runs its own required gates and independent acceptance. It does
not reopen the old source or refund its claims/counters. No reviewer-only bypass,
new policy envelope or automatic substantive retry is introduced by this fix.
Future deployment and real recovery are separate operational boundaries; old
bound queues, receipts, evidence scripts and Project Map remain unchanged.
