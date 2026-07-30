# Change Control Foundation Execution v1

## Objective

Archive stale local runtime artifacts safely, publish the current foundation
branch, execute `queues/change-control-foundation-v1.yaml`, and audit the
result against the queue contracts and repository oracle.

## Original Request

`сделай 1-3 потом аудит`

## Intake Summary

- Input shape: `existing_plan`
- Audience: Orchestrator owner and maintainers
- Authority: `approved`
- Proof type: `test`
- Completion proof: recoverable artifact archive, remote branch ref, completed
  two-task Orchestrator run, and final audit with full repository verification
- Goal oracle: both queue tasks are accepted without scope violations; the
  resulting event ledger and wave dispatch behavior pass focused and full tests
- Likely misfire: treating a started queue, agent prose, or partial task as
  completion
- Blind spots considered: old Desktop binary, existing run records, clean-tree
  constraints, ignored local queue, external push, and source-server isolation
- Existing plan facts: perform prior recommendations 1–3, then audit

## Goal Oracle

The oracle for this goal is:

`A completed source-server run for the exact local queue, with both tasks accepted, exact allowed-path compliance, npm run check and npm test green, deterministic ledger/wave behavior demonstrated, and a final audit recording full_outcome_complete: true.`

## Goal Kind

`existing_plan`

## Current Tranche

Complete the two-task change-control foundation queue and audit it. Later
planner, worktree, merge, incident, healing, lineage, and UI phases are out of
scope.

## Non-Negotiable Constraints

- Preserve old runtime records in a recoverable archive; do not delete them.
- Push only `cdx/agent-memory-foundation-v1`.
- Run the exact ignored local queue through a fresh source server and isolated
  Orchestrator data directory.
- Do not expand queue allowed paths.
- Do not report completion from agent output alone.

## Stop Rule

Stop only when final audit proves the full tranche outcome, or when the exact
queue reaches a truthful terminal failure that cannot be repaired within its
declared scopes.

## Canonical Board

Machine truth lives at:

`docs/goals/change-control-foundation-execution-v1/state.yaml`

## Run Command

```text
/goal Follow docs/goals/change-control-foundation-execution-v1/goal.md.
```
