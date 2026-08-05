# Operator Actions Contract v1

Status: accepted contract; Phase 7 Slices 1-2 implemented
Accepted: 2026-08-03
Slice 1 implemented: 2026-08-05
Slice 2 implemented: 2026-08-05

## Purpose

Phase 7 adds a narrow, audited operator command surface beside the Phase 6
read-only projections. It does not create a new authority source. Every action
MUST reuse the Phase 2-4 transition, authorization, freshness, incident, and
repair gates that already own the underlying mutation.

The phase is split into two independently useful slices:

1. deterministic preview and execution APIs with canonical receipts;
2. explicit-confirmation controls in the operator dashboard that consume only
   those APIs.

## Canonical Boundaries

- The per-project hash-chained change-control ledger remains canonical for
  change, wave, task, planning, incident, Warden, Doctor, prompt, and eval
  events.
- `.orchestrator/runs/<run-id>/run.json` remains canonical for concrete runs.
- Phase 6 projections remain read-only evidence and MUST NOT grant authority.
- An operator action receipt records an attempted command and its outcome. It
  cannot replace the canonical event produced by the owning command handler.
- Project Map, dashboard state, browser state, and preview responses are never
  authority.

## Closed Action Set

Phase 7 v1 supports only these action kinds:

| Action kind | Existing authority/gate | Required target |
|---|---|---|
| `dispatch-wave` | Phase 2 dispatch gate | project, change, wave, exact plan and authorization |
| `authorize-task-retry` | Phase 4 independent retry authorization | project, change, wave, task, halt |
| `authorize-wave-resume` | Phase 4 independent resume authorization | project, change, wave, incident/halt evidence |
| `transition-incident` | Phase 4 incident lifecycle | project, incident, exact next state |
| `resolve-incident` | Phase 4 resolution contract | project, incident, resolution evidence |

Unknown actions MUST fail closed. Arbitrary change/wave/task transitions,
Doctor execution, Warden evaluation, prompt/model publication or revocation,
eval/champion mutation, run controls, Git operations, deployment, publication,
external writes, spending, secrets, and permissions are excluded.

## Contracts

All Phase 7 documents use Draft 2020-12 JSON Schema and reject unknown fields.
IDs are immutable strings with bounded lengths; display labels are never join
keys.

### `OperatorActionRequestV1`

A request contains:

- `contractType: "OperatorActionRequestV1"` and `contractVersion: "1.0"`;
- unique `requestId` and one allowlisted `actionKind`;
- exact target identity required by the action kind;
- `actor` with stable human identity and `reason` with non-empty bounded text;
- action-specific typed input accepted by the existing owning handler;
- `expectedSourceWatermark` from the relevant Phase 6 projection;
- `expectedProjectSequence` and `expectedProjectHash` from canonical evidence;
- caller-generated `idempotencyKey` scoped to project and action kind.

The request MUST NOT contain credentials, environment values, prompt bodies,
provider-hidden reasoning, raw provider payloads, file contents, or unbounded
logs.

### `OperatorActionPreviewV1`

Preview is a deterministic, non-canonical assessment containing:

- the normalized request and its SHA-256 `requestHash`;
- current project sequence/hash and projection watermark;
- the exact owning gate that will be called;
- `allowed: true | false` and stable denial reason codes;
- expected canonical event type when allowed;
- warnings and evidence references safe for operator display;
- `previewHash`, computed over all preceding fields.

Preview MUST perform no canonical write, acquire no repair/merge lease, start no
run, and grant no authority. Equal canonical evidence and equal requests MUST
produce equal preview content except for an optional response timestamp that is
excluded from `previewHash`.

### `OperatorActionReceiptV1`

Execution returns and canonically publishes an immutable receipt containing:

- request, request hash, and preview hash;
- actor, reason, idempotency key, action kind, and exact target identity;
- observed pre-execution sequence/hash and source watermark;
- outcome: `executed`, `rejected`, or `already-executed`;
- stable reason codes and evidence references;
- when executed, the exact canonical event ID/type/hash emitted by the owning
  handler and the resulting project sequence/hash;
- receipt ID and receipt hash.

An `executed` receipt and its owning mutation MUST be published atomically.
Rejected stale or unauthorized requests MAY be recorded as immutable rejection
receipts, but they MUST NOT publish the owning mutation. A repeated
idempotency key with the exact same request hash returns `already-executed` and
the original receipt; reuse with different content fails closed.

## API Boundary

The versioned routes are:

- `POST /api/operator-actions/v1/preview`
- `POST /api/operator-actions/v1/execute`
- `GET /api/operator-actions/v1/receipts/:receiptId`

Preview accepts `OperatorActionRequestV1`. Execute accepts the exact request,
its `previewHash`, and an explicit `confirmed: true`. The server MUST recompute
the preview immediately before execution and reject any mismatch. Receipt reads
are bounded and privacy-safe.

These routes MUST call shared domain handlers, not duplicate transition logic
or write ledger files directly.

## Freshness and Fail-Closed Rules

Execution is rejected when any of these differ from the preview/request:

- source watermark, project sequence, or project hash;
- target identity or current lifecycle state;
- plan, authorization, halt, incident, lease, or evidence identity;
- owning gate decision or expected canonical event type;
- request hash, preview hash, actor, reason, or idempotency identity.

Stable reason codes include at least `UNKNOWN_ACTION`, `INVALID_REQUEST`,
`CONFIRMATION_REQUIRED`, `SOURCE_WATERMARK_CHANGED`, `PROJECT_STATE_CHANGED`,
`TARGET_STATE_CHANGED`, `AUTHORITY_REQUIRED`, `GATE_REJECTED`,
`IDEMPOTENCY_CONFLICT`, and `STORAGE_FAILURE`.

The execute route MUST NOT provide a `force`, `ignore`, `sendAnyway`, or generic
override field. Existing audited dispatch override semantics remain available
only when their exact Phase 2 input and authority requirements are satisfied.

## Dashboard Contract

The Phase 7 UI MUST:

- show actions only on records whose action kind and target are unambiguous;
- open a confirmation surface displaying project, target, action, current
  evidence watermark, expected effect, warnings, and the required reason;
- obtain a fresh preview immediately before enabling confirmation;
- disable confirmation on denial, stale evidence, loading, or ambiguity;
- send `confirmed: true` only after a direct human interaction;
- render the immutable receipt and refresh affected Phase 6 projections after
  execution;
- preserve keyboard access, focus, and explicit success/failure states.

The UI MUST NOT auto-confirm, batch actions, retry execution automatically,
infer actor/reason, hide gate denials, or treat an optimistic client state as a
successful mutation.

## Recovery, Concurrency, and Privacy

- Concurrent equal requests converge on one canonical mutation and receipt.
- Concurrent conflicting requests serialize through the existing project
  writer and all stale losers fail closed.
- A crash between request receipt and mutation publication cannot expose an
  executed receipt without its canonical owning event.
- Replay rebuilds receipt identity and outcome deterministically.
- API errors and UI output remain bounded and omit prohibited fields defined by
  Phase 5 and Phase 6.

## Implementation Slices

### Slice 1: schemas and command service

Add schemas, preview/execute/receipt services, atomic receipt publication,
idempotency, HTTP routes, replay, and integration tests for the five action
kinds. Do not add UI controls in this slice.

Implementation status: implemented and verified. The command service stages
the existing owning handler under the serialized project writer, appends the
receipt, validates deterministic replay, and performs one atomic publication.
It does not write a second ledger or duplicate transition logic.

### Slice 2: operator controls

Add contextual controls, confirmation, reason capture, denial/stale states,
receipt rendering, and projection refresh to the existing dashboard. Consume
only the Phase 7 APIs; do not import the command store into the browser.

Implementation status: implemented. The dashboard exposes incident transition
and resolution controls only on projection records with an unambiguous complete
target. It obtains a fresh preview, invalidates that preview whenever operator
input changes, enables execution only for an allowed preview after a direct
confirmation, renders the immutable receipt, and refreshes the affected
projection. Actions whose complete target evidence is absent from the Phase 6
projection remain hidden rather than inferred.

## Acceptance

Phase 7 is complete only when tests prove:

- each allowlisted action delegates to its existing owning gate;
- unknown and malformed actions fail closed;
- preview performs no canonical mutation;
- stale sequence/hash/watermark and preview mismatches reject execution;
- confirmation, actor, reason, and exact target identity are mandatory;
- idempotent retries publish one mutation and one effective receipt;
- conflicting concurrent requests have one winner and deterministic losers;
- crash/restart replay cannot produce a receipt/mutation split;
- prohibited fields never appear in requests, receipts, logs, or rendered HTML;
- dashboard controls cannot bypass the Phase 7 service;
- legacy Phase 1-6 ledgers remain readable without invented receipts;
- TypeScript checks, full tests, production build, browser interaction checks,
  and diff checks pass.

## Explicit Non-Goals

Phase 7 v1 does not add autonomous operation, action recommendations, batch
commands, scheduled commands, notifications, search, a database, remote
publication, deployment, package installation, destructive Git, arbitrary
Doctor recipes, new authority types, or Project Map promotion.
