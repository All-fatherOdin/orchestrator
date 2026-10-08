# Report MCP mode fencing: source acceptance

Status: source/fixture accepted, 2026-10-08. Role: exact verification evidence;
navigation: [NEXT_STEPS](NEXT_STEPS.md), [fix contract](report-mcp-mode-fencing-fix-v1.md).
Deployment, installed smoke and live queue recovery were not performed in this
bounded source task. Existing queue and canonical receipts remain unchanged.

## Accepted behavior and scope

Report MCP discovery and CLI enabled-tools expose `read_evidence`,
`validate_report` and exactly one sealer from the host invocation identity:
`submit_report` for full, `patch_report` for patch. Report startup without a
bound mode fails before listener allocation. The explicit independent-review
protocol retains its two tools; its shared-reader API remains compatible.

Direct wrong-method requests remain rejected before validation/submission and
return the exact safe `WRONG_REPORT_MODE` code. Only bounded requested/expected
method names and that code are saved as `lastProtocolError` in closed tool state.
Rejected calls consume existing call/input budgets; successful candidate cache,
native budgets, terminal fencing, authorization and publication remain unchanged.
No automatic invocation retry, status change or recovery authority was added.

Accepted runtime/test bytes:

| File | SHA-256 |
| --- | --- |
| `server/agent-report-tools.ts` | `f222d5f8ca2b599840cd7a6a70e21bb737a4a565bcbe509ec9eec7aa9bd6cf42` |
| `server/agent-report-tools.test.ts` | `3109d7d16a4c9d060daa9cac95e0ec038a56eb5796d4d407a2c2c003ccf0ecf1` |

Final documentation also includes the fix proposal/lifecycle, this acceptance,
the report-tools contract clarification and navigation. It does not change the
accepted runtime/test bytes. Project Map was not updated.

## Verification

Evidence root: `queues/report-mcp-mode-fix-20261008/`. Operator inventory
`source-verification.json` pins four pre-acceptance frozen files and 21 evidence
files; it is not a canonical task receipt.

- `npx.cmd tsx --test server/agent-report-tools.test.ts server/structured-review.test.ts`:
  28/28 pass in `focused-final.log`. Actual authenticated HTTP tests cover both
  modes, discovery/config, wrong-method rejection without submission or extra
  native validation, correct cached submission/replay and closed diagnostics.
- `npm.cmd run check` and `npm.cmd run build`: exit 0, final logs.
- Explicit `PYTHON_BIN` Python 3.13 context smoke: three cases passed.
- Exact clean snapshot: 393 files, HEAD
  `298b0e3235375a558687968eeb6b5db77708ff17`, inventory
  `2bda8c99aeaa01bb9a0eec662b24c30d70021c3143e1cee9e7b33c3b5a5d6ae2`.
  ContextBudget in that snapshot: `pass-with-warnings`, exit 0; dependencies
  came from an explicitly recorded ignored `node_modules` junction.
- ESM focused tests under Electron 35.7.5 / Node 22.16.0 with
  `ELECTRON_RUN_AS_NODE=1`: 3/3 pass.
- Complete `npm.cmd test`, 09:56:21–12:09:01 UTC: exit 0. Main suite:
  689 tests, 688 passed, zero failed, one optional live skip. Both isolated gates
  passed 1/1. Full log SHA-256:
  `487af0f2c4977332480278b3b8d7673a622579ef5eb885cf0b80ac3d1d87497a`.

Independent read-only review verified all frozen/evidence hashes, source
behavior, exact complete regression and qualified boundaries; no actionable
findings remained. This proves source and fixtures, not live model obedience.

## Preserved qualifications

Initial check/build and focused tests failed on shared-reader API compatibility
before the final revision; their logs remain separate. The compatibility fix
preceded the frozen successful full regression. Initial snapshot ContextBudget
failed because dependencies were absent; the failure was retained and only
the ignored dependency runtime was provisioned before the passing check.
No failing full gate was replaced with a narrower rerun.

The incident binding retains exact canonical/CLI/terminal/tool-state hashes for
`muzb2aub-0eu7t/muzb2auc-02uh5`. Saved CLI output identifies a `submit_report`
rejection in patch mode; the raw call transcript was not retained. The new HTTP
fixtures reproduce and prevent that method ambiguity, without claiming to know
the model's internal cause or granting resume rights to the failed run.
