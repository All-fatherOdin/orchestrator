# Orchestrator Next Steps

Status: active operational handoff
Last updated: 2026-07-29

## Current Priority

The repo-centric secondary-memory foundation is verified. The next executable
slice is the event-backed change/wave foundation described in
`docs/architecture/change-control-plane/README.md`.

## Current Safe Step

Review and launch `queues/change-control-foundation-v1.yaml`. It creates the
canonical change ledger first and then adds dependency-gated wave dispatch.
Do not create later queues until this slice fixes the event/API contracts.

## Source Boundaries

- Product and execution truth: current code, tests, queue contracts, and
  `.orchestrator/runs/<run-id>/run.json`.
- Goal execution truth: `docs/goals/<slug>/state.yaml`.
- Local user queues: `queues/`, intentionally ignored by Git.
- Project Map: secondary navigation and replay context only.

## Explicit Non-Goals

- Do not turn `docs/project_map/working_state.yaml` into a scheduler.
- Do not duplicate Context Contract v1 schemas.
- Do not introduce a vector database, persistent search index, background
  capture, or autonomous memory promotion.
- Do not claim that the full Nikolay-like system is implemented.
- Do not add worktree, merge, incident, auto-heal, lineage, or operator UI
  behavior in the foundation queue.

## Verification

```powershell
python scripts/ai_context_helper.py --root . read-set --profile startup --max-sources 8 --format json
python scripts/ai_context_helper.py --root . smoke-check --format json
npm run check
npm test
```
