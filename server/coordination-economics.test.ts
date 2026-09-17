import assert from "node:assert/strict";
import test from "node:test";
import { coordinationReport } from "./coordination-economics.ts";
import { recorded, unavailable, sumMeasures } from "../shared/coordination-economics.ts";
import { createExecutionBudgetAdmissionV1, createExecutionBudgetSettlementV1, type ExecutionBudgetEvidenceV1, type ExecutionBudgetPolicyV1, type ExecutionBudgetSettlementStatusV1 } from "./execution-budgets-v1/index.ts";

const policy: ExecutionBudgetPolicyV1 = { contractType: "ExecutionBudgetPolicyV1", contractVersion: "1.0", budgetId: "report-budget", maxProviderInvocations: 6, phaseCaps: { executor: 3, reviewer: 2, correction: 1 } };
const at = "2026-09-17T10:00:00.000Z";
const end = "2026-09-17T10:00:02.000Z";
function fixture() {
  const evidence: ExecutionBudgetEvidenceV1[] = [];
  return { id: "report-run", startedAt: at, finishedAt: end, tasks: [{ id: "one", status: "completed", executionBudget: policy, executionBudgetEvidence: evidence, startedAt: at, finishedAt: end, executionAttempts: 2, attempts: 2 }] };
}
function append(source: ReturnType<typeof fixture>, phase: "executor" | "reviewer" | "correction", status: ExecutionBudgetSettlementStatusV1 = "completed", missing = false) {
  const evidence = source.tasks[0].executionBudgetEvidence;
  const admission = createExecutionBudgetAdmissionV1({ policy, runId: source.id, taskId: "one", phase, resolvedModel: "terra", evidence, recordedAt: at });
  evidence.push(admission);
  evidence.push(createExecutionBudgetSettlementV1({ policy, admission, status, settledAt: end, usage: missing ? { state: "missing" } : { state: "measured", inputTokens: 10, outputTokens: 2, cachedInputTokens: 3, cacheWriteTokens: 0 } }));
}
test("coordination sums multiple invocations separately by role without counting cache twice", () => {
  const source = fixture();
  append(source, "executor"); append(source, "executor"); append(source, "reviewer"); append(source, "correction");
  const result = coordinationReport(source);
  assert.deepEqual(result.durationMs, recorded(2000));
  const task = result.tasks[0];
  assert.equal(task.evidence, "budget");
  assert.deepEqual(task.phases.executor.calls, recorded(2));
  assert.deepEqual(task.phases.executor.tokens.inputTokens, recorded(20));
  assert.deepEqual(task.phases.executor.tokens.outputTokens, recorded(4));
  assert.deepEqual(task.phases.executor.tokens.cachedInputTokens, recorded(6));
  assert.deepEqual(task.phases.executor.reservedMs, recorded(4000));
  for (const role of ["reviewer", "correction"] as const) {
    assert.deepEqual(task.phases[role].calls, recorded(1));
    assert.deepEqual(task.phases[role].tokens.inputTokens, recorded(10));
    assert.deepEqual(task.phases[role].tokens.cacheWriteTokens, recorded(0));
  }
  assert.deepEqual(task.executorAttempts, recorded(2));
  assert.deepEqual(task.correctionAttempts, recorded(1));
});
test("coordination distinguishes zero, missing tokens, unsettled reservations and ambiguous recovery", () => {
  const source = fixture(); append(source, "executor"); append(source, "executor", "failed", true);
  append(source, "reviewer", "not_started_after_reservation", true);
  append(source, "correction", "recovery_ambiguous", true);
  const report = coordinationReport(source).tasks[0];
  assert.deepEqual(report.phases.executor.tokens.inputTokens, { value: 10, state: "partial" });
  assert.deepEqual(report.phases.executor.calls, recorded(2));
  assert.deepEqual(report.phases.reviewer.calls, recorded(0));
  assert.deepEqual(report.phases.correction.calls, unavailable());
  const open = fixture();
  open.tasks[0].executionBudgetEvidence.push(createExecutionBudgetAdmissionV1({ policy, runId: open.id, taskId: "one", phase: "executor", resolvedModel: "terra", evidence: [], recordedAt: at }));
  assert.deepEqual(coordinationReport(open).tasks[0].phases.executor.calls, unavailable());
  assert.deepEqual(coordinationReport(fixture()).tasks[0].phases.executor.calls, recorded(0));
});
test("coordination fails closed on duplicated, tampered or reordered budget evidence", () => {
  const source = fixture(); append(source, "executor");
  for (const evidence of [[...source.tasks[0].executionBudgetEvidence].reverse(), [...source.tasks[0].executionBudgetEvidence, source.tasks[0].executionBudgetEvidence[0]], [{ ...source.tasks[0].executionBudgetEvidence[0], taskId: "wrong" }]]) {
    const changed = structuredClone(source); changed.tasks[0].executionBudgetEvidence = evidence;
    const result = coordinationReport(changed).tasks[0];
    assert.equal(result.evidence, "invalid"); assert.deepEqual(result.phases.executor.calls, unavailable());
    assert.deepEqual(result.phases.executor.tokens.inputTokens, unavailable());
  }
});
test("legacy telemetry preserves missing versus zero, exact roles and duplicate ambiguity", () => {
  const entry = { phase: "executor", attempt: 1, recordedAt: at, inputTokens: 10, outputTokens: 0, cachedInputTokens: null };
  const result = coordinationReport({ id: "legacy", tasks: [{ id: "a", status: "completed", usage: [entry, { ...entry, attempt: 2, inputTokens: 5 }, { ...entry, phase: " executor ", inputTokens: 999 }, { ...entry, phase: "reviewer", inputTokens: 7, cacheWriteTokens: 0 }] }, { id: "b", status: "failed", usage: [entry, entry] }, { id: "c", status: "pending" }] });
  assert.deepEqual(result.tasks[0].phases.executor.tokens.inputTokens, { value: 15, state: "partial" });
  assert.deepEqual(result.tasks[0].phases.executor.tokens.outputTokens, { value: 0, state: "partial" });
  assert.deepEqual(result.tasks[0].phases.executor.tokens.cachedInputTokens, unavailable());
  assert.deepEqual(result.tasks[0].phases.executor.tokens.cacheWriteTokens, unavailable());
  assert.deepEqual(result.tasks[0].phases.reviewer.tokens.inputTokens, { value: 7, state: "partial" });
  assert.deepEqual(result.tasks[0].phases.reviewer.tokens.cacheWriteTokens, { value: 0, state: "partial" });
  for (const task of result.tasks) assert.deepEqual(task.phases.executor.calls, unavailable());
  assert.deepEqual(result.tasks[1].phases.executor.tokens.inputTokens, unavailable());
  assert.deepEqual(result.tasks[2].durationMs, unavailable());
});
test("coordination is deterministic, private and does not reattribute carried completion", () => {
  const source = { ...fixture(), prompt: "SECRET", tasks: [{ ...fixture().tasks[0], prompt: "SECRET", log: ["SECRET"], executionBudgetCarriedCompletion: { sourceRunId: "old", sourceTaskId: "old" } }] };
  const before = JSON.stringify(source);
  const report = coordinationReport(source);
  assert.deepEqual(report, coordinationReport(source)); assert.equal(JSON.stringify(source), before);
  assert.equal(JSON.stringify(report).includes("SECRET"), false);
  assert.equal(report.tasks[0].evidence, "carried");
  assert.deepEqual(report.tasks[0].phases.executor.calls, unavailable());
  assert.deepEqual(sumMeasures([recorded(3), unavailable(), recorded(2)]), { value: 5, state: "partial" });
  assert.deepEqual(sumMeasures([]), unavailable());
});
