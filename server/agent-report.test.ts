import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeReport, uniqueJson, reportEvents, readReport, REPORT_LIMIT, reportSchemaBytes, makeReportReceipt, persistReportReceipt, replayReport, type ReportIdentity } from "./agent-report.ts";
const envelope = (payload: unknown, overrides = {}) => JSON.stringify({ protocolVersion: "structured-output-v1", outcome: "completed", mode: "full", reason: "", payloadJson: JSON.stringify(payload), ...overrides });
test("structured-output-v1 codec preserves substantive values, missing optionals and tail", () => {
  const value = { responses: [{ reviewedUnits: [], findings: [{ summaryRu: 'Кириллица "quoted" \\path\nnext', securityTrace: { advisory: { items: [{ versions: [null, false, 0] }] } }, tail: "x".repeat(25000) + "Значимый хвост" }], limitations: [] }] };
  const decoded = decodeReport(envelope(value), "full");
  assert.deepEqual(decoded.payload, value); assert.equal(Object.hasOwn(value.responses[0].findings[0], "optional"), false);
  for (const raw of ['{"x":1,"x":2}', '{"x":1,"\\u0078":2}', '{"x":{"y":1,"y":2}}']) assert.throws(() => uniqueJson(raw), /Duplicate/);
});
test("structured-output-v1 closed envelope rejects malformed/ambiguous/oversize/stopped", () => {
  const good = JSON.parse(envelope({ responses: [] }));
  for (const changes of [{ protocolVersion: "bad" }, { mode: "patch" }, { extra: true }, { payloadJson: "{" }, { payloadJson: '{"responses":[],"responses":[]}' }, { reason: " " }, { outcome: "bad" }, { payloadJson: "" }, { reason: "я".repeat(2049) }, { outcome: "stopped", reason: " остановка ", payloadJson: "" }]) assert.throws(() => decodeReport(JSON.stringify({ ...good, ...changes }), "full"));
  for (const key of Object.keys(good)) { const v = { ...good }; delete v[key]; assert.throws(() => decodeReport(JSON.stringify(v), "full")); }
  assert.throws(() => decodeReport('{"mode":"full",' + envelope({ responses: [] }).slice(1), "full"), /Duplicate/);
  assert.throws(() => decodeReport(" ".repeat(REPORT_LIMIT + 1), "full"), /1 MiB/);
  assert.throws(() => decodeReport(envelope({ value: "x".repeat(REPORT_LIMIT + 1) }), "full"), /1 MiB/);
});
test("structured-output-v1 terminal process evidence cannot be compensated by valid JSON", () => {
  for (const lines of [[], ['{"type":"turn.failed"}'], ['{"type":"error"}', '{"type":"turn.completed"}'], ['{"type":"turn.completed"}', '{"type":"turn.completed"}'], ['{"type":']]) {
    const events = reportEvents(); lines.forEach(line => events.consume(line)); assert.throws(() => events.assertSuccess(0, false, false));
  }
  for (const result of [[1, false, false], [0, true, false], [0, false, true]] as const) {
    const events = reportEvents(); events.consume('{"type":"turn.completed"}'); assert.throws(() => events.assertSuccess(result[0], result[1], result[2]));
  }
  const events = reportEvents(); events.consume('{"type":"turn.completed"}'); events.assertSuccess(0, false, false);
});
test("terminal diagnostics retain bounded exact events and process failure causes", () => {
  const events = reportEvents();
  const error = JSON.stringify({ type: "error", message: "transport failed" });
  events.consume(error, "stderr"); events.consume('{"type":"turn.completed"}');
  assert.deepEqual(events.snapshot().counts, { lines: 2, completed: 1, failed: 0, errors: 1, transportRetries: 0, malformed: 0, afterTerminal: 0 });
  assert.equal(events.snapshot().evidence[0].raw, error);
  assert.equal(events.snapshot().evidence[0].source, "stderr");
  assert.throws(() => events.assertSuccess(0, false, false), /"errors":1/);
  for (let i = 0; i < 20; i++) events.consume(JSON.stringify({ type: "error", message: "x".repeat(5000) }));
  const snapshot = events.snapshot(); assert.equal(snapshot.evidence.length, 16);
  assert.equal(snapshot.evidence[2].raw, undefined); assert.equal(snapshot.evidence[2].sha256.length, 64);
  snapshot.counts.errors = 0; assert.equal(events.snapshot().counts.errors, 21);
});
test("only finite increasing observed WebSocket reconnect diagnostics can precede terminal success", () => {
  const retry = (n: string, changes = {}) => JSON.stringify({ type: "error", message: `Reconnecting... ${n}/5 (unexpected status 403 Forbidden: <html>, url: wss://chatgpt.com/backend-api/codex/responses, cf-ray: a464142dfabde955-DME)`, ...changes });
  const complete = '{"type":"turn.completed"}';
  const recovered = reportEvents(); for (const n of ["2", "3", "4", "5"]) recovered.consume(retry(n));
  recovered.consume(complete); recovered.assertSuccess(0, false, false);
  assert.equal(recovered.snapshot().counts.transportRetries, 4); assert.equal(recovered.snapshot().counts.errors, 4);
  for (const lines of [[retry("6"), complete], [retry("1"), retry("1"), complete], [retry("3"), retry("2"), complete], [retry("2"), '{"type":"error"}', complete], [retry("2"), '{"type":"turn.failed"}', complete], [complete, retry("2")], [retry("2")], [retry("2", { message: "Reconnecting... unknown" }), complete]]) {
    const e = reportEvents(); lines.forEach(line => e.consume(line)); assert.throws(() => e.assertSuccess(0, false, false));
  }
  for (const result of [[1, false, false], [0, true, false], [0, false, true]] as const) assert.throws(() => recovered.assertSuccess(result[0], result[1], result[2]));
});
test("structured-output-v1 bounded raw reads and receipt replay bind exact invocation and hashes", async () => {
  const root = await mkdtemp(join(tmpdir(), "report-test-")), raw = join(root, "raw"), schema = join(root, "schema"), receipt = join(root, "receipt");
  const identity: ReportIdentity = { runId: "run", taskId: "task", invocationId: "one", phase: "executor", ordinal: 1, mode: "full" };
  const text = envelope({ responses: [{ tail: "x".repeat(25000) + "tail" }] });
  await writeFile(raw, text); await writeFile(schema, reportSchemaBytes());
  assert.equal(await persistReportReceipt(raw, schema, receipt, identity), JSON.parse(text).payloadJson);
  assert.equal(await readReport(raw), text);
  for (const change of [{ invocationId: "other" }, { phase: "correction" }, { ordinal: 2 }, { mode: "patch" }, { runId: "other" }, { taskId: "other" }]) await assert.rejects(replayReport(raw, schema, receipt, { ...identity, ...change } as ReportIdentity));
  const original = await readFile(receipt, "utf8");
  for (const field of ["schemaSha256", "rawSha256", "payloadSha256", "codecVersion"]) { await writeFile(receipt, JSON.stringify({ ...makeReportReceipt(text, identity), [field]: "changed" })); await assert.rejects(replayReport(raw, schema, receipt, identity)); }
  await writeFile(receipt, original); await writeFile(schema, "{}"); await assert.rejects(replayReport(raw, schema, receipt, identity));
  await writeFile(schema, reportSchemaBytes()); await writeFile(raw, text + " "); await assert.rejects(replayReport(raw, schema, receipt, identity));
  await writeFile(raw, "x".repeat(REPORT_LIMIT + 1)); await assert.rejects(readReport(raw), /1 MiB/);
  await writeFile(raw, Buffer.from([0xff])); await assert.rejects(readReport(raw));
  await writeFile(raw, "\uFEFF" + text);
  assert.equal(await readReport(raw), "\uFEFF" + text);
  await assert.rejects(replayReport(raw, schema, receipt, identity));
});
