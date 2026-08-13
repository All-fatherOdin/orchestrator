import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv8/dist/2020.js";
// @ts-expect-error Production prompt compiler is JavaScript by design.
import { compileStablePrefixV1 } from "../prompt-compiler-v1/prompt-compiler-v1.mjs";
import { runContextBudgetReportCliV1 } from "../../scripts/context_budget_report.ts";
import schema from "./schemas/context-budget-v1.schema.json";
import examples from "./schemas/context-budget-v1.examples.json";
import {
  assertContextBudgetBaselineV1,
  baselineHashV1,
  buildContextBudgetReportV1,
  canonicalJsonV1,
  ContextBudgetErrorV1,
  createContextBudgetBaselineV1,
  estimateTokensV1,
  sha256V1,
  sourceSetHashV1,
  type ContextBudgetBaselineSourceV1,
  type ContextBudgetCurrentSourceV1,
} from "./index.ts";

const hash = (character: string) => character.repeat(64);
const unsupported = [
  { sourceClass: "host_owner_instructions" as const, state: "unsupported" as const, reasonCode: "CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED" as const },
  { sourceClass: "host_skill_tool_descriptions" as const, state: "unsupported" as const, reasonCode: "CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED" as const },
];

function source(overrides: Partial<ContextBudgetBaselineSourceV1> = {}): ContextBudgetBaselineSourceV1 {
  return {
    sourceClass: "repository_instructions",
    identity: "AGENTS.md",
    sha256: hash("a"),
    byteCount: 100,
    tokenEvidence: estimateTokensV1(100),
    envelope: { maxSourceCount: 1, maxBytes: 120, maxTokens: 30, mode: "hard" },
    ...overrides,
  };
}

function baseline(sources: ContextBudgetBaselineSourceV1[] = [source()]) {
  return createContextBudgetBaselineV1({
    baselineId: "orchestrator-context-v1",
    revision: 1,
    profiles: [{ profile: "review", maxSources: 4, expectedPaths: ["AGENTS.md"] }],
    sources,
  });
}

function current(overrides: Partial<ContextBudgetCurrentSourceV1> = {}): ContextBudgetCurrentSourceV1 {
  return {
    sourceClass: "repository_instructions",
    identity: "AGENTS.md",
    sha256: hash("a"),
    byteCount: 100,
    tokenEvidence: estimateTokensV1(100),
    ...overrides,
  };
}

function report(currentSources: ContextBudgetCurrentSourceV1[] = [current()], baselineValue = baseline()) {
  return buildContextBudgetReportV1({
    requestId: "focused-report-v1",
    baseline: baselineValue,
    baselineBytes: Buffer.from(canonicalJsonV1(baselineValue), "utf8"),
    currentSources,
    project: { head: "1".repeat(40), dirty: false, overlappingPaths: [] },
  });
}

test("Context Budget v1 closed schema accepts fixtures and rejects unknown fields", () => {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(examples.validBaseline), true, JSON.stringify(validate.errors));
  assert.equal(validate(examples.invalidUnknownField), false);
  const accepted = baseline();
  assert.equal(validate(accepted), true, JSON.stringify(validate.errors));
  assert.equal(validate(report()), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...accepted, token: "secret" }), false);
});

test("Context Budget v1 baseline identities and token estimation are deterministic", () => {
  assert.deepEqual(estimateTokensV1(0), { state: "estimated", identity: "utf8-bytes-div-4-ceil-v1", count: 0 });
  assert.equal(estimateTokensV1(5).count, 2);
  const first = baseline();
  const second = baseline();
  assert.equal(canonicalJsonV1(first), canonicalJsonV1(second));
  assert.equal(first.sourceSetHash, sourceSetHashV1(first.sources));
  assert.equal(first.baselineHash, baselineHashV1(first));
  assert.throws(
    () => assertContextBudgetBaselineV1({ ...first, revision: 2 }),
    (error: unknown) => error instanceof ContextBudgetErrorV1 && error.reasonCode === "CONTEXT_BUDGET_BASELINE_IDENTITY_CHANGED",
  );
});

test("Context Budget v1 rejects duplicate sources and incomplete measured token claims", () => {
  assert.throws(
    () => baseline([source(), source()]),
    (error: unknown) => error instanceof ContextBudgetErrorV1 && error.reasonCode === "CONTEXT_BUDGET_SOURCE_DUPLICATE",
  );
  assert.throws(
    () => baseline([source({ tokenEvidence: { state: "measured", identity: "tokenizer-v1", count: 10 } })]),
    (error: unknown) => error instanceof ContextBudgetErrorV1 && error.reasonCode === "CONTEXT_BUDGET_BASELINE_INVALID",
  );
});

test("Context Budget v1 equal evidence produces byte-equal read-only reports", () => {
  const first = report();
  const second = report();
  assert.equal(canonicalJsonV1(first), canonicalJsonV1(second));
  assert.equal(first.outcome, "pass");
  assert.equal(first.wouldMutate, false);
  assert.deepEqual(first.scopeExpansion, { runtime: false, externalSystem: false, data: false, projectMapMutated: false });
  assert.deepEqual(first.unsupportedSources, unsupported);
  assert.equal(first.reportHash, sha256V1(canonicalJsonV1(Object.fromEntries(Object.entries(first).filter(([key]) => key !== "reportHash")))));
});

test("Context Budget v1 hard byte/count envelopes fail only the explicit report", () => {
  const changed = current({ sha256: hash("b"), byteCount: 130, tokenEvidence: estimateTokensV1(130) });
  const result = report([changed]);
  assert.equal(result.outcome, "fail");
  assert.equal(result.sources[0].envelopeStatus, "fail");
  assert.ok(result.reasonCodes.includes("CONTEXT_BUDGET_BYTE_LIMIT"));
  assert.ok(result.reasonCodes.includes("CONTEXT_BUDGET_GROWTH_WARNING"));
  assert.equal(result.sources[0].change.byteRelativeDelta, "0.300000");
});

test("Context Budget v1 token limits and identity changes stay advisory", () => {
  const advisoryBaseline = baseline([source({ envelope: { maxBytes: 1000, maxTokens: 20, mode: "hard" } })]);
  const result = report([current({ tokenEvidence: { state: "incomparable", identity: "different-tokenizer-v1" } })], advisoryBaseline);
  assert.equal(result.outcome, "pass-with-warnings");
  assert.equal(result.sources[0].envelopeStatus, "advisory");
  assert.ok(result.reasonCodes.includes("CONTEXT_BUDGET_TOKEN_INCOMPARABLE"));
  assert.equal(result.sources[0].change.tokenDelta, null);
});

test("Context Budget v1 stale, missing, extra, and overlapping evidence fails closed", () => {
  assert.throws(
    () => report([]),
    (error: unknown) => error instanceof ContextBudgetErrorV1 && error.reasonCode === "CONTEXT_BUDGET_SOURCE_MISSING",
  );
  assert.throws(
    () => report([current(), current({ identity: "README.md" })]),
    (error: unknown) => error instanceof ContextBudgetErrorV1 && error.reasonCode === "CONTEXT_BUDGET_INTERNAL_CONFLICT",
  );
  const base = baseline();
  const overlap = buildContextBudgetReportV1({
    requestId: "overlap-v1", baseline: base, baselineBytes: Buffer.from(canonicalJsonV1(base)), currentSources: [current()],
    project: { head: "2".repeat(40), dirty: true, overlappingPaths: ["AGENTS.md"] },
  });
  assert.equal(overlap.outcome, "fail");
  assert.ok(overlap.reasonCodes.includes("CONTEXT_BUDGET_SOURCE_CHANGED"));
});

test("Context Budget v1 reports contain identities and counts but no source content or private fields", () => {
  const text = canonicalJsonV1(report());
  assert.equal(text.includes("PRIVATE_SOURCE_CONTENT"), false);
  assert.equal(/C:\\\\|api[_-]?key|authorization|environmentValue/i.test(text), false);
  assert.match(text, /AGENTS\.md/);
  assert.match(text, /byteCount/);
});

test("Context Budget v1 CLI uses exact helper/compiler seams and performs no mutation", () => {
  const root = mkdtempSync(join(tmpdir(), "orchestrator-context-budget-"));
  const previousPython = process.env.PYTHON_BIN;
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    const sourceBytes = Buffer.from("Repository instructions.\n", "utf8");
    writeFileSync(join(root, "AGENTS.md"), sourceBytes);
    writeFileSync(join(root, "scripts", "ai_context_helper.py"), "console.log(JSON.stringify({read_set:[{path:'AGENTS.md'}]}));\n");
    const prefix = Buffer.from(String(compileStablePrefixV1({})), "utf8");
    const accepted = createContextBudgetBaselineV1({
      baselineId: "cli-context-v1", revision: 1,
      profiles: [{ profile: "review", maxSources: 4, expectedPaths: ["AGENTS.md"] }],
      sources: [
        { sourceClass: "repository_instructions", identity: "AGENTS.md", sha256: sha256V1(sourceBytes), byteCount: sourceBytes.length, tokenEvidence: estimateTokensV1(sourceBytes.length), envelope: { maxSourceCount: 1, maxBytes: sourceBytes.length, maxTokens: 100, mode: "hard" } },
        { sourceClass: "fixed_prompt_prefix", identity: "prompt-compiler:stable-prefix-v1", sha256: sha256V1(prefix), byteCount: prefix.length, tokenEvidence: estimateTokensV1(prefix.length), envelope: { maxSourceCount: 1, maxBytes: prefix.length, maxTokens: 100, mode: "hard" } },
      ],
    });
    writeFileSync(join(root, "docs", "context-budget-baseline-v1.json"), `${JSON.stringify(accepted, null, 2)}\n`);
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "."], { cwd: root });
    execFileSync("git", ["-c", "user.name=Context Test", "-c", "user.email=context@example.invalid", "commit", "-qm", "fixture"], { cwd: root });
    const before = execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" });
    process.env.PYTHON_BIN = process.execPath;
    const result = runContextBudgetReportCliV1({ root, baseline: "docs/context-budget-baseline-v1.json", requestId: "cli-report-v1" });
    const after = execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" });
    assert.equal(result.outcome, "pass");
    assert.equal(result.sources.length, 2);
    assert.equal(before, "");
    assert.equal(after, before);
    assert.equal(readFileSync(join(root, "AGENTS.md"), "utf8"), "Repository instructions.\n");
  } finally {
    if (previousPython === undefined) delete process.env.PYTHON_BIN;
    else process.env.PYTHON_BIN = previousPython;
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepted repository baseline keeps the current candidate inside every hard envelope", () => {
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const baselinePath = resolve(root, "docs/context-budget-baseline-v1.json");
  const baselineBytes = readFileSync(baselinePath);
  const accepted = JSON.parse(baselineBytes.toString("utf8"));
  assertContextBudgetBaselineV1(accepted);
  const currentSources: ContextBudgetCurrentSourceV1[] = accepted.sources.map((entry: ContextBudgetBaselineSourceV1) => {
    const bytes = entry.sourceClass === "fixed_prompt_prefix"
      ? Buffer.from(String(compileStablePrefixV1({})), "utf8")
      : readFileSync(resolve(root, entry.identity));
    return { sourceClass: entry.sourceClass, identity: entry.identity, sha256: sha256V1(bytes), byteCount: bytes.length, tokenEvidence: estimateTokensV1(bytes.length) };
  });
  const result = buildContextBudgetReportV1({
    requestId: "accepted-candidate-v1", baseline: accepted, baselineBytes, currentSources,
    project: { head: "3".repeat(40), dirty: false, overlappingPaths: [] },
  });
  assert.notEqual(result.outcome, "fail");
  assert.equal(result.sources.every((entry) => entry.byteCount <= accepted.sources.find((source: ContextBudgetBaselineSourceV1) => source.identity === entry.identity)!.envelope.maxBytes!), true);
});
