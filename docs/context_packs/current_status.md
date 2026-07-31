# Current Status

Status: active compact context pack
Last updated: 2026-07-30

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

Current boundary:

- `.orchestrator/runs/*/run.json` remains canonical for runs.
- GoalBuddy `state.yaml` remains canonical for goals.
- `.orchestrator/change-control-v1/projects/*` is canonical for published
  change, wave, task, planning, drift, and authorization events.
- `queues/` remains canonical for the local launch queue selected by the user.
- this context pack and `docs/project_map/` are summaries/navigation only.

The evidence ledger, target architecture, roadmap, Planning and Drift Contract
v1, Workspace and Merge Contract v1, and Halts and Incidents Contract v1
remain under `docs/architecture/change-control-plane/`. Completed local
Phase 1-3 queues remain ignored execution history under `queues/`; they are
not the next operational step. The Phase 4 contract is accepted; its bounded
implementation queue is the next operational step.
