# Feature List Harness Usefulness Review v1

Status: review complete; owner accepted `defer`

Prepared: 2026-08-14

Integration plan: `agentic-patterns-integration-plan-v1.md`, Stage 2 Pattern 16

## Decision requested

Decide whether Orchestrator currently needs a capability-level view derived
from existing acceptance claims, verification receipts, review evidence, and
regression results.

This record is a Stage 2 admission review only. It does not authorize a
contract, queue, product code, schema, API, UI, persistence, run-record,
Project Map, provider, or external-system change.

## 1. Concrete problem and affected workflow

An owner or maintainer cannot answer one question from a single current
artifact: which Orchestrator capabilities are proven on the current `main`,
which have only historical completion evidence, and which are unknown after a
relevant source or test change.

The affected workflows are release/readiness review, project handoff, and
selection of the next product slice. This is not currently an execution-time
operator decision and does not block queue dispatch, incident handling, audit,
or outcome analysis.

## 2. Repository evidence

- `docs/NEXT_STEPS.md`, `docs/context_packs/current_status.md`, completion
  reviews, contracts, tests, and canonical `run.json` records each hold a
  different part of the answer. No one of them is globally canonical.
- On 2026-08-14, `docs/context_packs/current_status.md` still said that S6 was
  unauthorized even though the active integration plan and later text in the
  same context pack said it was accepted, implemented, and
  completion-reviewed. The bounded correction removed that contradiction.
- The earlier Pattern 14 admission record also documents contradictory active
  status claims found during the combined Stage 1 review. These findings show
  that manually maintained summaries can drift, but do not yet establish a
  recurring post-Pattern-14 operational failure.
- `server/operator-projections-v1/index.ts` exposes exactly five project-ledger
  views: `overview`, `execution-bucket`, `incidents`, `prompt-registry`, and
  `eval-lineage`. None maps repository capabilities to current verification.
- Phase 8 audit bundles cover one exact project sequence range or change and
  preserve event, projection, and operator-action receipt lineage. They do not
  assess repository-wide feature health.
- Phase 9 outcome scorecards calculate bounded cohort metrics. They explicitly
  do not turn metrics into feature acceptance or action authority.
- Repository tests are grouped by files, scripts, and test names. They do not
  expose a closed stable capability identifier that can be joined to an
  accepted contract or completion review.
- Canonical run records retain exact task verification commands and results,
  but those receipts are task-scoped. Current records do not provide a
  repository-wide capability mapping or, in every run mode, an exact current
  Orchestrator commit identity from which present capability health could be
  inferred.

Evidence establishes a navigation and reconciliation cost. It does not yet
establish its frequency, release impact, or operational severity after the
Pattern 14 process was introduced.

## 3. Existing mechanisms and why a focused fix is sufficient today

Current code and tests remain product truth. Accepted contracts and completion
reviews define bounded claims, while `docs/NEXT_STEPS.md` and the current
context pack provide navigation. `npm run test:stage1`, focused suites, the
full Windows regression, and completion review can validate a declared slice.

The concrete S6 contradiction was repairable as one bounded documentation fix.
Pattern 14 now requires high-risk contracts to challenge cross-slice evidence
before owner acceptance. There is no measured release or operator workflow
that currently requires a continuously available capability projection.

Adding a harness now would first require inventing a capability-to-claim and
capability-to-check mapping that existing receipts cannot derive. That mapping
would risk becoming the mutable canonical feature registry explicitly rejected
by the integration plan.

## 4. Smallest non-duplicating extension if evidence later justifies it

Reconsider only a stateless, read-only derived report. A future contract would
need to prove all of the following before implementation:

1. capability identities come from accepted, versioned evidence rather than a
   second mutable lifecycle registry;
2. every status binds exact source identities and exact machine verification
   receipts for the assessed revision;
3. absent, stale, partial, conflicting, or historically scoped evidence yields
   `unknown` or `unsupported`, never `passed`;
4. the report performs no tests, writes no state, grants no acceptance or
   release authority, and remains subordinate to code and canonical records;
5. audit bundles and scorecards are linked or reused where relevant, not
   copied into a parallel evidence store.

No exact mutation surface is proposed by this review.

## 5. Authority, persistence, privacy, effects, and recovery

A future derived report must be read-only and non-authoritative. It must not
publish acceptance, activate a feature, change a queue or run, close an
incident, approve a release, or mutate canonical evidence.

No new persistence is justified. Evidence references must stay bounded and
privacy-safe; command output, prompt content, environment values, credentials,
and raw source content must not enter the projection. With no effect or stored
state, recovery behavior is unnecessary beyond deterministic recomputation and
fail-closed stale-source handling.

## 6. Measurable success and guardrails for reconsideration

Potential success measures:

- median time to answer one declared capability-readiness question;
- percentage of displayed capability claims carrying exact current-revision
  source and verification evidence;
- number of contradictory status claims found during handoff or completion
  review;
- number of capabilities correctly returning `unknown` after relevant evidence
  changes.

Required guardrails:

- zero `passed` states derived only from prose, filenames, test names, aggregate
  suite status, or historical completion text;
- zero new acceptance, release, execution, or mutation authority;
- zero parallel canonical registry or persistent evidence store;
- deterministic byte-equal output for identical bounded evidence.

No baseline currently exists for the timing or frequency measures, so a
quantitative benefit claim would be unsupported.

## 7. Recommendation

Recommendation: `defer`.

The repository shows a real but currently bounded documentation-reconciliation
problem. It does not show a sufficiently frequent or costly operator decision
to justify a new feature, and the existing evidence lacks the stable semantic
joins required for a trustworthy derived status. Implementing now would be
more likely to create another manually maintained source of truth than to
remove one.

## 8. Reconsideration triggers

Reopen the discussion only when at least one of these is evidenced:

- two or more new contradictory capability-status findings occur after Pattern
  14 adoption;
- a repeated release or handoff decision requires capability-level readiness
  and cannot be answered from current tests, contracts, audit bundles, and
  scorecards within an owner-agreed time bound;
- canonical verification evidence gains exact assessed-revision and stable
  claim/capability bindings that permit a projection without filename or prose
  inference;
- an operator records a concrete decision that existing Phase 6, Phase 8, and
  Phase 9 views cannot support.

## 9. Owner decision

Owner decision on 2026-08-14: `defer` (explicit owner instruction in the
current Codex task).

Pattern 16 remains deferred. This decision authorizes no follow-on contract or
implementation. Reopening it requires evidence satisfying a reconsideration
trigger above and a new owner-reviewed usefulness discussion.
