import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import outcomeScorecardsV1Schema from "./schemas/outcome-scorecards-v1.schema.json";
import type {
  AuditEvidenceSourceV1,
  ChangeControlEvent,
} from "../change-control-v1/index.ts";
import type {
  DeploymentObservationV1,
  OperationalDefectAttributionV1,
  OperationalEvidenceSourceV1,
  OperationalObservationV1,
  PostDeliveryDefectObservationV1,
  ProviderCostObservationV1,
} from "../operational-outcomes-v1/index.ts";

export const OUTCOME_SCORECARD_POLICY_VERSION_V1 =
  "outcome-scorecard-policy-v1" as const;

export const OUTCOME_SCORECARD_LIMITS_V1 = Object.freeze({
  maxRuns: 50,
  maxTasks: 500,
  maxAttempts: 1_000,
  maxEvents: 5_000,
  maxResponseBytes: 4_000_000,
  maxRunRecordBytes: 16_000_000,
  maxDiagnostics: 100,
  maxEvidenceRefsPerMetric: 2_000,
});

export const OUTCOME_SCORECARD_METRICS_V1 = [
  "firstPassAcceptanceRate",
  "reviewCorrectionCycles",
  "dispatchToAcceptedMs",
  "tokensPerAcceptedTask",
  "overrideRate",
  "humanEscalationRate",
  "haltRecurrenceRate",
] as const;

export const OPERATIONAL_OUTCOME_SCORECARD_METRICS_V1 = [
  "escapedDefects7Day",
  "escapedDefects30Day",
  "escapedDefects90Day",
  "deploymentFailureRate",
  "rollbackRate",
  "hotfixRate",
  "productionReworkRate",
  "providerMonetaryCost",
] as const;

export type OutcomeScorecardMetricIdV1 =
  | (typeof OUTCOME_SCORECARD_METRICS_V1)[number]
  | (typeof OPERATIONAL_OUTCOME_SCORECARD_METRICS_V1)[number];

export const OUTCOME_SCORECARD_REASON_CODES_V1 = [
  "SOURCE_UNAVAILABLE",
  "SOURCE_WATERMARK_CHANGED",
  "COHORT_INVALID",
  "COHORT_LIMIT_EXCEEDED",
  "RUN_NOT_FOUND",
  "RUN_IDENTITY_CHANGED",
  "RUN_UNLINKED",
  "EVIDENCE_INCOMPLETE",
  "EVIDENCE_CONFLICT",
  "METRIC_UNSUPPORTED",
  "DENOMINATOR_EMPTY",
  "PRIVACY_VIOLATION",
  "SCORECARD_TOO_LARGE",
] as const;

export type OutcomeScorecardReasonCodeV1 =
  (typeof OUTCOME_SCORECARD_REASON_CODES_V1)[number];

export const OUTCOME_SCORECARD_UNSUPPORTED_OUTCOMES_V1 = [
  ["escapedDefects7Day", "post-delivery-defect-authority"],
  ["escapedDefects30Day", "post-delivery-defect-authority"],
  ["escapedDefects90Day", "post-delivery-defect-authority"],
  ["deploymentFailureRate", "deployment-authority"],
  ["rollbackRate", "deployment-authority"],
  ["hotfixRate", "deployment-authority"],
  ["productionReworkRate", "deployment-authority"],
  ["providerMonetaryCost", "provider-billing-authority"],
  ["businessImpact", "business-outcome-authority"],
  ["customerImpact", "customer-outcome-authority"],
  ["productivitySavings", "productivity-baseline-authority"],
  ["bugFreeDelivery", "post-delivery-defect-authority"],
  ["manualBaselineComparison", "versioned-cohort-authority"],
] as const;

const STILL_UNSUPPORTED_OUTCOMES_V1 = [
  ["businessImpact", "business-outcome-authority"],
  ["customerImpact", "customer-outcome-authority"],
  ["productivitySavings", "productivity-baseline-authority"],
  ["bugFreeDelivery", "post-delivery-defect-authority"],
  ["manualBaselineComparison", "versioned-cohort-authority"],
] as const;

type UnsupportedOutcomeClassV1 =
  (typeof OUTCOME_SCORECARD_UNSUPPORTED_OUTCOMES_V1)[number][0];

export type OutcomeScorecardSelectorV1 = Readonly<{
  projectId: string;
  fromSequence: number;
  toSequence: number;
  runIds?: readonly string[];
}>;

export type OutcomeScorecardWatermarkV1 = Readonly<{
  sequence: number;
  hash: string | null;
}>;

export type OutcomeRunRecordIdentityV1 = Readonly<{
  runId: string;
  algorithm: "sha256";
  sha256: string;
  byteLength: number;
}>;

export type OutcomeScorecardRequestV1 = Readonly<{
  contractType: "OutcomeScorecardRequestV1";
  contractVersion: "1.0";
  policyVersion: typeof OUTCOME_SCORECARD_POLICY_VERSION_V1;
  selector: OutcomeScorecardSelectorV1;
  sourceWatermark: OutcomeScorecardWatermarkV1;
  runRecordIdentities: readonly OutcomeRunRecordIdentityV1[];
}>;

export type OutcomeScorecardDiscoveryRequestV1 = Readonly<{
  contractType: "OutcomeScorecardDiscoveryRequestV1";
  contractVersion: "1.0";
  policyVersion: typeof OUTCOME_SCORECARD_POLICY_VERSION_V1;
  selector: OutcomeScorecardSelectorV1;
  sourceWatermark?: OutcomeScorecardWatermarkV1;
}>;

export type OutcomeScorecardFindingV1 = Readonly<{
  code: OutcomeScorecardReasonCodeV1;
  subjectType: "cohort" | "run" | "task" | "attempt" | "metric" | "source";
  subjectRef: string;
  evidenceRefs: readonly string[];
}>;

export type OutcomeScorecardDiscoveryV1 = Readonly<{
  contractType: "OutcomeScorecardDiscoveryV1";
  contractVersion: "1.0";
  policyVersion: typeof OUTCOME_SCORECARD_POLICY_VERSION_V1;
  selector: OutcomeScorecardSelectorV1;
  sourceWatermark: OutcomeScorecardWatermarkV1;
  candidates: readonly Readonly<{
    identity: OutcomeRunRecordIdentityV1;
    joinRefs: readonly string[];
  }>[];
  findings: readonly OutcomeScorecardFindingV1[];
  privacy: OutcomeScorecardPrivacyV1;
  discoveryHash: string;
}>;

export type OutcomeScorecardMetricEvidenceV1 = Readonly<{
  subjectRef: string;
  numeratorContribution: number;
  denominatorContribution: 0 | 1;
  excluded: boolean;
  value?: number;
  reasonCode?: "EVIDENCE_INCOMPLETE" | "EVIDENCE_CONFLICT" | "DENOMINATOR_EMPTY";
  evidenceRefs: readonly string[];
}>;

export type OutcomeScorecardMetricV1 = Readonly<{
  metricId: OutcomeScorecardMetricIdV1;
  status: "complete" | "insufficient-evidence";
  numerator: number;
  denominator: number;
  excludedCount: number;
  coverage: number;
  policyVersion: typeof OUTCOME_SCORECARD_POLICY_VERSION_V1;
  value: number | null;
  unit?: string;
  evidence: readonly OutcomeScorecardMetricEvidenceV1[];
  distribution?: Readonly<{
    count: number;
    sum: number;
    min: number | null;
    max: number | null;
    rawValues?: readonly number[];
    percentiles?: Readonly<{ p50: number; p90: number; p95: number }>;
  }>;
}>;

export type OutcomeScorecardPrivacyV1 = Readonly<{
  policyVersion: "outcome-scorecard-privacy-v1";
  prohibitedFieldsExcluded: true;
  diagnosticsBounded: true;
}>;

export type OutcomeScorecardV1 = Readonly<{
  contractType: "OutcomeScorecardV1";
  contractVersion: "1.0";
  policyVersion: typeof OUTCOME_SCORECARD_POLICY_VERSION_V1;
  selector: OutcomeScorecardSelectorV1;
  cohortId: string;
  sourceWatermarks: Readonly<{
    project: OutcomeScorecardWatermarkV1;
    runs: readonly OutcomeRunRecordIdentityV1[];
  }>;
  cohort: Readonly<{
    includedRuns: readonly Readonly<{
      identity: OutcomeRunRecordIdentityV1;
      evidenceRefs: readonly string[];
    }>[];
    excludedRuns: readonly OutcomeScorecardFindingV1[];
    includedTasks: readonly IncludedTaskV1[];
    excludedTasks: readonly OutcomeScorecardFindingV1[];
    includedAttempts: readonly IncludedAttemptV1[];
    excludedAttempts: readonly OutcomeScorecardFindingV1[];
  }>;
  metrics: Readonly<{
    delivery: Readonly<{
      firstPassAcceptanceRate: OutcomeScorecardMetricV1;
      reviewCorrectionCycles: OutcomeScorecardMetricV1;
      dispatchToAcceptedMs: OutcomeScorecardMetricV1;
      tokensPerAcceptedTask: OutcomeScorecardMetricV1;
      overrideRate: OutcomeScorecardMetricV1;
    }>;
    qualitySafety: Readonly<{
      humanEscalationRate: OutcomeScorecardMetricV1;
      haltRecurrenceRate: OutcomeScorecardMetricV1;
    }>;
    operational?: Readonly<{
      escapedDefects7Day: OutcomeScorecardMetricV1;
      escapedDefects30Day: OutcomeScorecardMetricV1;
      escapedDefects90Day: OutcomeScorecardMetricV1;
      deploymentFailureRate: OutcomeScorecardMetricV1;
      rollbackRate: OutcomeScorecardMetricV1;
      hotfixRate: OutcomeScorecardMetricV1;
      productionReworkRate: OutcomeScorecardMetricV1;
      providerMonetaryCost: OutcomeScorecardMetricV1;
    }>;
    unsupported: readonly Readonly<{
      outcomeClass: UnsupportedOutcomeClassV1;
      status: "unsupported";
      reasonCode: "METRIC_UNSUPPORTED";
      missingAuthority: string;
      evidenceRefs: readonly string[];
    }>[];
  }>;
  findings: readonly OutcomeScorecardFindingV1[];
  privacy: OutcomeScorecardPrivacyV1;
  completeness: Readonly<{
    complete: boolean;
    checks: readonly Readonly<{
      checkId: `metric:${OutcomeScorecardMetricIdV1}`;
      status: "pass" | "insufficient-evidence";
      reasonCodes: readonly OutcomeScorecardReasonCodeV1[];
    }>[];
  }>;
  scorecardHash: string;
}>;

type IncludedTaskV1 = Readonly<{
  taskRef: string;
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  runId: string;
  runTaskId: string;
  evidenceRefs: readonly string[];
}>;

type IncludedAttemptV1 = Readonly<{
  attemptRef: string;
  taskRef: string;
  ordinal: number;
  evidenceRefs: readonly string[];
}>;

export class OutcomeScorecardErrorV1 extends Error {
  constructor(
    readonly reasonCode: OutcomeScorecardReasonCodeV1,
    message: string,
  ) {
    super(message);
  }
}

const validator = new Ajv2020({ allErrors: true, strict: true }).compile(
  outcomeScorecardsV1Schema,
);

function fail(
  reasonCode: OutcomeScorecardReasonCodeV1,
  message: string,
): never {
  throw new OutcomeScorecardErrorV1(reasonCode, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function canonicalOutcomeScorecardJsonV1(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalOutcomeScorecardJsonV1).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalOutcomeScorecardJsonV1(record[key])}`,
    )
    .join(",")}}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function outcomeRunRecordIdentityV1(
  runId: string,
  serialized: string,
): OutcomeRunRecordIdentityV1 {
  if (!identifier(runId) || typeof serialized !== "string")
    fail("COHORT_INVALID", "The run-record identity input is invalid.");
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > OUTCOME_SCORECARD_LIMITS_V1.maxRunRecordBytes)
    fail("COHORT_LIMIT_EXCEEDED", "A run record exceeds the bounded read limit.");
  return { runId, algorithm: "sha256", sha256: sha256(serialized), byteLength };
}

export function scorecardHashV1(
  value: Omit<OutcomeScorecardV1, "scorecardHash"> | OutcomeScorecardV1,
) {
  const { scorecardHash: _ignored, ...normalized } = value as OutcomeScorecardV1;
  return sha256(canonicalOutcomeScorecardJsonV1(normalized));
}

function discoveryHashV1(
  value: Omit<OutcomeScorecardDiscoveryV1, "discoveryHash">,
) {
  return sha256(canonicalOutcomeScorecardJsonV1(value));
}

function assertContract<T>(value: unknown, contractType: string): asserts value is T {
  if (!validator(value) || (value as { contractType?: unknown })?.contractType !== contractType)
    fail("COHORT_INVALID", "The request does not satisfy the closed v1 contract.");
}

function identifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  );
}

function normalizedSelector(selector: OutcomeScorecardSelectorV1) {
  if (selector.fromSequence > selector.toSequence)
    fail("COHORT_INVALID", "The cohort sequence range is invalid.");
  const runIds = selector.runIds ? [...selector.runIds].sort() : undefined;
  if (runIds && new Set(runIds).size !== runIds.length)
    fail("COHORT_INVALID", "The cohort contains duplicate run identities.");
  if (runIds && runIds.length > OUTCOME_SCORECARD_LIMITS_V1.maxRuns)
    fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the run limit.");
  if (selector.toSequence - selector.fromSequence + 1 > OUTCOME_SCORECARD_LIMITS_V1.maxEvents)
    fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the event limit.");
  return {
    projectId: selector.projectId,
    fromSequence: selector.fromSequence,
    toSequence: selector.toSequence,
    ...(runIds ? { runIds } : {}),
  } satisfies OutcomeScorecardSelectorV1;
}

export function parseOutcomeScorecardRequestV1(
  value: unknown,
): OutcomeScorecardRequestV1 {
  validateOutcomeScorecardPrivacyV1(value);
  if (
    isRecord(value) &&
    ((isRecord(value.selector) &&
      Array.isArray(value.selector.runIds) &&
      value.selector.runIds.length > OUTCOME_SCORECARD_LIMITS_V1.maxRuns) ||
      (Array.isArray(value.runRecordIdentities) &&
        value.runRecordIdentities.length > OUTCOME_SCORECARD_LIMITS_V1.maxRuns))
  )
    fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the run limit.");
  assertContract<OutcomeScorecardRequestV1>(value, "OutcomeScorecardRequestV1");
  const selector = normalizedSelector(value.selector);
  const identities = [...value.runRecordIdentities].sort((left, right) =>
    left.runId.localeCompare(right.runId),
  );
  if (new Set(identities.map((item) => item.runId)).size !== identities.length)
    fail("COHORT_INVALID", "The cohort contains duplicate run-record identities.");
  if (identities.length > OUTCOME_SCORECARD_LIMITS_V1.maxRuns)
    fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the run limit.");
  if (selector.runIds) {
    const selected = new Set(selector.runIds);
    if (identities.some((identity) => !selected.has(identity.runId)))
      fail("COHORT_INVALID", "The run-record manifest exceeds the selected cohort.");
  }
  return structuredClone({ ...value, selector, runRecordIdentities: identities });
}

export function parseOutcomeScorecardDiscoveryRequestV1(
  value: unknown,
): OutcomeScorecardDiscoveryRequestV1 {
  validateOutcomeScorecardPrivacyV1(value);
  if (
    isRecord(value) &&
    isRecord(value.selector) &&
    Array.isArray(value.selector.runIds) &&
    value.selector.runIds.length > OUTCOME_SCORECARD_LIMITS_V1.maxRuns
  )
    fail("COHORT_LIMIT_EXCEEDED", "Discovery exceeds the run limit.");
  assertContract<OutcomeScorecardDiscoveryRequestV1>(
    value,
    "OutcomeScorecardDiscoveryRequestV1",
  );
  return structuredClone({ ...value, selector: normalizedSelector(value.selector) });
}

export function assertOutcomeScorecardDiscoveryV1(
  value: unknown,
): asserts value is OutcomeScorecardDiscoveryV1 {
  validateOutcomeScorecardPrivacyV1(value);
  assertContract<OutcomeScorecardDiscoveryV1>(value, "OutcomeScorecardDiscoveryV1");
  const { discoveryHash, ...content } = value;
  if (discoveryHashV1(content) !== discoveryHash)
    fail("EVIDENCE_CONFLICT", "The discovery evidence hash is invalid.");
  if (
    canonicalOutcomeScorecardJsonV1(value.selector) !==
      canonicalOutcomeScorecardJsonV1(normalizedSelector(value.selector)) ||
    value.candidates.some((candidate, index) =>
      index > 0 &&
      value.candidates[index - 1]!.identity.runId.localeCompare(candidate.identity.runId) >= 0,
    )
  )
    fail("EVIDENCE_CONFLICT", "Discovery evidence is not canonically ordered.");
}

export function assertOutcomeScorecardV1(
  value: unknown,
): asserts value is OutcomeScorecardV1 {
  validateOutcomeScorecardPrivacyV1(value);
  assertContract<OutcomeScorecardV1>(value, "OutcomeScorecardV1");
  assertScorecardSemantics(value);
  if (scorecardHashV1(value) !== value.scorecardHash)
    fail("EVIDENCE_CONFLICT", "The scorecard hash is invalid.");
}

function orderedBy<T>(items: readonly T[], key: (item: T) => string) {
  return items.every(
    (item, index) => index === 0 || key(items[index - 1]!).localeCompare(key(item)) < 0,
  );
}

function sameNumber(left: number, right: number) {
  return Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function compareFindings(
  left: OutcomeScorecardFindingV1,
  right: OutcomeScorecardFindingV1,
) {
  return left.subjectRef.localeCompare(right.subjectRef) ||
    left.code.localeCompare(right.code);
}

function findingsAreOrdered(items: readonly OutcomeScorecardFindingV1[]) {
  return items.every(
    (item, index) => index === 0 || compareFindings(items[index - 1]!, item) < 0,
  );
}

function assertMetricSemantics(
  expectedMetricId: OutcomeScorecardMetricIdV1,
  value: OutcomeScorecardMetricV1,
) {
  const numerator = value.evidence.reduce(
    (sum, item) => sum + item.numeratorContribution,
    0,
  );
  const denominator = value.evidence.reduce(
    (sum, item) => sum + item.denominatorContribution,
    0,
  );
  const excludedCount = value.evidence.filter((item) => item.excluded).length;
  const coverage = denominator + excludedCount === 0
    ? 0
    : denominator / (denominator + excludedCount);
  const complete = denominator > 0 && excludedCount === 0;
  if (
    value.metricId !== expectedMetricId ||
    !orderedBy(value.evidence, (item) => item.subjectRef) ||
    value.evidence.some(
      (item) =>
        (item.excluded &&
          (item.denominatorContribution !== 0 ||
            item.numeratorContribution !== 0 ||
            item.reasonCode === undefined)) ||
        (!item.excluded && item.denominatorContribution !== 1),
    ) ||
    !sameNumber(value.numerator, numerator) ||
    value.denominator !== denominator ||
    value.excludedCount !== excludedCount ||
    !sameNumber(value.coverage, coverage) ||
    value.status !== (complete ? "complete" : "insufficient-evidence") ||
    (expectedMetricId === "providerMonetaryCost"
      ? (value.unit !== undefined && !/^[A-Z]{3}:minor-units$/.test(value.unit)) ||
        (complete && value.unit === undefined)
      : value.unit !== undefined) ||
    (complete && !sameNumber(
      value.value!,
      expectedMetricId === "providerMonetaryCost" ? numerator : numerator / denominator,
    )) ||
    (!complete && value.value !== null)
  )
    fail("EVIDENCE_CONFLICT", "A metric does not reconstruct from its evidence.");
  const expectsDistribution = expectedMetricId === "reviewCorrectionCycles" ||
    expectedMetricId === "dispatchToAcceptedMs" ||
    expectedMetricId === "tokensPerAcceptedTask";
  if (expectsDistribution !== Boolean(value.distribution))
    fail("EVIDENCE_CONFLICT", "A metric distribution is not reconstructible.");
  if (!value.distribution) return;
  const distribution = value.distribution;
  const values = value.evidence
    .filter((item) => !item.excluded && item.value !== undefined)
    .map((item) => item.value!)
    .sort((left, right) => left - right);
  const expectedRawValues = values.length > 0 && values.length < 5
    ? values
    : undefined;
  const percentile = (fraction: number) =>
    values[Math.max(0, Math.ceil(values.length * fraction) - 1)]!;
  const expectedPercentiles = values.length >= 5
    ? { p50: percentile(0.5), p90: percentile(0.9), p95: percentile(0.95) }
    : undefined;
  if (
    distribution.count !== values.length ||
    !sameNumber(
      distribution.sum,
      values.reduce((sum, item) => sum + item, 0),
    ) ||
    distribution.min !== (values[0] ?? null) ||
    distribution.max !== (values.at(-1) ?? null) ||
    (expectedRawValues === undefined
      ? distribution.rawValues !== undefined
      : distribution.rawValues === undefined ||
        distribution.rawValues.length !== expectedRawValues.length ||
        distribution.rawValues.some(
          (item, index) => !sameNumber(item, expectedRawValues[index]!),
        )) ||
    (expectedPercentiles === undefined
      ? distribution.percentiles !== undefined
      : distribution.percentiles === undefined ||
        !sameNumber(distribution.percentiles.p50, expectedPercentiles.p50) ||
        !sameNumber(distribution.percentiles.p90, expectedPercentiles.p90) ||
        !sameNumber(distribution.percentiles.p95, expectedPercentiles.p95))
  )
    fail("EVIDENCE_CONFLICT", "A metric distribution is not reconstructible.");
}

function assertScorecardSemantics(value: OutcomeScorecardV1) {
  const metrics: Array<
    readonly [OutcomeScorecardMetricIdV1, OutcomeScorecardMetricV1]
  > = [
    ["firstPassAcceptanceRate", value.metrics.delivery.firstPassAcceptanceRate],
    ["reviewCorrectionCycles", value.metrics.delivery.reviewCorrectionCycles],
    ["dispatchToAcceptedMs", value.metrics.delivery.dispatchToAcceptedMs],
    ["tokensPerAcceptedTask", value.metrics.delivery.tokensPerAcceptedTask],
    ["overrideRate", value.metrics.delivery.overrideRate],
    ["humanEscalationRate", value.metrics.qualitySafety.humanEscalationRate],
    ["haltRecurrenceRate", value.metrics.qualitySafety.haltRecurrenceRate],
    ...(value.metrics.operational
      ? Object.entries(value.metrics.operational) as Array<readonly [OutcomeScorecardMetricIdV1, OutcomeScorecardMetricV1]>
      : []),
  ];
  metrics.forEach(([metricId, item]) => assertMetricSemantics(metricId, item));
  const runIdentities = value.cohort.includedRuns.map((item) => item.identity);
  const expectedCohortId = sha256(
    canonicalOutcomeScorecardJsonV1({
      policyVersion: value.policyVersion,
      selector: value.selector,
      projectWatermark: value.sourceWatermarks.project,
      runRecordIdentities: value.sourceWatermarks.runs,
    }),
  );
  const unsupported = value.metrics.unsupported.map((item) => [
    item.outcomeClass,
    item.missingAuthority,
  ] as const);
  const expectedFindings = [
    ...value.cohort.excludedRuns,
    ...value.cohort.excludedTasks,
    ...value.cohort.excludedAttempts,
  ].sort(compareFindings);
  const expectedCompleteness = completeness({
    delivery: value.metrics.delivery,
    qualitySafety: value.metrics.qualitySafety,
    ...(value.metrics.operational ? { operational: value.metrics.operational } : {}),
  });
  if (
    canonicalOutcomeScorecardJsonV1(value.selector) !==
      canonicalOutcomeScorecardJsonV1(normalizedSelector(value.selector)) ||
    !orderedBy(value.sourceWatermarks.runs, (item) => item.runId) ||
    !orderedBy(value.cohort.includedRuns, (item) => item.identity.runId) ||
    !orderedBy(value.cohort.includedTasks, (item) => item.taskRef) ||
    !orderedBy(value.cohort.includedAttempts, (item) => item.attemptRef) ||
    !findingsAreOrdered(value.findings) ||
    !findingsAreOrdered(value.cohort.excludedRuns) ||
    !findingsAreOrdered(value.cohort.excludedTasks) ||
    !findingsAreOrdered(value.cohort.excludedAttempts) ||
    canonicalOutcomeScorecardJsonV1(value.findings) !==
      canonicalOutcomeScorecardJsonV1(expectedFindings) ||
    value.cohort.excludedRuns.some((item) => item.subjectType !== "run") ||
    value.cohort.excludedTasks.some(
      (item) => item.subjectType !== "task" || item.code !== "RUN_UNLINKED",
    ) ||
    value.cohort.excludedAttempts.some(
      (item) => item.subjectType !== "attempt" || item.code !== "EVIDENCE_INCOMPLETE",
    ) ||
    canonicalOutcomeScorecardJsonV1(runIdentities) !==
      canonicalOutcomeScorecardJsonV1(value.sourceWatermarks.runs) ||
    value.cohortId !== expectedCohortId ||
    canonicalOutcomeScorecardJsonV1(unsupported) !==
      canonicalOutcomeScorecardJsonV1(
        value.metrics.operational
          ? STILL_UNSUPPORTED_OUTCOMES_V1
          : OUTCOME_SCORECARD_UNSUPPORTED_OUTCOMES_V1,
      ) ||
    value.metrics.unsupported.some(
      (item) =>
        item.status !== "unsupported" || item.reasonCode !== "METRIC_UNSUPPORTED",
    ) ||
    canonicalOutcomeScorecardJsonV1(value.completeness) !==
      canonicalOutcomeScorecardJsonV1(expectedCompleteness)
  )
    fail("EVIDENCE_CONFLICT", "The scorecard has conflicting canonical semantics.");
}

const prohibitedOutputKeys = new Set([
  "prompt",
  "promptBody",
  "fileContent",
  "environment",
  "environmentValues",
  "credentials",
  "hiddenReasoning",
  "providerPayload",
  "rawProviderPayload",
  "taskLogs",
  "log",
  "reviewProse",
  "reviewOutput",
  "finalOutput",
  "diff",
]);

export function validateOutcomeScorecardPrivacyV1(value: unknown) {
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    for (const [key, child] of Object.entries(candidate)) {
      if (prohibitedOutputKeys.has(key))
        fail("PRIVACY_VIOLATION", "The response violates the privacy field policy.");
      visit(child);
    }
  };
  visit(value);
}

export type OutcomeScorecardSourcesV1 = Readonly<{
  readProjectEvidence: (projectId: string) => Promise<AuditEvidenceSourceV1>;
  /** Must return the exact UTF-8 run.json bytes as text and must never recover or write. */
  readRunRecord: (runId: string) => Promise<string | undefined>;
}>;

type ParsedRunTaskV1 = Readonly<{
  id: string;
  status?: string;
  executionAttempts?: number;
  reviewCycles?: number;
  reviewEvidence: boolean;
  totalTokens?: number;
  usageComplete: boolean;
  workspace?: Record<string, unknown>;
  workspaceAttemptId?: string;
  promptRefs: readonly Record<string, unknown>[];
}>;

type ParsedRunV1 = Readonly<{
  id: string;
  tasks: readonly ParsedRunTaskV1[];
  workspaceAttempts: readonly Record<string, unknown>[];
}>;

type JoinedTaskObservationV1 = Readonly<{
  included: IncludedTaskV1;
  executionAttempts?: number;
  reviewCycles?: number;
  reviewEvidence: boolean;
  totalTokens?: number;
  usageComplete: boolean;
  terminal: boolean;
}>;

type CohortContextV1 = Readonly<{
  source: AuditEvidenceSourceV1;
  selector: OutcomeScorecardSelectorV1;
  events: readonly ChangeControlEvent[];
  taskScopes: ReadonlySet<string>;
  bindings: readonly Record<string, unknown>[];
}>;

const privacy: OutcomeScorecardPrivacyV1 = Object.freeze({
  policyVersion: "outcome-scorecard-privacy-v1",
  prohibitedFieldsExcluded: true,
  diagnosticsBounded: true,
});

function scopeKey(changeId: string, waveId: string, taskId: string) {
  return `${changeId}\0${waveId}\0${taskId}`;
}

function eventRef(event: ChangeControlEvent) {
  return `event:${event.sequence}:${event.id}`;
}

function runRef(identity: OutcomeRunRecordIdentityV1) {
  return `run:${identity.runId}:${identity.sha256}`;
}

function taskSubjectRef(changeId: string, waveId: string, taskId: string) {
  return `task:${changeId}:${waveId}:${taskId}`;
}

function runTaskSubjectRef(runId: string, runTaskId: string) {
  return `task:run:${runId}:${runTaskId}`;
}

function boundedRefs(refs: readonly string[]) {
  const normalized = [...new Set(refs)].sort();
  if (normalized.length > OUTCOME_SCORECARD_LIMITS_V1.maxEvidenceRefsPerMetric)
    fail("COHORT_LIMIT_EXCEEDED", "Metric evidence exceeds the bounded reference limit.");
  return normalized;
}

function readNumber(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : undefined;
}

function parseRun(serialized: string, expectedRunId: string): ParsedRunV1 {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    fail("EVIDENCE_CONFLICT", "A canonical run record is not valid JSON.");
  }
  if (!isRecord(value) || value.id !== expectedRunId || !Array.isArray(value.tasks))
    fail("EVIDENCE_CONFLICT", "A canonical run record has a conflicting root identity.");
  if (value.tasks.length > OUTCOME_SCORECARD_LIMITS_V1.maxTasks)
    fail("COHORT_LIMIT_EXCEEDED", "A run record exceeds the task limit.");
  const taskIds = new Set<string>();
  const tasks = value.tasks.map((candidate): ParsedRunTaskV1 => {
    if (!isRecord(candidate) || !identifier(candidate.id) || taskIds.has(candidate.id))
      fail("EVIDENCE_CONFLICT", "A canonical run record has conflicting task identities.");
    taskIds.add(candidate.id);
    let executionAttempts = readNumber(candidate.executionAttempts);
    const usage = candidate.usage;
    let usageComplete = Array.isArray(usage) && usage.length > 0;
    let totalTokens = 0;
    let maxExecutorAttempt = 0;
    if (Array.isArray(usage)) {
      if (usage.length > OUTCOME_SCORECARD_LIMITS_V1.maxAttempts)
        fail("COHORT_LIMIT_EXCEEDED", "A run task exceeds the attempt observation limit.");
      for (const item of usage) {
        if (!isRecord(item) || !["executor", "reviewer", "correction"].includes(String(item.phase))) {
          usageComplete = false;
          continue;
        }
        const input = readNumber(item.inputTokens);
        const output = readNumber(item.outputTokens);
        const cached = readNumber(item.cachedInputTokens);
        const attempt = readNumber(item.attempt);
        if (input === undefined || output === undefined || cached === undefined || !attempt || attempt < 1) {
          usageComplete = false;
          continue;
        }
        totalTokens += input + output;
        if (item.phase === "executor") maxExecutorAttempt = Math.max(maxExecutorAttempt, attempt);
      }
    }
    if (executionAttempts === undefined && maxExecutorAttempt > 0)
      executionAttempts = maxExecutorAttempt;
    const attempts = readNumber(candidate.attempts);
    const reviewCycles = attempts !== undefined && attempts >= 1 ? attempts - 1 : undefined;
    const promptRefs = Array.isArray(candidate.promptModelExecutionRefs)
      ? candidate.promptModelExecutionRefs.filter(isRecord)
      : [];
    return {
      id: candidate.id,
      ...(typeof candidate.status === "string" ? { status: candidate.status } : {}),
      ...(executionAttempts !== undefined ? { executionAttempts } : {}),
      ...(reviewCycles !== undefined ? { reviewCycles } : {}),
      reviewEvidence:
        typeof candidate.reviewStatus === "string" ||
        promptRefs.some((ref) => ref.role === "reviewer" || ref.role === "correction"),
      ...(usageComplete ? { totalTokens } : {}),
      usageComplete,
      ...(isRecord(candidate.workspace) ? { workspace: candidate.workspace } : {}),
      ...(identifier(candidate.workspaceAttemptId)
        ? { workspaceAttemptId: candidate.workspaceAttemptId }
        : {}),
      promptRefs,
    };
  });
  const workspaceAttempts = Array.isArray(value.workspaceAttempts)
    ? value.workspaceAttempts.filter(isRecord)
    : [];
  return { id: expectedRunId, tasks, workspaceAttempts };
}

function selectedContext(
  source: AuditEvidenceSourceV1,
  selector: OutcomeScorecardSelectorV1,
): CohortContextV1 {
  const last = source.events.at(-1);
  if (
    source.projectId !== selector.projectId ||
    source.projection.projectId !== selector.projectId ||
    source.watermark.sequence < selector.toSequence ||
    !last ||
    last.sequence !== source.watermark.sequence ||
    last.hash !== source.watermark.hash ||
    source.events.some(
      (event, index) => event.sequence !== index + 1 || event.projectId !== selector.projectId,
    )
  )
    fail("SOURCE_UNAVAILABLE", "The canonical project source cannot satisfy the cohort.");
  const events = source.events.filter(
    (event) => event.sequence >= selector.fromSequence && event.sequence <= selector.toSequence,
  );
  if (
    events.length !== selector.toSequence - selector.fromSequence + 1 ||
    events.some((event, index) =>
      event.sequence !== selector.fromSequence + index || event.projectId !== selector.projectId,
    )
  )
    fail("EVIDENCE_CONFLICT", "The selected canonical sequence range is incomplete.");
  if (events.length > OUTCOME_SCORECARD_LIMITS_V1.maxEvents)
    fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the event limit.");
  const taskScopes = new Set<string>();
  for (const event of events) {
    if (event.waveId && event.taskId)
      taskScopes.add(scopeKey(event.changeId, event.waveId, event.taskId));
  }
  if (taskScopes.size > OUTCOME_SCORECARD_LIMITS_V1.maxTasks)
    fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the task limit.");
  const bindings = source.projection.promptModelLineage.bindings
    .filter(
      (binding) =>
        binding.bindingScope === "attempt" &&
        binding.publicationSequence >= selector.fromSequence &&
        binding.publicationSequence <= selector.toSequence &&
        taskScopes.has(scopeKey(binding.changeId, binding.waveId, binding.taskId)),
    )
    .map((binding) => binding as unknown as Record<string, unknown>)
    .sort((left, right) =>
      Number(left.publicationSequence) - Number(right.publicationSequence) ||
      String(left.bindingId).localeCompare(String(right.bindingId)),
    );
  return { source, selector, events, taskScopes, bindings };
}

function exactWorkspaceJoin(
  context: CohortContextV1,
  run: ParsedRunV1,
  task: ParsedRunTaskV1,
) {
  const workspace = task.workspace;
  if (!workspace || !task.workspaceAttemptId) return undefined;
  const fields = ["projectId", "changeId", "waveId", "taskId"] as const;
  if (!fields.every((field) => identifier(workspace[field])))
    fail("EVIDENCE_CONFLICT", "A workspace binding has an invalid immutable identity.");
  const projectId = String(workspace.projectId);
  const changeId = String(workspace.changeId);
  const waveId = String(workspace.waveId);
  const taskId = String(workspace.taskId);
  const matches = run.workspaceAttempts.filter(
    (attempt) =>
      attempt.contractType === "WorkspaceAttemptV1" &&
      attempt.contractVersion === "1.0" &&
      attempt.workspaceAttemptId === task.workspaceAttemptId &&
      attempt.projectId === projectId &&
      attempt.changeId === changeId &&
      attempt.waveId === waveId &&
      attempt.taskId === taskId &&
      attempt.runId === run.id &&
      attempt.attemptId === task.id,
  );
  if (matches.length !== 1)
    fail("EVIDENCE_CONFLICT", "A workspace binding lacks one exact canonical attempt.");
  if (
    projectId !== context.selector.projectId ||
    !context.taskScopes.has(scopeKey(changeId, waveId, taskId))
  )
    return undefined;
  return {
    projectId,
    changeId,
    waveId,
    taskId,
    refs: [`workspace-attempt:${task.workspaceAttemptId}`],
  };
}

function exactPromptJoin(
  context: CohortContextV1,
  run: ParsedRunV1,
  task: ParsedRunTaskV1,
) {
  const matches: Array<{
    projectId: string;
    changeId: string;
    waveId: string;
    taskId: string;
    refs: string[];
  }> = [];
  for (const ref of task.promptRefs) {
    if (!identifier(ref.bindingId) || !identifier(ref.attemptId)) continue;
    for (const binding of context.bindings) {
      if (
        binding.bindingId === ref.bindingId &&
        binding.attemptId === ref.attemptId &&
        binding.runId === run.id &&
        binding.projectId === context.selector.projectId &&
        identifier(binding.changeId) &&
        identifier(binding.waveId) &&
        identifier(binding.taskId)
      ) {
        matches.push({
          projectId: String(binding.projectId),
          changeId: String(binding.changeId),
          waveId: String(binding.waveId),
          taskId: String(binding.taskId),
          refs: [
            `binding:${String(binding.bindingId)}:${String(binding.publicationSequence)}`,
          ],
        });
      }
    }
  }
  if (!matches.length) return undefined;
  const identities = new Set(
    matches.map((match) => scopeKey(match.changeId, match.waveId, match.taskId)),
  );
  if (identities.size !== 1)
    fail("EVIDENCE_CONFLICT", "Prompt lineage creates conflicting task joins.");
  const first = matches[0];
  return { ...first, refs: boundedRefs(matches.flatMap((match) => match.refs)) };
}

function analyzeRun(
  context: CohortContextV1,
  identity: OutcomeRunRecordIdentityV1,
  run: ParsedRunV1,
) {
  const observations: JoinedTaskObservationV1[] = [];
  const excludedTasks: OutcomeScorecardFindingV1[] = [];
  for (const task of run.tasks) {
    const joins = [
      exactWorkspaceJoin(context, run, task),
      exactPromptJoin(context, run, task),
    ].filter((join): join is NonNullable<typeof join> => Boolean(join));
    if (!joins.length) {
      excludedTasks.push(
        finding(
          "RUN_UNLINKED",
          "task",
          runTaskSubjectRef(run.id, task.id),
          [runRef(identity)],
        ),
      );
      continue;
    }
    const keys = new Set(joins.map((join) => scopeKey(join.changeId, join.waveId, join.taskId)));
    if (keys.size !== 1)
      fail("EVIDENCE_CONFLICT", "Canonical join mechanisms disagree on task identity.");
    const join = joins[0];
    const taskRef = `${taskSubjectRef(join.changeId, join.waveId, join.taskId)}:${run.id}:${task.id}`;
    observations.push({
      included: {
        taskRef,
        projectId: join.projectId,
        changeId: join.changeId,
        waveId: join.waveId,
        taskId: join.taskId,
        runId: run.id,
        runTaskId: task.id,
        evidenceRefs: boundedRefs([
          runRef(identity),
          ...joins.flatMap((candidate) => candidate.refs),
        ]),
      },
      ...(task.executionAttempts !== undefined
        ? { executionAttempts: task.executionAttempts }
        : {}),
      ...(task.reviewCycles !== undefined ? { reviewCycles: task.reviewCycles } : {}),
      reviewEvidence: task.reviewEvidence,
      ...(task.totalTokens !== undefined ? { totalTokens: task.totalTokens } : {}),
      usageComplete: task.usageComplete,
      terminal: ["completed", "failed", "timed_out", "cancelled", "blocked"].includes(
        task.status ?? "",
      ),
    });
  }
  observations.sort((left, right) => left.included.taskRef.localeCompare(right.included.taskRef));
  excludedTasks.sort(compareFindings);
  return { observations, excludedTasks };
}

function finding(
  code: OutcomeScorecardReasonCodeV1,
  subjectType: OutcomeScorecardFindingV1["subjectType"],
  subjectRef: string,
  evidenceRefs: readonly string[] = [],
): OutcomeScorecardFindingV1 {
  return { code, subjectType, subjectRef, evidenceRefs: boundedRefs(evidenceRefs) };
}

function sourceWatermarkMatches(
  expected: OutcomeScorecardWatermarkV1 | undefined,
  actual: OutcomeScorecardWatermarkV1,
) {
  return !expected ||
    (expected.sequence === actual.sequence && expected.hash === actual.hash);
}

function metric(
  metricId: OutcomeScorecardMetricIdV1,
  evidence: readonly OutcomeScorecardMetricEvidenceV1[],
  kind: "rate" | "distribution" | "sum",
  unit?: string,
): OutcomeScorecardMetricV1 {
  const ordered = [...evidence].sort((left, right) => left.subjectRef.localeCompare(right.subjectRef));
  const numerator = ordered.reduce((sum, item) => sum + item.numeratorContribution, 0);
  const denominator = ordered.reduce((sum, item) => sum + item.denominatorContribution, 0);
  const excludedCount = ordered.filter((item) => item.excluded).length;
  const coverage = denominator + excludedCount === 0 ? 0 : denominator / (denominator + excludedCount);
  const status = denominator > 0 && excludedCount === 0 ? "complete" : "insufficient-evidence";
  const values = ordered
    .filter((item) => !item.excluded && item.value !== undefined)
    .map((item) => item.value!)
    .sort((left, right) => left - right);
  const base = {
    metricId,
    status,
    numerator,
    denominator,
    excludedCount,
    coverage,
    policyVersion: OUTCOME_SCORECARD_POLICY_VERSION_V1,
    value: status === "complete" ? (kind === "sum" ? numerator : numerator / denominator) : null,
    ...(unit ? { unit } : {}),
    evidence: ordered,
  } as const;
  if (kind === "rate" || kind === "sum") return base;
  const percentile = (fraction: number) =>
    values[Math.max(0, Math.ceil(values.length * fraction) - 1)]!;
  return {
    ...base,
    distribution: {
      count: values.length,
      sum: values.reduce((sum, value) => sum + value, 0),
      min: values[0] ?? null,
      max: values.at(-1) ?? null,
      ...(values.length > 0 && values.length < 5 ? { rawValues: values } : {}),
      ...(values.length >= 5
        ? { percentiles: { p50: percentile(0.5), p90: percentile(0.9), p95: percentile(0.95) } }
        : {}),
    },
  };
}

function metricEvidence(
  subjectRef: string,
  evidenceRefs: readonly string[],
  options: Readonly<{
    numerator?: number;
    value?: number;
    excluded?: boolean;
    reasonCode?: OutcomeScorecardMetricEvidenceV1["reasonCode"];
  }> = {},
): OutcomeScorecardMetricEvidenceV1 {
  const excluded = options.excluded ?? false;
  return {
    subjectRef,
    numeratorContribution: excluded ? 0 : options.numerator ?? 0,
    denominatorContribution: excluded ? 0 : 1,
    excluded,
    ...(options.value !== undefined ? { value: options.value } : {}),
    ...(options.reasonCode ? { reasonCode: options.reasonCode } : {}),
    evidenceRefs: boundedRefs(evidenceRefs),
  };
}

function eventForTask(
  events: readonly ChangeControlEvent[],
  changeId: string,
  waveId: string,
  taskId: string,
  type: ChangeControlEvent["type"],
) {
  return events.find(
    (event) =>
      event.changeId === changeId &&
      event.waveId === waveId &&
      event.taskId === taskId &&
      event.type === type,
  );
}

function deliveryMetrics(
  context: CohortContextV1,
  observations: readonly JoinedTaskObservationV1[],
) {
  const grouped = new Map<string, JoinedTaskObservationV1[]>();
  for (const observation of observations) {
    const task = observation.included;
    const key = scopeKey(task.changeId, task.waveId, task.taskId);
    grouped.set(key, [...(grouped.get(key) ?? []), observation]);
  }
  const firstPass: OutcomeScorecardMetricEvidenceV1[] = [];
  const cycles: OutcomeScorecardMetricEvidenceV1[] = [];
  const durations: OutcomeScorecardMetricEvidenceV1[] = [];
  const tokens: OutcomeScorecardMetricEvidenceV1[] = [];
  for (const [key, taskObservations] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
    const task = taskObservations[0].included;
    const subjectRef = taskSubjectRef(task.changeId, task.waveId, task.taskId);
    const refs = boundedRefs(taskObservations.flatMap((item) => item.included.evidenceRefs));
    const accepted = eventForTask(
      context.events,
      task.changeId,
      task.waveId,
      task.taskId,
      "task.accepted",
    );
    const attemptsKnown = taskObservations.every(
      (item) => item.executionAttempts !== undefined && item.terminal,
    );
    const attempts = attemptsKnown
      ? taskObservations.reduce((sum, item) => sum + item.executionAttempts!, 0)
      : undefined;
    if (attempts === undefined || attempts < 1) {
      firstPass.push(metricEvidence(subjectRef, refs, { excluded: true, reasonCode: "EVIDENCE_INCOMPLETE" }));
    } else {
      firstPass.push(metricEvidence(subjectRef, [...refs, ...(accepted ? [eventRef(accepted)] : [])], {
        numerator: accepted && attempts === 1 ? 1 : 0,
      }));
    }
    if (accepted) {
      const reviewComplete = taskObservations.every(
        (item) => item.reviewEvidence && item.reviewCycles !== undefined,
      );
      if (!reviewComplete) {
        cycles.push(metricEvidence(subjectRef, [...refs, eventRef(accepted)], {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        }));
      } else {
        const value = taskObservations.reduce((sum, item) => sum + item.reviewCycles!, 0);
        cycles.push(metricEvidence(subjectRef, [...refs, eventRef(accepted)], { numerator: value, value }));
      }
      const dispatch = context.events.find(
        (event) =>
          event.changeId === task.changeId &&
          event.waveId === task.waveId &&
          (event.type === "wave.dispatched" || event.type === "wave.dispatch-overridden"),
      );
      const start = dispatch ? Date.parse(dispatch.occurredAt) : Number.NaN;
      const finish = Date.parse(accepted.occurredAt);
      if (!dispatch || !Number.isFinite(start) || !Number.isFinite(finish) || finish < start) {
        durations.push(metricEvidence(subjectRef, [...refs, eventRef(accepted)], {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        }));
      } else {
        const value = finish - start;
        durations.push(metricEvidence(subjectRef, [...refs, eventRef(dispatch), eventRef(accepted)], {
          numerator: value,
          value,
        }));
      }
      if (!taskObservations.every((item) => item.usageComplete && item.totalTokens !== undefined)) {
        tokens.push(metricEvidence(subjectRef, [...refs, eventRef(accepted)], {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        }));
      } else {
        const value = taskObservations.reduce((sum, item) => sum + item.totalTokens!, 0);
        tokens.push(metricEvidence(subjectRef, [...refs, eventRef(accepted)], { numerator: value, value }));
      }
    }
  }
  const dispatchByWave = new Map<string, ChangeControlEvent[]>();
  for (const event of context.events) {
    if (!event.waveId || !["wave.dispatched", "wave.dispatch-overridden"].includes(event.type)) continue;
    const key = `${event.changeId}\0${event.waveId}`;
    dispatchByWave.set(key, [...(dispatchByWave.get(key) ?? []), event]);
  }
  const overrides = [...dispatchByWave.entries()].map(([key, events]) => {
    const [changeId, waveId] = key.split("\0");
    return metricEvidence(`wave:${changeId}:${waveId}`, events.map(eventRef), {
      numerator: events.some((event) => event.type === "wave.dispatch-overridden") ? 1 : 0,
    });
  });
  return {
    firstPassAcceptanceRate: metric("firstPassAcceptanceRate", firstPass, "rate"),
    reviewCorrectionCycles: metric("reviewCorrectionCycles", cycles, "distribution"),
    dispatchToAcceptedMs: metric("dispatchToAcceptedMs", durations, "distribution"),
    tokensPerAcceptedTask: metric("tokensPerAcceptedTask", tokens, "distribution"),
    overrideRate: metric("overrideRate", overrides, "rate"),
  };
}

type SelectedHaltStateV1 = {
  haltId: string;
  fingerprint?: string;
  haltClass?: string;
  state?: string;
  effectiveIncidentId?: string;
};

type SelectedIncidentStateV1 = {
  incidentId: string;
  state?: string;
  haltIds: Set<string>;
};

function pushEventEvidence(
  evidence: Map<string, ChangeControlEvent[]>,
  identity: string | undefined,
  event: ChangeControlEvent,
) {
  if (!identity) return;
  evidence.set(identity, [...(evidence.get(identity) ?? []), event]);
}

function selectedHaltIncidentState(events: readonly ChangeControlEvent[]) {
  const halts = new Map<string, SelectedHaltStateV1>();
  const incidents = new Map<string, SelectedIncidentStateV1>();
  const haltEvidence = new Map<string, ChangeControlEvent[]>();
  const incidentEvidence = new Map<string, ChangeControlEvent[]>();

  for (const event of events) {
    if (event.type === "halt.detected" && isRecord(event.payload.halt)) {
      const halt = event.payload.halt;
      const haltId = identifier(halt.haltId) ? halt.haltId : undefined;
      const observation = isRecord(halt.observation) ? halt.observation : undefined;
      pushEventEvidence(haltEvidence, haltId, event);
      if (haltId) {
        halts.set(haltId, {
          haltId,
          ...(typeof observation?.fingerprint === "string"
            ? { fingerprint: observation.fingerprint }
            : {}),
          ...(typeof halt.state === "string" ? { state: halt.state } : {}),
        });
      }
      continue;
    }

    if (event.type === "incident.opened" && isRecord(event.payload.incident)) {
      const incident = event.payload.incident;
      const incidentId = identifier(incident.incidentId)
        ? incident.incidentId
        : undefined;
      pushEventEvidence(incidentEvidence, incidentId, event);
      if (incidentId) {
        const haltIds = new Set(
          Array.isArray(incident.haltIds)
            ? incident.haltIds.filter(identifier)
            : [],
        );
        incidents.set(incidentId, {
          incidentId,
          ...(typeof incident.state === "string" ? { state: incident.state } : {}),
          haltIds,
        });
        for (const haltId of haltIds) {
          const halt = halts.get(haltId);
          if (halt) halt.effectiveIncidentId = incidentId;
        }
      }
      continue;
    }

    if (event.type === "incident.halt-linked") {
      const haltId = identifier(event.payload.haltId)
        ? event.payload.haltId
        : undefined;
      const incidentId = identifier(event.payload.incidentId)
        ? event.payload.incidentId
        : undefined;
      pushEventEvidence(haltEvidence, haltId, event);
      pushEventEvidence(incidentEvidence, incidentId, event);
      const halt = haltId ? halts.get(haltId) : undefined;
      const incident = incidentId ? incidents.get(incidentId) : undefined;
      if (halt && incident && incidentId && haltId) {
        halt.effectiveIncidentId = incidentId;
        incident.haltIds.add(haltId);
      }
      continue;
    }

    if (event.type === "halt.classified") {
      const haltId = identifier(event.payload.haltId)
        ? event.payload.haltId
        : undefined;
      const incidentId = identifier(event.payload.incidentId)
        ? event.payload.incidentId
        : undefined;
      pushEventEvidence(haltEvidence, haltId, event);
      pushEventEvidence(incidentEvidence, incidentId, event);
      const halt = haltId ? halts.get(haltId) : undefined;
      if (halt) {
        const assessment = isRecord(event.payload.assessment)
          ? event.payload.assessment
          : undefined;
        if (typeof assessment?.haltClass === "string")
          halt.haltClass = assessment.haltClass;
        if (typeof event.payload.state === "string")
          halt.state = event.payload.state;
        if (incidentId) halt.effectiveIncidentId = incidentId;
      }
      continue;
    }

    if (
      [
        "halt.dispositioned",
        "halt.healing-started",
        "halt.recovered",
        "halt.escalated",
        "halt.quarantined",
      ].includes(event.type)
    ) {
      const haltId = identifier(event.payload.haltId)
        ? event.payload.haltId
        : undefined;
      pushEventEvidence(haltEvidence, haltId, event);
      const halt = haltId ? halts.get(haltId) : undefined;
      if (halt && typeof event.payload.state === "string")
        halt.state = event.payload.state;
      continue;
    }

    if (event.type === "incident.correlation-superseded") {
      const haltId = identifier(event.payload.haltId)
        ? event.payload.haltId
        : undefined;
      const incidentId = identifier(event.payload.incidentId)
        ? event.payload.incidentId
        : undefined;
      const previousIncidentId = identifier(event.payload.previousIncidentId)
        ? event.payload.previousIncidentId
        : undefined;
      pushEventEvidence(haltEvidence, haltId, event);
      pushEventEvidence(incidentEvidence, incidentId, event);
      pushEventEvidence(incidentEvidence, previousIncidentId, event);
      const halt = haltId ? halts.get(haltId) : undefined;
      const incident = incidentId ? incidents.get(incidentId) : undefined;
      if (halt && incident && incidentId && haltId) {
        halt.effectiveIncidentId = incidentId;
        incident.haltIds.add(haltId);
      }
      continue;
    }

    let incidentId: string | undefined;
    let state: string | undefined;
    if (
      [
        "incident.investigating",
        "incident.healing",
        "incident.mitigated",
        "incident.escalated",
        "incident.reopened",
      ].includes(event.type)
    ) {
      incidentId = identifier(event.payload.incidentId)
        ? event.payload.incidentId
        : undefined;
      state = event.type === "incident.reopened"
        ? "reopened"
        : typeof event.payload.state === "string"
          ? event.payload.state
          : undefined;
    } else if (
      event.type === "incident.resolved" &&
      isRecord(event.payload.receipt) &&
      identifier(event.payload.receipt.incidentId)
    ) {
      incidentId = event.payload.receipt.incidentId;
      state = "resolved";
    }
    if (incidentId) {
      pushEventEvidence(incidentEvidence, incidentId, event);
      const incident = incidents.get(incidentId);
      if (incident && state) incident.state = state;
    }
  }

  return { halts, incidents, haltEvidence, incidentEvidence };
}

function qualitySafetyMetrics(context: CohortContextV1) {
  const state = selectedHaltIncidentState(context.events);
  const escalation: OutcomeScorecardMetricEvidenceV1[] = [];
  for (const [incidentId, incidentEvents] of [...state.incidentEvidence].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const incident = state.incidents.get(incidentId);
    const effectiveHalts = [...state.halts.values()].filter(
      (halt) => halt.effectiveIncidentId === incidentId,
    );
    const refs = boundedRefs([
      ...incidentEvents.map(eventRef),
      ...effectiveHalts.flatMap((halt) =>
        (state.haltEvidence.get(halt.haltId) ?? []).map(eventRef),
      ),
    ]);
    const missingLinkedHalt = Boolean(
      incident && [...incident.haltIds].some((haltId) => !state.halts.has(haltId)),
    );
    if (!incident || missingLinkedHalt) {
      escalation.push(
        metricEvidence(`incident:${incidentId}`, refs, {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        }),
      );
      continue;
    }
    if (!effectiveHalts.length) continue;
    const escalated =
      incident.state === "escalated" ||
      effectiveHalts.some(
        (halt) =>
          halt.haltClass === "human_decision_required" ||
          halt.state === "escalated",
      );
    if (
      !escalated &&
      effectiveHalts.some(
        (halt) => halt.haltClass === undefined || halt.state === undefined,
      )
    ) {
      escalation.push(
        metricEvidence(`incident:${incidentId}`, refs, {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        }),
      );
      continue;
    }
    escalation.push(
      metricEvidence(`incident:${incidentId}`, refs, {
        numerator: escalated ? 1 : 0,
      }),
    );
  }

  const recurrence: OutcomeScorecardMetricEvidenceV1[] = [];
  const repairsByFingerprint = new Map<
    string,
    { event: ChangeControlEvent; haltId: string }
  >();
  for (const event of context.events) {
    if (
      event.type !== "doctor.repair-finished" ||
      !isRecord(event.payload.receipt) ||
      event.payload.receipt.result !== "succeeded" ||
      !identifier(event.payload.receipt.haltId)
    )
      continue;
    const haltId = event.payload.receipt.haltId;
    const halt = state.halts.get(haltId);
    if (!halt?.fingerprint) {
      recurrence.push(
        metricEvidence(`halt-repair:${haltId}:${event.id}`, [eventRef(event)], {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        }),
      );
      continue;
    }
    const existing = repairsByFingerprint.get(halt.fingerprint);
    if (!existing || event.sequence < existing.event.sequence)
      repairsByFingerprint.set(halt.fingerprint, { event, haltId });
  }
  const cohortEnd = context.events.at(-1)!;
  for (const [fingerprint, repaired] of [...repairsByFingerprint].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const laterEvents = context.events.filter(
      (event) => event.sequence > repaired.event.sequence,
    );
    const repeated = laterEvents.find((event) => {
      if (event.type !== "halt.detected" || !isRecord(event.payload.halt))
        return false;
      const observation = event.payload.halt.observation;
      return isRecord(observation) && observation.fingerprint === fingerprint;
    });
    const refs = [
      ...(state.haltEvidence.get(repaired.haltId) ?? []).map(eventRef),
      eventRef(repaired.event),
      eventRef(cohortEnd),
      ...(repeated ? [eventRef(repeated)] : []),
    ];
    if (!laterEvents.length) {
      recurrence.push(
        metricEvidence(`halt-fingerprint:${sha256(fingerprint)}`, refs, {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        }),
      );
      continue;
    }
    recurrence.push(
      metricEvidence(`halt-fingerprint:${sha256(fingerprint)}`, refs, {
        numerator: repeated ? 1 : 0,
      }),
    );
  }
  return {
    humanEscalationRate: metric("humanEscalationRate", escalation, "rate"),
    haltRecurrenceRate: metric("haltRecurrenceRate", recurrence, "rate"),
  };
}

type OperationalObservationStateV1 = Readonly<{
  observation: OperationalObservationV1;
  sourceId: string;
  event: ChangeControlEvent;
}>;

function selectedOperationalState(context: CohortContextV1) {
  const sources = new Map<string, OperationalEvidenceSourceV1>();
  const observations = new Map<string, OperationalObservationStateV1>();
  const attributions = new Map<string, OperationalDefectAttributionV1>();
  let observed = false;
  for (const event of context.events) {
    if (!event.type.startsWith("operational.")) continue;
    observed = true;
    const request = isRecord(event.payload.request) ? event.payload.request : undefined;
    if (!request) continue;
    if (event.type === "operational.source-registered" && isRecord(request.source)) {
      const source = request.source;
      const sourceId = identifier(source.sourceId) ? source.sourceId : undefined;
      if (!sourceId) continue;
      if (identifier(source.supersedesSourceId)) {
        const prior = sources.get(source.supersedesSourceId);
        if (prior) sources.set(prior.sourceId, { ...prior, status: "superseded" });
      }
      sources.set(sourceId, {
        ...(source as unknown as OperationalEvidenceSourceV1),
        projectId: context.selector.projectId,
        ownerActor: event.actor,
        status: "active",
        registeredAt: event.occurredAt,
        registeredSequence: event.sequence,
        sourceHash: sha256(canonicalOutcomeScorecardJsonV1(source)),
      });
      continue;
    }
    if (event.type === "operational.source-revoked" && identifier(request.sourceId)) {
      const source = sources.get(request.sourceId);
      if (source) sources.set(source.sourceId, {
        ...source,
        status: request.reasonCode === "source-superseded" ? "superseded" : "revoked",
        revokedAt: event.occurredAt,
      });
      continue;
    }
    if (event.type === "operational.observations-imported" &&
      identifier(request.sourceId) && Array.isArray(request.observations)) {
      for (const candidate of request.observations) {
        if (!isRecord(candidate) || !identifier(candidate.observationId)) continue;
        observations.set(candidate.observationId, {
          observation: candidate as unknown as OperationalObservationV1,
          sourceId: request.sourceId,
          event,
        });
      }
      continue;
    }
    if (event.type === "operational.defect-attribution-recorded" &&
      identifier(request.observationId) && identifier(request.changeId) &&
      ["confirmed", "rejected", "unresolved"].includes(String(request.decision))) {
      attributions.set(`${request.observationId}\0${request.changeId}`, {
        observationId: request.observationId,
        changeId: request.changeId,
        decision: request.decision as OperationalDefectAttributionV1["decision"],
        reasonCode: String(request.reasonCode),
        evidenceRefs: Array.isArray(request.evidenceRefs)
          ? request.evidenceRefs.filter((item): item is string => typeof item === "string")
          : [],
        decidedBy: event.actor,
        decidedAt: event.occurredAt,
        sequence: event.sequence,
      });
    }
  }
  const activeSourceIds = new Set(
    [...sources.values()].filter((source) => source.status === "active").map((source) => source.sourceId),
  );
  const candidates = [...observations.values()].filter((item) => activeSourceIds.has(item.sourceId));
  const superseded = new Set(
    candidates.map((item) => item.observation.supersedesObservationId).filter(identifier),
  );
  return {
    observed,
    sources: [...sources.values()],
    observations: candidates.filter((item) => !superseded.has(item.observation.observationId)),
    attributions,
  };
}

function operationalObservationRefs(item: OperationalObservationStateV1) {
  return boundedRefs([
    `operational-observation:${item.observation.observationId}`,
    eventRef(item.event),
    ...item.observation.evidenceRefs,
  ]);
}

function operationalMetrics(
  context: CohortContextV1,
  includedTasks: readonly IncludedTaskV1[],
) {
  const state = selectedOperationalState(context);
  if (!state.observed) return undefined;
  const changeIds = new Set(includedTasks.map((item) => item.changeId));
  const runIds = new Set(includedTasks.map((item) => item.runId));
  const hasAuthority = (kind: "deployment" | "post-delivery-defect" | "provider-cost") =>
    state.sources.some((source) => source.status === "active" && source.allowedKinds.includes(kind));
  const deployments = state.observations.filter((item): item is OperationalObservationStateV1 & { observation: DeploymentObservationV1 } =>
    item.observation.contractType === "DeploymentObservationV1" &&
    item.observation.environmentClass === "production" &&
    changeIds.has(item.observation.changeId));
  const deploymentEvidence = (outcome: DeploymentObservationV1["outcome"]) =>
    hasAuthority("deployment")
      ? deployments.map((item) => metricEvidence(
          `deployment:${item.observation.observationId}`,
          operationalObservationRefs(item),
          { numerator: item.observation.outcome === outcome ? 1 : 0 },
        ))
      : [];

  const defects = state.observations.filter((item): item is OperationalObservationStateV1 & { observation: PostDeliveryDefectObservationV1 } =>
    item.observation.contractType === "PostDeliveryDefectObservationV1");
  const cohortEnd = Date.parse(context.events.at(-1)!.occurredAt);
  const escapedDefects = (days: 7 | 30 | 90) => {
    if (!hasAuthority("deployment") || !hasAuthority("post-delivery-defect")) return [];
    const windowMs = days * 86_400_000;
    return deployments.map((deployment) => {
      const deployedAt = Date.parse(deployment.observation.occurredAt);
      const refs = [...operationalObservationRefs(deployment)];
      if (!Number.isFinite(deployedAt) || !Number.isFinite(cohortEnd) || cohortEnd - deployedAt < windowMs)
        return metricEvidence(`defect-window:${days}:${deployment.observation.observationId}`, refs, {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        });
      const inWindow = defects.filter((item) => {
        const detectedAt = Date.parse(item.observation.detectedAt);
        return item.observation.candidateChangeIds.includes(deployment.observation.changeId) &&
          detectedAt >= deployedAt && detectedAt <= deployedAt + windowMs;
      });
      refs.push(...inWindow.flatMap(operationalObservationRefs));
      const decisions = inWindow.map((item) => state.attributions.get(
        `${item.observation.observationId}\0${deployment.observation.changeId}`,
      ));
      refs.push(...decisions.flatMap((item) => item?.evidenceRefs ?? []));
      if (decisions.some((item) => !item || item.decision === "unresolved"))
        return metricEvidence(`defect-window:${days}:${deployment.observation.observationId}`, refs, {
          excluded: true,
          reasonCode: "EVIDENCE_INCOMPLETE",
        });
      const count = decisions.filter((item) => item?.decision === "confirmed").length;
      return metricEvidence(`defect-window:${days}:${deployment.observation.observationId}`, refs, {
        numerator: count,
      });
    });
  };

  const resolutions = context.events.flatMap((event) => {
    if (event.type !== "model.execution-resolved" || !isRecord(event.payload.resolution)) return [];
    const resolution = event.payload.resolution;
    return identifier(resolution.invocationId) && identifier(resolution.runId) &&
      identifier(resolution.changeId) && changeIds.has(resolution.changeId) && runIds.has(resolution.runId)
      ? [{ resolution, event }]
      : [];
  });
  const costs = state.observations.filter((item): item is OperationalObservationStateV1 & { observation: ProviderCostObservationV1 } =>
    item.observation.contractType === "ProviderCostObservationV1" &&
    changeIds.has(item.observation.changeId) && runIds.has(item.observation.runId));
  let costEvidence = hasAuthority("provider-cost") ? resolutions.map(({ resolution, event }) => {
    const cost = costs.find((item) => item.observation.runId === resolution.runId &&
      item.observation.taskId === resolution.taskId && item.observation.attemptId === resolution.attemptId &&
      item.observation.invocationId === resolution.invocationId && item.observation.provider === resolution.providerId);
    const subjectRef = `provider-invocation:${resolution.invocationId}`;
    if (!cost) return metricEvidence(subjectRef, [eventRef(event)], {
      excluded: true,
      reasonCode: "EVIDENCE_INCOMPLETE",
    });
    return metricEvidence(subjectRef, [eventRef(event), ...operationalObservationRefs(cost)], {
      numerator: cost.observation.minorUnits,
      value: cost.observation.minorUnits,
    });
  }) : [];
  const currencies = [...new Set(costs.map((item) => item.observation.currency))].sort();
  if (currencies.length > 1) costEvidence = costEvidence.map((item) => metricEvidence(
    item.subjectRef,
    item.evidenceRefs,
    { excluded: true, reasonCode: "EVIDENCE_CONFLICT" },
  ));
  const currency = currencies.length === 1 ? currencies[0] : undefined;
  return {
    escapedDefects7Day: metric("escapedDefects7Day", escapedDefects(7), "rate"),
    escapedDefects30Day: metric("escapedDefects30Day", escapedDefects(30), "rate"),
    escapedDefects90Day: metric("escapedDefects90Day", escapedDefects(90), "rate"),
    deploymentFailureRate: metric("deploymentFailureRate", deploymentEvidence("failed"), "rate"),
    rollbackRate: metric("rollbackRate", deploymentEvidence("rolled-back"), "rate"),
    hotfixRate: metric("hotfixRate", deploymentEvidence("hotfix"), "rate"),
    productionReworkRate: metric("productionReworkRate", deploymentEvidence("production-rework"), "rate"),
    providerMonetaryCost: metric(
      "providerMonetaryCost",
      costEvidence,
      "sum",
      currency ? `${currency}:minor-units` : undefined,
    ),
  };
}

function unsupportedMetrics(includeOperational: boolean) {
  return (includeOperational
    ? STILL_UNSUPPORTED_OUTCOMES_V1
    : OUTCOME_SCORECARD_UNSUPPORTED_OUTCOMES_V1).map(
    ([outcomeClass, missingAuthority]) => ({
      outcomeClass,
      status: "unsupported" as const,
      reasonCode: "METRIC_UNSUPPORTED" as const,
      missingAuthority,
      evidenceRefs: ["contract:outcome-scorecards-v1:unsupported"],
    }),
  );
}

function completeness(
  metrics: Readonly<{
    delivery: OutcomeScorecardV1["metrics"]["delivery"];
    qualitySafety: OutcomeScorecardV1["metrics"]["qualitySafety"];
    operational?: NonNullable<OutcomeScorecardV1["metrics"]["operational"]>;
  }>,
) {
  const values: readonly OutcomeScorecardMetricV1[] = [
    metrics.delivery.firstPassAcceptanceRate,
    metrics.delivery.reviewCorrectionCycles,
    metrics.delivery.dispatchToAcceptedMs,
    metrics.delivery.tokensPerAcceptedTask,
    metrics.delivery.overrideRate,
    metrics.qualitySafety.humanEscalationRate,
    metrics.qualitySafety.haltRecurrenceRate,
    ...Object.values(metrics.operational ?? {}),
  ];
  return {
    complete: values.every((item) => item.status === "complete"),
    checks: values.map((item) => ({
      checkId: `metric:${item.metricId}` as `metric:${OutcomeScorecardMetricIdV1}`,
      status: item.status === "complete" ? "pass" as const : "insufficient-evidence" as const,
      reasonCodes:
        item.status === "complete"
          ? []
          : [item.denominator === 0 ? "DENOMINATOR_EMPTY" as const : "EVIDENCE_INCOMPLETE" as const],
    })),
  };
}

export class OutcomeScorecardServiceV1 {
  constructor(private readonly sources: OutcomeScorecardSourcesV1) {}

  private async project(selector: OutcomeScorecardSelectorV1) {
    try {
      const source = await this.sources.readProjectEvidence(selector.projectId);
      return { source, context: selectedContext(source, selector) };
    } catch (error) {
      if (error instanceof OutcomeScorecardErrorV1) throw error;
      fail("SOURCE_UNAVAILABLE", "The canonical project source is unavailable.");
    }
  }

  async discover(input: unknown): Promise<OutcomeScorecardDiscoveryV1> {
    const request = parseOutcomeScorecardDiscoveryRequestV1(input);
    const { source, context } = await this.project(request.selector);
    if (!sourceWatermarkMatches(request.sourceWatermark, source.watermark))
      fail("SOURCE_WATERMARK_CHANGED", "The project source watermark changed.");
    const runIds = new Set(
      context.bindings.map((binding) => String(binding.runId)).filter(identifier),
    );
    request.selector.runIds?.forEach((runId) => runIds.add(runId));
    if (runIds.size > OUTCOME_SCORECARD_LIMITS_V1.maxRuns)
      fail("COHORT_LIMIT_EXCEEDED", "Discovery exceeds the run limit.");
    const candidates: OutcomeScorecardDiscoveryV1["candidates"][number][] = [];
    const findings: OutcomeScorecardFindingV1[] = [];
    let observedTaskCount = 0;
    for (const runId of [...runIds].sort()) {
      let serialized: string | undefined;
      try {
        serialized = await this.sources.readRunRecord(runId);
      } catch {
        fail("SOURCE_UNAVAILABLE", "A canonical run source is unavailable.");
      }
      if (serialized === undefined) {
        findings.push(finding("RUN_NOT_FOUND", "run", `run:${runId}`));
        continue;
      }
      const identity = outcomeRunRecordIdentityV1(runId, serialized);
      const analyzed = analyzeRun(context, identity, parseRun(serialized, runId));
      observedTaskCount +=
        analyzed.observations.length + analyzed.excludedTasks.length;
      if (observedTaskCount > OUTCOME_SCORECARD_LIMITS_V1.maxTasks)
        fail("COHORT_LIMIT_EXCEEDED", "Discovery exceeds the task limit.");
      if (!analyzed.observations.length) {
        findings.push(finding("RUN_UNLINKED", "run", `run:${runId}`, [runRef(identity)]));
        continue;
      }
      candidates.push({
        identity,
        joinRefs: boundedRefs(
          analyzed.observations.flatMap((item) => item.included.evidenceRefs),
        ),
      });
    }
    if (findings.length > OUTCOME_SCORECARD_LIMITS_V1.maxDiagnostics)
      fail("COHORT_LIMIT_EXCEEDED", "Discovery exceeds the diagnostic limit.");
    const content: Omit<OutcomeScorecardDiscoveryV1, "discoveryHash"> = {
      contractType: "OutcomeScorecardDiscoveryV1",
      contractVersion: "1.0",
      policyVersion: OUTCOME_SCORECARD_POLICY_VERSION_V1,
      selector: request.selector,
      sourceWatermark: source.watermark,
      candidates,
      findings,
      privacy,
    };
    const result = { ...content, discoveryHash: discoveryHashV1(content) };
    assertOutcomeScorecardDiscoveryV1(result);
    return structuredClone(result);
  }

  async compute(input: unknown): Promise<OutcomeScorecardV1> {
    const request = parseOutcomeScorecardRequestV1(input);
    const { source, context } = await this.project(request.selector);
    if (!sourceWatermarkMatches(request.sourceWatermark, source.watermark))
      fail("SOURCE_WATERMARK_CHANGED", "The project source watermark changed.");
    const expected = new Map(request.runRecordIdentities.map((identity) => [identity.runId, identity]));
    const runIds = request.selector.runIds
      ? [...request.selector.runIds]
      : [...expected.keys()].sort();
    const includedRuns: OutcomeScorecardV1["cohort"]["includedRuns"][number][] = [];
    const excludedRuns: OutcomeScorecardFindingV1[] = [];
    const excludedTasks: OutcomeScorecardFindingV1[] = [];
    const observations: JoinedTaskObservationV1[] = [];
    for (const runId of runIds) {
      let serialized: string | undefined;
      try {
        serialized = await this.sources.readRunRecord(runId);
      } catch {
        fail("SOURCE_UNAVAILABLE", "A canonical run source is unavailable.");
      }
      if (serialized === undefined) {
        excludedRuns.push(finding("RUN_NOT_FOUND", "run", `run:${runId}`));
        continue;
      }
      const observedIdentity = outcomeRunRecordIdentityV1(runId, serialized);
      const expectedIdentity = expected.get(runId);
      if (!expectedIdentity)
        fail("COHORT_INVALID", "A present requested run lacks an exact identity binding.");
      if (
        expectedIdentity.algorithm !== observedIdentity.algorithm ||
        expectedIdentity.sha256 !== observedIdentity.sha256 ||
        expectedIdentity.byteLength !== observedIdentity.byteLength
      )
        fail("RUN_IDENTITY_CHANGED", "A canonical run-record identity changed.");
      const analyzed = analyzeRun(
        context,
        observedIdentity,
        parseRun(serialized, runId),
      );
      excludedTasks.push(...analyzed.excludedTasks);
      if (!analyzed.observations.length) {
        excludedRuns.push(finding("RUN_UNLINKED", "run", `run:${runId}`, [runRef(observedIdentity)]));
        continue;
      }
      includedRuns.push({
        identity: observedIdentity,
        evidenceRefs: boundedRefs(
          analyzed.observations.flatMap((item) => item.included.evidenceRefs),
        ),
      });
      observations.push(...analyzed.observations);
    }
    if (
      excludedRuns.length + excludedTasks.length >
      OUTCOME_SCORECARD_LIMITS_V1.maxDiagnostics
    )
      fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the diagnostic limit.");
    if (
      observations.length + excludedTasks.length >
      OUTCOME_SCORECARD_LIMITS_V1.maxTasks
    )
      fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the task limit.");
    const includedAttempts: IncludedAttemptV1[] = [];
    const excludedAttempts: OutcomeScorecardFindingV1[] = [];
    for (const observation of observations) {
      if (observation.executionAttempts === undefined) {
        excludedAttempts.push(
          finding("EVIDENCE_INCOMPLETE", "attempt", `attempts:${observation.included.taskRef}`, observation.included.evidenceRefs),
        );
        continue;
      }
      for (let ordinal = 1; ordinal <= observation.executionAttempts; ordinal += 1) {
        includedAttempts.push({
          attemptRef: `attempt:${observation.included.runId}:${observation.included.runTaskId}:${ordinal}`,
          taskRef: observation.included.taskRef,
          ordinal,
          evidenceRefs: observation.included.evidenceRefs,
        });
        if (includedAttempts.length > OUTCOME_SCORECARD_LIMITS_V1.maxAttempts)
          fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the attempt limit.");
      }
    }
    if (
      excludedRuns.length + excludedTasks.length + excludedAttempts.length >
      OUTCOME_SCORECARD_LIMITS_V1.maxDiagnostics
    )
      fail("COHORT_LIMIT_EXCEEDED", "The cohort exceeds the diagnostic limit.");
    const delivery = deliveryMetrics(context, observations);
    const qualitySafety = qualitySafetyMetrics(context);
    const includedTasks = observations.map((item) => item.included)
      .sort((left, right) => left.taskRef.localeCompare(right.taskRef));
    const operational = operationalMetrics(context, includedTasks);
    const metricGroups = { delivery, qualitySafety, ...(operational ? { operational } : {}) };
    const identities = includedRuns.map((item) => item.identity).sort((left, right) => left.runId.localeCompare(right.runId));
    const cohortIdentityInput = {
      policyVersion: OUTCOME_SCORECARD_POLICY_VERSION_V1,
      selector: request.selector,
      projectWatermark: source.watermark,
      runRecordIdentities: identities,
    };
    const findings = [
      ...excludedRuns,
      ...excludedTasks,
      ...excludedAttempts,
    ].sort(compareFindings);
    const content: Omit<OutcomeScorecardV1, "scorecardHash"> = {
      contractType: "OutcomeScorecardV1",
      contractVersion: "1.0",
      policyVersion: OUTCOME_SCORECARD_POLICY_VERSION_V1,
      selector: request.selector,
      cohortId: sha256(canonicalOutcomeScorecardJsonV1(cohortIdentityInput)),
      sourceWatermarks: { project: source.watermark, runs: identities },
      cohort: {
        includedRuns: includedRuns.sort((left, right) => left.identity.runId.localeCompare(right.identity.runId)),
        excludedRuns: excludedRuns.sort(compareFindings),
        includedTasks,
        excludedTasks: excludedTasks.sort(compareFindings),
        includedAttempts: includedAttempts.sort((left, right) => left.attemptRef.localeCompare(right.attemptRef)),
        excludedAttempts: excludedAttempts.sort(compareFindings),
      },
      metrics: {
        delivery,
        qualitySafety,
        ...(operational ? { operational } : {}),
        unsupported: unsupportedMetrics(Boolean(operational)),
      },
      findings,
      privacy,
      completeness: completeness(metricGroups),
    };
    const result: OutcomeScorecardV1 = { ...content, scorecardHash: scorecardHashV1(content) };
    validateOutcomeScorecardPrivacyV1(result);
    const responseBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
    if (responseBytes > OUTCOME_SCORECARD_LIMITS_V1.maxResponseBytes)
      fail("SCORECARD_TOO_LARGE", "The scorecard exceeds the response-size limit.");
    assertOutcomeScorecardV1(result);
    return structuredClone(result);
  }
}
