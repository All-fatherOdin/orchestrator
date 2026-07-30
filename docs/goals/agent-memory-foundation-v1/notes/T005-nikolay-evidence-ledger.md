# T005: Nikolay System Evidence Ledger

Task: `T005`
Kind: `scout`
Status: `current`
Harness: `codex PM fallback after GoalBuddy Scout timeout`

## Evidence Classes

- `OBSERVED_MESSAGE`: direct statement by Nikolay in the Telegram export.
- `OBSERVED_SCREENSHOT`: text or UI state directly visible in an attached
  full-resolution screenshot.
- `COMMENT`: another participant's question or interpretation.
- `CURRENT_IMPLEMENTATION`: behavior verified in the Orchestrator repository.
- `PUBLIC_PATTERN`: primary public documentation describing a reusable pattern,
  not Nikolay's implementation.
- `INFERENCE`: the smallest architecture interpretation that explains the
  observations.
- `UNKNOWN`: not established by available evidence.
- `DECISION_REQUIRED`: must be chosen for Orchestrator rather than guessed.

## Primary Telegram Thread

Source:

`C:\Users\Alexander Lozovoy\Downloads\Telegram Desktop\ChatExport_2026-07-29\messages9.html`

Key Nikolay messages on 29 July 2026:

| Message | Evidence |
|---|---|
| 9898 | A `git reset` can lose `.work` state. |
| 9908–9915 | Two repositories connected through a symlink; races handled through a queue and lock files; a merge queue is preferred because an agent may resolve a merge conflict incorrectly. |
| 9918–9921 | 79 tasks were in work for an estimated 12 hours; planning and execution may be separated by more than 100 commits; one case involved three days of planning before provider limits reset. |
| 9924–9929 | Monitoring is performed by a large cross-project personal system with 200+ MCP tools, hooks, gates, and checks; it can sleep when limits are exhausted and wake when restored; it is installed into a project and then leads/develops it. |
| 9940 | Practical concurrent project count is 2–4. |
| 9944 | Several planning sessions totalled about six hours before execution. |
| 9947–9949 | Incidents are historical data for all pipeline errors over eight months; they are discussed with the architect/planner and otherwise remain visible in the UI. |
| 9954–9955 | Project tests are written and run; a browser agent exercises flows and creates manual click/look tasks; the pipeline itself has more than 2,000 tests. |
| 9957–9963 | Natural language is sufficient input. The system clarifies requirements, checks complexity and blast radius, invokes an architect for non-trivial changes, assigns dependencies, a work directory and allowed files, then checks sandbox/file spill and escalates doubts. Hooks prohibit dangerous Git operations. Executor input and output should both be clean trees, with valid content and commit name. Further validation steps exist. |
| 9964–9969 | The system is described as complex but economical; provider limits can be consumed quickly at full throttle, but normal mode consumes slower than limits restore; one command switches Claude/Qwen/OpenRouter, CLI, model, and role routing; development has taken almost a year. |
| 9973–9979 | It is a personal system without meaningful DAU/MAU; one small third-person 3D game was produced; the main project was still in development; two projects were for personal use. |
| 9981–9987 | Main purpose is not greenfield generation but safe iterative change in 100–200K-line projects without architecture/task drift. |
| 9992–9995 | Large waves exist; dependency assignment and ordering waves is difficult; dispatch is blocked when a dependency is not ready. |
| 10006–10008 | The system keeps project documentation current, answers project questions, and derives tasks from roadmap gaps. |
| 10017–10018 | Agent prompt versioning exists; planned work will compare agent quality across prompt/model versions; the left-hand list in the screenshot is pipeline agents. |
| 10022 | Pipeline outcome is software of controlled quality. |
| 10025–10030 | The system is personal. Claimed main effects are token savings and tasks completed first time without new bugs. Sonnet codes; provider subscriptions/routes are switched as needed. |

Relevant participant comments:

- 9909/9912/9916 challenge whether merge conflicts or explicit dependencies
  should replace a merge queue.
- 9932/9953 ask for open source and offer contributions.
- 9938 asks how generated work is tested.
- 9945 asks what incidents mean and why there are many.
- 9956/9958 ask about input detail, acceptance criteria, and requirements
  clarification.
- 9980 argues that load on produced systems is a better quality signal than
  code generation alone.
- 9990 identifies requirements definition as the hardest part.
- 10021/10023 ask what the pipeline output is and for whom it is produced.
- 10024 asks whether feature delivery or business results measurably improved.
  Nikolay's replies establish personal use and token/first-pass claims, but no
  baseline or numerical business outcome.

## Screenshot Ledger

All screenshots were inspected at full resolution.

### `photo_625@29-07-2026_13-08-58.jpg`

Class: `OBSERVED_SCREENSHOT`

- Execution Bucket reports 79 items.
- Multiple project-scoped wave identifiers are visible.
- Progress is represented as completed/remaining subtask cells.
- The screenshot supports task volume and wave grouping, not the persistence
  format or state machine.

### `photo_627@29-07-2026_13-17-49.jpg`

Class: `OBSERVED_SCREENSHOT`

- Cross-project system panel with system uptime and running agents.
- Running agents carry project, role/model, and elapsed time.
- Pipeline state, heartbeat, build, backend, terminal service, discovery, and
  incident counters are separately displayed.
- `INCIDENTS [1117 open]` is visible, with a partial-data warning.
- Warden has scheduled tick/audit controls.
- Doctor exposes `AUTO-HEAL [ON]`, heal queue, `PUMP TO HEAL`, and
  `RESOLVE-RETRY`.
- Three halts are shown with class snippets, project/task identity, severity
  (`MEDI`/`LOW`), and resolution action.
- Command log shows controlled cleanup commands such as `git restore` and
  `git clean -fd`.
- Execution Bucket and Waves are separate UI regions.

This proves the existence of operational concepts and controls. It does not
prove which state is canonical or which auto-heal actions are safe.

### `photo_628@29-07-2026_13-24-29.jpg`

Class: `OBSERVED_SCREENSHOT`

Wave `CFA.398` is `READY TO DISPATCH` and contains six typed subtasks.
Visible subtask statuses include `DONE`, `RUNNING`, and `READY`.

The visible specs establish:

- planning placeholder before dispatch;
- pre-dispatch halt-ticket guard;
- advisory `Low` halt class should not block;
- unrecognized or missing class fails closed;
- halt refusal must re-enqueue rather than destroy the drained bucket entry;
- halt attribution can map files→task using dirty paths against declared
  `write_set`, and task→files using declared `write_set` plus actual diff;
- attribution confidence is three-valued: exact/partial/none, never nearest
  guess;
- four attribution-relevant classes are visible:
  `code-present-no-sidecar`, `tree-integrity-violation`,
  `dirty-working-tree`, and `tree-dirty-pre-dispatch`;
- bucket-divergence diagnosis is a distinct repair concern.

This is the strongest evidence that a wave is a planned change package with
subtasks/specs and that the execution bucket is a later dispatch queue.

### `photo_629@29-07-2026_13-25-21.jpg`

Class: `OBSERVED_SCREENSHOT`

- Project registry lists multiple project IDs/names.
- Some projects are marked active and starred.
- Wave/bucket state remains visible behind the registry.
- This supports cross-project operation but not repository isolation mechanics.

### `photo_630@29-07-2026_14-09-29.jpg`

Class: `OBSERVED_SCREENSHOT`

- Completed waves contain between 2 and 17 visible subtasks.
- A wave is therefore not equivalent to one task attempt.

### `photo_631@29-07-2026_14-14-43.jpg`

Class: `OBSERVED_SCREENSHOT`

- Dispatching `CFU.087` opens a dependency gate.
- One dependency is `READY`; another is `NOT READY / PENDING`.
- Normal `SEND TO BUCKET` is disabled.
- Human override exists: `OVERRIDE — SEND ANYWAY`.

This proves explicit dependency gating plus a human override surface. It does
not show override authorization, audit, or downstream consequences.

### `photo_632@29-07-2026_14-26-26.jpg`

Class: `OBSERVED_SCREENSHOT`

- Prompt registry lists pipeline roles such as chat planner, executors,
  cost-auditor, eval-runner, pipeline-architect, pipeline-operator, and
  pipeline-warden.
- Prompts are layered (`L1`, `L2`, `L4`) and carry version numbers and effort
  tiers.
- A version chain shows commit hash, timestamp, `CHAMPION` versus
  `SUPERSEDED`, change summary, and diff against parent.
- Both displayed versions say `eval: not measured`.
- The prompt body requires factual citations and role boundaries.
- The diff adds a hard rule that commands needed for acceptance criteria must
  run in the foreground.

This proves prompt versioning and role/layer metadata. It also directly proves
that quality comparison was not yet measured for the displayed versions.

## Answers to the Ten Architecture Questions

### 1. Where and in what format is canonical state stored?

Nikolay system: `UNKNOWN`.

Evidence shows `config.toml`, code paths such as `autorun.rs` and
`ticket/schema.rs`, spec paths, tickets, execution bucket, waves, incidents,
prompt commits, and a UI. It does not identify a database, event log, file
format, or single canonical store.

Orchestrator decision required:

- one canonical durable run/control record;
- append-only events or transition receipts for audit;
- projections for UI, metrics, and search;
- Project Map remains secondary and may not become runtime truth.

### 2. What are task/wave/incident state transitions?

Partially observed:

- subtask: planning/implementation role plus
  `PENDING`, `READY`, `RUNNING`, `DONE`;
- wave: planning placeholder → ready to dispatch → dependency gate →
  execution bucket → progressive completion;
- halt: detected → class/severity/attribution → block/advisory →
  resolve-retry or heal;
- incident: pipeline error history/open UI item → architect/planner review,
  but closure states are not shown.

Full transition tables, idempotency rules, retry counters, terminal precedence,
and incident closure/reopen semantics are `UNKNOWN`.

### 3. How does the planner create acceptance criteria and blast radius?

Observed process:

natural-language request → clarification → complexity/blast-radius check →
architect for non-trivial changes → dependencies → work directory/allowed
files → executor → sandbox/diff/clean-tree validation → escalation on doubt.

The exact acceptance-criteria generation algorithm, evidence sources,
confidence model, and blast-radius calculation are `UNKNOWN`.

For Orchestrator, acceptance criteria should be structured claims with an
oracle, exact verification command or human observation, evidence type, and
failure severity. Blast radius should derive from declared write set,
dependency graph, ownership/boundary rules, migrations, external side effects,
and test impact—not an unconstrained LLM score.

### 4. What is a wave, and how does it differ from queue/run?

Strong inference from screenshots:

- `wave`: one planned change package containing ordered typed subtasks/specs
  and internal dependencies;
- `execution bucket`: dispatch queue of waves ready or selected for execution;
- `run/attempt`: one concrete agent execution of a subtask under a workspace,
  model, prompt, and authorization identity.

This distinction should become explicit schema in Orchestrator.

### 5. Are separate worktrees/branches used?

`UNKNOWN`.

Messages establish two repositories connected by a symlink, lock files, a work
directory, a clean-tree contract, and Git cleanup. They do not establish
`git worktree`, per-task branches, or branch lifecycle.

Public pattern: Git officially supports multiple linked worktrees with
different `HEAD` and index state, allowing multiple branches to be checked out
at once:

https://git-scm.com/docs/git-worktree

This is a design option, not evidence of Nikolay's implementation.

### 6. How are merge and replanning handled after 100+ commits?

Observed:

- a merge queue is preferred to agent conflict resolution;
- dependencies and wave order are set;
- planning may be far behind execution.

Exact rebase/update strategy, stale-plan invalidation, acceptance re-derivation,
and task split/replan logic are `UNKNOWN`.

Public pattern: GitHub's merge queue retests a change against the latest target
branch plus preceding queued changes:

https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue

Orchestrator should use an explicit plan-base SHA and invalidate or replan when
the current merge base, touched files, dependency outputs, or acceptance
oracles materially differ.

### 7. What halt classes exist and which heal automatically?

Observed classes/signals:

- `code-present-no-sidecar`
- `tree-integrity-violation`
- `dirty-working-tree`
- `tree-dirty-pre-dispatch`
- bucket divergence
- excessive retries and lint violation are mentioned as unchanged behavior
- advisory `Low` severity can be non-blocking
- unknown/missing class fails closed

Doctor/auto-heal and resolve-retry exist. The complete taxonomy and exact
auto-heal allowlist are `UNKNOWN`.

Orchestrator should separate:

- deterministic reversible cleanup;
- retryable infrastructure/provider failure;
- replan-required drift;
- policy/scope violation;
- human-decision requirement;
- destructive or external-side-effect risk.

Only deterministic, bounded, receipt-producing repairs should auto-heal.

### 8. How are incident, prompt version, model, task, and eval linked?

Partially observed:

- prompt role/layer/version/commit/timestamp/parent/champion state;
- agent role/model in running-agent UI;
- task/wave IDs;
- incident history;
- eval-runner role and planned prompt/model comparison.

No screenshot or message proves a single join key across them. Displayed prompt
versions explicitly say eval was not measured.

Public pattern: OpenTelemetry semantic conventions provide common attributes
such as agent ID/name/version, conversation ID, model and token usage, and
traces provide correlation across operations:

https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/

Orchestrator should define immutable IDs for project, change, wave, task,
attempt, incident, prompt artifact/version, model route, eval suite/run, and
commit; every event should carry the smallest applicable foreign keys plus a
trace ID. Do not depend on display names.

### 9. What does the architect do, and what remains human?

Architect/planner observed responsibilities:

- clarify and decompose non-trivial changes;
- assess complexity and blast radius;
- assign dependencies, workspace, and allowed files;
- discuss incidents and errors;
- maintain/answer from project documentation.

Human responsibilities observed:

- initial natural-language intent;
- UI monitoring;
- manual browser scenarios created by the agent;
- escalation decisions;
- dependency override (`SEND ANYWAY`);
- provider/resource decisions;
- acceptance of controlled-quality software and business/product judgment.

The authority boundary is not fully specified. Orchestrator must make
irreversible/external/destructive/publication decisions human-owned and keep
architect output as a proposal until gates accept it.

### 10. What metrics prove first-pass, bug-free execution?

They are not proven by the available evidence.

Observed supporting signals:

- 2,000+ pipeline tests;
- project tests and browser checks;
- incident history;
- claimed token savings and first-pass completion.

Missing:

- denominator and time window;
- baseline/manual or previous-system comparison;
- definition of first pass;
- escaped-defect observation window;
- severity weighting;
- rollback/hotfix/reopen/rework counts;
- project mix and complexity normalization.

Public baseline: DORA currently separates throughput from instability using
change lead time, deployment frequency, failed deployment recovery time,
change fail rate, and deployment rework rate:

https://dora.dev/guides/dora-metrics/

Minimum Orchestrator measurement set:

- first-pass acceptance rate;
- median correction/review cycles per accepted task;
- escaped defects by severity and observation window;
- change fail, rollback, hotfix, and deployment rework rates;
- halt/incident recurrence after auto-heal;
- plan-to-dispatch and dispatch-to-accepted lead time;
- tokens/cost per accepted change, not per attempt;
- architecture/scope drift violations;
- manual escalation and override rate;
- eval score by prompt version/model/task cohort with confidence intervals.

## Current Orchestrator Capability Map

### Already present

- canonical atomic run JSON and recovery semantics;
- queue, dependency graph, path/resource conflict scheduling;
- exact allowed paths and verification commands;
- authorization and approval identity;
- clean-tree/checkpoint safeguards;
- Context Contract requests, bundles, receipts, safe fallback, and helper
  integration;
- prompt compiler/cache layout;
- provider model routing and persisted-reasoning safeguards;
- task/run token and outcome metrics;
- deterministic runtime eval identity for prompt/model/reasoning/state/cache/PTC;
- secondary Project Map foundation added by T003.

### Missing for the target system

- first-class change and wave entities;
- append-only event/transition spine with projections;
- plan-base SHA and drift/replan protocol;
- isolated workspace/branch lifecycle;
- merge queue with revalidation;
- halt taxonomy, attribution, and deterministic heal policy;
- incident entity and lineage;
- prompt artifact registry joined to attempts and evals;
- architecture decision/blast-radius records;
- quality baselines and first-pass/escaped-defect metrics;
- cross-project operator UI.

## Candidate Durable Documentation Package

Recommended versioned package:

```text
docs/architecture/change-control-plane/
  README.md
  evidence-ledger.md
  glossary-and-entities.md
  canonical-state-and-events.md
  planning-and-acceptance.md
  waves-dispatch-and-isolation.md
  merge-replan-and-drift.md
  halts-incidents-and-healing.md
  prompt-model-eval-lineage.md
  human-authority-and-overrides.md
  metrics-and-evaluation.md
  phased-roadmap.md
```

The package should label each statement `observed`, `current`,
`decision`, `inference`, or `unknown`.

## Candidate Queue Topology

Do not create one giant queue. Recommended staged queue files:

1. Canonical change/wave/task/event identity and transition projection.
2. Planner contract: acceptance claims, blast radius, plan-base SHA, and
   drift/replan decision.
3. Workspace isolation and merge queue with fresh-base revalidation.
4. Halt/incident taxonomy, attribution, Warden/Doctor deterministic recovery.
5. Prompt/model/task/incident/eval lineage and quality metrics.
6. Cross-project operator projections/UI only after the control-plane contracts
   are proven.

Queues 2–5 depend on queue 1. Queue 3 depends on planner drift identity from
queue 2. Queue 4 may proceed after the event spine and task/workspace receipts
exist. Queue 5 depends on stable attempt and incident identities. UI is last.

Judge must decide whether to create one sequential plan over these queue files
or keep later queues unplanned until earlier schema decisions are verified.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  note: notes/T005-nikolay-evidence-ledger.md
  summary: "Seven screenshots and the surrounding Telegram thread establish waves, bucket dispatch, dependency gates, halt attribution, Doctor/Warden controls, prompt version chains, and a change-tool workflow; canonical storage, full state machines, isolation, merge/replan, auto-heal allowlist, end-to-end lineage, and quality proof remain unknown."
```
