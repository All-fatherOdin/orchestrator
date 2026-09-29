# Context Allocation v1: Implementation Plan

Status: proposed planning artifact; not accepted for implementation

## Purpose

Offer a task-local, opt-in, deterministic context byte/count budget on top of
the existing `contextProfile`, `maxSources`, Context Contract, and
`ContextReceiptV1`. The purpose is to avoid repeatedly attaching broad project
context to fresh executors when a smaller, traceable read set is sufficient.

This is not long-lived chat memory. Each attempt remains reproducible from its
declared request, selected source identities, and receipt. It does not permit
automatic context removal, model-selected retrieval, implicit carryover from a
prior chat, or an adaptive prompt policy.

## Preconditions

Do not admit this feature until Coordination Economics v1 has a reviewed cohort
decision showing a concrete problem addressable by deterministic source-budget
allocation. Current Context Budget Baseline v1 remains advisory measurement,
and current Context Contract behavior remains authoritative until a separately
accepted contract changes it.

## Proposed task-local policy

The exact field name and schema remain subject to admission review. A candidate
shape is:

```yaml
contextProfile: implementation
maxSources: 12
contextAllocation:
  contractType: ContextAllocationPolicyV1
  contractVersion: "1.0"
  maxSelectedBytes: 180000
  maxSelectedSources: 12
  requiredPaths:
    - docs/NEXT_STEPS.md
    - docs/source_of_truth_hierarchy.md
  selectionMode: deterministic
```

The accepted policy must be closed-schema and authorization-bound. Existing
queues that omit it retain byte-compatible context selection and launch
behavior.

## Required semantics

1. Validate required paths against the repository root and current high-risk
   exclusions. A missing, unsafe, duplicate, or non-regular required path fails
   before any provider process starts.
2. Run the existing context router first; it remains the only selector of
   candidate sources. The policy must not scan the repository or add sources.
3. Include required candidates first, then retain router-ranked candidates only
   while both count and byte caps remain satisfied.
4. Preserve a stable tie-breaker and source hash/path identities. Any candidate
   not retained receives exactly one bounded omission reason such as
   `required`, `included`, `source_count_exceeded`, `byte_budget_exceeded`, or
   `unsafe_or_invalid`.
5. Persist the selected bundle and all inclusion/omission decisions in the
   task's `ContextReceiptV1` lineage. Preflight/execution mismatch or changed
   source identity fails closed.
6. Treat estimates as estimates: source bytes are enforceable at this boundary;
   full provider request tokens, tool schemas, system instructions, reasoning,
   and billing are not.

## Delivery slices

### CA-1 — Contract and deterministic allocation service

Add a closed policy schema, semantic validator, pure allocation function, and
fixtures. Required fixtures assert: missing versus zero byte values; exact paths
and whitespace-sensitive near-matches; several candidates accumulating to the
exact cap; sibling profiles; and candidates distributed across router pages if
pagination exists. Test legacy queues, invalid required paths, duplicate paths,
source-byte ties, over-budget required sources, and preflight/execution hash
drift.

### CA-2 — Queue validation, authorization, and receipts

Bind the accepted policy hash to the task lifecycle and queue authorization.
Integrate it only after router output and before prompt/provider-process
creation. Extend receipts with policy identity, measured selected bytes/count,
ordered decisions, and bounded reasons. Existing receipt consumers must remain
compatible with absent policy fields; malformed opted-in evidence must be
non-replayable.

### CA-3 — Controlled rollout and decision

Enable the policy only on declared test queues whose tasks have exact
`contextProfile`, source cap, byte cap, required paths, verification commands,
and stop guards. Compare them to the predeclared Coordination Economics cohort.
Adoption requires no regression in required-context availability, verification
outcome, replay, privacy, or authorization—and a reproducible reduction in the
measured context allocation that motivated the feature. No automatic default
change follows from a successful pilot.

## Expected implementation scope

The accepted impact map will likely include Context Contract schemas and types,
the router/queue-validation seams in `server/index.ts`, context-contract tests,
one task example, baseline/report tests as necessary, and the relevant
architecture/navigation documents. It must be finalized only after source
investigation. It excludes a provider SDK, long-lived sessions, cross-thread
tools, prompt-cache breakpoints, new telemetry service, external storage,
dashboard, and Project Map mutation.

## Acceptance evidence

- A queue without `contextAllocation` has unchanged selection, receipt, prompt,
  launch, retry, and replay behavior.
- An opted-in task has one authorization-bound policy and one exact receipt;
  required paths cannot silently be removed.
- Byte/count caps, order, tie-breaking, omission reasons, and source hashes are
  deterministic across preflight, execution, retry, restart, and replay.
- Any unsafe path, source drift, receipt mismatch, or malformed persisted policy
  fails before provider-process launch.
- Provider cache usage remains accounting only; the policy does not claim token
  enforcement, cache savings, model routing, or semantic answer quality.
- Focused tests, TypeScript, production build, context smoke, diff check, and
  full Windows regression pass.

## Stop conditions

Stop if satisfying the policy requires the router to select new sources,
changes a legacy queue, silently drops required evidence, treats byte size as
provider-token truth, requires a second persistent memory store, or needs an
unreviewed provider/runtime feature.
