# GIS review premise priority source acceptance — 2026-10-08

Status: accepted source and synthetic fixture contracts; deployment and live
recovery not performed for this source slice. Navigation: [NEXT_STEPS](NEXT_STEPS.md).
Contract: [review premise priority fix](gis-review-premise-priority-fix-v1.md).
Private evidence: `queues/gis-review-premise-fix-20261008/`, final gate in `final/`.

The legacy reviewer prompt distinguishes descriptive claims and historical feedback
from current primary source facts. Explicit owner-requested new behavior remains
an acceptance requirement: unchanged old source is an implementation defect.
GIS review must inspect corresponding current bundle primary content and preserve
missing/truncated/redacted evidence as limitations. Assignment, source, Unicode
literals, output statuses, authorization and budgets remain intact. There is no
new automatic retry, reviewer-only bypass or verdict override.

Independent review found an overly broad first formulation that could excuse an
unimplemented owner-requested literal change. That P1 was corrected before final
source freeze and a negative case was added in both Unicode directions. The initial
full run was intentionally interrupted before revising source; its log and
interruption evidence are retained as incomplete, never as passing acceptance.

The final independent read-only review checked five frozen source/document hashes,
18 exact evidence hashes and all 390 files in the exact clean snapshot
`10457002a2e578121b4fb81e65d9be3364368042`. No actionable findings remain.
`final/source-evidence.json` binds the verification artifacts. Post-regression
changes are only this acceptance record and documentation status/navigation;
they receive a separate context/equality qualification.

Verification:

- Final `npm.cmd test`: exit 0; started `2026-10-08T06:17:15.323Z`, finished
  `2026-10-08T08:27:38.429Z`. Main: 687 tests, 686 pass, zero failures,
  one optional live GIS configured-roots skip. Both isolated cross-process gates
  passed. Full log SHA-256:
  `8766c14d848d2c5eaab8b0c09e6ce586af24b7a169803b39ced5e3c69285cd98`.
- Final focused prompt suites: 7 pass. Both literal conflict directions and
  unimplemented authorized changes are covered, along with registered/legacy GIS
  guidance and missing evidence. Identical suites bundled as ESM under
  Electron/Node 22.16.0 with `ELECTRON_RUN_AS_NODE=1`: 7 pass.
- `npm.cmd run check`, `npm.cmd run build`, context smoke: exit 0; smoke 3 pass.
  `git diff --check` passed; new untracked documentation was explicitly inspected.
- Context Budget used explicit
  `PYTHON_BIN=C:/Users/a.lozovoy/AppData/Local/Programs/Python/Python313/python.exe`.
  Dirty-worktree failure is retained separately. The byte-identical clean snapshot
  passed with growth/unsupported-host-source warnings; this does not relabel the
  worktree failure.
- Full regression also passed existing production fixtures for bounded verified
  result recovery, immutable siblings/source counters, prelaunch reservations,
  denied budgets and repeated review rejection without publication or resume refund.
  These use fake CLI and synthetic native tools, not a live provider.

Prompt contract checks establish supplied instructions, not model obedience or
the exact cause of the historical contradictory verdict. Failed run `muyhl0fp-hq10k`
and its claims remain immutable and failed. The existing `RecoveryTaskBindingV1`
path can accept a separately authorized failed verified result and create a fresh
bounded patch result; this source acceptance neither launches it nor grants another
review of an unchanged result. Current installed/live state must be established
through its own deployment, smoke and canonical receipts.
