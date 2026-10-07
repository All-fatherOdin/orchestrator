# Stage 4 — bounded reviewer transport recovery v1

Status: implemented in commit `dfafa19`; source/fixture acceptance independently
reviewed on 2026-10-07. The historical pre-commit Context Budget failure and
passing check on the clean implementation commit are recorded separately.
Role: implemented task contract. Source acceptance is recorded separately;
this document is not installed runtime evidence.
Navigation: [Stage 3 plan](agent-review-stage3-plan.md), [Next steps](NEXT_STEPS.md).
[Source verification record](agent-review-stage4-acceptance-20261006.md).

## Contract

Task opt-in `reviewTransportRecovery: once-v1` requires authorized
`invocation-mcp-v1`, independent review and required verification gates. Apply
approval, authorization scope and persisted replay bind the exact policy.
Absent opt-in preserves legacy behavior. No API, UI or provider-global setting.

```yaml
reviewProtocol: invocation-mcp-v1
reviewTransportRecovery: once-v1
```

For apply tasks the matching approvedApplyContracts entry must contain both
fields with exactly the same values. Existing authorization and required
verification commands remain mandatory.

Exactly one extra reviewer invocation is allowed for one unchanged verified
result. Only the adapter's finite WebSocket HTTP 403 diagnostics followed by a
nonzero terminal process qualify. Unknown/mixed errors, malformed or oversized
output, timeout, cancel, missing submission after successful terminal, semantic
unavailable, sandbox writes, stale evidence and exhausted tool budgets do not.
Submission followed by a failed process never approves.

The source MCP closes before recovery. A new invocation uses new identity and
MCP but exactly the same frozen evidence IDs, order, paths, roots and hashes.
Host rechecks live originals, authorization, verification and predecessor
handoff before recovery and before spawn. Executor, verification and native
effects are retained. Existing invocation budgets and prompt/model lineage
charge both attempts; no refund, delay or retry loop.

Host-owned immutable transition files bind each verified result and invocation.
A persisted started marker precedes retry preparation and spawn; an ambiguous crash consumes the
attempt. Restart may use only a reserved retry without a started marker. Closed
approval is replayed rather than rerun. Resume cannot renew the right for the
same result. A newly verified correction has a distinct result binding.

## Impact and acceptance

Production: server/index.ts, server/structured-review.ts and
server/process-stages.ts (host-proven continuation of an already counted review
stage). Tests:
server/index.test.ts, server/structured-review.test.ts and
server/gis-quality.integration.test.ts. Documentation: this contract,
docs/agent-review-stage4-acceptance-20261006.md, docs/agent-review-stage3-plan.md
and docs/NEXT_STEPS.md. No dependency, generated source, manifest or Project Map
change. Private logs: queues/agent-review-stage4-20261006/.
Verification utility: scripts/verify-source-snapshot.mjs compares the complete
tracked/untracked source inventory and bytes with a separate clean checkout.
Its negative fixtures are in scripts/verify-source-snapshot.test.mjs.
During the original pre-commit verification, Context Budget rejected dirty
measured navigation sources. That historical failure remains in the acceptance
record; the identical clean snapshot pass did not change it. After implementation
commit `dfafa19`, a fresh check on the clean source worktree passed with warnings.
Documentation edits after that check do not inherit its clean-worktree evidence.

Fixtures must assert: failure then approval (1 executor, 1 verification,
2 reviewer processes, 1 publication); two transport failures (2 reviewers,
0 publication); submitted-but-failed approval rejection; forbidden failure
categories (no repeat); changed artifacts/authorization/verification/predecessors
(no repeat); budget denial without refund; crashes before/after reservation,
before/after spawn and after closed receipt; tampered binding/identity/state
rejection; legacy and structured GIS correction compatibility.
Grouping/filtering/pagination cases are inapplicable: this stage adds no product
aggregation or record-selection semantics.

Gates: focused Node suites, npm.cmd run check, npm.cmd run build, existing
context smoke, npm.cmd run context-budget:report with explicit PYTHON_BIN,
Electron/Node 22 focused suites, full npm.cmd test (allow at least 60 minutes),
git diff --check, untracked whitespace and documentation links. Independent
read-only source review consumes exact captured verification evidence.
Deployment, installed smoke, live pilot and operational acceptance are outside
this slice.
