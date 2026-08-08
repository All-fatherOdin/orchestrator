# Incident-to-Eval Candidate Contract v1

Status: implemented and completion-reviewed

Authorized: 2026-08-08

Completed: 2026-08-08

Completion review:
`incident-to-eval-candidate-completion-review-v1.md`.

Depends on:

- `halts-incidents-contract-v1.md`;
- `prompt-model-eval-lineage-contract-v1.md`;
- `agentic-patterns-integration-plan-v1.md`.

## 1. Outcome

S1 adds the smallest coherent bridge from one exact canonical Phase 4 incident
to one sanitized, deterministic eval-case candidate. It does not publish or
modify an `EvalSuiteV1`, run an eval, close or transition an incident, authorize
retry/repair/resume, select a champion, or grant runtime authority.

The bridge has two backend operations:

1. deterministic no-mutation preview from exact canonical evidence;
2. explicit-confirmation recording of the exact previewed candidate as one
   immutable event in the existing project ledger.

There is no S1 UI. Later suite publication, if ever authorized, is a separate
contract and must create a new immutable suite version through the existing
Phase 5 publisher.

## 2. Authority and source hierarchy

The first applicable source wins:

1. current owner instruction;
2. current code, schemas, tests, and exact canonical project ledger;
3. this accepted contract and active operational documentation;
4. secondary navigation and research evidence.

The canonical incident, halt, change, wave, task, attempt, prompt/model binding,
and resolved invocation remain owned by their existing Phase 1-5 entities.
`IncidentEvalCandidateV1` is canonical only as evidence that a candidate was
recorded. It is not a canonical eval case, suite member, incident disposition,
acceptance result, or runtime policy.

## 3. Reused boundaries

S1 MUST reuse:

- the Phase 4 incident, effective halt, correlation, attribution, state, and
  replay projections;
- the Phase 5 prompt artifact, model route, attempt binding, resolved execution,
  `EvalCaseV1`, and suite lineage semantics;
- the existing append-only hash-chained project ledger, project writer,
  cross-process serialization, sequence, replay, and corruption handling;
- the existing stable canonical JSON/hash conventions;
- existing bounded private error and prohibited-field conventions.

S1 MUST NOT create a second incident ledger, eval registry, suite registry,
publisher, project writer, event store, idempotency store, or replay family.

## 4. Closed entities

### 4.1 IncidentEvalCandidateV1

The recorded candidate is a closed versioned object with:

- `contractType: IncidentEvalCandidateV1` and `contractVersion: 1.0`;
- deterministic `candidateId` derived from contract version, exact source
  snapshot, fixture reference, oracle requirement, and normalized evidence;
- exact `projectId`, `changeId`, and `incidentId`;
- exact incident fingerprint/version and the effective ordered `haltIds` used;
- exact optional `waveId`, `taskId`, and `attemptId` only when canonical evidence
  proves one unambiguous shared scope;
- exact optional Phase 5 `bindingId`, `invocationId`, prompt artifact IDs, and
  model route ID only when the attempt/invocation join is complete and
  unambiguous;
- one reference-only input fixture descriptor containing a stable reference,
  content hash, byte length, and privacy classification;
- one oracle requirement compatible with the shape of
  `EvalCaseV1.acceptanceOracle`: `executable` with a registered objective oracle
  reference, or `human` with an explicit human-oracle requirement reference;
- severity mapped deterministically from the canonical incident severity;
- normalized, sorted, unique evidence references sufficient to reconstruct the
  candidate without embedding their raw content;
- exact source ledger watermark and deterministic source snapshot hash;
- generation policy identity and privacy policy identity;
- `recordedBy` and `recordedAt` supplied only to the immutable record event and
  excluded from deterministic candidate identity.

Candidate IDs and content hashes MUST exclude wall-clock preview time, request
IDs, actor display text, and ledger sequence. Equal canonical evidence and
equal normalized proposal input MUST produce byte-equal candidate content.

### 4.2 IncidentEvalCandidatePreviewV1

Preview is a request-scoped closed response with:

- deterministic request identity;
- exact project and incident selectors;
- supplied expected project watermark and observed watermark;
- status: `ready`, `insufficient-evidence`, `unsupported`, `conflict`, or
  `stale`;
- stable sorted reason codes and bounded private diagnostics;
- candidate only when status is `ready`;
- deterministic candidate hash and normalized confirmation binding only when
  status is `ready`;
- no mutation, event ID, sequence, or implied authorization.

### 4.3 IncidentEvalCandidateReceiptV1

Successful explicit recording returns a closed immutable receipt with:

- receipt/event identity, project sequence, and project watermark;
- exact request identity, idempotency key, candidate ID, and candidate hash;
- incident ID, source snapshot hash, actor identity, and recording time;
- outcome `recorded` or exact-retry outcome `already-recorded`.

The receipt MUST NOT contain the raw fixture, prompt, model input/output,
transcript, diff, log, credential, secret, environment value, hidden reasoning,
or arbitrary file content.

## 5. Proposal input

The caller supplies only a closed bounded proposal:

- exact incident ID and expected current project watermark;
- reference-only fixture descriptor;
- oracle requirement;
- a bounded subset of canonical evidence references already attached to the
  selected incident/halts or exact Phase 5 lineage;
- optional exact attempt/invocation selector when more than one canonical join
  exists;
- a stable idempotency key for recording.

The caller cannot supply or override project/change/wave/task identities,
incident fingerprint/state/severity, halt identities, prompt/model identities,
candidate ID/hash, source snapshot hash, event ID/sequence, recording time, or
publication/closure state.

S1 accepts no raw prompt, arbitrary payload, embedded fixture bytes, URL fetch,
filesystem path to read, credential, model output, tool transcript, unrestricted
diff/log, or hidden reasoning.

## 6. Eligibility and joins

Preview is `ready` only when all of the following are true:

- project and incident exist and the expected watermark is current;
- incident identity and fingerprint replay without corruption;
- at least one effective halt belongs to the incident;
- every selected evidence reference is known within the exact incident/halt or
  exact joined Phase 5 evidence boundary;
- fixture reference, hash, byte length, and privacy classification are closed,
  bounded, and non-secret;
- an executable oracle reference is registered and objective, or a human-oracle
  requirement is explicit;
- optional wave/task/attempt/invocation lineage is exact and unambiguous;
- normalized candidate content passes schema and semantic validation;
- count and byte limits are satisfied.

Incident state does not control eligibility. Open, mitigated, escalated,
resolved, and valid reopened incidents may all produce a candidate because
candidate creation and incident closure are independent. Incident state and
reopen ordinal remain part of the exact source snapshot so stale previews fail.

Missing optional Phase 5 lineage is explicit `unsupported` evidence inside the
candidate only when no attempt/invocation selector was required for the
proposed case. A requested but ambiguous or conflicting join prevents `ready`.

## 7. Privacy and bounds

The implementation MUST define conservative fixed limits for request bytes,
response bytes, string length, evidence-reference count, halt count, prompt
artifact count, and diagnostic length. Limits are enforced before persistence.

Fixture and evidence references are identifiers, hashes, or privacy-safe
canonical references. S1 never dereferences a caller-controlled path or URL.
Allowed privacy classifications are a closed subset compatible with Phase 5:
`public_fixture` and `approved_internal_fixture`.

Prohibited field names and secret-like content fail closed with private stable
reason codes. Errors MUST NOT echo rejected content, local absolute paths,
usernames, machine names, environment values, authorization headers, tokens,
raw prompts, raw responses, or transcripts.

## 8. Preview semantics

Preview MUST:

- load one exact project ledger snapshot without recovery mutation;
- recompute the incident, halt, and Phase 5 projections through existing replay;
- validate the closed request before domain evaluation;
- compute the source snapshot and candidate deterministically;
- validate the result against closed schema and semantic invariants;
- return no mutation and leave ledger bytes, queue files, run records, goals,
  Project Map, Git, and target repositories unchanged;
- return `stale` when the supplied watermark no longer matches;
- return equal normalized output for equal request and equal ledger bytes.

Preview does not grant authority. A ready preview may be downloaded or inspected
by a future UI, but S1 exposes only the backend contract.

## 9. Explicit-confirmation recording

Recording MUST require:

- the complete closed proposal again;
- exact preview request identity, candidate ID/hash, source snapshot hash, and
  expected project watermark;
- `confirmed: true` supplied directly by the caller;
- a non-empty stable idempotency key and actor identity.

Execution MUST reload the ledger under the existing serialized project writer,
replay the current projections, and recompute the preview. Any change to source
watermark, incident/halt state, evidence, join, fixture, oracle, policy, or
candidate bytes fails before append. A successful append writes exactly one new
candidate-recorded event through the existing hash chain.

An exact retry returns the existing receipt without a second event. Reusing an
idempotency key with different semantic input fails closed. Concurrent equal
requests produce one event and one exact-retry result; concurrent conflicting
requests cannot overwrite or alias one another.

The event changes no existing incident, halt, change, wave, task, attempt,
prompt/model, eval suite/run/report, champion, retry, repair, resume, or operator
action projection.

## 10. Event and replay

S1 adds one event type to the existing project ledger:

`incident.eval-candidate-recorded`

Its payload contains exactly one validated `IncidentEvalCandidateV1` and one
validated `IncidentEvalCandidateReceiptV1`. Replay MUST:

- reject missing source incident/halt identities;
- reject mismatched project/change/scope/fingerprint/snapshot identities;
- reject schema-invalid, privacy-invalid, or hash-invalid payloads;
- treat an equal duplicate event identity/content as the existing ledger rules
  require and reject conflicting immutable identity;
- reconstruct equal candidate and receipt projections after restart;
- preserve legacy ledgers without migration.

The candidate projection is an additional map/list inside the existing
projected ledger. It is not added to `EvalLineageProjectionV1.suites` or any
active eval registry.

## 11. HTTP surface

S1 may expose exactly:

- `POST /api/change-control/projects/:projectId/incidents/:incidentId/eval-candidates/preview`;
- `POST /api/change-control/projects/:projectId/incidents/:incidentId/eval-candidates`.

Both routes use closed JSON bodies and bounded JSON responses. Path and body
identities must agree. Unsupported methods remain rejected by the existing
HTTP surface. There is no list-all, search, suite-publish, incident-transition,
eval-run, connector, upload, or UI endpoint in S1.

## 12. Stable reason-code families

The implementation defines closed stable codes covering at least:

- request/schema/version invalid;
- project/incident/halt missing or identity mismatch;
- project/source stale;
- evidence missing, unknown, prohibited, or ambiguous;
- attempt/binding/invocation lineage unsupported or conflicting;
- fixture reference/privacy/hash/size invalid;
- oracle missing, unsupported, or unregistered;
- candidate schema, semantic invariant, identity, or hash invalid;
- preview/confirmation mismatch;
- explicit confirmation required;
- idempotency conflict;
- count/request/response limit exceeded;
- ledger corruption or concurrent stale contender.

Diagnostics remain bounded and private; tests assert reason codes rather than
unstable prose.

## 13. Verification requirements

Focused tests MUST cover:

- closed schemas, examples, unknown fields, and versions;
- ready executable-oracle and human-oracle candidates;
- deterministic IDs/hashes and byte-equal preview;
- exact Phase 4 identities and optional Phase 5 joins;
- missing, unsupported, conflicting, and stale evidence;
- prohibited fields, secret-like input, no echo, and fixed limits;
- no-mutation preview proven by byte-for-byte ledger/run/queue/Git evidence;
- explicit confirmation and exact preview refetch;
- success, exact retry, idempotency conflict, and concurrent contenders;
- restart/replay, corruption, and legacy ledgers;
- proof that candidate recording changes no suite or incident lifecycle;
- closed HTTP routes and unsupported methods;
- current Phase 4 and Phase 5 regression coverage.

Required gates:

```powershell
npm run check
npm run build
npm test
git diff --check
```

On Windows, `npm test` receives at least a ten-minute timeout.

## 14. Rollback and recovery

Before merge, rollback is ordinary removal/reversion of the S1 code and schema
changes. Test fixtures and temporary ledgers are disposable.

After a candidate event exists, immutable ledger history is never deleted or
rewritten. A future correction/revocation lifecycle requires a separate
accepted contract. S1 therefore MUST stop before production use if the owner
requires candidate deletion, editing, or revocation semantics now.

Crash before append produces no event. Crash after a durable append is
reconciled by exact idempotency lookup and replay; a retry returns the existing
receipt. Ambiguous durability fails closed and requires re-observation before
any retry.

## 15. Explicit non-goals

- automatic candidate generation from every incident;
- automatic fixture creation, prompt sanitization by a model, or raw-content
  transformation;
- eval-suite publication, mutation, activation, pruning, or release gating;
- incident transition, resolution, reopen, repair, retry, or resume authority;
- provider/model calls, model grading, live tools, credentials, or network;
- UI, notification, export archive, background job, polling, or webhook;
- a second ledger, eval registry, incident registry, policy registry, or search
  system;
- hidden reasoning, prompt, response, transcript, raw log/diff, secret, or
  arbitrary file persistence;
- candidate editing, deletion, revocation, or supersession in S1;
- broad refactoring of existing large integration files.
