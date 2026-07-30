# Planning and Drift Contract v1

Status: proposed contract, implementation not yet authorized

This contract defines the Phase 2 boundary that must exist before an
implementation queue is created. Its machine-readable form is
[`schemas/planning-drift-v1.schema.json`](schemas/planning-drift-v1.schema.json);
the companion examples are illustrative fixtures, not canonical runtime state.

## Authority and storage

- The planner owns immutable `PlanningContractV1` proposals.
- The drift guard owns immutable `DriftAssessmentV1` observations.
- The architect owns immutable `ArchitectReplanReceiptV1` proposals.
- Policy gates and humans own authorization.
- The dispatcher may read these records and reject dispatch; it may not edit,
  infer, or authorize them.
- The Phase 1 per-project event ledger remains the canonical publication spine.
  Phase 2 implementation must add typed events rather than place opaque
  contract objects in an unvalidated `payload`.
- `.orchestrator/runs/*/run.json` remains canonical for concrete executions.
  A run references the authorized plan revision; it does not become plan truth.

## Planning contract

A planning contract is scoped to exactly one project, change, and wave. It
contains:

- an immutable plan ID and monotonically increasing revision;
- the exact clean Git base (`planBase.sha`) and repository identity;
- one or more observable acceptance claims;
- an evidence-backed blast radius;
- explicit replan triggers;
- creator identity and timestamp;
- an explicit statement that authorization is required.

Every acceptance claim declares an observable outcome, a concrete oracle
instruction, expected evidence, and failure severity. Human observation is a
valid oracle kind, but the planner cannot mark that claim accepted.

Blast radius is not a scalar risk score. Every declared write path and every
non-empty impact entry has evidence references. Empty impact arrays mean “none
found from the cited assessment”, not “not evaluated”; therefore
`assessmentEvidenceRefs` is always required.

## Plan lifecycle

The canonical lifecycle is event-backed:

```text
proposed -> authorized -> dispatched
    |            |
    |            +-> stale -> superseded
    +-> rejected
```

- `proposed`: schema-valid planner output, not dispatchable.
- `authorized`: a policy gate or human accepted this exact plan ID, revision,
  and base SHA.
- `dispatched`: dispatch revalidated the authorized revision against the
  current base and emitted a successful gate receipt.
- `stale`: the current base differs, required evidence is unavailable, or a
  declared replan trigger fired.
- `superseded`: a replacement revision was authorized.
- `rejected`: authorization was denied; the artifact remains immutable.

Authorization and dispatch are separate events. A later revision never inherits
authorization from an earlier revision.

## Drift assessment and dispatch gate

The drift guard compares the authorized plan with the dispatch-time repository
state. Equality is exact: repository identity and full base SHA must match.

If the base SHA differs, the old plan is stale even when changed paths appear
unrelated. Path, dependency, oracle, and policy analysis supplies reasons and
replan evidence; it does not revive the old revision. A deterministic refresh
therefore creates a new plan revision and follows the normal authorization
path.

Dispatch requires all of the following:

1. a schema-valid planning contract;
2. authorization for the exact plan ID, revision, and base SHA;
3. a clean current worktree and readable full current SHA;
4. a fresh drift assessment for that same revision and current SHA;
5. executable blocking acceptance oracles;
6. wave/task dependency readiness from the Phase 1 projection.

`sendAnyway` cannot bypass a stale, missing, invalid, or unauthorized plan.
Phase 1 dependency overrides remain distinct and cannot authorize Phase 2
planning risk.

## Architect replan receipt

An architect replan receipt links one stale plan and drift assessment to one
replacement revision. It records each change to base, scope, dependencies,
acceptance, or policy with rationale and evidence.

The architect may:

- refine decomposition and dependencies;
- adjust the declared write set and impacted tests;
- replace or strengthen acceptance claims;
- propose a new base and explain material drift.

The architect may not:

- authorize its own proposal;
- execute destructive Git operations;
- waive missing evidence or a blocking acceptance oracle;
- reuse authorization from the prior revision;
- mutate or delete the old plan, assessment, or receipt.

## Event requirements for implementation

Phase 2 implementation must extend the closed event type set with typed events
equivalent to:

- `plan.proposed`;
- `plan.authorized`;
- `plan.rejected`;
- `plan.marked-stale`;
- `plan.superseded`;
- `plan.dispatch-validated`;
- `architect.replan-recorded`.

Each event keeps the existing project sequence, hash chain, actor, causation,
and correlation rules. The event payload contains a validated contract or an
immutable reference to one. Projection rebuild must reject missing references,
revision regressions, authorization/base mismatches, and duplicate terminal
transitions.

## Failure semantics

Phase 2 must fail closed with stable machine-readable reasons:

| Reason | Meaning | Dispatch |
| --- | --- | --- |
| `PLAN_REQUIRED` | No planning contract is linked to the wave. | Reject |
| `PLAN_CONTRACT_INVALID` | The artifact fails the versioned schema or semantic checks. | Reject |
| `PLAN_NOT_AUTHORIZED` | This exact revision/base has no authorization event. | Reject |
| `CURRENT_BASE_UNREADABLE` | Repository identity, clean state, or full SHA cannot be established. | Reject |
| `PLAN_BASE_MISMATCH` | Current SHA differs from the authorized plan base. | Mark stale and reject |
| `PLAN_STALE` | A declared drift trigger fired or a stale event already exists. | Reject |
| `ACCEPTANCE_ORACLE_UNEXECUTABLE` | A blocking oracle cannot be executed as declared. | Reject |
| `BLAST_RADIUS_UNEVIDENCED` | Required scope or impact evidence is missing. | Reject |
| `REPLAN_RECEIPT_REQUIRED` | A replacement revision lacks a receipt linked to its stale predecessor. | Reject |

Unknown schema versions, reason codes, or transitions are contract violations.
No automatic fallback may convert them to warnings.

## Semantic checks beyond JSON Schema

The implementation validator must also enforce comparisons JSON Schema cannot:

- `planBase.sha` length matches `hashAlgorithm`;
- revision 1 has no predecessor, while later revisions have exactly one;
- replacement revision is greater than the prior revision;
- all plan, assessment, receipt, project, change, and wave references agree;
- `fresh` means `currentBaseSha === plan.planBaseSha`;
- `stale` means the SHAs differ or at least one declared trigger fired;
- acceptance claim IDs and declared write paths are unique within a plan;
- authorization targets the complete `(planId, revision, planBaseSha)` tuple.

## Exit criteria before creating the implementation queue

- The schema and examples validate with JSON Schema Draft 2020-12.
- Negative fixtures reject a stale assessment without reasons, an
  authorization-free plan, and a replan receipt with inconsistent lineage.
- Phase 1 projection and dispatch behavior remain unchanged.
- The implementation queue has at least two independently useful tasks:
  contract publication/projection first, dispatch drift gate second.
- Each task has concrete paths, verification commands, and fail-closed guards.
