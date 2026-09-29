# Implementation Roadmap

Planning revision: 2026-09-04. Source:
[Nikolay evidence update](nikolay-evidence-update-2026-09-04.md).
This revision updates future planning and admission criteria, not historical
completion receipts or accepted runtime contracts.

## Planning and acceptance rules for subsequent work

1. Complete code/architecture research and resolve material alternatives before
   executable task authoring. Bind the accepted spec to exact files, relevant
   symbols, base revision, impact scope, dependencies and stop conditions.
   Unknown write scope requires investigation in the current session first.
2. Keep one bounded feature and its tests/verification in the same task. The
   CRUD example includes implementation, coverage and execution of checks.
   Do not split correctness work to reach a queue minimum. Independently useful
   test-only contracts remain possible under the repository authoring rules.
3. Define DoD and stage-specific evidence before execution: task verification,
   independent review, whole-change checks, and human/browser acceptance where
   required. Automated success cannot stand in for unperformed human testing;
   batch acceptance must retain each feature's evidence and decision.
4. Reuse Phase 2 drift checks, Phase 3 isolation/serialized merge and Stage 1
   budgets/capability gates. Gates and bounded branches/retries remain the
   execution model; subagent count is not a delivery target.

## Updated order of future planning

| Order | Bounded planning outcome | Exit evidence / boundary |
|---|---|---|
| 1 | Resolve Phase 13 source owners, stable product/project joins and feature-to-task acceptance mapping. | Explicit decisions and concrete fixtures required by the placement record below; no inference of IDs from abbreviations. |
| 2 | When admitted, specify and verify a read-only reconciliation projection before its widgets or new intake. | Exact denominators, missing/conflicting-source behavior and no-mutation evidence; unresolved findings cannot count as accepted delivery. |
| 3 | Review CLI/UI/agent interface reuse against existing domain APIs and Phase 7 authority, Phase 5 routing, and Stage 1 capability/budget contracts. | A bounded overlap/gap map and proposed adapter scope before any implementation queue. Shared services must preserve identical authorization and receipts; no parallel canonical store or automatic MCP replacement. This review is not a Phase 13 dependency. |
| 4 | Assess wave-branch/task-branch concurrency only when a concrete workload needs it. | First compare with Phase 3; define dependency/overlap, stale-base, serialized merge, restart and budget fixtures before proposing a contract extension. Same-worktree ordinary queues remain sequential. |
| Deferred | Evolutionary agents, automatic prompt/tool promotion and incubator workflows. | Reproducible baseline, fixed evaluation cohort, independent assessment, bounded costs, rollback and explicit promotion authority are prerequisites. The chat does not prove this capability works. |

These are planning outcomes, not pre-authored writing tasks. Scope discovery
for later outcomes must finish before concrete queues are created. Existing
Phase 1-12 completion status is unchanged; Phase 13 remains the next candidate.

## Proposed Agentic Patterns follow-up: context efficiency

The following sequence is a sidecar planning track. It does not replace,
renumber, block, or authorize the candidate Phase 13 Work Inventory and
Roadmap work. It also does not authorize a queue, schema, runtime change, or
provider feature until each plan has passed its own admission review.

| Order | Planning artifact | Admission / implementation order |
|---|---|---|
| CE | [Coordination Economics v1](coordination-economics-plan-v1.md) | First: create a read-only, canonical-run report for context allocation, process fan-out, proven waits, usage availability, and outcomes. Review a predeclared cohort before making any optimization claim. |
| CA | [Context Allocation v1](context-allocation-plan-v1.md) | Only after CE evidence identifies an addressable problem: add an opt-in deterministic count/byte policy over the existing context router and receipts. It must preserve legacy queues and never become chat memory or adaptive retrieval. |

The dependency is deliberate: measuring the coordination/context cost precedes
changing context selection. Neither artifact treats long-lived sessions,
cross-thread messaging, inferred repeated research, provider cache savings, or
subagent count as proven product value.

## Phase 1: Change and Wave Foundation

Launch-ready: `queues/change-control-foundation-v1.yaml`

Deliver an atomic change event ledger and API, then add wave/task dependencies,
readiness, dispatch, and audited override. Exit only when state can be replayed
deterministically and illegal transitions fail closed.

## Phase 2: Planning and Drift

Define structured acceptance claims, evidence-backed blast radius, plan-base
SHA, stale-plan detection, and architect replan receipts. Create this queue
only after Phase 1 schemas and APIs are verified.

Implemented contract:
`docs/architecture/change-control-plane/planning-drift-contract-v1.md`.
It fixes document schemas, task-level acceptance and blast-radius ownership,
lifecycle, trusted repository-state resolution, dispatch rejection, and replan
lineage. The completed local two-task queue is retained as ignored execution
history at `queues/planning-drift-v1.yaml`.

## Phase 3: Workspace and Merge

Implemented contract:
`docs/architecture/change-control-plane/workspace-merge-contract-v1.md`.
Managed attempts use owned Windows-capable worktrees and branches bound to the
exact Phase 2 plan/base identity. Canonical workspace and merge transitions,
fresh-target validation, cross-process serialized merge, deterministic replan
on target drift, crash recovery, and bounded non-force cleanup are implemented
and covered by the repository integration suite.

## Phase 4: Halts and Incidents

Implemented contract:
`docs/architecture/change-control-plane/halts-incidents-contract-v1.md`.
The canonical ledger now covers halt/incident identity and lifecycle,
deterministic correlation, attribution confidence, Warden verdicts and fenced
leases, the five closed typed Doctor recipes, crash-safe repair receipts and
replay, and independently authorized retry/resume events. Retry allocates a
new attempt and records stale-plan evidence so Phase 2 planning,
authorization, drift, dependencies, acceptance, Phase 3 ownership, and
blocking incidents are re-entered rather than bypassed.

## Phase 5: Prompt/Model/Eval Lineage

Implemented contract:
`docs/architecture/change-control-plane/prompt-model-eval-lineage-contract-v1.md`.
It fixes immutable prompt artifacts, model-route and resolved-execution
identity, pre-execution attempt bindings, versioned suites and cohorts,
deterministic eval reports, comparability gates, and separately authorized
champion decisions. Both implementation slices are present in the canonical
ledger, HTTP API, schemas, replay logic, and tests.

## Phase 6: Operator Projections

Accepted contract:
`docs/architecture/change-control-plane/operator-projections-contract-v1.md`.
Slice 1 builds deterministic, watermarked, read-only cross-project APIs for
overview, execution bucket, incidents, prompt registry, and eval lineage.
Slice 2 consumes only those APIs in the dashboard. Neither slice adds canonical
write authority.

Slice 1 is implemented with Draft 2020-12 schemas, stable cursor pagination,
bounded project scope, partial-source warnings, privacy-safe summaries, and
integration tests proving the GET routes do not mutate canonical state. Slice 2
is implemented as a read-only dashboard with all five views, explicit loading
and evidence states, refresh, and cursor pagination. It contains no canonical
mutation controls.

## Phase 7: Operator Actions

Accepted contract:
`docs/architecture/change-control-plane/operator-actions-contract-v1.md`.
Slice 1 adds deterministic preview/execute/receipt APIs for five closed action
kinds while delegating every mutation to its existing Phase 2-4 authority
gate. Slice 2 adds explicit-confirmation controls to the operator dashboard.
Neither slice adds autonomous action or a new authority type.

Slice 1 is implemented with Draft 2020-12 contracts, deterministic no-write
preview, fresh explicit-confirmation execution, atomic
`OperatorActionReceiptV1` publication, exact idempotency, serialized conflict
handling, bounded private diagnostics, restart replay, and HTTP integration
coverage for all five actions. Slice 2 adds contextual incident controls with
fresh preview, explicit confirmation, denial/stale handling, immutable receipt
rendering, keyboard access, and projection refresh. Controls remain hidden when
the projection cannot prove a complete target.

## Phase 8: Audit Bundles

Accepted contract:
`docs/architecture/change-control-plane/audit-bundles-contract-v1.md`.
Slice 1 defines deterministic privacy-safe read-only audit bundles for one
bounded project sequence range or one exact change. Slice 2 adds a read-only
dashboard view and direct bounded JSON download. Neither slice adds a second
ledger, persistent archive, external publication, notification, background
capture, new action, or new authority type.

Slice 1 is implemented with closed Draft 2020-12 schemas, canonical hashing,
strict GET-only parsing, exact optional watermark preconditions, fixed count
and byte limits, privacy-safe errors, Phase 6 projection and Phase 7 receipt
summaries, legacy/restart replay, and explicit no-mutation HTTP evidence for
both selectors. Slice 2 is implemented as a read-only Control plane view that
selects existing Phase 6 project/change evidence, renders the bounded Phase 8
response and explicit failure states, and downloads the already-returned JSON
only after a direct user action.

## Phase 9: Outcome Scorecards

Accepted contract:
`docs/architecture/change-control-plane/outcome-scorecards-contract-v1.md`.
Phase 9 defines deterministic privacy-safe read-only scorecards for one bounded
project cohort, joining only exact canonical ledger evidence and immutable run-
record identities. It calculates a closed registry of delivery and safety
metrics with explicit denominators, coverage, exclusions, and unsupported
outcomes. It does not add telemetry, a database, background aggregation,
notifications, publication, baseline authority, or product-impact claims.

Slice 1 is implemented with closed Draft 2020-12 schemas, strict discovery and
closed-manifest parsing, exact watermark and run-record identity fencing,
deterministic calculation of the seven metrics, explicit zero-denominator and
unsupported states, privacy/count/byte limits, restart coverage, and
before/after no-mutation HTTP evidence. Compute remains request-scoped, in
memory, read-only, and delegated to the domain service. Slice 2 is implemented
as a Russian read-only Control Plane view that consumes only bounded Phase 6
selection evidence and Phase 9 responses, preserves exact machine identities,
renders explicit non-numeric insufficient/unsupported states, and downloads the
already-returned bounded JSON only after direct user action. The 16 focused
Phase 9/API/UI tests, TypeScript, production Vite build, and diff checks pass.
Automated rendered checks in the in-app Chromium browser verified the Russian
Control Plane at desktop and 390 px mobile widths with meaningful content, a
clean console, and no page-level horizontal overflow. Owner-provided Windows
desktop verification independently confirmed the installed application. The
formal completion review passed on 2026-08-06.

## Phase 10: Operational Outcome Evidence

Accepted contract:
`docs/architecture/change-control-plane/operational-outcome-evidence-contract-v1.md`.
Phase 10 defines one bounded authority for caller-supplied deployment,
post-delivery defect, and measured provider-cost evidence. Slice 1 is
implemented and verified with closed sources, observations, attribution
decisions, preview/execute imports, immutable receipts, replay, privacy limits,
exact idempotency, concurrency fencing, and bounded HTTP APIs in the existing
project ledger. Slice 2 is implemented in Phase 9 with exact eligible
production deployment cohorts, completed 7/30/90-day defect windows requiring
confirmed attribution, and complete exact provider-invocation coverage in one
currency. Every result retains explicit denominators, coverage, exclusions,
and evidence references; legacy evidence remains unsupported. External connectors, background capture,
publication, deployment/rollback execution, automatic attribution, business
impact, currency conversion, and a second ledger remain outside Phase 10.

The Phase 10 completion review passed on 2026-08-07: focused Phase 9/10 tests,
TypeScript, production build, context smoke, diff checks, the 260/260 Windows
regression, and read-only desktop/390 px rendered QA passed. Phase 11 now
proceeds only within its separately accepted contract.

## Phase 11: Operational Evidence Intake

Accepted and reviewed contract:
`docs/architecture/change-control-plane/operational-evidence-intake-contract-v1.md`.
Phase 11 adds one local Russian Control Plane section over existing Phase 6
selection and Phase 10 APIs. Slice 1 is a read-only projection/intake shell.
Slice 2 adds locally reviewed source lifecycle and preview-first,
explicit-confirmation observation import and defect attribution. The phase adds
no backend route, canonical event, connector, background work, automatic
attribution, deployment/billing action, draft persistence, or scorecard
authority. Slice 1 is implemented: one GET-only Russian intake section uses
exact Phase 6 project/change selection and renders bounded Phase 10 projection
groups and explicit safe states. Slice 2 is implemented with local-review
source lifecycle, preview-first import/attribution, stable request identity,
ambiguous-result receipt reconciliation, exact retry, closed local JSON
validation, and no draft persistence.
Slice 2 verification passed on 2026-08-07: five focused Phase 11 tests,
TypeScript, production build, context smoke, diff checks, the final 265/265
Windows regression, and isolated-ledger Chromium interaction at 1280/390 px.
The formal Phase 11 completion review passed on 2026-08-07 with all 13
acceptance clauses evidenced and no unresolved or deferred finding. Phase 11
has no Slice 3. Any Phase 12 implementation requires a separately reviewed and
accepted contract; the contract below now satisfies that prerequisite.

## Phase 12: GitHub Deployment Connector

Accepted and formally reviewed contract:
`docs/architecture/change-control-plane/github-deployment-connector-contract-v1.md`.
Slices 1-2 are implemented and completion-reviewed. Phase 12 is limited to one
manually triggered, read-only adapter for one exact GitHub production deployment
and terminal status. It maps only `success`, `failure`, and `error` into the
existing Phase 10 deployment observation, uses fixed server-side repository
configuration and least-privilege credentials, performs a no-mutation preview,
refetches the same remote snapshot for explicit-confirmation execute, and
delegates the only canonical mutation to Phase 10.

Slice 1 provides closed runtime config, three bounded GitHub GETs,
deterministic sanitized mapping, two connector POST routes, Phase 10 delegation,
privacy/freshness/idempotency enforcement, receipt-first reconciliation, and
mocked-network tests. Its five focused tests, combined Phase 10/12 run 11/11,
TypeScript, production build, context smoke, diff checks, and the full 270/270
Windows regression pass. Slice 2 adds only the confirmed Russian operator
workflow: compatible-source selection, sanitized preview, explicit
confirmation, immutable receipt, reconciliation, exact retry, and responsive
desktop/390 px states. The formal Phase 12 completion review passed on
2026-08-13 with no unresolved or deferred finding; there is no authorized
Slice 3 or Phase 13. Enumeration, webhooks,
polling, background work, remote writes, other providers/evidence families,
and inferred rollback/hotfix/rework remain outside Phase 12.

Slice 2 verification passed on 2026-08-07: three focused UI tests, the combined
Phase 12 run 8/8, TypeScript, production build, context smoke 3/3, diff checks,
the full 273/273 Windows regression with zero failures/skips, and local mocked
browser interaction at desktop and 390 px with a clean console and preserved
immutable receipt.

Completion verification on 2026-08-13 passed the focused Phase 12 run 8/8,
TypeScript, production build, context smoke 3/3, diff checks, and the full
Windows regression 313/313 with zero failures/skips in 571.18 seconds. Fresh
in-app Chromium checks at 1280 px and 390 px confirmed meaningful Russian
content, working navigation, a clean console, and no page-level overflow. The
durable decision is recorded in
`docs/architecture/change-control-plane/github-deployment-connector-completion-review-v1.md`.

## Phase 13 Candidate: Work Inventory and Roadmap

Placement record:
`docs/architecture/change-control-plane/work-inventory-roadmap-phase-placement-v1.md`.

Roadmap placement is accepted and implementation is deferred. This candidate
would connect known ideas, bugs, unfinished work, incidents, goals, accepted
plans, changes, waves, tasks, runs, and outcomes into a bounded evidence-backed
view of uncovered work and project direction. It belongs after Phase 12 in the
main product roadmap, not in Agentic Patterns Stage 2.

No Phase 13 contract, queue, schema, API, UI, event, persistence, import, or
connector is authorized. Before a contract may be drafted, a separate owner
review must fix gap identity and lifecycle ownership, source authority,
cross-source joins, duplicate/supersession and migration semantics, exact
roadmap numerator/denominator definitions, partial/unknown behavior, privacy
limits, and every mutation authority. The preferred first admitted slice is a
stateless read-only reconciliation projection; persistent intake and the
`GAPS`/`ROADMAP` widgets remain later, separately reviewed boundaries.
