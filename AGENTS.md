# Local queue files

- Put every user-created task queue and sequential queue plan in `queues/` at the repository root.
- `queues/` is intentionally ignored by Git. Do not stage, commit, move, or delete its contents unless the user explicitly asks.
- Keep reusable, versioned examples outside `queues/` (for example, `tasks.example.yaml` and `queues.plan.example.yaml`).

# Choosing an Orchestrator work format

When a user asks to "create a task queue using the Orchestrator template", first classify the work. Do not default every request to a flat task queue.

## Use a task queue

Create one YAML task queue from `tasks.example.yaml` when all of these are true:

- the outcome is bounded and already understood;
- tasks and their order or dependencies can be named before execution;
- every writing task can receive concrete `allowedPaths`, verification commands, and stop guards now;
- the queue does not need a Scout to discover the plan or a Judge to authorize later scope.

Use a sequential queue plan from `queues.plan.example.yaml` when several already-defined task queue files must run one after another. A queue plan sequences queue files; it does not provide GoalBuddy discovery, PM progression, or an oracle.

## Use one GoalBuddy goal

Create one GoalBuddy board under `docs/goals/<slug>/` when there is one owner outcome but execution is adaptive, long-running, risky, or evidence-driven. Typical signals are:

- a Scout must inspect the repository before implementation can be scoped;
- a Judge must choose or authorize the Worker slice;
- the Worker scope cannot be written truthfully at intake time;
- completion needs a final oracle audit rather than only finishing a fixed list;
- the work may require several Scout/Judge/Worker cycles to reach one outcome.

The board must keep exactly one active task. Scout and Judge are read-only. Worker requires non-empty `allowed_files`, `verify`, and `stop_if` before activation. T999 is the final Judge and may complete the goal only with evidence-backed `full_outcome_complete: true`.

## Use a serial GoalBuddy goal pipeline

Create a plan from `goalbuddy.plan.example.yaml` when there are two or more distinct goals that must run in a declared order and each goal has its own board and oracle. Use this instead of one oversized goal when:

- each stage is independently meaningful and auditable;
- a later stage should start only after the previous T999 audit succeeds;
- failure, conflict, blocked scope, or an unproven oracle must stop all later stages;
- each stage benefits from a fresh top-level run while its cards still use fresh Codex contexts.

A GoalBuddy pipeline is always serial, always stops on failure, and never commits automatically. Do not put multiple goals into an ordinary task queue and do not put unrelated outcomes into one monolithic GoalBuddy board.

## Authoring rules

- Put user-specific task queues and both kinds of pipeline plans in `queues/`.
- Keep GoalBuddy `goal.md` and `state.yaml` under `docs/goals/<slug>/`; a serial plan only references those boards.
- Preserve the user's requested order. Do not infer parallel execution for goals.
- Preflight every referenced file before starting the first stage.
- If classification is ambiguous, prefer one GoalBuddy goal for one adaptive outcome and a GoalBuddy pipeline only for multiple outcomes with separate completion proofs.
