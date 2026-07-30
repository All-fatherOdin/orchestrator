# Evidence Ledger

The detailed source trace is preserved in
`docs/goals/agent-memory-foundation-v1/notes/T005-nikolay-evidence-ledger.md`.
This document is the durable architecture-facing summary.

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

## Inferred, Not Observed

- A wave is best modelled as a planned change package; a queue/bucket is a
  dispatch projection; a run/attempt is one concrete execution.
- Durable immutable identities and an event stream can connect changes,
  waves, tasks, attempts, incidents, prompt versions, models, commits, and
  evals without making UI projections canonical.
- Plan-base identity and explicit drift checks are needed to make old plans
  safe after repository movement.

## Unknown

- Nikolay's canonical storage engine and serialization format.
- Complete task, wave, halt, and incident state machines.
- Whether separate worktrees or per-task branches are used.
- Exact merge/rebase/replanning behavior after large commit drift.
- Complete halt taxonomy and the auto-heal allowlist.
- A proven join key across incident, prompt, model, task, and eval.
- Quantitative proof of first-pass, bug-free delivery.

## Orchestrator Decisions

Unknowns above are not copied as facts. The target architecture makes explicit
local decisions, begins with the smallest auditable event spine, and leaves
destructive or externally visible authority with a human.
