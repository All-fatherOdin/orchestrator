# AMK v5 Reviewed Queue Draft Boundary v1

Status: accepted boundary; implementation not started

Defined: 2026-08-07

Accepted by owner: 2026-08-07

Depends on: `amk-v5-read-only-integration-contract-v1.md`

## Decision

Phase 2 is **Reviewed Queue Draft Export**.

It accepts one bounded local AMK Project Artifact V2 JSON bundle, validates it
against the already pinned AMK v5 contracts, builds a deterministic preview of
an Orchestrator YAML queue, and lets the operator download that preview after a
direct action.

Phase 2 does not write the queue into the repository and does not execute it.
The downloaded YAML remains an untrusted user-owned draft until it is later
selected and accepted through the ordinary Orchestrator queue workflow.

## In Scope

- one local JSON upload per request, held only for the request/view lifetime;
- exactly `TaskContractV3` as the source of proposed queue tasks;
- optional `WorkItemGraphV1`, `VerificationReceiptV2`, and `ReviewReceiptV1`
  validation and compatibility reporting without authority transfer;
- one exact server-discovered target project identity, hash, and watermark;
- an explicit operator mapping for every selected TaskContract;
- deterministic queue YAML preview;
- validation of the complete preview through the ordinary Orchestrator queue
  validator, including the two-task minimum and dependency rules;
- direct download of the already returned bounded YAML preview;
- explicit partial, unsupported, conflict, stale, and invalid states.

## Exact Mapping Boundary

Every output task is backed by exactly one `TaskContractV3`.

| Orchestrator queue field | Allowed source |
|---|---|
| `key` | deterministic normalization of `task_id`; collisions fail closed |
| `title` | exact AMK `title`; when absent, explicit operator input is required |
| `prompt` | fixed template containing verbatim `goal`, expected outcomes, done definition, and source identity |
| `allowedPaths` | explicit operator-selected subset of AMK `scope.project_files`; widening is rejected |
| `verificationCommands` | explicit operator input only; never inferred from receipts, prose, or evidence references |
| `executionGuards` | verbatim AMK stop conditions plus fixed no-authority guards |
| `dependsOn` | empty in Phase 2; AMK graph edges are not treated as Orchestrator scheduler authority |
| `model`, `effort` | existing target-project defaults or explicit ordinary queue values; never inferred from AMK risk text |
| `authorization` | absent/disabled; AMK artifacts cannot create apply approval |

`WorkItemGraphV1` remains navigation and review evidence in Phase 2. Splitting
one AMK task into multiple executable queue tasks or converting graph edges
into scheduler dependencies requires a later separately reviewed boundary.

`VerificationReceiptV2` and `ReviewReceiptV1` may explain compatibility but
cannot satisfy Orchestrator preconditions, verification commands, reviewer
approval, checkpoint requirements, or execution authorization.

## Target Project Fence

The client sends no filesystem path. It selects an opaque target identity
discovered by the server from an existing configured project profile. Preview
requires the exact current target hash and watermark.
A changed, missing, or ambiguous target fails stale or conflict.

AMK `scope.project_files` values must be relative, normalized, free of parent
traversal, and inside the selected target. Absolute paths, drive-qualified
paths, UNC paths, globs that escape the target, and symlink-based escapes are
rejected.

## Proposed HTTP and UI Surface

Exactly two new read/preview operations are permitted:

- `GET /api/amk-queue-drafts/v1` — bounded capabilities and server-resolved
  target discovery;
- `POST /api/amk-queue-drafts/v1/preview` — validation and deterministic queue
  draft generation with no filesystem write.

There is no execute, save, import, launch, approve, retry, or promote route.

The Russian Control Plane may add one `Черновик очереди` workspace with:

- local JSON selection;
- validation and mapping states;
- explicit fields for missing title, allowed paths, and verification commands;
- a preview diff/summary;
- `Скачать YAML` enabled only for a valid current preview.

Changing the bundle, target, mapping, or source watermark invalidates the prior
preview immediately. The UI contains no queue path field and no run button.

## Fixed Limits and Privacy

- request body: at most 256 KiB measured from raw bytes;
- response body: at most 512 KiB;
- at most 100 artifact entries and 100 proposed tasks;
- at most 100 allowed paths and 100 verification commands across the draft;
- bounded string and diagnostic lengths;
- no archive, directory, URL, connector, recursive include, or external fetch;
- no raw bundle, prompt, path, secret, or generated YAML in logs or errors;
- no cache, database, ledger event, temporary repository file, telemetry, or
  background job;
- temporary browser object URLs are revoked after download.

The response may return the generated YAML because it is the direct requested
artifact, but only after privacy validation and within the fixed response
limit. Compatibility diagnostics remain redacted and bounded.

## Explicit Non-Goals

Phase 2 does not:

- create, overwrite, rename, or delete a file under `queues/`;
- launch, schedule, retry, cancel, or reorder tasks;
- activate an AMK frontier or convert graph edges into scheduler dependencies;
- infer scope, commands, model, effort, risk, reversibility, or owner intent;
- create `TaskAuthorizationEvidenceV1` or an apply approval contract;
- treat AMK verification/review receipts as canonical Orchestrator evidence;
- write run records, ledgers, goal state, Project Map, Git, or target projects;
- migrate v4 artifacts, adopt documentation governance, or support the other
  AMK v5 project artifact contracts;
- publish, upload, notify, call a model, or use an external connector.

Using a queue/run path as a target, writing a downloaded draft into `queues/`, importing an AMK bundle into
canonical state, or launching the resulting queue belongs to Phase 3 and needs
a separate authority contract.

## Failure Model

The preview fails closed when:

- the bundle, contract version, semantic invariant, or request shape is invalid;
- fewer than two independently useful TaskContracts can form an ordinary queue;
- a required title, allowed path, or verification command is missing;
- a proposed path is outside the exact AMK scope or selected project;
- identities collide or the target/source watermark changes;
- the ordinary queue validator rejects the generated YAML;
- privacy, count, or byte limits are exceeded.

Failure never returns a partially runnable YAML file.

## Acceptance Gates

Phase 2 is complete only when tests prove:

- equal closed input and equal exact target identity produce byte-equal YAML;
- every output value is traceable to one exact AMK field, operator field, or
  fixed template; no prose inference occurs;
- generated YAML passes the unchanged ordinary queue validator;
- malformed contracts, traversal, scope widening, collisions, stale targets,
  and limit overflow fail closed;
- receipts and graph evidence cannot grant scheduling or execution authority;
- preview and download perform no server-side or repository mutation;
- restart retains no uploaded bundle or preview;
- the UI invalidates stale previews and exposes no write/launch control;
- focused schema/domain/API/UI tests, full Windows regression, TypeScript,
  production build, context smoke, diff checks, and desktop/390 px rendered
  interaction pass.

## Authorization Checkpoint

The owner accepted this two-route, preview/download-only boundary on
2026-08-07. This acceptance authorizes detailed planning and the four declared
implementation slices below. It does not authorize Phase 3, server-side queue
writes, or queue execution.

## Implementation Slices

### Slice 1: closed draft contracts and deterministic mapper

Add closed request, response, target descriptor, mapping input, and queue draft
schemas. Implement raw AMK bundle validation, exact target/source fencing,
deterministic TaskContract-to-queue mapping, path normalization and subset
checks, stable YAML serialization, and validation through the unchanged
ordinary queue validator. Add no HTTP route or UI.

Done when focused tests prove deterministic byte output, two-task minimum,
operator-only verification commands, no inferred authority, graph/receipt
non-authority, traversal rejection, collision handling, limits, legacy
failure behavior, and byte-for-byte no mutation.

### Slice 2: bounded preview API

Expose only the declared discovery GET and preview POST after Slice 1 passes.
Add raw request-byte measurement, response limits, privacy-safe stable errors,
exact target watermark fencing, request-scoped processing, and restart/no-cache
tests. The response may contain the generated YAML but no route may save or
execute it.

Done when API/schema tests prove closed envelopes, exact two-route exposure,
method rejection, stale/conflict behavior, bounded diagnostics, no logging or
persistence of bundle content, deterministic restart reconstruction, and no
filesystem mutation.

### Slice 3: reviewed Russian draft workspace

Add `Черновик очереди` to the AMK Control Plane. The view selects a local JSON
file, an exact server-discovered target, and explicit per-task mapping fields;
it renders compatibility and queue-validation states and downloads only the
already returned valid YAML after a direct action.

Done when UI tests and rendered desktop/390 px interaction prove local-file
size/type handling, preview invalidation on every input or watermark change,
missing-field guidance, safe error states, correct bounded download, no
horizontal overflow, and absence of save/import/launch/approval controls.

### Slice 4: completion review

Review every boundary and acceptance clause against the final code, schemas,
focused tests, unchanged ordinary queue validation, restart/no-mutation
evidence, full Windows regression, TypeScript, production build, context
smoke, diff checks, and rendered desktop/390 px interaction.

Completion review may close Phase 2 only. It cannot create or authorize a
Phase 3 implementation boundary.
