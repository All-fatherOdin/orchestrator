# Change Control Plane

Status: Phase 1-10 completion-reviewed
Last reviewed: 2026-08-07

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
11. [operator-actions-contract-v1.md](operator-actions-contract-v1.md) defines
    the accepted and implemented Phase 7 boundary.
12. [audit-bundles-contract-v1.md](audit-bundles-contract-v1.md) defines the
    accepted, implemented, and completion-reviewed Phase 8 boundary.
13. [outcome-scorecards-contract-v1.md](outcome-scorecards-contract-v1.md)
    defines the accepted, implemented, and completion-reviewed Phase 9
    read-only metrics boundary.
14. [operational-outcome-evidence-contract-v1.md](operational-outcome-evidence-contract-v1.md)
    defines the accepted Phase 10 boundary; Slices 1-2 are implemented and
    completion-reviewed.
15. [operational-evidence-intake-contract-v1.md](operational-evidence-intake-contract-v1.md)
    defines the accepted and reviewed Phase 11 manual-intake UI boundary;
    Slices 1-2 are implemented.

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
Phase 7 Slices 1 and 2 are implemented. The five closed operator actions reuse
existing authority gates and produce atomic, idempotent receipts. The dashboard
adds contextual incident controls only where projections prove a complete
target, requires fresh preview and direct confirmation, and never infers
missing authority evidence.
Phase 8 is implemented. Exactly two strict GET routes create bounded,
deterministic, privacy-safe audit bundles in memory from canonical Phase 1-7
evidence. Tests cover stable hashes, limits, legacy and restart replay, Phase 6
projection summaries, Phase 7 receipt lineage, safe errors, and no canonical
or filesystem mutation for both selectors. The dashboard consumes only Phase 6
selection evidence and Phase 8 GET responses, renders explicit bounded evidence
and failure states, and downloads returned JSON only on direct user action. No
publication or new authority is implied.

The Phase 8 completion review passed its focused acceptance boundary on
2026-08-05: 13 contract, replay, privacy, limit, HTTP, no-mutation, and dashboard
tests passed; TypeScript, the production Vite build, diff checks, and desktop/
mobile rendered smoke passed. A fresh full Windows server/Electron regression
on 2026-08-07 passed 252/252 with zero failures and zero skips in 402.24 seconds.
The earlier six-minute cap was shorter than the healthy suite runtime; full
regression runs should allow at least ten minutes.

Phase 9 Outcome Scorecards is implemented through Slice 2. Closed schemas, exact
ledger/run identity joins, a bounded seven-metric registry, deterministic
hashes, strict discovery and read-only compute APIs, privacy/limit fencing,
restart coverage, and explicit before/after no-mutation evidence are present.
The Russian read-only dashboard consumes only bounded Phase 6 selection evidence
and Phase 9 responses, renders explicit non-numeric insufficient/unsupported
states and technical identities, and downloads returned JSON only after direct
user action. The 16 focused Phase 9/API/UI tests, TypeScript, production Vite
build, and diff checks pass. Automated rendered checks in the in-app Chromium
browser verified desktop and 390 px mobile navigation, meaningful content, a
clean console, and no page-level horizontal overflow. Owner-provided Windows
desktop verification independently confirmed the installed application. The
formal completion review passed on 2026-08-06. Publication, persistence,
external telemetry, deployment/defect inference, and product-impact claims
remain deferred.

Phase 10 Operational Outcome Evidence is implemented through Slice 2 and
completion-reviewed.
Closed manually supplied operational evidence now uses the existing project
ledger, exact watermarks, deterministic preview, explicit confirmation,
immutable receipts, replay, privacy limits, and idempotency. Phase 9 now
calculates exact deployment, completed-window attributed-defect, and complete
single-currency provider-cost metrics while legacy evidence remains explicitly
unsupported. Focused tests, TypeScript, production build, rendered desktop QA,
diff checks, and the full 260/260 Windows regression pass.
Desktop and 390 px mobile rendered review opened the intended scorecard state
with a clean console and no page-level overflow.
Automatic external connectors, background capture, publication, deployment or
rollback execution, automatic defect attribution, business impact, and
currency conversion remain deferred.

Phase 11 Operational Evidence Intake Contract v1 is accepted and reviewed.
It authorizes only a local Russian dashboard over existing Phase 6 selection
and Phase 10 projection/mutation APIs. Slice 1 is a read-only intake shell;
Slice 2 adds explicit-confirmation source lifecycle plus preview-first import
and attribution workflows. Both slices are implemented with exact bounded
selection, closed local validation, stable request identities, explicit
preview/confirmation, receipt reconciliation, and no draft persistence. No
connector, background capture, new route, or new canonical authority is
authorized.
Five focused tests, TypeScript, production build, context smoke, diff checks,
the final 265/265 Windows regression, and real temporary-ledger Chromium QA at
1280/390 px pass. Preview, execute, receipt refresh, no-candidate attribution,
console health, draft clearing, and page overflow were exercised.

## Authority

This package is design guidance. Current code and tests remain product truth;
`.orchestrator/runs/*/run.json` remains run truth; GoalBuddy state remains goal
truth; and a selected file under `queues/` remains local queue input.
Project Map and these documents are secondary context, never runtime state.
