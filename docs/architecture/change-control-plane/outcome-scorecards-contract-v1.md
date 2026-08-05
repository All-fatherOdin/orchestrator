# Outcome Scorecards Contract v1

Status: accepted contract; Slice 1 implemented, Slice 2 pending
Accepted: 2026-08-05
Slice 1 implemented: 2026-08-05

## Outcome

Phase 9 lets an operator calculate a bounded, deterministic, privacy-safe
delivery scorecard for one explicit project cohort without turning metrics into
execution authority or product claims. The scorecard measures only evidence
already present in canonical project ledgers and exact Orchestrator run records.
Missing joins and unobserved outcomes remain explicit; they are never converted
into zero, success, or inferred business impact.

## Authority and Source of Truth

- `.orchestrator/runs/<run-id>/run.json` remains canonical for concrete run,
  task, attempt, review-cycle, timing, and token observations.
- Existing project ledgers remain canonical for change, wave, task, attempt,
  authorization, override, halt, incident, repair, lineage, and receipt events.
- The scorecard contains derived counts, rates, distributions, hashes, source
  references, and unsupported findings. It is not a new ledger, baseline
  authority, champion decision, acceptance oracle, budget, or SLA.
- Display names, titles, fuzzy timestamps, filesystem proximity, and branch
  names MUST NOT be used as join keys.

## Closed Cohort Scope

Version 1 supports exactly one selector:

- one `projectId` with explicit inclusive `fromSequence` and `toSequence`, plus
  an optional bounded list of exact `runId` values.

The cohort is capped at 50 runs, 500 tasks, 1,000 attempts, and 5,000 canonical
events. A run is included only when an existing immutable identity links it to
the selected project/change/wave/task evidence. Requested run IDs without an
exact join are returned as unlinked findings and are excluded from denominators.

The initial discovery request may omit the aggregate source watermark. Any
refresh or comparison request MUST bind the exact project watermark and the
exact immutable identity/hash of every included run record.

## Contract Shape

`OutcomeScorecardV1` uses JSON Schema Draft 2020-12 and a closed top-level
object containing:

- selector, policy version, cohort identity, and source watermarks;
- exact included and excluded run/task/attempt identities with reason codes;
- denominator definitions and observation coverage for every metric;
- delivery metrics, quality/safety metrics, and explicit unsupported metrics;
- bounded distributions, warnings, privacy metadata, and completeness checks;
- deterministic `scorecardHash` over normalized content.

Unknown fields and policy versions fail closed. Equal selector, exact source
watermarks, run-record identities, and policy version produce equal normalized
content and `scorecardHash`. Response timestamps and presentation metadata are
excluded from the hash.

## V1 Metric Registry

Phase 9 v1 may calculate only these metrics when their required evidence is
complete:

| Metric | Numerator | Denominator |
|---|---|---|
| `firstPassAcceptanceRate` | tasks accepted after their first completed attempt | linked tasks with at least one completed attempt |
| `reviewCorrectionCycles` | per-task rejected review/correction cycle count | linked accepted tasks with review evidence |
| `dispatchToAcceptedMs` | accepted task time minus first dispatch time | linked accepted tasks with both timestamps |
| `tokensPerAcceptedTask` | executor/reviewer/correction tokens for included attempts | linked accepted tasks with complete usage observations |
| `overrideRate` | audited dispatch overrides | linked dispatched waves |
| `humanEscalationRate` | human-decision-required or escalated incidents | linked effective incidents |
| `haltRecurrenceRate` | repeated effective halt fingerprint after a repair receipt | linked repaired halt fingerprints with an observation opportunity |

Every metric carries `status`, numerator, denominator, excluded count, coverage
ratio, policy version, and evidence references. A zero denominator yields
`insufficient-evidence`, never numeric zero. Percentiles require at least five
observations; smaller cohorts expose bounded raw counts only.

## Unsupported Outcome Classes

The following remain `unsupported` in v1 unless a future accepted contract
adds an authoritative source and immutable join:

- escaped defects at 7-, 30-, or 90-day windows;
- deployment failure, rollback, hotfix, and production rework rates;
- provider monetary cost when only tokens are observed;
- business impact, customer impact, productivity savings, and claims of
  bug-free delivery;
- comparisons against a manual or prior baseline not represented by an exact
  versioned cohort.

Unsupported metrics are not omitted. They include stable reason codes and the
missing authority/evidence class.

## Completeness and Fail-Closed Rules

Stable findings include at least:

- `SOURCE_UNAVAILABLE`;
- `SOURCE_WATERMARK_CHANGED`;
- `COHORT_INVALID`;
- `COHORT_LIMIT_EXCEEDED`;
- `RUN_NOT_FOUND`;
- `RUN_IDENTITY_CHANGED`;
- `RUN_UNLINKED`;
- `EVIDENCE_INCOMPLETE`;
- `EVIDENCE_CONFLICT`;
- `METRIC_UNSUPPORTED`;
- `DENOMINATOR_EMPTY`;
- `PRIVACY_VIOLATION`;
- `SCORECARD_TOO_LARGE`.

A changed watermark, changed run-record identity, conflicting join, privacy
violation, or size breach fails the request. An unlinked requested run or
unsupported optional metric produces a bounded explicit finding and cannot
enter a numerator or denominator.

## API Boundary

Slice 1 may add only read-only routes under `/api/outcome-scorecards/v1`:

- `GET /projects/:projectId/discovery?fromSequence=&toSequence=` returns bounded
  candidate run identities and exact source watermarks;
- `POST /compute` accepts one closed `OutcomeScorecardRequestV1` cohort manifest
  and returns an in-memory `OutcomeScorecardV1`.

`POST /compute` is a read-only calculation endpoint because the bounded cohort
manifest is too structured for a safe query string. It MUST NOT write a file,
publish an event, persist a cohort, start a run, acquire authority, call a
provider, contact an external system, or reuse an existing mutation handler.
No `PUT`, `PATCH`, or `DELETE` route is authorized.

## Dashboard Boundary

Slice 2 may add a read-only `Outcome scorecards` view that:

- selects one project and bounded sequence range from Phase 6 evidence;
- uses discovery evidence to choose exact linked run IDs;
- displays denominators, coverage, exclusions, unsupported metrics, warnings,
  source watermarks, and the deterministic scorecard hash;
- never labels an unsupported or insufficient metric as zero or successful;
- permits a direct user-initiated download of the already-returned bounded JSON.

The browser MUST consume only the versioned Phase 6 and Phase 9 read APIs. It
MUST NOT crawl run files, read the command store, auto-download, upload, share,
notify, schedule, mutate a cohort, publish a baseline, or authorize action.

## Privacy and Limits

- Scorecards contain identities, counts, bounded durations, token totals,
  reason codes, hashes, and privacy-safe summaries only.
- Prompt bodies, file contents, environment values, credentials, provider-
  hidden reasoning, raw provider payloads, task logs, review prose, and
  arbitrary run payload fields are prohibited.
- Diagnostics are stable and bounded and never echo rejected values.
- Calculation is request-scoped and in memory. No cache, database, index,
  retention policy, or background aggregation is authorized.

## Implementation Slices

### Slice 1: deterministic scorecard service

Add closed schemas, exact run-record identity hashing, canonical joins, metric
registry calculation, privacy/limit checks, discovery/compute routes, restart
tests, and explicit no-mutation evidence. Do not change the dashboard.

Implemented with exactly the accepted discovery GET and closed-manifest compute
POST. The HTTP layer performs strict bounded parsing and privacy-safe error
mapping, then delegates to the request-scoped in-memory domain service. Focused
tests cover deterministic responses and hashes, exact watermarks and run
identities, missing/unlinked/changed/conflicting runs, all seven metrics, empty
denominators, unsupported outcomes, privacy and limits, legacy/restart behavior,
and before/after filesystem no-mutation evidence.

### Slice 2: read-only scorecard view

Consume only Phase 6 selection evidence and Phase 9 read APIs. Render explicit
loading, empty, stale, unavailable, incomplete, unsupported, and privacy-
rejected states plus direct bounded JSON download. Do not add alerts,
notifications, scheduled reports, cohort persistence, or mutation controls.

Pending. Slice 1 adds no frontend or download behavior.

## Acceptance

Phase 9 implementation is complete only when tests prove:

- equal bound evidence produces equal normalized scorecards and hashes;
- every numerator and denominator is reconstructible from exact evidence refs;
- unlinked, changed, missing, ambiguous, or conflicting run records fail closed
  or remain explicitly excluded according to the closed reason-code policy;
- zero denominators and unsupported outcomes are never rendered as numeric
  success;
- legacy Phase 1-8 ledgers and run records remain readable without invented
  joins or rewritten history;
- calculation performs no canonical, run-record, or filesystem mutation;
- prohibited fields never appear in API responses, diagnostics, downloads, or
  rendered HTML;
- limits prevent unbounded memory, response, and UI growth;
- the dashboard preserves keyboard access and uses only Phase 6/9 APIs;
- TypeScript, focused and regression tests, production build, browser checks,
  and diff checks pass.

## Explicit Non-Goals

Phase 9 v1 does not add notifications, email, chat, webhooks, sharing, uploads,
remote publication, scheduled reporting, background aggregation, search or
indexing, a database, cohort retention, external telemetry, deployment data,
defect tracking, monetary billing, automatic baselines, statistical causal
claims, champion decisions, budgets, SLAs, new operator actions, new authority,
destructive Git, deployment, or Project Map promotion.
