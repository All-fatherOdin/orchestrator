import { createHash } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep, win32 } from "node:path";
import Ajv2020 from "ajv8/dist/2020.js";
import { stringify } from "yaml";
import {
  validateAmkProjectArtifactBundleV2,
  validateAmkProjectArtifactV2,
} from "../amk-project-artifacts-v2/validator.ts";
import reviewReceiptV1Schema from "../amk-project-artifacts-v2/schemas/review-receipt-v1.schema.json";
import taskContractV3Schema from "../amk-project-artifacts-v2/schemas/task-contract-v3.schema.json";
import verificationReceiptV2Schema from "../amk-project-artifacts-v2/schemas/verification-receipt-v2.schema.json";
import workItemGraphV1Schema from "../amk-project-artifacts-v2/schemas/work-item-graph-v1.schema.json";
import mappingInputV1Schema from "./schemas/mapping-input-v1.schema.json";
import queueDraftV1Schema from "./schemas/queue-draft-v1.schema.json";
import requestV1Schema from "./schemas/request-v1.schema.json";
import responseV1Schema from "./schemas/response-v1.schema.json";
import targetDescriptorV1Schema from "./schemas/target-descriptor-v1.schema.json";

export const AMK_QUEUE_DRAFT_LIMITS_V1 = Object.freeze({
  maxRequestBytes: 256 * 1024,
  maxResponseBytes: 512 * 1024,
  maxArtifactEntries: 100,
  maxTasks: 100,
  maxAllowedPaths: 100,
  maxVerificationCommands: 100,
  maxSourceStringCharacters: 8_192,
  maxTitleCharacters: 512,
  maxPromptBytes: 64 * 1024,
  maxErrorMessageCharacters: 160,
});

export const AMK_QUEUE_DRAFT_ERROR_CODES_V1 = [
  "REQUEST_INVALID",
  "REQUEST_TOO_LARGE",
  "SOURCE_INVALID",
  "SOURCE_STALE",
  "TARGET_INVALID",
  "TARGET_CONFLICT",
  "TARGET_STALE",
  "TASK_CONTRACT_INVALID",
  "COMPATIBILITY_INVALID",
  "TASK_COUNT_INVALID",
  "MAPPING_INVALID",
  "PATH_INVALID",
  "PATH_OUTSIDE_SCOPE",
  "TASK_KEY_COLLISION",
  "LIMIT_EXCEEDED",
  "QUEUE_VALIDATION_FAILED",
  "RESPONSE_TOO_LARGE",
] as const;

export type AmkQueueDraftErrorCodeV1 =
  (typeof AMK_QUEUE_DRAFT_ERROR_CODES_V1)[number];

const ERROR_MESSAGES: Record<AmkQueueDraftErrorCodeV1, string> = {
  REQUEST_INVALID: "The AMK queue-draft request is invalid.",
  REQUEST_TOO_LARGE: "The AMK queue-draft request exceeds the byte limit.",
  SOURCE_INVALID: "The AMK source object is invalid or exceeds a source limit.",
  SOURCE_STALE: "The AMK source identity no longer matches the supplied object.",
  TARGET_INVALID: "The server-resolved target descriptor is invalid.",
  TARGET_CONFLICT: "The opaque target identity matches conflicting configured projects.",
  TARGET_STALE: "The selected target identity or watermark is stale.",
  TASK_CONTRACT_INVALID: "A TaskContractV3 entry is invalid.",
  COMPATIBILITY_INVALID: "Optional AMK compatibility evidence is invalid or conflicting.",
  TASK_COUNT_INVALID: "At least two and at most 100 independently useful tasks are required.",
  MAPPING_INVALID: "Every TaskContractV3 requires one exact explicit operator mapping.",
  PATH_INVALID: "An AMK or operator path is not a safe normalized relative path.",
  PATH_OUTSIDE_SCOPE: "An operator allowed path is outside the exact AMK project_files scope.",
  TASK_KEY_COLLISION: "Normalized TaskContractV3 task identifiers collide.",
  LIMIT_EXCEEDED: "An AMK queue-draft count or string limit was exceeded.",
  QUEUE_VALIDATION_FAILED: "The unchanged ordinary queue validator rejected the complete draft.",
  RESPONSE_TOO_LARGE: "The complete queue-draft response exceeds the byte limit.",
};

export class AmkQueueDraftError extends Error {
  readonly code: AmkQueueDraftErrorCodeV1;

  constructor(code: AmkQueueDraftErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = "AmkQueueDraftError";
    this.code = code;
  }

  toJSON() {
    return { code: this.code, message: this.message };
  }
}

type ModelV1 = "luna" | "terra" | "sol";
type RequestedModelV1 = "auto" | ModelV1;
type EffortV1 = "light" | "medium" | "high";
type JsonRecord = Record<string, unknown>;

export type AmkQueueDraftProjectV1 = {
  profileId: string;
  name: string;
  path: string;
  defaultModel: ModelV1;
  defaultEffort: EffortV1;
  allowedModels: ModelV1[];
};

export type AmkQueueDraftTargetDescriptorV1 = {
  contractType: "AmkQueueDraftTargetDescriptorV1";
  contractVersion: "1.0";
  targetId: string;
  targetHash: string;
  targetRevision: number;
  targetWatermark: string;
  project: AmkQueueDraftProjectV1;
};

export type AmkTaskContractV3 = JsonRecord & {
  task_id: string;
  title?: string;
  goal: string;
  scope: { project_files: string[] } & JsonRecord;
  expected_outcomes: string[];
  stop_conditions: string[];
  done_definition: string[];
  workflow_profile: {
    work_item_graph_ref: string | null;
    review_receipt_refs: string[];
    risk_class: string;
  } & JsonRecord;
};

export type AmkQueueDraftArtifactV2 = {
  TaskContractV3: AmkTaskContractV3[];
  WorkItemGraphV1?: JsonRecord[];
  VerificationReceiptV2?: JsonRecord[];
  ReviewReceiptV1?: JsonRecord[];
};

export type AmkQueueDraftMappingInputV1 = {
  taskId: string;
  independentlyUseful: true;
  operatorTitle?: string;
  allowedPaths: string[];
  verificationCommands: string[];
  model?: RequestedModelV1;
  effort?: EffortV1;
};

export type AmkQueueDraftRequestV1 = {
  contractType: "AmkQueueDraftRequestV1";
  contractVersion: "1.0";
  targetId: string;
  targetHash: string;
  targetWatermark: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  artifact: AmkQueueDraftArtifactV2;
  mappings: AmkQueueDraftMappingInputV1[];
};

export type AmkQueueDraftTaskV1 = {
  key: string;
  title: string;
  prompt: string;
  allowedPaths: string[];
  verificationCommands: string[];
  executionGuards: string[];
  dependsOn: [];
  model?: RequestedModelV1;
  effort?: EffortV1;
};

export type AmkQueueDraftV1 = {
  project: AmkQueueDraftProjectV1;
  git: { checkpointCommits: false };
  tasks: AmkQueueDraftTaskV1[];
};

export type AmkQueueDraftResponseV1 = {
  contractType: "AmkQueueDraftResponseV1";
  contractVersion: "1.0";
  targetId: string;
  targetHash: string;
  targetWatermark: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  taskCount: number;
  compatibility: {
    workItemGraphCount: number;
    verificationReceiptCount: number;
    reviewReceiptCount: number;
    schedulerAuthority: false;
    verificationAuthority: false;
    reviewAuthority: false;
    executionAuthority: false;
  };
  queueDraft: AmkQueueDraftV1;
  yaml: string;
  yamlByteLength: number;
  wouldMutate: false;
  authorizationGranted: false;
};

export type QueueValidatorV1 = (value: unknown) => unknown;

const NO_SCHEDULER_AUTHORITY_GUARD =
  "Stop: AMK WorkItemGraphV1 evidence grants no scheduler or dependency authority.";
const NO_RECEIPT_AUTHORITY_GUARD =
  "Stop: AMK verification and review receipts grant no verification, review, authorization, or execution authority.";

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of [
  taskContractV3Schema,
  workItemGraphV1Schema,
  verificationReceiptV2Schema,
  reviewReceiptV1Schema,
  mappingInputV1Schema,
  queueDraftV1Schema,
]) ajv.addSchema(schema);
const validateRequest = ajv.compile(requestV1Schema);
const validateTarget = ajv.compile(targetDescriptorV1Schema);
const validateResponse = ajv.compile(responseV1Schema);
const validateQueueDraftContract = ajv.getSchema(queueDraftV1Schema.$id)!;

function fail(code: AmkQueueDraftErrorCodeV1): never {
  throw new AmkQueueDraftError(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedJsonValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Non-finite JSON number");
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new TypeError("Cyclic JSON array");
    seen.add(value);
    const result = value.map((item) => normalizedJsonValue(item, seen));
    seen.delete(value);
    return result;
  }
  if (isRecord(value)) {
    if (seen.has(value)) throw new TypeError("Cyclic JSON object");
    seen.add(value);
    const result: JsonRecord = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined)
        result[key] = normalizedJsonValue(value[key], seen);
    }
    seen.delete(value);
    return result;
  }
  throw new TypeError("Non-JSON value");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizedJsonValue(value, new WeakSet()));
}

function canonicalClone<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function jsonByteLength(value: unknown, invalidCode: AmkQueueDraftErrorCodeV1): number {
  try {
    return Buffer.byteLength(canonicalJson(value), "utf8");
  } catch {
    return fail(invalidCode);
  }
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as JsonRecord)) deepFreeze(item);
  }
  return value;
}

function sourceStringLimitExceeded(value: unknown): boolean {
  if (typeof value === "string")
    return value.length > AMK_QUEUE_DRAFT_LIMITS_V1.maxSourceStringCharacters;
  if (Array.isArray(value)) return value.some(sourceStringLimitExceeded);
  if (isRecord(value)) return Object.values(value).some(sourceStringLimitExceeded);
  return false;
}

export function createAmkQueueDraftSourceFenceV1(
  artifact: unknown,
): Readonly<{ sourceHash: string; sourceByteLength: number; sourceWatermark: string }> {
  let canonical: string;
  try {
    canonical = canonicalJson(artifact);
  } catch {
    return fail("SOURCE_INVALID");
  }
  const sourceHash = sha256(canonical);
  const sourceByteLength = Buffer.byteLength(canonical, "utf8");
  return Object.freeze({
    sourceHash,
    sourceByteLength,
    sourceWatermark: `AMK-UPLOAD-${sourceHash}-${sourceByteLength}`,
  });
}

export function createAmkQueueDraftTargetDescriptorV1(input: {
  targetId: string;
  targetRevision: number;
  project: AmkQueueDraftProjectV1;
}): Readonly<AmkQueueDraftTargetDescriptorV1> {
  let project: AmkQueueDraftProjectV1;
  try {
    project = canonicalClone(input.project);
  } catch {
    return fail("TARGET_INVALID");
  }
  const targetHash = sha256(canonicalJson(project));
  const target: AmkQueueDraftTargetDescriptorV1 = {
    contractType: "AmkQueueDraftTargetDescriptorV1",
    contractVersion: "1.0",
    targetId: input.targetId,
    targetHash,
    targetRevision: input.targetRevision,
    targetWatermark: `AMK-TARGET-${targetHash}-${input.targetRevision}`,
    project,
  };
  if (!validateTarget(target) ||
      (!posix.isAbsolute(project.path) && !win32.isAbsolute(project.path)))
    return fail("TARGET_INVALID");
  return deepFreeze(target);
}

function assertExactTarget(
  request: AmkQueueDraftRequestV1,
  target: AmkQueueDraftTargetDescriptorV1,
): void {
  if (!validateTarget(target) ||
      (!posix.isAbsolute(target.project.path) && !win32.isAbsolute(target.project.path)))
    return fail("TARGET_INVALID");
  const actualHash = sha256(canonicalJson(target.project));
  const actualWatermark = `AMK-TARGET-${actualHash}-${target.targetRevision}`;
  if (target.targetHash !== actualHash || target.targetWatermark !== actualWatermark)
    return fail("TARGET_INVALID");
  if (request.targetId !== target.targetId || request.targetHash !== target.targetHash ||
      request.targetWatermark !== target.targetWatermark)
    return fail("TARGET_STALE");
}

function assertExactSource(request: AmkQueueDraftRequestV1): void {
  const actual = createAmkQueueDraftSourceFenceV1(request.artifact);
  if (request.sourceHash !== actual.sourceHash ||
      request.sourceByteLength !== actual.sourceByteLength ||
      request.sourceWatermark !== actual.sourceWatermark)
    return fail("SOURCE_STALE");
}

function normalizeRelativePath(value: string): string {
  if (!value || /[\0\r\n]/.test(value) || /^[A-Za-z]:/.test(value) ||
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
      value.startsWith("/") || value.startsWith("\\"))
    return fail("PATH_INVALID");
  const parts = value.replace(/\\/g, "/").split("/");
  if (parts.some((part) => part === "..")) return fail("PATH_INVALID");
  const normalized = parts.filter((part) => part && part !== ".").join("/");
  if (!normalized) return fail("PATH_INVALID");
  return normalized;
}

function isContainedPath(targetRoot: string, candidate: string): boolean {
  const fromTarget = relative(targetRoot, candidate);
  return fromTarget === "" ||
    (fromTarget !== ".." && !fromTarget.startsWith(`..${sep}`) && !isAbsolute(fromTarget));
}

function resolveTargetRoot(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return fail("TARGET_INVALID");
  }
}

function assertRealPathContainment(targetRoot: string, normalizedPath: string): void {
  let current = targetRoot;
  for (const part of normalizedPath.split("/")) {
    // Glob segments do not name a concrete filesystem entry. Every existing
    // literal prefix is still resolved so a symlink cannot leave the target.
    if (/[*?[\]{}]/.test(part)) break;
    const candidate = resolve(current, part);
    try {
      lstatSync(candidate);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return;
      return fail("PATH_INVALID");
    }
    try {
      current = realpathSync.native(candidate);
    } catch {
      return fail("PATH_INVALID");
    }
    if (!isContainedPath(targetRoot, current)) return fail("PATH_INVALID");
  }
}

function normalizedTargetPath(value: string, targetRoot: string): string {
  const normalized = normalizeRelativePath(value);
  assertRealPathContainment(targetRoot, normalized);
  return normalized;
}

function normalizedScope(task: AmkTaskContractV3, targetRoot: string): string[] {
  const normalized = task.scope.project_files.map((value) =>
    normalizedTargetPath(value, targetRoot));
  if (new Set(normalized).size !== normalized.length) return fail("PATH_INVALID");
  return normalized;
}

function normalizedKey(taskId: string): string {
  const suffix = taskId.slice("TASK-".length).toLowerCase()
    .replace(/\./g, "-")
    .replace(/-+/g, "-");
  return `task-${suffix}`;
}

function recordString(record: JsonRecord, field: string): string | undefined {
  return typeof record[field] === "string" ? record[field] as string : undefined;
}

function assertOptionalCompatibility(artifact: AmkQueueDraftArtifactV2): void {
  const tasks = artifact.TaskContractV3;
  const taskIds = new Set(tasks.map((task) => task.task_id));
  const graphs = artifact.WorkItemGraphV1 ?? [];
  const verifications = artifact.VerificationReceiptV2 ?? [];
  const reviews = artifact.ReviewReceiptV1 ?? [];

  for (const [contract, entries] of [
    ["WorkItemGraphV1", graphs],
    ["VerificationReceiptV2", verifications],
    ["ReviewReceiptV1", reviews],
  ] as const) {
    for (const entry of entries) {
      if (!validateAmkProjectArtifactV2(contract, entry).valid ||
          !taskIds.has(recordString(entry, "task_id") ?? ""))
        return fail("COMPATIBILITY_INVALID");
    }
  }

  const uniqueIdentity = (entries: JsonRecord[], field: string): boolean => {
    const values = entries.map((entry) => recordString(entry, field));
    return values.every(Boolean) && new Set(values).size === values.length;
  };
  if (!uniqueIdentity(graphs, "graph_id") ||
      !uniqueIdentity(verifications, "receipt_id") ||
      !uniqueIdentity(reviews, "review_id"))
    return fail("COMPATIBILITY_INVALID");

  for (const task of tasks) {
    const graphRef = task.workflow_profile.work_item_graph_ref;
    const reviewRefs = new Set(task.workflow_profile.review_receipt_refs);
    const bundle: JsonRecord = { TaskContractV3: task };
    if (graphRef) {
      const graph = graphs.find((candidate) =>
        recordString(candidate, "graph_id") === graphRef &&
        recordString(candidate, "task_id") === task.task_id);
      if (graph) bundle.WorkItemGraphV1 = graph;
    }
    const requiredProfile = ["high", "irreversible"].includes(task.workflow_profile.risk_class)
      ? "adversarial"
      : task.workflow_profile.risk_class === "significant" ? "fresh_context" : undefined;
    const review = reviews.find((candidate) =>
      recordString(candidate, "task_id") === task.task_id &&
      reviewRefs.has(recordString(candidate, "review_id") ?? "") &&
      (!requiredProfile || candidate.profile === requiredProfile) &&
      candidate.status === "passed" && candidate.owner_disposition === "accepted");
    if (review) bundle.ReviewReceiptV1 = review;
    if (!validateAmkProjectArtifactBundleV2(bundle).valid)
      return fail("COMPATIBILITY_INVALID");
  }
}

function fixedPrompt(task: AmkTaskContractV3, request: AmkQueueDraftRequestV1): string {
  const expected = task.expected_outcomes
    .map((value, index) => `Expected outcome ${index + 1} (verbatim):\n${value}`)
    .join("\n\n");
  const done = task.done_definition
    .map((value, index) => `Done definition ${index + 1} (verbatim):\n${value}`)
    .join("\n\n");
  return [
    "Execute the reviewed task backed by exactly one AMK Project Artifact V2 TaskContractV3.",
    `AMK task_id: ${task.task_id}`,
    `AMK sourceHash: ${request.sourceHash}`,
    `AMK sourceWatermark: ${request.sourceWatermark}`,
    `Goal (verbatim):\n${task.goal}`,
    expected,
    done,
  ].join("\n\n");
}

function mappedTask(
  task: AmkTaskContractV3,
  mapping: AmkQueueDraftMappingInputV1,
  request: AmkQueueDraftRequestV1,
  targetRoot: string,
): AmkQueueDraftTaskV1 {
  const titlePresent = typeof task.title === "string" && task.title.length > 0;
  if ((titlePresent && mapping.operatorTitle !== undefined) ||
      (!titlePresent && (!mapping.operatorTitle || !mapping.operatorTitle.trim())))
    return fail("MAPPING_INVALID");
  const title = titlePresent ? task.title! : mapping.operatorTitle!;
  if (title.length > AMK_QUEUE_DRAFT_LIMITS_V1.maxTitleCharacters)
    return fail("LIMIT_EXCEEDED");

  const exactScope = new Set(normalizedScope(task, targetRoot));
  const allowedPaths = mapping.allowedPaths.map((value) =>
    normalizedTargetPath(value, targetRoot));
  if (new Set(allowedPaths).size !== allowedPaths.length) return fail("MAPPING_INVALID");
  if (allowedPaths.some((path) => !exactScope.has(path))) return fail("PATH_OUTSIDE_SCOPE");
  if (mapping.verificationCommands.some((command) => !command.trim()))
    return fail("MAPPING_INVALID");
  const prompt = fixedPrompt(task, request);
  if (Buffer.byteLength(prompt, "utf8") > AMK_QUEUE_DRAFT_LIMITS_V1.maxPromptBytes)
    return fail("LIMIT_EXCEEDED");

  const mapped: AmkQueueDraftTaskV1 = {
    key: normalizedKey(task.task_id),
    title,
    prompt,
    allowedPaths,
    verificationCommands: [...mapping.verificationCommands],
    executionGuards: [
      ...task.stop_conditions,
      NO_SCHEDULER_AUTHORITY_GUARD,
      NO_RECEIPT_AUTHORITY_GUARD,
    ],
    dependsOn: [],
  };
  if (mapping.model !== undefined) mapped.model = mapping.model;
  if (mapping.effort !== undefined) mapped.effort = mapping.effort;
  return mapped;
}

function artifactEntryCount(artifact: AmkQueueDraftArtifactV2): number {
  return artifact.TaskContractV3.length +
    (artifact.WorkItemGraphV1?.length ?? 0) +
    (artifact.VerificationReceiptV2?.length ?? 0) +
    (artifact.ReviewReceiptV1?.length ?? 0);
}

export function createAmkQueueDraftV1(input: {
  request: unknown;
  target: unknown;
  validateQueue: QueueValidatorV1;
}): Readonly<AmkQueueDraftResponseV1> {
  const requestBytes = jsonByteLength(input.request, "REQUEST_INVALID");
  if (requestBytes > AMK_QUEUE_DRAFT_LIMITS_V1.maxRequestBytes)
    return fail("REQUEST_TOO_LARGE");
  if (isRecord(input.request) && isRecord(input.request.artifact) &&
      Array.isArray(input.request.artifact.TaskContractV3) &&
      (input.request.artifact.TaskContractV3.length < 2 ||
       input.request.artifact.TaskContractV3.length > AMK_QUEUE_DRAFT_LIMITS_V1.maxTasks))
    return fail("TASK_COUNT_INVALID");
  if (!validateRequest(input.request)) return fail("REQUEST_INVALID");
  if (!validateTarget(input.target)) return fail("TARGET_INVALID");

  const request = input.request as AmkQueueDraftRequestV1;
  const target = input.target as AmkQueueDraftTargetDescriptorV1;
  assertExactTarget(request, target);
  const targetRoot = resolveTargetRoot(target.project.path);
  assertExactSource(request);
  if (sourceStringLimitExceeded(request.artifact)) return fail("SOURCE_INVALID");
  if (artifactEntryCount(request.artifact) > AMK_QUEUE_DRAFT_LIMITS_V1.maxArtifactEntries)
    return fail("LIMIT_EXCEEDED");

  for (const task of request.artifact.TaskContractV3)
    if (!validateAmkProjectArtifactV2("TaskContractV3", task).valid)
      return fail("TASK_CONTRACT_INVALID");
  const keys = request.artifact.TaskContractV3.map((task) => normalizedKey(task.task_id));
  if (new Set(keys).size !== keys.length) return fail("TASK_KEY_COLLISION");
  assertOptionalCompatibility(request.artifact);

  if (request.mappings.length !== request.artifact.TaskContractV3.length)
    return fail("MAPPING_INVALID");
  const mappings = new Map<string, AmkQueueDraftMappingInputV1>();
  for (const mapping of request.mappings) {
    if (mappings.has(mapping.taskId)) return fail("MAPPING_INVALID");
    mappings.set(mapping.taskId, mapping);
  }
  const taskIds = new Set(request.artifact.TaskContractV3.map((task) => task.task_id));
  if (mappings.size !== taskIds.size || [...mappings.keys()].some((id) => !taskIds.has(id)))
    return fail("MAPPING_INVALID");

  if (keys.some((key) => key.length > 160) ||
      request.artifact.TaskContractV3.some((task) => task.stop_conditions.length > 100))
    return fail("LIMIT_EXCEEDED");
  const tasks = request.artifact.TaskContractV3.map((task) =>
    mappedTask(task, mappings.get(task.task_id)!, request, targetRoot));
  const allowedPathCount = tasks.reduce((sum, task) => sum + task.allowedPaths.length, 0);
  const commandCount = tasks.reduce((sum, task) => sum + task.verificationCommands.length, 0);
  if (allowedPathCount > AMK_QUEUE_DRAFT_LIMITS_V1.maxAllowedPaths ||
      commandCount > AMK_QUEUE_DRAFT_LIMITS_V1.maxVerificationCommands)
    return fail("LIMIT_EXCEEDED");

  const queueDraft: AmkQueueDraftV1 = {
    project: canonicalClone(target.project),
    git: { checkpointCommits: false },
    tasks,
  };
  if (!validateQueueDraftContract(queueDraft)) return fail("REQUEST_INVALID");
  try {
    input.validateQueue(canonicalClone(queueDraft));
  } catch {
    return fail("QUEUE_VALIDATION_FAILED");
  }

  const yaml = stringify(queueDraft, { lineWidth: 0, indent: 2 });
  const yamlByteLength = Buffer.byteLength(yaml, "utf8");
  const response: AmkQueueDraftResponseV1 = {
    contractType: "AmkQueueDraftResponseV1",
    contractVersion: "1.0",
    targetId: target.targetId,
    targetHash: target.targetHash,
    targetWatermark: target.targetWatermark,
    sourceHash: request.sourceHash,
    sourceByteLength: request.sourceByteLength,
    sourceWatermark: request.sourceWatermark,
    taskCount: tasks.length,
    compatibility: {
      workItemGraphCount: request.artifact.WorkItemGraphV1?.length ?? 0,
      verificationReceiptCount: request.artifact.VerificationReceiptV2?.length ?? 0,
      reviewReceiptCount: request.artifact.ReviewReceiptV1?.length ?? 0,
      schedulerAuthority: false,
      verificationAuthority: false,
      reviewAuthority: false,
      executionAuthority: false,
    },
    queueDraft,
    yaml,
    yamlByteLength,
    wouldMutate: false,
    authorizationGranted: false,
  };
  if (!validateResponse(response)) return fail("RESPONSE_TOO_LARGE");
  if (jsonByteLength(response, "RESPONSE_TOO_LARGE") > AMK_QUEUE_DRAFT_LIMITS_V1.maxResponseBytes)
    return fail("RESPONSE_TOO_LARGE");
  return deepFreeze(response);
}
