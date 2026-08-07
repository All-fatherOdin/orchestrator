# GitHub Deployment Connector Contract v1

Status: accepted and formally reviewed; Slice 1 implemented
Accepted: 2026-08-07
Reviewed: 2026-08-07
Slice 1 implemented: 2026-08-07

## Outcome

Phase 12 adds one manually triggered, read-only GitHub REST adapter that can
turn one exact terminal production deployment status into the existing Phase
10 `DeploymentObservationV1`. The adapter removes manual JSON construction but
does not create a second evidence authority, metric, event type, scheduler, or
deployment control.

Version 1 supports exactly one provider and one observation family:

- provider: `github.com` REST API;
- adapter: `github-deployments-v1`;
- evidence family and kind: `deployment`;
- environment class: `production` only;
- mapped outcomes: GitHub `success` to `succeeded`, and GitHub `failure` or
  `error` to `failed`.

Every other GitHub deployment state is explicitly unsupported. In particular,
`inactive` does not prove rollback, and no GitHub field is used to infer
`rolled-back`, `hotfix`, or `production-rework`.

## Authority and Source of Truth

- Phase 6 supplies the exact project/change selection.
- Phase 10 remains the only canonical source, observation, import-receipt,
  idempotency, watermark, and replay authority.
- GitHub remains authoritative for the exact deployment, deployment-status,
  commit, and tree objects returned by its API.
- A GitHub response becomes usable Orchestrator evidence only after Phase 10
  validates it and atomically publishes its existing immutable receipt.
- Phase 9 remains the only scorecard authority; Phase 12 never recalculates a
  scorecard automatically.
- Runtime connector configuration and secrets are operational inputs, not
  canonical evidence and not repository state.

The connector MUST NOT infer a project, change, commit, tree, environment, or
outcome from a display name, branch, tag, description, URL, timestamp
proximity, workflow name, actor, or repository name.

The selected canonical change details MUST contain exact `targetCommitSha` and
`targetTreeSha` Git object identities. Missing, malformed, or mismatched target
identities stop before a remote request. Phase 12 does not add those identities
to a change or derive them from nearby merge/run evidence.

## Closed Runtime Configuration

One server-start configuration binds:

- the fixed API origin `https://api.github.com`;
- one exact repository owner and repository name;
- one exact case-sensitive GitHub production-environment name;
- one exact active Phase 10 `sourceId`;
- adapter identity `github-deployments-v1`;
- API version `2026-03-10`;
- one secret reference resolving to a read-only GitHub token;
- one bounded request timeout and response-byte policy fixed by this contract.

The repository coordinates and token are never accepted from an HTTP request.
The token is read server-side from the process secret provider, never sent to
the browser, and never written to a ledger, receipt, diagnostic, file, URL, or
log. The configured Phase 10 source MUST be active, family `deployment`, allow
kind `deployment`, use source system `github-deployments`, and use format
version `github-deployments-v1`.

The credential MUST be a fine-grained personal access token or GitHub App
installation token restricted to the configured repository with only
`Deployments: read` and `Contents: read`. Classic broad `repo` credentials are
outside the accepted operational configuration.

## Closed Request

Both Phase 12 operations accept one closed request containing only:

- `contractType` and `contractVersion`;
- stable `requestId` and `idempotencyKey`;
- exact `projectId`, `changeId`, and Phase 10 project watermark;
- exact configured `sourceId`;
- authorized actor;
- positive decimal-string `deploymentId` and `deploymentStatusId`;
- `confirm`, fixed to `false` for preview and `true` for execute;
- for execute, the exact preview `remoteSnapshotHash` and Phase 10 normalized
  content hash.

The request MUST NOT contain an API origin, repository, token, environment,
outcome, commit SHA, tree SHA, occurrence time, evidence references, or raw
GitHub object. The closed request limit is 8 KiB.

## Exact Remote Reads

Each preview or execute performs exactly these three authenticated GETs and no
other external call:

1. `GET /repos/{owner}/{repo}/deployments/{deploymentId}`;
2. `GET /repos/{owner}/{repo}/deployments/{deploymentId}/statuses/{deploymentStatusId}`;
3. `GET /repos/{owner}/{repo}/git/commits/{deployment.sha}`.

Requests use `Accept: application/vnd.github+json`, the pinned API-version
header, HTTPS, and the server-only bearer token. Redirects are rejected. DNS,
proxy, or response data cannot replace the fixed API origin or configured
repository. Each request has a ten-second timeout, a 256 KiB response limit,
and the three responses have a combined 512 KiB limit.

The adapter extracts only the allowlisted fields required below and discards
the raw response after the operation. Unknown response fields are ignored in
memory; missing, wrongly typed, or conflicting required fields fail closed.

## Deterministic Mapping

The adapter accepts a remote snapshot only when all of these checks pass:

- deployment and status IDs exactly equal the requested decimal identities;
- the status belongs to the exact deployment and configured repository;
- `deployment.sha` and the Git commit-object SHA are equal full Git SHAs;
- the Git commit object supplies one exact tree SHA;
- `deployment.production_environment` is exactly `true`;
- deployment and status environment identities match the configured
  production-environment identity without normalization or fuzzy comparison;
- the exact status state is `success`, `failure`, or `error`;
- the selected Phase 6 change and Phase 10 validation prove the same exact
  commit and tree identities;
- the configured source is still active and its policy permits deployment
  observations.

The generated Phase 10 observation uses:

- repository fingerprint `SHA-256("github.com\0" + lower(owner) + "\0" +
  lower(repository))`;
- `sourceRecordId` equal to
  `ghd:<first-16-fingerprint-hex>:<deploymentId>:<deploymentStatusId>`;
- `observationId` equal to `ghdo:<first-32-hex-of-SHA-256(sourceId + "\0" +
  sourceRecordId)>`;
- the status `created_at` as `occurredAt`;
- the explicitly selected exact `changeId`;
- the remote commit and tree SHAs;
- fixed `environmentClass: production`;
- only the closed outcome mapping declared above;
- bounded evidence references containing opaque repository fingerprint,
  deployment ID, status ID, and commit SHA only.

Names, descriptions, payloads, creator profiles, log URLs, environment URLs,
HTML URLs, commit messages, signatures, author data, and file diffs never enter
the observation, receipt, response, diagnostic, HTML, download, or log.

`remoteSnapshotHash` is SHA-256 over canonical UTF-8 JSON with sorted keys and
exactly these values: adapter version, API version, repository fingerprint,
deployment ID, status ID, deployment SHA, deployment environment,
`production_environment`, status state, canonicalized status `created_at`,
commit-object SHA, and tree SHA. No raw response field or URL is part of the hash. Phase 10
calculates its existing normalized content hash independently over the complete
generated import request.

GitHub timestamps are parsed only when they are exact UTC ISO-8601 values and
are serialized with `Date.toISOString()` into the canonical millisecond form
required by Phase 10. No local timezone or current time enters the mapping.

## Preview, Confirmation, and Mutation

Phase 12 adds exactly two POST routes under
`/api/evidence-connectors/v1/github-deployments`:

- `/preview` performs the three remote GETs, validates and normalizes the
  snapshot, delegates to the existing Phase 10 no-mutation import preview, and
  returns a bounded sanitized preview;
- `/execute` requires explicit confirmation, repeats the same three remote
  GETs, requires the same remote snapshot and normalized content hashes, and
  delegates the only mutation to the existing Phase 10 import execute handler.

Preview returns exact IDs, mapped closed classifications, hashes, counts,
watermark, `allowed`, and stable reason codes only. Preview grants no authority
and creates no connector cache, file, event, receipt, or browser storage.

Execute reuses the same request and idempotency identities. A changed remote
snapshot, project watermark, source, change selection, actor, or semantic
request invalidates confirmation and requires a new preview. The connector
MUST NOT silently refresh a stale watermark or substitute a new request
identity.

If transport becomes ambiguous after Phase 10 execute begins, the service
reconciles the existing Phase 10 receipt by exact `requestId` before allowing
an exact same-identity retry. A connector-specific receipt is prohibited.

## Failure and Retry Semantics

At minimum, Phase 12 distinguishes these stable outcomes:

| Reason | Required outcome |
| --- | --- |
| `CONNECTOR_NOT_CONFIGURED` | No remote request |
| `CONNECTOR_SECRET_UNAVAILABLE` | No remote request or secret reflection |
| `CONNECTOR_SOURCE_INVALID` | No remote request |
| `CONNECTOR_REQUEST_INVALID` | Reject closed-request violation |
| `CONNECTOR_REMOTE_UNAUTHORIZED` | Reject with generic bounded diagnostic |
| `CONNECTOR_REMOTE_NOT_FOUND` | Reject without revealing repository data |
| `CONNECTOR_REMOTE_RATE_LIMITED` | Reject and expose only bounded retry time |
| `CONNECTOR_REMOTE_TIMEOUT` | Reject; no automatic retry |
| `CONNECTOR_REMOTE_TOO_LARGE` | Abort bounded read |
| `CONNECTOR_REMOTE_INVALID` | Reject malformed or incomplete response |
| `CONNECTOR_REMOTE_IDENTITY_MISMATCH` | Reject conflicting deployment/status/commit |
| `CONNECTOR_REMOTE_STATE_UNSUPPORTED` | Preserve no observation |
| `CONNECTOR_REMOTE_SNAPSHOT_CHANGED` | Invalidate confirmation before mutation |
| `CONNECTOR_PROJECT_WATERMARK_CHANGED` | Return to preview state |
| `CONNECTOR_RESULT_AMBIGUOUS` | Reconcile Phase 10 receipt before retry |

There is no automatic retry. For GitHub `403` or `429`, the response may expose
only the parsed integer `Retry-After` or rate-limit reset time, never arbitrary
headers or response bodies. A new attempt requires a direct user action.

## Privacy and Network Boundary

The adapter is deny-by-default outbound networking. It contacts only the fixed
GitHub API origin and only the three GET paths derived from configured
repository coordinates and validated numeric/SHA identities. It never follows
redirects, fetches returned URLs, accepts a caller URL, or sends a write method.

Remote response bodies are transient and must not enter telemetry, error
objects, snapshots, test artifacts, browser state, downloads, repository files,
or canonical events. Logs may contain only request identity, adapter version,
bounded reason code, integer duration/counts, and opaque hashes. Tokens,
authorization headers, owner/repository names, descriptions, payloads, users,
URLs, commit messages, signatures, and file content are prohibited.

## UI Boundary

Slice 2 may add one bounded Russian workflow inside the existing Operational
Evidence Intake section. It uses exact Phase 6 project/change selection and
shows connector availability, source identity, two numeric GitHub identities,
sanitized preview, explicit confirmation, immutable Phase 10 receipt, stale
state, rate-limit state, and generic unavailable/error states.

The UI never receives or requests a token or repository coordinate. Changing
project, change, source, deployment ID, status ID, or actor clears preview,
confirmation, and prior request identity. No outcome is editable or preselected.

## Implementation Slices

### Slice 1: closed server adapter

Add runtime configuration parsing, the three-read GitHub adapter, closed
request/response schemas, deterministic normalization, two POST routes, Phase
10 delegation, privacy/limit enforcement, exact idempotency, ambiguity
reconciliation, and mocked-network tests. Tests MUST prove that preview does
not mutate canonical state or the filesystem and that no external write method
is reachable. Do not add UI in this slice.

Implemented on 2026-08-07. The server loads one closed environment-backed
configuration with a non-enumerable token, rejects partial configuration, and
exposes exactly the declared preview/execute routes. The adapter performs only
the three fixed GETs with pinned API version, fixed origin/repository, redirect
denial, timeout, per-response and aggregate byte bounds, fatal UTF-8 JSON
parsing, bounded rate-limit handling, and no automatic retry. Exact canonical
change target identities, source policy, project watermark, deployment/status/
commit/tree/environment identities, deterministic IDs and snapshot hash, Phase
10 no-mutation preview, explicit execute, refetch, stable content identity,
idempotency, restart replay, and receipt-first ambiguity reconciliation are
implemented. It adds no connector event, receipt, cache, file, remote write, or
UI.

Five focused Slice 1 tests pass. They cover closed schemas/configuration,
secret non-serialization, exact three-GET preview with byte-for-byte ledger
no-mutation, private-field exclusion, refetch and one effective import,
replay/idempotency, receipt reconciliation without network after source
revocation and token loss, missing target identity, changed snapshot,
rate-limit, oversized response, timeout, and bounded HTTP errors. The combined
Phase 10/12 focused run passes 11/11. TypeScript, production build, context
smoke 3/3, diff checks, and the full Windows regression pass 270/270 with zero
failures and zero skips in 422.88 seconds.

### Slice 2: confirmed operator workflow

Implemented on 2026-08-07. The bounded Russian preview/confirmation workflow
is part of the Phase 11 intake section. It exposes only exact active compatible
sources, accepts only the two numeric GitHub identities, renders a sanitized
preview, requires direct confirmation, preserves the immutable Phase 10
receipt through projection refresh, and permits only receipt reconciliation or
an exact same-request retry after ambiguity. Configured, unavailable, stale,
changed-snapshot, rate-limit, ambiguous, receipt, desktop, and 390 px states
are covered without another connector, source registration automation,
polling, storage, secret controls, outcome controls, or scorecard controls.

Three focused Slice 2 UI tests and the combined Phase 12 run pass 8/8.
TypeScript, production build, context smoke 3/3, diff checks, and the full
Windows regression pass 273/273 with zero failures and zero skips in 391.6
seconds. Local mocked browser interaction passes at desktop and 390 px with a
clean console, sanitized preview, explicit confirmation, import, projection
refresh, and the immutable receipt preserved. No live GitHub credential or
external request was used.

## Contract Review

The 2026-08-07 formal review checked the contract against the implemented Phase
6 selection boundary, Phase 10 source/import schemas and mutation authority,
Phase 11 confirmation and receipt-reconciliation behavior, and current GitHub
REST deployment, deployment-status, Git-commit, authentication, and rate-limit
documentation.

Review findings resolved in this version:

- caller-controlled origin/repository fields would create SSRF and authority
  expansion, so both are fixed server-start configuration;
- a browser token would violate the privacy boundary, so credentials remain
  server-only and least-privilege read-only;
- GitHub deployment statuses do not prove rollback, hotfix, or production
  rework, so only success/failure/error have a mapping;
- Phase 10 proves that a change exists but does not bind deployment commit/tree
  fields to that change, so Phase 12 additionally requires exact canonical
  `targetCommitSha` and `targetTreeSha` change details before any remote read;
- list ordering, pagination, and the 90-day prior-status retention window are
  avoided by requiring exact deployment and status IDs;
- GitHub responses contain prohibited free-form fields, so the adapter extracts
  a strict allowlist and discards raw bodies;
- preview-to-execute races are closed by an exact refetch and snapshot-hash
  comparison, followed by Phase 10 freshness validation;
- automatic retry could amplify rate limits or duplicate ambiguous mutations,
  so all retries are user-initiated and mutation ambiguity uses Phase 10
  receipt reconciliation;
- the connector has no independent canonical receipt, scheduler, webhook, or
  background state.

Review result: accepted with no unresolved blocking finding. This acceptance
authorizes only the two declared implementation slices. It does not itself
implement Phase 12 or authorize another provider or evidence family.

## Acceptance

Phase 12 is complete only when both slices and tests prove:

- request schemas reject unknown fields, caller URLs/repositories, raw remote
  objects, secrets, and non-exact identities;
- outbound requests are exactly three GETs to the configured GitHub origin and
  repository, with redirects and all write methods unreachable;
- only exact terminal production success/failure/error snapshots map to one
  closed `DeploymentObservationV1`;
- commit, tree, change, source, and watermark identities fail closed on any
  mismatch;
- preview performs external reads but no canonical or filesystem mutation;
- execute refetches, matches both hashes, and delegates one mutation to Phase
  10 with stable request/idempotency identity;
- duplicate, concurrent, stale, and ambiguous executions cannot create a
  second effective observation;
- rate limits, timeout, oversized response, invalid JSON, missing status, and
  credential failures are bounded and do not auto-retry;
- tokens and prohibited remote fields never enter responses, diagnostics,
  logs, HTML, downloads, storage, repository files, or canonical events;
- restart retains no connector draft/cache while Phase 10 replay preserves any
  successfully imported observation and receipt;
- legacy Phase 1-11 projects remain readable with explicit connector-unavailable
  state;
- TypeScript, focused schema/domain/API/UI tests, full Windows regression,
  production build, context smoke, diff checks, and desktop/390 px rendered
  interaction checks pass.

## Explicit Non-Goals

Phase 12 v1 does not add GitHub Actions workflow/run ingestion, repository or
deployment enumeration, GitHub Enterprise, OAuth setup UI, token storage,
webhooks, polling, schedules, background jobs, caches, queues, databases,
search, notifications, publication, deployment/status creation or deletion,
rollback/hotfix/rework inference, defect or billing connectors, automatic
source registration, automatic attribution, scorecard recalculation, remote
URLs in evidence, arbitrary HTTP adapters, or Project Map promotion.

## External API Basis

Reviewed on 2026-08-07 against GitHub's official documentation:

- [REST deployments](https://docs.github.com/en/rest/deployments/deployments)
  documents exact deployment reads and `Deployments: read` access;
- [REST deployment statuses](https://docs.github.com/en/rest/deployments/statuses)
  documents exact status reads, closed GitHub states, and prior-status
  retention;
- [REST Git commits](https://docs.github.com/en/rest/git/commits) documents the
  exact commit-object/tree read and `Contents: read` access;
- [REST authentication](https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api)
  documents bearer authentication and the version header;
- [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
  documents bounded reset and retry headers for `403`/`429` handling.
