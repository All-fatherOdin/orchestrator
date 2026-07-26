# Persisted Reasoning and Working State v1

## Objective

Integrate optional persisted reasoning as ephemeral provider runtime state without replacing orchestrator Working State, source authority, task receipts, or durable project memory.

## Original Request

Prepare each recommended system-strengthening feature as a separate GoalBuddy goal for implementation in `D:\pet-projects\orchestrator`; include eight goals, with multi-agent last and optional behind a go/no-go decision.

## Intake Summary

- Input shape: `existing_plan`
- Audience: orchestrator owner and maintainers
- Authority: `approved`
- Proof type: `test`
- Completion proof: Tests show reasoning can be reused while goal, scope, branch, and authority remain stable; is invalidated when any of those change; replays required response items correctly; and never establishes project truth or authorization.
- Goal oracle: Tests show reasoning can be reused while goal, scope, branch, and authority remain stable; is invalidated when any of those change; replays required response items correctly; and never establishes project truth or authorization.
- Likely misfire: Treating opaque provider reasoning or a response ID as durable project memory, enabling all-turn reuse globally, or anchoring a changed task to stale reasoning.
- Blind spots considered: dirty-worktree overlap, cross-goal dependencies, provider volatility, rollout reversibility, and evidence quality
- Existing plan facts:
  - Working State remains the portable replay root and provider-neutral truth boundary.
  - Use all-turn context only for a stable task; switch to current-turn behavior on goal, scope, branch, priority, or source-authority change.
  - Provider response references are ephemeral operational metadata, not completion or approval evidence.

## Goal Oracle

The oracle for this goal is:

`Tests show reasoning can be reused while goal, scope, branch, and authority remain stable; is invalidated when any of those change; replays required response items correctly; and never establishes project truth or authorization.`

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
- Preserve relevant output item types and assistant phase values during manual replay.
- Support a safe off/current-turn fallback.
- Do not store hidden reasoning content as project memory.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete. Do not stop after planning, discovery, or Judge selection while a safe Worker task can advance the oracle. Do not mark completion while required implementation or verification remains queued.

For the optional multi-agent pilot, an evidence-backed NO decision is a valid completed outcome only when production multi-agent behavior remains disabled and the final audit confirms the decision satisfies the oracle.

## Slice Sizing

Use the largest safe useful reversible slice. Prefer an integrated vertical path with tests over isolated helpers or documentation-only work. After two tiny tasks, reorient toward a demonstrable milestone.

## Board Health

Machine truth lives in `docs/goals/persisted-reasoning-working-state-v1/state.yaml`.

```bash
node C:/Users/Alexander Lozovoy/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/persisted-reasoning-working-state-v1
```

## Canonical Board

`docs/goals/persisted-reasoning-working-state-v1/state.yaml`

## Run Command

```text
/goal Follow docs/goals/persisted-reasoning-working-state-v1/goal.md.
```

## PM Loop

1. Read this charter and `state.yaml`.
2. Follow the GoalBuddy execution contract.
3. Work only on the active task.
4. Preserve the dirty worktree and validate write ownership before Worker activation.
5. Write a compact receipt after each task.
6. Continue until final audit maps verified behavior to the oracle.

