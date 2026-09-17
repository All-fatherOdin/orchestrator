import { assertExecutionBudgetEvidenceV1, type ExecutionBudgetEvidenceV1, type ExecutionBudgetPolicyV1 } from "./execution-budgets-v1/index.ts";
import { coordinationPhases, tokenFields, recorded, unavailable, sumMeasures, type CoordinationReport, type CoordinationTask, type PhaseCost, type Measure } from "../shared/coordination-economics.ts";

type TaskSource = {
  id: string; status: string; reviewStatus?: string; startedAt?: string; finishedAt?: string;
  executionAttempts?: number; attempts?: number; usage?: unknown;
  executionBudget?: ExecutionBudgetPolicyV1; executionBudgetEvidence?: ExecutionBudgetEvidenceV1[];
  executionBudgetCarriedCompletion?: unknown;
};
type Source = { id: string; startedAt?: string; finishedAt?: string; tasks: TaskSource[] };
const count = (value: unknown): Measure => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? recorded(value) : unavailable();
function duration(start?: string, end?: string): Measure {
  if (typeof start !== "string" || typeof end !== "string") return unavailable();
  return count(Date.parse(end) - Date.parse(start));
}
const emptyPhase = (): PhaseCost => ({ calls: unavailable(), reservedMs: unavailable(), tokens: { inputTokens: unavailable(), outputTokens: unavailable(), cachedInputTokens: unavailable(), cacheWriteTokens: unavailable() } });

/** Read-only, clock-free projection. Does not parse logs/prompts or infer provider calls from usage events. */
export function coordinationReport(source: Source): CoordinationReport {
  const tasks = source.tasks.map((task): CoordinationTask => {
    const result: CoordinationTask = {
      id: task.id, status: task.status, reviewStatus: task.reviewStatus ?? null,
      durationMs: duration(task.startedAt, task.finishedAt), executorAttempts: count(task.executionAttempts),
      correctionAttempts: typeof task.attempts === "number" && task.attempts >= 1 ? count(task.attempts - 1) : unavailable(),
      evidence: "legacy", phases: { executor: emptyPhase(), reviewer: emptyPhase(), correction: emptyPhase() },
    };
    if (task.executionBudgetCarriedCompletion) { result.evidence = "carried"; return result; }
    if (task.executionBudget || task.executionBudgetEvidence !== undefined) {
      try {
        if (!task.executionBudget || !Array.isArray(task.executionBudgetEvidence)) throw new Error("Missing budget evidence");
        assertExecutionBudgetEvidenceV1(task.executionBudget, source.id, task.id, task.executionBudgetEvidence);
        const evidence = task.executionBudgetEvidence;
        result.evidence = "budget";
        for (const phase of coordinationPhases) {
          const admissions = evidence.filter(entry => entry.contractType === "ExecutionBudgetAdmissionV1" && entry.disposition === "allow" && entry.phase === phase);
          const observations = admissions.map(admission => {
            if (admission.contractType !== "ExecutionBudgetAdmissionV1") throw new Error("Invalid admission");
            const settlement = evidence.find(entry => entry.contractType === "ExecutionBudgetSettlementV1" && entry.admissionId === admission.admissionId);
            if (!settlement || settlement.contractType !== "ExecutionBudgetSettlementV1" || settlement.status === "recovery_ambiguous") return emptyPhase();
            if (settlement.status === "not_started_after_reservation") return { calls: recorded(0), reservedMs: recorded(0), tokens: Object.fromEntries(tokenFields.map(key => [key, recorded(0)])) as PhaseCost["tokens"] };
            return { calls: recorded(1), reservedMs: duration(admission.recordedAt, settlement.settledAt), tokens: Object.fromEntries(tokenFields.map(key => [key, settlement.usage.state === "measured" ? count(settlement.usage[key]) : unavailable()])) as PhaseCost["tokens"] };
          });
          result.phases[phase] = {
            calls: admissions.length ? sumMeasures(observations.map(item => item.calls)) : recorded(0),
            reservedMs: admissions.length ? sumMeasures(observations.map(item => item.reservedMs)) : recorded(0),
            tokens: Object.fromEntries(tokenFields.map(key => [key, admissions.length ? sumMeasures(observations.map(item => item.tokens[key])) : recorded(0)])) as PhaseCost["tokens"],
          };
        }
      } catch { result.evidence = "invalid"; }
      return result;
    }
    // Legacy telemetry has no invocation identity. Duplicated identities are ambiguous,
    // so omit the entire duplicate group rather than double-counting or choosing a winner.
    const usage = Array.isArray(task.usage) ? task.usage.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object" && !Array.isArray(entry)) : [];
    const identity = (entry: Record<string, unknown>) => JSON.stringify([entry.phase, entry.attempt, entry.recordedAt]);
    const frequencies = new Map<string, number>();
    for (const entry of usage) frequencies.set(identity(entry), (frequencies.get(identity(entry)) ?? 0) + 1);
    for (const phase of coordinationPhases) {
      const entries = usage.filter(entry => entry.phase === phase && frequencies.get(identity(entry)) === 1 && count(entry.attempt).value !== null && Number(entry.attempt) > 0 && typeof entry.recordedAt === "string" && Number.isFinite(Date.parse(entry.recordedAt)));
      for (const key of tokenFields) {
        const total = sumMeasures(entries.map(entry => count(entry[key])));
        result.phases[phase].tokens[key] = total.value === null ? total : { ...total, state: "partial" };
      }
    }
    return result;
  });
  return { version: 1, runId: source.id, durationMs: duration(source.startedAt, source.finishedAt), tasks };
}
