import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv8/dist/2020.js";
import planningDriftV1Schema from "./schemas/planning-drift-v1.schema.json";
import workspaceMergeV1Schema from "./schemas/workspace-merge-v1.schema.json";
import {
  HALT_INCIDENT_EVENT_TYPES_V1,
  HALT_INCIDENT_REASON_CODES_V1,
  WARDEN_EVENT_TYPES_V1,
  WARDEN_DENIAL_REASON_CODES_V1,
  WARDEN_POLICY_V1,
  WARDEN_REPAIR_RECIPES_V1,
  assertHaltIncidentContractV1,
  assertWardenContractV1,
  incidentFingerprintV1,
  observationFingerprintV1,
  wardenContractHashV1,
  wardenEvidenceSnapshotHashV1,
  type AttributionAssessmentV1,
  type CorrectIncidentCorrelationInputV1,
  type DetectAndClassifyHaltInputV1,
  type HaltIncidentAggregateV1,
  type HaltIncidentEventV1,
  type HaltIncidentProjectionV1,
  type HaltIncidentReasonCodeV1,
  type HaltRecordV1,
  type IncidentRecordV1,
  type IncidentResolutionReceiptV1,
  type ResolveIncidentInputV1,
  type TransitionHaltInputV1,
  type TransitionIncidentInputV1,
  type EvaluateWardenVerdictInputV1,
  type RepairLeaseV1,
  type TransitionWardenRepairLeaseInputV1,
  type WardenAggregateV1,
  type WardenDenialReasonCodeV1,
  type WardenEvidenceSnapshotV1,
  type WardenEventV1,
  type WardenProjectionV1,
  type WardenRecipeIdentityV1,
  type WardenVerdictV1,
} from "../halts-incidents-v1/index.ts";

export {
  type CorrectIncidentCorrelationInputV1,
  type DetectAndClassifyHaltInputV1,
  type HaltIncidentAggregateV1,
  type HaltIncidentProjectionV1,
  type ResolveIncidentInputV1,
  type TransitionHaltInputV1,
  type TransitionIncidentInputV1,
  type EvaluateWardenVerdictInputV1,
  type TransitionWardenRepairLeaseInputV1,
  type WardenAggregateV1,
  type WardenProjectionV1,
} from "../halts-incidents-v1/index.ts";

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
  ...HALT_INCIDENT_EVENT_TYPES_V1,
  ...WARDEN_EVENT_TYPES_V1,
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

export type WorkspaceAttemptStateV1 =
  | "provisioning"
  | "active"
  | "sealed"
  | "merge_queued"
  | "merged"
  | "replan_required"
  | "cleanup_pending"
  | "recovery_pending"
  | "quarantined"
  | "cleaned";

export type WorkspaceAttemptV1 = Readonly<{
  contractType: "WorkspaceAttemptV1";
  contractVersion: "1.0";
  workspaceAttemptId: string;
  projectId: string;
  repositoryId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  runId: string;
  attemptId: string;
  plan: PlanReferenceV1;
  ownedRoot: string;
  workspacePath: string;
  branchRef: string;
  targetRef: string;
  baseSha: string;
  sealedSourceSha?: string;
  mergeRequestId?: string;
  ownershipMarker: Readonly<{
    runId: string;
    attemptId: string;
    repositoryId: string;
    normalizedWorkspacePath: string;
    branchRef: string;
    creationNonce: string;
    markerSha256: string;
  }>;
  previousState: WorkspaceAttemptStateV1 | null;
  state: WorkspaceAttemptStateV1;
  cleanup: Readonly<{
    mode: "non_destructive";
    maxAttempts: number;
    attemptOrdinal: number;
  }>;
  reason?: string;
  recoveryReceiptRef?: string;
  driftAssessmentId?: string;
  evidenceRefs: readonly string[];
  transitionedAt: string;
  transitionedBy: string;
}>;

const workspaceMergeValidator = new Ajv2020({
  allErrors: true,
  strict: true,
}).compile(workspaceMergeV1Schema);

export function assertWorkspaceAttemptV1(
  value: unknown,
): asserts value is WorkspaceAttemptV1 {
  if (
    !workspaceMergeValidator(value) ||
    (value as { contractType?: unknown } | null)?.contractType !==
      "WorkspaceAttemptV1"
  ) {
    const detail =
      workspaceMergeValidator.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ") ?? "unknown validation error";
    throw new ChangeControlError(
      `Invalid WorkspaceAttemptV1: ${detail}`,
      "INVALID_INPUT",
      400,
    );
  }
}

export type MergeStateV1 =
  | "queued"
  | "validating"
  | "applying"
  | "verifying"
  | "committed"
  | "replan_required"
  | "recovery_pending"
  | "quarantined";

export type MergeLeaseV1 = Readonly<{
  leaseId: string;
  repositoryId: string;
  targetRef: string;
  ownerRunId: string;
  ownerAttemptId: string;
  epoch: number;
  acquiredAt: string;
}>;

export type MergeRequestV1 = Readonly<{
  contractType: "MergeRequestV1";
  contractVersion: "1.0";
  mergeRequestId: string;
  workspaceAttemptId: string;
  projectId: string;
  repositoryId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  runId: string;
  attemptId: string;
  plan: PlanReferenceV1;
  targetRef: string;
  expectedTargetSha: string;
  observedTargetSha?: string;
  sourceRef: string;
  sealedSourceSha: string;
  integrationStrategy: "merge_no_ff_no_commit";
  verificationCommands: readonly Readonly<{
    command: string;
    expectedExitCode: 0;
  }>[];
  lease?: MergeLeaseV1;
  previousState: MergeStateV1 | null;
  state: MergeStateV1;
  mergeCommitSha?: string;
  driftAssessmentId?: string;
  safeAbortEvidenceRef?: string;
  reason?: string;
  evidenceRefs: readonly string[];
  transitionedAt: string;
  transitionedBy: string;
}>;

export type MergeReceiptV1 = Readonly<{
  contractType: "MergeReceiptV1";
  contractVersion: "1.0";
  mergeReceiptId: string;
  mergeRequestId: string;
  workspaceAttemptId: string;
  projectId: string;
  repositoryId: string;
  runId: string;
  attemptId: string;
  targetRef: string;
  expectedTargetSha: string;
  sealedSourceSha: string;
  result: "merged" | "replan_required" | "recovery_pending" | "quarantined";
  mergeCommitSha?: string;
  mergeParents?: readonly [string, string];
  verificationResults?: readonly Readonly<{
    command: string;
    exitCode: 0;
    evidenceRef: string;
  }>[];
  driftAssessmentId?: string;
  recoveryEvidenceRef?: string;
  quarantineEvidenceRef?: string;
  reason?: string;
  evidenceRefs: readonly string[];
  persistedRunRef: string;
  transitionEventRef: string;
  recordedAt: string;
  recordedBy: string;
}>;

function assertWorkspaceMergeContractTypeV1<T>(
  value: unknown,
  contractType: "MergeRequestV1" | "MergeReceiptV1",
): asserts value is T {
  if (
    !workspaceMergeValidator(value) ||
    (value as { contractType?: unknown } | null)?.contractType !== contractType
  ) {
    const detail =
      workspaceMergeValidator.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message}`)
        .join("; ") ?? "unknown validation error";
    throw new ChangeControlError(
      `Invalid ${contractType}: ${detail}`,
      "INVALID_INPUT",
      400,
    );
  }
}

export function assertMergeRequestV1(
  value: unknown,
): asserts value is MergeRequestV1 {
  assertWorkspaceMergeContractTypeV1<MergeRequestV1>(value, "MergeRequestV1");
}

export function assertMergeReceiptV1(
  value: unknown,
): asserts value is MergeReceiptV1 {
  assertWorkspaceMergeContractTypeV1<MergeReceiptV1>(value, "MergeReceiptV1");
}

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
  | "WAVE_NOT_READY"
  | "BLOCKING_INCIDENT_OPEN";

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

export type RecordMergeTargetDriftInputV1 = Readonly<{
  actor: string;
  assessmentId: string;
  plan: PlanReferenceV1;
  taskId: string;
  mergeRequestId: string;
  expectedTargetSha: string;
  observedTargetSha: string;
  sealedSourceSha: string;
}>;

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
const haltIncidentEventTypes = new Set<ChangeControlEventType>(
  HALT_INCIDENT_EVENT_TYPES_V1,
);
const wardenEventTypes = new Set<ChangeControlEventType>(WARDEN_EVENT_TYPES_V1);
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
  halts: Map<string, HaltRecordV1>;
  incidents: Map<string, IncidentRecordV1>;
  assessments: Map<string, AttributionAssessmentV1>;
  resolutionReceipts: Map<string, IncidentResolutionReceiptV1>;
  effectiveIncidentByHalt: Map<string, string>;
  detectorHaltIds: Map<string, string>;
  haltEvents: Map<string, HaltIncidentEventV1[]>;
  incidentEvents: Map<string, HaltIncidentEventV1[]>;
  haltIncidentEvents: HaltIncidentEventV1[];
  correlationHistory: Array<
    HaltIncidentProjectionV1["correlationHistory"][number]
  >;
  wardenVerdicts: Map<string, WardenVerdictV1>;
  wardenVerdictsByHalt: Map<string, WardenVerdictV1[]>;
  repairLeases: Map<string, RepairLeaseV1>;
  activeRepairLeaseByScope: Map<string, string>;
  repairLeaseEpochByScope: Map<string, number>;
  wardenEvents: WardenEventV1[];
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

type HaltIncidentProjectionState = Pick<
  ProjectedLedger,
  | "projections"
  | "waves"
  | "tasks"
  | "plans"
  | "halts"
  | "incidents"
  | "assessments"
  | "resolutionReceipts"
  | "effectiveIncidentByHalt"
  | "detectorHaltIds"
  | "haltEvents"
  | "incidentEvents"
  | "haltIncidentEvents"
  | "correlationHistory"
  | "wardenVerdicts"
  | "wardenVerdictsByHalt"
  | "repairLeases"
  | "activeRepairLeaseByScope"
  | "repairLeaseEpochByScope"
  | "wardenEvents"
>;

function haltDetectorKey(
  projectId: string,
  detectorId: string,
  detectorEventId: string,
) {
  return `${projectId}\u0000${detectorId}\u0000${detectorEventId}`;
}

function assertHaltContractStored<
  T extends
    | "HaltRecordV1"
    | "IncidentRecordV1"
    | "AttributionAssessmentV1"
    | "IncidentResolutionReceiptV1",
>(value: unknown, expectedType: T) {
  try {
    assertHaltIncidentContractV1(value, expectedType);
  } catch (error) {
    corrupt(
      `A persisted ${expectedType} contract is invalid: ${
        error instanceof Error ? error.message : "unknown validation error"
      }`,
    );
  }
  return value as unknown as T extends "HaltRecordV1"
    ? HaltRecordV1
    : T extends "IncidentRecordV1"
      ? IncidentRecordV1
      : T extends "AttributionAssessmentV1"
        ? AttributionAssessmentV1
        : IncidentResolutionReceiptV1;
}

function sameHaltScope(left: HaltRecordV1["scope"], right: HaltRecordV1["scope"]) {
  return (
    canonicalJson(left as unknown as JsonValue) ===
    canonicalJson(right as unknown as JsonValue)
  );
}

function assertHaltEventScope(
  event: ChangeControlEvent,
  scope: HaltRecordV1["scope"],
) {
  if (
    event.waveId !== (scope.waveId ?? undefined) ||
    event.taskId !== (scope.taskId ?? undefined)
  )
    corrupt(`Halt/incident event ${event.id} has mismatched wave or task scope.`);
}

function assertHaltEventIdentity(
  event: ChangeControlEvent,
  halt: HaltRecordV1,
) {
  if (
    halt.projectId !== event.projectId ||
    halt.changeId !== event.changeId
  )
    corrupt(`Halt/incident event ${event.id} has mismatched project or change scope.`);
  assertHaltEventScope(event, halt.scope);
}

function assertHaltScopeExists(
  event: ChangeControlEvent,
  scope: HaltRecordV1["scope"],
  projected: HaltIncidentProjectionState,
) {
  if (!projected.projections.has(event.changeId))
    corrupt(`Halt/incident event ${event.id} precedes change creation.`);
  if (scope.taskId !== null && scope.waveId === null)
    corrupt(`Halt/incident event ${event.id} has a task without a wave.`);
  if (
    scope.waveId !== null &&
    !projected.waves.has(waveKey(event.changeId, scope.waveId))
  )
    corrupt(`Halt/incident event ${event.id} references a missing wave.`);
  if (
    scope.taskId !== null &&
    !projected.tasks.has(taskKey(event.changeId, scope.waveId!, scope.taskId))
  )
    corrupt(`Halt/incident event ${event.id} references a missing task.`);
  if (scope.planRevision !== null) {
    if (scope.waveId === null)
      corrupt(`Halt/incident event ${event.id} has a plan without a wave.`);
    const plan = wavePlans(projected, event.changeId, scope.waveId).find(
      (candidate) => candidate.contract.revision === scope.planRevision,
    );
    if (!plan)
      corrupt(`Halt/incident event ${event.id} references a missing plan revision.`);
  }
}

function assertAttributionSemantics(
  halt: HaltRecordV1,
  assessment: AttributionAssessmentV1,
  publicationTime: string,
) {
  if (
    assessment.haltId !== halt.haltId ||
    assessment.projectId !== halt.projectId ||
    assessment.changeId !== halt.changeId ||
    !sameHaltScope(assessment.scope, halt.scope)
  )
    corrupt(
      `Attribution assessment ${assessment.assessmentId} has mismatched halt scope.`,
    );
  if (
    assessment.affectedEntity.projectId !== halt.projectId ||
    assessment.affectedEntity.changeId !== halt.changeId ||
    assessment.affectedEntity.waveId !== halt.scope.waveId ||
    assessment.affectedEntity.taskId !== halt.scope.taskId ||
    assessment.affectedEntity.operationKind !==
      halt.observation.operationKind ||
    assessment.affectedEntity.component !== halt.observation.component
  )
    corrupt(
      `Attribution assessment ${assessment.assessmentId} has a mismatched affected entity.`,
    );
  const assessedAt = planningTimestamp(
    assessment.assessedAt,
    "AttributionAssessmentV1 assessedAt",
    true,
  );
  const occurrence = planningTimestamp(
    halt.occurredAt,
    "HaltRecordV1 occurredAt",
    true,
  );
  const publication = planningTimestamp(
    publicationTime,
    "halt classification publication time",
    true,
  );
  if (assessedAt < occurrence || assessedAt > publication)
    corrupt(
      `Attribution assessment ${assessment.assessmentId} violates publication causality.`,
    );
  if (
    !halt.evidenceRefs.every((reference) =>
      assessment.evidence.detectorEvidenceRefs.includes(reference),
    )
  )
    corrupt(
      `Attribution assessment ${assessment.assessmentId} omits detector evidence.`,
    );
  const gitStateInvolved =
    halt.scope.workspaceAttemptId !== null ||
    halt.scope.mergeRequestId !== null ||
    halt.scope.commitId !== null ||
    halt.observation.operationKind.toLowerCase().includes("git");
  if (gitStateInvolved && assessment.evidence.gitEvidenceRefs.length === 0)
    corrupt(
      `Attribution assessment ${assessment.assessmentId} omits required Git evidence.`,
    );
  if (
    assessment.confidence === "exact" &&
    (assessment.candidateCauses.length !== 1 ||
      assessment.candidateCauses[0].causeKey !==
        assessment.normalizedRootCauseKey ||
      assessment.normalizedRootCauseKey === "unknown")
  )
    corrupt(
      `Exact attribution assessment ${assessment.assessmentId} does not prove one cause.`,
    );
  if (
    new Set(assessment.candidateCauses.map((candidate) => candidate.causeKey))
      .size !== assessment.candidateCauses.length ||
    new Set(
      assessment.alternativeCandidates.map((candidate) => candidate.causeKey),
    ).size !== assessment.alternativeCandidates.length
  )
    corrupt(
      `Attribution assessment ${assessment.assessmentId} contains duplicate cause candidates.`,
    );
  if (
    assessment.confidence === "partial" &&
    assessment.candidateCauses.length === 0
  )
    corrupt(
      `Partial attribution assessment ${assessment.assessmentId} has no candidate cause.`,
    );
  if (
    assessment.confidence === "none" &&
    (assessment.candidateCauses.length !== 0 ||
      assessment.normalizedRootCauseKey !== "unknown")
  )
    corrupt(
      `None attribution assessment ${assessment.assessmentId} must use unknown with no candidates.`,
    );
  if (
    assessment.haltClass === "unknown" &&
    assessment.confidence !== "none"
  )
    corrupt(
      `Unknown halt ${halt.haltId} cannot receive exact or partial attribution.`,
    );
}

function addHaltIncidentEvent(
  map: Map<string, HaltIncidentEventV1[]>,
  id: string,
  event: HaltIncidentEventV1,
) {
  const events = map.get(id) ?? [];
  events.push(event);
  map.set(id, events);
}

function repairLeaseScopeKey(projectId: string, incidentId: string, haltId: string) {
  return `${projectId}\u0000${incidentId}\u0000${haltId}`;
}

function sameWardenRecipeIdentity(
  left: WardenRecipeIdentityV1 | undefined,
  right: WardenRecipeIdentityV1 | undefined,
) {
  return Boolean(
    left &&
      right &&
      left.recipeId === right.recipeId &&
      left.recipeVersion === right.recipeVersion &&
      left.codeHash === right.codeHash,
  );
}

function sameWardenOracleIdentity(
  left: Pick<WardenEvidenceSnapshotV1["successOracle"], "oracleId" | "kind">,
  right: Pick<WardenEvidenceSnapshotV1["successOracle"], "oracleId" | "kind">,
) {
  return left.oracleId === right.oracleId && left.kind === right.kind;
}

function isRegisteredWardenOracle(
  oracle: WardenEvidenceSnapshotV1["successOracle"],
) {
  return WARDEN_REPAIR_RECIPES_V1.some(
    (recipe) =>
      sameWardenOracleIdentity(recipe.successOracle, oracle) ||
      sameWardenOracleIdentity(recipe.stopOracle, oracle),
  );
}

function wardenBudgetSnapshot(
  projected: Pick<ProjectedLedger, "wardenVerdicts">,
  haltId: string,
  incidentId: string,
  consumesBudget: boolean,
) {
  const allowed = [...projected.wardenVerdicts.values()].filter((verdict) =>
    ["allow_auto_heal", "allow_bounded_retry"].includes(verdict.disposition),
  );
  const consumedBefore = {
    halt: allowed.filter((verdict) => verdict.haltId === haltId).length,
    incident: allowed.filter((verdict) => verdict.incidentId === incidentId).length,
    project: allowed.length,
  };
  const limits = {
    halt: WARDEN_POLICY_V1.budgets.perHalt,
    incident: WARDEN_POLICY_V1.budgets.perIncident,
    project: WARDEN_POLICY_V1.budgets.perProject,
  };
  const cost = consumesBudget ? 1 : 0;
  return {
    limits,
    consumedBefore,
    remainingAfter: {
      halt: Math.max(0, limits.halt - consumedBefore.halt - cost),
      incident: Math.max(0, limits.incident - consumedBefore.incident - cost),
      project: Math.max(0, limits.project - consumedBefore.project - cost),
    },
  };
}

function wardenEvidenceIssue(
  snapshot: WardenEvidenceSnapshotV1,
  halt: HaltRecordV1,
  incident: IncidentRecordV1,
  assessment: AttributionAssessmentV1,
  evaluatedAt: string,
): WardenDenialReasonCodeV1 | undefined {
  const { snapshotHash, ...snapshotBody } = snapshot;
  const capturedAt = canonicalTimestampMillis(snapshot.capturedAt);
  const evaluated = canonicalTimestampMillis(evaluatedAt);
  if (
    snapshot.snapshotVersion !== "warden-evidence-v1" ||
    snapshotHash !== wardenEvidenceSnapshotHashV1(snapshotBody) ||
    snapshot.haltRecordHash !== wardenContractHashV1(halt) ||
    snapshot.incidentRecordHash !== wardenContractHashV1(incident) ||
    snapshot.attributionAssessmentHash !== wardenContractHashV1(assessment) ||
    snapshot.sideEffectState !== assessment.evidence.sideEffectState ||
    capturedAt === undefined ||
    evaluated === undefined ||
    capturedAt > evaluated ||
    capturedAt < (canonicalTimestampMillis(halt.publishedAt) ?? Number.MAX_SAFE_INTEGER) ||
    capturedAt < (canonicalTimestampMillis(assessment.assessedAt) ?? Number.MAX_SAFE_INTEGER) ||
    !halt.evidenceRefs.every((reference) => snapshot.evidenceRefs.includes(reference)) ||
    !assessment.evidence.detectorEvidenceRefs.every((reference) =>
      snapshot.evidenceRefs.includes(reference),
    ) ||
    !assessment.evidence.outcomeEvidenceRefs.every((reference) =>
      snapshot.evidenceRefs.includes(reference),
    ) ||
    snapshot.successOracle.evidenceRefs.length === 0 ||
    snapshot.stopOracle.evidenceRefs.length === 0 ||
    !isRegisteredWardenOracle(snapshot.successOracle) ||
    !isRegisteredWardenOracle(snapshot.stopOracle)
  )
    return "HALT_EVIDENCE_INVALID";
  if (
    evaluated - capturedAt >
    WARDEN_POLICY_V1.evidenceMaxAgeSeconds * 1000
  )
    return "EVIDENCE_STALE";
  return undefined;
}

function wardenPolicyDecision(
  projected: Pick<ProjectedLedger, "wardenVerdicts">,
  input: Pick<
    WardenVerdictV1,
    "policyVersion" | "requestedAction" | "evidenceSnapshot" | "recipe"
  >,
  halt: HaltRecordV1,
  incident: IncidentRecordV1,
  assessment: AttributionAssessmentV1,
  evaluatedAt: string,
) {
  const denied = (
    disposition: "require_replan" | "require_human" | "quarantine",
    reasonCode: WardenDenialReasonCodeV1,
  ) => ({
    disposition,
    reasonCode,
    budgets: wardenBudgetSnapshot(
      projected,
      halt.haltId,
      incident.incidentId,
      false,
    ),
  });
  if (input.policyVersion !== WARDEN_POLICY_V1.policyVersion)
    return denied("require_human", "WARDEN_POLICY_UNKNOWN");
  const evidenceIssue = wardenEvidenceIssue(
    input.evidenceSnapshot,
    halt,
    incident,
    assessment,
    evaluatedAt,
  );
  if (evidenceIssue)
    return denied(
      evidenceIssue === "HALT_EVIDENCE_INVALID" ? "quarantine" : "require_human",
      evidenceIssue,
    );
  if (assessment.haltClass === "unknown")
    return denied("require_human", "HALT_CLASS_UNKNOWN");
  if (assessment.confidence !== "exact")
    return denied("require_human", "ATTRIBUTION_NOT_EXACT");
  if (input.evidenceSnapshot.quarantineReasonCodes.includes("REPAIR_LEASE_LOST"))
    return denied("quarantine", "REPAIR_LEASE_LOST");
  if (
    input.evidenceSnapshot.quarantineReasonCodes.includes(
      "REPAIR_RESULT_AMBIGUOUS",
    ) ||
    input.evidenceSnapshot.priorRepairResult === "ambiguous"
  )
    return denied("quarantine", "REPAIR_RESULT_AMBIGUOUS");
  if (
    input.evidenceSnapshot.sideEffectState !== "none" ||
    input.evidenceSnapshot.quarantineReasonCodes.includes("SIDE_EFFECT_AMBIGUOUS")
  )
    return denied("quarantine", "SIDE_EFFECT_AMBIGUOUS");
  const explicitQuarantine = input.evidenceSnapshot.quarantineReasonCodes[0];
  if (explicitQuarantine)
    return denied("quarantine", explicitQuarantine);
  if (assessment.haltClass === "plan_or_target_drift")
    return denied("require_replan", "REPLAN_REQUIRED");
  if (
    [
      "acceptance_or_verification_failure",
      "dependency_or_readiness_failure",
      "human_decision_required",
    ].includes(assessment.haltClass)
  )
    return denied("require_human", "HUMAN_AUTHORITY_REQUIRED");
  if (
    [
      "scope_or_policy_violation",
      "ownership_or_state_ambiguity",
      "destructive_or_external_risk",
    ].includes(assessment.haltClass)
  )
    return denied("quarantine", "HUMAN_AUTHORITY_REQUIRED");
  if (input.requestedAction === "none")
    return denied("require_human", "HUMAN_AUTHORITY_REQUIRED");
  const recipe = WARDEN_REPAIR_RECIPES_V1.find((candidate) =>
    sameWardenRecipeIdentity(candidate, input.recipe),
  );
  if (!recipe) return denied("require_human", "RECIPE_NOT_ALLOWLISTED");
  if (
    !sameWardenOracleIdentity(
      recipe.successOracle,
      input.evidenceSnapshot.successOracle,
    ) ||
    !sameWardenOracleIdentity(recipe.stopOracle, input.evidenceSnapshot.stopOracle)
  )
    return denied("require_human", "RECIPE_PRECONDITION_FAILED");
  const expectedAction =
    assessment.haltClass === "deterministic_owned_recovery"
      ? "auto_heal"
      : "bounded_retry";
  if (
    input.requestedAction !== expectedAction ||
    recipe.haltClass !== assessment.haltClass ||
    !input.evidenceSnapshot.preconditionsUnchanged
  )
    return denied("require_human", "RECIPE_PRECONDITION_FAILED");
  const before = wardenBudgetSnapshot(
    projected,
    halt.haltId,
    incident.incidentId,
    false,
  );
  if (
    before.remainingAfter.halt === 0 ||
    before.remainingAfter.incident === 0 ||
    before.remainingAfter.project === 0
  )
    return denied("require_human", "REPAIR_BUDGET_EXHAUSTED");
  return {
    disposition: recipe.disposition,
    reasonCode: null,
    budgets: wardenBudgetSnapshot(
      projected,
      halt.haltId,
      incident.incidentId,
      true,
    ),
  } as const;
}

function assertWardenContractStored<
  T extends "WardenVerdictV1" | "RepairLeaseV1",
>(value: unknown, expectedType: T) {
  try {
    assertWardenContractV1(value, expectedType);
  } catch (error) {
    corrupt(
      `A persisted ${expectedType} contract is invalid: ${
        error instanceof Error ? error.message : "unknown validation error"
      }`,
    );
  }
  return value as unknown as T extends "WardenVerdictV1"
    ? WardenVerdictV1
    : RepairLeaseV1;
}

function hasExplicitWardenSupersessionCausation(
  event: ChangeControlEvent,
  verdict: WardenVerdictV1,
  prior: WardenVerdictV1,
  events: readonly WardenEventV1[],
) {
  if (event.causationId === prior.verdictId) return true;
  const priorEvent = events.find(
    (candidate) =>
      candidate.type === "warden.verdict-recorded" &&
      candidate.payload.verdict.verdictId === prior.verdictId,
  );
  const cause = events.find((candidate) => candidate.id === event.causationId);
  if (
    !priorEvent ||
    !cause ||
    cause.sequence <= priorEvent.sequence ||
    cause.sequence >= event.sequence
  )
    return false;
  if (cause.type === "warden.repair-lease-acquired")
    return Boolean(
      verdict.repairLease &&
        cause.causationId === prior.verdictId &&
        cause.payload.lease.leaseId === verdict.repairLease.leaseId &&
        cause.payload.lease.haltId === prior.haltId &&
        cause.payload.lease.incidentId === prior.incidentId,
    );
  if (cause.type === "warden.repair-lease-lost")
    return Boolean(
      prior.repairLease &&
        cause.causationId === prior.repairLease.leaseId &&
        cause.payload.leaseId === prior.repairLease.leaseId &&
        cause.payload.leaseEpoch === prior.repairLease.epoch &&
        cause.payload.haltId === prior.haltId &&
        cause.payload.incidentId === prior.incidentId,
    );
  return false;
}

function applyWardenEvent(
  event: ChangeControlEvent,
  projected: HaltIncidentProjectionState,
) {
  const typedEvent = event as unknown as WardenEventV1;
  projected.wardenEvents.push(typedEvent);
  if (event.type === "warden.repair-lease-acquired") {
    assertPayloadKeys(event, ["lease"]);
    const lease = assertWardenContractStored(event.payload.lease, "RepairLeaseV1");
    const halt = projected.halts.get(lease.haltId);
    const incident = projected.incidents.get(lease.incidentId);
    const scopeKey = repairLeaseScopeKey(
      lease.projectId,
      lease.incidentId,
      lease.haltId,
    );
    if (
      !halt ||
      !incident ||
      lease.projectId !== event.projectId ||
      halt.changeId !== event.changeId ||
      projected.effectiveIncidentByHalt.get(halt.haltId) !== incident.incidentId ||
      lease.state !== "active" ||
      lease.acquiredAt !== event.occurredAt ||
      lease.acquiredBy !== event.actor ||
      lease.acquiredBy !== "policy:warden-v1" ||
      projected.repairLeases.has(lease.leaseId) ||
      projected.activeRepairLeaseByScope.has(scopeKey) ||
      lease.epoch !== (projected.repairLeaseEpochByScope.get(scopeKey) ?? 0) + 1
    )
      corrupt(`Repair lease acquisition ${lease.leaseId} is semantically invalid.`);
    assertHaltEventIdentity(event, halt);
    projected.repairLeases.set(lease.leaseId, lease);
    projected.activeRepairLeaseByScope.set(scopeKey, lease.leaseId);
    projected.repairLeaseEpochByScope.set(scopeKey, lease.epoch);
    return;
  }
  if (
    event.type === "warden.repair-lease-released" ||
    event.type === "warden.repair-lease-lost"
  ) {
    assertPayloadKeys(event, [
      "evidenceRefs",
      "haltId",
      "incidentId",
      "leaseEpoch",
      "leaseId",
      "previousState",
      "state",
    ]);
    const leaseId = requireStoredIdentifier(event.payload.leaseId, "leaseId");
    const lease = projected.repairLeases.get(leaseId);
    const expectedState = event.type.endsWith("lost") ? "lost" : "released";
    if (!lease) corrupt(`Repair lease transition ${event.id} is missing its lease.`);
    const halt = projected.halts.get(lease.haltId);
    const scopeKey = repairLeaseScopeKey(
      lease.projectId,
      lease.incidentId,
      lease.haltId,
    );
    if (
      !halt ||
      event.payload.haltId !== lease.haltId ||
      event.payload.incidentId !== lease.incidentId ||
      event.payload.leaseEpoch !== lease.epoch ||
      event.payload.previousState !== "active" ||
      event.payload.state !== expectedState ||
      lease.state !== "active" ||
      projected.activeRepairLeaseByScope.get(scopeKey) !== leaseId ||
      !Array.isArray(event.payload.evidenceRefs) ||
      event.payload.evidenceRefs.length === 0
    )
      corrupt(`Repair lease transition ${event.id} is semantically invalid.`);
    assertHaltEventIdentity(event, halt);
    projected.repairLeases.set(leaseId, {
      ...lease,
      state: expectedState,
      terminalAt: event.occurredAt,
      terminalBy: event.actor,
      terminalEvidenceRefs: event.payload.evidenceRefs as string[],
    });
    projected.activeRepairLeaseByScope.delete(scopeKey);
    return;
  }
  if (event.type === "warden.verdict-recorded") {
    assertPayloadKeys(event, ["verdict"]);
    const verdict = assertWardenContractStored(
      event.payload.verdict,
      "WardenVerdictV1",
    );
    const halt = projected.halts.get(verdict.haltId);
    const incident = projected.incidents.get(verdict.incidentId);
    const assessment = projected.assessments.get(verdict.attributionAssessmentId);
    if (!halt || !incident || !assessment)
      corrupt(`Warden verdict ${verdict.verdictId} has a missing canonical reference.`);
    assertHaltEventIdentity(event, halt);
    const history = projected.wardenVerdictsByHalt.get(halt.haltId) ?? [];
    const prior = history.at(-1);
    if (
      verdict.projectId !== event.projectId ||
      verdict.changeId !== event.changeId ||
      verdict.incidentId !== projected.effectiveIncidentByHalt.get(halt.haltId) ||
      verdict.attributionAssessmentId !== halt.classificationAssessmentId ||
      verdict.evaluatedAt !== event.occurredAt ||
      verdict.evaluatedBy !== event.actor ||
      event.actor !== "policy:warden-v1" ||
      projected.wardenVerdicts.has(verdict.verdictId) ||
      verdict.verdictOrdinal !== (prior?.verdictOrdinal ?? 0) + 1 ||
      verdict.supersedesVerdictId !== (prior?.verdictId ?? null) ||
      (prior !== undefined &&
        prior.evidenceSnapshot.snapshotHash === verdict.evidenceSnapshot.snapshotHash)
    )
      corrupt(`Warden verdict ${verdict.verdictId} has invalid identity or ordinal history.`);
    if (
      prior &&
      !hasExplicitWardenSupersessionCausation(
        event,
        verdict,
        prior,
        projected.wardenEvents,
      )
    )
      corrupt(`Warden verdict ${verdict.verdictId} has invalid supersession causation.`);
    const expected = wardenPolicyDecision(
      projected,
      verdict,
      halt,
      incident,
      assessment,
      verdict.evaluatedAt,
    );
    if (
      verdict.disposition !== expected.disposition ||
      verdict.reasonCode !== expected.reasonCode ||
      canonicalJson(verdict.budgets as unknown as JsonValue) !==
        canonicalJson(expected.budgets as unknown as JsonValue)
    )
      corrupt(`Warden verdict ${verdict.verdictId} does not match deterministic policy.`);
    const automatic = ["allow_auto_heal", "allow_bounded_retry"].includes(
      verdict.disposition,
    );
    if (automatic) {
      const lease = verdict.repairLease
        ? projected.repairLeases.get(verdict.repairLease.leaseId)
        : undefined;
      const recipe = WARDEN_REPAIR_RECIPES_V1.find((candidate) =>
        sameWardenRecipeIdentity(candidate, verdict.recipe),
      );
      const conflictingKey = [...projected.wardenVerdicts.values()].find(
        (candidate) =>
          candidate.idempotencyKey === verdict.idempotencyKey &&
          (candidate.haltId !== verdict.haltId ||
            !sameWardenRecipeIdentity(candidate.recipe, verdict.recipe)),
      );
      if (
        !lease ||
        lease.state !== "active" ||
        lease.haltId !== halt.haltId ||
        lease.incidentId !== incident.incidentId ||
        verdict.repairLease?.projectId !== lease.projectId ||
        verdict.repairLease.incidentId !== lease.incidentId ||
        verdict.repairLease.haltId !== lease.haltId ||
        verdict.repairLease?.epoch !== lease.epoch ||
        verdict.repairLease.acquiredAt !== lease.acquiredAt ||
        !recipe ||
        !verdict.idempotencyKey ||
        conflictingKey
      )
        corrupt(`Allowed Warden verdict ${verdict.verdictId} lacks exact repair authority.`);
    } else if (verdict.repairLease || verdict.idempotencyKey) {
      corrupt(`Denied Warden verdict ${verdict.verdictId} retained automatic authority.`);
    }
    projected.wardenVerdicts.set(verdict.verdictId, verdict);
    projected.wardenVerdictsByHalt.set(halt.haltId, [...history, verdict]);
    return;
  }
  corrupt(`Unsupported Warden event type: ${event.type}.`);
}

function maxSeverity(
  left: HaltRecordV1["severity"],
  right: HaltRecordV1["severity"],
) {
  const rank: Record<HaltRecordV1["severity"], number> = {
    info: 0,
    warning: 1,
    blocking: 2,
    critical: 3,
  };
  return rank[left] >= rank[right] ? left : right;
}

function applyHaltIncidentEvent(
  event: ChangeControlEvent,
  projected: HaltIncidentProjectionState,
) {
  const typedEvent = event as HaltIncidentEventV1;
  projected.haltIncidentEvents.push(typedEvent);

  if (event.type === "halt.detected") {
    assertPayloadKeys(event, ["halt"]);
    const halt = assertHaltContractStored(event.payload.halt, "HaltRecordV1");
    assertHaltEventIdentity(event, halt);
    assertHaltScopeExists(event, halt.scope, projected);
    if (
      halt.projectId !== event.projectId ||
      halt.changeId !== event.changeId ||
      halt.correlationId !== event.correlationId ||
      halt.publishedAt !== event.occurredAt ||
      halt.state !== "detected" ||
      halt.classificationAssessmentId !== undefined ||
      halt.haltClass !== undefined ||
      halt.effectiveIncidentId !== undefined
    )
      corrupt(`Detected halt ${halt.haltId} has invalid publication fields.`);
    if (event.actor !== halt.detector.detectorId)
      corrupt(`Detected halt ${halt.haltId} has a mismatched detector actor.`);
    if (
      planningTimestamp(halt.occurredAt, "HaltRecordV1 occurredAt", true) >
      planningTimestamp(halt.publishedAt, "HaltRecordV1 publishedAt", true)
    )
      corrupt(`Detected halt ${halt.haltId} occurs after publication.`);
    if (observationFingerprintV1(halt) !== halt.observation.fingerprint)
      corrupt(`Detected halt ${halt.haltId} has an invalid observation fingerprint.`);
    if (projected.halts.has(halt.haltId))
      corrupt(`Duplicate halt ID: ${halt.haltId}.`);
    const detectorKey = haltDetectorKey(
      halt.projectId,
      halt.detector.detectorId,
      halt.detector.detectorEventId,
    );
    if (projected.detectorHaltIds.has(detectorKey))
      corrupt(`Duplicate detector idempotency tuple for halt ${halt.haltId}.`);
    projected.detectorHaltIds.set(detectorKey, halt.haltId);
    projected.halts.set(halt.haltId, halt);
    addHaltIncidentEvent(projected.haltEvents, halt.haltId, typedEvent);
    return;
  }

  if (event.type === "incident.opened") {
    assertPayloadKeys(event, ["incident"]);
    const incident = assertHaltContractStored(
      event.payload.incident,
      "IncidentRecordV1",
    );
    if (
      incident.projectId !== event.projectId ||
      incident.changeId !== event.changeId ||
      incident.openedAt !== event.occurredAt ||
      incident.state !== "open" ||
      incident.haltIds.length !== 1 ||
      incident.incidentFingerprintVersion !== "incident-v1" ||
      incident.correlationWindowPolicy.reopenUntil !== null ||
      incident.reopenOrdinal !== 0
    )
      corrupt(`Opened incident ${incident.incidentId} has invalid initial fields.`);
    const halt = projected.halts.get(incident.haltIds[0]);
    if (!halt)
      corrupt(`Opened incident ${incident.incidentId} references a missing halt.`);
    assertHaltEventIdentity(event, halt);
    if (projected.incidents.has(incident.incidentId))
      corrupt(`Duplicate incident ID: ${incident.incidentId}.`);
    if (
      incident.firstOccurrenceAt !== halt.occurredAt ||
      incident.latestOccurrenceAt !== halt.occurredAt ||
      incident.severity !== halt.severity
    )
      corrupt(`Opened incident ${incident.incidentId} has mismatched halt fields.`);
    projected.incidents.set(incident.incidentId, incident);
    projected.effectiveIncidentByHalt.set(halt.haltId, incident.incidentId);
    addHaltIncidentEvent(
      projected.incidentEvents,
      incident.incidentId,
      typedEvent,
    );
    return;
  }

  if (event.type === "incident.halt-linked") {
    assertPayloadKeys(event, [
      "haltId",
      "incidentFingerprint",
      "incidentId",
      "reasonCode",
    ]);
    const haltId = requireStoredIdentifier(event.payload.haltId, "haltId");
    const incidentId = requireStoredIdentifier(
      event.payload.incidentId,
      "incidentId",
    );
    const halt = projected.halts.get(haltId);
    const incident = projected.incidents.get(incidentId);
    if (!halt || !incident)
      corrupt(`Incident link ${event.id} has a missing halt or incident.`);
    assertHaltEventIdentity(event, halt);
    if (
      event.payload.incidentFingerprint !== incident.incidentFingerprint ||
      !["INCIDENT_MATCHED_OPEN", "INCIDENT_REOPENED"].includes(
        String(event.payload.reasonCode),
      ) ||
      incident.haltIds.includes(haltId) ||
      projected.effectiveIncidentByHalt.has(haltId)
    )
      corrupt(`Incident link ${event.id} is invalid or duplicated.`);
    const latestOccurrenceAt =
      planningTimestamp(
        halt.occurredAt,
        "linked halt occurrence",
        true,
      ) >
      planningTimestamp(
        incident.latestOccurrenceAt,
        "incident latest occurrence",
        true,
      )
        ? halt.occurredAt
        : incident.latestOccurrenceAt;
    projected.incidents.set(incidentId, {
      ...incident,
      latestOccurrenceAt,
      haltIds: [...incident.haltIds, haltId],
      severity: maxSeverity(incident.severity, halt.severity),
      correlationReasonCode:
        event.payload.reasonCode as HaltIncidentReasonCodeV1,
    });
    projected.effectiveIncidentByHalt.set(haltId, incidentId);
    addHaltIncidentEvent(projected.haltEvents, haltId, typedEvent);
    addHaltIncidentEvent(projected.incidentEvents, incidentId, typedEvent);
    return;
  }

  if (event.type === "halt.classified") {
    assertPayloadKeys(event, [
      "assessment",
      "haltId",
      "incidentId",
      "previousState",
      "state",
    ]);
    const haltId = requireStoredIdentifier(event.payload.haltId, "haltId");
    const incidentId = requireStoredIdentifier(
      event.payload.incidentId,
      "incidentId",
    );
    const halt = projected.halts.get(haltId);
    const incident = projected.incidents.get(incidentId);
    if (!halt || !incident)
      corrupt(`Halt classification ${event.id} has a missing halt or incident.`);
    const assessment = assertHaltContractStored(
      event.payload.assessment,
      "AttributionAssessmentV1",
    );
    assertHaltEventIdentity(event, halt);
    assertAttributionSemantics(halt, assessment, event.occurredAt);
    if (
      event.actor !== assessment.classifier.classifierId ||
      event.payload.previousState !== "detected" ||
      event.payload.state !== "classified" ||
      halt.state !== "detected" ||
      projected.effectiveIncidentByHalt.get(haltId) !== incidentId ||
      incidentFingerprintV1(assessment) !== incident.incidentFingerprint ||
      !incident.haltIds.includes(haltId) ||
      !incident.affectedEntities.some(
        (affected) =>
          canonicalJson(affected as unknown as JsonValue) ===
          canonicalJson(assessment.affectedEntity as unknown as JsonValue),
      )
    )
      corrupt(`Halt classification ${event.id} is semantically invalid.`);
    if (projected.assessments.has(assessment.assessmentId))
      corrupt(`Duplicate attribution assessment ID: ${assessment.assessmentId}.`);
    projected.assessments.set(assessment.assessmentId, assessment);
    projected.halts.set(haltId, {
      ...halt,
      state: "classified",
      classificationAssessmentId: assessment.assessmentId,
      haltClass: assessment.haltClass,
      effectiveIncidentId: incidentId,
    });
    addHaltIncidentEvent(projected.haltEvents, haltId, typedEvent);
    return;
  }

  if (
    event.type === "halt.escalated" ||
    event.type === "halt.quarantined" ||
    event.type === "halt.dispositioned" ||
    event.type === "halt.healing-started" ||
    event.type === "halt.recovered"
  ) {
    assertPayloadKeys(event, [
      "evidenceRefs",
      "haltId",
      "previousState",
      "reasonCode",
      "state",
    ]);
    const haltId = requireStoredIdentifier(event.payload.haltId, "haltId");
    const halt = projected.halts.get(haltId);
    if (!halt) corrupt(`Halt transition ${event.id} references a missing halt.`);
    assertHaltEventIdentity(event, halt);
    const target =
      event.type === "halt.escalated"
        ? "escalated"
        : event.type === "halt.quarantined"
          ? "quarantined"
          : event.type === "halt.dispositioned"
            ? "action_pending"
            : event.type === "halt.healing-started"
              ? "healing"
              : "recovered";
    const legal: Record<string, readonly string[]> = {
      classified: ["action_pending", "escalated", "quarantined"],
      action_pending: [
        "action_pending",
        "healing",
        "recovered",
        "escalated",
        "quarantined",
      ],
      healing: ["recovered", "action_pending", "escalated", "quarantined"],
    };
    if (
      event.payload.previousState !== halt.state ||
      event.payload.state !== target ||
      !(legal[halt.state] ?? []).includes(target) ||
      !HALT_INCIDENT_REASON_CODES_V1.includes(
        event.payload.reasonCode as HaltIncidentReasonCodeV1,
      ) ||
      !Array.isArray(event.payload.evidenceRefs) ||
      event.payload.evidenceRefs.length === 0
    )
      corrupt(`Halt transition ${event.id} is semantically invalid.`);
    if (target === "action_pending") {
      const verdict = projected.wardenVerdictsByHalt.get(haltId)?.at(-1);
      if (
        !verdict ||
        verdict.verdictId !== event.causationId ||
        verdict.disposition === "quarantine" ||
        event.payload.reasonCode !==
          (verdict.reasonCode ?? "WARDEN_AUTO_ACTION_ALLOWED")
      )
        corrupt(`Halt transition ${event.id} lacks its exact Warden verdict.`);
    }
    if (target === "healing")
      corrupt(`Halt transition ${event.id} lacks an implemented Doctor receipt.`);
    projected.halts.set(haltId, {
      ...halt,
      state: target,
      lastTransitionReasonCode:
        event.payload.reasonCode as HaltIncidentReasonCodeV1,
    });
    addHaltIncidentEvent(projected.haltEvents, haltId, typedEvent);
    return;
  }

  if (
    event.type === "incident.investigating" ||
    event.type === "incident.healing" ||
    event.type === "incident.mitigated" ||
    event.type === "incident.escalated"
  ) {
    assertPayloadKeys(event, [
      "evidenceRefs",
      "incidentId",
      "previousState",
      "reasonCode",
      ...(event.type === "incident.mitigated" ? ["receipt"] : []),
      "state",
    ]);
    const incidentId = requireStoredIdentifier(
      event.payload.incidentId,
      "incidentId",
    );
    const incident = projected.incidents.get(incidentId);
    if (!incident)
      corrupt(`Incident transition ${event.id} references a missing incident.`);
    if (
      incident.projectId !== event.projectId ||
      incident.changeId !== event.changeId ||
      event.waveId !== undefined ||
      event.taskId !== undefined
    )
      corrupt(`Incident transition ${event.id} has mismatched entity scope.`);
    const target =
      event.type === "incident.investigating"
        ? "investigating"
        : event.type === "incident.healing"
          ? "healing"
          : event.type === "incident.mitigated"
            ? "mitigated"
            : "escalated";
    const legal: Record<string, readonly string[]> = {
      open: ["investigating", "healing", "mitigated", "escalated"],
      investigating: ["healing", "mitigated", "escalated"],
      healing: ["investigating", "mitigated", "escalated"],
      mitigated: ["escalated"],
      escalated: ["investigating", "mitigated"],
      reopened: ["investigating", "healing", "mitigated", "escalated"],
    };
    if (
      event.payload.previousState !== incident.state ||
      event.payload.state !== target ||
      !(legal[incident.state] ?? []).includes(target) ||
      !HALT_INCIDENT_REASON_CODES_V1.includes(
        event.payload.reasonCode as HaltIncidentReasonCodeV1,
      ) ||
      !Array.isArray(event.payload.evidenceRefs) ||
      event.payload.evidenceRefs.length === 0
    )
      corrupt(`Incident transition ${event.id} is semantically invalid.`);
    if (target === "healing")
      corrupt(`Incident transition ${event.id} lacks an implemented Warden verdict.`);
    if (target === "mitigated") {
      const receipt = assertHaltContractStored(
        event.payload.receipt,
        "IncidentResolutionReceiptV1",
      );
      if (
        receipt.receiptId === undefined ||
        projected.resolutionReceipts.has(receipt.receiptId) ||
        receipt.incidentId !== incidentId ||
        receipt.projectId !== event.projectId ||
        receipt.changeId !== event.changeId ||
        receipt.resolutionKind !== "mitigated" ||
        receipt.resolvedAt !== event.occurredAt ||
        receipt.resolvedBy !== event.actor ||
        receipt.taxonomyPolicyVersion !== incident.taxonomyPolicyVersion ||
        receipt.correlationWindowSeconds !==
          incident.correlationWindowPolicy.durationSeconds ||
        canonicalJson(receipt.evidenceRefs as unknown as JsonValue) !==
          canonicalJson(event.payload.evidenceRefs as JsonValue)
      )
        corrupt(`Incident mitigation ${event.id} has an invalid receipt.`);
      const humanOnly = incident.haltIds.some((haltId) => {
        const halt = projected.halts.get(haltId);
        return (
          projected.effectiveIncidentByHalt.get(haltId) === incident.incidentId &&
          halt?.haltClass !== undefined &&
          [
            "human_decision_required",
            "destructive_or_external_risk",
            "unknown",
          ].includes(halt.haltClass)
        );
      });
      if (
        humanOnly &&
        (receipt.oracle.kind !== "human" || !receipt.resolvedBy.startsWith("human:"))
      )
        corrupt(`Human-only incident ${incident.incidentId} lacks human mitigation.`);
      projected.resolutionReceipts.set(receipt.receiptId, receipt);
    }
    projected.incidents.set(incidentId, {
      ...incident,
      state: target,
      correlationReasonCode:
        event.payload.reasonCode as HaltIncidentReasonCodeV1,
    });
    addHaltIncidentEvent(projected.incidentEvents, incidentId, typedEvent);
    return;
  }

  if (event.type === "incident.resolved") {
    assertPayloadKeys(event, [
      "previousState",
      "receipt",
      "reopenUntil",
      "state",
    ]);
    const receipt = assertHaltContractStored(
      event.payload.receipt,
      "IncidentResolutionReceiptV1",
    );
    const incident = projected.incidents.get(receipt.incidentId);
    if (!incident)
      corrupt(`Incident resolution ${event.id} references a missing incident.`);
    if (event.waveId !== undefined || event.taskId !== undefined)
      corrupt(`Incident resolution ${event.id} has unexpected halt scope.`);
    const expectedReopenUntil = new Date(
      planningTimestamp(event.occurredAt, "resolution publication", true) +
        receipt.correlationWindowSeconds * 1000,
    ).toISOString();
    if (
      receipt.projectId !== event.projectId ||
      receipt.changeId !== event.changeId ||
      receipt.taxonomyPolicyVersion !== incident.taxonomyPolicyVersion ||
      receipt.resolvedAt !== event.occurredAt ||
      receipt.resolvedBy !== event.actor ||
      receipt.resolutionKind !== "resolved" ||
      receipt.correlationWindowSeconds !==
        incident.correlationWindowPolicy.durationSeconds ||
      event.payload.previousState !== incident.state ||
      event.payload.state !== "resolved" ||
      event.payload.reopenUntil !== expectedReopenUntil ||
      !["mitigated", "escalated"].includes(incident.state)
    )
      corrupt(`Incident resolution ${event.id} is semantically invalid.`);
    if (projected.resolutionReceipts.has(receipt.receiptId))
      corrupt(`Duplicate incident resolution receipt ID: ${receipt.receiptId}.`);
    if (
      incident.haltIds.some((haltId) => {
        if (projected.effectiveIncidentByHalt.get(haltId) !== incident.incidentId)
          return false;
        const halt = projected.halts.get(haltId);
        return (
          halt?.severity === "blocking" || halt?.severity === "critical"
        ) && !["recovered", "escalated", "quarantined"].includes(halt.state);
      })
    )
      corrupt(`Incident ${incident.incidentId} closed with an active blocking halt.`);
    const humanOnly = incident.haltIds.some((haltId) => {
      const halt = projected.halts.get(haltId);
      return (
        projected.effectiveIncidentByHalt.get(haltId) === incident.incidentId &&
        halt?.haltClass !== undefined &&
        [
          "human_decision_required",
          "destructive_or_external_risk",
          "unknown",
        ].includes(halt.haltClass)
      );
    });
    if (
      humanOnly &&
      (receipt.oracle.kind !== "human" || !receipt.resolvedBy.startsWith("human:"))
    )
      corrupt(`Human-only incident ${incident.incidentId} lacks human resolution.`);
    projected.resolutionReceipts.set(receipt.receiptId, receipt);
    projected.incidents.set(incident.incidentId, {
      ...incident,
      state: "resolved",
      closureReceiptId: receipt.receiptId,
      correlationWindowPolicy: {
        durationSeconds: receipt.correlationWindowSeconds,
        reopenUntil: expectedReopenUntil,
      },
    });
    addHaltIncidentEvent(
      projected.incidentEvents,
      incident.incidentId,
      typedEvent,
    );
    return;
  }

  if (event.type === "incident.reopened") {
    assertPayloadKeys(event, [
      "haltId",
      "incidentId",
      "previousState",
      "reasonCode",
      "reopenOrdinal",
      "reopenUntil",
      "state",
    ]);
    const incidentId = requireStoredIdentifier(
      event.payload.incidentId,
      "incidentId",
    );
    const haltId = requireStoredIdentifier(event.payload.haltId, "haltId");
    const incident = projected.incidents.get(incidentId);
    const halt = projected.halts.get(haltId);
    if (!incident || !halt)
      corrupt(`Incident reopen ${event.id} has a missing incident or halt.`);
    assertHaltEventIdentity(event, halt);
    const reopensResolvedIncident = incident.state === "resolved";
    const reopensMitigatedIncident = incident.state === "mitigated";
    if (
      (!reopensResolvedIncident && !reopensMitigatedIncident) ||
      event.payload.previousState !== incident.state ||
      event.payload.state !== "reopened" ||
      event.payload.reasonCode !== "INCIDENT_REOPENED" ||
      event.payload.reopenOrdinal !== incident.reopenOrdinal + 1 ||
      event.payload.reopenUntil !==
        incident.correlationWindowPolicy.reopenUntil ||
      (reopensResolvedIncident &&
        (incident.correlationWindowPolicy.reopenUntil === null ||
          planningTimestamp(event.occurredAt, "reopen publication", true) >
            planningTimestamp(
              incident.correlationWindowPolicy.reopenUntil,
              "incident reopen window",
              true,
            ))) ||
      (reopensMitigatedIncident &&
        incident.correlationWindowPolicy.reopenUntil !== null) ||
      projected.effectiveIncidentByHalt.get(haltId) !== incidentId ||
      !incident.haltIds.includes(haltId)
    )
      corrupt(`Incident reopen ${event.id} violates its recorded window.`);
    projected.incidents.set(incidentId, {
      ...incident,
      state: "reopened",
      reopenOrdinal: incident.reopenOrdinal + 1,
      correlationReasonCode: "INCIDENT_REOPENED",
    });
    addHaltIncidentEvent(projected.haltEvents, haltId, typedEvent);
    addHaltIncidentEvent(projected.incidentEvents, incidentId, typedEvent);
    return;
  }

  if (event.type === "incident.correlation-superseded") {
    assertPayloadKeys(event, [
      "correctedAt",
      "correctedBy",
      "correctionId",
      "evidenceRefs",
      "haltId",
      "incidentId",
      "previousIncidentId",
      "reason",
    ]);
    const haltId = requireStoredIdentifier(event.payload.haltId, "haltId");
    const previousIncidentId = requireStoredIdentifier(
      event.payload.previousIncidentId,
      "previousIncidentId",
    );
    const incidentId = requireStoredIdentifier(
      event.payload.incidentId,
      "incidentId",
    );
    const correctionId = requireStoredIdentifier(
      event.payload.correctionId,
      "correctionId",
    );
    const halt = projected.halts.get(haltId);
    const previousIncident = projected.incidents.get(previousIncidentId);
    const incident = projected.incidents.get(incidentId);
    if (!halt || !previousIncident || !incident)
      corrupt(`Incident correction ${correctionId} has a missing reference.`);
    assertHaltEventIdentity(event, halt);
    const correctionIssue = correlationCorrectionIssue(
      previousIncident,
      incident,
      event.actor,
    );
    if (
      projected.correlationHistory.some(
        (candidate) => candidate.correctionId === correctionId,
      ) ||
      projected.effectiveIncidentByHalt.get(haltId) !== previousIncidentId ||
      correctionIssue !== undefined ||
      event.payload.correctedAt !== event.occurredAt ||
      event.payload.correctedBy !== event.actor ||
      typeof event.payload.reason !== "string" ||
      event.payload.reason.length === 0 ||
      !Array.isArray(event.payload.evidenceRefs) ||
      event.payload.evidenceRefs.length === 0
    )
      corrupt(`Incident correction ${correctionId} is semantically invalid.`);
    const history = {
      correctionId,
      haltId,
      previousIncidentId,
      incidentId,
      correctedAt: event.payload.correctedAt,
      correctedBy: event.payload.correctedBy,
      reason: event.payload.reason,
      evidenceRefs: event.payload.evidenceRefs,
    } as HaltIncidentProjectionV1["correlationHistory"][number];
    projected.correlationHistory.push(history);
    projected.effectiveIncidentByHalt.set(haltId, incidentId);
    projected.halts.set(haltId, { ...halt, effectiveIncidentId: incidentId });
    if (!incident.haltIds.includes(haltId))
      projected.incidents.set(incidentId, {
        ...incident,
        haltIds: [...incident.haltIds, haltId],
        severity: maxSeverity(incident.severity, halt.severity),
      });
    addHaltIncidentEvent(projected.haltEvents, haltId, typedEvent);
    addHaltIncidentEvent(
      projected.incidentEvents,
      previousIncidentId,
      typedEvent,
    );
    addHaltIncidentEvent(projected.incidentEvents, incidentId, typedEvent);
    return;
  }

  corrupt(`Unsupported halt/incident event type: ${event.type}.`);
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
  const halts = new Map<string, HaltRecordV1>();
  const incidents = new Map<string, IncidentRecordV1>();
  const assessments = new Map<string, AttributionAssessmentV1>();
  const resolutionReceipts = new Map<string, IncidentResolutionReceiptV1>();
  const effectiveIncidentByHalt = new Map<string, string>();
  const detectorHaltIds = new Map<string, string>();
  const haltEvents = new Map<string, HaltIncidentEventV1[]>();
  const incidentEvents = new Map<string, HaltIncidentEventV1[]>();
  const haltIncidentEvents: HaltIncidentEventV1[] = [];
  const correlationHistory: Array<
    HaltIncidentProjectionV1["correlationHistory"][number]
  > = [];
  const wardenVerdicts = new Map<string, WardenVerdictV1>();
  const wardenVerdictsByHalt = new Map<string, WardenVerdictV1[]>();
  const repairLeases = new Map<string, RepairLeaseV1>();
  const activeRepairLeaseByScope = new Map<string, string>();
  const repairLeaseEpochByScope = new Map<string, number>();
  const wardenEvents: WardenEventV1[] = [];
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
          blockingDispatchIncidents(
            { incidents, halts, effectiveIncidentByHalt },
            event.changeId,
            waveId,
          ).length > 0
        )
          corrupt(`Wave ${waveId} was dispatched with an open blocking incident.`);
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
        const postDispatchMergeDrift =
          plan.status === "dispatched" &&
          assessment.status === "stale" &&
          assessment.reasons.some(
            (reason) => reason.code === "BASE_SHA_MISMATCH",
          ) &&
          assessment.evidenceRefs.some((reference) =>
            reference.startsWith("merge:request:"),
          ) &&
          plan.contract.taskPlans.some((taskPlan) =>
            assessment.evidenceRefs.includes(
              `merge:task:${taskPlan.taskId}`,
            ),
          ) &&
          [...dispatchGateReceipts.values()].some(
            (receipt) =>
              receipt.result === "allowed" &&
              receipt.plan &&
              samePlanReference(receipt.plan, plan.contract) &&
              receipt.authorizationId &&
              assessment.evidenceRefs.includes(
                `merge:authorization:${receipt.authorizationId}`,
              ) &&
              assessment.evidenceRefs.includes(
                `merge:dispatch-receipt:${receipt.receiptId}`,
              ),
          );
        if (plan.status !== "authorized" && !postDispatchMergeDrift)
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
    } else if (haltIncidentEventTypes.has(event.type)) {
      applyHaltIncidentEvent(event, {
        projections,
        waves,
        tasks,
        plans,
        halts,
        incidents,
        assessments,
        resolutionReceipts,
        effectiveIncidentByHalt,
        detectorHaltIds,
        haltEvents,
        incidentEvents,
        haltIncidentEvents,
        correlationHistory,
        wardenVerdicts,
        wardenVerdictsByHalt,
        repairLeases,
        activeRepairLeaseByScope,
        repairLeaseEpochByScope,
        wardenEvents,
      });
    } else if (wardenEventTypes.has(event.type)) {
      applyWardenEvent(event, {
        projections,
        waves,
        tasks,
        plans,
        halts,
        incidents,
        assessments,
        resolutionReceipts,
        effectiveIncidentByHalt,
        detectorHaltIds,
        haltEvents,
        incidentEvents,
        haltIncidentEvents,
        correlationHistory,
        wardenVerdicts,
        wardenVerdictsByHalt,
        repairLeases,
        activeRepairLeaseByScope,
        repairLeaseEpochByScope,
        wardenEvents,
      });
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
  for (const halt of halts.values()) {
    if (halt.state === "detected")
      corrupt(`Detected halt ${halt.haltId} bypassed classification.`);
    const assessment = halt.classificationAssessmentId
      ? assessments.get(halt.classificationAssessmentId)
      : undefined;
    const incidentId = effectiveIncidentByHalt.get(halt.haltId);
    const incident = incidentId ? incidents.get(incidentId) : undefined;
    if (
      !assessment ||
      !incident ||
      halt.effectiveIncidentId !== incidentId ||
      !incident.haltIds.includes(halt.haltId) ||
      incidentFingerprintV1(assessment) !== incident.incidentFingerprint
    )
      corrupt(`Classified halt ${halt.haltId} lacks one exact effective incident.`);
  }

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
    halts,
    incidents,
    assessments,
    resolutionReceipts,
    effectiveIncidentByHalt,
    detectorHaltIds,
    haltEvents,
    incidentEvents,
    haltIncidentEvents,
    correlationHistory,
    wardenVerdicts,
    wardenVerdictsByHalt,
    repairLeases,
    activeRepairLeaseByScope,
    repairLeaseEpochByScope,
    wardenEvents,
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

function normalizeHaltContract<
  T extends
    | "HaltRecordV1"
    | "IncidentRecordV1"
    | "AttributionAssessmentV1"
    | "IncidentResolutionReceiptV1",
>(value: unknown, expectedType: T) {
  const normalized = normalizeJson(value, expectedType);
  if (
    normalized === null ||
    Array.isArray(normalized) ||
    typeof normalized !== "object"
  )
    invalid(`${expectedType} must be a JSON object.`);
  try {
    assertHaltIncidentContractV1(normalized, expectedType);
  } catch (error) {
    invalid(error instanceof Error ? error.message : `${expectedType} is invalid.`);
  }
  return normalized as unknown as T extends "HaltRecordV1"
    ? HaltRecordV1
    : T extends "IncidentRecordV1"
      ? IncidentRecordV1
      : T extends "AttributionAssessmentV1"
        ? AttributionAssessmentV1
        : IncidentResolutionReceiptV1;
}

function normalizeEvidenceRefs(value: unknown, field = "evidenceRefs") {
  if (!Array.isArray(value) || value.length === 0)
    invalid(`${field} must be a non-empty array.`);
  const refs = value.map((item) => {
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      item.length > 2048
    )
      invalid(`${field} contains an invalid evidence reference.`);
    return item;
  });
  if (new Set(refs).size !== refs.length)
    invalid(`${field} cannot contain duplicates.`);
  return refs;
}

function immutableHaltIncidentProjection(
  projectId: string,
  projected: ProjectedLedger,
): HaltIncidentProjectionV1 {
  return deepFreeze(
    structuredClone({
      projectId,
      halts: [...projected.halts.values()].sort(
        (left, right) =>
          left.publishedAt.localeCompare(right.publishedAt) ||
          left.haltId.localeCompare(right.haltId),
      ),
      incidents: [...projected.incidents.values()].sort(
        (left, right) =>
          left.openedAt.localeCompare(right.openedAt) ||
          left.incidentId.localeCompare(right.incidentId),
      ),
      assessments: [...projected.assessments.values()].sort((left, right) =>
        left.assessmentId.localeCompare(right.assessmentId),
      ),
      resolutionReceipts: [...projected.resolutionReceipts.values()].sort(
        (left, right) => left.receiptId.localeCompare(right.receiptId),
      ),
      correlationHistory: projected.correlationHistory,
      events: projected.haltIncidentEvents,
    }),
  );
}

function haltIncidentAggregate(
  projected: ProjectedLedger,
  haltId: string,
  operationEventIds?: ReadonlySet<string>,
): HaltIncidentAggregateV1 {
  const halt = projected.halts.get(haltId);
  if (!halt)
    throw new ChangeControlError(
      `Halt ${haltId} was not found.`,
      "NOT_FOUND",
      404,
    );
  const incidentId = projected.effectiveIncidentByHalt.get(haltId);
  const incident = incidentId
    ? projected.incidents.get(incidentId)
    : undefined;
  const assessment = halt.classificationAssessmentId
    ? projected.assessments.get(halt.classificationAssessmentId)
    : undefined;
  if (!incident || !assessment)
    corrupt(`Halt ${haltId} lacks its effective incident or assessment.`);
  const events = operationEventIds
    ? projected.haltIncidentEvents.filter((event) =>
        operationEventIds.has(event.id),
      )
    : projected.haltEvents.get(haltId) ?? [];
  return deepFreeze(
    structuredClone({
      halt,
      incident,
      assessment,
      events,
    }),
  );
}

function normalizeWardenEvidenceSnapshot(value: unknown) {
  const snapshot = normalizeJson(value, "evidenceSnapshot");
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    invalid("evidenceSnapshot must be a JSON object.");
  const candidate = snapshot as unknown as WardenEvidenceSnapshotV1;
  if (
    candidate.snapshotVersion !== "warden-evidence-v1" ||
    typeof candidate.snapshotHash !== "string" ||
    typeof candidate.haltRecordHash !== "string" ||
    typeof candidate.incidentRecordHash !== "string" ||
    typeof candidate.attributionAssessmentHash !== "string" ||
    !["none", "committed", "possible", "unknown"].includes(
      candidate.sideEffectState,
    ) ||
    typeof candidate.preconditionsUnchanged !== "boolean" ||
    !["none", "unambiguous", "ambiguous"].includes(candidate.priorRepairResult) ||
    !Array.isArray(candidate.quarantineReasonCodes) ||
    !candidate.quarantineReasonCodes.every((reason) =>
      WARDEN_DENIAL_REASON_CODES_V1.includes(reason),
    ) ||
    !candidate.successOracle ||
    !candidate.stopOracle
  )
    invalid("evidenceSnapshot has invalid closed Warden fields.");
  normalizeEvidenceRefs(candidate.evidenceRefs, "evidenceSnapshot.evidenceRefs");
  normalizeEvidenceRefs(
    candidate.successOracle.evidenceRefs,
    "evidenceSnapshot.successOracle.evidenceRefs",
  );
  normalizeEvidenceRefs(
    candidate.stopOracle.evidenceRefs,
    "evidenceSnapshot.stopOracle.evidenceRefs",
  );
  return candidate;
}

function normalizeWardenRecipe(value: unknown) {
  if (value === undefined) return undefined;
  const recipe = normalizeJson(value, "recipe");
  if (!recipe || typeof recipe !== "object" || Array.isArray(recipe))
    invalid("recipe must be a JSON object.");
  const candidate = recipe as Record<string, unknown>;
  const codeHash = candidate.codeHash;
  if (typeof codeHash !== "string" || !/^[0-9a-f]{64}$/.test(codeHash))
    invalid("recipe.codeHash must be a SHA-256 hash.");
  return {
    recipeId: requireIdentifier(candidate.recipeId, "recipe.recipeId"),
    recipeVersion: requireIdentifier(
      candidate.recipeVersion,
      "recipe.recipeVersion",
    ),
    codeHash,
  } satisfies WardenRecipeIdentityV1;
}

function immutableWardenProjection(
  projectId: string,
  projected: ProjectedLedger,
): WardenProjectionV1 {
  const verdicts = [...projected.wardenVerdicts.values()].sort(
    (left, right) =>
      left.evaluatedAt.localeCompare(right.evaluatedAt) ||
      left.verdictId.localeCompare(right.verdictId),
  );
  const activeVerdicts = [...projected.wardenVerdictsByHalt.values()]
    .map((history) => history.at(-1)!)
    .filter((verdict) => {
      if (
        !["allow_auto_heal", "allow_bounded_retry"].includes(
          verdict.disposition,
        )
      )
        return true;
      const lease = verdict.repairLease
        ? projected.repairLeases.get(verdict.repairLease.leaseId)
        : undefined;
      return lease?.state === "active";
    })
    .sort((left, right) => left.haltId.localeCompare(right.haltId));
  return deepFreeze(
    structuredClone({
      projectId,
      verdicts,
      activeVerdicts,
      leases: [...projected.repairLeases.values()].sort(
        (left, right) =>
          left.acquiredAt.localeCompare(right.acquiredAt) ||
          left.leaseId.localeCompare(right.leaseId),
      ),
      events: projected.wardenEvents,
    }),
  );
}

function wardenAggregate(
  projected: ProjectedLedger,
  haltId: string,
  operationEventIds?: ReadonlySet<string>,
): WardenAggregateV1 {
  const history = projected.wardenVerdictsByHalt.get(haltId) ?? [];
  const verdict = history.at(-1);
  const halt = projected.halts.get(haltId);
  const incidentId = projected.effectiveIncidentByHalt.get(haltId);
  const incident = incidentId ? projected.incidents.get(incidentId) : undefined;
  if (!verdict || !halt || !incident)
    throw new ChangeControlError(
      `Warden verdict for halt ${haltId} was not found.`,
      "NOT_FOUND",
      404,
    );
  const lease = verdict.repairLease
    ? projected.repairLeases.get(verdict.repairLease.leaseId)
    : history
        .slice()
        .reverse()
        .map((candidate) =>
          candidate.repairLease
            ? projected.repairLeases.get(candidate.repairLease.leaseId)
            : undefined,
        )
        .find(Boolean);
  return deepFreeze(
    structuredClone({
      verdict,
      halt,
      incident,
      ...(lease ? { lease } : {}),
      verdictHistory: history,
      events: operationEventIds
        ? projected.wardenEvents.filter((event) => operationEventIds.has(event.id))
        : projected.wardenEvents.filter((event) => {
            if (event.type === "warden.verdict-recorded")
              return event.payload.verdict.haltId === haltId;
            if (event.type === "warden.repair-lease-acquired")
              return event.payload.lease.haltId === haltId;
            return event.payload.haltId === haltId;
          }),
    }),
  );
}

const blockingDispatchIncidentStates = new Set<IncidentRecordV1["state"]>([
  "open",
  "investigating",
  "healing",
  "escalated",
  "reopened",
]);

function blockingDispatchIncidents(
  projected: Pick<
    ProjectedLedger,
    "incidents" | "halts" | "effectiveIncidentByHalt"
  >,
  changeId: string,
  waveId: string,
) {
  return [...projected.incidents.values()]
    .filter(
      (incident) =>
        incident.changeId === changeId &&
        blockingDispatchIncidentStates.has(incident.state) &&
        ["blocking", "critical"].includes(incident.severity) &&
        incident.haltIds.some((haltId) => {
          const halt = projected.halts.get(haltId);
          return (
            projected.effectiveIncidentByHalt.get(haltId) === incident.incidentId &&
            halt?.scope.waveId === waveId
          );
        }),
    )
    .sort((left, right) => left.incidentId.localeCompare(right.incidentId));
}

function validateCandidateLedger(ledger: Ledger) {
  try {
    return validateAndProject(ledger);
  } catch (error) {
    if (
      error instanceof ChangeControlError &&
      error.code === "CORRUPT_LEDGER"
    )
      invalid(error.message);
    throw error;
  }
}

const activeIncidentStates = new Set<IncidentRecordV1["state"]>([
  "open",
  "investigating",
  "healing",
  "mitigated",
  "escalated",
  "reopened",
]);

type CorrelationCorrectionIssue =
  | "NON_HUMAN_ACTOR"
  | "SAME_INCIDENT"
  | "FINGERPRINT_MISMATCH"
  | "CLOSED_TARGET";

function correlationCorrectionIssue(
  previousIncident: IncidentRecordV1,
  incident: IncidentRecordV1,
  actor: string,
): CorrelationCorrectionIssue | undefined {
  if (!actor.startsWith("human:")) return "NON_HUMAN_ACTOR";
  if (incident.incidentId === previousIncident.incidentId)
    return "SAME_INCIDENT";
  if (
    incident.incidentFingerprint !== previousIncident.incidentFingerprint
  )
    return "FINGERPRINT_MISMATCH";
  if (["mitigated", "resolved"].includes(incident.state))
    return "CLOSED_TARGET";
  return undefined;
}

function incidentReopenWindowContains(
  incident: IncidentRecordV1,
  publicationTime: string,
) {
  return (
    incident.state === "resolved" &&
    incident.correlationWindowPolicy.reopenUntil !== null &&
    planningTimestamp(
      publicationTime,
      "halt publication time",
      false,
    ) <=
      planningTimestamp(
        incident.correlationWindowPolicy.reopenUntil,
        "incident reopen window",
        true,
      )
  );
}

const ledgerWriteLockRetryMilliseconds = 10;
const ledgerWriteLockTimeoutMilliseconds = 30_000;

type ChangeControlLedgerWriteLockV1 = Readonly<{
  contractType: "ChangeControlLedgerWriteLockV1";
  contractVersion: "1.0";
  ownerPid: number;
  ownerToken: string;
  acquiredAt: string;
}>;

function ledgerWriteLockOwnerName(owner: ChangeControlLedgerWriteLockV1) {
  return `owner-${owner.ownerToken}.json`;
}

function ledgerLockProcessIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function assertLedgerWriteLock(
  value: unknown,
): asserts value is ChangeControlLedgerWriteLockV1 {
  const owner = value as Partial<ChangeControlLedgerWriteLockV1>;
  if (
    !owner ||
    owner.contractType !== "ChangeControlLedgerWriteLockV1" ||
    owner.contractVersion !== "1.0" ||
    typeof owner.ownerPid !== "number" ||
    !Number.isInteger(owner.ownerPid) ||
    owner.ownerPid < 1 ||
    typeof owner.ownerToken !== "string" ||
    owner.ownerToken.length === 0 ||
    typeof owner.acquiredAt !== "string" ||
    canonicalTimestampMillis(owner.acquiredAt) === undefined
  )
    throw new ChangeControlError(
      "The change-control ledger write lock is malformed; ownership cannot be proven.",
      "CORRUPT_LEDGER",
      500,
    );
}

async function readLedgerWriteLock(lockPath: string) {
  const names = await readdir(lockPath);
  if (
    names.length !== 1 ||
    !names[0].startsWith("owner-") ||
    !names[0].endsWith(".json")
  )
    throw new ChangeControlError(
      "The change-control ledger write lock is malformed; ownership cannot be proven.",
      "CORRUPT_LEDGER",
      500,
    );
  const ownerName = names[0]!;
  const owner = JSON.parse(
    await readFile(join(lockPath, ownerName), "utf8"),
  ) as unknown;
  assertLedgerWriteLock(owner);
  if (ownerName !== ledgerWriteLockOwnerName(owner))
    throw new ChangeControlError(
      "The change-control ledger write lock filename disagrees with its owner identity.",
      "CORRUPT_LEDGER",
      500,
    );
  return owner;
}

function transientLedgerLockError(error: unknown) {
  return ["EACCES", "EBUSY", "EEXIST", "ENOENT", "ENOTEMPTY", "EPERM"].includes(
    (error as NodeJS.ErrnoException).code ?? "",
  );
}

async function retryLedgerWriteLock(deadline: number) {
  if (Date.now() >= deadline)
    throw new ChangeControlError(
      "Timed out waiting for the exclusive change-control ledger write lock.",
      "CONFLICT",
      409,
    );
  await new Promise((resolve) =>
    setTimeout(resolve, ledgerWriteLockRetryMilliseconds),
  );
}

async function acquireLedgerWriteLock(file: string) {
  const lockPath = `${file}.write-lock`;
  const deadline = Date.now() + ledgerWriteLockTimeoutMilliseconds;
  await mkdir(dirname(file), { recursive: true });

  while (true) {
    const owner: ChangeControlLedgerWriteLockV1 = {
      contractType: "ChangeControlLedgerWriteLockV1",
      contractVersion: "1.0",
      ownerPid: process.pid,
      ownerToken: randomUUID(),
      acquiredAt: new Date().toISOString(),
    };
    const candidatePath = `${lockPath}.${process.pid}.${owner.ownerToken}.candidate`;
    await mkdir(candidatePath);
    await writeFile(
      join(candidatePath, ledgerWriteLockOwnerName(owner)),
      JSON.stringify(owner),
      { encoding: "utf8", flag: "wx" },
    );
    let published = false;
    try {
      await rename(candidatePath, lockPath);
      published = true;
    } catch (error) {
      await rm(candidatePath, { recursive: true, force: true });
      if (!transientLedgerLockError(error)) throw error;
    }
    if (published)
      return async () => {
        const observed = await readLedgerWriteLock(lockPath);
        if (
          observed.ownerPid !== owner.ownerPid ||
          observed.ownerToken !== owner.ownerToken ||
          canonicalJson(observed as unknown as JsonValue) !==
            canonicalJson(owner as unknown as JsonValue)
        )
          throw new ChangeControlError(
            "The change-control ledger write lock changed ownership during publication.",
            "CORRUPT_LEDGER",
            500,
          );
        await unlink(join(lockPath, ledgerWriteLockOwnerName(owner)));
        await rmdir(lockPath);
      };

    let observed: ChangeControlLedgerWriteLockV1;
    try {
      observed = await readLedgerWriteLock(lockPath);
    } catch (error) {
      if (transientLedgerLockError(error)) {
        await retryLedgerWriteLock(deadline);
        continue;
      }
      throw error;
    }
    if (ledgerLockProcessIsAlive(observed.ownerPid)) {
      await retryLedgerWriteLock(deadline);
      continue;
    }
    try {
      await unlink(join(lockPath, ledgerWriteLockOwnerName(observed)));
      await rmdir(lockPath);
    } catch (error) {
      if (transientLedgerLockError(error)) {
        await retryLedgerWriteLock(deadline);
        continue;
      }
      throw error;
    }
  }
}

const processLedgerWriteChains = new Map<string, Promise<void>>();

export class ChangeControlStore {
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
    const key = this.file(projectId);
    const previous = processLedgerWriteChains.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      // A project transaction is deliberately stronger than a fingerprint lock:
      // it makes every (projectId, incidentFingerprint) decision atomic while also
      // preventing unrelated project writes from replacing the same ledger file.
      // The process queue preserves local FIFO behavior; the filesystem lock is
      // the cross-process authority.
      const release = await acquireLedgerWriteLock(key);
      try {
        return await operation();
      } finally {
        await release();
      }
    });
    const settled = next.then(() => undefined, () => undefined);
    processLedgerWriteChains.set(key, settled);
    void settled
      .finally(() => {
        if (processLedgerWriteChains.get(key) === settled)
          processLedgerWriteChains.delete(key);
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
      const blockingIncidents = blockingDispatchIncidents(
        projected,
        changeId,
        waveId,
      );
      const waveEvents = projected.eventsByWave.get(key)!;

      // A project ledger opts into Planning and Drift Contract v1 when its
      // first planning contract is published. Ledgers with no planning events
      // retain the exact Phase 1 dispatch behavior for replay compatibility.
      if (projected.plans.size === 0) {
        if (blockingIncidents.length > 0)
          throw new ChangeControlError(
            `Wave ${waveId} has an open blocking incident.`,
            "NOT_READY",
            409,
            deepFreeze(
              structuredClone(["BLOCKING_INCIDENT_OPEN"]),
            ),
          );
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
      if (blockingIncidents.length > 0)
        gateReasons.add("BLOCKING_INCIDENT_OPEN");
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

  async recordMergeTargetDrift(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: RecordMergeTargetDriftInputV1,
  ): Promise<DriftAssessmentV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const actor = requireIdentity(input?.actor, "actor");
    const assessmentId = requireIdentifier(
      input?.assessmentId,
      "assessmentId",
    );
    const taskId = requireIdentifier(input?.taskId, "taskId");
    const mergeRequestId = requireIdentifier(
      input?.mergeRequestId,
      "mergeRequestId",
    );
    if (
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(
        input?.expectedTargetSha ?? "",
      ) ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(
        input?.observedTargetSha ?? "",
      ) ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(
        input?.sealedSourceSha ?? "",
      ) ||
      input.expectedTargetSha === input.observedTargetSha
    )
      throw new ChangeControlError(
        "Merge target drift requires distinct full expected and observed SHAs plus a full sealed source SHA.",
        "INVALID_INPUT",
        400,
      );

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const key = waveKey(changeId, waveId);
      const wave = projected.waves.get(key);
      const events = projected.eventsByWave.get(key);
      const plans = wavePlans(projected, changeId, waveId);
      const latestPlan = plans.at(-1);
      const plan = plans.find((candidate) =>
        samePlanReference(input.plan, candidate.contract),
      );
      const allowedReceipts =
        plan && plan.authorization
          ? [...projected.dispatchGateReceipts.values()].filter(
              (receipt) =>
                receipt.projectId === projectId &&
                receipt.changeId === changeId &&
                receipt.waveId === waveId &&
                receipt.result === "allowed" &&
                receipt.plan &&
                samePlanReference(receipt.plan, plan.contract) &&
                receipt.authorizationId ===
                  plan.authorization!.authorizationId,
            )
          : [];
      const evidenceRefs =
        plan && plan.authorization && allowedReceipts.length === 1
          ? [
              `merge:request:${mergeRequestId}`,
              `merge:task:${taskId}`,
              `merge:authorization:${plan.authorization.authorizationId}`,
              `merge:dispatch-receipt:${allowedReceipts[0].receiptId}`,
              `git:repository:${plan.contract.planBase.repositoryId}`,
              `git:prior-head:${input.expectedTargetSha}`,
              `git:head:${input.observedTargetSha}`,
              `git:sealed-source:${input.sealedSourceSha}`,
              `plan:${plan.contract.planId}:${plan.contract.revision}:${plan.contract.planBase.sha}`,
              "requirement:architect-replan",
              "requirement:fresh-human-authorization",
            ]
          : [];
      const priorForRequest = [
        ...projected.driftAssessments.values(),
      ].filter((assessment) =>
        assessment.evidenceRefs.includes(
          `merge:request:${mergeRequestId}`,
        ),
      );
      if (priorForRequest.length > 1)
        throw new ChangeControlError(
          "Merge request has multiple persisted target-drift assessments.",
          "CONFLICT",
          409,
        );
      if (priorForRequest.length === 1) {
        const prior = priorForRequest[0];
        const exactReplay =
          !!plan &&
          !!plan.authorization &&
          allowedReceipts.length === 1 &&
          samePlanReference(input.plan, plan.contract) &&
          plan.contract.planBase.sha === input.expectedTargetSha &&
          plan.contract.taskPlans.some(
            (taskPlan) => taskPlan.taskId === taskId,
          ) &&
          plan.authorization.decision === "authorized" &&
          samePlanReference(plan.authorization.plan, plan.contract) &&
          prior.status === "stale" &&
          prior.requiresReplan === true &&
          prior.assessedBy === actor &&
          samePlanReference(prior.plan, plan.contract) &&
          prior.observedBase.repositoryId ===
            plan.contract.planBase.repositoryId &&
          prior.observedBase.sha === input.observedTargetSha &&
          prior.observedBase.worktreeState === "clean" &&
          prior.changedPaths.length === 0 &&
          prior.reasons.length === 1 &&
          prior.reasons[0].code === "BASE_SHA_MISMATCH" &&
          canonicalJson([...prior.evidenceRefs]) ===
            canonicalJson(evidenceRefs) &&
          canonicalJson([...prior.reasons[0].evidenceRefs]) ===
            canonicalJson(evidenceRefs);
        if (!exactReplay)
          throw new ChangeControlError(
            "Merge target drift replay conflicts with the assessment already bound to this merge request.",
            "CONFLICT",
            409,
          );
        return deepFreeze(structuredClone(prior));
      }
      if (
        !wave ||
        !events ||
        !plan ||
        plan !== latestPlan ||
        plan.status !== "dispatched" ||
        !samePlanReference(input.plan, plan.contract) ||
        plan.contract.planBase.sha !== input.expectedTargetSha ||
        !plan.contract.taskPlans.some(
          (taskPlan) => taskPlan.taskId === taskId,
        ) ||
        !plan.authorization ||
        plan.authorization.decision !== "authorized" ||
        !samePlanReference(plan.authorization.plan, plan.contract)
      )
        throw new ChangeControlError(
          "Merge target drift does not match the exact dispatched plan, task, base, and current authorization.",
          "CONFLICT",
          409,
        );
      if (allowedReceipts.length !== 1)
        throw new ChangeControlError(
          "Merge target drift requires exactly one matching allowed dispatch receipt.",
          "CONFLICT",
          409,
        );

      const assessedAt = this.now();
      const assessment: DriftAssessmentV1 = {
        contractType: "DriftAssessmentV1",
        contractVersion: "1.0",
        assessmentId,
        plan: {
          planId: plan.contract.planId,
          revision: plan.contract.revision,
          planBaseSha: plan.contract.planBase.sha,
        },
        observedBase: {
          repositoryId: plan.contract.planBase.repositoryId,
          sha: input.observedTargetSha,
          hashAlgorithm:
            input.observedTargetSha.length === 64 ? "sha256" : "sha1",
          ...(plan.contract.planBase.ref
            ? { ref: plan.contract.planBase.ref }
            : {}),
          capturedAt: assessedAt,
          worktreeState: "clean",
        },
        status: "stale",
        reasons: [
          {
            code: "BASE_SHA_MISMATCH",
            description:
              "A serialized predecessor merge moved the exact authorized target base.",
            evidenceRefs,
          },
        ],
        changedPaths: [],
        evidenceRefs,
        requiresReplan: true,
        assessedAt,
        assessedBy: actor,
      };
      validatePlanningContractSchema(
        assessment,
        "DriftAssessmentV1",
        true,
      );
      this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type: "plan.marked-stale",
        occurredAt: assessedAt,
        projectId,
        changeId,
        waveId,
        actor,
        causationId: requireIdentity(
          events.at(-1)!.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          events[0].correlationId,
          "correlationId",
        ),
        payload: {
          assessment: structuredClone(assessment) as unknown as JsonValue,
        },
      });
      validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return deepFreeze(structuredClone(assessment));
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

  async detectAndClassifyHalt(
    projectIdValue: string,
    input: DetectAndClassifyHaltInputV1,
  ): Promise<HaltIncidentAggregateV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const haltInput = normalizeHaltContract(input?.halt, "HaltRecordV1");
    const assessment = normalizeHaltContract(
      input?.assessment,
      "AttributionAssessmentV1",
    );
    const correlationWindowSeconds =
      input?.correlationWindowSeconds === undefined
        ? 3600
        : input.correlationWindowSeconds;
    if (
      !Number.isInteger(correlationWindowSeconds) ||
      correlationWindowSeconds < 0 ||
      correlationWindowSeconds > 2_592_000
    )
      invalid(
        "correlationWindowSeconds must be an integer from 0 through 2592000.",
      );
    if (
      haltInput.projectId !== projectId ||
      assessment.projectId !== projectId
    )
      invalid("Halt and attribution project IDs must match the route.");
    if (
      haltInput.state !== "detected" ||
      haltInput.classificationAssessmentId !== undefined ||
      haltInput.haltClass !== undefined ||
      haltInput.effectiveIncidentId !== undefined
    )
      invalid("A newly detected HaltRecordV1 must be in detected state.");

    return this.serialize(projectId, async () => {
      const ledger = await readLedger(this.file(projectId), projectId);
      const projected = validateAndProject(ledger);
      const detectorKey = haltDetectorKey(
        projectId,
        haltInput.detector.detectorId,
        haltInput.detector.detectorEventId,
      );
      const priorHaltId = projected.detectorHaltIds.get(detectorKey);
      if (priorHaltId) return haltIncidentAggregate(projected, priorHaltId);
      if (projected.halts.has(haltInput.haltId))
        throw new ChangeControlError(
          `Halt ${haltInput.haltId} already exists.`,
          "CONFLICT",
          409,
        );

      const publicationTime = this.now();
      if (canonicalTimestampMillis(publicationTime) === undefined)
        invalid("The publication clock did not return a canonical UTC instant.");
      const halt: HaltRecordV1 = {
        ...haltInput,
        publishedAt: publicationTime,
      };
      if (observationFingerprintV1(halt) !== halt.observation.fingerprint)
        invalid("HaltRecordV1 observation fingerprint does not recompute.");
      if (
        assessment.haltId !== halt.haltId ||
        assessment.changeId !== halt.changeId ||
        !sameHaltScope(assessment.scope, halt.scope)
      )
        invalid("AttributionAssessmentV1 does not bind the exact halt scope.");
      if (
        canonicalTimestampMillis(assessment.assessedAt) === undefined ||
        Date.parse(assessment.assessedAt) < Date.parse(halt.occurredAt) ||
        Date.parse(assessment.assessedAt) > Date.parse(publicationTime)
      )
        invalid("AttributionAssessmentV1 violates publication causality.");
      if (
        assessment.haltClass === "unknown" &&
        (assessment.confidence !== "none" ||
          assessment.normalizedRootCauseKey !== "unknown")
      )
        invalid("Unknown classification requires none attribution.");
      if (
        assessment.confidence === "exact" &&
        (assessment.candidateCauses.length !== 1 ||
          assessment.candidateCauses[0].causeKey !==
            assessment.normalizedRootCauseKey ||
          assessment.normalizedRootCauseKey === "unknown")
      )
        invalid("Exact attribution requires one proven normalized cause.");
      if (
        assessment.confidence === "none" &&
        (assessment.candidateCauses.length !== 0 ||
          assessment.normalizedRootCauseKey !== "unknown")
      )
        invalid("None attribution requires unknown and no candidate causes.");

      const incidentFingerprint = incidentFingerprintV1(assessment);
      const exactIncidents = [...projected.incidents.values()].filter(
        (incident) =>
          incident.incidentFingerprint === incidentFingerprint &&
          incident.taxonomyPolicyVersion === assessment.taxonomyPolicyVersion,
      );
      const viableIncidents = exactIncidents.filter(
        (incident) =>
          activeIncidentStates.has(incident.state) ||
          incidentReopenWindowContains(incident, publicationTime),
      );
      let incident = viableIncidents.length === 1
        ? viableIncidents[0]
        : undefined;
      let correlationReason: HaltIncidentReasonCodeV1;
      if (viableIncidents.length > 1) {
        correlationReason = "INCIDENT_CORRELATION_AMBIGUOUS";
        incident = undefined;
      } else if (
        incident &&
        ["mitigated", "resolved"].includes(incident.state)
      ) {
        correlationReason = "INCIDENT_REOPENED";
      } else if (incident) {
        correlationReason = "INCIDENT_MATCHED_OPEN";
      } else if (exactIncidents.some((candidate) => candidate.state === "resolved")) {
        correlationReason = "INCIDENT_REOPEN_WINDOW_EXPIRED";
      } else {
        correlationReason = "INCIDENT_NEW";
      }

      const operationEventIds = new Set<string>();
      const appendOperation = (
        draft: EventDraft,
      ) => {
        const event = this.append(ledger, draft);
        operationEventIds.add(event.id);
        return event;
      };
      const detectedEvent = appendOperation({
        id: this.createId(),
        type: "halt.detected",
        occurredAt: publicationTime,
        projectId,
        changeId: halt.changeId,
        ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
        ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
        actor: halt.detector.detectorId,
        causationId: halt.detector.detectorEventId,
        correlationId: halt.correlationId,
        payload: normalizePayload({ halt }),
      });

      let correlationEvent: ChangeControlEvent;
      if (!incident) {
        const incidentId = this.createId();
        incident = {
          contractType: "IncidentRecordV1",
          contractVersion: "1.0",
          incidentId,
          projectId,
          changeId: halt.changeId,
          incidentFingerprintVersion: "incident-v1",
          incidentFingerprint,
          taxonomyPolicyVersion: assessment.taxonomyPolicyVersion,
          firstOccurrenceAt: halt.occurredAt,
          latestOccurrenceAt: halt.occurredAt,
          haltIds: [halt.haltId],
          affectedEntities: [assessment.affectedEntity],
          severity: halt.severity,
          ownerKind: [
            "human_decision_required",
            "destructive_or_external_risk",
            "unknown",
          ].includes(assessment.haltClass)
            ? "human"
            : "unassigned",
          state: "open",
          correlationWindowPolicy: {
            durationSeconds: correlationWindowSeconds,
            reopenUntil: null,
          },
          reopenOrdinal: 0,
          correlationReasonCode: correlationReason,
          openedAt: publicationTime,
        };
        correlationEvent = appendOperation({
          id: this.createId(),
          type: "incident.opened",
          occurredAt: publicationTime,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:incident-correlation-v1",
          causationId: detectedEvent.id,
          correlationId: halt.correlationId,
          payload: normalizePayload({ incident }),
        });
      } else {
        correlationEvent = appendOperation({
          id: this.createId(),
          type: "incident.halt-linked",
          occurredAt: publicationTime,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:incident-correlation-v1",
          causationId: detectedEvent.id,
          correlationId: halt.correlationId,
          payload: normalizePayload({
            haltId: halt.haltId,
            incidentId: incident.incidentId,
            incidentFingerprint,
            reasonCode: correlationReason,
          }),
        });
      }

      const classifiedEvent = appendOperation({
        id: this.createId(),
        type: "halt.classified",
        occurredAt: publicationTime,
        projectId,
        changeId: halt.changeId,
        ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
        ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
        actor: assessment.classifier.classifierId,
        causationId: correlationEvent.id,
        correlationId: halt.correlationId,
        payload: normalizePayload({
          haltId: halt.haltId,
          assessment,
          incidentId: incident.incidentId,
          previousState: "detected",
          state: "classified",
        }),
      });

      if (correlationReason === "INCIDENT_REOPENED") {
        appendOperation({
          id: this.createId(),
          type: "incident.reopened",
          occurredAt: publicationTime,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:incident-correlation-v1",
          causationId: classifiedEvent.id,
          correlationId: halt.correlationId,
          payload: normalizePayload({
            haltId: halt.haltId,
            incidentId: incident.incidentId,
            previousState: incident.state,
            state: "reopened",
            reopenOrdinal: incident.reopenOrdinal + 1,
            reopenUntil: incident.correlationWindowPolicy.reopenUntil,
            reasonCode: "INCIDENT_REOPENED",
          }),
        });
      }

      const failClosedReason =
        assessment.haltClass === "unknown"
          ? "HALT_CLASS_UNKNOWN"
          : assessment.confidence !== "exact"
            ? "ATTRIBUTION_NOT_EXACT"
          : correlationReason === "INCIDENT_CORRELATION_AMBIGUOUS"
            ? "INCIDENT_CORRELATION_AMBIGUOUS"
            : undefined;
      if (failClosedReason) {
        const haltEscalated = appendOperation({
          id: this.createId(),
          type: "halt.escalated",
          occurredAt: publicationTime,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:incident-correlation-v1",
          causationId: classifiedEvent.id,
          correlationId: halt.correlationId,
          payload: normalizePayload({
            haltId: halt.haltId,
            previousState: "classified",
            state: "escalated",
            reasonCode: failClosedReason,
            evidenceRefs: halt.evidenceRefs,
          }),
        });
        if (incident.state === "open")
          appendOperation({
            id: this.createId(),
            type: "incident.escalated",
            occurredAt: publicationTime,
            projectId,
            changeId: halt.changeId,
            actor: "policy:incident-correlation-v1",
            causationId: haltEscalated.id,
            correlationId: halt.correlationId,
            payload: normalizePayload({
              incidentId: incident.incidentId,
              previousState: "open",
              state: "escalated",
              reasonCode: failClosedReason,
              evidenceRefs: halt.evidenceRefs,
            }),
          });
      }

      const next = validateCandidateLedger(ledger);
      await writeAtomically(this.file(projectId), ledger);
      return haltIncidentAggregate(next, halt.haltId, operationEventIds);
    });
  }

  async getHaltIncidentProjection(
    projectIdValue: string,
  ): Promise<HaltIncidentProjectionV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const ledger = await readLedger(this.file(projectId), projectId);
    return immutableHaltIncidentProjection(
      projectId,
      validateAndProject(ledger),
    );
  }

  async getHalt(
    projectIdValue: string,
    haltIdValue: string,
  ): Promise<HaltIncidentAggregateV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const haltId = requireIdentifier(haltIdValue, "haltId");
    const ledger = await readLedger(this.file(projectId), projectId);
    return haltIncidentAggregate(validateAndProject(ledger), haltId);
  }

  async getIncident(
    projectIdValue: string,
    incidentIdValue: string,
  ): Promise<IncidentRecordV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const incidentId = requireIdentifier(incidentIdValue, "incidentId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const incident = validateAndProject(ledger).incidents.get(incidentId);
    if (!incident)
      throw new ChangeControlError(
        `Incident ${incidentId} was not found.`,
        "NOT_FOUND",
        404,
      );
    return deepFreeze(structuredClone(incident));
  }

  async transitionHalt(
    projectIdValue: string,
    haltIdValue: string,
    input: TransitionHaltInputV1,
  ): Promise<HaltIncidentAggregateV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const haltId = requireIdentifier(haltIdValue, "haltId");
    const actor = requireIdentity(input?.actor, "actor");
    if (!["escalated", "quarantined"].includes(input?.to))
      invalid(
        "This Phase 4 slice permits only escalated or quarantined halt transitions.",
      );
    if (
      !HALT_INCIDENT_REASON_CODES_V1.includes(
        input?.reasonCode as HaltIncidentReasonCodeV1,
      )
    )
      invalid("reasonCode is not a supported fail-closed reason code.");
    const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
    return this.serialize(projectId, async () => {
      const ledger = await readLedger(this.file(projectId), projectId);
      const projected = validateAndProject(ledger);
      const halt = projected.halts.get(haltId);
      if (!halt)
        throw new ChangeControlError(
          `Halt ${haltId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (!["classified", "action_pending", "healing"].includes(halt.state))
        throw new ChangeControlError(
          `Halt ${haltId} cannot transition from ${halt.state}.`,
          "CONFLICT",
          409,
        );
      const event = this.append(ledger, {
        id: this.createId(),
        type:
          input.to === "escalated"
            ? "halt.escalated"
            : "halt.quarantined",
        occurredAt: this.now(),
        projectId,
        changeId: halt.changeId,
        ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
        ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
        actor,
        causationId: input.causationId ?? halt.haltId,
        correlationId: input.correlationId ?? halt.correlationId,
        payload: normalizePayload({
          haltId,
          previousState: halt.state,
          state: input.to,
          reasonCode: input.reasonCode,
          evidenceRefs,
        }),
      });
      const next = validateCandidateLedger(ledger);
      await writeAtomically(this.file(projectId), ledger);
      return haltIncidentAggregate(next, haltId, new Set([event.id]));
    });
  }

  async transitionIncident(
    projectIdValue: string,
    incidentIdValue: string,
    input: TransitionIncidentInputV1,
  ): Promise<IncidentRecordV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const incidentId = requireIdentifier(incidentIdValue, "incidentId");
    const actor = requireIdentity(input?.actor, "actor");
    if (!["investigating", "mitigated", "escalated"].includes(input?.to))
      invalid(
        "This Phase 4 slice permits investigating, mitigated, or escalated incident transitions.",
      );
    if (
      !HALT_INCIDENT_REASON_CODES_V1.includes(
        input?.reasonCode as HaltIncidentReasonCodeV1,
      )
    )
      invalid("reasonCode is not a supported fail-closed reason code.");
    const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
    if (input?.to === "mitigated" && input?.receipt === undefined)
      invalid("A mitigated incident transition requires a resolution receipt.");
    const mitigationReceipt =
      input?.to === "mitigated"
        ? normalizeHaltContract(
            input.receipt,
            "IncidentResolutionReceiptV1",
          )
        : undefined;
    if (input?.to !== "mitigated" && input?.receipt !== undefined)
      invalid("Only a mitigated incident transition accepts a resolution receipt.");
    return this.serialize(projectId, async () => {
      const ledger = await readLedger(this.file(projectId), projectId);
      const projected = validateAndProject(ledger);
      const incident = projected.incidents.get(incidentId);
      if (!incident)
        throw new ChangeControlError(
          `Incident ${incidentId} was not found.`,
          "NOT_FOUND",
          404,
        );
      const legal: Record<string, readonly string[]> = {
        open: ["investigating", "mitigated", "escalated"],
        investigating: ["mitigated", "escalated"],
        healing: ["investigating", "mitigated", "escalated"],
        mitigated: ["escalated"],
        escalated: ["investigating", "mitigated"],
        reopened: ["investigating", "mitigated", "escalated"],
      };
      if (!(legal[incident.state] ?? []).includes(input.to))
        throw new ChangeControlError(
          `Incident ${incidentId} cannot transition from ${incident.state} to ${input.to}.`,
          "CONFLICT",
          409,
        );
      const publicationTime = this.now();
      if (canonicalTimestampMillis(publicationTime) === undefined)
        invalid("The publication clock did not return a canonical UTC instant.");
      if (mitigationReceipt) {
        if (
          mitigationReceipt.projectId !== projectId ||
          mitigationReceipt.changeId !== incident.changeId ||
          mitigationReceipt.incidentId !== incidentId ||
          mitigationReceipt.resolutionKind !== "mitigated" ||
          mitigationReceipt.resolvedAt !== publicationTime ||
          mitigationReceipt.resolvedBy !== actor ||
          mitigationReceipt.taxonomyPolicyVersion !==
            incident.taxonomyPolicyVersion ||
          mitigationReceipt.correlationWindowSeconds !==
            incident.correlationWindowPolicy.durationSeconds ||
          canonicalJson(mitigationReceipt.evidenceRefs as unknown as JsonValue) !==
            canonicalJson(evidenceRefs as unknown as JsonValue)
        )
          invalid(
            "IncidentResolutionReceiptV1 does not prove this exact mitigation publication.",
          );
      }
      this.append(ledger, {
        id: this.createId(),
        type: `incident.${input.to}` as ChangeControlEventType,
        occurredAt: publicationTime,
        projectId,
        changeId: incident.changeId,
        actor,
        causationId: input.causationId ?? incidentId,
        correlationId: input.correlationId ?? incidentId,
        payload: normalizePayload({
          incidentId,
          previousState: incident.state,
          state: input.to,
          reasonCode: input.reasonCode,
          evidenceRefs,
          ...(mitigationReceipt ? { receipt: mitigationReceipt } : {}),
        }),
      });
      const next = validateCandidateLedger(ledger);
      await writeAtomically(this.file(projectId), ledger);
      return deepFreeze(structuredClone(next.incidents.get(incidentId)!));
    });
  }

  async resolveIncident(
    projectIdValue: string,
    incidentIdValue: string,
    input: ResolveIncidentInputV1,
  ): Promise<IncidentRecordV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const incidentId = requireIdentifier(incidentIdValue, "incidentId");
    const receiptInput = normalizeJson(
      input?.receipt,
      "IncidentResolutionReceiptV1",
    );
    if (
      typeof receiptInput !== "object" ||
      receiptInput === null ||
      Array.isArray(receiptInput)
    )
      invalid("IncidentResolutionReceiptV1 must be a JSON object.");
    return this.serialize(projectId, async () => {
      const ledger = await readLedger(this.file(projectId), projectId);
      const projected = validateAndProject(ledger);
      const incident = projected.incidents.get(incidentId);
      if (!incident)
        throw new ChangeControlError(
          `Incident ${incidentId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (!["mitigated", "escalated"].includes(incident.state))
        throw new ChangeControlError(
          `Incident ${incidentId} must be mitigated or escalated before resolution.`,
          "CONFLICT",
          409,
        );
      const publicationTime = this.now();
      if (canonicalTimestampMillis(publicationTime) === undefined)
        invalid("The publication clock did not return a canonical UTC instant.");
      if (
        receiptInput.resolvedAt !== undefined &&
        receiptInput.resolvedAt !== publicationTime
      )
        invalid(
          "IncidentResolutionReceiptV1 resolvedAt must match the authoritative publication time.",
        );
      const receipt = normalizeHaltContract(
        { ...receiptInput, resolvedAt: publicationTime },
        "IncidentResolutionReceiptV1",
      );
      if (receipt.projectId !== projectId || receipt.incidentId !== incidentId)
        invalid("IncidentResolutionReceiptV1 does not match the route.");
      const reopenUntil = new Date(
        Date.parse(publicationTime) +
          receipt.correlationWindowSeconds * 1000,
      ).toISOString();
      this.append(ledger, {
        id: this.createId(),
        type: "incident.resolved",
        occurredAt: publicationTime,
        projectId,
        changeId: incident.changeId,
        actor: receipt.resolvedBy,
        causationId: input.causationId ?? receipt.receiptId,
        correlationId: input.correlationId ?? incidentId,
        payload: normalizePayload({
          receipt,
          previousState: incident.state,
          state: "resolved",
          reopenUntil,
        }),
      });
      const next = validateCandidateLedger(ledger);
      await writeAtomically(this.file(projectId), ledger);
      return deepFreeze(structuredClone(next.incidents.get(incidentId)!));
    });
  }

  async correctIncidentCorrelation(
    projectIdValue: string,
    haltIdValue: string,
    input: CorrectIncidentCorrelationInputV1,
  ): Promise<HaltIncidentAggregateV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const haltId = requireIdentifier(haltIdValue, "haltId");
    const incidentId = requireIdentifier(input?.incidentId, "incidentId");
    const correctionId = requireIdentifier(input?.correctionId, "correctionId");
    const actor = requireIdentity(input?.actor, "actor");
    if (!actor.startsWith("human:"))
      invalid("A correlation correction requires a human actor.");
    const reason = requireIdentity(input?.reason, "reason");
    const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
    return this.serialize(projectId, async () => {
      const ledger = await readLedger(this.file(projectId), projectId);
      const projected = validateAndProject(ledger);
      const halt = projected.halts.get(haltId);
      const incident = projected.incidents.get(incidentId);
      const previousIncidentId = projected.effectiveIncidentByHalt.get(haltId);
      const previousIncident = previousIncidentId
        ? projected.incidents.get(previousIncidentId)
        : undefined;
      if (!halt || !incident || !previousIncident)
        throw new ChangeControlError(
          "The halt or incident correlation target was not found.",
          "NOT_FOUND",
          404,
        );
      const correctionIssue = correlationCorrectionIssue(
        previousIncident,
        incident,
        actor,
      );
      if (
        correctionIssue === "SAME_INCIDENT" ||
        correctionIssue === "FINGERPRINT_MISMATCH"
      )
        throw new ChangeControlError(
          "A correction must target a different incident with the exact same versioned fingerprint.",
          "CONFLICT",
          409,
        );
      if (correctionIssue === "CLOSED_TARGET")
        throw new ChangeControlError(
          "A mitigated or resolved incident cannot receive a correlation correction; a new detected halt must satisfy deterministic reopen rules.",
          "CONFLICT",
          409,
        );
      const publicationTime = this.now();
      if (canonicalTimestampMillis(publicationTime) === undefined)
        invalid("The publication clock did not return a canonical UTC instant.");
      const event = this.append(ledger, {
        id: this.createId(),
        type: "incident.correlation-superseded",
        occurredAt: publicationTime,
        projectId,
        changeId: halt.changeId,
        ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
        ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
        actor,
        causationId: input.causationId ?? correctionId,
        correlationId: input.correlationId ?? halt.correlationId,
        payload: normalizePayload({
          correctionId,
          haltId,
          previousIncidentId,
          incidentId,
          correctedAt: publicationTime,
          correctedBy: actor,
          reason,
          evidenceRefs,
        }),
      });
      const next = validateCandidateLedger(ledger);
      await writeAtomically(this.file(projectId), ledger);
      return haltIncidentAggregate(next, haltId, new Set([event.id]));
    });
  }

  async evaluateWardenVerdict(
    projectIdValue: string,
    haltIdValue: string,
    input: EvaluateWardenVerdictInputV1,
  ): Promise<WardenAggregateV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const haltId = requireIdentifier(haltIdValue, "haltId");
    const verdictId = requireIdentifier(input?.verdictId, "verdictId");
    const policyVersion = requireIdentifier(
      input?.policyVersion,
      "policyVersion",
    );
    if (!Number.isSafeInteger(input?.verdictOrdinal) || input.verdictOrdinal < 1)
      invalid("verdictOrdinal must be a positive integer.");
    if (!["auto_heal", "bounded_retry", "none"].includes(input?.requestedAction))
      invalid("requestedAction is not in the closed Warden action set.");
    const evidenceSnapshot = normalizeWardenEvidenceSnapshot(
      input?.evidenceSnapshot,
    );
    const recipe = normalizeWardenRecipe(input?.recipe);
    const idempotencyKey =
      input?.idempotencyKey === undefined
        ? undefined
        : requireIdentity(input.idempotencyKey, "idempotencyKey");
    const leaseInput = input?.lease
      ? {
          leaseId: requireIdentifier(input.lease.leaseId, "lease.leaseId"),
          expectedEpoch: input.lease.expectedEpoch,
        }
      : undefined;
    if (
      leaseInput &&
      (!Number.isSafeInteger(leaseInput.expectedEpoch) || leaseInput.expectedEpoch < 1)
    )
      invalid("lease.expectedEpoch must be a positive integer.");

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const halt = projected.halts.get(haltId);
      const incidentId = projected.effectiveIncidentByHalt.get(haltId);
      const incident = incidentId ? projected.incidents.get(incidentId) : undefined;
      const assessment = halt?.classificationAssessmentId
        ? projected.assessments.get(halt.classificationAssessmentId)
        : undefined;
      if (!halt || !incident || !assessment)
        throw new ChangeControlError(
          `Classified halt ${haltId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (["recovered", "quarantined"].includes(halt.state))
        throw new ChangeControlError(
          `Halt ${haltId} is terminal and cannot receive another Warden verdict.`,
          "CONFLICT",
          409,
        );
      const history = projected.wardenVerdictsByHalt.get(haltId) ?? [];
      const prior = history.at(-1);
      const scopeKey = repairLeaseScopeKey(
        projectId,
        incident.incidentId,
        haltId,
      );
      if (projected.activeRepairLeaseByScope.has(scopeKey))
        throw new ChangeControlError(
          `Halt ${haltId} already has an active repair lease.`,
          "CONFLICT",
          409,
        );
      if (input.verdictOrdinal !== (prior?.verdictOrdinal ?? 0) + 1)
        throw new ChangeControlError(
          `Warden verdict ordinal must be ${(prior?.verdictOrdinal ?? 0) + 1}.`,
          "CONFLICT",
          409,
        );
      if (
        prior &&
        prior.evidenceSnapshot.snapshotHash === evidenceSnapshot.snapshotHash
      )
        throw new ChangeControlError(
          "A superseding Warden verdict requires a new evidence snapshot.",
          "CONFLICT",
          409,
        );
      const evaluatedAt = this.now();
      if (canonicalTimestampMillis(evaluatedAt) === undefined)
        invalid("The publication clock did not return a canonical UTC instant.");
      const decision = wardenPolicyDecision(
        projected,
        {
          policyVersion,
          requestedAction: input.requestedAction,
          evidenceSnapshot,
          ...(recipe ? { recipe } : {}),
        },
        halt,
        incident,
        assessment,
        evaluatedAt,
      );
      const automatic = ["allow_auto_heal", "allow_bounded_retry"].includes(
        decision.disposition,
      );
      let lease: RepairLeaseV1 | undefined;
      const operationEventIds = new Set<string>();
      let causationId = prior?.verdictId ?? assessment.assessmentId;
      if (automatic) {
        if (!recipe || !idempotencyKey)
          invalid(
            "An automatic Warden candidate requires exact recipe identity and an idempotency key.",
          );
        if (!leaseInput)
          invalid("An automatic Warden candidate requires an exclusive repair lease.");
        const expectedEpoch =
          (projected.repairLeaseEpochByScope.get(scopeKey) ?? 0) + 1;
        if (leaseInput.expectedEpoch !== expectedEpoch)
          throw new ChangeControlError(
            `REPAIR_LEASE_LOST: expected monotonic repair lease epoch ${expectedEpoch}.`,
            "CONFLICT",
            409,
          );
        const conflictingKey = [...projected.wardenVerdicts.values()].find(
          (candidate) =>
            candidate.idempotencyKey === idempotencyKey &&
            (candidate.haltId !== haltId ||
              !sameWardenRecipeIdentity(candidate.recipe, recipe)),
        );
        if (conflictingKey)
          throw new ChangeControlError(
            "The Warden idempotency key is already bound to conflicting repair authority.",
            "CONFLICT",
            409,
          );
        lease = {
          contractType: "RepairLeaseV1",
          contractVersion: "1.0",
          leaseId: leaseInput.leaseId,
          projectId,
          incidentId: incident.incidentId,
          haltId,
          epoch: expectedEpoch,
          state: "active",
          acquiredAt: evaluatedAt,
          acquiredBy: "policy:warden-v1",
        };
        assertWardenContractV1(lease, "RepairLeaseV1");
        const leaseEvent = this.append(ledger, {
          id: requireIdentifier(this.createId(), "id"),
          type: "warden.repair-lease-acquired",
          occurredAt: evaluatedAt,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:warden-v1",
          causationId,
          correlationId: halt.correlationId,
          payload: normalizePayload({ lease }),
        });
        operationEventIds.add(leaseEvent.id);
        causationId = leaseEvent.id;
      }
      const verdict: WardenVerdictV1 = {
        contractType: "WardenVerdictV1",
        contractVersion: "1.0",
        verdictId,
        projectId,
        changeId: halt.changeId,
        haltId,
        incidentId: incident.incidentId,
        attributionAssessmentId: assessment.assessmentId,
        evidenceSnapshot,
        policyVersion,
        verdictOrdinal: input.verdictOrdinal,
        requestedAction: input.requestedAction,
        disposition: decision.disposition,
        reasonCode: decision.reasonCode,
        ...(recipe ? { recipe } : {}),
        budgets: decision.budgets,
        ...(lease
          ? {
              repairLease: {
                leaseId: lease.leaseId,
                projectId: lease.projectId,
                incidentId: lease.incidentId,
                haltId: lease.haltId,
                epoch: lease.epoch,
                acquiredAt: lease.acquiredAt,
              },
              idempotencyKey: idempotencyKey!,
            }
          : {}),
        supersedesVerdictId: prior?.verdictId ?? null,
        evaluatedAt,
        evaluatedBy: "policy:warden-v1",
      };
      try {
        assertWardenContractV1(verdict, "WardenVerdictV1");
      } catch (error) {
        invalid(error instanceof Error ? error.message : "Warden verdict is invalid.");
      }
      const verdictEvent = this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type: "warden.verdict-recorded",
        occurredAt: evaluatedAt,
        projectId,
        changeId: halt.changeId,
        ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
        ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
        actor: "policy:warden-v1",
        causationId,
        correlationId: halt.correlationId,
        payload: normalizePayload({ verdict }),
      });
      operationEventIds.add(verdictEvent.id);
      if (["classified", "action_pending", "healing"].includes(halt.state)) {
        const quarantine = verdict.disposition === "quarantine";
        const transitionEvent = this.append(ledger, {
          id: requireIdentifier(this.createId(), "id"),
          type: quarantine ? "halt.quarantined" : "halt.dispositioned",
          occurredAt: evaluatedAt,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:warden-v1",
          causationId: verdict.verdictId,
          correlationId: halt.correlationId,
          payload: normalizePayload({
            haltId,
            previousState: halt.state,
            state: quarantine ? "quarantined" : "action_pending",
            reasonCode: verdict.reasonCode ?? "WARDEN_AUTO_ACTION_ALLOWED",
            evidenceRefs: evidenceSnapshot.evidenceRefs,
          }),
        });
        operationEventIds.add(transitionEvent.id);
      }
      const next = validateCandidateLedger(ledger);
      await writeAtomically(file, ledger);
      return wardenAggregate(next, haltId, operationEventIds);
    });
  }

  async transitionWardenRepairLease(
    projectIdValue: string,
    haltIdValue: string,
    input: TransitionWardenRepairLeaseInputV1,
  ): Promise<WardenAggregateV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const haltId = requireIdentifier(haltIdValue, "haltId");
    const leaseId = requireIdentifier(input?.leaseId, "leaseId");
    if (!Number.isSafeInteger(input?.leaseEpoch) || input.leaseEpoch < 1)
      invalid("leaseEpoch must be a positive integer.");
    if (!["released", "lost"].includes(input?.to))
      invalid("A repair lease may transition only to released or lost.");
    const actor = requireIdentity(input?.actor, "actor");
    if (actor !== "policy:warden-v1")
      invalid("Repair lease transitions require the deterministic Warden actor.");
    const evidenceRefs = normalizeEvidenceRefs(input?.evidenceRefs);
    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const lease = projected.repairLeases.get(leaseId);
      const halt = projected.halts.get(haltId);
      const incidentId = projected.effectiveIncidentByHalt.get(haltId);
      const incident = incidentId ? projected.incidents.get(incidentId) : undefined;
      const assessment = halt?.classificationAssessmentId
        ? projected.assessments.get(halt.classificationAssessmentId)
        : undefined;
      if (!lease || !halt || !incident || !assessment)
        throw new ChangeControlError(
          `Active repair lease ${leaseId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (
        lease.haltId !== haltId ||
        lease.incidentId !== incident.incidentId ||
        lease.epoch !== input.leaseEpoch ||
        lease.state !== "active"
      )
        throw new ChangeControlError(
          "REPAIR_LEASE_LOST: repair lease identity or epoch no longer matches.",
          "CONFLICT",
          409,
        );
      const publicationTime = this.now();
      const operationEventIds = new Set<string>();
      const transitionEvent = this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type:
          input.to === "lost"
            ? "warden.repair-lease-lost"
            : "warden.repair-lease-released",
        occurredAt: publicationTime,
        projectId,
        changeId: halt.changeId,
        ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
        ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
        actor,
        causationId: lease.leaseId,
        correlationId: halt.correlationId,
        payload: normalizePayload({
          haltId,
          incidentId: incident.incidentId,
          leaseId,
          leaseEpoch: lease.epoch,
          previousState: "active",
          state: input.to,
          evidenceRefs,
        }),
      });
      operationEventIds.add(transitionEvent.id);
      if (input.to === "lost") {
        const history = projected.wardenVerdictsByHalt.get(haltId) ?? [];
        const prior = history.at(-1);
        if (!prior || prior.repairLease?.leaseId !== leaseId)
          throw new ChangeControlError(
            "REPAIR_LEASE_LOST: the lease lacks an active Warden verdict.",
            "CONFLICT",
            409,
          );
        const verdictId = requireIdentifier(input.verdictId, "verdictId");
        const snapshotBody = {
          ...prior.evidenceSnapshot,
          capturedAt: publicationTime,
          haltRecordHash: wardenContractHashV1(halt),
          incidentRecordHash: wardenContractHashV1(incident),
          attributionAssessmentHash: wardenContractHashV1(assessment),
          evidenceRefs: [...new Set([...prior.evidenceSnapshot.evidenceRefs, ...evidenceRefs])],
          sideEffectState: assessment.evidence.sideEffectState,
          priorRepairResult: "ambiguous" as const,
          quarantineReasonCodes: ["REPAIR_LEASE_LOST" as const],
        };
        const { snapshotHash: _priorHash, ...withoutHash } = snapshotBody;
        const evidenceSnapshot: WardenEvidenceSnapshotV1 = {
          ...withoutHash,
          snapshotHash: wardenEvidenceSnapshotHashV1(withoutHash),
        };
        const verdict: WardenVerdictV1 = {
          contractType: "WardenVerdictV1",
          contractVersion: "1.0",
          verdictId,
          projectId,
          changeId: halt.changeId,
          haltId,
          incidentId: incident.incidentId,
          attributionAssessmentId: assessment.assessmentId,
          evidenceSnapshot,
          policyVersion: prior.policyVersion,
          verdictOrdinal: prior.verdictOrdinal + 1,
          requestedAction: prior.requestedAction,
          disposition: "quarantine",
          reasonCode: "REPAIR_LEASE_LOST",
          ...(prior.recipe ? { recipe: prior.recipe } : {}),
          budgets: wardenBudgetSnapshot(
            projected,
            haltId,
            incident.incidentId,
            false,
          ),
          supersedesVerdictId: prior.verdictId,
          evaluatedAt: publicationTime,
          evaluatedBy: "policy:warden-v1",
        };
        assertWardenContractV1(verdict, "WardenVerdictV1");
        const verdictEvent = this.append(ledger, {
          id: requireIdentifier(this.createId(), "id"),
          type: "warden.verdict-recorded",
          occurredAt: publicationTime,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:warden-v1",
          causationId: transitionEvent.id,
          correlationId: halt.correlationId,
          payload: normalizePayload({ verdict }),
        });
        operationEventIds.add(verdictEvent.id);
        const haltEvent = this.append(ledger, {
          id: requireIdentifier(this.createId(), "id"),
          type: "halt.quarantined",
          occurredAt: publicationTime,
          projectId,
          changeId: halt.changeId,
          ...(halt.scope.waveId ? { waveId: halt.scope.waveId } : {}),
          ...(halt.scope.taskId ? { taskId: halt.scope.taskId } : {}),
          actor: "policy:warden-v1",
          causationId: verdict.verdictId,
          correlationId: halt.correlationId,
          payload: normalizePayload({
            haltId,
            previousState: halt.state,
            state: "quarantined",
            reasonCode: "REPAIR_LEASE_LOST",
            evidenceRefs: evidenceSnapshot.evidenceRefs,
          }),
        });
        operationEventIds.add(haltEvent.id);
      }
      const next = validateCandidateLedger(ledger);
      await writeAtomically(file, ledger);
      return wardenAggregate(next, haltId, operationEventIds);
    });
  }

  async getWardenProjection(
    projectIdValue: string,
  ): Promise<WardenProjectionV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const ledger = await readLedger(this.file(projectId), projectId);
    return immutableWardenProjection(projectId, validateAndProject(ledger));
  }

  async getWardenVerdict(
    projectIdValue: string,
    haltIdValue: string,
  ): Promise<WardenAggregateV1> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const haltId = requireIdentifier(haltIdValue, "haltId");
    const ledger = await readLedger(this.file(projectId), projectId);
    return wardenAggregate(validateAndProject(ledger), haltId);
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
