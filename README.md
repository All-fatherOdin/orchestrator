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

## Change-control API

Orchestrator keeps a separate change-control event ledger under its own data
directory at `.orchestrator/change-control-v1/projects/` (or beneath
`ORCHESTRATOR_DATA_DIR` when configured). Nothing is written to a target
repository, and canonical run records under `.orchestrator/runs/` are
unchanged.

The first version supports distinct change, wave, and task entities. Their
lifecycles fail closed:

- change: `draft -> planned -> active -> completed | cancelled`
- wave: `draft -> ready -> dispatched -> running -> completed | halted`
- task: `pending -> ready -> running -> accepted | failed | halted`

Every accepted write appends an immutable, hash-chained event with a
project-wide monotonic sequence. Current state is rebuilt from the validated
event stream; there are no update or delete endpoints for published events.
Waves and tasks are planning entities only: dispatch changes ledger state but
does not create a run or execute an agent.

The JSON APIs are:

- `POST /api/change-control/projects/:projectId/changes`
- `GET /api/change-control/projects/:projectId/changes`
- `GET /api/change-control/projects/:projectId/changes/:changeId`
- `POST /api/change-control/projects/:projectId/changes/:changeId/transitions`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves`
- `GET /api/change-control/projects/:projectId/changes/:changeId/waves`
- `GET /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/dispatch`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/transitions`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/tasks/:taskId/transitions`
- `GET /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning/contracts`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning/authorizations`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning/architect-replan-receipts`
- `GET /api/change-control/projects/:projectId/execution-bucket`

Create bodies require `actor` and may include `changeId`, `causationId`,
`correlationId`, and a JSON-object `payload`. If omitted, the change ID,
causation ID, and correlation ID receive server-generated defaults.
Transition bodies require `actor` and `to`, may include the same causal fields
and payload, and accept only `planned`, `active`, `completed`, or `cancelled`
when legal from the current state. Change create, get, and transition responses
contain `{ change, events }`; wave writes and gets contain `{ wave, events }`.
List endpoints return deterministic projections.
Invalid input returns `400`, missing changes return `404`, illegal transitions
or duplicate IDs return `409`, and a corrupt or unknown persisted event fails
with `500` instead of being projected.

Wave creation requires `actor` and a non-empty `tasks` array. Each task has a
stable `taskId` and may declare task IDs in `dependsOn`; a wave may likewise
declare earlier wave IDs in `dependsOn`. Missing, duplicate, self, and cyclic
task dependencies are rejected atomically. Root tasks become ready
deterministically, dependent tasks become ready only after every prerequisite
is accepted, and a dependent wave becomes ready only after every prerequisite
wave is completed.

The execution bucket endpoint is a deterministic, project-scoped projection
of ready waves ordered by the ledger sequence of their readiness event. It is
never persisted as a second queue or canonical store. Dispatching a non-ready
wave returns `409` with code `NOT_READY` and structured `reasons` such as
`WAVE_STATUS_NOT_READY`, `WAVE_DEPENDENCY_NOT_COMPLETED`, or
`NO_READY_TASKS`. To override that gate, send `sendAnyway: true` with a
non-empty `actor` and `reason`; the ledger records a
`wave.dispatch-overridden` event containing the actor, reason, and exact
readiness reasons that were bypassed.

### Planning Contract v1 publication

The wave-scoped planning endpoints publish the canonical
`PlanningContractV1`, `PlanAuthorizationV1`, and
`ArchitectReplanReceiptV1` objects defined by
`server/change-control-v1/schemas/planning-drift-v1.schema.json`. Request
bodies wrap the canonical object as `contract`, `authorization`, or `receipt`;
they may also supply `causationId` and `correlationId`. The read endpoint
returns an immutable projection containing revision-ordered plans, their
authorization state, architect receipts, and the typed planning events.

Schema validation is followed by semantic validation. A plan must cover the
exact existing wave task set, use unique task IDs, acceptance claim IDs, and
declared write paths, and bind a full Git SHA whose length matches its hash
algorithm. Revision 1 has no predecessor. Every later revision must increase
monotonically and name the exact latest `(planId, revision, planBaseSha)`
predecessor. Replacement authorization additionally requires exactly one
architect receipt linking the published prior and replacement revisions.

Only `human:*` and `policy:*` identities may publish
`PlanAuthorizationV1`; a plan creator or architect proposer cannot authorize
its own output. Authorization binds the exact
`(planId, revision, planBaseSha)` tuple and is never inherited. Accepted
replacement authorization appends a `plan.superseded` event for an authorized
predecessor in the same atomic ledger write. Unknown contract versions,
missing or mismatched references, duplicate terminal decisions, revision
regressions, and self-authorization fail without persisting any partial event.

These records extend the existing project hash chain and deterministic replay;
they are not a second scheduler or run store. There are no update or delete
endpoints. `.orchestrator/runs/<run-id>/run.json` remains authoritative for
concrete execution, and the planning publication APIs do not create runs or
execute agents.

### Planning and Drift v1 dispatch gate

Publishing the first planning contract opts that project ledger into the
Planning and Drift v1 dispatch gate. From that point, every wave dispatch in
the project requires the latest exact plan revision to be valid and authorized.
Project ledgers with no planning contracts retain the Phase 1 dispatch
behavior, including the existing dependency-only `sendAnyway` override.

At dispatch, `projectId` must resolve to exactly one persisted Orchestrator
Project Profile. The server runs read-only Git queries in that profile's
persisted path to obtain the top-level repository identity, clean/dirty state,
full `HEAD` SHA, hash algorithm, and ref. Repository identity is the SHA-256
fingerprint of the normalized path returned by
`git rev-parse --show-toplevel`. Request fields, planning payloads, and files
inside the target repository are never path authority. Missing, ambiguous,
non-Git, or unreadable profiles reject with `CURRENT_BASE_UNREADABLE`.

The gate requires an executable blocking acceptance oracle and evidence-backed
blast radius for every task, a valid stale-predecessor receipt for replacement
plans, an exact clean repository identity and base SHA, and the existing wave
and task dependency readiness. A dirty worktree is marked stale and rejected
with `CURRENT_WORKTREE_DIRTY`; repository identity or SHA drift is marked stale
and rejected with `PLAN_BASE_MISMATCH`; fired declared triggers or unknown
drift reject with `PLAN_STALE`. `sendAnyway` can still override only Phase 1
dependency readiness and cannot bypass any Phase 2 reason.

Every Phase 2 attempt appends an immutable `DispatchGateReceiptV1`, including
rejections. Readable authorized plans also append an immutable
`DriftAssessmentV1`; stale assessments use `plan.marked-stale`, fresh
assessments use `plan.drift-assessed`, and all gate decisions use
`plan.dispatch-validated`. The planning read endpoint projects
`driftAssessments` and `dispatchGateReceipts` alongside plans,
authorizations, architect receipts, and typed events. Allowed dispatch is
persisted atomically with its fresh assessment, gate receipt, and wave
transition; a rejected attempt persists its assessment when available and its
gate receipt before returning the stable rejection reasons.

### Workspace and Merge v1

An allowed Phase 2 managed task is executed in one Orchestrator-owned Git
worktree and local attempt branch at the exact authorized plan base. The
canonical run record persists `WorkspaceAttemptV1` state and hash-chained
transition evidence before Git side effects. Executor, reviewer/correction,
verification, snapshots, diffs, and authenticated checkpoints all use the
revalidated owned worktree; the target checkout is not used as a fallback.
Legacy runs without Phase 3 state remain readable and never acquire implicit
workspace or branch ownership.

A sealed attempt is finalized through a serialized `MergeRequestV1`. One
cross-process lease, fenced by repository identity and target ref, is held
continuously while the server revalidates the clean target, exact target and
sealed-source SHAs, Phase 2 authorization, workspace marker, branch, HEAD, and
lease epoch. The only integration strategy is
`git merge --no-ff --no-commit`; recorded verification runs against that exact
pending merge before one identified two-parent merge commit is created.
Target movement records linked Phase 2 drift and ends in `replan_required`
instead of rebasing, cherry-picking, squashing, or refreshing acceptance
criteria automatically.

Canonical merge requests, hash-chained transitions, and immutable
`MergeReceiptV1` records are stored in `run.json` and checked on ordinary load
and startup replay. Recovery is idempotent across provisioning, execution,
checkpoint, merge, verification, commit, receipt, and cleanup boundaries.
Ambiguous identity or one-sided evidence is retained and quarantined; automatic
cleanup is bounded and non-force. Orchestrator does not use `reset --hard`,
`clean`, force branch/worktree removal, global worktree pruning, force ref
updates, or remote publication for this lifecycle.

### Halts and Incidents v1: Warden and Doctor

Detected halts, attribution assessments, incidents, resolution receipts, and
their typed lifecycle events extend the existing per-project change-control
hash chain. They do not create another scheduler, run record, or mutable
incident database. The Draft 2020-12 schema and fixtures are in
`server/halts-incidents-v1/schemas/halts-incidents-v1.schema.json` and
`halts-incidents-v1.examples.json`. `WardenVerdictV1`, repair-lease records,
and their typed events have a separate Draft 2020-12 schema and fixtures in
the same directory as `warden-v1.schema.json` and `warden-v1.examples.json`.

Halt publication is atomic across detection, classification, and exact
incident linkage. Detector retries are idempotent by
`(projectId, detectorId, detectorEventId)`. Versioned observation and incident
fingerprints exclude attempt, run, process, lease, and workspace identities
from durable recurrence identity. Concurrent correlations serialize on the
project ledger through an identity-fenced filesystem lock; a dead process
owner is recovered without allowing a stale contender to remove its successor.
Replay rejects incomplete classification, changed
fingerprints, illegal transitions, missing scopes, conflicting links, invalid
closure evidence, and reopen attempts outside the recorded publication-time
window. Insufficient evidence is published as `unknown` with `none`
attribution and escalates with `HALT_CLASS_UNKNOWN`; it never receives exact
attribution or automatic action.

The focused APIs are:

- `POST /api/change-control/projects/:projectId/halts`
- `GET /api/change-control/projects/:projectId/halts-incidents`
- `GET /api/change-control/projects/:projectId/halts/:haltId`
- `GET /api/change-control/projects/:projectId/warden`
- `GET /api/change-control/projects/:projectId/halts/:haltId/warden-verdicts`
- `POST /api/change-control/projects/:projectId/halts/:haltId/warden-verdicts`
- `POST /api/change-control/projects/:projectId/halts/:haltId/repair-lease/transitions`
- `GET /api/change-control/projects/:projectId/doctor`
- `POST /api/change-control/projects/:projectId/halts/:haltId/doctor-repairs`
- `GET /api/change-control/projects/:projectId/doctor-repairs/:receiptId`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/tasks/:taskId/retry-authorizations`
- `POST /api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/resume-authorizations`
- `POST /api/change-control/projects/:projectId/halts/:haltId/transitions`
- `POST /api/change-control/projects/:projectId/halts/:haltId/correlations`
- `GET /api/change-control/projects/:projectId/incidents/:incidentId`
- `POST /api/change-control/projects/:projectId/incidents/:incidentId/transitions`
- `POST /api/change-control/projects/:projectId/incidents/:incidentId/resolutions`

Correlation corrections are human-owned, use ledger-assigned publication
time, append superseding history, and leave original links and incident records
immutable. Mitigation and resolution require an exact
`IncidentResolutionReceiptV1`; resolution additionally requires terminal
handling for associated blocking halts, no active healing, and the incident's
recorded correlation-window policy. A matching recurrence reopens a mitigated
incident immediately, or a resolved incident only inside that window; an
expired window creates a new incident with
`INCIDENT_REOPEN_WINDOW_EXPIRED`.

The Warden evaluates exact canonical halt, effective-incident, attribution,
evidence-snapshot, policy, recipe, budget, idempotency, oracle, and quarantine
state. Automatic dispositions require a live exclusive monotonic repair lease;
unknown policy or recipe identity, stale/conflicting evidence, non-exact
attribution, ambiguous effects/results, exhausted budgets, and lease loss fail
closed. Higher-ordinal verdicts append superseding history. An open blocking
incident rejects wave dispatch, including `sendAnyway`.

Doctor executes only `provider-read-retry-v1`,
`registered-process-retry-v1`, `workspace-reconcile-v1`,
`merge-safe-abort-resume-v1`, and `owned-cleanup-retry-v1`. Each identity has
closed typed inputs, fixed attempt/backoff/timeout bounds, code-owned adapters,
stop conditions, and an executable success oracle. Requests cannot supply a
shell, command, tool, prompt, model, path, plan, policy, dependency, or
authorization choice. Phase 3 recipes call the existing recovery and bounded
non-force cleanup APIs.

`doctor.repair-started` is durable before an effect and
`doctor.repair-finished` carries `DoctorRepairReceiptV1` with exact input,
evidence, lease epoch, adapter outcomes, and oracle result. Restart replay
returns an exact prior receipt, proves a completed effect by typed
re-observation, retries only an explicitly crash-safe read, or quarantines
ambiguity and lease loss. Doctor success does not recover a halt, resolve an
incident, or authorize retry/resume.

`task.retry-authorized` and `wave.resume-authorized` require an independent
live Warden bounded-retry verdict or an audited `human:*` decision. Retry
allocates a new immutable attempt identity and records a stale-plan assessment;
the next dispatch must pass fresh Phase 2 planning, authorization, drift,
dependency, acceptance, Phase 3 ownership, and blocking-incident gates.

### Prompt and model lineage v1

The first Phase 5 slice extends the same per-project hash chain with immutable
`PromptArtifactV1`, `ModelRouteV1`, `AttemptConfigurationBindingV1`, and
`ResolvedModelExecutionV1` records. Its Draft 2020-12 schema and positive and
negative fixtures are under `server/prompt-model-eval-v1/schemas/`. The typed
events are `prompt.artifact-published`, `prompt.artifact-revoked`,
`model.route-published`, `model.route-revoked`,
`attempt.configuration-bound`, `invocation.configuration-bound`, and
`model.execution-resolved`. Publisher occurrence IDs are idempotent across
threads, processes, and restart; reuse with different content is rejected.

This slice is explicitly configuration-lineage only. It does not implement
eval suites, eval runs, reports, comparisons, or champion decisions.

The focused APIs are:

- `GET /api/change-control/projects/:projectId/prompt-model-lineage`
- `POST /api/change-control/projects/:projectId/changes/:changeId/prompt-artifacts`
- `POST /api/change-control/projects/:projectId/changes/:changeId/prompt-artifacts/:artifactId/revocations`
- `POST /api/change-control/projects/:projectId/changes/:changeId/model-routes`
- `POST /api/change-control/projects/:projectId/changes/:changeId/model-routes/:routeId/revocations`
- `POST /api/change-control/projects/:projectId/changes/:changeId/attempt-configuration-bindings`
- `POST /api/change-control/projects/:projectId/changes/:changeId/model-executions`

A managed task opts into this boundary with a
`PromptModelExecutionConfigurationV1` reference under `promptModel`. It names
the ordered artifact IDs, requested route ID, compiler identity, input schema,
and expected runtime capabilities separately for executor, reviewer, and
correction roles. Once opted in, each executor retry receives a new immutable
attempt binding before provider start. Reviewer and correction calls require
distinct child invocation bindings. The runtime preserves the requested route
ID separately from provider, adapter, concrete model, capability-map,
reasoning, and tool-route observations. Unknown, revoked, stale,
hash-mismatched, privacy-invalid, capability-incompatible, mismatched, and
unpermitted-fallback configurations fail before a provider process starts.

Canonical storage is intentionally narrow. Prompt artifacts may contain only
approved reusable instruction content or ordered manifests. Bindings store a
scoped SHA-256 input fingerprint, never the rendered task or reviewer prompt.
The ledger and run record reject or omit secrets, environment values,
unrelated file contents, provider-hidden reasoning, and raw provider payloads.
Historical ledgers, queues, and run records without Phase 5 fields remain
readable and do not acquire implicit prompt/model authority.

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

Machine-testable baseline conditions belong in task-level `preconditions`,
not in post-change `verificationCommands` or prose-only `executionGuards`.
The runner executes preconditions before Codex and blocks the task on a
non-zero exit, timeout, or any detected worktree, HEAD, or branch mutation.
PowerShell wrappers around `git diff --no-index --check` must explicitly
`exit 0` after handling its expected native exit code `1`.
Preflight also rejects inline `python -c` commands longer than 400 characters
and inline PowerShell commands longer than 1,200 characters. Put substantial
verification logic in a versioned script so it can be reviewed and tested.

When a dependent task requires an actual predecessor commit, set
`git.checkpointCommits: true`, include the predecessor in `dependsOn`, and add
the same key to `requiresCheckpointsFrom`. Validation rejects read-only
checkpoint producers, missing direct dependencies, and disabled checkpoint
commits. Runtime also blocks if the predecessor completed without a task-owned
diff and therefore created no checkpoint.

Set a task's `model` to `auto` to let the orchestrator choose before the run. It routes everyday implementation and verification work to Terra. Contained work uses Luna only when that runtime capability is enabled; otherwise it falls back to Terra. Use `minModel: sol` for the explicit quality-first Sol escalation and compare its preserved reasoning baseline with one lower effort before changing the setting. An explicit model always takes precedence, but an unsupported model, reasoning, or local-tool route is rejected rather than sent to Codex. The resolved model and routing reason are stored in the run record and report. See [GPT-5.6 routing](docs/gpt56-model-routing-v1.md) for source date and fallback behavior.

To opt a task into Context Contract v1, set `contextProfile` and optionally `maxSources` (default `12`, range `1`–`50`) in YAML or the visual task editor. Preflight launches the target repository's `scripts/ai_context_helper.py` as a separate process, previews the selected sources, reuses that exact bundle for execution, and stores its `ContextReceiptV1` in the run record. The adapter preserves the helper's truthful selected, omitted, and truncated metadata and checks it against the read set and `maxSources`; it does not reproduce helper selection logic. Missing helpers, timeouts, invalid JSON, schema failures, and contract mismatches use an observable fixed-entrypoint fallback limited to `AGENTS.md` and `README.md`; the fallback never scans the repository or reads secret-bearing/high-risk paths.

Set `requireRepositoryContext: true` when that controlled fallback is not
sufficient. In that mode, any helper fallback makes preflight fail instead of
launching with reduced context.

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
