# T002 metric semantics

## OutcomeClass

`OutcomeClass = "success" | "failure" | "interrupted" | "pending"`.

- `completed` -> `success`, including the existing reviewer-unavailable success behavior.
- `failed`, `timed_out`, `blocked` -> `failure`.
- `cancelled`, `skipped` -> `interrupted`.
- `idle`, `pending`, `running`, `paused`, or an unknown future status -> `pending`.

The API may include the original status beside the class so the class does not erase detail.

## Duration

`durationMs` is the non-negative difference between valid `finishedAt` and `startedAt`. Return `null` when either timestamp is absent/invalid or the finish precedes the start. Never synthesize elapsed time for active or legacy records from the current clock.

## Execution attempts

Prefer a finite non-negative integer `task.executionAttempts`. If absent, use the maximum positive integer `attempt` among executor `usage` records. Return `null` when neither source exists. Preserve a recorded zero for a new task that has not launched.

## Review/correction cycles

`reviewCorrectionCycles` counts corrections actually started, not reviewer calls. Prefer `max(0, trunc(task.attempts) - 1)`, because current execution sets attempts to 1 and increments it before each correction. If absent, use the count of distinct positive correction attempt numbers in `usage`. Return `null` if neither source exists. This avoids claiming a cycle from a final `reviewStatus` alone.

## Token totals

For every valid usage record, normalize each token component to a non-negative integer. Aggregate `inputTokens`, `outputTokens`, `cachedInputTokens`, and `calls`. `totalTokens = inputTokens + outputTokens`; cached input remains a separate subset/accounting dimension and must not be added again. Missing usage is a valid all-zero token aggregate because it proves no recorded token events, not that provider usage was necessarily zero.

## Run projection and API

Create pure exported projection functions for task and run metrics. Run duration uses valid run timestamps under the same rule. Run tokens sum task token aggregates; task metrics remain individually addressable. Add `GET /api/runs/:id/metrics` near existing run GET routes. Its response contains identifiers/status/derived metrics only—no prompt, log, output, review text, diff, file content, environment value, or secret. The handler loads the run and projects without persistence or mutation.

The existing Usage page should request this endpoint for each selected run, merge by run/task id, and show duration, execution attempts, review/correction cycles, total tokens, and outcome while retaining current token breakdowns and filters. A failed metrics fetch should leave the page usable with an unavailable marker rather than altering the run.

## TDD order

1. Add failing pure-function tests for outcome mapping and valid/invalid duration.
2. Add failing tests for stored and usage-fallback attempts/cycles.
3. Add failing tests proving token aggregation, cached non-double-counting, and malformed-number normalization.
4. Add a failing projection/privacy test proving legacy-shaped runs work and forbidden content is absent from serialized metrics.
5. Implement the minimum pure helpers and projection in `server/index.ts`.
6. Add the local read-only route and wire the Usage page to it.
7. Refactor only inside the approved files, then run focused/full tests, typecheck, build, and diff checks.
