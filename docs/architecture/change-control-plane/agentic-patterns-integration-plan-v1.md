# Agentic Patterns Integration Plan v1

Status: active; S1-S4 completion-reviewed; S5-S6 implementation not authorized

Prepared: 2026-08-08

Source brief: owner-provided local `agentic-patterns-integration-prompt.md`

## 1. Decision

Integrate patterns 1-5 and 9 as contract-first vertical slices. Treat patterns
10-11 as implemented at the Orchestrator boundary that is currently useful.
Move patterns 6-8 and 12-17 to Stage 2. No Stage 2 pattern may enter contract or
implementation work until an owner-reviewed usefulness discussion establishes
a concrete current problem, evidence of that problem, and a non-duplicating
extension point.

S1-S4 are completion-reviewed. The owner accepted each exact implementation
contract through S4; each acceptance authorized only its bounded impact map.
This plan does not authorize
S5-S6 product code, schema, queue, ledger, Project Map, run-record,
external-system, or provider mutations. Each remaining slice still requires
its own accepted contract and exact scope.

## 2. Current-state correction gate

Before the first implementation contract is accepted, reconcile the planning
context with current `main`:

- replace the obsolete "preserve Phase 1-9" baseline with the current verified
  Phase 1-12 and AMK state;
- reconcile `docs/NEXT_STEPS.md`, `docs/context_packs/current_status.md`, and
  `docs/architecture/agent-memory-kit/amk-v5-reviewed-queue-draft-boundary-v1.md`
  with the implementation already present under `server/amk-queue-drafts-v1/`;
- record which completion claims are supported by code and tests and which
  still require a formal completion review;
- use current code, tests, schemas, and machine-validated records over stale
  documentation, following `docs/source_of_truth_hierarchy.md`;
- do not expand the mutation scope to Project Map files.

Exit gate: the accepted contract for the first slice names a current, internally
consistent baseline. If the baseline remains disputed, stop before implementation.

## 3. Rules shared by every Stage 1 slice

Each pattern is a separate vertical slice and requires:

1. an evidence-backed current-state/gap matrix;
2. an accepted normative contract with authority and privacy boundaries;
3. exact read and mutation paths;
4. closed Draft 2020-12 schemas and stable fail-closed reason codes where new
   persisted or API-visible data is introduced;
5. deterministic identity, replay, restart, duplicate, and idempotency rules;
6. positive, negative, privacy, limit, stale-evidence, and legacy tests;
7. explicit rollback/recovery behavior and non-goals;
8. focused verification, `npm run check`, `npm run build`, `git diff --check`,
   and a full `npm test` with at least a ten-minute Windows timeout;
9. a separate completion review before the next dependent slice is activated.

Cross-cutting restrictions:

- extend the existing project ledger, queue scheduler, prompt/model/eval
  lineage, context contract, and receipts; create no parallel canonical system;
- generated summaries, candidates, reports, and projections never become code,
  owner intent, suite publication, incident closure, or runtime authority;
- provider/model-judged evidence is directional unless an accepted policy makes
  it safe as a blocking gate;
- no live credentials, billable eval, external publication, polling, webhook,
  or remote write is required for contract design or credential-free tests;
- `server/index.ts`, `server/index.test.ts`, and
  `server/change-control-v1/index.ts` may be touched only by a narrowly justified
  integration seam; broad refactoring needs a separate accepted slice.

## 4. Stage 1 delivery order

```text
Current-state correction
  -> S1 Incident-to-Eval candidate
  -> S2 Context budget baseline
  -> S3 Hard execution budgets
  -> S4 Tool capability and chain gate
  -> S5 Mocked workflow eval traces
  -> S6 Progressive disclosure for large code/test files
  -> Stage 1 completion review
```

S2 supplies measurement for S3 and S6. S4 supplies enforceable capability
semantics that S5 must test. S1 is independent and goes first because Phase 4
incident identity and Phase 5 `EvalCaseV1` already provide its two endpoints.

The accepted S3 revision 1 boundary is recorded in
`hard-execution-budgets-contract-v1.md`. It deliberately hard-enforces only
Orchestrator-owned provider-process/attempt counts in v1. The current Codex CLI
does not expose an accepted provider-enforced output-token limit, so token hard
enforcement remains explicitly unsupported unless a later contract revision
pins and proves that capability. Owner acceptance authorizes only the exact S3
implementation impact map. S4 is now separately accepted and completion-reviewed;
S5-S6 remain unauthorized.

S3 implementation and its separate completion review passed 14/14 focused
tests, TypeScript, production build, context smoke 3/3, the S2 baseline 10/10,
diff checks, and the full Windows regression 337/337. No acceptance issue was
deferred. S4 subsequently passed its own accepted contract and separate
completion review. The next possible slice is an owner-reviewed S5 contract;
this plan does not authorize its implementation.

## 5. S1 - Incident-to-Eval candidate

Status: implemented and completion-reviewed on 2026-08-08. Evidence:
`incident-to-eval-candidate-completion-review-v1.md`.

### Outcome

Turn one exact canonical incident into a deterministic, sanitized eval-case
candidate with reconstructible provenance. Candidate generation does not
publish an `EvalSuiteV1`, activate a gate, resolve an incident, or authorize a
runtime action.

### Reuse map

- incident, halt, correlation, task, attempt, and repair evidence: existing
  Phase 4 ledger and `server/halts-incidents-v1/`;
- prompt/model/invocation and suite lineage: existing Phase 5
  `server/prompt-model-eval-v1/`;
- canonical project event publication and replay: existing
  `server/change-control-v1/`;
- privacy and bounded evidence conventions: existing audit bundle and AMK
  projection boundaries;
- objective or human oracle form: existing `EvalCaseV1.acceptanceOracle`.

### Contract questions

- Is the candidate a persisted immutable ledger event, a content-addressed
  evidence artifact referenced by such an event, or a request-scoped preview?
- Which incident states and severities may produce a candidate?
- What exact evidence is sufficient for an executable oracle, and when must the
  result be `human-oracle-required` or `insufficient-evidence`?
- Which fields are references or hashes rather than copied content?
- Which separate owner authority may later publish the candidate into a new
  immutable suite version?

### Minimum behavior

- bind exact project/change/wave/task/attempt/halt/incident and applicable
  prompt/model/invocation identities;
- emit explicit `measured`, `estimated`, `unsupported`, `conflict`, or
  `insufficient-evidence` states where applicable;
- reject raw prompts, secrets, environment values, hidden reasoning,
  unrestricted diffs/logs, private payloads, and unrelated files;
- return byte-equal normalized candidate content for equal canonical evidence;
- distinguish generation, owner review, rejection, and separately authorized
  suite publication without inferring one state from another;
- preserve incident lifecycle independently of candidate lifecycle.

### Candidate mutation surface

- new focused contract under
  `docs/architecture/change-control-plane/`;
- focused implementation and schemas under a new bounded
  `server/incident-eval-candidates-v1/` module, if the contract accepts it;
- narrow integration with `server/change-control-v1/` and Phase 5 eval lineage;
- focused tests beside the new module plus only the necessary integration tests.

### Stop conditions

- incident evidence cannot be sanitized without losing reproducibility;
- the candidate would need raw sensitive content to be useful;
- candidate creation would mutate a suite or incident state;
- identity cannot join Phase 4 evidence to Phase 5 lineage deterministically;
- no objective oracle or explicit human-oracle requirement can be stated.

## 6. S2 - Context budget baseline

Status: implemented and completion-reviewed on 2026-08-13 after exact owner
acceptance of baseline revision 1. Evidence is recorded in
`context-budget-baseline-contract-v1.md`.

### Outcome

Measure stable prompt and context sources per source, detect growth, and enforce
bounded context envelopes without claiming that fewer tokens mean better
quality.

### Reuse map

- `scripts/ai_context_helper.py`, task `contextProfile`, `maxSources`, context
  receipts, and `server/context-contract-v1/`;
- prompt compiler/cache stable-prefix layout;
- existing usage records and explicit unsupported provider metadata.

### Minimum behavior

- define stable source classes: owner/AGENTS instructions, selected context
  profile, project status/contract sources, skill/tool descriptions, and fixed
  prompt prefix;
- report per-source bytes and token count as `measured` when a pinned tokenizer
  is available, otherwise `estimated` with the estimator identity;
- compare an exact current snapshot with an accepted versioned baseline and
  report absolute and relative growth;
- set independent count, byte, and estimated/measured-token ceilings;
- keep reports read-only and non-canonical; no telemetry database or background
  collector in the first slice;
- fail closed only for an accepted hard envelope; trend warnings remain
  advisory.

### Candidate mutation surface

- `docs/context_governance_rules.md` and one focused accepted contract;
- `scripts/ai_context_helper.py` or a new focused read-only reporting module;
- context schemas only if the new fields cross an API or persisted receipt
  boundary;
- focused helper/context tests and fixtures.

### Stop conditions

- measurements are presented as exact without a pinned tokenizer;
- a baseline cannot identify every included stable source;
- the change introduces an unbounded history store or always-loaded report;
- a cap can silently remove a required authoritative source.

## 7. S3 - Hard execution budgets and bounded routing

Status: implemented and completion-reviewed on 2026-08-13. Evidence:
`hard-execution-budgets-contract-v1.md`, Implementation and completion evidence.

### Outcome

Add deterministic per-task and per-invocation execution budgets enforced by
control code. Begin with enforceable token/call/attempt limits; do not implement
learned routing or monetary estimation without a versioned pricing authority.

### Reuse map

- existing queue limits, model/effort resolution, provider runtime identity,
  usage records, retry/correction limits, and Warden repair budgets;
- Phase 5 prompt/model route lineage;
- Phase 10 measured provider-cost evidence, which remains historical evidence
  rather than a pricing table.

### Minimum behavior

- distinguish input estimate, provider-enforced output limit, measured usage,
  remaining budget, and unsupported enforcement;
- check the budget before every provider call and before escalation/correction;
- never label a post-call accounting limit as a hard pre-call cap;
- define deterministic `reject`, `defer`, or `human-decision-required` outcomes;
- permit a stronger or more expensive model only through a declared route and
  explicit quality/safety override authority;
- keep existing model choice unchanged in the first slice unless a cap makes
  the call impossible;
- record cap identity and outcome in existing attempt/invocation evidence.

### Candidate mutation surface

- queue configuration/schema and examples only after backward-compatible
  default semantics are accepted;
- focused module such as `server/execution-budgets-v1/`;
- narrow seams in provider invocation, retry, and correction control paths;
- Phase 5 lineage fields/events only if required for reconstructible evidence.

### Stop conditions

- the provider cannot technically enforce the claimed cap;
- pricing is inferred from mutable web knowledge or unversioned configuration;
- complexity classification is model-selected or non-deterministic;
- legacy queues change behavior without an explicit compatibility decision;
- a cap bypasses safety-critical or owner-required verification silently.

## 8. S4 - Tool capability manifest and chain gate

Status: contract accepted, implemented, and completion-reviewed on 2026-08-13.
Contract:
`tool-capability-chain-gate-contract-v1.md`.

### Outcome

Classify registered tools and adapters by private-data access, untrusted-input
exposure, external communication, mutation, credential use, and isolation.
Reject an unauthorized execution path that recreates the lethal trifecta.

### Reuse map

- `server/programmatic-tool-calling-v1/` and registered typed adapters;
- reviewer read-only/no-network process policy;
- allowed paths, explicit confirmation, operator actions, Doctor adapters, and
  the manually triggered read-only GitHub connector;
- existing prompt/model tool-route identity.

### Minimum behavior

- use one closed, versioned manifest for tools actually observable and
  enforceable by Orchestrator;
- missing capability metadata is `unknown-high-risk`, not implicitly safe;
- evaluate both individual tools and the union of a proposed chain;
- require a separately accepted execution path for any chain containing private
  data, untrusted input, and external communication;
- bind the exact manifest version and decision to invocation evidence;
- preserve least-privilege process/network/filesystem enforcement outside the
  prompt;
- explicitly mark opaque Codex CLI tool surfaces `unsupported` unless the
  runtime exposes trustworthy tool identity and call boundaries.

### Candidate mutation surface

- new focused `server/tool-capabilities-v1/` contract, schema, manifest, and
  validator;
- registered adapter descriptors and programmatic tool calling integration;
- provider route/invocation evidence only at narrow integration seams;
- credential-free policy and chain tests.

### Stop conditions

- the design claims enforcement over opaque calls it cannot observe;
- metadata is generated from prompts or model descriptions;
- a manifest entry widens filesystem, credential, network, or mutation scope;
- explicit confirmation is treated as sufficient without technical isolation;
- the feature duplicates action authorization or provider route registries.

## 9. S5 - Workflow evals with mocked tools

### Outcome

Evaluate complete, credential-free workflow traces with deterministic mocked
tools, including expected and forbidden calls, arguments, ordering constraints,
terminal state, and absence of prohibited side effects.

### Reuse map

- Phase 5 `EvalSuiteV1`, `EvalCaseV1`, fixed cohorts, observations, reports,
  critical gates, and champion decisions;
- existing mocked GitHub connector tests and preview/execute test patterns;
- S4 tool identities and capability decisions;
- existing receipts and no-mutation assertions.

### Minimum behavior

- define a closed workflow fixture and tool-trace observation shape;
- support exact expected calls, forbidden calls, bounded partial ordering,
  deterministic mock responses, and explicit injected failures;
- cover preview/execute freshness, idempotency retry, stale evidence, rate/size
  failure, privacy rejection, recovery, and security-chain denial;
- keep objective assertions blocking-capable and model-judged assertions
  directional by default;
- run without network access, credentials, provider calls, or external writes;
- do not require dual production/mock implementations where an existing
  adapter interface already permits deterministic dependency injection.

### Candidate mutation surface

- focused extension under `server/prompt-model-eval-v1/` or a separate bounded
  `server/workflow-evals-v1/` adapter over Phase 5;
- schema/example additions for workflow trace observations;
- focused credential-free tests for existing closed workflows.

### Stop conditions

- mocks diverge from the production adapter contract without detection;
- nondeterministic model grading becomes a blocking gate by default;
- tests need live credentials or billable calls;
- workflow evals create a second suite/report registry;
- mocked success is presented as production outcome evidence.

## 10. S6 - Progressive disclosure for large code and test files

### Outcome

Provide deterministic symbol/test indexes, bounded excerpts, and task-local
projections for very large source and test files without replacing source code
with summaries.

### Reuse map

- repository context helper, `contextProfile`, `maxSources`, selected-source
  receipts, and source hashes;
- current `rg`-first retrieval and bounded context rules;
- S2 per-source context measurements.

### Minimum behavior

- index declarations, exported symbols, test names, and stable line ranges from
  exact source bytes;
- retrieve a bounded excerpt only from an exact path/hash and declared range or
  symbol/test identity;
- include truncation, omission, parse failure, language support, source hash,
  and stale-source states explicitly;
- never generate semantic summaries as source-of-truth replacements;
- begin with the three largest TypeScript integration files and a conservative
  fallback for unsupported syntax;
- demonstrate context reduction while separately proving unchanged retrieval
  correctness on focused tasks.

### Candidate mutation surface

- `scripts/ai_context_helper.py` and its focused tests, or a new read-only
  indexer invoked by the helper;
- context contract schemas only if existing receipt fields cannot represent the
  projection truthfully;
- no broad refactor of the indexed large files in this slice.

### Stop conditions

- an index can become stale without hash detection;
- excerpt selection can escape the allowed/read scope;
- unsupported syntax is guessed rather than reported;
- the generated index becomes always-loaded and consumes the saved budget;
- token reduction is used as the sole quality or acceptance outcome.

## 11. Patterns 10-11 - implemented status

### Pattern 10: Tracer-Bullet Tickets

Status: implemented at the currently required Orchestrator boundary.

Evidence:

- `AGENTS.md` requires bounded, independently useful tasks and forbids splitting
  implementation from its own verification merely to inflate a queue;
- ordinary YAML queues already support dependencies, deterministic runnable
  work, bounded paths, verification commands, stop guards, parallelism, and
  exclusive resources;
- Phase 2 planning and the Execution Bucket derive readiness rather than asking
  a model to choose the frontier;
- AMK `WorkItemGraphV1` projects queue dependencies and a recomputed report-only
  frontier without scheduler authority;
- reviewed AMK queue draft export does not activate graph edges as scheduler
  dependencies.

No further feature is planned. A future gap must identify behavior not already
covered by queue tasks, change/wave/task entities, dependencies, or the AMK
projection. A second ticket tracker, graph ledger, or scheduler is prohibited.

### Pattern 11: Writer-Reviewer

Status: implemented at the currently required Orchestrator boundary.

Evidence:

- executor and reviewer run as separate processes/contexts;
- reviewer receives the result/change evidence and criteria, not the writer's
  interactive reasoning history;
- reviewer has a read-only workspace and no network policy;
- reviewer mutation is detected and fails closed;
- correction is a separate phase with separate write authority and bounded
  attempts;
- AMK `ReviewReceiptV1` requires exact result/criteria lineage, reasoning
  exclusion, mutation isolation, no repair authority, and owner disposition
  evidence before a compatible receipt can be projected.

No new review subsystem is planned. `unsupported` AMK projection remains the
correct outcome whenever historical run evidence cannot prove fresh-context or
reasoning-exclusion invariants. Adversarial review remains an explicit profile,
not an automatic model-grade acceptance gate.

## 12. Stage 1 completion gate

Stage 1 is complete only when:

- each accepted slice has its own completion review and all declared legacy,
  restart, privacy, determinism, and no-authority regressions pass;
- the full Windows suite passes after the final combined slice;
- incident candidates cannot publish suites or close incidents;
- hard budgets make no unenforceable claims;
- tool policies cover only observable/enforceable calls and fail closed on
  unknown capability metadata;
- workflow evals are credential-free and do not claim production outcomes;
- context measurements identify estimation method and source identity;
- progressive projections remain bounded, hash-fenced, and subordinate to code;
- no new parallel ledger, scheduler, policy registry, eval registry, telemetry
  database, or persistent search system exists.

## 13. Stage 2 admission process

Before designing any Stage 2 pattern, hold a separate owner discussion with the
following output:

1. current concrete problem and affected users/workflows;
2. repository or operational evidence that the problem exists;
3. frequency, severity, and cost of leaving it unchanged;
4. existing mechanism and why configuration or a focused fix is insufficient;
5. smallest non-duplicating extension point;
6. new authority, persistence, privacy, external-side-effect, and recovery
   implications;
7. measurable success and guardrail metrics;
8. recommendation: `adopt`, `adapt`, `defer`, or `reject`;
9. explicit owner decision.

Without that record, the pattern remains deferred and no contract, queue, or
implementation files are created.

## 14. Stage 2 candidates and required usefulness discussions

### Pattern 6: Agent Circuit Breaker

Preliminary view: defer. Warden already provides per-halt, per-incident, and
per-project repair budgets and deterministic provider/process retry handling.
A persistent cross-run breaker adds identity, cooldown, probe, recovery, and
false-positive complexity.

Discuss only when evidence shows repeated calls to the same degraded external
tool/provider across independent runs. Required questions:

- What stable identity represents the failing provider/tool endpoint?
- Which failures are attributable to that identity rather than task input?
- Why do current retry budgets and halt handling not contain the failure?
- Who authorizes cooldown bypass, probe calls, reset, and recovery?
- What observed recurrence/latency/cost threshold justifies persistence?

### Pattern 7: Lane-Based Execution Queueing

Preliminary view: defer. Dependencies, `maxParallelTasks`, exclusive resources,
and serialized merge already cover current execution concurrency.

Discuss only when measured queue wait shows that one workload class blocks an
independently useful class, such as interactive actions versus long execution.
Required questions:

- Which two or more workload classes have different latency/isolation needs?
- What measured blockage cannot be solved by current concurrency/resources?
- How are cross-lane dependencies and deadlock freedom proven?
- Does a lane duplicate the Execution Bucket or merge serializer?
- What fairness and starvation policy is required?

### Pattern 8: Canary policy rollout and automatic rollback

Preliminary view: reject for the current local runner; reconsider only after a
separately authorized live policy activation surface exists. Phase 5 cohorts
and champion decisions are evaluation evidence, not traffic authority.

Required questions:

- What real traffic or repeated production workload is being split?
- Which policy type has immutable version and activation authority?
- Which timely, complete metrics can safely trigger rollback?
- What exactly is reversible, and can rollback itself cause side effects?
- Why are offline eval cohorts and explicit owner activation insufficient?

### Pattern 12: Wayfinder Exploration Map

Preliminary view: potentially useful for multi-session discovery, but not a
core runtime requirement. It must reuse planning/decision/task evidence and
must not let exploration mutate delivery scope or dynamically grow a queue.

Required questions:

- How often does accepted work have a known destination but unknown path?
- Which current-session research outcomes are being lost or repeated?
- Can a bounded plan/decision document solve the problem without new lifecycle
  state?
- How is exploration prevented from executing delivery work?
- Who accepts newly resolved decisions and closes unresolved fog?

### Pattern 13: Triage State Machine

Preliminary view: defer until Orchestrator owns a real intake channel. A local
queue and change ledger are not an issue tracker.

Required questions:

- What canonical intake source exists and at what volume?
- Who owns disposition and communication with reporters?
- Which readiness evidence is required for bugs and enhancements?
- How are missing reproduction, credentials, access, and owner choices kept
  explicit rather than inferred?
- Can lifecycle metadata extend the intake source without a second database?

### Pattern 14: Grilling / Plan Challenge

Preliminary view: useful as an owner-review procedure for high-risk contracts,
not as a default runtime subsystem. It may be adopted earlier as a template
without implementing `PlanChallengeV1` persistence.

Required questions:

- Which risk classes require challenge, and how are they deterministically
  selected?
- What decisions cannot be derived from authoritative project evidence?
- What artifact proves owner acceptance of shared understanding?
- Would a checklist/template suffice?
- How is endless questioning bounded and stopped?

### Pattern 15: Prototype to Answer

Preliminary view: useful for specific unresolved design questions, but normally
a working method rather than an Orchestrator feature.

Required questions:

- What single decision cannot be answered cheaply from code/docs/tests?
- What scenarios and verdict would close it?
- Where may disposable code live, and how is it kept out of `main`?
- Is retaining a prototype branch necessary, or is a verdict receipt enough?
- Who authorizes any later production reuse?

### Pattern 16: Feature List Harness

Preliminary view: consider only a derived read model. Acceptance claims,
verification receipts, review evidence, and regressions already provide the
underlying truth. A mutable canonical feature registry is rejected.

Required questions:

- Which operator decision needs a capability-level view?
- Can status be recomputed entirely from existing receipts and current tests?
- What exact regression evidence returns a capability to failing/unknown?
- How are historical receipts retained without claiming current success?
- Does the projection provide value beyond existing scorecards and audit bundles?

### Pattern 17: Domain Context File

Preliminary view: useful only where repeated terminology conflicts are observed.
Prefer a small optional glossary linked to accepted contracts/ADRs; do not add a
runtime registry or new source of implementation truth.

Required questions:

- Which concrete terms or synonyms currently cause defects or review churn?
- Which bounded context owns each term, and who is the language owner?
- Can existing architecture contracts define the terms sufficiently?
- What size and loading boundary prevents the glossary from becoming ghost
  context?
- How are conflicts resolved in favor of code, accepted contracts, ADRs, and
  current owner instructions?

## 15. Explicit non-goals for both stages

- autonomous eval-suite mutation or incident closure;
- learned/model-selected routing, frontier selection, or intake disposition;
- monetary caps without a versioned pricing authority;
- claims of tool-chain enforcement over opaque runtime behavior;
- live credentials, remote writes, polling, webhooks, or publication in tests;
- a second incident, eval, policy, scheduler, ticket, feature, ADR, domain, or
  context ledger;
- background telemetry, vector database, persistent search, or unbounded index;
- reviewer-initiated repair or automatic acceptance of reviewer findings;
- prototype promotion or merge without a separate accepted delivery task;
- automatic production multi-agent, lane, canary, or rollback activation.
