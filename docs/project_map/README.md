# Orchestrator Project Map

Status: active secondary-memory profile
Profile: Agent Memory Kit v3.8.0 repo-centric governance, adapted for
Orchestrator

This directory makes project context inspectable and reproducible. It is not a
runtime memory service and not a replacement for code, tests, operational
documentation, queue files, canonical run records, current owner instructions,
or GoalBuddy state.

## Files

- `context_index.yaml`: bounded read-set routing metadata.
- `source_authority.yaml`: conflict and evidence authority.
- `permissions_policy.yaml`: advisory intent and mutation boundaries.
- `retrieval_policy.yaml`: hard gates and result requirements.
- `retrieval_scoring_policy.yaml`: post-gate ranking policy.
- `working_state.yaml`: compact replay pointers, never task execution state.
- `current_map.md`: reviewed facts, decisions, risks, and unknowns.
- `memory_lifecycle_policy.yaml`: candidate/current/stale lifecycle.
- `eval_suite/context_selection_smoke_cases.yaml`: selection acceptance cases.

## Provenance

The interface and governance model are adapted from the owner's local
`AI-assisted_System_Design_and_Agent_Memory_Kit` v3.8.0 checkout. The
Orchestrator profile is intentionally narrower than the full kit: it installs
only `read-set`, `api-context`, and `smoke-check` behavior needed by the
existing `RepositoryContextHelperProvider`.

The local Kit checkout contains no explicit LICENSE or SPDX grant. This
project-specific local adaptation records provenance and makes no
redistribution or licensing claim.

## Update Rule

Project Map mutation requires an explicit task scope naming the target files.
New observations begin as candidates. Promotion requires evidence and the
authority defined in `source_authority.yaml`.
