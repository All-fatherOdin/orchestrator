// Explicit synthetic transport verification, never a queue or installed smoke.
// node --import tsx scripts/structured-review-preflight.mjs ABSOLUTE_CODEX_BIN
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join, isAbsolute } from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { assertReviewTerminal, ReviewToolService, captureReviewSource, reviewProviderBoundary, reviewToolDefinitions, replayStructuredReview } from "../server/structured-review.ts";
import { startReportMcp, reportToolCompletionSchemaBytes, assertReportToolCompletion } from "../server/agent-report-tools.ts";
import { reportSha, reportEvents } from "../server/agent-report.ts";

const bin = process.argv[2]; assert.ok(bin && isAbsolute(bin), "Supply exact absolute Codex binary");
const root = resolve("queues", "agent-review-stage3-20261006", `cli-${randomBytes(8).toString("hex")}`); await mkdir(root, { recursive: true });
const source = join(root, "source.json"); await writeFile(source, JSON.stringify({ sourceRunStatus: "failed", writerStatus: "completed", writerReviewStatus: "approved", currentFinalReview: "pending", nativeStatus: "success", coverage: { selected: 5, completed: 0, returned: 5 }, limitations: ["calibration-only"] }, null, 2));
const snapshot = { identity: { runId: "synthetic-review", taskId: "synthetic-task", invocationId: randomBytes(16).toString("hex"), ordinal: 1, phase: "reviewer" }, context: { synthetic: true }, evidence: [await captureReviewSource("source", source, root)] };
const storage = join(root, "invocation");
const service = await ReviewToolService.create(storage, snapshot, 120000, async () => {});
const mcp = await startReportMcp(service, { name: "orchestrator_review", definitions: reviewToolDefinitions() });
const schema = join(root, "schema.json"), final = join(root, "cli-final.json"); await writeFile(schema, reportToolCompletionSchemaBytes());
const payloadJson = JSON.stringify({ protocolVersion: "invocation-mcp-v1", invocationId: snapshot.identity.invocationId, snapshotSha256: reportSha(JSON.stringify(snapshot)), status: "approved", reason: "", remarks: [] });
const prompt = `This is a synthetic MCP transport verification. Use only orchestrator_review tools. Call read_evidence with evidenceId source,startLine 1,endLine 200. Then call read_evidence with evidenceId source,startByte 0,endByte 31. Then call submit_verdict with payloadJson exactly ${JSON.stringify(payloadJson)}. Repeat the identical submit once to verify acknowledgement replay. No other tools or shell. Return exactly {"outcome":"completed","reason":""}. No coverage completion is claimed.`;
const boundary = await reviewProviderBoundary(bin, root, process.env);
const events = reportEvents(); let pending = "", stdout = "", stderr = "", timedOut = false, code;
try {
  const child = spawn(bin, ["exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "--json", "--sandbox", "read-only", "-C", root, "-m", "gpt-5.6-terra", ...boundary, ...mcp.args, "-c", "mcp_servers.orchestrator_review.enabled=true", "--output-schema", schema, "-o", final, prompt], { cwd: root, env: { ...process.env, ...mcp.environment }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", bytes => { const safe = mcp.redact(bytes.toString()); stdout += safe; pending += safe; const lines = pending.split(/\r?\n/u); pending = lines.pop(); lines.filter(Boolean).forEach(line => events.consume(line)); });
  child.stderr.on("data", bytes => stderr += mcp.redact(bytes.toString()));
  const timer = setTimeout(() => { timedOut = true; service.revoke(); if (process.platform === "win32") spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); else child.kill("SIGKILL"); }, 120000);
  try { code = await new Promise((done, fail) => { child.once("error", fail); child.once("close", done); }); } finally { clearTimeout(timer); }
  if (pending.trim()) events.consume(pending);
  stdout = mcp.redact(stdout); stderr = mcp.redact(stderr);
  await writeFile(join(root, "events.jsonl"), stdout); await writeFile(join(root, "stderr.txt"), stderr);
  events.assertSuccess(code, timedOut, false); assertReviewTerminal(stdout.split(/\r?\n/u).filter(Boolean), code, timedOut, false); assertReportToolCompletion(await readFile(final, "utf8"));
  const verdict = await service.assertSubmitted(); assert.equal(verdict.status, "approved");
  await mcp.close();
  const lines = stdout.split(/\r?\n/u).filter(Boolean);
  const terminal = JSON.stringify({ code, timedOut, cancelled: false, lines }); await writeFile(join(storage, "terminal.json"), terminal);
  const receipt = { identity: snapshot.identity, snapshotSha256: reportSha(JSON.stringify(snapshot)), verdictSha256: reportSha(payloadJson), terminalSha256: reportSha(terminal), closedStateSha256: reportSha(await readFile(join(storage, "state.json"))) };
  await replayStructuredReview(storage, receipt);
  const calls = lines.map(JSON.parse).filter(e => e.type === "item.completed" && e.item?.type === "mcp_tool_call").map(e => ({ server: e.item.server, tool: e.item.tool, status: e.item.status }));
  assert.deepEqual(calls.map(c => c.tool), ["read_evidence", "read_evidence", "submit_verdict", "submit_verdict"]); assert.ok(calls.every(c => c.server === "orchestrator_review" && c.status === "completed"));
  await assert.rejects(service.invoke("submit_verdict", { payloadJson }), /CLOSED/);
  const evidence = { status: "passed", synthetic: true, installedSmoke: false, providerSha256: reportSha(await readFile(bin)), code, receipt, calls, storage, events: join(root, "events.jsonl"), stderr: join(root, "stderr.txt") };
  await writeFile(join(root, "evidence.json"), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ status: "passed", evidence: join(root, "evidence.json") }));
} finally { await mcp.close(); }
