# Agent Memory Foundation and Control-Plane Blueprint v1

## Objective

Integrate the useful, non-duplicative capabilities of `D:\pet-projects\AI-assisted_System_Design_and_Agent_Memory_Kit` into Orchestrator, verify the integration as a coherent vertical slice, and then capture a source-backed project-owned blueprint and executable follow-up queue for evolving Orchestrator toward the cross-project change-management system described by Nikolay.

This goal is deliberately bounded to the foundation and the implementation blueprint. It does not claim to implement Nikolay's entire system in one tranche.

## Original Request

The user asked to first integrate `D:\pet-projects\AI-assisted_System_Design_and_Agent_Memory_Kit`, then fix the larger system concept in the Orchestrator project, and prepare an implementation plan and a queue ready to launch.

## Intake Summary

- Input shape: `vague`
- Audience: Orchestrator owner and future implementation agents
- Authority: `requested`
- Proof type: `test`, `artifact`, `source_backed_answer`, and `decision`
- Completion proof: a verified Kit integration exists in Orchestrator; project documentation separates observed evidence, design decisions, assumptions, and open questions; and the next implementation work is represented by schema-valid launch queues with explicit scopes and verification.
- Goal oracle: a fresh checkout can run the documented checks, demonstrate the integrated memory/design capability, and validate the generated implementation queues without relying on unstated chat context.
- Likely misfire: copying the Kit wholesale, duplicating capabilities already present in Orchestrator, or producing an attractive architecture document and speculative backlog without a working integration and evidence-backed task boundaries.
- Blind spots considered: unclear overlap with existing context-contract, prompt, runtime-state, and GoalBuddy work; unknown Kit runtime and licensing constraints; canonical-state ownership; migration and rollback; dirty-worktree preservation; the difference between screenshots, Nikolay's written claims, public evidence, and our inferences; and whether later tasks are independent enough for an ordinary Orchestrator queue.
- Existing plan facts: integrate the Kit before finalizing the larger design; preserve all user-created launch queues under `queues/`; do not create an ordinary queue until task boundaries, dependencies, allowed paths, verification commands, and stop guards are known; existing Orchestrator goal artifacts indicate prior work on context contracts, routing, prompt compilation, persisted reasoning state, telemetry, approvals, and evals that must not be duplicated.

## Goal Oracle

The oracle for this goal is:

`A clean-environment walkthrough proves the selected Kit capability works inside Orchestrator, project-owned documentation traces the Nikolay-like target system from evidence to decisions and open questions, and every generated launch queue passes Orchestrator validation with concrete allowedPaths, verificationCommands, dependencies, and stop guards.`

The PM must keep comparing task receipts to this oracle. Planning, discovery, a passing tiny slice, or a clean-looking board is not enough. The goal finishes only when a final Judge/PM audit maps receipts and verification back to this oracle and records `full_outcome_complete: true`.

## Goal Kind

`open_ended`

## Current Tranche

The tranche has two gated phases:

1. Establish the memory/design foundation by comparing both repositories, selecting the largest safe non-duplicative integration slice, implementing it, and proving it through repository-native checks plus a behavior-level demonstration.
2. Only after that gate passes, turn the Telegram messages and screenshots, the public-source research, the implemented foundation, and the current Orchestrator architecture into durable project documentation and schema-valid launch queues for subsequent control-plane implementation.

The first active package is read-only discovery because implementation scope is not yet safe to freeze. The first Judge must convert its evidence into one coherent Worker package with exact file ownership, verification, rollback, and stop conditions.

## Non-Negotiable Constraints

- Preserve existing user changes and unrelated untracked runtime artifacts.
- Treat `D:\pet-projects\orchestrator` as the product repository and `D:\pet-projects\AI-assisted_System_Design_and_Agent_Memory_Kit` as an input until the Judge explicitly proves another boundary is necessary.
- Do not copy the Kit wholesale. Identify licenses, contracts, dependencies, data formats, and overlap before selecting code or concepts.
- Prefer integration through a stable contract and one end-to-end behavior over disconnected utility copies.
- Keep canonical state ownership explicit; do not introduce a second silent source of truth.
- Keep observed screenshot/message evidence, public-source evidence, design decisions, assumptions, and unresolved questions visibly separate in durable documentation.
- Every writing task must have exact `allowed_files`, verification commands, and `stop_if` guards before activation.
- Put actual Orchestrator execution queues in `queues/`. They are local operational artifacts and must not be staged, committed, moved, or deleted unless the user explicitly asks.
- Keep reusable, versioned examples and schemas outside `queues/`.
- Do not represent a queue as launch-ready unless it passes the repository's queue validation path.
- Do not claim the entire Nikolay-like system is implemented in this tranche.

## Stop Rule

Stop only when a final audit proves the full original outcome for this bounded tranche is complete.

Do not stop after planning, discovery, or Judge selection when a safe Worker task can be activated.

Do not stop after a tiny adapter or documentation-only slice if the integrated behavior, durable evidence package, or validated launch queues are still missing.

If investigation shows that the Kit is already fully integrated, incompatible, or unsafe to import, the Judge must record the evidence and select the smallest viable alternative that still establishes the required memory/design foundation. A conclusion without proof is not completion.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

The preferred first Worker package is one vertical integration slice: contract, implementation, migration or compatibility handling if required, repository-native tests, and a behavior-level demonstration. Avoid separate tasks for small helpers or tests that belong to the same behavior.

After the integration gate, documentation and queue generation may be one coherent Worker package if their source evidence, target paths, and validators are known. If not, a Scout and Judge must narrow them first.

## Board Health

The PM owns board health. If the board looks stale, misleading, offline, or inconsistent, run:

```powershell
node C:\Users\Alexander Lozovoy\.codex\plugins\cache\goalbuddy\goalbuddy\0.4.1\skills\goal-prep\scripts\check-goal-state.mjs docs/goals/agent-memory-foundation-v1
```

If the local board is running, compare `state.yaml` to the live board API. Repair only GoalBuddy control files unless an active Worker or PM task explicitly allows product-file edits.

## Canonical Board

Machine truth lives at:

`docs/goals/agent-memory-foundation-v1/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/agent-memory-foundation-v1/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter and the GoalBuddy execution contract.
2. Read `state.yaml`; work only on its active task.
3. Preserve the two phase gates: verified Kit foundation first, durable system blueprint and launch queues second.
4. Keep the distinction between observed evidence, public evidence, decisions, inference, and unknowns.
5. Use Scout for read-only evidence, Judge for scope/risk/completion gates, and Worker only after exact write boundaries exist.
6. After every Worker package, record verification and compare its receipt to the goal oracle.
7. Continue through the largest safe local package until the bounded tranche is genuinely complete.
8. Finish only with a final Judge/PM receipt that maps integration proof, documentation artifacts, and queue validation to the original request and records `full_outcome_complete: true`.
