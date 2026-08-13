# Tool Capability Manifest and Chain Gate Contract v1

Status: accepted, implemented, and completion-reviewed

Prepared: 2026-08-13

Accepted: 2026-08-13 (`принимаю S4 contract v1`)

Integration plan: `agentic-patterns-integration-plan-v1.md`, Stage 1 S4

## Accepted decision

Adopt S4 as one closed, source-owned capability manifest and deterministic
chain gate for tools and adapters whose identity and effect boundary are
actually observable by Orchestrator.

The recommended v1 boundary is:

- classify only registered production operations with a stable code-owned
  identity;
- treat missing metadata as `unknown-high-risk` and reject before the owning
  effect boundary;
- evaluate both each operation and the union of an ordered proposed chain;
- reject the union of private-data capability, untrusted input, and external
  communication unless the exact execution path was separately accepted and
  is technically isolated;
- recognize the existing Phase 12 fixed read-only GitHub deployment path as
  the only initial accepted high-risk path; S4 grants it no new authority;
- keep Doctor adapters and operator actions `direct_only`, so they cannot be
  composed into a model-selected chain and still require their current Warden,
  lease, preview, confirmation, and owning-gate evidence;
- allow the six deterministic local context-reduction operations to compose
  only with one another under their existing direct validation;
- classify the opaque Codex CLI tool surface as `unsupported`; its existing
  sandbox, filesystem, network, and task authorization remain authoritative;
- bind the exact manifest hash and decision identity adjacent to the owning
  invocation/receipt evidence; create no new ledger or mutable policy registry;
- expose no queue field, prompt instruction, model-generated metadata, UI,
  credential, remote write, or automatic exception mechanism in v1.

Owner acceptance authorized only the exact implementation impact map in this
contract. It did not authorize S5-S6, opaque Codex tool interception,
new tools, new adapter effects, broader network/filesystem/credential access,
remote writes, publication, or a general policy engine.

## Decisions requiring owner agreement

| Decision | Option A — recommended | Option B | Option C | Recommendation |
|---|---|---|---|---|
| Enforceable scope | code-owned registered operations only | describe all expected Codex tools from prompts/config | observation-only catalog with no blocking gate | A; B makes unenforceable claims and C does not satisfy S4 |
| Manifest ownership | one immutable versioned manifest in code, checked against source-owned invocation seams | distributed free-form descriptors | mutable runtime/ledger registry | A; it is closed and reviewable without creating a second authority store |
| Unknown metadata | reject as `unknown-high-risk` before effect | warn and continue | infer from name/description | reject; safe default and deterministic replay |
| Chain policy | union capabilities across the ordered chain | evaluate each operation independently only | let the model state whether the chain is safe | union; independent checks miss composed risk |
| Lethal-trifecta handling | reject unless an exact separately accepted technical path matches | accept after generic user confirmation | accept read-only external calls automatically | exact path only; confirmation is not isolation |
| Existing GitHub path | recognize only Phase 12 fixed-origin/read-only-token/bounded-GET path | reject it despite its accepted isolation | generalize to arbitrary GitHub reads | recognize the exact existing path without widening it |
| Doctor/operator composition | `direct_only`, with current owners still decisive | make them generally chainable | omit them from the manifest | `direct_only`; classify them without duplicating their authority |
| Codex CLI internal tools | `unsupported`, retain existing sandbox gates | synthesize individual identities from logs/prompts | block every Codex child process | `unsupported`; do not claim an invisible call boundary |
| Evidence placement | bounded decision reference adjacent to owning receipt/invocation | new S4 ledger | logs only | adjacent evidence; reconstructible without a parallel canonical system |
| Rollout | all integrated registered seams require an exact manifest entry; unrelated legacy paths are unchanged | optional warning-only mode | add a user-editable queue policy | hard gate only where S4 is technically integrated |

Accepting `S4 contract v1` means accepting every Option A in this table. Any
different selection requires a revision before implementation.

## Outcome

For every S4-integrated operation or chain, Orchestrator constructs one exact
`ToolChainRequestV1` from code-owned operation identities. A pure service
validates the immutable `ToolCapabilityManifestV1`, resolves every entry,
computes the capability union, and returns one deterministic
`ToolCapabilityDecisionV1` before any effect boundary.

Equal manifest bytes, ordered operation identities, accepted execution-path
identity, and owning evidence references produce the same manifest hash,
request hash, decision identity, disposition, and reason codes. Timestamps,
tool output, prompts, arguments, credentials, and process results are not
decision inputs.

The decision can refuse an S4-integrated operation. It can never authorize the
operation by itself. Existing task authorization, Warden verdict and live
lease, operator-action preview/confirmation, connector configuration, Phase 5
route, S3 budget, filesystem scope, network sandbox, and source-specific
validation must all independently allow the effect.

## Current-state and gap matrix

| Surface | Current evidence | Observable boundary | S4 v1 disposition |
|---|---|---|---|
| Context programmatic reduction | six fixed operations, descriptor lookup, read-only enforcement, deterministic reference execution, direct final validation | exact in-process operation before `execute` | six `composable` local entries; bind the chain decision to call receipts |
| Doctor provider read | fixed recipe ID, typed input, observation, live lease fence | typed adapter immediately before `executeAttempt` effect | `direct_only`, local bounded read |
| Doctor registered Git read | fixed command/arguments hashes and `read_only_non_mutating` contract | registered subprocess before spawn | `direct_only`, read-only child process |
| Doctor workspace reconcile | exact owned run/workspace attempt and live lease | typed adapter before local workspace transition | `direct_only`, reversible owned local mutation |
| Doctor merge recovery | exact persisted merge request, owned workspace, target lease, live fence | typed adapter before merge recovery controller | `direct_only`, high-impact owned local mutation; Warden/merge owners remain decisive |
| Doctor owned cleanup | exact owned attempt, bounded cleanup states, live fence | typed adapter before owned worktree cleanup | `direct_only`, destructive-but-owned local cleanup |
| Operator actions | five closed actions, fresh preview, explicit confirmation, exact owning gates, immutable receipts | action service before canonical event publication | five `direct_only` entries; S4 decision is subordinate to the owning gate |
| GitHub deployment connector | server-fixed origin/repository, read-only token, three bounded GETs, exact IDs, explicit trigger, Phase 10 write owner | connector snapshot adapter before outbound GET sequence | one `direct_only` high-risk entry allowed only by exact accepted path `github-deployment-read-v1` |
| Codex executor/reviewer/correction | child-process identity, task authorization, sandbox and network policy, Phase 5 route, S3 budget | child process is observable; individual internal tool calls are not | one `unsupported` surface marker; no S4 approval claim |
| Preconditions/verification | exact queue-declared commands, task authorization, read-only precondition checks, machine receipts | Orchestrator owns the command process but not a stable semantic tool catalog | outside S4 v1; existing command policy remains authoritative |

## Manifest model

The production manifest is exactly one frozen `ToolCapabilityManifestV1`:

```text
contractType: ToolCapabilityManifestV1
contractVersion: "1.0"
manifestId: orchestrator-tool-capabilities-v1
manifestVersion: 1
entries: ToolCapabilityEntryV1[]
acceptedPaths: AcceptedToolExecutionPathV1[]
```

Entries are sorted by `toolId`; accepted paths are sorted by `pathId`.
Duplicates, gaps, unknown fields, non-canonical order, or an entry without a
matching code-owned integration test fail validation.

Each `ToolCapabilityEntryV1` contains only:

| Field | Closed values/rule |
|---|---|
| `toolId` | stable 1-128 character code-owned identity |
| `owner` | `context-router`, `warden-doctor`, `operator-actions`, `github-deployment-connector`, or `codex-cli` |
| `boundary` | `in_process`, `child_process`, `remote_http`, or `opaque_child_internal` |
| `privateDataAccess` | `none`, `bounded_local`, or `credential_or_private` |
| `untrustedInput` | `none`, `bounded_local`, or `bounded_external` |
| `externalCommunication` | `none`, `read_only`, or `write` |
| `mutation` | `none`, `reversible_owned_local`, `destructive_owned_local`, `canonical_local`, or `external` |
| `credentialUse` | `none`, `server_read_only`, or `write_capable` |
| `isolation` | `in_process_validated`, `read_only_subprocess`, `owned_workspace`, `fixed_remote_read`, or `unsupported` |
| `chainMode` | `composable`, `direct_only`, or `unsupported` |
| `owningGate` | stable existing gate identity or `none` |

There are no prose descriptions, prompts, URLs, arguments, environment names,
credential names, glob patterns, dynamic predicates, severity scores, or
model-generated fields in the production manifest.

`credentialUse != none` contributes private-data capability to the union.
`externalCommunication != none` contributes external communication. Any
`untrustedInput != none` contributes untrusted-input exposure. Mutation and
write-capable credentials are independently high-risk even when the lethal
trifecta is incomplete.

## Initial manifest inventory

The implementation must include exactly these identity families and no implied
additional operation:

1. `context-ptc.filter-v1`;
2. `context-ptc.join-v1`;
3. `context-ptc.rank-v1`;
4. `context-ptc.deduplicate-v1`;
5. `context-ptc.aggregate-v1`;
6. `context-ptc.schema-validate-v1`;
7. `doctor.provider-read-retry-v1`;
8. `doctor.registered-process-retry-v1`;
9. `doctor.workspace-reconcile-v1`;
10. `doctor.merge-safe-abort-resume-v1`;
11. `doctor.owned-cleanup-retry-v1`;
12. `operator.dispatch-wave-v1`;
13. `operator.authorize-task-retry-v1`;
14. `operator.authorize-wave-resume-v1`;
15. `operator.transition-incident-v1`;
16. `operator.resolve-incident-v1`;
17. `connector.github-deployment-read-v1`;
18. `codex-cli.opaque-local-tools-v1`.

The inventory is not a discovery mechanism. A new operation requires a
separate accepted manifest revision and source-specific authority review.

## Accepted execution paths

`AcceptedToolExecutionPathV1` is not an override. It records that a separate
accepted contract already established a technical path capable of containing
an otherwise denied capability union.

The only v1 path is:

```text
pathId: github-deployment-read-v1
contractRef: github-deployment-connector-contract-v1
allowedToolIds: [connector.github-deployment-read-v1]
requiredIsolation: fixed_remote_read
requiredOwningGate: phase12-explicit-preview-confirmation
```

The path matches only when the connector's existing server-fixed API origin,
repository fingerprint, exact deployment/status/commit identity, read-only
token, bounded GET-only fetches, preview freshness, explicit confirmation, and
Phase 10 import owner all validate independently. S4 neither reproduces nor
weakens those checks.

No generic user approval, queue field, environment variable, operator role,
model judgment, or matching capability labels can create an accepted path.

## Chain request and deterministic decision

`ToolChainRequestV1` contains:

- `requestId`;
- exact `manifestId`, `manifestVersion`, and `manifestHash`;
- an ordered non-empty list of 1-16 `toolIds`;
- optional exact `executionPathId`;
- sorted bounded `owningEvidenceRefs` containing identities only.

Repeated tool IDs are allowed only when the owning source already bounds the
repetition. The request never contains arguments, inputs, outputs, source
content, prompts, URLs, credentials, environment data, or free-form reasons.

The gate evaluates in this order:

1. closed-schema and semantic validation;
2. exact manifest identity/hash validation;
3. resolution of every ordered tool ID;
4. rejection of missing, duplicated manifest entries, or `unsupported` tools;
5. `direct_only` rejection when the chain has more than one operation or does
   not match its source-owned direct boundary;
6. capability-union computation;
7. rejection of external writes, write-capable credentials, or unaccepted
   destructive/mutation composition;
8. lethal-trifecta rejection unless one exact accepted path matches every
   required identity and isolation property;
9. emission of a bounded decision; then the owning gate evaluates separately.

The closed dispositions are:

| Disposition | Meaning |
|---|---|
| `allow` | S4 capability policy permits reaching the next existing owning gate |
| `reject` | known metadata or chain composition violates a hard S4 rule |
| `unsupported` | the exact operation/call boundary is not observable enough for S4 enforcement |

`allow` never means execution is authorized, approved, safe in every respect,
or successful. `unsupported` never falls back to `allow`.

## Stable reason codes

The initial closed set is:

- `TOOL_CAPABILITY_ALLOWED`;
- `TOOL_CAPABILITY_MANIFEST_INVALID`;
- `TOOL_CAPABILITY_MANIFEST_CHANGED`;
- `TOOL_CAPABILITY_UNKNOWN_HIGH_RISK`;
- `TOOL_CAPABILITY_UNSUPPORTED_BOUNDARY`;
- `TOOL_CAPABILITY_DIRECT_ONLY`;
- `TOOL_CAPABILITY_CHAIN_TOO_LARGE`;
- `TOOL_CAPABILITY_LETHAL_TRIFECTA`;
- `TOOL_CAPABILITY_EXTERNAL_WRITE_DENIED`;
- `TOOL_CAPABILITY_WRITE_CREDENTIAL_DENIED`;
- `TOOL_CAPABILITY_MUTATION_COMPOSITION_DENIED`;
- `TOOL_CAPABILITY_ACCEPTED_PATH_REQUIRED`;
- `TOOL_CAPABILITY_ACCEPTED_PATH_MISMATCH`;
- `TOOL_CAPABILITY_OWNING_EVIDENCE_MISSING`;
- `TOOL_CAPABILITY_REPLAY_INVALID`.

## Evidence placement and replay

`ToolCapabilityDecisionV1` contains only request/manifest/decision hashes,
ordered tool IDs, capability-union enums, optional accepted path ID,
disposition, stable reason codes, and bounded owning evidence references.

The decision is attached adjacent to existing evidence:

- context PTC call receipts for the six-operation reduction chain;
- Doctor repair invocation/receipt evidence for a typed adapter attempt;
- operator action preview/receipt evidence for one direct action;
- GitHub connector preview and exact imported observation evidence reference;
- no fabricated decision for opaque Codex internal tool calls.

Existing canonical stores remain canonical. No S4 event stream, database,
configuration service, or mutable registry is created.

On load or replay, a record carrying S4 evidence must revalidate its closed
shape, manifest hash, request/decision identity, ordered tool IDs, accepted
path, capability union, and owning evidence linkage. Changed manifest bytes do
not rewrite old decisions: the exact historical manifest identity remains
reconstructible from the versioned code artifact. Malformed or mismatched S4
evidence fails the owning replay boundary closed.

Legacy records without S4 evidence remain readable and preserve existing
semantics. New effects crossing an integrated S4 seam require the current exact
manifest entry and decision; no evidence is synthesized for historical calls.

## Ownership and authority

- PTC direct validation owns correctness and evidence retention for context
  reduction.
- Warden, Doctor recipe identity, monotonic lease, and live fence own repair
  authority.
- Operator action preview, explicit confirmation, and owning gates own action
  authority.
- Phase 12 connector configuration and Phase 10 import own the GitHub read and
  canonical observation write.
- Task authorization, queue scopes, process sandbox, Phase 5 route, and S3
  budget own Codex child-process execution.
- S4 owns only capability classification and chain-composition refusal at
  integrated observable seams.

The most restrictive applicable gate wins. S4 cannot grant filesystem,
network, credential, model, retry, correction, incident, merge, cleanup,
connector, publication, or remote-write authority.

## Privacy and diagnostics

Public or persisted S4 evidence may expose only stable tool IDs, manifest and
decision identities, closed capability enums, accepted path identity,
disposition, and stable reason codes.

It must not expose prompts, arguments, command strings, repository content,
paths not already public in owning evidence, URLs, headers, tokens, credential
names or values, environment variables, raw remote responses, final output,
hidden reasoning, or model-generated descriptions.

Private errors may retain bounded internal detail in server logs, subject to
existing secret-redaction rules. Public HTTP errors remain generic and bounded.

## Compatibility and rollout

- No queue or project field is added in v1.
- No user can opt out of an integrated S4 gate or edit the manifest at runtime.
- Existing registered operations are represented exactly so allowed paths keep
  their existing behavior after all owning gates pass.
- Missing/changed metadata blocks only the integrated effect boundary; it does
  not mutate historical evidence or unrelated queue behavior.
- Operator actions, Doctor adapters, and the GitHub connector remain direct
  explicit workflows, not agent-selectable general tools.
- Codex internal tool calls remain governed by the existing process sandbox;
  S4 makes no per-call enforcement claim.

## Exact implementation impact map

Owner acceptance would authorize one bounded current-session implementation
slice touching only:

```text
server/tool-capabilities-v1/index.ts
server/tool-capabilities-v1/index.test.ts
server/tool-capabilities-v1/schemas/tool-capabilities-v1.schema.json
server/tool-capabilities-v1/schemas/tool-capabilities-v1.examples.json
server/tool-capabilities-v1/tool-capability-manifest-v1.json
server/programmatic-tool-calling-v1/index.ts
server/halts-incidents-v1/index.ts
server/halts-incidents-v1/schemas/warden-v1.schema.json
server/halts-incidents-v1/schemas/warden-v1.examples.json
server/operator-actions-v1/index.ts
server/operator-actions-v1/schemas/operator-actions-v1.schema.json
server/operator-actions-v1/schemas/operator-actions-v1.examples.json
server/github-deployment-connector-v1/index.ts
server/github-deployment-connector-v1/schemas/github-deployment-connector-v1.schema.json
server/github-deployment-connector-v1/schemas/github-deployment-connector-v1.examples.json
server/index.ts
server/index.test.ts
package.json
docs/architecture/change-control-plane/tool-capability-chain-gate-contract-v1.md
docs/architecture/change-control-plane/agentic-patterns-integration-plan-v1.md
docs/architecture/change-control-plane/README.md
docs/NEXT_STEPS.md
docs/context_packs/current_status.md
```

The domain schema changes are limited to an optional bounded S4 decision
reference on newly produced owning evidence. They must retain closed legacy
variants and cannot change existing action, repair, connector, or import
authority.

`server/index.ts` changes are limited to assembling code-owned S4 requests at
the exact existing invocation seams, evaluating before effect, and replaying
adjacent decision evidence. `package.json` may only register the focused S4
test in the normal suite.

No change is authorized to:

- queue formats/examples, task authorization fields, S3 budgets, Phase 5 model
  routes, provider runtime selection, or Codex arguments;
- change-control event families outside the optional existing owning receipt
  references named above;
- dashboard/UI, Electron, APIs, credentials, connector configuration, remote
  systems, operational evidence semantics, Project Map, or local queues;
- filesystem/network sandbox permissions, Warden policy/budgets, merge or
  cleanup algorithms, operator action kinds, GitHub endpoints, or Phase 10
  import behavior;
- dependencies or generated lockfiles.

If implementation discovers any additional production, schema, example, test,
manifest, documentation, acceptance, or recovery file, stop and revise the
impact map before mutation.

## Implementation order

1. Add closed Draft 2020-12 schemas, examples, manifest artifact, and pure
   deterministic validator/gate.
2. Prove canonical manifest/decision hashing, unknown-high-risk behavior,
   union semantics, direct-only enforcement, exact accepted path matching, and
   privacy bounds in focused tests.
3. Bind the six PTC operations and their ordered call receipts.
4. Bind the five Doctor typed adapters immediately after their existing live
   fence and before effect.
5. Bind the five operator actions before their current owning event mutation.
6. Bind the GitHub connector before outbound fetch while preserving its exact
   Phase 12/10 owners.
7. Add opaque Codex surface evidence only as `unsupported`; do not alter child
   process behavior or arguments.
8. Add replay, corruption, legacy, and cross-owner integration tests.
9. Run focused, TypeScript, build, context smoke, S2 baseline, diff, and full
   Windows regression gates.
10. Conduct a separate completion review before S5 may be proposed.

## Acceptance requirements

Implementation is accepted only if evidence proves:

- closed schemas reject unknown fields, duplicate IDs, non-canonical order,
  invalid enum combinations, changed hashes, and unbounded chains;
- every initial observable operation has exactly one manifest entry and every
  production manifest entry has one code-owned integration seam;
- missing metadata is rejected before effect and never downgraded to a warning;
- chain union detects private data, credentials, untrusted input, external
  communication, mutation, and isolation across different operations;
- lethal-trifecta chains fail unless the exact accepted path matches;
- only the existing fixed Phase 12 GitHub read path matches the initial
  accepted-path record and every existing connector guard remains required;
- Doctor and operator entries cannot be composed and cannot bypass Warden,
  lease, preview, confirmation, or owning gates;
- the PTC chain remains deterministic, local, read-only, evidence-preserving,
  and subject to direct final validation;
- opaque Codex internal tools are reported `unsupported` and receive no S4
  allow decision;
- S4 changes no Codex sandbox, network flag, task authorization, model route,
  or S3 budget behavior;
- decision evidence is adjacent, bounded, reconstructible, corruption-fenced,
  privacy-safe, and absent from legacy records;
- no prompt or model output can create metadata, an accepted path, or an
  exception;
- no new ledger, mutable registry, UI, API, remote call, credential, dependency,
  or background process is created;
- S1-S3, Phase 1-12, context, PTC, Doctor/Warden, operator action, connector,
  provider runtime, queue, workspace/merge, retry/resume, reviewer/correction,
  and legacy regressions pass;
- the full Windows suite runs with at least a fifteen-minute timeout;
- a separate completion review finds no unresolved or deferred acceptance
  issue.

## Verification requirements

At minimum, implementation must run:

```powershell
npm.cmd run test:tool-capabilities
npm.cmd run check
npm.cmd run build
& $env:PYTHON_BIN scripts/ai_context_helper.py --root . smoke-check --format json
npm.cmd run test:context-budget
npm.cmd test
git diff --check
```

Focused integration uses only injected/local adapters and mocked HTTP. It must
perform no live provider request, GitHub request, credential read, external
write, or uncontrolled filesystem mutation.

## Stop conditions

Stop before or during implementation if:

- an operation identity or effect boundary is inferred from a prompt, model
  response, log text, command description, or runtime guess;
- opaque Codex internal calls would need to be represented as individually
  enforceable;
- unknown metadata, replay mismatch, or manifest drift would continue toward
  effect;
- generic confirmation, read-only intent, or a capability label would replace
  technical isolation;
- the GitHub accepted path would need broader origin, repository, endpoint,
  credential, trigger, or response authority;
- a Doctor or operator action could execute without all current owning gates;
- S4 would become action authorization, provider routing, sandbox policy, or a
  second policy/receipt ledger;
- a new queue field, UI, API, dependency, credential, live network request,
  remote write, publication, or background service becomes necessary;
- any path outside the exact implementation impact map is required.

## Explicit non-goals

S4 v1 does not add dynamic tool discovery, MCP/plugin policy, shell-command
semantic classification, prompt-derived metadata, per-call Codex CLI tool
interception, DLP/content scanning, secret discovery, arbitrary URL policy,
new sandboxing, operating-system isolation, containerization, network proxying,
credential brokerage, role-based access control, general policy language,
runtime manifest editing, policy rollout, telemetry, dashboards, alerts,
external publication, remote writes, new Doctor recipes, new operator actions,
new connectors, S5 workflow evals, S6 progressive disclosure, or Stage 2 work.

## Owner acceptance and completion evidence

The owner accepted the exact recommended decision set using:

```text
принимаю S4 contract v1
```

Any change to the decision table, accepted path, initial inventory, evidence
placement, or exact impact map requires an explicit revision and new acceptance.

Implementation stayed inside the exact impact map. Acceptance passed on
2026-08-13:

- 13/13 focused S4 schema, manifest, chain, seam, replay, legacy, and privacy
  tests;
- TypeScript check and production build;
- context smoke 3/3 and the accepted S2 baseline 10/10;
- full Windows regression 347/347 in 385.47 seconds;
- `git diff --check` and exact changed-path review.

The separate completion review found no unresolved issue. The immutable
manifest contains exactly 18 source-owned identities; unknown or composed
unsafe capability fails closed; only the existing fixed GitHub deployment read
path is accepted for the lethal-trifecta union; Doctor and operator effects
remain subordinate to their existing fences and owning gates; opaque Codex
internal calls remain unsupported. S5-S6 remain unauthorized.
