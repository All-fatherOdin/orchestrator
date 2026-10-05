import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { open, readFile, writeFile } from "node:fs/promises";
import { TextDecoder } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const REPORT_LIMIT = 1024 * 1024;
export const reportSha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export const reportImplementationIdentity = (() => {
  const path = typeof import.meta.url === "string" && import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : resolve(process.argv[1]);
  return { path, sha256: reportSha(readFileSync(path)) };
})();
export const reportSchema = () => ({
  type: "object", additionalProperties: false,
  required: ["protocolVersion", "outcome", "mode", "reason", "payloadJson"],
  properties: {
    protocolVersion: { type: "string", enum: ["structured-output-v1"] },
    outcome: { type: "string", enum: ["completed", "stopped"] },
    mode: { type: "string", enum: ["full", "patch"] },
    reason: { type: "string" }, payloadJson: { type: "string" },
  },
});
export const reportSchemaBytes = () => `${JSON.stringify(reportSchema(), null, 2)}\n`;
export type ReportRequest = { protocol: "structured-output-v1"; mode: "full" | "patch" };
export type ReportIdentity = { runId: string; taskId: string; invocationId: string; phase: "executor" | "correction"; ordinal: number; mode: "full" | "patch" };
export type ReportReceipt = ReportIdentity & { protocolVersion: "structured-output-v1"; codecVersion: "json-string-v1"; schemaSha256: string; rawSha256: string; payloadSha256: string };

/** Parse JSON without silently accepting repeated object names, including escaped names. */
export function uniqueJson(raw: string): unknown {
  // JSON.parse establishes grammar; the scanner only detects duplicate decoded keys.
  const value: unknown = JSON.parse(raw);
  const stack: Array<Set<string> | null> = [];
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "{" || c === "[") stack.push(c === "{" ? new Set() : null);
    else if (c === "}" || c === "]") stack.pop();
    else if (c === '"') {
      const start = i++;
      while (raw[i] !== '"') { if (raw[i] === "\\") i++; i++; }
      let next = i + 1;
      while (/\s/u.test(raw[next] ?? "") && next < raw.length) next++;
      if (raw[next] === ":") {
        const key = JSON.parse(raw.slice(start, i + 1)) as string;
        const keys = stack.at(-1)!;
        assert.ok(keys && !keys.has(key), "Duplicate JSON object key"); keys.add(key);
      }
    }
  }
  return value;
}
export function decodeReport(raw: string, mode: ReportIdentity["mode"]) {
  assert.ok(Buffer.byteLength(raw) <= REPORT_LIMIT, "Outer report exceeds 1 MiB");
  const v = uniqueJson(raw) as Record<string, unknown>;
  assert.ok(v && typeof v === "object" && !Array.isArray(v), "Invalid report envelope");
  assert.deepEqual(Object.keys(v).sort(), ["mode", "outcome", "payloadJson", "protocolVersion", "reason"]);
  assert.equal(v.protocolVersion, "structured-output-v1"); assert.equal(v.mode, mode);
  assert.ok(v.outcome === "completed" || v.outcome === "stopped");
  assert.equal(typeof v.reason, "string"); assert.equal(typeof v.payloadJson, "string");
  const reason = v.reason as string, payloadJson = v.payloadJson as string;
  assert.ok(Buffer.byteLength(reason) <= 4096, "Reason exceeds 4 KiB");
  assert.ok(Buffer.byteLength(payloadJson) <= REPORT_LIMIT, "Decoded payload exceeds 1 MiB");
  if (v.outcome === "stopped") {
    assert.ok(reason.trim()); assert.equal(payloadJson, "");
    throw new Error(`Structured analysis stopped: ${reason}`);
  }
  assert.equal(reason, ""); assert.ok(payloadJson.trim(), "Empty completed payload");
  return { payloadJson, payload: uniqueJson(payloadJson) };
}
export async function readReport(path: string) {
  const handle = await open(path, "r");
  try {
    assert.ok((await handle.stat()).isFile(), "Report is not a file");
    const bytes = Buffer.alloc(REPORT_LIMIT + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break; length += result.bytesRead;
    }
    assert.ok(length <= REPORT_LIMIT, "Outer report exceeds 1 MiB");
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
  } finally { await handle.close(); }
}
export function reportEvents() {
  let success = false, failure = false;
  return {
    consume(line: string) {
      try {
        const event = uniqueJson(line) as { type?: string };
        if (success) failure = true;
        if (event.type === "turn.completed") success = true;
        if (event.type === "turn.failed" || event.type === "error") failure = true;
      } catch { failure = true; }
    },
    assertSuccess(code: number | null, timedOut: boolean, cancelled: boolean) {
      assert.ok(code === 0 && !timedOut && !cancelled && success && !failure, "Structured report lacks successful current provider terminal evidence");
    },
  };
}
export function makeReportReceipt(raw: string, identity: ReportIdentity): ReportReceipt {
  const { payloadJson } = decodeReport(raw, identity.mode);
  return { ...identity, protocolVersion: "structured-output-v1", codecVersion: "json-string-v1", schemaSha256: reportSha(reportSchemaBytes()), rawSha256: reportSha(raw), payloadSha256: reportSha(payloadJson) };
}
export async function replayReport(rawPath: string, schemaPath: string, receiptPath: string, identity: ReportIdentity) {
  const raw = await readReport(rawPath);
  assert.equal(await readFile(schemaPath, "utf8"), reportSchemaBytes(), "Report schema changed");
  const receipt = uniqueJson(await readFile(receiptPath, "utf8"));
  assert.deepEqual(receipt, makeReportReceipt(raw, identity), "Report receipt identity/hash mismatch");
  return decodeReport(raw, identity.mode).payloadJson;
}
export async function persistReportReceipt(rawPath: string, schemaPath: string, receiptPath: string, identity: ReportIdentity) {
  const raw = await readReport(rawPath);
  const receipt = makeReportReceipt(raw, identity);
  await writeFile(receiptPath, `${JSON.stringify(receipt)}\n`, { flag: "wx" });
  return replayReport(rawPath, schemaPath, receiptPath, identity);
}
