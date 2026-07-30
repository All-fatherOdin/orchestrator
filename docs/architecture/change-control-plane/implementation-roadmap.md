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

Evaluate worktree/branch isolation on Windows, implement workspace lifecycle,
and serialize merge with fresh-base revalidation. Depends on Phase 2 plan/base
identity.

## Phase 4: Halts and Incidents

Add stable incident IDs, halt taxonomy, attribution evidence, Warden checks,
and a narrow deterministic Doctor allowlist. Depends on event and attempt
receipts; it may proceed independently of UI.

## Phase 5: Prompt/Model/Eval Lineage

Persist prompt artifacts and model routing identities, join attempts,
incidents, commits, and versioned eval runs, then establish baseline cohorts.

## Phase 6: Operator Projections

Build cross-project wave, bucket, incident, Warden, Doctor, and prompt-registry
views from canonical APIs. UI never writes projection state directly.

No sequential queue plan exists for the remaining phases. Phase 3 begins with
contract and Windows lifecycle evidence; later queue boundaries will be fixed
from prior phase evidence.
