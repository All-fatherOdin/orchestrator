# Process Telemetry v1

## Objective

Extend the existing Orchestrator `Run`, `Task`, and `UsageRecord` flow with a first end-to-end process-telemetry slice: classify outcomes, derive duration/attempt/review-cycle/token metrics, expose them through a read-only API, and render them on the existing Usage page while preserving old `run.json` compatibility.

## Original Request

Prepare `process-telemetry-v1` for the existing Orchestrator. Extend existing `Run`, `Task`, and `UsageRecord` rather than creating a new telemetry system. Introduce `OutcomeClass`; compute duration, execution attempts, review/correction cycles, and token totals; preserve compatibility with old `run.json`; add a read-only metrics API; show the metrics on the existing Usage page. Do not store raw prompts, secrets, or file contents; do not break existing run records; avoid a large `server/index.ts` refactor; make new calculations pure functions first; use TDD.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Orchestrator operators and maintainers
- Authority: `requested`
- Proof type: `test`
- Completion proof: old and new runs open; new tasks show duration, attempts, review cycles, token totals, and outcome; `npm test`, `npm run check`, and `npm run build` pass; a focused API/UI walkthrough confirms the existing Usage page consumes the read-only metrics surface.
- Goal oracle: legacy and current records remain readable while the complete metric set is visible for new tasks and all owned verification gates are green.
- Likely misfire: produce detached telemetry types, a second persistence path, or cosmetic UI fields without deriving metrics from the existing records and proving legacy compatibility.
- Blind spots considered: missing/partial legacy fields; precise definitions for attempts and review/correction cycles; timestamp edge cases; token aggregation and double-counting; outcome classification precedence; API response compatibility; absence of sensitive payloads; scope creep in `server/index.ts`.
- Existing plan facts: extend existing models and surfaces; pure calculations precede integration; tests drive implementation; compatibility and privacy are hard constraints; the Oracle supplied by the user is authoritative.

## Goal Oracle

The oracle for this goal is:

`Old and new runs open, and for new tasks duration, execution attempts, review/correction cycles, token totals, and outcome are visible; npm test, npm run check, and npm run build all pass.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, passing helper-unit tests alone, or a clean-looking board is not enough. Completion requires a final Judge/PM audit with `full_outcome_complete: true` and evidence covering compatibility, privacy, API, UI, tests, and build.

## Goal Kind

`existing_plan`

## Current Tranche

Deliver the complete first vertical slice in the existing architecture. Discover only enough implementation evidence to lock metric semantics and safe write boundaries; then implement the largest coherent reversible package using red-green-refactor. The package must include pure metric derivation, compatible model/persistence behavior, a read-only API projection, and the existing Usage page presentation. If repo topology makes a single Worker package unsafe, Judge may split it only at an independently testable vertical boundary, and the PM must continue until the full Oracle is satisfied.

## Non-Negotiable Constraints

- Extend existing `Run`, `Task`, and `UsageRecord`; do not create a parallel telemetry subsystem or a new run-record family.
- Old `run.json` records and new records must both open without migration being required for reads.
- Never persist or expose raw prompts, secrets, environment values, or file contents as telemetry.
- Do not perform a large refactor of `server/index.ts`; keep changes local and reviewable.
- Implement derivations as pure functions before wiring them into persistence, API, or UI.
- Use TDD: record the failing test(s), minimal passing implementation, and refactor/verification evidence in the Worker receipt.
- Define missing/invalid legacy-data behavior explicitly; do not fabricate precise metrics when evidence is absent.
- The API is read-only and must not mutate run records merely by reading metrics.
- Preserve unrelated user changes and avoid editing `queues/`.

## Stop Rule

Stop only when a final audit proves the full Oracle and all non-negotiable constraints are satisfied.

Do not stop after discovery, semantic design, pure helper tests, backend integration, or UI rendering alone. Continue through compatibility tests, read-only API proof, Usage-page proof, privacy inspection, and the full verification gates.

If a metric definition is ambiguous, Judge must resolve it from existing lifecycle evidence and record the decision before Worker changes persisted contracts. If safe compatibility cannot be preserved within the current architecture, block that exact slice with evidence and continue any remaining non-destructive work.

## Slice Sizing

The preferred Worker package is one coherent end-to-end slice, not one task per metric or file. Split only when concrete repository evidence shows independently verifiable write scopes or materially different risks.

Worker must own the entire approved package, work only in `allowed_files`, and run every `verify` command. Judge reviews phase boundaries, ambiguity, regression risk, or final completion—not each helper.

## Board Health

Machine truth lives in `docs/goals/process-telemetry-v1/state.yaml`. If board state is suspect, run:

```bash
node C:/Users/Alexander Lozovoy/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/process-telemetry-v1
```

## Canonical Board

`docs/goals/process-telemetry-v1/state.yaml`

## Run Command

```text
/goal Follow docs/goals/process-telemetry-v1/goal.md.
```

## PM Loop

1. Read this charter, the GoalBuddy execution contract, and `state.yaml`.
2. Work only on the active task and keep exactly one active task.
3. Require Scout to map evidence without writes, Judge to resolve semantics/scope, and Worker to implement only the approved bounded package.
4. For Worker work, enforce red-green-refactor evidence and the task's full verification list.
5. Write a compact receipt and update board truth after each task.
6. Compare each package to the Oracle; immediately activate the next safe useful task while any Oracle dimension is missing.
7. Finish only after final Judge/PM audit records `full_outcome_complete: true` with compatibility, privacy, API, UI, test, typecheck, and build evidence.
