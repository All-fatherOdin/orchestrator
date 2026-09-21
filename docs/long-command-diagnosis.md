# Long-command timeout diagnosis

Date: 2026-09-21. Scope: q1000-045 and the Orchestrator/Codex process boundary.

## Findings

The historical Orchestrator task did not hit its task timeout. Its canonical
record is `%APPDATA%/Orchestrator/.orchestrator/runs/mu6nbx3t-f3rul/run.json`,
task `mu6nbx3t-a5iqf` (`q1000-045`). The inspected record's SHA-256 is
`34e72332ee49eded0970b0f1a6601ce6f5adccf97fa3cbe8e59e7ebc169bb1df`.

- Configured task timeout: 60 minutes.
- Task started at `2026-09-18T07:44:05.95Z`, finished at
  `2026-09-18T07:46:54.653Z` (about 169 seconds).
- Provider process: `exitCode: 0`, `timedOut: false`.
- Executor outcome: `STOPPED`; therefore the task correctly failed.
- The detector command has a start log with `exit null`, but no retained
  terminal command receipt. The executor reported a 30-second interruption.

The queue wrapper `queues/quality-next-1000-2026-09-17/run-duplicate.mjs`
waits for its child to close and only then writes `<output>.process.json`.
Its 30-second interval prints a heartbeat; it does not extend a parent tool's
deadline. Killing the wrapper's process tree before child completion explains
why empty stdout/stderr files can exist without a process receipt.

A later supplied detector receipt in the GIS q1000-045 artifact directory,
`supplied-duplicate.json.process.json`, records successful execution from
`07:58:18.779Z` to `07:59:41.132Z`: 82.353 seconds, exit 0, artifact present.
That is recovery evidence, not proof that the original invocation succeeded.

**Historical limit:** Orchestrator discarded nested command output and status
details. The exact original tool arguments and timeout cannot be recovered
from this run.json. A nested tool timeout is consistent with the evidence;
the precise original 30-second setting remains unproven. No universal Codex
default timeout is inferred.

## Controlled reproduction

Installed `codex-cli 0.146.0`, Windows, no model invocation or new agent thread:
start `codex app-server`, perform `initialize` / `initialized`, and call
`command/exec` with a read-only sandbox and the following command array:

```js
[absoluteNodeExecutable, "-e",
 "setTimeout(()=>console.log('LONG_COMMAND_COMPLETED'),35000)"]
```

| Explicit `timeoutMs` | Observed duration | Result |
| --- | --- | --- |
| 30000 | 30240 ms | `exec failed: sandbox error: command timed out` |
| 45000 | 35269 ms | exit 0, `LONG_COMMAND_COMPLETED` |

The local response artifact is `build/long-command-app-server-diagnosis.json`.
This demonstrates the independent command deadline in the installed Codex
runtime, not an exact replay of the historical agent's shell tool invocation.
The [official command/exec documentation](https://learn.chatgpt.com/docs/app-server#command-execution)
describes the per-command timeout independently of thread execution.

The production Orchestrator verification runner also completed a real 35-second
silent process and persisted its terminal result with `timedOut: false`.
A separate short runner deadline produced nonzero, `timedOut: true` evidence.
No fixed 30-second runner cutoff was reproduced.

## Product change and boundaries

`commandEventDiagnostic` now retains command identity, running versus terminal
state, numeric exit code when supplied, and bounded command output in existing
task logs. Both ends of long output survive within the existing 1,600-character
executor log limit. `exit null` is no longer rendered as a terminal result.
These are provider diagnostics, not Orchestrator verification receipts.
The [official JSONL interface](https://learn.chatgpt.com/docs/non-interactive-mode)
distinguishes item start and completion events.

Regression fixtures confirm that an inner command timeout followed by provider
exit 0 and executor STOPPED remains a failed task with no Orchestrator timeout;
the timeout diagnostic now survives in canonical run.json.

Run the regression checks:

```powershell
node --import tsx --test server/command-event.test.ts server/long-command.test.ts
```

The process-wait implementation and configured task limits are unchanged.
Future long agent-owned commands need an explicit adequate tool timeout or a
supported session handle polled to terminal completion. Heartbeats and a larger
Orchestrator task timeout cannot override an inner tool deadline. Missing
terminal evidence must not trigger an automatic duplicate launch.
The GIS detector, local queue files, and historical receipts were not modified
or rerun as part of this diagnosis.
