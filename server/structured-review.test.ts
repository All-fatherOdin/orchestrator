import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertReviewTerminal, assertGisReviewInventory, assertReviewFinalizer, reviewProviderBoundary, captureReviewSource, decodeReviewVerdict, ReviewToolService, replayStructuredReview, reviewToolDefinitions, type ReviewSnapshot, type ReviewReceipt } from "./structured-review.ts";
import { reportEvents, reportSha } from "./agent-report.ts";
import { validateGisStructuredTargets, applyGisResponsePatches } from "./gis-quality.ts";
import { startReportMcp } from "./agent-report-tools.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "structured-review-"));
  const file = join(root, "response.json"); await writeFile(file, 'one\ntwo\nthree\n');
  const source = await captureReviewSource("response", file, root, 3);
  const snapshot: ReviewSnapshot = { identity: { runId: "run", taskId: "task", invocationId: "a".repeat(32), ordinal: 1, phase: "reviewer" }, context: { sourceRunStatus: "failed", writerStatus: "completed", writerReviewStatus: "approved", writerPhase: "published", currentFinalAcceptance: "pending", native: { status: "success", selectedCells: 5, completedCells: 0, returnedCells: 5, dispositions: ["limitation"] } }, evidence: [source] };
  const verdict = (status = "approved", remarks: unknown[] = []) => JSON.stringify({ protocolVersion: "invocation-mcp-v1", invocationId: snapshot.identity.invocationId, snapshotSha256: reportSha(JSON.stringify(snapshot)), status, reason: status === "approved" ? "" : "Needs exact evidence correction", remarks });
  return { root, file, snapshot, verdict, cleanup: () => rm(root, { recursive: true, force: true }) };
}
test("structured review validates closed verdict identity, evidence, duplicates and exact targets", async () => {
  const f = await fixture();
  try {
    assert.equal(decodeReviewVerdict(f.verdict(), f.snapshot).status, "approved");
    const remark = { evidenceId: "response", field: "limitations[0]", category: "correctness", message: "Missing limitation", responseIndex: 3 };
    assert.equal(decodeReviewVerdict(f.verdict("changes_requested", [remark]), f.snapshot).remarks[0].responseIndex, 3);
    for (const raw of [f.verdict().replace('"approved"', '"approved","status":"approved"'), f.verdict().replace('"invocationId":"a', '"invocationId":"b'), f.verdict("changes_requested", [remark, remark]), f.verdict("changes_requested", [{ ...remark, responseIndex: 4 }]), f.verdict("changes_requested", [{ ...remark, evidenceId: "../response.json" }]), f.verdict("approved", [remark]), f.verdict("changes_requested"), f.verdict().replace('"reason":""', '"reason":"wrong"')]) assert.throws(() => decodeReviewVerdict(raw, f.snapshot));
    assert.equal(f.snapshot.context && decodeReviewVerdict(f.verdict(), f.snapshot).status, "approved");
  } finally { await f.cleanup(); }
});
test("structured review concurrent identical submission, closed replay and changed receipts", async () => {
  const f = await fixture(); let service: ReviewToolService | undefined;
  try {
    service = await ReviewToolService.create(join(f.root, "invocation"), f.snapshot, 60000, async () => {});
    const read = await service.invoke("read_evidence", { evidenceId: "response", startLine: 2, endLine: 3 }) as { text: string; returnedEndLine: number };
    assert.equal(read.text, "two\nthree\n"); assert.equal(read.returnedEndLine, 3);
    const results = await Promise.all([service.invoke("submit_verdict", { payloadJson: f.verdict() }), service.invoke("submit_verdict", { payloadJson: f.verdict() })]); assert.deepEqual(results[0], results[1]);
    assert.equal((await service.assertSubmitted()).status, "approved");
    await assert.rejects(service.invoke("validate_report", { payloadJson: "{}" }));
    await assert.rejects(service.invoke("submit_verdict", { payloadJson: f.verdict("unavailable") }), /CONFLICT/);
    await service.close();
    const root = service.root, terminal = JSON.stringify({ code: 0, timedOut: false, cancelled: false, lines: ['{"type":"turn.completed"}'] }); await writeFile(join(root, "terminal.json"), terminal);
    const receipt: ReviewReceipt = { identity: f.snapshot.identity, snapshotSha256: reportSha(JSON.stringify(f.snapshot)), verdictSha256: reportSha(f.verdict()), terminalSha256: reportSha(terminal), closedStateSha256: reportSha(await readFile(join(root, "state.json"))) };
    assert.equal((await replayStructuredReview(root, receipt)).status, "approved");
    const before = await readFile(join(root, "state.json"), "utf8"); await assert.rejects(service.invoke("submit_verdict", { payloadJson: f.verdict() }), /CLOSED/); assert.equal(await readFile(join(root, "state.json"), "utf8"), before);
    await assert.rejects(ReviewToolService.create(root, f.snapshot, 60000, async () => {}), /EEXIST/);
    await writeFile(join(root, "submitted", "receipt.json"), "{}"); await assert.rejects(replayStructuredReview(root, receipt));
  } finally { await service?.close(); await f.cleanup(); }
});
test("structured review lost acknowledgement retains a single committed verdict", async () => {
  const f = await fixture(); let service: ReviewToolService | undefined;
  try {
    let once = true;
    service = await ReviewToolService.create(join(f.root, "invocation"), f.snapshot, 60000, async () => {}, async name => { if (name === "after-rename" && once) { once = false; throw new Error("ack lost"); } });
    await assert.rejects(service.invoke("submit_verdict", { payloadJson: f.verdict() }), /ack lost/);
    await service.invoke("submit_verdict", { payloadJson: f.verdict() }); assert.equal((await service.assertSubmitted()).status, "approved");
    assert.deepEqual((await readdir(service.root)).filter(n => n === "submitted"), ["submitted"]);
  } finally { await service?.close(); await f.cleanup(); }
});
test("structured review changed and missing evidence fail before effects", async () => {
  const f = await fixture(); let service: ReviewToolService | undefined;
  try {
    service = await ReviewToolService.create(join(f.root, "invocation"), f.snapshot, 60000, async () => {});
    await writeFile(f.file, "changed\n"); await assert.rejects(service.invoke("submit_verdict", { payloadJson: f.verdict() }));
    await assert.rejects(ReviewToolService.create(join(f.root, "other"), f.snapshot, 60000, async () => {}));
    await rm(f.file); await assert.rejects(ReviewToolService.create(join(f.root, "missing"), f.snapshot, 60000, async () => {}));
    await assert.rejects(readFile(join(service.root, "submitted", "verdict.json")), /ENOENT/);
  } finally { await service?.close(); await f.cleanup(); }
});
test("structured review byte excerpts make compact long JSON readable without splitting UTF-8", async () => {
  const f = await fixture(); let service: ReviewToolService | undefined;
  try {
    const text = "я".repeat(20000); await writeFile(f.file, text);
    f.snapshot.evidence = [await captureReviewSource("response", f.file, f.root, 3)];
    service = await ReviewToolService.create(join(f.root, "invocation"), f.snapshot, 60000, async () => {});
    const line = await service.invoke("read_evidence", { evidenceId: "response", startLine: 1, endLine: 1 }) as { text: string; truncated: boolean }; assert.equal(line.text, ""); assert.equal(line.truncated, true);
    const range = await service.invoke("read_evidence", { evidenceId: "response", startByte: 1, endByte: 8 }) as { text: string; returnedStartByte: number; returnedEndByte: number; sourceSha256: string };
    assert.equal(range.text, "яяя"); assert.equal(range.returnedStartByte, 2); assert.equal(range.returnedEndByte, 7); assert.equal(range.sourceSha256, reportSha(text));
    const large = await service.invoke("read_evidence", { evidenceId: "response", startByte: 0, endByte: 39999 }) as { text: string; returnedEndByte: number; truncated: boolean }; assert.equal(Buffer.byteLength(large.text), 32768); assert.equal(large.returnedEndByte, 32767); assert.equal(large.truncated, true);
  } finally { await service?.close(); await f.cleanup(); }
});
test("structured review submission never compensates for terminal failure", () => {
  assert.throws(() => assertReviewTerminal([JSON.stringify({type:"item.completed",item:{type:"error"}}), JSON.stringify({type:"turn.completed"})], 0, false, false), /ITEM_ERROR/);
  for (const [code, timeout, cancelled, lines] of [[1, false, false, ['{"type":"turn.completed"}']], [0, true, false, ['{"type":"turn.completed"}']], [0, false, true, ['{"type":"turn.completed"}']], [0, false, false, []], [0, false, false, ['{"type":"turn.failed"}']], [0, false, false, ['{"type":"error","message":"unexpected"}', '{"type":"turn.completed"}']]] as Array<[number, boolean, boolean, string[]]>) { const events = reportEvents(); lines.forEach(line => events.consume(line)); assert.throws(() => events.assertSuccess(code, timeout, cancelled)); }
  const diagnostic = (n: number) => JSON.stringify({ type: "error", message: `Reconnecting... ${n}/5 (unexpected status 403 Forbidden: blocked, url: wss://chatgpt.com/backend-api/codex/responses, cf-ray: abc-123)` });
  const fallback = JSON.stringify({ type: "item.completed", item: { type: "error", message: "Falling back from WebSockets to HTTPS transport. unexpected status 403 Forbidden: blocked, url: wss://chatgpt.com/backend-api/codex/responses, cf-ray: abc-123" } });
  const complete = '{"type":"turn.completed"}';
  assertReviewTerminal([1, 2, 3, 4, 5].map(diagnostic).concat(fallback, complete), 0, false, false);
  for (const lines of [[1, 2, 3, 4].map(diagnostic).concat(fallback, complete), [1, 2, 3, 4, 5].map(diagnostic).concat(fallback, fallback, complete), [1, 2, 3, 4, 5].map(diagnostic).concat(complete, fallback)]) assert.throws(() => assertReviewTerminal(lines, 0, false, false));
  for (const ordinals of [[1, 2], [1, 1], [2, 1]]) { const events = reportEvents(); ordinals.forEach(n => events.consume(diagnostic(n))); events.consume('{"type":"turn.completed"}'); if (ordinals[1] > ordinals[0]) events.assertSuccess(0, false, false); else assert.throws(() => events.assertSuccess(0, false, false)); }
});
test("GIS handoff fails before dispatch on missing response, second finalizer, baseline or verification level", () => {
  const paths = ["selection.json", "manifest.json", "completion.json", "receipt.json", "publication.json", "canonical-finalizer/run-result.json", "isolated-finalizer/run-result.json", ...Array.from({ length: 5 }, (_, i) => [`bundle-${i}.json`, `response-${i}.json`, `validated-artifacts/validation-${i}.json`, `performance-baseline-${i}.json`]).flat()].map(n => `runs/batch/${n}`);
  const artifacts = Object.fromEntries(paths.map(p => [p, "a".repeat(64)]));
  assert.deepEqual(assertGisReviewInventory(artifacts, "runs/batch", 5, true), paths);
  for (const path of ["response-4.json", "isolated-finalizer/run-result.json", "performance-baseline-1.json"]) { const copy = { ...artifacts }; delete copy[`runs/batch/${path}`]; assert.throws(() => assertGisReviewInventory(copy, "runs/batch", 5, true), /MANDATORY_MISSING/); }
  const finalizer = { status: "success", verification: { status: "passed", verificationLevel: "finalized-input-artifacts" }, checks: [{ status: "passed" }], coverageDelta: { selectedCells: 5, completedCells: 0, returnedCells: 5 }, limitations: ["calibration-only"] };
  assertReviewFinalizer(finalizer); assert.equal(finalizer.coverageDelta.completedCells, 0); assert.deepEqual(finalizer.limitations, ["calibration-only"]);
  assert.throws(() => assertReviewFinalizer({ ...finalizer, verification: { status: "passed" } }), /FINALIZER_INVALID/);
});
test("review provider boundary disables every configured MCP and builtin effect surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "review-provider-boundary-"));
  try {
    const script = join(root, "config.cjs"); await writeFile(script, 'console.log(JSON.stringify([{name:"custom-server"},{name:"cua_repl"},{name:"orchestrator_review"}]))');
    const args = await reviewProviderBoundary(process.execPath, root, process.env, script);
    for (const value of ["mcp_servers.custom-server.enabled=false", "mcp_servers.cua_repl.enabled=false", "mcp_servers.orchestrator_review.enabled=false", "features.shell_tool=false", "features.unified_exec=false", "features.apps=false", "features.multi_agent=false"]) assert.ok(args.includes(value));
    await writeFile(script, 'console.log(JSON.stringify([{name:"unsafe.name"}]))'); await assert.rejects(reviewProviderBoundary(process.execPath, root, process.env, script), /CONFIGURATION_INVALID/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test("structured GIS targets [3,4] preserve three sibling response objects exactly", () => {
  const previous = Array.from({ length: 5 }, (_, i) => ({ reviewedUnits: [], findings: [], limitations: [`response ${i}`] })); const originals = previous.map(v => JSON.stringify(v));
  const targets = validateGisStructuredTargets([3, 4], 5); const response = { reviewedUnits: [], findings: [], limitations: ["fixed"] };
  const result = applyGisResponsePatches(previous, targets, { patches: [{ index: 3, response }, { index: 4, response }] });
  for (const index of [0, 1, 2]) { assert.equal(result[index], previous[index]); assert.equal(JSON.stringify(result[index]), originals[index]); }
  assert.deepEqual(result[3], response); assert.deepEqual(result[4], response);
  for (const bad of [[3, 3], [3, 5], [], [4, 3], [-1]]) assert.throws(() => validateGisStructuredTargets(bad, 5));
});
test("review MCP exposes only two reviewer tools and rejects executor authority", async () => {
  const f = await fixture(); let service: ReviewToolService | undefined; let mcp: Awaited<ReturnType<typeof startReportMcp>> | undefined;
  try {
    service = await ReviewToolService.create(join(f.root, "invocation"), f.snapshot, 60000, async () => {}); mcp = await startReportMcp(service, { name: "orchestrator_review", definitions: reviewToolDefinitions() });
    assert.deepEqual(reviewToolDefinitions().map(t => t.name), ["read_evidence", "submit_verdict"]);
    assert.ok(mcp.args[1].includes("mcp_servers.orchestrator_review=")); assert.ok(!mcp.args[1].includes("validate_report"));
    for (const name of ["submit_report", "patch_report", "validate_report", "shell"]) await assert.rejects(service.invoke(name, {}), /UNKNOWN_TOOL/);
  } finally { await mcp?.close(); await service?.close(); await f.cleanup(); }
});
