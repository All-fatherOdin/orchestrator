# Current Status

Status: active compact context pack
Last updated: 2026-07-29

Orchestrator is a local Codex queue runner with dependency-aware scheduling,
bounded write scopes, verification, review/correction, recovery, persisted run
records, context receipts, provider-state safeguards, and runtime evals.

The repository already vendors the Agent Memory Kit Context Contract v1
schemas and contains a production adapter for a target repository's
`scripts/ai_context_helper.py`. The current foundation adds that helper and a
secondary Project Map to Orchestrator itself so future work can restore bounded
project context without relying on chat history.

Current goal:

`docs/goals/agent-memory-foundation-v1/state.yaml`

Current boundary:

- `.orchestrator/runs/*/run.json` remains canonical for runs.
- GoalBuddy `state.yaml` remains canonical for goals.
- `queues/` remains canonical for the local launch queue selected by the user.
- this context pack and `docs/project_map/` are summaries/navigation only.

The evidence ledger and target architecture are now captured under
`docs/architecture/change-control-plane/`. One local launch queue is ready at
`queues/change-control-foundation-v1.yaml`; later queues remain intentionally
deferred until its event/API contracts are verified.
