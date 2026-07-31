# Halts and Incidents Contract v1

Status: accepted contract for Phase 4 implementation

This document defines the normative Phase 4 boundary. The words MUST, MUST
NOT, SHOULD, and MAY are requirements. Phase 4 implementation MUST publish a
Draft 2020-12 machine-readable schema and examples before runtime events are
accepted.

## Scope and non-goals

Phase 4 turns detected execution stops and policy violations into durable,
attributed, auditable control-plane state. It defines:

- stable halt and incident identities;
- separate halt and incident lifecycles;
- deterministic correlation, deduplication, closure, and reopen rules;
- evidence-backed attribution and a closed halt taxonomy;
- Warden policy verdicts;
- a narrow, versioned Doctor repair allowlist;
- retry/resume authority and immutable repair receipts.

Phase 4 does not add prompt/model/eval lineage, an operator UI, autonomous code
changes, autonomous replanning, destructive Git authority, external-side-effect
authority, or an LLM-controlled repair path. Those remain separate,
independently authorized slices.

## Authority and canonical storage

The Phase 1 per-project, hash-chained event ledger remains canonical for halt,
incident, Warden, Doctor, retry, and resume transitions. Phase 4 MUST extend
the closed event type set with typed, schema-validated events. A record embedded
in an event or referenced by immutable content hash is canonical only after
that event is atomically published.

`.orchestrator/runs/<run-id>/run.json` remains canonical for a concrete run and
its attempts. It references halt, incident, Warden, and repair IDs but does not
replace their control-plane history. Phase 2 plan and authorization records and
Phase 3 workspace and merge records retain their existing authority. Git,
process, provider, filesystem, command, and UI observations are evidence, not
independent mutation authority.

Authority is separated:

- a detector records an observation and creates a halt;
- a classifier proposes a taxonomy class and attribution assessment;
- the Warden validates evidence and emits the only authoritative disposition;
- the Doctor executes only the exact repair recipe authorized by the Warden;
- the architect may propose a Phase 2 replan but cannot heal or authorize it;
- a human owns ambiguous, destructive, external, policy-override, and
  non-executable acceptance decisions.

An LLM MAY propose classification, attribution, or explanation. Its output is
untrusted evidence until deterministic validation or a human decision produces
the corresponding authoritative event.

## Entity identities and joins

Display names, messages, paths, stack traces, and timestamps are never join
keys. Every identifier is immutable and globally unique within its entity
type.

### HaltRecordV1

A halt is one detected occurrence. It MUST contain:

- `haltId`, `projectId`, `changeId`, and `correlationId`;
- the affected `waveId`, `taskId`, and `attemptId` when that scope exists;
- the affected plan revision, run, workspace attempt, merge request, and commit
  identities when applicable;
- detector identity, occurrence time, and publication time;
- a stable detector code and normalized observation fingerprint;
- immutable evidence references;
- current halt state reconstructed from its events.

The same failure observed twice may produce two halts. Published halt evidence
is never rewritten or folded into another occurrence.

### IncidentRecordV1

An incident is a durable aggregate for one correlated operational problem. It
MUST contain:

- `incidentId`, `projectId`, `incidentFingerprint`, and taxonomy policy version;
- first and latest occurrence times;
- ordered, non-empty `haltIds`;
- affected entity references;
- severity, owner kind, and current incident state;
- correlation-window policy and closure evidence when applicable.

Every classified halt has exactly one effective incident. Its original link is
immutable. A mistaken correlation is corrected only by an explicit
superseding incident-correlation event: replay selects the latest valid link
while preserving both incident records and the original link in history. A
silent reassignment or physical rewrite is forbidden.

### Supporting immutable records

- `AttributionAssessmentV1` binds a halt to candidate causes, affected
  entities, confidence, evidence, and the taxonomy version.
- `WardenVerdictV1` binds the exact halt, incident, attribution assessment,
  evidence snapshot, policy version, disposition, and optional repair recipe.
- `DoctorRepairReceiptV1` binds one verdict to one recipe invocation,
  idempotency key, lease epoch, before/after evidence, and result.
- `IncidentResolutionReceiptV1` records the executable or human oracle proving
  mitigation or resolution.

All references MUST agree on project, change, wave, task, attempt, plan, and
workspace identities where those scopes exist. Missing optional scope is
represented explicitly as not applicable, never guessed from nearby events.

## Detection, deduplication, and correlation

A detector MUST publish a new halt before any repair begins. Detector
idempotency is scoped to `(projectId, detectorId, detectorEventId)`. Replaying
that tuple returns the original halt; it MUST NOT append another occurrence.

`observationFingerprint` is a versioned hash of stable structured fields such
as detector code, affected entity tuple, operation kind, and normalized failure
code. Free-form messages, absolute temporary paths, timestamps, process IDs,
and volatile provider text MUST NOT affect it.

`incidentFingerprint` is a versioned hash of:

```text
(projectId, haltClass, affectedEntityTuple, normalizedRootCauseKey,
 taxonomyPolicyVersion)
```

The affected entity tuple uses the lowest durable causal scope established by
evidence, normally project/change/wave/task plus operation/component. Volatile
attempt, run, process, lease, and workspace IDs remain on the halt but MUST NOT
split recurrences of the same task/root cause into separate incidents.

Correlation is deterministic:

1. an exact duplicate detector tuple returns the existing halt;
2. a new halt matching one open incident fingerprint is appended to it;
3. a halt matching a resolved incident inside that incident's recorded
   correlation window reopens it;
4. no match, multiple matches, a policy-version mismatch, or an expired window
   creates a new incident and records the reason;
5. unknown or insufficient classification creates a dedicated
   `unknown` incident and cannot auto-heal.

Correlation and incident-ID allocation MUST occur in one atomic compare-and-
append operation serialized for `(projectId, incidentFingerprint)`. Concurrent
detectors re-read the latest event sequence after acquiring that scope; only
one may create the matching incident.

Occurrence time is data, not authority. The correlation and reopen windows use
the ledger-assigned publication time, while publication sequence breaks ties
and orders concurrent events. A late or backdated observation cannot reopen an
expired incident, erase history, or reorder already published transitions.

## Closed halt taxonomy

Version 1 accepts only these classes:

| Halt class | Meaning | Default disposition | Auto-heal |
| --- | --- | --- | --- |
| `deterministic_owned_recovery` | Phase 3 already defines an exact owned, reversible recovery operation. | Warden evaluation | Eligible only through an allowlisted recipe |
| `retryable_provider_or_process` | A transient provider, subprocess, timeout, or resource failure with no ambiguous committed side effect. | Bounded retry or escalation | Eligible when side-effect absence is proven |
| `plan_or_target_drift` | Authorized plan/base/target identity no longer matches current truth. | Architect replan | Never |
| `acceptance_or_verification_failure` | A blocking oracle failed or required evidence is absent. | Correction or human decision | Never |
| `dependency_or_readiness_failure` | Declared dependency, readiness, or dispatch invariant failed. | Planner/architect or human decision | Never |
| `scope_or_policy_violation` | Actual behavior exceeded allowed paths, authority, or policy. | Quarantine and human review | Never |
| `ownership_or_state_ambiguity` | Canonical identity and observed workspace, lease, Git, or process evidence disagree. | Quarantine | Never |
| `human_decision_required` | No executable oracle or policy can decide safely. | Human decision | Never |
| `destructive_or_external_risk` | A possible repair can discard data, force Git state, publish remotely, spend/transfer funds, change permissions, or create another external side effect. | Explicit human authorization | Never |
| `unknown` | Evidence is missing, conflicting, or unsupported by the active taxonomy. | Escalate fail-closed | Never |

Severity is independent of class and is one of `info`, `warning`, `blocking`,
or `critical`. Severity MUST NOT make an ineligible class healable.

Taxonomy upgrades create a new policy version. Existing classifications remain
interpretable under their recorded version. Reclassification requires a new
event with rationale and evidence; it cannot mutate the original assessment or
retroactively authorize a repair. If reclassification changes the incident
fingerprint, the same atomic correlation procedure creates or selects the
correct incident and publishes a superseding correlation event.

## Attribution contract

Attribution confidence is closed:

- `exact`: one cause and affected-entity tuple is proven by authoritative,
  reproducible evidence;
- `partial`: evidence narrows the cause but leaves more than one viable source
  or affected entity;
- `none`: evidence is missing, conflicting, or does not identify a cause.

An assessment MUST record:

- detector evidence and canonical entity references;
- declared write set and actual changed paths when filesystem changes exist;
- plan/base, workspace ownership, branch, lease, and commit evidence when Git
  state is involved;
- command/oracle/provider outcome and whether a side effect may already have
  committed;
- alternative candidates considered and rejection evidence;
- classifier identity, method, timestamp, and taxonomy version.

Only `exact` attribution may be considered for automatic healing. Exact
confidence alone is insufficient: the class, recipe, budgets, evidence
freshness, and all Warden checks must also pass. `partial` and `none` always
escalate or quarantine.

## Halt lifecycle

The schema permits exactly these `(previousState -> state)` pairs:

| Previous | Next states |
| --- | --- |
| `null` | `detected` |
| `detected` | `classified` |
| `classified` | `action_pending`, `escalated`, `quarantined` |
| `action_pending` | `healing`, `recovered`, `escalated`, `quarantined` |
| `healing` | `recovered`, `action_pending`, `escalated`, `quarantined` |
| `recovered`, `escalated`, `quarantined` | none |

`classified` requires an attribution assessment and incident reference. If
evidence cannot support a more specific class, the halt MUST be classified as
`unknown` with `none` confidence before escalation; classification and incident
creation may not be bypassed.
`action_pending` requires a Warden verdict whose disposition is one of
`allow_auto_heal`, `allow_bounded_retry`, `require_replan`,
`require_human`, or `quarantine`. Only `allow_auto_heal` may enter `healing`.

`recovered` requires fresh after-evidence and a successful executable or human
oracle. A retry being scheduled, a process exiting zero, or a Doctor command
finishing is not by itself recovery evidence. Exhausted budgets, a failed
repair, stale evidence, or a changed precondition returns to `action_pending`
only if another Warden verdict authorizes the next ordinal; otherwise it
escalates or quarantines.

Terminal halt states are immutable. A recurrence is a new halt linked to the
same or a reopened incident.

## Incident lifecycle

The schema permits exactly these pairs:

| Previous | Next states |
| --- | --- |
| `null` | `open` |
| `open` | `investigating`, `healing`, `mitigated`, `escalated` |
| `investigating` | `healing`, `mitigated`, `escalated` |
| `healing` | `investigating`, `mitigated`, `escalated` |
| `mitigated` | `resolved`, `reopened`, `escalated` |
| `escalated` | `investigating`, `mitigated`, `resolved` |
| `resolved` | `reopened` |
| `reopened` | `investigating`, `healing`, `mitigated`, `escalated` |

An incident may enter `healing` only while an associated halt has an active,
valid Warden auto-heal verdict. `mitigated` means immediate impact is stopped
and requires evidence; it does not claim the root cause is resolved.
`resolved` requires an `IncidentResolutionReceiptV1`, no active healing
operation, and a policy-defined observation result. Human-only classes require
a human actor and reason.

`reopened` requires a new halt matching the recorded fingerprint and reopen
window. It increments `reopenOrdinal`, preserves prior resolution evidence, and
never resets attempt or repair budgets. A human may publish a superseding
correlation correction when the original evidence was wrong, but cannot force
the `reopened` transition past the fingerprint/window rule or authorize
healing through that correction.

## Warden policy gate

The Warden is a deterministic policy evaluator. For every classified halt it
MUST emit exactly one verdict for the tuple:

```text
(haltId, incidentId, attributionAssessmentId, evidenceSnapshotHash,
 policyVersion, verdictOrdinal)
```

Verdicts are `allow_auto_heal`, `allow_bounded_retry`, `require_replan`,
`require_human`, or `quarantine`. Before allowing automatic action the Warden
MUST prove:

1. schema, event-chain, and cross-entity identity validity;
2. exact attribution under the active taxonomy version;
3. fresh authoritative evidence and unchanged preconditions;
4. absence of an ambiguous, destructive, or external side effect;
5. an exact Doctor recipe ID and version in the allowlist;
6. recipe applicability to the halt class;
7. remaining per-halt, per-incident, and per-project budgets;
8. exclusive live repair lease and monotonic lease epoch;
9. a stable idempotency key unused by a conflicting invocation;
10. executable success and rollback/stop oracles;
11. no quarantine, human-only, stale-plan, policy-override, or missing-evidence
    condition.

Failure or uncertainty in any check denies automatic action. Unknown reason
codes and policy versions fail closed. A later verdict may supersede an earlier
one only with a higher ordinal, new evidence snapshot, and explicit causation;
it does not erase the earlier decision.

## Doctor deterministic allowlist

The Doctor does not plan. It is a recipe executor with no free-form shell,
prompt, model, or tool authority. Version 1 MAY contain only:

| Recipe | Required class | Permitted action |
| --- | --- | --- |
| `provider-read-retry-v1` | `retryable_provider_or_process` | Retry an idempotent/read-only provider operation with capped exponential backoff. |
| `registered-process-retry-v1` | `retryable_provider_or_process` | Retry an immutable, registered non-mutating operation contract when evidence proves no prior committed side effect. |
| `workspace-reconcile-v1` | `deterministic_owned_recovery` | Invoke the existing Phase 3 recovery API for the exact owned workspace attempt; it may not add Git operations. |
| `merge-safe-abort-resume-v1` | `deterministic_owned_recovery` | Invoke the existing Phase 3 identity-fenced safe-abort/recovery path for the exact merge request. |
| `owned-cleanup-retry-v1` | `deterministic_owned_recovery` | Invoke the existing Phase 3 bounded non-force cleanup retry for the exact owned attempt. |

Every recipe has immutable code/version identity, accepted input schema,
preconditions, maximum attempts, backoff, timeout, lease scope, stop
conditions, and success oracle. Implementations MUST call typed adapters; a
recipe cannot interpolate an observation into a shell command.
`registered-process-retry-v1` additionally requires a pre-registered
`operationKind` and command hash, an explicit read-only/non-mutating effect
contract, fixed arguments, and rejection of repository writes, package
installation, provider writes, and caller-supplied shell fragments.

The Doctor MUST NOT:

- edit source code, tests, prompts, plans, acceptance criteria, or policies;
- classify a halt or raise its own confidence;
- authorize a plan, dispatch, dependency override, retry, resume, or closure;
- execute force cleanup, force ref changes, reset/clean, unproven merge abort,
  unbounded retry, package installation, migration, deployment, publication,
  secret/permission change, or other external side effect;
- convert a failed oracle into a warning;
- select a different recipe after a failure without a new Warden verdict.

## Repair execution, receipts, and crash recovery

One exclusive repair lease scoped to `(projectId, incidentId, haltId)` MUST be
held from final Warden revalidation through recipe execution and receipt
publication. `DoctorRepairReceiptV1` MUST record:

- recipe ID, version, code hash, verdict ID, and policy version;
- invocation ordinal, idempotency key, lease identity, and lease epoch;
- exact typed inputs and hashes of before/after evidence;
- start/end times, bounded command/adapter outcomes, and success oracle result;
- result: `succeeded`, `failed`, `interrupted`, `precondition_changed`, or
  `quarantined`;
- causation references to any retry, resume, halt, and incident transitions.

On restart, the Doctor replays canonical events and re-observes evidence. It
MAY return the existing receipt for the same idempotency key, finalize a result
whose exact success oracle is already proven, or resume only when the recipe
explicitly defines a crash-safe continuation. Ambiguous completion, changed
ownership, a moved target, an unknown side effect, a lost lease, or conflicting
receipts quarantines the repair. Recovery MUST NOT assume that absence of a
process means absence of an effect.

## Retry and resume semantics

Retry always creates a new immutable attempt ID. It never rewrites or
reanimates the failed attempt. Existing `task.failed`, `task.halted`, and
`wave.halted` history remains valid.

Phase 4 MAY add explicit recovery events:

- `task.retry-authorized` transitions a halted or failed task to `ready` only
  after a Warden `allow_bounded_retry` verdict or an audited human decision;
- `wave.resume-authorized` transitions a halted wave to `ready` only when all
  blocking incidents have a valid disposition and dependency readiness is
  recomputed.

These events MUST bind the prior terminal event, incident, halt, new attempt
identity or attempt-allocation nonce, authorization actor, reason, and budget
ordinal. They do not bypass Phase 2 plan authorization or drift checks. Before
dispatch, the current base, plan, dependencies, acceptance oracles, workspace
ownership, and all blocking incidents are revalidated.

Doctor repair success does not itself emit either authorization event. A
separate Warden verdict or human decision owns retry/resume authority.

## Required event types

Phase 4 implementation MUST add typed events equivalent to:

- `halt.detected`, `halt.classified`, `halt.dispositioned`,
  `halt.healing-started`, `halt.recovered`, `halt.escalated`,
  `halt.quarantined`;
- `incident.opened`, `incident.halt-linked`, `incident.investigating`,
  `incident.healing`, `incident.mitigated`, `incident.resolved`,
  `incident.reopened`, `incident.escalated`;
- `warden.verdict-recorded`;
- `doctor.repair-started`, `doctor.repair-finished`;
- `task.retry-authorized`, `wave.resume-authorized`.

Each event keeps the existing project sequence, previous-event hash, event
hash, actor, causation, and correlation rules. Projection rebuild MUST reject
missing references, duplicate occurrence IDs, illegal transitions, invalid
ordinals, mismatched evidence snapshots, conflicting repair receipts, and
closure while an associated blocking halt is unresolved.

## Stable fail-closed reason codes

At minimum, implementation MUST distinguish:

| Reason | Required outcome |
| --- | --- |
| `HALT_EVIDENCE_INVALID` | Escalate or quarantine |
| `HALT_CLASS_UNKNOWN` | Escalate |
| `ATTRIBUTION_NOT_EXACT` | Deny auto-heal |
| `INCIDENT_CORRELATION_AMBIGUOUS` | Create separate incident and escalate |
| `WARDEN_POLICY_UNKNOWN` | Deny all automatic action |
| `EVIDENCE_STALE` | Require a new assessment and verdict |
| `SIDE_EFFECT_AMBIGUOUS` | Quarantine |
| `RECIPE_NOT_ALLOWLISTED` | Deny auto-heal |
| `RECIPE_PRECONDITION_FAILED` | Deny or escalate |
| `REPAIR_BUDGET_EXHAUSTED` | Escalate |
| `REPAIR_LEASE_LOST` | Stop and quarantine ambiguous completion |
| `REPAIR_RESULT_AMBIGUOUS` | Quarantine |
| `REPLAN_REQUIRED` | Route to Phase 2 architect flow |
| `HUMAN_AUTHORITY_REQUIRED` | Await explicit human decision |
| `BLOCKING_INCIDENT_OPEN` | Reject retry/resume/dispatch |

No fallback may translate an unknown reason, class, recipe, verdict, or state
into a warning or successful recovery.

## Human and architect boundary

The architect may analyze a `plan_or_target_drift` incident and produce the
existing Phase 2 `ArchitectReplanReceiptV1`. It cannot authorize the new plan,
resolve the incident, select a Doctor recipe, or waive a failed oracle.

A human is required for:

- partial/none attribution and disputed correlation;
- source, test, prompt, plan, policy, or dependency changes;
- destructive Git or filesystem actions;
- external writes, deployment, publication, spending, secrets, or permissions;
- overrides, manual handling after unsupported taxonomy/recipe versions, and
  non-executable acceptance; human handling does not make an unsupported
  version valid for automation;
- incident resolution when the policy declares a human-only class.

Human action MUST name the actor, authority source, exact scope, reason,
expiration when applicable, and evidence. Human authorization is not
transferable to another incident, halt, attempt, plan revision, or changed
evidence snapshot.

## Semantic checks beyond JSON Schema

Implementation validators MUST additionally enforce:

- event sequence/hash-chain validity and monotonic ordinals;
- exact cross-record identity agreement;
- deterministic fingerprint recomputation under the recorded version;
- one incident for each classified halt and no silent reassignment;
- one active Warden verdict and repair lease per halt;
- recipe/class compatibility and cumulative budget accounting;
- verdict evidence freshness at repair start;
- retry/resume dependency and Phase 2 dispatch readiness;
- no incident resolution while a blocking halt is active;
- reopen window, fingerprint, and resolution causality;
- embedded timestamps are valid UTC instants and respect publication
  causality without using clock order to reorder events.

## Implementation and acceptance obligations

The implementation queue MUST contain at least two independently useful,
ordered tasks:

1. schemas, semantic validators, event publication, replay projections,
   correlation, and lifecycle APIs;
2. Warden verdicts, Doctor recipes, repair leases/recovery, retry/resume gates,
   and integration tests.

Acceptance evidence MUST include:

- Draft 2020-12 schema/example validation and negative fixtures;
- deterministic replay after process restart;
- duplicate detection and concurrent correlation;
- open, resolve, reopen, and expired-window incident cases;
- exact, partial, none, and conflicting attribution;
- every taxonomy class and unknown-version rejection;
- every Warden denial reason and every allowlisted recipe;
- budget exhaustion, lease loss, stale evidence, crash before/after effect, and
  ambiguous-side-effect quarantine;
- proof that Doctor cannot execute free-form commands or gain new authority;
- retry creates a new attempt and reruns Phase 2/3 gates;
- unchanged Phase 1–3 behavior and legacy record compatibility.

Tests MUST use deterministic fixtures and temporary repositories/providers.
An unavailable capability MUST fail explicitly; safety invariants may not be
silently skipped.
