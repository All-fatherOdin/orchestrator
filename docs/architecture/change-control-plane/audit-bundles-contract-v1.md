# Audit Bundles Contract v1

Status: implemented and completion-reviewed
Accepted: 2026-08-05
Slice 1 implemented: 2026-08-05
Slice 2 implemented: 2026-08-05
Completion review verified: 2026-08-05

## Outcome

Phase 8 lets an operator obtain a bounded, deterministic, privacy-safe audit
bundle for one project or one exact change without changing canonical state.
The bundle joins already-published Phase 1-7 identities and evidence into a
single verifiable response. It is a read model, not a second ledger, archive,
notification, approval, or publication system.

## Authority and Source of Truth

- Existing project ledgers remain canonical for changes, waves, tasks, plans,
  workspaces, merges, halts, incidents, repair evidence, prompt/model/eval
  lineage, operator actions, and receipts.
- `.orchestrator/runs/<run-id>/run.json` remains canonical for concrete runs.
- The bundle contains copies, hashes, references, and completeness findings;
  it grants no execution, approval, retry, resolution, merge, deployment, Git,
  or external-publication authority.
- Missing or conflicting evidence MUST be reported. The service MUST NOT
  synthesize an event, receipt, actor, reason, decision, or successful outcome.

## Closed Scope

Version 1 supports exactly two selectors:

1. one `projectId` with an explicit sequence range; or
2. one exact `{ projectId, changeId }` identity.

It produces one `AuditBundleV1` response containing:

- selector and canonical source watermark;
- requested and observed sequence boundaries;
- ordered canonical event summaries and hashes;
- exact entity and receipt references needed to follow the evidence chain;
- bounded Phase 6 projection snapshots for the selected scope;
- Phase 7 operator-action receipt summaries;
- completeness checks, warnings, unsupported evidence, and privacy findings;
- a deterministic `bundleHash` over normalized content.

The bundle MUST NOT contain file contents, prompt bodies, environment values,
credentials, provider-hidden reasoning, raw provider payloads, unbounded logs,
or arbitrary user-selected filesystem content.

## Contract and Determinism

`AuditBundleV1` uses JSON Schema Draft 2020-12 and a closed top-level object.
Unknown fields are rejected. Arrays with canonical ordering use explicit
sequence and stable identity tie-breakers. Equal selector, canonical evidence,
and policy version produce equal normalized content and `bundleHash`.

Response timestamps, transport headers, pagination cursors, and presentation
metadata are excluded from the deterministic hash. Every included summary
binds its canonical event ID, sequence, event hash, and evidence references.

## Completeness and Fail-Closed Rules

Stable findings include at least:

- `SOURCE_UNAVAILABLE`;
- `SOURCE_WATERMARK_CHANGED`;
- `SEQUENCE_RANGE_INVALID`;
- `CHANGE_NOT_FOUND`;
- `EVIDENCE_INCOMPLETE`;
- `EVIDENCE_CONFLICT`;
- `UNSUPPORTED_EVIDENCE`;
- `PRIVACY_VIOLATION`;
- `BUNDLE_TOO_LARGE`.

A missing selected source, invalid selector, changed source watermark,
conflicting receipt/event lineage, privacy violation, or size-limit breach
fails the request. Optional unsupported evidence is represented explicitly and
does not become a fabricated successful check.

## API Boundary

Slice 1 may add only read-only routes under `/api/audit-bundles/v1`:

- `GET /projects/:projectId?fromSequence=&toSequence=&sourceWatermark=`
- `GET /projects/:projectId/changes/:changeId?sourceWatermark=`

Queries require bounded limits and an exact source watermark after the initial
discovery request. No `POST`, `PUT`, `PATCH`, or `DELETE` route is authorized.
The API MUST NOT write a bundle to disk, start a run, acquire execution
authority, publish a ledger event, call a provider, or contact an external
service.

## Dashboard Boundary

Slice 2 may add a read-only audit view that:

- chooses one existing project or exact change from Phase 6 evidence;
- displays source watermark, sequence coverage, completeness, warnings, and
  receipt/event references;
- makes unavailable, stale, partial, unsupported, and privacy-rejected states
  explicit;
- permits a direct user-initiated download of the already-returned bounded JSON
  response.

The browser MUST consume only the versioned Phase 8 GET APIs. It MUST NOT read
the command store, crawl files, auto-download, upload, share, notify, schedule,
or treat a generated bundle as authority.

## Privacy and Limits

- A bundle has fixed maximum event, receipt, reference, warning, and byte
  counts defined by the schema and service policy.
- Diagnostics are stable, bounded, and omit prohibited values.
- Privacy scanning happens before the response is released.
- Bundle generation is request-scoped and in-memory. No persistent cache,
  database, background capture, or automatic retention is authorized.

## Implementation Slices

### Slice 1: deterministic bundle service

Add schemas, parsing, deterministic joining, privacy/limit checks, GET routes,
and restart-compatible tests. Do not change the dashboard or canonical write
paths.

### Slice 2: read-only audit view

Consume only Slice 1 APIs. Add explicit loading, empty, stale, unavailable,
unsupported, privacy-rejected, and bounded-download states. Do not add sharing,
notifications, uploads, or mutation controls.

## Acceptance

Phase 8 is complete only when tests prove:

- equal canonical evidence produces an equal normalized bundle and hash;
- project and exact-change selectors cannot escape their declared scope;
- event and receipt summaries retain exact sequence/hash lineage;
- changed watermarks, conflicts, missing sources, and privacy violations fail
  closed;
- legacy Phase 1-7 ledgers remain readable without invented evidence;
- bundle generation performs no canonical or filesystem mutation;
- prohibited fields never appear in API responses, diagnostics, downloads, or
  rendered HTML;
- limits prevent unbounded memory, response, and UI growth;
- the dashboard consumes only Phase 8 GET APIs and preserves keyboard access;
- TypeScript, focused and regression tests, production build, browser checks,
  and diff checks pass.

## Explicit Non-Goals

Phase 8 v1 does not add notifications, email, chat integrations, webhooks,
sharing, uploads, remote publication, scheduled exports, background capture,
search or indexing infrastructure, a database, retention policy, signatures
from an external trust service, autonomous actions, new operator actions, new
authority types, deployment, destructive Git, or Project Map promotion.
