# GIS 2 continuation preparation — 2026-10-07

Status: blocked proposal, not a launch-ready queue or operational acceptance.
Source fix: [prepared correction recovery v1](gis-prepared-correction-recovery-v1.md)
has passed source implementation checks; the installed application still has the
original boundary described below. Reinstallation and a fresh targeted pilot
must precede writer continuation authoring.
Role: durable preparation record for the unfinished GIS audit. Evidence: the
selected canonical run, current runner contracts and read-only preflight receipts.
Navigation: [NEXT_STEPS](NEXT_STEPS.md). Private run-specific bindings and logs
are in `queues/gis-continuation-preparation-20261007/`.

## Selected work and immutable boundary

The selected source is canonical run `muwmmp32-zsowq` in the installed application's
data directory. Its 48 tasks contain 10 completed tasks and 38 unfinished tasks:
37 writers followed by `accept-supported-continuation`. The existing queue is
`queues/gis-terminal-accepted-continuation-20261006.yaml`. No task in the completed
prefix may be rerun. Existing queues, manifests, scripts and canonical receipts
remain immutable; a new queue must bind their exact bytes rather than rewrite them.

The application now runs the backend built from commit `8398b90`. Fresh installed
read-only smoke `muy3bhkb-222iq` completed two tasks and four required verification
commands. Its canonical archive read preserved the completed record. This proves
installed read-only behavior; it does not prove GIS writer recovery or live reviewer
transport recovery. Exact installation/smoke evidence is in
`queues/agent-review-stage4-canonical-fix-deployment-20261007/`.

## Blocking evidence

1. Lossless compact JSON of the old queue fails current preflight for all 47
   original writers: exact aggregate claims lack a named-artifact executable
   mismatch assertion. The optional missing project AGENTS.md is not a required
   gate failure. The original formatted queue also exceeds the 1 MiB request
   limit and returns HTTP 413. Do not increase that limit to launch it.
2. Its launch-readiness gate pins backend
   `2b999c40a7d07e4467f7d4ffce738bf063b1bc625e71222d98dad7c3857f648f`;
   installed backend is
   `ad80aeeb6f5dcd88758d7e616046d256799e26756444a2f9a75bebc71a9d9fed`.
   Replacing the old bound gate or its receipt would falsify historical evidence.
3. First unfinished task `q1000-052-b`, ID `muwmmp32-ss2oy`, is in `prepared`
   phase with `result-defect`, after the third executor invocation (two correction
   reservations), two verifications, two reviews and zero publications. Last
   correction failed its current provider terminal requirement. This is an
   executor failure and cannot use reviewer-only `once-v1` recovery.
4. Current `executeProcessTaskLifecycle` accepts retained GIS recovery only from
   a failed `verified` task with current `changes_requested` review and successful
   verification evidence. The selected task does not meet that contract.
   Existing same-run continuation also rejects incomplete prepared progress and
   changed handler identity. A new YAML alone cannot repair this boundary.

The versioned read-only legacy verified-source checker
`scripts/gis-queue-checks/recovery-source.mjs` accepts an exact canonical path,
run/task/key and SHA-256. It detects this unsupported source without mutation.
It describes the historical installed recovery boundary and does not validate
the new `PreparedCorrectionRecoveryV1` opt-in. Its focused tests cover eligible verified evidence and rejected prepared,
duplicate, identity, review and verification cases. This check is preliminary;
the production runner still owns full authorization replay and artifact fencing.

## Required bounded implementation before writer authoring

Choose one bounded implementation slice in the current session. Do not pre-author
writers with unknown recovery authority. The slice needs an explicit policy for
one additional targeted attempt following a reserved failed correction; source
reservations and rejected analyses must remain recorded. Neither a new run ID nor
restart grants another correction automatically.

The exact last substantive feedback targets response index 2: the summary says
em dash, while `src/entities/parameter/model/lib/getParameterValueTypeLabel.ts`
returns ASCII hyphen-minus `'-'`. Before any recovery spawn, fence the canonical
record, the archived second rejected analysis, all five response bytes, all five
scope and fresh bundle identities, source inputs, authorization and failed
correction terminal evidence. Preserve untargeted responses byte for byte. Missing
or ambiguous failed invocation evidence must block recovery. Do not change phase,
review status or counters in the historical canonical run to make it eligible.

The production change needs source tests for successful targeted recovery,
transport/unknown failure distinctions, source mutation, exhausted reservations,
crash before/after spawn, no second recovery, immutable sibling responses and
single publication. Include installed smoke and a genuine isolated targeted GIS
pilot as subsequent operational boundaries. Source acceptance cannot substitute
for that pilot. Exact source mutation scope and checks must be resolved before
implementation; this proposal does not authorize an unbounded runtime redesign.

## Continuation contract after recovery is supported

- Bind the failed source through exact `RecoveryTaskBindingV1`, execution kind
  `recovery`, and a superset of all authorization-bound runtime constraints.
  Retain mandatory tools, ordered external roots, five scopes, native timeout,
  temporary isolation and native/review/publication gates. No native retry or
  additional automatic corrections for the targeted recovery.
- Bind the 10 completed source tasks, historical accepted packages and every
  published file by canonical task identity and exact hashes. A source failed
  status does not invalidate an approved published writer. Do not reconstruct
  predecessor receipts in prompts.
- Select only unfinished writers. Use `maxParallelTasks: 1`, enabled task
  authorization and required verification. Bind approved apply contracts to exact
  ordered impact paths, write scopes, external roots, gates and process settings.
- Keep reusable checks in `scripts/gis-queue-checks/`. Parameterize a fresh
  evidence directory; do not relocate historical bound scripts. Fresh deployment
  readiness must bind the current installed smoke and targeted pilot separately
  from historical launch bindings.
- For each writer, prove native result selected/completed counts against its
  before/after coverage, receipt result chain and declared five-cell scope.
  Bind each exact normalized artifact path in the declared executable command,
  read each file, assert expected values and fail on disagreement. Existing
  `gate.mjs` substantive checks remain required; preflight-shaped text is not
  a replacement for its native assertions. Fixtures must cover distinct sibling
  profiles, duplicate cells/results, multiple contributing results and numeric
  zero; null/absent counts fail rather than coerce to zero. Pagination is
  inapplicable because these receipts are complete local files.
- End with unique read-only `WholeChangeAcceptanceV1`, no write paths, ordered
  direct dependencies equal to all new writers, and closed host-supplied handoff.
  Whole-chain checks must read historical and new artifacts and distinguish
  completed, omitted and failed coverage. No unperformed browser claims.
- Serialize compact JSON/YAML below the installed API payload limit. Validate
  schema, graph, approval replay, recovery source, scopes, budgets, runtime and
  all read-only launch gates before creating a run or project lock.

## Preparation result

The source binding is prepared as `source-binding.json` in the private preparation
directory and explicitly marked `blocked-draft-not-launch-authority`. It includes
exact source identity/hash, completed and unfinished tasks, retained constraints
and counters. No writer queue has been created or launched: current production
recovery cannot satisfy its source contract. The implementation prerequisite
above must be resolved before a launch-ready continuation can be delivered.
