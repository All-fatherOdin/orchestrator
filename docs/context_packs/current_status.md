# Current Status

Status: active compact context pack
Last updated: 2026-08-07

Orchestrator is a local Codex queue runner with dependency-aware scheduling,
bounded write scopes, verification, review/correction, recovery, persisted run
records, context receipts, provider-state safeguards, runtime evals, isolated
managed-attempt worktrees, and serialized target merging.

The repository vendors the Agent Memory Kit Context Contract v1 schemas and
contains a production adapter for a target repository's
`scripts/ai_context_helper.py`. It also has an event-backed change-control
foundation with distinct change, wave, and task entities, deterministic
readiness, a derived execution bucket, and audited dispatch overrides.

Windows process hardening is merged: executor, reviewer, and correction prompts
use stdin, and retry runs retain authoritative task-owned path lineage so a
reviewer does not mistake prior task work for unrelated pre-existing changes.

Current goal:

Phase 1 is complete:

`docs/goals/change-control-foundation-execution-v1/state.yaml`

Phase 2 Planning and Drift is implemented and verified. It provides canonical
planning, authorization, replan, drift-assessment, and dispatch-gate events
with deterministic replay.

Phase 3 Workspace and Merge is implemented and verified. Exact Phase 2-bound
managed attempts execute in owned worktrees and local branches; all execution,
review/correction, verification, diff, and checkpoint paths use the owned
workspace. Sealed sources merge under a persisted cross-process target lease
after fresh revalidation, using only `merge --no-ff --no-commit`. Target drift
creates linked deterministic replan evidence. Canonical workspace/merge state,
hash-chained transitions, immutable receipts, startup recovery, and bounded
non-force cleanup fail closed on ambiguous evidence.

Phase 4 Halts and Incidents is implemented. The canonical ledger publishes one
classified halt and effective incident atomically across processes, derives
stable correlation identity, replays lifecycle state deterministically, and
supports mitigation, escalation, resolution, bounded reopen, and superseding
correlation correction. Warden binds exact evidence, budgets, recipe identity,
idempotency, and monotonic leases. Doctor persists start before effects,
executes only five fixed typed adapters, publishes fenced
`DoctorRepairReceiptV1` results, and replays pending work by re-observation.
Independent Warden or audited-human events authorize retry/resume; Doctor
success alone changes neither task/wave authority nor incident closure.

Phase 5 Prompt/Model/Eval Lineage is implemented. Published prompt artifacts,
model routes, attempt bindings, resolved executions, eval suites, fixed cohorts,
run observations, deterministic reports, import receipts, and champion
decisions replay from the same project ledger and fail closed at their declared
identity, comparability, sample, guardrail, and authority boundaries.

Current boundary:

- `.orchestrator/runs/*/run.json` remains canonical for runs.
- GoalBuddy `state.yaml` remains canonical for goals.
- `.orchestrator/change-control-v1/projects/*` is canonical for published
  change, wave, task, planning, drift, authorization, halt, and incident events.
- `queues/` remains canonical for the local launch queue selected by the user.
- this context pack and `docs/project_map/` are summaries/navigation only.

The evidence ledger, target architecture, roadmap, Planning and Drift Contract
v1, Workspace and Merge Contract v1, and Halts and Incidents Contract v1
remain under `docs/architecture/change-control-plane/`. Completed local
Phase 1-5 queues remain ignored execution history under `queues/`; they are
not the next operational step. Phase 6 now exposes deterministic, watermarked,
paginated read-only overview, execution-bucket, incident, prompt-registry, and
eval-lineage APIs with explicit partial-source and privacy semantics. The
dashboard consumes only those APIs and exposes loading, empty, unavailable,
unsupported, and pagination states without command controls.

Phase 7 Slice 1 Operator Actions is implemented. Exactly five actions have
deterministic no-mutation preview plus explicit-confirmation execution through
their existing Phase 2-4 handlers. The project writer publishes each owning
mutation and immutable `OperatorActionReceiptV1` atomically; exact retries,
conflicting idempotency reuse, concurrent stale contenders, and restart replay
fail closed. Slice 2 adds contextual incident transition and resolution
controls to the dashboard. They require fresh preview and direct confirmation,
render immutable receipts, refresh projections, and remain absent when the
projection cannot prove the complete action target.

The Phase 7 completion review passed on 2026-08-05: all 16 focused contract,
preview, execution, HTTP, idempotency, concurrency, replay, crash-boundary, and
dashboard-gating tests passed; TypeScript and the production Vite build passed;
desktop and mobile rendered QA found no relevant console errors or page-level
overflow. A fresh full Windows server/Electron regression on 2026-08-07 passed
252/252 with zero failures and zero skips in 402.24 seconds. The former
six-minute review cap was shorter than the healthy suite runtime; future full
runs need at least a ten-minute window. The completion review itself authorized
no Phase 8 implementation; the separately accepted boundary is recorded below.

Phase 8 Audit Bundles Contract v1 is implemented through Slice 2.
Exactly two strict GET routes produce bounded deterministic privacy-safe
in-memory responses for one project sequence range or one exact change. Closed
schemas, canonical hashes, exact optional watermark preconditions, fixed count
and byte limits, Phase 6 projection summaries, Phase 7 receipt lineage,
legacy/restart replay, stable private errors, and no-mutation evidence are
covered by focused tests. The dashboard selects existing projects/changes only
through Phase 6 evidence, consumes only Phase 8 GET responses, exposes bounded
watermark, sequence, completeness, warning, privacy, event, and receipt state,
and downloads the already-returned JSON only after a direct user action. Phase
8 still does not authorize persistent archives, notifications, external
publication, background capture, search
infrastructure, a database, new actions, or new authority types.

The Phase 8 completion review passed on 2026-08-05. All 13 focused schema,
selector, determinism, watermark, privacy, limit, replay, receipt-lineage,
HTTP, no-mutation, and dashboard tests passed. TypeScript, the production Vite
build with the read-only-safe config loader, and diff checks passed. Desktop and
390 px mobile rendered smoke verified `Control plane -> Audit bundles`, the
explicit no-source state, keyboard-semantic controls, a clean console, and no
page-level overflow. The fresh 2026-08-07 full Windows regression supersedes
the earlier capped run: `npm test` passed 252/252 in 402.24 seconds.

Phase 9 Outcome Scorecards is implemented through Slice 2. Exactly one strict discovery
GET and one closed-manifest compute POST provide bounded deterministic
privacy-safe scorecards for one explicit project cohort. Compute remains a
request-scoped in-memory read-only calculation delegated to the domain service;
it reads existing canonical project evidence and exact `run.json` bytes without
recovery, persistence, or external calls. Exact project watermarks and immutable
run-record hashes/byte lengths fence every included run. Missing and unlinked
runs remain explicit exclusions; changed or conflicting identities fail closed.

The closed registry covers first-pass acceptance, review cycles,
dispatch-to-accepted duration, tokens per accepted task, override rate, human
escalation rate, and halt recurrence with reconstructible evidence,
denominators, coverage, and exclusions. Zero denominators are
`insufficient-evidence`; deployment outcomes, escaped defects, provider
monetary cost, business impact, and unversioned baselines remain explicitly
unsupported. Slice 2 adds consistent Russian Control Plane navigation and a
Russian read-only scorecard view that consumes only bounded Phase 6 selection
evidence and Phase 9 responses, renders explicit evidence and failure states,
keeps unsupported and zero-denominator results non-numeric, and downloads the
already-returned JSON only after direct user action. All 16 focused Phase
9/API/UI tests, TypeScript, production Vite build, and diff checks pass.
Automated rendered checks in the in-app Chromium browser verified the Russian
Control Plane at desktop and 390 px mobile widths with meaningful content, a
clean console, and no page-level horizontal overflow. Owner-provided Windows
desktop verification independently confirmed the installed application. The
formal completion review passed on 2026-08-06. Persistence, publication,
background aggregation, search,
external telemetry, operator actions, and new authority remain unauthorized.

Phase 10 Operational Outcome Evidence is implemented through Slice 2 for
exactly three caller-supplied evidence families: deployment outcomes,
post-delivery defects, and measured provider monetary cost. Five closed event
types publish validated sources, observations, attribution decisions, and
adjacent immutable receipts through the existing project ledger. Preview is
deterministic and no-mutation; execution requires fresh explicit confirmation;
privacy/count/byte limits, replay, exact idempotency, source lifecycle,
concurrency fencing, attribution supersession, and exact resolved-provider
invocation joins fail closed. The six focused tests, TypeScript, production
build, and diff checks pass. Slice 2 consumes effective in-range evidence in
Phase 9: exact production deployment cohorts, confirmed defects only after
completed 7/30/90-day windows, and complete exact provider-invocation costs in
one currency. Legacy ledgers keep all eight operational outcomes explicitly
unsupported; business/customer impact, productivity savings, bug-free claims,
and manual baselines remain unsupported. Rendered desktop QA had no console
errors, and the full Windows regression passed 260/260 in 433.18 seconds.
External connectors, polling, background
capture, publication, deployment/rollback execution, currency conversion, and
business-impact claims remain unauthorized.
