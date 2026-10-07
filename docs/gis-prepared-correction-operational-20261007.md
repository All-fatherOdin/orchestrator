# GIS prepared correction operational record — 2026-10-07

Status: deployment and installed read-only smoke accepted; targeted recovery failed
its precondition before executor; writer continuation blocked. This is a dated operational record, not launch
authority. Navigation: [NEXT_STEPS](NEXT_STEPS.md).

The [manual recovery source contract](gis-prepared-correction-recovery-v1.md) was
committed and pushed as `d290908a995164d5617caeb59b4fd95d702c1a9d`.
`npm.cmd run desktop:dist` and the silent NSIS installation both exited zero.
The restarted desktop reports version 0.1.8, owned-desktop, port 4318 and the
existing data directory. All six bound installed assets match the build; backend
SHA-256 is `0c4f72ef9a1230791a538e4aa53714aca39fe3691599b3d883281f479b1e3225`.

Fresh explicitly launched read-only smoke `muyapjap-bm1od` completed two tasks
and four required verification commands, with no changed files or write paths.
Its canonical record remains completed and byte-identical after the archive API
read. Evidence is retained in `queues/gis-prepared-correction-deployment-20261007/`:
`deployment-binding.json`, `smoke-location.json`, `smoke-acceptance.json` and
`smoke-acceptance.log`. This does not prove GIS recovery or live publication.
Context Budget on the clean committed source passed with warnings; the earlier
dirty-worktree failure remains historical evidence and was not relabeled.

## Additional package assertion gate

`scripts/gis-queue-checks/package-evidence.mjs` is an additional deterministic
gate beside the unchanged authoritative native gate. Its explicit arguments bind
the root, manifest, batch and exact normalized before-coverage, after-coverage and
receipt paths. It reads all named files and every receipt result, checks the result
chain and exact selected/completed/omitted/failed package totals, and rejects
duplicates, sibling mutations and contradictory per-record counts.

The three focused fixtures in `scripts/gis-queue-checks/package-evidence.test.mjs`
assert accumulation across two contributing native records: selected 2,
completed 1, omitted 1, failed 0. Numeric zero contributes zero; absent/null counts
are rejected. Profile names are exact and whitespace is significant. An unchanged
sibling profile is asserted independently. Duplicate receipt locators/profile
rows and compensated impossible counts are rejected. Pagination is inapplicable:
the receipt explicitly enumerates the complete local result set. The gate does
not claim all-queue totals or replace native semantics, schema, baseline and
publication checks. Independent read-only review accepted the final gate with
3/3 fixtures; `npm.cmd run check` passed. Read-only evidence on historical
`q1000-052-a` also passed: selected 5, completed 0, omitted 5, failed 0.

## Remaining operational boundary

The selected failed source is still `muwmmp32-zsowq` / `muwmmp32-ss2oy`.
Its canonical record, diagnostics and old queues remain unchanged. The source
manifest binds `projectRoot` to the original GIS worktree; the handler requires
that exact root. A disposable-clone recovery cannot change that manifest without
breaking the retained source binding. The subsequent bounded two-task recovery
retained the original project and used isolated artifacts; it was not a disposable
clone pilot. Preflight passed authorization, source/runtime and aggregate checks.

Run `muyb7bdj-d1r0c`, task `muyb7bdj-k8tkc`, failed the unchanged
`gate.mjs before q1000-052-b` precondition with `Queue implementation changed`.
Historical mechanical evidence pins obsolete bytes of `server/process-stages.ts`,
`server/gis-quality.ts`, `server/index.ts` and `server/agent-report-tools.ts`.
The bound files were not edited. Executor invocations, process progress and
publication are absent; final acceptance is blocked. Schema/source preflight does
not execute these native preconditions. Those hashes should have been audited
before creating the run.

The conservative source-owned reservation now names this failed run/task. It was
persisted before project lock/preconditions and is not refunded by failure. The
source canonical SHA remains
`aee10d56cb342e9b68b6dc7b07eabc1b802259732cb69c114215d8d26cd70d61`.
No retry, claim deletion, canonical mutation or failed-gate substitution is granted
by this record. Continuation needs a separately bounded compatibility and
reservation-policy decision with fresh immutable bindings. The old 48-task queue
remains blocked and must not be resumed wholesale. Exact failed-run evidence is
retained under `queues/gis-prepared-correction-deployment-20261007/`.
