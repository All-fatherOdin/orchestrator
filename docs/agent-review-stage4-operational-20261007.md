# Stage 4 operational verification — 2026-10-07

Status: deployment and canonical installed smoke passed; live pilot canonical
acceptance failed. This report does not grant operational acceptance of the
complete Stage 4 lifecycle. Role: dated installed-application evidence and
follow-up diagnosis, separate from [source acceptance](agent-review-stage4-acceptance-20261006.md).
Navigation: [Next steps](NEXT_STEPS.md), [Stage 4 contract](agent-review-stage4-contract-v1.md).

## Deployment and installed smoke

Before deployment, 99 existing canonical run records were readable; none had
an active run status. No Orchestrator process or responding server occupied port
4318. The operator did not edit original queues/source evidence or cancel any
pre-existing run; preparation attempts below were newly created owned pilots.

`npm.cmd run desktop:dist` succeeded from commit
`b2327b590412c348d803c14c359852a8d09ae24b`. The NSIS installer completed with
exit 0. Installed backend, application archive and all build UI assets matched
their bound build hashes. Backend SHA256:
`2b2be7490571e5053de4515b2154b6996e2bf7c83932504826b2f3bb68a145a7`.
The restarted version 0.1.8 reported `owned-desktop`, port 4318 and the original
user data directory. Desktop PID 16796 and owned server PID 15328 remained alive.
This proves binary/runtime identity, not an interactive browser flow.

Explicitly launched installed read-only smoke `muxrx2tb-jixfg` passed: two
completed tasks, one executor each, successful required verification, no
workspace changes. Independent review was disabled for this smoke; its
`approved` task display must not be described as an independent reviewer verdict.
The canonical `run.json` receipt passed the read-only receipt assertion.

All private locators below are relative to the repository root:

- `queues/agent-review-stage4-deployment-20261007/predeployment-runs.json`
- `queues/agent-review-stage4-deployment-20261007/build-exit.json`
- `queues/agent-review-stage4-deployment-20261007/install-exit.json`
- `queues/agent-review-stage4-deployment-20261007/restarted-runtime.json`
- `queues/agent-review-stage4-deployment-20261007/deployment-binding.json`
- `queues/agent-review-stage4-deployment-20261007/smoke-location.json`
- `queues/agent-review-stage4-deployment-20261007/smoke-acceptance.json`
- `queues/agent-review-stage4-deployment-20261007/smoke-acceptance.log`

## Live pilot and blocking canonical disagreement

Real Codex provider, model route `sol`, was used with authorized read-only
tasks, `invocation-mcp-v1`, `once-v1`, required gates and a per-task budget of
one executor plus at most two reviewers. No transport failure was injected;
no native GIS publication or original GIS data mutation was requested.

Pilot `muxt6dl2-y3j1z` has two completed/approved tasks in the active endpoint
observation, each with one executor, three passing gates and one reviewer.
Both actual reviewer terminal files have exit 0 and approved sealed verdicts.
No qualifying nonzero WebSocket 403 occurred: real automatic transport retry
remains unobserved; source fixtures do not replace that live evidence.

However, its canonical `run.json` is **failed**. The second task is recorded as
failed/review pending/recovery prepared, with the message that Orchestrator ended
before Codex returned. Its actual immutable review files are closed/approved.
The same owned desktop/server instance is still alive. The canonical receipt
assertion failed and was not replaced with the passing in-memory observation.
No canonical file was repaired manually, and no consumed invocation was reopened.

The observation is consistent with a live-owner reconciliation/stale-read race:
`GET /api/runs/:id` calls `loadRun`, which reconciles persisted ownership and
may recover/persist its loaded record. The operator polled that archive route
while work was active. The exact cause needs a separate bounded source diagnosis;
it is not proven merely by reading that code. Further pilots stopped at this
out-of-scope runtime defect rather than modifying the installed backend or
weakening canonical acceptance.

- `queues/agent-review-stage4-deployment-20261007/pilot-spec-location.json`
- `queues/agent-review-stage4-deployment-20261007/pilot-spec-active-observation.json`
- `queues/agent-review-stage4-deployment-20261007/canonical-disagreement.json`
- `queues/agent-review-stage4-deployment-20261007/pilot-spec-acceptance.json`
- `queues/agent-review-stage4-deployment-20261007/pilot-spec-acceptance.log`

## Preparation attempts and retained constraints

Earlier canonical pilots are retained, not relabelled as passed:

| Run | Observed result |
|---|---|
| `muxryrf7-5m687` | Source reviewer requested readable executable assertion evidence; no automatic retry on semantic rejection. |
| `muxs6ty9-a86wb` | Executor STOPPED after a lossy Unicode source display. |
| `muxsaxds-ajrkg` | Operator cancelled its own pilot after finding an inherited prior-project binding. |
| `muxsdn5w-1lf2l` | Full inline content gate timed out under Windows PowerShell JSON serialization. |
| `muxssxfy-9gd3c` | Reader failed because Get-FileHash was unavailable in the installed verification environment. |
| `muxsx3vy-pzag9` | First task approved; second executor stopped on ambiguous accumulated gate-order wording. |

The complete corrected evidence preserves the original installed/source hash,
exit-record and exact aggregate assertions. Explicit UTF-8 reads, exact fresh
project bindings, process-only PowerShell flags and full evidence readers remain
mandatory. Native UTF-8 ReadAllText avoids serializing Get-Content PSDrive/provider
metadata; built-in .NET SHA256 avoids the unavailable optional hash cmdlet.
No interpreter/global Git configuration was changed.

Reusable read-only checks are delivered in
`scripts/verify-installed-stage4.mjs` and `scripts/read-installed-stage4-evidence.ps1`.
Positive installed/source/smoke gates ran successfully; deliberate mismatched
asset and failed-canonical inputs were rejected. Negative check evidence:
`queues/agent-review-stage4-deployment-20261007/verifier-negative-tests.json`.
The runtime sources and the original source-test evidence remained unchanged;
no full source regression or browser acceptance was claimed for these operational helpers.

At this operational report's initial recording, the next boundary was a source
fix with a reproducing test, then a separate redeploy and canonical smoke/pilot.
The existing failed canonical record and immutable review files must remain evidence.

Source follow-up: the [canonical history race fix](agent-review-stage4-canonical-fix-20261007.md)
reproduces the stale-read overwrite and implements a serialized read/recovery
transaction. Full source regression and fixture verification passed, with the
recorded Context Budget qualification. Redeployment/canonical live acceptance
remain separate; the installed pilot failure above was not repaired.
