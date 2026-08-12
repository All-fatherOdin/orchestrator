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
- an impact map has identified every production, test, generated, manifest,
  checksum, documentation, and acceptance file that the outcome can require;
- every writing task has concrete `allowedPaths`, verification commands, and stop guards;
- no investigation or later authorization is needed to discover additional scope.

Ordinary queue tasks share one project worktree and must be treated as
sequential even when their `allowedPaths` do not overlap. Set
`limits.maxParallelTasks: 1` unless every concurrently eligible task has an
isolated managed-workspace binding.

Recovery queues must carry forward every runtime constraint already discovered
by the failed run, including interpreter variables, shell/quoting rules,
temporary-directory isolation, timeouts, and whole-change acceptance commands.
Do not replace an authoritative failing check with a narrower scoped check.

On Windows, raw verification strings that do not explicitly select PowerShell
run through `cmd.exe`. Use double quotes for their arguments. To use
PowerShell quoting, variables, or control flow, prefix the command with the
PowerShell call operator `&`. Never use bare `python`, `python3`, or `py` in a
Windows queue; use `& $env:PYTHON_BIN ...`. Complex checks belong in a
versioned `.ps1` or `.mjs` file. A command that depends on another repository
must set that location explicitly in PowerShell or pass an explicit root
argument to the script; an absolute script path does not change its working
directory. Declare every such repository in task-level `externalReadRoots`.
For an apply task, the matching `approvedApplyContracts` entry must bind the
same ordered list. Orchestrator validates that each entry is an existing
absolute directory outside `project.path`, preflights it as a Git worktree,
and supplies `safe.directory` only through the child-process environment.
Never work around ownership checks with global or local `git config` changes.

Distinguish task-scoped verification from final whole-change verification. A
final acceptance task must cover tracked and untracked files and must not claim
predecessor verification evidence unless an explicit bounded handoff supplies
those records.

The bullets above are authoring guidance for every queue; they do not by
themselves grant authority or make prose machine-enforceable. An apply task opts
into the machine gate only with the exact `QueueAuthoringContractV1` envelope.
For that task, `impactPaths` is a non-empty ordered map containing every
normalized `allowedPaths` entry, and `runtimeConstraints` is a non-empty list of
explicit normalized strings. Its approved apply contract must bind the same
ordered impact map and, when present, the exact ordered `externalReadRoots`.
Runtime constraints and an optional recovery binding are
instead bound by the task authorization evidence and persisted task snapshot.
`impactPaths` remains descriptive: only `allowedPaths` grants write scope,
including when the impact map lists additional affected files.

An opted-in recovery task may add an exact `RecoveryTaskBindingV1` source run
ID and source task ID. Before any run or project lock is created, Orchestrator
loads that persisted task and requires the recovery runtime constraints to be a
superset of its authorization-bound constraints. Missing, malformed,
duplicated, stale, or changed evidence fails closed. Never infer paths,
constraints, source identity, or recovery authority from prompts,
`executionGuards`, documentation, or other prose. Queues and run records that
omit the v1 envelope retain their legacy behavior and are not required to
synthesize these fields.

The Orchestrator rejects ordinary queues with fewer than two tasks.

## Use a sequential queue plan

Use a plan from `queues.plan.example.yaml` only when several already-defined task queue files must run one after another. A plan sequences complete queue files; it does not discover or expand later scope.

If classification is ambiguous, use the current session for one bounded task, an Orchestrator queue for two or more understood tasks, and a sequential queue plan only for multiple already-defined queues.

# Project context and secondary memory

- For non-trivial repository work, ground the task with
  `docs/NEXT_STEPS.md`, `docs/source_of_truth_hierarchy.md`, and
  `docs/context_packs/current_status.md`, then read only task-relevant sources.
- `docs/project_map/` is secondary memory and navigation metadata. Current user
  instructions, code, tests, operational docs, canonical run records, and
  goal-board `state.yaml` files win on conflicts.
- Do not update Project Map memory or working state unless the active task
  explicitly includes those files in its mutation scope.
- Use `scripts/ai_context_helper.py` for bounded read-set selection when an
  Orchestrator task opts into a `contextProfile`. The helper is read-only and
  does not grant mutation authority.
