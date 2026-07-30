# Orchestrator

Local task queue for Codex CLI. It runs each task in a fresh `codex exec --ephemeral` session, schedules dependencies safely, and shows live progress in the browser dashboard.

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

The desktop app is single-instance. A second launch focuses the existing window instead of starting another server. If a compatible standalone Orchestrator is already healthy on the configured port, desktop attaches without taking ownership and leaves it running when the window closes. Otherwise desktop owns the server it starts and stops it during shutdown. Server recovery starts only after the HTTP port has been acquired, and a run with a live matching lock owner is never marked interrupted by another process.

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

Choose the format by intent:

- **Current Codex session:** one bounded task.
- **Task queue:** two or more bounded tasks and scopes are known up front.
- **Sequential queue plan:** several already-defined task queue YAML files must run serially.

Repository agents receive the same routing rules from `AGENTS.md`, so a request such as “compose an Orchestrator queue” should be classified before files are created.

## Task format

See [tasks.example.yaml](tasks.example.yaml). Models are intentionally restricted to `luna`, `terra`, and `sol`; effort is `light`, `medium`, or `high`. `light` maps to Codex `low`. Terra is the everyday route; Sol is an explicit quality-first escalation; Luna is available only when the installed Codex runtime has been verified and the server is started with `CODEX_LUNA_SUPPORTED=1`.

On Windows, pytest verification should use a unique direct child of the
authorized temp root for every Codex process, for example
`--basetemp="$env:TEMP\orchestrator-pytest-$PID"`. Do not reuse a fixed
basetemp between executor and reviewer sessions. Queue preflight rejects
Windows pytest verification commands that omit this isolated basetemp. Also
remember that ordinary
`git diff --check` does not inspect new untracked files. Use a read-only
`git diff --no-index --check` wrapper that treats emitted whitespace
diagnostics as failure, as shown in `tasks.example.yaml`; do not stage files
merely to make verification see them.

Preflight also checks reviewer-evidence requirements. If a task asks the
reviewer to inspect document contents, hashes and existence checks are not
enough; a bounded or targeted content reader is required. Exact path/line
requirements need numbered evidence such as non-quiet `Select-String`, `rg -n`,
or `findstr /n`. Whole-file `Get-Content` output is rejected unless bounded
with `-TotalCount`, `Select-Object -First`, or `Select-Object -Last`.
PowerShell verification commands are syntax-parsed without execution during
preflight. Writable tasks cannot use `git diff --quiet` or
`git diff --exit-code` as post-change verification because their allowed
changes necessarily create a diff; put clean-start requirements in
`executionGuards`. A task with an explicit `allowedPaths: []` is read-only:
reviewer changes fail the task directly and do not enter the correction loop.

Set a task's `model` to `auto` to let the orchestrator choose before the run. It routes everyday implementation and verification work to Terra. Contained work uses Luna only when that runtime capability is enabled; otherwise it falls back to Terra. Use `minModel: sol` for the explicit quality-first Sol escalation and compare its preserved reasoning baseline with one lower effort before changing the setting. An explicit model always takes precedence, but an unsupported model, reasoning, or local-tool route is rejected rather than sent to Codex. The resolved model and routing reason are stored in the run record and report. See [GPT-5.6 routing](docs/gpt56-model-routing-v1.md) for source date and fallback behavior.

To opt a task into Context Contract v1, set `contextProfile` and optionally `maxSources` (default `12`, range `1`–`50`) in YAML or the visual task editor. Preflight launches the target repository's `scripts/ai_context_helper.py` as a separate process, previews the selected sources, reuses that exact bundle for execution, and stores its `ContextReceiptV1` in the run record. The adapter preserves the helper's truthful selected, omitted, and truncated metadata and checks it against the read set and `maxSources`; it does not reproduce helper selection logic. Missing helpers, timeouts, invalid JSON, schema failures, and contract mismatches use an observable fixed-entrypoint fallback limited to `AGENTS.md` and `README.md`; the fallback never scans the repository or reads secret-bearing/high-risk paths.

Generated `ContextRequestV1`, `ContextBundleV1`, and `ContextReceiptV1` values are runtime-validated with Ajv 8 and JSON Schema Draft 2020-12. Exact versioned schema snapshots and their source hashes are recorded in `server/context-contract-v1/schemas/PROVENANCE.md`.

An optional Context Contract v1 programmatic reduction stage can be enabled with `ORCHESTRATOR_CONTEXT_PTC_V1=1`; it is disabled by default. It consumes the existing router result and permits only deterministic read-only filtering, evidence joining, ranking, deduplication, aggregation, and schema validation. Unsafe or approval-sensitive tools, linkage loss, evidence loss, invalid output, and semantic conflicts stop before mutation and use the unchanged direct result. The built-in adapter is local and credential-free, while approvals, citations, semantic decisions, mutations, and final response validation stay on direct paths. See [Context Contract v1 programmatic reduction](docs/context-contract-ptc-v1.md).

Optional provider reasoning reuse is governed by `ORCHESTRATOR_PROVIDER_REASONING_MODE=off|current_turn|persisted` and is `off` by default. Before every executor attempt, retry, and correction, the run lifecycle persists a bounded strategy/reason after matching the exact goal, scope, Git branch, priority, and authorization identity; stale state is discarded on any change. Persisted provider response IDs, summaries, and sanitized replay items are ephemeral operational metadata only: they never replace Working State, source authority, task receipts, durable project memory, completion evidence, or approval. The current Codex CLI adapter explicitly supports neither response-ID continuation nor manual replay, remains on fresh `--ephemeral` sessions, and observably falls back to the current turn even when `persisted` is selected. Only a future adapter that declares continuation support may record sanitized state. See [Persisted Reasoning and Working State v1](docs/persisted-reasoning-working-state-v1.md).

### Dependencies and parallel execution

For dependency-aware queues, give every task a stable YAML `key` and use `dependsOn` to name only its direct prerequisites. A task becomes runnable when every key in `dependsOn` has completed; all runnable tasks without a dependency, path, or resource conflict can be launched in parallel.

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

For new runs, the runner records the final `turn.completed.usage` event from Codex CLI for every executor, reviewer, and correction call. Records are stored with each task in `.orchestrator/runs/<run-id>/run.json` as `usage` entries (`inputTokens`, `outputTokens`, `cachedInputTokens`, optional `cacheWriteTokens`, phase, attempt, and timestamp), so both the application and automation can read them without parsing logs. Open **Расход** in the sidebar to choose a current or historical run and, optionally, one task; the page shows input and output totals, separate cache-read and cache-write telemetry, a task comparison chart, and detailed call counts. Cache read/write values do not change the input/output total, and missing cache-write telemetry from legacy runs is shown as zero. Provider prices are not guessed because the CLI event does not include a tariff.

The compact compiler also has a cache-aware layout: immutable governance is the deterministic reusable prefix, while task data, changing tool lists, Working State, sources, tool output, timestamps, request IDs, and user-specific values remain dynamic. The existing GPT-5.6 CLI routes retain implicit provider caching and their uncached fallback. Explicit cache breakpoints are disabled and are not sent to the CLI unless a future compatible route has reproducible net-value benchmark evidence; this project currently makes no cache-savings claim. See [Prompt Cache Layout v1](docs/prompt-cache-layout-v1.md).

## Codex CLI on Windows

The runner automatically prefers the Codex Desktop CLI matching the installed app. To select another binary, set `CODEX_BIN` to its absolute path before starting the orchestrator.
