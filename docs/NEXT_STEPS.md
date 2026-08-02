# Orchestrator Next Steps

Status: active operational handoff
Last updated: 2026-08-02

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

Treat the verified Phase 5 boundary as complete. The next separately
authorized product slice is Phase 6 operator projections; no UI should gain
canonical write authority from this handoff.

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
- Phase 2-5 product evidence: current code and `server/index.test.ts`.
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
- Operator UI remains a later independently authorized slice. No Phase 4
  component has general-purpose auto-heal authority, and no Phase 5 decision
  grants runtime authority outside its explicit champion scope.

## Verification

```powershell
python scripts/ai_context_helper.py --root . read-set --profile startup --max-sources 8 --format json
python scripts/ai_context_helper.py --root . smoke-check --format json
npm run check
npm test
npm run build
git diff --check
```
