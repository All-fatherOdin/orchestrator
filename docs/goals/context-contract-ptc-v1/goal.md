# Context Contract Programmatic Tool Calling v1

## Objective

Implement an optional Programmatic Tool Calling adapter for the bounded read-only Context Contract V1 reduction stage, while keeping semantic judgment, citations, approvals, and mutations on direct paths.

## Original Request

Prepare each recommended system-strengthening feature as a separate GoalBuddy goal for implementation in `D:\pet-projects\orchestrator`; include eight goals, with multi-agent last and optional behind a go/no-go decision.

## Intake Summary

- Input shape: `existing_plan`
- Audience: orchestrator owner and maintainers
- Authority: `approved`
- Proof type: `test`
- Completion proof: Representative tests produce schema-valid ContextBundleV1 and ContextReceiptV1 outputs with deterministic filtering, deduplication, limits, reason codes, retry/stop behavior, preserved evidence, and zero mutation or scope expansion.
- Goal oracle: Representative tests produce schema-valid ContextBundleV1 and ContextReceiptV1 outputs with deterministic filtering, deduplication, limits, reason codes, retry/stop behavior, preserved evidence, and zero mutation or scope expansion.
- Likely misfire: Using programmatic calling for adaptive judgment or writes, returning a compact program result while the final answer loses evidence, or duplicating the existing context router.
- Blind spots considered: dirty-worktree overlap, cross-goal dependencies, provider volatility, rollout reversibility, and evidence quality
- Existing plan facts:
  - Treat the source kit Context Contract V1 as a read-only specification source.
  - PTC is only for predictable filtering, joining, ranking, deduplication, aggregation, and validation.
  - Direct model/tool calls remain responsible for semantic conflicts, approval, citations, and final validation.

## Goal Oracle

The oracle for this goal is:

`Representative tests produce schema-valid ContextBundleV1 and ContextReceiptV1 outputs with deterministic filtering, deduplication, limits, reason codes, retry/stop behavior, preserved evidence, and zero mutation or scope expansion.`

The PM must compare every implementation receipt and verification result to this oracle. Discovery, a design note, a passing helper test, or an unintegrated adapter is not completion. Final completion requires a Judge or PM audit with `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Discover the exact orchestrator integration surface, validate this existing plan against repository reality, implement the largest safe end-to-end slice, verify representative behavior and regressions, and continue with additional safe slices until the complete oracle is true.

## Non-Negotiable Constraints

- Product implementation is confined to `D:\pet-projects\orchestrator`.
- The source kit at `D:\pet-projects\AI-assisted_System_Design_and_Agent_Memory_Kit` is read-only reference material unless the owner creates a separate write-authorized task there.
- Preserve all pre-existing dirty worktree changes. Do not revert or overwrite them.
- Prep-time dirty paths: `server/index.test.ts`, `src/App.tsx`, `src/styles.css`, `src/GoalBuddyPage.tsx`.
- Before activating a Worker, Judge or PM must populate exact `allowed_files`, verification commands, and stop conditions from Scout evidence.
- Stop on any overlap with an unexplained pre-existing change until ownership and merge strategy are established.
- Keep the feature reversible and configuration-gated where rollout risk exists.
- Preserve call_id and caller linkage wherever the API contract requires it.
- Reject writes and approval-sensitive tools from the programmatic stage.
- Validate both program output and final user-visible response completeness.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete. Do not stop after planning, discovery, or Judge selection while a safe Worker task can advance the oracle. Do not mark completion while required implementation or verification remains queued.

For the optional multi-agent pilot, an evidence-backed NO decision is a valid completed outcome only when production multi-agent behavior remains disabled and the final audit confirms the decision satisfies the oracle.

## Slice Sizing

Use the largest safe useful reversible slice. Prefer an integrated vertical path with tests over isolated helpers or documentation-only work. After two tiny tasks, reorient toward a demonstrable milestone.

## Board Health

Machine truth lives in `docs/goals/context-contract-ptc-v1/state.yaml`.

```bash
node C:/Users/Alexander Lozovoy/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/context-contract-ptc-v1
```

## Canonical Board

`docs/goals/context-contract-ptc-v1/state.yaml`

## Run Command

```text
/goal Follow docs/goals/context-contract-ptc-v1/goal.md.
```

## PM Loop

1. Read this charter and `state.yaml`.
2. Follow the GoalBuddy execution contract.
3. Work only on the active task.
4. Preserve the dirty worktree and validate write ownership before Worker activation.
5. Write a compact receipt after each task.
6. Continue until final audit maps verified behavior to the oracle.

