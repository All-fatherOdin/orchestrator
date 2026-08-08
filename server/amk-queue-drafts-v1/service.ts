import { resolve } from "node:path";
import Ajv2020 from "ajv8/dist/2020.js";
import { amkProjectIdV1 } from "../amk-project-artifacts-v2/run-source.ts";
import discoveryV1Schema from "./schemas/discovery-v1.schema.json";
import {
  AMK_QUEUE_DRAFT_LIMITS_V1,
  AmkQueueDraftError,
  createAmkQueueDraftTargetDescriptorV1,
  createAmkQueueDraftV1,
  type AmkQueueDraftProjectV1,
  type AmkQueueDraftResponseV1,
  type AmkQueueDraftTargetDescriptorV1,
  type QueueValidatorV1,
} from "./mapper.ts";

const MAX_TARGETS = 100;
const TARGET_ID = /^PROJECT-[a-f0-9]{64}$/;
const REQUEST_FIELDS = new Set([
  "contractType",
  "contractVersion",
  "targetId",
  "targetHash",
  "targetWatermark",
  "sourceHash",
  "sourceByteLength",
  "sourceWatermark",
  "artifact",
  "mappings",
]);

type ModelV1 = "luna" | "terra" | "sol";
type EffortV1 = "light" | "medium" | "high";

export type AmkQueueDraftConfiguredProjectV1 = Readonly<{
  id: string;
  name: string;
  path: string;
  defaultModel: ModelV1;
  defaultEffort: EffortV1;
  allowedModels: readonly ModelV1[];
}>;

export type AmkQueueDraftPublicTargetV1 = Readonly<{
  targetId: string;
  targetHash: string;
  targetWatermark: string;
  name: string;
  defaultModel: ModelV1;
  defaultEffort: EffortV1;
  allowedModels: readonly ModelV1[];
}>;

export type AmkQueueDraftDiscoveryV1 = Readonly<{
  contractType: "AmkQueueDraftDiscoveryV1";
  contractVersion: "1.0";
  operations: readonly ["discover", "preview"];
  sourceContracts: readonly [
    "TaskContractV3",
    "WorkItemGraphV1",
    "VerificationReceiptV2",
    "ReviewReceiptV1",
  ];
  limits: Readonly<{
    requestBytes: 262144;
    responseBytes: 524288;
    artifactEntries: 100;
    tasks: 100;
    allowedPaths: 100;
    verificationCommands: 100;
    targets: 100;
  }>;
  targets: readonly AmkQueueDraftPublicTargetV1[];
  requestScoped: true;
  previewOnly: true;
  filesModified: false;
}>;

export type AmkQueueDraftProjectSnapshotProviderV1 =
  () => readonly AmkQueueDraftConfiguredProjectV1[];

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateDiscovery = ajv.compile(discoveryV1Schema);

function responseBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    throw new AmkQueueDraftError("RESPONSE_TOO_LARGE");
  }
}

function requestTargetId(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AmkQueueDraftError("REQUEST_INVALID");
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some((field) => !REQUEST_FIELDS.has(field)) ||
      typeof request.targetId !== "string" || !TARGET_ID.test(request.targetId))
    throw new AmkQueueDraftError("REQUEST_INVALID");
  return request.targetId;
}

function frozenProfileSnapshot(
  provider: AmkQueueDraftProjectSnapshotProviderV1,
): readonly AmkQueueDraftConfiguredProjectV1[] {
  const supplied = provider();
  if (!Array.isArray(supplied)) throw new Error("Configured project snapshot is unavailable.");
  return Object.freeze(supplied.map((profile) => Object.freeze({
    id: profile.id,
    name: profile.name,
    path: profile.path,
    defaultModel: profile.defaultModel,
    defaultEffort: profile.defaultEffort,
    allowedModels: Object.freeze([...profile.allowedModels]),
  })));
}

function descriptor(
  profile: AmkQueueDraftConfiguredProjectV1,
): Readonly<AmkQueueDraftTargetDescriptorV1> {
  const path = resolve(profile.path);
  const project: AmkQueueDraftProjectV1 = {
    profileId: profile.id,
    name: profile.name,
    path,
    defaultModel: profile.defaultModel,
    defaultEffort: profile.defaultEffort,
    allowedModels: [...profile.allowedModels],
  };
  return createAmkQueueDraftTargetDescriptorV1({
    targetId: amkProjectIdV1(path),
    targetRevision: 0,
    project,
  });
}

function descriptors(
  provider: AmkQueueDraftProjectSnapshotProviderV1,
): readonly Readonly<AmkQueueDraftTargetDescriptorV1>[] {
  const snapshot = frozenProfileSnapshot(provider);
  if (snapshot.length > MAX_TARGETS) throw new AmkQueueDraftError("LIMIT_EXCEEDED");
  return Object.freeze(snapshot.map(descriptor));
}

function targetForRequest(
  current: readonly Readonly<AmkQueueDraftTargetDescriptorV1>[],
  targetId: string,
): Readonly<AmkQueueDraftTargetDescriptorV1> {
  const matches = current.filter((target) => target.targetId === targetId);
  if (matches.length > 1) throw new AmkQueueDraftError("TARGET_CONFLICT");
  if (matches.length === 0) throw new AmkQueueDraftError("TARGET_STALE");
  return matches[0];
}

export class AmkQueueDraftServiceV1 {
  constructor(
    private readonly validateQueue: QueueValidatorV1,
    private readonly projectProfiles: AmkQueueDraftProjectSnapshotProviderV1,
  ) {}

  discover(): Readonly<AmkQueueDraftDiscoveryV1> {
    const current = descriptors(this.projectProfiles);
    const identities = new Set<string>();
    for (const target of current) {
      if (identities.has(target.targetId))
        throw new AmkQueueDraftError("TARGET_CONFLICT");
      identities.add(target.targetId);
    }
    const targets = current
      .map((target): AmkQueueDraftPublicTargetV1 => Object.freeze({
        targetId: target.targetId,
        targetHash: target.targetHash,
        targetWatermark: target.targetWatermark,
        name: target.project.name,
        defaultModel: target.project.defaultModel,
        defaultEffort: target.project.defaultEffort,
        allowedModels: Object.freeze([...target.project.allowedModels]),
      }))
      .sort((left, right) => left.targetId.localeCompare(right.targetId));
    const discovery: AmkQueueDraftDiscoveryV1 = {
      contractType: "AmkQueueDraftDiscoveryV1",
      contractVersion: "1.0",
      operations: ["discover", "preview"],
      sourceContracts: [
        "TaskContractV3",
        "WorkItemGraphV1",
        "VerificationReceiptV2",
        "ReviewReceiptV1",
      ],
      limits: {
        requestBytes: 262144,
        responseBytes: 524288,
        artifactEntries: 100,
        tasks: 100,
        allowedPaths: 100,
        verificationCommands: 100,
        targets: 100,
      },
      targets,
      requestScoped: true,
      previewOnly: true,
      filesModified: false,
    };
    if (!validateDiscovery(discovery) ||
        responseBytes(discovery) > AMK_QUEUE_DRAFT_LIMITS_V1.maxResponseBytes)
      throw new AmkQueueDraftError("RESPONSE_TOO_LARGE");
    return Object.freeze(discovery);
  }

  preview(request: unknown): Readonly<AmkQueueDraftResponseV1> {
    const targetId = requestTargetId(request);
    const target = targetForRequest(descriptors(this.projectProfiles), targetId);
    try {
      return createAmkQueueDraftV1({ request, target, validateQueue: this.validateQueue });
    } catch (error) {
      if (error instanceof AmkQueueDraftError && error.code === "TARGET_INVALID")
        throw new AmkQueueDraftError("TARGET_STALE");
      throw error;
    }
  }
}
