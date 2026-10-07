# Stage 4 canonical history race fix — 2026-10-07

Status: source fix and fixture verification complete; dirty-worktree Context
Budget qualification retained. Operational acceptance remains separate.
Role: bounded source diagnosis and verification follow-up to the
[operational report](agent-review-stage4-operational-20261007.md).
Navigation: [Next steps](NEXT_STEPS.md).
Installed application verification remains a separate boundary.

## Diagnosis and change

The original `loadRun` read a running canonical snapshot outside the serializer
used by executor persistence. When completion was already queued, the archive
reader could later recover its stale snapshot and overwrite the completed record
with a false process-ended failure. The reproducing test fails on the committed
original implementation (`completed` expected, `failed` observed).

`loadRun` now serializes the complete read, ownership/recovery checks and atomic
write using the same per-path serializer as `persist`. The write stays inside
that transaction without reentering `persist`. Authorization, budget/recovery
replay and canonical workspace field checks remain in place. The new test
asserts the returned and persisted terminal status, timestamp and task audit log.

This covers the observed single owned backend race. The serializer is local to
one process; cross-backend transactions and the separate startup recovery
transaction are not covered by this change. Existing failed canonical pilot
`muxt6dl2-y3j1z` and its immutable review files were not repaired or reopened.

## Verification evidence

Private evidence root: `queues/agent-review-stage4-canonical-fix-20261007/`.
The exact source hashes are in `source-hashes.json`.

- Original-code regression: `regression-before.log`, expected exit 1.
- Focused ownership/history checks: `focused.log`, 5 passed, 0 failed.
- Electron focused checks: `electron-focused.log`, 5 passed, 0 failed;
  `electron-version.log` confirms Node 22.16.0.
- TypeScript and production build: `check.log`, `build.log`, exit 0.
- Context smoke: `context-smoke.log`, exit 0.
- Context Budget with explicit `PYTHON_BIN` and process-only Git ownership
  allowance: `context-budget-configured.log`, exit 0, pass-with-warnings.
  The initial unconfigured Git ownership error remains in `context-budget.log`.
- Initial full `npm.cmd test`: `full-test.log` and `full-test-interrupted.json`.
  No process or terminal exit record remained; this is not passing evidence.
- Complete full rerun: `full-test-2.log`, `full-test-2-exit.json`, exit 0;
  `full-test-2-verified.json` binds exact counts and unchanged source hashes.
  Main suite: 671 tests, 670 passed, 0 failed, 1 optional live GIS smoke skipped.
  Both isolated cross-process suites: 1 passed, 0 failed each. Started
  2026-10-07 10:36:35 UTC; finished 12:01:10 UTC (about 85 minutes).
  `full-test-2-readable.log` reverses native CP866 console decoding into UTF-8;
  round-trip equality and both log hashes were checked, with original retained.
- Independent read-only source review: `independent-review-initial.md`, no
  actionable findings; full regression was pending at that initial review.
  The final independent evidence review is recorded separately.

After the navigation edit, `context-budget-docs-workspace.log` records the
dirty-worktree conflict. This is not a passing workspace gate. A separate clean
Git snapshot retains every tracked/untracked source byte; the versioned
`scripts/verify-source-snapshot.mjs` equality gate verifies its full inventory.
Final snapshot identity, equality and Context Budget evidence are retained in
`snapshot-location.json`, `snapshot-equality-final.log` and
`context-budget-snapshot-final.log`. Source acceptance is qualified by this
separate clean-snapshot proof, not by relabelling the workspace failure.

The operational report/scripts were committed first as `bfa1bd2`.
This source fix is a subsequent working-tree change. No installed rebuild,
restart, smoke or live pilot has been performed for the fix. Real provider
transport recovery remains unobserved in the retained live pilot.
