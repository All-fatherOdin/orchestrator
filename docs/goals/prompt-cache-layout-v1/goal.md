# Prompt Cache Layout v1

## Objective

Implement a cache-aware prompt layout with a stable reusable prefix and a dynamic task suffix, plus usage telemetry and configuration-gated explicit breakpoints only where measurements justify them.

## Original Request

Prepare each recommended system-strengthening feature as a separate GoalBuddy goal for implementation in `D:\pet-projects\orchestrator`; include eight goals, with multi-agent last and optional behind a go/no-go decision.

## Intake Summary

- Input shape: `existing_plan`
- Audience: orchestrator owner and maintainers
- Authority: `approved`
- Proof type: `test`
- Completion proof: Tests prove stable-prefix identity across representative task changes, isolate dynamic values from the reusable prefix, report cache read/write token metrics, and show no prompt-behavior regression; explicit mode remains disabled unless benchmark evidence passes its gate.
- Goal oracle: Tests prove stable-prefix identity across representative task changes, isolate dynamic values from the reusable prefix, report cache read/write token metrics, and show no prompt-behavior regression; explicit mode remains disabled unless benchmark evidence passes its gate.
- Likely misfire: Adding explicit caching everywhere, placing volatile values in the stable prefix, or optimizing hit rate while increasing total cost or degrading answers.
- Blind spots considered: dirty-worktree overlap, cross-goal dependencies, provider volatility, rollout reversibility, and evidence quality
- Existing plan facts:
  - Depends on the compact prompt compiler contract and current GPT-5.6 routing behavior.
  - Keep timestamps, request IDs, user-specific values, changing tool lists, Working State, and current tool output outside the stable prefix.
  - Compare cached_tokens, cache_write_tokens, latency, cost, and task success.

## Goal Oracle

The oracle for this goal is:

`Tests prove stable-prefix identity across representative task changes, isolate dynamic values from the reusable prefix, report cache read/write token metrics, and show no prompt-behavior regression; explicit mode remains disabled unless benchmark evidence passes its gate.`

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
- Do not send GPT-5.6-only cache fields to incompatible routes.
- Keep explicit caching off unless the goal oracle demonstrates net value.
- Preserve deterministic prompt assembly for reproducible cache keys.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete. Do not stop after planning, discovery, or Judge selection while a safe Worker task can advance the oracle. Do not mark completion while required implementation or verification remains queued.

For the optional multi-agent pilot, an evidence-backed NO decision is a valid completed outcome only when production multi-agent behavior remains disabled and the final audit confirms the decision satisfies the oracle.

## Slice Sizing

Use the largest safe useful reversible slice. Prefer an integrated vertical path with tests over isolated helpers or documentation-only work. After two tiny tasks, reorient toward a demonstrable milestone.

## Board Health

Machine truth lives in `docs/goals/prompt-cache-layout-v1/state.yaml`.

```bash
node C:/Users/Alexander Lozovoy/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/prompt-cache-layout-v1
```

## Canonical Board

`docs/goals/prompt-cache-layout-v1/state.yaml`

## Run Command

```text
/goal Follow docs/goals/prompt-cache-layout-v1/goal.md.
```

## PM Loop

1. Read this charter and `state.yaml`.
2. Follow the GoalBuddy execution contract.
3. Work only on the active task.
4. Preserve the dirty worktree and validate write ownership before Worker activation.
5. Write a compact receipt after each task.
6. Continue until final audit maps verified behavior to the oracle.

