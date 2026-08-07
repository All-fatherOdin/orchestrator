# Agent Memory Kit v5 Read-Only Integration Contract v1

Status: accepted, implemented, and completion-reviewed; Slices 1-6 complete
Proposed: 2026-08-07
Accepted: 2026-08-07
Reviewed: 2026-08-07
Implementation updated: 2026-08-07
Pinned upstream core: Agent Memory Kit v5.0.0 commit `86ffff5`

## Outcome

This contract defines the first bounded integration of Agent Memory Kit (AMK)
v5 with Orchestrator. It adds local validation and deterministic read-only
projections for exactly four Project Artifact Contract V2 types:

- `TaskContractV3`;
- `WorkItemGraphV1`;
- `VerificationReceiptV2`;
- `ReviewReceiptV1`.

The integration lets an operator assess and export AMK compatibility for an
existing Orchestrator queue or run. It does not import AMK artifacts, create or
start a queue, persist a projection, activate a workflow frontier, grant
authority, or change any canonical Orchestrator state.

AMK is a validation and interchange contract in this phase. It is not a new
runtime, scheduler, issue tracker, source of execution truth, or memory
authority.

## Upstream Version and Provenance

The normative upstream source for the four schemas and their semantic fixture
corpus is Agent Memory Kit v5.0.0 at Git commit `86ffff5`. The later commit
`8ca526c`, which adds optional documentation governance, is outside this
contract.

Vendored material MUST be limited to the four closed JSON Schema Draft 2020-12
schemas, the fixture data required to prove compatible validation, and a
provenance record. Orchestrator MUST NOT copy the complete Kit, its generic
agent instructions, Cursor/Codex templates, migration helpers, or optional
integrations as part of this phase.

The provenance record MUST contain:

- upstream repository identity and pinned commit;
- upstream relative path for every snapshot;
- source byte length and SHA-256;
- repository byte length and SHA-256;
- normalized UTF-8 LF SHA-256 for text comparison;
- an explicit statement of whether a difference is byte-only or semantic.

Git line-ending normalization MUST NOT create a false semantic-drift claim.
Conversely, normalized equality MUST NOT be reported as exact byte identity.
Updating the pinned commit or any vendored schema requires a separate reviewed
compatibility change.

## Authority and Sources of Truth

The integration preserves the existing authority hierarchy:

| Scope | Canonical source |
| --- | --- |
| Current owner direction | current explicit owner instruction |
| Selected local launch queue | the selected YAML file under `queues/` |
| Running or historical queue execution | `.orchestrator/runs/<run-id>/run.json` |
| Goal execution state | `docs/goals/<slug>/state.yaml` |
| Change, wave, task, planning, authorization, incident, and receipt state | the existing canonical project ledger |
| Product behavior | current code, schemas, and passing tests |
| Project navigation and replay hints | `docs/project_map/`, secondary only |
| AMK schema validity | the pinned vendored schema and compatible semantic validator |
| AMK projection | request-scoped navigation and interchange output only |

An AMK projection cannot settle a conflict with its Orchestrator source. A
source mismatch produces an explicit `conflict` result. Missing source evidence
produces `partial` or `unsupported`; it MUST NOT be reconstructed from prompt
text, display labels, model knowledge, timestamps, or nearby records.

## Closed Phase Scope

Version 1 supports only these projections:

| AMK contract | Orchestrator evidence | Boundary |
| --- | --- | --- |
| `TaskContractV3` | selected queue task, resolved task fields, and exact `TaskAuthorizationEvidenceV1` when present | classification and scope projection only; never approval |
| `WorkItemGraphV1` | queue task keys, `dependsOn`, verification recipes, checkpoint requirements, and run task states | report-only graph and derived frontier; never scheduling |
| `VerificationReceiptV2` | one exact task attempt, configured command, result, environment identity, and bounded evidence references | evidence projection only; never completion authority |
| `ReviewReceiptV1` | one exact reviewed attempt/result, criteria, task-owned change set, reviewer verdict, and mutation-isolation evidence | review evidence only; never correction or repair authority |

The following AMK contracts are explicitly unsupported in this phase:

- `HandoffV3` and `WorkingStateV3`;
- `PlanChallengeV1`;
- `CommitmentLedgerV2` and `SideEffectReceiptV1`;
- `ExplorationMapV1` and `TriageLedgerV1`;
- `DesignProbeV1`;
- `CapabilityRegistryV1`;
- `DomainLanguageV1`;
- `ClaimLedgerV2` and `MemoryDeltaV1` as integration outputs.

Unsupported contracts remain discoverable as unsupported names. They are not
silently omitted, synthesized, persisted, or treated as invalid Orchestrator
state.

## One-Way Projection Boundary

The only allowed data direction is:

```text
selected queue + canonical run evidence
                    |
                    v
        request-scoped AMK projection
```

This contract prohibits:

```text
AMK artifact  -> queue creation or modification
AMK frontier  -> dispatch or retry
AMK status    -> run.json, goal state, or ledger mutation
AMK receipt   -> approval, completion, merge, or incident transition
```

Importing an AMK bundle and creating a new YAML queue requires a separately
accepted Phase 2 contract with preview, explicit confirmation, exact
idempotency, and receipt semantics. This contract grants no part of that
authority.

## Projection Status Model

Every requested contract returns exactly one status:

| Status | Meaning |
| --- | --- |
| `compatible` | the closed schema and all applicable semantic invariants pass against exact source evidence |
| `partial` | a useful bounded projection exists, but non-authoritative fields remain explicitly unknown |
| `unsupported` | this phase has no truthful mapping or required source evidence is absent |
| `conflict` | two canonical identities or evidence items disagree |
| `stale` | the supplied queue/run identity or watermark no longer identifies current readable source bytes |

`partial` and `unsupported` are valid informational outcomes, not successful
verification. `conflict` and `stale` fail closed. No status activates work or
changes authority.

Every response and every per-contract result MUST state:

```json
{
  "readOnly": true,
  "navigationOnly": true,
  "activated": false,
  "filesModified": false
}
```

## TaskContractV3 Mapping

The projection uses only exact selected queue and run fields. At minimum:

- `task_id` is derived from the stable queue task key plus the exact queue or
  run identity; an absent stable key prevents a cross-run identity claim;
- `title` comes from the queue task title;
- `status` maps only from the exact canonical task status supported by the
  pinned schema;
- `scope.project_files` comes from `allowedPaths` without widening,
  normalization-based substitution, or inferred paths;
- expected outcomes and done criteria use explicit task contract and
  verification evidence; free-form executor output is not promoted to owner
  intent;
- stop conditions may include explicit `executionGuards`, but their presence
  does not make a non-machine guard technically enforced;
- permission and apply claims come only from exact verified
  `TaskAuthorizationEvidenceV1`, never from the prompt;
- unknown reversibility, risk, review policy, capability impact, or workflow
  field remains `unknown` when the source does not prove it.

`workflow_profile` is conservative:

- a bounded ordinary task may project as `standard` only when its mapping is
  otherwise truthful;
- queue dependencies may support `delivery`, but do not by themselves prove
  `multi_session`;
- `high` and `irreversible` MUST NOT be inferred from words in a prompt;
- review, capability, and domain references MUST be empty or unknown unless
  exact compatible artifacts exist;
- an activation requirement that cannot be satisfied changes the result to
  `partial`, `unsupported`, or `conflict`; it is never defaulted away.

The projection is not an `approvalId`, apply contract, authorization event, or
dispatch gate.

Task status mapping is closed:

| Orchestrator status | AMK status | Result |
| --- | --- | --- |
| `pending`, `running` | `active` | allowed when the exact current run proves the source status |
| `completed` | `completed` | allowed only after canonical run reconciliation |
| `cancelled` | `cancelled` | allowed |
| `blocked` | `blocked` | allowed |
| `failed`, `timed_out`, `skipped` | none | `unsupported`; do not coerce failure, timeout, or scheduler skip into another AMK lifecycle state |

The current queue shape has no dedicated `goal`, `expected_outcomes`, or
`rollback_or_recovery` fields. The task prompt may be copied verbatim as the
goal because it is explicit task input, but it MUST NOT be summarized into a
stronger claim. Verification commands may support a bounded done definition,
and execution guards may support stop conditions. Missing required fields may
use only an exact cited project-wide fail-closed policy; otherwise the
projection is `partial` or `unsupported`. Placeholder facts and inferred owner
intent are prohibited.

## WorkItemGraphV1 Mapping

One selected queue may produce one graph when all participating tasks have
stable keys. Graph items are derived from independently useful queue tasks,
not from artificial implementation/test/review subdivisions.

The current queue schema has no queue-level TaskContract or owner-reviewed AMK
parent task. Consequently, the Phase 1 graph uses a stable navigation-only
`TASK-QUEUE-<source-hash-prefix>` parent identity, sets `owner_review` to
`pending`, and remains `partial`; it MUST NOT claim cross-contract compatibility
with one of the per-task `TaskContractV3` projections. A compatible parent task
or `owner_review: accepted` requires separately persisted exact owner evidence
and is outside the current queue shape.

- item IDs are stable functions of exact queue identity and task key;
- `blocked_by` comes only from validated `dependsOn` keys;
- acceptance claims and verification recipes remain tied to the same task;
- checkpoint requirements are evidence constraints, not extra dependencies;
- cycles, duplicate keys, unknown dependencies, and contradictory terminal
  states produce `conflict`;
- insufficient evidence that an item fits the declared workflow produces
  `partial` or `unsupported`;
- current queue evidence does not prove AMK `context_fit`, so it remains
  `unknown`; therefore the AMK runnable frontier is empty even when the
  Orchestrator scheduler has ready tasks;
- the frontier is recomputed from canonical inputs on every request;
- stored or caller-supplied frontier claims cannot override recomputation.

The returned frontier MUST be marked navigation-only and inactive. Existing
Orchestrator scheduling, resource exclusion, readiness, retry, authorization,
workspace, and merge logic remain the only execution behavior.

## VerificationReceiptV2 Mapping

One receipt covers one exact verification subject and result. It MUST bind:

- project, queue/run, task, attempt, and command identities;
- the exact configured verification command or closed Orchestrator check;
- exit status, timeout state, and bounded result identity;
- verification level and environment reference when evidence proves them;
- evidence references sufficient to reconstruct why the projected status was
  selected;
- a deterministic receipt identity independent of projection time.

`passed` requires positive execution evidence. A missing command result,
timeout, unsupported environment, hash-only proof of document correctness, or
provider self-report cannot become `passed`. A typecheck or unit test cannot be
relabeled end-to-end. Owner observation is distinct from an automated check and
must have an exact owner-evidence reference.

The receipt does not replace Orchestrator completion, reviewer, checkpoint,
merge, eval, or operator-action gates.

The reviewed current `run.json` shape retains configured commands, aggregate
task exit/timeout state, and bounded human-readable log text, but not one
closed command-result record per verification command. Log text is not a safe
machine receipt because command output can imitate labels and success of every
command cannot be reconstructed without ambiguity. Current and legacy records
therefore cannot produce `VerificationReceiptV2.status: passed`; Slice 3 MUST
return `unsupported` or `inconclusive` with a stable reason. Adding structured
per-command evidence requires a separate canonical run-record change outside
Slices 1-3.

## ReviewReceiptV1 Mapping

One receipt covers one exact reviewer attempt. `compatible` requires evidence
that:

- the reviewer received the exact result or task-owned change set under
  review;
- review criteria reference the task contract and configured verification
  commands;
- author reasoning was excluded rather than merely ignored;
- the reviewer performed no workspace mutation;
- the reviewer had no correction or repair authority;
- findings and verdict belong to the exact attempt and evidence identity;
- any owner disposition is represented only when exact owner evidence exists.

Correction is a separate execution phase and MUST NOT be represented as a
reviewer mutation. If historical records cannot prove reviewer isolation, the
result is `unsupported` or `partial`, never `passed` by assumption. Reviewer
approval does not authorize task execution, correction, merge, retry, or AMK
memory promotion.

The reviewed current implementation sends `task.finalOutput` to the reviewer
as the executor result. That output is not a closed outcome-only structure and
may contain author reasoning. Current and legacy run records therefore do not
prove `author_reasoning_included: false` and cannot produce a compatible
`ReviewReceiptV1`. Slice 3 MUST return `unsupported` with a stable reason until
a separately reviewed reviewer-input contract proves reasoning exclusion. The
existing read-only sandbox and workspace snapshot can support
`mutation_performed: false`; the separate correction phase can support
`repair_authorized: false`; neither fact compensates for missing
author-reasoning evidence.

## Determinism and Identity

Projection identity MUST be derived from canonical UTF-8 JSON with fixed field
ordering and explicit normalization rules. Current clock time, filesystem
enumeration order, locale, machine name, absolute private paths, and random IDs
MUST NOT enter a projection identity.

Every projection response binds:

- contract and projection version;
- pinned AMK commit and schema hashes;
- selected project identity;
- selected queue identity or exact run-record hash and byte length;
- current project/run watermark where one exists;
- requested contract set;
- result hash and bounded byte length.

The service recalculates source identity before returning. Changed bytes,
ambiguous duplicate identities, or a changed watermark produce `stale` or
`conflict`; the service does not silently refresh the request.

## Validation Boundary

Product validation MUST use the existing Node/TypeScript runtime and AJV stack.
Python and the upstream repository are development-time compatibility oracles,
not production dependencies.

Validation has two layers:

1. closed JSON Schema Draft 2020-12 validation;
2. deterministic semantic and cross-contract invariants required by the pinned
   AMK fixture corpus and this mapping contract.

Unknown schema versions, unknown properties in closed shapes, invalid enum
values, graph cycles, false frontier assertions, missing evidence for passed
receipts, reviewer mutation, included author reasoning, and repair authority
fail closed.

The local validator MUST be regression-tested against the pinned upstream
valid, invalid, and semantic fixture corpus. A divergence blocks release and
cannot be solved by weakening the vendored schema locally.

## Persistence and Mutation Boundary

All selection, validation, mapping, and response construction are
request-scoped and in memory. This phase adds no AMK artifact store, projection
cache, database, ledger event, queue file, Project Map entry, background job,
filesystem watcher, or startup recovery work.

The service MUST prove no mutation of:

- the selected queue and the entire `queues/` directory;
- `.orchestrator/runs/` and the canonical project ledger;
- `docs/goals/` and `docs/project_map/`;
- the target repository;
- Git branches, index, worktrees, and remotes.

A direct user-initiated download may serialize the already-returned bounded
JSON in the browser. The server does not create an export file.

## Closed HTTP Surface

After the domain projections are independently complete, the phase may add
exactly these routes:

- `GET /api/amk-project-artifacts/v1` for bounded discovery;
- `POST /api/amk-project-artifacts/v1/project` for one exact read-only
  projection request.

Discovery exposes only the pinned version, supported and unsupported contract
names, closed limits, and selectors already proven by existing bounded
Orchestrator projections. It MUST NOT enumerate arbitrary filesystem paths.

The closed POST request contains only:

- `contractType` and `contractVersion`;
- stable `requestId`;
- exact existing project selector;
- exactly one existing queue identity or run identity;
- exact source hash/byte length and applicable watermark;
- a non-empty subset of the four supported contract names.

The request MUST NOT contain a filesystem path, queue body, run body, prompt,
artifact override, status override, frontier assertion, approval, secret, raw
log, or output path. The request limit is 8 KiB.

The response is closed, privacy-bounded, deterministic, and contains only
source identities, per-contract status/reason codes, validated projections,
warnings, limits, result identity, and the four mandatory no-authority flags.
The maximum response is 512 KiB, with at most 100 graph items and at most 100
verification/review receipts combined. Inputs outside these limits return a
stable limit outcome; they are not silently truncated into a compatible
result.

## Privacy Boundary

The integration operates on an allowlist. It MUST NOT return or persist:

- secrets, environment values, credentials, authorization headers, or tokens;
- raw prompts, executor/reviewer/correction transcripts, or raw log tails;
- unrestricted diffs, file contents, commit messages, or author identities;
- absolute target-repository paths, usernames, machine names, or temporary
  worktree paths;
- `.env`, credential files, databases, provider runtime payloads, or arbitrary
  Context Contract sources;
- hidden model reasoning or author reasoning.

Evidence references use bounded opaque identities and existing safe public
fields. Errors expose stable reason codes and bounded counts/hashes, not raw
source data.

## UI Boundary

The final implementation slice may add one Russian read-only Control Plane
view. It may:

- select an existing project and queue/run through existing bounded evidence;
- request any subset of the four supported projections;
- show `compatible`, `partial`, `unsupported`, `conflict`, and `stale` states;
- show pinned version, source identity, watermark, warnings, and the inactive
  navigation-only frontier;
- download the already-returned JSON after a direct user action.

The UI MUST NOT edit an artifact, upload/import a bundle, create or overwrite a
queue, activate a frontier, launch or retry a task, confirm a review, promote a
receipt, resolve an incident, or update Project Map. Changing the selected
project, queue/run, watermark, or requested contract set invalidates the prior
response and download state.

## Legacy and Restart Semantics

Legacy queues and run records remain readable without AMK fields. Missing AMK
projection support is represented as `partial` or `unsupported`, never as
canonical-record corruption.

No legacy file is migrated or rewritten. AMK migration helpers may be used
only outside product runtime to produce a review proposal; promotion requires
a separate owner-approved action outside this contract.

Because this phase persists no projection state, restart reconstructs a result
only from the exact current canonical sources. Equal source identities MUST
produce an equal projection. Changed or unavailable sources produce `stale`,
`conflict`, or `unsupported`; cached pre-restart success cannot be reused.

## Implementation Slices

### Slice 1: vendored validation surface

Vendor the four schemas and fixture corpus, record provenance, implement the
local schema/semantic validator, and prove parity with the pinned upstream
oracle. Add no projection API or UI.

### Slice 2: task and graph projections

Implement deterministic `TaskContractV3` and `WorkItemGraphV1` projections
over exact selected queue/run evidence. Prove inactive frontier semantics,
legacy behavior, restart reconstruction, and no mutation. Add no HTTP route or
UI.

### Slice 3: verification and review projections

Implement `VerificationReceiptV2` and `ReviewReceiptV1` projections with exact
attempt, command, environment, change-set, criteria, isolation, and evidence
bindings. Unsupported historical evidence stays explicit. Add no HTTP route or
UI.

### Slice 4: bounded read-only API

Expose only the two declared routes after Slices 1-3 pass. Add closed request
and response schemas, watermark fencing, privacy and size limits, stable
errors, restart behavior, and byte-for-byte no-mutation tests. Add no UI action
or import path.

Implementation note (2026-08-07): Slices 1-6 are implemented and the completion
review passed. The HTTP surface exposes exact server-discovered `run` and
opaque `queue` selectors; it does not accept caller-supplied paths or queue
bodies. Domain artifacts are validated internally, while the HTTP
boundary returns only deterministic artifact hashes, byte lengths, statuses,
reason codes, and mandatory no-authority flags. The artifact bodies themselves
are redacted because TaskContract and WorkItemGraph contain prompt and path
material prohibited by the privacy boundary.

The Russian Control Plane view consumes only these two routes. It selects a
server-discovered run or queue and contract subset, invalidates the prior result on every
selection change, renders all compatibility states plus the inactive
navigation-only frontier, and downloads only the already-returned bounded JSON
after a direct operator action. It exposes no artifact editor, import, launch,
retry, approval, promotion, or persistence control.

### Slice 5: read-only operator view

Add the bounded Russian view over Slice 4 only, including explicit safe states,
inactive frontier rendering, and direct download of already-returned JSON.

### Slice 6: completion review

Review every acceptance clause against the final code, schemas, focused tests,
legacy/restart evidence, full Windows regression, build, context smoke, diff
checks, and rendered desktop/390 px interaction. Completion review does not
authorize AMK import or a second phase.

## Contract Review Requirements

Before this contract can move from `proposed` to `accepted`, formal review MUST
check it against:

- current queue validation, dependency scheduling, resource exclusion, and
  ordinary-queue minimum rules;
- `TaskAuthorizationEvidenceV1` and apply approval contracts;
- canonical `run.json` loading, task attempt, verification, reviewer,
  correction, retry, and restart semantics;
- Phase 2 planning/authorization and Phase 3 workspace/merge gates;
- Phase 4 incident/repair authority and Phase 5 prompt/model/eval lineage;
- Phase 6 selection, Phase 7 action receipts, and Phase 8 bounded export
  patterns;
- current source-of-truth hierarchy and secondary Project Map policy;
- the pinned AMK schemas, fixtures, oracle, migration rules, and declared
  non-goals.

Review MUST specifically resolve whether current reviewer evidence proves the
three `ReviewReceiptV1` constants (`author_reasoning_included: false`,
`mutation_performed: false`, `repair_authorized: false`) for new and legacy
runs. Any unresolved mapping remains unsupported rather than weakening the
contract.

Acceptance authorizes only the six declared implementation slices. It does not
implement them and does not authorize a subsequent import phase.

## Contract Review

The 2026-08-07 formal review checked this contract against the pinned AMK v5
schemas, valid/invalid examples, semantic oracle and migration boundary, plus
the current Orchestrator queue validator, task authorization evidence, task
status reconciliation, reviewer prompt, reviewer workspace snapshot,
correction phase, verification policy, run persistence, context governance,
and Phase 2-8 authority boundaries.

Review findings resolved in this version:

- AMK has no direct lifecycle status for Orchestrator `failed`, `timed_out`, or
  `skipped`, so these statuses are explicitly unsupported rather than coerced;
- current queue tasks do not carry every required TaskContract field, so only
  verbatim task input and cited fail-closed project policy may fill the closed
  schema; missing facts remain partial or unsupported;
- `WorkItemGraphV1` requires one parent task while the queue has no queue-level
  TaskContract, so the graph uses a stable navigation parent, stays partial,
  and cannot claim cross-contract parent compatibility;
- queue evidence does not prove AMK `context_fit` or accepted owner review, so
  both remain conservative and the AMK runnable frontier is empty;
- the existing reviewer is filesystem-read-only and correction is separate,
  but its prompt contains unrestricted executor `finalOutput`; therefore
  author-reasoning exclusion is unproven and current ReviewReceipt projections
  must be unsupported;
- current run records retain only aggregate verification outcome and
  human-readable logs, not closed per-command results, so they cannot support a
  passed VerificationReceipt without a later canonical evidence extension;
- the existing bounded project projections do not authorize arbitrary queue
  path selection, so the future API must use exact server-resolved identities
  and reject caller paths;
- vendored text may change byte hashes under Git line-ending normalization, so
  provenance records byte and normalized identities separately.

Review result: accepted with no unresolved blocking finding. The conservative
unsupported outcomes above are intentional product behavior, not deferred
permission to weaken the mapping. Acceptance authorizes only Slices 1-6 under
this contract and grants no AMK import, execution, or persistence authority.

## Acceptance

Phase 1 is complete only when all slices and tests prove:

- the four vendored schemas and semantic outcomes match the pinned AMK source;
- provenance distinguishes byte identity, normalized text identity, and
  semantic drift;
- unknown versions/properties and invalid semantic invariants fail closed;
- TaskContract projection never infers authority, risk, reversibility, scope,
  or owner intent from prompt text;
- graph identity, dependencies, status, and frontier are deterministic and the
  frontier is always navigation-only and inactive;
- verification `passed` always has exact positive command/environment evidence
  at the declared verification level;
- review compatibility always proves exact result/criteria lineage, author
  reasoning exclusion, no reviewer mutation, and no repair authority;
- `partial`, `unsupported`, `conflict`, and `stale` remain explicit and never
  become approval or execution success;
- discovery and projection requests are closed, exact-identity and
  watermark-fenced, privacy-safe, count/byte bounded, and deterministic;
- no request accepts an arbitrary path, artifact override, status override,
  frontier assertion, prompt, secret, raw log, or output path;
- projection and download do not mutate queues, run records, ledger, goal
  state, Project Map, target repositories, or Git state;
- restart preserves no projection cache and reconstructs equal output only
  from equal current source identities;
- legacy queues and run records remain readable without migration;
- the UI consumes only the read-only API, exposes every safe state, and offers
  no import, edit, launch, retry, approval, or promotion control;
- focused schema/domain/API/UI tests, full Windows regression, TypeScript,
  production build, context smoke, diff checks, and desktop/390 px rendered
  interaction pass.

## Explicit Non-Goals

Phase 1 does not add AMK bundle upload or import, queue creation or overwrite,
queue launch, automatic frontier activation, scheduling, task selection,
authorization, scope expansion, risk inference, approval, correction, repair,
merge, retry, incident action, memory promotion, Project Map mutation, artifact
persistence, projection cache, database, vector index, search, watcher,
background job, notification, publication, telemetry, external connector,
model call, migration write, documentation-governance adoption, or support for
the AMK contracts listed as unsupported above.

## Verification Baseline

Implementation and completion review use at least:

```powershell
python scripts/ai_context_helper.py --root . smoke-check --format json
npm run check
npm test
npm run build
git diff --check
```

On Windows, the full `npm test` gate requires at least ten minutes. Focused
tests may shorten individual slice feedback, but they do not replace the final
full regression.
