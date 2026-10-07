# GIS prelaunch successor source acceptance — 2026-10-07

Status: accepted source and synthetic fixture lifecycle; deployment and live
recovery pending at this dated acceptance. Navigation: [NEXT_STEPS](NEXT_STEPS.md).
Contract: [GIS prelaunch successor v1](gis-prelaunch-successor-contract-v1.md).
Private evidence: `queues/gis-prelaunch-successor-20261007/`.

The bounded implementation adds approval-bound prelaunch successor and mechanical
compatibility policies. It preserves the failed original reservation, fences the
canonical predecessor without reconciliation, rejects ambiguous launch evidence
and successor chains, and reserves one separate immutable claim. Fresh manifests
may update only current mechanical hashes; native gates and all other manifest
data retain their original bytes and contract. There are no provider, UI or HTTP
interface changes.

The independently reviewed frozen source consists of `server/index.ts`,
`server/gis-correction-recovery.ts`, its unit suite,
`server/gis-quality.integration.test.ts`, the proposed contract and navigation.
`source-hashes-frozen.json` binds their exact bytes; `regression-source-evidence.json`
binds the verification logs. The read-only reviewer found no actionable issues
and checked all 387 files of snapshot `05042487713f72f25a8a5add683ffd03b7979916`.
Subsequent changes in this acceptance commit are documentation status/navigation
only and receive a separate exact snapshot/context qualification.

Verification:

- Full `npm.cmd test`: exit 0, started `2026-10-07T17:32:09.380Z`, finished
  `2026-10-07T18:53:04.729Z`. Main suite: 684 tests, 683 pass, zero failures,
  one optional live GIS configured-roots skip. Both isolated cross-process gates
  passed. Full log SHA-256:
  `899ee328f0758faaf165f3b4f27f1a0adf0671dcbc3998ba48d765f4e7c02737`.
- Focused suites: 28 pass. Final production integration fixture: one pass;
  the same new fixture passed in the complete regression. This uses fake CLI
  and portable synthetic native tools, not a live provider.
- `npm.cmd run check` and `npm.cmd run build`: exit 0. Context smoke: 3 pass.
  Identical focused suites bundled as ESM under Electron/Node 22.16.0 with
  `ELECTRON_RUN_AS_NODE=1`: 28 pass.
- Context Budget with explicit `PYTHON_BIN`: dirty worktree failure retained
  in `context-budget-worktree.log`. Exact clean source snapshot passed with
  growth and unsupported-host-source warnings in `context-budget-snapshot.log`.
  This qualified snapshot result does not relabel the worktree failure.
- Complete actual read-only native `before q1000-052-b` and historical
  `prefix q1000-052-a` checks passed against fresh compatible copies. These
  are prelaunch observations, not publication or live recovery receipts.

Historical source `muwmmp32-zsowq`, failed manual precondition run
`muyb7bdj-d1r0c`, and the original reservation remain immutable. The successful
fixture proves a single successor publication and retained siblings, source and
claims; it grants no operational success claim. Deployment must be followed by
a fresh explicitly launched installed read-only smoke. The bounded live successor
must close successfully before unfinished writer continuation is launched.
