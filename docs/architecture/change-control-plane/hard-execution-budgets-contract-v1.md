# Hard Execution Budgets Contract v1

Status: accepted, implemented, and completion-reviewed

Prepared: 2026-08-13
Accepted: 2026-08-13
Revision 1 accepted: 2026-08-13

Integration plan: `agentic-patterns-integration-plan-v1.md`, Stage 1 S3

## Proposed decision

Accept S3 as one explicit opt-in execution-budget slice with these fixed
decisions:

- v1 hard-enforces only limits owned and observable by Orchestrator: provider
  process reservations, executor attempts, reviewer invocations, and correction
  invocations;
- every provider-process reservation is persisted before spawn and consumes
  budget conservatively even when the later spawn or process fails;
- the current Codex CLI route has no accepted provider-enforced output-token
  capability, so v1 reports token enforcement as `unsupported` and rejects a
  queue that requests a hard token cap;
- provider-reported token usage remains post-invocation accounting and is never
  relabelled as a pre-invocation hard cap;
- budgets are absent by default, so legacy queues and persisted runs retain
  byte-compatible behavior and receive no synthesized budget authority;
- current model selection remains unchanged; S3 adds no automatic upgrade,
  downgrade, fallback, learned routing, or price-based routing;
- a stronger or more expensive route still requires the existing declared
  route and owner/quality/safety authority; a budget never creates override
  authority;
- budget decisions and settlements are stored only in the existing canonical
  run record, with non-sensitive Phase 5 references when available; v1 creates
  no second ledger or remote service.

Owner acceptance of revision 1 authorizes only the implementation impact map
below. It does not authorize S4-S6, monetary budgets, dynamic
pricing, provider changes, automatic model optimization, or a future Codex
feature that has not been separately pinned and preflighted.

## Outcome

An opted-in task carries one closed `ExecutionBudgetPolicyV1`. Before every
Orchestrator-owned Codex provider process, the runtime evaluates and persists a
deterministic `ExecutionBudgetAdmissionV1`. It either reserves one exact
invocation or prevents spawn with one closed disposition. After the process
settles, the runtime persists one `ExecutionBudgetSettlementV1` containing
bounded provider-reported accounting evidence.

Equal normalized policy, task identity, prior reservations, phase, attempt, and
runtime capability evidence produce the same admission identity, disposition,
and reason code. Time and process results are settlement evidence, not inputs to
the admission hash.

S3 v1 does not claim to limit opaque provider-internal requests, tool calls made
inside one Codex process, reasoning tokens not exposed by the runtime, billing,
latency, context-window allocation, or host-owned agent activity.

## Current-state and gap matrix

| Area | Current evidence | S3 gap | v1 disposition |
|---|---|---|---|
| Executor attempts | `maxRetries`, `limits.maxTaskRetries`, and `executionAttempts` bound the executor loop | no single task-wide provider-process budget or pre-spawn receipt | preserve existing limits and require the S3 caps to be no less restrictive |
| Reviewer/correction | `review.enabled`, `review.maxCorrections`, `attempts`, and the reviewer/correction paths bound cycles | limits are separate from executor retries and have no shared reservation identity | add explicit per-phase and total caps checked before spawn |
| Provider runtime | provider identity and continuation decision are persisted before executor/correction work | continuation selection is not execution-budget admission | bind the reservation to the existing provider runtime identity without changing continuation semantics |
| Phase 5 lineage | attempt/invocation bindings and resolved model executions identify opted-in provider work | legacy and non-Phase-5 tasks still invoke Codex | store S3 evidence in `run.json`; attach Phase 5 references only when already present |
| Token usage | Codex JSON events provide post-call input, output, cached-input, and optional cache-write counts | events are accounting after execution and may not be provider-enforced limits | normalize one terminal settlement per reserved process; never use it as a hard pre-call token cap |
| Output-token enforcement | local `codex-cli 0.146.0` `exec --help` exposes no supported output-token option; `token_budget` is an under-development feature | no accepted production capability can enforce the claim | `unsupported`; explicit hard-token requests fail queue admission |
| Context estimate | S2 supplies exact bytes and estimated or pinned-tokenizer token observations | repository-context estimate is not the full provider request and is not billing truth | advisory input evidence only; no S3 hard decision from estimates |
| Model routing | explicit/auto model resolution, minimum model, allowed models, and Phase 5 routes already exist | a budget could be misused as new routing authority | keep the already resolved model; no automatic route change in v1 |
| Recovery | canonical `run.json` and task lifecycle recovery fail closed across interrupted processes | a crash boundary could double-spawn if a reservation is not durable | persist reservation before spawn; an ambiguous reservation stays consumed |
| Monetary evidence | Phase 10 can store exact historical provider cost evidence | there is no immutable forward pricing authority | no money, price, currency conversion, or cost routing in v1 |

## Authority and source of truth

- Current code, queue validation, canonical `.orchestrator/runs/<run-id>/run.json`,
  task authorization evidence, and Phase 5 lineage are runtime truth in their
  existing scopes.
- An accepted task `ExecutionBudgetPolicyV1` is authority only to refuse or
  reserve the closed Orchestrator-owned invocations named here. It grants no
  filesystem, network, provider, retry, model, or publication permission.
- Existing `maxRetries`, reviewer settings, task authorization, Warden repair
  budgets, Phase 4 retry authority, Phase 5 model routes, and verification
  requirements remain independently authoritative. The most restrictive
  applicable limit wins.
- Provider JSON usage is measured settlement evidence only. Missing, malformed,
  duplicated, or conflicting usage remains `unsupported` or `incomparable` and
  never becomes zero.
- S2 baseline reports are advisory input evidence for S3. S3 does not mutate or
  reinterpret the accepted S2 baseline.
- Phase 10 provider cost evidence remains historical observation, never a
  pricing table or forward execution authority.

## Closed queue policy

The optional task field is exactly:

```yaml
executionBudget:
  contractType: ExecutionBudgetPolicyV1
  contractVersion: "1.0"
  budgetId: task-budget-v1
  maxProviderInvocations: 4
  phaseCaps:
    executor: 1
    reviewer: 2
    correction: 1
```

The closed policy contains only:

| Field | Rule |
|---|---|
| `contractType` | exactly `ExecutionBudgetPolicyV1` |
| `contractVersion` | exactly `1.0` |
| `budgetId` | 1-128 ASCII characters matching the existing bounded identity style |
| `maxProviderInvocations` | integer 1-16 |
| `phaseCaps.executor` | integer 1-4 |
| `phaseCaps.reviewer` | integer 1-2 |
| `phaseCaps.correction` | integer 0-1 |

Unknown fields fail validation. `maxProviderInvocations` must be no greater
than the sum of phase caps and no smaller than each individual cap. A positive
correction cap requires a reviewer cap of two: the current lifecycle performs
one initial review and one mandatory re-review after a successful correction.
The correction cap must not exceed the current `review.maxCorrections`.

The executor cap must be no greater than `(task.maxRetries ??
limits.maxTaskRetries) + 1`. Existing retry and correction settings are not
raised or synthesized to satisfy an S3 policy. A contradictory policy fails
before run or lock creation.

No run-level default exists in v1. This keeps opt-in and identity local to the
task and prevents an old queue from acquiring new execution semantics.

## Closed invocation boundary

One S3 `provider invocation` means one child Codex process spawned by
Orchestrator for exactly one of:

1. `executor`;
2. `reviewer`;
3. `correction`.

Preconditions, verification commands, Git operations, helper processes,
workspace/merge operations, Warden/Doctor adapters, HTTP connector reads, and
tool calls performed inside a Codex child are not provider invocations in S3
v1. Their existing independent limits remain unchanged.

Every reservation has the tuple:

```text
runId
taskId
budgetHash
phase
phaseOrdinal
taskInvocationOrdinal
resolvedModel
providerRuntimeIdentityHash | unsupported
attemptBindingId | unsupported
```

The tuple is normalized before hashing. `phaseOrdinal` starts at one inside its
phase; `taskInvocationOrdinal` starts at one across all three phases.
Duplicates or gaps fail replay validation.

## Admission, reservation, and settlement

Before spawn the runtime executes this order:

1. validate the persisted queue and exact task budget again;
2. validate task authorization, workspace, and model route through their
   existing owners;
3. reconstruct prior reservations from canonical `run.json`;
4. evaluate total and per-phase remaining counts while reserving capacity for
   the next mandatory reviewer;
5. persist one exact reservation with a deterministic admission identity;
6. re-read the canonical task and confirm that the reservation is current;
7. only then prepare or reuse provider continuation, publish any already
   authorized Phase 5 invocation binding, and spawn the Codex process.

A reservation consumes both total and phase budget at step 5. A later spawn
failure, timeout, cancellation, crash, missing usage event, or non-zero exit
does not refund it. Retry, resume, and correction must use a new reservation.

Before an executor retry, Orchestrator reserves one unconsumed total/reviewer
slot for the initial required review. Before correction, it reserves one
unconsumed total/reviewer slot for the required post-correction review. Optional
executor retries and correction are rejected before they can consume that
capacity. A valid fresh policy therefore cannot silently strand ordinary
required review; `human-decision-required` covers failed or ambiguous required
review reservations and replay conflicts, not intentional overbooking.

Settlement records exactly one of:

- `completed`;
- `failed`;
- `timed_out`;
- `cancelled`;
- `not_started_after_reservation`;
- `recovery_ambiguous`.

Settlement never changes admission identity or remaining count. It may contain
one normalized provider usage observation, or an explicit `unsupported`,
`missing`, or `conflicting` state. It contains no prompts, outputs, environment
values, credentials, hidden reasoning, raw provider events, or tool payloads.

## Closed dispositions

Admission returns exactly one disposition:

| Disposition | Meaning | Runtime result |
|---|---|---|
| `allow` | exact total and phase capacity remains and all owning gates pass | persist reservation, then continue toward spawn |
| `reject` | requested optional executor retry or correction exceeds a hard cap, or policy/capability is invalid | do not spawn; settle the task through its existing failed/blocked semantics with the stable reason |
| `defer` | a prior reservation may still own a live process or asynchronous persistence boundary | do not spawn or consume another reservation; wait for existing reconciliation |
| `human-decision-required` | a hard cap prevents an owner-required or safety-critical reviewer/correction/verification outcome from being established | pause/block without marking the task approved or completed |

`defer` is not a timer, quota reset, or background retry authority. The existing
runtime may re-evaluate only after its normal process/recovery state changes.

A budget cannot skip required verification. Verification is not a provider
invocation, so it runs under existing authorization after successful executor
work. A required reviewer that cannot be invoked produces
`human-decision-required`; it is never silently treated as approved.

## Token evidence and capability policy

S3 v1 distinguishes:

- `input_estimate`: advisory evidence computed before a call;
- `provider_enforced_output_limit`: hard only when an accepted adapter passes an
  exact limit to the provider and proves that capability identity;
- `measured_usage`: provider-reported post-call accounting;
- `remaining_invocations`: exact hard Orchestrator-owned count;
- `unsupported`: the active route cannot enforce or observe the claim.

For the current `codex-cli` adapter,
`provider_enforced_output_limit` is `unsupported`. The v1 queue schema therefore
contains no token-limit field. Unknown token-limit fields fail closed instead
of becoming advisory.

Enabling a future CLI flag, config key, experimental feature, or provider API
requires a separately owner-accepted contract revision that pins:

- adapter and runtime version;
- exact option/config identity;
- provider interpretation of the limit;
- capability preflight;
- failure and fallback semantics;
- focused integration evidence proving the process receives and enforces it.

Post-call measured tokens may be shown in settlement and reports but cannot
prevent the call that produced them. Aggregate token warnings remain advisory
until a technically enforceable pre-call boundary exists.

## Model and override semantics

- Task model and effort resolve exactly as today before S3 admission.
- S3 does not change `auto` routing, `minModel`, project `allowedModels`, or
  Phase 5 `ModelRouteV1` resolution.
- Budget exhaustion never selects a cheaper, smaller, stronger, or fallback
  model.
- Existing declared fallback remains valid only under its existing Phase 5 and
  provider runtime rules; it does not gain budget headroom.
- No queue field in S3 v1 expresses a quality, safety, or owner override.
- If owner-required work cannot fit, the result is
  `human-decision-required`. Editing a persisted reservation is forbidden.

## Identity, persistence, and replay

`budgetHash` is SHA-256 over canonical sorted JSON of the normalized policy.
The task lifecycle/authorization identity must include the exact policy and
hash so a changed cap invalidates stale launch, retry, resume, and replay
authority.

The canonical task record adds a bounded ordered array of admission/settlement
evidence. Maximum entries are derived from `maxProviderInvocations`; arbitrary
history is rejected. Run summaries may project counts and dispositions from
that array but are never canonical.

On load, restart, retry, and resume, Orchestrator revalidates:

- policy schema and semantic constraints;
- authorization-bound task identity;
- admission hashes and ordinals;
- at most one reservation per identity;
- at most one settlement per reservation;
- cap totals and phase totals;
- Phase 5 reference consistency when a reference is present.

Malformed, duplicated, over-budget, reordered, or impossible evidence makes
the persisted task non-replayable. Orchestrator does not repair, refund, or
guess historical budget state.

Legacy records without `executionBudget`, S3 evidence, or an S3 carried-source
reference remain readable and
replay under existing behavior. Evidence is never synthesized for them.

Budget scope is one task inside one run. Process restart/recovery of the same
canonical run preserves its policy, reservations, and remaining counts and
never resets budget. User-initiated resume and retry use the existing behavior:
they create new run/task identities and therefore a fresh bounded budget with
the exact carried-forward policy while retaining prior evidence only in the
source run. They still require all existing authorization, topology, workspace,
retry/resume, and replay gates. S3 grants neither operation nor a policy edit.

## Privacy and diagnostics

Schema and semantic errors use stable bounded reason codes. Public task/run
surfaces may expose budget identity, cap counts, consumed counts, remaining
counts, phase, disposition, settlement status, enforcement state, and safe
reason codes.

They must not expose prompts, final output through new fields, raw JSONL usage
events, credentials, configuration files, environment values, hidden reasoning,
provider response identifiers, private adapter diagnostics, or source content.

## Stable reason codes

The initial closed set is:

- `EXECUTION_BUDGET_POLICY_INVALID`;
- `EXECUTION_BUDGET_IDENTITY_CHANGED`;
- `EXECUTION_BUDGET_TOTAL_EXHAUSTED`;
- `EXECUTION_BUDGET_PHASE_EXHAUSTED`;
- `EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED`;
- `EXECUTION_BUDGET_RESERVATION_CONFLICT`;
- `EXECUTION_BUDGET_REPLAY_INVALID`;
- `EXECUTION_BUDGET_USAGE_MISSING`;
- `EXECUTION_BUDGET_USAGE_CONFLICTING`;
- `EXECUTION_BUDGET_TOKEN_ENFORCEMENT_UNSUPPORTED`;
- `EXECUTION_BUDGET_CAPABILITY_CHANGED`;
- `EXECUTION_BUDGET_DEFERRED_TO_LIVE_RESERVATION`.

Private errors may contain internal detail in server logs. Persisted and public
evidence uses only the bounded code plus normalized non-sensitive identities.

## Exact implementation impact map

An accepted contract would authorize one bounded current-session
implementation slice touching only:

```text
server/execution-budgets-v1/index.ts
server/execution-budgets-v1/index.test.ts
server/execution-budgets-v1/schemas/execution-budgets-v1.schema.json
server/execution-budgets-v1/schemas/execution-budgets-v1.examples.json
server/index.ts
server/index.test.ts
tasks.example.yaml
package.json
docs/architecture/change-control-plane/hard-execution-budgets-contract-v1.md
docs/architecture/change-control-plane/agentic-patterns-integration-plan-v1.md
docs/architecture/change-control-plane/README.md
docs/NEXT_STEPS.md
docs/context_packs/current_status.md
```

`server/index.ts` seams are limited to queue parsing/validation, task lifecycle
identity, pre-spawn admission/reservation, post-process settlement, persisted
run replay, and bounded projections already emitted by the server.

`server/index.test.ts` is limited to integration, legacy, restart, retry,
reviewer/correction, and provider-spawn fencing coverage. `package.json` may
only register the focused test in the normal suite. `tasks.example.yaml` may
only add one commented or executable valid opt-in example.

No change is authorized to:

- `server/change-control-v1/`, Phase 4 Warden/Doctor policy, or Phase 5 schemas;
- S2 baseline, context helper, Context Contract schemas, or prompt compiler;
- APIs, dashboard/UI, Electron, connectors, operational evidence, or audit
  bundles;
- queue plan format, managed workspace/merge ownership, checkpoint semantics,
  verification authorization, or Project Map;
- dependency manifests other than the `package.json` test-script entry;
- external systems, provider configuration, credentials, or installed Codex.

If implementation proves that any additional production, test, generated,
manifest, schema, documentation, acceptance, or recovery file is required,
stop and revise the impact map before mutation.

## Implementation order

1. Add closed Draft 2020-12 schemas and semantic fixtures.
2. Implement a pure deterministic policy/admission/replay service with no
   process, filesystem, network, clock, or server dependency.
3. Add queue validation and lifecycle-identity binding.
4. Add persisted pre-spawn reservation at executor, reviewer, and correction
   seams.
5. Add settlement normalization from the existing usage/process evidence.
6. Add restart/retry/resume replay validation and legacy compatibility.
7. Add the opt-in queue example and bounded run/report projection.
8. Run focused, TypeScript, build, context smoke, diff, and full Windows
   regression gates.
9. Conduct a separate completion review before S4 may be proposed.

## Acceptance requirements

Implementation is accepted only if evidence proves:

- closed schemas reject every unknown field, invalid count, contradiction,
  duplicate identity, and unsupported token-cap declaration;
- absent policy leaves legacy queue validation, launch, process count, retry,
  review, correction, persistence, and replay behavior unchanged;
- every opted-in Codex child has exactly one persisted reservation created
  before spawn;
- total and phase caps cannot be exceeded under retry, correction, concurrent
  admission, crash, restart, resume, or forged persisted evidence;
- a spawn failure or ambiguous crash consumes but never refunds a reservation;
- required review cannot be skipped or converted to approval by exhaustion;
- verification commands retain their independent mandatory authorization and
  execution semantics;
- current model selection and fallback behavior are byte-equivalent when the
  budget allows the invocation;
- no automatic model change or token-enforcement claim occurs;
- provider usage is attached to the exact reservation at most once, and
  missing/conflicting evidence stays explicit;
- task lifecycle identity changes when the policy changes;
- public diagnostics remain bounded and privacy-safe;
- S1, S2, Phase 1-12, queue authoring, workspace/merge, provider runtime,
  retry/resume, reviewer/correction, and legacy regressions pass;
- the full Windows suite runs with at least a ten-minute timeout;
- a separate completion review finds no unresolved or deferred acceptance
  issue.

## Verification requirements

At minimum, the implementation task must run:

```powershell
npm.cmd run test:execution-budgets
npm.cmd run check
npm.cmd run build
& $env:PYTHON_BIN scripts/ai_context_helper.py --root . smoke-check --format json
npm.cmd test
git diff --check
```

The focused integration suite must use an injected/spied process seam; it must
not perform a live provider request or depend on credentials. The full Windows
suite receives at least a ten-minute timeout.

## Stop conditions

Stop before or during implementation if:

- the current adapter must claim a token cap it cannot technically enforce;
- a policy would change behavior for a queue that omitted `executionBudget`;
- a reservation cannot be durably persisted before spawn;
- retry, reviewer, or correction can spawn without the same admission seam;
- recovery would need to infer whether an ambiguous invocation was free;
- budget exhaustion could skip required verification or imply approval;
- a model change, fallback, escalation, or quality override must be inferred;
- pricing would come from mutable web knowledge or unversioned configuration;
- provider usage cannot be bound without double-counting or guessing;
- Phase 4/5 canonical schemas, a new ledger, API, UI, external call, credential,
  dependency installation, or Project Map mutation becomes necessary;
- the exact impact map is incomplete.

## Explicit non-goals

S3 v1 does not add provider-enforced token limits on the current Codex CLI,
input-token hard caps, context truncation, monetary/cost budgets, pricing,
currency conversion, latency SLOs, tool-call budgets, shell-command budgets,
file-change budgets, learned routing, model optimization, automatic downgrade
or escalation, adaptive effort, dynamic quota refresh, billing reconciliation,
background monitoring, telemetry, dashboards, alerts, new HTTP routes, live
provider tests, credentials, S4 tool capability policy, S5 workflow evals, S6
progressive disclosure, or Stage 2 work.

## Owner acceptance

The owner accepted the exact revision 1 correction and this contract on
2026-08-13 using:

```text
принимаю S3 contract v1 revision 1
```

The correction distinguishes same-run process recovery from the existing
user-initiated resume/retry operations, which allocate new run/task identities.
No other contract decision changed.

## Implementation and completion evidence

The bounded S3 slice was implemented on 2026-08-13 within the exact impact map.
The runtime now closed-validates and authorization-binds the opt-in policy,
persists and re-reads each reservation before the Codex child-process boundary,
settles provider usage without inventing missing values, conservatively
consumes ambiguous recovery reservations, and rejects malformed persisted
evidence. Same-run recovery preserves the canonical budget. User retry/resume
creates fresh run/task identities and keeps completed predecessor evidence only
in the source run, with one bounded source reference in the new run.

Verification passed:

- `npm.cmd run test:execution-budgets`: 14/14 focused service and integration
  tests;
- `npm.cmd run check` and `npm.cmd run build`;
- context smoke: 3/3 and the accepted S2 baseline: 10/10;
- `npm.cmd test`: 337/337, zero failures, skips, cancellations, or todos in
  365.82 seconds under a 15-minute Windows timeout;
- `git diff --check`.

The separate completion review checked every acceptance category against the
closed schemas, pure service, injected fake-process integration, persisted-run
replay, retry/resume regression, legacy task in the same runtime run, and full
suite. It found no unresolved or deferred acceptance issue. The current Codex
route still receives no token-budget/output-token option, model routing remains
unchanged, and S4-S6 remain unauthorized.
