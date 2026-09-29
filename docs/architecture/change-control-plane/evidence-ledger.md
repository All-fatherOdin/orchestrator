# Evidence Ledger

The detailed source trace is preserved in
`docs/goals/agent-memory-foundation-v1/notes/T005-nikolay-evidence-ledger.md`.
The post-29-July source review is preserved in
`docs/architecture/change-control-plane/nikolay-evidence-update-2026-08-18.md`.
This document is the durable architecture-facing summary.

The current supplement is
[the 2026-09-04 evidence update](nikolay-evidence-update-2026-09-04.md),
including earlier omissions, subsequent messages and inspected screenshots.

## Observed

- A wave contains multiple typed subtasks; screenshots show 2–17 subtasks and
  states including `PENDING`, `READY`, `RUNNING`, and `DONE`.
- Waves and the Execution Bucket are separate UI concepts.
- Dispatch is dependency-gated, with an explicit human “send anyway”
  override.
- Halt handling includes severity, task/file attribution, retry/heal controls,
  and fail-closed behavior for missing or unknown classes.
- File attribution compares dirty paths, declared `write_set`, and actual
  diffs, with exact/partial/none confidence.
- Prompt artifacts have role, layer, version, commit, parent diff, and
  champion/superseded metadata.
- The described workflow starts from natural language, clarifies intent,
  assesses complexity/blast radius, invokes an architect for non-trivial
  work, assigns dependencies/work area/allowed files, and validates scope,
  tree cleanliness, and output.
- Planning can precede execution by more than 100 commits; merge queues and
  project-level locking were discussed.
- Claims of token savings and first-pass delivery without new bugs were made,
  but no denominator, baseline, time window, or measured cohort was supplied.
- `GAPS` includes ideas, bugs, and unfinished work encountered by Nikolay or
  agents. Current data comes from an internal system; Nikolay says other
  sources can be connected, but no identity or reconciliation rules are shown.
- `CF` is a larger project/product name, while `CFA` is its core and `CFU` is
  one of its UI projects. The visible labels are abbreviated project names,
  not task-state categories.
- Migration noise can inflate `GAPS` and roadmap counts.
- A live recording shows `PIPELINE RUNNING` while heartbeat, terminal service,
  Warden, and auto-heal have separate non-running or disabled states.
- Nikolay reports a 6.0% hotfix share over several thousand tasks, about 100
  tasks per week for one active project, and about 120 million aggregate
  tokens per month. A later answer defines a task as one feature including
  tests/testing (CRUD example); metric cohorts and size distributions remain
  unspecified.
- Nikolay explicitly rejects test presence as sufficient quality evidence and
  calls for regression of affected subsystems in AI-built systems.

- Later messages describe a wave branch with task branches beneath it, detailed
  pre-execution specs, independent DoD checking and human participation in
  testing. Branch hierarchy is reported; worktree and merge mechanics are not.
- A shared CLI serves the agent and a separate UI; live project search and
  explicit knowledge ownership link projects. Per-agent tools and call metrics
  are reported, without a published complete capability contract.
- Evolutionary agents were explicitly not working on 31 August. The hoped-for
  first launch on 2 September does not establish successful operation.

## Inferred, Not Observed

- A wave is best modelled as a planned change package; a queue/bucket is a
  dispatch projection; a run/attempt is one concrete execution.
- Durable immutable identities and an event stream can connect changes,
  waves, tasks, attempts, incidents, prompt versions, models, commits, and
  evals without making UI projections canonical.
- Plan-base identity and explicit drift checks are needed to make old plans
  safe after repository movement.
- The product/project examples suggest that roadmap identity may need a
  product or program level above component projects. That hierarchy is an
  Orchestrator modelling decision, not an observed schema.

## Unknown

- Nikolay's canonical storage engine and serialization format.
- Complete task, wave, halt, and incident state machines.
- Whether and how separate worktrees implement the reported wave/task branches.
- Exact merge/rebase/replanning behavior after large commit drift.
- Complete halt taxonomy and the auto-heal allowlist.
- A proven join key across incident, prompt, model, task, and eval.
- Quantitative proof of first-pass, bug-free delivery.
- Meanings of the four `GAPS` counts/colors and every roadmap aggregate, row,
  cell, numerator, and denominator.
- Gap lifecycle, deduplication, migration reconciliation, and mutation
  authority.
- Exact identity grammar linking product, project, `CFA.494`, and
  `CFA.494.01`.
- Cohorts and size distributions behind feature-task throughput; definitions
  and cohorts for hotfix share, token volume and context-risk claims.
- Exact affected-subsystem regression selection and acceptance evidence.

## Orchestrator Decisions

Unknowns above are not copied as facts. The target architecture makes explicit
local decisions, begins with the smallest auditable event spine, and leaves
destructive or externally visible authority with a human.
