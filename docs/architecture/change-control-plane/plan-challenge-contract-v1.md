# Plan Challenge Contract v1

Status: accepted, implemented, and completion-reviewed

Prepared: 2026-08-13

Accepted: 2026-08-13 (`принимаю Pattern 14 contract v1`)

Admission decision: `Pattern 14 — adapt as procedural checklist v1; no runtime,
schema, persistence, or automatic authority`

Integration plan: `agentic-patterns-integration-plan-v1.md`, Stage 2 Pattern 14

## Decision requested

Adopt Pattern 14 as one prospective, documentation-only challenge procedure
for high-risk implementation contracts. The procedure makes unresolved owner
decisions, authority changes, failure boundaries, alternatives, and acceptance
evidence explicit before contract acceptance. It does not grade a plan,
authorize implementation, or create an Orchestrator subsystem.

Acceptance authorizes only the exact implementation impact map below. It does
not authorize product code, schemas, APIs, queues, run records, Project Map
changes, persistence, automation, or other Stage 2 product work.

## Admission record

### Problem and evidence

Contract-first work can pass per-slice review while a cross-slice assumption
remains unchallenged until after merge. The affected workflow is owner review
of high-risk Orchestrator contracts and the executor handoff that follows it.

The combined Stage 1 review found three late issues on canonical `main`: the S2
hard context envelope failed after later documentation growth; GitHub CI did
not run every focused S1-S6 suite; and active status documents retained
contradictory authorization claims. PR #30 repaired the findings and passed
post-merge Windows run `31727224718`.

One combined-stage occurrence is insufficient evidence for runtime machinery.
Severity is material because the findings invalidated the first completion
conclusion and required another branch, review, PR, merge, and two CI runs.

### Existing mechanism and smallest extension

Contracts, focused tests, per-slice completion reviews, and owner acceptance
remain authoritative. They catch implementation defects, but do not require a
single pre-acceptance record challenging cross-slice assumptions.

Add one reusable Markdown checklist. A high-risk contract copies a bounded
challenge-record section into that same contract. No separate per-contract
file, registry, database, event, receipt, or lifecycle is introduced.

### Authority, recommendation, and owner decision

The checklist is advisory until an owner makes an explicit decision. A
resolved challenge does not accept the contract; contract acceptance remains a
separate exact owner instruction. The procedure reads existing evidence and
writes documentation only. It retains no secrets, makes no external call, and
has no recovery behavior because it performs no effect.

Recommendation: `adapt`.

Owner decision on 2026-08-13: adapt as a procedural checklist v1 with no
runtime, schema, persistence, or automatic authority.

## Deterministic applicability

A proposed implementation contract requires Plan Challenge v1 when any one of
these classes is present in its declared outcome or impact map:

1. external network/provider communication, credentials, publication, or an
   external write;
2. new or changed canonical persistence, event type, lifecycle, authority, or
   recovery behavior;
3. an automatic allow/deny, dispatch, acceptance, rollback, repair, routing,
   budget, or policy decision;
4. destructive, irreversible, migration, installation, deployment, rollback,
   or data-retention behavior;
5. cross-process concurrency, leases, locks, background execution, polling,
   webhooks, or cross-repository writes;
6. private or sensitive data crossing a new process, storage, logging, UI, or
   external-system boundary.

The checklist is not required for a read-only investigation, an active-status
correction, tests-only coverage under an accepted contract, or a bounded bug
fix that adds none of the classes above. A reviewer may still request it when
the proposed scope is ambiguous; ambiguity is not treated as low risk.

The procedure is prospective. It does not reopen completed contracts solely
because they predate v1.

## Roles and authority

- The contract author supplies evidence, decisions, alternatives, impact map,
  verification, and stop conditions.
- The challenger asks only questions material to the applicability classes or
  a contradiction in authoritative evidence.
- The owner answers choices that cannot be derived from authoritative project
  evidence and chooses the procedural disposition; contract acceptance remains
  a later separate instruction.
- The executor receives no implementation authority from the challenge record.

The author and challenger may be the same agent in separate passes. The owner
decision cannot be inferred from silence, prior general approval, a passing
test, or the checklist's resolved state.

## Required checklist record

The reusable checklist must require these fields in the challenged contract:

1. contract identifier and exact proposed outcome;
2. triggered risk classes and evidence for each classification;
3. affected users and workflows;
4. authoritative evidence, assumptions, and explicit unknowns;
5. existing mechanism, `do nothing`, and smallest alternative;
6. authority, persistence, privacy, external-effect, and recovery changes;
7. failure, stale-evidence, ambiguity, rollback, and stop boundaries;
8. exact impact map plus production, test, generated, manifest, checksum,
   documentation, and acceptance consequences;
9. measurable success, regression gates, and guardrails;
10. open owner decisions, round history, final disposition, and the separate
    contract-acceptance instruction when one later exists.

The record links exact repository-relative evidence paths. It does not embed
credentials, raw private data, hidden reasoning, or unbounded command output.

## Bounded rounds

- Round 1 is one batch of at most ten material questions.
- Round 2 is optional and contains at most five questions limited to unresolved
  Round 1 items or contradictions introduced by its answers.
- Rephrasing a resolved question, adding stylistic questions, or splitting one
  issue to bypass a limit is prohibited.
- After Round 2, any unresolved authority, privacy, external-effect, recovery,
  destructive-action, evidence, or impact-map blocker forces `defer` or
  `reject`. It cannot be waived by the checklist.
- A material contract change after resolution invalidates the affected answer
  and requires a new contract revision; it does not create Round 3.

## Dispositions and acceptance boundary

The procedural disposition vocabulary is closed:

- `revise`: questions exposed a bounded contract correction;
- `ready_for_owner_decision`: no blocker remains, but nothing is accepted;
- `defer`: evidence or an owner decision is unavailable;
- `reject`: the proposed boundary is unsafe, duplicative, or unjustified.

Only a later explicit owner instruction accepts the implementation contract.
Neither `ready_for_owner_decision` nor a challenge answer authorizes files,
queues, execution, merge, deployment, or external effects.

## Success and guardrails

For challenged contracts:

- applicability classification is present in 100% of contract proposals;
- every triggered high-risk contract has one in-contract challenge record;
- unresolved blocker count is zero before owner acceptance;
- question batches stay within ten plus five and at most two rounds;
- every accepted choice maps to the final contract and impact map;
- post-acceptance findings caused by a knowingly unresolved challenge item are
  zero;
- no checklist outcome is represented as implementation or runtime evidence.

These are procedural review measures, not telemetry. V1 creates no collector,
dashboard, persistence, or automatic enforcement.

## Exact implementation impact map

After acceptance, implementation may change only:

```text
docs/architecture/change-control-plane/plan-challenge-contract-v1.md
docs/architecture/change-control-plane/plan-challenge-checklist-v1.md
docs/architecture/change-control-plane/agentic-patterns-integration-plan-v1.md
docs/architecture/change-control-plane/README.md
docs/NEXT_STEPS.md
docs/context_packs/current_status.md
```

Project Map, source code, tests, schemas, package files, workflows, queues, run
records, generated artifacts, and every external repository remain read-only.
Any required path outside this list requires a contract revision and new owner
acceptance.

## Implementation and verification

After acceptance:

1. add the reusable checklist with the exact classification, record, round,
   disposition, privacy, and authority boundaries above;
2. update only the listed navigation and active-status documents;
3. keep `docs/NEXT_STEPS.md` inside the accepted S2 hard byte envelope;
4. run the Stage 1 focused gate, S2 baseline, context smoke, TypeScript,
   production build, full Windows regression, and diff/path checks;
5. conduct a separate read-only completion review.

Focused review must prove that the template is reachable, prospective,
bounded to two rounds and fifteen questions, deterministic about applicability,
explicit about unresolved blockers, private-data safe, and incapable of
accepting a contract or granting implementation authority.

Required commands:

```powershell
npm.cmd run test:context-budget
npm.cmd run test:stage1
npm.cmd run check
npm.cmd run build
& $env:PYTHON_BIN scripts/ai_context_helper.py --root . smoke-check --format json
npm.cmd test
git diff --check
```

## Stop conditions and non-goals

Stop and revise if the checklist requires a schema, API, UI, queue field,
runtime hook, persistent state, registry, event, receipt, automatic risk
classifier, automatic acceptance, model grading, hidden reasoning, credential,
network call, external write, Project Map mutation, or a third question round.

Non-goals include challenging ordinary low-risk work by default, reopening all
historical contracts, replacing implementation review, resolving owner choices
from model output, enforcing checklist completion in Orchestrator, tracking
review analytics, or implementing any other Stage 2 pattern.

## Contract acceptance

Implementation begins only after exact owner acceptance, for example:

```text
принимаю Pattern 14 contract v1
```

Changing applicability classes, question/round limits, dispositions, authority
semantics, or the impact map requires a revision and new acceptance.

## Completion review

The separate read-only completion review passed on 2026-08-13 with no
unresolved or deferred finding. The implementation adds only the reusable
Markdown checklist and listed navigation/status changes. This documentation-
only slice classifies itself `not_required`: R1-R6 are absent, so it introduces
no external effect, canonical state, automatic decision, destructive behavior,
concurrency, or new private-data boundary.

The checklist is reachable from the package README, uses deterministic R1-R6
classification, limits questions to two rounds and ten plus five, forces
`defer` or `reject` for an unresolved blocker after Round 2, excludes private
data and hidden reasoning, and keeps owner acceptance separate. It creates no
runtime, schema, persistence, registry, event, receipt, queue field, Project
Map state, or automatic authority.

Verification passed the structural checklist assertions, S2 baseline 10/10,
Stage 1 focused suites 85/85, TypeScript, production build, context smoke 3/3,
diff/path checks, and the full Windows regression 351/351 with zero failures or
skips in 481.79 seconds. Two pre-existing out-of-scope server-file changes were
present in the shared worktree during the regression and remain excluded from
the Pattern 14 impact map and diff.
