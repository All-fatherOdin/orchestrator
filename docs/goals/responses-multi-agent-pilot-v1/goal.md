# Responses Multi-Agent Pilot v1

## Objective

Run a final optional go/no-go pilot for Responses API multi-agent execution, enabling it only for cleanly parallelizable bounded work when measured gains justify its complexity and compatibility costs.

## Original Request

Prepare each recommended system-strengthening feature as a separate GoalBuddy goal for implementation in `D:\pet-projects\orchestrator`; include eight goals, with multi-agent last and optional behind a go/no-go decision.

## Intake Summary

- Input shape: `existing_plan`
- Audience: orchestrator owner and maintainers
- Authority: `approved`
- Proof type: `test`
- Completion proof: A Judge-approved benchmark either proves a capped pilot improves wall-clock time or task quality without safety, evidence, replay, or cost regression and remains feature-gated, or records a defensible NO decision and leaves multi-agent disabled.
- Goal oracle: A Judge-approved benchmark either proves a capped pilot improves wall-clock time or task quality without safety, evidence, replay, or cost regression and remains feature-gated, or records a defensible NO decision and leaves multi-agent disabled.
- Likely misfire: Treating Codex multi_agent configuration as the Responses API beta, enabling delegation globally, spawning duplicate work, or declaring success without final synthesis.
- Blind spots considered: dirty-worktree overlap, cross-goal dependencies, provider volatility, rollout reversibility, and evidence quality
- Existing plan facts:
  - This goal is last and optional; begin with a go/no-go compatibility and value decision.
  - Do not equate the existing Codex feature flag with Responses API multi-agent beta.
  - Cap concurrent subagents at three, require disjoint workstreams, preserve tracing/replay items, and require one root synthesis.

## Goal Oracle

The oracle for this goal is:

`A Judge-approved benchmark either proves a capped pilot improves wall-clock time or task quality without safety, evidence, replay, or cost regression and remains feature-gated, or records a defensible NO decision and leaves multi-agent disabled.`

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
- Treat incompatibilities with compaction, reasoning summaries, and tool-call limits as go/no-go inputs.
- No shared write scope across concurrent agents.
- A NO decision with complete evidence satisfies this optional pilot goal and must leave production behavior unchanged.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete. Do not stop after planning, discovery, or Judge selection while a safe Worker task can advance the oracle. Do not mark completion while required implementation or verification remains queued.

For the optional multi-agent pilot, an evidence-backed NO decision is a valid completed outcome only when production multi-agent behavior remains disabled and the final audit confirms the decision satisfies the oracle.

## Slice Sizing

Use the largest safe useful reversible slice. Prefer an integrated vertical path with tests over isolated helpers or documentation-only work. After two tiny tasks, reorient toward a demonstrable milestone.

## Board Health

Machine truth lives in `docs/goals/responses-multi-agent-pilot-v1/state.yaml`.

```bash
node C:/Users/Alexander Lozovoy/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/responses-multi-agent-pilot-v1
```

## Canonical Board

`docs/goals/responses-multi-agent-pilot-v1/state.yaml`

## Run Command

```text
/goal Follow docs/goals/responses-multi-agent-pilot-v1/goal.md.
```

## PM Loop

1. Read this charter and `state.yaml`.
2. Follow the GoalBuddy execution contract.
3. Work only on the active task.
4. Preserve the dirty worktree and validate write ownership before Worker activation.
5. Write a compact receipt after each task.
6. Continue until final audit maps verified behavior to the oracle.

