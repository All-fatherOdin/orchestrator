import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import type { ChangeControlStore, OperatorSourceSnapshotV1 } from "../change-control-v1/index.ts";
import schema from "./schemas/operator-projection-v1.schema.json";

export const OPERATOR_PROJECTION_VIEWS_V1 = [
  "overview", "execution-bucket", "incidents", "prompt-registry", "eval-lineage",
] as const;
export type OperatorProjectionViewV1 = (typeof OPERATOR_PROJECTION_VIEWS_V1)[number];

export class OperatorProjectionErrorV1 extends Error {
  constructor(
    readonly code: "INVALID_QUERY" | "SOURCE_UNAVAILABLE" | "SOURCE_WATERMARK_CHANGED",
    message: string,
    readonly status: number,
  ) { super(message); this.name = "OperatorProjectionErrorV1"; }
}

type Item = Readonly<{ kind: string; projectId: string; entityId: string; sortKey: string; evidenceRefs: readonly string[]; data: Readonly<Record<string, unknown>> }>;
export type OperatorProjectionV1 = Readonly<{
  contractType: "OperatorProjectionV1"; contractVersion: "1.0"; view: OperatorProjectionViewV1;
  generatedAt: string; sourceWatermarks: readonly Readonly<{ projectId: string; sourceRef: string; sequence: number; hash: string | null }>[];
  sourceWatermark: string; scope: Readonly<{ mode: "all" | "selected"; projectIds: readonly string[] }>;
  filters: Readonly<Record<string, unknown>>; sort: Readonly<{ field: "sortKey"; direction: "asc" }>;
  page: Readonly<{ limit: number; cursor: string | null; nextCursor: string | null; totalItems: number }>;
  aggregates: Readonly<Record<string, unknown>>; items: readonly Item[];
  warnings: readonly Readonly<{ code: "SOURCE_UNAVAILABLE" | "UNSUPPORTED_DIMENSION"; sourceRef: string; projectId?: string; message: string }>[];
}>;

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date-time", true); ajv.addSchema(schema);
const validator = ajv.getSchema(`${schema.$id}#/$defs/OperatorProjectionV1`)!;
export function assertOperatorProjectionV1(value: unknown): asserts value is OperatorProjectionV1 {
  if (!validator(value)) throw new OperatorProjectionErrorV1("INVALID_QUERY", ajv.errorsText(validator.errors), 500);
}

const canonical = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
};
const hash = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const ref = (kind: string, id: string) => `${kind}:${id}`;
const sortItem = (kind: string, projectId: string, entityId: string, data: Record<string, unknown>, evidenceRefs: readonly string[] = []): Item => ({
  kind, projectId, entityId, sortKey: `${projectId}\0${kind}\0${entityId}`, evidenceRefs: [...new Set(evidenceRefs)].sort(), data,
});

type Query = Readonly<{ projectIds?: readonly string[]; limit?: number; cursor?: string }>;
function queryValue(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new OperatorProjectionErrorV1("INVALID_QUERY", `${name} must be a string.`, 400);
  return value;
}
export function parseOperatorProjectionQueryV1(value: Record<string, unknown>): Query {
  const allowed = new Set(["projectId", "limit", "cursor"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new OperatorProjectionErrorV1("INVALID_QUERY", `Unknown operator projection filter: ${unknown[0]}.`, 400);
  const projectId = queryValue(value.projectId, "projectId");
  const projectIds = projectId?.split(",").map((item) => item.trim()).filter(Boolean);
  if (projectIds && (!projectIds.length || projectIds.length > 50 || new Set(projectIds).size !== projectIds.length || projectIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id))))
    throw new OperatorProjectionErrorV1("INVALID_QUERY", "projectId must contain 1-50 unique valid IDs.", 400);
  const limitText = queryValue(value.limit, "limit");
  const limit = limitText === undefined ? 25 : Number(limitText);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new OperatorProjectionErrorV1("INVALID_QUERY", "limit must be an integer from 1 to 100.", 400);
  const cursor = queryValue(value.cursor, "cursor");
  return { ...(projectIds ? { projectIds } : {}), limit, ...(cursor ? { cursor } : {}) };
}

function overviewItems(source: OperatorSourceSnapshotV1): Item[] {
  const activeWaves = source.waves.filter((wave) => ["dispatched", "running"].includes(wave.status)).length;
  const haltedWaves = source.waves.filter((wave) => wave.status === "halted").length;
  const readyTasks = source.waves.flatMap((wave) => wave.tasks).filter((task) => task.status === "ready").length;
  const blockingIncidents = source.haltIncidents.incidents.filter((incident) => ["blocking", "critical"].includes(incident.severity) && incident.state !== "resolved").length;
  const liveRepairLeases = source.warden.leases.filter((lease) => lease.state === "active").length;
  return [sortItem("project-overview", source.projectId, source.projectId, {
    changes: source.changes.length, waves: source.waves.length, activeWaves, haltedWaves, readyTasks,
    blockingIncidents, liveRepairLeases, evalRuns: source.evalLineage.runs.length,
    activeChampionDecisions: source.evalLineage.championDecisions.filter((item) => item.status === "active").length,
  }, [source.sourceRef])];
}

function executionItems(source: OperatorSourceSnapshotV1): Item[] {
  return source.waves.map((wave) => sortItem("execution-bucket", source.projectId, wave.waveId, {
    changeId: wave.changeId, waveId: wave.waveId, status: wave.status,
    dispatchable: wave.readiness.ready, readiness: wave.readiness,
    tasks: wave.tasks.map((task) => ({ taskId: task.taskId, status: task.status, dependsOn: task.dependsOn })),
  }, [ref("change", wave.changeId), ref("wave", wave.waveId), ...wave.tasks.map((task) => ref("task", task.taskId))]));
}

function incidentItems(source: OperatorSourceSnapshotV1): Item[] {
  return source.haltIncidents.incidents.map((incident) => {
    const halts = source.haltIncidents.halts.filter((halt) => halt.effectiveIncidentId === incident.incidentId);
    const haltIds = halts.map((halt) => halt.haltId);
    const verdicts = source.warden.verdicts.filter((verdict) => haltIds.includes(verdict.haltId));
    const receipts = source.doctor.receipts.filter((receipt) => verdicts.some((verdict) => verdict.verdictId === receipt.verdictId));
    const recoveryAuthorizations = source.recoveryAuthorizations.filter((authorization) => authorization.incidentId === incident.incidentId);
    return sortItem("incident", source.projectId, incident.incidentId, {
      incidentId: incident.incidentId, changeId: incident.changeId, state: incident.state, blocking: ["blocking", "critical"].includes(incident.severity),
      severity: incident.severity, haltIds, haltClasses: [...new Set(halts.map((halt) => halt.haltClass).filter(Boolean))],
      verdicts: verdicts.map((verdict) => ({ verdictId: verdict.verdictId, haltId: verdict.haltId, disposition: verdict.disposition, reasonCode: verdict.reasonCode })),
      repairReceipts: receipts.map((receipt) => ({ receiptId: receipt.receiptId, result: receipt.result, recipeId: receipt.recipe.recipeId })),
      recoveryAuthorizations,
    }, [...halts.flatMap((halt) => halt.evidenceRefs), ref("incident", incident.incidentId)]);
  });
}

function promptItems(source: OperatorSourceSnapshotV1): Item[] {
  const projection = source.promptModelLineage;
  return [
    ...projection.promptArtifacts.map(({ artifact, status }) => sortItem("prompt-artifact", source.projectId, artifact.promptArtifactId, {
      promptArtifactId: artifact.promptArtifactId, status, purpose: artifact.purpose, artifactKind: artifact.artifactKind,
      schemaVersion: artifact.schemaVersion, contentHash: artifact.contentHash, byteLength: artifact.byteLength,
      parentArtifactIds: artifact.parentArtifactIds, supersedesId: artifact.supersedesId, publishedAt: artifact.publishedAt,
    }, [ref("prompt-artifact", artifact.promptArtifactId), ...artifact.behaviorContractRefs])),
    ...projection.modelRoutes.map(({ route, status }) => sortItem("model-route", source.projectId, route.modelRouteId, {
      modelRouteId: route.modelRouteId, status, requestedModelClass: route.requestedModelClass,
      minimumModelClass: route.minimumModelClass, reasoningLevel: route.reasoningLevel,
      fallbackMode: route.fallbackPolicy.mode, supersedesId: route.supersedesId, publishedAt: route.publishedAt,
    }, [ref("model-route", route.modelRouteId)])),
    ...projection.bindings.map((binding) => sortItem("configuration-binding", source.projectId, binding.bindingId, {
      bindingId: binding.bindingId, bindingScope: binding.bindingScope, role: binding.role, changeId: binding.changeId,
      waveId: binding.waveId, taskId: binding.taskId, runId: binding.runId, attemptId: binding.attemptId,
      invocationId: binding.invocationId, promptArtifactIds: binding.promptArtifactIds, modelRouteId: binding.modelRouteId,
      boundAt: binding.boundAt,
    }, [ref("binding", binding.bindingId), ...binding.promptArtifactIds.map((id) => ref("prompt-artifact", id)), ref("model-route", binding.modelRouteId)])),
    ...projection.resolvedExecutions.map((execution) => sortItem("model-execution", source.projectId, execution.resolutionId, {
      resolutionId: execution.resolutionId, bindingId: execution.bindingId, modelRouteId: execution.modelRouteId,
      providerId: execution.providerId, providerAdapterId: execution.providerAdapterId, providerModelId: execution.providerModelId,
      resolvedModelClass: execution.resolvedModelClass, reasoningLevel: execution.reasoningLevel,
      fallback: execution.fallback, startedAt: execution.startedAt, measurements: execution.measurements,
    }, [ref("binding", execution.bindingId), ref("model-route", execution.modelRouteId)])),
  ];
}

function evalItems(source: OperatorSourceSnapshotV1): Item[] {
  const projection = source.evalLineage;
  return [
    ...projection.suites.map(({ value, status }) => sortItem("eval-suite", source.projectId, value.evalSuiteId, { evalSuiteId: value.evalSuiteId, status, version: value.version, purpose: value.purpose, orderedCaseIds: value.orderedCaseIds, requiredOutcomeDimensions: value.requiredOutcomeDimensions, metricPolicyVersion: value.metricPolicyVersion, samplingPolicy: value.samplingPolicy }, [ref("eval-suite", value.evalSuiteId)])),
    ...projection.cohorts.map(({ value, status }) => sortItem("eval-cohort", source.projectId, value.evalCohortId, { evalCohortId: value.evalCohortId, status, memberCount: value.orderedMembers.length, eligibilityRule: value.eligibilityRule, taskMix: value.taskMix, observationWindow: value.observationWindow }, [ref("eval-cohort", value.evalCohortId)])),
    ...projection.runs.map(({ run, state, observations }) => sortItem("eval-run", source.projectId, run.evalRunId, { evalRunId: run.evalRunId, state, evalSuiteId: run.evalSuiteId, evalCohortId: run.evalCohortId, executionMode: run.executionMode, candidateIds: run.candidates.map((candidate) => candidate.candidateId), observationCounts: Object.fromEntries(["passed", "failed", "interrupted", "unsupported"].map((result) => [result, observations.filter((item) => item.result === result).length])) }, [ref("eval-run", run.evalRunId), ref("eval-suite", run.evalSuiteId), ref("eval-cohort", run.evalCohortId)])),
    ...projection.reports.map((report) => sortItem("eval-report", source.projectId, report.evalReportId, { evalReportId: report.evalReportId, evalRunId: report.evalRunId, metricPolicyVersion: report.metricPolicyVersion, cohortSize: report.cohortSize, candidateResults: report.candidateResults, comparisons: report.comparisons, exclusions: report.exclusions, computedAt: report.computedAt }, [ref("eval-report", report.evalReportId), ref("eval-run", report.evalRunId)])),
    ...projection.imports.map((receipt) => sortItem("eval-import", source.projectId, receipt.importReceiptId, { importReceiptId: receipt.importReceiptId, sourceKind: receipt.sourceKind, sourceReportHash: receipt.sourceReportHash, importedEvalRunId: receipt.importedEvalRunId, unsupportedDimensions: receipt.unsupportedDimensions, importedAt: receipt.importedAt }, [ref("eval-run", receipt.importedEvalRunId)])),
    ...projection.championDecisions.map(({ decision, status }) => sortItem("champion-decision", source.projectId, decision.championDecisionId, { championDecisionId: decision.championDecisionId, status, scopeId: decision.scopeId, baselineCandidateId: decision.baselineCandidateId, candidateId: decision.candidateId, evalRunIds: decision.evalRunIds, evalReportIds: decision.evalReportIds, objective: decision.objective, guardrails: decision.guardrails, minimumSampleSize: decision.minimumSampleSize, decision: decision.decision, authority: decision.authority, reason: decision.reason, decidedAt: decision.decidedAt }, [...decision.evalRunIds.map((id) => ref("eval-run", id)), ...decision.evalReportIds.map((id) => ref("eval-report", id))])),
  ];
}

function decodeCursor(cursor: string, view: OperatorProjectionViewV1, watermark: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { version?: unknown; view?: unknown; watermark?: unknown; offset?: unknown };
    if (value.version !== 1 || value.view !== view || value.watermark !== watermark || !Number.isInteger(value.offset) || (value.offset as number) < 0)
      throw new Error();
    return value.offset as number;
  } catch {
    throw new OperatorProjectionErrorV1("SOURCE_WATERMARK_CHANGED", "Cursor is malformed or its source watermark is no longer current.", 409);
  }
}

export class OperatorProjectionServiceV1 {
  constructor(private readonly store: ChangeControlStore, private readonly now = () => new Date().toISOString()) {}
  async project(view: OperatorProjectionViewV1, query: Query): Promise<OperatorProjectionV1> {
    if (!OPERATOR_PROJECTION_VIEWS_V1.includes(view)) throw new OperatorProjectionErrorV1("INVALID_QUERY", "Unknown operator projection view.", 404);
    const read = await this.store.readOperatorSourcesV1(query.projectIds);
    if (query.projectIds?.length === 1 && read.unavailable.length)
      throw new OperatorProjectionErrorV1("SOURCE_UNAVAILABLE", `Project ${query.projectIds[0]} is unavailable.`, 503);
    const sourceWatermarks = read.sources.map((source) => ({ projectId: source.projectId, sourceRef: source.sourceRef, sequence: source.watermark.sequence, hash: source.watermark.hash }));
    const sourceWatermark = hash({ sourceWatermarks, unavailable: read.unavailable });
    const builders = { overview: overviewItems, "execution-bucket": executionItems, incidents: incidentItems, "prompt-registry": promptItems, "eval-lineage": evalItems } as const;
    const allItems = read.sources.flatMap(builders[view]).sort((left, right) => left.sortKey.localeCompare(right.sortKey));
    const offset = query.cursor ? decodeCursor(query.cursor, view, sourceWatermark) : 0;
    if (offset > allItems.length) throw new OperatorProjectionErrorV1("INVALID_QUERY", "Cursor offset is outside the result set.", 400);
    const limit = query.limit ?? 25;
    const items = allItems.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    const nextCursor = nextOffset < allItems.length ? Buffer.from(JSON.stringify({ version: 1, view, watermark: sourceWatermark, offset: nextOffset }), "utf8").toString("base64url") : null;
    const warnings: OperatorProjectionV1["warnings"][number][] = read.unavailable.map((item) => ({ code: "SOURCE_UNAVAILABLE" as const, sourceRef: item.sourceRef, ...(item.projectId ? { projectId: item.projectId } : {}), message: "Canonical project source is unavailable." }));
    for (const source of read.sources)
      for (const receipt of source.evalLineage.imports)
        for (const dimension of receipt.unsupportedDimensions)
          warnings.push({ code: "UNSUPPORTED_DIMENSION", sourceRef: ref("eval-import", receipt.importReceiptId), projectId: source.projectId, message: `Dimension ${dimension} is explicitly unsupported.` });
    warnings.sort((left, right) => left.sourceRef.localeCompare(right.sourceRef) || left.message.localeCompare(right.message));
    const projection: OperatorProjectionV1 = {
      contractType: "OperatorProjectionV1", contractVersion: "1.0", view, generatedAt: this.now(), sourceWatermarks, sourceWatermark,
      scope: { mode: query.projectIds ? "selected" : "all", projectIds: query.projectIds ?? read.sources.map((source) => source.projectId) },
      filters: { ...(query.projectIds ? { projectId: query.projectIds } : {}) }, sort: { field: "sortKey", direction: "asc" },
      page: { limit, cursor: query.cursor ?? null, nextCursor, totalItems: allItems.length },
      aggregates: { totalSources: read.totalSourceCount, availableSources: read.sources.length, unavailableSources: read.unavailable.length, totalItems: allItems.length },
      items, warnings,
    };
    assertOperatorProjectionV1(projection);
    return structuredClone(projection);
  }
}
