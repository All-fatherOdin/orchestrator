# Invocation-local GIS report tools v1

On Windows, Electron's embedded Node 22 can report different device IDs for
`lstat` and an open file handle. Evidence identity is therefore compared between
two open handles using bigint metadata. Content hashes and reparse-point checks
remain required; a replaced file must not be returned as trusted evidence.

Stage 2 is one bounded source slice. Stages 3 (structured independent review)
and 4 (recovery and operational acceptance) are separate work.

## Integration contract (fixed before implementation)

`GISPackageV1.agentTools: invocation-mcp-v1` requires
`analysisTransport: structured-output-v1`. The closed configuration is bound by
existing apply approval, task authorization and process replay. Omission keeps
legacy full/patch and Stage 1 structured delivery unchanged.

The host runs an invocation-local Streamable HTTP MCP server on IPv4 loopback,
with a random port and bearer credential supplied only through the CLI child
environment. The child environment also receives both `NO_PROXY` and
`no_proxy`: the exact existing values from both forms are retained in a combined
list, then missing `127.0.0.1` and `localhost` entries are appended. Comparisons
ignore entry whitespace and case; exclusions with ports remain distinct. Both
forms receive the same value, and the parent process environment is unchanged.
Per-process `-c mcp_servers.orchestrator_report={...}` supplies
`url`, `bearer_token_env_var`, `required`, startup/tool timeouts, an exact tool
allow-list and `default_tools_approval_mode=auto`. No global config is edited.
The server uses JSON responses, no SSE, sessions, reconnect authority or worker
process. Host close/cancellation/lifetime expiry revokes access and aborts native
validation. Restart never reopens an invocation or replenishes its counters.
CLI final text cannot overwrite submitted bytes: its last-message path is
separate. A fresh terminal-success check is still required before consumption.

Only trusted host code supplies evidence IDs, exact absolute file paths, read
roots and SHA-256 digests. GIS exposes prepared bundles, required
performance baselines and `report-schema` from the exact manifest-pinned
`<runtime>/schemas/profile-analysis-response.schema.json`. Missing schema pin
fails closed before agent invocation; source context is the bounded/redacted context carried
by those bundles. It does not expose arbitrary raw audit-repository files.
Evidence bytes are limited to 1 MiB per source; paths, ancestors, links,
junctions and resolved identities are checked before and after handle reads.
On Windows an additional bounded, read-only Windows PowerShell attribute check
rejects every `ReparsePoint` tag on the exact host paths and their ancestors,
including tags that Node does not classify as symlinks. Paths enter that fixed
command only through a JSON environment value; they never become shell code.
The system utility has a five-second timeout and a 1 KiB output bound.

`read_evidence({evidenceId,startLine,endLine})` returns inclusive one-based
source lines, source SHA-256, exact returned boundaries and truncation flags.
At most 200 complete lines / 32 KiB are returned. No partial line is labelled
a complete line; an oversize first line returns an empty truncated fragment.
IDs never act as paths. No shell, discovery, execution or scope arguments exist.

`validate_report({payloadJson})` checks the complete substantive full/patch
candidate without submission. Host construction and exact unit rule eligibility
are shared with final delivery. The existing pinned native
`validate-profile-analysis.mjs` supplies substantive validation. Only candidate
response and validation output files in invocation-owned scratch are written;
no producer/finalizer/canonical mutation is available. Errors carry response
index, primaryFile (null for package-wide errors), field and code. Native
diagnostics include `diagnostic` (at most 1024 UTF-8 bytes) and
`diagnosticSha256` of the complete native reason. Connection secrets are redacted
from returned diagnostics. Different reasons at the same field have different
fingerprints, including differences beyond the displayed prefix. Diagnostics
that lack a field use `$`; the host never invents field precision.
No contents, conclusions, IDs, findings or limitations are automatically fixed.

`submit_report({payloadJson})` is full-only; `patch_report({payloadJson})` is
patch-only. Patches cover exactly trusted targets without duplicates. Untargeted
response strings are retained byte-for-byte. The host wraps substantive JSON
in Stage 1's envelope and uses Stage 1's codec and receipt builder. One directory
rename publishes the complete raw/schema/receipt set. Identical payload bytes
replay the same receipt; different payload bytes conflict. Submission seals the
result. Only identical submission replay remains permitted after sealing.
Before-rename interruption has no submitted result; after-rename acknowledgement
loss retains a replayable result, never a successful process inference.

All operations serialize, recheck current authority/inputs/identity, and persist
reservations before work. Limits per invocation: 64 tool calls, 4 MiB cumulative
argument bytes, 2 MiB cumulative returned bytes, 2 MiB delivered evidence-fragment text (UTF-8),
two full native candidate validations, 60 seconds total native validation time,
128 MiB of host evidence hash reads (fences and the fragment-source
handle read, separately counted from delivered text), and lifetime no greater than the task timeout or 15 minutes. Each input is at
most 1 MiB plus fixed JSON overhead. A successful validation can be reused only
for identical payload bytes under a fresh authority fence. Submission validates
if there is no identical successful candidate. Exhaustion and the second same
validation-error fingerprint stop access; there is no hidden retry or provider
budget reset. These fixed allowances are authorization-bound by the opt-in and
persisted invocation limits, inside the existing provider attempt/time budget.
Mandatory post-delivery native gates keep their existing cumulative stage budgets.

## Acceptance cases defined before tests

* Three-line UTF-8 fixture: request lines 2..3 returns exactly their bytes,
  boundaries 2..3 and the full-file digest. A 201-line request truncates to 200.
  Unknown ID, traversal-shaped ID, junction and changed bytes reject, no write.
* Full with one valid response succeeds; wrong response count/technical field
  rejects. Patch targets [1] require exactly index 1; duplicate/missing/extra
  indices reject. Response 0 retains its original whitespace and bytes.
* A finding using a sibling unit's permitted rule fails at the exact finding
  ruleId field. Native rejected output maps its supplied field/index; scratch
  is the only mutation, and project/native producer call counts remain zero.
* Identical concurrent submits yield one rename and identical receipts;
  conflicting bytes reject. Interrupt before/after rename and replay a JSON
  restart without another analysis/native call; corrupt receipts fail closed.
* Cancelled/stale/foreign authority or changed inputs deny tools and delivery.
  Sealed reads/validation deny; identical submit is the sole seal exception.
  Call/byte/read/time/candidate limits and repeated errors never replenish.
* Exit nonzero, timeout/cancellation or absent terminal success after submission
  cannot reach verification/review/publication. Existing Stage 1 and legacy
  lifecycle tests remain required, including restart and preserved siblings.

Grouping/filtering/aggregation cases are inapplicable: this protocol coordinates
exact file excerpts and report delivery, not record groups or totals.

Synthetic CLI evidence is not installed live smoke. Installation, desktop
restart, canonical installed read-only smoke and a separately authorized pilot
remain necessary for operational acceptance.

The CLI completion schema in this opt-in has exactly `outcome,reason` and
requires `completed` with empty reason. The substantive payload is never
repeated in that completion file. A stopped/invalid completion rejects delivery
even when a sealed tool submission exists. Successful task records bind the
closed tool-state bytes by SHA-256 alongside their exact invocation identities.
Replay checks those bytes and the Stage 1 receipt before consuming retained
analysis. Active services are never reconstructed from persisted state.

Connection values exist only in host memory and the CLI child environment.
The host rejects their literal or JSON-escaped occurrence in substantive
candidates before native scratch writes, and redacts them from provider
diagnostics. They are not persisted in prompts, reports or tool-state receipts.
HTTP ingress additionally allows at most 128 requests per service, at most
1 MiB + 8 KiB per body, 10-second headers and 65-second request timeout;
unsupported methods/paths, browser origins and missing/wrong bearer tokens
do not reach tool operations.

## Initial CLI preflight before review corrections, 2026-10-06

The command `node --import tsx scripts/agent-report-tools-preflight.mjs
"C:\Users\a.lozovoy\AppData\Local\OpenAI\Codex\bin\23f7d7f110b19ac3\codex.exe"`
passed on CLI 0.160.0. The exact binary SHA-256, both terminal exit codes,
ordered completed MCP calls, Stage 1 receipts and captured-artifact paths are
in [the retained evidence record](evidence/agent-report-tools-cli-20261006.json).
Each of two fresh synthetic invocations called read_evidence, validate_report,
the appropriate full/patch submit, and identical submit replay. Each validated
once, closed access after process completion, and replayed the persisted receipt
without another analysis. This is a genuine CLI/transport test with a synthetic
host validation callback, not proof of the real GIS native schema/runtime or
the installed Orchestrator lifecycle. STDIO initialization/call was also explored
in temporary fixtures; production uses the tested host-owned HTTP transport.

The installed application was inspected without changing it:
`resources/server.cjs` SHA-256 was
`77947e435525b14a9d14b47be44e3e9f7aeaece158b7148c13291bb528e7f3c4`,
equal to the pre-change local bundle. No
installation, desktop restart, working queue interruption, pinned asset update,
real GIS queue, Orchestrator repository commit or push was performed.

## Initial source verification before review corrections, 2026-10-06

Final code remained unchanged throughout the completed acceptance run.

| Command | Final result |
| --- | --- |
| `npm run check` | exit 0 |
| `npm run build` | exit 0; existing Vite chunk-size advisory |
| `npm test` | exit 0; main 636 passed / 0 failed / 1 opt-in live skipped; each of the two isolated gates 1/1 passed |
| `node --import tsx scripts/agent-report-tools-preflight.mjs "C:\Users\a.lozovoy\AppData\Local\OpenAI\Codex\bin\23f7d7f110b19ac3\codex.exe"` | exit 0; actual CLI full/patch, four completed calls each, one synthetic validation each |
| `& $env:PYTHON_BIN scripts/ai_context_helper.py smoke-check --format json` (Python313 absolute executable selected first) | exit 0; 3/3 read-only context cases |
| `git diff --check` (process-environment-only safe.directory) and exact-file whitespace/newline assertions including untracked files | exit 0 |

`npm test` includes all ten tool-service tests, the three new production MCP
lifecycle tests, Stage 1 and legacy full/patch cases, mandatory native/gate/review
and publication cases. Native runtime and providers in lifecycle fixtures are
mocked; the child timeout/cancellation test launches a real synthetic Node child.
The actual CLI preflight uses the real installed CLI and real HTTP tool service,
with the explicitly labelled synthetic validation callback. Real GIS native
runtime/queue integration and installed smoke were not run.

Exact logs and a source-hash snapshot are retained outside user queues in
`C:/Users/a.lozovoy/AppData/Local/Temp/report-tools-acceptance-fe75ddfb3678428b8eb04be9b0324823/`:
`acceptance-full.log`, `acceptance-check.log`, `acceptance-build.log`,
`acceptance-cli.log`, `context-smoke.log`, `acceptance-diff.log`,
`acceptance-sources.json`, and `acceptance-summary.json`.
The executable summary assertion reads the full runner log, requires the exact
ordered pass/fail/skip counts for all three processes, asserts aggregate 638,
and verifies every scoped source hash before writing that summary. Earlier
exploratory runs were invalidated/interrupted while source changes were made;
they are not final acceptance evidence.

Changed scope: `server/agent-report-tools.ts` and its test; common atomic delivery
in `server/agent-report.ts`; GIS shared host construction, native diagnostics,
scratch-only validation and opt-in in `server/gis-quality.ts`; executor/correction,
terminal and closed-state replay wiring in `server/index.ts`; profile tests in
`server/gis-quality.test.ts` and `server/gis-quality.integration.test.ts`;
`scripts/agent-report-tools-preflight.mjs`; this contract, navigation in
`docs/process-stages.md`, and the versioned CLI evidence JSON.

Operational acceptance still requires a separately authorized bundle/build and
installation, desktop restart, an explicitly launched installed read-only smoke
with its canonical run.json retained, refreshed bindings and a bounded live
pilot. The tested evidence budget is 1 MiB/source, 2 MiB exposed evidence per
invocation and 128 MiB hash fencing; larger packages fail closed and need a
separately reviewed allowance change. No guarantee for the whole working GIS
queue follows from synthetic fixtures. Stages 3 and 4 remain separate work.

Platform reference: [official MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
The tested CLI provides `--ignore-user-config`, `--ignore-rules`, `--ephemeral`,
`--output-schema`, `--json` and per-command `-c`. Synthetic preflight opts out of
user configuration and rules; production retains its existing execution
boundary and configurations. MCP networking is separate from command network
permissions; this service authenticates every request independently.


## Review correction acceptance fixtures

`server/agent-report-tools.test.ts`: a 524288-byte source with 4096 lines
of 128 bytes serves five distinct 200-line fragments. Each is exactly 25600
bytes; persisted `readBytes` is 128000 and `hashBytes` is 8388608 (initial
pin plus each operation's two fences and handle verification). Full-file hash
checks never spend fragment allowance. Existing output, call and hash budgets
remain independent. Two native errors at `reviewedUnits[0].summaryRu` sharing
a prefix longer than 1024 UTF-8 bytes display the same bounded prefix but carry
different complete-reason hashes; both are returned and only the identical
second error repeated stops the invocation.

`server/gis-quality.integration.test.ts`: full and patch invocations read
`report-schema` through MCP, assert its substantive required fields, and retain
a closed five-call state receipt. These are synthetic integration fixtures,
not installed-application or real GIS runtime smoke evidence.


After review corrections, the real CLI full/patch preflight passed again with
five ordered completed calls per invocation: read bundle, read report-schema,
validate, submit/patch, identical replay. Each used one synthetic validation.
The new immutable capture is
[evidence/agent-report-tools-cli-review-20261006.json](evidence/agent-report-tools-cli-review-20261006.json).
The earlier four-call record and verification table are historical evidence for
the implementation before these corrections.


Review correction verification:

- `npm run check`: exit 0.
- `npm run build`: exit 0 (existing Vite chunk-size advisory).
- `node --import tsx --test server/agent-report-tools.test.ts server/gis-quality.test.ts`:
  19 passed, zero failed.
- `node --import tsx --test --test-name-pattern "invocation MCP" server/gis-quality.integration.test.ts`:
  four passed, zero failed, including missing schema pin before provider authority.
- Real CLI preflight above: full and patch passed with synthetic validation.

Installed smoke and real GIS runtime checks were not run in this correction slice.


The final unchanged-source `npm test` exited 0: main 638 passed, zero failed,
one opt-in live skipped; both isolated gates passed 1/1. Total passed is 640.
The deterministic assertion at
`C:/Users/a.lozovoy/AppData/Local/Temp/report-tools-review-32df562d59c944949cfc17f298e09059/assert-results.ps1`
reads the ordered full-log summaries, exit code, every named source and the new
CLI full/patch capture, and fails on disagreement. Its retained
[acceptance summary](evidence/agent-report-tools-review-acceptance-20261006.json)
binds those exact artifacts and hashes. `git diff --check` also passed.
This summary is local source-test evidence, not a canonical installed smoke run.


## Loopback proxy correction

The child-only bypass regression covers absent/empty lists, each casing alone,
distinct lists in both casings, existing loopback entries with whitespace and
case differences, wildcards, and port-qualified entries. Assertions preserve
original exclusion text, add only the two exact loopback hosts, give both keys
the same value, and prove the input environment is not mutated.

The preflight records only boolean proxy-presence/parent-loopback facts (never
proxy URLs or exclusion values), asserts both child keys and preservation, then
launches the CLI through the production `mcp.environment` path. Historical
640-test verification above predates this proxy correction and does not bind
its new source hashes. Installed smoke and real GIS runtime remain unperformed.


Proxy correction verification:

- `npm run check`: exit 0.
- `node --import tsx --test server/agent-report-tools.test.ts server/gis-quality.test.ts`:
  20 passed, zero failed.
- `node --import tsx --test --test-name-pattern "invocation MCP" server/gis-quality.integration.test.ts`:
  four passed, zero failed.
- Ordinary `node --import tsx scripts/agent-report-tools-preflight.mjs <absolute CLI path>`:
  full and patch passed without manually setting either bypass variable.
  [Ordinary capture](evidence/agent-report-tools-cli-loopback-20261006.json)
  records that this shell had neither loopback exclusion nor configured proxy.
- The same command with `--http-proxy-fixture`: full and patch passed with
  a child HTTP proxy returning 503, zero HTTP proxy requests, and two API
  CONNECT tunnels. The fixture tunnels only `chatgpt.com:443` to keep the remote
  API working; all HTTP proxy requests are rejected. Each mode completed the
  five required MCP calls and one synthetic validation.
  [Proxy capture](evidence/agent-report-tools-cli-proxy-fixture-20261006.json).
- A negative control without child bypass exited 1 with HTTP 503: three
  requests reached the proxy and zero reached the loopback MCP target.
  [Negative capture](evidence/agent-report-tools-proxy-negative-20261006.json).
  Its exact script is retained at
  `C:/Users/a.lozovoy/AppData/Local/Temp/report-proxy-negative-a0e2fd1922d343acb12b9e652a2a595e.mjs`.
- `git diff --check`: exit 0.

The full suite was not rerun after this environment-only production fix.
The earlier 640-test record remains historical evidence with its original hashes.
These CLI captures use a synthetic validator; installed smoke and real GIS
runtime were not run.
