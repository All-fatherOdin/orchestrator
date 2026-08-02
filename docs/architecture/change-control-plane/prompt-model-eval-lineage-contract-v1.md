# Prompt, Model, and Eval Lineage Contract v1

Status: proposed contract for Phase 5 authorization

This document defines the normative Phase 5 boundary. The words MUST, MUST
NOT, SHOULD, and MAY are requirements. Implementation is not authorized merely
by publishing this proposal. Before runtime events are accepted, the
implementation MUST publish Draft 2020-12 schemas, examples, semantic
validators, and deterministic replay tests.

## Scope and non-goals

Phase 5 makes the configuration and measured evidence behind an attempt
reproducible and auditable. It defines:

- immutable prompt artifacts and explicit derivation lineage;
- immutable model-route identities and resolved execution identities;
- attempt bindings fixed before execution;
- versioned eval suites, cases, cohorts, runs, observations, and reports;
- comparable baseline/candidate results and champion decisions;
- joins to changes, waves, tasks, attempts, commits, and incidents.

Phase 5 does not add an operator UI, online learning, automatic prompt
rewriting, autonomous model selection, provider discovery, hidden-reasoning
capture, raw production-prompt telemetry, pricing authority, deployment, or
canonical state controlled by an external eval service. Phase 6 projections
remain read-only consumers of the canonical APIs.

## Authority and canonical storage

The per-project, append-only, hash-chained change-control event ledger remains
canonical for registrations, bindings, eval publication, and promotion
decisions. An embedded record or content-addressed artifact becomes canonical
only after its event is atomically published.

`.orchestrator/runs/<run-id>/run.json` remains canonical for a concrete run and
its attempts. It MUST reference the effective Phase 5 binding but does not
replace its lineage. Phase 1-4 change, plan, workspace, merge, halt, and
incident records retain their authority. Existing runtime-eval reports may be
imported as evidence only through schema validation and an immutable import
receipt; their files do not independently mutate control-plane state.

Authority is separated:

- an artifact publisher registers immutable prompt, route, suite, and cohort
  definitions;
- the dispatch gate binds one exact prompt and requested route before an
  attempt starts;
- the runtime adapter records the resolved provider/model identity without
  changing the requested route;
- an eval runner executes a fixed suite against a fixed cohort and publishes
  observations;
- an evaluator computes a deterministic report under a versioned metric
  policy;
- an authorized human or policy actor records a champion decision.

An LLM MAY propose an artifact, explanation, or comparison. It cannot publish
an artifact, alter a binding, declare comparability, or promote a champion
without the corresponding validated event and authority.

## Privacy and artifact boundary

Phase 5 MUST NOT become a prompt-capture or surveillance system. Canonical
prompt artifacts contain approved reusable instructions or templates, their
metadata, and content hashes. They MUST NOT contain secrets, credentials,
environment values, unrelated file contents, provider-hidden reasoning, or
unredacted user/private production inputs.

A rendered invocation is represented by its artifact IDs, deterministic
compiler identity, declared input-schema version, and a salted or scoped
input fingerprint when needed. The rendered prompt body is not stored in the
control-plane ledger or metrics projection. Evidence requiring sensitive
content stays in its already-authorized source and is referenced by an opaque,
access-controlled evidence reference.

Redaction after publication is not implemented by rewriting history. If an
artifact is found to contain prohibited content, it is revoked, quarantined,
and superseded; access to the external blob may be removed under separate
authority while the ledger preserves hashes and the audit event.

## Immutable entities and identities

Display names, aliases, provider labels, filenames, and timestamps are never
join keys. IDs are immutable and globally unique within their entity type.

### PromptArtifactV1

A prompt artifact MUST contain:

- `promptArtifactId`, semantic purpose, artifact kind, and schema version;
- canonical content hash and byte length;
- compiler/renderer contract ID and version when templated;
- declared input schema and output/behavior contract references;
- parent artifact IDs and a derivation operation for non-root artifacts;
- publisher identity, publication time, and optional revocation reference;
- privacy classification and validation receipt.

Artifact kinds are closed in v1: `system`, `executor`, `reviewer`,
`correction`, `planner`, `architect`, `warden_explanation`, and
`eval_assertion`. A composite prompt is a manifest of ordered artifact IDs and
compiler identity, not an untracked concatenated string.

Content identity is computed from canonical UTF-8 bytes after newline
normalization only. Version labels are metadata and MUST NOT substitute for
the content hash. A changed byte creates a new artifact ID.

### ModelRouteV1 and ResolvedModelExecutionV1

`ModelRouteV1` records the requested, provider-independent policy:

- `modelRouteId`, route policy ID/version, requested model class, minimum
  model, reasoning level, tool/runtime capability requirements, and fallback
  policy;
- allowed provider adapter versions and fail-closed unsupported behavior;
- routing rationale code and publication identity.

`ResolvedModelExecutionV1` records what actually executed:

- binding, attempt, provider adapter, runtime, provider model identifier, and
  immutable capability-map version;
- resolved reasoning setting and tool route;
- resolution reason, fallback source, start time, and provider request ID hash
  when available;
- measured/unsupported states for token, latency, cost, cache, and provider
  metadata fields.

The resolved record MUST preserve the requested route. An unsupported explicit
model or capability fails before execution. A fallback is valid only when the
published route policy explicitly permits it and records the exact reason.
Provider aliases are observations; comparisons use the recorded resolved
identity and adapter/capability versions.

### AttemptConfigurationBindingV1

Every managed attempt MUST have exactly one effective binding fixed before
provider execution. It contains:

- project, change, wave, task, attempt, plan revision, authorization, and
  workspace identities;
- ordered prompt artifact IDs, composite manifest hash, compiler identity,
  and non-sensitive input fingerprint;
- requested `modelRouteId` and expected runtime/tool capability identity;
- binding actor, reason, publication sequence, and evidence snapshot hash.

The binding is immutable. Retry creates a new attempt and a new binding. A
correction or review invocation within an attempt receives a distinct
`invocationId` and immutable child binding whose role is explicit; it cannot
silently replace the attempt's executor binding.

Dispatch MUST reject a missing, revoked, unknown, schema-invalid, or
capability-incompatible artifact/route. Resolution MUST reject disagreement
with the binding, stale authorization, or an unpermitted fallback.

### EvalSuiteV1, EvalCaseV1, and EvalCohortV1

An eval suite is an immutable ordered manifest of case IDs plus:

- suite ID/version, purpose, required outcome dimensions, metric policy, and
  critical gate;
- executable oracle definitions or explicit human-oracle requirements;
- environment/fixture contract, sampling policy, and privacy classification.

Each case fixes its input fixture reference, acceptance oracle, severity, and
expected evidence. Changing a case or its oracle creates a new case ID and
suite version.

A cohort is an immutable ordered set or reproducible selection manifest. It
records project/task eligibility, inclusion/exclusion rules, selection seed,
observation window, task mix, and baseline provenance. Post-outcome selection
and silent case removal are forbidden.

### EvalRunV1, EvalObservationV1, and EvalReportV1

An eval run binds exactly one suite version, one cohort, one or more declared
candidate configurations, the runner code hash/version, environment identity,
and execution mode. Candidate identity includes prompt manifest, model route,
resolved identity when execution occurs, reasoning, state, cache, and tool
route dimensions. Every dimension is `measured` or `unsupported`; absence is
not interpreted as equality or zero.

Each observation binds one case, sample ordinal, candidate, invocation, output
evidence references, oracle results, latency/usage/cost observations, policy
violations, incidents, and commit when applicable. Failed, interrupted, and
unsupported executions remain observations and cannot be dropped from the
denominator.

An eval report is a deterministic projection over a sealed run. It records:

- report and metric-policy versions;
- cohort size and task mix;
- numerator, denominator, absolute result, and uncertainty for every metric;
- first-pass acceptance, answer/evidence completeness, unauthorized-action
  failure, escaped-defect window when measurable, latency, tokens, and cost;
- exclusions with closed reason codes;
- absolute and relative deltas from a named baseline;
- comparability verdict and all blocking differences.

Generated lines, test count, token reduction, or a process exit code are not
quality outcomes by themselves.

## Lifecycle and event types

Artifacts, routes, suites, and cohorts have `published -> revoked` lifecycle;
revocation is terminal and requires a reason and evidence. A replacement is a
new entity linked by `supersedesId`.

Eval runs permit exactly:

```text
null -> registered -> running -> sealed
                         |       |
                         +-----> failed
registered -------------------> cancelled
running ----------------------> cancelled
```

`sealed`, `failed`, and `cancelled` are terminal. Sealing requires one terminal
observation for every declared `(case, sample, candidate)` tuple. Retry is a
new sample or eval run according to the predeclared sampling policy; it does
not overwrite an observation.

Phase 5 MUST add typed events equivalent to:

- `prompt.artifact-published`, `prompt.artifact-revoked`;
- `model.route-published`, `model.route-revoked`;
- `attempt.configuration-bound`, `invocation.configuration-bound`,
  `model.execution-resolved`;
- `eval.suite-published`, `eval.suite-revoked`, `eval.cohort-published`,
  `eval.cohort-revoked`;
- `eval.run-registered`, `eval.run-started`, `eval.observation-recorded`,
  `eval.run-sealed`, `eval.run-failed`, `eval.run-cancelled`,
  `eval.report-published`;
- `lineage.champion-decided`, `lineage.champion-revoked`.

Each event preserves project sequence, previous-event hash, event hash, actor,
causation, correlation, and cross-entity identity rules. Duplicate publisher
occurrence IDs return the original event and MUST NOT append a duplicate.

## Comparability and champion decisions

Candidate comparison is valid only when suite, cohort, sampling, oracle,
metric policy, environment class, and all non-candidate dimensions match or a
declared paired design accounts for the difference. Missing provider fields,
different unsupported states, changed acceptance criteria, post-hoc cohort
selection, or unequal retry policy makes the affected metric non-comparable.

A champion decision MUST bind:

- exact baseline and candidate configuration identities;
- sealed eval runs and report IDs;
- one declared objective and numeric improvement threshold;
- guardrail metrics and maximum permitted regressions;
- minimum sample/uncertainty policy;
- scope, actor authority, reason, decision time, and optional expiry.

Allowed decisions are `promote`, `retain`, `reject`, and `inconclusive`.
Unknown, unsupported, underpowered, or non-comparable evidence yields
`inconclusive`, never `promote`. Promotion changes no existing attempt and does
not itself change a model route; a later authorized route/artifact publication
must explicitly reference the decision. Rollback is a new decision and route
publication, not history mutation.

## Incidents and commits

Every attempt and eval observation MUST join applicable Phase 4 halt and
incident IDs. Open blocking incidents, scope violations, ambiguous side
effects, or missing observations fail the candidate's safety guardrail.
Incident absence is valid only when the evaluated observation window and
source coverage are recorded.

Commit identity is attached only when the attempt produced or evaluated that
exact commit. Workspace and merge identities are validated through Phase 3.
An eval result for one commit cannot be transferred to a different tree, and
a prompt/model champion decision cannot be treated as proof that a code change
is safe.

## Stable fail-closed reason codes

At minimum, implementation MUST distinguish:

| Reason | Required outcome |
| --- | --- |
| `PROMPT_ARTIFACT_UNKNOWN` | Reject binding |
| `PROMPT_ARTIFACT_REVOKED` | Reject new binding |
| `PROMPT_CONTENT_HASH_MISMATCH` | Quarantine publication or execution |
| `PROMPT_PRIVACY_VIOLATION` | Quarantine and require human review |
| `MODEL_ROUTE_UNKNOWN` | Reject binding |
| `MODEL_CAPABILITY_UNSUPPORTED` | Reject explicit route or apply only a declared fallback |
| `MODEL_RESOLUTION_MISMATCH` | Halt attempt and record incident evidence |
| `ATTEMPT_BINDING_MISSING` | Reject dispatch |
| `ATTEMPT_BINDING_STALE` | Reject dispatch or execution |
| `EVAL_SUITE_UNKNOWN` | Reject eval run |
| `EVAL_COHORT_INVALID` | Reject eval run |
| `EVAL_OBSERVATION_INCOMPLETE` | Deny sealing |
| `EVAL_RESULT_UNSUPPORTED` | Preserve unsupported state; deny affected claim |
| `EVAL_NOT_COMPARABLE` | Deny promotion |
| `EVAL_SAMPLE_INSUFFICIENT` | Record inconclusive decision |
| `EVAL_GUARDRAIL_FAILED` | Reject promotion |
| `CHAMPION_AUTHORITY_REQUIRED` | Await authorized decision |

Unknown schema, policy, compiler, adapter, metric, or reason-code versions fail
closed. They cannot be translated to defaults or warnings.

## Semantic checks beyond JSON Schema

Validators MUST additionally enforce:

- event sequence/hash-chain validity and immutable content-hash identity;
- acyclic prompt derivation and supersession graphs;
- exactly one effective attempt binding and unique invocation bindings;
- agreement among attempt, plan, authorization, workspace, model resolution,
  commit, halt, and incident identities;
- no execution using revoked or unpublished artifacts/routes;
- capability compatibility and declared-fallback correctness;
- complete eval run matrices with stable denominators;
- deterministic report recomputation from observations;
- suite/cohort immutability and pre-outcome selection;
- comparability, uncertainty, objective, guardrail, and authority checks before
  promotion;
- exclusion of prohibited sensitive content from events and projections;
- valid UTC instants without using wall-clock order to replace ledger order.

## Implementation and acceptance obligations

An implementation queue MUST contain at least two independently useful,
ordered tasks:

1. schemas, artifact/route registries, semantic validators, event publication,
   replay projections, attempt/invocation bindings, and dispatch/runtime gates;
2. suite/cohort/run/observation/report records, deterministic comparisons,
   champion decisions, imports, and integration tests.

Acceptance evidence MUST include:

- Draft 2020-12 schema/example validation and negative fixtures;
- deterministic replay and duplicate-publication behavior after restart;
- content-hash, derivation-cycle, revocation, supersession, and privacy cases;
- exact attempt binding, retry/new-binding, child invocation, and stale-binding
  rejection;
- explicit model rejection, permitted fallback, resolution mismatch, and
  unsupported capability cases;
- sealed complete eval matrices plus failed, interrupted, cancelled, missing,
  and unsupported observations;
- reproducible cohort selection and proof that failures remain denominators;
- deterministic metric/report recomputation with numerator and denominator;
- comparable, non-comparable, underpowered, guardrail-failed, retained,
  rejected, and promoted decisions;
- joins across attempts, commits, and Phase 4 incidents;
- proof that raw rendered prompts, secrets, hidden reasoning, and unrelated
  file content are absent from ledger and metric projections;
- unchanged Phase 1-4 behavior and legacy run-record compatibility.

Tests MUST use deterministic fixtures and mock provider adapters. Live provider
evaluation is optional and cannot be required for the credential-free gate.
An unavailable measurement remains explicitly unsupported; safety invariants
may not be silently skipped.
