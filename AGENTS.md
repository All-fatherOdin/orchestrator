# Local queue files

- Put every user-created task queue and sequential queue plan in `queues/` at the repository root.
- `queues/` is intentionally ignored by Git. Do not stage, commit, move, or delete its contents unless the user explicitly asks.
- Keep reusable, versioned examples outside `queues/` (for example, `tasks.example.yaml` and `queues.plan.example.yaml`).

# Choose the execution format before creating files

Classify the request first. The supported execution formats are a bounded task in the current session, an ordinary managed YAML queue, or a sequential queue plan.

## Execute one task in the current Codex session

Do not create an Orchestrator queue when the work is one bounded implementation slice. Complete it in the current session with its normal verification.

Do not split implementation and its tests, formatting, or verification into artificial separate tasks merely to reach the queue minimum.

## Use an Orchestrator task queue

Create one YAML queue from `tasks.example.yaml` only when there are at least two independently useful tasks and all of these are true:

- the outcome and task boundaries are already understood;
- order or dependencies can be declared before execution;
- every writing task has concrete `allowedPaths`, verification commands, and stop guards;
- no investigation or later authorization is needed to discover additional scope.

The Orchestrator rejects ordinary queues with fewer than two tasks.

## Use a sequential queue plan

Use a plan from `queues.plan.example.yaml` only when several already-defined task queue files must run one after another. A plan sequences complete queue files; it does not discover or expand later scope.

If classification is ambiguous, use the current session for one bounded task, an Orchestrator queue for two or more understood tasks, and a sequential queue plan only for multiple already-defined queues.
