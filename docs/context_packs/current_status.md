# Current Status

Status: active compact context pack
Last updated: 2026-08-05

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
overflow. The combined server/Electron regression command exceeded the
six-minute review cap without emitting a failure diagnostic, so full-suite
completion remains an explicit runtime-environment risk rather than passing
evidence. The completion review itself authorized no Phase 8 implementation;
the separately accepted boundary is recorded below.

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
page-level overflow. The combined server/Electron regression command exceeded
369 seconds without emitting a failure diagnostic, so it remains an explicit
runtime-environment risk and is not recorded as passing evidence.

Phase 9 Outcome Scorecards Contract v1 is accepted and implementation has not
started. The contract authorizes a bounded read-only scorecard for one explicit
project cohort, using only exact canonical ledger evidence and immutable run-
record identities. Its closed v1 registry covers first-pass acceptance, review
cycles, dispatch-to-accepted duration, tokens per accepted task, override rate,
human escalation rate, and halt recurrence only when each denominator is
complete. Deployment outcomes, escaped defects, provider monetary cost,
business impact, and unversioned baselines remain explicitly unsupported.
The next safe boundary is Slice 1 service/schema/API/no-mutation work only;
dashboard, persistence, notifications, publication, background aggregation,
search, and external telemetry remain unauthorized.
