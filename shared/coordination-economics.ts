export const coordinationPhases = ["executor", "reviewer", "correction"] as const;
export type CoordinationPhase = typeof coordinationPhases[number];
export type Measure = { value: number | null; state: "recorded" | "partial" | "unavailable" };
export const unavailable = (): Measure => ({ value: null, state: "unavailable" });
export const recorded = (value: number): Measure => ({ value, state: "recorded" });
export function sumMeasures(values: Measure[]): Measure {
  const known = values.filter(item => item.value !== null);
  if (!known.length) return unavailable();
  const value = known.reduce((sum, item) => sum + item.value!, 0);
  if (!Number.isSafeInteger(value)) return unavailable();
  return { value, state: values.every(item => item.state === "recorded") ? "recorded" : "partial" };
}
export const tokenFields = ["inputTokens", "outputTokens", "cachedInputTokens", "cacheWriteTokens"] as const;
export type PhaseCost = { calls: Measure; reservedMs: Measure; tokens: Record<typeof tokenFields[number], Measure> };
export type CoordinationTask = {
  id: string; status: string; reviewStatus: string | null;
  durationMs: Measure; executorAttempts: Measure; correctionAttempts: Measure;
  evidence: "budget" | "legacy" | "invalid" | "carried";
  phases: Record<CoordinationPhase, PhaseCost>;
};
export type CoordinationReport = { version: 1; runId: string; durationMs: Measure; tasks: CoordinationTask[] };
