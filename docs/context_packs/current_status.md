# Current Status

Status: active compact context pack
Last updated: 2026-08-13

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

The AMK v5 read-only integration is completion-reviewed through Slice 6.
Server-discovered run and opaque queue identities support deterministic,
privacy-redacted projections in the Russian Control Plane without import,
execution, activation, approval, persistence, or Project Map mutation. Final
evidence passed 29/29 focused tests, 275/275 full Windows tests, TypeScript,
production build, context smoke 3/3, diff checks, and desktop/390 px rendered
interaction. A second AMK phase is neither defined nor authorized by that
completion review.

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

The original Phase 9 registry covers first-pass acceptance, review cycles,
dispatch-to-accepted duration, tokens per accepted task, override rate, human
escalation rate, and halt recurrence with reconstructible evidence,
denominators, coverage, and exclusions. Zero denominators are
`insufficient-evidence`. Phase 10 extends this registry with exact deployment,
completed-window attributed-defect, and complete single-currency provider-cost
metrics; without accepted Phase 10 evidence those outcomes remain explicitly
unsupported. Business impact and unversioned baselines remain unsupported.
Phase 9 Slice 2 adds consistent Russian Control Plane navigation and a
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
The formal Phase 10 completion review passed on 2026-08-07. In-app browser QA
opened the intended read-only scorecard state at 1280 px and 390 px with a
clean console, no framework overlay, and no page-level overflow. Phase 1-10
are completion-reviewed; a subsequent phase requires a separately accepted
contract boundary.
External connectors, polling, background
capture, publication, deployment/rollback execution, currency conversion, and
business-impact claims remain unauthorized.

Phase 11 Operational Evidence Intake is implemented through Slice 2. The local
Russian `Данные результатов` section uses exact bounded Phase 6 selection and
existing Phase 10 APIs only. Read-only projection groups and explicit safe
states are joined by local-review source lifecycle plus preview-first import
and defect attribution. Closed local parsing rejects non-UTF-8, prohibited,
wrong-kind, over-count, and oversized drafts. Stable request/idempotency
identities bind preview, execute, receipt reconciliation, and exact retry;
changing semantic input invalidates authority. No attribution decision is
preselected. Raw drafts and filenames do not persist or enter rendered
diagnostics. No connector, backend route, canonical event, background job,
automatic attribution, deployment/billing action, or scorecard authority is
added.
Verification passes: five focused Phase 11 tests, TypeScript, production
build, context smoke 3/3, diff checks, and the final 265/265 Windows regression.
In-app Chromium QA exercised exact selection, local source review, allowed
preview, explicit import, durable receipt visibility through projection
refresh, and guarded empty attribution at 1280/390 px against a temporary
ledger that was deleted afterward. There were no console warnings/errors,
framework overlay, page overflow, retained raw draft, or automatic decision.
The formal Phase 11 completion review passed on 2026-08-07. All 13 acceptance
clauses are evidenced with no unresolved or deferred finding, so Phase 1-11
are completion-reviewed. Phase 11 has no Slice 3; every subsequent phase needs
a separately reviewed and accepted contract.

Phase 12 GitHub Deployment Connector Contract v1 is accepted; Slices 1-2 are
implemented and completion-reviewed. It permits one manually triggered,
read-only GitHub REST adapter for one exact production deployment/status pair.
Only terminal `success`, `failure`, and `error` map to the existing Phase 10
deployment observation; all identity, watermark, preview, receipt, privacy,
and idempotency authority remains in Phase 6/10. Repository coordinates and
the API origin are fixed server configuration, the least-privilege token stays
server-only, preview performs exactly three bounded GETs, and execute refetches
the identical snapshot before delegating one Phase 10 mutation. Polling,
webhooks, enumeration, remote writes, new canonical events, other providers or
evidence families, and outcome inference remain unauthorized. Slice 2 adds one
bounded Russian workflow in the existing intake section with exact compatible
source selection, sanitized preview, explicit confirmation, immutable receipt,
receipt reconciliation, exact retry, and responsive desktop/390 px states.
The formal completion review passed on 2026-08-13 with all 13 acceptance areas
evidenced and no unresolved or deferred finding. The fresh gates passed Phase
12 focused tests 8/8, TypeScript, production build, context smoke 3/3, diff
checks, and the full Windows regression 313/313 in 571.18 seconds. In-app
Chromium at 1280 px and 390 px confirmed the Russian unavailable state,
working navigation, a clean console, and no page-level overflow. There is no
authorized Slice 3 or Phase 13; any next product phase requires a separately
owner-reviewed and accepted contract.

Slice 1 adds closed schemas/configuration, a secret-safe server adapter, exactly
three fixed bounded GitHub GETs, deterministic sanitized mapping, preview and
execute routes, exact refetch/content fencing, Phase 10 delegation, and
receipt-first ambiguous retry reconciliation. Five focused tests, combined
Phase 10/12 tests 11/11, TypeScript, production build, context smoke 3/3, diff
checks, and the 270/270 full Windows regression pass. All connector network
tests are mocked; no live GitHub token or external request was used.

Slice 2 adds three focused UI tests; the combined Phase 12 run passes 8/8.
TypeScript, production build, context smoke 3/3, diff checks, and the 273/273
full Windows regression pass with zero failures/skips in 391.6 seconds.
Desktop and 390 px rendered interaction pass with a clean console and a
receipt preserved after projection refresh. Browser QA used a local mocked
connector only; no live GitHub credential or external request was used.

Agentic Patterns Stage 1 S1 Incident-to-Eval is implemented and
completion-reviewed. One deterministic no-mutation preview and one
explicit-confirmation record operation bind an exact Phase 4 incident to a
sanitized Phase 5-compatible candidate, then append exactly one immutable
`incident.eval-candidate-recorded` event to the existing project ledger. Exact
invocation selection fences evidence to that invocation; ambiguous complete or
unresolved joins fail closed. Raw request bytes are capped at 16 KiB and exact
production routes return private JSON errors before SPA fallback. Candidate
recording does not publish or mutate an eval suite, transition an incident, or
grant runtime authority. Verification passes 23/23 focused tests, TypeScript,
production build, context smoke 3/3, diff checks, and the final 279/279 Windows
regression with zero failures/skips in 392.46 seconds.

Reviewer infrastructure no longer asks a filesystem-read-only reviewer to
rerun write-producing verification commands. It supplies the bounded exact
command/exit/timeout/output evidence already generated by Orchestrator, while
retaining the no-network and no-workspace-mutation sandbox. Read-only source
inspection falls back to PowerShell `Select-String`/`Get-Content` when `rg` is
unavailable.

The owner accepted S2 Context Budget Baseline v1 on 2026-08-13. The accepted
`context-budget-baseline-contract-v1.md` fixes a versioned
repository baseline, exact count/byte measurement, optional measured tokens
only through a pinned tokenizer, explicit estimated fallback, advisory token
growth, no silent context removal, and no API, ledger, telemetry, or automatic
runtime gate in v1. The bounded implementation adds closed schemas, a pure
measurement/comparison service, read-only CLI, versioned baseline, and focused
tests without changing the existing helper, Context Contract schemas,
`server/index.ts`, queues, or run records. The owner accepted baseline revision
1 and the separate completion review passed with no unresolved finding. Final
verification passes 10/10 focused S2 tests, TypeScript, production build,
context smoke 3/3, diff checks, and the full Windows regression 323/323. S2
adds no automatic runtime gate or context removal. S3-S6 remain unauthorized.

S3 Hard Execution Budgets contract v1 revision 1 is implemented and
completion-reviewed. The contract is
explicit opt-in, preserves legacy behavior and current model
routing, and hard-enforces only Orchestrator-owned provider-process/attempt
counts through conservative pre-spawn reservations. Local `codex-cli 0.146.0`
does not expose an accepted provider-enforced output-token limit, so token hard
enforcement is explicitly unsupported and any such declaration would fail
closed. Revision 1 preserves reservations during recovery of the same canonical
run while user-initiated resume/retry retain existing new-run semantics with a
fresh bounded budget and unchanged policy. Only the exact S3 impact map is
implemented. Focused verification passed 14/14, context smoke 3/3, S2 baseline
10/10, and the full Windows regression 337/337 in 365.82 seconds. The separate
completion review found no unresolved acceptance issue.

S4 Tool Capability Manifest and Chain Gate contract v1 is accepted,
implemented, and completion-reviewed. It
classifies only stable code-owned operation boundaries, rejects missing
metadata as unknown-high-risk, evaluates the capability union of an ordered
chain, keeps Doctor adapters and operator actions direct-only, recognizes only
the already accepted fixed Phase 12 GitHub read path, and marks opaque Codex
CLI internal tool calls unsupported. Verification passed 13/13 focused S4
tests, TypeScript, production build, context smoke 3/3, S2 baseline 10/10, diff
checks, and 347/347 full Windows tests in 385.47 seconds. The separate
completion review found no unresolved issue. S5-S6 remain unauthorized; an
owner-reviewed S5 contract is the next possible slice.
