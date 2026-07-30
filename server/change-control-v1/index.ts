import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv8/dist/2020.js";
import planningDriftV1Schema from "./schemas/planning-drift-v1.schema.json";

export const CHANGE_CONTROL_EVENT_TYPES = [
  "change.created",
  "change.planned",
  "change.activated",
  "change.completed",
  "change.cancelled",
  "wave.created",
  "wave.readied",
  "wave.dispatched",
  "wave.dispatch-overridden",
  "wave.started",
  "wave.completed",
  "wave.halted",
  "task.created",
  "task.readied",
  "task.started",
  "task.accepted",
  "task.failed",
  "task.halted",
  "plan.proposed",
  "plan.authorized",
  "plan.rejected",
  "plan.drift-assessed",
  "plan.marked-stale",
  "plan.superseded",
  "plan.dispatch-validated",
  "architect.replan-recorded",
] as const;

export type ChangeControlEventType =
  (typeof CHANGE_CONTROL_EVENT_TYPES)[number];
export type ChangeStatus =
  | "draft"
  | "planned"
  | "active"
  | "completed"
  | "cancelled";
export type WaveStatus =
  | "draft"
  | "ready"
  | "dispatched"
  | "running"
  | "completed"
  | "halted";
export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "accepted"
  | "failed"
  | "halted";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type PlanReferenceV1 = Readonly<{
  planId: string;
  revision: number;
  planBaseSha: string;
}>;

export type PlanningContractV1 = Readonly<{
  contractType: "PlanningContractV1";
  contractVersion: "1.0";
  planId: string;
  revision: number;
  projectId: string;
  changeId: string;
  waveId: string;
  predecessor?: PlanReferenceV1 | null;
  planBase: Readonly<{
    repositoryId: string;
    sha: string;
    hashAlgorithm: "sha1" | "sha256";
    ref?: string;
    capturedAt: string;
    worktreeState: "clean";
  }>;
  taskPlans: readonly Readonly<{
    taskId: string;
    acceptanceClaims: readonly Readonly<{
      claimId: string;
      observableOutcome: string;
      oracle: Readonly<{
        kind: "command" | "artifact" | "state_transition" | "human_observation";
        instruction: string;
      }>;
      expectedEvidence: readonly Readonly<{
        kind: "command_exit" | "artifact" | "diff" | "state" | "human_observation";
        description: string;
        locator?: string;
      }>[];
      failureSeverity: "blocking" | "warning";
    }>[];
    blastRadius: Readonly<{
      declaredWriteSet: readonly Readonly<{
        path: string;
        mode: "create" | "modify" | "delete";
        evidenceRefs: readonly string[];
      }>[];
      dependencyImpacts: readonly PlanningImpactV1[];
      publicApiChanges: readonly PlanningImpactV1[];
      schemaMigrationEffects: readonly PlanningImpactV1[];
      externalSideEffects: readonly PlanningImpactV1[];
      impactedTests: readonly PlanningImpactV1[];
      assessmentEvidenceRefs: readonly string[];
    }>;
  }>[];
  replanTriggers: readonly (
    | "base_sha_changed"
    | "write_set_overlap"
    | "dependency_changed"
    | "acceptance_oracle_changed"
    | "policy_changed"
    | "unknown_drift"
  )[];
  createdAt: string;
  createdBy: string;
  authorizationRequired: true;
}>;

export type PlanningImpactV1 = Readonly<{
  description: string;
  evidenceRefs: readonly string[];
}>;

export type PlanAuthorizationV1 = Readonly<{
  contractType: "PlanAuthorizationV1";
  contractVersion: "1.0";
  authorizationId: string;
  projectId: string;
  changeId: string;
  waveId: string;
  plan: PlanReferenceV1;
  decision: "authorized" | "rejected";
  reason: string;
  decidedAt: string;
  decidedBy: string;
}>;

export type ArchitectReplanReceiptV1 = Readonly<{
  contractType: "ArchitectReplanReceiptV1";
  contractVersion: "1.0";
  receiptId: string;
  projectId: string;
  changeId: string;
  waveId: string;
  driftAssessmentId: string;
  priorPlan: PlanReferenceV1;
  replacementPlan: PlanReferenceV1;
  changes: readonly Readonly<{
    area: "base" | "scope" | "dependencies" | "acceptance" | "policy";
    summary: string;
    rationale: string;
    evidenceRefs: readonly string[];
  }>[];
  proposedAt: string;
  proposedBy: string;
  authorizationState: "pending";
}>;

export type ReplanTriggerV1 = PlanningContractV1["replanTriggers"][number];

export type TrustedRepositorySnapshotV1 = Readonly<{
  repositoryId: string;
  sha: string;
  hashAlgorithm: "sha1" | "sha256";
  ref: string;
  worktreeState: "clean" | "dirty";
  changedPaths: readonly string[];
  triggeredReplanTriggers?: readonly ReplanTriggerV1[];
  unknownDrift?: boolean;
}>;

export type DriftAssessmentV1 = Readonly<{
  contractType: "DriftAssessmentV1";
  contractVersion: "1.0";
  assessmentId: string;
  plan: PlanReferenceV1;
  observedBase: Readonly<{
    repositoryId: string;
    sha: string;
    hashAlgorithm: "sha1" | "sha256";
    ref?: string;
    capturedAt: string;
    worktreeState: "clean" | "dirty";
  }>;
  status: "fresh" | "stale";
  reasons: readonly Readonly<{
    code:
      | "BASE_SHA_MISMATCH"
      | "WRITE_SET_OVERLAP"
      | "DEPENDENCY_DRIFT"
      | "ACCEPTANCE_ORACLE_DRIFT"
      | "POLICY_DRIFT"
      | "WORKTREE_DIRTY"
      | "UNKNOWN_DRIFT";
    description: string;
    evidenceRefs: readonly string[];
  }>[];
  changedPaths: readonly string[];
  evidenceRefs: readonly string[];
  requiresReplan: boolean;
  assessedAt: string;
  assessedBy: string;
}>;

export type DispatchGateReasonV1 =
  | "PLAN_REQUIRED"
  | "PLAN_CONTRACT_INVALID"
  | "PLAN_NOT_AUTHORIZED"
  | "CURRENT_BASE_UNREADABLE"
  | "CURRENT_WORKTREE_DIRTY"
  | "PLAN_BASE_MISMATCH"
  | "PLAN_STALE"
  | "ACCEPTANCE_ORACLE_UNEXECUTABLE"
  | "BLAST_RADIUS_UNEVIDENCED"
  | "REPLAN_RECEIPT_REQUIRED"
  | "WAVE_NOT_READY";

export type DispatchGateReceiptV1 = Readonly<{
  contractType: "DispatchGateReceiptV1";
  contractVersion: "1.0";
  receiptId: string;
  projectId: string;
  changeId: string;
  waveId: string;
  plan?: PlanReferenceV1;
  authorizationId?: string;
  driftAssessmentId?: string;
  result: "allowed" | "rejected";
  reasons: readonly DispatchGateReasonV1[];
  evaluatedAt: string;
  evaluatedBy: string;
}>;

export type ChangeControlEvent = Readonly<{
  id: string;
  sequence: number;
  type: ChangeControlEventType;
  occurredAt: string;
  projectId: string;
  changeId: string;
  waveId?: string;
  taskId?: string;
  actor: string;
  causationId: string;
  correlationId: string;
  payload: Readonly<JsonObject>;
  previousHash: string | null;
  hash: string;
}>;

export type PlanningContractProposedEvent = ChangeControlEvent &
  Readonly<{
    type: "plan.proposed";
    waveId: string;
    payload: Readonly<{ contract: PlanningContractV1 }>;
  }>;

export type PlanAuthorizationEvent = ChangeControlEvent &
  Readonly<{
    type: "plan.authorized" | "plan.rejected";
    waveId: string;
    payload: Readonly<{ authorization: PlanAuthorizationV1 }>;
  }>;

export type ArchitectReplanRecordedEvent = ChangeControlEvent &
  Readonly<{
    type: "architect.replan-recorded";
    waveId: string;
    payload: Readonly<{ receipt: ArchitectReplanReceiptV1 }>;
  }>;

export type PlanSupersededEvent = ChangeControlEvent &
  Readonly<{
    type: "plan.superseded";
    waveId: string;
    payload: Readonly<{
      priorPlan: PlanReferenceV1;
      replacementPlan: PlanReferenceV1;
    }>;
  }>;

export type DriftAssessmentEvent = ChangeControlEvent &
  Readonly<{
    type: "plan.drift-assessed" | "plan.marked-stale";
    waveId: string;
    payload: Readonly<{ assessment: DriftAssessmentV1 }>;
  }>;

export type DispatchGateEvaluatedEvent = ChangeControlEvent &
  Readonly<{
    type: "plan.dispatch-validated";
    waveId: string;
    payload: Readonly<{ receipt: DispatchGateReceiptV1 }>;
  }>;

export type PlanningChangeControlEvent =
  | PlanningContractProposedEvent
  | PlanAuthorizationEvent
  | PlanSupersededEvent
  | DriftAssessmentEvent
  | DispatchGateEvaluatedEvent
  | ArchitectReplanRecordedEvent;

export type PlanPublicationStatus =
  | "proposed"
  | "authorized"
  | "rejected"
  | "stale"
  | "dispatched"
  | "superseded";

export type PlanningPlanProjection = Readonly<{
  contract: PlanningContractV1;
  status: PlanPublicationStatus;
  sequence: number;
  updatedSequence: number;
  proposedEventId: string;
  authorization?: PlanAuthorizationV1;
}>;

export type WavePlanningProjectionV1 = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  plans: readonly PlanningPlanProjection[];
  authorizations: readonly PlanAuthorizationV1[];
  driftAssessments: readonly DriftAssessmentV1[];
  dispatchGateReceipts: readonly DispatchGateReceiptV1[];
  replanReceipts: readonly ArchitectReplanReceiptV1[];
  events: readonly PlanningChangeControlEvent[];
}>;

export type ChangeProjection = Readonly<{
  projectId: string;
  changeId: string;
  status: ChangeStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastActor: string;
  details: Readonly<JsonObject>;
}>;

export type ChangeAggregate = Readonly<{
  change: ChangeProjection;
  events: readonly ChangeControlEvent[];
}>;

export type WaveDependencyReadinessReason = Readonly<{
  code: "WAVE_DEPENDENCY_NOT_COMPLETED";
  dependencyWaveId: string;
  status: WaveStatus;
}>;

export type WaveReadinessReason =
  | WaveDependencyReadinessReason
  | Readonly<{ code: "NO_READY_TASKS" }>;

export type DispatchReadinessReason =
  | Readonly<{ code: "WAVE_STATUS_NOT_READY"; status: WaveStatus }>
  | WaveReadinessReason;

export type TaskProjection = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  status: TaskStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastActor: string;
  dependsOn: readonly string[];
  details: Readonly<JsonObject>;
}>;

export type WaveProjection = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  status: WaveStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastActor: string;
  dependsOn: readonly string[];
  details: Readonly<JsonObject>;
  tasks: readonly TaskProjection[];
  readiness: Readonly<{
    ready: boolean;
    reasons: readonly WaveReadinessReason[];
  }>;
}>;

export type WaveAggregate = Readonly<{
  wave: WaveProjection;
  events: readonly ChangeControlEvent[];
}>;

export type ExecutionBucketItem = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  readyAt: string;
  readySequence: number;
}>;

type Ledger = {
  version: 1;
  projectId: string;
  events: ChangeControlEvent[];
};

type EventDraft = Omit<
  ChangeControlEvent,
  "sequence" | "previousHash" | "hash"
>;

export class ChangeControlError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "CONFLICT"
      | "NOT_READY"
      | "CORRUPT_LEDGER",
    readonly status: 400 | 404 | 409 | 500,
    readonly reasons?: readonly (
      | DispatchReadinessReason
      | DispatchGateReasonV1
    )[],
  ) {
    super(message);
    this.name = "ChangeControlError";
  }
}

export type CreateChangeInput = {
  changeId?: string;
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type TransitionChangeInput = {
  to: ChangeStatus;
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type CreateTaskInput = {
  taskId: string;
  dependsOn?: string[];
  payload?: JsonObject;
};

export type CreateWaveInput = {
  waveId?: string;
  actor: string;
  dependsOn?: string[];
  tasks: CreateTaskInput[];
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type TransitionWaveInput = {
  to: "running" | "completed" | "halted";
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type TransitionTaskInput = {
  to: "running" | "accepted" | "failed" | "halted";
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type DispatchWaveInput = {
  actor: string;
  sendAnyway?: boolean;
  reason?: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type PublishPlanningContractInput = Readonly<{
  contract: PlanningContractV1;
  causationId?: string;
  correlationId?: string;
}>;

export type PublishPlanAuthorizationInput = Readonly<{
  authorization: PlanAuthorizationV1;
  causationId?: string;
  correlationId?: string;
}>;

export type PublishArchitectReplanReceiptInput = Readonly<{
  receipt: ArchitectReplanReceiptV1;
  causationId?: string;
  correlationId?: string;
}>;

export type ChangeControlStoreOptions = {
  now?: () => string;
  createId?: () => string;
  resolveRepositorySnapshot?: (
    projectId: string,
  ) => Promise<TrustedRepositorySnapshotV1>;
};

const eventTypeSet = new Set<string>(CHANGE_CONTROL_EVENT_TYPES);
const changeEventTypes = new Set<ChangeControlEventType>([
  "change.created",
  "change.planned",
  "change.activated",
  "change.completed",
  "change.cancelled",
]);
const waveEventTypes = new Set<ChangeControlEventType>([
  "wave.created",
  "wave.readied",
  "wave.dispatched",
  "wave.dispatch-overridden",
  "wave.started",
  "wave.completed",
  "wave.halted",
]);
const planningEventTypes = new Set<ChangeControlEventType>([
  "plan.proposed",
  "plan.authorized",
  "plan.rejected",
  "plan.drift-assessed",
  "plan.marked-stale",
  "plan.superseded",
  "plan.dispatch-validated",
  "architect.replan-recorded",
]);
const changeTargetForType = {
  "change.created": "draft",
  "change.planned": "planned",
  "change.activated": "active",
  "change.completed": "completed",
  "change.cancelled": "cancelled",
} as const;
const typeForTarget: Record<Exclude<ChangeStatus, "draft">, ChangeControlEventType> = {
  planned: "change.planned",
  active: "change.activated",
  completed: "change.completed",
  cancelled: "change.cancelled",
};
const legalTargets: Record<ChangeStatus, readonly ChangeStatus[]> = {
  draft: ["planned"],
  planned: ["active"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
const waveTargetForType = {
  "wave.created": "draft",
  "wave.readied": "ready",
  "wave.dispatched": "dispatched",
  "wave.dispatch-overridden": "dispatched",
  "wave.started": "running",
  "wave.completed": "completed",
  "wave.halted": "halted",
} as const;
const waveTypeForTarget: Record<
  TransitionWaveInput["to"],
  ChangeControlEventType
> = {
  running: "wave.started",
  completed: "wave.completed",
  halted: "wave.halted",
};
const legalWaveTargets: Record<WaveStatus, readonly WaveStatus[]> = {
  draft: ["ready"],
  ready: ["dispatched"],
  dispatched: ["running"],
  running: ["completed", "halted"],
  completed: [],
  halted: [],
};
const taskTargetForType = {
  "task.created": "pending",
  "task.readied": "ready",
  "task.started": "running",
  "task.accepted": "accepted",
  "task.failed": "failed",
  "task.halted": "halted",
} as const;
const taskTypeForTarget: Record<
  TransitionTaskInput["to"],
  ChangeControlEventType
> = {
  running: "task.started",
  accepted: "task.accepted",
  failed: "task.failed",
  halted: "task.halted",
};
const legalTaskTargets: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["ready"],
  ready: ["running"],
  running: ["accepted", "failed", "halted"],
  accepted: [],
  failed: [],
  halted: [],
};
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function invalid(message: string): never {
  throw new ChangeControlError(message, "INVALID_INPUT", 400);
}

function corrupt(message: string): never {
  throw new ChangeControlError(message, "CORRUPT_LEDGER", 500);
}

function requireIdentifier(value: unknown, field: string) {
  if (typeof value !== "string" || !identifierPattern.test(value))
    invalid(
      `${field} must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.`,
    );
  return value;
}

function requireIdentity(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > 256
  )
    invalid(`${field} must be a non-empty string of at most 256 characters.`);
  return value;
}

function normalizeJson(value: unknown, path = "payload"): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  )
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(`${path} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => normalizeJson(item, `${path}[${index}]`));
  if (typeof value !== "object") invalid(`${path} must contain only JSON values.`);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    invalid(`${path} must contain only plain JSON objects.`);
  const result = Object.create(null) as JsonObject;
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) invalid(`${path}.${key} cannot be undefined.`);
    result[key] = normalizeJson(item, `${path}.${key}`);
  }
  return result;
}

function normalizePayload(value: unknown): JsonObject {
  const normalized = normalizeJson(value ?? {});
  if (
    normalized === null ||
    Array.isArray(normalized) ||
    typeof normalized !== "object"
  )
    invalid("payload must be a JSON object.");
  return normalized;
}

type PlanningContractType =
  | PlanningContractV1["contractType"]
  | DriftAssessmentV1["contractType"]
  | PlanAuthorizationV1["contractType"]
  | ArchitectReplanReceiptV1["contractType"]
  | DispatchGateReceiptV1["contractType"];

type PlanningContractByType = {
  PlanningContractV1: PlanningContractV1;
  DriftAssessmentV1: DriftAssessmentV1;
  PlanAuthorizationV1: PlanAuthorizationV1;
  ArchitectReplanReceiptV1: ArchitectReplanReceiptV1;
  DispatchGateReceiptV1: DispatchGateReceiptV1;
};

const planningContractAjv = new Ajv2020({ allErrors: true, strict: true });
const validatePlanningDriftContract =
  planningContractAjv.compile(planningDriftV1Schema);

function validatePlanningContractSchema<T extends PlanningContractType>(
  value: unknown,
  expectedType: T,
  stored: boolean,
): PlanningContractByType[T] {
  const valid =
    validatePlanningDriftContract(value) &&
    (value as { contractType?: unknown }).contractType === expectedType;
  if (!valid) {
    const details = planningContractAjv.errorsText(
      validatePlanningDriftContract.errors,
      { separator: "; " },
    );
    if (stored)
      corrupt(
        `A persisted ${expectedType} contract is invalid${
          details ? `: ${details}` : "."
        }`,
      );
    invalid(
      `${expectedType} does not satisfy Planning and Drift Contract v1${
        details ? `: ${details}` : "."
      }`,
    );
  }
  return value as PlanningContractByType[T];
}

function normalizePlanningContract<T extends PlanningContractType>(
  value: unknown,
  expectedType: T,
): PlanningContractByType[T] {
  const normalized = normalizeJson(value, expectedType);
  if (
    normalized === null ||
    Array.isArray(normalized) ||
    typeof normalized !== "object"
  )
    invalid(`${expectedType} must be a JSON object.`);
  return validatePlanningContractSchema(normalized, expectedType, false);
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function eventHash(event: Omit<ChangeControlEvent, "hash">) {
  return createHash("sha256")
    .update(canonicalJson(event as unknown as JsonObject))
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

function requireTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    corrupt("An event has an invalid occurredAt timestamp.");
  return value;
}

function requireStoredIdentity(value: unknown, field: string) {
  try {
    return requireIdentity(value, field);
  } catch {
    return corrupt(`An event has an invalid ${field}.`);
  }
}

function requireStoredIdentifier(value: unknown, field: string) {
  try {
    return requireIdentifier(value, field);
  } catch {
    return corrupt(`An event has an invalid ${field}.`);
  }
}

type StoredWaveProjection = Omit<WaveProjection, "tasks" | "readiness">;
type ProjectedLedger = {
  projections: Map<string, ChangeProjection>;
  waves: Map<string, StoredWaveProjection>;
  tasks: Map<string, TaskProjection>;
  plans: Map<string, PlanningPlanProjection>;
  planKeysByRevision: Map<string, string>;
  authorizations: Map<string, PlanAuthorizationV1>;
  driftAssessments: Map<string, DriftAssessmentV1>;
  dispatchGateReceipts: Map<string, DispatchGateReceiptV1>;
  replanReceipts: Map<string, ArchitectReplanReceiptV1>;
  taskCreatedSequences: Map<string, number>;
  eventsByChange: Map<string, ChangeControlEvent[]>;
  eventsByWave: Map<string, ChangeControlEvent[]>;
  planningEventsByWave: Map<string, PlanningChangeControlEvent[]>;
};

function waveKey(changeId: string, waveId: string) {
  return `${changeId}\u0000${waveId}`;
}

function taskKey(changeId: string, waveId: string, taskId: string) {
  return `${changeId}\u0000${waveId}\u0000${taskId}`;
}

function planKey(
  changeId: string,
  waveId: string,
  planId: string,
  revision: number,
) {
  return `${changeId}\u0000${waveId}\u0000${revision}\u0000${planId}`;
}

function planRevisionKey(changeId: string, waveId: string, revision: number) {
  return `${changeId}\u0000${waveId}\u0000${revision}`;
}

function samePlanReference(
  reference: PlanReferenceV1,
  contract: PlanningContractV1,
) {
  return (
    reference.planId === contract.planId &&
    reference.revision === contract.revision &&
    reference.planBaseSha === contract.planBase.sha
  );
}

function wavePlans(
  projected: Pick<ProjectedLedger, "plans">,
  changeId: string,
  waveId: string,
) {
  return [...projected.plans.values()]
    .filter(
      (plan) =>
        plan.contract.changeId === changeId &&
        plan.contract.waveId === waveId,
    )
    .sort(
      (left, right) =>
        left.contract.revision - right.contract.revision ||
        left.sequence - right.sequence,
    );
}

function requireStoredStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) corrupt(`An event has an invalid ${field}.`);
  const result = value.map((item) => requireStoredIdentifier(item, field));
  if (new Set(result).size !== result.length)
    corrupt(`An event has duplicate values in ${field}.`);
  return result;
}

function requireStoredData(event: ChangeControlEvent) {
  const data = event.payload.data;
  if (data === null || Array.isArray(data) || typeof data !== "object")
    corrupt(`Event ${event.id} has an invalid typed payload.`);
  return data as JsonObject;
}

function requireStoredPlanReference(
  value: unknown,
  field: string,
): PlanReferenceV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    corrupt(`An event has an invalid ${field}.`);
  const reference = value as Record<string, unknown>;
  if (
    Object.keys(reference).sort().join(",") !==
    "planBaseSha,planId,revision"
  )
    corrupt(`An event has an invalid ${field}.`);
  const planId = requireStoredIdentifier(reference.planId, `${field}.planId`);
  if (
    !Number.isInteger(reference.revision) ||
    (reference.revision as number) < 1
  )
    corrupt(`An event has an invalid ${field}.revision.`);
  if (
    typeof reference.planBaseSha !== "string" ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(reference.planBaseSha)
  )
    corrupt(`An event has an invalid ${field}.planBaseSha.`);
  return {
    planId,
    revision: reference.revision as number,
    planBaseSha: reference.planBaseSha,
  };
}

function assertPayloadKeys(
  event: ChangeControlEvent,
  expected: readonly string[],
) {
  if (Object.keys(event.payload).sort().join(",") !== [...expected].sort().join(","))
    corrupt(`Event ${event.id} has an invalid typed payload.`);
}

function taskDependenciesAccepted(
  task: TaskProjection,
  tasks: ReadonlyMap<string, TaskProjection>,
) {
  return task.dependsOn.every(
    (dependencyId) =>
      tasks.get(taskKey(task.changeId, task.waveId, dependencyId))?.status ===
      "accepted",
  );
}

function waveReadinessReasons(
  wave: StoredWaveProjection,
  waves: ReadonlyMap<string, StoredWaveProjection>,
  tasks: ReadonlyMap<string, TaskProjection>,
): WaveReadinessReason[] {
  const reasons: WaveReadinessReason[] = [];
  for (const dependencyWaveId of wave.dependsOn) {
    const dependency = waves.get(waveKey(wave.changeId, dependencyWaveId));
    if (!dependency)
      corrupt(
        `Wave ${wave.waveId} has missing dependency ${dependencyWaveId}.`,
      );
    if (dependency.status !== "completed")
      reasons.push({
        code: "WAVE_DEPENDENCY_NOT_COMPLETED",
        dependencyWaveId,
        status: dependency.status,
      });
  }
  const hasReadyTask = [...tasks.values()].some(
    (task) =>
      task.changeId === wave.changeId &&
      task.waveId === wave.waveId &&
      task.status === "ready",
  );
  if (!hasReadyTask) reasons.push({ code: "NO_READY_TASKS" });
  return reasons;
}

function dispatchReadinessReasons(
  wave: StoredWaveProjection,
  waves: ReadonlyMap<string, StoredWaveProjection>,
  tasks: ReadonlyMap<string, TaskProjection>,
): DispatchReadinessReason[] {
  const reasons: DispatchReadinessReason[] = [];
  if (wave.status !== "ready")
    reasons.push({ code: "WAVE_STATUS_NOT_READY", status: wave.status });
  reasons.push(...waveReadinessReasons(wave, waves, tasks));
  return reasons;
}

function assertTaskGraph(
  wave: StoredWaveProjection,
  tasks: ReadonlyMap<string, TaskProjection>,
) {
  const waveTasks = [...tasks.values()].filter(
    (task) =>
      task.changeId === wave.changeId && task.waveId === wave.waveId,
  );
  if (waveTasks.length === 0)
    corrupt(`Wave ${wave.waveId} must contain at least one task.`);
  const byId = new Map(waveTasks.map((task) => [task.taskId, task]));
  for (const task of waveTasks) {
    for (const dependencyId of task.dependsOn) {
      if (!byId.has(dependencyId))
        corrupt(
          `Task ${task.taskId} has missing dependency ${dependencyId}.`,
        );
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visiting.has(taskId))
      corrupt(`Wave ${wave.waveId} contains a task dependency cycle.`);
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId)!.dependsOn)
      visit(dependencyId);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of waveTasks) visit(task.taskId);
}

function planningSemanticFailure(stored: boolean, message: string): never {
  if (stored) corrupt(message);
  invalid(message);
}

const canonicalTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;

function canonicalTimestampMillis(value: string) {
  const match = canonicalTimestampPattern.exec(value);
  const milliseconds = Date.parse(value);
  if (!match || !Number.isFinite(milliseconds)) return undefined;
  const parsed = new Date(milliseconds);
  if (
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[3]) ||
    parsed.getUTCHours() !== Number(match[4]) ||
    parsed.getUTCMinutes() !== Number(match[5]) ||
    parsed.getUTCSeconds() !== Number(match[6])
  )
    return undefined;
  return milliseconds;
}

function planningTimestamp(
  value: string,
  label: string,
  stored: boolean,
) {
  const milliseconds = canonicalTimestampMillis(value);
  if (milliseconds === undefined)
    planningSemanticFailure(
      stored,
      `${label} must be a valid canonical UTC timestamp.`,
    );
  return milliseconds;
}

function assertPlanningContractSemantics(
  contract: PlanningContractV1,
  projectId: string,
  changeId: string,
  waveId: string,
  tasks: ReadonlyMap<string, TaskProjection>,
  stored: boolean,
  publishedAt: string,
) {
  if (
    contract.projectId !== projectId ||
    contract.changeId !== changeId ||
    contract.waveId !== waveId
  )
    planningSemanticFailure(
      stored,
      "PlanningContractV1 project, change, and wave references must match the publication scope.",
    );
  if (!contract.createdBy.startsWith("planner:"))
    planningSemanticFailure(
      stored,
      "PlanningContractV1 createdBy must identify a planner.",
    );
  const expectedShaLength = contract.planBase.hashAlgorithm === "sha1" ? 40 : 64;
  if (contract.planBase.sha.length !== expectedShaLength)
    planningSemanticFailure(
      stored,
      "PlanningContractV1 planBase.sha does not match hashAlgorithm.",
    );
  const capturedAt = planningTimestamp(
    contract.planBase.capturedAt,
    "PlanningContractV1 planBase.capturedAt",
    stored,
  );
  const createdAt = planningTimestamp(
    contract.createdAt,
    "PlanningContractV1 createdAt",
    stored,
  );
  const publicationTime = planningTimestamp(
    publishedAt,
    "PlanningContractV1 publication time",
    stored,
  );
  if (capturedAt > createdAt || createdAt > publicationTime)
    planningSemanticFailure(
      stored,
      "PlanningContractV1 timestamps must satisfy capturedAt <= createdAt <= publication time.",
    );
  if (
    (contract.revision === 1 && contract.predecessor != null) ||
    (contract.revision > 1 && contract.predecessor == null)
  )
    planningSemanticFailure(
      stored,
      "PlanningContractV1 revision 1 must have no predecessor and later revisions must have one.",
    );

  const expectedTaskIds = [...tasks.values()]
    .filter(
      (task) => task.changeId === changeId && task.waveId === waveId,
    )
    .map((task) => task.taskId)
    .sort();
  const actualTaskIds = contract.taskPlans.map((task) => task.taskId);
  if (new Set(actualTaskIds).size !== actualTaskIds.length)
    planningSemanticFailure(
      stored,
      "PlanningContractV1 contains duplicate taskPlan task IDs.",
    );
  if (
    expectedTaskIds.length !== actualTaskIds.length ||
    expectedTaskIds.some((taskId, index) => taskId !== [...actualTaskIds].sort()[index])
  )
    planningSemanticFailure(
      stored,
      "PlanningContractV1 taskPlans must cover the exact wave task set.",
    );

  for (const taskPlan of contract.taskPlans) {
    const claimIds = taskPlan.acceptanceClaims.map((claim) => claim.claimId);
    if (new Set(claimIds).size !== claimIds.length)
      planningSemanticFailure(
        stored,
        `PlanningContractV1 task ${taskPlan.taskId} contains duplicate acceptance claim IDs.`,
      );
    const paths = taskPlan.blastRadius.declaredWriteSet.map((entry) => entry.path);
    if (new Set(paths).size !== paths.length)
      planningSemanticFailure(
        stored,
        `PlanningContractV1 task ${taskPlan.taskId} contains duplicate declared write paths.`,
      );
  }
}

function assertAuthorizationScope(
  authorization: PlanAuthorizationV1,
  projectId: string,
  changeId: string,
  waveId: string,
  stored: boolean,
) {
  if (
    authorization.projectId !== projectId ||
    authorization.changeId !== changeId ||
    authorization.waveId !== waveId
  )
    planningSemanticFailure(
      stored,
      "PlanAuthorizationV1 project, change, and wave references must match the publication scope.",
    );
  if (
    !authorization.decidedBy.startsWith("human:") &&
    !authorization.decidedBy.startsWith("policy:")
  )
    planningSemanticFailure(
      stored,
      "PlanAuthorizationV1 decidedBy must identify a human or policy authorizer.",
    );
}

function assertAuthorizationTimestamps(
  authorization: PlanAuthorizationV1,
  plan: PlanningPlanProjection,
  occurredAt: string,
  stored: boolean,
) {
  const decidedAt = planningTimestamp(
    authorization.decidedAt,
    "PlanAuthorizationV1 decidedAt",
    stored,
  );
  const planCreatedAt = planningTimestamp(
    plan.contract.createdAt,
    "PlanningContractV1 createdAt",
    stored,
  );
  const publicationTime = planningTimestamp(
    occurredAt,
    "PlanAuthorizationV1 publication time",
    stored,
  );
  if (decidedAt < planCreatedAt || decidedAt > publicationTime)
    planningSemanticFailure(
      stored,
      "PlanAuthorizationV1 timestamps must satisfy plan createdAt <= decidedAt <= publication time.",
    );
}

function assertReceiptScope(
  receipt: ArchitectReplanReceiptV1,
  projectId: string,
  changeId: string,
  waveId: string,
  stored: boolean,
) {
  if (
    receipt.projectId !== projectId ||
    receipt.changeId !== changeId ||
    receipt.waveId !== waveId
  )
    planningSemanticFailure(
      stored,
      "ArchitectReplanReceiptV1 project, change, and wave references must match the publication scope.",
    );
  if (!receipt.proposedBy.startsWith("architect:"))
    planningSemanticFailure(
      stored,
      "ArchitectReplanReceiptV1 proposedBy must identify an architect.",
    );
  if (receipt.replacementPlan.revision <= receipt.priorPlan.revision)
    planningSemanticFailure(
      stored,
      "ArchitectReplanReceiptV1 replacement revision must be greater than its prior revision.",
    );
}

function assertReceiptTimestamps(
  receipt: ArchitectReplanReceiptV1,
  priorAssessment: DriftAssessmentV1,
  replacement: PlanningPlanProjection,
  occurredAt: string,
  stored: boolean,
) {
  const proposedAt = planningTimestamp(
    receipt.proposedAt,
    "ArchitectReplanReceiptV1 proposedAt",
    stored,
  );
  const assessmentTime = planningTimestamp(
    priorAssessment.assessedAt,
    "DriftAssessmentV1 assessedAt",
    stored,
  );
  const replacementCreatedAt = planningTimestamp(
    replacement.contract.createdAt,
    "Replacement PlanningContractV1 createdAt",
    stored,
  );
  const publicationTime = planningTimestamp(
    occurredAt,
    "ArchitectReplanReceiptV1 publication time",
    stored,
  );
  if (
    proposedAt < assessmentTime ||
    proposedAt < replacementCreatedAt ||
    proposedAt > publicationTime
  )
    planningSemanticFailure(
      stored,
      "ArchitectReplanReceiptV1 proposedAt must follow its assessment and replacement plan and not exceed publication time.",
    );
}

const replanTriggerReasonCode: Readonly<
  Record<
    Exclude<ReplanTriggerV1, "base_sha_changed" | "unknown_drift">,
    DriftAssessmentV1["reasons"][number]["code"]
  >
> = {
  write_set_overlap: "WRITE_SET_OVERLAP",
  dependency_changed: "DEPENDENCY_DRIFT",
  acceptance_oracle_changed: "ACCEPTANCE_ORACLE_DRIFT",
  policy_changed: "POLICY_DRIFT",
};

function executableBlockingOracles(contract: PlanningContractV1) {
  return contract.taskPlans.every(
    (taskPlan) =>
      taskPlan.acceptanceClaims.some(
        (claim) => claim.failureSeverity === "blocking",
      ) &&
      taskPlan.acceptanceClaims.every(
        (claim) =>
          claim.failureSeverity !== "blocking" ||
          (claim.oracle.kind !== "human_observation" &&
            claim.oracle.instruction.trim().length > 0),
      ),
  );
}

function dispatchContractValid(contract: PlanningContractV1) {
  const capturedAt = canonicalTimestampMillis(contract.planBase.capturedAt);
  const createdAt = canonicalTimestampMillis(contract.createdAt);
  return (
    validatePlanningDriftContract(contract) &&
    contract.contractType === "PlanningContractV1" &&
    capturedAt !== undefined &&
    createdAt !== undefined &&
    capturedAt <= createdAt
  );
}

function evidencedBlastRadius(contract: PlanningContractV1) {
  return contract.taskPlans.every((taskPlan) => {
    const blastRadius = taskPlan.blastRadius;
    const impacts = [
      ...blastRadius.dependencyImpacts,
      ...blastRadius.publicApiChanges,
      ...blastRadius.schemaMigrationEffects,
      ...blastRadius.externalSideEffects,
      ...blastRadius.impactedTests,
    ];
    return (
      blastRadius.assessmentEvidenceRefs.length > 0 &&
      blastRadius.assessmentEvidenceRefs.every((reference) => reference.trim()) &&
      blastRadius.declaredWriteSet.every(
        (entry) =>
          entry.evidenceRefs.length > 0 &&
          entry.evidenceRefs.every((reference) => reference.trim()),
      ) &&
      impacts.every(
        (impact) =>
          impact.evidenceRefs.length > 0 &&
          impact.evidenceRefs.every((reference) => reference.trim()),
      )
    );
  });
}

function validTrustedRepositorySnapshot(
  value: unknown,
): value is TrustedRepositorySnapshotV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<TrustedRepositorySnapshotV1>;
  const expectedShaLength = snapshot.hashAlgorithm === "sha256" ? 64 : 40;
  return (
    typeof snapshot.repositoryId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(snapshot.repositoryId) &&
    typeof snapshot.sha === "string" &&
    /^[0-9a-f]+$/.test(snapshot.sha) &&
    snapshot.sha.length === expectedShaLength &&
    (snapshot.hashAlgorithm === "sha1" ||
      snapshot.hashAlgorithm === "sha256") &&
    typeof snapshot.ref === "string" &&
    snapshot.ref.trim().length > 0 &&
    (snapshot.worktreeState === "clean" ||
      snapshot.worktreeState === "dirty") &&
    Array.isArray(snapshot.changedPaths) &&
    snapshot.changedPaths.every(
      (path) => typeof path === "string" && path.trim().length > 0,
    ) &&
    (snapshot.triggeredReplanTriggers === undefined ||
      (Array.isArray(snapshot.triggeredReplanTriggers) &&
        snapshot.triggeredReplanTriggers.every((trigger) =>
          [
            "base_sha_changed",
            "write_set_overlap",
            "dependency_changed",
            "acceptance_oracle_changed",
            "policy_changed",
            "unknown_drift",
          ].includes(trigger),
        ))) &&
    (snapshot.unknownDrift === undefined ||
      typeof snapshot.unknownDrift === "boolean")
  );
}

function driftAssessmentFor(
  assessmentId: string,
  plan: PlanningPlanProjection,
  snapshot: TrustedRepositorySnapshotV1,
  assessedAt: string,
): DriftAssessmentV1 {
  const evidenceRefs = [
    `git:repository:${snapshot.repositoryId}`,
    `git:head:${snapshot.sha}`,
    `git:ref:${snapshot.ref}`,
    `git:worktree:${snapshot.worktreeState}`,
  ];
  const reasons: DriftAssessmentV1["reasons"][number][] = [];
  if (
    snapshot.repositoryId !== plan.contract.planBase.repositoryId ||
    snapshot.sha !== plan.contract.planBase.sha ||
    snapshot.hashAlgorithm !== plan.contract.planBase.hashAlgorithm
  )
    reasons.push({
      code: "BASE_SHA_MISMATCH",
      description:
        "The trusted repository identity or full HEAD SHA does not match the authorized plan base.",
      evidenceRefs,
    });
  if (snapshot.worktreeState === "dirty")
    reasons.push({
      code: "WORKTREE_DIRTY",
      description: "The trusted Project Profile resolves to a dirty worktree.",
      evidenceRefs: [
        `git:worktree:${snapshot.worktreeState}`,
        ...snapshot.changedPaths.map((path) => `git:path:${path}`),
      ],
    });
  for (const trigger of snapshot.triggeredReplanTriggers ?? []) {
    if (trigger === "unknown_drift") {
      reasons.push({
        code: "UNKNOWN_DRIFT",
        description: "The trusted drift guard reported unknown drift.",
        evidenceRefs,
      });
      continue;
    }
    if (!plan.contract.replanTriggers.includes(trigger)) continue;
    if (trigger === "base_sha_changed") continue;
    reasons.push({
      code: replanTriggerReasonCode[trigger],
      description: `The declared ${trigger} replan trigger fired.`,
      evidenceRefs,
    });
  }
  if (
    snapshot.unknownDrift &&
    !reasons.some((reason) => reason.code === "UNKNOWN_DRIFT")
  )
    reasons.push({
      code: "UNKNOWN_DRIFT",
      description: "The trusted repository observation contains unknown drift.",
      evidenceRefs,
    });
  const stale = reasons.length > 0;
  return {
    contractType: "DriftAssessmentV1",
    contractVersion: "1.0",
    assessmentId,
    plan: {
      planId: plan.contract.planId,
      revision: plan.contract.revision,
      planBaseSha: plan.contract.planBase.sha,
    },
    observedBase: {
      repositoryId: snapshot.repositoryId,
      sha: snapshot.sha,
      hashAlgorithm: snapshot.hashAlgorithm,
      ref: snapshot.ref,
      capturedAt: assessedAt,
      worktreeState: snapshot.worktreeState,
    },
    status: stale ? "stale" : "fresh",
    reasons,
    changedPaths: [...snapshot.changedPaths],
    evidenceRefs,
    requiresReplan: stale,
    assessedAt,
    assessedBy: "drift-guard:v1",
  };
}

function replanReceiptAssessmentIssue(
  receipt: ArchitectReplanReceiptV1,
  prior: PlanningPlanProjection,
  driftAssessments: ReadonlyMap<string, DriftAssessmentV1>,
) {
  const assessment = driftAssessments.get(receipt.driftAssessmentId);
  if (!assessment) return "missing" as const;
  if (
    assessment.status !== "stale" ||
    !samePlanReference(assessment.plan, prior.contract)
  )
    return "not-stale-prior" as const;
  return undefined;
}

function validReplacementReceipt(
  plan: PlanningPlanProjection,
  projected: Pick<ProjectedLedger, "replanReceipts" | "driftAssessments" | "plans">,
) {
  if (plan.contract.revision === 1) return true;
  if (!plan.contract.predecessor) return false;
  const prior = projected.plans.get(
    planKey(
      plan.contract.changeId,
      plan.contract.waveId,
      plan.contract.predecessor.planId,
      plan.contract.predecessor.revision,
    ),
  );
  if (
    !prior ||
    !samePlanReference(plan.contract.predecessor, prior.contract)
  )
    return false;
  const matches = [...projected.replanReceipts.values()].filter((receipt) =>
    samePlanReference(receipt.replacementPlan, plan.contract),
  );
  if (prior.status === "rejected") return matches.length === 0;
  if (matches.length !== 1) return false;
  const receipt = matches[0];
  return Boolean(
    replanReceiptAssessmentIssue(
      receipt,
      prior,
      projected.driftAssessments,
    ) === undefined &&
      samePlanReference(receipt.priorPlan, prior.contract) &&
      samePlanReference(plan.contract.predecessor, prior.contract),
  );
}

function validateAndProject(ledger: Ledger): ProjectedLedger {
  if (ledger.version !== 1 || !Array.isArray(ledger.events))
    corrupt("Unsupported change-control ledger format.");
  requireStoredIdentifier(ledger.projectId, "projectId");

  const projections = new Map<string, ChangeProjection>();
  const waves = new Map<string, StoredWaveProjection>();
  const tasks = new Map<string, TaskProjection>();
  const plans = new Map<string, PlanningPlanProjection>();
  const planKeysByRevision = new Map<string, string>();
  const authorizations = new Map<string, PlanAuthorizationV1>();
  const driftAssessments = new Map<string, DriftAssessmentV1>();
  const dispatchGateReceipts = new Map<string, DispatchGateReceiptV1>();
  const replanReceipts = new Map<string, ArchitectReplanReceiptV1>();
  const taskCreatedSequences = new Map<string, number>();
  const eventsByChange = new Map<string, ChangeControlEvent[]>();
  const eventsByWave = new Map<string, ChangeControlEvent[]>();
  const planningEventsByWave = new Map<
    string,
    PlanningChangeControlEvent[]
  >();
  const eventIds = new Set<string>();
  let previousHash: string | null = null;

  ledger.events.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object")
      corrupt(`Ledger event ${index + 1} is invalid.`);
    const event = candidate as ChangeControlEvent;
    if (event.sequence !== index + 1)
      corrupt(`Ledger sequence must be contiguous at event ${index + 1}.`);
    if (!eventTypeSet.has(event.type))
      corrupt(`Unknown change-control event type: ${String(event.type)}.`);
    requireStoredIdentifier(event.id, "id");
    requireStoredIdentifier(event.projectId, "projectId");
    requireStoredIdentifier(event.changeId, "changeId");
    requireStoredIdentity(event.actor, "actor");
    requireStoredIdentity(event.causationId, "causationId");
    requireStoredIdentity(event.correlationId, "correlationId");
    requireTimestamp(event.occurredAt);
    if (event.projectId !== ledger.projectId)
      corrupt(`Event ${event.id} belongs to a different project.`);
    if (eventIds.has(event.id)) corrupt(`Duplicate event ID: ${event.id}.`);
    eventIds.add(event.id);
    if (event.previousHash !== previousHash)
      corrupt(`Broken previousHash chain at event ${event.id}.`);
    const { hash, ...hashInput } = event;
    if (
      typeof hash !== "string" ||
      hash.length !== 64 ||
      eventHash(hashInput) !== hash
    )
      corrupt(`Invalid hash at event ${event.id}.`);

    if (changeEventTypes.has(event.type)) {
      if (event.waveId !== undefined || event.taskId !== undefined)
        corrupt(`Change event ${event.id} has unexpected entity IDs.`);
      const current = projections.get(event.changeId);
      requireStoredData(event);
      if (event.type === "change.created") {
        assertPayloadKeys(event, ["data", "status"]);
        if (event.payload.status !== "draft" || current)
          corrupt(`Event ${event.id} has an invalid change.created payload.`);
        projections.set(event.changeId, {
          projectId: event.projectId,
          changeId: event.changeId,
          status: "draft",
          sequence: event.sequence,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          createdBy: event.actor,
          lastActor: event.actor,
          details: event.payload.data as JsonObject,
        });
        eventsByChange.set(event.changeId, [event]);
      } else {
        if (!current)
          corrupt(`Transition event ${event.id} precedes change creation.`);
        const target =
          changeTargetForType[
            event.type as keyof typeof changeTargetForType
          ];
        assertPayloadKeys(event, ["data", "from", "to"]);
        if (
          event.payload.from !== current.status ||
          event.payload.to !== target ||
          !legalTargets[current.status].includes(target)
        )
          corrupt(
            `Illegal persisted transition for ${event.changeId}: ${current.status} -> ${target}.`,
          );
        projections.set(event.changeId, {
          ...current,
          status: target,
          sequence: event.sequence,
          updatedAt: event.occurredAt,
          lastActor: event.actor,
        });
        eventsByChange.get(event.changeId)!.push(event);
      }
    } else if (waveEventTypes.has(event.type)) {
      const waveId = requireStoredIdentifier(event.waveId, "waveId");
      if (event.taskId !== undefined)
        corrupt(`Wave event ${event.id} has an unexpected taskId.`);
      const key = waveKey(event.changeId, waveId);
      const current = waves.get(key);
      requireStoredData(event);
      if (event.type === "wave.created") {
        assertPayloadKeys(event, ["data", "dependsOn", "status"]);
        if (event.payload.status !== "draft" || current)
          corrupt(`Event ${event.id} has an invalid wave.created payload.`);
        if (!projections.has(event.changeId))
          corrupt(`Wave ${waveId} precedes change creation.`);
        const dependsOn = requireStoredStringArray(
          event.payload.dependsOn,
          "dependsOn",
        );
        if (dependsOn.includes(waveId))
          corrupt(`Wave ${waveId} cannot depend on itself.`);
        for (const dependencyWaveId of dependsOn) {
          const dependency = waves.get(
            waveKey(event.changeId, dependencyWaveId),
          );
          if (!dependency)
            corrupt(
              `Wave ${waveId} has missing dependency ${dependencyWaveId}.`,
            );
        }
        waves.set(key, {
          projectId: event.projectId,
          changeId: event.changeId,
          waveId,
          status: "draft",
          sequence: event.sequence,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          createdBy: event.actor,
          lastActor: event.actor,
          dependsOn,
          details: event.payload.data as JsonObject,
        });
        eventsByWave.set(key, [event]);
      } else {
        if (!current)
          corrupt(`Wave transition ${event.id} precedes wave creation.`);
        const target =
          waveTargetForType[event.type as keyof typeof waveTargetForType];
        if (
          (event.type === "wave.dispatched" ||
            event.type === "wave.dispatch-overridden") &&
          plans.size > 0
        ) {
          const latestPlan = wavePlans(
            { plans },
            event.changeId,
            waveId,
          ).at(-1);
          if (!latestPlan || latestPlan.status !== "dispatched")
            corrupt(
              `Wave ${waveId} was dispatched without an allowed Phase 2 gate receipt.`,
            );
        }
        if (event.type === "wave.dispatch-overridden") {
          assertPayloadKeys(event, [
            "data",
            "from",
            "reason",
            "reasons",
            "to",
          ]);
          requireStoredIdentity(event.payload.reason, "reason");
          const expectedReasons = dispatchReadinessReasons(
            current,
            waves,
            tasks,
          );
          if (
            current.status !== "draft" ||
            event.payload.from !== current.status ||
            event.payload.to !== "dispatched" ||
            canonicalJson(event.payload.reasons as JsonValue) !==
              canonicalJson(expectedReasons as unknown as JsonValue)
          )
            corrupt(`Event ${event.id} has an invalid dispatch override.`);
        } else {
          assertPayloadKeys(event, ["data", "from", "to"]);
          if (
            event.payload.from !== current.status ||
            event.payload.to !== target ||
            !legalWaveTargets[current.status].includes(target)
          )
            corrupt(
              `Illegal persisted wave transition for ${waveId}: ${current.status} -> ${target}.`,
            );
          if (
            event.type === "wave.readied" &&
            waveReadinessReasons(current, waves, tasks).length > 0
          )
            corrupt(`Wave ${waveId} was readied with unmet dependencies.`);
          if (
            event.type === "wave.dispatched" &&
            dispatchReadinessReasons(current, waves, tasks).length > 0
          )
            corrupt(`Wave ${waveId} was dispatched while not ready.`);
          if (event.type === "wave.completed") {
            const waveTasks = [...tasks.values()].filter(
              (task) =>
                task.changeId === event.changeId && task.waveId === waveId,
            );
            if (
              waveTasks.length === 0 ||
              waveTasks.some((task) => task.status !== "accepted")
            )
              corrupt(`Wave ${waveId} completed before all tasks were accepted.`);
          }
        }
        waves.set(key, {
          ...current,
          status: target,
          sequence: event.sequence,
          updatedAt: event.occurredAt,
          lastActor: event.actor,
        });
        eventsByWave.get(key)!.push(event);
      }
    } else if (planningEventTypes.has(event.type)) {
      const waveId = requireStoredIdentifier(event.waveId, "waveId");
      if (event.taskId !== undefined)
        corrupt(`Planning event ${event.id} has an unexpected taskId.`);
      const scopedWaveKey = waveKey(event.changeId, waveId);
      if (!waves.has(scopedWaveKey))
        corrupt(`Planning event ${event.id} precedes wave creation.`);
      let planningEvent: PlanningChangeControlEvent;

      if (event.type === "plan.proposed") {
        assertPayloadKeys(event, ["contract"]);
        const contract = validatePlanningContractSchema(
          event.payload.contract,
          "PlanningContractV1",
          true,
        );
        assertPlanningContractSemantics(
          contract,
          event.projectId,
          event.changeId,
          waveId,
          tasks,
          true,
          event.occurredAt,
        );
        if (event.actor !== contract.createdBy)
          corrupt(`Plan proposal event ${event.id} has a mismatched creator.`);
        const key = planKey(
          event.changeId,
          waveId,
          contract.planId,
          contract.revision,
        );
        const revisionKey = planRevisionKey(
          event.changeId,
          waveId,
          contract.revision,
        );
        if (plans.has(key) || planKeysByRevision.has(revisionKey))
          corrupt(
            `Plan revision ${contract.revision} is duplicated in wave ${waveId}.`,
          );
        const priorPlans = wavePlans({ plans }, event.changeId, waveId);
        const latest = priorPlans.at(-1);
        if (!latest) {
          if (contract.revision !== 1)
            corrupt(`The first plan for wave ${waveId} must be revision 1.`);
        } else {
          if (contract.revision <= latest.contract.revision)
            corrupt(`Plan revision regression in wave ${waveId}.`);
          if (
            !contract.predecessor ||
            !samePlanReference(contract.predecessor, latest.contract)
          )
            corrupt(
              `Plan revision ${contract.revision} does not identify its exact predecessor.`,
            );
          if (!["stale", "rejected"].includes(latest.status))
            corrupt(
              `Plan revision ${contract.revision} follows a predecessor that is not stale or rejected.`,
            );
        }
        plans.set(key, {
          contract,
          status: "proposed",
          sequence: event.sequence,
          updatedSequence: event.sequence,
          proposedEventId: event.id,
        });
        planKeysByRevision.set(revisionKey, key);
        planningEvent = event as PlanningContractProposedEvent;
      } else if (
        event.type === "plan.authorized" ||
        event.type === "plan.rejected"
      ) {
        assertPayloadKeys(event, ["authorization"]);
        const authorization = validatePlanningContractSchema(
          event.payload.authorization,
          "PlanAuthorizationV1",
          true,
        );
        assertAuthorizationScope(
          authorization,
          event.projectId,
          event.changeId,
          waveId,
          true,
        );
        if (event.actor !== authorization.decidedBy)
          corrupt(
            `Plan authorization event ${event.id} has a mismatched decider.`,
          );
        if (
          (event.type === "plan.authorized") !==
          (authorization.decision === "authorized")
        )
          corrupt(`Plan authorization event ${event.id} has a mismatched decision.`);
        if (authorizations.has(authorization.authorizationId))
          corrupt(
            `Duplicate plan authorization ID: ${authorization.authorizationId}.`,
          );
        const key = planKey(
          event.changeId,
          waveId,
          authorization.plan.planId,
          authorization.plan.revision,
        );
        const plan = plans.get(key);
        if (!plan || !samePlanReference(authorization.plan, plan.contract))
          corrupt(
            `Plan authorization ${authorization.authorizationId} has a missing or mismatched plan reference.`,
          );
        assertAuthorizationTimestamps(
          authorization,
          plan,
          event.occurredAt,
          true,
        );
        if (plan.status !== "proposed")
          corrupt(
            `Plan ${authorization.plan.planId} revision ${authorization.plan.revision} has a duplicate terminal decision.`,
          );
        if (authorization.decidedBy === plan.contract.createdBy)
          corrupt(
            `Plan ${authorization.plan.planId} revision ${authorization.plan.revision} is self-authorized.`,
          );
        const matchingReceipts = [...replanReceipts.values()].filter(
          (receipt) =>
            samePlanReference(receipt.replacementPlan, plan.contract),
        );
        if (
          matchingReceipts.some(
            (receipt) => receipt.proposedBy === authorization.decidedBy,
          )
        )
          corrupt(
            `Architect proposal ${authorization.plan.planId} revision ${authorization.plan.revision} is self-authorized.`,
          );
        if (
          plan.contract.revision > 1 &&
          authorization.decision === "authorized"
        ) {
          const predecessor = plan.contract.predecessor
            ? plans.get(
                planKey(
                  event.changeId,
                  waveId,
                  plan.contract.predecessor.planId,
                  plan.contract.predecessor.revision,
                ),
              )
            : undefined;
          const expectedReceipts = predecessor?.status === "rejected" ? 0 : 1;
          if (matchingReceipts.length !== expectedReceipts)
            corrupt(
              `Replacement plan ${authorization.plan.planId} revision ${authorization.plan.revision} requires ${expectedReceipts === 0 ? "no" : "exactly one architect"} replan receipt for its predecessor state.`,
            );
        }
        authorizations.set(authorization.authorizationId, authorization);
        plans.set(key, {
          ...plan,
          status: authorization.decision,
          updatedSequence: event.sequence,
          authorization,
        });
        planningEvent = event as PlanAuthorizationEvent;
      } else if (
        event.type === "plan.drift-assessed" ||
        event.type === "plan.marked-stale"
      ) {
        assertPayloadKeys(event, ["assessment"]);
        const assessment = validatePlanningContractSchema(
          event.payload.assessment,
          "DriftAssessmentV1",
          true,
        );
        if (event.actor !== assessment.assessedBy)
          corrupt(
            `Drift assessment event ${event.id} has a mismatched assessor.`,
          );
        if (
          planningTimestamp(
            assessment.assessedAt,
            "DriftAssessmentV1 assessedAt",
            true,
          ) !== planningTimestamp(event.occurredAt, "event occurredAt", true) ||
          planningTimestamp(
            assessment.observedBase.capturedAt,
            "DriftAssessmentV1 observedBase.capturedAt",
            true,
          ) !== planningTimestamp(event.occurredAt, "event occurredAt", true)
        )
          corrupt(
            `Drift assessment ${assessment.assessmentId} timestamps do not match its observation event.`,
          );
        if (driftAssessments.has(assessment.assessmentId))
          corrupt(`Duplicate drift assessment ID: ${assessment.assessmentId}.`);
        const key = planKey(
          event.changeId,
          waveId,
          assessment.plan.planId,
          assessment.plan.revision,
        );
        const plan = plans.get(key);
        if (!plan || !samePlanReference(assessment.plan, plan.contract))
          corrupt(
            `Drift assessment ${assessment.assessmentId} has a missing or mismatched plan reference.`,
          );
        if (plan.status !== "authorized")
          corrupt(
            `Drift assessment ${assessment.assessmentId} does not target an authorized plan.`,
          );
        if (
          (event.type === "plan.drift-assessed") !==
          (assessment.status === "fresh")
        )
          corrupt(
            `Drift assessment event ${event.id} has a mismatched freshness status.`,
          );
        const exactBase =
          assessment.observedBase.repositoryId ===
            plan.contract.planBase.repositoryId &&
          assessment.observedBase.sha === plan.contract.planBase.sha &&
          assessment.observedBase.hashAlgorithm ===
            plan.contract.planBase.hashAlgorithm;
        if (
          assessment.status === "fresh" &&
          (!exactBase ||
            assessment.observedBase.worktreeState !== "clean" ||
            assessment.requiresReplan ||
            assessment.reasons.length > 0)
        )
          corrupt(
            `Fresh drift assessment ${assessment.assessmentId} does not match the exact clean plan base.`,
          );
        if (
          assessment.status === "stale" &&
          exactBase &&
          assessment.observedBase.worktreeState === "clean" &&
          assessment.reasons.length === 0
        )
          corrupt(
            `Stale drift assessment ${assessment.assessmentId} has no drift evidence.`,
          );
        driftAssessments.set(assessment.assessmentId, assessment);
        if (assessment.status === "stale")
          plans.set(key, {
            ...plan,
            status: "stale",
            updatedSequence: event.sequence,
          });
        planningEvent = event as DriftAssessmentEvent;
      } else if (event.type === "plan.dispatch-validated") {
        assertPayloadKeys(event, ["receipt"]);
        const receipt = validatePlanningContractSchema(
          event.payload.receipt,
          "DispatchGateReceiptV1",
          true,
        );
        if (
          receipt.projectId !== event.projectId ||
          receipt.changeId !== event.changeId ||
          receipt.waveId !== waveId
        )
          corrupt(
            `Dispatch gate receipt ${receipt.receiptId} has mismatched project, change, or wave scope.`,
          );
        if (event.actor !== receipt.evaluatedBy)
          corrupt(
            `Dispatch gate receipt event ${event.id} has a mismatched evaluator.`,
          );
        if (
          planningTimestamp(
            receipt.evaluatedAt,
            "DispatchGateReceiptV1 evaluatedAt",
            true,
          ) !== planningTimestamp(event.occurredAt, "event occurredAt", true)
        )
          corrupt(
            `Dispatch gate receipt ${receipt.receiptId} timestamp does not match its event.`,
          );
        if (dispatchGateReceipts.has(receipt.receiptId))
          corrupt(`Duplicate dispatch gate receipt ID: ${receipt.receiptId}.`);
        const plan = receipt.plan
          ? plans.get(
              planKey(
                event.changeId,
                waveId,
                receipt.plan.planId,
                receipt.plan.revision,
              ),
            )
          : undefined;
        const authorization = receipt.authorizationId
          ? authorizations.get(receipt.authorizationId)
          : undefined;
        const assessment = receipt.driftAssessmentId
          ? driftAssessments.get(receipt.driftAssessmentId)
          : undefined;
        if (receipt.plan && (!plan || !samePlanReference(receipt.plan, plan.contract)))
          corrupt(
            `Dispatch gate receipt ${receipt.receiptId} has a missing or mismatched plan reference.`,
          );
        if (receipt.authorizationId && !authorization)
          corrupt(
            `Dispatch gate receipt ${receipt.receiptId} has a missing authorization reference.`,
          );
        if (receipt.driftAssessmentId && !assessment)
          corrupt(
            `Dispatch gate receipt ${receipt.receiptId} has a missing drift assessment reference.`,
          );
        if (receipt.result === "allowed") {
          if (
            !plan ||
            plan.status !== "authorized" ||
            !authorization ||
            !assessment ||
            assessment.status !== "fresh" ||
            !samePlanReference(authorization.plan, plan.contract) ||
            !samePlanReference(assessment.plan, plan.contract)
          )
            corrupt(
              `Allowed dispatch gate receipt ${receipt.receiptId} lacks exact authorized fresh-plan evidence.`,
            );
          plans.set(
            planKey(
              event.changeId,
              waveId,
              plan.contract.planId,
              plan.contract.revision,
            ),
            {
              ...plan,
              status: "dispatched",
              updatedSequence: event.sequence,
            },
          );
        }
        dispatchGateReceipts.set(receipt.receiptId, receipt);
        planningEvent = event as DispatchGateEvaluatedEvent;
      } else if (event.type === "architect.replan-recorded") {
        assertPayloadKeys(event, ["receipt"]);
        const receipt = validatePlanningContractSchema(
          event.payload.receipt,
          "ArchitectReplanReceiptV1",
          true,
        );
        assertReceiptScope(
          receipt,
          event.projectId,
          event.changeId,
          waveId,
          true,
        );
        if (event.actor !== receipt.proposedBy)
          corrupt(`Architect receipt event ${event.id} has a mismatched proposer.`);
        if (replanReceipts.has(receipt.receiptId))
          corrupt(`Duplicate architect receipt ID: ${receipt.receiptId}.`);
        const prior = plans.get(
          planKey(
            event.changeId,
            waveId,
            receipt.priorPlan.planId,
            receipt.priorPlan.revision,
          ),
        );
        const replacement = plans.get(
          planKey(
            event.changeId,
            waveId,
            receipt.replacementPlan.planId,
            receipt.replacementPlan.revision,
          ),
        );
        if (
          !prior ||
          !samePlanReference(receipt.priorPlan, prior.contract) ||
          !replacement ||
          !samePlanReference(receipt.replacementPlan, replacement.contract)
        )
          corrupt(
            `Architect receipt ${receipt.receiptId} has a missing or mismatched plan reference.`,
          );
        if (
          !replacement.contract.predecessor ||
          !samePlanReference(
            replacement.contract.predecessor,
            prior.contract,
          )
        )
          corrupt(
            `Architect receipt ${receipt.receiptId} does not match replacement predecessor lineage.`,
          );
        if (replacement.status !== "proposed")
          corrupt(
            `Architect receipt ${receipt.receiptId} was recorded after a plan decision.`,
          );
        const assessmentIssue = replanReceiptAssessmentIssue(
          receipt,
          prior,
          driftAssessments,
        );
        if (assessmentIssue === "missing")
          corrupt(
            `Architect receipt ${receipt.receiptId} has a missing drift assessment.`,
          );
        if (assessmentIssue === "not-stale-prior")
          corrupt(
            `Architect receipt ${receipt.receiptId} does not reference a stale assessment for its prior plan.`,
          );
        assertReceiptTimestamps(
          receipt,
          driftAssessments.get(receipt.driftAssessmentId)!,
          replacement,
          event.occurredAt,
          true,
        );
        if (
          [...replanReceipts.values()].some((candidate) =>
            samePlanReference(
              candidate.replacementPlan,
              replacement.contract,
            ),
          )
        )
          corrupt(
            `Replacement plan ${replacement.contract.planId} revision ${replacement.contract.revision} has duplicate architect receipts.`,
          );
        replanReceipts.set(receipt.receiptId, receipt);
        planningEvent = event as ArchitectReplanRecordedEvent;
      } else {
        assertPayloadKeys(event, ["priorPlan", "replacementPlan"]);
        const priorReference = requireStoredPlanReference(
          event.payload.priorPlan,
          "priorPlan",
        );
        const replacementReference = requireStoredPlanReference(
          event.payload.replacementPlan,
          "replacementPlan",
        );
        const priorKey = planKey(
          event.changeId,
          waveId,
          priorReference.planId,
          priorReference.revision,
        );
        const replacementKey = planKey(
          event.changeId,
          waveId,
          replacementReference.planId,
          replacementReference.revision,
        );
        const prior = plans.get(priorKey);
        const replacement = plans.get(replacementKey);
        if (
          !prior ||
          !samePlanReference(priorReference, prior.contract) ||
          !replacement ||
          !samePlanReference(replacementReference, replacement.contract)
        )
          corrupt(`Plan supersession event ${event.id} has a missing reference.`);
        if (
          !["authorized", "stale"].includes(prior.status) ||
          replacement.status !== "authorized" ||
          !replacement.contract.predecessor ||
          !samePlanReference(replacement.contract.predecessor, prior.contract)
        )
          corrupt(`Plan supersession event ${event.id} is semantically invalid.`);
        plans.set(priorKey, {
          ...prior,
          status: "superseded",
          updatedSequence: event.sequence,
        });
        planningEvent = event as PlanSupersededEvent;
      }
      eventsByWave.get(scopedWaveKey)!.push(event);
      const scopedEvents = planningEventsByWave.get(scopedWaveKey) ?? [];
      scopedEvents.push(planningEvent);
      planningEventsByWave.set(scopedWaveKey, scopedEvents);
    } else {
      const waveId = requireStoredIdentifier(event.waveId, "waveId");
      const taskId = requireStoredIdentifier(event.taskId, "taskId");
      const wave = waves.get(waveKey(event.changeId, waveId));
      if (!wave) corrupt(`Task event ${event.id} precedes wave creation.`);
      const key = taskKey(event.changeId, waveId, taskId);
      const current = tasks.get(key);
      requireStoredData(event);
      if (event.type === "task.created") {
        assertPayloadKeys(event, ["data", "dependsOn", "status"]);
        if (event.payload.status !== "pending" || current)
          corrupt(`Event ${event.id} has an invalid task.created payload.`);
        const dependsOn = requireStoredStringArray(
          event.payload.dependsOn,
          "dependsOn",
        );
        if (dependsOn.includes(taskId))
          corrupt(`Task ${taskId} cannot depend on itself.`);
        tasks.set(key, {
          projectId: event.projectId,
          changeId: event.changeId,
          waveId,
          taskId,
          status: "pending",
          sequence: event.sequence,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          createdBy: event.actor,
          lastActor: event.actor,
          dependsOn,
          details: event.payload.data as JsonObject,
        });
        taskCreatedSequences.set(key, event.sequence);
      } else {
        if (!current)
          corrupt(`Task transition ${event.id} precedes task creation.`);
        const target =
          taskTargetForType[event.type as keyof typeof taskTargetForType];
        assertPayloadKeys(event, ["data", "from", "to"]);
        if (
          event.payload.from !== current.status ||
          event.payload.to !== target ||
          !legalTaskTargets[current.status].includes(target)
        )
          corrupt(
            `Illegal persisted task transition for ${taskId}: ${current.status} -> ${target}.`,
          );
        if (
          event.type === "task.readied" &&
          !taskDependenciesAccepted(current, tasks)
        )
          corrupt(`Task ${taskId} was readied with unmet dependencies.`);
        if (
          event.type === "task.started" &&
          !["dispatched", "running"].includes(wave.status)
        )
          corrupt(`Task ${taskId} started before its wave was dispatched.`);
        tasks.set(key, {
          ...current,
          status: target,
          sequence: event.sequence,
          updatedAt: event.occurredAt,
          lastActor: event.actor,
        });
      }
      eventsByWave.get(waveKey(event.changeId, waveId))!.push(event);
    }
    previousHash = hash;
  });

  for (const wave of waves.values()) assertTaskGraph(wave, tasks);

  return {
    projections,
    waves,
    tasks,
    plans,
    planKeysByRevision,
    authorizations,
    driftAssessments,
    dispatchGateReceipts,
    replanReceipts,
    taskCreatedSequences,
    eventsByChange,
    eventsByWave,
    planningEventsByWave,
  };
}

function immutableAggregate(
  projection: ChangeProjection,
  events: readonly ChangeControlEvent[],
): ChangeAggregate {
  return deepFreeze({
    change: structuredClone(projection),
    events: structuredClone(events),
  });
}

function publicWaveProjection(
  wave: StoredWaveProjection,
  projected: ProjectedLedger,
): WaveProjection {
  const tasks = [...projected.tasks.values()]
    .filter(
      (task) =>
        task.changeId === wave.changeId && task.waveId === wave.waveId,
    )
    .sort(
      (left, right) =>
        projected.taskCreatedSequences.get(
          taskKey(left.changeId, left.waveId, left.taskId),
        )! -
        projected.taskCreatedSequences.get(
          taskKey(right.changeId, right.waveId, right.taskId),
        )!,
    );
  const reasons = waveReadinessReasons(
    wave,
    projected.waves,
    projected.tasks,
  );
  return {
    ...wave,
    tasks,
    readiness: {
      ready: wave.status === "ready" && reasons.length === 0,
      reasons,
    },
  };
}

function immutableWaveAggregate(
  wave: StoredWaveProjection,
  events: readonly ChangeControlEvent[],
  projected: ProjectedLedger,
): WaveAggregate {
  return deepFreeze({
    wave: structuredClone(publicWaveProjection(wave, projected)),
    events: structuredClone(events),
  });
}

function immutablePlanningProjection(
  projectId: string,
  changeId: string,
  waveId: string,
  projected: ProjectedLedger,
): WavePlanningProjectionV1 {
  const plans = wavePlans(projected, changeId, waveId);
  const authorizations = [...projected.authorizations.values()]
    .filter(
      (authorization) =>
        authorization.changeId === changeId &&
        authorization.waveId === waveId,
    )
    .sort((left, right) => {
      const leftPlan = plans.find((plan) =>
        samePlanReference(left.plan, plan.contract),
      )!;
      const rightPlan = plans.find((plan) =>
        samePlanReference(right.plan, plan.contract),
      )!;
      return leftPlan.updatedSequence - rightPlan.updatedSequence;
    });
  const replanReceipts = [...projected.replanReceipts.values()]
    .filter(
      (receipt) =>
        receipt.changeId === changeId && receipt.waveId === waveId,
    )
    .sort(
      (left, right) =>
      left.replacementPlan.revision - right.replacementPlan.revision,
    );
  const driftAssessments = [...projected.driftAssessments.values()].filter(
    (assessment) =>
      plans.some((plan) => samePlanReference(assessment.plan, plan.contract)),
  );
  const dispatchGateReceipts = [
    ...projected.dispatchGateReceipts.values(),
  ].filter(
    (receipt) =>
      receipt.changeId === changeId && receipt.waveId === waveId,
  );
  return deepFreeze(
    structuredClone({
      projectId,
      changeId,
      waveId,
      plans,
      authorizations,
      driftAssessments,
      dispatchGateReceipts,
      replanReceipts,
      events: projected.planningEventsByWave.get(waveKey(changeId, waveId)) ?? [],
    }),
  );
}

async function readLedger(file: string, projectId: string): Promise<Ledger> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Ledger;
    if (!parsed || typeof parsed !== "object")
      corrupt("The change-control ledger root is invalid.");
    if (parsed.projectId !== projectId)
      corrupt("The change-control ledger project identity does not match its path.");
    validateAndProject(parsed);
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { version: 1, projectId, events: [] };
    if (error instanceof ChangeControlError) throw error;
    throw new ChangeControlError(
      "The change-control ledger is not valid JSON.",
      "CORRUPT_LEDGER",
      500,
    );
  }
}

async function writeAtomically(file: string, ledger: Ledger) {
  const directory = dirname(file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  const directoryHandle = await open(directory, "r").catch(() => undefined);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx");
    await handle.writeFile(JSON.stringify(ledger, null, 2), "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    await directoryHandle?.sync().catch(() => undefined);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  } finally {
    await directoryHandle?.close().catch(() => undefined);
  }
}

function normalizeDependencies(value: unknown, field: string) {
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value)) invalid(`${field} must be an array of IDs.`);
  const result = value.map((item) => requireIdentifier(item, field)).sort();
  if (new Set(result).size !== result.length)
    invalid(`${field} cannot contain duplicate IDs.`);
  return result;
}

function normalizeTasks(value: unknown) {
  if (!Array.isArray(value) || value.length === 0)
    invalid("tasks must be a non-empty array.");
  const tasks = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      invalid(`tasks[${index}] must be an object.`);
    const input = candidate as CreateTaskInput;
    return {
      taskId: requireIdentifier(input.taskId, `tasks[${index}].taskId`),
      dependsOn: normalizeDependencies(
        input.dependsOn,
        `tasks[${index}].dependsOn`,
      ),
      payload: normalizePayload(input.payload),
    };
  });
  const byId = new Map<string, (typeof tasks)[number]>();
  for (const task of tasks) {
    if (byId.has(task.taskId))
      invalid(`Duplicate task ID: ${task.taskId}.`);
    byId.set(task.taskId, task);
  }
  for (const task of tasks) {
    if (task.dependsOn.includes(task.taskId))
      invalid(`Task ${task.taskId} cannot depend on itself.`);
    for (const dependencyId of task.dependsOn) {
      if (!byId.has(dependencyId))
        invalid(
          `Task ${task.taskId} has missing dependency ${dependencyId}.`,
        );
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visiting.has(taskId))
      invalid("The wave task graph contains a dependency cycle.");
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId)!.dependsOn)
      visit(dependencyId);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.taskId);
  return tasks;
}

export class ChangeControlStore {
  private readonly writeChains = new Map<string, Promise<void>>();
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly resolveRepositorySnapshot?: (
    projectId: string,
  ) => Promise<TrustedRepositorySnapshotV1>;

  constructor(
    private readonly rootDirectory: string,
    options: ChangeControlStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? randomUUID;
    this.resolveRepositorySnapshot = options.resolveRepositorySnapshot;
  }

  private file(projectId: string) {
    const digest = createHash("sha256").update(projectId).digest("hex");
    return join(this.rootDirectory, "projects", `${digest}.json`);
  }

  private serialize<T>(projectId: string, operation: () => Promise<T>) {
    const previous = this.writeChains.get(projectId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const settled = next.then(() => undefined, () => undefined);
    this.writeChains.set(projectId, settled);
    void settled
      .finally(() => {
        if (this.writeChains.get(projectId) === settled)
          this.writeChains.delete(projectId);
      })
      .catch(() => undefined);
    return next;
  }

  private append(ledger: Ledger, draft: EventDraft) {
    const previous = ledger.events.at(-1);
    const hashInput: Omit<ChangeControlEvent, "hash"> = {
      ...draft,
      sequence: ledger.events.length + 1,
      previousHash: previous?.hash ?? null,
    };
    const event = deepFreeze({
      ...hashInput,
      hash: eventHash(hashInput),
    }) as ChangeControlEvent;
    ledger.events.push(event);
    return event;
  }

  private refreshTaskReadiness(
    ledger: Ledger,
    changeId: string,
    waveId: string,
    actor: string,
    causationId: string,
    correlationId: string,
  ) {
    let projected = validateAndProject(ledger);
    const pending = [...projected.tasks.values()]
      .filter(
        (task) =>
          task.changeId === changeId &&
          task.waveId === waveId &&
          task.status === "pending",
      )
      .sort(
        (left, right) =>
          projected.taskCreatedSequences.get(
            taskKey(left.changeId, left.waveId, left.taskId),
          )! -
          projected.taskCreatedSequences.get(
            taskKey(right.changeId, right.waveId, right.taskId),
          )!,
      );
    for (const task of pending) {
      const current = projected.tasks.get(
        taskKey(changeId, waveId, task.taskId),
      )!;
      if (!taskDependenciesAccepted(current, projected.tasks)) continue;
      this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type: "task.readied",
        occurredAt: this.now(),
        projectId: ledger.projectId,
        changeId,
        waveId,
        taskId: task.taskId,
        actor,
        causationId,
        correlationId,
        payload: { from: "pending", to: "ready", data: {} },
      });
      projected = validateAndProject(ledger);
    }
  }

  private refreshWaveReadiness(
    ledger: Ledger,
    changeId: string,
    actor: string,
    causationId: string,
  ) {
    let projected = validateAndProject(ledger);
    const drafts = [...projected.waves.values()]
      .filter(
        (wave) => wave.changeId === changeId && wave.status === "draft",
      )
      .sort((left, right) => left.sequence - right.sequence);
    for (const wave of drafts) {
      const current = projected.waves.get(waveKey(changeId, wave.waveId))!;
      if (
        waveReadinessReasons(
          current,
          projected.waves,
          projected.tasks,
        ).length > 0
      )
        continue;
      const firstEvent = projected.eventsByWave.get(
        waveKey(changeId, wave.waveId),
      )![0];
      this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type: "wave.readied",
        occurredAt: this.now(),
        projectId: ledger.projectId,
        changeId,
        waveId: wave.waveId,
        actor,
        causationId,
        correlationId: firstEvent.correlationId,
        payload: { from: "draft", to: "ready", data: {} },
      });
      projected = validateAndProject(ledger);
    }
  }

  async create(
    projectIdValue: string,
    input: CreateChangeInput,
  ): Promise<ChangeAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const actor = requireIdentity(input?.actor, "actor");
    const changeId = requireIdentifier(
      input?.changeId ?? this.createId(),
      "changeId",
    );
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const current = validateAndProject(ledger);
      if (current.projections.has(changeId))
        throw new ChangeControlError(
          `Change ${changeId} already exists.`,
          "CONFLICT",
          409,
        );
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: "change.created",
        occurredAt: this.now(),
        projectId,
        changeId,
        actor,
        causationId: requireIdentity(input.causationId ?? id, "causationId"),
        correlationId: requireIdentity(
          input.correlationId ?? changeId,
          "correlationId",
        ),
        payload: { status: "draft", data },
      });
      const projected = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableAggregate(
        projected.projections.get(changeId)!,
        projected.eventsByChange.get(changeId)!,
      );
    });
  }

  async list(projectIdValue: string): Promise<readonly ChangeProjection[]> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const { projections } = validateAndProject(ledger);
    return deepFreeze(
      [...projections.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((projection) => structuredClone(projection)),
    );
  }

  async get(
    projectIdValue: string,
    changeIdValue: string,
  ): Promise<ChangeAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    const projection = projected.projections.get(changeId);
    if (!projection)
      throw new ChangeControlError(
        `Change ${changeId} was not found.`,
        "NOT_FOUND",
        404,
      );
    return immutableAggregate(
      projection,
      projected.eventsByChange.get(changeId)!,
    );
  }

  async transition(
    projectIdValue: string,
    changeIdValue: string,
    input: TransitionChangeInput,
  ): Promise<ChangeAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const actor = requireIdentity(input?.actor, "actor");
    const target = input?.to;
    if (
      target === "draft" ||
      !["planned", "active", "completed", "cancelled"].includes(target)
    )
      invalid(`Unknown or unsupported change transition target: ${String(target)}.`);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const current = projected.projections.get(changeId);
      if (!current)
        throw new ChangeControlError(
          `Change ${changeId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (!legalTargets[current.status].includes(target))
        throw new ChangeControlError(
          `Illegal change transition: ${current.status} -> ${target}.`,
          "CONFLICT",
          409,
        );
      const id = requireIdentifier(this.createId(), "id");
      const changeEvents = projected.eventsByChange.get(changeId)!;
      const previousEvent = changeEvents.at(-1)!;
      const firstEvent = changeEvents[0];
      this.append(ledger, {
        id,
        type: typeForTarget[target],
        occurredAt: this.now(),
        projectId,
        changeId,
        actor,
        causationId: requireIdentity(
          input.causationId ?? previousEvent.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? firstEvent.correlationId,
          "correlationId",
        ),
        payload: { from: current.status, to: target, data },
      });
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableAggregate(
        next.projections.get(changeId)!,
        next.eventsByChange.get(changeId)!,
      );
    });
  }

  async createWave(
    projectIdValue: string,
    changeIdValue: string,
    input: CreateWaveInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const actor = requireIdentity(input?.actor, "actor");
    const waveId = requireIdentifier(
      input?.waveId ?? this.createId(),
      "waveId",
    );
    const dependsOn = normalizeDependencies(input?.dependsOn, "dependsOn");
    if (dependsOn.includes(waveId))
      invalid(`Wave ${waveId} cannot depend on itself.`);
    const tasks = normalizeTasks(input?.tasks);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const change = projected.projections.get(changeId);
      if (!change)
        throw new ChangeControlError(
          `Change ${changeId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (["completed", "cancelled"].includes(change.status))
        throw new ChangeControlError(
          `Cannot add a wave to ${change.status} change ${changeId}.`,
          "CONFLICT",
          409,
        );
      if (projected.waves.has(waveKey(changeId, waveId)))
        throw new ChangeControlError(
          `Wave ${waveId} already exists in change ${changeId}.`,
          "CONFLICT",
          409,
        );
      for (const dependencyWaveId of dependsOn) {
        if (!projected.waves.has(waveKey(changeId, dependencyWaveId)))
          invalid(
            `Wave ${waveId} has missing dependency ${dependencyWaveId}.`,
          );
      }

      const changeEvents = projected.eventsByChange.get(changeId)!;
      const waveEventId = requireIdentifier(this.createId(), "id");
      const causationId = requireIdentity(
        input.causationId ?? changeEvents.at(-1)!.id,
        "causationId",
      );
      const correlationId = requireIdentity(
        input.correlationId ?? changeEvents[0].correlationId,
        "correlationId",
      );
      this.append(ledger, {
        id: waveEventId,
        type: "wave.created",
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        actor,
        causationId,
        correlationId,
        payload: { status: "draft", dependsOn, data },
      });
      for (const task of tasks) {
        this.append(ledger, {
          id: requireIdentifier(this.createId(), "id"),
          type: "task.created",
          occurredAt: this.now(),
          projectId,
          changeId,
          waveId,
          taskId: task.taskId,
          actor,
          causationId: waveEventId,
          correlationId,
          payload: {
            status: "pending",
            dependsOn: task.dependsOn,
            data: task.payload,
          },
        });
      }
      this.refreshTaskReadiness(
        ledger,
        changeId,
        waveId,
        actor,
        waveEventId,
        correlationId,
      );
      this.refreshWaveReadiness(
        ledger,
        changeId,
        actor,
        waveEventId,
      );
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      const wave = next.waves.get(waveKey(changeId, waveId))!;
      return immutableWaveAggregate(
        wave,
        next.eventsByWave.get(waveKey(changeId, waveId))!,
        next,
      );
    });
  }

  async listWaves(
    projectIdValue: string,
    changeIdValue: string,
  ): Promise<readonly WaveProjection[]> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    if (!projected.projections.has(changeId))
      throw new ChangeControlError(
        `Change ${changeId} was not found.`,
        "NOT_FOUND",
        404,
      );
    return deepFreeze(
      [...projected.waves.values()]
        .filter((wave) => wave.changeId === changeId)
        .sort((left, right) => left.sequence - right.sequence)
        .map((wave) =>
          structuredClone(publicWaveProjection(wave, projected)),
        ),
    );
  }

  async getWave(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    const wave = projected.waves.get(waveKey(changeId, waveId));
    if (!wave)
      throw new ChangeControlError(
        `Wave ${waveId} was not found in change ${changeId}.`,
        "NOT_FOUND",
        404,
      );
    return immutableWaveAggregate(
      wave,
      projected.eventsByWave.get(waveKey(changeId, waveId))!,
      projected,
    );
  }

  async getPlanningProjection(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
  ): Promise<WavePlanningProjectionV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    if (!projected.waves.has(waveKey(changeId, waveId)))
      throw new ChangeControlError(
        `Wave ${waveId} was not found in change ${changeId}.`,
        "NOT_FOUND",
        404,
      );
    return immutablePlanningProjection(
      projectId,
      changeId,
      waveId,
      projected,
    );
  }

  async publishPlanningContract(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: PublishPlanningContractInput,
  ): Promise<WavePlanningProjectionV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const contract = normalizePlanningContract(
      input?.contract,
      "PlanningContractV1",
    );

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const scopedWaveKey = waveKey(changeId, waveId);
      if (!projected.waves.has(scopedWaveKey))
        throw new ChangeControlError(
          `Wave ${waveId} was not found in change ${changeId}.`,
          "NOT_FOUND",
          404,
        );
      const occurredAt = this.now();
      assertPlanningContractSemantics(
        contract,
        projectId,
        changeId,
        waveId,
        projected.tasks,
        false,
        occurredAt,
      );
      const key = planKey(changeId, waveId, contract.planId, contract.revision);
      const revisionKey = planRevisionKey(changeId, waveId, contract.revision);
      if (
        projected.plans.has(key) ||
        projected.planKeysByRevision.has(revisionKey)
      )
        throw new ChangeControlError(
          `Plan revision ${contract.revision} already exists in wave ${waveId}.`,
          "CONFLICT",
          409,
        );
      const latest = wavePlans(projected, changeId, waveId).at(-1);
      if (!latest) {
        if (contract.revision !== 1)
          throw new ChangeControlError(
            `The first plan for wave ${waveId} must be revision 1.`,
            "CONFLICT",
            409,
          );
      } else if (
        contract.revision <= latest.contract.revision ||
        !contract.predecessor ||
        !samePlanReference(contract.predecessor, latest.contract)
      ) {
        throw new ChangeControlError(
          `Plan revision ${contract.revision} must increase and identify the exact latest predecessor.`,
          "CONFLICT",
          409,
        );
      } else if (!["stale", "rejected"].includes(latest.status)) {
        throw new ChangeControlError(
          `Plan revision ${contract.revision} requires its exact predecessor to be stale or rejected.`,
          "CONFLICT",
          409,
        );
      }

      const waveEvents = projected.eventsByWave.get(scopedWaveKey)!;
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: "plan.proposed",
        occurredAt,
        projectId,
        changeId,
        waveId,
        actor: contract.createdBy,
        causationId: requireIdentity(
          input.causationId ?? waveEvents.at(-1)!.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload: {
          contract: structuredClone(contract) as unknown as JsonValue,
        },
      });
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutablePlanningProjection(
        projectId,
        changeId,
        waveId,
        next,
      );
    });
  }

  async publishArchitectReplanReceipt(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: PublishArchitectReplanReceiptInput,
  ): Promise<WavePlanningProjectionV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const receipt = normalizePlanningContract(
      input?.receipt,
      "ArchitectReplanReceiptV1",
    );

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const scopedWaveKey = waveKey(changeId, waveId);
      if (!projected.waves.has(scopedWaveKey))
        throw new ChangeControlError(
          `Wave ${waveId} was not found in change ${changeId}.`,
          "NOT_FOUND",
          404,
        );
      assertReceiptScope(receipt, projectId, changeId, waveId, false);
      if (projected.replanReceipts.has(receipt.receiptId))
        throw new ChangeControlError(
          `Architect receipt ${receipt.receiptId} already exists.`,
          "CONFLICT",
          409,
        );
      const prior = projected.plans.get(
        planKey(
          changeId,
          waveId,
          receipt.priorPlan.planId,
          receipt.priorPlan.revision,
        ),
      );
      const replacement = projected.plans.get(
        planKey(
          changeId,
          waveId,
          receipt.replacementPlan.planId,
          receipt.replacementPlan.revision,
        ),
      );
      if (
        !prior ||
        !samePlanReference(receipt.priorPlan, prior.contract) ||
        !replacement ||
        !samePlanReference(receipt.replacementPlan, replacement.contract)
      )
        throw new ChangeControlError(
          `Architect receipt ${receipt.receiptId} has a missing or mismatched plan reference.`,
          "NOT_FOUND",
          404,
        );
      if (
        !replacement.contract.predecessor ||
        !samePlanReference(replacement.contract.predecessor, prior.contract)
      )
        throw new ChangeControlError(
          `Architect receipt ${receipt.receiptId} does not match replacement predecessor lineage.`,
          "CONFLICT",
          409,
        );
      if (replacement.status !== "proposed")
        throw new ChangeControlError(
          `Architect receipt ${receipt.receiptId} cannot be recorded after a plan decision.`,
          "CONFLICT",
          409,
        );
      const assessmentIssue = replanReceiptAssessmentIssue(
        receipt,
        prior,
        projected.driftAssessments,
      );
      if (assessmentIssue === "missing")
        throw new ChangeControlError(
          `Architect receipt ${receipt.receiptId} has a missing drift assessment.`,
          "NOT_FOUND",
          404,
        );
      if (assessmentIssue === "not-stale-prior")
        throw new ChangeControlError(
          `Architect receipt ${receipt.receiptId} does not reference a stale assessment for its prior plan.`,
          "CONFLICT",
          409,
        );
      const occurredAt = this.now();
      assertReceiptTimestamps(
        receipt,
        projected.driftAssessments.get(receipt.driftAssessmentId)!,
        replacement,
        occurredAt,
        false,
      );
      if (
        [...projected.replanReceipts.values()].some((candidate) =>
          samePlanReference(candidate.replacementPlan, replacement.contract),
        )
      )
        throw new ChangeControlError(
          `Replacement plan ${replacement.contract.planId} revision ${replacement.contract.revision} already has an architect receipt.`,
          "CONFLICT",
          409,
        );

      const waveEvents = projected.eventsByWave.get(scopedWaveKey)!;
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: "architect.replan-recorded",
        occurredAt,
        projectId,
        changeId,
        waveId,
        actor: receipt.proposedBy,
        causationId: requireIdentity(
          input.causationId ?? replacement.proposedEventId,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload: {
          receipt: structuredClone(receipt) as unknown as JsonValue,
        },
      });
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutablePlanningProjection(
        projectId,
        changeId,
        waveId,
        next,
      );
    });
  }

  async publishPlanAuthorization(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: PublishPlanAuthorizationInput,
  ): Promise<WavePlanningProjectionV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const authorization = normalizePlanningContract(
      input?.authorization,
      "PlanAuthorizationV1",
    );

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const scopedWaveKey = waveKey(changeId, waveId);
      if (!projected.waves.has(scopedWaveKey))
        throw new ChangeControlError(
          `Wave ${waveId} was not found in change ${changeId}.`,
          "NOT_FOUND",
          404,
        );
      assertAuthorizationScope(
        authorization,
        projectId,
        changeId,
        waveId,
        false,
      );
      if (projected.authorizations.has(authorization.authorizationId))
        throw new ChangeControlError(
          `Plan authorization ${authorization.authorizationId} already exists.`,
          "CONFLICT",
          409,
        );
      const key = planKey(
        changeId,
        waveId,
        authorization.plan.planId,
        authorization.plan.revision,
      );
      const plan = projected.plans.get(key);
      if (!plan || !samePlanReference(authorization.plan, plan.contract))
        throw new ChangeControlError(
          `Plan authorization ${authorization.authorizationId} has a missing or mismatched plan reference.`,
          "NOT_FOUND",
          404,
        );
      const occurredAt = this.now();
      assertAuthorizationTimestamps(
        authorization,
        plan,
        occurredAt,
        false,
      );
      if (plan.status !== "proposed")
        throw new ChangeControlError(
          `Plan ${authorization.plan.planId} revision ${authorization.plan.revision} already has a terminal decision.`,
          "CONFLICT",
          409,
        );
      if (authorization.decidedBy === plan.contract.createdBy)
        throw new ChangeControlError(
          `Plan ${authorization.plan.planId} revision ${authorization.plan.revision} cannot authorize itself.`,
          "CONFLICT",
          409,
        );
      const matchingReceipts = [...projected.replanReceipts.values()].filter(
        (receipt) => samePlanReference(receipt.replacementPlan, plan.contract),
      );
      if (
        matchingReceipts.some(
          (receipt) => receipt.proposedBy === authorization.decidedBy,
        )
      )
        throw new ChangeControlError(
          `Architect proposal ${authorization.plan.planId} revision ${authorization.plan.revision} cannot authorize itself.`,
          "CONFLICT",
          409,
        );
      if (
        plan.contract.revision > 1 &&
        authorization.decision === "authorized"
      ) {
        const predecessor = plan.contract.predecessor
          ? projected.plans.get(
              planKey(
                changeId,
                waveId,
                plan.contract.predecessor.planId,
                plan.contract.predecessor.revision,
              ),
            )
          : undefined;
        const expectedReceipts = predecessor?.status === "rejected" ? 0 : 1;
        if (matchingReceipts.length !== expectedReceipts)
          throw new ChangeControlError(
            `Replacement plan ${authorization.plan.planId} revision ${authorization.plan.revision} requires ${expectedReceipts === 0 ? "no" : "exactly one architect"} replan receipt for its predecessor state.`,
            "CONFLICT",
            409,
          );
      }

      const waveEvents = projected.eventsByWave.get(scopedWaveKey)!;
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type:
          authorization.decision === "authorized"
            ? "plan.authorized"
            : "plan.rejected",
        occurredAt,
        projectId,
        changeId,
        waveId,
        actor: authorization.decidedBy,
        causationId: requireIdentity(
          input.causationId ?? plan.proposedEventId,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload: {
          authorization:
            structuredClone(authorization) as unknown as JsonValue,
        },
      });
      let next = validateAndProject(ledger);
      if (
        authorization.decision === "authorized" &&
        plan.contract.predecessor
      ) {
        const prior = next.plans.get(
          planKey(
            changeId,
            waveId,
            plan.contract.predecessor.planId,
            plan.contract.predecessor.revision,
          ),
        );
        if (
          prior &&
          ["authorized", "stale"].includes(prior.status) &&
          samePlanReference(plan.contract.predecessor, prior.contract)
        ) {
          this.append(ledger, {
            id: requireIdentifier(this.createId(), "id"),
            type: "plan.superseded",
            occurredAt: this.now(),
            projectId,
            changeId,
            waveId,
            actor: authorization.decidedBy,
            causationId: id,
            correlationId: requireIdentity(
              input.correlationId ?? waveEvents[0].correlationId,
              "correlationId",
            ),
            payload: {
              priorPlan:
                structuredClone(plan.contract.predecessor) as unknown as JsonValue,
              replacementPlan:
                structuredClone(authorization.plan) as unknown as JsonValue,
            },
          });
          next = validateAndProject(ledger);
        }
      }
      await writeAtomically(file, ledger);
      return immutablePlanningProjection(
        projectId,
        changeId,
        waveId,
        next,
      );
    });
  }

  async dispatchWave(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: DispatchWaveInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const actor = requireIdentity(input?.actor, "actor");
    const sendAnyway = input?.sendAnyway === true;
    const reason = sendAnyway
      ? requireIdentity(input?.reason, "reason")
      : undefined;
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const key = waveKey(changeId, waveId);
      const wave = projected.waves.get(key);
      if (!wave)
        throw new ChangeControlError(
          `Wave ${waveId} was not found in change ${changeId}.`,
          "NOT_FOUND",
          404,
        );
      const phaseOneReasons = dispatchReadinessReasons(
        wave,
        projected.waves,
        projected.tasks,
      );
      const waveEvents = projected.eventsByWave.get(key)!;

      // A project ledger opts into Planning and Drift Contract v1 when its
      // first planning contract is published. Ledgers with no planning events
      // retain the exact Phase 1 dispatch behavior for replay compatibility.
      if (projected.plans.size === 0) {
        if (phaseOneReasons.length > 0 && !sendAnyway)
          throw new ChangeControlError(
            `Wave ${waveId} is not ready for dispatch.`,
            "NOT_READY",
            409,
            deepFreeze(structuredClone(phaseOneReasons)),
          );
        if (phaseOneReasons.length > 0 && wave.status !== "draft")
          throw new ChangeControlError(
            `Send-anyway cannot dispatch a ${wave.status} wave.`,
            "CONFLICT",
            409,
          );
        const id = requireIdentifier(this.createId(), "id");
        this.append(ledger, {
          id,
          type:
            phaseOneReasons.length > 0
              ? "wave.dispatch-overridden"
              : "wave.dispatched",
          occurredAt: this.now(),
          projectId,
          changeId,
          waveId,
          actor,
          causationId: requireIdentity(
            input.causationId ?? waveEvents.at(-1)!.id,
            "causationId",
          ),
          correlationId: requireIdentity(
            input.correlationId ?? waveEvents[0].correlationId,
            "correlationId",
          ),
          payload:
            phaseOneReasons.length > 0
              ? {
                  from: wave.status,
                  to: "dispatched",
                  reason: reason!,
                  reasons:
                    structuredClone(phaseOneReasons) as unknown as JsonValue,
                  data,
                }
              : { from: "ready", to: "dispatched", data },
        });
        const next = validateAndProject(ledger);
        await writeAtomically(file, ledger);
        return immutableWaveAggregate(
          next.waves.get(key)!,
          next.eventsByWave.get(key)!,
          next,
        );
      }

      const gateReasons = new Set<DispatchGateReasonV1>();
      const latestPlan = wavePlans(projected, changeId, waveId).at(-1);
      if (!latestPlan) gateReasons.add("PLAN_REQUIRED");
      if (
        latestPlan &&
        !dispatchContractValid(latestPlan.contract)
      )
        gateReasons.add("PLAN_CONTRACT_INVALID");
      if (latestPlan?.status === "stale") gateReasons.add("PLAN_STALE");
      else if (latestPlan && latestPlan.status !== "authorized")
        gateReasons.add("PLAN_NOT_AUTHORIZED");
      if (
        latestPlan &&
        !validReplacementReceipt(latestPlan, projected)
      )
        gateReasons.add("REPLAN_RECEIPT_REQUIRED");
      if (latestPlan && !executableBlockingOracles(latestPlan.contract))
        gateReasons.add("ACCEPTANCE_ORACLE_UNEXECUTABLE");
      if (latestPlan && !evidencedBlastRadius(latestPlan.contract))
        gateReasons.add("BLAST_RADIUS_UNEVIDENCED");

      let assessment: DriftAssessmentV1 | undefined;
      if (latestPlan?.status === "authorized") {
        let snapshot: TrustedRepositorySnapshotV1 | undefined;
        try {
          snapshot = await this.resolveRepositorySnapshot?.(projectId);
        } catch {
          snapshot = undefined;
        }
        if (!validTrustedRepositorySnapshot(snapshot))
          gateReasons.add("CURRENT_BASE_UNREADABLE");
        else {
          assessment = driftAssessmentFor(
            requireIdentifier(this.createId(), "assessmentId"),
            latestPlan,
            snapshot,
            this.now(),
          );
          if (snapshot.worktreeState === "dirty")
            gateReasons.add("CURRENT_WORKTREE_DIRTY");
          if (
            snapshot.repositoryId !==
              latestPlan.contract.planBase.repositoryId ||
            snapshot.sha !== latestPlan.contract.planBase.sha ||
            snapshot.hashAlgorithm !==
              latestPlan.contract.planBase.hashAlgorithm
          )
            gateReasons.add("PLAN_BASE_MISMATCH");
          if (
            assessment.reasons.some(
              (driftReason) =>
                !["BASE_SHA_MISMATCH", "WORKTREE_DIRTY"].includes(
                  driftReason.code,
                ),
            )
          )
            gateReasons.add("PLAN_STALE");
        }
      }

      const dependencyOverride =
        sendAnyway && phaseOneReasons.length > 0 && wave.status === "draft";
      if (phaseOneReasons.length > 0 && !dependencyOverride)
        gateReasons.add("WAVE_NOT_READY");

      const correlationId = requireIdentity(
        input.correlationId ?? waveEvents[0].correlationId,
        "correlationId",
      );
      let causationId = requireIdentity(
        input.causationId ?? waveEvents.at(-1)!.id,
        "causationId",
      );
      if (assessment) {
        const assessmentEvent = this.append(ledger, {
          id: requireIdentifier(this.createId(), "id"),
          type:
            assessment.status === "fresh"
              ? "plan.drift-assessed"
              : "plan.marked-stale",
          occurredAt: assessment.assessedAt,
          projectId,
          changeId,
          waveId,
          actor: assessment.assessedBy,
          causationId,
          correlationId,
          payload: {
            assessment:
              structuredClone(assessment) as unknown as JsonValue,
          },
        });
        causationId = assessmentEvent.id;
      }

      const orderedGateReasons = [...gateReasons].sort();
      const gateReceipt: DispatchGateReceiptV1 = {
        contractType: "DispatchGateReceiptV1",
        contractVersion: "1.0",
        receiptId: requireIdentifier(this.createId(), "receiptId"),
        projectId,
        changeId,
        waveId,
        ...(latestPlan
          ? {
              plan: {
                planId: latestPlan.contract.planId,
                revision: latestPlan.contract.revision,
                planBaseSha: latestPlan.contract.planBase.sha,
              },
            }
          : {}),
        ...(latestPlan?.authorization
          ? { authorizationId: latestPlan.authorization.authorizationId }
          : {}),
        ...(assessment
          ? { driftAssessmentId: assessment.assessmentId }
          : {}),
        result: orderedGateReasons.length === 0 ? "allowed" : "rejected",
        reasons: orderedGateReasons,
        evaluatedAt: this.now(),
        evaluatedBy: "dispatch-gate:v1",
      };
      const gateEvent = this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type: "plan.dispatch-validated",
        occurredAt: gateReceipt.evaluatedAt,
        projectId,
        changeId,
        waveId,
        actor: gateReceipt.evaluatedBy,
        causationId,
        correlationId,
        payload: {
          receipt: structuredClone(gateReceipt) as unknown as JsonValue,
        },
      });
      let next = validateAndProject(ledger);
      if (gateReceipt.result === "rejected") {
        await writeAtomically(file, ledger);
        throw new ChangeControlError(
          `Wave ${waveId} was rejected by the Planning and Drift v1 dispatch gate.`,
          "NOT_READY",
          409,
          deepFreeze(structuredClone(orderedGateReasons)),
        );
      }

      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type:
          phaseOneReasons.length > 0
            ? "wave.dispatch-overridden"
            : "wave.dispatched",
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        actor,
        causationId: gateEvent.id,
        correlationId,
        payload:
          phaseOneReasons.length > 0
            ? {
                from: wave.status,
                to: "dispatched",
                reason: reason!,
                reasons:
                  structuredClone(phaseOneReasons) as unknown as JsonValue,
                data,
              }
            : { from: "ready", to: "dispatched", data },
      });
      next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableWaveAggregate(
        next.waves.get(key)!,
        next.eventsByWave.get(key)!,
        next,
      );
    });
  }

  async transitionWave(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: TransitionWaveInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const actor = requireIdentity(input?.actor, "actor");
    const target = input?.to;
    if (!["running", "completed", "halted"].includes(target))
      invalid(`Unknown or unsupported wave transition target: ${String(target)}.`);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const key = waveKey(changeId, waveId);
      const wave = projected.waves.get(key);
      if (!wave)
        throw new ChangeControlError(
          `Wave ${waveId} was not found in change ${changeId}.`,
          "NOT_FOUND",
          404,
        );
      if (!legalWaveTargets[wave.status].includes(target))
        throw new ChangeControlError(
          `Illegal wave transition: ${wave.status} -> ${target}.`,
          "CONFLICT",
          409,
        );
      if (
        target === "completed" &&
        [...projected.tasks.values()].some(
          (task) =>
            task.changeId === changeId &&
            task.waveId === waveId &&
            task.status !== "accepted",
        )
      )
        throw new ChangeControlError(
          `Wave ${waveId} cannot complete before all tasks are accepted.`,
          "CONFLICT",
          409,
        );
      const waveEvents = projected.eventsByWave.get(key)!;
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: waveTypeForTarget[target],
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        actor,
        causationId: requireIdentity(
          input.causationId ?? waveEvents.at(-1)!.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload: { from: wave.status, to: target, data },
      });
      if (target === "completed")
        this.refreshWaveReadiness(ledger, changeId, actor, id);
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableWaveAggregate(
        next.waves.get(key)!,
        next.eventsByWave.get(key)!,
        next,
      );
    });
  }

  async transitionTask(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    taskIdValue: string,
    input: TransitionTaskInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const taskId = requireIdentifier(taskIdValue, "taskId");
    const actor = requireIdentity(input?.actor, "actor");
    const target = input?.to;
    if (!["running", "accepted", "failed", "halted"].includes(target))
      invalid(`Unknown or unsupported task transition target: ${String(target)}.`);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const waveLookupKey = waveKey(changeId, waveId);
      const wave = projected.waves.get(waveLookupKey);
      const key = taskKey(changeId, waveId, taskId);
      const task = projected.tasks.get(key);
      if (!wave || !task)
        throw new ChangeControlError(
          `Task ${taskId} was not found in wave ${waveId}.`,
          "NOT_FOUND",
          404,
        );
      if (!legalTaskTargets[task.status].includes(target))
        throw new ChangeControlError(
          `Illegal task transition: ${task.status} -> ${target}.`,
          "CONFLICT",
          409,
        );
      if (
        target === "running" &&
        !["dispatched", "running"].includes(wave.status)
      )
        throw new ChangeControlError(
          `Task ${taskId} cannot start before wave ${waveId} is dispatched.`,
          "CONFLICT",
          409,
        );
      const waveEvents = projected.eventsByWave.get(waveLookupKey)!;
      const taskEvents = waveEvents.filter(
        (event) => event.taskId === taskId,
      );
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: taskTypeForTarget[target],
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        taskId,
        actor,
        causationId: requireIdentity(
          input.causationId ?? taskEvents.at(-1)!.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload: { from: task.status, to: target, data },
      });
      if (target === "accepted")
        this.refreshTaskReadiness(
          ledger,
          changeId,
          waveId,
          actor,
          id,
          waveEvents[0].correlationId,
        );
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableWaveAggregate(
        next.waves.get(waveLookupKey)!,
        next.eventsByWave.get(waveLookupKey)!,
        next,
      );
    });
  }

  async executionBucket(
    projectIdValue: string,
  ): Promise<readonly ExecutionBucketItem[]> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    const items = [...projected.waves.values()]
      .filter(
        (wave) =>
          wave.status === "ready" &&
          waveReadinessReasons(
            wave,
            projected.waves,
            projected.tasks,
          ).length === 0,
      )
      .map((wave) => ({
        projectId,
        changeId: wave.changeId,
        waveId: wave.waveId,
        readyAt: wave.updatedAt,
        readySequence: wave.sequence,
      }))
      .sort(
        (left, right) =>
          left.readySequence - right.readySequence ||
          left.waveId.localeCompare(right.waveId),
      );
    return deepFreeze(structuredClone(items));
  }
}
