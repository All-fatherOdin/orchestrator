# Context Budget Baseline Contract v1

Status: implemented and completion-reviewed

Direction selected: 2026-08-13
Accepted: 2026-08-13
Baseline revision 1 accepted: 2026-08-13
Completion reviewed: 2026-08-13

Integration plan: `agentic-patterns-integration-plan-v1.md`, Stage 1 S2

## Accepted decision

Accept S2 as one read-only context-budget reporting slice with these fixed
decisions:

- the accepted baseline is a versioned repository file;
- exact UTF-8 bytes and source counts are the only hard-envelope inputs;
- token counts are `measured` only through an explicitly pinned deterministic
  tokenizer, otherwise they are `estimated` with a closed estimator identity;
- token growth and every comparison using estimated tokens are advisory in v1;
- the report may fail only an explicitly invoked machine check for an accepted
  count or byte envelope; it does not gate ordinary queue launch or execution;
- authoritative context is never silently truncated, removed, reordered, or
  replaced to satisfy a budget;
- the first version creates no API, ledger event, run-record field, telemetry
  store, background collector, cache, index, database, or external call.

The owner accepted this exact document on 2026-08-13. It authorizes only the
implementation surface listed below; it does not authorize later baseline
revisions, S3 hard execution budgets, or S6 progressive disclosure.

## Outcome

One explicit local command reconstructs a bounded snapshot of observable
context sources, compares it with one exact accepted baseline, and returns a
closed deterministic `ContextBudgetReportV1`.

The report answers:

- which closed source classes were observable;
- which exact repository-relative sources were included;
- the exact byte count and SHA-256 identity of every measured source;
- whether token evidence was measured, estimated, unsupported, or
  incomparable;
- absolute and relative change against the accepted baseline;
- whether accepted source-count or byte envelopes passed;
- which advisory warnings require owner review.

The report does not claim that fewer tokens improve quality, that an estimated
token count equals provider billing, or that unobservable Codex context was
measured.

## Current-state and gap matrix

| Area | Current evidence | S2 gap | v1 disposition |
|---|---|---|---|
| Repository context selection | `scripts/ai_context_helper.py`, context profiles, `maxSources`, `ContextBundleV1`, and `ContextReceiptV1` deterministically select bounded sources | no per-source byte/token measurement or accepted growth baseline | reuse the existing helper output; do not reproduce selection logic |
| Repository instructions and status/contract files | exact repository files are observable and UTF-8 readable | size and growth are not classified per stable source class | exact bytes and hashes, classified by the accepted baseline |
| Fixed Orchestrator prompt prefix | `compileStablePrefixV1` produces an exact deterministic string | no budget identity or comparison | measure exact UTF-8 bytes from the production compiler seam |
| Dynamic task prompt | `buildPrompt` is exact but contains task-, scope-, authorization-, and selection-specific values | not stable enough for a repository baseline | out of scope for S2 v1; S3 may later consume invocation-local evidence |
| Prompt cache layout | stable-prefix identity and provider token usage already exist | cache metrics do not identify context-source growth | reuse identity semantics only; make no cache-savings claim |
| System/developer/owner instructions outside repository files | supplied by the Codex host and not exposed as trustworthy source bytes to Orchestrator | cannot be reconstructed safely | explicit `unsupported` class |
| Skill descriptions and tool contracts owned by the Codex host | tool surface is opaque at the current CLI boundary | exact text and call-boundary identity are unavailable | explicit `unsupported` class; S4 owns capability enforcement |
| Provider tokenization | no pinned exact GPT-5.6 tokenizer is currently part of the repository runtime | byte-to-token conversion cannot be called exact | closed estimator by default; optional measured mode only after preflight of a pinned tokenizer identity |
| Historical trends | run usage aggregates provider-reported totals | no reconstructible per-source history | no history store in v1; compare only current snapshot to one versioned baseline |

## Authority and source of truth

- Current source bytes, the production prompt compiler, and the existing
  context helper are measurement truth for observable sources.
- `docs/context-budget-baseline-v1.json` is the only accepted S2 comparison
  baseline after separate owner approval of its exact content.
- `docs/context_governance_rules.md` remains retrieval-governance truth.
- Vendored Context Contract v1 schemas remain unchanged and authoritative for
  selection bundles and receipts.
- `ContextBudgetReportV1` is a derived read-only observation. It is not a
  canonical event, receipt, authorization, scorecard, telemetry record, or
  provider-usage statement.
- Code, accepted contracts, current owner instructions, and required sources
  always outrank an S2 budget. A budget cannot narrow their authority.

## Closed source classes

Every report contains exactly these source classes, even when unsupported:

1. `repository_instructions` — exact accepted instruction entrypoints such as
   `AGENTS.md`;
2. `selected_context_profile` — exact sources returned by the existing helper
   for each baseline profile and `maxSources` pair;
3. `project_status_contract` — exact active status, source-hierarchy, and
   accepted contract sources named by the baseline;
4. `fixed_prompt_prefix` — the exact UTF-8 output of the production stable
   prompt-prefix compiler;
5. `host_owner_instructions` — non-repository system/developer/owner content;
6. `host_skill_tool_descriptions` — non-repository Codex skill and opaque tool
   descriptions.

Classes 1-4 are observable. Classes 5-6 MUST be `unsupported` in v1 unless a
future separately accepted host boundary supplies exact immutable bytes and a
reconstructible identity. Neither class may be guessed, scraped from process
state, copied from prompts, or represented as zero.

One source path may appear in only one observable class. The accepted baseline
defines precedence in the order above and duplicate classification fails
closed.

## Versioned baseline

The only baseline path is:

`docs/context-budget-baseline-v1.json`

It validates as closed `ContextBudgetBaselineV1` and contains:

- `contractType: ContextBudgetBaselineV1`;
- `contractVersion: "1.0"`;
- stable `baselineId` and positive integer `revision`;
- deterministic `sourceSetHash` over the exact ordered measured-source
  identities, excluding the baseline file itself;
- exact measurement-policy identity;
- ordered context-profile requests with profile and `maxSources`;
- ordered observable source entries with class, normalized repository-relative
  path or fixed compiler identity, SHA-256, byte count, token evidence, and
  accepted envelopes;
- explicit unsupported entries for both host-owned classes;
- aggregate count, byte, and token evidence by class and total;
- canonical baseline hash calculated with its own hash field omitted.

The reporting command MUST NOT create, rewrite, refresh, or accept a baseline.
A baseline update is a normal reviewed repository change. A changed source
hash does not silently become the new baseline.

`sourceSetHash` is lowercase SHA-256 over canonical UTF-8 JSON of the ordered
array containing exactly `sourceClass`, source identity, source SHA-256, and
byte count for every observable baseline entry. The baseline file, envelopes,
token estimates, revision metadata, and `sourceSetHash` field itself are not
inputs. Host-owned unsupported classes remain in the baseline but not in this
numeric source-set hash.

Baseline paths are exact normalized repository-relative paths. Glob patterns,
directories, URLs, absolute paths, environment-derived paths, symlinks that
escape the project root, generated build output, runtime data, `.git`, secrets,
and high-risk context are forbidden.

## Measurement policy

### Exact bytes

Repository sources MUST:

- be regular files contained by the resolved project root;
- be read as exact bytes once per snapshot;
- decode as strict UTF-8 without replacement characters;
- expose `byteCount` from the original bytes and lowercase SHA-256;
- fail closed if identity or bytes change during the snapshot.

The fixed prompt prefix MUST be produced through the production
`compileStablePrefixV1` seam and encoded as UTF-8. S2 may not copy or retype the
prefix into its own module.

No report contains raw source content, prompt content, environment values,
user-specific values, task text, tool output, diffs, logs, or secrets.

### Token evidence

Each observable entry has exactly one state:

- `measured` — an accepted deterministic tokenizer executable/package,
  tokenizer name, version, artifact or lock identity, configuration hash, and
  token count are all present and preflighted;
- `estimated` — estimator
  `utf8-bytes-div-4-ceil-v1` reports `ceil(byteCount / 4)` and is explicitly
  non-provider-exact;
- `unsupported` — source bytes are unavailable or the source class is opaque;
- `incomparable` — current and baseline measurement identities differ.

No tokenizer is currently accepted as exact for GPT-5.6. Therefore the first
baseline defaults to `estimated`. Adding measured mode later within S2 requires
an owner-reviewed baseline revision that pins the exact tokenizer identity; it
does not permit a mutable web lookup or unversioned provider alias.

Estimated and incomparable token evidence never produces a blocking result.
Changing measurement identity invalidates token comparison but not exact byte
comparison.

### Growth

For comparable non-negative values, the report provides:

- exact absolute delta;
- relative delta as a canonical decimal string with fixed six-decimal scale;
- `new`, `removed`, `unchanged`, `increased`, or `decreased` state.

A zero baseline and non-zero current value is `new`, not infinite growth.
Unsupported or incomparable values have no numeric delta.

## Envelopes and outcome

Every observable source and aggregate class may declare independent:

- `maxSourceCount`;
- `maxBytes`;
- advisory `maxTokens`;
- advisory absolute or relative growth warnings.

In v1:

- count and byte envelopes may be `hard` or `advisory`;
- token and token-growth envelopes are always `advisory`;
- a hard failure changes the explicit report outcome to `fail` and the CLI exit
  code to non-zero;
- an advisory breach preserves outcome `pass-with-warnings` and exit code zero;
- missing required sources, changed-during-read evidence, malformed baseline,
  duplicate classification, containment escape, or internal inconsistency
  fails closed regardless of envelope mode;
- unsupported host classes remain explicit and do not enter numeric totals or
  denominators.

The command does not launch a queue, modify a task, block an unrelated run,
truncate context, change `maxSources`, or choose which source to remove.
Orchestrator may use the command later as an explicitly declared verification
gate, but S2 v1 adds no automatic preflight or dispatch integration.

## Report and identity

The command emits one closed `ContextBudgetReportV1` to stdout. It contains:

- contract/version and stable request identity;
- exact baseline identity, revision, byte length, SHA-256, and canonical hash;
- project-head identity and dirty-state observation;
- measurement-policy identity;
- ordered class and source results;
- exact current and baseline byte/count evidence;
- token state and measurement identity;
- deltas, envelope results, warnings, and stable reason codes;
- `outcome: pass | pass-with-warnings | fail`;
- `wouldMutate: false` and all scope-expansion flags fixed to false;
- canonical report hash calculated with the hash field omitted.

Equal source bytes, baseline bytes, helper selection, compiler output,
project-head/status observation, and request inputs MUST produce byte-equal
canonical JSON and the same report hash. Current time, locale, timezone, random
IDs, absolute paths, process IDs, file timestamps, directory ordering, and raw
Git status text MUST NOT enter identity.

A dirty project is reported as bounded Git state. It is not automatically a
failure unless a changed tracked or untracked file overlaps an exact measured
source or the accepted baseline. Overlap fails closed because the baseline
comparison would not represent the named Git identity.

## Stable reason codes

At minimum, v1 defines:

- `CONTEXT_BUDGET_BASELINE_INVALID`;
- `CONTEXT_BUDGET_BASELINE_IDENTITY_CHANGED`;
- `CONTEXT_BUDGET_SOURCE_MISSING`;
- `CONTEXT_BUDGET_SOURCE_INVALID_UTF8`;
- `CONTEXT_BUDGET_SOURCE_ESCAPE`;
- `CONTEXT_BUDGET_SOURCE_CHANGED`;
- `CONTEXT_BUDGET_SOURCE_DUPLICATE`;
- `CONTEXT_BUDGET_HELPER_UNAVAILABLE`;
- `CONTEXT_BUDGET_HELPER_MISMATCH`;
- `CONTEXT_BUDGET_PREFIX_UNAVAILABLE`;
- `CONTEXT_BUDGET_TOKENIZER_UNAVAILABLE`;
- `CONTEXT_BUDGET_TOKEN_INCOMPARABLE`;
- `CONTEXT_BUDGET_COUNT_LIMIT`;
- `CONTEXT_BUDGET_BYTE_LIMIT`;
- `CONTEXT_BUDGET_TOKEN_WARNING`;
- `CONTEXT_BUDGET_GROWTH_WARNING`;
- `CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED`;
- `CONTEXT_BUDGET_PRIVACY_REJECTED`;
- `CONTEXT_BUDGET_INTERNAL_CONFLICT`.

Diagnostics contain only stable reason code, closed source class, normalized
repository-relative path when safe, and bounded numeric/hash evidence. They do
not include source content, absolute paths, environment values, raw helper
output, prompts, tools, or secrets.

## Runtime and privacy boundary

The report command:

- reads only the accepted baseline, its exact named repository files, current
  Git identity/status, the existing helper output, and the production stable
  prompt-prefix compiler;
- performs no network or provider call;
- uses no credential;
- writes no project, user-data, temporary, cache, run, ledger, or history file;
- starts no persistent service or background process;
- never scans the repository broadly to discover new source paths;
- never follows a symlink outside the project root;
- never reads excluded high-risk paths.

Any optional tokenizer/helper runtime is an explicit preflighted dependency.
Its absence is represented truthfully and cannot trigger installation,
download, or fallback to an undeclared executable.

## Legacy and compatibility

- Existing queues with no S2 verification command behave identically.
- Existing Context Contract v1 schemas, bundles, receipts, profiles, and
  `maxSources` semantics do not change.
- Existing run records acquire no new required or synthesized fields.
- Existing prompt/model, cache, usage, scorecard, audit, and AMK projections do
  not consume S2 reports.
- Missing baseline means the explicit S2 command fails privately; it does not
  affect server startup or ordinary queue launch.
- A future baseline revision cannot reinterpret a historical report because
  every report binds exact baseline bytes and identity.

## Exact implementation impact map

Acceptance of this contract permits a future implementation task to modify
only these paths:

| Path | Role |
|---|---|
| `docs/context-budget-baseline-v1.json` | first owner-reviewed versioned baseline |
| `server/context-budget-v1/index.ts` | closed measurement, comparison, identity, and report domain service |
| `server/context-budget-v1/schemas/context-budget-v1.schema.json` | closed baseline/report Draft 2020-12 schemas |
| `server/context-budget-v1/schemas/context-budget-v1.examples.json` | valid and invalid contract fixtures |
| `server/context-budget-v1/index.test.ts` | focused domain, privacy, limit, determinism, and legacy tests |
| `scripts/context_budget_report.ts` | explicit read-only CLI composition over existing helper/compiler seams |
| `package.json` | one explicit report script and inclusion of the focused test in the standard suite |
| `server/index.test.ts` | only a narrow production-seam regression if the separate focused test cannot prove integration |
| `docs/context_governance_rules.md` | accepted measurement and baseline governance |
| `docs/architecture/change-control-plane/context-budget-baseline-contract-v1.md` | implementation status and final evidence |
| `docs/architecture/change-control-plane/agentic-patterns-integration-plan-v1.md` | S2 lifecycle status only |
| `docs/architecture/change-control-plane/README.md` | reading order and current boundary |
| `docs/NEXT_STEPS.md` | operational status and next safe step |
| `docs/context_packs/current_status.md` | compact current status |

`scripts/ai_context_helper.py`, vendored `server/context-contract-v1/**`,
`server/index.ts`, queue schemas/examples, run records, Project Map files, and
all Phase 2-12 domain modules are read-only dependencies and are not in the S2
v1 mutation scope. If implementation proves that one of these paths must
change, stop and return the contract for owner review instead of expanding
scope.

## Implementation order

After owner acceptance, one bounded implementation slice may:

1. add schemas, examples, and pure domain measurement/comparison;
2. add the read-only CLI composition and first proposed baseline;
3. add focused tests and the standard-suite entry;
4. update only the named governance/status documents;
5. run completion verification;
6. stop for a separate S2 completion review before S3, S4, S5, or S6.

Do not create an ordinary Orchestrator queue unless the final implementation
impact map yields at least two independently useful tasks with exact
`allowedPaths`, runtime constraints, verification commands, and a final
whole-change acceptance task. Otherwise implement it as one bounded current-
session slice.

## Acceptance

S2 implementation is complete only when tests prove:

- both baseline and report schemas are closed and examples validate;
- current source selection is delegated to existing helper evidence without
  duplicating its ranking/truncation logic;
- every accepted source path is exact, contained, strict UTF-8, byte-counted,
  and SHA-256 fenced;
- the stable prompt prefix is obtained from the production compiler seam;
- host-owned instruction/skill/tool classes remain explicit `unsupported`;
- estimator identity and calculation are deterministic and never labeled
  measured;
- measured token evidence is rejected without the complete pinned tokenizer
  identity;
- changed tokenizer identity makes token evidence incomparable while exact
  byte comparison remains available;
- equal inputs produce byte-equal canonical reports and hashes;
- count and byte hard envelopes fail only the explicit command;
- token and growth warnings remain advisory;
- missing, stale, duplicate, escaping, changing, malformed, and privacy-risk
  evidence fails closed with stable private codes;
- raw source/prompt/helper content, absolute paths, secrets, environment values,
  and timestamps never enter reports or diagnostics;
- execution creates no project/runtime/history/cache mutation and performs no
  network or provider call;
- legacy queues, context receipts, run records, and server startup remain
  unchanged;
- the first baseline is reconstructible from its exact ordered source
  identities and `sourceSetHash` without self-reference;
- focused tests, TypeScript, production build, context smoke, diff checks, and
  the full Windows regression pass;
- a separate completion review finds no unresolved or deferred acceptance
  issue.

## Verification requirements

The implementation task must declare exact Windows-safe commands. At minimum:

```powershell
npm.cmd run test:context-budget
npm.cmd run check
npm.cmd run build
& $env:PYTHON_BIN scripts/ai_context_helper.py --root . smoke-check --format json
npm.cmd test
git diff --check
```

The full Windows suite receives at least a ten-minute timeout. Absence of an
optional tokenizer does not fail the suite when the report truthfully uses the
accepted estimator. The helper and Python runtime remain explicit dependencies
for the context smoke only; S2 may not install or discover them by broad search.

## Stop conditions

Stop before or during implementation if:

- exact source bytes cannot be bound to a normalized contained identity;
- the existing context helper must be duplicated or its selection semantics
  changed;
- the production prompt prefix cannot be obtained without copying its text;
- a provider-exact token claim would rely on an unpinned tokenizer;
- a hard limit would silently remove or reorder authoritative context;
- implementation needs automatic queue-launch or dispatch authority;
- a report would persist history, telemetry, source content, or host-owned
  prompt/tool text;
- an external call, credential, download, or dependency installation becomes
  required;
- the exact impact map is incomplete or requires Project Map mutation.

## Explicit non-goals

S2 v1 does not add provider-call budgets, output-token enforcement, monetary
limits, learned routing, automatic model changes, context truncation,
progressive source indexes, semantic summaries, vector search, telemetry,
dashboards, scorecards, queue gates, launch preconditions, background capture,
host prompt introspection, tool capability enforcement, eval suites, external
publication, or Project Map promotion.

Those concerns remain respectively in S3, S4, S5, S6, or a future separately
accepted contract.

## Implementation verification

The bounded implementation completed on 2026-08-13 without expanding the
accepted impact map. It adds one closed schema family, pure domain service,
read-only CLI, first proposed versioned baseline, focused tests, and only the
declared governance/status updates. The existing context helper, Context
Contract schemas, `server/index.ts`, queue/run formats, Project Map, network,
provider, ledger, API, and runtime dispatch paths remain unchanged.

Verification on the final implementation state passed:

- focused S2 tests: 9/9;
- TypeScript: passed;
- production build: passed;
- context smoke: 3/3;
- `git diff --check`: passed;
- full Windows regression: 322/322, zero failures/skips, 574.87 seconds.

The focused suite includes a clean temporary Git repository and proves the CLI
uses the exact helper/compiler seams, produces a passing deterministic report,
and leaves the repository byte- and status-unchanged. In the implementation
worktree the explicit report correctly fails closed while the proposed
baseline and measured status files are uncommitted; it exposes only
`CONTEXT_BUDGET_SOURCE_CHANGED` and bounded identities.

The owner accepted exact baseline revision 1 on 2026-08-13. The final focused
suite additionally reconstructs the current repository candidate against that
baseline under a clean Git-state observation and proves that every hard count
and byte envelope remains green. Status-document growth is advisory by design.

The separate completion review passed with no unresolved or deferred finding:

- focused S2 tests: 10/10;
- TypeScript and production build: passed;
- context smoke: 3/3;
- `git diff --check`: passed;
- full Windows regression: 323/323, zero failures/skips;
- no mutation of the helper, Context Contract schemas, `server/index.ts`,
  queue/run formats, Project Map, API, ledger, provider, or dispatch paths.

S2 completion does not authorize S3-S6, a baseline revision, automatic queue
gating, hard token enforcement, context truncation, or progressive indexing.
The next dependent Stage 1 step is an owner-reviewed S3 contract.
