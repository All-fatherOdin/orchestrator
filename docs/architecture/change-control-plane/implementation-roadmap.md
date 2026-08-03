# Implementation Roadmap

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

No sequential queue plan exists for Phase 7. Create an ordinary queue only
after Slice 1 task boundaries, allowed paths, verification, and stop guards are
fully specified from the accepted contract.
