# Local queue files

- Put every user-created task queue and sequential queue plan in `queues/` at the repository root.
- `queues/` is intentionally ignored by Git. Do not stage, commit, move, or delete its contents unless the user explicitly asks.
- Keep reusable, versioned examples outside `queues/` (for example, `tasks.example.yaml` and `queues.plan.example.yaml`).

# Choose the execution format before creating files

Choose first: a bounded task in this session, a managed YAML queue, or a sequential queue plan.

## Execute one task in the current Codex session

Complete one bounded implementation slice here, with its tests, formatting and
verification. Do not split these into artificial tasks to reach the queue minimum.

## Use an Orchestrator task queue

Use `tasks.example.yaml` only for at least two independently useful tasks with:

- known outcomes, boundaries, order and dependencies;
- a complete impact map: production, tests, generated files, manifests,
  checksums, documentation and acceptance files;
- concrete `allowedPaths`, verification commands and stop guards for every writer;
- no scope discovery or later authorization still needed.

Before authoring, inspect implementation, tests and failure evidence. Put each
task's concrete behavior, complete write scope, checks and stop conditions in
its prompt, impact map, `allowedPaths` and guards. Investigate unknown scope here
first: "inspect and fix if necessary" is not a defined writer. A bounded read-only
diagnosis may stand alone, but cannot grant unknown scope or authority to a
pre-authored writing successor.

A separate test-only task needs an independently useful, previously uncovered
contract: specify inputs, expected behavior, coverage gap, exact test paths and
commands before authoring. Keep implementation correctness tests with their
implementation. Tests may call production code without production write scope.
An out-of-scope defect requires stopping with failing evidence, never scope
expansion or weakened expectations. Dependencies grant no inherited write scope;
whole-change review does not replace task-level checks.

Ordinary queue tasks share one project worktree and must be treated as
sequential even when their `allowedPaths` do not overlap. Set
`limits.maxParallelTasks: 1` unless every concurrently eligible task has an
isolated managed-workspace binding.

Recovery must retain all discovered runtime constraints: interpreter variables,
shell/quoting, temporary-directory isolation, timeouts and whole-change checks.
Never replace an authoritative failing check with a narrower one.

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

Prompts and checks must name each evidence file by exact normalized
repository-relative path. An ambiguous or non-root basename such as `state.yaml`
is invalid. Resolve paths while authoring and retain them in recovery constraints;
do not make executors guess or search broadly.

Declare and preflight mandatory non-system utilities such as `rg`. Otherwise
Windows prompts must permit PowerShell fallbacks: `Get-ChildItem` for bounded
discovery, `Get-Content` for exact files and `Select-String` for targeted reads.
Missing optional utilities are not failures when the fallback proves the evidence.

Distinguish task-scoped verification from final whole-change verification. A
final acceptance task must cover tracked and untracked files and must not claim
predecessor verification evidence unless an explicit bounded handoff supplies
those records.

Authoring prose grants no authority or machine enforcement. An apply task opts
in only through the exact `QueueAuthoringContractV1` envelope. `impactPaths` must
be a non-empty ordered map containing every normalized `allowedPaths` entry;
`runtimeConstraints` must be a non-empty list of explicit normalized strings.
The apply approval binds that ordered map and any exact ordered `externalReadRoots`.
Task authorization evidence and the persisted snapshot bind runtime constraints
and any recovery binding. Only `allowedPaths` grants writes; additional impact
paths are descriptive.

With `DocumentationGovernancePolicyV1`, writers intersecting `managedPaths` need
`QueueAuthoringContractV1`, a configured navigation/lifecycle file in both
`allowedPaths` and `impactPaths.documentation`, and every exact documentation
delta command as a machine gate. End with unique read-only
`WholeChangeAcceptanceV1` running the same gates. Repository commands must fail
on new prohibited findings such as `DOC-REACH-001`; prose/path inference cannot
enforce this.

An opted-in recovery uses exact source run/task IDs in `RecoveryTaskBindingV1`.
Before run or lock creation, load the persisted source and require a superset
of its authorization-bound runtime constraints. Missing, malformed, duplicated,
stale or changed evidence fails closed. Never infer paths, constraints, source
identity or recovery authority from prompts, `executionGuards`, docs or prose.
Records without the v1 envelope retain legacy behavior without synthesized fields.

Every `QueueAuthoringContractV1` task needs exact `TaskExecutionKindV1`:
`ordinary` forbids a recovery binding; `recovery` requires exactly one.
Recovery identity comes only from the selected canonical `run.json`: source
run/task must be unique, authorization-replayable, terminal and non-successful.
A failed recovery may source another only if execution-kind/binding,
authorization, runtime-superset and acyclic persisted-lineage checks all replay.
Never infer recovery chains from prose.

`WholeChangeAcceptanceV1` requires enabled read-only `review`, `allowedPaths: []`,
and ordered `predecessorTaskKeys` equal to direct dependencies, covering every
writer as a graph ancestor. It must be the final task and unique terminal sink.
Orchestrator supplies the independent reviewer a closed handoff: approved
statuses, task IDs, exact verification receipts and task-owned tracked/untracked
evidence. Never claim or reconstruct that evidence in prose.

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

Use `queues.plan.example.yaml` only to sequence multiple already-defined queues,
never to discover or expand scope. If uncertain: one bounded task stays here;
two or more understood tasks use a queue; multiple defined queues use a plan.

# Define acceptance evidence before execution

Before authoring grouping, filtering or aggregation work, resolve these cases
against the product contract. Record fixture inputs and expected outputs in the
prompt or exact referenced spec; executors must not invent semantics.

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

- Automated checks: exact commands, assertions and canonical task verification
  receipts. Passing tests do not prove an interactive browser flow.
- Git checkpoints: task-owned receipt and commit identity. Commits prove recorded
  changes, not correctness. Use `checkpointPolicy` when required for delivery.
- Browser checks: application/build, initial data, actions, expected visible
  result, actual observation and exact captured-artifact locator. Screenshots
  cannot prove unobserved behavior or all-page totals. Report unperformed checks
  as not run; automated checks and commits cannot replace required browser evidence.

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
