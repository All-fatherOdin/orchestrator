# Operational Outcome Evidence Contract v1

Status: accepted contract; Slice 1 implemented and verified
Accepted: 2026-08-07
Slice 1 implemented: 2026-08-07

## Outcome

Phase 10 adds a bounded, deterministic, privacy-safe authority for importing
operational outcome evidence that Orchestrator cannot observe by itself. Version
1 covers exactly three evidence families:

- deployment outcomes, including failed deployment, rollback, hotfix, and
  production rework observations;
- post-delivery defects with fixed 7-, 30-, and 90-day observation windows;
- measured provider monetary cost tied to exact invocations.

The evidence may make corresponding Phase 9 metrics measurable. Importing an
observation does not prove business impact, authorize deployment or rollback,
close an incident, change task acceptance, or grant runtime authority.

## Authority and Source of Truth

- Existing project ledgers remain canonical for Phase 10 source registrations,
  imports, attribution decisions, revocations, and immutable receipts.
- `.orchestrator/runs/<run-id>/run.json` remains canonical for concrete run,
  task, attempt, invocation, timing, and token observations.
- External deployment, defect, and billing systems remain authoritative for
  their own records. A reference to such a record becomes usable by
  Orchestrator only after a validated import receipt is atomically published.
- Phase 9 scorecards remain derived, request-scoped projections. They do not
  become an operational ledger or evidence authority.
- Display names, free-form titles, branch names, fuzzy timestamps, and file
  proximity MUST NOT be used as join keys.

Phase 10 reuses the existing append-only project hash chain. It MUST NOT create
a second ledger, run store, telemetry database, scheduler, incident system, or
eval registry.

## Closed Evidence Sources

Every import binds an immutable `OperationalEvidenceSourceV1` registration:

- stable `sourceId`, source family, owner actor, and policy version;
- source-system identity and export/adapter format version;
- allowed project scope and allowed evidence kinds;
- identity-key definition for duplicate detection;
- privacy classification and prohibited-field policy;
- active, revoked, or superseded lifecycle state.

Version 1 source families are exactly `deployment`, `defect`, and
`provider-billing`. Source registration and lifecycle changes require an
explicit authorized human actor. Revocation blocks new imports but never
rewrites accepted history.

No source registration grants permission to contact an external service.
Phase 10 v1 accepts caller-supplied bounded manifests only.

## Closed Observation Types

### DeploymentObservationV1

A deployment observation records:

- immutable source record identity and occurrence time;
- exact project, change, target commit, and target tree identities;
- environment class from a closed non-secret registry;
- outcome: `succeeded`, `failed`, `rolled-back`, `hotfix`, or
  `production-rework`;
- exact predecessor/successor observation references when applicable;
- bounded evidence references and an attribution receipt.

A rollback or hotfix observation does not authorize the corresponding action.
The observation reports an outcome that already occurred elsewhere.

### PostDeliveryDefectObservationV1

A defect observation records:

- immutable source defect identity, detection time, and closed severity;
- exact project and affected released commit/tree identities;
- sanitized defect class and lifecycle state;
- one or more explicit candidate change references;
- a separately authorized attribution decision: `confirmed`, `rejected`, or
  `unresolved`;
- fixed observation-window eligibility for 7, 30, and 90 days.

Only `confirmed` attribution may enter an escaped-defect numerator.
`Unresolved` evidence remains visible and excluded. Importing a defect does not
prove that an agent, prompt, model, or individual caused it.

### ProviderCostObservationV1

A provider cost observation records:

- immutable provider billing record identity;
- exact project, run, task, attempt, and invocation bindings;
- provider and billing-period identity;
- ISO 4217 currency code and integer minor-unit amount;
- measurement state: `measured` or `credited`;
- bounded evidence references and source receipt identity.

Version 1 does not estimate price from tokens, perform currency conversion,
allocate unlinked invoice totals, or infer missing provider charges. A metric
may aggregate only one currency and only when all included invocation bindings
have complete, non-conflicting evidence. Credits remain explicit signed
contributions and cannot be silently discarded.

## Import and Attribution Lifecycle

The canonical lifecycle is:

1. register or select one active evidence source;
2. validate one closed bounded import manifest;
3. resolve exact project/run/commit/invocation identities;
4. reject prohibited, stale, ambiguous, conflicting, or oversized evidence;
5. atomically publish the owning observation and
   `OperationalEvidenceImportReceiptV1`;
6. replay the project ledger to reproduce the same projection;
7. when required, publish a separate human attribution decision;
8. allow Phase 9 to consume only effective, completely joined evidence.

An exact retry with the same idempotency key, source identity, normalized
content hash, and project watermark returns the original receipt. Reusing an
idempotency key for different content fails closed. Two concurrent contenders
for the same source record serialize through the existing project writer; at
most one normalized observation becomes effective.

Accepted observations are immutable. Correction uses a new superseding
observation that references the prior identity and explains the bounded reason.
Conflicting effective observations remain excluded until an authorized
supersession resolves them.

## Watermarks and Determinism

Every mutation request binds:

- exact project sequence and terminal event hash;
- source registration identity and version;
- normalized manifest SHA-256 and byte length;
- exact referenced run-record SHA-256/byte length when run evidence is used;
- exact commit/tree or invocation identities required by its evidence kind;
- caller-provided idempotency key and authorized actor.

Stale watermarks, changed run identities, missing commits, ambiguous changes,
unlinked invocations, and conflicting source records fail before publication.
Equal canonical evidence and policy version produce equal normalized
observation content and hashes after restart.

## Privacy and Limits

Phase 10 records identities, timestamps, closed classifications, integer
amounts, hashes, reason codes, and bounded evidence references only.

The following are prohibited in manifests, ledger events, receipts,
diagnostics, API responses, and rendered views:

- raw issue descriptions, stack traces, logs, prompt bodies, or file contents;
- credentials, environment values, customer content, personal data, or secrets;
- provider-hidden reasoning or raw provider payloads;
- invoice documents, payment details, account numbers, or tax identifiers;
- arbitrary external-system metadata or unbounded free-form fields.

Version 1 limits one request to 100 observations, 64 KiB normalized input, 100
diagnostics, 50 evidence references per observation, and 200 exact identity
bindings. Diagnostics use stable reason codes and never echo rejected values.

## Stable Fail-Closed Reason Codes

At minimum, implementation MUST distinguish:

| Reason | Required outcome |
| --- | --- |
| `OUTCOME_SOURCE_UNKNOWN` | Reject import |
| `OUTCOME_SOURCE_REVOKED` | Reject new import |
| `OUTCOME_SOURCE_KIND_DENIED` | Reject import |
| `OUTCOME_SOURCE_IDENTITY_CONFLICT` | Reject or quarantine conflicting record |
| `OUTCOME_PROJECT_WATERMARK_CHANGED` | Reject stale request |
| `OUTCOME_MANIFEST_INVALID` | Reject closed-schema violation |
| `OUTCOME_MANIFEST_TOO_LARGE` | Reject before publication |
| `OUTCOME_PRIVACY_VIOLATION` | Reject with bounded diagnostic |
| `OUTCOME_IDENTITY_MISSING` | Reject required join |
| `OUTCOME_IDENTITY_CHANGED` | Reject changed run/commit identity |
| `OUTCOME_IDENTITY_AMBIGUOUS` | Reject fuzzy or multiple joins |
| `OUTCOME_ATTRIBUTION_REQUIRED` | Preserve observation; exclude metric |
| `OUTCOME_ATTRIBUTION_CONFLICT` | Exclude until superseded |
| `OUTCOME_CURRENCY_MISMATCH` | Exclude cross-currency aggregation |
| `OUTCOME_COST_INCOMPLETE` | Preserve unsupported/insufficient metric state |
| `OUTCOME_IDEMPOTENCY_CONFLICT` | Reject conflicting retry |

Unknown contract, source, policy, classification, currency, reason-code, or
adapter versions fail closed and cannot be translated to warnings or defaults.

## API Boundary

Slice 1 may add only these mutation/read APIs under
`/api/operational-outcomes/v1`:

- source registration, bounded source listing, revocation, and supersession;
- deterministic no-mutation import preview;
- explicit-confirmation import execution returning an immutable receipt;
- bounded project/change observation reads by exact identity;
- explicit attribution preview and execution for defect/change links.

Preview never grants authority. Execution MUST repeat all validation against a
fresh project watermark and delegate publication to the existing project
writer. No endpoint may contact a provider, deployment system, defect tracker,
billing service, email service, webhook, or remote publication target.

## Phase 9 Extension Boundary

Slice 2 may extend the scorecard registry with:

- `escapedDefects7Day`, `escapedDefects30Day`, and `escapedDefects90Day`;
- `deploymentFailureRate`, `rollbackRate`, `hotfixRate`, and
  `productionReworkRate`;
- `providerMonetaryCost` with one explicit currency.

Every metric retains explicit numerator, denominator, coverage, exclusions,
evidence references, and `complete`, `insufficient-evidence`, or `unsupported`
status. A deployment denominator requires an exact eligible deployment cohort.
A defect denominator requires a completed observation window. Provider cost
requires complete invocation coverage. Missing or unresolved evidence never
becomes zero.

Business impact, customer impact, productivity savings, bug-free-delivery
claims, and manual baseline comparison remain unsupported.

The existing read-only scorecard dashboard may render the new evidence states
and direct-download the already-returned bounded JSON. It MUST NOT add import,
attribution, deployment, rollback, billing, or notification controls.

## Implementation Slices

### Slice 1: canonical operational evidence

Add closed Draft 2020-12 schemas, source and observation entities, semantic
validators, preview/execute handlers, atomic receipts, deterministic replay,
privacy/limit enforcement, exact idempotency, concurrency fencing, restart
behavior, and HTTP integration tests. Do not change scorecard calculations or
the dashboard.

Implemented with five closed ledger event types, closed Draft 2020-12 schemas,
project/change/exact-observation reads, source registration/supersession/
revocation, deterministic no-mutation import and attribution previews, fresh
explicit-confirmation execution, adjacent immutable receipts in one atomic
ledger write, exact idempotency, serialized duplicate handling, restart replay,
privacy and 64 KiB/count limits, defect-attribution supersession, and exact
resolved-provider invocation fencing. Six focused schema/domain/API tests pass.

### Slice 2: scorecard consumption

Extend only the Phase 9 domain service, schemas, focused APIs, tests, and
read-only dashboard states to consume effective Phase 10 evidence. Preserve
legacy Phase 1-9 behavior and keep every still-unsupported outcome explicit.

Implemented with effective in-range source/observation supersession,
production deployment cohorts, completed 7/30/90-day windows, confirmed defect
attribution, complete exact provider-invocation coverage, one explicit
minor-unit currency, closed scorecard schemas, reconstructible evidence, and
read-only Russian metric cards. Legacy scorecards retain the original eight
operational outcomes as unsupported when no Phase 10 evidence exists.

Automatic external connectors are a future separately authorized phase, not a
Phase 10 implementation slice.

Fresh verification on 2026-08-07 passed the 16 focused Phase 9/10 tests,
TypeScript, the production Vite build, rendered desktop QA without console
errors, `git diff --check`, and the full Windows server/Electron regression:
260/260 with zero failures and zero skips in 433.18 seconds.

## Acceptance

Phase 10 is complete only when tests prove:

- schemas/examples accept every closed valid kind and reject unknown fields;
- exact retries return one receipt and conflicting retries fail closed;
- concurrent duplicate imports publish at most one effective observation;
- stale watermarks and changed run/commit identities fail before mutation;
- restart replay reproduces source, observation, attribution, and receipt state;
- raw external payloads and prohibited fields never enter canonical state,
  responses, diagnostics, downloads, or rendered HTML;
- defect metrics require confirmed attribution and completed windows;
- deployment metrics use exact eligible cohorts and reconstructible outcomes;
- provider cost never estimates, converts currency, or drops credits;
- legacy ledgers and scorecards retain explicit unsupported results without
  invented Phase 10 evidence;
- preview performs no canonical or filesystem mutation;
- TypeScript, focused tests, full Windows regression with a ten-minute window,
  production build, rendered desktop/mobile checks, and diff checks pass.

## Explicit Non-Goals

Phase 10 v1 does not add external connectors, polling, webhooks, scheduled or
background imports, a database, search/indexing, notification, publication,
deployment execution, rollback execution, issue-tracker mutation, billing or
payment operations, pricing estimation, currency conversion, automatic defect
attribution, causal inference, business/customer impact, productivity savings,
automatic baselines, budgets, SLAs, champion decisions, new Doctor recipes,
destructive Git authority, or Project Map promotion.
