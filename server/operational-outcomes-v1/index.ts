import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import operationalOutcomesSchema from "./schemas/operational-outcomes-v1.schema.json";

export const OPERATIONAL_OUTCOME_EVENT_TYPES_V1 = [
  "operational.source-registered",
  "operational.source-revoked",
  "operational.observations-imported",
  "operational.defect-attribution-recorded",
  "operational.mutation-receipt-published",
] as const;

export type OperationalOutcomeEventTypeV1 =
  (typeof OPERATIONAL_OUTCOME_EVENT_TYPES_V1)[number];
export type OperationalOutcomeReasonCodeV1 =
  | "OUTCOME_SOURCE_UNKNOWN"
  | "OUTCOME_SOURCE_REVOKED"
  | "OUTCOME_SOURCE_KIND_DENIED"
  | "OUTCOME_SOURCE_IDENTITY_CONFLICT"
  | "OUTCOME_PROJECT_WATERMARK_CHANGED"
  | "OUTCOME_MANIFEST_INVALID"
  | "OUTCOME_MANIFEST_TOO_LARGE"
  | "OUTCOME_PRIVACY_VIOLATION"
  | "OUTCOME_IDENTITY_MISSING"
  | "OUTCOME_IDENTITY_CHANGED"
  | "OUTCOME_IDENTITY_AMBIGUOUS"
  | "OUTCOME_ATTRIBUTION_REQUIRED"
  | "OUTCOME_ATTRIBUTION_CONFLICT"
  | "OUTCOME_CURRENCY_MISMATCH"
  | "OUTCOME_COST_INCOMPLETE"
  | "OUTCOME_IDEMPOTENCY_CONFLICT";

export type OperationalWatermarkV1 = Readonly<{
  sequence: number;
  hash: string | null;
}>;

export type OperationalEvidenceKindV1 =
  | "deployment"
  | "post-delivery-defect"
  | "provider-cost";

export type OperationalEvidenceSourceSpecV1 = Readonly<{
  sourceId: string;
  family: "deployment" | "defect" | "provider-billing";
  sourceSystem: string;
  formatVersion: string;
  allowedKinds: readonly OperationalEvidenceKindV1[];
  privacyClass: "restricted-metadata-only";
  supersedesSourceId?: string;
}>;

export type OperationalEvidenceSourceV1 = OperationalEvidenceSourceSpecV1 &
  Readonly<{
    projectId: string;
    ownerActor: string;
    status: "active" | "revoked" | "superseded";
    registeredAt: string;
    registeredSequence: number;
    revokedAt?: string;
    sourceHash: string;
  }>;

type RequestBaseV1 = Readonly<{
  contractVersion: "1.0";
  requestId: string;
  idempotencyKey: string;
  projectId: string;
  changeId: string;
  actor: string;
  observedProject: OperationalWatermarkV1;
}>;

export type OperationalEvidenceSourceRegistrationRequestV1 = RequestBaseV1 &
  Readonly<{
    contractType: "OperationalEvidenceSourceRegistrationRequestV1";
    occurredAt: string;
    source: OperationalEvidenceSourceSpecV1;
  }>;

export type OperationalEvidenceSourceRevocationRequestV1 = RequestBaseV1 &
  Readonly<{
    contractType: "OperationalEvidenceSourceRevocationRequestV1";
    occurredAt: string;
    sourceId: string;
    reasonCode: "source-retired" | "source-compromised" | "source-superseded";
  }>;

type ObservationBaseV1 = Readonly<{
  contractVersion: "1.0";
  observationId: string;
  sourceRecordId: string;
  occurredAt: string;
  evidenceRefs: readonly string[];
  supersedesObservationId?: string;
}>;

export type DeploymentObservationV1 = ObservationBaseV1 &
  Readonly<{
    contractType: "DeploymentObservationV1";
    changeId: string;
    commitSha: string;
    treeSha: string;
    environmentClass: "production" | "staging" | "canary";
    outcome:
      | "succeeded"
      | "failed"
      | "rolled-back"
      | "hotfix"
      | "production-rework";
    predecessorObservationId?: string;
  }>;

export type PostDeliveryDefectObservationV1 = ObservationBaseV1 &
  Readonly<{
    contractType: "PostDeliveryDefectObservationV1";
    detectedAt: string;
    releasedCommitSha: string;
    releasedTreeSha: string;
    severity: "low" | "medium" | "high" | "critical";
    defectClass: string;
    lifecycleState: "open" | "resolved" | "closed";
    candidateChangeIds: readonly string[];
  }>;

export type ProviderCostObservationV1 = ObservationBaseV1 &
  Readonly<{
    contractType: "ProviderCostObservationV1";
    changeId: string;
    runId: string;
    taskId: string;
    attemptId: string;
    invocationId: string;
    provider: string;
    billingPeriod: string;
    currency: string;
    minorUnits: number;
    measurementState: "measured" | "credited";
  }>;

export type OperationalObservationV1 =
  | DeploymentObservationV1
  | PostDeliveryDefectObservationV1
  | ProviderCostObservationV1;

export type OperationalOutcomeImportRequestV1 = RequestBaseV1 &
  Readonly<{
    contractType: "OperationalOutcomeImportRequestV1";
    sourceId: string;
    observations: readonly OperationalObservationV1[];
    confirm: boolean;
  }>;

export type OperationalDefectAttributionRequestV1 = RequestBaseV1 &
  Readonly<{
    contractType: "OperationalDefectAttributionRequestV1";
    occurredAt: string;
    observationId: string;
    decision: "confirmed" | "rejected" | "unresolved";
    reasonCode: string;
    evidenceRefs: readonly string[];
    confirm: boolean;
    supersedesAttributionSequence?: number;
  }>;

export type OperationalOutcomeMutationRequestV1 =
  | OperationalEvidenceSourceRegistrationRequestV1
  | OperationalEvidenceSourceRevocationRequestV1
  | OperationalOutcomeImportRequestV1
  | OperationalDefectAttributionRequestV1;

export type OperationalDefectAttributionV1 = Readonly<{
  observationId: string;
  changeId: string;
  decision: "confirmed" | "rejected" | "unresolved";
  reasonCode: string;
  evidenceRefs: readonly string[];
  decidedBy: string;
  decidedAt: string;
  sequence: number;
}>;

export type OperationalOutcomePreviewV1 = Readonly<{
  contractType: "OperationalOutcomePreviewV1";
  contractVersion: "1.0";
  requestId: string;
  allowed: boolean;
  reasonCodes: readonly OperationalOutcomeReasonCodeV1[];
  sourceWatermark: OperationalWatermarkV1;
  contentHash: string;
  observationCount: number;
  wouldMutate: false;
}>;

export type OperationalOutcomeMutationReceiptV1 = Readonly<{
  contractType: "OperationalOutcomeMutationReceiptV1";
  contractVersion: "1.0";
  receiptId: string;
  operationKind:
    | "register-source"
    | "revoke-source"
    | "import-observations"
    | "record-attribution";
  requestId: string;
  idempotencyKey: string;
  projectId: string;
  changeId: string;
  actor: string;
  contentHash: string;
  sourceWatermark: OperationalWatermarkV1;
  resultingWatermark: OperationalWatermarkV1;
  eventId: string;
  eventHash: string;
  observationIds: readonly string[];
  publishedAt: string;
  receiptHash: string;
}>;

export type OperationalOutcomeEventV1 = Readonly<{
  id: string;
  sequence: number;
  type: OperationalOutcomeEventTypeV1;
  occurredAt: string;
  projectId: string;
  changeId: string;
  actor: string;
  causationId: string;
  correlationId: string;
  payload: Readonly<Record<string, unknown>>;
  previousHash: string | null;
  hash: string;
}>;

export type MutableOperationalOutcomeProjectionV1 = {
  projectId: string;
  sources: Map<string, OperationalEvidenceSourceV1>;
  observations: Map<string, OperationalObservationV1>;
  sourceRecordObservations: Map<string, string>;
  attributions: Map<string, OperationalDefectAttributionV1>;
  receipts: Map<string, OperationalOutcomeMutationReceiptV1>;
  receiptsByIdempotencyKey: Map<string, OperationalOutcomeMutationReceiptV1>;
  owningEvents: Map<string, OperationalOutcomeEventV1>;
  events: OperationalOutcomeEventV1[];
};

export type OperationalOutcomeProjectionV1 = Readonly<{
  contractType: "OperationalOutcomeProjectionV1";
  contractVersion: "1.0";
  projectId: string;
  watermark: OperationalWatermarkV1;
  sources: readonly OperationalEvidenceSourceV1[];
  observations: readonly OperationalObservationV1[];
  attributions: readonly OperationalDefectAttributionV1[];
  receipts: readonly OperationalOutcomeMutationReceiptV1[];
}>;

export type OperationalOutcomeReplayContextV1 = Readonly<{
  hasChange: (changeId: string) => boolean;
  hasInvocation: (observation: ProviderCostObservationV1) => boolean;
  previousEvent?: OperationalOutcomeEventV1;
}>;

export const OPERATIONAL_OUTCOME_LIMITS_V1 = Object.freeze({
  maxObservations: 100,
  maxManifestBytes: 65_536,
  maxEvidenceRefs: 50,
});

export class OperationalOutcomeErrorV1 extends Error {
  constructor(
    readonly reasonCode: OperationalOutcomeReasonCodeV1,
    message: string,
    readonly status: 400 | 404 | 409 | 413 = 400,
  ) {
    super(message);
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateContract = ajv.compile(operationalOutcomesSchema);

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function operationalOutcomeHashV1(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function fail(
  reasonCode: OperationalOutcomeReasonCodeV1,
  message: string,
  status: 400 | 404 | 409 | 413 = 400,
): never {
  throw new OperationalOutcomeErrorV1(reasonCode, message, status);
}

function parseContract<T>(value: unknown, contractType: string): T {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  if (bytes > OPERATIONAL_OUTCOME_LIMITS_V1.maxManifestBytes)
    fail("OUTCOME_MANIFEST_TOO_LARGE", "Operational outcome manifest exceeds the byte limit.", 413);
  assertNoProhibitedFields(value);
  if (!validateContract(value) || (value as { contractType?: unknown })?.contractType !== contractType)
    fail(
      "OUTCOME_MANIFEST_INVALID",
      `Operational outcome contract ${contractType} is invalid${
        validateContract.errors?.length ? `: ${ajv.errorsText(validateContract.errors)}` : "."
      }`,
    );
  assertCanonicalTimestamps(value);
  return structuredClone(value) as T;
}

const prohibitedKeys = new Set([
  "rawpayload",
  "promptbody",
  "hiddenreasoning",
  "credential",
  "credentials",
  "secret",
  "secrets",
  "stacktrace",
  "logs",
  "filecontent",
  "customercontent",
  "personaldata",
  "invoicedocument",
  "paymentdetails",
  "accountnumber",
  "taxidentifier",
]);

function assertNoProhibitedFields(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) assertNoProhibitedFields(child);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (prohibitedKeys.has(key.toLowerCase()))
      fail("OUTCOME_PRIVACY_VIOLATION", "Operational outcome manifest contains a prohibited field.");
    assertNoProhibitedFields(child);
  }
}

function assertCanonicalTimestamps(value: unknown): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) assertCanonicalTimestamps(child);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key.endsWith("At") || key === "occurredAt") && typeof child === "string") {
      if (!Number.isFinite(Date.parse(child)) || new Date(child).toISOString() !== child)
        fail("OUTCOME_MANIFEST_INVALID", "Operational outcome timestamp is not canonical ISO-8601.");
    }
    assertCanonicalTimestamps(child);
  }
}

export function parseOperationalEvidenceSourceRegistrationRequestV1(
  value: unknown,
): OperationalEvidenceSourceRegistrationRequestV1 {
  return parseContract(value, "OperationalEvidenceSourceRegistrationRequestV1");
}

export function parseOperationalEvidenceSourceRevocationRequestV1(
  value: unknown,
): OperationalEvidenceSourceRevocationRequestV1 {
  return parseContract(value, "OperationalEvidenceSourceRevocationRequestV1");
}

export function parseOperationalOutcomeImportRequestV1(
  value: unknown,
): OperationalOutcomeImportRequestV1 {
  return parseContract(value, "OperationalOutcomeImportRequestV1");
}

export function parseOperationalDefectAttributionRequestV1(
  value: unknown,
): OperationalDefectAttributionRequestV1 {
  return parseContract(value, "OperationalDefectAttributionRequestV1");
}

function parseMutationRequest(value: unknown): OperationalOutcomeMutationRequestV1 {
  const contractType = (value as { contractType?: unknown })?.contractType;
  if (contractType === "OperationalEvidenceSourceRegistrationRequestV1")
    return parseOperationalEvidenceSourceRegistrationRequestV1(value);
  if (contractType === "OperationalEvidenceSourceRevocationRequestV1")
    return parseOperationalEvidenceSourceRevocationRequestV1(value);
  if (contractType === "OperationalOutcomeImportRequestV1")
    return parseOperationalOutcomeImportRequestV1(value);
  if (contractType === "OperationalDefectAttributionRequestV1")
    return parseOperationalDefectAttributionRequestV1(value);
  fail("OUTCOME_MANIFEST_INVALID", "Operational outcome mutation request type is invalid.");
}

export function parseOperationalOutcomeMutationReceiptV1(
  value: unknown,
): OperationalOutcomeMutationReceiptV1 {
  const receipt = parseContract<OperationalOutcomeMutationReceiptV1>(
    value,
    "OperationalOutcomeMutationReceiptV1",
  );
  const { receiptHash, ...hashInput } = receipt;
  if (operationalOutcomeHashV1(hashInput) !== receiptHash)
    fail("OUTCOME_IDENTITY_CHANGED", "Operational outcome receipt hash is invalid.", 409);
  return receipt;
}

export function operationalOutcomeRequestContentHashV1(
  request: OperationalOutcomeMutationRequestV1,
): string {
  if ("confirm" in request) {
    const { confirm: _confirm, ...content } = request;
    return operationalOutcomeHashV1(content);
  }
  return operationalOutcomeHashV1(request);
}

export function createOperationalOutcomeProjectionV1(
  projectId: string,
): MutableOperationalOutcomeProjectionV1 {
  return {
    projectId,
    sources: new Map(),
    observations: new Map(),
    sourceRecordObservations: new Map(),
    attributions: new Map(),
    receipts: new Map(),
    receiptsByIdempotencyKey: new Map(),
    owningEvents: new Map(),
    events: [],
  };
}

function kindForObservation(observation: OperationalObservationV1): OperationalEvidenceKindV1 {
  if (observation.contractType === "DeploymentObservationV1") return "deployment";
  if (observation.contractType === "PostDeliveryDefectObservationV1")
    return "post-delivery-defect";
  return "provider-cost";
}

function expectedFamily(kind: OperationalEvidenceKindV1): OperationalEvidenceSourceV1["family"] {
  if (kind === "deployment") return "deployment";
  if (kind === "post-delivery-defect") return "defect";
  return "provider-billing";
}

function assertFreshWatermark(
  observed: OperationalWatermarkV1,
  current: OperationalWatermarkV1,
): void {
  if (observed.sequence !== current.sequence || observed.hash !== current.hash)
    fail(
      "OUTCOME_PROJECT_WATERMARK_CHANGED",
      "Operational outcome request is bound to a stale project watermark.",
      409,
    );
}

function validateSourceRegistration(
  request: OperationalEvidenceSourceRegistrationRequestV1,
  projection: MutableOperationalOutcomeProjectionV1,
  context: OperationalOutcomeReplayContextV1,
): void {
  if (!context.hasChange(request.changeId))
    fail("OUTCOME_IDENTITY_MISSING", "Operational source change identity is missing.", 404);
  if (projection.sources.has(request.source.sourceId))
    fail("OUTCOME_SOURCE_IDENTITY_CONFLICT", "Operational source identity already exists.", 409);
  const allowedFamilies = new Set(request.source.allowedKinds.map(expectedFamily));
  if (allowedFamilies.size !== 1 || !allowedFamilies.has(request.source.family))
    fail("OUTCOME_SOURCE_KIND_DENIED", "Operational source family and allowed kinds disagree.");
  if (request.source.supersedesSourceId) {
    const prior = projection.sources.get(request.source.supersedesSourceId);
    if (!prior || prior.status !== "active" || prior.family !== request.source.family)
      fail("OUTCOME_SOURCE_IDENTITY_CONFLICT", "Superseded operational source is unavailable or incompatible.", 409);
  }
}

function validateImport(
  request: OperationalOutcomeImportRequestV1,
  projection: MutableOperationalOutcomeProjectionV1,
  context: OperationalOutcomeReplayContextV1,
): void {
  if (!context.hasChange(request.changeId))
    fail("OUTCOME_IDENTITY_MISSING", "Operational import change identity is missing.", 404);
  const source = projection.sources.get(request.sourceId);
  if (!source) fail("OUTCOME_SOURCE_UNKNOWN", "Operational evidence source is unknown.", 404);
  if (source.status !== "active")
    fail("OUTCOME_SOURCE_REVOKED", "Operational evidence source is not active.", 409);
  const localIds = new Set<string>();
  const localRecords = new Set<string>();
  for (const observation of request.observations) {
    const kind = kindForObservation(observation);
    if (!source.allowedKinds.includes(kind) || source.family !== expectedFamily(kind))
      fail("OUTCOME_SOURCE_KIND_DENIED", "Operational source cannot publish this observation kind.");
    if (localIds.has(observation.observationId) || projection.observations.has(observation.observationId))
      fail("OUTCOME_SOURCE_IDENTITY_CONFLICT", "Operational observation identity already exists.", 409);
    localIds.add(observation.observationId);
    const recordKey = `${source.sourceId}\u0000${observation.sourceRecordId}`;
    if (localRecords.has(recordKey) || projection.sourceRecordObservations.has(recordKey))
      fail("OUTCOME_SOURCE_IDENTITY_CONFLICT", "Operational source record identity already exists.", 409);
    localRecords.add(recordKey);
    if (observation.supersedesObservationId) {
      const prior = projection.observations.get(observation.supersedesObservationId);
      if (!prior || kindForObservation(prior) !== kind)
        fail("OUTCOME_IDENTITY_MISSING", "Superseded operational observation is missing or incompatible.", 404);
    }
    if (observation.contractType === "DeploymentObservationV1") {
      if (observation.changeId !== request.changeId || !context.hasChange(observation.changeId))
        fail("OUTCOME_IDENTITY_MISSING", "Deployment observation change identity is missing.", 404);
      if (observation.predecessorObservationId && !projection.observations.has(observation.predecessorObservationId))
        fail("OUTCOME_IDENTITY_MISSING", "Deployment predecessor observation is missing.", 404);
    } else if (observation.contractType === "PostDeliveryDefectObservationV1") {
      if (observation.candidateChangeIds.some((changeId) => !context.hasChange(changeId)))
        fail("OUTCOME_IDENTITY_MISSING", "Defect candidate change identity is missing.", 404);
    } else {
      if (observation.changeId !== request.changeId || !context.hasChange(observation.changeId))
        fail("OUTCOME_IDENTITY_MISSING", "Provider cost change identity is missing.", 404);
      if (!context.hasInvocation(observation))
        fail("OUTCOME_IDENTITY_MISSING", "Provider cost invocation identity is missing.", 404);
    }
  }
}

function validateAttribution(
  request: OperationalDefectAttributionRequestV1,
  projection: MutableOperationalOutcomeProjectionV1,
  context: OperationalOutcomeReplayContextV1,
): void {
  if (!context.hasChange(request.changeId))
    fail("OUTCOME_IDENTITY_MISSING", "Attribution change identity is missing.", 404);
  const observation = projection.observations.get(request.observationId);
  if (!observation || observation.contractType !== "PostDeliveryDefectObservationV1")
    fail("OUTCOME_IDENTITY_MISSING", "Defect observation identity is missing.", 404);
  if (!observation.candidateChangeIds.includes(request.changeId))
    fail("OUTCOME_IDENTITY_AMBIGUOUS", "Defect attribution targets a non-candidate change.", 409);
  const existing = projection.attributions.get(
    `${request.observationId}\u0000${request.changeId}`,
  );
  if (existing) {
    if (request.supersedesAttributionSequence !== existing.sequence)
      fail("OUTCOME_ATTRIBUTION_CONFLICT", "Defect attribution requires its exact superseded sequence.", 409);
  } else if (request.supersedesAttributionSequence !== undefined) {
    fail("OUTCOME_ATTRIBUTION_CONFLICT", "Defect attribution supersession target is missing.", 409);
  }
}

function operationKindForRequest(
  request: OperationalOutcomeMutationRequestV1,
): OperationalOutcomeMutationReceiptV1["operationKind"] {
  if (request.contractType === "OperationalEvidenceSourceRegistrationRequestV1")
    return "register-source";
  if (request.contractType === "OperationalEvidenceSourceRevocationRequestV1")
    return "revoke-source";
  if (request.contractType === "OperationalOutcomeImportRequestV1")
    return "import-observations";
  return "record-attribution";
}

export function validateOperationalOutcomeRequestV1(
  request: OperationalOutcomeMutationRequestV1,
  projection: MutableOperationalOutcomeProjectionV1,
  context: OperationalOutcomeReplayContextV1,
): void {
  if (request.projectId !== projection.projectId)
    fail("OUTCOME_IDENTITY_CHANGED", "Operational outcome project identity changed.", 409);
  if (request.contractType === "OperationalEvidenceSourceRegistrationRequestV1")
    validateSourceRegistration(request, projection, context);
  else if (request.contractType === "OperationalEvidenceSourceRevocationRequestV1") {
    if (!context.hasChange(request.changeId))
      fail("OUTCOME_IDENTITY_MISSING", "Source revocation change identity is missing.", 404);
    const source = projection.sources.get(request.sourceId);
    if (!source) fail("OUTCOME_SOURCE_UNKNOWN", "Operational source is unknown.", 404);
    if (source.status !== "active")
      fail("OUTCOME_SOURCE_REVOKED", "Operational source is already inactive.", 409);
  } else if (request.contractType === "OperationalOutcomeImportRequestV1")
    validateImport(request, projection, context);
  else validateAttribution(request, projection, context);
}

export function previewOperationalOutcomeRequestV1(
  request: OperationalOutcomeImportRequestV1 | OperationalDefectAttributionRequestV1,
  projection: MutableOperationalOutcomeProjectionV1,
  watermark: OperationalWatermarkV1,
  context: OperationalOutcomeReplayContextV1,
): OperationalOutcomePreviewV1 {
  const reasonCodes: OperationalOutcomeReasonCodeV1[] = [];
  try {
    assertFreshWatermark(request.observedProject, watermark);
    validateOperationalOutcomeRequestV1(request, projection, context);
  } catch (error) {
    if (!(error instanceof OperationalOutcomeErrorV1)) throw error;
    reasonCodes.push(error.reasonCode);
  }
  return Object.freeze({
    contractType: "OperationalOutcomePreviewV1",
    contractVersion: "1.0",
    requestId: request.requestId,
    allowed: reasonCodes.length === 0,
    reasonCodes,
    sourceWatermark: { ...watermark },
    contentHash: operationalOutcomeRequestContentHashV1(request),
    observationCount:
      request.contractType === "OperationalOutcomeImportRequestV1"
        ? request.observations.length
        : 1,
    wouldMutate: false,
  });
}

export function applyOperationalOutcomeEventV1(
  event: OperationalOutcomeEventV1,
  projection: MutableOperationalOutcomeProjectionV1,
  context: OperationalOutcomeReplayContextV1,
): void {
  if (event.projectId !== projection.projectId)
    fail("OUTCOME_IDENTITY_CHANGED", "Operational outcome event project identity changed.", 409);
  const payloadKeys = Object.keys(event.payload).sort();
  const expectedPayloadKeys = event.type === "operational.mutation-receipt-published"
    ? ["receipt"]
    : ["request"];
  if (canonicalJson(payloadKeys) !== canonicalJson(expectedPayloadKeys))
    fail("OUTCOME_MANIFEST_INVALID", "Operational outcome event payload is not closed.");
  if (event.type === "operational.mutation-receipt-published") {
    const receipt = parseOperationalOutcomeMutationReceiptV1(event.payload.receipt);
    const owner = context.previousEvent;
    if (
      !owner ||
      owner.sequence !== event.sequence - 1 ||
      owner.id !== receipt.eventId ||
      owner.hash !== receipt.eventHash ||
      owner.sequence !== receipt.resultingWatermark.sequence ||
      owner.hash !== receipt.resultingWatermark.hash ||
      owner.projectId !== receipt.projectId ||
      owner.changeId !== receipt.changeId ||
      owner.actor !== receipt.actor ||
      owner.correlationId !== receipt.requestId ||
      event.actor !== receipt.actor ||
      event.correlationId !== receipt.requestId ||
      event.causationId !== owner.id
    )
      fail("OUTCOME_IDENTITY_CHANGED", "Operational outcome receipt lacks its adjacent owning mutation.", 409);
    const ownerRequest = parseMutationRequest(owner.payload.request);
    if (
      receipt.operationKind !== operationKindForRequest(ownerRequest) ||
      receipt.idempotencyKey !== ownerRequest.idempotencyKey ||
      receipt.contentHash !== operationalOutcomeRequestContentHashV1(ownerRequest) ||
      receipt.sourceWatermark.sequence !== ownerRequest.observedProject.sequence ||
      receipt.sourceWatermark.hash !== ownerRequest.observedProject.hash
    )
      fail("OUTCOME_IDENTITY_CHANGED", "Operational outcome receipt content identity changed.", 409);
    const existing = projection.receiptsByIdempotencyKey.get(receipt.idempotencyKey);
    if (existing && existing.receiptHash !== receipt.receiptHash)
      fail("OUTCOME_IDEMPOTENCY_CONFLICT", "Operational outcome idempotency identity conflicts.", 409);
    projection.receipts.set(receipt.receiptId, receipt);
    projection.receiptsByIdempotencyKey.set(receipt.idempotencyKey, receipt);
    projection.events.push(event);
    return;
  }

  let request: OperationalOutcomeMutationRequestV1;
  if (event.type === "operational.source-registered")
    request = parseOperationalEvidenceSourceRegistrationRequestV1(event.payload.request);
  else if (event.type === "operational.source-revoked")
    request = parseOperationalEvidenceSourceRevocationRequestV1(event.payload.request);
  else if (event.type === "operational.observations-imported")
    request = parseOperationalOutcomeImportRequestV1(event.payload.request);
  else request = parseOperationalDefectAttributionRequestV1(event.payload.request);
  if (
    request.projectId !== event.projectId ||
    request.changeId !== event.changeId ||
    request.actor !== event.actor ||
    request.requestId !== event.correlationId
  )
    fail("OUTCOME_IDENTITY_CHANGED", "Operational outcome event and request identities disagree.", 409);
  if (
    request.observedProject.sequence !== event.sequence - 1 ||
    request.observedProject.hash !== event.previousHash
  )
    fail("OUTCOME_PROJECT_WATERMARK_CHANGED", "Operational outcome event has stale pre-publication evidence.", 409);
  validateOperationalOutcomeRequestV1(request, projection, context);

  if (request.contractType === "OperationalEvidenceSourceRegistrationRequestV1") {
    if (request.source.supersedesSourceId) {
      const prior = projection.sources.get(request.source.supersedesSourceId)!;
      projection.sources.set(prior.sourceId, { ...prior, status: "superseded" });
    }
    const sourceWithoutHash = {
      ...request.source,
      projectId: request.projectId,
      ownerActor: request.actor,
      status: "active" as const,
      registeredAt: request.occurredAt,
      registeredSequence: event.sequence,
    };
    projection.sources.set(request.source.sourceId, {
      ...sourceWithoutHash,
      sourceHash: operationalOutcomeHashV1(sourceWithoutHash),
    });
  } else if (request.contractType === "OperationalEvidenceSourceRevocationRequestV1") {
    const source = projection.sources.get(request.sourceId)!;
    projection.sources.set(request.sourceId, {
      ...source,
      status: request.reasonCode === "source-superseded" ? "superseded" : "revoked",
      revokedAt: request.occurredAt,
    });
  } else if (request.contractType === "OperationalOutcomeImportRequestV1") {
    for (const observation of request.observations) {
      projection.observations.set(observation.observationId, observation);
      projection.sourceRecordObservations.set(
        `${request.sourceId}\u0000${observation.sourceRecordId}`,
        observation.observationId,
      );
    }
  } else {
    const attribution: OperationalDefectAttributionV1 = {
      observationId: request.observationId,
      changeId: request.changeId,
      decision: request.decision,
      reasonCode: request.reasonCode,
      evidenceRefs: request.evidenceRefs,
      decidedBy: request.actor,
      decidedAt: request.occurredAt,
      sequence: event.sequence,
    };
    projection.attributions.set(`${request.observationId}\u0000${request.changeId}`, attribution);
  }
  projection.owningEvents.set(event.id, event);
  projection.events.push(event);
}

export function publicOperationalOutcomeProjectionV1(
  projection: MutableOperationalOutcomeProjectionV1,
  watermark: OperationalWatermarkV1,
  changeId?: string,
): OperationalOutcomeProjectionV1 {
  const observations = [...projection.observations.values()].filter(
    (observation) =>
      !changeId ||
      (observation.contractType === "PostDeliveryDefectObservationV1"
        ? observation.candidateChangeIds.includes(changeId)
        : observation.changeId === changeId),
  );
  return Object.freeze(parseContract<OperationalOutcomeProjectionV1>({
    contractType: "OperationalOutcomeProjectionV1",
    contractVersion: "1.0",
    projectId: projection.projectId,
    watermark: { ...watermark },
    sources: [...projection.sources.values()].sort((a, b) => a.sourceId.localeCompare(b.sourceId)),
    observations: observations.sort((a, b) =>
      a.observationId.localeCompare(b.observationId),
    ),
    attributions: [...projection.attributions.values()].filter(
      (attribution) => !changeId || attribution.changeId === changeId,
    ).sort((a, b) =>
      a.observationId.localeCompare(b.observationId) || a.changeId.localeCompare(b.changeId),
    ),
    receipts: [...projection.receipts.values()].filter(
      (receipt) => !changeId || receipt.changeId === changeId,
    ).sort((a, b) =>
      a.resultingWatermark.sequence - b.resultingWatermark.sequence ||
      a.receiptId.localeCompare(b.receiptId),
    ),
  }, "OperationalOutcomeProjectionV1"));
}

export function operationalOutcomeOperationKindV1(
  request: OperationalOutcomeMutationRequestV1,
): OperationalOutcomeMutationReceiptV1["operationKind"] {
  return operationKindForRequest(request);
}

export function assertOperationalOutcomeFreshWatermarkV1(
  observed: OperationalWatermarkV1,
  current: OperationalWatermarkV1,
): void {
  assertFreshWatermark(observed, current);
}
