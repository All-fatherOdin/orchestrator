# Orchestrator Next Steps

Status: active operational handoff
Last updated: 2026-08-13

## Current Priority

The repo-centric secondary-memory and event-backed change/wave foundations are
verified and merged into `main`. Phase 2 Planning and Drift is
implemented and verified, including immutable plan publication, authorization,
deterministic replan lineage, trusted Git-state assessment, and fail-closed
dispatch gating. Phase 3 Workspace and Merge is implemented and verified on
Windows: managed attempts use owned worktrees, serialized fresh-target merge,
deterministic replan on drift, canonical replay, bounded recovery, and
non-destructive cleanup.

Phase 4 is implemented: the halt/incident core, deterministic Warden policy,
monotonic repair leases, five closed typed Doctor adapters, immutable repair
receipts, crash/restart replay, and independently authorized task retry and
wave resume all fail closed against stale, ambiguous, conflicting, exhausted,
or unfenced evidence.

Phase 5 is implemented: immutable prompt/model configuration lineage, exact
attempt and invocation bindings, fixed eval suites and cohorts, complete run
matrices, deterministic reports, explicit unsupported import evidence, and
authority-gated champion decisions share the canonical hash chain.

## Current Safe Step

Stage 1 S1 Incident-to-Eval is implemented and completion-reviewed. Two
POST routes provide deterministic no-mutation preview and explicit-confirmation
recording of one immutable, privacy-bounded eval candidate in the existing
project ledger. Exact Phase 4/5 identity, invocation-local evidence fencing,
ambiguous join rejection, raw 16 KiB request enforcement, private production
HTTP failures, idempotency, concurrency, restart, corruption, and legacy replay
are covered. Recording neither publishes an eval suite nor changes incident or
runtime authority. Final verification passed 23/23 focused S1 tests, the
production HTTP regression, TypeScript, production build, context smoke 3/3,
diff checks, and the full Windows regression 279/279 with zero failures/skips.

The owner accepted S2 Context Budget Baseline v1 on 2026-08-13 with a
versioned baseline, exact count/byte envelopes, pinned-tokenizer measurement
only when available, explicit estimation otherwise, and advisory token growth.
The exact contract is
`docs/architecture/change-control-plane/context-budget-baseline-contract-v1.md`.
The bounded implementation provides closed baseline/report schemas, exact
source and stable-prefix measurement, deterministic identities and deltas,
hard count/byte and advisory token semantics, private fail-closed diagnostics,
a read-only CLI, and accepted versioned baseline revision 1. The separate
completion review passed with no unresolved finding. Final verification passes
10/10 focused S2 tests, TypeScript, production build, context smoke 3/3, diff
checks, and the full Windows regression 323/323. S2 adds no automatic runtime
gate or context removal.

S3 Hard Execution Budgets contract revision 1 is implemented and
completion-reviewed. Its contract and evidence are recorded at
`docs/architecture/change-control-plane/hard-execution-budgets-contract-v1.md`.
It provides explicit opt-in hard limits only for Orchestrator-owned provider
process/attempt counts, conservative pre-spawn reservations, unchanged legacy
queues and model routing, and fail-closed unsupported token enforcement for the
current Codex CLI. Revision 1 preserves reservations only for process recovery
of the same canonical run; user-initiated resume/retry retain their existing
new-run behavior and receive a fresh bounded budget with the exact policy under
all existing gates. Verification passed 14/14 focused tests, TypeScript,
production build, context smoke 3/3, the S2 baseline 10/10, diff checks, and
337/337 full Windows tests in 365.82 seconds. The separate completion review
found no unresolved issue.

The accepted S4 Tool Capability Manifest and Chain Gate contract is recorded at
`docs/architecture/change-control-plane/tool-capability-chain-gate-contract-v1.md`.
It implements a closed immutable manifest only for code-owned observable
operations, union-based chain evaluation, fail-closed unknown metadata,
`direct_only` Doctor/operator operations, the exact existing Phase 12 GitHub
read path as the sole initial accepted high-risk path, and `unsupported` for
opaque Codex CLI internal tools. Verification passed 13/13 focused S4 tests,
TypeScript, production build, context smoke 3/3, S2 baseline 10/10, diff checks,
and 347/347 full Windows tests in 385.47 seconds. The separate completion
review found no unresolved issue. The separately repaired Windows baseline is
green and S5 is now implemented and completion-reviewed. S6 is separately
accepted, implemented, and completion-reviewed.

The accepted S5 Mocked Workflow Evals contract is recorded at
`docs/architecture/change-control-plane/mocked-workflow-evals-contract-v1.md`.
It recommends one deterministic in-memory adapter over the existing Phase 5
lineage, with three immutable credential-free fixture families: the complete
mocked GitHub intake workflow, the local PTC chain, and an S4 pre-effect denial.
Only executable assertions may block; model grading is unsupported. The exact
accepted impact map is implemented with closed schemas, immutable fixtures,
thirteen deterministic oracles, typed GitHub/PTC seams, replay validation, and
a pure Phase 5 mapper. Focused tests pass 14/14, TypeScript and production
build pass, context smoke passes 3/3, the S2 baseline passes 10/10, and the
full Windows regression passes 348/348 in 403.3 seconds. It creates no
API/UI/queue field, canonical registry, live request, credential use, external
write, or automatic Phase 5 publication. The separate completion review found
no unresolved acceptance issue. S6 is separately accepted, implemented, and
completion-reviewed.

The accepted S6 Progressive Disclosure contract is recorded at
`docs/architecture/change-control-plane/progressive-disclosure-contract-v1.md`.
It defines a stateless read-only TypeScript-family AST index and exact
hash-bound excerpt boundary, plus line-range-only Python fallback. Existing
helper commands, Context Contract, queues, runtime context, S2 baseline,
source files, and Project Map remain unchanged. The exact accepted impact map
is implemented and separately completion-reviewed with no unresolved issue.
Focused S6 tests pass 11/11, TypeScript and production build pass, context
smoke passes 3/3, S2 baseline passes 10/10, diff checks pass, and the full
Windows regression passes 348/348 in 390.81 seconds.

Pattern 14 Contract v1 is implemented and completion-reviewed inside its exact
documentation-only impact map. The reusable checklist classifies six high-risk
classes, permits at most 10+5 questions over two rounds, and keeps owner
acceptance separate. It adds no runtime, schema, persistence, or automatic
authority. S2 passes 10/10, Stage 1 focused suites pass 85/85, and the full
regression passes 351/351.

Reviewer infrastructure gives the read-only reviewer bounded evidence from
Orchestrator verification; it does not rerun write-producing build/test
commands. The no-network and no-workspace-mutation boundary remains unchanged;
`Select-String`/`Get-Content` are the declared read-only fallback when `rg` is
unavailable.

The AMK v5 read-only integration is implemented and completion-reviewed through
Slice 6. Exact server-discovered run and opaque queue selectors produce only
bounded, privacy-redacted, navigation-only projections. The Russian Control
Plane view adds no import, queue write/launch, frontier activation, approval,
or persistence authority. The final gates passed: 29/29 focused tests, 275/275
full Windows regression, TypeScript, production build, context smoke 3/3, diff
checks, and desktop/390 px rendered interaction. Any AMK Phase 2 requires a
separate boundary and explicit authorization.

Treat Phase 6, Phase 7, and Phase 8 as implemented and completion-reviewed. The backend
provides deterministic
no-mutation preview, fresh explicit-confirmation execution, atomic immutable
receipts, exact idempotency, serialized conflict handling, and replay for the
five closed action kinds. The dashboard exposes contextual controls only when
the projection proves a complete target; it never invents missing plan,
authorization, terminal-event, or recovery evidence. The bounded Phase 8 Audit
Bundles contract is implemented through Slice 2. Slice 1 is verified with
strict deterministic in-memory GET APIs, privacy and size limits, legacy
replay, restart, and explicit no-mutation evidence. Slice 2 consumes only
bounded Phase 6 selection evidence and Phase 8 GET responses, renders explicit
evidence/error states, and permits only a direct user-initiated JSON download.
Every external publication capability remains deferred.

The Phase 8 completion review passed all 13 focused contract/service/API/UI
tests, TypeScript, the production Vite build, diff checks, and desktop/mobile
rendered smoke with a clean console and no page-level overflow. A fresh full
Windows server/Electron regression on 2026-08-07 passed 252/252 with zero
failures and zero skips in 402.24 seconds. Allow at least ten minutes for this
gate: the former six-minute review cap was shorter than the healthy suite
runtime and did not indicate a hang.

Phase 9 Outcome Scorecards is implemented through Slice 2. Closed schemas and a
request-scoped domain service provide exact ledger/run joins, the seven bounded
metrics, explicit denominators and unsupported outcomes, deterministic hashes,
privacy/limit enforcement, restart behavior, and no-mutation evidence. Exactly
one discovery GET and one read-only compute POST are exposed under
`/api/outcome-scorecards/v1`; compute is fenced by the exact project watermark
and immutable run-record identities and does not persist its cohort. Slice 2
adds the Russian read-only Control Plane view, explicit metric/evidence/failure
states, consistent Russian navigation, and direct user-initiated download of
the already-returned bounded JSON. The 16 focused Phase 9/API/UI tests,
TypeScript, production Vite build, and diff checks pass. Owner-provided manual
Windows desktop rendered verification confirmed that the tab opened without
errors, clipping, or horizontal overflow; this is not automated browser QA.
The formal completion review passed on 2026-08-06. Automated rendered checks
in the in-app Chromium browser verified desktop and 390 px mobile navigation,
meaningful Russian content, a clean console, and no page-level horizontal
overflow. Do not treat this review as publication, telemetry, persistence, or
new action authority.

Phase 10 Operational Outcome Evidence is implemented through Slice 2.
Closed source/observation schemas, deterministic no-mutation preview, fresh
explicit-confirmation import and attribution, adjacent immutable receipts in
one atomic ledger write, replay, privacy/limit checks, exact idempotency,
concurrency fencing, source lifecycle, and bounded HTTP reads are present. Six
focused Slice 1 tests pass. Slice 2 extends only the Phase 9 scorecard schema,
calculation, tests, and read-only rendering: exact production deployment
cohorts, completed 7/30/90-day defect windows with confirmed attribution, and
complete single-currency provider-invocation coverage are reconstructible.
Missing evidence remains non-numeric, legacy ledgers retain explicit
unsupported outcomes, and business/customer impact and baselines remain
unsupported. TypeScript, production build, diff checks, rendered desktop QA,
and the full Windows regression pass (260/260 in 433.18 seconds).
The formal completion review passed on 2026-08-07. In-app browser QA exercised
the exact read-only scorecard navigation at 1280 px and 390 px with meaningful
Russian content, a clean console, no framework overlay, and no page-level
horizontal overflow. Phase 1-10 are now completion-reviewed.

Phase 11 Operational Evidence Intake is implemented through Slice 2. Slice 1
provides exact bounded Phase 6 selection and an explicit read of the existing
Phase 10 projection. Slice 2 adds local two-step source lifecycle review and
preview-first import/attribution over the six existing Phase 10 POST routes.
Request and idempotency identities remain stable through preview, execute,
receipt reconciliation, and exact retry. Draft JSON is locally UTF-8,
privacy, closed-shape, kind, count, and byte validated; raw input and filenames
are not retained, rendered, logged, downloaded, or persisted. Attribution has
no automatic decision and requires an exact candidate change. No connector,
backend route, canonical event, background work, deployment/billing action, or
scorecard authority is added.
Five focused Phase 11 tests, TypeScript, production build, context smoke 3/3,
diff checks, and the final 265/265 Windows regression pass. Rendered Chromium
QA exercised local source review and a real preview/execute/receipt import over
an isolated temporary ledger at 1280 px, plus the guarded no-candidate
attribution state at 390 px; console, framework overlay, raw-draft, and
page-level overflow checks were clean. The browser-discovered receipt-unmount
defect was fixed and the full verification repeated on the final code.
The formal completion review passed on 2026-08-07 with all 13 acceptance
clauses evidenced and no unresolved or deferred finding. Phase 1-11 are now
completion-reviewed. There is no Phase 11 Slice 3; every subsequent phase
requires its own separately reviewed and accepted contract.

Phase 12 GitHub Deployment Connector has a separately accepted contract and is
implemented and completion-reviewed through Slices 1-2. Its minimal scope
is one manually triggered, read-only fetch of one exact GitHub production
deployment and exact terminal status, mapped only to the existing Phase 10
`DeploymentObservationV1`. The repository and API origin are server-fixed,
credentials are server-only and read-only, preview performs exactly three
bounded GETs and no mutation, and execute refetches the same snapshot before
delegating the only write to Phase 10. No GitHub enumeration, webhook, polling,
background job, remote write, rollback/hotfix inference, other provider, or
other evidence family is authorized. Slice 2 adds the confirmed Russian
operator workflow over the existing Slice 1 API: exact compatible-source
selection, sanitized preview, explicit confirmation, immutable receipt,
receipt reconciliation, exact retry, and responsive desktop/390 px states.
The formal completion review passed on 2026-08-13 with all 13 acceptance areas
evidenced and no unresolved or deferred finding. A fresh review run passed the
8/8 focused Phase 12 tests, TypeScript, production build, context smoke 3/3,
diff checks, and the full Windows regression 313/313 in 571.18 seconds.
In-app Chromium at 1280 px and 390 px confirmed the Russian unavailable state,
working Control Plane navigation, a clean console, and no page-level overflow.
There is no authorized Slice 3 or Phase 13; the next product phase requires a
separately owner-reviewed and accepted contract.

Slice 1 verification passes five focused connector tests, the combined Phase
10/12 focused run (11/11), TypeScript, production build, context smoke 3/3,
diff checks, and the full Windows regression (270/270, zero failures/skips,
422.88 seconds). No live GitHub credential or external request was used; all
network behavior was exercised through bounded mocked responses.

Slice 2 verification passes three focused UI tests and the combined Phase 12
run (8/8), TypeScript, production build, context smoke 3/3, diff checks, and
the full Windows regression (273/273, zero failures/skips, 391.6 seconds).
Rendered interaction passed at desktop and 390 px, including a clean console,
sanitized preview, explicit confirmation, import, projection refresh, and
preserved immutable receipt. Browser QA used a local mocked connector only;
no live GitHub credential or external request was used.

## Source Boundaries

- Product and execution truth: current code, tests, queue contracts, and
  `.orchestrator/runs/<run-id>/run.json`.
- Goal execution truth: `docs/goals/<slug>/state.yaml`.
- Local user queues: `queues/`, intentionally ignored by Git.
- Project Map: secondary navigation and replay context only.
- Phase 1 completion evidence:
  `docs/goals/change-control-foundation-execution-v1/state.yaml`.
- Accepted Phase 2 contract:
  `docs/architecture/change-control-plane/planning-drift-contract-v1.md`.
- Accepted Phase 3 contract:
  `docs/architecture/change-control-plane/workspace-merge-contract-v1.md`.
- Accepted Phase 4 contract:
  `docs/architecture/change-control-plane/halts-incidents-contract-v1.md`.
- Implemented Phase 5 contract:
  `docs/architecture/change-control-plane/prompt-model-eval-lineage-contract-v1.md`.
- Accepted Phase 6 contract:
  `docs/architecture/change-control-plane/operator-projections-contract-v1.md`.
- Implemented and completion-reviewed Phase 7 contract:
  `docs/architecture/change-control-plane/operator-actions-contract-v1.md`.
- Implemented and completion-reviewed Phase 8 contract:
  `docs/architecture/change-control-plane/audit-bundles-contract-v1.md`.
- Accepted Phase 9 contract; Slices 1-2 implemented and completion-reviewed:
  `docs/architecture/change-control-plane/outcome-scorecards-contract-v1.md`.
- Accepted Phase 10 contract; Slices 1-2 implemented and completion-reviewed:
  `docs/architecture/change-control-plane/operational-outcome-evidence-contract-v1.md`.
- Accepted Phase 11 contract; Slices 1-2 implemented and completion-reviewed:
  `docs/architecture/change-control-plane/operational-evidence-intake-contract-v1.md`.
- Accepted Phase 12 contract; Slices 1-2 implemented and completion-reviewed:
  `docs/architecture/change-control-plane/github-deployment-connector-contract-v1.md`.
- Phase 12 completion evidence:
  `docs/architecture/change-control-plane/github-deployment-connector-completion-review-v1.md`.
- Implemented and completion-reviewed Agentic Patterns Stage 1 S1 contract:
  `docs/architecture/change-control-plane/incident-to-eval-candidate-contract-v1.md`.
- S1 completion evidence:
  `docs/architecture/change-control-plane/incident-to-eval-candidate-completion-review-v1.md`.
- Implemented and completion-reviewed Stage 1 S2 contract:
  `docs/architecture/change-control-plane/context-budget-baseline-contract-v1.md`.
- Phase 11 product evidence: current code and `server/index.test.ts`.
- Phase 10 product evidence: current code and `server/index.test.ts`.
- Phase 2-9 product evidence: current code and `server/index.test.ts`.
- Phase 3 execution evidence:
  `docs/goals/workspace-merge-v1/state.yaml`.

## Explicit Non-Goals

- Do not turn `docs/project_map/working_state.yaml` into a scheduler.
- Do not duplicate Context Contract v1 schemas.
- Do not introduce a vector database, persistent search index, background
  capture, or autonomous memory promotion.
- Do not claim that the full Nikolay-like system is implemented.
- Do not infer destructive Git, force cleanup, or remote-publication authority
  from Phase 3 ownership records.
- No Phase 4 component has general-purpose auto-heal authority, and no Phase 5
  decision grants runtime authority outside its explicit champion scope.
- Do not extend Phase 7 beyond its five closed action kinds or infer new
  authority from dashboard visibility, preview, or receipt state.
- Do not treat Phase 8 bundles as a second ledger, persistent archive,
  publication channel, approval, operator action, or execution authority.
- Do not treat Phase 9 scorecards as telemetry, a baseline authority, product-
  impact proof, an SLA, a budget, or an action gate. Unsupported metrics remain
  explicit and cannot enter denominators.
- Do not treat Phase 10 imports as deployment, rollback, billing, incident,
  acceptance, or runtime authority. External connectors and background capture
  remain unauthorized except for the exact manually triggered read-only GitHub
  deployment adapter declared by the accepted Phase 12 contract.
- Do not expand Phase 12 into enumeration, polling, webhooks, background work,
  GitHub writes, other providers/evidence families, or inferred operational
  outcomes.

## Verification

```powershell
python scripts/ai_context_helper.py --root . read-set --profile startup --max-sources 8 --format json
python scripts/ai_context_helper.py --root . smoke-check --format json
npm run check
npm test
npm run build
git diff --check
```

On Windows, give `npm test` at least a ten-minute execution window. The suite
contains real Git/worktree, crash-recovery, and cross-process fencing stress
tests and most recently completed in 402.24 seconds.
