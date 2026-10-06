// Explicit synthetic CLI test. Run with node --import tsx; never launches a queue.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { ReportToolService, startReportMcp, reportToolCompletionSchemaBytes, assertReportToolCompletion } from "../server/agent-report-tools.ts";
import { reportSha, reportEvents, replayReport } from "../server/agent-report.ts";
import { prepareGisResponses } from "../server/gis-quality.ts";

const bin = process.argv[2]; assert.ok(bin && isAbsolute(bin), "Supply exact absolute Codex executable as argument");
const root = await mkdtemp(join(tmpdir(), "report-cli-preflight-"));
const evidence = { date: new Date().toISOString(), root, provider: { path: bin, sha256: reportSha(await readFile(bin)), version: execFileSync(bin, ["--version"], { encoding: "utf8", windowsHide: true }).trim() }, transport: "Streamable HTTP; host-owned IPv4 loopback; per-invocation -c; bearer env", nativeValidation: "Synthetic host callback only; not actual GIS native runtime", runs: [] };
for (const mode of ["full", "patch"]) {
  const storage = join(root, mode), sourceRoot = join(root, `${mode}-source`); await mkdir(storage); await mkdir(sourceRoot);
  const bundles = ["one.ts", "two.ts"].map(primaryFile => ({ rules: ["ONE"], reviewUnits: [{ primary: { path: primaryFile }, completeForProfile: true, signals: [{ ruleId: "ONE" }] }] }));
  const response = { reviewedUnits: [], findings: [], limitations: [] }, previous = [{ ...response, preserved: "synthetic sibling bytes" }, response];
  const payloadJson = JSON.stringify(mode === "full" ? { responses: [response, response] } : { patches: [{ index: 1, response }] });
  const source = join(sourceRoot, "bundle.json"), bytes = JSON.stringify(bundles, null, 2) + "\n"; await writeFile(source, bytes);
  const reportSchemaPath = join(sourceRoot, "report-schema.json"), reportSchemaBytes = JSON.stringify({ type: "object", required: ["reviewedUnits", "findings", "limitations"] }); await writeFile(reportSchemaPath, reportSchemaBytes);
  const id = { runId: "synthetic-cli", taskId: mode, invocationId: mode === "full" ? "a".repeat(32) : "b".repeat(32), ordinal: 1, phase: "executor", mode, transport: "invocation-mcp-v1" };
  let validations = 0;
  const service = await ReportToolService.create(storage, id, { evidence: [{ id: "bundle-0", path: source, root: sourceRoot, sha256: reportSha(bytes) }, { id: "report-schema", path: reportSchemaPath, root: sourceRoot, sha256: reportSha(reportSchemaBytes) }], guard: async () => {}, validate: async raw => { validations++; prepareGisResponses(bundles, mode === "patch" ? previous : undefined, mode === "patch" ? [1] : [0, 1], JSON.parse(raw)); return []; } }, 90000);
  const mcp = await startReportMcp(service), schema = join(storage, "completion-schema.json"), final = join(storage, "cli-final.json"); await writeFile(schema, reportToolCompletionSchemaBytes());
  const args = ["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--json", "--sandbox", "read-only", "-C", sourceRoot, "-m", "gpt-5.6-terra", "--output-schema", schema, "-o", final, ...mcp.args];
  const prompt = `Use the orchestrator_report MCP tools, discovering them with tool search if necessary. Call read_evidence with evidenceId bundle-0, startLine 1, endLine 200. Next call read_evidence with evidenceId report-schema, startLine 1, endLine 200. Call validate_report with the exact payloadJson string ${JSON.stringify(payloadJson)}. Then call ${mode === "full" ? "submit_report" : "patch_report"} with that same string. Repeat that submission once to confirm idempotency. Return {"outcome":"completed","reason":""} only if successful. No shell, writing, network or other tools. This is a synthetic fixture.`;
  const terminal = reportEvents(); let rawOut = "", rawErr = "", lineBuffer = "", timedOut = false;
  try {
    const child = spawn(bin, [...args, prompt], { cwd: sourceRoot, env: { ...process.env, ...mcp.environment }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", b => { rawOut += b; lineBuffer += b; const lines = lineBuffer.split(/\r?\n/u); lineBuffer = lines.pop(); for (const line of lines) if (line) terminal.consume(line); });
    child.stderr.on("data", b => { rawErr += b; });
    const timer = setTimeout(() => { timedOut = true; service.revoke(); if (process.platform === "win32") spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else child.kill("SIGKILL"); }, 90000);
    const exitCode = await new Promise((done, fail) => { child.once("error", fail); child.once("close", done); }); clearTimeout(timer);
    await writeFile(join(storage, "events.jsonl"), rawOut); await writeFile(join(storage, "stderr.txt"), rawErr);
    terminal.assertSuccess(exitCode, timedOut, false); assertReportToolCompletion(await readFile(final, "utf8"));
    const submission = await service.assertSubmitted(); assert.equal(submission.payloadJson, payloadJson); assert.equal(validations, 1);
    const calls = rawOut.split(/\r?\n/u).filter(Boolean).map(JSON.parse).filter(e => e.type === "item.completed" && e.item?.type === "mcp_tool_call").map(e => ({ server: e.item.server, tool: e.item.tool, status: e.item.status }));
    assert.deepEqual(calls.map(c => c.tool), ["read_evidence", "read_evidence", "validate_report", mode === "full" ? "submit_report" : "patch_report", mode === "full" ? "submit_report" : "patch_report"]);
    await mcp.close();
    assert.equal(await replayReport(join(storage, "submitted", "result.json"), join(storage, "submitted", "schema.json"), join(storage, "submitted", "receipt.json"), JSON.parse(JSON.stringify(id))), payloadJson);
    await assert.rejects(service.invoke("submit_report", { payloadJson }));
    evidence.runs.push({ mode, exitCode, calls, validations, receipt: submission.receipt, artifacts: { events: join(storage, "events.jsonl"), completion: final, state: join(storage, "tools-state.json"), submitted: join(storage, "submitted") }, replayWithoutAnalysis: true, closedInvocationRejected: true });
  } finally { await mcp.close(); }
}
await writeFile(join(root, "preflight-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
console.log(JSON.stringify({ root, evidence: join(root, "preflight-evidence.json"), fullAndPatch: "passed" }));
