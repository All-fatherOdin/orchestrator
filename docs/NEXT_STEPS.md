# Orchestrator Next Steps

Status: active operational handoff
Last updated: 2026-08-01

## Current Priority

The repo-centric secondary-memory foundation and the event-backed change/wave
foundation are verified and merged into `main`. Phase 2 Planning and Drift is
implemented and verified, including immutable plan publication, authorization,
deterministic replan lineage, trusted Git-state assessment, and fail-closed
dispatch gating. Phase 3 Workspace and Merge is implemented and verified on
Windows: managed attempts use owned worktrees, serialized fresh-target merge,
deterministic replan on drift, canonical replay, bounded recovery, and
non-destructive cleanup.

The first Phase 4 slice is implemented: closed halt taxonomy and attribution,
stable incident identity and correlation, append-only halt/incident events,
cross-process atomic publication, deterministic replay, lifecycle transitions,
correlation correction, and focused HTTP projections now fail closed against
invalid or ambiguous evidence.

## Current Safe Step

Run the remaining Phase 4 Warden and Doctor implementation queue from the
accepted contract. Warden verdict publication and policy gating, Doctor repair
recipes and leases, bounded recovery, and retry/resume authorization remain
unimplemented. The halt/incident ledger they consume is now implemented, so
the remaining work can preserve one-way authority: Warden may deny and Doctor
may propose only allowlisted recovery; neither may silently resume execution.

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
- Phase 2-4 product evidence: current code and `server/index.test.ts`.
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
- Warden/Doctor recovery, prompt/eval lineage, and operator UI remain later
  independently authorized slices. No Phase 4 component has general-purpose
  auto-heal authority.

## Verification

```powershell
python scripts/ai_context_helper.py --root . read-set --profile startup --max-sources 8 --format json
python scripts/ai_context_helper.py --root . smoke-check --format json
npm run check
npm test
npm run build
git diff --check
```
