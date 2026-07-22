# Context Router v1

## Objective

Implement the first end-to-end Context Contract v1 slice in Orchestrator: select a compact, policy-safe context bundle through a typed provider boundary, preview the selected sources during preflight, and persist the corresponding `ContextReceiptV1` in the run record.

## Original Request

Реализовать поддержку Context Contract v1 внутри Orchestrator. Первый вертикальный slice: `ContextProvider`; `RepositoryContextHelperProvider` для запуска существующего helper project; безопасный `FallbackContextProvider`; context profile и `maxSources` в `TaskInput`; preview выбранных источников во время preflight; сохранение `ContextReceiptV1` в run record. Не читать high-risk и secret-bearing paths; не переносить Python-логику выбора контекста в TypeScript; helper должен запускаться отдельным процессом и возвращать JSON; timeout, invalid JSON и contract mismatch должны приводить к явной ошибке или контролируемому fallback. Использовать TDD.

## Intake Summary

- Input shape: `existing_plan`
- Audience: Orchestrator maintainers and users running `ai-stock-analyst` tasks
- Authority: `requested`
- Proof type: `test`
- Completion proof: A fixture-backed end-to-end run demonstrates the compact bundle, preflight preview, persisted `ContextReceiptV1`, safety exclusions, and explicit error or controlled fallback behavior; Kit smoke fixtures pass.
- Goal oracle: Orchestrator obtains a compact context bundle for `ai-stock-analyst`, shows the selected-source preview during preflight, saves the matching receipt in the run record, and passes Kit smoke fixtures.
- Likely misfire: Implementing only interfaces/types or a helper wrapper without proving the real preflight-to-run-record flow, path safety, and failure semantics.
- Blind spots considered: Existing helper contract and executable discovery; whether each failure mode is fail-closed or fallback-eligible; exact high-risk/secret-bearing path policy; ensuring preview, prompt bundle, and receipt derive from the same provider result; backwards compatibility for stored tasks and run records.
- Existing plan facts: Preserve all six requested capabilities as one vertical outcome; keep selection logic in the external Python helper; communicate through subprocess JSON; cover timeout, invalid JSON, and contract mismatch; use TDD.

## Goal Oracle

The oracle for this goal is:

`Using repository fixtures, Orchestrator receives a compact, policy-safe context bundle for ai-stock-analyst, renders a preflight preview of the exact selected sources, persists the matching ContextReceiptV1 in the run record, demonstrates explicit error or controlled fallback for helper timeout/invalid JSON/contract mismatch, and passes the Kit smoke fixtures.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, passing unit tests for isolated types, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to every clause of this oracle and records `full_outcome_complete: true`.

## Goal Kind

`existing_plan`

## Current Tranche

Validate the provided plan against the repository, then complete the largest safe TDD Worker package that delivers the full first vertical slice. Continue through any locally fixable gaps until the oracle is proven. The first active task is a read-only Judge validation because exact helper contracts, file ownership, Kit smoke commands, and existing failure-policy conventions must be evidenced before a bounded Worker write scope can be truthful.

## Non-Negotiable Constraints

- Never read high-risk or secret-bearing paths; this policy applies to both the helper provider and fallback path.
- Do not port, duplicate, or approximate the Python context-selection logic in TypeScript.
- Launch the existing helper as a separate process and consume JSON across the process boundary.
- Treat timeout, invalid JSON, and contract mismatch as explicit failures or a deliberately controlled, observable fallback according to an evidenced policy; never silently continue.
- Use TDD: add failing behavior-focused tests before production changes, then make them pass and preserve regression coverage.
- `contextProfile` and `maxSources` in `TaskInput` must have explicit validation/default/backward-compatibility semantics.
- The preflight preview, bundle used for execution, and persisted `ContextReceiptV1` must describe the same selected sources rather than recomputing independently.
- Keep all user-created queue files and sequential queue plans under `queues/`; do not stage, move, or delete `queues/` contents.
- Do not weaken unrelated repo-health gates or change existing helper behavior merely to make tests pass.

## Verification Gates

- Goal-owned gates: targeted red/green tests selected by Judge, exact Kit smoke fixture command discovered from repository evidence, and an end-to-end fixture assertion covering bundle, preview, and persisted receipt.
- Repository gates currently advertised by `package.json`: `npm test`, `npm run check`, and `npm run build`.
- The active Judge must record which commands are goal-owned acceptance gates and which, if any, are pre-existing red repo-health signals before activating Worker work.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, interface creation, isolated provider tests, or Judge selection while a safe Worker task can advance the vertical slice.

Do not declare completion without evidence for path safety, all named helper failure modes, the `ai-stock-analyst` bundle, preflight preview, persisted `ContextReceiptV1`, and Kit smoke fixtures.

If a decision about fallback eligibility cannot be derived from existing repository conventions or contracts, record the exact ambiguity and stop that write package rather than inventing silent behavior.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

The preferred Worker package is the complete provider-to-preflight-to-run-record vertical slice, including its tests and fixtures, once Judge has established truthful `allowed_files`, verification commands, and stop conditions. Split only at a genuine contract, safety, or ownership boundary.

## Board Health

The PM owns board health. If the board looks stale, misleading, offline, or inconsistent, run:

```bash
node C:/Users/Alexander Lozovoy/.codex/plugins/cache/goalbuddy/goalbuddy/0.4.1/skills/goal-prep/scripts/check-goal-state.mjs docs/goals/context-router-v1
```

If the local board is running, compare `state.yaml` to the live board API. Repair only GoalBuddy control files unless an active Worker or PM task explicitly allows product-file edits.

## Canonical Board

Machine truth lives at:

`docs/goals/context-router-v1/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/context-router-v1/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and the GoalBuddy execution contract in `references/goal-execution.md` from the installed goal-prep skill.
2. Read `state.yaml`; work only on its active task.
3. Re-check the original request, existing plan facts, constraints, likely misfire, and oracle.
4. Assign the role on the active card and collect a compact receipt.
5. For Worker work, enforce `allowed_files`, TDD ordering, `verify`, and `stop_if`.
6. Update the board, then immediately activate the next largest safe useful task while the oracle remains unmet.
7. Review at contract/safety boundaries, rejected verification, ambiguity, and final completion—not after every trivial edit.
8. Finish only with a Judge/PM audit receipt that maps fresh evidence to every oracle clause and records `full_outcome_complete: true`.
