import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import Ajv2020 from "ajv8/dist/2020.js";

const require = createRequire(import.meta.url);
const schema = require("./schemas/source-projection-v1.schema.json");

export const SOURCE_PROJECTION_LIMITS_V1 = Object.freeze({
  maxSourceBytes: 1_048_576, maxSourceLines: 30_000, maxEntries: 2_000,
  maxIndexBytes: 1_048_576, maxExcerptBytes: 65_536, maxExcerptLines: 2_000,
});
export const SOURCE_PROJECTION_REASON_CODES_V1 = Object.freeze([
  "SOURCE_PROJECTION_SCHEMA_INVALID", "SOURCE_PROJECTION_PATH_INVALID",
  "SOURCE_PROJECTION_PATH_OUTSIDE_ROOT", "SOURCE_PROJECTION_SOURCE_MISSING",
  "SOURCE_PROJECTION_SYMLINK_ESCAPE", "SOURCE_PROJECTION_EXTENSION_UNSUPPORTED",
  "SOURCE_PROJECTION_UTF8_INVALID", "SOURCE_PROJECTION_PARSE_FAILED",
  "SOURCE_PROJECTION_ENTRY_UNKNOWN", "SOURCE_PROJECTION_ENTRY_AMBIGUOUS",
  "SOURCE_PROJECTION_SOURCE_STALE", "SOURCE_PROJECTION_RANGE_INVALID",
  "SOURCE_PROJECTION_LIMIT_EXCEEDED", "SOURCE_PROJECTION_REPLAY_INVALID",
  "SOURCE_PROJECTION_INTERNAL_FAILURE",
]);
const MESSAGES = Object.freeze({
  SOURCE_PROJECTION_SCHEMA_INVALID: "Source projection contract is invalid.",
  SOURCE_PROJECTION_PATH_INVALID: "Source path is invalid.",
  SOURCE_PROJECTION_PATH_OUTSIDE_ROOT: "Source path is outside the selected root.",
  SOURCE_PROJECTION_SOURCE_MISSING: "Source file is unavailable.",
  SOURCE_PROJECTION_SYMLINK_ESCAPE: "Source path escapes through a symbolic link.",
  SOURCE_PROJECTION_EXTENSION_UNSUPPORTED: "Source extension is unsupported.",
  SOURCE_PROJECTION_UTF8_INVALID: "Source is not valid UTF-8.",
  SOURCE_PROJECTION_PARSE_FAILED: "Source parsing failed.",
  SOURCE_PROJECTION_ENTRY_UNKNOWN: "Source entry is unknown.",
  SOURCE_PROJECTION_ENTRY_AMBIGUOUS: "Source entry identity is ambiguous.",
  SOURCE_PROJECTION_SOURCE_STALE: "Source identity changed.",
  SOURCE_PROJECTION_RANGE_INVALID: "Source range is invalid.",
  SOURCE_PROJECTION_LIMIT_EXCEEDED: "Source projection limit was exceeded.",
  SOURCE_PROJECTION_REPLAY_INVALID: "Source projection replay is invalid.",
  SOURCE_PROJECTION_INTERNAL_FAILURE: "Source projection failed.",
});
const TS_EXTENSIONS = new Map([
  [".ts", ["typescript", ts.ScriptKind.TS]], [".tsx", ["tsx", ts.ScriptKind.TSX]],
  [".mts", ["typescript", ts.ScriptKind.TS]], [".js", ["javascript", ts.ScriptKind.JS]],
  [".mjs", ["javascript", ts.ScriptKind.JS]], [".cjs", ["javascript", ts.ScriptKind.JS]],
]);
const HIGH_RISK = new Set([".git", ".orchestrator", "queues", "node_modules", "dist", "build", "release", "data", "output", "logs", "secrets", ".venv", "__pycache__", ".pytest_cache"]);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

export class SourceProjectionErrorV1 extends Error {
  constructor(reasonCode, sourcePath) { super(MESSAGES[reasonCode]); this.name = "SourceProjectionErrorV1"; this.reasonCode = reasonCode; this.sourcePath = sourcePath; }
}
function fail(reasonCode, sourcePath) { throw new SourceProjectionErrorV1(reasonCode, sourcePath); }
export function canonicalSourceProjectionJsonV1(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalSourceProjectionJsonV1).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalSourceProjectionJsonV1(value[key])}`).join(",")}}`;
}
export const sourceProjectionSha256V1 = (value) => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalSourceProjectionJsonV1(value)).digest("hex");
function assertSchema(value) { if (!validate(value)) fail("SOURCE_PROJECTION_SCHEMA_INVALID", value?.sourcePath); return value; }
function extension(path) { const match = /(?:^|\/)([^/]+)$/.exec(path); const name = match?.[1] ?? ""; const dot = name.lastIndexOf("."); return dot < 0 ? "" : name.slice(dot).toLowerCase(); }
function normalizePath(input) {
  if (typeof input !== "string" || !input || Buffer.byteLength(input) > 512 || input.includes("\0") || input.includes("\\") || isAbsolute(input) || /^[A-Za-z]:/.test(input) || /[*?\[\]]/.test(input)) fail("SOURCE_PROJECTION_PATH_INVALID");
  const parts = input.split("/");
  if (parts.some((part) => !part || part === "." || part === "..") || parts.some((part) => { const lower = part.toLowerCase(); return HIGH_RISK.has(lower) || lower.startsWith(".orchestrator-") || lower === ".env" || lower.startsWith(".env."); }) || /\.(?:log|db|sqlite|sqlite3|pyc)$/i.test(input)) fail("SOURCE_PROJECTION_PATH_INVALID");
  return parts.join("/");
}
function readSource(rootInput, pathInput) {
  const sourcePath = normalizePath(pathInput);
  let root;
  try { root = realpathSync(resolve(rootInput)); } catch { fail("SOURCE_PROJECTION_PATH_OUTSIDE_ROOT", sourcePath); }
  const candidate = resolve(root, ...sourcePath.split("/"));
  const lexical = relative(root, candidate);
  if (!lexical || lexical.startsWith(`..${sep}`) || lexical === ".." || isAbsolute(lexical)) fail("SOURCE_PROJECTION_PATH_OUTSIDE_ROOT", sourcePath);
  let actual;
  try { actual = realpathSync(candidate); } catch { fail("SOURCE_PROJECTION_SOURCE_MISSING", sourcePath); }
  const realRelative = relative(root, actual);
  if (realRelative.startsWith(`..${sep}`) || realRelative === ".." || isAbsolute(realRelative)) fail("SOURCE_PROJECTION_SYMLINK_ESCAPE", sourcePath);
  let stat;
  try { stat = statSync(actual); } catch { fail("SOURCE_PROJECTION_SOURCE_MISSING", sourcePath); }
  if (!stat.isFile()) fail("SOURCE_PROJECTION_PATH_INVALID", sourcePath);
  const buffer = readFileSync(actual);
  if (buffer.length > SOURCE_PROJECTION_LIMITS_V1.maxSourceBytes) fail("SOURCE_PROJECTION_LIMIT_EXCEEDED", sourcePath);
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { fail("SOURCE_PROJECTION_UTF8_INVALID", sourcePath); }
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) lineStarts.push(index + 1);
  if (lineStarts.length > SOURCE_PROJECTION_LIMITS_V1.maxSourceLines) fail("SOURCE_PROJECTION_LIMIT_EXCEEDED", sourcePath);
  const ext = extension(sourcePath);
  if (!TS_EXTENSIONS.has(ext) && ext !== ".py") fail("SOURCE_PROJECTION_EXTENSION_UNSUPPORTED", sourcePath);
  return { sourcePath, buffer, text, lineStarts, ext, sourceHash: sourceProjectionSha256V1(buffer) };
}
const byteOffset = (text, position) => Buffer.byteLength(text.slice(0, position));
function lineForPosition(lineStarts, position) {
  let low = 0, high = lineStarts.length;
  while (low + 1 < high) { const middle = (low + high) >> 1; if (lineStarts[middle] <= position) low = middle; else high = middle; }
  return low + 1;
}
function exported(node) { return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)); }
function nodeName(node, sourceFile) {
  if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) || ts.isNumericLiteral(node.name))) return node.name.text;
  if (node.name) return node.name.getText(sourceFile);
  return undefined;
}
function entryKind(node) {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return "method";
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) return "accessor";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type_alias";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isVariableStatement(node) || ts.isVariableDeclaration(node)) return "variable";
  if (ts.isImportDeclaration(node)) return "import";
  if (ts.isExportDeclaration(node)) return "export";
  return undefined;
}
function rawEntry(node, kind, qualifiedName, source, isExported, parentIdentity) {
  const startPosition = node.getStart(source.sourceFile);
  const endPosition = node.end;
  const startByte = byteOffset(source.text, startPosition), endByte = byteOffset(source.text, endPosition);
  const startLine = lineForPosition(source.lineStarts, startPosition), endLine = lineForPosition(source.lineStarts, Math.max(startPosition, endPosition - 1));
  return { kind, qualifiedName, exported: isExported, startByte, endByte, startLine, endLine, byteCount: endByte - startByte, lineCount: endLine - startLine + 1, parentIdentity };
}
function buildEntries(source) {
  const [language, scriptKind] = TS_EXTENSIONS.get(source.ext);
  const sourceFile = ts.createSourceFile(source.sourcePath, source.text, ts.ScriptTarget.Latest, true, scriptKind);
  if (sourceFile.parseDiagnostics.length) fail("SOURCE_PROJECTION_PARSE_FAILED", source.sourcePath);
  source.sourceFile = sourceFile;
  const raw = [];
  for (const node of sourceFile.statements) {
    const kind = entryKind(node);
    if (kind === "variable") {
      for (const declaration of node.declarationList.declarations) {
        const exactName = declaration.name.getText(sourceFile);
        const name = Buffer.byteLength(exactName) <= 512 ? exactName : `binding-pattern:${sourceProjectionSha256V1(exactName)}`;
        raw.push(rawEntry(declaration, "variable", name, source, exported(node)));
      }
    } else if (kind) {
      const name = kind === "import" ? node.moduleSpecifier.text : kind === "export" ? node.moduleSpecifier?.text ?? "local-export" : nodeName(node, sourceFile) ?? "anonymous";
      const top = rawEntry(node, kind, name, source, exported(node)); raw.push(top);
      if (kind === "class") for (const member of node.members) { const memberKind = entryKind(member); const memberName = nodeName(member, sourceFile); if ((memberKind === "method" || memberKind === "accessor") && memberName) raw.push(rawEntry(member, memberKind, `${name}.${memberName}`, source, exported(node), `${kind}\0${name}\0${top.startByte}\0${top.endByte}`)); }
    }
  }
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === "test" || node.expression.text === "it")) {
      const name = node.arguments[0]; if (name && ts.isStringLiteralLike(name)) raw.push(rawEntry(node, "test", name.text, source, false));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  raw.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || a.kind.localeCompare(b.kind, "en") || a.qualifiedName.localeCompare(b.qualifiedName, "en"));
  if (raw.length > SOURCE_PROJECTION_LIMITS_V1.maxEntries) fail("SOURCE_PROJECTION_LIMIT_EXCEEDED", source.sourcePath);
  const counts = new Map(), ids = new Map();
  for (const item of raw) {
    const key = `${item.kind}\0${item.qualifiedName}`; const occurrence = (counts.get(key) ?? 0) + 1; counts.set(key, occurrence); item.occurrence = occurrence;
    item.entryId = `source-entry:${sourceProjectionSha256V1({ sourceHash: source.sourceHash, kind: item.kind, qualifiedName: item.qualifiedName, occurrence, startByte: item.startByte, endByte: item.endByte })}`;
    ids.set(`${item.kind}\0${item.qualifiedName}\0${item.startByte}\0${item.endByte}`, item.entryId);
  }
  const entries = raw.map(({ parentIdentity, ...item }) => parentIdentity ? { ...item, parentEntryId: ids.get(parentIdentity) ?? fail("SOURCE_PROJECTION_REPLAY_INVALID", source.sourcePath) } : item);
  if (new Set(entries.map((entry) => entry.entryId)).size !== entries.length) fail("SOURCE_PROJECTION_ENTRY_AMBIGUOUS", source.sourcePath);
  return { language, entries };
}
function parserFor(language) { return language === "python_line_range" ? { parserId: "python-line-range", parserVersion: "1.0" } : { parserId: "typescript", parserVersion: ts.version }; }
function indexFromSource(source) {
  const python = source.ext === ".py";
  const { language, entries } = python ? { language: "python_line_range", entries: [] } : buildEntries(source);
  const body = { contractType: "SourceIndexV1", contractVersion: "1.0", indexVersion: "1.0", sourcePath: source.sourcePath, sourceHash: source.sourceHash, sourceBytes: source.buffer.length, sourceLines: source.lineStarts.length, language, parser: parserFor(language), parseState: python ? "line_range_only" : "parsed", supportedOperation: python ? "line_range_excerpt" : "entry_excerpt", entries, entryCount: entries.length, omittedEntryCount: 0, truncated: false, limits: SOURCE_PROJECTION_LIMITS_V1 };
  const result = { ...body, indexHash: sourceProjectionSha256V1(body) };
  if (Buffer.byteLength(canonicalSourceProjectionJsonV1(result)) > SOURCE_PROJECTION_LIMITS_V1.maxIndexBytes) fail("SOURCE_PROJECTION_LIMIT_EXCEEDED", source.sourcePath);
  return Object.freeze(assertSchema(result));
}
export function createSourceIndexV1({ root, path }) { return indexFromSource(readSource(root, path)); }
function excerptResult(source, language, selection, startByte, endByte, startLine, endLine) {
  const excerptBuffer = source.buffer.subarray(startByte, endByte);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(excerptBuffer), excerptBytes = excerptBuffer.length, excerptLines = endLine - startLine + 1;
  if (!text || excerptBytes > SOURCE_PROJECTION_LIMITS_V1.maxExcerptBytes || excerptLines > SOURCE_PROJECTION_LIMITS_V1.maxExcerptLines) fail("SOURCE_PROJECTION_LIMIT_EXCEEDED", source.sourcePath);
  const body = { contractType: "SourceExcerptV1", contractVersion: "1.0", indexVersion: "1.0", sourcePath: source.sourcePath, sourceHash: source.sourceHash, language, parser: parserFor(language), selection, startByte, endByte, startLine, endLine, excerptBytes, excerptLines, text, truncated: false, omitted: false };
  return Object.freeze(assertSchema({ ...body, excerptHash: sourceProjectionSha256V1(body) }));
}
export function createSourceExcerptV1({ root, path, sourceHash, entryId, startLine, endLine }) {
  const source = readSource(root, path);
  if (!/^[a-f0-9]{64}$/.test(sourceHash ?? "")) fail("SOURCE_PROJECTION_SCHEMA_INVALID", source.sourcePath);
  if (source.sourceHash !== sourceHash) fail("SOURCE_PROJECTION_SOURCE_STALE", source.sourcePath);
  if (source.ext === ".py") {
    if (entryId !== undefined || !Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine || endLine > source.lineStarts.length) fail("SOURCE_PROJECTION_RANGE_INVALID", source.sourcePath);
    const startPosition = source.lineStarts[startLine - 1], endPosition = endLine < source.lineStarts.length ? source.lineStarts[endLine] : source.text.length;
    return excerptResult(source, "python_line_range", { kind: "line_range", startLine, endLine }, byteOffset(source.text, startPosition), byteOffset(source.text, endPosition), startLine, endLine);
  }
  if (startLine !== undefined || endLine !== undefined || typeof entryId !== "string") fail("SOURCE_PROJECTION_RANGE_INVALID", source.sourcePath);
  const index = indexFromSource(source);
  const matches = index.entries.filter((entry) => entry.entryId === entryId);
  if (!matches.length) fail("SOURCE_PROJECTION_ENTRY_UNKNOWN", source.sourcePath);
  if (matches.length !== 1) fail("SOURCE_PROJECTION_ENTRY_AMBIGUOUS", source.sourcePath);
  const entry = matches[0];
  return excerptResult(source, index.language, { kind: "entry", entryId }, entry.startByte, entry.endByte, entry.startLine, entry.endLine);
}
export function assertSourceProjectionReplayV1(value) {
  assertSchema(value);
  const hashKey = value.contractType === "SourceIndexV1" ? "indexHash" : value.contractType === "SourceExcerptV1" ? "excerptHash" : undefined;
  if (hashKey) { const { [hashKey]: actual, ...body } = value; if (actual !== sourceProjectionSha256V1(body)) fail("SOURCE_PROJECTION_REPLAY_INVALID", value.sourcePath); }
  if (value.contractType === "SourceIndexV1") {
    const python = value.language === "python_line_range";
    if (value.entryCount !== value.entries.length || value.omittedEntryCount !== 0 || value.truncated ||
        python !== (value.parseState === "line_range_only" && value.supportedOperation === "line_range_excerpt") ||
        (python && value.entries.length !== 0) || (!python && (value.parseState !== "parsed" || value.supportedOperation !== "entry_excerpt"))) fail("SOURCE_PROJECTION_REPLAY_INVALID", value.sourcePath);
    const ids = new Map(), counts = new Map();
    for (let index = 0; index < value.entries.length; index += 1) {
      const entry = value.entries[index], prior = value.entries[index - 1];
      const key = `${entry.kind}\0${entry.qualifiedName}`, occurrence = (counts.get(key) ?? 0) + 1;
      counts.set(key, occurrence);
      const expectedId = `source-entry:${sourceProjectionSha256V1({ sourceHash: value.sourceHash, kind: entry.kind, qualifiedName: entry.qualifiedName, occurrence, startByte: entry.startByte, endByte: entry.endByte })}`;
      if (entry.occurrence !== occurrence || entry.entryId !== expectedId || ids.has(entry.entryId) || entry.startByte >= entry.endByte || entry.endByte > value.sourceBytes ||
          entry.startLine > entry.endLine || entry.endLine > value.sourceLines || entry.byteCount !== entry.endByte - entry.startByte || entry.lineCount !== entry.endLine - entry.startLine + 1 ||
          (prior && (entry.startByte < prior.startByte || (entry.startByte === prior.startByte && entry.endByte < prior.endByte)))) fail("SOURCE_PROJECTION_REPLAY_INVALID", value.sourcePath);
      ids.set(entry.entryId, entry);
    }
    for (const entry of value.entries) if (entry.parentEntryId) { const parent = ids.get(entry.parentEntryId); if (!parent || parent.startByte > entry.startByte || parent.endByte < entry.endByte) fail("SOURCE_PROJECTION_REPLAY_INVALID", value.sourcePath); }
  } else if (value.contractType === "SourceExcerptV1") {
    const python = value.language === "python_line_range";
    if (value.truncated || value.omitted || value.startByte >= value.endByte || value.startLine > value.endLine ||
        value.excerptBytes !== value.endByte - value.startByte || value.excerptBytes !== Buffer.byteLength(value.text) || value.excerptLines !== value.endLine - value.startLine + 1 ||
        python !== (value.selection.kind === "line_range") ||
        (python && (value.selection.startLine !== value.startLine || value.selection.endLine !== value.endLine))) fail("SOURCE_PROJECTION_REPLAY_INVALID", value.sourcePath);
  }
  return value;
}
export function sourceProjectionFailureV1(error) {
  const reasonCode = error instanceof SourceProjectionErrorV1 ? error.reasonCode : "SOURCE_PROJECTION_INTERNAL_FAILURE";
  const result = { contractType: "SourceProjectionFailureV1", contractVersion: "1.0", reasonCode, ...(error instanceof SourceProjectionErrorV1 && error.sourcePath ? { sourcePath: error.sourcePath } : {}), message: MESSAGES[reasonCode] };
  return Object.freeze(assertSchema(result));
}
function parseArgs(argv) { const result = { command: argv[0] }, seen = new Set(); for (let index = 1; index < argv.length; index += 2) { const key = argv[index]; if (!key?.startsWith("--") || argv[index + 1] === undefined || seen.has(key)) fail("SOURCE_PROJECTION_SCHEMA_INVALID"); seen.add(key); result[key.slice(2)] = argv[index + 1]; } return result; }
export function runSourceProjectionCliV1(argv) {
  const args = parseArgs(argv);
  if (!args.root || !args.path || !["index", "excerpt"].includes(args.command)) fail("SOURCE_PROJECTION_SCHEMA_INVALID");
  if (args.command === "index") { if (Object.keys(args).some((key) => !["command", "root", "path"].includes(key))) fail("SOURCE_PROJECTION_SCHEMA_INVALID"); return createSourceIndexV1({ root: args.root, path: args.path }); }
  if (Object.keys(args).some((key) => !["command", "root", "path", "source-hash", "entry-id", "start-line", "end-line"].includes(key))) fail("SOURCE_PROJECTION_SCHEMA_INVALID");
  return createSourceExcerptV1({ root: args.root, path: args.path, sourceHash: args["source-hash"], entryId: args["entry-id"], startLine: args["start-line"] === undefined ? undefined : Number(args["start-line"]), endLine: args["end-line"] === undefined ? undefined : Number(args["end-line"]) });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runSourceProjectionCliV1(process.argv.slice(2)))}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify(sourceProjectionFailureV1(error))}\n`); process.exitCode = 1; }
}
