# Orchestrator

Local task queue for Codex CLI. It runs tasks **sequentially**, each in a fresh `codex exec --ephemeral` session, while the browser dashboard shows live progress.

## Quick start

```powershell
npm install
npm run dev
```

Open `http://localhost:4318`, select a target repository and upload or paste a YAML queue. For a production-like local run:

```powershell
npm run build
npm start
```

The desktop app is single-instance. A second launch focuses the existing window instead of starting another server. If a compatible standalone Orchestrator is already healthy on the configured port, desktop attaches to it without taking ownership and leaves it running when the window closes. Server recovery starts only after the HTTP port has been acquired, and a run with a live matching lock owner is never marked interrupted by another process.

The target repository's `AGENTS.md` and `.codex/config.toml` remain the source of truth: each CLI process is launched with that repository as its working directory.

## Sequential queue plans

To run several YAML queues one after another, upload or paste a plan instead of a task queue. Each `file` is a path to a queue YAML file; relative paths are resolved from the directory where the orchestrator is started, and absolute paths are supported.

```yaml
queues:
  - file: D:\pet-projects\orchestrator\fs_02_tasks.yaml
  - file: D:\pet-projects\orchestrator\fs_03_tasks.yaml
```

See [queues.plan.example.yaml](queues.plan.example.yaml). Before starting any work, the orchestrator reads and validates every referenced file. It runs the next queue only after the current queue completes successfully. A failed, timed-out, or cancelled queue stops the plan; the following queue is not started.

While a queue is running or paused, use **Add YAML after current** in the dashboard to append another task-queue YAML. The uploaded YAML is validated immediately and copied to `.orchestrator/plans/<plan-id>/queues/`; it will start only after the active queue completes successfully. This also works for a run that was started from a single queue YAML: it is promoted to a sequential plan automatically.

## GoalBuddy goals and serial goal pipelines

Use the **GoalBuddy** page for adaptive work described by a GoalBuddy `state.yaml`. The bridge preserves the complete active-card role contract: `type`, `assignee`, `reasoning_hint`, `inputs`, `constraints`, `expected_output`, `allowed_files`, `verify`, and `stop_if`. Scout and Judge prompts are explicitly read-only. An active Worker is rejected until both `allowed_files` and `verify` are non-empty.

Within one goal, every card runs in a fresh `codex exec --ephemeral` context. When a Judge must scope the next Worker, its prompt requires a `GOALBUDDY_NEXT_TASK_PATCH_V1` decision; the Orchestrator validates that decision and writes the bounded objective, paths, checks, and guards into the Worker card before activation. A strict run completes only when T999 returns an evidence-backed `GOALBUDDY_FINAL_DECISION_V1` with `full_outcome_complete: true`.

For several distinct GoalBuddy outcomes that must execute one after another, use [goalbuddy.plan.example.yaml](goalbuddy.plan.example.yaml). User-specific plans belong in `queues/`:

```yaml
version: 1
projectPath: D:\pet-projects\orchestrator
goals:
  - statePath: docs/goals/runtime-baseline/state.yaml
  - statePath: docs/goals/approval-boundary/state.yaml
policy:
  stopOnFailure: true
  autoCommit: false
```

The Orchestrator preflights every board before starting any work, preserves the declared order, and starts the next goal only after the previous goal's strict final audit completes. A failed task, board conflict, missing Judge scope, unproven oracle, timeout, cancellation, or project-lock failure stops the pipeline. The terminal record is written to `.orchestrator/plans/<pipeline-id>/goalbuddy-pipeline-receipt-v1.json`. Goal pipelines never run goals in parallel and never create commits automatically.

Choose the format by intent:

- **Task queue:** bounded tasks and scopes are known up front.
- **Sequential queue plan:** several already-defined task queue YAML files must run serially.
- **One GoalBuddy goal:** one adaptive outcome needs Scout/Judge/Worker discovery and one oracle.
- **Serial GoalBuddy pipeline:** several distinct GoalBuddy outcomes each have their own board and oracle, and later goals depend on earlier completion.

Repository agents receive the same routing rules from `AGENTS.md`, so a request such as “compose an Orchestrator queue” should be classified before files are created.

## Task format

See [tasks.example.yaml](tasks.example.yaml). Models are intentionally restricted to `luna`, `terra`, and `sol`; effort is `light`, `medium`, or `high`. The MVP refuses `sol` with `high` effort to control spend.

Set a task's `model` to `auto` to let the orchestrator choose before the run. It routes contained tasks to Luna, implementation and verification work to Terra, and high-risk or cross-cutting work (such as migrations, security, architecture, production incidents, and payments) to Sol. Use `minModel: terra` or `minModel: sol` to prevent routing below a required capability level; an explicit model always takes precedence. The resolved model and routing reason are stored in the run record and report.

To opt a task into Context Contract v1, set `contextProfile` and optionally `maxSources` (default `12`, range `1`–`50`) in YAML or the visual task editor. Preflight launches the target repository's `scripts/ai_context_helper.py` as a separate process, previews the selected sources, reuses that exact bundle for execution, and stores its `ContextReceiptV1` in the run record. The adapter preserves the helper's truthful selected, omitted, and truncated metadata and checks it against the read set and `maxSources`; it does not reproduce helper selection logic. Missing helpers, timeouts, invalid JSON, schema failures, and contract mismatches use an observable fixed-entrypoint fallback limited to `AGENTS.md` and `README.md`; the fallback never scans the repository or reads secret-bearing/high-risk paths.

Generated `ContextRequestV1`, `ContextBundleV1`, and `ContextReceiptV1` values are runtime-validated with Ajv 8 and JSON Schema Draft 2020-12. Exact versioned schema snapshots and their source hashes are recorded in `server/context-contract-v1/schemas/PROVENANCE.md`.

### Dependencies and parallel execution

For queues intended for a dependency-aware scheduler, give every task a stable YAML `key` and use `dependsOn` to name only its direct prerequisites. A task becomes runnable when every key in `dependsOn` has completed; all runnable tasks without a dependency or resource conflict can be launched in parallel. The current runner still executes the queue sequentially, but validates and preserves this graph for a parallel scheduler.

Set `limits.maxParallelTasks` to the maximum safe concurrency (from `1` to `4`); it defaults to `1` to preserve sequential execution. Use `resources` for named exclusive resources such as `postgres-schema`, `staging`, `port-4317`, or `stripe-sandbox`. Two tasks with the same resource are valid, but the scheduler must not run them together.

When composing a YAML queue, apply these rules:

- Use short, unique keys such as `api-client` or `migration_01`; keys may contain letters, numbers, hyphens, and underscores.
- Add `dependsOn` when a task needs another task's output, verification, generated artifact, migration, deployment, or an ordered external side effect.
- Do not add a dependency merely because a task appears later in the file. Independent tasks should omit `dependsOn` so the scheduler can run them concurrently.
- Tasks that edit overlapping files, share a database/schema, use the same port/environment, or call a rate-limited external system are not safe to run together. Split ownership with `allowedPaths` where possible; otherwise make one task depend on the other.
- Declare every shared exclusive resource in `resources`. Resource names may contain letters, numbers, dots, hyphens, and underscores, and must be unique within a task.
- Keep `dependsOn` minimal and direct. Do not repeat transitive dependencies, and never create cycles.
- A task that integrates or tests outputs from multiple branches must depend on each contributing task.

`dependsOn` is optional for backwards-compatible sequential queues. It may only reference existing task keys; duplicate keys, missing references, duplicate dependencies, self-dependencies, and dependency cycles are rejected during YAML validation.

### Run controls

- **Pause** stops scheduling new tasks and enters the paused state after every active task settles.
- **Cancel** terminates every active Codex process and prevents any further task from starting.
- **Skip** targets one active task; the task is skipped and its dependent tasks become `blocked`.
- **Retry** creates a new run that preserves completed tasks, reruns the selected task, and resets all of its transitive dependents. **Resume** follows the same graph-aware rule for every incomplete task.

Run history and logs are written to `.orchestrator/runs/` beside this repository. No commits are made automatically.

## Token usage

For new runs, the runner records the final `turn.completed.usage` event from Codex CLI for every executor, reviewer, and correction call. Records are stored with each task in `.orchestrator/runs/<run-id>/run.json` as `usage` entries (`inputTokens`, `outputTokens`, `cachedInputTokens`, phase, attempt, and timestamp), so both the application and automation can read them without parsing logs. Open **Расход** in the sidebar to choose a current or historical run and, optionally, one task; the page shows token totals, a task comparison chart, and detailed call counts. Provider prices are not guessed because the CLI event does not include a tariff.

## Codex CLI on Windows

The runner automatically prefers the Codex Desktop CLI matching the installed app. To select another binary, set `CODEX_BIN` to its absolute path before starting the orchestrator.
