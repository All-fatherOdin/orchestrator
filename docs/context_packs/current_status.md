# Current Status

Status: active compact context pack
Last updated: 2026-07-30

Orchestrator is a local Codex queue runner with dependency-aware scheduling,
bounded write scopes, verification, review/correction, recovery, persisted run
records, context receipts, provider-state safeguards, and runtime evals.

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

The Phase 2 Planning and Drift contract is proposed and awaiting acceptance
before its implementation queue is created.

Current boundary:

- `.orchestrator/runs/*/run.json` remains canonical for runs.
- GoalBuddy `state.yaml` remains canonical for goals.
- `.orchestrator/change-control-v1/projects/*` is canonical for published
  change, wave, and task events.
- `queues/` remains canonical for the local launch queue selected by the user.
- this context pack and `docs/project_map/` are summaries/navigation only.

The evidence ledger, target architecture, roadmap, and proposed Planning and
Drift Contract v1 remain under `docs/architecture/change-control-plane/`. The
completed local Phase 1 queue is retained in
`queues/change-control-foundation-v1.yaml` as ignored execution input. The
Phase 2 queue should be created only after the proposed schema, semantic checks,
authority boundary, and fail-closed dispatch rules are reviewed and accepted.
