# Change Control Plane

Status: evidence-backed target, Phase 1-6 implemented
Last reviewed: 2026-08-02

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
   implemented Phase 2 contract and fail-closed dispatch semantics.
7. [workspace-merge-contract-v1.md](workspace-merge-contract-v1.md) defines
   the implemented Phase 3 isolation, merge, and recovery boundary.
8. [halts-incidents-contract-v1.md](halts-incidents-contract-v1.md) defines
   the accepted Phase 4 halt, incident, Warden, and Doctor boundary.
9. [prompt-model-eval-lineage-contract-v1.md](prompt-model-eval-lineage-contract-v1.md)
   defines the implemented Phase 5 prompt, model, and eval lineage boundary.
10. [operator-projections-contract-v1.md](operator-projections-contract-v1.md)
    defines the accepted Phase 6 read-only projection and dashboard boundary.

## Current Boundary

The first launch queue is local and intentionally ignored by Git:

`queues/change-control-foundation-v1.yaml`

It contains two sequential, independently useful vertical tasks:

1. an atomic event-backed change ledger and API;
2. wave/dependency dispatch gates built on that ledger.

It does not authorize agent execution, Git mutation, worktree management,
merge automation, auto-healing, or UI work. Later queues are deferred until
the event spine has implementation evidence.

Phase 1-6 implementation evidence is available. The completed local queues
remain ignored execution history. Phase 6 includes the projection API and its
read-only five-view dashboard; neither surface adds mutation authority.

## Authority

This package is design guidance. Current code and tests remain product truth;
`.orchestrator/runs/*/run.json` remains run truth; GoalBuddy state remains goal
truth; and a selected file under `queues/` remains local queue input.
Project Map and these documents are secondary context, never runtime state.
