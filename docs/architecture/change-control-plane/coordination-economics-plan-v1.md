# Coordination Economics v1: Implementation Plan

Status: proposed planning artifact; not accepted for implementation

## Purpose

Create a deterministic, read-only explanation of the coordination cost of an
existing Orchestrator run. The report makes observable what is already
authoritatively recorded: fresh provider-process starts, selected context,
provider usage when available, lifecycle wait time, retries, reviews, and
terminal outcome. It must not infer hidden model reasoning, semantic research
duplication, cache savings, price, or quality from absent evidence.

This plan is a follow-up to the Habr analysis of subagent/context overhead. It
does not introduce long-lived agent sessions, cross-thread messaging, a new
provider route, automatic scheduling, or a delivery KPI based on agent count.

## Product decision

The first release is an offline/read-only report over one canonical
`.orchestrator/runs/<run-id>/run.json`. It has no queue field, server route,
dashboard, persistent metric store, background collection, or runtime gate.
It may be used to decide whether a later Context Allocation v1 policy has
measurable value; it cannot itself change prompt assembly or dispatch.

## Closed metric vocabulary

| Area | Measure | Evidence | Unsupported / excluded meaning |
|---|---|---|---|
| Context | selected source count/bytes, required source count, omitted source count/reason | `ContextReceiptV1` | full provider-prompt size unless independently captured |
| Process fan-out | executor, reviewer, and correction provider-process counts | existing execution lifecycle and `ExecutionBudgetEvidenceV1` where opted in | opaque provider-internal agents or tool calls |
| Queueing | task ready-to-start and dependency-wait durations where timestamps prove both endpoints | canonical task lifecycle timestamps | model thinking, network time, or unrecorded idle time |
| Usage | input, output, cached-input, cache-write tokens and availability state | normalized post-invocation usage | a provider-cache hit rate, price, or savings claim |
| Outcome | terminal task status, retry count, verification/review status when present | canonical task records and receipts | semantic answer quality beyond existing eval evidence |
| Evidence reuse | exact source-path/hash overlap with a declared predecessor handoff, if one exists later | explicit immutable handoff only | inferred model memory or repeated research |

Missing, legacy, malformed, or ambiguous evidence stays `unsupported` or
`incomparable`; it never becomes zero.

## Delivery slices

### CE-1 — Schema, pure projection, and fixture set

Define a closed `CoordinationEconomicsReportV1` schema and a pure mapper from
a normalized persisted run record. The mapper must be clock-free and
side-effect-free. Fixtures cover:

- a fresh single-task run with a `ContextReceiptV1`;
- a dependency chain with proven waiting intervals;
- reviewer/correction attempts and execution-budget evidence;
- legacy records without context or usage evidence;
- conflicting or reordered evidence that fails closed; and
- cache fields absent versus explicit numeric zero.

The result must expose source identities and bounded reason codes, never task
prompts, tool output, credentials, source contents, hidden reasoning, or raw
provider events.

### CE-2 — Read-only CLI and canonical replay binding

Add one explicit CLI that reads one exact run directory, validates the existing
run schema/replay boundary before projection, and prints bounded JSON. It must
reject path escape, symlink/race, oversized input, invalid UTF-8/JSON, and
non-canonical or ambiguous records. It writes no file and does not alter the
run record. Repeated invocation over identical evidence yields byte-identical
output apart from no timestamps or host-specific values.

### CE-3 — Evaluation and adoption decision

Run the CLI against a predeclared, privacy-safe cohort of representative
historical or fixture runs. Compare fresh-context bytes, process fan-out,
waits, usage availability, and outcomes by declared task class. Record the
cohort identity, report hashes, unsupported rates, and decision. A later
Context Allocation v1 proposal is allowed only if this evidence identifies a
concrete, reproducible context-cost problem; it must not be justified merely by
the existence of the report.

## Expected implementation scope

The accepted contract must resolve exact paths after current-session
investigation. The likely bounded surface is a new `server/` pure service and
test, one JSON schema plus examples, one read-only script/CLI, `package.json`
for its focused test command, and the relevant navigation/status documents.
It must not widen to provider adapters, prompt compiler behavior, queue syntax,
dashboard, Electron, Phase 10 outcomes, or a second ledger without a new
decision.

## Acceptance evidence

- Exact deterministic reports for every fixture, including zero versus missing
  values and legacy `unsupported` states.
- No report can count an unrecorded provider process, wait interval, cache hit,
  reuse event, or quality result.
- Tampered, contradictory, or path-unsafe records fail before projection.
- The report has no filesystem mutation, network call, provider invocation,
  queue execution, or canonical-record mutation.
- Focused tests, TypeScript, production build, context smoke, diff check, and
  the full Windows regression pass under the repository's current time budget.

## Stop conditions

Stop and return to design if canonical timestamps cannot establish a duration,
if the report needs to parse prompts/tool output, if hidden provider behavior
would need inference, if a new persistent store/API/UI is required, or if the
existing run record cannot be safely replayed without changing its schema.
