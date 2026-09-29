# Nikolay Evidence Update: 2026-08-18

Status: source review complete; architecture evidence only

Reviewed: 2026-08-18

## Scope and sources

This update records evidence discovered after the original 2026-07-29 review.
It does not amend the historical GoalBuddy task receipt and does not authorize
an implementation, queue, schema, connector, or mutation surface.

Primary local sources:

- Telegram export:
  `C:\Users\Администратор\Downloads\Telegram Desktop\ChatExport_2026-08-18`;
- silent 10.86-second ReplayKit recording:
  `C:\Users\Администратор\Desktop\2026-08-16_13.51.39.mp4`;
- full-resolution Telegram attachment:
  `photos/photo_739@15-08-2026_19-21-31.jpg` within the export.

Evidence labels retain the meanings defined by the original ledger:
`OBSERVED_MESSAGE`, `OBSERVED_SCREENSHOT`, `OBSERVED_VIDEO`, `INFERENCE`,
`UNKNOWN`, and `DECISION_REQUIRED`.

## Message evidence

| Message(s) | Class | Evidence |
|---|---|---|
| 10153-10154, 31 July | `OBSERVED_MESSAGE` | Nikolay reports a 6.0% hotfix share based on several thousand tasks. The adjacent image is a Google-generated interpretation, not a definition of Nikolay's metric. |
| 10279-10282, 31 July | `OBSERVED_MESSAGE` | His status line turns context red at 70%; he normally ends a session as it approaches 50%. |
| 10357, 2 August | `OBSERVED_MESSAGE` | He calls 500-800K context a strong-risk zone, while saying it may be acceptable for pure orchestration. |
| 10657-10658, 3 August | `OBSERVED_MESSAGE` | He says a role/artifact/test arrangement breaks down quickly once agents enter the process; test presence alone is insufficient, and AI-built systems require regression of affected subsystems. |
| 11262-11280, 12 August | `OBSERVED_MESSAGE` | In a discussion about a previous n8n setup, Nikolay describes several dozen atomic flows plus an orchestrator that combined and launched them in different ways. He names logging, retries, queues, integrations, versioning, and visual validation as relevant properties. This is evidence about a past workflow system, not proof of the current coding pipeline. |
| 11591-11592, 15 August | `OBSERVED_MESSAGE` | `GAPS` and `ROADMAP` were added so the operator can see more than task status and understand project direction. `GAPS` covers ideas, bugs, and unfinished work encountered by Nikolay or agents. Nikolay warns that migration noise inflates the displayed numbers. |
| 11594-11595, 15 August | `OBSERVED_MESSAGE` | Current widget data comes from an internal system. Nikolay says other sources could be connected through a connector, but supplies no reconciliation, identity, freshness, or lifecycle rules. |
| 11597, 15 August | `OBSERVED_MESSAGE` | Asked how the view shows project direction, Nikolay answers only that he sees the roadmap. No numerator, denominator, row, cell, or color semantics are supplied. |
| 11632-11636, 16 August | `OBSERVED_MESSAGE` | Visible labels are abbreviated project names. `CF` is the larger project/product name, `CFA` is its core, and `CFU` is one of its UI projects. Several other project names are listed. |
| 11678-11681 and 11704, 17-18 August | `OBSERVED_MESSAGE` | Nikolay estimates about 100 tasks per week for one active full-time project and about 120 million tokens per month in aggregate. He says a USD 100 Claude Code plan is sometimes insufficient. The meaning and size distribution of a `task` are not defined. |
| 11705, 18 August | `UNKNOWN` | Another participant directly asks what counts as a task and how absence of regression is verified. The export contains no Nikolay answer. |

## Screenshot and video evidence

The 15 August screenshot directly shows:

- a selected `CFA` project tab alongside other abbreviated projects;
- `GAPS` as four colored counts, for example `50 / 24 / 4 / 175`;
- `ROADMAP 22/482`;
- roadmap rows such as `CFA.494`, each with cells and a fraction;
- migration-era counts that Nikolay explicitly says are noisy.

The 16 August video directly shows:

- the dashboard is live: wall time, uptime, Warden countdown, and agent
  elapsed time change during the recording;
- `CHAT-PLANNER` and agent `CFA.494.01` run concurrently under project `CFA`,
  while `CFA.494` is visible in the execution bucket and roadmap;
- `PIPELINE RUNNING` coexists with `HEARTBEAT OFF`,
  `TERMINAL SERVICE DOWN`, `WARDEN IDLE`, and `AUTO-HEAL OFF`;
- recent successful `CLI resume` entries appear at roughly five-minute
  intervals;
- `INCIDENTS [924 open]`, `EXECUTION BUCKET [7]`, `GAPS 61/29/4/175`, and
  `ROADMAP 22/482` are displayed.

The recording does not show a work-state transition, user interaction, audio,
counter definitions, or authority behavior.

## Architecture-relevant conclusions

### Observed constraints

1. A product can span multiple separately named project components. A future
   roadmap cannot assume that one product, project identifier, repository, and
   UI tab are the same entity.
2. Work inventory includes at least human- or agent-discovered ideas, bugs,
   and unfinished work.
3. Connector provenance is part of the intended source model, while current
   evidence does not establish source reconciliation or canonical ownership.
4. Migration can make aggregate counters unreliable.
5. Pipeline activity and subsystem health are independent dimensions; a
   single `running` flag cannot safely imply readiness.
6. Test count or test success alone does not establish coverage of the
   affected behavior. Whole-change and affected-subsystem regression evidence
   remain necessary.
7. Operational claims exist for hotfix share, task throughput, token volume,
   and context thresholds, but their definitions and cohorts are incomplete.

### Bounded inferences

- The shared `CFA.494` prefix makes a relationship between a roadmap/bucket
  item and agent `CFA.494.01` plausible. The exact identity grammar remains
  unknown.
- A product/program entity above component projects is likely necessary for
  the Orchestrator roadmap, but this is an Orchestrator modelling decision,
  not an observed Nikolay schema.
- A gap record will likely need discovery actor, source identity, evidence,
  project/product links, and reconciliation status. Exact fields remain a
  contract decision.
- Roadmap is safest as a reconstructible projection over authoritative
  sources. The evidence does not prove whether Nikolay implements it that way.

## Remaining unknowns

- exact meanings and ordering of the four `GAPS` counts and colors;
- exact meaning of `ROADMAP 22/482`, each row fraction, and each cell state;
- gap creation, triage, deduplication, supersession, closure, reopen, and
  migration rules;
- canonical storage and stable source IDs;
- exact product/project/component and `CFA.494.01` identity grammar;
- task, wave, execution-bucket, attempt, resume, and terminal transitions;
- why `resume` appears periodically and whether it is automatic;
- readiness rules when pipeline and subsystem states disagree;
- definition of `task`, `hotfix`, metric denominator, observation window, and
  source cohort;
- exact regression selection and acceptance procedure;
- worktree, branch, merge, and replan mechanics;
- human versus automatic authority for inventory and roadmap mutation.

## Design consequences for Orchestrator

- Keep candidate Phase 13 read-only first and define product-to-project joins
  before presenting aggregate progress.
- Carry source kind, source identity, discovery actor, evidence, freshness,
  migration status, and reconciliation status in any future inventory
  contract.
- Never combine validated and migration-noisy counts without explicit partial
  or unknown semantics.
- Require executable definitions for every roadmap numerator, denominator,
  row, cell, and color.
- Keep health, readiness, activity, and repair state separate.
- Preserve whole-change acceptance and affected-subsystem regression instead
  of using test counts as quality evidence.
- Treat the reported hotfix, throughput, token, and context numbers as
  research observations until their definitions are supplied.
