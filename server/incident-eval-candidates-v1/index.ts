import { createHash } from "node:crypto";
import Ajv2020, { type ValidateFunction } from "ajv8/dist/2020.js";
import {
  assertHaltIncidentContractV1,
  type HaltRecordV1,
  type IncidentRecordV1,
  type SeverityV1,
} from "../halts-incidents-v1/index.ts";
import {
  assertPromptModelSchemaV1,
  type AttemptConfigurationBindingV1,
  type ResolvedModelExecutionV1,
} from "../prompt-model-eval-v1/index.ts";
import type { EvalCaseV1 } from "../prompt-model-eval-v1/eval-lineage-v1.ts";
import schema from "./schemas/incident-eval-candidates-v1.schema.json";

export const INCIDENT_EVAL_CANDIDATE_STATUSES_V1 = [
  "ready",
  "insufficient-evidence",
  "unsupported",
  "conflict",
  "stale",
] as const;

export type IncidentEvalCandidateStatusV1 =
  (typeof INCIDENT_EVAL_CANDIDATE_STATUSES_V1)[number];

export const INCIDENT_EVAL_CANDIDATE_REASON_CODES_V1 = [
  "REQUEST_SCHEMA_INVALID",
  "REQUEST_VERSION_UNSUPPORTED",
  "REQUEST_LIMIT_EXCEEDED",
  "RESPONSE_LIMIT_EXCEEDED",
  "PROHIBITED_FIELD",
  "SECRET_LIKE_INPUT",
  "PROJECT_MISSING",
  "INCIDENT_MISSING",
  "INCIDENT_IDENTITY_MISMATCH",
  "INCIDENT_CONTRACT_INVALID",
  "HALT_MISSING",
  "HALT_IDENTITY_MISMATCH",
  "HALT_CONTRACT_INVALID",
  "PROJECT_SOURCE_STALE",
  "SOURCE_SNAPSHOT_INVALID",
  "EVIDENCE_MISSING",
  "EVIDENCE_UNKNOWN",
  "EVIDENCE_PROHIBITED",
  "EVIDENCE_AMBIGUOUS",
  "ATTEMPT_LINEAGE_UNSUPPORTED",
  "ATTEMPT_LINEAGE_CONFLICT",
  "BINDING_LINEAGE_UNSUPPORTED",
  "BINDING_LINEAGE_CONFLICT",
  "INVOCATION_LINEAGE_UNSUPPORTED",
  "INVOCATION_LINEAGE_CONFLICT",
  "FIXTURE_REFERENCE_INVALID",
  "FIXTURE_PRIVACY_INVALID",
  "FIXTURE_HASH_INVALID",
  "FIXTURE_SIZE_INVALID",
  "ORACLE_MISSING",
  "ORACLE_UNSUPPORTED",
  "ORACLE_UNREGISTERED",
  "CANDIDATE_SCHEMA_INVALID",
  "CANDIDATE_SEMANTIC_INVALID",
  "CANDIDATE_IDENTITY_INVALID",
  "CANDIDATE_HASH_INVALID",
  "PREVIEW_CONFIRMATION_MISMATCH",
  "EXPLICIT_CONFIRMATION_REQUIRED",
  "IDEMPOTENCY_CONFLICT",
  "COUNT_LIMIT_EXCEEDED",
  "LEDGER_CORRUPTION",
  "CONCURRENT_STALE_CONTENDER",
] as const;

export type IncidentEvalCandidateReasonCodeV1 =
  (typeof INCIDENT_EVAL_CANDIDATE_REASON_CODES_V1)[number];

export const INCIDENT_EVAL_CANDIDATE_LIMITS_V1 = Object.freeze({
  maxRequestBytes: 16_384,
  maxResponseBytes: 65_536,
  maxStringLength: 256,
  maxEvidenceRefs: 32,
  maxHaltCount: 32,
  maxPromptArtifactCount: 16,
  maxFixtureBytes: 1_048_576,
  maxDiagnosticLength: 160,
  maxDiagnostics: 8,
});

export const INCIDENT_EVAL_CANDIDATE_GENERATION_POLICY_V1 =
  "incident-eval-candidate-generation-v1" as const;
export const INCIDENT_EVAL_CANDIDATE_PRIVACY_POLICY_V1 =
  "incident-eval-candidate-privacy-v1" as const;
export const INCIDENT_EVAL_CANDIDATE_EVENT_TYPE_V1 =
  "incident.eval-candidate-recorded" as const;

export type IncidentEvalCandidateWatermarkV1 = Readonly<{
  sequence: number;
  hash: string | null;
}>;

export type IncidentEvalFixtureDescriptorV1 = Readonly<{
  fixtureRef: string;
  contentHash: string;
  byteLength: number;
  privacyClassification: "public_fixture" | "approved_internal_fixture";
}>;

export type IncidentEvalOracleRequirementV1 = Readonly<{
  kind: "executable" | "human";
  oracleRef: string;
}>;

export type IncidentEvalAttemptSelectorV1 = Readonly<{
  attemptId: string;
  invocationId?: string;
}>;

export type IncidentEvalCandidateProposalV1 = Readonly<{
  contractType: "IncidentEvalCandidateProposalV1";
  contractVersion: "1.0";
  incidentId: string;
  expectedWatermark: IncidentEvalCandidateWatermarkV1;
  fixture: IncidentEvalFixtureDescriptorV1;
  oracle: IncidentEvalOracleRequirementV1;
  selectedEvidenceRefs: readonly string[];
  selector?: IncidentEvalAttemptSelectorV1;
  idempotencyKey: string;
}>;

/**
 * A narrow, already-replayed Phase 5 join. This module validates the existing
 * Phase 5 entities and their cross-entity identity only; it does not replay or
 * project their ledger.
 */
export type IncidentEvalPhase5JoinInputV1 = Readonly<{
  attemptBinding: AttemptConfigurationBindingV1;
  invocationBinding?: AttemptConfigurationBindingV1;
  execution?: ResolvedModelExecutionV1;
  evidenceRefs: readonly string[];
}>;

/**
 * Trusted canonical input supplied by an adapter over existing Phase 4/5
 * projections. Proposal callers never control these fields.
 */
export type IncidentEvalCandidateTrustedInputV1 = Readonly<{
  projectId: string;
  watermark: IncidentEvalCandidateWatermarkV1;
  incident: IncidentRecordV1 | null;
  effectiveHalts: readonly HaltRecordV1[];
  incidentEvidenceRefs: readonly string[];
  phase5Joins: readonly IncidentEvalPhase5JoinInputV1[];
  registeredExecutableOracleRefs: readonly string[];
}>;

type SourceScopeV1 = Readonly<{
  waveId?: string;
  taskId?: string;
  attemptId?: string;
}>;

export type IncidentEvalPhase5SnapshotV1 = Readonly<{
  bindingId: string;
  invocationBindingId?: string;
  resolutionId?: string;
  waveId: string;
  taskId: string;
  attemptId: string;
  invocationId?: string;
  promptArtifactIds: readonly string[];
  modelRouteId: string;
  evidenceRefs: readonly string[];
  complete: boolean;
}>;

export type IncidentEvalCandidateSourceSnapshotV1 = Readonly<{
  contractType: "IncidentEvalCandidateSourceSnapshotV1";
  contractVersion: "1.0";
  projectId: string;
  changeId: string;
  incidentId: string;
  incidentFingerprintVersion: "incident-v1";
  incidentFingerprint: string;
  incidentState: IncidentRecordV1["state"];
  reopenOrdinal: number;
  severity: SeverityV1;
  orderedHaltIds: readonly string[];
  scope: SourceScopeV1;
  incidentRecordHash: string;
  haltRecordHashes: readonly Readonly<{ haltId: string; recordHash: string }>[];
  knownEvidenceRefs: readonly string[];
  phase5Joins: readonly IncidentEvalPhase5SnapshotV1[];
  registeredExecutableOracleRefs: readonly string[];
  watermark: IncidentEvalCandidateWatermarkV1;
  generationPolicyId: typeof INCIDENT_EVAL_CANDIDATE_GENERATION_POLICY_V1;
  privacyPolicyId: typeof INCIDENT_EVAL_CANDIDATE_PRIVACY_POLICY_V1;
  sourceSnapshotHash: string;
}>;

export type IncidentEvalCandidatePhase5LineageV1 =
  | Readonly<{
      state: "supported";
      bindingId: string;
      invocationBindingId?: string;
      resolutionId: string;
      invocationId?: string;
      promptArtifactIds: readonly string[];
      modelRouteId: string;
    }>
  | Readonly<{
      state: "unsupported";
      reasonCode: "PHASE5_LINEAGE_NOT_AVAILABLE";
    }>;

export type IncidentEvalCandidateV1 = Readonly<{
  contractType: "IncidentEvalCandidateV1";
  contractVersion: "1.0";
  candidateId: string;
  projectId: string;
  changeId: string;
  incidentId: string;
  incidentFingerprintVersion: "incident-v1";
  incidentFingerprint: string;
  haltIds: readonly string[];
  waveId?: string;
  taskId?: string;
  attemptId?: string;
  phase5Lineage: IncidentEvalCandidatePhase5LineageV1;
  inputFixture: IncidentEvalFixtureDescriptorV1;
  acceptanceOracle: IncidentEvalOracleRequirementV1;
  severity: EvalCaseV1["severity"];
  evidenceRefs: readonly string[];
  sourceWatermark: IncidentEvalCandidateWatermarkV1;
  sourceSnapshotHash: string;
  generationPolicyId: typeof INCIDENT_EVAL_CANDIDATE_GENERATION_POLICY_V1;
  privacyPolicyId: typeof INCIDENT_EVAL_CANDIDATE_PRIVACY_POLICY_V1;
}>;

export type IncidentEvalCandidateConfirmationV1 = Readonly<{
  requestId: string;
  candidateId: string;
  candidateHash: string;
  sourceSnapshotHash: string;
  expectedWatermark: IncidentEvalCandidateWatermarkV1;
  idempotencyKey: string;
  confirmationHash: string;
}>;

export type RecordIncidentEvalCandidateRequestV1 = Readonly<{
  contractType: "RecordIncidentEvalCandidateRequestV1";
  contractVersion: "1.0";
  proposal: IncidentEvalCandidateProposalV1;
  confirmation: IncidentEvalCandidateConfirmationV1;
  confirmed: true;
  actor: string;
}>;

export type IncidentEvalCandidateReceiptV1 = Readonly<{
  contractType: "IncidentEvalCandidateReceiptV1";
  contractVersion: "1.0";
  receiptId: string;
  eventId: string;
  projectSequence: number;
  projectWatermark: IncidentEvalCandidateWatermarkV1;
  requestId: string;
  idempotencyKey: string;
  candidateId: string;
  candidateHash: string;
  incidentId: string;
  sourceSnapshotHash: string;
  actor: string;
  recordedAt: string;
  outcome: "recorded" | "already-recorded";
}>;

export type IncidentEvalCandidateProjectionV1 = Readonly<{
  contractType: "IncidentEvalCandidateProjectionV1";
  contractVersion: "1.0";
  projectId: string;
  watermark: IncidentEvalCandidateWatermarkV1;
  candidates: readonly IncidentEvalCandidateV1[];
  receipts: readonly IncidentEvalCandidateReceiptV1[];
}>;

type PreviewBaseV1 = Readonly<{
  contractType: "IncidentEvalCandidatePreviewV1";
  contractVersion: "1.0";
  requestId: string;
  projectId: string;
  incidentId: string;
  expectedWatermark: IncidentEvalCandidateWatermarkV1;
  observedWatermark: IncidentEvalCandidateWatermarkV1;
  status: IncidentEvalCandidateStatusV1;
  reasonCodes: readonly IncidentEvalCandidateReasonCodeV1[];
  diagnostics: readonly string[];
  wouldMutate: false;
}>;

export type IncidentEvalCandidatePreviewV1 =
  | (PreviewBaseV1 &
      Readonly<{
        status: "ready";
        reasonCodes: readonly [];
        diagnostics: readonly [];
        candidate: IncidentEvalCandidateV1;
        candidateHash: string;
        confirmation: IncidentEvalCandidateConfirmationV1;
      }>)
  | (PreviewBaseV1 &
      Readonly<{
        status: Exclude<IncidentEvalCandidateStatusV1, "ready">;
      }>);

export class IncidentEvalCandidateErrorV1 extends Error {
  constructor(
    readonly reasonCode: IncidentEvalCandidateReasonCodeV1,
    message: string,
    readonly status: 400 | 409 | 413 = 400,
  ) {
    super(message);
    this.name = "IncidentEvalCandidateErrorV1";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(schema);

function schemaValidator(name: string): ValidateFunction {
  const result = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!result)
    throw new Error(`Missing Incident Eval Candidates v1 schema definition ${name}.`);
  return result;
}

const proposalValidator = schemaValidator("IncidentEvalCandidateProposalV1");
const snapshotValidator = schemaValidator("IncidentEvalCandidateSourceSnapshotV1");
const candidateValidator = schemaValidator("IncidentEvalCandidateV1");
const previewValidator = schemaValidator("IncidentEvalCandidatePreviewV1");
const recordRequestValidator = schemaValidator("RecordIncidentEvalCandidateRequestV1");
const receiptValidator = schemaValidator("IncidentEvalCandidateReceiptV1");

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/;

const PROHIBITED_KEYS = new Set([
  "prompt",
  "prompts",
  "renderedprompt",
  "response",
  "responses",
  "modeloutput",
  "transcript",
  "transcripts",
  "tooltranscript",
  "hiddenreasoning",
  "providerhiddenreasoning",
  "rawdiff",
  "diff",
  "rawlog",
  "log",
  "logs",
  "credential",
  "credentials",
  "secret",
  "secrets",
  "authorization",
  "authorizationheader",
  "token",
  "accesstoken",
  "refreshtoken",
  "path",
  "filepath",
  "url",
  "uri",
  "fixturebytes",
  "rawfixture",
  "payload",
  "rawpayload",
  "filecontent",
  "filecontents",
  "environment",
  "environmentvalues",
]);

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|client[_-]?secret|password|passwd)\s*[:=]\s*\S+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk)-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[opusr]_[A-Za-z0-9]{20,}\b/,
];

const PRIVATE_DIAGNOSTICS: Readonly<
  Partial<Record<IncidentEvalCandidateReasonCodeV1, string>>
> = Object.freeze({
  PROJECT_MISSING: "The trusted project snapshot is unavailable.",
  INCIDENT_MISSING: "The selected canonical incident is unavailable.",
  INCIDENT_IDENTITY_MISMATCH: "The selected incident identity conflicts with canonical evidence.",
  INCIDENT_CONTRACT_INVALID: "The canonical incident does not satisfy its owning contract.",
  HALT_MISSING: "Canonical effective halt evidence is incomplete.",
  HALT_IDENTITY_MISMATCH: "Canonical halt identity conflicts with the selected incident.",
  HALT_CONTRACT_INVALID: "Canonical halt evidence does not satisfy its owning contract.",
  PROJECT_SOURCE_STALE: "The expected project watermark is stale.",
  SOURCE_SNAPSHOT_INVALID: "The trusted source snapshot is invalid.",
  EVIDENCE_MISSING: "At least one bounded evidence reference is required.",
  EVIDENCE_UNKNOWN: "Selected evidence is outside the canonical source boundary.",
  EVIDENCE_PROHIBITED: "Selected evidence violates the privacy boundary.",
  EVIDENCE_AMBIGUOUS: "Selected evidence does not identify one canonical source.",
  ATTEMPT_LINEAGE_UNSUPPORTED: "The requested attempt lineage is unavailable.",
  ATTEMPT_LINEAGE_CONFLICT: "More than one attempt lineage is compatible.",
  BINDING_LINEAGE_UNSUPPORTED: "A complete Phase 5 binding is unavailable.",
  BINDING_LINEAGE_CONFLICT: "Phase 5 binding identity conflicts with canonical scope.",
  INVOCATION_LINEAGE_UNSUPPORTED: "The requested invocation lineage is unavailable.",
  INVOCATION_LINEAGE_CONFLICT: "More than one invocation lineage is compatible.",
  ORACLE_UNREGISTERED: "The executable oracle is not registered as objective.",
  COUNT_LIMIT_EXCEEDED: "A fixed collection limit was exceeded.",
});

function fail(
  reasonCode: IncidentEvalCandidateReasonCodeV1,
  message: string,
  status: 400 | 409 | 413 = 400,
): never {
  throw new IncidentEvalCandidateErrorV1(reasonCode, message, status);
}

function privacyKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function compareCanonicalText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertJsonAndPrivacy(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      fail("REQUEST_SCHEMA_INVALID", "The proposal must contain finite JSON numbers.");
    return;
  }
  if (typeof value === "string") {
    if (value.length > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxStringLength)
      fail("REQUEST_LIMIT_EXCEEDED", "The proposal exceeds a fixed string limit.", 413);
    if (SECRET_PATTERNS.some((pattern) => pattern.test(value)))
      fail("SECRET_LIKE_INPUT", "The proposal contains secret-like content.");
    return;
  }
  if (typeof value !== "object")
    fail("REQUEST_SCHEMA_INVALID", "The proposal must be a JSON object.");
  if (seen.has(value as object))
    fail("REQUEST_SCHEMA_INVALID", "The proposal must be an acyclic JSON object.");
  seen.add(value as object);
  if (Array.isArray(value)) {
    for (const child of value) assertJsonAndPrivacy(child, seen);
  } else {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (PROHIBITED_KEYS.has(privacyKey(key)))
        fail("PROHIBITED_FIELD", "The proposal contains a prohibited field.");
      assertJsonAndPrivacy(child, seen);
    }
  }
  seen.delete(value as object);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => compareCanonicalText(left, right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}

export function canonicalIncidentEvalCandidateJsonV1(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function incidentEvalCandidateHashV1(
  value: unknown,
  domain = "incident-eval-candidate-content-v1",
): string {
  return createHash("sha256")
    .update(`${domain}\n${canonicalIncidentEvalCandidateJsonV1(value)}`)
    .digest("hex");
}

function equalWatermark(
  left: IncidentEvalCandidateWatermarkV1,
  right: IncidentEvalCandidateWatermarkV1,
): boolean {
  return left.sequence === right.sequence && left.hash === right.hash;
}

function normalizedStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()))].sort(
    compareCanonicalText,
  );
}

function assertSafeReference(
  value: string,
  reasonCode: IncidentEvalCandidateReasonCodeV1,
): void {
  const isPathOrUrl =
    value.includes("://") ||
    value.includes("/") ||
    value.includes("\\") ||
    /^[A-Za-z]:/.test(value);
  if (
    !REFERENCE_PATTERN.test(value) ||
    isPathOrUrl ||
    SECRET_PATTERNS.some((pattern) => pattern.test(value))
  )
    fail(reasonCode, "A reference is not a bounded canonical identifier.");
}

function validateWatermark(watermark: IncidentEvalCandidateWatermarkV1): void {
  if (
    !Number.isSafeInteger(watermark.sequence) ||
    watermark.sequence < 0 ||
    (watermark.hash !== null && !SHA256_PATTERN.test(watermark.hash)) ||
    (watermark.sequence === 0) !== (watermark.hash === null)
  )
    fail("SOURCE_SNAPSHOT_INVALID", "The canonical watermark is invalid.", 409);
}

export function normalizeIncidentEvalCandidateProposalV1(
  value: unknown,
): IncidentEvalCandidateProposalV1 {
  assertJsonAndPrivacy(value);
  const requestBytes = Buffer.byteLength(
    canonicalIncidentEvalCandidateJsonV1(value),
    "utf8",
  );
  if (requestBytes > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxRequestBytes)
    fail("REQUEST_LIMIT_EXCEEDED", "The proposal exceeds the request byte limit.", 413);

  if (
    value &&
    typeof value === "object" &&
    (value as { contractVersion?: unknown }).contractVersion !== "1.0"
  )
    fail("REQUEST_VERSION_UNSUPPORTED", "The proposal contract version is unsupported.");
  if (value && typeof value === "object") {
    const raw = value as {
      selectedEvidenceRefs?: unknown;
      fixture?: {
        contentHash?: unknown;
        byteLength?: unknown;
        privacyClassification?: unknown;
      };
      oracle?: { kind?: unknown; oracleRef?: unknown };
    };
    if (
      Array.isArray(raw.selectedEvidenceRefs) &&
      raw.selectedEvidenceRefs.length >
        INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxEvidenceRefs
    )
      fail("COUNT_LIMIT_EXCEEDED", "The evidence reference count exceeds its limit.", 413);
    if (
      typeof raw.fixture?.byteLength === "number" &&
      (!Number.isSafeInteger(raw.fixture.byteLength) ||
        raw.fixture.byteLength < 1 ||
        raw.fixture.byteLength > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxFixtureBytes)
    )
      fail("FIXTURE_SIZE_INVALID", "The fixture byte length is outside fixed bounds.");
    if (
      typeof raw.fixture?.contentHash === "string" &&
      !SHA256_PATTERN.test(raw.fixture.contentHash.toLowerCase())
    )
      fail("FIXTURE_HASH_INVALID", "The fixture content hash is invalid.");
    if (
      typeof raw.fixture?.privacyClassification === "string" &&
      raw.fixture.privacyClassification !== "public_fixture" &&
      raw.fixture.privacyClassification !== "approved_internal_fixture"
    )
      fail("FIXTURE_PRIVACY_INVALID", "The fixture privacy classification is unsupported.");
    if (typeof (raw.fixture as { fixtureRef?: unknown } | undefined)?.fixtureRef === "string")
      assertSafeReference(
        (raw.fixture as { fixtureRef: string }).fixtureRef,
        "FIXTURE_REFERENCE_INVALID",
      );
    if (
      typeof raw.oracle?.kind === "string" &&
      raw.oracle.kind !== "executable" &&
      raw.oracle.kind !== "human"
    )
      fail("ORACLE_UNSUPPORTED", "The oracle kind is unsupported.");
    if (raw.oracle && raw.oracle.oracleRef === "")
      fail("ORACLE_MISSING", "An explicit oracle reference is required.");
    if (Array.isArray(raw.selectedEvidenceRefs) && !raw.selectedEvidenceRefs.length)
      fail("EVIDENCE_MISSING", "At least one evidence reference is required.");
  }
  if (!proposalValidator(value))
    fail("REQUEST_SCHEMA_INVALID", "The proposal does not satisfy the closed schema.");

  const proposal = value as IncidentEvalCandidateProposalV1;
  const normalized: IncidentEvalCandidateProposalV1 = {
    contractType: "IncidentEvalCandidateProposalV1",
    contractVersion: "1.0",
    incidentId: proposal.incidentId.trim(),
    expectedWatermark: { ...proposal.expectedWatermark },
    fixture: {
      fixtureRef: proposal.fixture.fixtureRef.trim(),
      contentHash: proposal.fixture.contentHash.toLowerCase(),
      byteLength: proposal.fixture.byteLength,
      privacyClassification: proposal.fixture.privacyClassification,
    },
    oracle: {
      kind: proposal.oracle.kind,
      oracleRef: proposal.oracle.oracleRef.trim(),
    },
    selectedEvidenceRefs: normalizedStrings(proposal.selectedEvidenceRefs),
    ...(proposal.selector
      ? {
          selector: {
            attemptId: proposal.selector.attemptId.trim(),
            ...(proposal.selector.invocationId
              ? { invocationId: proposal.selector.invocationId.trim() }
              : {}),
          },
        }
      : {}),
    idempotencyKey: proposal.idempotencyKey.trim(),
  };

  if (!normalized.incidentId || !normalized.idempotencyKey)
    fail("REQUEST_SCHEMA_INVALID", "Required proposal identities cannot be empty.");
  validateWatermark(normalized.expectedWatermark);
  assertSafeReference(normalized.fixture.fixtureRef, "FIXTURE_REFERENCE_INVALID");
  if (!SHA256_PATTERN.test(normalized.fixture.contentHash))
    fail("FIXTURE_HASH_INVALID", "The fixture content hash is invalid.");
  if (
    !Number.isSafeInteger(normalized.fixture.byteLength) ||
    normalized.fixture.byteLength < 1 ||
    normalized.fixture.byteLength > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxFixtureBytes
  )
    fail("FIXTURE_SIZE_INVALID", "The fixture byte length is outside fixed bounds.");
  if (
    normalized.fixture.privacyClassification !== "public_fixture" &&
    normalized.fixture.privacyClassification !== "approved_internal_fixture"
  )
    fail("FIXTURE_PRIVACY_INVALID", "The fixture privacy classification is unsupported.");
  if (!normalized.oracle.oracleRef)
    fail("ORACLE_MISSING", "An explicit oracle reference is required.");
  assertSafeReference(normalized.oracle.oracleRef, "ORACLE_UNSUPPORTED");
  if (!normalized.selectedEvidenceRefs.length)
    fail("EVIDENCE_MISSING", "At least one evidence reference is required.");
  if (
    normalized.selectedEvidenceRefs.length >
    INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxEvidenceRefs
  )
    fail("COUNT_LIMIT_EXCEEDED", "The evidence reference count exceeds its limit.", 413);
  for (const ref of normalized.selectedEvidenceRefs)
    assertSafeReference(ref, "EVIDENCE_PROHIBITED");
  if (normalized.selector) {
    assertSafeReference(normalized.selector.attemptId, "ATTEMPT_LINEAGE_UNSUPPORTED");
    if (normalized.selector.invocationId)
      assertSafeReference(
        normalized.selector.invocationId,
        "INVOCATION_LINEAGE_UNSUPPORTED",
      );
  }
  return normalized;
}

function commonScopeValue(
  halts: readonly HaltRecordV1[],
  key: "waveId" | "taskId" | "attemptId",
): string | undefined {
  const values = normalizedStrings(
    halts.map((halt) => halt.scope[key]).filter((value): value is string => value !== null),
  );
  return values.length === 1 ? values[0] : undefined;
}

function assertPhase5Join(
  join: IncidentEvalPhase5JoinInputV1,
  incident: IncidentRecordV1,
): IncidentEvalPhase5SnapshotV1 {
  try {
    assertPromptModelSchemaV1<AttemptConfigurationBindingV1>(
      "AttemptConfigurationBindingV1",
      join.attemptBinding,
    );
    if (join.invocationBinding)
      assertPromptModelSchemaV1<AttemptConfigurationBindingV1>(
        "AttemptConfigurationBindingV1",
        join.invocationBinding,
      );
    if (join.execution)
      assertPromptModelSchemaV1<ResolvedModelExecutionV1>(
        "ResolvedModelExecutionV1",
        join.execution,
      );
  } catch {
    fail("BINDING_LINEAGE_CONFLICT", "Canonical Phase 5 lineage is invalid.", 409);
  }

  const attempt = join.attemptBinding;
  if (
    attempt.bindingScope !== "attempt" ||
    attempt.invocationId !== undefined ||
    attempt.projectId !== incident.projectId ||
    attempt.changeId !== incident.changeId
  )
    fail("BINDING_LINEAGE_CONFLICT", "Attempt binding identity conflicts with the incident.", 409);

  for (const identity of [
    attempt.bindingId,
    attempt.waveId,
    attempt.taskId,
    attempt.attemptId,
    attempt.modelRouteId,
    ...attempt.promptArtifactIds,
  ])
    assertSafeReference(identity, "BINDING_LINEAGE_CONFLICT");

  const invocation = join.invocationBinding;
  if (
    invocation &&
    (invocation.bindingScope !== "invocation" ||
      !invocation.invocationId ||
      invocation.parentAttemptBindingId !== attempt.bindingId ||
      invocation.projectId !== attempt.projectId ||
      invocation.changeId !== attempt.changeId ||
      invocation.waveId !== attempt.waveId ||
      invocation.taskId !== attempt.taskId ||
      invocation.attemptId !== attempt.attemptId ||
      invocation.promptArtifactIds.join("\0") !== attempt.promptArtifactIds.join("\0") ||
      invocation.modelRouteId !== attempt.modelRouteId)
  )
    fail("INVOCATION_LINEAGE_CONFLICT", "Invocation binding conflicts with its attempt.", 409);
  if (invocation) {
    assertSafeReference(invocation.bindingId, "INVOCATION_LINEAGE_CONFLICT");
    assertSafeReference(invocation.invocationId!, "INVOCATION_LINEAGE_CONFLICT");
  }

  const execution = join.execution;
  const owningBinding = invocation ?? attempt;
  if (
    execution &&
    (execution.bindingId !== owningBinding.bindingId ||
      execution.projectId !== owningBinding.projectId ||
      execution.changeId !== owningBinding.changeId ||
      execution.waveId !== owningBinding.waveId ||
      execution.taskId !== owningBinding.taskId ||
      execution.attemptId !== owningBinding.attemptId ||
      execution.invocationId !== owningBinding.invocationId ||
      execution.modelRouteId !== owningBinding.modelRouteId)
  )
    fail("BINDING_LINEAGE_CONFLICT", "Resolved execution conflicts with its binding.", 409);
  if (execution)
    assertSafeReference(execution.resolutionId, "BINDING_LINEAGE_CONFLICT");

  if (
    attempt.promptArtifactIds.length >
    INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxPromptArtifactCount
  )
    fail("COUNT_LIMIT_EXCEEDED", "The prompt artifact count exceeds its limit.", 413);

  const evidenceRefs = normalizedStrings(join.evidenceRefs);
  if (evidenceRefs.length > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxEvidenceRefs)
    fail("COUNT_LIMIT_EXCEEDED", "The lineage evidence count exceeds its limit.", 413);
  for (const ref of evidenceRefs) assertSafeReference(ref, "EVIDENCE_PROHIBITED");

  return {
    bindingId: attempt.bindingId,
    ...(invocation ? { invocationBindingId: invocation.bindingId } : {}),
    ...(execution ? { resolutionId: execution.resolutionId } : {}),
    waveId: attempt.waveId,
    taskId: attempt.taskId,
    attemptId: attempt.attemptId,
    ...(invocation?.invocationId
      ? { invocationId: invocation.invocationId }
      : execution?.invocationId
        ? { invocationId: execution.invocationId }
        : {}),
    promptArtifactIds: [...attempt.promptArtifactIds],
    modelRouteId: attempt.modelRouteId,
    evidenceRefs,
    complete: Boolean(execution),
  };
}

export function buildIncidentEvalCandidateSourceSnapshotV1(
  input: IncidentEvalCandidateTrustedInputV1,
): IncidentEvalCandidateSourceSnapshotV1 {
  if (!input.projectId)
    fail("PROJECT_MISSING", "The trusted project snapshot is unavailable.", 409);
  validateWatermark(input.watermark);
  if (!input.incident)
    fail("INCIDENT_MISSING", "The canonical incident is unavailable.", 409);

  const incident = input.incident;
  try {
    assertHaltIncidentContractV1(incident, "IncidentRecordV1");
  } catch {
    fail("INCIDENT_CONTRACT_INVALID", "The canonical incident contract is invalid.", 409);
  }
  if (incident.projectId !== input.projectId)
    fail("INCIDENT_IDENTITY_MISMATCH", "The incident does not belong to the project.", 409);
  for (const identity of [incident.projectId, incident.changeId, incident.incidentId])
    assertSafeReference(identity, "INCIDENT_CONTRACT_INVALID");
  if (!incident.haltIds.length || !input.effectiveHalts.length)
    fail("HALT_MISSING", "The incident has no effective halt evidence.", 409);
  if (
    input.effectiveHalts.length > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxHaltCount ||
    incident.haltIds.length > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxHaltCount
  )
    fail("COUNT_LIMIT_EXCEEDED", "The halt count exceeds its limit.", 413);

  const haltsById = new Map<string, HaltRecordV1>();
  for (const halt of input.effectiveHalts) {
    try {
      assertHaltIncidentContractV1(halt, "HaltRecordV1");
    } catch {
      fail("HALT_CONTRACT_INVALID", "Canonical halt evidence is invalid.", 409);
    }
    if (
      haltsById.has(halt.haltId) ||
      halt.projectId !== incident.projectId ||
      halt.changeId !== incident.changeId ||
      halt.effectiveIncidentId !== incident.incidentId
    )
      fail("HALT_IDENTITY_MISMATCH", "Canonical halt identity conflicts with the incident.", 409);
    assertSafeReference(halt.haltId, "HALT_CONTRACT_INVALID");
    haltsById.set(halt.haltId, halt);
  }
  if (
    haltsById.size !== incident.haltIds.length ||
    incident.haltIds.some((haltId) => !haltsById.has(haltId))
  )
    fail("HALT_MISSING", "The effective halt set is incomplete.", 409);

  const orderedHalts = incident.haltIds.map((haltId) => haltsById.get(haltId)!);
  const scope: SourceScopeV1 = {
    ...(commonScopeValue(orderedHalts, "waveId")
      ? { waveId: commonScopeValue(orderedHalts, "waveId") }
      : {}),
    ...(commonScopeValue(orderedHalts, "taskId")
      ? { taskId: commonScopeValue(orderedHalts, "taskId") }
      : {}),
    ...(commonScopeValue(orderedHalts, "attemptId")
      ? { attemptId: commonScopeValue(orderedHalts, "attemptId") }
      : {}),
  };
  for (const identity of Object.values(scope))
    assertSafeReference(identity, "HALT_CONTRACT_INVALID");

  const phase5Joins = input.phase5Joins
    .map((join) => assertPhase5Join(join, incident))
    .sort((left, right) =>
      compareCanonicalText(
        [left.attemptId, left.invocationId ?? "", left.bindingId].join("\0"),
        [right.attemptId, right.invocationId ?? "", right.bindingId].join("\0"),
      ),
    );
  const joinKeys = phase5Joins.map((join) =>
    [join.attemptId, join.invocationId ?? "", join.bindingId].join("\0"),
  );
  if (new Set(joinKeys).size !== joinKeys.length)
    fail("BINDING_LINEAGE_CONFLICT", "Canonical Phase 5 joins are ambiguous.", 409);

  const incidentEvidenceRefs = normalizedStrings(input.incidentEvidenceRefs);
  const registeredExecutableOracleRefs = normalizedStrings(
    input.registeredExecutableOracleRefs,
  );
  for (const ref of [...incidentEvidenceRefs, ...registeredExecutableOracleRefs])
    assertSafeReference(
      ref,
      registeredExecutableOracleRefs.includes(ref)
        ? "ORACLE_UNSUPPORTED"
        : "EVIDENCE_PROHIBITED",
    );

  const knownEvidenceRefs = normalizedStrings([
    ...incidentEvidenceRefs,
    ...orderedHalts.flatMap((halt) => halt.evidenceRefs),
  ]);
  if (knownEvidenceRefs.length > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxEvidenceRefs)
    fail("COUNT_LIMIT_EXCEEDED", "The canonical evidence count exceeds its limit.", 413);
  for (const ref of knownEvidenceRefs) assertSafeReference(ref, "EVIDENCE_PROHIBITED");

  const incidentIdentity = {
    projectId: incident.projectId,
    changeId: incident.changeId,
    incidentId: incident.incidentId,
    incidentFingerprintVersion: incident.incidentFingerprintVersion,
    incidentFingerprint: incident.incidentFingerprint,
    taxonomyPolicyVersion: incident.taxonomyPolicyVersion,
    haltIds: [...incident.haltIds],
    affectedEntities: incident.affectedEntities,
    severity: incident.severity,
    ownerKind: incident.ownerKind,
    state: incident.state,
    correlationWindowDurationSeconds:
      incident.correlationWindowPolicy.durationSeconds,
    reopenOrdinal: incident.reopenOrdinal,
    correlationReasonCode: incident.correlationReasonCode,
    ...(incident.closureReceiptId
      ? { closureReceiptId: incident.closureReceiptId }
      : {}),
  };
  const haltIdentities = orderedHalts.map((halt) => ({
    haltId: halt.haltId,
    projectId: halt.projectId,
    changeId: halt.changeId,
    correlationId: halt.correlationId,
    scope: halt.scope,
    detector: halt.detector,
    observation: halt.observation,
    evidenceRefs: [...halt.evidenceRefs],
    severity: halt.severity,
    state: halt.state,
    ...(halt.classificationAssessmentId
      ? { classificationAssessmentId: halt.classificationAssessmentId }
      : {}),
    ...(halt.haltClass ? { haltClass: halt.haltClass } : {}),
    ...(halt.effectiveIncidentId
      ? { effectiveIncidentId: halt.effectiveIncidentId }
      : {}),
    ...(halt.lastTransitionReasonCode
      ? { lastTransitionReasonCode: halt.lastTransitionReasonCode }
      : {}),
  }));

  const snapshotWithoutHash = {
    contractType: "IncidentEvalCandidateSourceSnapshotV1" as const,
    contractVersion: "1.0" as const,
    projectId: incident.projectId,
    changeId: incident.changeId,
    incidentId: incident.incidentId,
    incidentFingerprintVersion: incident.incidentFingerprintVersion,
    incidentFingerprint: incident.incidentFingerprint,
    incidentState: incident.state,
    reopenOrdinal: incident.reopenOrdinal,
    severity: incident.severity,
    orderedHaltIds: [...incident.haltIds],
    scope,
    incidentRecordHash: incidentEvalCandidateHashV1(
      incidentIdentity,
      "phase4-incident-identity-v1",
    ),
    haltRecordHashes: haltIdentities.map((halt) => ({
      haltId: halt.haltId,
      recordHash: incidentEvalCandidateHashV1(halt, "phase4-halt-identity-v1"),
    })),
    knownEvidenceRefs,
    phase5Joins,
    registeredExecutableOracleRefs,
    watermark: { ...input.watermark },
    generationPolicyId: INCIDENT_EVAL_CANDIDATE_GENERATION_POLICY_V1,
    privacyPolicyId: INCIDENT_EVAL_CANDIDATE_PRIVACY_POLICY_V1,
  };
  const snapshotIdentity = {
    ...snapshotWithoutHash,
    watermark: undefined,
  };
  const snapshot: IncidentEvalCandidateSourceSnapshotV1 = {
    ...snapshotWithoutHash,
    sourceSnapshotHash: incidentEvalCandidateHashV1(
      snapshotIdentity,
      "incident-eval-candidate-source-snapshot-v1",
    ),
  };
  if (!snapshotValidator(snapshot))
    fail("SOURCE_SNAPSHOT_INVALID", "The source snapshot failed its closed schema.", 409);
  return snapshot;
}

function selectPhase5Lineage(
  snapshot: IncidentEvalCandidateSourceSnapshotV1,
  proposal: IncidentEvalCandidateProposalV1,
):
  | Readonly<{ status: "selected"; join: IncidentEvalPhase5SnapshotV1 }>
  | Readonly<{
      status: "none";
    }>
  | Readonly<{
      status: "blocked";
      previewStatus: "unsupported" | "conflict";
      reasonCode: IncidentEvalCandidateReasonCodeV1;
    }> {
  const selector = proposal.selector;
  if (selector) {
    const matches = snapshot.phase5Joins.filter(
      (join) =>
        join.attemptId === selector.attemptId &&
        (selector.invocationId === undefined ||
          join.invocationId === selector.invocationId),
    );
    if (!matches.length)
      return {
        status: "blocked",
        previewStatus: "unsupported",
        reasonCode: selector.invocationId
          ? "INVOCATION_LINEAGE_UNSUPPORTED"
          : "ATTEMPT_LINEAGE_UNSUPPORTED",
      };
    if (matches.length > 1)
      return {
        status: "blocked",
        previewStatus: "conflict",
        reasonCode: selector.invocationId
          ? "INVOCATION_LINEAGE_CONFLICT"
          : "ATTEMPT_LINEAGE_CONFLICT",
      };
    const selected = matches[0]!;
    if (!selected.complete || !selected.resolutionId)
      return {
        status: "blocked",
        previewStatus: "unsupported",
        reasonCode: "BINDING_LINEAGE_UNSUPPORTED",
      };
    return { status: "selected", join: selected };
  }

  if (snapshot.phase5Joins.length > 1)
    return {
      status: "blocked",
      previewStatus: "conflict",
      reasonCode: "ATTEMPT_LINEAGE_CONFLICT",
    };
  const onlyJoin = snapshot.phase5Joins[0];
  if (!onlyJoin?.complete || !onlyJoin.resolutionId) return { status: "none" };
  return { status: "selected", join: onlyJoin };
}

function candidateSeverity(severity: SeverityV1): EvalCaseV1["severity"] {
  return severity === "info" ? "warning" : severity;
}

function candidateIdentityMaterial(
  candidate: Pick<
    IncidentEvalCandidateV1,
    | "contractVersion"
    | "sourceSnapshotHash"
    | "inputFixture"
    | "acceptanceOracle"
    | "evidenceRefs"
    | "generationPolicyId"
    | "privacyPolicyId"
  >,
) {
  return {
    contractVersion: candidate.contractVersion,
    sourceSnapshotHash: candidate.sourceSnapshotHash,
    inputFixture: candidate.inputFixture,
    acceptanceOracle: candidate.acceptanceOracle,
    evidenceRefs: candidate.evidenceRefs,
    generationPolicyId: candidate.generationPolicyId,
    privacyPolicyId: candidate.privacyPolicyId,
  };
}

export function assertIncidentEvalCandidateV1(
  value: unknown,
  expectedCandidateHash?: string,
): asserts value is IncidentEvalCandidateV1 {
  assertJsonAndPrivacy(value);
  if (!candidateValidator(value))
    fail("CANDIDATE_SCHEMA_INVALID", "The candidate failed its closed schema.");
  const candidate = value as IncidentEvalCandidateV1;
  for (const identity of [
    candidate.projectId,
    candidate.changeId,
    candidate.incidentId,
    ...candidate.haltIds,
    ...(candidate.waveId ? [candidate.waveId] : []),
    ...(candidate.taskId ? [candidate.taskId] : []),
    ...(candidate.attemptId ? [candidate.attemptId] : []),
    candidate.inputFixture.fixtureRef,
    candidate.acceptanceOracle.oracleRef,
    ...candidate.evidenceRefs,
  ])
    assertSafeReference(identity, "CANDIDATE_SEMANTIC_INVALID");
  if (
    candidate.evidenceRefs.join("\0") !==
      normalizedStrings(candidate.evidenceRefs).join("\0") ||
    new Set(candidate.haltIds).size !== candidate.haltIds.length ||
    (candidate.taskId !== undefined && candidate.waveId === undefined) ||
    (candidate.attemptId !== undefined && candidate.taskId === undefined) ||
    (candidate.phase5Lineage.state === "supported" &&
      (!candidate.waveId || !candidate.taskId || !candidate.attemptId))
  )
    fail("CANDIDATE_SEMANTIC_INVALID", "The candidate violates a semantic invariant.");
  if (candidate.phase5Lineage.state === "supported") {
    for (const identity of [
      candidate.phase5Lineage.bindingId,
      ...(candidate.phase5Lineage.invocationBindingId
        ? [candidate.phase5Lineage.invocationBindingId]
        : []),
      candidate.phase5Lineage.resolutionId,
      ...(candidate.phase5Lineage.invocationId
        ? [candidate.phase5Lineage.invocationId]
        : []),
      ...candidate.phase5Lineage.promptArtifactIds,
      candidate.phase5Lineage.modelRouteId,
    ])
      assertSafeReference(identity, "CANDIDATE_SEMANTIC_INVALID");
  }
  const expectedCandidateId = `iec_${incidentEvalCandidateHashV1(
    candidateIdentityMaterial(candidate),
    "incident-eval-candidate-identity-v1",
  )}`;
  if (candidate.candidateId !== expectedCandidateId)
    fail("CANDIDATE_IDENTITY_INVALID", "The candidate identity is invalid.", 409);
  if (
    expectedCandidateHash !== undefined &&
    incidentEvalCandidateHashV1(candidate) !== expectedCandidateHash
  )
    fail("CANDIDATE_HASH_INVALID", "The candidate content hash is invalid.", 409);
}

function requestIdentity(proposal: IncidentEvalCandidateProposalV1): string {
  return `iecp_${incidentEvalCandidateHashV1(
    proposal,
    "incident-eval-candidate-preview-request-v1",
  )}`;
}

export function normalizeRecordIncidentEvalCandidateRequestV1(
  value: unknown,
): RecordIncidentEvalCandidateRequestV1 {
  assertJsonAndPrivacy(value);
  if (
    Buffer.byteLength(canonicalIncidentEvalCandidateJsonV1(value), "utf8") >
    INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxRequestBytes
  )
    fail("REQUEST_LIMIT_EXCEEDED", "The recording request exceeds the byte limit.", 413);
  if (
    value &&
    typeof value === "object" &&
    (value as { contractVersion?: unknown }).contractVersion !== "1.0"
  )
    fail("REQUEST_VERSION_UNSUPPORTED", "The recording contract version is unsupported.");
  if (
    value &&
    typeof value === "object" &&
    (value as { confirmed?: unknown }).confirmed !== true
  )
    fail(
      "EXPLICIT_CONFIRMATION_REQUIRED",
      "Candidate recording requires direct explicit confirmation.",
    );
  if (!recordRequestValidator(value))
    fail("REQUEST_SCHEMA_INVALID", "The recording request does not satisfy the closed schema.");

  const input = value as RecordIncidentEvalCandidateRequestV1;
  const proposal = normalizeIncidentEvalCandidateProposalV1(input.proposal);
  const actor = input.actor;
  if (
    typeof actor !== "string" ||
    actor.trim() !== actor ||
    actor.length < 1 ||
    actor.length > INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxStringLength
  )
    fail("REQUEST_SCHEMA_INVALID", "The recording actor identity is invalid.");
  const confirmation = structuredClone(input.confirmation);
  validateWatermark(confirmation.expectedWatermark);
  const confirmationWithoutHash = {
    requestId: confirmation.requestId,
    candidateId: confirmation.candidateId,
    candidateHash: confirmation.candidateHash,
    sourceSnapshotHash: confirmation.sourceSnapshotHash,
    expectedWatermark: confirmation.expectedWatermark,
    idempotencyKey: confirmation.idempotencyKey,
  };
  if (
    confirmation.requestId !== requestIdentity(proposal) ||
    confirmation.idempotencyKey !== proposal.idempotencyKey ||
    !equalWatermark(confirmation.expectedWatermark, proposal.expectedWatermark) ||
    confirmation.confirmationHash !==
      incidentEvalCandidateHashV1(
        confirmationWithoutHash,
        "incident-eval-candidate-confirmation-v1",
      )
  )
    fail(
      "PREVIEW_CONFIRMATION_MISMATCH",
      "The recording request does not bind the exact normalized preview request.",
      409,
    );
  return {
    contractType: "RecordIncidentEvalCandidateRequestV1",
    contractVersion: "1.0",
    proposal,
    confirmation,
    confirmed: true,
    actor,
  };
}

export function assertIncidentEvalCandidateReceiptV1(
  value: unknown,
): asserts value is IncidentEvalCandidateReceiptV1 {
  assertJsonAndPrivacy(value);
  if (!receiptValidator(value))
    fail("CANDIDATE_SCHEMA_INVALID", "The candidate receipt failed its closed schema.", 409);
  const receipt = value as IncidentEvalCandidateReceiptV1;
  validateWatermark(receipt.projectWatermark);
  if (
    !Number.isSafeInteger(receipt.projectSequence) ||
    receipt.projectSequence !== receipt.projectWatermark.sequence + 1 ||
    !Number.isFinite(Date.parse(receipt.recordedAt)) ||
    new Date(receipt.recordedAt).toISOString() !== receipt.recordedAt
  )
    fail("CANDIDATE_SEMANTIC_INVALID", "The candidate receipt is semantically invalid.", 409);
}

function sortedReasonCodes(
  reasonCodes: readonly IncidentEvalCandidateReasonCodeV1[],
): IncidentEvalCandidateReasonCodeV1[] {
  return [...new Set(reasonCodes)].sort(compareCanonicalText);
}

function privateDiagnostics(
  reasonCodes: readonly IncidentEvalCandidateReasonCodeV1[],
): string[] {
  return reasonCodes
    .slice(0, INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxDiagnostics)
    .map((reasonCode) =>
      (PRIVATE_DIAGNOSTICS[reasonCode] ?? "The candidate preview failed a closed contract boundary.").slice(
        0,
        INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxDiagnosticLength,
      ),
    );
}

function assertPreviewOutput(preview: IncidentEvalCandidatePreviewV1): void {
  if (!previewValidator(preview))
    fail("CANDIDATE_SCHEMA_INVALID", "The preview failed its closed response schema.", 409);
  if (
    Buffer.byteLength(canonicalIncidentEvalCandidateJsonV1(preview), "utf8") >
    INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxResponseBytes
  )
    fail("RESPONSE_LIMIT_EXCEEDED", "The preview exceeds the response byte limit.", 413);
}

function nonReadyPreview(
  status: Exclude<IncidentEvalCandidateStatusV1, "ready">,
  reasonCodes: readonly IncidentEvalCandidateReasonCodeV1[],
  proposal: IncidentEvalCandidateProposalV1,
  trusted: IncidentEvalCandidateTrustedInputV1,
): IncidentEvalCandidatePreviewV1 {
  const sorted = sortedReasonCodes(reasonCodes);
  const preview: IncidentEvalCandidatePreviewV1 = {
    contractType: "IncidentEvalCandidatePreviewV1",
    contractVersion: "1.0",
    requestId: requestIdentity(proposal),
    projectId: trusted.projectId,
    incidentId: proposal.incidentId,
    expectedWatermark: { ...proposal.expectedWatermark },
    observedWatermark: { ...trusted.watermark },
    status,
    reasonCodes: sorted,
    diagnostics: privateDiagnostics(sorted),
    wouldMutate: false,
  };
  assertPreviewOutput(preview);
  return preview;
}

function sourceErrorStatus(
  reasonCode: IncidentEvalCandidateReasonCodeV1,
): Exclude<IncidentEvalCandidateStatusV1, "ready"> {
  if (reasonCode === "INCIDENT_MISSING" || reasonCode === "HALT_MISSING")
    return "insufficient-evidence";
  if (reasonCode.endsWith("UNSUPPORTED") || reasonCode === "ORACLE_UNREGISTERED")
    return "unsupported";
  return "conflict";
}

export function previewIncidentEvalCandidateV1(
  proposalValue: unknown,
  trusted: IncidentEvalCandidateTrustedInputV1,
): IncidentEvalCandidatePreviewV1 {
  const proposal = normalizeIncidentEvalCandidateProposalV1(proposalValue);

  if (!trusted.projectId)
    return nonReadyPreview("unsupported", ["PROJECT_MISSING"], proposal, trusted);
  if (!equalWatermark(proposal.expectedWatermark, trusted.watermark))
    return nonReadyPreview("stale", ["PROJECT_SOURCE_STALE"], proposal, trusted);
  if (!trusted.incident)
    return nonReadyPreview(
      "insufficient-evidence",
      ["INCIDENT_MISSING"],
      proposal,
      trusted,
    );
  if (proposal.incidentId !== trusted.incident.incidentId)
    return nonReadyPreview(
      "conflict",
      ["INCIDENT_IDENTITY_MISMATCH"],
      proposal,
      trusted,
    );

  let snapshot: IncidentEvalCandidateSourceSnapshotV1;
  try {
    snapshot = buildIncidentEvalCandidateSourceSnapshotV1(trusted);
  } catch (error) {
    if (error instanceof IncidentEvalCandidateErrorV1)
      return nonReadyPreview(
        sourceErrorStatus(error.reasonCode),
        [error.reasonCode],
        proposal,
        trusted,
      );
    throw error;
  }

  if (
    proposal.oracle.kind === "executable" &&
    !snapshot.registeredExecutableOracleRefs.includes(proposal.oracle.oracleRef)
  )
    return nonReadyPreview(
      "unsupported",
      ["ORACLE_UNREGISTERED"],
      proposal,
      trusted,
    );

  const lineage = selectPhase5Lineage(snapshot, proposal);
  if (lineage.status === "blocked")
    return nonReadyPreview(
      lineage.previewStatus,
      [lineage.reasonCode],
      proposal,
      trusted,
    );

  if (lineage.status === "selected") {
    const { join } = lineage;
    if (
      (snapshot.scope.waveId && snapshot.scope.waveId !== join.waveId) ||
      (snapshot.scope.taskId && snapshot.scope.taskId !== join.taskId) ||
      (snapshot.scope.attemptId && snapshot.scope.attemptId !== join.attemptId)
    )
      return nonReadyPreview(
        "conflict",
        ["BINDING_LINEAGE_CONFLICT"],
        proposal,
        trusted,
      );
  }

  const selectedJoin = lineage.status === "selected" ? lineage.join : undefined;
  const exactEvidenceRefs = new Set([
    ...snapshot.knownEvidenceRefs,
    ...(selectedJoin?.evidenceRefs ?? []),
  ]);
  if (proposal.selectedEvidenceRefs.some((ref) => !exactEvidenceRefs.has(ref)))
    return nonReadyPreview(
      "insufficient-evidence",
      ["EVIDENCE_UNKNOWN"],
      proposal,
      trusted,
    );

  const candidateWithoutId = {
    contractType: "IncidentEvalCandidateV1" as const,
    contractVersion: "1.0" as const,
    projectId: snapshot.projectId,
    changeId: snapshot.changeId,
    incidentId: snapshot.incidentId,
    incidentFingerprintVersion: snapshot.incidentFingerprintVersion,
    incidentFingerprint: snapshot.incidentFingerprint,
    haltIds: [...snapshot.orderedHaltIds],
    ...(selectedJoin
      ? {
          waveId: selectedJoin.waveId,
          taskId: selectedJoin.taskId,
          attemptId: selectedJoin.attemptId,
        }
      : snapshot.scope),
    phase5Lineage: selectedJoin
      ? {
          state: "supported" as const,
          bindingId: selectedJoin.bindingId,
          ...(selectedJoin.invocationBindingId
            ? { invocationBindingId: selectedJoin.invocationBindingId }
            : {}),
          resolutionId: selectedJoin.resolutionId!,
          ...(selectedJoin.invocationId
            ? { invocationId: selectedJoin.invocationId }
            : {}),
          promptArtifactIds: [...selectedJoin.promptArtifactIds],
          modelRouteId: selectedJoin.modelRouteId,
        }
      : {
          state: "unsupported" as const,
          reasonCode: "PHASE5_LINEAGE_NOT_AVAILABLE" as const,
        },
    inputFixture: { ...proposal.fixture },
    acceptanceOracle: { ...proposal.oracle },
    severity: candidateSeverity(snapshot.severity),
    evidenceRefs: [...proposal.selectedEvidenceRefs],
    sourceWatermark: { ...snapshot.watermark },
    sourceSnapshotHash: snapshot.sourceSnapshotHash,
    generationPolicyId: INCIDENT_EVAL_CANDIDATE_GENERATION_POLICY_V1,
    privacyPolicyId: INCIDENT_EVAL_CANDIDATE_PRIVACY_POLICY_V1,
  };
  const candidateId = `iec_${incidentEvalCandidateHashV1(
    candidateIdentityMaterial(candidateWithoutId),
    "incident-eval-candidate-identity-v1",
  )}`;
  const candidate: IncidentEvalCandidateV1 = {
    ...candidateWithoutId,
    candidateId,
  };
  if (!candidateValidator(candidate))
    return nonReadyPreview(
      "conflict",
      ["CANDIDATE_SCHEMA_INVALID"],
      proposal,
      trusted,
    );
  const candidateHash = incidentEvalCandidateHashV1(candidate);
  try {
    assertIncidentEvalCandidateV1(candidate, candidateHash);
  } catch (error) {
    if (error instanceof IncidentEvalCandidateErrorV1)
      return nonReadyPreview(
        "conflict",
        [error.reasonCode],
        proposal,
        trusted,
      );
    throw error;
  }
  const requestId = requestIdentity(proposal);
  const confirmationWithoutHash = {
    requestId,
    candidateId,
    candidateHash,
    sourceSnapshotHash: snapshot.sourceSnapshotHash,
    expectedWatermark: { ...proposal.expectedWatermark },
    idempotencyKey: proposal.idempotencyKey,
  };
  const preview: IncidentEvalCandidatePreviewV1 = {
    contractType: "IncidentEvalCandidatePreviewV1",
    contractVersion: "1.0",
    requestId,
    projectId: snapshot.projectId,
    incidentId: snapshot.incidentId,
    expectedWatermark: { ...proposal.expectedWatermark },
    observedWatermark: { ...snapshot.watermark },
    status: "ready",
    reasonCodes: [],
    diagnostics: [],
    candidate,
    candidateHash,
    confirmation: {
      ...confirmationWithoutHash,
      confirmationHash: incidentEvalCandidateHashV1(
        confirmationWithoutHash,
        "incident-eval-candidate-confirmation-v1",
      ),
    },
    wouldMutate: false,
  };
  assertPreviewOutput(preview);
  return preview;
}

/** Returns only the existing Phase 5 EvalCaseV1 semantic shape; it publishes nothing. */
export function incidentEvalCandidateCaseSemanticsV1(
  candidate: IncidentEvalCandidateV1,
): Omit<EvalCaseV1, "evalCaseId"> {
  assertIncidentEvalCandidateV1(candidate);
  return {
    inputFixtureRef: candidate.inputFixture.fixtureRef,
    acceptanceOracle: { ...candidate.acceptanceOracle },
    severity: candidate.severity,
    expectedEvidenceRefs: [...candidate.evidenceRefs],
  };
}

export function validateIncidentEvalCandidateSchemaV1(
  schemaName:
    | "IncidentEvalCandidateProposalV1"
    | "IncidentEvalCandidateSourceSnapshotV1"
    | "IncidentEvalCandidateV1"
    | "IncidentEvalCandidatePreviewV1"
    | "RecordIncidentEvalCandidateRequestV1"
    | "IncidentEvalCandidateReceiptV1",
  value: unknown,
): boolean {
  return schemaValidator(schemaName)(value) as boolean;
}
