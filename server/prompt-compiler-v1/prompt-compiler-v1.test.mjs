import assert from "node:assert/strict";
import test from "node:test";
import {
  EXECUTOR_OUTCOME_MARKER_V1,
  PROMPT_COMPILER_V1,
  PROTECTED_INVARIANTS_V1,
  comparePromptSizes,
  compilePromptV1,
  compileStablePrefixV1,
} from "./prompt-compiler-v1.mjs";
import {
  createLegacyPromptContractV1,
  renderLegacyPromptV1,
  renderProductionLegacyPromptV1,
} from "./legacy-prompt-renderer.mjs";
import {
  productionBuildPromptFixture,
  productionProjectFixture,
  productionTaskFixture,
  recordedFailedMeasurements,
} from "./size-comparison.fixture.mjs";

const clone = (value) => structuredClone(value);
const count = (text, value) => text.split(value).length - 1;
const productionEquivalentFixture = createLegacyPromptContractV1(
  productionBuildPromptFixture,
);

test("starts from the two recorded failed size measurements", () => {
  assert.deepEqual(recordedFailedMeasurements, [
    { compiledBytes: 1_370, legacyBytes: 1_115 },
    { compiledBytes: 1_474, legacyBytes: 1_137 },
  ]);
  assert.ok(recordedFailedMeasurements.every(({ compiledBytes, legacyBytes }) => compiledBytes > legacyBytes));
});

test("compiles one deterministic, explicit, versioned representation", () => {
  const first = compilePromptV1(productionEquivalentFixture);
  const second = compilePromptV1(clone(productionEquivalentFixture));

  assert.equal(PROMPT_COMPILER_V1, "OPC/1");
  assert.equal(first, second);
  assert.ok(first.startsWith(`${PROMPT_COMPILER_V1}\n`));
  assert.equal(count(first, productionEquivalentFixture.goal), 1);
  for (const value of [
    ...productionEquivalentFixture.successCriteria,
    ...productionEquivalentFixture.outputRequirements,
  ]) {
    assert.equal(count(first, value), 1, value);
  }
  for (const section of [
    "GOAL",
    "SUCCESS",
    "OUTPUT",
    "ALLOWED",
    "AUTHZ",
    "VERIFY",
    "STOP",
    "FINAL",
  ]) {
    assert.match(first, new RegExp(`(?:^|\\n)${section}\\n`), section);
  }
  assert.match(first, /(?:^|\n)SOURCES path\|priority\|authority\|why\n/);
  assert.match(first, new RegExp(`${EXECUTOR_OUTCOME_MARKER_V1}: COMPLETED`));
  assert.match(first, new RegExp(`${EXECUTOR_OUTCOME_MARKER_V1}: STOPPED`));
});

test("contains every protected invariant exactly once", () => {
  const prompt = compilePromptV1(productionEquivalentFixture);

  for (const [id, invariant] of Object.entries(PROTECTED_INVARIANTS_V1)) {
    assert.equal(count(prompt, invariant), 1, id);
  }
});

test("keeps runtime and volatile values out of the stable prefix and compiled prompt", () => {
  const withRuntime = {
    ...clone(productionEquivalentFixture),
    requestId: "REQUEST_ID_SECRET",
    timestamp: "TIMESTAMP_SECRET",
    workingState: "WORKING_STATE_SECRET",
    toolOutput: "TOOL_OUTPUT_SECRET",
  };
  const prefix = compileStablePrefixV1();
  const prompt = compilePromptV1(withRuntime);

  assert.ok(prompt.startsWith(prefix));
  for (const secret of [
    "REQUEST_ID_SECRET",
    "TIMESTAMP_SECRET",
    "WORKING_STATE_SECRET",
    "TOOL_OUTPUT_SECRET",
    "fixture-request",
    "fixture-bundle",
    "fixture-branch",
    "fixture-authority",
    "fixture-approval",
    "fixture-goal",
  ]) {
    assert.doesNotMatch(prefix, new RegExp(secret));
    assert.doesNotMatch(prompt, new RegExp(secret));
  }
});

test("projects every benchmark semantic input through production-owned code", () => {
  assert.ok(Object.isFrozen(productionBuildPromptFixture));
  assert.equal(productionBuildPromptFixture.task, productionTaskFixture);
  assert.equal(productionBuildPromptFixture.project, productionProjectFixture);
  assert.equal(
    productionBuildPromptFixture.authorization,
    productionTaskFixture.authorizationEvidence,
  );
  assert.equal(
    count(productionTaskFixture.prompt, PROTECTED_INVARIANTS_V1.completionReport),
    0,
    "buildPrompt appends the completion report; task.prompt must not duplicate it",
  );
  assert.deepEqual(productionProjectFixture.verificationCommands, [
    "node .\\node_modules\\typescript\\bin\\tsc -b --pretty false",
    "node .\\node_modules\\tsx\\dist\\cli.mjs --test server\\index.test.ts electron\\lifecycle.test.cjs",
  ]);
  assert.deepEqual(productionTaskFixture.verificationCommands, [
    "git diff --check",
    "node --test server\\prompt-compiler-v1\\prompt-compiler-v1.test.mjs",
  ]);
  assert.deepEqual(
    productionEquivalentFixture.verificationCommands,
    productionTaskFixture.authorizationEvidence.verificationCommands,
  );
  assert.equal(productionEquivalentFixture.task, productionTaskFixture.prompt);
  assert.equal(
    productionEquivalentFixture.goal,
    "Redesign only the isolated Compact Prompt Compiler representation test-first.",
  );
  assert.equal(productionEquivalentFixture.successCriteria.length, 3);
  assert.equal(productionEquivalentFixture.outputRequirements.length, 1);
  assert.deepEqual(productionEquivalentFixture.allowedPaths, productionTaskFixture.allowedPaths);
  assert.deepEqual(productionEquivalentFixture.executionGuards, productionTaskFixture.executionGuards);
  assert.deepEqual(
    productionEquivalentFixture.context.sources.map(({ path }) => path),
    ["AGENTS.md", "server/index.ts"],
  );
  assert.equal(productionEquivalentFixture.executorOutcomeContractVersion, 1);
});

test("benchmarks the production-owned legacy renderer directly and is at least 20% smaller", () => {
  const legacyPrompt = renderProductionLegacyPromptV1(productionBuildPromptFixture);
  assert.equal(legacyPrompt, renderLegacyPromptV1(productionEquivalentFixture));
  const compiledPrompt = compilePromptV1(productionEquivalentFixture);
  const comparison = comparePromptSizes({ legacyPrompt, compiledPrompt });

  assert.equal(comparison.legacyBytes, 2_405, "legacy production fixture must not be inflated");
  assert.match(legacyPrompt, /Finish with changed files, checks run, and remaining risks\./);
  assert.equal(count(compiledPrompt, PROTECTED_INVARIANTS_V1.completionReport), 1);
  assert.equal(comparison.legacyBytes, Buffer.byteLength(legacyPrompt, "utf8"));
  assert.equal(comparison.compiledBytes, Buffer.byteLength(compiledPrompt, "utf8"));
  assert.equal(comparison.deltaBytes, comparison.compiledBytes - comparison.legacyBytes);
  assert.equal(comparison.ratio, comparison.compiledBytes / comparison.legacyBytes);
  assert.ok(
    comparison.compiledBytes <= comparison.legacyBytes * 0.8,
    `expected compact <= 80% of legacy; got ${comparison.compiledBytes}/${comparison.legacyBytes}`,
  );
});

test("preserves the production prompt contract without adding or narrowing instructions", () => {
  const legacyPrompt = renderLegacyPromptV1(productionEquivalentFixture);
  const compiledPrompt = compilePromptV1(productionEquivalentFixture);

  for (const instruction of [
    "Read repository instructions, especially AGENTS.md, before changing code.",
    "Keep changes within the task scope.",
    "Do not create git commits.",
    "Finish with changed files, checks run, and remaining risks.",
  ]) {
    assert.equal(count(legacyPrompt, instruction), 1, instruction);
  }
  for (const [id, instruction] of Object.entries(PROTECTED_INVARIANTS_V1)) {
    assert.equal(count(compiledPrompt, instruction), 1, id);
  }
  assert.doesNotMatch(compiledPrompt, /MUST use SOURCES|verified repo evidence/);
  assert.doesNotMatch(compiledPrompt, /MUST read AGENTS\.md before edits/);
});

test("fails closed when the compact projection diverges from the production task", () => {
  const divergent = clone(productionEquivalentFixture);
  divergent.goal = "A different goal.";
  assert.throws(
    () => compilePromptV1(divergent),
    /task and projected goal\/success\/output semantics must exactly match/i,
  );
});

test("preserves apply authorization and exact allowed scope without granting arbitrary commands", () => {
  const prompt = compilePromptV1(productionEquivalentFixture);
  const authorization = productionEquivalentFixture.authorization;

  assert.match(prompt, /intent=apply/);
  assert.match(prompt, new RegExp(`${authorization.decision}\\(`));
  assert.match(prompt, new RegExp(`permission\\+risk=${authorization.technicalPermission}`));
  assert.match(prompt, new RegExp(`scope=${authorization.scopeFingerprint}`));
  assert.match(
    prompt,
    /Shell has no command allowlist; AUTHZ grants no arbitrary commands\./,
  );
  for (const allowedPath of productionEquivalentFixture.allowedPaths) {
    assert.equal(count(prompt, allowedPath), 1);
  }
});

test("preserves read-only intent and forbids mutation and mutating verification", () => {
  const fixture = clone(productionEquivalentFixture);
  fixture.allowedPaths = [];
  fixture.authorization = {
    enabled: true,
    decision: "authorized",
    reason: "READ_ONLY_INTENT",
    intent: "review",
    technicalPermission: "read_only",
    sideEffectRisk: "none",
    scopeFingerprint: "read-only",
    allowedPaths: [],
    verificationCommands: [],
  };
  fixture.verificationCommands = [];

  const prompt = compilePromptV1(fixture);
  assert.match(prompt, /intent=review/);
  assert.match(prompt, /permission=read_only/);
  assert.match(prompt, /Do not modify files or cause side effects\./);
  assert.match(prompt, /Do not run mutating verification commands\./);
  assert.match(prompt, /ALLOWED\n\(read-only; no writable paths\)/);
});

test("keeps apply verification owned by the orchestrator and command-limited", () => {
  const prompt = compilePromptV1(productionEquivalentFixture);

  assert.match(
    prompt,
    /VERIFY\nExecutor: no verification\. Orchestrator: only listed commands:/,
  );
  for (const command of productionEquivalentFixture.authorization.verificationCommands) {
    assert.equal(count(prompt, command), 1, command);
  }
});

test("preserves grounding source metadata and controlled fallback", () => {
  const prompt = compilePromptV1(productionEquivalentFixture);
  const { context } = productionEquivalentFixture;

  assert.match(prompt, new RegExp(`provider=${context.provider}`));
  assert.match(prompt, new RegExp(`fallback=${context.fallbackReason}`));
  for (const source of context.sources) {
    const sourceLine = `${source.path}|${source.priority}|${source.authority}|${source.inclusionReason}`;
    assert.equal(count(prompt, sourceLine), 1);
  }
});

test("preserves every execution guard and the stop semantics", () => {
  const prompt = compilePromptV1(productionEquivalentFixture);

  for (const guard of productionEquivalentFixture.executionGuards) {
    assert.equal(count(prompt, guard), 1);
  }
  assert.match(prompt, /Any guard: stop; report STOPPED\./);
});

test("fails closed when the completion contract is absent, unsupported, or duplicated", () => {
  for (const executorOutcomeContractVersion of [undefined, 2]) {
    const fixture = clone(productionEquivalentFixture);
    fixture.executorOutcomeContractVersion = executorOutcomeContractVersion;
    assert.throws(() => compilePromptV1(fixture), /executor outcome contract v1 is required/i);
  }

  const duplicated = clone(productionEquivalentFixture);
  duplicated.outputRequirements.push(PROTECTED_INVARIANTS_V1.completionReport);
  duplicated.task += `\n- ${PROTECTED_INVARIANTS_V1.completionReport}`;
  assert.throws(() => compilePromptV1(duplicated), /protected invariant completionReport.*exactly once/i);

  for (const outcome of ["COMPLETED", "STOPPED"]) {
    const injected = clone(productionEquivalentFixture);
    injected.outputRequirements.push(`${EXECUTOR_OUTCOME_MARKER_V1}: ${outcome}`);
    injected.task += `\n- ${EXECUTOR_OUTCOME_MARKER_V1}: ${outcome}`;
    assert.throws(
      () => compilePromptV1(injected),
      /executor outcome marker.*exactly once/i,
    );
  }
});

test("fails closed on ambiguous authorization or mismatched apply scope and verification", () => {
  const disabled = clone(productionEquivalentFixture);
  disabled.authorization.enabled = false;
  assert.throws(() => compilePromptV1(disabled), /authorization\.enabled must be true/i);

  const ambiguous = clone(productionEquivalentFixture);
  ambiguous.authorization.decision = "ambiguous";
  assert.throws(() => compilePromptV1(ambiguous), /authorization decision must be authorized/i);

  const mismatch = clone(productionEquivalentFixture);
  mismatch.authorization.verificationCommands = ["npm test"];
  assert.throws(() => compilePromptV1(mismatch), /verification commands must exactly match/i);

  const scopeMismatch = clone(productionEquivalentFixture);
  scopeMismatch.authorization.allowedPaths = ["server"];
  assert.throws(() => compilePromptV1(scopeMismatch), /allowed paths must exactly match/i);

  const missingApplyScope = clone(productionEquivalentFixture);
  missingApplyScope.allowedPaths = [];
  missingApplyScope.authorization.allowedPaths = [];
  assert.throws(() => compilePromptV1(missingApplyScope), /apply authorization requires at least one allowed path/i);
});

test("fails closed when read-only intent carries write or verification authority", () => {
  const writable = clone(productionEquivalentFixture);
  writable.allowedPaths = [];
  writable.verificationCommands = [];
  writable.authorization = {
    ...writable.authorization,
    intent: "review",
    technicalPermission: "reversible_local_write",
    sideEffectRisk: "none",
    allowedPaths: [],
    verificationCommands: [],
  };
  assert.throws(() => compilePromptV1(writable), /non-apply authorization must be read-only/i);

  const verifies = clone(writable);
  verifies.authorization.technicalPermission = "read_only";
  verifies.authorization.verificationCommands = ["node --test"];
  assert.throws(() => compilePromptV1(verifies), /no verification authority/i);
});

test("rejects payloads that make the compact grammar ambiguous", () => {
  const sectionInjection = clone(productionEquivalentFixture);
  sectionInjection.successCriteria.push("STOP");
  sectionInjection.task = [
    `Goal: ${sectionInjection.goal}`,
    "Success criteria:",
    ...sectionInjection.successCriteria.map((criterion) => `- ${criterion}`),
    "Output requirements:",
    ...sectionInjection.outputRequirements.map((requirement) => `- ${requirement}`),
  ].join("\n");
  assert.throws(
    () => compilePromptV1(sectionInjection),
    /successCriteria\[3\].*reserved control line/i,
  );

  const brokenSourceRecord = clone(productionEquivalentFixture);
  brokenSourceRecord.context.sources[0].inclusionReason = "required|but ambiguous";
  assert.throws(
    () => compilePromptV1(brokenSourceRecord),
    /context\.sources\[0\]\.inclusionReason.*reserved delimiter/i,
  );
});

test("preserves the pre-existing generic compiler API used by unrelated cache work", () => {
  const generic = {
    governance: {
      version: "v1",
      requiredInvariants: [{ id: "scope", text: "Stay in scope." }],
      rules: ["No commits."],
    },
    toolContract: {
      version: "v1",
      allowedTools: ["shell"],
      rules: ["Declared only."],
    },
    task: {
      goal: "Implement.",
      successCriteria: ["Pass."],
      outputContract: "Report.",
      allowedScope: ["server"],
      verificationCommands: ["node --test"],
      stopRules: ["Stop on regression."],
    },
  };

  const { prefix } = compileStablePrefixV1({ governance: generic.governance });
  const prompt = compilePromptV1(generic);
  assert.ok(prompt.startsWith(prefix));
  assert.match(prompt, /Stay in scope\./);
  assert.match(prompt, /shell/);
});
