import { createHash } from "node:crypto";
import Ajv2020, { type ValidateFunction } from "ajv8/dist/2020.js";
import evalLineageSchema from "./schemas/eval-lineage-v1.schema.json";

export const EVAL_LINEAGE_EVENT_TYPES_V1 = [
  "eval.suite-published", "eval.suite-revoked",
  "eval.cohort-published", "eval.cohort-revoked",
  "eval.run-registered", "eval.run-started", "eval.observation-recorded",
  "eval.run-sealed", "eval.run-failed", "eval.run-cancelled",
  "eval.report-published", "eval.import-recorded",
  "lineage.champion-decided", "lineage.champion-revoked",
] as const;
export type EvalLineageEventTypeV1 = (typeof EVAL_LINEAGE_EVENT_TYPES_V1)[number];

export const EVAL_LINEAGE_REASON_CODES_V1 = [
  "EVAL_SUITE_UNKNOWN", "EVAL_SUITE_REVOKED", "EVAL_COHORT_INVALID",
  "EVAL_RUN_STATE_INVALID", "EVAL_OBSERVATION_INCOMPLETE",
  "EVAL_OBSERVATION_CONFLICT", "EVAL_RESULT_UNSUPPORTED",
  "EVAL_NOT_COMPARABLE", "EVAL_SAMPLE_INSUFFICIENT",
  "EVAL_GUARDRAIL_FAILED", "CHAMPION_AUTHORITY_REQUIRED",
  "CHAMPION_DECISION_INVALID", "EVAL_IMPORT_INVALID",
  "CROSS_ENTITY_IDENTITY_MISMATCH", "PUBLISHER_OCCURRENCE_CONFLICT",
  "SCHEMA_INVALID",
] as const;
export type EvalLineageReasonCodeV1 = (typeof EVAL_LINEAGE_REASON_CODES_V1)[number];

export type EvalDimensionV1 = Readonly<
  | { state: "unsupported"; reason: string }
  | { state: "measured"; value: string; reason: string }
>;
export type EvalMetricV1 = Readonly<
  | { state: "unsupported"; reason: string }
  | { state: "measured"; value: number; unit: string }
>;

export type EvalCaseV1 = Readonly<{
  evalCaseId: string;
  inputFixtureRef: string;
  acceptanceOracle: Readonly<{ kind: "executable" | "human"; oracleRef: string }>;
  severity: "warning" | "blocking" | "critical";
  expectedEvidenceRefs: readonly string[];
}>;

export type EvalSuiteV1 = Readonly<{
  contractType: "EvalSuiteV1"; contractVersion: "1.0";
  evalSuiteId: string; version: string; purpose: string;
  orderedCaseIds: readonly string[]; cases: readonly EvalCaseV1[];
  requiredOutcomeDimensions: readonly string[];
  metricPolicyVersion: string;
  criticalGate: Readonly<{ requiredPassRate: number; criticalCaseIds: readonly string[] }>;
  samplingPolicy: Readonly<{ samplesPerCandidate: number; retryPolicy: "none" | "new_sample" }>;
  environmentClass: string; privacyClassification: "public_fixture" | "approved_internal_fixture";
  supersedesId?: string; publishedBy: string; publishedAt: string;
}>;

export type EvalCohortV1 = Readonly<{
  contractType: "EvalCohortV1"; contractVersion: "1.0";
  evalCohortId: string;
  orderedMembers: readonly Readonly<{
    changeId: string; waveId: string; taskId: string; bindingId: string; commitSha?: string;
  }>[];
  eligibilityRule: string; inclusionRules: readonly string[]; exclusionRules: readonly string[];
  selectionSeed: string; selectedAt: string;
  observationWindow: Readonly<{ startsAt: string; endsAt: string }>;
  taskMix: Readonly<Record<string, number>>;
  baselineProvenance: Readonly<{ kind: "prior" | "manual" | "none"; evidenceRefs: readonly string[] }>;
  supersedesId?: string; publishedBy: string; publishedAt: string;
}>;

export type EvalCandidateV1 = Readonly<{
  candidateId: string; promptManifestHash: string; modelRouteId: string;
  dimensions: Readonly<Record<string, EvalDimensionV1>>;
}>;

export type EvalRunV1 = Readonly<{
  contractType: "EvalRunV1"; contractVersion: "1.0";
  evalRunId: string; evalSuiteId: string; evalCohortId: string;
  candidates: readonly EvalCandidateV1[];
  runner: Readonly<{ runnerId: string; version: string; codeHash: string }>;
  environmentClass: string; executionMode: "mock" | "provider" | "imported";
  registeredBy: string; registeredAt: string;
}>;
export type EvalRunStateV1 = "registered" | "running" | "sealed" | "failed" | "cancelled";

export type EvalObservationV1 = Readonly<{
  contractType: "EvalObservationV1"; contractVersion: "1.0";
  evalObservationId: string; evalRunId: string; evalCaseId: string;
  sampleOrdinal: number; candidateId: string; invocationId: string;
  member: Readonly<{ changeId: string; waveId: string; taskId: string; bindingId: string; commitSha?: string }>;
  result: "passed" | "failed" | "interrupted" | "unsupported";
  outcomes: Readonly<Record<string, Readonly<{ state: "pass" | "fail" | "unsupported"; evidenceRefs: readonly string[] }>>>;
  metrics: Readonly<Record<string, EvalMetricV1>>;
  policyViolationCodes: readonly string[]; haltIds: readonly string[]; incidentIds: readonly string[];
  incidentCoverage: Readonly<{ startsAt: string; endsAt: string; sourceRefs: readonly string[] }>;
  observedAt: string;
}>;

export type EvalMetricResultV1 = Readonly<{
  state: "measured" | "unsupported"; numerator: number; denominator: number;
  value?: number; unit?: string; uncertainty?: Readonly<{ method: "wilson95"; lower: number; upper: number }>;
  reason?: string;
}>;
export type EvalReportV1 = Readonly<{
  contractType: "EvalReportV1"; contractVersion: "1.0";
  evalReportId: string; evalRunId: string; metricPolicyVersion: string;
  cohortSize: number; taskMix: Readonly<Record<string, number>>;
  candidateResults: readonly Readonly<{ candidateId: string; metrics: Readonly<Record<string, EvalMetricResultV1>> }>[];
  baselineCandidateId?: string;
  comparisons: readonly Readonly<{
    baselineCandidateId: string; candidateId: string;
    verdict: "comparable" | "not_comparable";
    blockers: readonly string[];
    deltas: Readonly<Record<string, Readonly<{ absolute: number; relative?: number }>>>;
  }>[];
  exclusions: readonly Readonly<{ observationId: string; reasonCode: string }>[];
  computedAt: string; evaluatorId: string;
}>;

export type EvalImportReceiptV1 = Readonly<{
  contractType: "EvalImportReceiptV1"; contractVersion: "1.0";
  importReceiptId: string; sourceKind: "runtime-evals-v1";
  sourceReportHash: string; sourceReportVersion: "runtime-evals-v1";
  importedEvalRunId: string; unsupportedDimensions: readonly string[];
  importedBy: string; importedAt: string;
}>;

export type ChampionDecisionV1 = Readonly<{
  contractType: "ChampionDecisionV1"; contractVersion: "1.0";
  championDecisionId: string; scopeId: string;
  baselineCandidateId: string; candidateId: string;
  evalRunIds: readonly string[]; evalReportIds: readonly string[];
  objective: Readonly<{ metric: string; minimumImprovement: number }>;
  guardrails: readonly Readonly<{ metric: string; maximumRegression: number }>[];
  minimumSampleSize: number;
  decision: "promote" | "retain" | "reject" | "inconclusive";
  authority: Readonly<{ kind: "human" | "policy"; actor: string; authoritySource: string }>;
  reason: string; decidedAt: string; expiresAt?: string;
}>;

export type EvalRevocationV1 = Readonly<{
  entityId: string; reasonCode: string; reason: string; evidenceRefs: readonly string[];
  revokedBy: string; revokedAt: string;
}>;

export type EvalLineageEventV1 = Readonly<{
  id: string; sequence: number; type: EvalLineageEventTypeV1; occurredAt: string;
  projectId: string; changeId: string; actor: string; causationId: string; correlationId: string;
  payload: Readonly<{
    publisherOccurrenceId: string; suite?: EvalSuiteV1; cohort?: EvalCohortV1; run?: EvalRunV1;
    observation?: EvalObservationV1; report?: EvalReportV1; importReceipt?: EvalImportReceiptV1;
    championDecision?: ChampionDecisionV1; revocation?: EvalRevocationV1;
  }>;
  previousHash: string | null; hash: string;
}>;

type Published<T> = { value: T; status: "published" | "revoked"; sequence: number; revocation?: EvalRevocationV1 };
type RunProjection = { run: EvalRunV1; state: EvalRunStateV1; observations: Map<string, EvalObservationV1>; terminalAt?: string };
export type MutableEvalLineageProjectionV1 = {
  projectId: string; suites: Map<string, Published<EvalSuiteV1>>; cohorts: Map<string, Published<EvalCohortV1>>;
  runs: Map<string, RunProjection>; reports: Map<string, EvalReportV1>;
  imports: Map<string, EvalImportReceiptV1>; championDecisions: Map<string, ChampionDecisionV1>;
  revokedChampionDecisionIds: Set<string>; occurrenceEvents: Map<string, EvalLineageEventV1>;
  events: EvalLineageEventV1[];
};
export type EvalLineageProjectionV1 = Readonly<{
  projectId: string; suites: readonly Published<EvalSuiteV1>[]; cohorts: readonly Published<EvalCohortV1>[];
  runs: readonly Readonly<{ run: EvalRunV1; state: EvalRunStateV1; observations: readonly EvalObservationV1[]; terminalAt?: string }>[];
  reports: readonly EvalReportV1[]; imports: readonly EvalImportReceiptV1[];
  championDecisions: readonly Readonly<{ decision: ChampionDecisionV1; status: "active" | "revoked" }>[];
  events: readonly EvalLineageEventV1[];
}>;

export type EvalReplayContextV1 = Readonly<{
  hasChange: (changeId: string) => boolean;
  hasBinding: (bindingId: string, member: EvalObservationV1["member"] | EvalCohortV1["orderedMembers"][number]) => boolean;
  hasHalt: (haltId: string) => boolean; hasIncident: (incidentId: string) => boolean;
}>;

export class EvalLineageErrorV1 extends Error {
  constructor(readonly reasonCode: EvalLineageReasonCodeV1, message: string) { super(message); this.name = "EvalLineageErrorV1"; }
}
const fail = (reasonCode: EvalLineageReasonCodeV1, message: string): never => { throw new EvalLineageErrorV1(reasonCode, message); };
const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date-time", true); ajv.addSchema(evalLineageSchema);
const validators = new Map<string, ValidateFunction>();
for (const name of ["EvalSuiteV1", "EvalCohortV1", "EvalRunV1", "EvalObservationV1", "EvalReportV1", "EvalImportReceiptV1", "ChampionDecisionV1", "EvalLineageEventV1"]) {
  const validator = ajv.getSchema(`${evalLineageSchema.$id}#/$defs/${name}`);
  if (!validator) throw new Error(`Missing eval lineage schema definition ${name}.`);
  validators.set(name, validator);
}
export function assertEvalSchemaV1<T>(name: string, value: unknown): asserts value is T {
  const validator = validators.get(name); if (!validator || !validator(value))
    fail("SCHEMA_INVALID", `${name} is invalid: ${ajv.errorsText(validator?.errors, { separator: "; " })}`);
}
const utc = (value: string, field: string) => { if (!value || !Number.isFinite(Date.parse(value))) fail("SCHEMA_INVALID", `${field} must be a UTC instant.`); };
const unique = (items: readonly string[]) => new Set(items).size === items.length;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
};
export const evalContentHashV1 = (value: unknown) => sha256(canonical(value));

export function createEvalLineageProjectionV1(projectId: string): MutableEvalLineageProjectionV1 {
  return { projectId, suites: new Map(), cohorts: new Map(), runs: new Map(), reports: new Map(), imports: new Map(), championDecisions: new Map(), revokedChampionDecisionIds: new Set(), occurrenceEvents: new Map(), events: [] };
}
function validateSuite(suite: EvalSuiteV1, projection: MutableEvalLineageProjectionV1) {
  utc(suite.publishedAt, "publishedAt");
  if (!unique(suite.orderedCaseIds) || suite.orderedCaseIds.length !== suite.cases.length || suite.orderedCaseIds.some((id, i) => id !== suite.cases[i]?.evalCaseId)) fail("SCHEMA_INVALID", "Suite cases must exactly match the immutable ordered case manifest.");
  if (!unique(suite.requiredOutcomeDimensions) || !unique(suite.criticalGate.criticalCaseIds) || suite.criticalGate.criticalCaseIds.some((id) => !suite.orderedCaseIds.includes(id))) fail("SCHEMA_INVALID", "Suite outcome and critical manifests must be unique and known.");
  if (suite.supersedesId && !projection.suites.has(suite.supersedesId)) fail("EVAL_SUITE_UNKNOWN", "Suite supersedes an unknown suite.");
}
function validateCohort(cohort: EvalCohortV1, projection: MutableEvalLineageProjectionV1, context: EvalReplayContextV1) {
  utc(cohort.selectedAt, "selectedAt"); utc(cohort.publishedAt, "publishedAt"); utc(cohort.observationWindow.startsAt, "startsAt"); utc(cohort.observationWindow.endsAt, "endsAt");
  if (Date.parse(cohort.selectedAt) > Date.parse(cohort.observationWindow.startsAt) || Date.parse(cohort.observationWindow.startsAt) >= Date.parse(cohort.observationWindow.endsAt) || cohort.orderedMembers.length === 0 || !unique(cohort.orderedMembers.map((m) => `${m.changeId}\0${m.waveId}\0${m.taskId}\0${m.bindingId}`)) || cohort.orderedMembers.some((member) => !context.hasBinding(member.bindingId, member))) fail("EVAL_COHORT_INVALID", "Cohort selection must be fixed before observation and bind exact known members.");
  if (cohort.supersedesId && !projection.cohorts.has(cohort.supersedesId)) fail("EVAL_COHORT_INVALID", "Cohort supersedes an unknown cohort.");
}
function observationKey(observation: EvalObservationV1) { return `${observation.evalCaseId}\0${observation.sampleOrdinal}\0${observation.candidateId}`; }
function expectedObservationKeys(run: EvalRunV1, suite: EvalSuiteV1) {
  const keys: string[] = [];
  for (const caseId of suite.orderedCaseIds) for (let sample = 1; sample <= suite.samplingPolicy.samplesPerCandidate; sample += 1) for (const candidate of run.candidates) keys.push(`${caseId}\0${sample}\0${candidate.candidateId}`);
  return keys;
}
function wilson95(numerator: number, denominator: number) {
  if (!denominator) return { method: "wilson95" as const, lower: 0, upper: 1 };
  const z = 1.959963984540054, p = numerator / denominator, d = 1 + z * z / denominator;
  const center = (p + z * z / (2 * denominator)) / d;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * denominator)) / denominator) / d;
  return { method: "wilson95" as const, lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}
export function computeEvalReportV1(input: { evalReportId: string; run: RunProjection; suite: EvalSuiteV1; cohort: EvalCohortV1; baselineCandidateId?: string; computedAt: string; evaluatorId: string }): EvalReportV1 {
  if (input.run.state !== "sealed") fail("EVAL_RUN_STATE_INVALID", "Reports require a sealed eval run.");
  const observations = [...input.run.observations.values()];
  const candidateResults = input.run.run.candidates.map((candidate) => {
    const selected = observations.filter((item) => item.candidateId === candidate.candidateId);
    const metrics: Record<string, EvalMetricResultV1> = {};
    for (const outcome of input.suite.requiredOutcomeDimensions) {
      const supported = selected.filter((item) => item.outcomes[outcome]?.state !== "unsupported");
      const numerator = supported.filter((item) => item.outcomes[outcome]?.state === "pass").length;
      metrics[outcome] = supported.length === selected.length
        ? { state: "measured", numerator, denominator: selected.length, value: selected.length ? numerator / selected.length : 0, unit: "ratio", uncertainty: wilson95(numerator, selected.length) }
        : { state: "unsupported", numerator, denominator: selected.length, reason: "At least one declared observation is unsupported." };
    }
    metrics.firstPassAcceptance = { state: "measured", numerator: selected.filter((item) => item.result === "passed").length, denominator: selected.length, value: selected.length ? selected.filter((item) => item.result === "passed").length / selected.length : 0, unit: "ratio", uncertainty: wilson95(selected.filter((item) => item.result === "passed").length, selected.length) };
    return { candidateId: candidate.candidateId, metrics };
  });
  const comparisons: Array<EvalReportV1["comparisons"][number]> = [];
  if (input.baselineCandidateId) {
    const baselineCandidate = input.run.run.candidates.find((item) => item.candidateId === input.baselineCandidateId);
    const baseline = candidateResults.find((item) => item.candidateId === input.baselineCandidateId);
    if (!baselineCandidate || !baseline) fail("EVAL_NOT_COMPARABLE", "Baseline candidate is not part of the run.");
    for (const candidate of input.run.run.candidates.filter((item) => item.candidateId !== input.baselineCandidateId)) {
      const result = candidateResults.find((item) => item.candidateId === candidate.candidateId)!;
      const blockers: string[] = [];
      const dimensionNames = new Set([...Object.keys(baselineCandidate!.dimensions), ...Object.keys(candidate.dimensions)]);
      for (const name of dimensionNames) {
        const left = baselineCandidate!.dimensions[name], right = candidate.dimensions[name];
        if (!left || !right || left.state !== right.state || (left.state === "measured" && right.state === "measured" && name !== "prompt" && name !== "model" && left.value !== right.value)) blockers.push(`dimension:${name}`);
      }
      const deltas: Record<string, { absolute: number; relative?: number }> = {};
      for (const [name, metric] of Object.entries(result.metrics)) {
        const baseMetric = baseline!.metrics[name];
        if (metric.state !== "measured" || baseMetric?.state !== "measured") { blockers.push(`metric:${name}:unsupported`); continue; }
        const absolute = metric.value! - baseMetric.value!; deltas[name] = { absolute, ...(baseMetric.value ? { relative: absolute / baseMetric.value } : {}) };
      }
      comparisons.push({ baselineCandidateId: input.baselineCandidateId, candidateId: candidate.candidateId, verdict: blockers.length ? "not_comparable" : "comparable", blockers, deltas });
    }
  }
  return { contractType: "EvalReportV1", contractVersion: "1.0", evalReportId: input.evalReportId, evalRunId: input.run.run.evalRunId, metricPolicyVersion: input.suite.metricPolicyVersion, cohortSize: input.cohort.orderedMembers.length, taskMix: input.cohort.taskMix, candidateResults, ...(input.baselineCandidateId ? { baselineCandidateId: input.baselineCandidateId } : {}), comparisons, exclusions: observations.filter((item) => item.result !== "passed" && item.result !== "failed").map((item) => ({ observationId: item.evalObservationId, reasonCode: item.result === "unsupported" ? "EVAL_RESULT_UNSUPPORTED" : "EVAL_OBSERVATION_INCOMPLETE" })), computedAt: input.computedAt, evaluatorId: input.evaluatorId };
}

function validateChampion(decision: ChampionDecisionV1, projection: MutableEvalLineageProjectionV1) {
  utc(decision.decidedAt, "decidedAt"); if (decision.expiresAt) utc(decision.expiresAt, "expiresAt");
  if (!decision.authority.actor || !decision.authority.authoritySource) fail("CHAMPION_AUTHORITY_REQUIRED", "Champion decisions require explicit authority.");
  const reports = decision.evalReportIds.map((id) => projection.reports.get(id));
  if (reports.some((item) => !item) || reports.some((item) => !decision.evalRunIds.includes(item!.evalRunId))) fail("CHAMPION_DECISION_INVALID", "Champion decision references unknown reports or runs.");
  if (decision.decision !== "promote") return;
  const comparison = reports.flatMap((item) => item!.comparisons).find((item) => item.baselineCandidateId === decision.baselineCandidateId && item.candidateId === decision.candidateId);
  if (!comparison || comparison.verdict !== "comparable") fail("EVAL_NOT_COMPARABLE", "Promotion requires a comparable report.");
  const report = reports.find((item) => item!.comparisons.includes(comparison!))!;
  const candidate = report.candidateResults.find((item) => item.candidateId === decision.candidateId)!;
  const objective = comparison!.deltas[decision.objective.metric];
  if (!objective || objective.absolute < decision.objective.minimumImprovement) fail("EVAL_GUARDRAIL_FAILED", "Promotion objective threshold was not met.");
  const sample = candidate.metrics[decision.objective.metric]?.denominator ?? 0;
  if (sample < decision.minimumSampleSize) fail("EVAL_SAMPLE_INSUFFICIENT", "Promotion sample is insufficient.");
  for (const guardrail of decision.guardrails) if ((comparison!.deltas[guardrail.metric]?.absolute ?? Number.NEGATIVE_INFINITY) < -guardrail.maximumRegression) fail("EVAL_GUARDRAIL_FAILED", `Guardrail ${guardrail.metric} failed.`);
}

export function applyEvalLineageEventV1(eventValue: unknown, projection: MutableEvalLineageProjectionV1, context: EvalReplayContextV1) {
  assertEvalSchemaV1<EvalLineageEventV1>("EvalLineageEventV1", eventValue); const event = eventValue as EvalLineageEventV1;
  if (event.projectId !== projection.projectId || !context.hasChange(event.changeId)) fail("CROSS_ENTITY_IDENTITY_MISMATCH", "Eval event scope is invalid.");
  if (projection.occurrenceEvents.has(event.payload.publisherOccurrenceId)) fail("PUBLISHER_OCCURRENCE_CONFLICT", "Duplicate publisher occurrence was appended.");
  const expectedPayloadKey: Record<EvalLineageEventTypeV1, keyof EvalLineageEventV1["payload"]> = {
    "eval.suite-published": "suite", "eval.suite-revoked": "revocation",
    "eval.cohort-published": "cohort", "eval.cohort-revoked": "revocation",
    "eval.run-registered": "run", "eval.run-started": "run",
    "eval.observation-recorded": "observation", "eval.run-sealed": "run",
    "eval.run-failed": "run", "eval.run-cancelled": "run",
    "eval.report-published": "report", "eval.import-recorded": "importReceipt",
    "lineage.champion-decided": "championDecision", "lineage.champion-revoked": "revocation",
  };
  const entityKeys = ["suite", "cohort", "run", "observation", "report", "importReceipt", "championDecision", "revocation"] as const;
  const presentKeys = entityKeys.filter((key) => event.payload[key] !== undefined);
  if (presentKeys.length !== 1 || presentKeys[0] !== expectedPayloadKey[event.type])
    fail("SCHEMA_INVALID", `Eval event ${event.type} must contain exactly its declared payload.`);
  if (event.type === "eval.suite-published") { const suite = event.payload.suite!; validateSuite(suite, projection); if (suite.publishedBy !== event.actor || projection.suites.has(suite.evalSuiteId)) fail("CROSS_ENTITY_IDENTITY_MISMATCH", "Suite identity conflicts."); projection.suites.set(suite.evalSuiteId, { value: suite, status: "published", sequence: event.sequence }); }
  else if (event.type === "eval.suite-revoked") { const rev = event.payload.revocation!, current = projection.suites.get(rev.entityId); if (!current || current.status === "revoked") fail("EVAL_SUITE_UNKNOWN", "Suite revocation is invalid."); current!.status = "revoked"; current!.revocation = rev; }
  else if (event.type === "eval.cohort-published") { const cohort = event.payload.cohort!; validateCohort(cohort, projection, context); if (cohort.publishedBy !== event.actor || projection.cohorts.has(cohort.evalCohortId)) fail("EVAL_COHORT_INVALID", "Cohort identity conflicts."); projection.cohorts.set(cohort.evalCohortId, { value: cohort, status: "published", sequence: event.sequence }); }
  else if (event.type === "eval.cohort-revoked") { const rev = event.payload.revocation!, current = projection.cohorts.get(rev.entityId); if (!current || current.status === "revoked") fail("EVAL_COHORT_INVALID", "Cohort revocation is invalid."); current!.status = "revoked"; current!.revocation = rev; }
  else if (event.type === "eval.run-registered") { const run = event.payload.run!, suite = projection.suites.get(run.evalSuiteId), cohort = projection.cohorts.get(run.evalCohortId); if (!suite || suite.status === "revoked") fail("EVAL_SUITE_UNKNOWN", "Eval run requires an active suite."); if (!cohort || cohort.status === "revoked" || run.environmentClass !== suite!.value.environmentClass || !unique(run.candidates.map((item) => item.candidateId))) fail("EVAL_COHORT_INVALID", "Eval run configuration is invalid."); if (projection.runs.has(run.evalRunId)) fail("EVAL_RUN_STATE_INVALID", "Eval run is duplicated."); projection.runs.set(run.evalRunId, { run, state: "registered", observations: new Map() }); }
  else if (event.type === "eval.run-started") { const run = projection.runs.get(event.payload.run!.evalRunId); if (!run || run.state !== "registered") fail("EVAL_RUN_STATE_INVALID", "Only registered runs may start."); run!.state = "running"; }
  else if (event.type === "eval.observation-recorded") { const observation = event.payload.observation!, run = projection.runs.get(observation.evalRunId); if (!run || run.state !== "running") fail("EVAL_RUN_STATE_INVALID", "Observations require a running run."); const suite = projection.suites.get(run!.run.evalSuiteId)!.value; if (!suite.orderedCaseIds.includes(observation.evalCaseId) || !run!.run.candidates.some((item) => item.candidateId === observation.candidateId) || observation.sampleOrdinal > suite.samplingPolicy.samplesPerCandidate || !context.hasBinding(observation.member.bindingId, observation.member) || observation.haltIds.some((id) => !context.hasHalt(id)) || observation.incidentIds.some((id) => !context.hasIncident(id)) || suite.requiredOutcomeDimensions.some((name) => !observation.outcomes[name])) fail("CROSS_ENTITY_IDENTITY_MISMATCH", "Observation identity or outcome matrix is invalid."); const key = observationKey(observation); if (run!.observations.has(key)) fail("EVAL_OBSERVATION_CONFLICT", "Observation tuple is duplicated."); run!.observations.set(key, observation); }
  else if (event.type === "eval.run-sealed") { const run = projection.runs.get(event.payload.run!.evalRunId); if (!run || run.state !== "running") fail("EVAL_RUN_STATE_INVALID", "Only running evals may seal."); const suite = projection.suites.get(run!.run.evalSuiteId)!.value; const expected = expectedObservationKeys(run!.run, suite); if (expected.length !== run!.observations.size || expected.some((key) => !run!.observations.has(key))) fail("EVAL_OBSERVATION_INCOMPLETE", "Eval run matrix is incomplete."); run!.state = "sealed"; run!.terminalAt = event.occurredAt; }
  else if (event.type === "eval.run-failed" || event.type === "eval.run-cancelled") { const run = projection.runs.get(event.payload.run!.evalRunId); if (!run || !(["registered", "running"] as EvalRunStateV1[]).includes(run.state)) fail("EVAL_RUN_STATE_INVALID", "Eval terminal transition is invalid."); run!.state = event.type === "eval.run-failed" ? "failed" : "cancelled"; run!.terminalAt = event.occurredAt; }
  else if (event.type === "eval.report-published") { const report = event.payload.report!, run = projection.runs.get(report.evalRunId); if (!run || run.state !== "sealed" || projection.reports.has(report.evalReportId)) fail("EVAL_RUN_STATE_INVALID", "Report publication requires one sealed run."); const expected = computeEvalReportV1({ evalReportId: report.evalReportId, run: run!, suite: projection.suites.get(run!.run.evalSuiteId)!.value, cohort: projection.cohorts.get(run!.run.evalCohortId)!.value, baselineCandidateId: report.baselineCandidateId, computedAt: report.computedAt, evaluatorId: report.evaluatorId }); if (evalContentHashV1(expected) !== evalContentHashV1(report)) fail("EVAL_IMPORT_INVALID", "Eval report does not recompute deterministically."); projection.reports.set(report.evalReportId, report); }
  else if (event.type === "eval.import-recorded") { const receipt = event.payload.importReceipt!; if (projection.imports.has(receipt.importReceiptId) || !projection.runs.has(receipt.importedEvalRunId)) fail("EVAL_IMPORT_INVALID", "Import receipt is duplicated or references an unknown run."); projection.imports.set(receipt.importReceiptId, receipt); }
  else if (event.type === "lineage.champion-decided") { const decision = event.payload.championDecision!; validateChampion(decision, projection); if (projection.championDecisions.has(decision.championDecisionId)) fail("CHAMPION_DECISION_INVALID", "Champion decision is duplicated."); projection.championDecisions.set(decision.championDecisionId, decision); }
  else { const rev = event.payload.revocation!; if (!projection.championDecisions.has(rev.entityId) || projection.revokedChampionDecisionIds.has(rev.entityId)) fail("CHAMPION_DECISION_INVALID", "Champion revocation is invalid."); projection.revokedChampionDecisionIds.add(rev.entityId); }
  projection.occurrenceEvents.set(event.payload.publisherOccurrenceId, event); projection.events.push(event); return event;
}

export function immutableEvalLineageProjectionV1(projection: MutableEvalLineageProjectionV1): EvalLineageProjectionV1 {
  return structuredClone({ projectId: projection.projectId, suites: [...projection.suites.values()], cohorts: [...projection.cohorts.values()], runs: [...projection.runs.values()].map((item) => ({ run: item.run, state: item.state, observations: [...item.observations.values()], ...(item.terminalAt ? { terminalAt: item.terminalAt } : {}) })), reports: [...projection.reports.values()], imports: [...projection.imports.values()], championDecisions: [...projection.championDecisions.values()].map((decision) => ({ decision, status: projection.revokedChampionDecisionIds.has(decision.championDecisionId) ? "revoked" : "active" })), events: projection.events });
}

export function duplicateEvalPublisherEventV1(projection: MutableEvalLineageProjectionV1, occurrenceId: string, type: EvalLineageEventTypeV1, payload: Record<string, unknown>) {
  const existing = projection.occurrenceEvents.get(occurrenceId); if (!existing) return undefined;
  if (existing.type !== type || evalContentHashV1(existing.payload) !== evalContentHashV1({ publisherOccurrenceId: occurrenceId, ...payload })) fail("PUBLISHER_OCCURRENCE_CONFLICT", "Publisher occurrence was reused with different content.");
  return existing;
}

export function runtimeEvalsV1ImportIdentity(report: unknown) {
  const record = report as Record<string, any>;
  if (record?.reportVersion !== "runtime-evals-v1" || record?.configuration?.mode !== "mock" || record?.configuration?.providerExecution !== false || !Array.isArray(record?.cases) || !record?.configuration?.identity) fail("EVAL_IMPORT_INVALID", "Only schema-shaped credential-free runtime-evals-v1 mock reports may be imported.");
  const unsupportedDimensions = Object.entries(record.configuration.identity).filter(([, value]) => (value as any)?.state === "unsupported").map(([name]) => name);
  return { sourceReportHash: evalContentHashV1(report), unsupportedDimensions };
}
