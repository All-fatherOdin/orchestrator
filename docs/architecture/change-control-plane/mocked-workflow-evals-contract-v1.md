# Mocked Workflow Evals Contract v1

Status: accepted; implementation authorized only after the baseline gate is green

Prepared: 2026-08-13

Accepted: 2026-08-13 (`принимаю S5 contract v1`)

Integration plan: `agentic-patterns-integration-plan-v1.md`, Stage 1 S5

## Accepted decision

Adopt S5 as one credential-free, deterministic, in-memory workflow-eval
adapter over the existing Phase 5 eval lineage. S5 evaluates source-owned
workflow fixtures against injected mock boundaries, produces a closed
recomputable trace result, and can map that result to one ordinary Phase 5
`EvalObservationV1`. It creates no second suite, run, report, event, or
promotion registry.

The recommended v1 boundary is:

- add one focused `server/workflow-evals-v1/` module with closed Draft 2020-12
  schemas, examples, immutable fixture manifest, pure evaluator, and focused
  tests;
- evaluate exactly three initial workflow families: the existing Phase 12
  GitHub deployment preview/execute/retry workflow, the six-operation local
  context PTC workflow, and one S4 capability-denial workflow that must stop
  before every mocked effect;
- identify top-level tools only by the exact current S4 manifest identities;
  identify nested mocked boundary operations by a separate closed S5
  `operationId` inventory which grants no production authority;
- match calls by exact operation identity, occurrence, canonical public
  argument hash, deterministic mock outcome, and a bounded acyclic partial
  order;
- declare forbidden calls explicitly and also enforce zero live network,
  provider, credential, external-write, and uncontrolled-filesystem effects;
- inject failures at one exact declared call occurrence and preserve the
  resulting terminal state and trace without retries unless the fixture
  explicitly expects an existing production retry behavior;
- make only executable, deterministic assertions blocking in v1; model-judged
  grading is unsupported and cannot affect result, report, or champion gates;
- retain only stable IDs, hashes, reason codes, ordinal trace metadata, and
  bounded public-fixture summaries; never retain credentials, headers, raw
  private arguments, prompts, tool outputs, environment values, or stack
  traces;
- run entirely in process using dependency injection and temporary owned test
  state; perform no live provider/GitHub request, credential read, external
  write, publication, or canonical ledger mutation.

Owner acceptance authorized only the exact implementation impact map in this
contract, subject to the pre-implementation baseline gate. It did not authorize
S6, new production tools or effects,
live evals, model grading, automatic suite publication, champion promotion,
API/UI/queue fields, external telemetry, or workflow execution authority.

## Pre-implementation baseline gate

The post-merge Windows workflow for S4 run `31687531004` completed with one
unrelated failure in the pre-existing isolated Phase 3 target-fencing stress
test. All three isolated attempts observed Windows `EPERM` while atomically
renaming a temporary `run.json`, instead of the expected live-lease loser
result. The S4 local full regression had passed 347/347, and the CI failure did
not identify an S4 or proposed S5 path, but `main` is not a green CI baseline.

S5 contract review may proceed. S5 implementation must not start until that
failure is separately resolved or a clean authoritative rerun establishes a
green baseline. The fix is outside the S5 impact map and requires its own
bounded authorization; it must not be hidden inside S5.

## Decisions requiring owner agreement

| Decision | Option A — recommended | Option B | Option C | Recommendation |
|---|---|---|---|---|
| Product boundary | pure in-memory adapter over Phase 5 | new canonical workflow-eval registry | test-only prose fixtures | A; reuses Phase 5 without duplicating authority and remains reusable outside one test file |
| Initial workflow inventory | GitHub intake, PTC reduction, S4 denial | every S4 tool family | GitHub only | A; covers external read, local composition, and pre-effect denial while staying bounded |
| Fixture ownership | immutable source-owned versioned manifest | model-generated cases | mutable runtime upload | source-owned; replay and review require fixed bytes |
| Call matching | exact operation/occurrence/argument hash plus bounded partial order | free-form trace text | exact total order only | exact match plus DAG; catches drift without overconstraining independent calls |
| Mock compatibility | adapters implement the existing production interfaces and contract hashes bind fixtures | duplicate production logic inside mocks | record/replay live traffic | interface-bound mocks; duplicate logic and captured traffic both drift or leak |
| Failure injection | exact declared occurrence and deterministic error/result | random fault rate | manual test exceptions | exact injection; identical fixture bytes must replay identically |
| Forbidden behavior | explicit forbidden calls plus zero-effect counters | infer absence from a passed terminal state | logs only | both; terminal success alone cannot prove absence of side effects |
| Objective grading | executable deterministic assertions may block | model judge blocks by default | all assertions advisory | executable-only blocking; model grading remains unsupported in v1 |
| Phase 5 integration | pure mapping to existing `EvalObservationV1`, publication stays with Phase 5 owner | auto-publish events/reports | separate S5 observation store | pure adapter; S5 supplies evidence but gains no publication authority |
| Evidence privacy | stable IDs/hashes/reason codes and bounded public summaries | raw arguments/results | hash only with no reconstructible fixture identity | bounded hashed evidence; enough for replay without retaining secrets |
| Legacy behavior | no S5 call means byte-identical existing Phase 5/runtime behavior | automatically run S5 on every eval | migrate existing observations | unchanged legacy behavior |
| Rollout | credential-free focused and regression gates only | background/CI live GitHub eval | operator-triggered API | local deterministic gates only |

Accepting `S5 contract v1` means accepting every Option A in this table. Any
different selection requires a revision before implementation.

## Current-state and gap matrix

| Surface | Current evidence | Gap closed by S5 | Preserved owner |
|---|---|---|---|
| Phase 5 eval lineage | closed suites/cases/cohorts/runs/observations/reports, fixed matrices, deterministic reports, champion authority | no structured complete tool-call trace oracle | Phase 5 remains canonical and alone publishes observations/reports/decisions |
| Phase 12 GitHub connector | injected `FetchV1`, fixed three-GET preview, refetch/execute, Phase 10 delegation, existing mocked tests | scenarios are assertions embedded in a large integration test, not versioned workflow fixtures | Phase 12 and Phase 10 retain remote-read and import authority |
| Context PTC | injected executor, six closed deterministic operations, call receipts, direct validation | no reusable expected/forbidden call manifest or workflow result | context router retains reduction and final-validation authority |
| S4 chain gate | 18 immutable identities, deterministic decisions, exact accepted path, fail-closed composition | no complete workflow fixture proving denied chains reach zero effects | S4 retains capability classification only |
| Doctor/operator actions | direct-only S4 entries and strong existing owning-gate tests | no adapter seam needed for the minimum S5 risk coverage | Warden/lease and operator preview/confirmation remain authoritative |
| Runtime/provider evals | Phase 5 permits `mock`, `provider`, and `imported` run modes | live/provider behavior is unnecessary for the credential-free gate | provider runtime and execution budgets remain unchanged |

S5 does not replace existing focused unit/integration tests. It adds a small
versioned workflow language and evaluator so complete traces and prohibited
effects are independently replayable and can enter Phase 5 as ordinary
objective evidence.

## Closed contracts

The S5 schema has one top-level `oneOf` over exactly:

- `WorkflowEvalManifestV1`;
- `WorkflowEvalFixtureV1`;
- `WorkflowEvalTraceV1`;
- `WorkflowEvalResultV1`.

Every object is closed with `additionalProperties: false`. Contract version is
`1.0`. IDs are bounded ASCII identifiers, arrays have explicit maximums, text
is bounded, hashes are lowercase SHA-256, ordinals are positive integers, and
all reason-code vocabularies are closed enums.

### WorkflowEvalManifestV1

The immutable manifest contains:

- `manifestId`, integer `manifestVersion`, and `contractVersion`;
- an ordered, canonically sorted list of exactly three fixture IDs;
- for each fixture: workflow family, fixture version, fixture content hash,
  expected top-level S4 tool IDs, and runner adapter ID/version;
- a closed nested-operation inventory owned by S5;
- the exact S4 manifest ID, version, and hash used when the fixture was built.

The manifest and fixtures are imported JSON artifacts. Startup validation
rejects unknown fields, duplicate or unsorted IDs, missing fixtures, changed
fixture hashes, unknown S4 tool IDs, stale S4 manifest identity, unknown
adapter identity, or an operation not owned by the declared workflow family.
They are deeply frozen after validation.

Nested `operationId` values describe mock observations only. They cannot be
passed to S4 as tool identities and grant no filesystem, network, credential,
mutation, provider, Phase 10, or operator authority.

### WorkflowEvalFixtureV1

Each fixture fixes:

- `fixtureId`, `fixtureVersion`, workflow family, and public-fixture privacy
  classification;
- one bounded input fixture with stable public IDs and no secrets;
- the ordered top-level S4 tool identities and required S4 decision
  disposition/reason codes;
- zero to 64 expected calls, each with `callId`, `operationId`, occurrence,
  exact canonical argument hash, expected outcome kind/hash, and public summary;
- zero to 64 forbidden `operationId` values;
- zero to 128 directed `beforeCallId -> afterCallId` ordering edges;
- optional exact failure injection with call ID, phase (`before` or `instead`),
  stable error code, and retry expectation;
- expected terminal state, result disposition, closed reason codes, evidence
  refs, and effect-counter envelope;
- a limit envelope for calls, trace bytes, public summary bytes, and elapsed
  virtual steps.

Ordering edges must reference known distinct expected calls and form an
acyclic graph. Duplicate calls, edges, forbidden operations, evidence refs,
or reason codes fail closed. An expected operation cannot also be forbidden.
Every expected call must belong to the declared workflow family.

Arguments and mock outputs are validated against the existing production
adapter boundary before hashing. The retained trace stores hashes and bounded
public summaries, not raw values. A fixture cannot declare a credential,
authorization bypass, live URL, arbitrary path, provider request, external
write, or non-temporary filesystem target.

### WorkflowEvalTraceV1

The runner emits one trace containing:

- fixture/manifest/S4 identities and runner adapter identity;
- ordered observations with call ID, operation ID, occurrence, argument hash,
  outcome kind/hash, virtual step, and bounded public summary;
- the exact S4 capability decision IDs evaluated by the workflow;
- terminal state;
- effect counters for `mockInteractions`, `liveNetworkRequests`,
  `providerCalls`, `credentialReads`, `externalWrites`,
  `uncontrolledFilesystemWrites`, and `canonicalLedgerWrites`;
- trace content hash.

The runner owns a monotonically increasing virtual step. Wall-clock time,
randomness, process IDs, absolute paths, environment values, and network state
are not trace inputs. Any required timestamp is fixture data.

`mockInteractions` counts declared mock calls. Every other effect counter must
be zero in S5 v1. The runner rejects an undeclared call before its adapter can
produce an outcome.

### WorkflowEvalResultV1

The pure evaluator recomputes one result from exact manifest, fixture, and
trace bytes. It contains:

- manifest, fixture, trace, runner, and S4 identities;
- disposition `passed`, `failed`, or `unsupported`;
- closed reason codes;
- per-oracle results for schema, S4 decision, expected calls, forbidden calls,
  argument hashes, outcomes, partial order, failure injection, terminal state,
  effects, limits, privacy, and deterministic replay;
- bounded evidence refs;
- result content hash.

Equal inputs produce byte-equal results. A failed or unsupported oracle is
never omitted. `passed` requires every blocking executable oracle to pass.

## Stable reason codes

S5 v1 uses exactly:

- `WORKFLOW_EVAL_PASSED`;
- `WORKFLOW_EVAL_SCHEMA_INVALID`;
- `WORKFLOW_EVAL_MANIFEST_CHANGED`;
- `WORKFLOW_EVAL_FIXTURE_CHANGED`;
- `WORKFLOW_EVAL_S4_IDENTITY_CHANGED`;
- `WORKFLOW_EVAL_ADAPTER_MISMATCH`;
- `WORKFLOW_EVAL_UNDECLARED_CALL`;
- `WORKFLOW_EVAL_EXPECTED_CALL_MISSING`;
- `WORKFLOW_EVAL_FORBIDDEN_CALL`;
- `WORKFLOW_EVAL_ARGUMENT_MISMATCH`;
- `WORKFLOW_EVAL_OUTCOME_MISMATCH`;
- `WORKFLOW_EVAL_ORDER_VIOLATION`;
- `WORKFLOW_EVAL_FAILURE_INJECTION_MISMATCH`;
- `WORKFLOW_EVAL_TERMINAL_STATE_MISMATCH`;
- `WORKFLOW_EVAL_PROHIBITED_EFFECT`;
- `WORKFLOW_EVAL_LIMIT_EXCEEDED`;
- `WORKFLOW_EVAL_PRIVACY_REJECTED`;
- `WORKFLOW_EVAL_REPLAY_INVALID`;
- `WORKFLOW_EVAL_MODEL_GRADING_UNSUPPORTED`.

Unknown reason codes fail schema validation. Diagnostics exposed beyond the
test process use only the stable code and a fixed private message.

## Initial fixture inventory

The v1 manifest contains exactly three fixtures.

### `github-deployment-intake-v1`

This fixture uses the real `GitHubDeploymentConnectorServiceV1` with injected
`FetchV1` and the existing Phase 10 authority interface over temporary owned
state. Its scenarios are one fixture matrix:

- preview performs exactly the three fixed mocked GET operations, produces no
  canonical mutation, and binds the accepted S4 GitHub path;
- execute repeats the exact three mocked GETs, delegates one Phase 10 preview
  and one confirmed import, and produces one immutable receipt;
- an exact retry returns the existing receipt and performs no extra mocked GET
  or mutation;
- changed snapshot, stale project evidence, rate rejection, oversized
  response, and privacy-invalid input reach their exact terminal rejection and
  forbidden Phase 10 execution calls remain absent.

No real GitHub origin, token, header, or response capture enters fixtures or
traces. The fixed mock adapter validates the same request method/path/header
shape as the production connector while retaining only public hashes.

### `context-ptc-reduction-v1`

This fixture uses `applyContextProgrammaticReductionV1` and an injected
executor implementing the existing PTC interface. It proves:

- the six exact S4 identities are evaluated as one allowed composable chain;
- calls occur in the existing filter, join, rank, deduplicate, aggregate,
  schema-validate order;
- caller/call linkage, evidence retention, deterministic outcomes, bounded
  retry, and direct final validation are preserved;
- an exact injected retryable failure follows the declared retry and an
  exhausted or malformed outcome reaches direct fallback;
- provider, network, credential, external-write, uncontrolled-filesystem, and
  canonical-ledger counters remain zero.

### `s4-capability-denial-v1`

This fixture submits one known forbidden composition containing a direct-only
operator identity and the external GitHub read identity. It proves:

- the current exact S4 manifest returns the expected rejection before effect;
- no mock operation, operator action, GitHub fetch, Phase 10 call, provider
  call, credential read, filesystem write, or ledger mutation occurs;
- changed/unknown S4 identity or a forged accepted path fails closed;
- opaque Codex internal tools remain unsupported rather than simulated.

S5 does not invoke Doctor or operator production effects. Their direct-only
classification is evaluated as security-chain evidence only; their existing
owning-gate integration tests remain authoritative.

## Phase 5 mapping and authority

S5 exports a pure adapter that maps a validated `WorkflowEvalResultV1` plus an
explicit caller-supplied Phase 5 run/case/candidate/invocation/member envelope
to an ordinary `EvalObservationV1`:

- `passed`, `failed`, and `unsupported` map directly;
- objective oracle results become existing outcome dimensions with evidence
  refs to manifest, fixture, trace, result, and S4 decisions;
- S5 reason codes enter `policyViolationCodes` only for failed blocking
  policy/security assertions;
- metrics remain unsupported unless the fixture declares a deterministic
  count metric already covered by the Phase 5 suite;
- halt/incident IDs and observation coverage come only from the explicit Phase
  5 envelope and are never inferred by S5.

The adapter validates the result before mapping but does not append an event.
Phase 5 retains suite publication, run registration, observation publication,
sealing, report computation, comparability, and champion authority. A passed
mock workflow is evidence about fixture conformance, not production success,
deployment health, security certification, or promotion authority.

No Phase 5 schema change is required in v1. The existing `EvalObservationV1`
already carries result, outcomes, evidence refs, policy violations, incident
coverage, and explicit unsupported metrics.

## Replay, drift, and compatibility

- Manifest, fixture, trace, and result hashes use canonical UTF-8 JSON.
- Every trace binds exact fixture bytes, runner ID/version, and S4 manifest
  identity. Changed production adapter identity requires a new fixture version.
- Result replay revalidates schemas and recomputes all oracle outcomes and the
  result hash. Changed, missing, duplicated, or reordered evidence fails
  closed where order is significant.
- A mock adapter must satisfy the current production interface. Compile-time
  compatibility plus focused behavioral contract checks guard drift; S5 does
  not copy production decision logic into mocks.
- Existing Phase 5 records, runs, reports, S4 decisions, connector receipts,
  queues, and legacy tests remain valid without S5 evidence.
- S5 state is never recovered on startup because v1 creates no canonical or
  runtime state. A rerun starts from immutable fixture bytes and fresh
  temporary owned state.

## Limits and privacy

Hard maxima are fixed in code and schema:

- 3 fixture identities in the initial manifest;
- 16 scenarios per fixture;
- 64 expected calls and 64 forbidden operation IDs per scenario;
- 128 ordering edges;
- 64 trace observations;
- 32 evidence refs and 32 oracle results;
- 64 KiB per fixture, 64 KiB per trace, and 64 KiB per result;
- 256 bytes per public summary and 128 virtual steps.

S5 accepts only `public_fixture` data in v1. Privacy validation rejects keys or
content representing tokens, authorization headers, cookies, passwords,
secrets, environment dumps, absolute user paths, raw prompts, hidden reasoning,
stack traces, or private production payloads. The evaluator never echoes the
rejected value.

Temporary test directories must be explicitly created beneath the operating
system temporary directory and removed by the owning test. S5 itself performs
no filesystem write. The full gate must work with network disabled and no
GitHub/provider credential present.

## Exact implementation impact map

Acceptance authorizes changes only to these paths:

```text
server/workflow-evals-v1/index.ts
server/workflow-evals-v1/index.test.ts
server/workflow-evals-v1/schemas/workflow-evals-v1.schema.json
server/workflow-evals-v1/schemas/workflow-evals-v1.examples.json
server/workflow-evals-v1/workflow-eval-manifest-v1.json
server/workflow-evals-v1/fixtures/github-deployment-intake-v1.json
server/workflow-evals-v1/fixtures/context-ptc-reduction-v1.json
server/workflow-evals-v1/fixtures/s4-capability-denial-v1.json
package.json
docs/architecture/change-control-plane/mocked-workflow-evals-contract-v1.md
docs/architecture/change-control-plane/agentic-patterns-integration-plan-v1.md
docs/architecture/change-control-plane/README.md
docs/NEXT_STEPS.md
docs/context_packs/current_status.md
```

The new module imports the already exported Phase 5 observation type and
validator and the existing production adapter interfaces. It does not require
changes to their owners. S5 adds no runtime import or route to `server/index.ts`.
Phase 5 schemas/runtime, `server/index.test.ts`, the operator examples, Project
Map, queues, run records, UI, Electron, change-control store, S4 manifest,
GitHub connector production code, PTC production code, and Doctor/operator
production code are outside the mutation scope.

If implementation requires any additional production path, contract/schema
change, interface widening, persistence, API, queue field, UI, credential,
network access, or external system, stop and request a contract revision.

## Implementation sequence

After acceptance, implement as one bounded current-session slice:

1. Add closed schemas, examples, exact fixture files, and immutable manifest.
2. Add canonical identity, strict semantic validation, limits, privacy checks,
   deterministic trace recorder, pure evaluator, and replay validation.
3. Add thin adapters around existing GitHub `FetchV1`/Phase 10 authority and
   PTC executor interfaces without copying production logic.
4. Add the pure Phase 5 observation mapper.
5. Prove the three fixture families, negative/tamper cases, and legacy
   compatibility with credential-free tests.
6. Update only the listed status/package files.
7. Run focused verification, TypeScript, production build, context smoke, S2
   baseline, full Windows regression, and diff/path checks.
8. Conduct a separate completion review before S6 may be proposed.

Step 1 begins only after the pre-implementation baseline gate is green.

## Acceptance gates

Focused acceptance must prove:

- closed schemas accept every positive example and reject unknown fields,
  unknown enums, duplicates, cycles, invalid identities, and over-limit data;
- fixture and manifest identity is canonical, immutable, complete, and bound
  to the current exact S4 manifest;
- equal fixture/runner inputs produce byte-equal traces and results;
- expected/forbidden calls, exact argument/outcome hashes, partial ordering,
  terminal state, and effect counters are independently checked;
- undeclared calls and forbidden effects are stopped before adapter outcome;
- exact failure injection and retry/fallback behavior are deterministic;
- GitHub preview/execute/retry, stale/snapshot/rate/size/privacy failures, PTC
  success/retry/fallback, and S4 pre-effect denial are covered;
- model grading is explicitly unsupported and cannot produce a blocking pass;
- tampered manifest, fixture, S4 identity, trace, result, adapter identity, or
  Phase 5 mapping fails closed;
- only bounded public IDs/hashes/summaries enter results and mapped Phase 5
  observations;
- existing Phase 5 behavior and legacy observations remain unchanged;
- zero live network/provider/credential/external-write/uncontrolled-filesystem
  effects and no canonical ledger mutation are demonstrated.

Required commands:

```powershell
npm.cmd run test:workflow-evals
npm.cmd run check
npm.cmd run build
& $env:PYTHON_BIN scripts/ai_context_helper.py --root . smoke-check --format json
npm.cmd run test:context-budget
npm.cmd test
git diff --check
```

The full Windows regression receives at least a 15-minute timeout. Focused
tests use only injected/local adapters and mocked responses and perform no live
GitHub/provider request, credential read, external write, or uncontrolled
workspace mutation.

## Stop conditions

Stop before or during implementation if:

- a fixture or operation identity must be inferred from a prompt, log, model
  output, captured live traffic, or runtime guess;
- a mock duplicates production decision logic or no longer implements the
  exact current production interface;
- raw arguments, outputs, headers, credentials, private production data,
  prompts, hidden reasoning, stack traces, or absolute user paths would enter
  fixture/result evidence;
- an undeclared or forbidden call could execute before rejection;
- live network, provider, credential, external-write, non-temporary filesystem,
  or canonical-ledger access becomes necessary;
- randomized failure injection or wall-clock timing affects a blocking result;
- model-judged output would become blocking or be represented as objective;
- mocked success would be presented as production outcome evidence;
- S5 would publish Phase 5 events/reports, promote a champion, create a second
  registry, or gain workflow execution authority;
- GitHub, PTC, S4, Doctor, operator, Phase 5, queue, API, UI, or sandbox
  production authority would need to widen;
- any path outside the exact implementation impact map is required.
- the inherited `main` Windows CI baseline remains red.

## Explicit non-goals

S5 v1 does not add live evals, provider calls, model grading, LLM-as-judge,
record/replay traffic capture, fuzzing, randomized chaos, performance or wall-
clock benchmarking, browser/UI workflows, queue execution, background jobs,
telemetry, dashboards, APIs, fixture upload, mutable registries, new canonical
events, suite publication, report publication, champion decisions, prompt
optimization, automatic incident creation, production monitoring, security
certification, new tools, new S4 identities, new accepted capability paths,
new connectors, GitHub writes, credentials, remote publication, Doctor or
operator execution, S6 progressive disclosure, or Stage 2 work.

## Owner acceptance

The owner accepted the exact recommended decision set using:

```text
принимаю S5 contract v1
```

Any change to the decision table, initial fixture inventory, objective-grading
rule, Phase 5 authority boundary, privacy/limit policy, or exact impact map
requires an explicit revision and new acceptance.
