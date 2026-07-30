# T001: Two-Repository Evidence Map

Task: `T001`
Kind: `scout`
Status: `current`
Harness: `codex PM fallback after GoalBuddy Scout timeout`

## Executive Finding

Orchestrator already contains a substantial runtime integration of the Kit's
Context Contract v1. The three vendored JSON schemas are byte-identical to the
Kit copies, and `server/index.ts` already provides runtime validation, a
repository-helper adapter, bounded fallback behavior, receipts, prompt reuse,
and programmatic read-only reduction.

The largest safe non-duplicative first slice is therefore not another context
contract adapter. It is a self-hosted repo-centric secondary-memory governance
profile for Orchestrator itself:

- explicit source authority and retrieval policies;
- a bounded Project Map that is secondary to code, tests, operational docs,
  current owner instructions, and canonical runtime records;
- a compact replay/working-state root;
- the Kit-compatible read-only context helper;
- context-selection smoke cases;
- one integration test proving Orchestrator consumes its own helper without
  falling back.

This is an additive, reversible foundation for the later Nikolay-like
control-plane design. It must not replace Orchestrator run state, GoalBuddy
state, queue files, or task receipts.

## Repository Baselines

### Orchestrator

- Product: local Codex task queue with dependency scheduling, scoped
  execution, review/correction, recovery, dashboard, and persisted run state.
- Runtime: Node.js/TypeScript, Express, React/Vite, Electron.
- Canonical execution record:
  `.orchestrator/runs/<run-id>/run.json`, written atomically by
  `server/index.ts`.
- Queue contract:
  `tasks.example.yaml`, `validateQueue`, `validateTaskQueue`, dependencies,
  `allowedPaths`, `verificationCommands`, authorization evidence, and
  task/run status transitions.
- Existing memory/context capabilities:
  - `server/context-contract-v1/schemas/*`
  - `RepositoryContextHelperProvider`
  - `FallbackContextProvider`
  - `ContextRequestV1`, `ContextBundleV1`, and `ContextReceiptV1`
  - preflight bundle reuse in execution
  - optional read-only PTC reduction
  - persisted provider reasoning/working-state identity and invalidation
  - GoalBuddy goal boards under `docs/goals`
  - runtime eval identity dimensions for prompt, model, reasoning, state,
    cache, and PTC
  - task approval and exact reversible-write boundaries
- Missing self-hosted Kit layer:
  - no `scripts/ai_context_helper.py`
  - no `docs/project_map/context_index.yaml`
  - no source-authority, permissions, retrieval, or scoring policies
  - no project-map working state
  - no context-selection smoke cases for Orchestrator itself
  - no startup/current-status context pack

Evidence:

- `README.md`
- `server/index.ts`
- `server/index.test.ts`
- `server/context-contract-v1/schemas/*`
- `docs/context-contract-ptc-v1.md`
- `docs/persisted-reasoning-working-state-v1.md`
- `docs/runtime-evals-v1.md`
- `AGENTS.md`

### AI-assisted System Design and Agent Memory Kit

- Repository: clean branch `new_version`, commit
  `985b567e627e309960e12fc5851ba573c00879a9`.
- Remote recorded locally:
  `https://github.com/Vellforzi/AI-assisted_System_Design_and_Agent_Memory_Kit.git`.
- Package version: `v3.8.0`.
- Primary nature: portable, file-based governance and memory operating
  contracts. It explicitly states that it is not an autonomous runtime, vector
  database, security sandbox, or replacement for project documentation.
- Recommended mature-project profile:
  `Agent Kit/kit/secondary_memory_governance/`.
- Default authority:
  Project Map summarizes and navigates; operational docs, code, tests, specs,
  issues, and current owner instructions win.
- Runtime impact of baseline: none unless the adopting project adds/uses the
  helper scripts.
- Helper:
  `Agent Kit/kit/tools/context_governance_helper.py`, Python standard-library
  implementation, read-only, 1,251 lines. It supports `read-set`, `receipt`,
  `api-context`, `smoke-check`, `search`, `compare-search`, and `claim-check`.
- Storage:
  YAML/Markdown/JSON files; optional in-memory SQLite FTS comparison only.
  The helper starts no persistent service and creates no persistent index.
- Memory lifecycle:
  candidate/staged before current; stale, superseded, rejected, and archived
  records must not be treated as current truth.
- Mutation model:
  answer/read-only by default; any promotion or mutation requires explicit
  intent, target, scope, and permitted mode.
- Tests:
  `Agent Kit/kit/tests/test_governance_extensions.py`.

Evidence:

- `README.md`
- `START_HERE.md`
- `Agent Kit/kit/EXISTING_PROJECT_ADOPTION_GUIDE.md`
- `Agent Kit/kit/MATURE_EXISTING_PROJECT_ADOPTION_PROFILE.md`
- `Agent Kit/kit/secondary_memory_governance/README.md`
- `Agent Kit/kit/PROJECT_MEMORY_STORAGE_GUIDE.md`
- `Agent Kit/kit/MEMORY_TOOL_INTERFACE_CONTRACT.md`
- `Agent Kit/kit/MEMORY_SCHEMA_REFERENCE.yaml`
- `Agent Kit/kit/tools/context_governance_helper.py`

## Exact Existing Overlap

The following files have identical SHA-256 hashes in the two repositories:

- `context-request-v1.schema.json`
- `context-bundle-v1.schema.json`
- `context-receipt-v1.schema.json`

Kit source:

`Agent Kit/kit/secondary_memory_governance/context_contract_v1/schemas/`

Orchestrator source:

`server/context-contract-v1/schemas/`

Therefore a Worker must not copy or redesign these schemas in the first slice.
Orchestrator's existing adapter already enforces the most important runtime
properties: explicit profile, maximum sources, fixed safe fallback, forbidden
paths, high-risk exclusions, receipt consistency, schema validation, and
preflight/execution bundle identity.

## Overlap and Gap Matrix

| Capability | Kit | Orchestrator | First-slice decision |
|---|---|---|---|
| Context request/bundle/receipt schemas | Canonical reference | Vendored byte-identical schemas | Preserve |
| Context helper adapter | Python read-only helper | Runtime provider expects it in target repo | Install/adapt for Orchestrator itself |
| Safe context fallback | Described by baseline | Implemented and tested | Preserve |
| Source authority | YAML policy | Only implicit in docs/runtime identity | Add explicit project policy |
| Permissions policy | YAML advisory contract | Strong runtime authorization exists | Add policy that points to enforcement; do not duplicate enforcement |
| Retrieval policy/scoring | YAML hard gates and scoring | Runtime consumes helper output but repo lacks policy | Add self-hosted policies |
| Project working state | Secondary YAML replay root | Provider runtime metadata and GoalBuddy state exist | Add only a secondary navigation root |
| Durable candidate memory | File lifecycle contract | No general project-memory store | Defer until governance slice is proven |
| Eval/smoke cases | Generic behavior cases | Product runtime evals exist | Add context-selection smoke cases; keep product evals authoritative |
| Task/handoff contracts | Templates | Queue tasks, run receipts, GoalBuddy boards | Do not introduce parallel task trees |
| Docs/architecture lint | Optional report-only tools | Not installed | Defer |

## Canonical-State Boundaries

The integration must declare these separate scopes:

1. Product/run truth:
   `.orchestrator/runs/<run-id>/run.json` and the current code/tests.
2. Goal execution truth:
   `docs/goals/<slug>/state.yaml`.
3. User-created operational queues:
   `queues/*.yaml`, local and Git-ignored.
4. Project Map working state:
   secondary navigation and replay hints only. It may point to the three
   sources above but must never override them.
5. Provider reasoning state:
   bounded ephemeral operational metadata, already documented as non-durable
   project memory.

The highest-risk failure is allowing `docs/project_map/working_state.yaml` to
become a second task scheduler or a replacement for `run.json`. The first slice
must state and test the opposite.

## Verification Baseline

Commands run successfully:

```text
cd D:\pet-projects\orchestrator
npm run check
npm test
```

Result:

- TypeScript check passed.
- Orchestrator tests: 96 passed, 0 failed.

```text
cd D:\pet-projects\AI-assisted_System_Design_and_Agent_Memory_Kit
python -m pytest "Agent Kit/kit/tests" -p no:cacheprovider --basetemp <temp>
```

Result:

- Kit tests: 13 passed, 0 failed.

## Ranked Integration Candidates

### 1. Self-hosted secondary-memory context profile

Rank: recommended.

Outcome:

Orchestrator can select bounded, authority-labelled context from its own
repository through the same helper contract it already supports for target
repositories.

Candidate write boundary:

- `AGENTS.md`
- `docs/NEXT_STEPS.md`
- `docs/source_of_truth_hierarchy.md`
- `docs/context_governance_rules.md`
- `docs/context_packs/current_status.md`
- `docs/project_map/README.md`
- `docs/project_map/current_map.md`
- `docs/project_map/context_index.yaml`
- `docs/project_map/source_authority.yaml`
- `docs/project_map/permissions_policy.yaml`
- `docs/project_map/retrieval_policy.yaml`
- `docs/project_map/retrieval_scoring_policy.yaml`
- `docs/project_map/working_state.yaml`
- `docs/project_map/memory_lifecycle_policy.yaml`
- `docs/project_map/eval_suite/context_selection_smoke_cases.yaml`
- `docs/project_map/eval_suite/context-retrieval-v1-smoke.json`
- `scripts/ai_context_helper.py`
- `server/index.test.ts`

Behavior proof:

- helper `api-context` for `startup` returns a schema-compatible bounded read
  set with authority/status metadata;
- `RepositoryContextHelperProvider` consumes the real Orchestrator repository
  without fallback;
- smoke cases prove required startup sources are selected and high-risk/runtime
  paths are excluded;
- Project Map working state explicitly remains secondary.

Compatibility:

- Python 3 is available; helper is standard-library only.
- Existing Node runtime contract and schemas remain unchanged.

Migration:

- additive files plus a small `AGENTS.md` patch; no database or run-record
  migration.

Rollback:

- revert the `AGENTS.md` patch and remove the added governance/helper files;
  existing fallback behavior remains intact.

### 2. Candidate-memory lifecycle and promotion tooling

Rank: defer.

Value:

- durable facts, decisions, risks, evidence, and supersession lifecycle.

Why not first:

- requires owner decisions about memory classes, promotion authority,
  retention, and relationship to GoalBuddy and product run receipts;
- Kit's memory tool interface is a contract, not a complete production runtime;
- premature implementation would create a competing canonical state.

### 3. Documentation governance, architecture lint, and eval-trigger automation

Rank: later.

Value:

- report-only drift detection and failure-to-eval conversion.

Why not first:

- useful only after project-map/source-authority files are adopted;
- does not itself prove context is used by Orchestrator.

## License and Provenance Risk

No `LICENSE`, SPDX identifier, or copyright grant was found in the checked-out
Kit tree. The recorded GitHub URL returned unavailable from the current public
web check. The user explicitly requested local integration, but the repository
does not independently establish redistribution rights.

Judge should choose one of these safe treatments:

1. Adapt the project-specific data contracts and author the minimal helper
   implementation in Orchestrator with explicit source provenance, without
   copying unrelated Kit assets.
2. If exact file copying is selected, record that it is based on the owner's
   explicit local integration instruction and keep the copied scope minimal.
3. Stop only if publication or redistribution is required and ownership cannot
   be established; local non-public integration can otherwise continue under
   the user's requested scope.

## Recommended Judge Decision

Approve candidate 1 as one vertical Worker package, subject to:

- exact file list;
- explicit Project Map secondary-authority language;
- no changes to Context Contract schemas or production run-state ownership;
- real-provider integration test against the repository root;
- successful helper smoke commands plus `npm run check` and `npm test`;
- dirty-worktree preservation;
- explicit source/provenance note for adapted Kit material.

## Board Receipt Snippet

```yaml
receipt:
  result: done
  note: notes/T001-two-repository-evidence-map.md
  summary: "Orchestrator already vendors and runs Kit Context Contract v1; the recommended first slice is a self-hosted secondary Project Map plus read-only helper and integration smoke proof, not duplicate runtime context code."
```
