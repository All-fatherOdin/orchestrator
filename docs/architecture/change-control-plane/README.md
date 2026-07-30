# Change Control Plane

Status: evidence-backed target, foundation queue ready
Last reviewed: 2026-07-29

This package turns the Telegram evidence about Nikolay's system into an
Orchestrator design without pretending that unknown implementation details
were observed.

## Reading Order

1. [evidence-ledger.md](evidence-ledger.md) separates observed behavior from
   inference and open questions.
2. [target-architecture.md](target-architecture.md) defines the proposed
   control-plane entities, authority boundaries, and transitions.
3. [decisions.md](decisions.md) records the choices made for Orchestrator.
4. [metrics-and-evals.md](metrics-and-evals.md) defines how quality claims will
   be measured.
5. [implementation-roadmap.md](implementation-roadmap.md) sequences the work.
6. [planning-drift-contract-v1.md](planning-drift-contract-v1.md) defines the
   proposed Phase 2 contract and fail-closed dispatch semantics.

## Current Boundary

The first launch queue is local and intentionally ignored by Git:

`queues/change-control-foundation-v1.yaml`

It contains two sequential, independently useful vertical tasks:

1. an atomic event-backed change ledger and API;
2. wave/dependency dispatch gates built on that ledger.

It does not authorize agent execution, Git mutation, worktree management,
merge automation, auto-healing, or UI work. Later queues are deferred until
the event spine has implementation evidence.

The Phase 1 implementation evidence is now available. Phase 2 has an accepted
contract. Its local implementation queue is
`queues/planning-drift-v1.yaml`.

## Authority

This package is design guidance. Current code and tests remain product truth;
`.orchestrator/runs/*/run.json` remains run truth; GoalBuddy state remains goal
truth; and a selected file under `queues/` remains local queue input.
Project Map and these documents are secondary context, never runtime state.
