import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { open, lstat, readFile, writeFile, rename, mkdir, mkdtemp } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { TextDecoder } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { assertPlainPath } from "./isolated-artifacts.ts";
import { REPORT_LIMIT, reportSha, uniqueJson, replayReport, makeReportReceipt, readReport, submitReportAtomically, type ReportIdentity } from "./agent-report.ts";

export const reportToolsImplementationIdentity = (() => {
  const path = typeof import.meta.url === "string" && import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : resolve(process.argv[1]);
  return { path, sha256: reportSha(readFileSync(path)) };
})();
export type ReportToolError = { responseIndex: number | null; primaryFile: string | null; field: string; code: string; diagnostic?: string; diagnosticSha256?: string };
export type ReportEvidence = { id: string; path: string; root: string; sha256: string };
export type ReportToolContext = {
  evidence: ReportEvidence[];
  guard: () => Promise<void>;
  validate: (payloadJson: string, scratch: string, signal: AbortSignal, timeoutMs: number) => Promise<ReportToolError[]>;
};
export const REPORT_TOOL_LIMITS = Object.freeze({ calls: 64, inputBytes: 4 * REPORT_LIMIT, outputBytes: 2 * REPORT_LIMIT, readBytes: 2 * REPORT_LIMIT, hashBytes: 128 * REPORT_LIMIT, validations: 2, validationMs: 60_000, lifetimeMs: 900_000, lines: 200, fragmentBytes: 32768 });
export const reportToolCompletionSchemaBytes = () => `${JSON.stringify({ type: "object", additionalProperties: false, required: ["outcome", "reason"], properties: { outcome: { type: "string", enum: ["completed", "stopped"] }, reason: { type: "string" } } }, null, 2)}\n`;
export function assertReportToolCompletion(raw: string) {
  const result = uniqueJson(raw) as { outcome: string; reason: string };
  closedKeys(result, ["outcome", "reason"]); assert.equal(result.outcome, "completed", "TOOL_PROCESS_STOPPED"); assert.equal(result.reason, "");
}
type ToolLimits = { [K in keyof typeof REPORT_TOOL_LIMITS]: number };
type ToolState = { identity: ReportIdentity; evidenceSha256: string; limits: ToolLimits; calls: number; inputBytes: number; outputBytes: number; readBytes: number; hashBytes: number; validations: number; validationMs: number; status: "active" | "sealed" | "stopped" | "closed"; errorFingerprints: string[] };
const closedKeys = (v: unknown, keys: string[]) => {
  assert.ok(v && typeof v === "object" && !Array.isArray(v), "INVALID_ARGUMENTS");
  assert.deepEqual(Object.keys(v).sort(), keys.slice().sort(), "INVALID_ARGUMENTS");
};
const boundedError = (code: string): ReportToolError => ({ responseIndex: null, primaryFile: null, field: "$", code });
/** Node's link stat does not identify every Windows reparse tag (e.g. cloud files).
 * Inspect attributes of only the exact host paths and their ancestors; no shell
 * interpolation, discovery, scripts on disk or agent-supplied executable. */
export async function assertNoWindowsReparsePoints(paths: string[]) {
  if (process.platform !== "win32") return;
  const script = "$ErrorActionPreference='Stop'; $seen=@{}; foreach($target in ($env:ORCHESTRATOR_PATH_ATTRIBUTE_CHECK | ConvertFrom-Json)){ $item=$target; while($item){ if(-not $seen.ContainsKey($item)){ $seen[$item]=$true; if(([IO.File]::GetAttributes($item) -band [IO.FileAttributes]::ReparsePoint) -ne 0){ exit 7 } }; $parent=[IO.Directory]::GetParent($item); if($null -eq $parent){break}; $item=$parent.FullName } }; exit 0";
  await new Promise<void>((done, fail) => execFile(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 5000, maxBuffer: 1024, env: { ...process.env, ORCHESTRATOR_PATH_ATTRIBUTE_CHECK: JSON.stringify(paths) } }, error => error ? fail(new Error("REPARSE_OR_ATTRIBUTE_CHECK_FAILED")) : done()));
}
const toolNames = ["read_evidence", "validate_report", "submit_report", "patch_report"];
export const reportToolDefinitions = () => toolNames.map(name => ({
  name, description: name === "read_evidence" ? "Read an exact host-declared evidence line range. Never accepts paths." : name === "validate_report" ? "Validate complete substantive payloadJson without submitting or publishing." : "Seal the complete substantive payloadJson for this invocation. Does not approve or publish.",
  inputSchema: name === "read_evidence" ? { type: "object", additionalProperties: false, required: ["evidenceId", "startLine", "endLine"], properties: { evidenceId: { type: "string" }, startLine: { type: "integer", minimum: 1 }, endLine: { type: "integer", minimum: 1 } } } : { type: "object", additionalProperties: false, required: ["payloadJson"], properties: { payloadJson: { type: "string" } } },
  annotations: { readOnlyHint: name === "read_evidence" || name === "validate_report", destructiveHint: false, openWorldHint: false },
}));

/** No agent paths, commands, identities, budgets or credentials enter this service. */
export class ReportToolService {
  private state!: ToolState;
  private chain: Promise<unknown> = Promise.resolve();
  private expectedState = "";
  private cached?: { payloadJson: string; errors: ReportToolError[] };
  private alive = true;
  private controller = new AbortController();
  private started = Date.now();
  private stateFile: string;
  private timer?: ReturnType<typeof setTimeout>;
  private privateValues: string[] = [];
  private redact(message: string) { for (const value of this.privateValues) message = message.replaceAll(value, "[private MCP connection]"); return message; }
  private constructor(readonly root: string, readonly identity: ReportIdentity, private context: ReportToolContext, private lifetimeMs: number, private boundary?: (name: string) => Promise<void>) {
    this.stateFile = join(root, "tools-state.json");
  }
  static async create(root: string, identity: ReportIdentity, context: ReportToolContext, lifetimeMs: number, boundary?: (name: string) => Promise<void>) {
    assert.equal(identity.transport, "invocation-mcp-v1");
    assert.ok(Number.isInteger(lifetimeMs) && lifetimeMs > 0);
    assert.ok(context.evidence.length > 0 && context.evidence.length <= 41);
    const evidence = structuredClone(context.evidence);
    await assertNoWindowsReparsePoints([root, ...evidence.map(item => item.path)]);
    let hashBytes = 0;
    for (const item of evidence) {
      assert.match(item.id, /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u);
      assert.match(item.sha256, /^[a-f0-9]{64}$/u);
      assert.equal(resolve(item.root), item.root); assert.equal(resolve(item.path), item.path);
      await assertPlainPath(item.root, item.path);
      await assertPlainPath(parse(item.path).root, item.path);
      const stat = await lstat(item.path); assert.ok(stat.isFile() && stat.nlink === 1 && stat.size <= REPORT_LIMIT, "EVIDENCE_FILE_LIMIT"); hashBytes += stat.size;
      assert.equal(reportSha(await readReport(item.path)), item.sha256, "EVIDENCE_CHANGED");
    }
    assert.equal(new Set(evidence.map(e => e.id)).size, evidence.length);
    await context.guard();
    await assertPlainPath(parse(root).root, root);
    const service = new ReportToolService(root, structuredClone(identity), { ...context, evidence }, Math.min(lifetimeMs, REPORT_TOOL_LIMITS.lifetimeMs), boundary);
    service.state = { identity: service.identity, evidenceSha256: reportSha(JSON.stringify(evidence)), limits: { ...REPORT_TOOL_LIMITS, lifetimeMs: service.lifetimeMs }, calls: 0, inputBytes: 0, outputBytes: 0, readBytes: 0, hashBytes, validations: 0, validationMs: 0, status: "active", errorFingerprints: [] };
    await writeFile(service.stateFile, JSON.stringify(service.state), { flag: "wx" });
    service.expectedState = JSON.stringify(service.state);
    service.timer = setTimeout(() => service.revoke(), service.lifetimeMs); service.timer.unref();
    return service;
  }
  revoke() { this.alive = false; this.controller.abort(); }
  get signal() { return this.controller.signal; }
  protectConnection(values: string[]) { assert.equal(this.privateValues.length, 0); this.privateValues = values.slice(); }
  async close() {
    this.revoke(); clearTimeout(this.timer);
    await this.chain.catch(() => undefined);
    // Preserve changed/missing evidence rather than rewriting it during cleanup.
    try { if (await readFile(this.stateFile, "utf8") !== this.expectedState) return; } catch { return; }
    this.state.status = "closed"; await this.save();
  }
  async closedStateSha256() {
    await this.context.guard();
    assert.equal(this.state.status, "closed", "INVOCATION_STATE_CHANGED");
    await assertPlainPath(parse(this.root).root, this.stateFile);
    await assertNoWindowsReparsePoints([this.stateFile]);
    const raw = await readReport(this.stateFile);
    assert.equal(raw, this.expectedState, "INVOCATION_STATE_CHANGED");
    return reportSha(raw);
  }
  private async save() {
    const temp = join(this.root, `state-${randomBytes(8).toString("hex")}.tmp`);
    await writeFile(temp, JSON.stringify(this.state), { flag: "wx" });
    await rename(temp, this.stateFile); this.expectedState = JSON.stringify(this.state);
  }
  private async fence() {
    assert.ok(this.alive && Date.now() - this.started < this.lifetimeMs && !this.controller.signal.aborted, "INVOCATION_CLOSED");
    await this.context.guard();
    assert.ok(this.alive && !this.controller.signal.aborted, "INVOCATION_CLOSED");
    await assertPlainPath(parse(this.root).root, this.stateFile);
    await assertNoWindowsReparsePoints([this.stateFile, ...this.context.evidence.map(item => item.path)]);
    assert.equal(await readFile(this.stateFile, "utf8"), this.expectedState, "INVOCATION_STATE_CHANGED");
    assert.notEqual(this.state.status, "stopped", "TOOL_BUDGET_STOPPED");
    for (const item of this.context.evidence) {
      await assertPlainPath(item.root, item.path); await assertPlainPath(parse(item.path).root, item.path);
      const stat = await lstat(item.path); assert.ok(stat.isFile() && stat.nlink === 1 && stat.size <= REPORT_LIMIT, "EVIDENCE_FILE_LIMIT");
      if (this.state.hashBytes + stat.size > REPORT_TOOL_LIMITS.hashBytes) return this.stop("EVIDENCE_HASH_LIMIT");
      this.state.hashBytes += stat.size; await this.save();
      assert.equal(reportSha(await readReport(item.path)), item.sha256, "EVIDENCE_CHANGED");
    }
  }
  async assertSubmitted() {
    await this.fence();
    assert.equal(this.state.status, "sealed", "REPORT_NOT_SUBMITTED");
    return this.replay();
  }
  private async replay() {
    const submitted = join(this.root, "submitted");
    for (const file of ["schema.json", "result.json", "receipt.json"]) await assertPlainPath(parse(submitted).root, join(submitted, file));
    const payloadJson = await replayReport(join(submitted, "result.json"), join(submitted, "schema.json"), join(submitted, "receipt.json"), this.identity);
    return { payloadJson, receipt: makeReportReceipt(await readReport(join(submitted, "result.json")), this.identity) };
  }
  invoke(name: string, args: unknown) {
    const result = this.chain.catch(() => undefined).then(() => this.operation(name, args));
    this.chain = result; return result;
  }
  private async stop(code: string): Promise<never> {
    this.state.status = "stopped"; await this.save(); this.controller.abort(); throw new Error(code);
  }
  private async operation(name: string, args: unknown): Promise<unknown> {
    await this.fence();
    assert.ok(toolNames.includes(name), "UNKNOWN_TOOL");
    const bytes = Buffer.byteLength(JSON.stringify(args));
    if (bytes > REPORT_LIMIT + 4096 || this.state.calls >= REPORT_TOOL_LIMITS.calls || this.state.inputBytes + bytes > REPORT_TOOL_LIMITS.inputBytes) return this.stop("TOOL_INPUT_LIMIT");
    this.state.calls++; this.state.inputBytes += bytes; await this.save();
    let result: unknown;
    if (name === "read_evidence") {
      assert.equal(this.state.status, "active", "REPORT_SEALED");
      closedKeys(args, ["evidenceId", "startLine", "endLine"]);
      const { evidenceId, startLine, endLine } = args as { evidenceId: string; startLine: number; endLine: number };
      assert.ok(Number.isSafeInteger(startLine) && Number.isSafeInteger(endLine) && startLine >= 1 && endLine >= startLine, "INVALID_RANGE");
      const evidence = this.context.evidence.find(e => e.id === evidenceId); assert.ok(evidence, "UNKNOWN_EVIDENCE");
      await assertPlainPath(evidence.root, evidence.path); await assertPlainPath(parse(evidence.path).root, evidence.path);
      const handle = await open(evidence.path, "r");
      let raw: Buffer;
      try {
        const stat = await handle.stat(); assert.ok(stat.isFile() && stat.nlink === 1 && stat.size <= REPORT_LIMIT, "EVIDENCE_FILE_LIMIT");
        if (this.state.hashBytes + stat.size > REPORT_TOOL_LIMITS.hashBytes) return this.stop("EVIDENCE_HASH_LIMIT");
        this.state.hashBytes += stat.size; await this.save();
        const buffer = Buffer.alloc(REPORT_LIMIT + 1); let length = 0;
        while (length < buffer.length) { const read = await handle.read(buffer, length, buffer.length - length, null); if (!read.bytesRead) break; length += read.bytesRead; }
        assert.ok(length <= REPORT_LIMIT, "EVIDENCE_FILE_LIMIT"); raw = buffer.subarray(0, length);
        const after = await lstat(evidence.path);
        assert.ok(after.ino === stat.ino && after.dev === stat.dev && after.size === stat.size && after.mtimeMs === stat.mtimeMs, "EVIDENCE_CHANGED");
      } finally { await handle.close(); }
      await assertPlainPath(parse(evidence.path).root, evidence.path); assert.equal(reportSha(raw), evidence.sha256, "EVIDENCE_CHANGED");
      await assertNoWindowsReparsePoints([evidence.path]);
      const lines = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw).match(/[^\n]*\n|[^\n]+$/gu) ?? [];
      assert.ok(startLine <= lines.length, "INVALID_RANGE");
      let text = "", returnedEndLine = startLine - 1;
      for (let i = startLine - 1; i < Math.min(endLine, lines.length, startLine - 1 + REPORT_TOOL_LIMITS.lines); i++) {
        if (Buffer.byteLength(text) + Buffer.byteLength(lines[i]) > REPORT_TOOL_LIMITS.fragmentBytes) break;
        text += lines[i]; returnedEndLine = i + 1;
      }
      result = { evidenceId, sourceSha256: evidence.sha256, requestedStartLine: startLine, requestedEndLine: endLine, returnedStartLine: returnedEndLine >= startLine ? startLine : null, returnedEndLine: returnedEndLine >= startLine ? returnedEndLine : null, totalLines: lines.length, truncated: returnedEndLine < Math.min(endLine, lines.length), beyondSourceEnd: endLine > lines.length, text };
      const deliveredBytes = Buffer.byteLength(text);
      if (this.state.readBytes + deliveredBytes > REPORT_TOOL_LIMITS.readBytes) return this.stop("EVIDENCE_READ_LIMIT");
      this.state.readBytes += deliveredBytes; await this.save();
    } else {
      closedKeys(args, ["payloadJson"]);
      const { payloadJson } = args as { payloadJson: string };
      assert.equal(typeof payloadJson, "string", "INVALID_PAYLOAD");
      assert.ok(Buffer.byteLength(payloadJson) <= REPORT_LIMIT, "REPORT_LIMIT");
      // Check decoded strings as well, so Unicode/slash escaping cannot leak a
      // connection credential through substantive payloads or native scratch.
      let decoded = payloadJson; try { decoded = JSON.stringify(uniqueJson(payloadJson)); } catch { /* bounded JSON error below */ }
      assert.ok(!this.privateValues.some(value => payloadJson.includes(value) || decoded.includes(value)), "PRIVATE_CONNECTION_DATA");
      const submitting = name !== "validate_report";
      if (submitting) assert.equal(name, this.identity.mode === "full" ? "submit_report" : "patch_report", "WRONG_REPORT_MODE");
      if (this.state.status === "sealed") {
        assert.ok(submitting, "REPORT_SEALED");
        const sealed = await this.replay(); assert.equal(payloadJson, sealed.payloadJson, "SUBMISSION_CONFLICT"); result = { submitted: true, receipt: sealed.receipt };
      } else {
        // A complete directory may survive after-rename interruption/ack loss.
        let committed = false;
        try { await lstat(join(this.root, "submitted")); committed = true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
        if (committed) {
          assert.ok(submitting, "REPORT_SEALED"); const sealed = await this.replay(); assert.equal(payloadJson, sealed.payloadJson, "SUBMISSION_CONFLICT");
          this.state.status = "sealed"; await this.save(); result = { submitted: true, receipt: sealed.receipt };
        } else {
          let errors = this.cached?.payloadJson === payloadJson ? this.cached.errors : undefined;
          if (!errors) {
            if (this.state.validations >= REPORT_TOOL_LIMITS.validations || this.state.validationMs >= REPORT_TOOL_LIMITS.validationMs) return this.stop("VALIDATION_BUDGET_EXHAUSTED");
            this.state.validations++; await this.save(); await this.fence();
            const scratch = await mkdtemp(join(this.root, "validation-")); await mkdir(join(scratch, ".orchestrator-scratch"));
            const start = Date.now(), remaining = REPORT_TOOL_LIMITS.validationMs - this.state.validationMs;
            const timer = setTimeout(() => this.controller.abort(), remaining);
            try {
              try { uniqueJson(payloadJson); } catch { errors = [boundedError("INVALID_JSON")]; }
              if (!errors) {
                try { errors = await this.context.validate(payloadJson, scratch, this.controller.signal, remaining); }
                catch { return await this.stop(this.controller.signal.aborted ? "VALIDATION_TIMEOUT" : "NATIVE_VALIDATION_FAILED"); }
              }
              assert.ok(Array.isArray(errors) && errors.length <= 32, "INVALID_VALIDATOR_RESULT");
              this.cached = { payloadJson, errors };
            } finally { clearTimeout(timer); this.state.validationMs += Date.now() - start; await this.save(); }
            if (this.controller.signal.aborted || this.state.validationMs >= REPORT_TOOL_LIMITS.validationMs) return this.stop("VALIDATION_TIMEOUT");
            await this.fence();
          }
          if (errors.length) {
            if (errors.some(error => error.code === "NATIVE_PROCESS_FAILED")) return this.stop("NATIVE_VALIDATION_FAILED");
            const fingerprint = reportSha(JSON.stringify(errors));
            if (this.state.errorFingerprints.includes(fingerprint)) return this.stop("REPEATED_VALIDATION_ERROR");
            this.state.errorFingerprints.push(fingerprint); await this.save(); result = { valid: false, errors: errors.map(error => error.diagnostic === undefined ? error : { ...error, diagnostic: this.redact(error.diagnostic) }) };
          } else if (!submitting) result = { valid: true, errors: [] };
          else {
            await this.fence();
            const receipt = await submitReportAtomically(this.root, payloadJson, this.identity, () => this.fence(), this.boundary);
            this.state.status = "sealed"; await this.save(); result = { submitted: true, receipt };
          }
        }
      }
    }
    await this.fence();
    const outBytes = Buffer.byteLength(JSON.stringify(result));
    if (outBytes > 65536 || this.state.outputBytes + outBytes > REPORT_TOOL_LIMITS.outputBytes) return this.stop("TOOL_OUTPUT_LIMIT");
    this.state.outputBytes += outBytes; await this.save();
    return result;
  }
}

export function reportLoopbackEnvironment(environment: NodeJS.ProcessEnv): { NO_PROXY: string; no_proxy: string } {
  const entries = [environment.NO_PROXY, environment.no_proxy].filter((value): value is string => value !== undefined && value !== "");
  const inherited = entries.join(",");
  const hosts = new Set(inherited.split(",").map(value => value.trim().toLowerCase()));
  const additions = ["127.0.0.1", "localhost"].filter(host => !hosts.has(host));
  const bypass = [inherited, ...additions].filter(Boolean).join(",");
  return { NO_PROXY: bypass, no_proxy: bypass };
}

export async function startReportMcp(service: ReportToolService) {
  const token = randomBytes(32).toString("hex"); let requests = 0;
  const server = createServer(async (request, response) => {
    // No browser origins, arbitrary paths, session/reconnect or unauthenticated calls.
    const supplied = request.headers.authorization ?? "";
    const expected = `Bearer ${token}`;
    if (request.headers.origin || request.url !== "/mcp" || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) { response.writeHead(401).end(); return; }
    if (request.method !== "POST") { response.writeHead(405).end(); return; }
    if (++requests > 128) { service.revoke(); response.writeHead(429).end(); return; }
    let id: unknown = null;
    try {
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; assert.ok(size <= REPORT_LIMIT + 8192, "REQUEST_LIMIT"); chunks.push(chunk); }
      const rpc = uniqueJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) as { jsonrpc: string; id?: string | number; method: string; params?: { protocolVersion?: string; name?: string; arguments?: unknown } };
      assert.equal(rpc.jsonrpc, "2.0"); id = rpc.id ?? null;
      if (rpc.method === "notifications/initialized") { response.writeHead(202).end(); return; }
      let result: unknown;
      if (rpc.method === "initialize") result = { protocolVersion: rpc.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "orchestrator-report", version: "1" } };
      else if (rpc.method === "tools/list") result = { tools: reportToolDefinitions() };
      else if (rpc.method === "tools/call") {
        try { const value = await service.invoke(rpc.params?.name ?? "", rpc.params?.arguments); result = { content: [{ type: "text", text: JSON.stringify(value) }] }; }
        catch (e) { const code = e instanceof Error && /^[A-Z_]+$/u.test(e.message) ? e.message : "TOOL_REJECTED"; result = { isError: true, content: [{ type: "text", text: JSON.stringify({ error: code }) }] }; }
      } else throw new Error("UNKNOWN_METHOD");
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id, result }));
    } catch { response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid bounded request" } })); }
  });
  server.requestTimeout = 65_000; server.headersTimeout = 10_000;
  await new Promise<void>((done, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", done); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/mcp`;
  const config = `mcp_servers.orchestrator_report={url="${url}",bearer_token_env_var="ORCHESTRATOR_REPORT_MCP_TOKEN",required=true,startup_timeout_sec=10,tool_timeout_sec=65,enabled_tools=[${toolNames.map(n => JSON.stringify(n)).join(",")}],default_tools_approval_mode="auto"}`;
  const privateValues = [config, token, url, "ORCHESTRATOR_REPORT_MCP_TOKEN"];
  service.protectConnection(privateValues);
  service.signal.addEventListener("abort", () => { server.close(); }, { once: true });
  let closePromise: Promise<void> | undefined;
  return {
    args: ["-c", config],
    environment: { ...reportLoopbackEnvironment(process.env), ORCHESTRATOR_REPORT_MCP_TOKEN: token },
    redact(message: string) { for (const value of privateValues) message = message.replaceAll(value, "[private MCP connection]"); return message; },
    close() { closePromise ??= (async () => { service.revoke(); server.closeAllConnections(); if (server.listening) await new Promise<void>(done => server.close(() => done())); await service.close(); })(); return closePromise; },
  };
}
