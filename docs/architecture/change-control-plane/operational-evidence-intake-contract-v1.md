# Operational Evidence Intake Contract v1

Status: accepted contract; Slices 1-2 implemented
Accepted: 2026-08-07
Reviewed: 2026-08-07

## Outcome

Phase 11 adds one local operator-facing dashboard for manually staging,
previewing, confirming, and inspecting the operational evidence already owned
by Phase 10. It makes the existing closed source, import, attribution, and
receipt workflows usable without asking an operator to construct HTTP requests
by hand.

Phase 11 adds no canonical event type, ledger, external connector, background
job, deployment action, billing action, automatic attribution, or outcome
claim. Phase 10 remains the only mutation authority and Phase 9 remains the
only scorecard authority.

## Authority and Source of Truth

- Phase 6 projections provide bounded project and exact change selection.
- Phase 10 project/change projections provide source, observation,
  attribution, receipt, and current project-watermark evidence.
- Phase 10 preview/execute handlers remain authoritative for import and defect
  attribution decisions.
- Phase 10 registration/revocation handlers remain authoritative for source
  lifecycle changes.
- Phase 9 scorecards consume successful Phase 10 evidence after a separate
  user-initiated refresh or calculation.
- Browser form state, selected files, pasted JSON, validation messages, and
  previews are transient and non-canonical.

The dashboard MUST NOT infer a project, change, source, observation,
attribution, provider invocation, commit, currency, or actor identity from a
display label or nearby record.

## Closed Surface

Phase 11 adds one Russian Control Plane section, `Данные результатов`, with
four bounded workflows:

1. register or supersede one evidence source;
2. revoke one active evidence source;
3. preview and execute one bounded observation import;
4. preview and execute one defect-attribution decision.

The section also renders the bounded Phase 10 projection and the immutable
receipt returned by the last successful mutation. It MUST NOT add controls to
deploy, roll back, hotfix, edit provider billing, close defects, publish data,
notify recipients, or recalculate scorecards automatically.

## Selection and Freshness

The operator selects one exact project and one exact change from Phase 6
evidence. The dashboard then reads the exact Phase 10 change projection and
binds all staged operations to its project watermark.

Changing project, change, source, observation, or workflow MUST clear every
staged preview, confirmation state, request identity, and returned receipt.
Refreshing a projection MUST invalidate a preview when its watermark or
content hash no longer matches.

The UI MUST NOT silently retry a stale mutation with a new watermark. A stale
response returns the operator to the editable staging state and requires a new
preview or review.

## Draft Boundary

Observation input is either pasted JSON or one explicitly selected local JSON
file. The browser reads the file locally and MUST reject it before any request
when it exceeds the Phase 10 65,536-byte manifest limit, is not UTF-8 JSON, is
not one closed observation array, contains prohibited fields, exceeds 100
observations, or mixes an observation kind denied by the selected source.
After constructing the authoritative envelope, the UI MUST also measure the
exact serialized Phase 10 request and reject it locally when the complete
request exceeds 65,536 bytes. The server remains authoritative and repeats the
same bound.

The UI draft contains only:

- one exact `sourceId`;
- a closed array of Phase 10 observations.

The UI constructs the Phase 10 request envelope from the selected project,
selected change, explicitly entered actor, current exact watermark, and one
generated request/idempotency identity. Imported JSON MUST NOT override those
fields. Drafts, filenames, raw bytes, and pasted text MUST NOT enter canonical
events, receipts, diagnostics, downloads, browser storage, or logs.

## Request Identity

Each staged operation receives one `requestId` and one `idempotencyKey`. They
remain stable across an exact transport retry and the preview-to-execute pair.
Editing any semantic field creates a new pair and invalidates the prior
preview. Refreshing after an ambiguous transport failure first reads the Phase
10 projection/receipts; the UI MUST NOT generate a replacement request until
it can prove the prior identity did not commit.

No Phase 11 state is written to local storage, session storage, IndexedDB, a
queue file, or the repository.

## Source Lifecycle Workflow

Source registration/supersession and revocation use the existing Phase 10
handlers, which do not expose a separate server preview. Therefore the UI MUST
provide a local two-step review:

1. stage and validate the exact closed request;
2. show source identity, family, allowed kinds, supersession/revocation target,
   actor, reason, and observed watermark;
3. require a separate explicit confirmation action;
4. execute once against the same staged content and watermark;
5. render the immutable returned receipt and refresh the projection.

The confirmation control MUST remain disabled for unknown family/kind pairs,
inactive targets, self-supersession, missing actor/reason, stale projections,
or privacy/limit violations.

## Import Workflow

Observation import is strictly preview-first:

1. stage a locally validated draft;
2. POST the constructed request with `confirm: false` to the existing Phase 10
   import-preview endpoint;
3. render `allowed`, reason codes, observation count, source watermark, and
   content hash without mutation;
4. enable execution only when the preview is allowed and still matches the
   unchanged staged request;
5. require a distinct explicit confirmation;
6. POST the same semantic request and stable identities with `confirm: true`
   to the existing execute endpoint;
7. render the immutable receipt and refresh the projection.

Preview never grants authority, and the execute handler repeats validation
against fresh canonical evidence.

## Defect Attribution Workflow

Attribution is available only for one exact effective
`PostDeliveryDefectObservationV1` and one exact candidate change shown by the
Phase 10 projection. The operator chooses `confirmed`, `rejected`, or
`unresolved`, enters a bounded reason code and evidence references, and names
an exact superseded attribution sequence when required.

Attribution follows the same server preview, unchanged-content binding,
separate confirmation, execute, receipt, and refresh sequence as imports.
Phase 11 MUST NOT recommend or preselect `confirmed`, infer causality from
commit proximity, or turn a defect decision into incident/task authority.

## UI States

Every workflow has explicit Russian states for:

- loading projection;
- empty project/change/source/observation evidence;
- editable draft;
- local validation rejected;
- preview pending, allowed, and denied;
- confirmation required;
- execution pending;
- immutable receipt returned;
- stale watermark/content;
- source unavailable;
- privacy or limit rejection;
- ambiguous transport result requiring receipt refresh.

Numeric zero, missing evidence, denial, stale evidence, and unsupported
evidence MUST remain visually and semantically distinct.

## Privacy and Diagnostics

Rendered output and errors may include only exact identifiers, closed
classifications, timestamps, integer counts/amounts, hashes, reason codes,
watermarks, and bounded evidence references already allowed by Phase 10.

The UI MUST NOT render or log raw file bytes, pasted JSON after parsing, issue
descriptions, stack traces, prompts, file contents, provider payloads,
credentials, customer content, invoice documents, or payment details. Error
messages use stable reason codes and generic Russian text without reflecting
rejected values.

## Existing API Boundary

Phase 11 consumes only the existing `/api/operational-outcomes/v1` registration,
revocation, import preview/execute, attribution preview/execute, project/change
projection, and exact-observation routes plus bounded Phase 6 selection APIs.

No new backend route is authorized by this contract. If implementation finds
that an existing route cannot preserve the declared preview, freshness,
privacy, or idempotency semantics, implementation stops for a contract
amendment rather than adding an endpoint implicitly.

## Contract Review

The 2026-08-07 review checked this boundary against the implemented Phase 6
selection APIs, all eight Phase 10 route operations, closed Phase 10 request
schemas, project-watermark fencing, adjacent immutable receipts, exact
idempotency behavior, privacy keys, the 100-observation and 65,536-byte limits,
and current Control Plane confirmation patterns.

Review findings resolved in this contract:

- source registration and revocation have no server preview, so their UI gate
  is explicitly a local review plus separate confirmation and never described
  as canonical preview authority;
- import and attribution use the existing server preview endpoints and bind
  execute to stable request identity and unchanged semantic content;
- the byte limit applies to both local input and the fully constructed request;
- ambiguous transport results are reconciled from receipts before any new
  request identity is generated;
- Slice 1 is read-only, keeping mutation UI out of the first implementation
  boundary;
- no new route, event, connector, persistence, or autonomous authority is
  implied.

Review result: accepted with no unresolved blocking finding. This acceptance
authorizes implementation only in the declared slices and does not authorize
Slice 2 work before Slice 1 is independently verified.

## Implementation Slices

### Slice 1: read-only intake shell

Add the Russian section, exact Phase 6 selection, bounded Phase 10 projection,
source/observation/attribution/receipt rendering, and explicit loading, empty,
unavailable, privacy, and stale states. Add no mutation controls in this slice.

Implemented on 2026-08-07. The Control Plane exposes exactly one `Данные
результатов` entry, reads exact project/change identities from bounded Phase 6
GET projections, and reads the existing exact-change Phase 10 GET projection
only after an explicit operator action. Rendering bounds evidence references
and exposes source, observation, attribution, receipt, watermark, loading,
empty, unavailable, privacy, limit, and stale states. Slice 1 contains no
mutation route, file input, draft persistence, or automatic request.

### Slice 2: confirmed manual workflows

Add source lifecycle local review/confirmation plus import and attribution
server preview/confirmation/execute flows. Preserve stable request identity,
ambiguous-result receipt refresh, and no browser/repository draft persistence.

Implemented on 2026-08-07. Source registration/supersession and revocation use
a local closed-request review followed by a separate execute action. Import and
defect attribution use the existing server preview endpoints, retain one
request/idempotency identity through preview and execution, and enable execute
only for an allowed preview bound to the current watermark. The UI locally
rejects non-UTF-8, non-array, non-closed, prohibited, wrong-kind, over-count,
and over-65,536-byte drafts; parsed raw input and filenames are not retained or
rendered. Ambiguous execution first refreshes receipts by the original
`requestId` and permits only an exact same-identity retry when no receipt is
found. Attribution starts without a selected decision and accepts only an
exact candidate change.

Slice 2 verification passed on 2026-08-07: five focused Phase 11 tests,
TypeScript, production build, context smoke 3/3, diff checks, and the full
265/265 Windows regression pass. In-app Chromium QA used an isolated temporary
ledger to exercise exact selection, projection read, local source review,
allowed no-mutation import preview, explicit execute, receipt rendering, and
projection refresh at 1280 px. The same state and an attribution-without-
candidate guard were checked at 390 px with no console warning/error,
framework overlay, page-level horizontal overflow, automatic attribution
choice, or raw draft left in the DOM. The temporary ledger was deleted after
QA and no repository or ordinary user data was mutated.

## Acceptance

Phase 11 is complete only when both slices and their tests prove:

- project/change selection uses exact bounded Phase 6 evidence;
- draft parsing is closed, UTF-8, privacy-safe, count/byte bounded, and local;
- imported JSON cannot override project/change/actor/watermark/request identity;
- editing or changing selection invalidates preview and confirmation;
- preview performs no canonical or filesystem mutation;
- execute uses identical semantic content and stable request identity;
- stale watermarks and changed content fail before mutation;
- duplicate and ambiguous transport retries resolve through receipts without a
  second effective mutation;
- source lifecycle controls fail closed on inactive or conflicting targets;
- attribution never auto-confirms and requires an exact candidate change;
- raw drafts and prohibited values never enter responses, logs, HTML,
  downloads, browser storage, repository files, or canonical events;
- legacy Phase 1-10 projects remain readable and the section exposes explicit
  empty/unsupported states;
- TypeScript, focused domain/API/UI tests, full Windows regression, production
  build, context smoke, diff checks, and desktop/390 px rendered interaction
  checks pass.

## Explicit Non-Goals

Phase 11 v1 does not add connectors, polling, webhooks, drag-and-drop bulk
directories, CSV/XLSX parsing, background imports, scheduled jobs, databases,
draft persistence, search, notifications, publication, deployment or rollback
execution, defect-system mutation, provider billing/payment operations,
currency conversion, automatic attribution, causal inference, scorecard
recalculation, impact claims, budgets, SLAs, mobile-native file sharing, new
operator actions, new canonical event types, or Project Map promotion.
