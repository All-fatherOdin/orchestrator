import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import schema from "./schemas/tool-capabilities-v1.schema.json";
import productionManifestJson from "./tool-capability-manifest-v1.json";

export const TOOL_CAPABILITY_CONTRACT_VERSION_V1 = "1.0" as const;

export type ToolCapabilityReasonCodeV1 =
  | "TOOL_CAPABILITY_ALLOWED"
  | "TOOL_CAPABILITY_MANIFEST_INVALID"
  | "TOOL_CAPABILITY_MANIFEST_CHANGED"
  | "TOOL_CAPABILITY_UNKNOWN_HIGH_RISK"
  | "TOOL_CAPABILITY_UNSUPPORTED_BOUNDARY"
  | "TOOL_CAPABILITY_DIRECT_ONLY"
  | "TOOL_CAPABILITY_CHAIN_TOO_LARGE"
  | "TOOL_CAPABILITY_LETHAL_TRIFECTA"
  | "TOOL_CAPABILITY_EXTERNAL_WRITE_DENIED"
  | "TOOL_CAPABILITY_WRITE_CREDENTIAL_DENIED"
  | "TOOL_CAPABILITY_MUTATION_COMPOSITION_DENIED"
  | "TOOL_CAPABILITY_ACCEPTED_PATH_REQUIRED"
  | "TOOL_CAPABILITY_ACCEPTED_PATH_MISMATCH"
  | "TOOL_CAPABILITY_OWNING_EVIDENCE_MISSING"
  | "TOOL_CAPABILITY_REPLAY_INVALID";

export class ToolCapabilityErrorV1 extends Error {
  constructor(readonly reasonCode: ToolCapabilityReasonCodeV1, message: string) {
    super(message);
    this.name = "ToolCapabilityErrorV1";
  }
}

export type ToolCapabilityEntryV1 = Readonly<{
  toolId: string;
  owner:
    | "context-router"
    | "warden-doctor"
    | "operator-actions"
    | "github-deployment-connector"
    | "codex-cli";
  boundary:
    | "in_process"
    | "child_process"
    | "remote_http"
    | "opaque_child_internal";
  privateDataAccess: "none" | "bounded_local" | "credential_or_private";
  untrustedInput: "none" | "bounded_local" | "bounded_external";
  externalCommunication: "none" | "read_only" | "write";
  mutation:
    | "none"
    | "reversible_owned_local"
    | "destructive_owned_local"
    | "canonical_local"
    | "external";
  credentialUse: "none" | "server_read_only" | "write_capable";
  isolation:
    | "in_process_validated"
    | "read_only_subprocess"
    | "owned_workspace"
    | "fixed_remote_read"
    | "unsupported";
  chainMode: "composable" | "direct_only" | "unsupported";
  owningGate: string;
}>;

export type AcceptedToolExecutionPathV1 = Readonly<{
  pathId: string;
  contractRef: string;
  allowedToolIds: readonly string[];
  requiredIsolation: Exclude<ToolCapabilityEntryV1["isolation"], "unsupported">;
  requiredOwningGate: string;
}>;

export type ToolCapabilityManifestV1 = Readonly<{
  contractType: "ToolCapabilityManifestV1";
  contractVersion: "1.0";
  manifestId: "orchestrator-tool-capabilities-v1";
  manifestVersion: 1;
  entries: readonly ToolCapabilityEntryV1[];
  acceptedPaths: readonly AcceptedToolExecutionPathV1[];
}>;

export type ToolChainRequestV1 = Readonly<{
  contractType: "ToolChainRequestV1";
  contractVersion: "1.0";
  requestId: string;
  manifestId: "orchestrator-tool-capabilities-v1";
  manifestVersion: 1;
  manifestHash: string;
  toolIds: readonly string[];
  executionPathId?: string;
  owningEvidenceRefs: readonly string[];
}>;

export type ToolCapabilityUnionV1 = Readonly<{
  privateData: boolean;
  untrustedInput: boolean;
  externalCommunication: boolean;
  mutation: boolean;
  credentialUse: boolean;
  unsupportedBoundary: boolean;
}>;

export type ToolCapabilityDecisionV1 = Readonly<{
  contractType: "ToolCapabilityDecisionV1";
  contractVersion: "1.0";
  decisionId: string;
  requestId: string;
  requestHash: string;
  manifestId: "orchestrator-tool-capabilities-v1";
  manifestVersion: 1;
  manifestHash: string;
  toolIds: readonly string[];
  capabilityUnion: ToolCapabilityUnionV1;
  executionPathId?: string;
  disposition: "allow" | "reject" | "unsupported";
  reasonCodes: readonly ToolCapabilityReasonCodeV1[];
  owningEvidenceRefs: readonly string[];
}>;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateContract = ajv.compile(schema);

export function canonicalToolCapabilityJsonV1(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalToolCapabilityJsonV1).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalToolCapabilityJsonV1(object[key])}`,
    )
    .join(",")}}`;
}

export function toolCapabilitySha256V1(value: unknown): string {
  return createHash("sha256")
    .update(
      typeof value === "string" || value instanceof Uint8Array
        ? value
        : canonicalToolCapabilityJsonV1(value),
    )
    .digest("hex");
}

function sortedUnique(values: readonly string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

export function assertToolCapabilityManifestV1(
  value: unknown,
): asserts value is ToolCapabilityManifestV1 {
  if (
    !validateContract(value) ||
    (value as { contractType?: string })?.contractType !==
      "ToolCapabilityManifestV1"
  )
    throw new ToolCapabilityErrorV1(
      "TOOL_CAPABILITY_MANIFEST_INVALID",
      "Tool capability manifest does not match its closed schema.",
    );
  const manifest = value as ToolCapabilityManifestV1;
  const toolIds = manifest.entries.map((entry) => entry.toolId);
  const pathIds = manifest.acceptedPaths.map((path) => path.pathId);
  if (
    new Set(toolIds).size !== toolIds.length ||
    new Set(pathIds).size !== pathIds.length ||
    canonicalToolCapabilityJsonV1(toolIds) !==
      canonicalToolCapabilityJsonV1(sortedUnique(toolIds)) ||
    canonicalToolCapabilityJsonV1(pathIds) !==
      canonicalToolCapabilityJsonV1(sortedUnique(pathIds))
  )
    throw new ToolCapabilityErrorV1(
      "TOOL_CAPABILITY_MANIFEST_INVALID",
      "Tool capability manifest identities must be unique and canonically sorted.",
    );
  const byId = new Map(manifest.entries.map((entry) => [entry.toolId, entry]));
  for (const path of manifest.acceptedPaths) {
    if (
      new Set(path.allowedToolIds).size !== path.allowedToolIds.length ||
      path.allowedToolIds.some((toolId) => !byId.has(toolId)) ||
      path.allowedToolIds.some((toolId) => {
        const entry = byId.get(toolId)!;
        return (
          entry.isolation !== path.requiredIsolation ||
          entry.owningGate !== path.requiredOwningGate
        );
      })
    )
      throw new ToolCapabilityErrorV1(
        "TOOL_CAPABILITY_MANIFEST_INVALID",
        "Accepted tool path does not bind exact manifest entries and isolation.",
      );
  }
}

export function toolCapabilityManifestHashV1(
  manifest: ToolCapabilityManifestV1,
) {
  assertToolCapabilityManifestV1(manifest);
  return toolCapabilitySha256V1(manifest);
}

export const TOOL_CAPABILITY_MANIFEST_V1 = (() => {
  assertToolCapabilityManifestV1(productionManifestJson);
  return Object.freeze(
    structuredClone(productionManifestJson),
  ) as ToolCapabilityManifestV1;
})();

export const TOOL_CAPABILITY_MANIFEST_HASH_V1 =
  toolCapabilityManifestHashV1(TOOL_CAPABILITY_MANIFEST_V1);

export function createToolChainRequestV1(input: Readonly<{
  requestId: string;
  toolIds: readonly string[];
  executionPathId?: string;
  owningEvidenceRefs?: readonly string[];
  manifest?: ToolCapabilityManifestV1;
}>): ToolChainRequestV1 {
  const manifest = input.manifest ?? TOOL_CAPABILITY_MANIFEST_V1;
  assertToolCapabilityManifestV1(manifest);
  const request: ToolChainRequestV1 = Object.freeze({
    contractType: "ToolChainRequestV1",
    contractVersion: TOOL_CAPABILITY_CONTRACT_VERSION_V1,
    requestId: input.requestId,
    manifestId: manifest.manifestId,
    manifestVersion: manifest.manifestVersion,
    manifestHash: toolCapabilityManifestHashV1(manifest),
    toolIds: [...input.toolIds],
    ...(input.executionPathId
      ? { executionPathId: input.executionPathId }
      : {}),
    owningEvidenceRefs: sortedUnique(input.owningEvidenceRefs ?? []),
  });
  if (
    !validateContract(request) ||
    request.contractType !== "ToolChainRequestV1"
  )
    throw new ToolCapabilityErrorV1(
      request.toolIds.length > 16
        ? "TOOL_CAPABILITY_CHAIN_TOO_LARGE"
        : "TOOL_CAPABILITY_REPLAY_INVALID",
      "Tool chain request does not match its closed schema.",
    );
  return request;
}

function capabilityUnionV1(
  entries: readonly ToolCapabilityEntryV1[],
): ToolCapabilityUnionV1 {
  return Object.freeze({
    privateData: entries.some(
      (entry) =>
        entry.privateDataAccess !== "none" || entry.credentialUse !== "none",
    ),
    untrustedInput: entries.some((entry) => entry.untrustedInput !== "none"),
    externalCommunication: entries.some(
      (entry) => entry.externalCommunication !== "none",
    ),
    mutation: entries.some((entry) => entry.mutation !== "none"),
    credentialUse: entries.some((entry) => entry.credentialUse !== "none"),
    unsupportedBoundary: entries.some(
      (entry) =>
        entry.chainMode === "unsupported" || entry.isolation === "unsupported",
    ),
  });
}

function acceptedPathMatchesV1(
  manifest: ToolCapabilityManifestV1,
  request: ToolChainRequestV1,
  entries: readonly ToolCapabilityEntryV1[],
) {
  if (!request.executionPathId) return false;
  const path = manifest.acceptedPaths.find(
    (candidate) => candidate.pathId === request.executionPathId,
  );
  return Boolean(
    path &&
      canonicalToolCapabilityJsonV1(path.allowedToolIds) ===
        canonicalToolCapabilityJsonV1(request.toolIds) &&
      entries.every(
        (entry) =>
          entry.isolation === path.requiredIsolation &&
          entry.owningGate === path.requiredOwningGate,
      ),
  );
}

export function evaluateToolCapabilityChainV1(
  request: ToolChainRequestV1,
  manifest: ToolCapabilityManifestV1 = TOOL_CAPABILITY_MANIFEST_V1,
): ToolCapabilityDecisionV1 {
  assertToolCapabilityManifestV1(manifest);
  if (!validateContract(request) || request.contractType !== "ToolChainRequestV1")
    throw new ToolCapabilityErrorV1(
      "TOOL_CAPABILITY_REPLAY_INVALID",
      "Tool chain request does not match its closed schema.",
    );
  const manifestHash = toolCapabilityManifestHashV1(manifest);
  if (
    request.manifestId !== manifest.manifestId ||
    request.manifestVersion !== manifest.manifestVersion ||
    request.manifestHash !== manifestHash
  )
    throw new ToolCapabilityErrorV1(
      "TOOL_CAPABILITY_MANIFEST_CHANGED",
      "Tool chain request does not bind the exact manifest.",
    );
  const byId = new Map(manifest.entries.map((entry) => [entry.toolId, entry]));
  const entries = request.toolIds.flatMap((toolId) => {
    const entry = byId.get(toolId);
    return entry ? [entry] : [];
  });
  const union = capabilityUnionV1(entries);
  let disposition: ToolCapabilityDecisionV1["disposition"] = "allow";
  let reasonCodes: ToolCapabilityReasonCodeV1[] = ["TOOL_CAPABILITY_ALLOWED"];
  if (entries.length !== request.toolIds.length) {
    disposition = "reject";
    reasonCodes = ["TOOL_CAPABILITY_UNKNOWN_HIGH_RISK"];
  } else if (union.unsupportedBoundary) {
    disposition = "unsupported";
    reasonCodes = ["TOOL_CAPABILITY_UNSUPPORTED_BOUNDARY"];
  } else if (
    entries.some((entry) => entry.chainMode === "direct_only") &&
    (entries.length !== 1 || request.owningEvidenceRefs.length === 0)
  ) {
    disposition = "reject";
    reasonCodes = [
      entries.length !== 1
        ? "TOOL_CAPABILITY_DIRECT_ONLY"
        : "TOOL_CAPABILITY_OWNING_EVIDENCE_MISSING",
    ];
  } else if (
    entries.some((entry) => entry.externalCommunication === "write" || entry.mutation === "external")
  ) {
    disposition = "reject";
    reasonCodes = ["TOOL_CAPABILITY_EXTERNAL_WRITE_DENIED"];
  } else if (entries.some((entry) => entry.credentialUse === "write_capable")) {
    disposition = "reject";
    reasonCodes = ["TOOL_CAPABILITY_WRITE_CREDENTIAL_DENIED"];
  } else if (entries.length > 1 && union.mutation) {
    disposition = "reject";
    reasonCodes = ["TOOL_CAPABILITY_MUTATION_COMPOSITION_DENIED"];
  } else if (
    union.privateData &&
    union.untrustedInput &&
    union.externalCommunication
  ) {
    if (acceptedPathMatchesV1(manifest, request, entries)) {
      disposition = "allow";
      reasonCodes = ["TOOL_CAPABILITY_ALLOWED"];
    } else {
      disposition = "reject";
      reasonCodes = [
        request.executionPathId
          ? "TOOL_CAPABILITY_ACCEPTED_PATH_MISMATCH"
          : "TOOL_CAPABILITY_ACCEPTED_PATH_REQUIRED",
        "TOOL_CAPABILITY_LETHAL_TRIFECTA",
      ];
    }
  } else if (
    request.executionPathId &&
    !acceptedPathMatchesV1(manifest, request, entries)
  ) {
    disposition = "reject";
    reasonCodes = ["TOOL_CAPABILITY_ACCEPTED_PATH_MISMATCH"];
  }
  const requestHash = toolCapabilitySha256V1(request);
  const body = {
    contractType: "ToolCapabilityDecisionV1" as const,
    contractVersion: TOOL_CAPABILITY_CONTRACT_VERSION_V1,
    requestId: request.requestId,
    requestHash,
    manifestId: manifest.manifestId,
    manifestVersion: manifest.manifestVersion,
    manifestHash,
    toolIds: [...request.toolIds],
    capabilityUnion: union,
    ...(request.executionPathId
      ? { executionPathId: request.executionPathId }
      : {}),
    disposition,
    reasonCodes,
    owningEvidenceRefs: [...request.owningEvidenceRefs],
  };
  const decision: ToolCapabilityDecisionV1 = Object.freeze({
    ...body,
    decisionId: `tool-decision:${toolCapabilitySha256V1(body).slice(0, 40)}`,
  });
  if (!validateContract(decision))
    throw new ToolCapabilityErrorV1(
      "TOOL_CAPABILITY_REPLAY_INVALID",
      "Generated tool capability decision failed its closed schema.",
    );
  return decision;
}

export function assertToolCapabilityDecisionV1(
  value: unknown,
  manifest: ToolCapabilityManifestV1 = TOOL_CAPABILITY_MANIFEST_V1,
): asserts value is ToolCapabilityDecisionV1 {
  if (
    !validateContract(value) ||
    (value as { contractType?: string })?.contractType !==
      "ToolCapabilityDecisionV1"
  )
    throw new ToolCapabilityErrorV1(
      "TOOL_CAPABILITY_REPLAY_INVALID",
      "Tool capability decision does not match its closed schema.",
    );
  const decision = value as ToolCapabilityDecisionV1;
  const request = createToolChainRequestV1({
    requestId: decision.requestId,
    toolIds: decision.toolIds,
    executionPathId: decision.executionPathId,
    owningEvidenceRefs: decision.owningEvidenceRefs,
    manifest,
  });
  const expected = evaluateToolCapabilityChainV1(request, manifest);
  if (
    canonicalToolCapabilityJsonV1(decision) !==
    canonicalToolCapabilityJsonV1(expected)
  )
    throw new ToolCapabilityErrorV1(
      "TOOL_CAPABILITY_REPLAY_INVALID",
      "Tool capability decision identity or semantics changed.",
    );
}

export function allowRegisteredToolV1(input: Readonly<{
  requestId: string;
  toolId: string;
  owningEvidenceRefs: readonly string[];
  executionPathId?: string;
}>) {
  const decision = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: input.requestId,
      toolIds: [input.toolId],
      owningEvidenceRefs: input.owningEvidenceRefs,
      executionPathId: input.executionPathId,
    }),
  );
  if (decision.disposition !== "allow")
    throw new ToolCapabilityErrorV1(
      decision.reasonCodes[0] ?? "TOOL_CAPABILITY_REPLAY_INVALID",
      `Registered tool ${input.toolId} is not allowed by S4.`,
    );
  return decision;
}
