# Structured independent review v1

Status: source accepted on 2026-10-06; P1/P2 fixed, independent source review approved; full regression passed.
Current acceptance: [fixes and verification](agent-review-stage3-fixes-20261006.md).
Historical rejection: [initial source review](agent-review-stage3-acceptance-20261006.md).
Navigation: [Stage 3 plan](agent-review-stage3-plan.md).
Evidence: current server implementation/tests and the exact historical records
listed in that plan. Both installed API and canonical run muwmmp32-zsowq were
terminal failed before implementation. These are historical observations.

One bounded session slice. Task `reviewProtocol: invocation-mcp-v1` is an
explicit authorization/scope-fingerprint-bound opt-in; omission preserves legacy.
It requires enabled authorization, required gates and enabled independent review.
GIS additionally requires Stage 2 agentTools. WholeChangeAcceptanceV1 keeps its
existing graph, predecessor, ownership and verification contracts.

Reviewer tools are exactly read_evidence and submit_verdict. No executor service,
native validation, finalization, shell, discovery or project writes are exposed.
The host freezes mandatory files and exact JSON context before dispatch. Each
file has an opaque evidence ID, exact path, byte length, SHA-256 and optional
host-owned responseIndex. GIS captures the complete sealed artifact inventory metadata,
both finalizers, host native/verification records, full/patch submission files,
closed tool state and terminal receipts. Mandatory files are frozen readable
sources; large state backups retain exact inventory locators/hashes and remain
under existing native/executable gates and host stage seals. No aggregate claim
is inferred from inventory metadata. Whole-change includes each closed
predecessor, tracked/untracked content and every predecessor GIS invocation.
Absent, malformed, changed or oversized evidence fails before dispatch.

Verdict has exactly protocolVersion, invocationId, snapshotSha256, status, reason,
remarks. Status is approved / changes_requested / unavailable. Each remark has
exactly evidenceId, field, category, message, responseIndex (integer or null).
Categories: correctness, scope, evidence. IDs must exist; indexed targets must
equal that evidence's host-declared index. Duplicate targets reject. Approved
has empty reason and remarks; other statuses require a reason; changes_requested
requires remarks. Bounds: verdict 64 KiB, reason/message 4 KiB, 32 remarks.

Each fresh random invocation persists identity, ordinal, immutable snapshot,
limits and reserved counters. Limits: 64 calls, 4 MiB input, 2 MiB output,
256 sources, 1 MiB per file, 8 MiB per snapshot,
128 MiB hash IO, 200 lines / 32 KiB per excerpt, 15 minutes or reviewer timeout.
Read arguments choose exact line bounds or zero-based inclusive byte bounds;
byte mode preserves complete UTF-8 characters and reports actual byte offsets.
This permits inspecting compact long JSON without shell access. Configured MCP
servers are disabled by exact names from a bounded read-only CLI configuration
probe; an empty table does not override inherited servers. Builtin shell,
unified execution, apps, browser, computer and delegation features are disabled
before the reviewer process starts. Bounded Code Mode orchestration remains
enabled for the exposed MCP calls; it grants no native shell/file/tool service.
The reviewer runs from its invocation-owned directory with user configuration
and rules ignored, so project CLI configuration cannot add tools. The host
still checks the original project workspace for mutations.
Hash reservations include six times source bytes at preflight and conservative
live/frozen source fencing thereafter; exhaustion never replenishes counters.
Submission atomically renames a complete verdict/receipt directory; identical
bytes replay, conflicting bytes reject. Sealing permits only identical replay.
Closure never reconstructs a service or replenishes limits on restart.
Approval requires the current successful CLI terminal contract, explicit sealed
submission, unchanged evidence and closed-state/verdict/terminal hash receipts.
Submission alone and final CLI prose never approve. Existing finite reconnect
recognition is reused; nonzero, timeout, cancel, failed or missing terminal deny.
One exact observed HTTPS-fallback item diagnostic is accepted only after all five
increasing recognized WebSocket 403 diagnostics, before terminal completion.
Repeated, early, post-terminal or other item errors reject. This is the same
finite successful-provider boundary, not an Orchestrator retry or recovery.

GIS corrections consume validated indices through process history, including
replay; prose cannot supply targets under this opt-in. Unindexed findings stop
correction rather than broaden scope. Unselected response bytes stay unchanged.
No automatic transport recovery is added.

Acceptance fixtures: current approval vs all terminal failures; duplicate keys,
foreign identity, changed evidence/receipts, missing finalizer/locator; pending
final review with approved predecessors; source failed with published writer;
calibration selected=5/completed=0/returned=5 stays native-success with limitations;
targets [3,4] preserve [0,1,2]; duplicate/outside targets deny; concurrent identical
submission and lost acknowledgement retain one verdict; closed replay denies
reopening. Missing/zero values are retained verbatim; no new aggregate claims,
grouping, filters or pagination semantics are introduced.

Impact map: production server/structured-review.ts, server/agent-report-tools.ts,
server/index.ts, server/process-stages.ts, server/gis-quality.ts. Tests:
server/structured-review.test.ts and relevant existing server/index.test.ts,
server/process-stages.test.ts, server/gis-quality.test.ts contracts. Documentation:
this file and docs/agent-review-stage3-plan.md. Reusable synthetic CLI gate:
scripts/structured-review-preflight.mjs. No dependency, manifest, checksum,
generated product source, Project Map or existing queue/run evidence edits.
New private verification logs may be retained under
queues/agent-review-stage3-20261006/; they are not a launch queue.
Checks: node --import tsx --test server/structured-review.test.ts;
npm run check; npm run build; npm test; git diff --check. Node 22/Electron
verification is required in addition to the host Node version. The explicit
synthetic CLI gate takes one absolute CLI binary path and writes new private
evidence under queues/agent-review-stage3-20261006/. Installed smoke,
live pilot, deployment and commit/push are outside this slice.

## Historical implementation verification snapshot, 2026-10-06

Final source checks: `npm run check`, `npm run build`, and `git diff --check`
passed. Build retains the existing Vite chunk-size advisory.

Final focused command:
`node --import tsx --test --test-name-pattern "Stage 3|structured review|GIS handoff|review provider|review MCP|structured GIS" server/structured-review.test.ts server/index.test.ts`
passed 12/12 on Node 24.18.1. The same command executed through Electron's
Node 22.16.0 with `ELECTRON_RUN_AS_NODE=1` passed 12/12. Logs:

- `queues/agent-review-stage3-20261006/accepted-source-focused.log`
- `queues/agent-review-stage3-20261006/electron-final.stdout.log`
- `queues/agent-review-stage3-20261006/electron-final.stderr.log`

The final explicit synthetic CLI gate passed using the exact binary
`C:/Users/a.lozovoy/AppData/Local/OpenAI/Codex/bin/23f7d7f110b19ac3/codex.exe`.
It asserted four completed calls (line read, byte read, submit, identical replay),
terminal success, closed-state replay and rejected reopening. Exact evidence:
`queues/agent-review-stage3-20261006/cli-d686e75dc97882e7/evidence.json`.
This proves the synthetic CLI/transport contract, not semantic source review,
installed application operation or a native GIS live pilot.

The broad `npm test` run, before the final CLI-boundary/terminal refinements,
finished with main 656 passed / 1 failed / 1 opt-in live skipped; both isolated
gates passed 1/1. Its exact log is
`queues/agent-review-stage3-20261006/full-regression.log`.
The sole failure was the existing accepted Context Budget baseline:

| Unmodified source | Workspace bytes | Accepted maximum |
| --- | ---: | ---: |
| AGENTS.md | 12999 | 12177 |
| docs/NEXT_STEPS.md | 21745 | 21144 |
| docs/context_packs/current_status.md | 22615 | 22512 |

Git showed no change to these three files or
`docs/context-budget-baseline-v1.json`. The final focused checks do not replace
this failed machine gate. The full gate was not rerun after final refinements
because its unchanged out-of-scope baseline requires a separately authorized
repair/owner decision. No envelope or expectation was weakened.

Independent whole-change source acceptance remains **not performed**. It must
follow resolution of the baseline failure and a fresh full regression on the
final accepted source. No deployment, installed smoke, live pilot, commit or
push was performed. Operational acceptance belongs to the separately authorized
subsequent boundary.
