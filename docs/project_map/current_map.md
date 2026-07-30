# Current Project Map

Status: secondary memory
Last reviewed: 2026-07-29

## Verified Facts

- Orchestrator runs bounded Codex task queues and persists canonical run
  records under `.orchestrator/runs/`.
- Context Contract v1 schemas are vendored under
  `server/context-contract-v1/schemas/`.
- `RepositoryContextHelperProvider` consumes a target repository's
  `scripts/ai_context_helper.py` and falls back observably on failure.
- GoalBuddy board truth is stored separately under `docs/goals/<slug>/state.yaml`.

## Current Decision

Project Map is secondary memory. It may summarize and route to product, goal,
queue, and run sources but may not override them.

The evidence-backed target control-plane design is under
`docs/architecture/change-control-plane/`. Its first implementation slice is
the local `queues/change-control-foundation-v1.yaml`; neither location is a
replacement for runtime run records.

## Risks

- Treating working state as canonical execution state.
- Loading runtime logs or local data into default context.
- Promoting screenshot or web inference into a confirmed project fact.
- Duplicating existing Context Contract, approval, or eval mechanisms.

## Open Questions

- Which worktree/branch lifecycle is reliable on the supported Windows setup?
- Which halt classes are safe for deterministic automatic repair?
- How should incident, prompt, model, task, and eval lineage join existing run
  records after the event spine is proven?
