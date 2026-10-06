import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { open, lstat, readFile, writeFile, mkdir, rename, mkdtemp } from "node:fs/promises";
import { join, resolve, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { assertPlainPath } from "./isolated-artifacts.ts";
import { assertNoWindowsReparsePoints, reportToolDefinitions } from "./agent-report-tools.ts";
import { REPORT_LIMIT, readReport, reportSha, uniqueJson, reportEvents } from "./agent-report.ts";

export const structuredReviewImplementationIdentity = (() => {
  const path = typeof import.meta.url === "string" && import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : resolve(process.argv[1]);
  return { path, sha256: reportSha(readFileSync(path)) };
})();
export const REVIEW_LIMITS = Object.freeze({ calls: 64, inputBytes: 4 * REPORT_LIMIT, outputBytes: 2 * REPORT_LIMIT, hashBytes: 128 * REPORT_LIMIT, sourceBytes: 8 * REPORT_LIMIT, lifetimeMs: 900_000 });
/** Disable configured MCP servers by exact discovered name; an empty table merges
 * with user configuration and therefore cannot establish an allow-list. Never
 * log or persist configuration output, which may contain connection data. */
export async function reviewProviderBoundary(executable: string, cwd: string, env: NodeJS.ProcessEnv, testScript?: string) {
  const raw = await new Promise<string>((done, fail) => execFile(executable, [...(testScript ? [testScript] : []), "mcp", "list", "--json"], { cwd, env, windowsHide: true, timeout: 10000, maxBuffer: REPORT_LIMIT }, (error, stdout) => error ? fail(new Error("REVIEW_MCP_CONFIGURATION_UNAVAILABLE")) : done(stdout)));
  const configured = uniqueJson(raw) as Array<{ name: string }>;
  assert.ok(Array.isArray(configured) && configured.length <= 128, "REVIEW_MCP_CONFIGURATION_INVALID");
  assert.ok(configured.every(s => typeof s.name === "string" && /^[A-Za-z0-9_-]{1,120}$/u.test(s.name)) && new Set(configured.map(s => s.name)).size === configured.length, "REVIEW_MCP_CONFIGURATION_INVALID");
  // Ignore-user-config removes inherited transport fields. Keep disabled entries
  // syntactically valid without carrying any inherited connection credentials.
  return [...configured.flatMap(s => ["-c", `mcp_servers.${s.name}.url="http://127.0.0.1:1/mcp"`, "-c", `mcp_servers.${s.name}.enabled=false`]), ...["shell_tool", "unified_exec", "apps", "browser_use", "browser_use_external", "computer_use", "multi_agent", "workspace_dependencies", "skill_mcp_dependency_install", "view_image"].flatMap(name => ["-c", `features.${name}=false`]), "-c", "features.code_mode_host=true", "-c", 'web_search="disabled"'];
}
export function assertReviewTerminal(lines: string[], code: number | null, timedOut: boolean, cancelled: boolean) {
  const events = reportEvents(); let fallback = false;
  for (const line of lines) {
    events.consume(line);
    const event = uniqueJson(line) as { type?: string; item?: { type?: string; message?: unknown } };
    if (event.item?.type === "error") {
      const counts = events.snapshot().counts;
      const knownFallback = event.type === "item.completed" && typeof event.item.message === "string" && Buffer.byteLength(event.item.message) <= 4096 && /^Falling back from WebSockets to HTTPS transport\. unexpected status 403 Forbidden:[\s\S]*, url: wss:\/\/chatgpt\.com\/backend-api\/codex\/responses, cf-ray: [A-Za-z0-9-]+$/u.test(event.item.message);
      assert.ok(knownFallback && !fallback && counts.transportRetries === 5 && counts.errors === 5 && counts.completed === 0, "REVIEW_TERMINAL_ITEM_ERROR"); fallback = true;
    }
  }
  events.assertSuccess(code, timedOut, cancelled);
}
export type ReviewIdentity = { runId: string; taskId: string; invocationId: string; ordinal: number; phase: "reviewer" };
export type ReviewSource = { id: string; path: string; root: string; sha256: string; sizeBytes: number; responseIndex: number | null };
export type ReviewSnapshot = { identity: ReviewIdentity; context: unknown; evidence: ReviewSource[] };
export type ReviewVerdict = { protocolVersion: "invocation-mcp-v1"; invocationId: string; snapshotSha256: string; status: "approved" | "changes_requested" | "unavailable"; reason: string; remarks: Array<{ evidenceId: string; field: string; category: "correctness" | "scope" | "evidence"; message: string; responseIndex: number | null }> };
export type ReviewReceipt = { identity: ReviewIdentity; snapshotSha256: string; verdictSha256: string; terminalSha256: string; closedStateSha256: string };
export function assertGisReviewInventory(artifacts: Record<string, string>, runPath: string, count: number, performance: boolean) {
  const required = ["selection.json", "manifest.json", "completion.json", "receipt.json", "publication.json", "canonical-finalizer/run-result.json", "isolated-finalizer/run-result.json", ...Array.from({ length: count }, (_, i) => [`bundle-${i}.json`, `response-${i}.json`, `validated-artifacts/validation-${i}.json`, ...(performance ? [`performance-baseline-${i}.json`] : [])]).flat()].map(name => `${runPath}/${name}`);
  for (const path of required) assert.ok(Object.hasOwn(artifacts, path), `REVIEW_MANDATORY_MISSING: ${path}`);
  return required;
}
export function assertReviewFinalizer(value: unknown) {
  const v = value as { status: string; verification?: { status: string; verificationLevel: string }; checks: unknown[] };
  assert.ok(v?.status === "success" && v.verification?.status === "passed" && typeof v.verification?.verificationLevel === "string" && v.verification.verificationLevel.trim() && Array.isArray(v.checks), "REVIEW_FINALIZER_INVALID");
}
const keys = (value: unknown, names: string[]) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "REVIEW_SHAPE");
  assert.deepEqual(Object.keys(value).sort(), [...names].sort(), "REVIEW_SHAPE");
};
const boundedString = (v: unknown, limit: number, nonblank = true) => { assert.equal(typeof v, "string"); assert.ok(Buffer.byteLength(v as string) <= limit && (!nonblank || (v as string).trim()), "REVIEW_STRING_LIMIT"); };
export function decodeReviewVerdict(raw: string, snapshot: ReviewSnapshot): ReviewVerdict {
  assert.ok(Buffer.byteLength(raw) <= 65536, "REVIEW_VERDICT_LIMIT");
  const v = uniqueJson(raw) as ReviewVerdict;
  keys(v, ["protocolVersion", "invocationId", "snapshotSha256", "status", "reason", "remarks"]);
  assert.equal(v.protocolVersion, "invocation-mcp-v1"); assert.equal(v.invocationId, snapshot.identity.invocationId);
  assert.equal(v.snapshotSha256, reportSha(JSON.stringify(snapshot)), "REVIEW_SNAPSHOT_MISMATCH");
  assert.ok(["approved", "changes_requested", "unavailable"].includes(v.status));
  boundedString(v.reason, 4096, v.status !== "approved");
  assert.ok(Array.isArray(v.remarks) && v.remarks.length <= 32);
  if (v.status === "approved") { assert.equal(v.reason, ""); assert.equal(v.remarks.length, 0); }
  if (v.status === "unavailable") assert.equal(v.remarks.length, 0);
  if (v.status === "changes_requested") assert.ok(v.remarks.length);
  const seen = new Set<string>();
  for (const remark of v.remarks) {
    keys(remark, ["evidenceId", "field", "category", "message", "responseIndex"]);
    boundedString(remark.field, 1024); boundedString(remark.message, 4096);
    assert.ok(["correctness", "scope", "evidence"].includes(remark.category));
    const evidence = snapshot.evidence.find(e => e.id === remark.evidenceId); assert.ok(evidence, "REVIEW_UNKNOWN_EVIDENCE");
    assert.ok(remark.responseIndex === null || Number.isSafeInteger(remark.responseIndex) && remark.responseIndex >= 0);
    assert.equal(remark.responseIndex, evidence.responseIndex, "REVIEW_TARGET_MISMATCH");
    const target = remark.responseIndex === null ? `${remark.evidenceId}\0${remark.field}` : `response:${remark.responseIndex}`; assert.ok(!seen.has(target), "REVIEW_DUPLICATE_TARGET"); seen.add(target);
  }
  return v;
}

/** Read exact host paths through two open handles; never grant agent path discovery. */
export async function readReviewSource(source: ReviewSource, checkAttributes = true): Promise<string> {
  assert.equal(resolve(source.path), source.path); assert.equal(resolve(source.root), source.root);
  await assertPlainPath(source.root, source.path); await assertPlainPath(parse(source.path).root, source.path);
  if (checkAttributes) await assertNoWindowsReparsePoints([source.path]);
  const handle = await open(source.path, "r");
  try {
    const before = await handle.stat({ bigint: true });
    assert.ok(before.isFile() && before.nlink === 1n && before.size === BigInt(source.sizeBytes) && before.size <= BigInt(REPORT_LIMIT), "REVIEW_SOURCE_LIMIT");
    const raw = await readReport(source.path);
    const other = await open(source.path, "r");
    try {
      const after = await other.stat({ bigint: true });
      assert.ok(before.ino === after.ino && before.dev === after.dev && before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs, "REVIEW_SOURCE_CHANGED");
    } finally { await other.close(); }
    assert.equal(Buffer.byteLength(raw), source.sizeBytes); assert.equal(reportSha(raw), source.sha256, "REVIEW_SOURCE_CHANGED");
    await assertPlainPath(parse(source.path).root, source.path); if (checkAttributes) await assertNoWindowsReparsePoints([source.path]);
    return raw;
  } finally { await handle.close(); }
}
export async function captureReviewSource(id: string, path: string, root: string, responseIndex: number | null = null): Promise<ReviewSource> {
  await assertPlainPath(root, path); await assertNoWindowsReparsePoints([path]);
  const stat = await lstat(path); assert.ok(stat.isFile() && stat.nlink === 1 && stat.size <= REPORT_LIMIT, "REVIEW_SOURCE_LIMIT");
  const raw = await readReport(path);
  const source = { id, path, root, sha256: reportSha(raw), sizeBytes: Buffer.byteLength(raw), responseIndex };
  await readReviewSource(source); return source;
}
export const reviewToolDefinitions = () => [{ ...reportToolDefinitions()[0], description: "Read exact declared evidence using either inclusive line bounds or inclusive zero-based UTF-8 byte bounds. Byte boundaries are adjusted to complete characters; returned offsets are authoritative.", inputSchema: { type: "object", anyOf: [reportToolDefinitions()[0].inputSchema, { type: "object", additionalProperties: false, required: ["evidenceId", "startByte", "endByte"], properties: { evidenceId: { type: "string" }, startByte: { type: "integer", minimum: 0 }, endByte: { type: "integer", minimum: 0 } } }] } }, {
  name: "submit_verdict", description: "Seal one structured independent verdict for this invocation; submission never approves or publishes.",
  inputSchema: { type: "object", additionalProperties: false, required: ["payloadJson"], properties: { payloadJson: { type: "string" } } },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
}];
type State = { identity: ReviewIdentity; snapshotSha256: string; limits: { [K in keyof typeof REVIEW_LIMITS]: number }; calls: number; inputBytes: number; outputBytes: number; hashBytes: number; status: "active" | "sealed" | "closed" | "stopped" };
export class ReviewToolService {
  private chain: Promise<unknown> = Promise.resolve();
  private controller = new AbortController();
  private alive = true;
  private started = Date.now();
  private privateValues: string[] = [];
  private expectedState = "";
  private timer?: ReturnType<typeof setTimeout>;
  private constructor(readonly root: string, readonly snapshot: ReviewSnapshot, private guard: () => Promise<void>, private state: State, private boundary?: (name: string) => Promise<void>) {}
  get signal() { return this.controller.signal; }
  protectConnection(values: string[]) { this.privateValues = [...values]; }
  revoke() { this.alive = false; this.controller.abort(); if (this.timer) clearTimeout(this.timer); }
  static async create(root: string, snapshot: ReviewSnapshot, lifetimeMs: number, guard: () => Promise<void>, boundary?: (name: string) => Promise<void>) {
    assert.ok(snapshot.evidence.length > 0 && snapshot.evidence.length <= 256 && new Set(snapshot.evidence.map(e => e.id)).size === snapshot.evidence.length);
    assert.ok(snapshot.evidence.every(s => Number.isSafeInteger(s.sizeBytes) && s.sizeBytes >= 0 && s.sizeBytes <= REPORT_LIMIT), "REVIEW_SOURCE_LIMIT");
    const sourceBytes = snapshot.evidence.reduce((n, s) => n + s.sizeBytes, 0); assert.ok(sourceBytes <= REVIEW_LIMITS.sourceBytes, "REVIEW_SOURCE_TOTAL_LIMIT");
    assert.ok(Number.isSafeInteger(lifetimeMs) && lifetimeMs > 0);
    keys(snapshot.identity, ["runId", "taskId", "invocationId", "ordinal", "phase"]); assert.equal(snapshot.identity.phase, "reviewer");
    for (const value of [snapshot.identity.runId, snapshot.identity.taskId]) assert.match(value, /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/u);
    assert.match(snapshot.identity.invocationId, /^[a-f0-9]{32}$/u); assert.ok(Number.isSafeInteger(snapshot.identity.ordinal) && snapshot.identity.ordinal > 0);
    await assertNoWindowsReparsePoints(snapshot.evidence.map(s => s.path));
    for (const source of snapshot.evidence) { assert.match(source.id, /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u); await readReviewSource(source, false); }
    await assertNoWindowsReparsePoints(snapshot.evidence.map(s => s.path));
    await guard(); await mkdir(root, { recursive: true }); await assertPlainPath(parse(root).root, root);
    const state: State = { identity: structuredClone(snapshot.identity), snapshotSha256: reportSha(JSON.stringify(snapshot)), limits: { ...REVIEW_LIMITS, lifetimeMs: Math.min(lifetimeMs, REVIEW_LIMITS.lifetimeMs) }, calls: 0, inputBytes: 0, outputBytes: 0, hashBytes: 6 * sourceBytes, status: "active" };
    const service = new ReviewToolService(root, structuredClone(snapshot), guard, state, boundary);
    await writeFile(join(root, "snapshot.json"), JSON.stringify(snapshot), { flag: "wx" });
    await writeFile(join(root, "state.json"), JSON.stringify(state), { flag: "wx" }); service.expectedState = JSON.stringify(state);
    service.timer = setTimeout(() => service.revoke(), state.limits.lifetimeMs); service.timer.unref();
    return service;
  }
  private async save() { const temp = join(this.root, `state-${randomBytes(8).toString("hex")}.tmp`); await writeFile(temp, JSON.stringify(this.state), { flag: "wx" }); await rename(temp, join(this.root, "state.json")); this.expectedState = JSON.stringify(this.state); }
  private async stop(): Promise<never> { this.state.status = "stopped"; await this.save(); this.revoke(); throw new Error("REVIEW_BUDGET_EXHAUSTED"); }
  private async fence() {
    assert.ok(this.alive && Date.now() - this.started < this.state.limits.lifetimeMs, "REVIEW_CLOSED");
    for (const name of ["snapshot.json", "state.json"]) await assertPlainPath(parse(this.root).root, join(this.root, name));
    assert.equal(await readFile(join(this.root, "state.json"), "utf8"), this.expectedState, "REVIEW_STATE_CHANGED");
    assert.equal(await readFile(join(this.root, "snapshot.json"), "utf8"), JSON.stringify(this.snapshot), "REVIEW_SNAPSHOT_CHANGED");
    // Conservatively reserve both frozen-file reads and the host's live-source fence.
    const bytes = 2 * this.snapshot.evidence.reduce((n, s) => n + s.sizeBytes, 0);
    if (this.state.hashBytes + bytes > this.state.limits.hashBytes) return this.stop();
    this.state.hashBytes += bytes; await this.save();
    await this.guard(); assert.ok(this.alive, "REVIEW_CLOSED");
    await assertNoWindowsReparsePoints([join(this.root, "state.json"), join(this.root, "snapshot.json"), ...this.snapshot.evidence.map(s => s.path)]);
    for (const source of this.snapshot.evidence) await readReviewSource(source, false);
    await assertNoWindowsReparsePoints(this.snapshot.evidence.map(s => s.path));
    assert.ok(this.alive, "REVIEW_CLOSED");
  }
  invoke(name: string, args: unknown) { const result = this.chain.catch(() => undefined).then(() => this.operation(name, args)); this.chain = result; return result; }
  private async operation(name: string, args: unknown): Promise<unknown> {
    await this.fence(); assert.ok(["read_evidence", "submit_verdict"].includes(name), "REVIEW_UNKNOWN_TOOL");
    const bytes = Buffer.byteLength(JSON.stringify(args));
    if (bytes > 65536 + 4096 || this.state.calls >= this.state.limits.calls || this.state.inputBytes + bytes > this.state.limits.inputBytes) return this.stop();
    this.state.calls++; this.state.inputBytes += bytes; await this.save();
    let result: unknown;
    if (name === "read_evidence") {
      assert.equal(this.state.status, "active", "REVIEW_SEALED");
      const byteRange = !!args && typeof args === "object" && Object.hasOwn(args, "startByte");
      keys(args, byteRange ? ["evidenceId", "startByte", "endByte"] : ["evidenceId", "startLine", "endLine"]);
      const { evidenceId, startLine, endLine } = args as { evidenceId: string; startLine: number; endLine: number };
      const source = this.snapshot.evidence.find(e => e.id === evidenceId); assert.ok(source, "REVIEW_UNKNOWN_EVIDENCE");
      if (this.state.hashBytes + source.sizeBytes > this.state.limits.hashBytes) return this.stop();
      this.state.hashBytes += source.sizeBytes; await this.save();
      const raw = await readReviewSource(source);
      if (byteRange) {
        const { startByte, endByte } = args as { startByte: number; endByte: number };
        const bytes = Buffer.from(raw); assert.ok(Number.isSafeInteger(startByte) && Number.isSafeInteger(endByte) && startByte >= 0 && endByte >= startByte && startByte < bytes.length);
        let start = startByte, end = Math.min(endByte + 1, bytes.length, startByte + 32768);
        while (start < end && (bytes[start] & 0xc0) === 0x80) start++;
        while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
        result = { evidenceId, sourceSha256: source.sha256, text: bytes.subarray(start, end).toString("utf8"), returnedStartByte: end > start ? start : null, returnedEndByte: end > start ? end - 1 : null, totalBytes: bytes.length, truncated: start !== startByte || end < Math.min(endByte + 1, bytes.length) };
      } else {
      assert.ok(Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine) && startLine > 0 && endLine >= startLine);
      const lines = raw.match(/[^\n]*\n|[^\n]+$/gu) ?? []; assert.ok(startLine <= lines.length);
      let text = "", end = startLine - 1;
      for (let i = startLine - 1; i < Math.min(endLine, lines.length, startLine + 199); i++) { if (Buffer.byteLength(text + lines[i]) > 32768) break; text += lines[i]; end = i + 1; }
      result = { evidenceId, sourceSha256: source.sha256, text, returnedStartLine: end >= startLine ? startLine : null, returnedEndLine: end >= startLine ? end : null, totalLines: lines.length, truncated: end < Math.min(endLine, lines.length) };
      }
    } else {
      keys(args, ["payloadJson"]); const { payloadJson } = args as { payloadJson: string }; assert.equal(typeof payloadJson, "string");
      const verdict = decodeReviewVerdict(payloadJson, this.snapshot);
      assert.ok(!this.privateValues.some(v => payloadJson.includes(v) || JSON.stringify(verdict).includes(v)), "REVIEW_PRIVATE_DATA");
      let committed = false;
      try { await lstat(join(this.root, "submitted")); committed = true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
      if (committed) assert.equal(await this.submission(), payloadJson, "REVIEW_SUBMISSION_CONFLICT");
      else {
        assert.equal(this.state.status, "active"); const scratch = await mkdtemp(join(this.root, "submission-"));
        await writeFile(join(scratch, "verdict.json"), payloadJson, { flag: "wx" });
        await writeFile(join(scratch, "receipt.json"), JSON.stringify({ identity: this.snapshot.identity, snapshotSha256: this.state.snapshotSha256, verdictSha256: reportSha(payloadJson) }), { flag: "wx" });
        await this.boundary?.("before-rename"); await this.fence(); await rename(scratch, join(this.root, "submitted")); await this.boundary?.("after-rename");
      }
      this.state.status = "sealed"; await this.save(); result = { submitted: true, verdictSha256: reportSha(payloadJson) };
    }
    const outputBytes = Buffer.byteLength(JSON.stringify(result)); if (this.state.outputBytes + outputBytes > this.state.limits.outputBytes) return this.stop();
    this.state.outputBytes += outputBytes; await this.save(); await this.fence(); return result;
  }
  private async submission() {
    const folder = join(this.root, "submitted");
    for (const name of ["verdict.json", "receipt.json"]) await assertPlainPath(parse(this.root).root, join(folder, name));
    const raw = await readReport(join(folder, "verdict.json")); decodeReviewVerdict(raw, this.snapshot);
    assert.deepEqual(uniqueJson(await readReport(join(folder, "receipt.json"))), { identity: this.snapshot.identity, snapshotSha256: this.state.snapshotSha256, verdictSha256: reportSha(raw) }, "REVIEW_RECEIPT_CHANGED"); return raw;
  }
  async assertSubmitted() { await this.chain.catch(() => undefined); await this.fence(); assert.equal(this.state.status, "sealed", "REVIEW_NOT_SUBMITTED"); return decodeReviewVerdict(await this.submission(), this.snapshot); }
  async close() { this.revoke(); await this.chain.catch(() => undefined); if (this.state.status !== "closed") { this.state.status = "closed"; await this.save(); } }
}
export async function replayStructuredReview(root: string, expected: ReviewReceipt): Promise<ReviewVerdict> {
  await assertNoWindowsReparsePoints([root, ...["snapshot.json", "state.json", "terminal.json", "submitted/verdict.json", "submitted/receipt.json"].map(name => join(root, name))]);
  for (const name of ["snapshot.json", "state.json", "terminal.json", "submitted/verdict.json", "submitted/receipt.json"]) await assertPlainPath(parse(root).root, join(root, name));
  const snapshot = uniqueJson(await readReport(join(root, "snapshot.json"))) as ReviewSnapshot;
  assert.deepEqual(snapshot.identity, expected.identity); assert.equal(reportSha(JSON.stringify(snapshot)), expected.snapshotSha256);
  const raw = await readReport(join(root, "submitted/verdict.json")); assert.equal(reportSha(raw), expected.verdictSha256);
  assert.deepEqual(uniqueJson(await readReport(join(root, "submitted/receipt.json"))), { identity: expected.identity, snapshotSha256: expected.snapshotSha256, verdictSha256: expected.verdictSha256 });
  const stateRaw = await readReport(join(root, "state.json")); assert.equal(reportSha(stateRaw), expected.closedStateSha256);
  const state = uniqueJson(stateRaw) as State; assert.equal(state.status, "closed"); assert.deepEqual(state.identity, expected.identity); assert.equal(state.snapshotSha256, expected.snapshotSha256);
  keys(state, ["identity", "snapshotSha256", "limits", "calls", "inputBytes", "outputBytes", "hashBytes", "status"]);
  assert.ok(Number.isSafeInteger(state.limits.lifetimeMs) && state.limits.lifetimeMs > 0 && state.limits.lifetimeMs <= REVIEW_LIMITS.lifetimeMs);
  assert.deepEqual(state.limits, { ...REVIEW_LIMITS, lifetimeMs: state.limits.lifetimeMs });
  for (const key of ["calls", "inputBytes", "outputBytes", "hashBytes"] as const) assert.ok(Number.isSafeInteger(state[key]) && state[key] >= 0 && state[key] <= state.limits[key], "REVIEW_COUNTER_INVALID");
  const terminalRaw = await readReport(join(root, "terminal.json")); assert.equal(reportSha(terminalRaw), expected.terminalSha256);
  const terminal = uniqueJson(terminalRaw) as { code: number | null; timedOut: boolean; cancelled: boolean; lines: string[] };
  assertReviewTerminal(terminal.lines, terminal.code, terminal.timedOut, terminal.cancelled);
  await assertNoWindowsReparsePoints(snapshot.evidence.map(s => s.path));
  for (const source of snapshot.evidence) await readReviewSource(source, false);
  await assertNoWindowsReparsePoints(snapshot.evidence.map(s => s.path));
  return decodeReviewVerdict(raw, snapshot);
}
