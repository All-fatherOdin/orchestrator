# Operator Projections Contract v1

Status: accepted contract; Slice 1 implemented, Slice 2 pending

This document fixes the Phase 6 read boundary. The words MUST, MUST NOT,
SHOULD, and MAY are requirements. It authorizes implementation only within the
two bounded slices below; it does not authorize new control-plane mutations.

## Outcome

An operator can inspect cross-project execution health, work readiness,
incidents, repair activity, prompt/model lineage, and eval evidence without
changing canonical state. Every displayed fact is traceable to a canonical
source and reproducible after restart.

## Source and authority boundary

Operator projections are replaceable read models. They MUST be derived from:

- validated per-project change-control ledgers;
- canonical `.orchestrator/runs/<run-id>/run.json` records where run execution
  detail is required;
- existing deterministic Phase 1-5 projection functions.

Projection storage, caches, indexes, UI state, filters, sorting, and pagination
are never canonical. They MUST NOT append ledger events, rewrite run records,
grant dispatch/retry/resume/champion authority, repair corrupt sources, or
infer missing state. A corrupt or unreadable canonical source produces an
explicit unavailable/error result with source identity; it is never silently
omitted or reconstructed from secondary memory.

## Projection envelope

Every response MUST carry:

- `contractType: "OperatorProjectionV1"` and `contractVersion: "1.0"`;
- `generatedAt` and a deterministic `sourceWatermark` per included project;
- explicit `scope`, applied filters, sort order, and pagination cursor;
- `items` with immutable entity IDs and canonical evidence references;
- `warnings` for unavailable sources or explicitly unsupported dimensions.

The source watermark MUST identify the last validated ledger sequence and hash.
Run-derived data MUST additionally identify the run ID and stable persisted
record identity available from the current run contract. Equal sources and
equal query parameters MUST yield equal items, ordering, aggregates, and next
cursor; `generatedAt` is not part of semantic equality.

## Required views

The backend read model MUST expose these independently queryable views:

1. **Overview** — project counts, active/halted waves, ready tasks, blocking
   incidents, live repair leases, and recent eval/champion status.
2. **Execution bucket** — derived dispatchable waves and tasks with exact
   readiness or rejection reasons; it does not dispatch work.
3. **Incidents** — effective incident state, linked halts, attribution,
   Warden verdicts, Doctor receipts, retry/resume authority, and evidence refs.
4. **Prompt registry** — published/revoked prompt artifacts, model routes,
   exact bindings, resolved execution identity, and supersession lineage.
5. **Eval lineage** — suites, cohorts, run state, observations, deterministic
   reports, comparability blockers, import receipts, and champion decisions.

Aggregates MUST retain failed, interrupted, unsupported, unavailable, and
unknown states in their declared population. The API MUST NOT turn unsupported
measurements into zero, success, or measured values.

## Query contract

The first version uses read-only `GET` endpoints under
`/api/operator-projections/v1`:

- `/overview`
- `/execution-bucket`
- `/incidents`
- `/prompt-registry`
- `/eval-lineage`

All endpoints MUST support a bounded project scope. List endpoints MUST use
stable ordering with immutable ID tie-breakers and bounded cursor pagination.
Filters MUST be allowlisted and schema validated. Unknown filters, malformed
cursors, excessive page sizes, or unknown enum values fail closed with a typed
4xx response. A response MUST distinguish an empty result from an unavailable
source.

The API is read-only by construction: no `POST`, `PUT`, `PATCH`, or `DELETE`
operator-projection route is permitted in v1. Existing canonical command APIs
remain separate and retain all Phase 1-5 authority checks.

## Dashboard boundary

The dashboard MAY render the five required views, details, evidence links,
filters, sorting, pagination, refresh, loading, empty, stale, and unavailable
states. It MUST display unsupported and non-comparable evidence explicitly.

The Phase 6 dashboard MUST NOT contain direct mutation controls for dispatch,
override, retry, resume, Doctor execution, incident closure, prompt/model
publication, eval publication, or champion decisions. Navigation to an
existing separately authorized command surface MAY be added only in a future
contract.

## Privacy and disclosure

Projection payloads MUST preserve the narrow Phase 5 disclosure boundary.
They MUST NOT expose rendered prompts, task prompt bodies, secrets,
environment values, unrelated file contents, provider-hidden reasoning, raw
provider payloads, or unbounded logs. Human-facing summaries come only from
already approved canonical fields. Evidence references are identifiers, not
authorization to read arbitrary files.

## Freshness and failure semantics

Reads validate canonical inputs before projection. Cache use is optional, but
a cache entry MUST be keyed by exact source watermarks and query identity.
Stale cache content MUST NOT be served as current. Concurrent writes may cause
one bounded retry; unresolved movement returns an explicit retryable conflict.

One unavailable project MUST be reported in `warnings`. It MUST NOT corrupt
healthy project results or disappear from overview population counts. If the
requested single project is unavailable, the request fails closed.

## Implementation slices

### Slice 1: backend projection API

Implement the versioned schemas, deterministic projection functions, five GET
routes, stable pagination, source watermarks, partial-availability semantics,
and integration tests. This slice MUST NOT change the dashboard or canonical
write paths.

### Slice 2: read-only dashboard

Consume only the Slice 1 API. Implement the five views and their loading,
empty, stale, unsupported, non-comparable, and unavailable states. This slice
MUST NOT add a canonical mutation endpoint or reuse command-store functions in
the browser.

The slices are independently useful and run in order because the UI contract
depends on the verified API schema.

## Acceptance

Phase 6 is complete only when tests prove:

- deterministic replay produces identical projections and ordering;
- source watermark changes invalidate cached results;
- corrupt, moving, missing, and partially unavailable sources are explicit;
- pagination has no duplicates or omissions under a fixed watermark;
- every aggregate preserves non-success and unsupported denominators;
- no Phase 6 route or UI action can mutate canonical state;
- privacy-prohibited fields never appear in API payloads or rendered HTML;
- legacy Phase 1-5 projects remain readable without invented fields;
- TypeScript checks, the full test suite, production build, and diff checks pass.

## Explicit non-goals

Phase 6 v1 does not add search infrastructure, a database, background capture,
notifications, autonomous actions, mutation workflows, new authority types,
new Warden/Doctor recipes, provider execution, or Project Map promotion.
