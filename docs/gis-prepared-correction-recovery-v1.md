# Prepared GIS correction recovery v1

Status: source implementation verified; no installed acceptance or launch authority.
Role: bounded explicit manual recovery contract. Navigation:
[continuation preparation](gis-continuation-preparation-20261007.md).

The existing verified `changes_requested` recovery remains unchanged. This
extension accepts a prepared source only through enabled, approved apply
authorization and `RecoveryTaskBindingV1.preparedCorrection`:

```yaml
preparedCorrection:
  contractType: PreparedCorrectionRecoveryV1
  contractVersion: "1.0"
  diagnosticCoverage: retained-events-manual-v1
  sourceSha256: <canonical run SHA-256>
  invocationId: <failed correction invocation ID>
  terminalSha256: <terminal-evidence.json SHA-256>
  toolsStateSha256: <tools-state.json SHA-256>
```

The approved apply contract must bind the identical `preparedCorrection` object.
Task authorization and persisted replay also bind its source run/task IDs and
all hashes. Unknown fields or changed identities fail closed.

Admission requires a terminal failed source with prepared `result-defect` progress,
one or two archived rejected analyses, exact source reservation counts and no
publication. The last archive must correspond to the last correction reservation
and its preceding independent `changes_requested` verdict. Structured verdicts
and exact response targets replay through their closed receipts. Prior successful
executor report receipts replay; the failed invocation must be the final correction
invocation and have no accepted report receipt.

Retained failed provider evidence must be closed MCP state with zero validations and a
nonzero terminal exit 1, no timeout/cancellation, no completion, exactly one failed
turn, no malformed/after-terminal events and a complete hash-bound set of retained
top-level diagnostics.
Only exact current-adapter HTTP 403 diagnostics for the Codex responses endpoint
(WebSocket and its HTTPS fallback) qualify. Mixed retained diagnostics, missing evidence,
submission/native validation, unknown exits and ambiguous histories remain blocked.
Historical terminal receipts do not preserve all item events or unknown stderr.
They cannot prove the absence of additional failures across the whole provider
stream. The mandatory approval-bound `diagnosticCoverage` value explicitly opts
into manual recovery with this limitation; it is not a pure-transport classification
or evidence for automatic retry. The failed result is never accepted or published.
The new result must pass fresh native validation, declared machine gates and
independent review. Stage 4 automatic reviewer recovery is unchanged.
This is an explicitly authorized new recovery result, never an automatic executor
retry and never Stage 4 reviewer-only transport recovery.

The new task requires at least one resolved required machine verification command,
independent review, zero task retries
and exact stage limits `verification: 1`, `review: 1`, `publication: 1`,
`correction: 0`. The host regenerates fresh prepared bundles against unchanged
source inputs/scopes and patches only rejected response indices. Untargeted response
bytes remain unchanged. Native validation and publication follow existing gates;
no failed native command is automatically retried.

Before project lock acquisition, the host conservatively creates an exclusive
source-owned reservation naming the target run/task and pinned failed invocation.
Its locator is `.orchestrator/runs/<sourceRunId>/<sourceTaskId>-prepared-correction-recovery.json`.
The target's canonical task stores identical reservation evidence. Replay requires
both that persisted evidence and the existing claim; an absent claim is never
recreated. The same owner may replay the reservation; another owner cannot reuse it. A crash
or failed launch never refunds that right. Incomplete replacement analysis remains
subject to the existing fail-closed restart rule. Source canonical progress,
reservations and archives remain immutable. The successful replacement's
`analysis-patch` history records the source attempt counts separately from its
single new result; totals must never be represented as a source budget reset.

Canonical source bytes, terminal and MCP state, archived response files, authority,
loaded implementations and existing runtime evidence are fenced across asynchronous
boundaries. Changing any of them blocks provider authority or publication.

Verification evidence is retained under `queues/gis-prepared-correction-fix-20261007/`.
Unit tests use synthetic evidence; production lifecycle integration uses a fake
CLI and portable synthetic native tools. Neither proves a live provider recovery.
Deployment, installed smoke and a genuine isolated GIS pilot are separate gates
before authoring or launching the unfinished writer continuation.
