import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import haltsIncidentsV1Schema from "./schemas/halts-incidents-v1.schema.json";
import wardenV1Schema from "./schemas/warden-v1.schema.json";

export const HALT_CLASSES_V1 = [
  "deterministic_owned_recovery",
  "retryable_provider_or_process",
  "plan_or_target_drift",
  "acceptance_or_verification_failure",
  "dependency_or_readiness_failure",
  "scope_or_policy_violation",
  "ownership_or_state_ambiguity",
  "human_decision_required",
  "destructive_or_external_risk",
  "unknown",
] as const;

export const HALT_INCIDENT_EVENT_TYPES_V1 = [
  "halt.detected",
  "halt.classified",
  "halt.dispositioned",
  "halt.healing-started",
  "halt.recovered",
  "halt.escalated",
  "halt.quarantined",
  "incident.opened",
  "incident.halt-linked",
  "incident.investigating",
  "incident.healing",
  "incident.mitigated",
  "incident.resolved",
  "incident.reopened",
  "incident.escalated",
  "incident.correlation-superseded",
] as const;

export const WARDEN_EVENT_TYPES_V1 = [
  "warden.repair-lease-acquired",
  "warden.repair-lease-released",
  "warden.repair-lease-lost",
  "warden.verdict-recorded",
] as const;

export const WARDEN_DISPOSITIONS_V1 = [
  "allow_auto_heal",
  "allow_bounded_retry",
  "require_replan",
  "require_human",
  "quarantine",
] as const;

export const WARDEN_DENIAL_REASON_CODES_V1 = [
  "HALT_EVIDENCE_INVALID",
  "HALT_CLASS_UNKNOWN",
  "ATTRIBUTION_NOT_EXACT",
  "WARDEN_POLICY_UNKNOWN",
  "EVIDENCE_STALE",
  "SIDE_EFFECT_AMBIGUOUS",
  "RECIPE_NOT_ALLOWLISTED",
  "RECIPE_PRECONDITION_FAILED",
  "REPAIR_BUDGET_EXHAUSTED",
  "REPAIR_LEASE_LOST",
  "REPAIR_RESULT_AMBIGUOUS",
  "REPLAN_REQUIRED",
  "HUMAN_AUTHORITY_REQUIRED",
  "BLOCKING_INCIDENT_OPEN",
] as const;

const recipeCodeHash = (recipeId: string) =>
  createHash("sha256").update(`warden-recipe-v1\n${recipeId}\n1.0`).digest("hex");

const typedAdapterOracle = (oracleId: string) =>
  Object.freeze({ oracleId, kind: "typed_adapter" as const });

const registeredCommandOracle = (oracleId: string) =>
  Object.freeze({ oracleId, kind: "registered_command" as const });

export const WARDEN_REPAIR_RECIPES_V1 = [
  {
    recipeId: "provider-read-retry-v1",
    recipeVersion: "1.0",
    codeHash: recipeCodeHash("provider-read-retry-v1"),
    haltClass: "retryable_provider_or_process",
    disposition: "allow_bounded_retry",
    successOracle: typedAdapterOracle("oracle:provider-read-success-v1"),
    stopOracle: typedAdapterOracle("oracle:provider-read-stop-v1"),
  },
  {
    recipeId: "registered-process-retry-v1",
    recipeVersion: "1.0",
    codeHash: recipeCodeHash("registered-process-retry-v1"),
    haltClass: "retryable_provider_or_process",
    disposition: "allow_bounded_retry",
    successOracle: registeredCommandOracle("oracle:registered-process-success-v1"),
    stopOracle: registeredCommandOracle("oracle:registered-process-stop-v1"),
  },
  {
    recipeId: "workspace-reconcile-v1",
    recipeVersion: "1.0",
    codeHash: recipeCodeHash("workspace-reconcile-v1"),
    haltClass: "deterministic_owned_recovery",
    disposition: "allow_auto_heal",
    successOracle: typedAdapterOracle("oracle:workspace-reconcile-success-v1"),
    stopOracle: typedAdapterOracle("oracle:workspace-reconcile-stop-v1"),
  },
  {
    recipeId: "merge-safe-abort-resume-v1",
    recipeVersion: "1.0",
    codeHash: recipeCodeHash("merge-safe-abort-resume-v1"),
    haltClass: "deterministic_owned_recovery",
    disposition: "allow_auto_heal",
    successOracle: typedAdapterOracle("oracle:merge-safe-abort-resume-success-v1"),
    stopOracle: typedAdapterOracle("oracle:merge-safe-abort-resume-stop-v1"),
  },
  {
    recipeId: "owned-cleanup-retry-v1",
    recipeVersion: "1.0",
    codeHash: recipeCodeHash("owned-cleanup-retry-v1"),
    haltClass: "deterministic_owned_recovery",
    disposition: "allow_auto_heal",
    successOracle: typedAdapterOracle("oracle:owned-cleanup-success-v1"),
    stopOracle: typedAdapterOracle("oracle:owned-cleanup-stop-v1"),
  },
] as const;

export const WARDEN_POLICY_V1 = Object.freeze({
  policyVersion: "warden-policy-v1" as const,
  evidenceMaxAgeSeconds: 300,
  budgets: Object.freeze({ perHalt: 1, perIncident: 2, perProject: 4 }),
});

export const HALT_INCIDENT_REASON_CODES_V1 = [
  "HALT_EVIDENCE_INVALID",
  "HALT_CLASS_UNKNOWN",
  "ATTRIBUTION_NOT_EXACT",
  "INCIDENT_CORRELATION_AMBIGUOUS",
  "INCIDENT_NEW",
  "INCIDENT_MATCHED_OPEN",
  "INCIDENT_REOPENED",
  "INCIDENT_REOPEN_WINDOW_EXPIRED",
  "INCIDENT_POLICY_VERSION_MISMATCH",
  "WARDEN_POLICY_UNKNOWN",
  "EVIDENCE_STALE",
  "SIDE_EFFECT_AMBIGUOUS",
  "RECIPE_NOT_ALLOWLISTED",
  "RECIPE_PRECONDITION_FAILED",
  "REPAIR_BUDGET_EXHAUSTED",
  "REPAIR_LEASE_LOST",
  "REPAIR_RESULT_AMBIGUOUS",
  "REPLAN_REQUIRED",
  "HUMAN_AUTHORITY_REQUIRED",
  "BLOCKING_INCIDENT_OPEN",
  "WARDEN_AUTO_ACTION_ALLOWED",
] as const;

export type HaltClassV1 = (typeof HALT_CLASSES_V1)[number];
export type HaltIncidentEventTypeV1 =
  (typeof HALT_INCIDENT_EVENT_TYPES_V1)[number];
export type HaltIncidentReasonCodeV1 =
  (typeof HALT_INCIDENT_REASON_CODES_V1)[number];
export type WardenEventTypeV1 = (typeof WARDEN_EVENT_TYPES_V1)[number];
export type WardenDispositionV1 = (typeof WARDEN_DISPOSITIONS_V1)[number];
export type WardenDenialReasonCodeV1 =
  (typeof WARDEN_DENIAL_REASON_CODES_V1)[number];
export type HaltStateV1 =
  | "detected"
  | "classified"
  | "action_pending"
  | "healing"
  | "recovered"
  | "escalated"
  | "quarantined";
export type IncidentStateV1 =
  | "open"
  | "investigating"
  | "healing"
  | "mitigated"
  | "escalated"
  | "resolved"
  | "reopened";
export type SeverityV1 = "info" | "warning" | "blocking" | "critical";

export type HaltScopeV1 = Readonly<{
  waveId: string | null;
  taskId: string | null;
  attemptId: string | null;
  planRevision: number | null;
  runId: string | null;
  workspaceAttemptId: string | null;
  mergeRequestId: string | null;
  commitId: string | null;
}>;

export type AffectedEntityV1 = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string | null;
  taskId: string | null;
  operationKind: string;
  component: string;
}>;

export type HaltRecordV1 = Readonly<{
  contractType: "HaltRecordV1";
  contractVersion: "1.0";
  haltId: string;
  projectId: string;
  changeId: string;
  correlationId: string;
  scope: HaltScopeV1;
  detector: Readonly<{
    detectorId: string;
    detectorEventId: string;
    detectorCode: string;
  }>;
  occurredAt: string;
  publishedAt: string;
  observation: Readonly<{
    fingerprintVersion: "observation-v1";
    fingerprint: string;
    operationKind: string;
    component: string;
    normalizedFailureCode: string;
  }>;
  evidenceRefs: readonly string[];
  severity: SeverityV1;
  state: HaltStateV1;
  classificationAssessmentId?: string;
  haltClass?: HaltClassV1;
  effectiveIncidentId?: string;
  lastTransitionReasonCode?: HaltIncidentReasonCodeV1;
}>;

export type AttributionAssessmentV1 = Readonly<{
  contractType: "AttributionAssessmentV1";
  contractVersion: "1.0";
  assessmentId: string;
  haltId: string;
  projectId: string;
  changeId: string;
  scope: HaltScopeV1;
  haltClass: HaltClassV1;
  confidence: "exact" | "partial" | "none";
  affectedEntity: AffectedEntityV1;
  normalizedRootCauseKey: string;
  candidateCauses: readonly Readonly<{
    causeKey: string;
    evidenceRefs: readonly string[];
  }>[];
  alternativeCandidates: readonly Readonly<{
    causeKey: string;
    rejectionEvidenceRefs: readonly string[];
  }>[];
  evidence: Readonly<{
    detectorEvidenceRefs: readonly string[];
    declaredWriteSet: readonly string[];
    actualChangedPaths: readonly string[];
    gitEvidenceRefs: readonly string[];
    outcomeEvidenceRefs: readonly string[];
    sideEffectState: "none" | "committed" | "possible" | "unknown";
  }>;
  classifier: Readonly<{
    classifierId: string;
    method: "deterministic" | "human" | "llm_proposal_validated";
  }>;
  assessedAt: string;
  taxonomyPolicyVersion: "halt-taxonomy-v1";
}>;

export type IncidentResolutionReceiptV1 = Readonly<{
  contractType: "IncidentResolutionReceiptV1";
  contractVersion: "1.0";
  receiptId: string;
  incidentId: string;
  projectId: string;
  changeId: string;
  resolutionKind: "mitigated" | "resolved";
  oracle: Readonly<{
    kind: "executable" | "human";
    outcome: "passed";
    observationResult: string;
  }>;
  noActiveHealing: true;
  evidenceRefs: readonly string[];
  resolvedAt: string;
  resolvedBy: string;
  taxonomyPolicyVersion: "halt-taxonomy-v1";
  correlationWindowSeconds: number;
}>;

export type IncidentResolutionReceiptInputV1 = Omit<
  IncidentResolutionReceiptV1,
  "resolvedAt"
> &
  Readonly<{
    /** The ledger assigns the authoritative publication time when omitted. */
    resolvedAt?: string;
  }>;

export type IncidentRecordV1 = Readonly<{
  contractType: "IncidentRecordV1";
  contractVersion: "1.0";
  incidentId: string;
  projectId: string;
  changeId: string;
  incidentFingerprintVersion: "incident-v1";
  incidentFingerprint: string;
  taxonomyPolicyVersion: "halt-taxonomy-v1";
  firstOccurrenceAt: string;
  latestOccurrenceAt: string;
  haltIds: readonly string[];
  affectedEntities: readonly AffectedEntityV1[];
  severity: SeverityV1;
  ownerKind: "policy" | "human" | "unassigned";
  state: IncidentStateV1;
  correlationWindowPolicy: Readonly<{
    durationSeconds: number;
    reopenUntil: string | null;
  }>;
  reopenOrdinal: number;
  correlationReasonCode: HaltIncidentReasonCodeV1;
  openedAt: string;
  closureReceiptId?: string;
}>;

export type WardenRecipeIdentityV1 = Readonly<{
  recipeId: string;
  recipeVersion: string;
  codeHash: string;
}>;

export type WardenExecutableOracleV1 = Readonly<{
  oracleId: string;
  kind: "registered_command" | "typed_adapter";
  evidenceRefs: readonly string[];
}>;

export type WardenEvidenceSnapshotV1 = Readonly<{
  snapshotVersion: "warden-evidence-v1";
  snapshotHash: string;
  capturedAt: string;
  haltRecordHash: string;
  incidentRecordHash: string;
  attributionAssessmentHash: string;
  evidenceRefs: readonly string[];
  sideEffectState: AttributionAssessmentV1["evidence"]["sideEffectState"];
  preconditionsUnchanged: boolean;
  priorRepairResult: "none" | "unambiguous" | "ambiguous";
  quarantineReasonCodes: readonly WardenDenialReasonCodeV1[];
  successOracle: WardenExecutableOracleV1;
  stopOracle: WardenExecutableOracleV1;
}>;

export type WardenBudgetCountersV1 = Readonly<{
  halt: number;
  incident: number;
  project: number;
}>;

export type WardenBudgetSnapshotV1 = Readonly<{
  limits: WardenBudgetCountersV1;
  consumedBefore: WardenBudgetCountersV1;
  remainingAfter: WardenBudgetCountersV1;
}>;

export type RepairLeaseV1 = Readonly<{
  contractType: "RepairLeaseV1";
  contractVersion: "1.0";
  leaseId: string;
  projectId: string;
  incidentId: string;
  haltId: string;
  epoch: number;
  state: "active" | "released" | "lost";
  acquiredAt: string;
  acquiredBy: "policy:warden-v1";
  terminalAt?: string;
  terminalBy?: string;
  terminalEvidenceRefs?: readonly string[];
}>;

export type RepairLeaseReferenceV1 = Readonly<
  Pick<
    RepairLeaseV1,
    "leaseId" | "projectId" | "incidentId" | "haltId" | "epoch" | "acquiredAt"
  >
>;

export type WardenVerdictV1 = Readonly<{
  contractType: "WardenVerdictV1";
  contractVersion: "1.0";
  verdictId: string;
  projectId: string;
  changeId: string;
  haltId: string;
  incidentId: string;
  attributionAssessmentId: string;
  evidenceSnapshot: WardenEvidenceSnapshotV1;
  policyVersion: string;
  verdictOrdinal: number;
  requestedAction: "auto_heal" | "bounded_retry" | "none";
  disposition: WardenDispositionV1;
  reasonCode: WardenDenialReasonCodeV1 | null;
  recipe?: WardenRecipeIdentityV1;
  budgets: WardenBudgetSnapshotV1;
  repairLease?: RepairLeaseReferenceV1;
  idempotencyKey?: string;
  supersedesVerdictId: string | null;
  evaluatedAt: string;
  evaluatedBy: "policy:warden-v1";
}>;

type WardenEventEnvelopeV1<
  T extends WardenEventTypeV1,
  P extends Readonly<Record<string, unknown>>,
> = Readonly<{
  id: string;
  sequence: number;
  type: T;
  occurredAt: string;
  projectId: string;
  changeId: string;
  waveId?: string;
  taskId?: string;
  actor: string;
  causationId: string;
  correlationId: string;
  payload: P;
  previousHash: string | null;
  hash: string;
}>;

export type WardenRepairLeaseAcquiredEventV1 = WardenEventEnvelopeV1<
  "warden.repair-lease-acquired",
  Readonly<{ lease: RepairLeaseV1 }>
>;
export type WardenRepairLeaseTransitionEventV1 = WardenEventEnvelopeV1<
  "warden.repair-lease-released" | "warden.repair-lease-lost",
  Readonly<{
    haltId: string;
    incidentId: string;
    leaseId: string;
    leaseEpoch: number;
    previousState: "active";
    state: "released" | "lost";
    evidenceRefs: readonly string[];
  }>
>;
export type WardenVerdictRecordedEventV1 = WardenEventEnvelopeV1<
  "warden.verdict-recorded",
  Readonly<{ verdict: WardenVerdictV1 }>
>;
export type WardenEventV1 =
  | WardenRepairLeaseAcquiredEventV1
  | WardenRepairLeaseTransitionEventV1
  | WardenVerdictRecordedEventV1;

export type WardenProjectionV1 = Readonly<{
  projectId: string;
  verdicts: readonly WardenVerdictV1[];
  activeVerdicts: readonly WardenVerdictV1[];
  leases: readonly RepairLeaseV1[];
  events: readonly WardenEventV1[];
}>;

export type EvaluateWardenVerdictInputV1 = Readonly<{
  verdictId: string;
  policyVersion: string;
  verdictOrdinal: number;
  requestedAction: "auto_heal" | "bounded_retry" | "none";
  evidenceSnapshot: WardenEvidenceSnapshotV1;
  recipe?: WardenRecipeIdentityV1;
  idempotencyKey?: string;
  lease?: Readonly<{ leaseId: string; expectedEpoch: number }>;
}>;

export type TransitionWardenRepairLeaseInputV1 = Readonly<{
  leaseId: string;
  leaseEpoch: number;
  to: "released" | "lost";
  actor: string;
  evidenceRefs: readonly string[];
  verdictId?: string;
}>;

export type WardenAggregateV1 = Readonly<{
  verdict: WardenVerdictV1;
  halt: HaltRecordV1;
  incident: IncidentRecordV1;
  lease?: RepairLeaseV1;
  verdictHistory: readonly WardenVerdictV1[];
  events: readonly WardenEventV1[];
}>;

type HaltIncidentEventEnvelopeV1<
  T extends HaltIncidentEventTypeV1,
  P extends Readonly<Record<string, unknown>>,
> = Readonly<{
  id: string;
  sequence: number;
  type: T;
  occurredAt: string;
  projectId: string;
  changeId: string;
  waveId?: string;
  taskId?: string;
  actor: string;
  causationId: string;
  correlationId: string;
  payload: P;
  previousHash: string | null;
  hash: string;
}>;

export type HaltDetectedEventV1 = HaltIncidentEventEnvelopeV1<
  "halt.detected",
  Readonly<{ halt: HaltRecordV1 }>
>;
export type HaltClassifiedEventV1 = HaltIncidentEventEnvelopeV1<
  "halt.classified",
  Readonly<{
    haltId: string;
    assessment: AttributionAssessmentV1;
    incidentId: string;
    previousState: "detected";
    state: "classified";
  }>
>;
export type HaltTransitionEventV1 = HaltIncidentEventEnvelopeV1<
  | "halt.dispositioned"
  | "halt.healing-started"
  | "halt.recovered"
  | "halt.escalated"
  | "halt.quarantined",
  Readonly<{
    haltId: string;
    previousState: HaltStateV1;
    state: HaltStateV1;
    reasonCode: HaltIncidentReasonCodeV1;
    evidenceRefs: readonly string[];
  }>
>;
export type IncidentOpenedEventV1 = HaltIncidentEventEnvelopeV1<
  "incident.opened",
  Readonly<{ incident: IncidentRecordV1 }>
>;
export type IncidentHaltLinkedEventV1 = HaltIncidentEventEnvelopeV1<
  "incident.halt-linked",
  Readonly<{
    haltId: string;
    incidentId: string;
    incidentFingerprint: string;
    reasonCode: "INCIDENT_MATCHED_OPEN" | "INCIDENT_REOPENED";
  }>
>;
export type IncidentTransitionEventV1 = HaltIncidentEventEnvelopeV1<
  | "incident.investigating"
  | "incident.healing"
  | "incident.escalated",
  Readonly<{
    incidentId: string;
    previousState: IncidentStateV1;
    state: IncidentStateV1;
    reasonCode: HaltIncidentReasonCodeV1;
    evidenceRefs: readonly string[];
  }>
>;
export type IncidentMitigatedEventV1 = HaltIncidentEventEnvelopeV1<
  "incident.mitigated",
  Readonly<{
    incidentId: string;
    previousState: IncidentStateV1;
    state: "mitigated";
    reasonCode: HaltIncidentReasonCodeV1;
    evidenceRefs: readonly string[];
    receipt: IncidentResolutionReceiptV1;
  }>
>;
export type IncidentResolvedEventV1 = HaltIncidentEventEnvelopeV1<
  "incident.resolved",
  Readonly<{
    receipt: IncidentResolutionReceiptV1;
    previousState: "mitigated" | "escalated";
    state: "resolved";
    reopenUntil: string;
  }>
>;
export type IncidentReopenedEventV1 = HaltIncidentEventEnvelopeV1<
  "incident.reopened",
  Readonly<{
    haltId: string;
    incidentId: string;
    previousState: "mitigated" | "resolved";
    state: "reopened";
    reopenOrdinal: number;
    reopenUntil: string | null;
    reasonCode: "INCIDENT_REOPENED";
  }>
>;
export type IncidentCorrelationSupersededEventV1 =
  HaltIncidentEventEnvelopeV1<
    "incident.correlation-superseded",
    Readonly<{
      correctionId: string;
      haltId: string;
      previousIncidentId: string;
      incidentId: string;
      correctedAt: string;
      correctedBy: string;
      reason: string;
      evidenceRefs: readonly string[];
    }>
  >;

export type HaltIncidentEventV1 =
  | HaltDetectedEventV1
  | HaltClassifiedEventV1
  | HaltTransitionEventV1
  | IncidentOpenedEventV1
  | IncidentHaltLinkedEventV1
  | IncidentTransitionEventV1
  | IncidentMitigatedEventV1
  | IncidentResolvedEventV1
  | IncidentReopenedEventV1
  | IncidentCorrelationSupersededEventV1;

export type HaltIncidentProjectionV1 = Readonly<{
  projectId: string;
  halts: readonly HaltRecordV1[];
  incidents: readonly IncidentRecordV1[];
  assessments: readonly AttributionAssessmentV1[];
  resolutionReceipts: readonly IncidentResolutionReceiptV1[];
  correlationHistory: readonly Readonly<{
    correctionId: string;
    haltId: string;
    previousIncidentId: string;
    incidentId: string;
    correctedAt: string;
    correctedBy: string;
    reason: string;
    evidenceRefs: readonly string[];
  }>[];
  events: readonly HaltIncidentEventV1[];
}>;

export type DetectAndClassifyHaltInputV1 = Readonly<{
  halt: HaltRecordV1;
  assessment: AttributionAssessmentV1;
  correlationWindowSeconds?: number;
}>;

export type TransitionHaltInputV1 = Readonly<{
  to: "escalated" | "quarantined";
  actor: string;
  reasonCode: HaltIncidentReasonCodeV1;
  evidenceRefs: readonly string[];
  causationId?: string;
  correlationId?: string;
}>;

export type TransitionIncidentInputV1 = Readonly<{
  to: "investigating" | "mitigated" | "escalated";
  actor: string;
  reasonCode: HaltIncidentReasonCodeV1;
  evidenceRefs: readonly string[];
  receipt?: IncidentResolutionReceiptV1;
  causationId?: string;
  correlationId?: string;
}>;

export type ResolveIncidentInputV1 = Readonly<{
  receipt: IncidentResolutionReceiptInputV1;
  causationId?: string;
  correlationId?: string;
}>;

export type CorrectIncidentCorrelationInputV1 = Readonly<{
  correctionId: string;
  incidentId: string;
  actor: string;
  /** @deprecated Publication time is assigned by the canonical ledger clock. */
  correctedAt?: string;
  reason: string;
  evidenceRefs: readonly string[];
  causationId?: string;
  correlationId?: string;
}>;

export type HaltIncidentAggregateV1 = Readonly<{
  halt: HaltRecordV1;
  incident: IncidentRecordV1;
  assessment: AttributionAssessmentV1;
  events: readonly HaltIncidentEventV1[];
}>;

const validator = new Ajv2020({
  allErrors: true,
  strict: true,
}).compile(haltsIncidentsV1Schema);
const wardenValidator = new Ajv2020({
  allErrors: true,
  strict: true,
}).compile(wardenV1Schema);

type ContractByTypeV1 = {
  HaltRecordV1: HaltRecordV1;
  IncidentRecordV1: IncidentRecordV1;
  AttributionAssessmentV1: AttributionAssessmentV1;
  IncidentResolutionReceiptV1: IncidentResolutionReceiptV1;
};

export function assertHaltIncidentContractV1<
  T extends keyof ContractByTypeV1,
>(
  value: unknown,
  expectedType: T,
): asserts value is ContractByTypeV1[T] {
  if (
    !validator(value) ||
    (value as { contractType?: unknown } | null)?.contractType !== expectedType
  ) {
    const detail =
      validator.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ") ?? "unknown validation error";
    throw new Error(
      `${expectedType} does not satisfy Halts and Incidents Contract v1: ${detail}`,
    );
  }
}

type WardenContractByTypeV1 = {
  WardenVerdictV1: WardenVerdictV1;
  RepairLeaseV1: RepairLeaseV1;
};

export function assertWardenContractV1<T extends keyof WardenContractByTypeV1>(
  value: unknown,
  expectedType: T,
): asserts value is WardenContractByTypeV1[T] {
  if (
    !wardenValidator(value) ||
    (value as { contractType?: unknown } | null)?.contractType !== expectedType
  ) {
    const detail =
      wardenValidator.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ") ?? "unknown validation error";
    throw new Error(
      `${expectedType} does not satisfy Warden Contract v1: ${detail}`,
    );
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function versionedHash(version: string, value: unknown) {
  return createHash("sha256")
    .update(`${version}\n${canonicalJson(value)}`)
    .digest("hex");
}

export function wardenContractHashV1(value: unknown) {
  return versionedHash("warden-contract-v1", value);
}

export function wardenEvidenceSnapshotHashV1(
  snapshot: Omit<WardenEvidenceSnapshotV1, "snapshotHash">,
) {
  return versionedHash("warden-evidence-v1", snapshot);
}

export function observationFingerprintV1(
  halt: Pick<
    HaltRecordV1,
    "projectId" | "changeId" | "scope" | "detector" | "observation"
  >,
) {
  return versionedHash("observation-v1", {
    projectId: halt.projectId,
    changeId: halt.changeId,
    waveId: halt.scope.waveId,
    taskId: halt.scope.taskId,
    detectorCode: halt.detector.detectorCode,
    operationKind: halt.observation.operationKind,
    component: halt.observation.component,
    normalizedFailureCode: halt.observation.normalizedFailureCode,
  });
}

export function incidentFingerprintV1(
  assessment: Pick<
    AttributionAssessmentV1,
    | "projectId"
    | "haltClass"
    | "affectedEntity"
    | "normalizedRootCauseKey"
    | "taxonomyPolicyVersion"
  >,
) {
  return versionedHash("incident-v1", {
    projectId: assessment.projectId,
    haltClass: assessment.haltClass,
    affectedEntity: assessment.affectedEntity,
    normalizedRootCauseKey: assessment.normalizedRootCauseKey,
    taxonomyPolicyVersion: assessment.taxonomyPolicyVersion,
  });
}
