# Source of Truth Hierarchy

## Authority Order

For Orchestrator-specific claims, use the first applicable source:

1. Current explicit owner instruction.
2. Current code, tests, schemas, and machine-validated queue/run records.
3. Active operational documentation and accepted task specifications.
4. GoalBuddy board state for the goal it owns.
5. Project Map files as secondary memory and navigation.
6. Research and historical artifacts as evidence requiring current
   verification.
7. General model knowledge only for general concepts, never as proof of
   Orchestrator state.

## Canonical State by Scope

| Scope | Canonical state |
|---|---|
| A running or historical Orchestrator run | `.orchestrator/runs/<run-id>/run.json` |
| A GoalBuddy goal | `docs/goals/<slug>/state.yaml` |
| A user-created launch queue | the selected file under `queues/` |
| Product behavior | current code, schemas, and passing tests |
| Project navigation and replay hints | `docs/project_map/`, secondary only |

No file is globally canonical for every scope. In particular,
`docs/project_map/working_state.yaml` may point to canonical sources but may
not replace them.

## Conflict Rule

When secondary memory conflicts with a higher source:

1. use the higher source;
2. report the conflict;
3. treat the Project Map item as stale or disputed;
4. update it only under explicit Project Map mutation scope.

## Research Rule

Telegram messages, screenshots, web sources, and design hypotheses remain
evidence. They become project decisions only after a decision record or
accepted specification identifies the evidence, confidence, and unresolved
questions.
