# Workspace and Merge v1

## Objective

Implement Phase 3 as a verified, event-backed workspace and serialized merge
lifecycle for Orchestrator, preserving Phase 1/2 replay and fail-closed
authority boundaries.

## Original Request

Приступай к Phase 3.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Orchestrator operator and repositories executed through it
- Authority: `approved`
- Proof type: `test`
- Completion proof: Windows-capable integration evidence proves isolated
  attempt workspaces, serialized merge, fresh-target revalidation, bounded
  cleanup/recovery, and compatibility with existing runs.
- Goal oracle: the Phase 3 integration suite plus the repository's full
  check/test/build gates pass and a final Judge maps receipts to every Phase 3
  lifecycle invariant.
- Likely misfire: stopping after a design document or adding worktrees without
  connecting them to canonical attempt identity, merge serialization, replay,
  and recovery.
- Blind spots considered: Windows path/junction behavior, Git locks, detached
  HEAD, dirty targets, concurrent merges, 100+ intermediate commits, crash
  cleanup, branch ownership, destructive Git authority, legacy runs.
- Existing plan facts: Phase 1 and Phase 2 are implemented; Phase 3 must define
  and accept its contract before implementation; worktree/branch policy was
  intentionally deferred pending Windows evidence.

## Goal Oracle

The oracle for this goal is:

`A deterministic Windows-capable integration suite demonstrates that every
managed attempt is bound to an isolated workspace and exact plan base, merge
requests are serialized and revalidated on the current target, drift triggers
replan instead of unsafe merge, cleanup/recovery is bounded and replayable,
and npm run check, npm test, npm run build, and git diff --check all pass.`

The PM must keep comparing task receipts to this oracle. Planning, discovery,
a passing tiny slice, or a clean-looking board is not enough. The goal finishes
only when a final Judge/PM audit maps receipts and verification back to this
oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Continuously complete Phase 3: validate local evidence, accept the v1 contract,
implement the largest safe workspace lifecycle slice, implement serialized
merge and recovery, verify compatibility, update operational truth, and finish
with a final audit.

## Non-Negotiable Constraints

- Keep canonical control state event-backed and replayable.
- Never infer authority for destructive Git operations or external publication.
- Preserve existing queue/run behavior unless a versioned compatibility rule
  explicitly changes it.
- Fail closed on unreadable, ambiguous, dirty, stale, or concurrently changing
  repository state.
- Treat the target repository and existing user worktrees/branches as
  user-owned; cleanup may remove only process-owned resources with receipts.
- Use Windows-capable tests for path, lock, cleanup, and recovery behavior.
- Do not treat planning or a contract-only artifact as Phase 3 completion.
- Keep local execution queues under `queues/` and out of Git.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, contract acceptance, or one workspace
slice while safe merge/recovery work remains.

## Canonical Board

Machine truth lives at:

`docs/goals/workspace-merge-v1/state.yaml`

## Run Command

```text
/goal Follow docs/goals/workspace-merge-v1/goal.md.
```

## PM Loop

Follow the GoalBuddy v2 execution contract. Work only on the active task,
record a receipt for every terminal task, activate at most one writing task,
and compare each completed package with the goal oracle.
