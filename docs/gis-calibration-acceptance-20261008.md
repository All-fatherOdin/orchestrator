# GIS calibration contract: bounded acceptance and continuation

Status: dated operational snapshot, 2026-10-08. Published `q1000-056-b` received
new independent read-only acceptance; the remaining 34 writers were launched.
Their complete acceptance is pending. Role: diagnosis and exact operational
evidence, not a live status board. Navigation: [NEXT_STEPS](NEXT_STEPS.md),
[preceding launch snapshot](report-mcp-mode-operational-20261008.md).

## Failure and contract distinction

Run `muzjoyyt-dw8u9` failed at final WholeChangeAcceptance, not at its writer.
Writer `muzjoyyt-zm1s6` completed with approved review, published phase and
counters executor 1, verification 1, review 1, publication 1. Its closed full-mode
report invocation made 24 MCP calls and one native validation; terminal succeeded.
All four original acceptance gates passed. The final reviewer nevertheless
requested replacing native `calibration-only` and forcing coverage completion.

The authoring phrase "full ordinary analysis" was ambiguous and omitted the
previous explicit calibration limitation. Three contracts must stay distinct:

- `TaskExecutionKindV1: ordinary` identifies Orchestrator execution authority.
- Report identity `mode: full` means a complete newly submitted response payload.
- Native `scope.mode: calibration-only` describes the unchanged audit scope.

Neither orchestration identity authorizes changing the native mode. The native
validator explicitly permits successful validation with
`coverageCompletionAllowed=false` when reviewed units have limitations. The
existing deterministic package assertion reads all named coverage, receipt and
native result artifacts and confirms selected 5, completed 0, omitted 5, failed 0.
These are declared limitations, not proof that the executor reused old analysis.
No coverage-completion requirement or native-mode mutation was authorized.

## New independent read-only acceptance

New run `muzlql9u-2k01t` completed two read-only tasks, both reviewed `APPROVED`,
with fourteen required verification receipts. Its canonical SHA-256 is
`b008fbadbc7e7474b02dd048682870468fba2d7f9c26789d396a8f2d17adb031`.
Archive read preserved that canonical record.

The independent reviewers received an explicit bounded copy of the original
closed host `WholeChangeAcceptanceEvidenceV1`, actual writer receipts and sixteen
published artifacts. Machine gates bind the copies to the original canonical
record, every task-owned tracked/untracked content hash, native prefix, exact
package counts and historical prerequisites. Content-readable evidence and the
final current handoff remain required. The native assertions were not weakened.

Original source canonical SHA-256 remains
`4183c4a5ad02493ba6c9cf66ada2515b7d223c0ca8081e6d1874a74cdf22f68d`.
Its failed final verdict remains historical evidence; no old task status,
receipt or bound script was edited. This is a new bounded acceptance of a
published external source, not a rewrite of the failed acceptance. No further
GIS executor, native producer or publication ran for `q1000-056-b`.

## Remaining continuation launch

Sequential plan `muzlxnfe-l3ink` contains two already-defined queues of seventeen
ordinary writers and a unique read-only final acceptance each. Closed acceptance
above and the immutable published writer are exact launch prerequisites.
Each writer retains its ordered write scopes, external read roots, impact map,
native configuration, all original verification commands and runtime constraints.
Prompts now distinguish the three contracts explicitly and retain actual native
limitations. `q1000-056-a` and `q1000-056-b` are excluded from execution.

Readiness checked all 34 writer contracts and runtime supersets; all five first
writer prerequisites and plan preflight passed. First run `muzlxpfq-lmu8x` started
`q1000-057-a` in prepared phase with executor attempt 1. The next queue requires
successful closure of the first, including independent acceptance. This is launch
evidence, not completion of the remaining queue; current truth is canonical
`run.json` under the desktop data directory.

Private evidence, original source handoff/copy binding, rejected unlaunched
read-only drafts, gate logs, new closed acceptance, remaining queues, exact
prerequisite/readiness checks and launch identity are retained in
`queues/gis-calibration-acceptance-20261008/`. Read-only schema/content preflight
rejections were retained before correcting the unlaunched draft; no authoritative
native gate failed or was replaced. Queues remain ignored; Project Map was not
updated. No runtime source change or reinstall was needed for this prompt fix.
