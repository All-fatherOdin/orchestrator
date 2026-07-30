# Orchestrator Next Steps

Status: active operational handoff
Last updated: 2026-07-30

## Current Priority

The repo-centric secondary-memory foundation and the event-backed change/wave
foundation are verified and merged into `main`. Codex prompts now travel over
stdin instead of the Windows command line, and retry runs retain the
authoritative task-owned path lineage for reviewer scope.

## Current Safe Step

Run the accepted Phase 2 Planning and Drift implementation queue:
`queues/planning-drift-v1.yaml`. It contains two sequential vertical tasks:
event-backed planning publication/authorization first, then trusted
repository-state drift assessment and fail-closed dispatch gating.

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

## Explicit Non-Goals

- Do not turn `docs/project_map/working_state.yaml` into a scheduler.
- Do not duplicate Context Contract v1 schemas.
- Do not introduce a vector database, persistent search index, background
  capture, or autonomous memory promotion.
- Do not claim that the full Nikolay-like system is implemented.
- Do not begin worktree/merge, incident, auto-heal, prompt/eval lineage, or
  operator UI behavior before the Planning and Drift contracts are accepted.

## Verification

```powershell
python scripts/ai_context_helper.py --root . read-set --profile startup --max-sources 8 --format json
python scripts/ai_context_helper.py --root . smoke-check --format json
npm run check
npm test
```
