# GoalBuddy Bridge V1

## Objective

Deliver a first, read-only-toward-GoalBuddy bridge slice that takes the one active card from an operator-selected GoalBuddy `state.yaml`, maps it into an Orchestrator `TaskInput` preview, carries the resulting run through the existing execution path, and writes a separate `GoalReceiptEnvelopeV1` JSON artifact without mutating or advancing the GoalBuddy board.

## Original Request

Prepare `goalbuddy-bridge-v1`. The first slice must open a selected GoalBuddy `state.yaml`, require exactly one active task, preview it as an Orchestrator `TaskInput`, persist goal/task/repo/run linkage, and emit `GoalReceiptEnvelopeV1` as a separate JSON file after execution. Map `objective` to `title`/`prompt`, `allowed_files` to `allowedPaths`, `verify` to task verification commands, `stop_if` to execution guards, and the GoalBuddy task id to the external task id. Do not modify `state.yaml`, choose the next GoalBuddy task, or create commits automatically. Reuse existing Git lock, status, diff, checkpoint, and `allowedPaths` behavior. Use TDD.

## Intake Summary

- Input shape: `existing_plan`
- Audience: an Orchestrator operator who manages work in GoalBuddy
- Authority: `requested`
- Proof type: `test`
- Completion proof: automated tests and a runnable walkthrough prove one card passes from selected `state.yaml` through preview and run to a separate receipt file, with no manual field copying and with the source GoalBuddy board unchanged
- Goal oracle: a card passes `state.yaml -> preview -> run -> receipt` without manual copying and without changing the GoalBuddy board
- Likely misfire: building a second GoalBuddy scheduler, proving only YAML parsing, bypassing Orchestrator safeguards, or writing a receipt while silently modifying/advancing the board
- Blind spots considered: invalid or ambiguous YAML; zero/multiple active tasks; stable linkage identity and receipt location; failure/cancelled runs; path normalization; source-file immutability proof; compatibility with existing task schemas and Git safety behavior
- Existing plan facts: the exact mapping, constraints, read-only board boundary, separate receipt artifact, reuse requirements, TDD requirement, and oracle supplied by the user

## Goal Oracle

The oracle for this goal is:

`A real fixture/card passes selected state.yaml -> generated preview -> existing Orchestrator run path -> separate GoalReceiptEnvelopeV1 JSON, with the linkage recoverable by goal/task/repo/run identifiers, no manual copying, and an unchanged source state.yaml.`

The PM must keep comparing task receipts to this oracle. Parser-only tests, hand-assembled preview input, a mocked run that bypasses the existing execution path, or a clean-looking board are not enough. The goal finishes only when a final Judge/PM audit maps test evidence and artifacts back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Validate the supplied plan against the repository, then implement the largest safe vertical slice using TDD: selection and validation of one active GoalBuddy task, deterministic mapping to preview `TaskInput`, persistence of GoalBuddy-to-Orchestrator linkage, execution through existing safeguards, and separate receipt emission. This tranche does not include GoalBuddy board mutation, next-task selection, bidirectional synchronization, or automatic commits.

## Non-Negotiable Constraints

- Treat the operator-selected GoalBuddy `state.yaml` as read-only; verify its bytes/content remain unchanged across preview, run, and receipt creation.
- Require exactly one active GoalBuddy task and fail safely for zero or multiple active tasks.
- Do not select, activate, queue, complete, or otherwise advance another GoalBuddy task.
- Do not create Git commits automatically.
- Reuse existing Orchestrator Git lock, status, diff, checkpoint, task verification, execution guard, and `allowedPaths` mechanisms rather than duplicating or bypassing them.
- Preserve the mapping: `objective -> title/prompt`; `allowed_files -> allowedPaths`; `verify -> task verification commands`; `stop_if -> execution guards`; GoalBuddy task id -> external task id.
- Persist a recoverable relationship among GoalBuddy goal, GoalBuddy task, repository, Orchestrator task/run, and receipt.
- Emit `GoalReceiptEnvelopeV1` to a separate JSON file after execution; do not write the receipt into GoalBuddy `state.yaml` in this slice.
- Use TDD: add focused failing tests first, record the expected red result, implement only enough to pass, then run focused and regression gates.
- Preserve unrelated user changes and do not stage, commit, move, or delete `queues/` contents.

## Verification Baseline

The package manifest exposes `npm test`, `npm run check`, and `npm run build`. These are candidate goal gates; the active Judge must establish and record their pre-change baseline before the Worker starts. Any pre-existing failures must be separated from regressions introduced by this goal.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection while a safe Worker slice can be activated. Stop and return a bounded receipt if exact allowed files cannot be established, existing task/run schemas cannot represent the required linkage without a scope decision, the selected board cannot be handled read-only, or verification fails twice for the same unexplained reason.

## Slice Sizing

The first implementation package is one coherent vertical slice, not separate parser, mapper, persistence, runner, and receipt microtasks. The Worker owns the complete red-green-refactor loop within the exact file list approved by Judge.

## Board Health

The PM owns board health. If the board looks stale or inconsistent, run:

```bash
node C:/Users/Alexander Lozovoy/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/goalbuddy-bridge-v1
```

## Canonical Board

Machine truth lives at:

`docs/goals/goalbuddy-bridge-v1/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/goalbuddy-bridge-v1/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and the GoalBuddy execution contract.
2. Read `state.yaml`; work only on its single active task.
3. Preserve the intake, mapping, hard constraints, TDD order, and oracle.
4. Let T001 establish evidence and exact Worker scope; the PM alone updates and activates T002 from that receipt.
5. Require the Worker to prove red before implementation and green afterward.
6. Record a compact receipt, update the board, and advance only within this Orchestrator goal board—not the selected external GoalBuddy board.
7. Finish only after T999 maps unchanged-source proof, preview mapping, real run linkage, receipt schema/file evidence, and regression results to the oracle with `full_outcome_complete: true`.
