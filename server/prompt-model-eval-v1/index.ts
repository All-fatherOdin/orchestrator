import { createHash } from "node:crypto";
import Ajv2020, { type ValidateFunction } from "ajv8/dist/2020.js";
import promptModelLineageV1Schema from "./schemas/prompt-model-lineage-v1.schema.json";

export const PROMPT_MODEL_LINEAGE_EVENT_TYPES_V1 = [
  "prompt.artifact-published",
  "prompt.artifact-revoked",
  "model.route-published",
  "model.route-revoked",
  "attempt.configuration-bound",
  "invocation.configuration-bound",
  "model.execution-resolved",
] as const;

export type PromptModelLineageEventTypeV1 =
  (typeof PROMPT_MODEL_LINEAGE_EVENT_TYPES_V1)[number];

export const PROMPT_MODEL_LINEAGE_REASON_CODES_V1 = [
  "PROMPT_ARTIFACT_UNKNOWN",
  "PROMPT_ARTIFACT_REVOKED",
  "PROMPT_CONTENT_HASH_MISMATCH",
  "PROMPT_PRIVACY_VIOLATION",
  "PROMPT_DERIVATION_CYCLE",
  "PROMPT_SUPERSESSION_INVALID",
  "MODEL_ROUTE_UNKNOWN",
  "MODEL_ROUTE_REVOKED",
  "MODEL_CAPABILITY_UNSUPPORTED",
  "MODEL_RESOLUTION_MISMATCH",
  "MODEL_FALLBACK_NOT_PERMITTED",
  "ATTEMPT_BINDING_MISSING",
  "ATTEMPT_BINDING_STALE",
  "ATTEMPT_BINDING_CONFLICT",
  "INVOCATION_BINDING_MISSING",
  "CROSS_ENTITY_IDENTITY_MISMATCH",
  "PUBLISHER_OCCURRENCE_CONFLICT",
  "SCHEMA_INVALID",
] as const;

export type PromptModelLineageReasonCodeV1 =
  (typeof PROMPT_MODEL_LINEAGE_REASON_CODES_V1)[number];

type CompilerIdentityV1 = Readonly<{
  compilerId: string;
  version: string;
}>;

export type PromptArtifactV1 = Readonly<{
  contractType: "PromptArtifactV1";
  contractVersion: "1.0";
  promptArtifactId: string;
  purpose: string;
  artifactKind:
    | "system"
    | "executor"
    | "reviewer"
    | "correction"
    | "planner"
    | "architect"
    | "warden_explanation"
    | "eval_assertion";
  schemaVersion: string;
  content:
    | Readonly<{
        storage: "approved_reusable_content";
        mediaType: "text/plain; charset=utf-8";
        text: string;
      }>
    | Readonly<{
        storage: "manifest";
        orderedArtifactIds: readonly string[];
        compiler: CompilerIdentityV1;
      }>;
  contentHash: string;
  byteLength: number;
  compiler?: CompilerIdentityV1;
  inputSchemaRef: string;
  behaviorContractRefs: readonly string[];
  parentArtifactIds: readonly string[];
  derivation?: Readonly<{
    operation: "edit" | "compose" | "redact" | "migrate";
    operationVersion: string;
  }>;
  supersedesId?: string;
  publishedBy: string;
  publishedAt: string;
  privacy: Readonly<{
    classification: "approved_reusable" | "manifest_only";
    validationReceipt: Readonly<{
      validatorId: string;
      validatorVersion: "1.0";
      decision: "approved";
      validatedAt: string;
      evidenceRefs: readonly string[];
    }>;
  }>;
}>;

export type ModelRouteV1 = Readonly<{
  contractType: "ModelRouteV1";
  contractVersion: "1.0";
  modelRouteId: string;
  routePolicyId: string;
  routePolicyVersion: string;
  requestedModelClass: string;
  minimumModelClass: string;
  reasoningLevel: "light" | "medium" | "high";
  requiredCapabilities: Readonly<{
    runtimeId: string;
    toolRoute: string;
    capabilityMapVersion: string;
  }>;
  fallbackPolicy: Readonly<{
    mode: "denied" | "permitted";
    allowedResolvedModelClasses: readonly string[];
    allowedReasonCodes: readonly string[];
  }>;
  allowedProviderAdapters: readonly Readonly<{
    providerId: string;
    adapterId: string;
    adapterVersion: string;
  }>[];
  failClosedUnsupported: true;
  routingRationaleCode: string;
  supersedesId?: string;
  publishedBy: string;
  publishedAt: string;
}>;

export type AttemptConfigurationBindingV1 = Readonly<{
  contractType: "AttemptConfigurationBindingV1";
  contractVersion: "1.0";
  bindingId: string;
  bindingScope: "attempt" | "invocation";
  role: "executor" | "reviewer" | "correction";
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  runId: string;
  attemptId: string;
  invocationId?: string;
  parentAttemptBindingId?: string;
  plan: Readonly<{ planId: string; revision: number; planBaseSha: string }>;
  authorizationId: string;
  workspace: Readonly<{
    workspaceAttemptId: string;
    repositoryId: string;
    baseSha: string;
  }>;
  promptArtifactIds: readonly string[];
  compositeManifestHash: string;
  compiler: CompilerIdentityV1;
  inputSchemaVersion: string;
  inputFingerprint: Readonly<{
    algorithm: "scoped-sha256" | "hmac-sha256";
    scopeId: string;
    value: string;
  }>;
  modelRouteId: string;
  expectedRuntime: Readonly<{
    runtimeId: string;
    toolRoute: string;
    capabilityMapVersion: string;
  }>;
  boundBy: string;
  reason: string;
  boundAt: string;
  publicationSequence: number;
  evidenceSnapshotHash: string;
}>;

export type MeasurementV1 =
  | Readonly<{ state: "unsupported" }>
  | Readonly<{ state: "measured"; value: number; unit: string }>;

export type ResolvedModelExecutionV1 = Readonly<{
  contractType: "ResolvedModelExecutionV1";
  contractVersion: "1.0";
  resolutionId: string;
  bindingId: string;
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  runId: string;
  attemptId: string;
  invocationId?: string;
  modelRouteId: string;
  providerId: string;
  providerAdapterId: string;
  providerAdapterVersion: string;
  runtimeId: string;
  providerModelId: string;
  resolvedModelClass: string;
  capabilityMapVersion: string;
  reasoningLevel: "light" | "medium" | "high";
  toolRoute: string;
  resolutionReasonCode: string;
  fallback:
    | Readonly<{ used: false }>
    | Readonly<{
        used: true;
        sourceModelClass: string;
        reasonCode: string;
      }>;
  providerRequestIdHash?: string;
  startedAt: string;
  measurements: Readonly<{
    inputTokens: MeasurementV1;
    outputTokens: MeasurementV1;
    latency: MeasurementV1;
    cost: MeasurementV1;
    cache: MeasurementV1;
    providerMetadata: MeasurementV1;
  }>;
}>;

export type LineageRevocationV1 = Readonly<{
  entityId: string;
  reasonCode: string;
  reason: string;
  evidenceRefs: readonly string[];
  revokedBy: string;
  revokedAt: string;
}>;

export type PromptModelLineageEventV1 = Readonly<{
  id: string;
  sequence: number;
  type: PromptModelLineageEventTypeV1;
  occurredAt: string;
  projectId: string;
  changeId: string;
  waveId?: string;
  taskId?: string;
  actor: string;
  causationId: string;
  correlationId: string;
  payload: Readonly<{
    publisherOccurrenceId: string;
    artifact?: PromptArtifactV1;
    route?: ModelRouteV1;
    binding?: AttemptConfigurationBindingV1;
    resolution?: ResolvedModelExecutionV1;
    revocation?: LineageRevocationV1;
  }>;
  previousHash: string | null;
  hash: string;
}>;

export type PublishedPromptArtifactV1 = Readonly<{
  artifact: PromptArtifactV1;
  status: "published" | "revoked";
  publishedSequence: number;
  revocation?: LineageRevocationV1;
}>;

export type PublishedModelRouteV1 = Readonly<{
  route: ModelRouteV1;
  status: "published" | "revoked";
  publishedSequence: number;
  revocation?: LineageRevocationV1;
}>;

export type PromptModelLineageProjectionV1 = Readonly<{
  projectId: string;
  promptArtifacts: readonly PublishedPromptArtifactV1[];
  modelRoutes: readonly PublishedModelRouteV1[];
  bindings: readonly AttemptConfigurationBindingV1[];
  resolvedExecutions: readonly ResolvedModelExecutionV1[];
  events: readonly PromptModelLineageEventV1[];
}>;

export type MutablePromptModelLineageProjectionV1 = {
  projectId: string;
  promptArtifacts: Map<string, PublishedPromptArtifactV1>;
  modelRoutes: Map<string, PublishedModelRouteV1>;
  bindings: Map<string, AttemptConfigurationBindingV1>;
  attemptBindingIds: Map<string, string>;
  invocationBindingIds: Map<string, string>;
  resolvedExecutions: Map<string, ResolvedModelExecutionV1>;
  resolutionIdsByBinding: Map<string, string>;
  occurrenceEvents: Map<string, PromptModelLineageEventV1>;
  events: PromptModelLineageEventV1[];
};

export type PromptModelReplayContextV1 = Readonly<{
  hasChange: (changeId: string) => boolean;
  hasWave: (changeId: string, waveId: string) => boolean;
  hasTask: (changeId: string, waveId: string, taskId: string) => boolean;
  planIdentity: (
    changeId: string,
    waveId: string,
    planId: string,
    revision: number,
  ) =>
    | Readonly<{
        planBaseSha: string;
        status: string;
        authorizationId?: string;
      }>
    | undefined;
}>;

export class PromptModelLineageErrorV1 extends Error {
  constructor(
    readonly reasonCode: PromptModelLineageReasonCodeV1,
    message: string,
  ) {
    super(message);
    this.name = "PromptModelLineageErrorV1";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addFormat("date-time", true);
ajv.addSchema(promptModelLineageV1Schema);

const schemaValidators = new Map<string, ValidateFunction>();
for (const name of [
  "PromptArtifactV1",
  "ModelRouteV1",
  "AttemptConfigurationBindingV1",
  "ResolvedModelExecutionV1",
  "PromptModelLineageEventV1",
]) {
  const validator = ajv.getSchema(`${promptModelLineageV1Schema.$id}#/$defs/${name}`);
  if (!validator) throw new Error(`Missing prompt/model lineage schema definition ${name}.`);
  schemaValidators.set(name, validator);
}

function fail(
  reasonCode: PromptModelLineageReasonCodeV1,
  message: string,
): never {
  throw new PromptModelLineageErrorV1(reasonCode, message);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}

export function canonicalPromptModelJsonV1(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function promptModelSha256V1(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedUtf8(text: string) {
  return Buffer.from(text.replace(/\r\n?/g, "\n"), "utf8");
}

export function promptArtifactContentIdentityV1(
  artifact: Pick<PromptArtifactV1, "content">,
) {
  const bytes =
    artifact.content.storage === "approved_reusable_content"
      ? normalizedUtf8(artifact.content.text)
      : Buffer.from(
          canonicalPromptModelJsonV1({
            orderedArtifactIds: artifact.content.orderedArtifactIds,
            compiler: artifact.content.compiler,
          }),
          "utf8",
        );
  return {
    contentHash: promptModelSha256V1(bytes),
    byteLength: bytes.byteLength,
  } as const;
}

export function compositePromptManifestHashV1(
  promptArtifactIds: readonly string[],
  compiler: CompilerIdentityV1,
) {
  return promptModelSha256V1(
    canonicalPromptModelJsonV1({ promptArtifactIds, compiler }),
  );
}

export function attemptEvidenceSnapshotHashV1(
  binding: Omit<
    AttemptConfigurationBindingV1,
    | "contractType"
    | "contractVersion"
    | "bindingId"
    | "boundBy"
    | "reason"
    | "boundAt"
    | "publicationSequence"
    | "evidenceSnapshotHash"
  >,
) {
  return promptModelSha256V1(canonicalPromptModelJsonV1(binding));
}

export function scopedInputFingerprintV1(
  scopeId: string,
  renderedInput: string,
) {
  return {
    algorithm: "scoped-sha256" as const,
    scopeId,
    value: promptModelSha256V1(`${scopeId}\u0000${renderedInput}`),
  };
}

function assertUtcInstant(value: string, field: string) {
  if (
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    fail("SCHEMA_INVALID", `${field} must be a canonical UTC instant.`);
}

export function assertPromptModelSchemaV1<T>(
  schemaName:
    | "PromptArtifactV1"
    | "ModelRouteV1"
    | "AttemptConfigurationBindingV1"
    | "ResolvedModelExecutionV1"
    | "PromptModelLineageEventV1",
  value: unknown,
): asserts value is T {
  const validator = schemaValidators.get(schemaName)!;
  if (!validator(value))
    fail(
      "SCHEMA_INVALID",
      `${schemaName} failed schema validation: ${ajv.errorsText(validator.errors, { separator: "; " })}`,
    );
}

const prohibitedKeys = new Set([
  "renderedPrompt",
  "secret",
  "secrets",
  "credentials",
  "environment",
  "environmentValues",
  "unrelatedFileContents",
  "hiddenReasoning",
  "providerHiddenReasoning",
  "rawProviderPayload",
  "providerPayload",
]);

const sensitiveTextPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:api[_-]?key|client[_-]?secret|password|passwd)\s*[:=]\s*\S+/i,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/,
];

function containsProhibitedShape(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProhibitedShape);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => prohibitedKeys.has(key) || containsProhibitedShape(child),
  );
}

export function assertPromptPrivacyV1(artifact: PromptArtifactV1) {
  if (containsProhibitedShape(artifact))
    fail(
      "PROMPT_PRIVACY_VIOLATION",
      "Prompt artifact contains a prohibited sensitive-content field.",
    );
  const content = artifact.content;
  if (
    content.storage === "approved_reusable_content" &&
    sensitiveTextPatterns.some((pattern) => pattern.test(content.text))
  )
    fail(
      "PROMPT_PRIVACY_VIOLATION",
      "Prompt artifact content resembles a secret or credential.",
    );
}

function assertArtifactSemantics(artifact: PromptArtifactV1) {
  assertUtcInstant(artifact.publishedAt, "publishedAt");
  assertUtcInstant(
    artifact.privacy.validationReceipt.validatedAt,
    "privacy.validationReceipt.validatedAt",
  );
  const identity = promptArtifactContentIdentityV1(artifact);
  if (
    identity.contentHash !== artifact.contentHash ||
    identity.byteLength !== artifact.byteLength
  )
    fail(
      "PROMPT_CONTENT_HASH_MISMATCH",
      `Prompt artifact ${artifact.promptArtifactId} content identity does not match its canonical bytes.`,
    );
  assertPromptPrivacyV1(artifact);
}

function bindingAttemptKey(binding: AttemptConfigurationBindingV1) {
  return [
    binding.projectId,
    binding.changeId,
    binding.waveId,
    binding.taskId,
    binding.runId,
    binding.attemptId,
  ].join("\u0000");
}

function bindingInvocationKey(binding: AttemptConfigurationBindingV1) {
  return `${bindingAttemptKey(binding)}\u0000${binding.invocationId ?? ""}`;
}

function exactBindingIdentity(
  left: AttemptConfigurationBindingV1,
  right: AttemptConfigurationBindingV1,
) {
  return (
    left.projectId === right.projectId &&
    left.changeId === right.changeId &&
    left.waveId === right.waveId &&
    left.taskId === right.taskId &&
    left.runId === right.runId &&
    left.attemptId === right.attemptId
  );
}

function assertEventScope(
  event: PromptModelLineageEventV1,
  context: PromptModelReplayContextV1,
) {
  if (!context.hasChange(event.changeId))
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Lineage event ${event.id} references an unknown change.`,
    );
  if (
    event.waveId !== undefined &&
    !context.hasWave(event.changeId, event.waveId)
  )
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Lineage event ${event.id} references an unknown wave.`,
    );
  if (
    event.taskId !== undefined &&
    (event.waveId === undefined ||
      !context.hasTask(event.changeId, event.waveId, event.taskId))
  )
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Lineage event ${event.id} references an unknown task.`,
    );
}

function assertNoDerivationCycle(
  artifact: PromptArtifactV1,
  projection: MutablePromptModelLineageProjectionV1,
) {
  const visit = (artifactId: string, seen: Set<string>) => {
    if (artifactId === artifact.promptArtifactId)
      fail(
        "PROMPT_DERIVATION_CYCLE",
        `Prompt artifact ${artifact.promptArtifactId} creates a derivation cycle.`,
      );
    if (seen.has(artifactId)) return;
    seen.add(artifactId);
    const parent = projection.promptArtifacts.get(artifactId)?.artifact;
    if (parent)
      for (const parentId of parent.parentArtifactIds) visit(parentId, seen);
  };
  for (const parentId of artifact.parentArtifactIds)
    visit(parentId, new Set<string>());
}

function assertSupersessionChain(
  entityId: string,
  supersedesId: string | undefined,
  lookup: (id: string) => string | undefined,
) {
  if (!supersedesId) return;
  let current: string | undefined = supersedesId;
  const seen = new Set([entityId]);
  while (current) {
    if (seen.has(current))
      fail(
        "PROMPT_SUPERSESSION_INVALID",
        `Entity ${entityId} creates an invalid supersession cycle.`,
      );
    seen.add(current);
    current = lookup(current);
  }
}

function assertBindingSemantics(
  binding: AttemptConfigurationBindingV1,
  event: PromptModelLineageEventV1,
  projection: MutablePromptModelLineageProjectionV1,
  context: PromptModelReplayContextV1,
) {
  if (
    binding.projectId !== event.projectId ||
    binding.changeId !== event.changeId ||
    binding.waveId !== event.waveId ||
    binding.taskId !== event.taskId
  )
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Binding ${binding.bindingId} disagrees with its event scope.`,
    );
  if (
    binding.boundBy !== event.actor ||
    binding.boundAt !== event.occurredAt ||
    binding.publicationSequence !== event.sequence
  )
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Binding ${binding.bindingId} disagrees with its publisher event.`,
    );
  const plan = context.planIdentity(
    binding.changeId,
    binding.waveId,
    binding.plan.planId,
    binding.plan.revision,
  );
  if (
    !plan ||
    plan.planBaseSha !== binding.plan.planBaseSha ||
    plan.authorizationId !== binding.authorizationId ||
    plan.status !== "dispatched" ||
    binding.workspace.baseSha !== binding.plan.planBaseSha
  )
    fail(
      "ATTEMPT_BINDING_STALE",
      `Binding ${binding.bindingId} does not match the exact dispatched plan, authorization, and workspace base.`,
    );
  for (const artifactId of binding.promptArtifactIds) {
    const published = projection.promptArtifacts.get(artifactId);
    if (!published)
      fail(
        "PROMPT_ARTIFACT_UNKNOWN",
        `Binding ${binding.bindingId} references unknown prompt artifact ${artifactId}.`,
      );
    if (published.status === "revoked")
      fail(
        "PROMPT_ARTIFACT_REVOKED",
        `Binding ${binding.bindingId} references revoked prompt artifact ${artifactId}.`,
      );
    assertArtifactSemantics(published.artifact);
  }
  if (
    binding.compositeManifestHash !==
    compositePromptManifestHashV1(binding.promptArtifactIds, binding.compiler)
  )
    fail(
      "PROMPT_CONTENT_HASH_MISMATCH",
      `Binding ${binding.bindingId} has a mismatched composite manifest hash.`,
    );
  const route = projection.modelRoutes.get(binding.modelRouteId);
  if (!route)
    fail(
      "MODEL_ROUTE_UNKNOWN",
      `Binding ${binding.bindingId} references unknown model route ${binding.modelRouteId}.`,
    );
  if (route.status === "revoked")
    fail(
      "MODEL_ROUTE_REVOKED",
      `Binding ${binding.bindingId} references revoked model route ${binding.modelRouteId}.`,
    );
  if (
    canonicalPromptModelJsonV1(binding.expectedRuntime) !==
    canonicalPromptModelJsonV1(route.route.requiredCapabilities)
  )
    fail(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `Binding ${binding.bindingId} expects capabilities outside its route.`,
    );
  const snapshotInput = {
    bindingScope: binding.bindingScope,
    role: binding.role,
    projectId: binding.projectId,
    changeId: binding.changeId,
    waveId: binding.waveId,
    taskId: binding.taskId,
    runId: binding.runId,
    attemptId: binding.attemptId,
    ...(binding.invocationId ? { invocationId: binding.invocationId } : {}),
    ...(binding.parentAttemptBindingId
      ? { parentAttemptBindingId: binding.parentAttemptBindingId }
      : {}),
    plan: binding.plan,
    authorizationId: binding.authorizationId,
    workspace: binding.workspace,
    promptArtifactIds: binding.promptArtifactIds,
    compositeManifestHash: binding.compositeManifestHash,
    compiler: binding.compiler,
    inputSchemaVersion: binding.inputSchemaVersion,
    inputFingerprint: binding.inputFingerprint,
    modelRouteId: binding.modelRouteId,
    expectedRuntime: binding.expectedRuntime,
  } as const;
  if (attemptEvidenceSnapshotHashV1(snapshotInput) !== binding.evidenceSnapshotHash)
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Binding ${binding.bindingId} has a mismatched evidence snapshot hash.`,
    );
  if (binding.bindingScope === "attempt") {
    if (projection.attemptBindingIds.has(bindingAttemptKey(binding)))
      fail(
        "ATTEMPT_BINDING_CONFLICT",
        `Attempt ${binding.attemptId} already has an effective configuration binding.`,
      );
  } else {
    const parent = projection.bindings.get(binding.parentAttemptBindingId!);
    if (
      !parent ||
      parent.bindingScope !== "attempt" ||
      !exactBindingIdentity(parent, binding)
    )
      fail(
        "CROSS_ENTITY_IDENTITY_MISMATCH",
        `Invocation binding ${binding.bindingId} has no exact parent attempt binding.`,
      );
    if (projection.invocationBindingIds.has(bindingInvocationKey(binding)))
      fail(
        "ATTEMPT_BINDING_CONFLICT",
        `Invocation ${binding.invocationId} already has a configuration binding.`,
      );
  }
}

function assertResolutionSemantics(
  resolution: ResolvedModelExecutionV1,
  event: PromptModelLineageEventV1,
  projection: MutablePromptModelLineageProjectionV1,
) {
  const binding = projection.bindings.get(resolution.bindingId);
  if (!binding)
    fail(
      "ATTEMPT_BINDING_MISSING",
      `Resolution ${resolution.resolutionId} has no configuration binding.`,
    );
  if (
    resolution.projectId !== event.projectId ||
    resolution.changeId !== event.changeId ||
    resolution.waveId !== event.waveId ||
    resolution.taskId !== event.taskId ||
    resolution.projectId !== binding.projectId ||
    resolution.changeId !== binding.changeId ||
    resolution.waveId !== binding.waveId ||
    resolution.taskId !== binding.taskId ||
    resolution.runId !== binding.runId ||
    resolution.attemptId !== binding.attemptId ||
    resolution.invocationId !== binding.invocationId ||
    resolution.modelRouteId !== binding.modelRouteId
  )
    fail(
      "MODEL_RESOLUTION_MISMATCH",
      `Resolution ${resolution.resolutionId} disagrees with its exact binding identity.`,
    );
  if (projection.resolutionIdsByBinding.has(binding.bindingId))
    fail(
      "MODEL_RESOLUTION_MISMATCH",
      `Binding ${binding.bindingId} already has a resolved execution.`,
    );
  const publishedRoute = projection.modelRoutes.get(binding.modelRouteId);
  if (!publishedRoute)
    fail("MODEL_ROUTE_UNKNOWN", "Resolved execution references an unknown route.");
  if (publishedRoute.status === "revoked")
    fail("MODEL_ROUTE_REVOKED", "Resolved execution references a revoked route.");
  const route = publishedRoute.route;
  const adapterAllowed = route.allowedProviderAdapters.some(
    (candidate) =>
      candidate.providerId === resolution.providerId &&
      candidate.adapterId === resolution.providerAdapterId &&
      candidate.adapterVersion === resolution.providerAdapterVersion,
  );
  if (
    !adapterAllowed ||
    resolution.runtimeId !== binding.expectedRuntime.runtimeId ||
    resolution.toolRoute !== binding.expectedRuntime.toolRoute ||
    resolution.capabilityMapVersion !==
      binding.expectedRuntime.capabilityMapVersion ||
    resolution.reasoningLevel !== route.reasoningLevel
  )
    fail(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `Resolution ${resolution.resolutionId} is not capability-compatible with its route.`,
    );
  const explicitMismatch =
    route.requestedModelClass !== "auto" &&
    resolution.resolvedModelClass !== route.requestedModelClass;
  const knownModelRanks: Readonly<Record<string, number>> = {
    luna: 0,
    terra: 1,
    sol: 2,
  };
  const minimumRank = knownModelRanks[route.minimumModelClass];
  const resolvedRank = knownModelRanks[resolution.resolvedModelClass];
  if (
    minimumRank !== undefined &&
    (resolvedRank === undefined || resolvedRank < minimumRank)
  )
    fail(
      "MODEL_CAPABILITY_UNSUPPORTED",
      `Resolution ${resolution.resolutionId} is below the route minimum model class.`,
    );
  if (explicitMismatch && !resolution.fallback.used)
    fail(
      "MODEL_RESOLUTION_MISMATCH",
      `Resolution ${resolution.resolutionId} changed the requested model without a fallback record.`,
    );
  if (resolution.fallback.used) {
    if (
      route.fallbackPolicy.mode !== "permitted" ||
      resolution.fallback.sourceModelClass !== route.requestedModelClass ||
      !route.fallbackPolicy.allowedResolvedModelClasses.includes(
        resolution.resolvedModelClass,
      ) ||
      !route.fallbackPolicy.allowedReasonCodes.includes(
        resolution.fallback.reasonCode,
      )
    )
      fail(
        "MODEL_FALLBACK_NOT_PERMITTED",
        `Resolution ${resolution.resolutionId} uses an unpermitted fallback.`,
      );
  }
  assertUtcInstant(resolution.startedAt, "startedAt");
}

export function createPromptModelLineageProjectionV1(
  projectId: string,
): MutablePromptModelLineageProjectionV1 {
  return {
    projectId,
    promptArtifacts: new Map(),
    modelRoutes: new Map(),
    bindings: new Map(),
    attemptBindingIds: new Map(),
    invocationBindingIds: new Map(),
    resolvedExecutions: new Map(),
    resolutionIdsByBinding: new Map(),
    occurrenceEvents: new Map(),
    events: [],
  };
}

export function applyPromptModelLineageEventV1(
  eventValue: unknown,
  projection: MutablePromptModelLineageProjectionV1,
  context: PromptModelReplayContextV1,
) {
  assertPromptModelSchemaV1<PromptModelLineageEventV1>(
    "PromptModelLineageEventV1",
    eventValue,
  );
  const event = eventValue as PromptModelLineageEventV1;
  if (event.projectId !== projection.projectId)
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Lineage event ${event.id} belongs to another project.`,
    );
  assertUtcInstant(event.occurredAt, "occurredAt");
  assertEventScope(event, context);
  const occurrenceId = event.payload.publisherOccurrenceId;
  if (projection.occurrenceEvents.has(occurrenceId))
    fail(
      "PUBLISHER_OCCURRENCE_CONFLICT",
      `Duplicate publisher occurrence ${occurrenceId} was appended.`,
    );

  if (event.type === "prompt.artifact-published") {
    const artifact = event.payload.artifact!;
    assertPromptModelSchemaV1<PromptArtifactV1>("PromptArtifactV1", artifact);
    assertArtifactSemantics(artifact);
    if (
      event.waveId !== undefined ||
      event.taskId !== undefined ||
      artifact.publishedBy !== event.actor ||
      artifact.publishedAt !== event.occurredAt ||
      projection.promptArtifacts.has(artifact.promptArtifactId)
    )
      fail(
        "CROSS_ENTITY_IDENTITY_MISMATCH",
        `Prompt publication ${artifact.promptArtifactId} has conflicting immutable identity.`,
      );
    assertNoDerivationCycle(artifact, projection);
    for (const parentId of artifact.parentArtifactIds)
      if (!projection.promptArtifacts.has(parentId))
        fail(
          "PROMPT_ARTIFACT_UNKNOWN",
          `Prompt artifact ${artifact.promptArtifactId} has unknown parent ${parentId}.`,
        );
    if (artifact.supersedesId) {
      const prior = projection.promptArtifacts.get(artifact.supersedesId);
      if (!prior || prior.artifact.artifactKind !== artifact.artifactKind)
        fail(
          "PROMPT_SUPERSESSION_INVALID",
          `Prompt artifact ${artifact.promptArtifactId} has an invalid supersedesId.`,
        );
    }
    assertSupersessionChain(
      artifact.promptArtifactId,
      artifact.supersedesId,
      (id) => projection.promptArtifacts.get(id)?.artifact.supersedesId,
    );
    projection.promptArtifacts.set(artifact.promptArtifactId, {
      artifact,
      status: "published",
      publishedSequence: event.sequence,
    });
  } else if (event.type === "prompt.artifact-revoked") {
    const revocation = event.payload.revocation!;
    const current = projection.promptArtifacts.get(revocation.entityId);
    if (!current)
      fail("PROMPT_ARTIFACT_UNKNOWN", "Cannot revoke an unknown prompt artifact.");
    if (
      current.status === "revoked" ||
      revocation.revokedBy !== event.actor ||
      revocation.revokedAt !== event.occurredAt ||
      event.waveId !== undefined ||
      event.taskId !== undefined
    )
      fail(
        "PROMPT_SUPERSESSION_INVALID",
        `Prompt revocation ${revocation.entityId} is not a valid terminal transition.`,
      );
    projection.promptArtifacts.set(revocation.entityId, {
      ...current,
      status: "revoked",
      revocation,
    });
  } else if (event.type === "model.route-published") {
    const route = event.payload.route!;
    assertPromptModelSchemaV1<ModelRouteV1>("ModelRouteV1", route);
    if (
      event.waveId !== undefined ||
      event.taskId !== undefined ||
      route.publishedBy !== event.actor ||
      route.publishedAt !== event.occurredAt ||
      projection.modelRoutes.has(route.modelRouteId)
    )
      fail(
        "CROSS_ENTITY_IDENTITY_MISMATCH",
        `Model route ${route.modelRouteId} has conflicting immutable identity.`,
      );
    assertUtcInstant(route.publishedAt, "publishedAt");
    if (route.supersedesId && !projection.modelRoutes.has(route.supersedesId))
      fail(
        "PROMPT_SUPERSESSION_INVALID",
        `Model route ${route.modelRouteId} has an invalid supersedesId.`,
      );
    assertSupersessionChain(
      route.modelRouteId,
      route.supersedesId,
      (id) => projection.modelRoutes.get(id)?.route.supersedesId,
    );
    projection.modelRoutes.set(route.modelRouteId, {
      route,
      status: "published",
      publishedSequence: event.sequence,
    });
  } else if (event.type === "model.route-revoked") {
    const revocation = event.payload.revocation!;
    const current = projection.modelRoutes.get(revocation.entityId);
    if (!current)
      fail("MODEL_ROUTE_UNKNOWN", "Cannot revoke an unknown model route.");
    if (
      current.status === "revoked" ||
      revocation.revokedBy !== event.actor ||
      revocation.revokedAt !== event.occurredAt ||
      event.waveId !== undefined ||
      event.taskId !== undefined
    )
      fail(
        "PROMPT_SUPERSESSION_INVALID",
        `Model route revocation ${revocation.entityId} is invalid.`,
      );
    projection.modelRoutes.set(revocation.entityId, {
      ...current,
      status: "revoked",
      revocation,
    });
  } else if (
    event.type === "attempt.configuration-bound" ||
    event.type === "invocation.configuration-bound"
  ) {
    const binding = event.payload.binding!;
    assertPromptModelSchemaV1<AttemptConfigurationBindingV1>(
      "AttemptConfigurationBindingV1",
      binding,
    );
    if (
      (event.type === "attempt.configuration-bound") !==
        (binding.bindingScope === "attempt") ||
      projection.bindings.has(binding.bindingId)
    )
      fail(
        "ATTEMPT_BINDING_CONFLICT",
        `Binding ${binding.bindingId} has a conflicting event type or identity.`,
      );
    assertBindingSemantics(binding, event, projection, context);
    projection.bindings.set(binding.bindingId, binding);
    if (binding.bindingScope === "attempt")
      projection.attemptBindingIds.set(bindingAttemptKey(binding), binding.bindingId);
    else
      projection.invocationBindingIds.set(
        bindingInvocationKey(binding),
        binding.bindingId,
      );
  } else {
    const resolution = event.payload.resolution!;
    assertPromptModelSchemaV1<ResolvedModelExecutionV1>(
      "ResolvedModelExecutionV1",
      resolution,
    );
    if (projection.resolvedExecutions.has(resolution.resolutionId))
      fail(
        "MODEL_RESOLUTION_MISMATCH",
        `Resolved execution ${resolution.resolutionId} is duplicated.`,
      );
    assertResolutionSemantics(resolution, event, projection);
    projection.resolvedExecutions.set(resolution.resolutionId, resolution);
    projection.resolutionIdsByBinding.set(
      resolution.bindingId,
      resolution.resolutionId,
    );
  }

  projection.occurrenceEvents.set(occurrenceId, event);
  projection.events.push(event);
  return event;
}

function cloneFrozen<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown) => {
    if (candidate && typeof candidate === "object" && !Object.isFrozen(candidate)) {
      Object.freeze(candidate);
      for (const child of Object.values(candidate as Record<string, unknown>))
        freeze(child);
    }
  };
  freeze(clone);
  return clone;
}

export function immutablePromptModelLineageProjectionV1(
  projection: MutablePromptModelLineageProjectionV1,
): PromptModelLineageProjectionV1 {
  return cloneFrozen({
    projectId: projection.projectId,
    promptArtifacts: [...projection.promptArtifacts.values()].sort(
      (left, right) => left.publishedSequence - right.publishedSequence,
    ),
    modelRoutes: [...projection.modelRoutes.values()].sort(
      (left, right) => left.publishedSequence - right.publishedSequence,
    ),
    bindings: [...projection.bindings.values()].sort(
      (left, right) => left.publicationSequence - right.publicationSequence,
    ),
    resolvedExecutions: [...projection.resolvedExecutions.values()],
    events: projection.events,
  });
}

export type AssertAttemptDispatchInputV1 = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  runId: string;
  attemptId: string;
  plan: Readonly<{ planId: string; revision: number; planBaseSha: string }>;
  authorizationId: string;
  workspace: Readonly<{
    workspaceAttemptId: string;
    repositoryId: string;
    baseSha: string;
  }>;
}>;

export function assertAttemptConfigurationDispatchableV1(
  projection: MutablePromptModelLineageProjectionV1,
  context: PromptModelReplayContextV1,
  input: AssertAttemptDispatchInputV1,
) {
  const key = [
    input.projectId,
    input.changeId,
    input.waveId,
    input.taskId,
    input.runId,
    input.attemptId,
  ].join("\u0000");
  const bindingId = projection.attemptBindingIds.get(key);
  if (!bindingId)
    fail(
      "ATTEMPT_BINDING_MISSING",
      `Attempt ${input.attemptId} has no effective configuration binding.`,
    );
  const binding = projection.bindings.get(bindingId)!;
  if (
    canonicalPromptModelJsonV1(binding.plan) !==
      canonicalPromptModelJsonV1(input.plan) ||
    binding.authorizationId !== input.authorizationId ||
    canonicalPromptModelJsonV1(binding.workspace) !==
      canonicalPromptModelJsonV1(input.workspace)
  )
    fail(
      "CROSS_ENTITY_IDENTITY_MISMATCH",
      `Attempt ${input.attemptId} no longer matches its binding identity.`,
    );
  const plan = context.planIdentity(
    input.changeId,
    input.waveId,
    input.plan.planId,
    input.plan.revision,
  );
  if (
    !plan ||
    plan.status !== "dispatched" ||
    plan.planBaseSha !== input.plan.planBaseSha ||
    plan.authorizationId !== input.authorizationId
  )
    fail(
      "ATTEMPT_BINDING_STALE",
      `Attempt ${input.attemptId} has stale plan or authorization evidence.`,
    );
  for (const artifactId of binding.promptArtifactIds) {
    const artifact = projection.promptArtifacts.get(artifactId);
    if (!artifact)
      fail("PROMPT_ARTIFACT_UNKNOWN", `Unknown prompt artifact ${artifactId}.`);
    if (artifact.status === "revoked")
      fail("PROMPT_ARTIFACT_REVOKED", `Revoked prompt artifact ${artifactId}.`);
    assertArtifactSemantics(artifact.artifact);
  }
  const route = projection.modelRoutes.get(binding.modelRouteId);
  if (!route) fail("MODEL_ROUTE_UNKNOWN", "Attempt binding route is unknown.");
  if (route.status === "revoked")
    fail("MODEL_ROUTE_REVOKED", "Attempt binding route is revoked.");
  return binding;
}

export function assertInvocationConfigurationDispatchableV1(
  projection: MutablePromptModelLineageProjectionV1,
  context: PromptModelReplayContextV1,
  input: AssertAttemptDispatchInputV1 & Readonly<{ invocationId: string }>,
) {
  assertAttemptConfigurationDispatchableV1(projection, context, input);
  const attemptKey = [
    input.projectId,
    input.changeId,
    input.waveId,
    input.taskId,
    input.runId,
    input.attemptId,
  ].join("\u0000");
  const bindingId = projection.invocationBindingIds.get(
    `${attemptKey}\u0000${input.invocationId}`,
  );
  if (!bindingId)
    fail(
      "INVOCATION_BINDING_MISSING",
      `Invocation ${input.invocationId} has no effective configuration binding.`,
    );
  return projection.bindings.get(bindingId)!;
}

export function duplicatePublisherEventV1(
  projection: MutablePromptModelLineageProjectionV1,
  occurrenceId: string,
  type: PromptModelLineageEventTypeV1,
  payloadWithoutOccurrence: Record<string, unknown>,
) {
  const existing = projection.occurrenceEvents.get(occurrenceId);
  if (!existing) return undefined;
  const expected = { publisherOccurrenceId: occurrenceId, ...payloadWithoutOccurrence };
  if (
    existing.type !== type ||
    canonicalPromptModelJsonV1(existing.payload) !==
      canonicalPromptModelJsonV1(expected)
  )
    fail(
      "PUBLISHER_OCCURRENCE_CONFLICT",
      `Publisher occurrence ${occurrenceId} is already bound to different content.`,
    );
  return existing;
}
