import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import schema from "./schemas/operator-actions-v1.schema.json";

export const OPERATOR_ACTION_KINDS_V1 = [
  "dispatch-wave",
  "authorize-task-retry",
  "authorize-wave-resume",
  "transition-incident",
  "resolve-incident",
] as const;

export type OperatorActionKindV1 = (typeof OPERATOR_ACTION_KINDS_V1)[number];

export const OPERATOR_ACTION_OWNING_GATES_V1 = {
  "dispatch-wave": "phase-2-dispatch-gate",
  "authorize-task-retry": "phase-4-task-retry-authorization",
  "authorize-wave-resume": "phase-4-wave-resume-authorization",
  "transition-incident": "phase-4-incident-lifecycle",
  "resolve-incident": "phase-4-incident-resolution",
} as const satisfies Readonly<Record<OperatorActionKindV1, string>>;

export type OperatorActionOwningGateV1 =
  (typeof OPERATOR_ACTION_OWNING_GATES_V1)[OperatorActionKindV1];

const OPERATOR_ACTION_GATE_EVENT_TYPES_V1 = {
  "phase-2-dispatch-gate": ["wave.dispatched", "wave.dispatch-overridden"],
  "phase-4-task-retry-authorization": ["task.retry-authorized"],
  "phase-4-wave-resume-authorization": ["wave.resume-authorized"],
  "phase-4-incident-lifecycle": [
    "incident.investigating",
    "incident.mitigated",
    "incident.escalated",
  ],
  "phase-4-incident-resolution": ["incident.resolved"],
} as const satisfies Readonly<
  Record<OperatorActionOwningGateV1, readonly string[]>
>;

export const OPERATOR_INCIDENT_REASON_CODES_V1 = [
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

export type OperatorIncidentReasonCodeV1 =
  (typeof OPERATOR_INCIDENT_REASON_CODES_V1)[number];

export const OPERATOR_ACTION_OWNING_GATE_REASON_CODES_V1 = [
  "AUTHORITY_REQUIRED",
  "EVIDENCE_INCOMPLETE",
  "PLAN_REQUIRED",
  "PLAN_CONTRACT_INVALID",
  "PLAN_NOT_AUTHORIZED",
  "CURRENT_BASE_UNREADABLE",
  "CURRENT_WORKTREE_DIRTY",
  "PLAN_BASE_MISMATCH",
  "PLAN_STALE",
  "ACCEPTANCE_ORACLE_UNEXECUTABLE",
  "BLAST_RADIUS_UNEVIDENCED",
  "REPLAN_RECEIPT_REQUIRED",
  "WAVE_NOT_READY",
  "TASK_NOT_RETRYABLE",
  "WAVE_NOT_RESUMABLE",
  "INCIDENT_TRANSITION_ILLEGAL",
  "INCIDENT_RESOLUTION_INVALID",
  ...OPERATOR_INCIDENT_REASON_CODES_V1,
] as const;

export type OperatorActionOwningGateReasonCodeV1 =
  (typeof OPERATOR_ACTION_OWNING_GATE_REASON_CODES_V1)[number];

export const OPERATOR_ACTION_REASON_CODES_V1 = [
  "UNKNOWN_ACTION",
  "INVALID_REQUEST",
  "CONFIRMATION_REQUIRED",
  "SOURCE_WATERMARK_CHANGED",
  "PROJECT_STATE_CHANGED",
  "TARGET_STATE_CHANGED",
  "AUTHORITY_REQUIRED",
  "GATE_REJECTED",
  "IDEMPOTENCY_CONFLICT",
  "STORAGE_FAILURE",
  "PRIVACY_VIOLATION",
  "EVIDENCE_INCOMPLETE",
  "TARGET_IDENTITY_MISMATCH",
  ...OPERATOR_ACTION_OWNING_GATE_REASON_CODES_V1,
] as const;

export type OperatorActionReasonCodeV1 =
  (typeof OPERATOR_ACTION_REASON_CODES_V1)[number];

type HashV1 = string;
type PlanReferenceV1 = Readonly<{
  planId: string;
  revision: number;
  planBaseSha: string;
}>;

export type DispatchWaveTargetV1 = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  plan: PlanReferenceV1;
  authorizationId: string;
}>;

export type TaskRetryTargetV1 = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  haltId: string;
  incidentId: string;
}>;

export type WaveResumeTargetV1 = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  haltId: string;
  incidentId: string;
}>;

export type IncidentTargetV1 = Readonly<{
  projectId: string;
  changeId: string;
  incidentId: string;
}>;

export type OperatorActionTargetV1 =
  | DispatchWaveTargetV1
  | TaskRetryTargetV1
  | WaveResumeTargetV1
  | IncidentTargetV1;

export type RecoveryAuthorityV1 =
  | Readonly<{ kind: "warden"; actor: "policy:warden-v1"; verdictId: string }>
  | Readonly<{
      kind: "audited_human";
      actor: string;
      decisionId: string;
      evidenceRefs: readonly string[];
    }>;

export type IncidentResolutionReceiptInputV1 = Readonly<{
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
  resolvedAt?: string;
  resolvedBy: string;
  taxonomyPolicyVersion: "halt-taxonomy-v1";
  correlationWindowSeconds: number;
}>;

type RequestBaseV1<
  K extends OperatorActionKindV1,
  T extends OperatorActionTargetV1,
  I,
> = Readonly<{
  contractType: "OperatorActionRequestV1";
  contractVersion: "1.0";
  requestId: string;
  actionKind: K;
  target: T;
  actor: string;
  reason: string;
  input: I;
  expectedSourceWatermark: HashV1;
  expectedProjectSequence: number;
  expectedProjectHash: HashV1 | null;
  idempotencyKey: string;
}>;

export type DispatchWaveRequestV1 = RequestBaseV1<
  "dispatch-wave",
  DispatchWaveTargetV1,
  Readonly<{ sendAnyway?: true }>
>;

export type AuthorizeTaskRetryRequestV1 = RequestBaseV1<
  "authorize-task-retry",
  TaskRetryTargetV1,
  Readonly<{
    authorizationId: string;
    priorTerminalEventId: string;
    newAttemptId: string;
    attemptAllocationNonce: string;
    budgetOrdinal: number;
    authority: RecoveryAuthorityV1;
  }>
>;

export type AuthorizeWaveResumeRequestV1 = RequestBaseV1<
  "authorize-wave-resume",
  WaveResumeTargetV1,
  Readonly<{
    authorizationId: string;
    priorTerminalEventId: string;
    budgetOrdinal: number;
    authority: RecoveryAuthorityV1;
  }>
>;

export type TransitionIncidentRequestV1 = RequestBaseV1<
  "transition-incident",
  IncidentTargetV1,
  Readonly<{
    to: "investigating" | "mitigated" | "escalated";
    reasonCode: OperatorIncidentReasonCodeV1;
    evidenceRefs: readonly string[];
    receipt?: IncidentResolutionReceiptInputV1;
  }>
>;

export type ResolveIncidentRequestV1 = RequestBaseV1<
  "resolve-incident",
  IncidentTargetV1,
  Readonly<{ receipt: IncidentResolutionReceiptInputV1 }>
>;

export type OperatorActionRequestV1 =
  | DispatchWaveRequestV1
  | AuthorizeTaskRetryRequestV1
  | AuthorizeWaveResumeRequestV1
  | TransitionIncidentRequestV1
  | ResolveIncidentRequestV1;

export type OperatorActionExecuteRequestV1 = Readonly<{
  request: OperatorActionRequestV1;
  previewHash: HashV1;
  confirmed: true;
}>;

export type OperatorActionEvidenceV1 = Readonly<{
  contractType: "OperatorActionEvidenceV1";
  contractVersion: "1.0";
  projectId: string;
  target: OperatorActionTargetV1;
  projectSequence: number;
  projectHash: HashV1 | null;
  sourceWatermark: HashV1;
  currentTargetState: string;
  owningGate: OperatorActionOwningGateV1;
  gateDecision: Readonly<{
    allowed: boolean;
    reasonCodes: readonly OperatorActionOwningGateReasonCodeV1[];
    evidenceRefs: readonly string[];
    expectedCanonicalEventType: string | null;
  }>;
  warningCodes: readonly OperatorActionReasonCodeV1[];
}>;

export type OperatorActionPreviewV1 = Readonly<{
  contractType: "OperatorActionPreviewV1";
  contractVersion: "1.0";
  request: OperatorActionRequestV1;
  requestHash: HashV1;
  currentProjectSequence: number;
  currentProjectHash: HashV1 | null;
  currentSourceWatermark: HashV1;
  currentTargetState: string;
  owningGate: OperatorActionOwningGateV1;
  allowed: boolean;
  reasonCodes: readonly OperatorActionReasonCodeV1[];
  expectedCanonicalEventType: string | null;
  warnings: readonly OperatorActionReasonCodeV1[];
  evidenceRefs: readonly string[];
  previewHash: HashV1;
  responseTimestamp?: string;
}>;

export type OperatorActionReceiptV1 = Readonly<{
  contractType: "OperatorActionReceiptV1";
  contractVersion: "1.0";
  receiptId: string;
  request: OperatorActionRequestV1;
  requestHash: HashV1;
  previewHash: HashV1;
  actor: string;
  reason: string;
  idempotencyKey: string;
  actionKind: OperatorActionKindV1;
  target: OperatorActionTargetV1;
  observedProjectSequence: number;
  observedProjectHash: HashV1 | null;
  observedSourceWatermark: HashV1;
  outcome: "executed" | "rejected" | "already-executed";
  reasonCodes: readonly OperatorActionReasonCodeV1[];
  evidenceRefs: readonly string[];
  canonicalEvent: Readonly<{
    eventId: string;
    eventType: string;
    eventHash: HashV1;
  }> | null;
  resultingProjectSequence: number | null;
  resultingProjectHash: HashV1 | null;
  receiptHash: HashV1;
}>;

export class OperatorActionContractErrorV1 extends Error {
  constructor(
    readonly code: OperatorActionReasonCodeV1,
    message: string,
  ) {
    super(message);
    this.name = "OperatorActionContractErrorV1";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date-time", true);
ajv.addSchema(schema);
const requestValidator = ajv.getSchema(
  `${schema.$id}#/$defs/OperatorActionRequestV1`,
)!;
const evidenceValidator = ajv.getSchema(
  `${schema.$id}#/$defs/OperatorActionEvidenceV1`,
)!;
const executeRequestValidator = ajv.getSchema(
  `${schema.$id}#/$defs/OperatorActionExecuteRequestV1`,
)!;
const previewValidator = ajv.getSchema(
  `${schema.$id}#/$defs/OperatorActionPreviewV1`,
)!;
const receiptValidator = ajv.getSchema(
  `${schema.$id}#/$defs/OperatorActionReceiptV1`,
)!;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const privacyFieldNames = new Set([
  "credential",
  "credentials",
  "environment",
  "environmentvalue",
  "environmentvalues",
  "env",
  "prompt",
  "promptbody",
  "providerhiddenreasoning",
  "hiddenreasoning",
  "rawproviderpayload",
  "providerpayload",
  "filecontent",
  "filecontents",
  "log",
  "logs",
  "password",
  "secret",
  "secrets",
  "apikey",
  "accesstoken",
  "refreshtoken",
]);

const sensitiveTextPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|client[_-]?secret|password|passwd)\s*[:=]\s*\S+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/,
];

function privacyKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function assertJsonObjectTree(value: unknown, path = "$", seen = new Set<object>()): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) return;
  if (typeof value !== "object")
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", `${path} is not JSON-compatible.`);
  if (seen.has(value as object))
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", `${path} contains a cycle.`);
  seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonObjectTree(item, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new OperatorActionContractErrorV1("INVALID_REQUEST", `${path} must be a plain JSON object.`);
    for (const [key, item] of Object.entries(value))
      assertJsonObjectTree(item, `${path}.${key}`, seen);
  }
  seen.delete(value as object);
}

export function assertOperatorActionPrivacyV1(value: unknown): void {
  const visit = (item: unknown, path: string): void => {
    if (
      typeof item === "string" &&
      sensitiveTextPatterns.some((pattern) => pattern.test(item))
    ) throw new OperatorActionContractErrorV1(
      "PRIVACY_VIOLATION",
      `Sensitive credential-like text is prohibited at ${path}.`,
    );
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(item)) return;
    for (const [key, nested] of Object.entries(item)) {
      if (privacyFieldNames.has(privacyKey(key)))
        throw new OperatorActionContractErrorV1(
          "PRIVACY_VIOLATION",
          `Prohibited privacy field at ${path}.${key}.`,
        );
      visit(nested, `${path}.${key}`);
    }
  };
  visit(value, "$");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function operatorActionHashV1(value: unknown): string {
  assertJsonObjectTree(value);
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

const cleanText = (value: string): string => value.trim();
const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const sortedUnique = <T extends string>(values: readonly T[]): T[] =>
  [...new Set(values)].sort(compareText);

function normalizeAuthority(authority: RecoveryAuthorityV1): RecoveryAuthorityV1 {
  if (authority.kind === "warden") return { ...authority };
  return {
    ...authority,
    actor: cleanText(authority.actor),
    evidenceRefs: sortedUnique(authority.evidenceRefs.map(cleanText)),
  };
}

function normalizeResolutionReceipt(
  receipt: IncidentResolutionReceiptInputV1,
): IncidentResolutionReceiptInputV1 {
  return {
    ...receipt,
    oracle: {
      ...receipt.oracle,
      observationResult: cleanText(receipt.oracle.observationResult),
    },
    evidenceRefs: sortedUnique(receipt.evidenceRefs.map(cleanText)),
    resolvedBy: cleanText(receipt.resolvedBy),
  };
}

function normalizedRequest(value: OperatorActionRequestV1): OperatorActionRequestV1 {
  const common = {
    ...value,
    actor: cleanText(value.actor),
    reason: cleanText(value.reason),
    idempotencyKey: cleanText(value.idempotencyKey),
  };
  switch (value.actionKind) {
    case "dispatch-wave":
      return {
        ...common,
        input: value.input.sendAnyway === true ? { sendAnyway: true } : {},
      } as DispatchWaveRequestV1;
    case "authorize-task-retry":
      return {
        ...common,
        input: { ...value.input, authority: normalizeAuthority(value.input.authority) },
      } as AuthorizeTaskRetryRequestV1;
    case "authorize-wave-resume":
      return {
        ...common,
        input: { ...value.input, authority: normalizeAuthority(value.input.authority) },
      } as AuthorizeWaveResumeRequestV1;
    case "transition-incident":
      return {
        ...common,
        input: {
          ...value.input,
          reasonCode: cleanText(value.input.reasonCode),
          evidenceRefs: sortedUnique(value.input.evidenceRefs.map(cleanText)),
          ...(value.input.receipt
            ? { receipt: normalizeResolutionReceipt(value.input.receipt) }
            : {}),
        },
      } as TransitionIncidentRequestV1;
    case "resolve-incident":
      return {
        ...common,
        input: { receipt: normalizeResolutionReceipt(value.input.receipt) },
      } as ResolveIncidentRequestV1;
  }
}

function throwSchemaError(
  validator: typeof requestValidator,
  code: OperatorActionReasonCodeV1,
  label: string,
): never {
  throw new OperatorActionContractErrorV1(
    code,
    `${label} failed validation: ${ajv.errorsText(validator.errors)}`,
  );
}

function assertSequenceHash(sequence: number, hash: string | null, label: string): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0)
    throw new OperatorActionContractErrorV1(
      "EVIDENCE_INCOMPLETE",
      `${label} sequence must be a non-negative safe integer.`,
    );
  if ((sequence === 0) !== (hash === null))
    throw new OperatorActionContractErrorV1(
      "EVIDENCE_INCOMPLETE",
      `${label} hash must be null exactly when sequence is zero.`,
    );
}

const canonicalTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/;

function assertCanonicalTimestamp(value: string, label: string): void {
  const match = canonicalTimestampPattern.exec(value);
  const milliseconds = Date.parse(value);
  const parsed = new Date(milliseconds);
  if (
    !match ||
    !Number.isFinite(milliseconds) ||
    parsed.getUTCFullYear() !== Number(match[1]) ||
    parsed.getUTCMonth() + 1 !== Number(match[2]) ||
    parsed.getUTCDate() !== Number(match[3]) ||
    parsed.getUTCHours() !== Number(match[4]) ||
    parsed.getUTCMinutes() !== Number(match[5]) ||
    parsed.getUTCSeconds() !== Number(match[6])
  ) throw new OperatorActionContractErrorV1(
    "INVALID_REQUEST",
    `${label} must be a valid canonical UTC timestamp.`,
  );
}

function assertRequestSemantics(request: OperatorActionRequestV1): void {
  assertSequenceHash(
    request.expectedProjectSequence,
    request.expectedProjectHash,
    "Expected project",
  );
  const idempotencyScope = `${request.target.projectId}:${request.actionKind}:`;
  if (!request.idempotencyKey.startsWith(idempotencyScope))
    throw new OperatorActionContractErrorV1(
      "TARGET_IDENTITY_MISMATCH",
      "The idempotency key must be scoped to the request project and action kind.",
    );
  if (request.actionKind === "authorize-task-retry") {
    if (
      request.input.authority.kind === "audited_human" &&
      request.input.authority.actor !== request.actor
    ) throw new OperatorActionContractErrorV1(
      "TARGET_IDENTITY_MISMATCH",
      "The audited-human authority actor must equal the operator actor.",
    );
  }
  if (request.actionKind === "authorize-wave-resume") {
    if (
      request.input.authority.kind === "audited_human" &&
      request.input.authority.actor !== request.actor
    ) throw new OperatorActionContractErrorV1(
      "TARGET_IDENTITY_MISMATCH",
      "The audited-human authority actor must equal the operator actor.",
    );
  }
  if (request.actionKind === "transition-incident") {
    const receipt = request.input.receipt;
    if ((request.input.to === "mitigated") !== Boolean(receipt))
      throw new OperatorActionContractErrorV1(
        "INVALID_REQUEST",
        "Exactly a mitigated incident transition requires a resolution receipt.",
      );
    if (receipt) {
      assertReceiptIdentity(request, receipt, "mitigated");
      if (canonicalJson(receipt.evidenceRefs) !== canonicalJson(request.input.evidenceRefs))
        throw new OperatorActionContractErrorV1(
          "TARGET_IDENTITY_MISMATCH",
          "Incident mitigation evidence must exactly match its resolution receipt.",
        );
    }
  }
  if (request.actionKind === "resolve-incident")
    assertReceiptIdentity(request, request.input.receipt, "resolved");
}

function assertReceiptIdentity(
  request: TransitionIncidentRequestV1 | ResolveIncidentRequestV1,
  receipt: IncidentResolutionReceiptInputV1,
  kind: "mitigated" | "resolved",
): void {
  if (
    receipt.projectId !== request.target.projectId ||
    receipt.changeId !== request.target.changeId ||
    receipt.incidentId !== request.target.incidentId ||
    receipt.resolvedBy !== request.actor ||
    receipt.resolutionKind !== kind
  ) throw new OperatorActionContractErrorV1(
    "TARGET_IDENTITY_MISMATCH",
    "Incident resolution evidence does not match the request target, actor, and action.",
  );
  if (receipt.resolvedAt !== undefined)
    assertCanonicalTimestamp(receipt.resolvedAt, "Incident resolution time");
}

export function parseOperatorActionRequestV1(value: unknown): OperatorActionRequestV1 {
  assertJsonObjectTree(value);
  assertOperatorActionPrivacyV1(value);
  if (
    isRecord(value) &&
    typeof value.actionKind === "string" &&
    !OPERATOR_ACTION_KINDS_V1.includes(value.actionKind as OperatorActionKindV1)
  ) throw new OperatorActionContractErrorV1("UNKNOWN_ACTION", "Unknown operator action kind.");
  if (!requestValidator(value)) throwSchemaError(requestValidator, "INVALID_REQUEST", "OperatorActionRequestV1");
  const request = normalizedRequest(structuredClone(value) as OperatorActionRequestV1);
  if (!requestValidator(request)) throwSchemaError(requestValidator, "INVALID_REQUEST", "Normalized OperatorActionRequestV1");
  assertRequestSemantics(request);
  return deepFreeze(structuredClone(request));
}

export const normalizeOperatorActionRequestV1 = parseOperatorActionRequestV1;

export function operatorActionRequestHashV1(value: unknown): string {
  return operatorActionHashV1(parseOperatorActionRequestV1(value));
}

export function parseOperatorActionExecuteRequestV1(
  value: unknown,
): OperatorActionExecuteRequestV1 {
  assertJsonObjectTree(value);
  assertOperatorActionPrivacyV1(value);
  if (!isRecord(value) || value.confirmed !== true)
    throw new OperatorActionContractErrorV1(
      "CONFIRMATION_REQUIRED",
      "Operator action execution requires explicit confirmed: true.",
    );
  if (!executeRequestValidator(value))
    throwSchemaError(
      executeRequestValidator,
      "INVALID_REQUEST",
      "OperatorActionExecuteRequestV1",
    );
  const parsed = structuredClone(value) as OperatorActionExecuteRequestV1;
  return deepFreeze({
    ...parsed,
    request: parseOperatorActionRequestV1(parsed.request),
  });
}

export function operatorActionSourceWatermarkV1(
  projectId: string,
  sequence: number,
  hash: string | null,
): string {
  return operatorActionHashV1({
    sourceWatermarks: [
      {
        projectId,
        sourceRef: `change-control:${projectId}`,
        sequence,
        hash,
      },
    ],
    unavailable: [],
  });
}

export function operatorActionExpectedEventTypesV1(
  request: OperatorActionRequestV1,
): readonly string[] {
  switch (request.actionKind) {
    case "dispatch-wave":
      return request.input.sendAnyway === true
        ? ["wave.dispatch-overridden"]
        : ["wave.dispatched"];
    case "authorize-task-retry": return ["task.retry-authorized"];
    case "authorize-wave-resume": return ["wave.resume-authorized"];
    case "transition-incident": return [`incident.${request.input.to}`];
    case "resolve-incident": return ["incident.resolved"];
  }
}

export function operatorActionTargetStateSupportsRequestV1(
  request: OperatorActionRequestV1,
  currentState: string,
): boolean {
  switch (request.actionKind) {
    case "dispatch-wave":
      return currentState === "ready" ||
        (request.input.sendAnyway === true && currentState === "draft");
    case "authorize-task-retry":
      return currentState === "failed" || currentState === "halted";
    case "authorize-wave-resume":
      return currentState === "halted";
    case "resolve-incident":
      return currentState === "mitigated" || currentState === "escalated";
    case "transition-incident": {
      const legal: Readonly<Record<string, readonly TransitionIncidentRequestV1["input"]["to"][]>> = {
        open: ["investigating", "mitigated", "escalated"],
        investigating: ["mitigated", "escalated"],
        healing: ["investigating", "mitigated", "escalated"],
        mitigated: ["escalated"],
        escalated: ["investigating", "mitigated"],
        reopened: ["investigating", "mitigated", "escalated"],
      };
      return legal[currentState]?.includes(request.input.to) === true;
    }
  }
}

function normalizeEvidence(value: OperatorActionEvidenceV1): OperatorActionEvidenceV1 {
  return {
    ...value,
    gateDecision: {
      ...value.gateDecision,
      reasonCodes: sortedUnique(value.gateDecision.reasonCodes),
      evidenceRefs: sortedUnique(value.gateDecision.evidenceRefs.map(cleanText)),
    },
    warningCodes: sortedUnique(value.warningCodes),
  };
}

function targetMatchesOwningGate(
  target: OperatorActionTargetV1,
  owningGate: OperatorActionOwningGateV1,
): boolean {
  const hasWave = "waveId" in target;
  const hasTask = "taskId" in target;
  const hasHalt = "haltId" in target;
  const hasPlan = "plan" in target;
  switch (owningGate) {
    case "phase-2-dispatch-gate":
      return hasWave && hasPlan && !hasTask && !hasHalt;
    case "phase-4-task-retry-authorization":
      return hasWave && hasTask && hasHalt && !hasPlan;
    case "phase-4-wave-resume-authorization":
      return hasWave && !hasTask && hasHalt && !hasPlan;
    case "phase-4-incident-lifecycle":
    case "phase-4-incident-resolution":
      return !hasWave && !hasTask && !hasHalt && !hasPlan;
  }
}

export function parseOperatorActionEvidenceV1(value: unknown): OperatorActionEvidenceV1 {
  assertJsonObjectTree(value);
  assertOperatorActionPrivacyV1(value);
  if (!evidenceValidator(value))
    throwSchemaError(evidenceValidator, "EVIDENCE_INCOMPLETE", "OperatorActionEvidenceV1");
  const evidence = normalizeEvidence(structuredClone(value) as OperatorActionEvidenceV1);
  if (!evidenceValidator(evidence))
    throwSchemaError(evidenceValidator, "EVIDENCE_INCOMPLETE", "Normalized OperatorActionEvidenceV1");
  assertSequenceHash(evidence.projectSequence, evidence.projectHash, "Current project");
  if (evidence.projectId !== evidence.target.projectId)
    throw new OperatorActionContractErrorV1(
      "TARGET_IDENTITY_MISMATCH",
      "Canonical evidence project identity does not match its target identity.",
    );
  if (!targetMatchesOwningGate(evidence.target, evidence.owningGate))
    throw new OperatorActionContractErrorV1(
      "TARGET_IDENTITY_MISMATCH",
      "Canonical evidence target identity does not match its owning gate.",
    );
  if (evidence.gateDecision.allowed) {
    if (evidence.gateDecision.reasonCodes.length > 0 || evidence.gateDecision.expectedCanonicalEventType === null)
      throw new OperatorActionContractErrorV1(
        "EVIDENCE_INCOMPLETE",
        "Allowed gate evidence requires an expected event and no denial reasons.",
      );
    const ownedEventTypes: readonly string[] =
      OPERATOR_ACTION_GATE_EVENT_TYPES_V1[evidence.owningGate];
    if (!ownedEventTypes.includes(evidence.gateDecision.expectedCanonicalEventType))
      throw new OperatorActionContractErrorV1(
        "EVIDENCE_INCOMPLETE",
        "Allowed gate evidence predicts an event not owned by the named gate.",
      );
  } else if (
    evidence.gateDecision.reasonCodes.length === 0 ||
    evidence.gateDecision.expectedCanonicalEventType !== null
  ) throw new OperatorActionContractErrorV1(
    "EVIDENCE_INCOMPLETE",
    "Denied gate evidence requires reasons and cannot predict an event.",
  );
  return deepFreeze(structuredClone(evidence));
}

function previewHashContent(preview: Omit<OperatorActionPreviewV1, "previewHash" | "responseTimestamp">): unknown {
  return preview;
}

export function operatorActionPreviewHashV1(
  value: Omit<OperatorActionPreviewV1, "previewHash" | "responseTimestamp">,
): string {
  return operatorActionHashV1(previewHashContent(value));
}

function sameTarget(left: OperatorActionTargetV1, right: OperatorActionTargetV1): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export class OperatorActionPreviewEngineV1 {
  preview(requestValue: unknown, evidenceValue: unknown): OperatorActionPreviewV1 {
    const request = parseOperatorActionRequestV1(requestValue);
    const evidence = parseOperatorActionEvidenceV1(evidenceValue);
    const requestHash = operatorActionHashV1(request);
    const owningGate = OPERATOR_ACTION_OWNING_GATES_V1[request.actionKind];
    const reasons = new Set<OperatorActionReasonCodeV1>();
    if (request.expectedSourceWatermark !== evidence.sourceWatermark)
      reasons.add("SOURCE_WATERMARK_CHANGED");
    if (
      request.expectedProjectSequence !== evidence.projectSequence ||
      request.expectedProjectHash !== evidence.projectHash
    ) reasons.add("PROJECT_STATE_CHANGED");
    if (request.target.projectId !== evidence.projectId || !sameTarget(request.target, evidence.target))
      reasons.add("TARGET_STATE_CHANGED");
    if (!operatorActionTargetStateSupportsRequestV1(request, evidence.currentTargetState))
      reasons.add("TARGET_STATE_CHANGED");
    const gateIdentityMatches = evidence.owningGate === owningGate;
    if (!gateIdentityMatches) reasons.add("GATE_REJECTED");
    if (!evidence.gateDecision.allowed) {
      reasons.add("GATE_REJECTED");
      evidence.gateDecision.reasonCodes.forEach((reason) => reasons.add(reason));
    }
    const evidenceExpectedType = evidence.gateDecision.expectedCanonicalEventType;
    if (
      evidence.gateDecision.allowed &&
      (evidenceExpectedType === null ||
        !operatorActionExpectedEventTypesV1(request).includes(evidenceExpectedType))
    ) reasons.add("GATE_REJECTED");
    const reasonCodes = sortedUnique([...reasons]);
    const allowed = reasonCodes.length === 0;
    const content: Omit<OperatorActionPreviewV1, "previewHash" | "responseTimestamp"> = {
      contractType: "OperatorActionPreviewV1",
      contractVersion: "1.0",
      request,
      requestHash,
      currentProjectSequence: evidence.projectSequence,
      currentProjectHash: evidence.projectHash,
      currentSourceWatermark: evidence.sourceWatermark,
      currentTargetState: evidence.currentTargetState,
      owningGate,
      allowed,
      reasonCodes,
      expectedCanonicalEventType: allowed ? evidenceExpectedType : null,
      warnings: sortedUnique(evidence.warningCodes),
      evidenceRefs: sortedUnique(evidence.gateDecision.evidenceRefs),
    };
    const preview: OperatorActionPreviewV1 = {
      ...content,
      previewHash: operatorActionPreviewHashV1(content),
    };
    if (!previewValidator(preview))
      throwSchemaError(previewValidator, "INVALID_REQUEST", "OperatorActionPreviewV1");
    return deepFreeze(structuredClone(preview));
  }
}

function normalizedPreview(value: OperatorActionPreviewV1): OperatorActionPreviewV1 {
  const request = parseOperatorActionRequestV1(value.request);
  return {
    ...value,
    request,
    reasonCodes: sortedUnique(value.reasonCodes),
    warnings: sortedUnique(value.warnings),
    evidenceRefs: sortedUnique(value.evidenceRefs.map(cleanText)),
  };
}

export function parseOperatorActionPreviewV1(value: unknown): OperatorActionPreviewV1 {
  assertJsonObjectTree(value);
  assertOperatorActionPrivacyV1(value);
  if (!previewValidator(value)) throwSchemaError(previewValidator, "INVALID_REQUEST", "OperatorActionPreviewV1");
  const preview = normalizedPreview(structuredClone(value) as OperatorActionPreviewV1);
  if (!previewValidator(preview))
    throwSchemaError(previewValidator, "INVALID_REQUEST", "Normalized OperatorActionPreviewV1");
  if (preview.responseTimestamp !== undefined)
    assertCanonicalTimestamp(preview.responseTimestamp, "Preview response timestamp");
  if (preview.requestHash !== operatorActionHashV1(preview.request))
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", "Operator action request hash does not match normalized content.");
  const { previewHash, responseTimestamp: _responseTimestamp, ...content } = preview;
  if (previewHash !== operatorActionPreviewHashV1(content))
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", "Operator action preview hash does not match normalized content.");
  if (preview.allowed !== (preview.reasonCodes.length === 0))
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", "Preview decision and reason codes are inconsistent.");
  if (preview.allowed !== (preview.expectedCanonicalEventType !== null))
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", "Preview decision and expected event are inconsistent.");
  assertSequenceHash(preview.currentProjectSequence, preview.currentProjectHash, "Preview project");
  if (preview.owningGate !== OPERATOR_ACTION_OWNING_GATES_V1[preview.request.actionKind])
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", "Preview does not name the request's owning gate.");
  if (
    preview.allowed &&
    (
      preview.currentProjectSequence !== preview.request.expectedProjectSequence ||
      preview.currentProjectHash !== preview.request.expectedProjectHash ||
      preview.currentSourceWatermark !== preview.request.expectedSourceWatermark ||
      !operatorActionTargetStateSupportsRequestV1(preview.request, preview.currentTargetState) ||
      !operatorActionExpectedEventTypesV1(preview.request).includes(preview.expectedCanonicalEventType!)
    )
  ) throw new OperatorActionContractErrorV1(
    "INVALID_REQUEST",
    "An allowed preview must bind fresh request evidence and an action-owned event type.",
  );
  return deepFreeze(structuredClone(preview));
}

function receiptHashContent(receipt: Omit<OperatorActionReceiptV1, "receiptHash">): unknown {
  return receipt;
}

export function operatorActionReceiptHashV1(
  value: Omit<OperatorActionReceiptV1, "receiptHash">,
): string {
  return operatorActionHashV1(receiptHashContent(value));
}

function normalizedReceipt(value: OperatorActionReceiptV1): OperatorActionReceiptV1 {
  return {
    ...value,
    request: parseOperatorActionRequestV1(value.request),
    actor: cleanText(value.actor),
    reason: cleanText(value.reason),
    idempotencyKey: cleanText(value.idempotencyKey),
    reasonCodes: sortedUnique(value.reasonCodes),
    evidenceRefs: sortedUnique(value.evidenceRefs.map(cleanText)),
  };
}

export function parseOperatorActionReceiptV1(value: unknown): OperatorActionReceiptV1 {
  assertJsonObjectTree(value);
  assertOperatorActionPrivacyV1(value);
  if (!receiptValidator(value)) throwSchemaError(receiptValidator, "INVALID_REQUEST", "OperatorActionReceiptV1");
  const receipt = normalizedReceipt(structuredClone(value) as OperatorActionReceiptV1);
  if (!receiptValidator(receipt))
    throwSchemaError(receiptValidator, "INVALID_REQUEST", "Normalized OperatorActionReceiptV1");
  if (
    receipt.requestHash !== operatorActionHashV1(receipt.request) ||
    receipt.actor !== receipt.request.actor ||
    receipt.reason !== receipt.request.reason ||
    receipt.idempotencyKey !== receipt.request.idempotencyKey ||
    receipt.actionKind !== receipt.request.actionKind ||
    !sameTarget(receipt.target, receipt.request.target)
  ) throw new OperatorActionContractErrorV1(
    "TARGET_IDENTITY_MISMATCH",
    "Operator action receipt does not bind the exact normalized request identity.",
  );
  assertSequenceHash(receipt.observedProjectSequence, receipt.observedProjectHash, "Observed project");
  if (receipt.resultingProjectSequence !== null) {
    assertSequenceHash(receipt.resultingProjectSequence, receipt.resultingProjectHash, "Resulting project");
  } else if (receipt.resultingProjectHash !== null) {
    throw new OperatorActionContractErrorV1("EVIDENCE_INCOMPLETE", "A resulting project hash requires a resulting sequence.");
  }
  if (
    receipt.outcome === "executed" &&
    (
      receipt.canonicalEvent === null ||
      !operatorActionExpectedEventTypesV1(receipt.request).includes(receipt.canonicalEvent.eventType) ||
      receipt.observedProjectSequence !== receipt.request.expectedProjectSequence ||
      receipt.observedProjectHash !== receipt.request.expectedProjectHash ||
      receipt.observedSourceWatermark !== receipt.request.expectedSourceWatermark ||
      receipt.resultingProjectSequence === null ||
      receipt.resultingProjectSequence <= receipt.observedProjectSequence
    )
  ) throw new OperatorActionContractErrorV1(
    "TARGET_IDENTITY_MISMATCH",
    "Executed receipt evidence does not bind the action-owned event and advancing project sequence.",
  );
  const { receiptHash, ...content } = receipt;
  if (receiptHash !== operatorActionReceiptHashV1(content))
    throw new OperatorActionContractErrorV1("INVALID_REQUEST", "Operator action receipt hash does not match normalized content.");
  return deepFreeze(structuredClone(receipt));
}

export interface OperatorActionStoreV1 {
  previewOperatorActionV1(value: unknown): Promise<OperatorActionPreviewV1>;
  executeOperatorActionV1(value: unknown): Promise<OperatorActionReceiptV1>;
  getOperatorActionReceiptV1(receiptId: string): Promise<OperatorActionReceiptV1>;
}

export class OperatorActionServiceV1 {
  constructor(private readonly store: OperatorActionStoreV1) {}

  preview(value: unknown): Promise<OperatorActionPreviewV1> {
    return this.store.previewOperatorActionV1(value);
  }

  execute(value: unknown): Promise<OperatorActionReceiptV1> {
    return this.store.executeOperatorActionV1(value);
  }

  receipt(receiptId: string): Promise<OperatorActionReceiptV1> {
    return this.store.getOperatorActionReceiptV1(receiptId);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
