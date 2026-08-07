# Orchestrator Next Steps

Status: active operational handoff
Last updated: 2026-08-07

## Current Priority

The repo-centric secondary-memory foundation and the event-backed change/wave
foundation are verified and merged into `main`. Phase 2 Planning and Drift is
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
completion-reviewed. There is no Phase 11 Slice 3 and no accepted Phase 12;
further implementation requires a separately reviewed and accepted contract.

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
  remain unauthorized.

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
