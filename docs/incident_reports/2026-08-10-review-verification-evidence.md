# Incident report: missing verification evidence for read-only review tasks

Date: 2026-08-10
Component: Orchestrator task runner and reviewer hand-off
Affected pipeline: `ai-stock-analyst-documentation-governance-priorities`

## Executive summary

The Priority 1 pipeline repeatedly failed at its read-only task
`review-priority-1-integration`. The implementation tasks and their checks had
passed, but the independent reviewer received `EVIDENCE: MISSING` for every
verification command and therefore returned `CHANGES_REQUESTED`.

This was an Orchestrator defect, not a failure of the ai-stock-analyst
implementation or its test suite.

## Observable symptoms

- Run `msmwd7ky-bts8v` failed at `review-priority-1-integration`.
- The two preceding tasks completed and their independent reviewers approved
  them.
- The failing review task's executor completed a static review with no
  High-or-higher implementation findings.
- Its reviewer reported, verbatim in substance, that evidence was missing for
  both focused pytest commands, the targeted documentation check, and
  `git diff --check`.
- The task was read-only (`allowedPaths: []`), so correction was correctly
  skipped and the dependent acceptance task was blocked.

The subsequent run `msmwuuhh-ntj6a` reproduced the same issue while proving
that the first two tasks had valid evidence: 33 focused tests passed for the
governance task; 33 and 25 focused tests passed for the audit task.

## Root cause

The runner persisted verification commands for an authorized task with
`authorization.intent: review`, but `orchestratorVerificationCommands()` only
returned commands when the intent was `apply`:

```ts
return evidence.enabled &&
  evidence.decision === "authorized" &&
  evidence.intent === "apply"
  ? [...evidence.verificationCommands]
  : [];
```

Therefore `runTaskVerification()` ran an empty command list and saved an empty
`task.verificationEvidence` array. `buildReviewerPrompt()` still took the
review task's declared commands from its authorization evidence and rendered
every one as `EVIDENCE: MISSING`. The reviewer was correct to reject the task
under the supplied evidence contract.

This is a mismatch between two Orchestrator paths:

1. execution path: verification commands were restricted to `apply`;
2. reviewer-prompt path: verification evidence was required for `review` too.

## Fix

In `server/index.ts`, change `orchestratorVerificationCommands()` so an
authorized `review` task also returns its explicitly declared verification
commands:

```ts
return evidence.enabled &&
  evidence.decision === "authorized" &&
  (evidence.intent === "apply" || evidence.intent === "review")
  ? [...evidence.verificationCommands]
  : [];
```

Add a regression test in `server/index.test.ts` that creates an authorized
read-only review task and asserts that its declared command is returned.

The TypeScript check passed after this change. A production bundle was built
with `npm.cmd run desktop:bundle` and copied to
`C:\Alex\programs\Orchestrator\resources\server.cjs`; source and deployed
bundle SHA-256 were both
`71F4F1C02222B25F16CA1934338BBE9026A51FF5AE61F804DEA278C4519DB6A9`.

## Deployment note

The API on port 4318 was served by the installed `Orchestrator.exe` and its
existing `resources/server.cjs`, not by the editable `server/index.ts` source.
The first post-fix run still used the old in-memory server, so it reproduced
the defect. Restart the Orchestrator application after updating the bundle,
then start a new pipeline run; a failed run is terminal and cannot resume.

## Non-root-cause observations

- An attempted focused npm test invocation timed out in the test-runner
  infrastructure. `npm.cmd run check` completed successfully. This timeout did
  not cause the queue failure and is not evidence against the fix.
- Earlier queue-definition failures (missing apply contract, unsafe Git
  revision syntax, and Git safe-directory handling) were corrected before the
  two runs described above. They are separate configuration issues, not the
  cause of the reviewer-evidence defect.

## Suggested acceptance checks for the next run

1. Start Orchestrator fresh and launch a new pipeline.
2. Let `review-priority-1-integration` reach the verification stage.
3. Inspect its run record: `verificationEvidence` must contain exactly its
   four declared command records, each with `exitCode: 0` and `timedOut: false`.
4. Confirm the independent reviewer receives command output rather than
   `EVIDENCE: MISSING` and does not issue a verification-only rejection.
5. Continue only if the normal review and acceptance gates approve; do not
   treat this runner repair as authority for Priority 2, `.work`, runtime, or
   external actions.
