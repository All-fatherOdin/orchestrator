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

Before writing the YAML, inspect the relevant implementation, existing tests,
and failure evidence. For each task, identify the concrete behavior to change,
the complete write scope, required checks, and conditions that require stopping.
Carry those findings into its prompt, impact map, `allowedPaths`, and guards.
An open-ended instruction such as "inspect and fix if necessary" is not a
defined writing task. If investigation determines the implementation scope, do
that investigation in the current session before authoring the queue. A bounded
read-only diagnosis may be useful on its own, but cannot supply unknown scope
or authority to a pre-authored writing successor.

A separate test-only task is appropriate only for an independently useful,
previously uncovered contract. Name the specific input and expected behavior,
the existing coverage gap, exact test paths, and verification commands before
creating it. Keep tests required to establish an implementation task's own
correctness with that implementation. Tests may call production code without
requiring production write scope. If a test-only task discovers a production
defect requiring edits outside its scope, stop with the failing evidence; do
not expand scope or weaken the expected behavior to obtain a passing result.
A dependency on a production-writing predecessor does not grant its scope to
the test task. A final whole-change review does not replace task-level checks.

Ordinary queue tasks share one project worktree and must be treated as
sequential even when their `allowedPaths` do not overlap. Set
`limits.maxParallelTasks: 1` unless every concurrently eligible task has an
isolated managed-workspace binding.

Recovery queues must carry forward every runtime constraint already discovered
by the failed run, including interpreter variables, shell/quoting rules,
temporary-directory isolation, timeouts, and whole-change acceptance commands.
Do not replace an authoritative failing check with a narrower scoped check.

Declared `verificationCommands` are required machine gates by default and
therefore require enabled task authorization. Use `verificationMode: advisory`
only for intentionally non-gating executor-owned observations; advisory output
is never Orchestrator acceptance evidence and cannot be combined with enabled
authorization.

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

Prompts and checks must name every task-relevant evidence file by its exact
normalized repository-relative path. A basename such as `state.yaml` is not a
valid locator when the file is outside the repository root or could be
ambiguous. Resolve the path while authoring the queue and carry it into recovery
constraints; do not make the executor rediscover it by guessing or broad search.

Do not make an optional discovery utility an undeclared runtime dependency. If
`rg` or another non-system tool is mandatory, declare and preflight it. Otherwise
Windows prompts must permit the built-in PowerShell fallback: `Get-ChildItem`
for bounded discovery, `Get-Content` for exact files, and `Select-String` for
targeted content inspection. Absence of an optional utility is not by itself a
task failure when the declared fallback can establish the same evidence.

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

When a project opts into `DocumentationGovernancePolicyV1`, every task whose
write scope intersects its `managedPaths` must use `QueueAuthoringContractV1`,
include one configured navigation or lifecycle file in both `allowedPaths` and
`impactPaths.documentation`, and run every exact required documentation delta
command as a machine gate. The queue must end in the unique read-only
`WholeChangeAcceptanceV1` task, which runs the same gates. The repository-owned
commands, not Orchestrator prose or filename inference, must exit non-zero for
new prohibited findings such as `DOC-REACH-001`.

An opted-in recovery task may add an exact `RecoveryTaskBindingV1` source run
ID and source task ID. Before any run or project lock is created, Orchestrator
loads that persisted task and requires the recovery runtime constraints to be a
superset of its authorization-bound constraints. Missing, malformed,
duplicated, stale, or changed evidence fails closed. Never infer paths,
constraints, source identity, or recovery authority from prompts,
`executionGuards`, documentation, or other prose. Queues and run records that
omit the v1 envelope retain their legacy behavior and are not required to
synthesize these fields.

Every `QueueAuthoringContractV1` task must also carry the exact
`TaskExecutionKindV1` envelope: `ordinary` has no recovery binding, while
`recovery` has exactly one `RecoveryTaskBindingV1`. Recovery identity comes
only from the selected canonical persisted `run.json`; its source run and task
must be unique, authorization-replayable, terminal, and non-successful. A
formally authenticated failed recovery task may source a later recovery only
when every exact execution-kind/binding, authorization, runtime-superset, and
acyclic persisted-lineage check replays; never infer a chain from prose.

Use `WholeChangeAcceptanceV1` only on an enabled read-only `review` task with
`allowedPaths: []`. Its ordered `predecessorTaskKeys` must exactly equal its
direct dependencies, cover every writing task anywhere in the queue, and make
every covered writer an ancestor in the declared graph. It must be the final
queue task and unique terminal dependency sink. Orchestrator supplies the independent
reviewer the closed predecessor handoff (approved statuses, task IDs, exact
verification receipts, and task-owned tracked plus untracked evidence); never
claim or reconstruct that evidence in prose.

Path scopes are either one normalized repository-relative path or a directory
capability ending exactly in `/**` (for example `server/**`). `*`, `?`, `[`,
and `]` are forbidden elsewhere, so extension-shaped pseudo-globs such as
`docs/**/*.md` are invalid. Exact aggregate-total or cross-artifact claims
need their own deterministic executable assertion that binds every named
artifact, reads them, and exits non-zero on disagreement; a hash, content
reader, producer success, status text, or suggestive assertion filename is not
a receipt. Before restart, retry, or resume reuses persisted tasks, rebuild and
revalidate the same schema, dependency, final-sink, writer-coverage,
execution-kind, and authorization bindings; re-fence recovery evidence at each
available asynchronous boundary before executor authority or project locks.

After deployment, the required live smoke is one explicitly launched read-only
run against the restarted installed application, with its canonical `run.json`
receipt retained. This boundary never authorizes rebuilding, installation, or
workspace mutation.

The Orchestrator rejects ordinary queues with fewer than two tasks.

## Use a sequential queue plan

Use a plan from `queues.plan.example.yaml` only when several already-defined task queue files must run one after another. A plan sequences complete queue files; it does not discover or expand later scope.

If classification is ambiguous, use the current session for one bounded task, an Orchestrator queue for two or more understood tasks, and a sequential queue plan only for multiple already-defined queues.

# Define acceptance evidence before execution

For grouping, filtering, or aggregation work, resolve the following cases
against the product contract before authoring the task. Record concrete fixture
inputs and expected outputs in its prompt or an exact referenced specification;
do not leave the executor to choose semantics during implementation.

| Case | Required acceptance assertion |
|---|---|
| Missing value versus zero | Distinguish `null`, absent values, and numeric `0`; state their group membership and contribution to totals explicitly. |
| Exact filter and whitespace | Specify whether whitespace is significant or normalized; test leading/trailing whitespace and a near-match that must be excluded by an exact filter. |
| Accumulation | Use multiple contributing records and assert the exact accumulated result, including the rule for duplicate records. |
| Sibling groups | Use at least two sibling groups and assert each result independently, so contributions cannot leak between groups. |
| Pagination | Put relevant records on different pages; define page-local versus whole-result totals and verify the stated result without omissions or double counting. |

Mark a case inapplicable only with a concrete reason. Tests must assert the
specified values, not merely successful execution or non-empty output. Include
their files and any required fixtures in the impact map and write scope.

Keep acceptance claims tied to the evidence that proves them:

- Automated checks: name the exact command and assertions; use the canonical
  task verification receipts for executed results. Passing tests do not prove
  an interactive browser flow was exercised.
- Git checkpoints: use the task-owned checkpoint receipt and commit identity.
  A commit proves recorded changes, not functional correctness; require it via
  `checkpointPolicy` when it is a delivery condition.
- Browser checks: specify the application/build, initial data, user actions,
  and expected visible result. Retain the actual observation and exact artifact
  locator when captured. A screenshot alone does not prove unobserved behavior
  or all-page aggregation. If the check was not performed, report it as not run;
  do not substitute an automated check or a commit for required browser evidence.

These are authoring and reporting rules, not a new machine-enforced evidence
schema. Use existing verification gates and checkpoint contracts where applicable;
do not invent receipts or claim the runner validates prose-only browser evidence.

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
