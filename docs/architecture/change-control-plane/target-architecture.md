# Target Architecture

## Canonical State

For the first milestone, canonical change-control state is a per-project,
append-only logical event stream stored atomically under Orchestrator's own
data directory. It is not stored in the target repository. Each event carries:

- immutable event ID and monotonic project sequence;
- event type and occurrence time;
- project and change IDs;
- actor identity;
- causation and correlation IDs;
- typed payload;
- previous-event hash and event hash.

Current state is a deterministic projection rebuilt from those events. API
writes validate a transition, append one event atomically, then return the
recomputed projection. UI, metrics, search, and the Execution Bucket are
replaceable projections.

This is an Orchestrator design decision, not an observation about Nikolay's
storage.

## Entity Model

- **Project**: repository/control boundary.
- **Change**: user intent and lifecycle envelope.
- **Wave**: planned, dependency-aware package of tasks for a change.
- **Task**: one bounded unit with acceptance criteria and a declared write set.
- **Attempt**: one concrete execution using a workspace, prompt, model, and
  authorization identity.
- **Incident**: durable record of a detected failure or policy violation.
- **Prompt version**: immutable prompt artifact and lineage metadata.
- **Eval run**: measured outcome for a versioned suite and cohort.

Every entity uses immutable IDs. Display names are never join keys.

## Initial State Transitions

The first implementation deliberately supports only:

- change: `draft -> planned -> active -> completed | cancelled`;
- wave: `draft -> ready -> dispatched -> running -> completed | halted`;
- task: `pending -> ready -> running -> accepted | failed | halted`;
- incident: deferred until its taxonomy and closure semantics are approved.

Unknown states or transitions fail closed. Terminal states cannot transition
without a future explicit recovery event. Retrying creates a new attempt,
never rewrites the old one.

## Wave, Queue, and Run

- A wave is canonical planned structure: tasks, dependencies, and status.
- The Execution Bucket is a derived ordered view of dispatchable waves.
- A run/attempt is concrete execution, not a synonym for task or wave.

Readiness requires all dependencies to be terminal-success. Missing
dependencies and cycles invalidate the plan. A human override requires actor
and reason, emits an immutable event, and never silently changes dependencies.

## Planner and Architect Contract

The planner proposes structured acceptance claims. Each claim contains the
observable outcome, oracle type, exact command or human observation, evidence
expected, and failure severity.

Blast radius is evidence, not a free-form score: declared write set,
dependency/ownership graph, public API changes, schema/migration effects,
external side effects, and impacted tests. Non-trivial or ambiguous proposals
go to the architect, who may refine decomposition, dependencies, risk, and
replan triggers.

The architect proposes; policy gates and humans authorize. Humans retain
authority over destructive Git actions, external side effects, publication,
secrets/permissions, dependency overrides, and acceptance where no executable
oracle exists.

## Isolation, Merge, and Drift

These are target requirements, not part of the foundation queue:

- an attempt records plan-base SHA, workspace identity, branch/worktree
  identity if used, prompt/model identity, and authorization;
- dispatch rechecks base, paths, dependencies, and acceptance oracles;
- material drift marks the plan stale and requires deterministic refresh or
  architect replan;
- merge occurs through a serialized queue and reruns required verification on
  the current target plus preceding accepted changes.

Worktree and branch policy remains undecided until a dedicated slice measures
Windows cleanup, symlink, lock, and recovery behavior.

## Halts and Healing

Target classes are:

- deterministic reversible cleanup;
- retryable provider/infrastructure failure;
- plan or base drift requiring replan;
- scope/policy violation;
- human decision required;
- destructive or external-side-effect risk.

Only deterministic, bounded, idempotent repairs with before/after evidence and
a receipt may auto-heal. Unknown classes, low attribution confidence, and
destructive possibilities fail closed.
