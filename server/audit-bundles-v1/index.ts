import { createHash } from "node:crypto";
import Ajv2020, { type ValidateFunction } from "ajv8/dist/2020.js";
import {
  ChangeControlError,
  type AuditEvidenceSourceV1,
  type ChangeControlEvent,
  type ChangeControlStore,
} from "../change-control-v1/index.ts";
import {
  OperatorActionContractErrorV1,
  operatorActionSourceWatermarkV1,
  parseOperatorActionReceiptV1,
} from "../operator-actions-v1/index.ts";
import schema from "./schemas/audit-bundles-v1.schema.json";

export const AUDIT_BUNDLE_REASON_CODES_V1 = [
  "INVALID_SELECTOR",
  "SCHEMA_INVALID",
  "SOURCE_UNAVAILABLE",
  "SOURCE_WATERMARK_CHANGED",
  "SEQUENCE_RANGE_INVALID",
  "CHANGE_NOT_FOUND",
  "EVIDENCE_INCOMPLETE",
  "EVIDENCE_CONFLICT",
  "UNSUPPORTED_EVIDENCE",
  "PRIVACY_VIOLATION",
  "BUNDLE_TOO_LARGE",
  "BUNDLE_LIMIT_EXCEEDED",
] as const;

export type AuditBundleReasonCodeV1 =
  (typeof AUDIT_BUNDLE_REASON_CODES_V1)[number];

export type ProjectSequenceRangeSelectorV1 = Readonly<{
  selectorType: "project-sequence-range";
  projectId: string;
  fromSequence: number;
  toSequence: number;
}>;

export type ExactChangeSelectorV1 = Readonly<{
  selectorType: "exact-change";
  projectId: string;
  changeId: string;
}>;

export type AuditBundleSelectorV1 =
  | ProjectSequenceRangeSelectorV1
  | ExactChangeSelectorV1;

export type AuditBundleRequestV1 = Readonly<{
  selector: AuditBundleSelectorV1;
  sourceWatermark?: string;
}>;

type EventSummaryV1 = Readonly<{
  eventId: string;
  sequence: number;
  eventType: string;
  occurredAt: string;
  projectId: string;
  changeId: string;
  waveId?: string;
  taskId?: string;
  eventHash: string;
  previousEventHash: string | null;
  evidenceRefs: readonly string[];
}>;

type EntityReferenceV1 = Readonly<{
  entityType: string;
  entityId: string;
  changeId: string | null;
  waveId: string | null;
  taskId: string | null;
  eventIds: readonly string[];
}>;

type ReceiptReferenceV1 = Readonly<{
  receiptType: string;
  receiptId: string;
  changeId: string;
  eventId: string;
  eventSequence: number;
  eventHash: string;
  receiptHash: string;
  canonicalEventId: string | null;
  canonicalEventHash: string | null;
}>;

type ProjectionSnapshotV1 = Readonly<{
  view: "overview" | "execution-bucket" | "incidents" | "prompt-registry" | "eval-lineage";
  entityId: string;
  changeId: string | null;
  sequence: number | null;
  status: string | null;
  summary: Readonly<{
    totalEntities: number;
    relatedEntities: number;
    flaggedEntities: number;
  }>;
  evidenceRefs: readonly string[];
  summaryHash: string;
}>;

type CompletenessCheckV1 = Readonly<{
  code:
    | "CANONICAL_REPLAY"
    | "SELECTOR_COVERAGE"
    | "RECEIPT_LINEAGE"
    | "PROJECTION_COVERAGE"
    | "PRIVACY_SCAN"
    | "UNSUPPORTED_EVIDENCE";
  status: "passed" | "unsupported";
  evidenceRefs: readonly string[];
}>;

type AuditWarningV1 = Readonly<{
  code: "UNSUPPORTED_EVIDENCE" | "EVIDENCE_INCOMPLETE" | "EVIDENCE_CONFLICT";
  evidenceRef: string;
}>;

export type AuditBundleV1 = Readonly<{
  contractType: "AuditBundleV1";
  contractVersion: "1.0";
  policyVersion: "audit-bundle-policy-v1";
  selector: AuditBundleSelectorV1;
  source: Readonly<{
    sourceRef: string;
    sourceWatermark: string;
    projectSequence: number;
    projectHash: string | null;
  }>;
  sequenceBoundaries: Readonly<{
    requestedFromSequence: number | null;
    requestedToSequence: number | null;
    observedFromSequence: number | null;
    observedToSequence: number | null;
    sourceFromSequence: number | null;
    sourceToSequence: number;
  }>;
  canonicalEvents: readonly EventSummaryV1[];
  entityReferences: readonly EntityReferenceV1[];
  receiptReferences: readonly ReceiptReferenceV1[];
  projectionSnapshots: readonly ProjectionSnapshotV1[];
  completeness: Readonly<{
    status: "complete" | "complete-with-warnings";
    checks: readonly CompletenessCheckV1[];
  }>;
  warnings: readonly AuditWarningV1[];
  privacy: Readonly<{
    policyVersion: "audit-bundle-privacy-v1";
    scanStatus: "passed";
    excludedFieldClasses: readonly string[];
    includedFieldClasses: readonly string[];
  }>;
  bundleHash: string;
}>;

export type AuditBundleLimitsV1 = Readonly<{
  maxEvents: number;
  maxReceipts: number;
  maxReferences: number;
  maxProjectionSnapshots: number;
  maxWarnings: number;
  maxBytes: number;
}>;

const SCHEMA_LIMITS_V1: AuditBundleLimitsV1 = {
  maxEvents: 500,
  maxReceipts: 200,
  maxReferences: 1000,
  maxProjectionSnapshots: 500,
  maxWarnings: 100,
  maxBytes: 1_048_576,
};

export const DEFAULT_AUDIT_BUNDLE_LIMITS_V1 = Object.freeze({
  maxEvents: 250,
  maxReceipts: 100,
  maxReferences: 500,
  maxProjectionSnapshots: 250,
  maxWarnings: 50,
  maxBytes: 524_288,
}) satisfies AuditBundleLimitsV1;

export class AuditBundleErrorV1 extends Error {
  constructor(
    readonly code: AuditBundleReasonCodeV1,
    message: string,
    readonly status: 400 | 404 | 409 | 413 | 503,
  ) {
    super(message);
    this.name = "AuditBundleErrorV1";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date-time", true);
ajv.addSchema(schema);
const validator = (name: string): ValidateFunction => {
  const result = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!result) throw new Error(`Missing Audit Bundles v1 schema definition ${name}.`);
  return result;
};
const selectorValidator = validator("AuditBundleSelectorV1");
const requestValidator = validator("AuditBundleRequestV1");
const bundleValidator = validator("AuditBundleV1");

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const privacyFieldNames = new Set([
  "credential", "credentials", "environment", "environmentvalue",
  "environmentvalues", "env", "filecontent", "filecontents", "prompt",
  "promptbody", "promptbodies", "providerhiddenreasoning", "hiddenreasoning",
  "rawproviderpayload", "providerpayload", "log", "logs", "unboundedlogs",
  "password", "secret", "secrets", "apikey", "accesstoken", "refreshtoken",
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

function assertJsonTree(value: unknown, path = "$", seen = new Set<object>()): void {
  if (
    value === null || typeof value === "string" || typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) return;
  if (typeof value !== "object")
    throw new AuditBundleErrorV1("SCHEMA_INVALID", `${path} is not JSON-compatible.`, 400);
  if (seen.has(value as object))
    throw new AuditBundleErrorV1("SCHEMA_INVALID", `${path} contains a cycle.`, 400);
  seen.add(value as object);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonTree(item, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      throw new AuditBundleErrorV1("SCHEMA_INVALID", `${path} must be a plain object.`, 400);
    Object.entries(value).forEach(([key, item]) =>
      assertJsonTree(item, `${path}.${key}`, seen));
  }
  seen.delete(value as object);
}

export function assertAuditBundlePrivacyV1(value: unknown): void {
  const visit = (item: unknown, path: string): void => {
    if (
      typeof item === "string" &&
      sensitiveTextPatterns.some((pattern) => pattern.test(item))
    ) throw new AuditBundleErrorV1(
      "PRIVACY_VIOLATION",
      "Credential-like text is prohibited by Audit Bundles Contract v1.",
      400,
    );
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(item)) return;
    for (const [key, nested] of Object.entries(item)) {
      if (privacyFieldNames.has(privacyKey(key)))
        throw new AuditBundleErrorV1(
          "PRIVACY_VIOLATION",
          "A prohibited privacy field class was found.",
          400,
        );
      visit(nested, `${path}.${key}`);
    }
  };
  assertJsonTree(value);
  visit(value, "$ ".trim());
}

export function auditBundleCanonicalJsonV1(value: unknown): string {
  assertJsonTree(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(auditBundleCanonicalJsonV1).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${auditBundleCanonicalJsonV1(record[key])}`,
  ).join(",")}}`;
}

export function auditBundleHashV1(value: unknown): string {
  return createHash("sha256").update(auditBundleCanonicalJsonV1(value)).digest("hex");
}

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const sortedUnique = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareText);

function schemaFailure(
  checked: ValidateFunction,
  code: AuditBundleReasonCodeV1,
  label: string,
): never {
  void checked;
  throw new AuditBundleErrorV1(
    code,
    `${label} does not satisfy Audit Bundles Contract v1.`,
    400,
  );
}

export function parseAuditBundleSelectorV1(value: unknown): AuditBundleSelectorV1 {
  assertAuditBundlePrivacyV1(value);
  const selectorType = isRecord(value) ? value.selectorType : undefined;
  const selectorIsValid = selectorValidator(value);
  if (!selectorIsValid) {
    const range = selectorType === "project-sequence-range";
    const rangeKeys = new Set(["selectorType", "projectId", "fromSequence", "toSequence"]);
    const mixed = range && isRecord(value) &&
      Object.keys(value).some((key) => !rangeKeys.has(key));
    schemaFailure(
      selectorValidator,
      range && !mixed ? "SEQUENCE_RANGE_INVALID" : "INVALID_SELECTOR",
      "Audit bundle selector",
    );
  }
  const selected = value as AuditBundleSelectorV1;
  if (
    selected.selectorType === "project-sequence-range" &&
    (!Number.isSafeInteger(selected.fromSequence) ||
      !Number.isSafeInteger(selected.toSequence) ||
      selected.fromSequence > selected.toSequence)
  ) throw new AuditBundleErrorV1(
    "SEQUENCE_RANGE_INVALID",
    "The inclusive project sequence range is invalid or inverted.",
    400,
  );
  return Object.freeze(selected.selectorType === "project-sequence-range"
    ? {
        selectorType: selected.selectorType,
        projectId: selected.projectId,
        fromSequence: selected.fromSequence,
        toSequence: selected.toSequence,
      }
    : {
        selectorType: selected.selectorType,
        projectId: selected.projectId,
        changeId: selected.changeId,
      });
}

export function parseAuditBundleRequestV1(value: unknown): AuditBundleRequestV1 {
  assertAuditBundlePrivacyV1(value);
  const raw = value;
  const requestIsValid = requestValidator(value);
  if (!requestIsValid) {
    if (isRecord(raw) && Object.hasOwn(raw, "selector"))
      parseAuditBundleSelectorV1(raw.selector);
    schemaFailure(requestValidator, "SCHEMA_INVALID", "Audit bundle request");
  }
  const parsed = value as AuditBundleRequestV1;
  return Object.freeze({
    selector: parseAuditBundleSelectorV1(parsed.selector),
    ...(parsed.sourceWatermark ? { sourceWatermark: parsed.sourceWatermark } : {}),
  });
}

function normalizedBundle(value: AuditBundleV1): AuditBundleV1 {
  const canonicalEvents = [...value.canonicalEvents]
    .map((event) => ({
      eventId: event.eventId,
      sequence: event.sequence,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      projectId: event.projectId,
      changeId: event.changeId,
      ...(event.waveId ? { waveId: event.waveId } : {}),
      ...(event.taskId ? { taskId: event.taskId } : {}),
      eventHash: event.eventHash,
      previousEventHash: event.previousEventHash,
      evidenceRefs: sortedUnique(event.evidenceRefs),
    }))
    .sort((left, right) => left.sequence - right.sequence || compareText(left.eventId, right.eventId));
  const entityReferences = [...value.entityReferences]
    .map((item) => ({ ...item, eventIds: sortedUnique(item.eventIds) }))
    .sort((left, right) =>
      compareText(left.entityType, right.entityType) || compareText(left.entityId, right.entityId));
  const receiptReferences = [...value.receiptReferences]
    .sort((left, right) => left.eventSequence - right.eventSequence ||
      compareText(left.receiptType, right.receiptType) || compareText(left.receiptId, right.receiptId));
  const projectionSnapshots = [...value.projectionSnapshots]
    .map((item) => ({ ...item, evidenceRefs: sortedUnique(item.evidenceRefs) }))
    .sort((left, right) => compareText(left.view, right.view) || compareText(left.entityId, right.entityId));
  const checks = [...value.completeness.checks]
    .map((item) => ({ ...item, evidenceRefs: sortedUnique(item.evidenceRefs) }))
    .sort((left, right) => compareText(left.code, right.code));
  const warnings = [...value.warnings]
    .sort((left, right) => compareText(left.code, right.code) || compareText(left.evidenceRef, right.evidenceRef));
  return {
    contractType: "AuditBundleV1",
    contractVersion: "1.0",
    policyVersion: "audit-bundle-policy-v1",
    selector: parseAuditBundleSelectorV1(value.selector),
    source: {
      sourceRef: value.source.sourceRef,
      sourceWatermark: value.source.sourceWatermark,
      projectSequence: value.source.projectSequence,
      projectHash: value.source.projectHash,
    },
    sequenceBoundaries: { ...value.sequenceBoundaries },
    canonicalEvents,
    entityReferences,
    receiptReferences,
    projectionSnapshots,
    completeness: { status: value.completeness.status, checks },
    warnings,
    privacy: {
      policyVersion: "audit-bundle-privacy-v1",
      scanStatus: "passed",
      excludedFieldClasses: sortedUnique(value.privacy.excludedFieldClasses),
      includedFieldClasses: sortedUnique(value.privacy.includedFieldClasses),
    },
    bundleHash: value.bundleHash,
  };
}

export function parseAuditBundleV1(value: unknown): AuditBundleV1 {
  assertAuditBundlePrivacyV1(value);
  const bundleIsValid = bundleValidator(value);
  if (!bundleIsValid) schemaFailure(bundleValidator, "SCHEMA_INVALID", "AuditBundleV1");
  const normalized = normalizedBundle(structuredClone(value) as AuditBundleV1);
  if (!bundleValidator(normalized))
    schemaFailure(bundleValidator, "SCHEMA_INVALID", "Normalized AuditBundleV1");
  const { bundleHash, ...content } = normalized;
  if (bundleHash !== auditBundleHashV1(content))
    throw new AuditBundleErrorV1(
      "EVIDENCE_CONFLICT",
      "The bundle hash does not match normalized content.",
      409,
    );
  if (normalized.completeness.status !==
      (normalized.warnings.length === 0 ? "complete" : "complete-with-warnings"))
    throw new AuditBundleErrorV1(
      "EVIDENCE_CONFLICT",
      "Bundle completeness does not match its bounded warnings.",
      409,
    );
  assertBundleSemanticsV1(normalized);
  return deepFreeze(normalized);
}

function assertBundleSemanticsV1(bundle: AuditBundleV1): void {
  const conflict = (message: string): never => {
    throw new AuditBundleErrorV1("EVIDENCE_CONFLICT", message, 409);
  };
  const incomplete = (message: string): never => {
    throw new AuditBundleErrorV1("EVIDENCE_INCOMPLETE", message, 409);
  };
  const selector = bundle.selector;
  const expectedWatermark = operatorActionSourceWatermarkV1(
    selector.projectId,
    bundle.source.projectSequence,
    bundle.source.projectHash,
  );
  if (
    bundle.source.sourceRef !== `change-control:${selector.projectId}` ||
    bundle.source.sourceWatermark !== expectedWatermark ||
    (bundle.source.projectSequence === 0) !== (bundle.source.projectHash === null)
  ) conflict("The bundle source identity or watermark is inconsistent.");
  if (
    bundle.sequenceBoundaries.sourceToSequence !== bundle.source.projectSequence ||
    bundle.sequenceBoundaries.sourceFromSequence !==
      (bundle.source.projectSequence === 0 ? null : 1)
  ) conflict("The bundle source sequence boundaries are inconsistent.");
  if (bundle.canonicalEvents.length === 0)
    incomplete("The selected scope has no canonical event summaries.");

  const eventsById = new Map<string, EventSummaryV1>();
  let priorSequence = 0;
  let priorEvent: EventSummaryV1 | undefined;
  for (const event of bundle.canonicalEvents) {
    if (
      event.projectId !== selector.projectId ||
      event.sequence <= priorSequence ||
      event.sequence > bundle.source.projectSequence ||
      eventsById.has(event.eventId)
    ) conflict("Canonical event summary identity or ordering is inconsistent.");
    if ((event.sequence === 1) !== (event.previousEventHash === null))
      conflict("Canonical event previous-hash evidence is inconsistent.");
    if (
      priorEvent && event.sequence === priorEvent.sequence + 1 &&
      event.previousEventHash !== priorEvent.eventHash
    ) conflict("Adjacent canonical event summaries conflict with the project hash chain.");
    if (auditBundleCanonicalJsonV1(event.evidenceRefs) !== auditBundleCanonicalJsonV1(
      sortedUnique([
        `event:${event.eventId}`,
        `change:${event.changeId}`,
        ...(event.waveId ? [`wave:${event.waveId}`] : []),
        ...(event.taskId ? [`task:${event.taskId}`] : []),
      ]),
    )) conflict("Canonical event evidence references are inconsistent.");
    eventsById.set(event.eventId, event);
    priorSequence = event.sequence;
    priorEvent = event;
  }
  const firstEvent = bundle.canonicalEvents[0]!;
  const lastEvent = bundle.canonicalEvents.at(-1)!;
  if (
    bundle.sequenceBoundaries.observedFromSequence !== firstEvent.sequence ||
    bundle.sequenceBoundaries.observedToSequence !== lastEvent.sequence
  ) conflict("Observed sequence boundaries do not match the selected evidence.");
  if (
    lastEvent.sequence === bundle.source.projectSequence &&
    lastEvent.eventHash !== bundle.source.projectHash
  ) conflict("The selected canonical head does not match the source watermark hash.");

  if (selector.selectorType === "project-sequence-range") {
    const expectedCount = selector.toSequence - selector.fromSequence + 1;
    if (
      bundle.sequenceBoundaries.requestedFromSequence !== selector.fromSequence ||
      bundle.sequenceBoundaries.requestedToSequence !== selector.toSequence ||
      bundle.canonicalEvents.length !== expectedCount
    ) incomplete("The inclusive sequence selector is not completely covered.");
    for (let index = 0; index < bundle.canonicalEvents.length; index += 1) {
      const event = bundle.canonicalEvents[index]!;
      if (event.sequence !== selector.fromSequence + index)
        incomplete("The inclusive sequence selector has a gap.");
      if (index > 0 && event.previousEventHash !== bundle.canonicalEvents[index - 1]!.eventHash)
        conflict("The selected canonical event hash chain conflicts.");
    }
  } else {
    if (
      bundle.sequenceBoundaries.requestedFromSequence !== null ||
      bundle.sequenceBoundaries.requestedToSequence !== null ||
      bundle.canonicalEvents.some((event) => event.changeId !== selector.changeId)
    ) conflict("The exact-change selector escaped its declared scope.");
  }

  const expectedEntities = new Map<string, {
    entityType: string; entityId: string; changeId: string | null;
    waveId: string | null; taskId: string | null; eventIds: Set<string>;
  }>();
  const addEntity = (
    entityType: string,
    entityId: string,
    event: EventSummaryV1,
    waveId: string | null,
    taskId: string | null,
  ) => {
    const key = `${entityType}\0${entityId}`;
    const existing = expectedEntities.get(key) ?? {
      entityType, entityId, changeId: event.changeId, waveId, taskId,
      eventIds: new Set<string>(),
    };
    existing.eventIds.add(event.eventId);
    expectedEntities.set(key, existing);
  };
  for (const event of bundle.canonicalEvents) {
    addEntity("change", event.changeId, event, null, null);
    if (event.waveId) addEntity("wave", event.waveId, event, event.waveId, null);
    if (event.taskId) addEntity("task", event.taskId, event, event.waveId ?? null, event.taskId);
  }
  const expectedEntityReferences = [...expectedEntities.values()].map((item) => ({
    entityType: item.entityType,
    entityId: item.entityId,
    changeId: item.changeId,
    waveId: item.waveId,
    taskId: item.taskId,
    eventIds: sortedUnique([...item.eventIds]),
  })).sort((left, right) =>
    compareText(left.entityType, right.entityType) || compareText(left.entityId, right.entityId));
  if (auditBundleCanonicalJsonV1(bundle.entityReferences) !==
      auditBundleCanonicalJsonV1(expectedEntityReferences))
    incomplete("Entity references do not completely cover selected canonical events.");

  const receiptIdentities = new Set<string>();
  for (const receipt of bundle.receiptReferences) {
    const event = eventsById.get(receipt.eventId) ??
      incomplete("A receipt publication event is outside the selected evidence.");
    if (
      receipt.changeId !== event.changeId ||
      receipt.eventSequence !== event.sequence ||
      receipt.eventHash !== event.eventHash ||
      (receipt.canonicalEventId === null) !== (receipt.canonicalEventHash === null)
    ) conflict("A receipt reference conflicts with its canonical event summary.");
    const identity = `${receipt.receiptType}\0${receipt.receiptId}\0${receipt.eventId}`;
    if (receiptIdentities.has(identity)) conflict("A receipt reference is duplicated.");
    receiptIdentities.add(identity);
    if (receipt.canonicalEventId !== null) {
      const canonical = eventsById.get(receipt.canonicalEventId);
      if (canonical && canonical.eventHash !== receipt.canonicalEventHash)
        conflict("A receipt owning-event hash conflicts with selected evidence.");
    }
  }

  const selectedChanges = new Set(bundle.canonicalEvents.map((event) => event.changeId));
  for (const snapshot of bundle.projectionSnapshots) {
    const { summaryHash, ...content } = snapshot;
    if (summaryHash !== auditBundleHashV1(content))
      conflict("A projection summary hash conflicts with normalized content.");
    if (snapshot.changeId !== null && !selectedChanges.has(snapshot.changeId))
      conflict("A projection snapshot escaped the selected change scope.");
    if (snapshot.view === "overview" && snapshot.entityId !== selector.projectId)
      conflict("The overview projection escaped the selected project scope.");
  }

  if (bundle.warnings.some((warning) => warning.code !== "UNSUPPORTED_EVIDENCE"))
    conflict("Incomplete or conflicting evidence cannot be downgraded to a warning.");
  const checks = new Map<string, CompletenessCheckV1>();
  for (const check of bundle.completeness.checks) {
    if (checks.has(check.code)) conflict("A completeness check is duplicated.");
    checks.set(check.code, check);
  }
  const expectedChecks: readonly [CompletenessCheckV1["code"], readonly string[]][] = [
    ["CANONICAL_REPLAY", [bundle.source.sourceRef]],
    ["PRIVACY_SCAN", ["privacy-policy:audit-bundle-privacy-v1"]],
    ["PROJECTION_COVERAGE", bundle.projectionSnapshots.map((item) => `projection:${item.view}:${item.entityId}`)],
    ["RECEIPT_LINEAGE", bundle.receiptReferences.map((item) => `receipt:${item.receiptId}`)],
    ["SELECTOR_COVERAGE", bundle.canonicalEvents.map((item) => `event:${item.eventId}`)],
  ];
  for (const [code, evidenceRefs] of expectedChecks) {
    const check = checks.get(code);
    if (
      !check || check.status !== "passed" ||
      auditBundleCanonicalJsonV1(check.evidenceRefs) !==
        auditBundleCanonicalJsonV1(sortedUnique(evidenceRefs))
    ) incomplete("A required completeness check is missing or inconsistent.");
  }
  const unsupported = checks.get("UNSUPPORTED_EVIDENCE");
  const warningRefs = sortedUnique(bundle.warnings.map((warning) => warning.evidenceRef));
  if (warningRefs.length === 0) {
    if (unsupported) conflict("Unsupported evidence was reported without a warning.");
  } else if (
    !unsupported || unsupported.status !== "unsupported" ||
    auditBundleCanonicalJsonV1(unsupported.evidenceRefs) !==
      auditBundleCanonicalJsonV1(warningRefs)
  ) conflict("Unsupported evidence warnings and completeness findings conflict.");
}

export interface AuditEvidenceAdapterV1 {
  read(projectId: string): Promise<AuditEvidenceSourceV1>;
}

export class ChangeControlAuditEvidenceAdapterV1 implements AuditEvidenceAdapterV1 {
  constructor(
    private readonly store: Pick<ChangeControlStore, "readAuditEvidenceV1">,
  ) {}

  async read(projectId: string): Promise<AuditEvidenceSourceV1> {
    try {
      return await this.store.readAuditEvidenceV1(projectId);
    } catch (error) {
      if (error instanceof ChangeControlError && error.code === "CONFLICT")
        throw new AuditBundleErrorV1(
          "SOURCE_WATERMARK_CHANGED",
          "The canonical source changed during the bounded read.",
          409,
        );
      if (error instanceof AuditBundleErrorV1) throw error;
      throw new AuditBundleErrorV1(
        "SOURCE_UNAVAILABLE",
        "The canonical project source is unavailable.",
        503,
      );
    }
  }
}

function resolvedLimits(value: Partial<AuditBundleLimitsV1>): AuditBundleLimitsV1 {
  const allowedKeys = new Set(Object.keys(DEFAULT_AUDIT_BUNDLE_LIMITS_V1));
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedKeys.has(key)))
    throw new AuditBundleErrorV1(
      "BUNDLE_LIMIT_EXCEEDED",
      "Audit bundle limits contain an unsupported policy field.",
      413,
    );
  const result = { ...DEFAULT_AUDIT_BUNDLE_LIMITS_V1, ...value };
  for (const key of Object.keys(result) as (keyof AuditBundleLimitsV1)[]) {
    if (!Number.isInteger(result[key]) || result[key] < 1 || result[key] > SCHEMA_LIMITS_V1[key])
      throw new AuditBundleErrorV1(
        "BUNDLE_LIMIT_EXCEEDED",
        "Audit bundle limits must be positive integers within the schema policy.",
        413,
      );
  }
  return Object.freeze(result);
}

function validateSource(source: AuditEvidenceSourceV1, projectId: string): void {
  if (
    source.projectId !== projectId || source.projection.projectId !== projectId ||
    source.sourceRef !== `change-control:${projectId}` ||
    source.projection.sourceRef !== source.sourceRef ||
    source.projection.watermark.sequence !== source.watermark.sequence ||
    source.projection.watermark.hash !== source.watermark.hash
  ) throw new AuditBundleErrorV1(
    "EVIDENCE_CONFLICT",
    "Canonical source identity and projection evidence conflict.",
    409,
  );
  let previousHash: string | null = null;
  for (let index = 0; index < source.events.length; index += 1) {
    const event = source.events[index]!;
    if (
      event.projectId !== projectId || event.sequence !== index + 1 ||
      event.previousHash !== previousHash
    ) throw new AuditBundleErrorV1(
      "EVIDENCE_INCOMPLETE",
      "Canonical source sequence or hash lineage is incomplete.",
      409,
    );
    const { hash, ...hashInput } = event;
    if (hash !== auditBundleHashV1(hashInput))
      throw new AuditBundleErrorV1(
        "EVIDENCE_CONFLICT",
        "A canonical event hash conflicts with its replayed header.",
        409,
      );
    previousHash = hash;
  }
  const last = source.events.at(-1);
  if (
    source.watermark.sequence !== (last?.sequence ?? 0) ||
    source.watermark.hash !== (last?.hash ?? null)
  ) throw new AuditBundleErrorV1(
    "EVIDENCE_CONFLICT",
    "The source watermark does not bind the canonical ledger head.",
    409,
  );
  validateOperatorActionReceipts(source);
}

function validateOperatorActionReceipts(source: AuditEvidenceSourceV1): void {
  const published = source.events.filter((event) =>
    event.type === "operator.action-receipt-published");
  const receipts = new Map<string, (typeof source.operatorActionReceipts)[number]>();
  for (const candidate of source.operatorActionReceipts) {
    let receipt: (typeof source.operatorActionReceipts)[number];
    try {
      receipt = parseOperatorActionReceiptV1(candidate);
    } catch (error) {
      if (error instanceof OperatorActionContractErrorV1)
        throw new AuditBundleErrorV1(
          error.code === "PRIVACY_VIOLATION" ? "PRIVACY_VIOLATION" : "EVIDENCE_CONFLICT",
          "A Phase 7 receipt summary is invalid.",
          error.code === "PRIVACY_VIOLATION" ? 400 : 409,
        );
      throw error;
    }
    if (receipts.has(receipt.receiptId))
      throw new AuditBundleErrorV1(
        "EVIDENCE_CONFLICT",
        "A Phase 7 receipt identity is duplicated.",
        409,
      );
    receipts.set(receipt.receiptId, receipt);
  }
  if (published.length !== receipts.size)
    throw new AuditBundleErrorV1(
      "EVIDENCE_INCOMPLETE",
      "Phase 7 receipt publication evidence is incomplete.",
      409,
    );
  for (const event of published) {
    const payloadReceipt = isRecord(event.payload.receipt) ? event.payload.receipt : null;
    const receiptId = payloadReceipt?.receiptId;
    const receipt = typeof receiptId === "string" ? receipts.get(receiptId) : undefined;
    if (!receipt)
      throw new AuditBundleErrorV1(
        "EVIDENCE_INCOMPLETE",
        "A Phase 7 receipt publication is missing its replay summary.",
        409,
      );
    if (auditBundleCanonicalJsonV1(payloadReceipt) !== auditBundleCanonicalJsonV1(receipt))
      throw new AuditBundleErrorV1(
        "EVIDENCE_CONFLICT",
        "A Phase 7 receipt summary conflicts with its publication event.",
        409,
      );
  }
}

function eventEvidenceRefs(event: ChangeControlEvent): string[] {
  return sortedUnique([
    `event:${event.id}`,
    `change:${event.changeId}`,
    ...(event.waveId ? [`wave:${event.waveId}`] : []),
    ...(event.taskId ? [`task:${event.taskId}`] : []),
  ]);
}

function eventSummary(event: ChangeControlEvent): EventSummaryV1 {
  return {
    eventId: event.id,
    sequence: event.sequence,
    eventType: event.type,
    occurredAt: event.occurredAt,
    projectId: event.projectId,
    changeId: event.changeId,
    ...(event.waveId ? { waveId: event.waveId } : {}),
    ...(event.taskId ? { taskId: event.taskId } : {}),
    eventHash: event.hash,
    previousEventHash: event.previousHash,
    evidenceRefs: eventEvidenceRefs(event),
  };
}

function entityReferences(events: readonly ChangeControlEvent[]): EntityReferenceV1[] {
  const references = new Map<string, {
    entityType: string; entityId: string; changeId: string | null;
    waveId: string | null; taskId: string | null; eventIds: Set<string>;
  }>();
  const add = (
    entityType: string,
    entityId: string,
    event: ChangeControlEvent,
    waveId: string | null,
    taskId: string | null,
  ) => {
    const key = `${entityType}\0${entityId}`;
    const existing = references.get(key) ?? {
      entityType, entityId, changeId: event.changeId, waveId, taskId,
      eventIds: new Set<string>(),
    };
    existing.eventIds.add(event.id);
    references.set(key, existing);
  };
  for (const event of events) {
    add("change", event.changeId, event, null, null);
    if (event.waveId) add("wave", event.waveId, event, event.waveId, null);
    if (event.taskId) add("task", event.taskId, event, event.waveId ?? null, event.taskId);
  }
  return [...references.values()].map((item) => ({
    entityType: item.entityType,
    entityId: item.entityId,
    changeId: item.changeId,
    waveId: item.waveId,
    taskId: item.taskId,
    eventIds: sortedUnique([...item.eventIds]),
  })).sort((left, right) =>
    compareText(left.entityType, right.entityType) || compareText(left.entityId, right.entityId));
}

function receiptObjects(value: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const seen = new Set<object>();
  const visit = (item: unknown): void => {
    if (!item || typeof item !== "object" || seen.has(item as object)) return;
    seen.add(item as object);
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    const record = item as Record<string, unknown>;
    if (
      typeof record.contractType === "string" &&
      /^[A-Za-z][A-Za-z0-9]{0,126}ReceiptV1$/.test(record.contractType)
    ) found.push(record);
    Object.values(record).forEach(visit);
  };
  visit(value);
  return found;
}

function receiptReferences(
  selectedEvents: readonly ChangeControlEvent[],
  allEvents: readonly ChangeControlEvent[],
): ReceiptReferenceV1[] {
  const eventById = new Map(allEvents.map((event) => [event.id, event]));
  const result: ReceiptReferenceV1[] = [];
  const identities = new Set<string>();
  for (const event of selectedEvents) {
    for (const receipt of receiptObjects(event.payload)) {
      const receiptType = receipt.contractType as string;
      const receiptId = typeof receipt.receiptId === "string"
        ? receipt.receiptId
        : typeof receipt.importReceiptId === "string"
          ? receipt.importReceiptId
          : typeof receipt.mergeReceiptId === "string"
            ? receipt.mergeReceiptId
            : null;
      if (!receiptId)
        throw new AuditBundleErrorV1(
          "EVIDENCE_INCOMPLETE",
          "A canonical receipt is missing its stable identity.",
          409,
        );
      const identity = `${receiptType}\0${receiptId}\0${event.id}`;
      if (identities.has(identity)) continue;
      identities.add(identity);
      const canonical = isRecord(receipt.canonicalEvent) ? receipt.canonicalEvent : null;
      const canonicalEventId = canonical && typeof canonical.eventId === "string"
        ? canonical.eventId : null;
      const canonicalEventHash = canonical && typeof canonical.eventHash === "string"
        ? canonical.eventHash : null;
      if ((canonicalEventId === null) !== (canonicalEventHash === null))
        throw new AuditBundleErrorV1(
          "EVIDENCE_INCOMPLETE",
          "A receipt canonical-event reference is incomplete.",
          409,
        );
      if (canonicalEventId !== null) {
        const referenced = eventById.get(canonicalEventId);
        if (!referenced)
          throw new AuditBundleErrorV1(
            "EVIDENCE_INCOMPLETE",
            "A receipt references missing canonical evidence.",
            409,
          );
        if (referenced.hash !== canonicalEventHash)
          throw new AuditBundleErrorV1(
            "EVIDENCE_CONFLICT",
            "A receipt canonical-event hash conflicts with replayed evidence.",
            409,
          );
      }
      if (
        typeof receipt.projectId === "string" && receipt.projectId !== event.projectId ||
        typeof receipt.changeId === "string" && receipt.changeId !== event.changeId
      ) throw new AuditBundleErrorV1(
        "EVIDENCE_CONFLICT",
        "A receipt scope conflicts with its canonical publication event.",
        409,
      );
      result.push({
        receiptType,
        receiptId,
        changeId: event.changeId,
        eventId: event.id,
        eventSequence: event.sequence,
        eventHash: event.hash,
        receiptHash: typeof receipt.receiptHash === "string" && /^[0-9a-f]{64}$/.test(receipt.receiptHash)
          ? receipt.receiptHash : auditBundleHashV1(receipt),
        canonicalEventId,
        canonicalEventHash,
      });
    }
  }
  return result.sort((left, right) => left.eventSequence - right.eventSequence ||
    compareText(left.receiptType, right.receiptType) || compareText(left.receiptId, right.receiptId));
}

function firstEventForEntity(
  events: readonly ChangeControlEvent[],
  changeIds: ReadonlySet<string>,
  entityId: string,
): ChangeControlEvent | undefined {
  const contains = (value: unknown): boolean => {
    if (value === entityId) return true;
    if (Array.isArray(value)) return value.some(contains);
    return isRecord(value) && Object.values(value).some(contains);
  };
  return events.find((event) => changeIds.has(event.changeId) && contains(event.payload));
}

function projectionSnapshots(
  source: AuditEvidenceSourceV1,
  changeIds: ReadonlySet<string>,
): ProjectionSnapshotV1[] {
  const snapshots: Omit<ProjectionSnapshotV1, "summaryHash">[] = [];
  const projection = source.projection;
  const scopedChanges = projection.changes.filter((item) => changeIds.has(item.changeId));
  const scopedWaves = projection.waves.filter((item) => changeIds.has(item.changeId));
  snapshots.push({
    view: "overview", entityId: source.projectId, changeId: null, sequence: null, status: null,
    summary: {
      totalEntities: scopedChanges.length,
      relatedEntities: scopedWaves.length,
      flaggedEntities: scopedWaves.filter((wave) => wave.status === "halted").length,
    },
    evidenceRefs: scopedChanges.map((item) => `change:${item.changeId}`),
  });
  for (const wave of scopedWaves) snapshots.push({
    view: "execution-bucket", entityId: wave.waveId, changeId: wave.changeId,
    sequence: wave.sequence, status: wave.status,
    summary: {
      totalEntities: wave.tasks.length,
      relatedEntities: wave.dependsOn.length,
      flaggedEntities: wave.readiness.ready ? 0 : 1,
    },
    evidenceRefs: sortedUnique([
      `change:${wave.changeId}`, `wave:${wave.waveId}`,
      ...wave.tasks.map((task) => `task:${task.taskId}`),
    ]),
  });
  const scopedIncidents = projection.haltIncidents.incidents
    .filter((item) => changeIds.has(item.changeId));
  for (const incident of scopedIncidents) snapshots.push({
    view: "incidents", entityId: incident.incidentId, changeId: incident.changeId,
    sequence: firstEventForEntity(source.events, changeIds, incident.incidentId)?.sequence ?? null,
    status: incident.state,
    summary: {
      totalEntities: 1,
      relatedEntities: incident.haltIds.length,
      flaggedEntities: incident.state === "resolved" ? 0 : 1,
    },
    evidenceRefs: sortedUnique([
      `incident:${incident.incidentId}`,
      ...incident.haltIds.map((haltId) => `halt:${haltId}`),
    ]),
  });

  const bindings = projection.promptModelLineage.bindings.filter((item) => changeIds.has(item.changeId));
  const executions = projection.promptModelLineage.resolvedExecutions.filter((item) => changeIds.has(item.changeId));
  const artifactIds = new Set(bindings.flatMap((item) => [...item.promptArtifactIds]));
  const routeIds = new Set([
    ...bindings.map((item) => item.modelRouteId),
    ...executions.map((item) => item.modelRouteId),
  ]);
  for (const item of projection.promptModelLineage.promptArtifacts.filter((entry) => artifactIds.has(entry.artifact.promptArtifactId)))
    snapshots.push({
      view: "prompt-registry", entityId: item.artifact.promptArtifactId, changeId: null,
      sequence: item.publishedSequence, status: item.status,
      summary: { totalEntities: 1, relatedEntities: item.artifact.parentArtifactIds.length, flaggedEntities: item.status === "revoked" ? 1 : 0 },
      evidenceRefs: [`prompt-artifact:${item.artifact.promptArtifactId}`],
    });
  for (const item of projection.promptModelLineage.modelRoutes.filter((entry) => routeIds.has(entry.route.modelRouteId)))
    snapshots.push({
      view: "prompt-registry", entityId: item.route.modelRouteId, changeId: null,
      sequence: item.publishedSequence, status: item.status,
      summary: { totalEntities: 1, relatedEntities: 0, flaggedEntities: item.status === "revoked" ? 1 : 0 },
      evidenceRefs: [`model-route:${item.route.modelRouteId}`],
    });
  for (const item of bindings) snapshots.push({
    view: "prompt-registry", entityId: item.bindingId, changeId: item.changeId,
    sequence: item.publicationSequence, status: item.bindingScope,
    summary: { totalEntities: 1, relatedEntities: item.promptArtifactIds.length + 1, flaggedEntities: 0 },
    evidenceRefs: sortedUnique([
      `binding:${item.bindingId}`, `model-route:${item.modelRouteId}`,
      ...item.promptArtifactIds.map((id) => `prompt-artifact:${id}`),
    ]),
  });
  for (const item of executions) snapshots.push({
    view: "prompt-registry", entityId: item.resolutionId, changeId: item.changeId,
    sequence: firstEventForEntity(source.events, changeIds, item.resolutionId)?.sequence ?? null,
    status: item.fallback.used ? "fallback" : "resolved",
    summary: { totalEntities: 1, relatedEntities: 2, flaggedEntities: item.fallback.used ? 1 : 0 },
    evidenceRefs: [`binding:${item.bindingId}`, `model-route:${item.modelRouteId}`],
  });

  const cohorts = projection.evalLineage.cohorts.filter((item) =>
    item.value.orderedMembers.some((member) => changeIds.has(member.changeId)));
  const cohortIds = new Set(cohorts.map((item) => item.value.evalCohortId));
  const runs = projection.evalLineage.runs.filter((item) => cohortIds.has(item.run.evalCohortId));
  const runIds = new Set(runs.map((item) => item.run.evalRunId));
  const suiteIds = new Set(runs.map((item) => item.run.evalSuiteId));
  for (const item of projection.evalLineage.suites.filter((entry) => suiteIds.has(entry.value.evalSuiteId)))
    snapshots.push({
      view: "eval-lineage", entityId: item.value.evalSuiteId, changeId: null,
      sequence: item.sequence, status: item.status,
      summary: { totalEntities: item.value.orderedCaseIds.length, relatedEntities: 0, flaggedEntities: item.status === "revoked" ? 1 : 0 },
      evidenceRefs: [`eval-suite:${item.value.evalSuiteId}`],
    });
  for (const item of cohorts) snapshots.push({
    view: "eval-lineage", entityId: item.value.evalCohortId, changeId: null,
    sequence: item.sequence, status: item.status,
    summary: { totalEntities: item.value.orderedMembers.length, relatedEntities: 0, flaggedEntities: item.status === "revoked" ? 1 : 0 },
    evidenceRefs: [`eval-cohort:${item.value.evalCohortId}`],
  });
  for (const item of runs) snapshots.push({
    view: "eval-lineage", entityId: item.run.evalRunId, changeId: null,
    sequence: firstEventForEntity(source.events, changeIds, item.run.evalRunId)?.sequence ?? null,
    status: item.state,
    summary: {
      totalEntities: item.observations.length,
      relatedEntities: item.run.candidates.length,
      flaggedEntities: item.observations.filter((observation) => observation.result !== "passed").length,
    },
    evidenceRefs: [`eval-run:${item.run.evalRunId}`, `eval-suite:${item.run.evalSuiteId}`, `eval-cohort:${item.run.evalCohortId}`],
  });
  for (const item of projection.evalLineage.reports.filter((entry) => runIds.has(entry.evalRunId)))
    snapshots.push({
      view: "eval-lineage", entityId: item.evalReportId, changeId: null,
      sequence: firstEventForEntity(source.events, changeIds, item.evalReportId)?.sequence ?? null,
      status: "published",
      summary: { totalEntities: item.candidateResults.length, relatedEntities: item.comparisons.length, flaggedEntities: item.exclusions.length },
      evidenceRefs: [`eval-report:${item.evalReportId}`, `eval-run:${item.evalRunId}`],
    });
  for (const item of projection.evalLineage.imports.filter((entry) => runIds.has(entry.importedEvalRunId)))
    snapshots.push({
      view: "eval-lineage", entityId: item.importReceiptId, changeId: null,
      sequence: firstEventForEntity(source.events, changeIds, item.importReceiptId)?.sequence ?? null,
      status: "imported",
      summary: { totalEntities: 1, relatedEntities: 1, flaggedEntities: item.unsupportedDimensions.length },
      evidenceRefs: [`eval-import:${item.importReceiptId}`, `eval-run:${item.importedEvalRunId}`],
    });
  for (const item of projection.evalLineage.championDecisions.filter((entry) =>
    entry.decision.evalRunIds.some((id) => runIds.has(id))))
    snapshots.push({
      view: "eval-lineage", entityId: item.decision.championDecisionId, changeId: null,
      sequence: firstEventForEntity(source.events, changeIds, item.decision.championDecisionId)?.sequence ?? null,
      status: item.status,
      summary: { totalEntities: 1, relatedEntities: item.decision.evalRunIds.length + item.decision.evalReportIds.length, flaggedEntities: item.status === "revoked" ? 1 : 0 },
      evidenceRefs: sortedUnique([
        `champion-decision:${item.decision.championDecisionId}`,
        ...item.decision.evalRunIds.map((id) => `eval-run:${id}`),
        ...item.decision.evalReportIds.map((id) => `eval-report:${id}`),
      ]),
    });
  return snapshots.map((item) => {
    const normalized = { ...item, evidenceRefs: sortedUnique(item.evidenceRefs) };
    return { ...normalized, summaryHash: auditBundleHashV1(normalized) };
  })
    .sort((left, right) => compareText(left.view, right.view) || compareText(left.entityId, right.entityId));
}

function unsupportedWarnings(
  source: AuditEvidenceSourceV1,
  projection: readonly ProjectionSnapshotV1[],
): AuditWarningV1[] {
  const included = new Set(projection.filter((item) => item.view === "eval-lineage").map((item) => item.entityId));
  return source.projection.evalLineage.imports
    .filter((receipt) => included.has(receipt.importReceiptId) && receipt.unsupportedDimensions.length > 0)
    .map((receipt) => ({
      code: "UNSUPPORTED_EVIDENCE" as const,
      evidenceRef: `eval-import:${receipt.importReceiptId}`,
    }))
    .sort((left, right) => compareText(left.evidenceRef, right.evidenceRef));
}

const privacyMetadata = Object.freeze({
  policyVersion: "audit-bundle-privacy-v1" as const,
  scanStatus: "passed" as const,
  excludedFieldClasses: Object.freeze([
    "credentials", "environment-values", "file-contents", "prompt-bodies",
    "provider-hidden-reasoning", "raw-provider-payloads", "unbounded-logs",
  ]),
  includedFieldClasses: Object.freeze([
    "canonical-event-headers", "entity-identities", "hashes",
    "projection-summaries", "receipt-identities",
  ]),
});

export class AuditBundleServiceV1 {
  private readonly limits: AuditBundleLimitsV1;

  constructor(
    private readonly adapter: AuditEvidenceAdapterV1,
    limits: Partial<AuditBundleLimitsV1> = {},
  ) {
    this.limits = resolvedLimits(limits);
  }

  async create(value: unknown): Promise<AuditBundleV1> {
    const request = parseAuditBundleRequestV1(value);
    const source = await this.adapter.read(request.selector.projectId);
    validateSource(source, request.selector.projectId);
    const sourceWatermark = operatorActionSourceWatermarkV1(
      source.projectId,
      source.watermark.sequence,
      source.watermark.hash,
    );
    if (request.sourceWatermark && request.sourceWatermark !== sourceWatermark)
      throw new AuditBundleErrorV1(
        "SOURCE_WATERMARK_CHANGED",
        "The exact source watermark precondition is stale.",
        409,
      );

    let selectedEvents: readonly ChangeControlEvent[];
    const selector = request.selector;
    if (selector.selectorType === "project-sequence-range") {
      const span = selector.toSequence - selector.fromSequence + 1;
      if (span > this.limits.maxEvents)
        throw new AuditBundleErrorV1(
          "BUNDLE_LIMIT_EXCEEDED",
          "The requested sequence range exceeds the configured event limit.",
          413,
        );
      if (selector.toSequence > source.watermark.sequence)
        throw new AuditBundleErrorV1(
          "EVIDENCE_INCOMPLETE",
          "The requested sequence range extends beyond canonical evidence.",
          409,
        );
      selectedEvents = source.events.filter((event) =>
        event.sequence >= selector.fromSequence &&
        event.sequence <= selector.toSequence);
      if (selectedEvents.length !== span)
        throw new AuditBundleErrorV1(
          "EVIDENCE_INCOMPLETE",
          "The requested inclusive sequence range is incomplete.",
          409,
        );
    } else {
      if (!source.projection.changes.some((change) => change.changeId === selector.changeId))
        throw new AuditBundleErrorV1(
          "CHANGE_NOT_FOUND",
          "The exact change is not present in canonical evidence.",
          404,
        );
      selectedEvents = source.events.filter((event) => event.changeId === selector.changeId);
      if (selectedEvents.length === 0)
        throw new AuditBundleErrorV1(
          "EVIDENCE_INCOMPLETE",
          "The exact change has no canonical event evidence.",
          409,
        );
      if (selectedEvents.length > this.limits.maxEvents)
        throw new AuditBundleErrorV1(
          "BUNDLE_LIMIT_EXCEEDED",
          "The exact change exceeds the configured event limit.",
          413,
        );
    }

    const summaries = selectedEvents.map(eventSummary);
    const entities = entityReferences(selectedEvents);
    const receipts = receiptReferences(selectedEvents, source.events);
    const changeIds = new Set(selectedEvents.map((event) => event.changeId));
    const projections = projectionSnapshots(source, changeIds);
    const warnings = unsupportedWarnings(source, projections);
    if (receipts.length > this.limits.maxReceipts ||
        projections.length > this.limits.maxProjectionSnapshots ||
        warnings.length > this.limits.maxWarnings)
      throw new AuditBundleErrorV1(
        "BUNDLE_LIMIT_EXCEEDED",
        "Canonical evidence exceeds a configured bundle count limit.",
        413,
      );

    const checks: CompletenessCheckV1[] = ([
      { code: "CANONICAL_REPLAY", status: "passed", evidenceRefs: [source.sourceRef] },
      { code: "PRIVACY_SCAN", status: "passed", evidenceRefs: ["privacy-policy:audit-bundle-privacy-v1"] },
      { code: "PROJECTION_COVERAGE", status: "passed", evidenceRefs: projections.map((item) => `projection:${item.view}:${item.entityId}`) },
      { code: "RECEIPT_LINEAGE", status: "passed", evidenceRefs: receipts.map((item) => `receipt:${item.receiptId}`) },
      { code: "SELECTOR_COVERAGE", status: "passed", evidenceRefs: summaries.map((item) => `event:${item.eventId}`) },
      ...(warnings.length > 0 ? [{
        code: "UNSUPPORTED_EVIDENCE" as const,
        status: "unsupported" as const,
        evidenceRefs: warnings.map((item) => item.evidenceRef),
      }] : []),
    ] satisfies CompletenessCheckV1[]).map((check) => ({
      ...check,
      evidenceRefs: sortedUnique(check.evidenceRefs),
    }));
    checks.sort((left, right) => compareText(left.code, right.code));
    const referenceCount =
      summaries.reduce((count, item) => count + item.evidenceRefs.length, 0) +
      entities.length +
      entities.reduce((count, item) => count + item.eventIds.length, 0) +
      receipts.length * 2 +
      receipts.filter((item) => item.canonicalEventId !== null).length +
      projections.reduce((count, item) => count + item.evidenceRefs.length, 0) +
      checks.reduce((count, item) => count + item.evidenceRefs.length, 0) +
      warnings.length;
    if (referenceCount > this.limits.maxReferences)
      throw new AuditBundleErrorV1(
        "BUNDLE_LIMIT_EXCEEDED",
        "Canonical evidence exceeds the configured reference limit.",
        413,
      );
    const observedFrom = selectedEvents[0]?.sequence ?? null;
    const observedTo = selectedEvents.at(-1)?.sequence ?? null;
    const content: Omit<AuditBundleV1, "bundleHash"> = {
      contractType: "AuditBundleV1",
      contractVersion: "1.0",
      policyVersion: "audit-bundle-policy-v1",
      selector: request.selector,
      source: {
        sourceRef: source.sourceRef,
        sourceWatermark,
        projectSequence: source.watermark.sequence,
        projectHash: source.watermark.hash,
      },
      sequenceBoundaries: {
        requestedFromSequence: request.selector.selectorType === "project-sequence-range"
          ? request.selector.fromSequence : null,
        requestedToSequence: request.selector.selectorType === "project-sequence-range"
          ? request.selector.toSequence : null,
        observedFromSequence: observedFrom,
        observedToSequence: observedTo,
        sourceFromSequence: source.events.length > 0 ? 1 : null,
        sourceToSequence: source.watermark.sequence,
      },
      canonicalEvents: summaries,
      entityReferences: entities,
      receiptReferences: receipts,
      projectionSnapshots: projections,
      completeness: {
        status: warnings.length === 0 ? "complete" : "complete-with-warnings",
        checks,
      },
      warnings,
      privacy: privacyMetadata,
    };
    assertAuditBundlePrivacyV1(content);
    const candidate: AuditBundleV1 = {
      ...content,
      bundleHash: auditBundleHashV1(content),
    };
    const byteLength = Buffer.byteLength(JSON.stringify(candidate), "utf8");
    if (byteLength > this.limits.maxBytes)
      throw new AuditBundleErrorV1(
        "BUNDLE_TOO_LARGE",
        "Normalized bundle bytes exceed the configured size limit.",
        413,
      );
    return parseAuditBundleV1(candidate);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
