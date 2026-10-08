import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, symlink, lstat, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ReportToolService, startReportMcp, reportLoopbackEnvironment, REPORT_TOOL_LIMITS, assertReportToolCompletion, assertNoWindowsReparsePoints, type ReportToolError } from "./agent-report-tools.ts";
import { reportSha, replayReport, type ReportIdentity } from "./agent-report.ts";
import { prepareGisResponses, GisReportError, gisNativeReportErrors, gisNative } from "./gis-quality.ts";
const identity: ReportIdentity = { runId: "r", taskId: "t", invocationId: "a".repeat(32), phase: "executor", ordinal: 1, mode: "full", transport: "invocation-mcp-v1" };
const candidate = JSON.stringify({ responses: [{ reviewedUnits: [], findings: [], limitations: [] }] });
async function fixture(options: { text?: string; mode?: "full" | "patch"; errors?: ReportToolError[]; validate?: (count: number) => ReportToolError[]; boundary?: (name: string) => Promise<void>; lifetime?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), "report-tools-")), storage = join(root, "host"), sourceRoot = join(root, "sources"), source = join(sourceRoot, "evidence.txt");
  await mkdir(storage); await mkdir(sourceRoot); const text = options.text ?? "one\nдва\nthree\n"; await writeFile(source, text);
  let authorized = true, validations = 0;
  const context = { evidence: [{ id: "bundle-0", path: source, root: sourceRoot, sha256: reportSha(text) }], guard: async () => { assert.ok(authorized, "AUTHORITY_CHANGED"); }, validate: async (_: string, scratch: string) => { validations++; await writeFile(join(scratch, "native-output.json"), "{}"); return options.validate?.(validations) ?? options.errors ?? []; } };
  const id = { ...identity, mode: options.mode ?? "full" };
  const service = await ReportToolService.create(storage, id, context, options.lifetime ?? 120000, options.boundary);
  return { root, storage, sourceRoot, source, service, context, id, revoke: () => { authorized = false; }, validations: () => validations };
}
const invoke = (service: ReportToolService, name: string, payloadJson = candidate) => service.invoke(name, { payloadJson });

test("report evidence rejects a same-byte path replacement while its original handle is open", async () => {
  const f = await fixture({ boundary: async name => {
    if (name !== "evidence-read-before-identity") return;
    const replacement = f.source + ".replacement";
    await writeFile(replacement, await readFile(f.source));
    await rename(replacement, f.source);
  } });
  try {
    // Windows may deny replacing an open file before the identity check;
    // either OS denial or a detected replacement must prevent any result.
    await assert.rejects(f.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 1, endLine: 1 }), process.platform === "win32" ? /EVIDENCE_CHANGED|EPERM|EBUSY/ : /EVIDENCE_CHANGED/);
    assert.equal(f.validations(), 0);
  } finally { await f.service.close(); }
});

test("report MCP child bypass preserves both inherited proxy exclusion lists and adds only loopback", () => {
  for (const [environment, expected] of [
    [{}, "127.0.0.1,localhost"],
    [{ NO_PROXY: "", no_proxy: "" }, "127.0.0.1,localhost"],
    [{ NO_PROXY: "internal.example,.corp" }, "internal.example,.corp,127.0.0.1,localhost"],
    [{ no_proxy: "lower.example" }, "lower.example,127.0.0.1,localhost"],
    [{ NO_PROXY: "one.example", no_proxy: "two.example" }, "one.example,two.example,127.0.0.1,localhost"],
    [{ NO_PROXY: "  LOCALHOST ,127.0.0.1,host:8080" }, "  LOCALHOST ,127.0.0.1,host:8080"],
    [{ NO_PROXY: "*", no_proxy: "127.0.0.1:9000" }, "*,127.0.0.1:9000,127.0.0.1,localhost"],
  ] as const) {
    const before = { ...environment };
    assert.deepEqual(reportLoopbackEnvironment(environment), { NO_PROXY: expected, no_proxy: expected });
    assert.deepEqual(environment, before);
  }
});
test("report tools exact UTF-8 lines/hash, complete-line count/byte bounds, changed bytes and closed IDs", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 2, endLine: 3 }), { evidenceId: "bundle-0", sourceSha256: reportSha("one\nдва\nthree\n"), requestedStartLine: 2, requestedEndLine: 3, returnedStartLine: 2, returnedEndLine: 3, totalLines: 3, truncated: false, beyondSourceEnd: false, text: "два\nthree\n" });
    for (const evidenceId of ["unknown", "../evidence.txt", f.source]) await assert.rejects(f.service.invoke("read_evidence", { evidenceId, startLine: 1, endLine: 1 }), /UNKNOWN_EVIDENCE/);
    await assert.rejects(f.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 0, endLine: 1 }));
    await writeFile(f.source, "changed\n"); await assert.rejects(f.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 1, endLine: 1 }), /EVIDENCE_CHANGED/);
  } finally { await f.service.close(); }
  for (const [text, endLine, expectedEnd, expectedText] of [["x\n".repeat(201), 201, 200, "x\n".repeat(200)], ["x".repeat(32769) + "\n", 1, null, ""]] as const) {
    const f = await fixture({ text }); try { const value = await f.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 1, endLine }) as { returnedEndLine: number; text: string; truncated: boolean }; assert.equal(value.returnedEndLine, expectedEnd); assert.equal(value.text, expectedText); assert.equal(value.truncated, true); } finally { await f.service.close(); }
  }
});
test("report tools reject junction/reparse ancestry and substitution after declaration", async () => {
  const f = await fixture(); const link = join(f.root, "linked");
  try {
    await symlink(f.sourceRoot, link, process.platform === "win32" ? "junction" : "dir");
    if (process.platform === "win32") await assert.rejects(assertNoWindowsReparsePoints([join(link, "evidence.txt")]), /REPARSE/);
    await assert.rejects(ReportToolService.create(join(f.root, "other"), identity, { ...f.context, evidence: [{ ...f.context.evidence[0], path: join(link, "evidence.txt"), root: link }] }, 5000), /link|resolves|REPARSE/);
    // Replace the exact file by a symlink; Windows file symlinks need privileges,
    // so replace its ancestor using a junction instead.
    const { rename } = await import("node:fs/promises"); await rename(f.sourceRoot, join(f.root, "original"));
    await symlink(join(f.root, "original"), f.sourceRoot, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(f.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 1, endLine: 1 }), /link|resolves|REPARSE/);
  } finally { await f.service.close(); }
});
test("report tools draft has scratch-only effects; concurrent identical submits seal once, conflicts fail and JSON replay is analysis-free", async () => {
  let renames = 0; const f = await fixture({ boundary: async n => { if (n === "after-rename") renames++; } });
  try {
    assert.deepEqual(await invoke(f.service, "validate_report"), { valid: true, errors: [] });
    await assert.rejects(lstat(join(f.storage, "submitted")), { code: "ENOENT" });
    assert.equal(await readFile(f.source, "utf8"), "one\nдва\nthree\n");
    const [a, b] = await Promise.all([invoke(f.service, "submit_report"), invoke(f.service, "submit_report")]); assert.deepEqual(a, b); assert.equal(renames, 1); assert.equal(f.validations(), 1);
    await assert.rejects(invoke(f.service, "submit_report", candidate + " "), /CONFLICT/);
    await assert.rejects(invoke(f.service, "validate_report"), /SEALED/);
    await assert.rejects(f.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 1, endLine: 1 }), /SEALED/);
    const paths = ["result.json", "schema.json", "receipt.json"].map(n => join(f.storage, "submitted", n));
    assert.equal(await replayReport(paths[0], paths[1], paths[2], JSON.parse(JSON.stringify(f.id))), candidate); assert.equal(f.validations(), 1);
    for (const id of [{ ...f.id, invocationId: "foreign" }, { ...f.id, ordinal: 2 }, { ...f.id, taskId: "other" }]) await assert.rejects(replayReport(paths[0], paths[1], paths[2], id));
    await writeFile(paths[2], "{}"); await assert.rejects(replayReport(paths[0], paths[1], paths[2], f.id));
  } finally { await f.service.close(); }
  await assert.rejects(ReportToolService.create(f.storage, f.id, f.context, 5000), { code: "EEXIST" });
});
test("report tools interruptions before/after atomic write and lost acknowledgement never rerun native validation", async () => {
  for (const boundary of ["before-rename", "after-rename"]) {
    let once = true; const f = await fixture({ boundary: async n => { if (n === boundary && once) { once = false; throw Error("interruption"); } } });
    try {
      await assert.rejects(invoke(f.service, "submit_report"), /interruption/);
      if (boundary === "before-rename") await assert.rejects(lstat(join(f.storage, "submitted")), { code: "ENOENT" });
      else assert.equal(await replayReport(join(f.storage, "submitted", "result.json"), join(f.storage, "submitted", "schema.json"), join(f.storage, "submitted", "receipt.json"), f.id), candidate);
      const result = await invoke(f.service, "submit_report") as { submitted: boolean }; assert.equal(result.submitted, true); assert.equal(f.validations(), 1);
    } finally { await f.service.close(); }
  }
});
test("report tools persist finite reservations, stop repeated errors, exhausted candidates/calls/input/read bytes", async () => {
  const errors: ReportToolError[] = [{ responseIndex: 1, primaryFile: "one.ts", field: "findings[0].ruleId", code: "RULE_NOT_ELIGIBLE" }];
  const repeated = await fixture({ errors }); try {
    assert.deepEqual(await invoke(repeated.service, "validate_report"), { valid: false, errors });
    await assert.rejects(invoke(repeated.service, "validate_report", candidate + " "), /REPEATED/);
    await assert.rejects(invoke(repeated.service, "submit_report")); assert.equal(repeated.validations(), 2);
  } finally { await repeated.service.close(); }
  const candidates = await fixture(); try {
    for (const extra of ["", " "]) await invoke(candidates.service, "validate_report", candidate + extra);
    await assert.rejects(invoke(candidates.service, "submit_report", candidate + "  "), /BUDGET/); assert.equal(candidates.validations(), 2);
  } finally { await candidates.service.close(); }
  const calls = await fixture(); try {
    for (let i = 0; i < REPORT_TOOL_LIMITS.calls; i++) await assert.rejects(calls.service.invoke("read_evidence", { evidenceId: "unknown", startLine: 1, endLine: 1 }));
    await assert.rejects(invoke(calls.service, "submit_report"), /LIMIT/); assert.equal(calls.validations(), 0);
  } finally { await calls.service.close(); }
  const bytes = await fixture(); try { await assert.rejects(invoke(bytes.service, "validate_report", "x".repeat(1024 * 1024 + 8192)), /LIMIT/); assert.equal(bytes.validations(), 0); } finally { await bytes.service.close(); }
  const reads = await fixture({ text: ("x".repeat(127) + "\n").repeat(4096) }); try {
    for (let i = 0; i < 5; i++) {
      const result = await reads.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: i * 200 + 1, endLine: (i + 1) * 200 }) as { text: string };
      assert.equal(Buffer.byteLength(result.text), 25600);
    }
    const state = JSON.parse(await readFile(join(reads.storage, "tools-state.json"), "utf8"));
    assert.equal(state.readBytes, 128000);
    assert.equal(state.hashBytes, 16 * 524288);
  } finally { await reads.service.close(); }
});
test("report tools changed authority/state, revoked/expired invocations and foreign argument identities fail before native work", async () => {
  for (const scenario of ["authority", "state", "cancel", "expiry", "foreign"]) {
    const f = await fixture({ lifetime: scenario === "expiry" ? 20 : 5000 });
    try {
      if (scenario === "authority") f.revoke();
      if (scenario === "state") await writeFile(join(f.storage, "tools-state.json"), "{}");
      if (scenario === "cancel") f.service.revoke();
      if (scenario === "expiry") await new Promise(done => setTimeout(done, 30));
      await assert.rejects(f.service.invoke("submit_report", scenario === "foreign" ? { payloadJson: candidate, invocationId: "foreign" } : { payloadJson: candidate })); assert.equal(f.validations(), 0);
    } finally { await f.service.close(); }
  }
});
test("report tools cumulative input/output budgets and native process failure remain finite", async () => {
  const input = await fixture();
  try {
    const large = JSON.stringify({ responses: [{ reviewedUnits: [{ primaryFile: "one.ts", summaryRu: "x".repeat(900000) }], findings: [], limitations: [] }] });
    for (let i = 0; i < 4; i++) await invoke(input.service, "validate_report", large);
    await assert.rejects(invoke(input.service, "submit_report", large), /INPUT_LIMIT/); assert.equal(input.validations(), 1);
  } finally { await input.service.close(); }
  const output = await fixture({ text: "x".repeat(32767) + "\n" });
  try {
    for (let i = 0; i < 63; i++) await output.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 1, endLine: 1 });
    await assert.rejects(output.service.invoke("read_evidence", { evidenceId: "bundle-0", startLine: 1, endLine: 1 }), /OUTPUT_LIMIT/);
  } finally { await output.service.close(); }
  const native = await fixture({ errors: [{ responseIndex: 0, primaryFile: null, field: "$", code: "NATIVE_PROCESS_FAILED" }] });
  try { await assert.rejects(invoke(native.service, "validate_report"), /NATIVE_VALIDATION_FAILED/); await assert.rejects(invoke(native.service, "submit_report")); assert.equal(native.validations(), 1); } finally { await native.service.close(); }
});
test("report tools share full/patch construction and exact native field diagnostics without content repair", () => {
  const bundles = ["one.ts", "two.ts"].map(primaryFile => ({ rules: ["ONE", "TWO"], reviewUnits: [{ primary: { path: primaryFile }, completeForProfile: true, signals: [{ ruleId: primaryFile === "one.ts" ? "ONE" : "TWO" }] }] }));
  const response = { reviewedUnits: [], findings: [], limitations: [] }; const previous = [response, response];
  assert.equal(prepareGisResponses(bundles, previous, [1], { patches: [{ index: 1, response }] })[0], previous[0]);
  for (const patches of [[], [{ index: 0, response }], [{ index: 1, response }, { index: 1, response }], [{ index: 1, response }, { index: 0, response }]]) assert.throws(() => prepareGisResponses(bundles, previous, [1], { patches }));
  assert.throws(() => prepareGisResponses(bundles, undefined, [0, 1], { responses: [response] }));
  const wrong = { ...response, findings: [{ primaryFile: "one.ts", ruleId: "TWO" }] }, before = JSON.stringify(wrong);
  assert.throws(() => prepareGisResponses(bundles, undefined, [0, 1], { responses: [wrong, response] }), (e: unknown) => { assert.ok(e instanceof GisReportError); assert.deepEqual(e.detail, { responseIndex: 0, primaryFile: "one.ts", field: "findings[0].ruleId", code: "RULE_NOT_ELIGIBLE" }); return true; }); assert.equal(JSON.stringify(wrong), before);
  assert.deepEqual(gisNativeReportErrors(0, wrong, ["findings[0].location.line должен быть положительным integer"]), [{ responseIndex: 0, primaryFile: "one.ts", field: "findings[0].location.line", code: "NATIVE_REJECTED", diagnostic: "findings[0].location.line должен быть положительным integer", diagnosticSha256: reportSha("findings[0].location.line должен быть положительным integer") }]);
  const malformed = { ...response, findings: [{ primaryFile: { invalid: true }, ruleId: "ONE" }] };
  assert.throws(() => prepareGisResponses(bundles, undefined, [0, 1], { responses: [malformed, response] }), (e: unknown) => { assert.ok(e instanceof GisReportError); assert.equal(e.detail.primaryFile, null); assert.equal(e.detail.field, "findings[0].primaryFile"); return true; });
  assert.equal(gisNativeReportErrors(0, malformed, ["findings[0].primaryFile absent"])[0].primaryFile, null);
  assertReportToolCompletion('{"outcome":"completed","reason":""}'); for (const raw of ['{"outcome":"stopped","reason":"why"}', '{"outcome":"completed","reason":"", "extra":1}']) assert.throws(() => assertReportToolCompletion(raw));
});
test("report MCP bearer/HTTP/closed arguments fence operations and close revokes listener", async () => {
  const f = await fixture(), mcp = await startReportMcp(f.service); const config = mcp.args[1], url = /url="([^"]+)"/u.exec(config)![1], token = mcp.environment.ORCHESTRATOR_REPORT_MCP_TOKEN;
  try {
    assert.equal(mcp.environment.NO_PROXY, reportLoopbackEnvironment(process.env).NO_PROXY);
    assert.equal(mcp.environment.no_proxy, mcp.environment.NO_PROXY);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "submit_report", arguments: { payloadJson: candidate } } });
    assert.equal((await fetch(url, { method: "POST", body })).status, 401);
    assert.equal((await fetch(url, { method: "POST", body, headers: { Authorization: `Bearer ${token}`, Origin: "http://evil.invalid" } })).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
    assert.equal(f.validations(), 0);
    assert.ok(!mcp.redact(`${token} ${url} ${config}`).includes(token)); assert.ok(!mcp.redact(`${token} ${url} ${config}`).includes(url));
    const secretPayload = JSON.stringify({ responses: [{ reviewedUnits: [], findings: [], limitations: [{ text: token }] }] });
    await assert.rejects(invoke(f.service, "validate_report", secretPayload), /PRIVATE_CONNECTION_DATA/);
    const escapedToken = [...token].map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
    await assert.rejects(invoke(f.service, "validate_report", secretPayload.replace(token, escapedToken)), /PRIVATE_CONNECTION_DATA/); assert.equal(f.validations(), 0);
    const result = await (await fetch(url, { method: "POST", body, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } })).json() as { result: { content: Array<{ text: string }> } }; assert.equal(JSON.parse(result.result.content[0].text).submitted, true);
    assert.ok(!JSON.stringify(result).includes(token));
  } finally { await mcp.close(); }
  assert.equal(await f.service.closedStateSha256(), reportSha(await readFile(join(f.storage, "tools-state.json"))));
  await writeFile(join(f.storage, "tools-state.json"), "{}"); await assert.rejects(f.service.closedStateSha256(), /STATE_CHANGED/);
  await assert.rejects(fetch(url)); await assert.rejects(invoke(f.service, "submit_report"));
});

test("report MCP binds discovery and submission to full/patch identity and preserves exact mode errors", async () => {
  for (const mode of ["full", "patch"] as const) {
    const f = await fixture({ mode }), mcp = await startReportMcp(f.service);
    const config = mcp.args[1], url = /url="([^"]+)"/u.exec(config)![1];
    const expected = mode === "full" ? "submit_report" : "patch_report", wrong = mode === "full" ? "patch_report" : "submit_report";
    const payloadJson = mode === "full" ? candidate : JSON.stringify({ patches: [{ index: 2, response: { reviewedUnits: [], findings: [], limitations: [] } }] });
    const rpc = async (method: string, params?: unknown) => {
      const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${mcp.environment.ORCHESTRATOR_REPORT_MCP_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      assert.equal(response.status, 200);
      return (await response.json()).result;
    };
    try {
      const listed = await rpc("tools/list");
      assert.deepEqual(listed.tools.map((tool: { name: string }) => tool.name), ["read_evidence", "validate_report", expected]);
      assert.ok(config.includes(JSON.stringify(expected))); assert.ok(!config.includes(JSON.stringify(wrong)));
      assert.match(listed.tools[2].description, new RegExp(`${mode}-mode`));
      const validation = await rpc("tools/call", { name: "validate_report", arguments: { payloadJson } });
      assert.ok(!validation.isError); assert.equal(f.validations(), 1);
      const rejected = await rpc("tools/call", { name: wrong, arguments: { payloadJson } });
      assert.equal(rejected.isError, true); assert.deepEqual(JSON.parse(rejected.content[0].text), { error: "WRONG_REPORT_MODE" });
      assert.equal(f.validations(), 1);
      await assert.rejects(lstat(join(f.storage, "submitted")), { code: "ENOENT" });
      const state = JSON.parse(await readFile(join(f.storage, "tools-state.json"), "utf8"));
      assert.equal(state.status, "active");
      assert.deepEqual(state.lastProtocolError, { code: "WRONG_REPORT_MODE", requestedTool: wrong, expectedTool: expected });
      const submitted = await rpc("tools/call", { name: expected, arguments: { payloadJson } });
      assert.equal(JSON.parse(submitted.content[0].text).submitted, true); assert.equal(f.validations(), 1);
      assert.equal(await replayReport(join(f.storage, "submitted/result.json"), join(f.storage, "submitted/schema.json"), join(f.storage, "submitted/receipt.json"), f.id), payloadJson);
      assertReportToolCompletion('{"outcome":"completed","reason":""}');
    } finally { await mcp.close(); }
    const closed = JSON.parse(await readFile(join(f.storage, "tools-state.json"), "utf8"));
    assert.equal(closed.status, "closed"); assert.equal(closed.lastProtocolError.code, "WRONG_REPORT_MODE");
  }
});

test("report MCP without explicit review protocol requires a host-bound report mode", async () => {
  await assert.rejects(startReportMcp({ invoke: async () => undefined, revoke() {}, protectConnection() {}, signal: new AbortController().signal, close: async () => {} }), /INVALID_REPORT_MODE/);
});
test("native draft child timeout and cancellation terminate without canonical mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "tool-native-timeout-")); await mkdir(join(root, ".orchestrator-scratch")); const stdio = join(root, "stdio.cjs"), script = join(root, "wait.cjs"); await writeFile(stdio, ""); await writeFile(script, "setTimeout(()=>{},10000)");
  for (const cancel of [false, true]) {
    const controller = new AbortController(); if (cancel) controller.abort(); const start = Date.now();
    const result = await gisNative(process.execPath, stdio, script, [], root, process.env, undefined, undefined, { timeoutMs: 30, signal: controller.signal });
    assert.notEqual(result.exitCode, 0); assert.ok(Date.now() - start < 5000); assert.equal(await readFile(script, "utf8"), "setTimeout(()=>{},10000)");
  }
});


test("native diagnostics distinguish same-field causes, bound UTF-8 and stop only identical errors", async () => {
  const response = { reviewedUnits: [{ primaryFile: "one.ts" }] };
  const prefix = "reviewedUnits[0].summaryRu " + "я".repeat(600);
  const a = gisNativeReportErrors(0, response, [prefix + " first"]);
  const b = gisNativeReportErrors(0, response, [prefix + " second"]);
  assert.equal(a[0].diagnostic, b[0].diagnostic);
  assert.ok(Buffer.byteLength(a[0].diagnostic!) <= 1024);
  assert.notEqual(a[0].diagnosticSha256, b[0].diagnosticSha256);
  const f = await fixture({ validate: count => count === 1 ? a : b });
  try {
    assert.deepEqual(await invoke(f.service, "validate_report"), { valid: false, errors: a });
    assert.deepEqual(await invoke(f.service, "validate_report", candidate + " "), { valid: false, errors: b });
    await assert.rejects(invoke(f.service, "validate_report", candidate + " "), /REPEATED_VALIDATION_ERROR/);
  } finally { await f.service.close(); }
});
