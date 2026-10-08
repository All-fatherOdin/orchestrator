# Report MCP submission mode fencing

Status: implemented and [source-accepted](report-mcp-mode-fencing-acceptance-20261008.md),
2026-10-08; originally proposed before implementation. Role: bounded source fix;
navigation: [NEXT_STEPS](NEXT_STEPS.md). Evidence: failed continuation
`muzb2aub-0eu7t`, task `muzb2auc-02uh5`, correction invocation
`6bc13d80d8b72b058461f04fa86f2140` and current report MCP implementation.

The correction invocation was bound to patch mode. Its saved CLI completion
reports `submit_report` rejected after successful validation. Both submission
methods were advertised before this fix with identical descriptions despite the
mode-specific prompt. The server rejected wrong mode with an AssertionError,
whose formatted message became generic `TOOL_REJECTED` at the HTTP boundary.
The saved completion supports the wrong-method diagnosis; a raw call transcript
was not retained, so the model's internal cause is not established.

Expose read_evidence, validate_report and exactly one submission method derived
from the host-bound invocation identity: submit_report for full, patch_report
for patch. Fail closed if report mode is absent. Preserve explicit independent
review protocol definitions. Retain service-side wrong-mode enforcement against
direct calls and return the exact safe WRONG_REPORT_MODE code. Persist only its
bounded requested/expected method diagnostic in the closed tool state.

Scope: server/agent-report-tools.ts, its tests, this document, source acceptance,
the report-tools contract clarification and NEXT_STEPS.
Test actual authenticated MCP discovery/config, wrong-method rejection without
submission or extra native validation, validation then correct submission and
replay for both modes. Existing review MCP tests must remain passing. Run focused
report/review suites, check/build, context smoke, explicit-PYTHON Context Budget
and full regression. Source/fixture acceptance does not install or resume a run.
Existing queues, canonical records, reservations and Project Map remain unchanged.
