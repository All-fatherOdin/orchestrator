# Orchestrator Next Steps

Status: active operational handoff
Last updated: 2026-08-05

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
rendered smoke with a clean console and no page-level overflow. The combined
server/Electron command exceeded its six-minute environment cap without a
failure diagnostic; keep that as explicit runtime-environment risk rather than
claiming a full-suite pass. The next implementation phase requires a separately
accepted contract before code changes begin.

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
- Phase 2-8 product evidence: current code and `server/index.test.ts`.
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

## Verification

```powershell
python scripts/ai_context_helper.py --root . read-set --profile startup --max-sources 8 --format json
python scripts/ai_context_helper.py --root . smoke-check --format json
npm run check
npm test
npm run build
git diff --check
```
