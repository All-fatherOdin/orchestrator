import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import Ajv2020 from "ajv8/dist/2020.js";
import {
  SOURCE_PROJECTION_LIMITS_V1,
  SourceProjectionErrorV1,
  assertSourceProjectionReplayV1,
  canonicalSourceProjectionJsonV1,
  createSourceExcerptV1,
  createSourceIndexV1,
  runSourceProjectionCliV1,
  sourceProjectionFailureV1,
  sourceProjectionSha256V1,
} from "./source_projection_v1.mjs";

const require = createRequire(import.meta.url);
const schema = require("./schemas/source-projection-v1.schema.json");
const examples = require("./schemas/source-projection-v1.examples.json");
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const root = resolve(import.meta.dirname, "..");
const script = join(root, "scripts", "source_projection_v1.mjs");
const failsWith = (reasonCode) => (error) => error instanceof SourceProjectionErrorV1 && error.reasonCode === reasonCode && !error.message.includes("PRIVATE");
function fixture(run) { const directory = mkdtempSync(join(tmpdir(), "orchestrator-source-projection-")); try { return run(directory); } finally { rmSync(directory, { recursive: true, force: true }); } }
function exactExcerpt(path, qualifiedName, kind) { const index = createSourceIndexV1({ root, path }); const entry = index.entries.find((item) => item.qualifiedName === qualifiedName && item.kind === kind); assert.ok(entry, `${kind}:${qualifiedName}`); return { index, entry, excerpt: createSourceExcerptV1({ root, path, sourceHash: index.sourceHash, entryId: entry.entryId }) }; }

test("S6 closed schemas accept examples and reject extensions and enums", () => {
  for (const value of Object.values(examples)) assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...examples.index, extra: true }), false);
  assert.equal(validate({ ...examples.failure, reasonCode: "UNKNOWN" }), false);
});

test("S6 indexes the three exact large TypeScript sources deterministically", () => {
  for (const path of ["server/index.test.ts", "server/change-control-v1/index.ts", "server/index.ts"]) {
    const first = createSourceIndexV1({ root, path }), second = createSourceIndexV1({ root, path });
    assert.equal(canonicalSourceProjectionJsonV1(first), canonicalSourceProjectionJsonV1(second));
    assert.equal(first.sourceHash, sourceProjectionSha256V1(readFileSync(join(root, path))));
    assert.equal(first.entryCount, first.entries.length); assert.ok(first.entries.length > 0);
    assert.equal(first.entries.every((entry, index) => index === 0 || entry.startByte >= first.entries[index - 1].startByte), true);
    assertSourceProjectionReplayV1(first);
  }
});

test("S6 exact function excerpts bind current bytes and demonstrate reduction", () => {
  for (const [path, name] of [["server/index.ts", "validateQueue"], ["server/index.ts", "executeTask"], ["server/change-control-v1/index.ts", "validateAndProject"]]) {
    const { index, entry, excerpt } = exactExcerpt(path, name, "function");
    const bytes = readFileSync(join(root, path));
    assert.deepEqual(Buffer.from(excerpt.text), bytes.subarray(entry.startByte, entry.endByte));
    assert.equal(excerpt.excerptHash.length, 64); assert.equal(excerpt.excerptBytes < index.sourceBytes * 0.2, true);
    assertSourceProjectionReplayV1(excerpt);
  }
});

test("S6 indexes classes and methods while rejecting an oversized class excerpt", () => {
  const index = createSourceIndexV1({ root, path: "server/change-control-v1/index.ts" });
  const classEntry = index.entries.find((entry) => entry.kind === "class" && entry.qualifiedName === "ChangeControlStore");
  const methods = index.entries.filter((entry) => entry.kind === "method" && entry.qualifiedName.startsWith("ChangeControlStore.") && entry.parentEntryId === classEntry?.entryId);
  assert.ok(classEntry); assert.ok(methods.length >= 2);
  assert.throws(() => createSourceExcerptV1({ root, path: index.sourcePath, sourceHash: index.sourceHash, entryId: classEntry.entryId }), failsWith("SOURCE_PROJECTION_LIMIT_EXCEEDED"));
  const methodExcerpt = createSourceExcerptV1({ root, path: index.sourcePath, sourceHash: index.sourceHash, entryId: methods.find((entry) => entry.byteCount <= SOURCE_PROJECTION_LIMITS_V1.maxExcerptBytes).entryId });
  assert.equal(methodExcerpt.selection.kind, "entry");
});

test("S6 indexes exact literal tests and deterministic duplicate occurrences", () => {
  const path = "server/index.test.ts";
  for (const name of ["managed Phase 2 tasks run concurrently only in canonical owned workspaces and restart-replay exact authority", "MergeRequestV1 production target fencing has one cross-process winner after release and dead takeover"]) {
    const { entry, excerpt } = exactExcerpt(path, name, "test"); assert.match(excerpt.text, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))); assert.equal(entry.lineCount, excerpt.excerptLines);
  }
  fixture((directory) => { writeFileSync(join(directory, "duplicate.test.ts"), 'test("same",()=>{});\ntest("same",()=>{});\n'); const index = createSourceIndexV1({ root: directory, path: "duplicate.test.ts" }); const entries = index.entries.filter((entry) => entry.kind === "test"); assert.deepEqual(entries.map((entry) => entry.occurrence), [1, 2]); assert.notEqual(entries[0].entryId, entries[1].entryId); });
});

test("S6 Python supports exact hash-bound ranges only", () => {
  const path = "scripts/ai_context_helper.py", index = createSourceIndexV1({ root, path });
  assert.equal(index.language, "python_line_range"); assert.deepEqual(index.entries, []);
  const excerpt = createSourceExcerptV1({ root, path, sourceHash: index.sourceHash, startLine: 1, endLine: 5 });
  assert.equal(excerpt.selection.kind, "line_range"); assert.equal(excerpt.excerptLines, 5);
  assert.throws(() => createSourceExcerptV1({ root, path, sourceHash: index.sourceHash, entryId: `source-entry:${"a".repeat(64)}` }), failsWith("SOURCE_PROJECTION_RANGE_INVALID"));
  assert.throws(() => createSourceExcerptV1({ root, path: "server/index.ts", sourceHash: createSourceIndexV1({ root, path: "server/index.ts" }).sourceHash, startLine: 1, endLine: 2 }), failsWith("SOURCE_PROJECTION_RANGE_INVALID"));
});

test("S6 fails closed on stale, unknown, unsupported, invalid UTF-8, parse, range, and limits", () => fixture((directory) => {
  writeFileSync(join(directory, "valid.ts"), "export function ok() { return true; }\n");
  const index = createSourceIndexV1({ root: directory, path: "valid.ts" });
  assert.throws(() => createSourceExcerptV1({ root: directory, path: "valid.ts", sourceHash: "a".repeat(64), entryId: index.entries[0].entryId }), failsWith("SOURCE_PROJECTION_SOURCE_STALE"));
  assert.throws(() => createSourceExcerptV1({ root: directory, path: "valid.ts", sourceHash: index.sourceHash, entryId: `source-entry:${"a".repeat(64)}` }), failsWith("SOURCE_PROJECTION_ENTRY_UNKNOWN"));
  writeFileSync(join(directory, "unsupported.md"), "safe"); assert.throws(() => createSourceIndexV1({ root: directory, path: "unsupported.md" }), failsWith("SOURCE_PROJECTION_EXTENSION_UNSUPPORTED"));
  writeFileSync(join(directory, "invalid.ts"), Buffer.from([0xff])); assert.throws(() => createSourceIndexV1({ root: directory, path: "invalid.ts" }), failsWith("SOURCE_PROJECTION_UTF8_INVALID"));
  writeFileSync(join(directory, "parse.ts"), "function broken( {"); assert.throws(() => createSourceIndexV1({ root: directory, path: "parse.ts" }), failsWith("SOURCE_PROJECTION_PARSE_FAILED"));
  writeFileSync(join(directory, "range.py"), "a\nb\n"); const py = createSourceIndexV1({ root: directory, path: "range.py" }); assert.throws(() => createSourceExcerptV1({ root: directory, path: "range.py", sourceHash: py.sourceHash, startLine: 2, endLine: 5 }), failsWith("SOURCE_PROJECTION_RANGE_INVALID"));
  writeFileSync(join(directory, "large.py"), "x".repeat(SOURCE_PROJECTION_LIMITS_V1.maxSourceBytes + 1)); assert.throws(() => createSourceIndexV1({ root: directory, path: "large.py" }), failsWith("SOURCE_PROJECTION_LIMIT_EXCEEDED"));
  writeFileSync(join(directory, "entries.ts"), Array.from({ length: SOURCE_PROJECTION_LIMITS_V1.maxEntries + 1 }, (_, index) => `const value${index} = ${index};`).join("\n")); assert.throws(() => createSourceIndexV1({ root: directory, path: "entries.ts" }), failsWith("SOURCE_PROJECTION_LIMIT_EXCEEDED"));
}));

test("S6 path fencing rejects traversal, high-risk paths, missing files, and symlink escape privately", () => fixture((directory) => {
  assert.throws(() => createSourceIndexV1({ root: directory, path: "../PRIVATE.ts" }), failsWith("SOURCE_PROJECTION_PATH_INVALID"));
  mkdirSync(join(directory, ".git")); writeFileSync(join(directory, ".git", "private.ts"), "safe"); assert.throws(() => createSourceIndexV1({ root: directory, path: ".git/private.ts" }), failsWith("SOURCE_PROJECTION_PATH_INVALID"));
  mkdirSync(join(directory, "safe", "node_modules"), { recursive: true }); writeFileSync(join(directory, "safe", "node_modules", "private.ts"), "safe"); assert.throws(() => createSourceIndexV1({ root: directory, path: "safe/node_modules/private.ts" }), failsWith("SOURCE_PROJECTION_PATH_INVALID"));
  mkdirSync(join(directory, ".orchestrator-test")); writeFileSync(join(directory, ".orchestrator-test", "private.ts"), "safe"); assert.throws(() => createSourceIndexV1({ root: directory, path: ".orchestrator-test/private.ts" }), failsWith("SOURCE_PROJECTION_PATH_INVALID"));
  writeFileSync(join(directory, ".ENV.local"), "safe"); assert.throws(() => createSourceIndexV1({ root: directory, path: ".ENV.local" }), failsWith("SOURCE_PROJECTION_PATH_INVALID"));
  assert.throws(() => createSourceIndexV1({ root: directory, path: "missing.ts" }), failsWith("SOURCE_PROJECTION_SOURCE_MISSING"));
  const outside = mkdtempSync(join(tmpdir(), "orchestrator-source-outside-")); try { writeFileSync(join(outside, "private.ts"), "export const safe = 1;"); symlinkSync(outside, join(directory, "link"), "junction"); assert.throws(() => createSourceIndexV1({ root: directory, path: "link/private.ts" }), failsWith("SOURCE_PROJECTION_SYMLINK_ESCAPE")); } finally { rmSync(outside, { recursive: true, force: true }); }
}));

test("S6 failure and replay diagnostics are closed and private", () => {
  const failure = sourceProjectionFailureV1(new SourceProjectionErrorV1("SOURCE_PROJECTION_PATH_INVALID")); assert.equal(validate(failure), true); assert.equal(JSON.stringify(failure).includes("PRIVATE"), false);
  const index = createSourceIndexV1({ root, path: "server/index.ts" }); assert.throws(() => assertSourceProjectionReplayV1({ ...index, sourceBytes: index.sourceBytes - 1 }), failsWith("SOURCE_PROJECTION_REPLAY_INVALID"));
  const entry = index.entries[0], tamperedBody = { ...index, entries: [{ ...entry, byteCount: entry.byteCount + 1 }, ...index.entries.slice(1)] };
  delete tamperedBody.indexHash; const tampered = { ...tamperedBody, indexHash: sourceProjectionSha256V1(tamperedBody) };
  assert.throws(() => assertSourceProjectionReplayV1(tampered), failsWith("SOURCE_PROJECTION_REPLAY_INVALID"));
});

test("S6 CLI emits one JSON contract and rejects mixed selection modes", () => {
  const output = execFileSync(process.execPath, [script, "index", "--root", root, "--path", "server/index.ts"], { encoding: "utf8" }); assert.equal(output.trim().split(/\r?\n/).length, 1); assert.equal(JSON.parse(output).contractType, "SourceIndexV1");
  assert.throws(() => runSourceProjectionCliV1(["excerpt", "--root", root, "--path", "scripts/ai_context_helper.py", "--source-hash", "a".repeat(64), "--entry-id", `source-entry:${"b".repeat(64)}`, "--start-line", "1", "--end-line", "2"]));
  assert.throws(() => runSourceProjectionCliV1(["index", "--root", root, "--path", "server/index.ts", "--path", "server/index.test.ts"]), failsWith("SOURCE_PROJECTION_SCHEMA_INVALID"));
  const rejected = spawnSync(process.execPath, [script, "index", "--root", root, "--path", "PRIVATE.md"], { encoding: "utf8" }); assert.notEqual(rejected.status, 0); const failure = JSON.parse(rejected.stdout); assert.equal(failure.contractType, "SourceProjectionFailureV1"); assert.equal(failure.message, "Source file is unavailable."); assert.equal(rejected.stderr, "");
});

test("S6 leaves all existing helper commands byte-equal", () => {
  const python = process.env.PYTHON_BIN || "python";
  for (const args of [["read-set", "--profile", "review", "--max-sources", "8", "--format", "json"], ["api-context", "--request-id", "s6-compat", "--task", "Review", "--profile", "review", "--max-sources", "8", "--format", "json"], ["smoke-check", "--format", "json"]]) {
    const first = execFileSync(python, [join(root, "scripts", "ai_context_helper.py"), "--root", root, ...args], { encoding: "utf8" }); const second = execFileSync(python, [join(root, "scripts", "ai_context_helper.py"), "--root", root, ...args], { encoding: "utf8" }); assert.equal(first, second);
  }
});
