# Current Status

Status: active compact context pack
Last updated: 2026-08-02

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

Phase 4 Halts and Incidents is implemented. The canonical ledger publishes one
classified halt and effective incident atomically across processes, derives
stable correlation identity, replays lifecycle state deterministically, and
supports mitigation, escalation, resolution, bounded reopen, and superseding
correlation correction. Warden binds exact evidence, budgets, recipe identity,
idempotency, and monotonic leases. Doctor persists start before effects,
executes only five fixed typed adapters, publishes fenced
`DoctorRepairReceiptV1` results, and replays pending work by re-observation.
Independent Warden or audited-human events authorize retry/resume; Doctor
success alone changes neither task/wave authority nor incident closure.

Phase 5 Prompt/Model/Eval Lineage is implemented. Published prompt artifacts,
model routes, attempt bindings, resolved executions, eval suites, fixed cohorts,
run observations, deterministic reports, import receipts, and champion
decisions replay from the same project ledger and fail closed at their declared
identity, comparability, sample, guardrail, and authority boundaries.

Current boundary:

- `.orchestrator/runs/*/run.json` remains canonical for runs.
- GoalBuddy `state.yaml` remains canonical for goals.
- `.orchestrator/change-control-v1/projects/*` is canonical for published
  change, wave, task, planning, drift, authorization, halt, and incident events.
- `queues/` remains canonical for the local launch queue selected by the user.
- this context pack and `docs/project_map/` are summaries/navigation only.

The evidence ledger, target architecture, roadmap, Planning and Drift Contract
v1, Workspace and Merge Contract v1, and Halts and Incidents Contract v1
remain under `docs/architecture/change-control-plane/`. Completed local
Phase 1-5 queues remain ignored execution history under `queues/`; they are
not the next operational step. The accepted Phase 6 contract fixes two ordered
slices: deterministic read-only projection APIs, then a dashboard that consumes
only those APIs. Implementation has not started.
