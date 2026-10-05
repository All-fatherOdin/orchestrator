# Typed process stages

## Opt-in structured analysis delivery

`GISPackageV1.analysisTransport: structured-output-v1` selects a code-owned,
closed provider schema for executor and correction. Omission retains the legacy
GIS analysis markers and required executor COMPLETED marker. Unknown values are
rejected; the exact configuration remains bound to apply approval, authorization
and replay. Ordinary tasks keep their existing contract.

The envelope has exactly `protocolVersion`, `outcome`, `mode`, `reason` and
`payloadJson`. The codec `json-string-v1` carries native substantive JSON as a
string, avoiding nested native schema in the provider schema. Full payloads have
exactly `responses` in prepared bundle order; patches have exactly `patches`,
each containing `index,response` for the agreed targets. Responses contain
exactly `reviewedUnits,findings,limitations`; host technical fields remain
host-owned. Missing optional fields remain absent, and actual null/false/zero
values are preserved for native validation. Duplicate object keys, including
escaped duplicates, are rejected in both envelope and payload.

`completed` means delivery of this invocation's analysis. It requires an empty
reason, nonempty JSON payload, process exit 0, no timeout/cancellation and current
`turn.completed` without failed/error or partial terminal evidence. `stopped`
requires a nonblank reason and empty payload and stops before native validation.
No free-text COMPLETED marker is required or synthesized for this transport.
The envelope schema does not prove native report correctness. Existing bundle,
source/input/scope checks, native validators, both finalizers, verification,
independent review and publication remain mandatory. Correction/recovery budgets
remain cumulative; transport or native failures do not introduce format retries.

Raw UTF-8 output and decoded payload each have a 1 MiB limit, reason a 4 KiB
limit. Oversize data is rejected, never truncated. Machine parsing reads the
entire bounded raw file; UI excerpts and `boundedFinalOutput` are not inputs.
Each invocation gets a fresh random directory under canonical run storage,
`<task-id>-agent-reports/<invocation-id>/`, containing `schema.json`, `result.json`
and `receipt.json`, outside the stage inventory and publication scope.
Receipts bind protocol/codec, run/task/invocation, phase/ordinal, full/patch mode,
schema, raw and decoded hashes. They are created only after current provider
success, then replayed at authority fences. Changed/missing files, identities or
hashes fail closed; interrupted receipt creation does not permit accepting a
failed provider call. Untargeted response bytes and their hashes are preserved.

Source tests and a synthetic CLI schema probe are separate from deployment.
A new build, installation, restarted installed read-only smoke with canonical
run receipt, refreshed bindings and bounded live GIS pilot are still required
before live use. Stage 2/MCP is outside this change.

## Decision and execution scope

One integrated implementation slice in the current session. No implementation
queue, related-repository writes, Project Map changes, installation or commits.
Existing unrelated working-tree changes are retained.

Extract stage ordering, checkpointing, fences, retry budgets, verification,
independent review and conditional file publication into `server/process-stages.ts`.
Trusted handlers prepare/analyze/finalize, validate domain evidence and supply
publication fences. Explicit registration is in `server/process-handlers.ts`;
queue configuration never names a module or executable handler.
GIS keeps its native protocol. Its project configuration selects state paths;
the current native runtime still requires project identity `gis2-front`.

Impact map (production): `server/process-stages.ts`,
`server/process-handlers.ts`, `server/gis-quality.ts`,
`server/isolated-artifacts.ts`, `server/index.ts`.
Tests: `server/process-stages.test.ts`, `server/gis-quality.test.ts`,
`server/gis-quality.integration.test.ts`,
`server/process-stages.live.test.ts`.
Versioned live semantic gates: `server/process-stages-live-fixtures/live-gate.mjs`,
`server/process-stages-live-fixtures/profile-gate.mjs` (pinned copies in disposable
contracts keep the exact same bytes and use the native validators).
`server/process-stages-live-fixtures/contract-gate.mjs` additionally binds the
actual raw bundle/response/validation fingerprint and the legacy native result
field to its distinct validation-artifact SHA-256. It runs every original gate.
Documentation: this file. Evidence and disposable live inputs: a new directory
under `queues/process-stages-20260929/` only. No manifest, dependency, checksum,
generated product file or other documentation change is intended.

## Acceptance cases fixed before implementation

* Deterministic independent handler: inputs `state/value.txt = 0`, output `1`;
  one executor invocation. Verification exit 75 once then 0: finalized ->
  finalized -> published, verification calls 2, executor calls 1.
* Reviewer unavailable once then approved: review calls 2, executor calls 1.
  Persist to JSON and reload before continuation; retain run/task identity.
* Verification exit 1: result-defect, no subsequent executor/verification call.
  Two transient failures with budget 2: third request fails before stage call.
* Changed handler identity/configuration, inputs, output bytes or authority:
  reject before executor, verification, review or canonical write.
* Publication interruption before effects, after temporary-file creation, after
  each rename and after all writes: resume only missing entries; total renames
  equals number of changed files; identical repeat has zero writes. Foreign
  canonical bytes, changed sealed bytes, non-prefix state and authority loss
  fail before further effects. Unsupported recovery fails explicitly.
* Ordinary isolated/ordinary tasks keep their existing path without a handler.
  Legacy GIS queue aliases the registered GIS handler. Old GIS progress remains
  readable; missing new identity or changed implementation is rejected before
  new execution rather than inheriting old approval.
* Same GIS handler, two disposable roots and two distinct state/run/runtime
  locations, actual native runtime and actual agent: exact state readback,
  second package consumes first package state, controlled finalized-stage stop
  and persisted continuation without another executor. Keep canonical run.json.
  Mocked integration checks are separate evidence, never proof of this case.

Grouping/filtering/aggregation cases are inapplicable: this change coordinates
stages and file deltas; it defines no record grouping, filters, totals or pages.

Verification: `npm run check`, focused process/GIS/isolated suites,
`npm run build`, `npm test`, `git diff --check`; actual live test separately.
No installed-application verification is claimed.

## Connecting a project

Use the registered `gis-audit`, version `1`, in
`isolatedArtifacts.processPackage`:

```yaml
contractType: ProcessPackageV1
contractVersion: '1.0'
handler: gis-audit
handlerVersion: '1'
configuration:
  contractType: GISPackageV1
  contractVersion: '1.0'
  # Existing exact manifest/scopes/gates/node/stdio pins, batchId, stageAttempts.
  projectConfiguration:
    statePath: domain/state
    projectId: gis2-front
```

The pinned manifest supplies `projectRoot`, read-only `auditRoot`, the normalized
runtime location and exact runtimeEvidence, preflight evidence and batch run
locations/profile/block pins. Copy the native runtime without altering its
bytes, prepare the real native preflight and scope inputs, and set statePath to
the directory containing the existing native coverage/baseline pair. Declare
that state directory in isolated inputPaths. Declare the exact state/run write
capabilities, verification commands and externalReadRoots in both the task and
matching approvedApplyContracts entry. Changing these configuration values
requires corresponding fresh contract approval; they grant no additional
filesystem capability by themselves.

The current native runtime accepts only the GIS frontend project identity and
existing contextual profiles: business-logic-regression, security-risk and
performance-regression. Different physical roots/state/runtime/run paths are
supported. Arbitrary business project identities or candidate-analysis profiles
are not supported by this runtime and are not advertised as portable.

Performance preparation creates a separate native static baseline for each
bundle and passes it to that bundle's analysis validator. This inventory does
not supply runtime measurements. The native baseline builder rejects incomplete
bundles; such packages must remain blocked rather than bypassing validation.

A new process needs a trusted handler when preparation, structured response,
validation/finalization, publication plan or actual-result checks differ. It
implements ProcessHandler and is registered explicitly in process-handlers.ts
with a closed configuration validator and implementation identity. Core stage
code does not change. The counter handler in process-stages.test.ts is test-only
and is deliberately unavailable in production queue configuration. Ordinary
tasks need no registration or adapter.

## Compatibility and recovery

Legacy isolated queues without a process selection use the previous ordinary
isolated path. GISPackageV1 remains a closed legacy alias for the registered
GIS handler, with the legacy state location when projectConfiguration is absent.
New registered queues persist processProgress; legacy GIS queues retain the
gisProgress field name, containing the new ProcessProgressV1 envelope.

Historical GISProgressV1 records are readable as historical runs. They lack the
new handler/configuration identity and cannot be implicitly upgraded or resumed.
The restore boundary rejects them with `Legacy progress requires fresh
authorization; handler identity is unavailable`, before executor invocation or
canonical writes. No historical bytes are rewritten and old approval is not
promoted to the changed implementation. A separately authorized fresh task is
required; this change provides no automatic migration of prior side effects.

New checkpoints bind handler name/version/implementation/configuration, core and
host implementation identities, provider/runtime environment, authorization,
write scope, project/stage/input locations and finite stage budgets. Canonical
input inventories, stage artifacts, native pins, saved verification receipts and
independent review are rechecked. Changed or incomplete results fail closed.
Resume keeps the canonical run and task identities. Progressed tasks cannot use
whole-task retry; no hidden executor retry or correction is introduced.

Publication supports the explicit conditional-file protocol only. The core
persists reviewed sealed bytes and ordered before/after entries before effects,
checks the whole prefix after each boundary, and renames only missing entries.
Handlers with unsupported recovery reject continuation at a publication stage.
This is not a guarantee for arbitrary external effects or deletion workflows.
Before reserving a write attempt, reconciliation checks sealed and canonical
bytes without writing. If every entry is already applied, it returns `writes: 0`
without consuming publication budget, including after a lost acknowledgement
on the last allowed attempt. Remaining writes still require an available attempt;
conflicting bytes fail before reservation or effects. The reviewed delta uses
the union of baseline and current paths. Deletions are unsupported and rejected
as a deterministic result defect before sealing or publishing any output.

The unchanged native finalizer has a legacy naming ambiguity:
`profileResults[].bundleFingerprint` represents the validation-artifact digest
(or its sorted aggregate), as implemented by `group.artifactDigests` in
quality-catch-up-finalizer.mjs. The raw bundle identity is separately carried
in bundle/response/validation. The live contract gate asserts both bindings
explicitly for the one-bundle sample, without treating that legacy result field
as a raw bundle fingerprint or changing native output. Consumers requiring a
renamed field or different native semantics need a separately scoped native
contract change; it is outside this refactoring.

## Verified result, 2026-09-29

* Focused process/GIS/isolated suites: 21/21, exit 0.
* TypeScript and production build: exit 0; existing Vite chunk-size advisory.
* Full `npm test`: 591 passed, zero failed, one opt-in live case skipped;
  main suite 691462 ms, isolated gates 3611 ms and 115888 ms.
* Explicit `PROCESS_STAGES_LIVE=1 node --import tsx --test
  server/process-stages.live.test.ts`: 1/1, zero skips, exit 0, on final source.
* Git diff check and whitespace assertions over exact untracked/scoped source
  files passed. No installed application validation is claimed.

Exact logs and acceptance outputs are in `queues/process-stages-20260929/`:
`focused.log`, `full-tests.log`, `build.log`, `final-check.log`,
`diff-check.log`, `live-verification.log`, `live-acceptance.json`,
`aggregate-assertion.json`, `legacy-compatibility.json`.

Both disposable roots use the same unchanged handler implementation and genuine
Codex executor/reviewer plus real native runtime under the existing Windows
restricted-token sandbox with networking disabled:

| Configuration | Canonical run | State | Runtime |
|---|---|---|---|
| A | mumbmljd-3o9ue | domain/state | engine/native |
| B | mumbxiwy-gss6k | audit/private/state | support/audit-runtime |

Canonical records:
`C:/Users/a.lozovoy/AppData/Local/Temp/process-A-hoteYy/data/runs/mumbmljd-3o9ue/run.json`
and
`C:/Users/a.lozovoy/AppData/Local/Temp/process-B-2copez/data/runs/mumbxiwy-gss6k/run.json`.
Exact retained copies: `queues/process-stages-20260929/final-A-run.json` and
`queues/process-stages-20260929/final-B-run.json`. Full run directories are
retained in `retained-A-run/` and `retained-B-run/`; native operation/state and
contract snapshots are in `A-artifacts/` and `B-artifacts/` under the same
evidence directory. These are evidence copies, not migrated runnable records.

Each project completed two packages and an independently approved final
WholeChangeAcceptanceV1. Each package called the executor, verification and
review once, with six terminal sandbox native commands and 22 exact publication
entries. Initial completed/open counts 384/6488 became 388/6484. Exact selected
cells, unowned cells, native result/state twins, both coverage and baseline
handoff, source record preservation, native fingerprints and all actual hashes
are asserted by executable checks, not inferred from aggregate status.

Both first packages were interrupted after baseline replacement, with coverage
still before and its temporary file after. `final-interrupted-A-run.json`,
`final-interrupted-B-run.json` and corresponding `*-state.json` preserve this
observed boundary. A new process continued the same canonical run/task and
applied one remaining file; no repeated analysis, verification or review.
The independent counter handler additionally proves transient verification and
review, budgets, deterministic refusal, all publication boundaries, duplicate
zero-write reconciliation, identity invalidation and unsupported recovery.

The historical successful GISProgressV1 record `mulol99i-dad16` was read through
the current loader, then its old progress restore was safely rejected for
missing handler identity. Its canonical bytes remained unchanged; the exact
read/refusal evidence is `legacy-compatibility.json`.

Earlier disposable attempts are preserved in `failed-A-run.json`,
`failed-B-run.json`, `prior-runs.json` and the exact named prior run copies.
They include unclear read-command instructions, substantive analysis rejection,
native field-semantic ambiguity, and a correctly fenced harness identity change
when the runner was edited during execution. No failed deterministic result was
resumed or rewritten to obtain approval. Later attempts used fresh disposable
projects and explicitly scoped inputs/contracts. Original assertions remained
enabled; the native legacy-field check is additive.

No working GIS data, related repository, Project Map, installed application or
repository commit was changed. No push or production publication was performed.

## Publication correctness follow-up

Review identified two core defects: completed publication acknowledgement was
incorrectly gated by remaining write attempts, and baseline-only paths were
silently omitted from the publication delta. The bounded correction changes
only `server/process-stages.ts`, `server/process-stages.test.ts` and this file.
No handler, native runtime, queue contract or saved historical record changes.

Regression cases use the independent counter handler with publication budget 1:
an identical completed request, interruptions after the last rename, after all
effects and at the published checkpoint all survive JSON restart with zero
remaining writes, attempts still 1 and executor/verification/review still 1 each.
A partial prefix with remaining writes still fails at the exhausted budget;
foreign target bytes are rejected by reconciliation before that budget gate.
A handler deleting `state/value.txt` while creating `result/receipt.txt` is
rejected before sealing or any canonical publication, even when the handler's
published-result validator is a no-op. Original canonical value remains `0`,
the result does not exist, publication attempts remain 0 and retry is refused
as a deterministic result defect.

The new regressions failed before the correction. After the correction,
`npm run check`, `npm run build` and the complete targeted command
`node --import tsx --test server/process-stages.test.ts server/gis-quality.test.ts server/gis-quality.integration.test.ts server/isolated-artifacts.test.ts server/isolated-artifacts.integration.test.ts`
passed: 24 tests, zero failures/skips. Logs are
`queues/process-stages-20260929/publication-fixes-focused.log` and
`queues/process-stages-20260929/publication-fixes-build.log`.
Full `npm test`, new genuine-agent GIS runs and installation were not rerun for
this correction. Earlier live records and deployment receipts prove their
recorded implementation versions, not this changed core; their files and hash
bindings remain unchanged.

## Bounded correction of independently rejected analysis

Process packages may explicitly opt into `stageAttempts.correction: 1` or `2`.
Omission or `0` preserves the historical no-analysis-correction behavior.
The effective cap is the smaller of this setting and `review.maxCorrections`;
independent review must be enabled. To allow two corrections and their complete
checks, use at least three verification and three review attempts. Those stage
counters are cumulative and never reset by correction or same-run continuation.
Ordinary isolated-artifact tasks retain their existing correction prohibition.

Only a completed independent `changes_requested` review with non-empty feedback
of at most 16 KiB and no reviewer write violations admits correction. Missing
reviewers, failed native commands, failed verification, missing terminal agent
results, changed inputs/runtime/authority and publication failures do not admit
another analysis. An identical whitespace-normalized reviewer report stops the
task on its second occurrence; distinct reports can never exceed the configured
cap of two corrections. Every replacement must pass all machine gates and a new
independent review before any canonical publication.

The core reserves the next analysis count in the canonical progress before
replacement. It moves the complete rejected workspace to the task-owned sibling
`rejected-analysis-N`, retaining its exact inventory hashes and reviewer report
in progress history, and reconstructs the working stage from the unchanged
original inputs. Fresh preparation, analysis and native finalization run there.
Canonical state remains untouched until approval. Rejected archive bytes,
feedback, counter and effective policy are fenced on continuation; interrupted
replacement analysis fails closed and requires an explicitly authorized recovery.
Restart/resume does not replenish these budgets, and historical rejected records
are never edited into successful ones.

The production runner uses its existing `correction` provider phase, timeout,
authorization and invocation-budget admission rather than resetting the executor
counter. `ExecutionBudgetPolicyV1` is admitted for these explicitly opted-in
packages and can stop correction before a provider spawn; legacy process
packages keep the prior restriction. Queue authorizations bind the same optional
setting in `processPackage.configuration` (including the matching apply contract).
Changing loaded source or deployment identity still invalidates old progress;
existing runs cannot acquire this behavior by editing their saved records.

These source changes require a new build, installation, installed read-only
smoke and refreshed queue bindings before they govern a live GIS queue. Existing
smoke/pilot receipts demonstrate their pinned earlier version only.

## Whole-change handoff for large artifact sets

GIS corrections use `ORCHESTRATOR_GIS_ANALYSIS_PATCH_V1` with an exact ordered
set of response indices derived from each reviewer finding. Each finding must
name a response file, a primary file, or an unambiguous bundle; an unscoped or
out-of-package finding fails closed. Explicit response references take priority
over contextual bundle references. The host rejects duplicate, missing and
additional patches and preserves every untargeted response byte for byte.
Fresh prepared bundles must match retained profile/fingerprint identities.
Native preparation, validation and finalization still run for the whole package,
followed by full verification and independent review; budgets remain cumulative.

An explicit `RecoveryTaskBindingV1` may retain a terminal failed GIS analysis
only when it reached `verified` with `changes_requested`. Its exact canonical
source record, authorized scopes, current input hashes and response hashes are
checked before executor admission; the canonical record is fenced again at
asynchronous boundaries. Corrections are never seeded from prose or a searched
run. A source byte change or a fresh bundle identity mismatch stops recovery.
The canonical progress history records selected patches and preserved hashes.
This does not authorize retrying an exhausted run: recovery is a separately
authorized task, and can be bounded to one verification/review attempt.

Whole-change acceptance supports up to 4096 unique task-owned paths. The limit
is enforced both when preparing and when replaying persisted evidence; invalid
paths and missing predecessor approval or verification still fail closed.
Content/receipt payloads remain bounded to 4 MiB, individual inline files to
16 KiB, and the complete serialized closed handoff to 16 MiB. Above 64 paths
or 96 KiB serialized evidence, the runner writes one immutable JSON handoff
under its canonical run directory. Its exact path, byte length and SHA-256 are
bound into the evidence fingerprint. The reviewer reads that file rather than
receiving a truncated list or an oversized prompt. Every predecessor receipt,
tracked/untracked path and content entry remains in the handoff.

Large GIS artifacts retain the existing native-chain, verification, publication
and full stage-inventory checks. Ordinary isolated publications may use a
`SealedArtifactEvidenceV1` reference only when successful publication receipts
exist and the current stage and runner-created sealed copy both match the exact
publication-started inventory. Target bytes must match that seal for each path.
Unsealed untracked large files remain rejected. Seals are checked once per
owner per preparation; cached results never survive a replay boundary. A changed
or missing persisted handoff is rejected, never silently regenerated.

This removes the 64-file blocker found by disposable pilot `mumkerka-g1yod`
(82 unique paths) without dropping writers, paths or verification receipts.
