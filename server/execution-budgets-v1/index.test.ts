import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv8/dist/2020.js";
import examples from "./schemas/execution-budgets-v1.examples.json";
import schema from "./schemas/execution-budgets-v1.schema.json";
import {
  assertExecutionBudgetEvidenceV1,
  assertExecutionBudgetPolicyV1,
  canonicalExecutionBudgetJsonV1,
  createExecutionBudgetAdmissionV1,
  createExecutionBudgetSettlementV1,
  executionBudgetPolicyHashV1,
  executionBudgetProjectionV1,
  ExecutionBudgetErrorV1,
  normalizeExecutionBudgetUsageV1,
  type ExecutionBudgetEvidenceV1,
  type ExecutionBudgetPolicyV1,
} from "./index.ts";

const policy = examples.valid.ExecutionBudgetPolicyV1 as ExecutionBudgetPolicyV1;
const at = "2026-08-13T00:00:00.000Z";

function admission(
  evidence: readonly ExecutionBudgetEvidenceV1[],
  phase: "executor" | "reviewer" | "correction",
) {
  return createExecutionBudgetAdmissionV1({
    policy,
    runId: "run-one",
    taskId: "task-one",
    phase,
    resolvedModel: "terra",
    evidence,
    recordedAt: at,
  });
}

function settlement(
  entry: ReturnType<typeof admission>,
  status: "completed" | "failed" = "completed",
) {
  return createExecutionBudgetSettlementV1({
    policy,
    admission: entry,
    status,
    usage: {
      state: "measured",
      inputTokens: 10,
      outputTokens: 2,
      cachedInputTokens: 3,
      cacheWriteTokens: 0,
    },
    settledAt: "2026-08-13T00:01:00.000Z",
  });
}

test("Execution Budget v1 closed schemas accept fixtures and reject unknown fields", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  for (const value of Object.values(examples.valid))
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...examples.valid.ExecutionBudgetPolicyV1, maxOutputTokens: 100 }), false);
  assert.throws(
    () => assertExecutionBudgetPolicyV1({ ...policy, tokenBudget: 100 }),
    (error: unknown) =>
      error instanceof ExecutionBudgetErrorV1 &&
      error.reasonCode === "EXECUTION_BUDGET_POLICY_INVALID",
  );
});

test("Execution Budget v1 policy normalization and identity are deterministic", () => {
  const reordered = {
    phaseCaps: { correction: 1, reviewer: 2, executor: 1 },
    maxProviderInvocations: 4,
    budgetId: "task-budget-v1",
    contractVersion: "1.0",
    contractType: "ExecutionBudgetPolicyV1",
  } as ExecutionBudgetPolicyV1;
  assert.equal(canonicalExecutionBudgetJsonV1(reordered), canonicalExecutionBudgetJsonV1(policy));
  assert.equal(executionBudgetPolicyHashV1(reordered), executionBudgetPolicyHashV1(policy));
});

test("Execution Budget v1 rejects contradictory policy and existing-limit expansion", () => {
  assert.throws(() => assertExecutionBudgetPolicyV1({ ...policy, phaseCaps: { executor: 1, reviewer: 1, correction: 1 } }));
  assert.throws(() => assertExecutionBudgetPolicyV1(policy, { maxExecutorInvocations: 0, maxCorrections: 1 }));
  assert.throws(() => assertExecutionBudgetPolicyV1(policy, { maxExecutorInvocations: 1, maxCorrections: 0 }));
});

test("Execution Budget v1 reservation precedes one exact settlement and replays", () => {
  const first = admission([], "executor");
  assert.equal(first.disposition, "allow");
  const done = settlement(first);
  assert.doesNotThrow(() => assertExecutionBudgetEvidenceV1(policy, "run-one", "task-one", [first, done]));
  assert.equal(settlement(first).settlementId, done.settlementId);
});

test("Execution Budget v1 defers while the last reservation remains unsettled", () => {
  const first = admission([], "executor");
  const deferred = admission([first], "reviewer");
  assert.equal(deferred.disposition, "defer");
  assert.equal(deferred.reasonCode, "EXECUTION_BUDGET_DEFERRED_TO_LIVE_RESERVATION");
});

test("Execution Budget v1 reserves capacity for mandatory review", () => {
  const narrow: ExecutionBudgetPolicyV1 = {
    ...policy,
    maxProviderInvocations: 2,
    phaseCaps: { executor: 2, reviewer: 1, correction: 0 },
  };
  const first = createExecutionBudgetAdmissionV1({
    policy: narrow, runId: "run-one", taskId: "task-one", phase: "executor",
    resolvedModel: "terra", evidence: [], recordedAt: at,
  });
  const done = createExecutionBudgetSettlementV1({
    policy: narrow, admission: first, status: "failed", usage: { state: "missing" }, settledAt: at,
  });
  const retry = createExecutionBudgetAdmissionV1({
    policy: narrow, runId: "run-one", taskId: "task-one", phase: "executor",
    resolvedModel: "terra", evidence: [first, done], recordedAt: at,
  });
  assert.equal(retry.disposition, "reject");
  assert.equal(retry.reasonCode, "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED");
  const review = createExecutionBudgetAdmissionV1({
    policy: narrow, runId: "run-one", taskId: "task-one", phase: "reviewer",
    resolvedModel: "terra", evidence: [first, done], recordedAt: at,
  });
  assert.equal(review.disposition, "allow");
});

test("Execution Budget v1 correction preserves capacity for required re-review", () => {
  const evidence: ExecutionBudgetEvidenceV1[] = [];
  const executor = admission(evidence, "executor"); evidence.push(executor, settlement(executor));
  const reviewer = admission(evidence, "reviewer"); evidence.push(reviewer, settlement(reviewer, "failed"));
  const correction = admission(evidence, "correction"); evidence.push(correction, settlement(correction));
  const rereview = admission(evidence, "reviewer");
  assert.equal(correction.disposition, "allow");
  assert.equal(rereview.disposition, "allow");
  evidence.push(rereview, settlement(rereview));
  const exhausted = admission(evidence, "correction");
  assert.equal(exhausted.disposition, "reject");
});

test("Execution Budget v1 normalizes exact usage and keeps missing or conflicts explicit", () => {
  const usage = { inputTokens: 10, outputTokens: 2, cachedInputTokens: 3, cacheWriteTokens: 0 };
  assert.deepEqual(normalizeExecutionBudgetUsageV1([usage, usage]), { state: "measured", ...usage });
  assert.deepEqual(normalizeExecutionBudgetUsageV1([]), { state: "missing" });
  assert.deepEqual(normalizeExecutionBudgetUsageV1([usage, { ...usage, outputTokens: 3 }]), { state: "conflicting" });
});

test("Execution Budget v1 replay rejects changed identity, forged order, and duplicate settlement", () => {
  const first = admission([], "executor");
  const done = settlement(first);
  assert.throws(() => assertExecutionBudgetEvidenceV1(policy, "other-run", "task-one", [first, done]));
  assert.throws(() => assertExecutionBudgetEvidenceV1(policy, "run-one", "task-one", [{ ...first, taskInvocationOrdinal: 2 }]));
  assert.throws(() => assertExecutionBudgetEvidenceV1(policy, "run-one", "task-one", [first, done, done]));
  const second = admission([first, done], "reviewer");
  assert.throws(() => assertExecutionBudgetEvidenceV1(policy, "run-one", "task-one", [first, second]));
  const forgedDisposition = {
    ...first,
    disposition: "human-decision-required" as const,
    reasonCode: "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED" as const,
  };
  assert.throws(() => assertExecutionBudgetEvidenceV1(policy, "run-one", "task-one", [forgedDisposition]));
});

test("Execution Budget v1 projection exposes only bounded counts and unsupported token enforcement", () => {
  const first = admission([], "executor");
  const projection = executionBudgetProjectionV1(policy, [first, settlement(first)]);
  assert.deepEqual(projection.consumedByPhase, { executor: 1, reviewer: 0, correction: 0 });
  assert.equal(projection.remainingProviderInvocations, 3);
  assert.equal(projection.tokenEnforcement, "unsupported");
  assert.equal(JSON.stringify(projection).includes("prompt"), false);
});
