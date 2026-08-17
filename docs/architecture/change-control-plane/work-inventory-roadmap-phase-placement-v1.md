# Work Inventory and Roadmap Phase Placement v1

Status: roadmap placement accepted; implementation deferred

Prepared: 2026-08-17

Roadmap position: candidate Phase 13, after the completion-reviewed Phase 12

## Decision

Reserve the next product-phase position for a Work Inventory and Roadmap
capability, but do not take it into implementation now. The candidate belongs
in the main Change Control Plane roadmap rather than Agentic Patterns Stage 2
because it is a project-state and operator-navigation concern, not an agent
execution technique.

This record authorizes only roadmap placement and documentation. It does not
authorize a contract, queue, schema, API, UI, canonical event, persistence,
import, connector, Project Map mutation, or implementation task. Phase 13
remains unauthorized until a separate owner-reviewed contract resolves the
admission questions below.

## 1. Observed need

The 2026-08-15 Nikolay update adds two operator widgets:

- `GAPS`, intended to keep discovered ideas, bugs, and unfinished work visible;
- `ROADMAP`, intended to show how current work relates to the direction and
  remaining scope of a project.

The screenshot proves the presence of aggregate counters, roadmap rows, and
wave-like progress cells. It does not prove the exact color semantics,
denominators, persistence model, deduplication rules, lifecycle, or canonical
source. Nikolay explicitly reports migration noise, so the displayed counts
must not be treated as validated metric definitions.

The useful product question is not how to reproduce those pixels. It is how an
operator can answer, from bounded evidence:

1. what known project needs are not yet represented by accepted planning;
2. which goals or outcomes current changes and waves advance;
3. which known items are untriaged, deferred, duplicated, stale, or resolved;
4. whether a displayed coverage or progress count has a stable reconstructible
   numerator and denominator.

## 2. Placement in the current architecture

Candidate Phase 13 follows Phase 12 because the required lower-level evidence
now exists:

- Phase 1 supplies stable project/change/wave/task identity and the event spine;
- Phase 2 supplies accepted planning, dependencies, acceptance, and drift
  lineage;
- Phase 4 supplies halt and incident evidence;
- Phase 6 supplies bounded cross-project operator projections;
- Phase 8 supplies audit lineage;
- Phases 9-10 supply outcome and attributed-defect evidence;
- GoalBuddy `state.yaml` supplies goal-owned planning state under its separate
  authority boundary;
- canonical `run.json` records supply execution truth.

The new capability must compose those sources without declaring any one of
them globally canonical. Project Map remains secondary navigation memory and
must not become a work-inventory database.

This candidate should be considered before adding broader issue, idea,
connector, or automatic discovery intake. New intake channels without a
settled identity, ownership, deduplication, and reconciliation model would make
the migration/count problem worse.

## 3. Distinction from existing deferred work

This candidate does not reopen Agentic Stage 2 Pattern 16, Feature List
Harness. Pattern 16 asks which product capabilities are proven on the current
repository revision. Candidate Phase 13 asks which known project needs are
covered by goals, plans, changes, waves, and accepted outcomes. Capability
readiness and planned-work coverage may link to common evidence, but they have
different entities, denominators, owners, and decisions.

It also does not silently adopt Stage 2 Pattern 13, Triage State Machine.
Orchestrator does not yet own a general issue or idea intake channel. If a
future Phase 13 contract proves that new persistent gap intake is necessary,
that mutation authority must be isolated and explicitly accepted rather than
inferred from a read-only roadmap projection.

## 4. Required admission decisions

Before a Phase 13 contract is drafted, an owner review must decide:

1. What is a `gap`: an imported source item, a derived missing link, a
   human-recorded observation, or a closed union of those kinds?
2. Which system owns each lifecycle: GoalBuddy, the change ledger, an external
   issue source, or a new explicitly justified authority?
3. What stable IDs and evidence references join goals, gaps, roadmap outcomes,
   changes, waves, tasks, incidents, defects, and runs?
4. What exact states exist, and which transitions require human authority?
5. How are duplicates, supersession, reopened items, stale plans, and migrated
   legacy records represented without double counting?
6. What do every roadmap numerator, denominator, progress cell, and color mean?
7. Which missing or conflicting sources force `partial`, `unknown`, or
   `unsupported` instead of a numeric claim?
8. Does the first useful slice require persistence, or can it be a stateless
   read-only reconciliation report over existing canonical sources?
9. Who may create, classify, defer, link, resolve, or reopen a persistent gap?
10. What evidence would support the claim that known work is not lost, while
    avoiding the stronger unsupported claim that nothing in the project was
    ever forgotten?

## 5. Preferred contract shape if admitted

The smallest safe first contract should prefer a read-only, deterministic,
watermarked reconciliation projection. It should expose missing links and
source coverage before introducing a new persistent inventory.

Only after that contract demonstrates that existing sources cannot represent
the required lifecycle should a separate explicitly confirmed intake/write
slice be considered. A later UI slice may add `GAPS` and `ROADMAP` widgets only
after the backend contract fixes their semantics.

Indicative delivery order, not implementation authorization:

1. contract and fixtures for identity, source authority, lifecycle vocabulary,
   denominator rules, legacy/migration behavior, and privacy limits;
2. bounded read-only discovery and reconciliation projection with exact
   watermarks, partial-source states, and no-mutation evidence;
3. read-only operator widgets consuming only that projection;
4. separately reviewed intake or linking authority only if operational
   evidence proves it necessary.

## 6. Non-goals and stop boundaries

- Do not scrape prose or filenames and silently promote matches into canonical
  gaps or roadmap items.
- Do not make `docs/project_map/working_state.yaml` a scheduler or backlog.
- Do not infer completion from task counts, wave status, a filled progress
  cell, or historical completion text alone.
- Do not combine heterogeneous counts until duplicate, supersession, and
  migration rules are executable and tested.
- Do not let roadmap visibility grant dispatch, acceptance, prioritization,
  incident closure, or release authority.
- Do not add automatic idea/bug discovery, polling, issue-tracker connectors,
  background aggregation, notifications, or external writes in the first
  contract.
- Stop before queue authoring or implementation until the owner separately
  accepts an exact Phase 13 contract and impact map.

## 7. Reconsideration trigger

Start the Phase 13 contract discussion only when the owner chooses this
candidate as the next product phase and provides or accepts answers to the ten
admission decisions. Additional screenshots or larger unvalidated counters are
research evidence, not implementation authorization.
