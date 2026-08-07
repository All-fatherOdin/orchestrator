import { createHash } from "node:crypto";
import { parse } from "yaml";
import type { SelectedProjectionTaskEvidenceV1, SelectedQueueRunProjectionEvidenceV1 } from "./projections.ts";
import { amkProjectIdV1 } from "./run-source.ts";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : undefined;
const text = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const strings = (value: unknown): string[] | undefined => Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0) ? [...new Set(value)] : undefined;
const optionalStrings = (record: RecordValue, key: string): string[] | undefined | null =>
  !(key in record) || record[key] === undefined ? undefined : strings(record[key]) ?? null;
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

export type AmkQueueSourceDescriptorV1 = Readonly<{
  selectorKind: "queue";
  projectId: string;
  queueId: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  taskCount: number;
}>;

export type AmkQueueProjectionSourceV1 = Readonly<{
  descriptor: AmkQueueSourceDescriptorV1;
  taskEvidence: SelectedQueueRunProjectionEvidenceV1;
  verificationEvidence: readonly [];
  reviewEvidence: readonly [];
}>;

export function amkQueueIdV1(fileName: string) {
  return `QUEUE-${sha256(fileName.toLowerCase())}`;
}

export function parseAmkQueueProjectionSourceV1(rawYaml: string, queueId: string): AmkQueueProjectionSourceV1 | undefined {
  let parsed: unknown;
  try { parsed = parse(rawYaml); } catch { return undefined; }
  const queue = object(parsed);
  const project = object(queue?.project);
  const projectPath = text(project?.path);
  if (!queue || !project || !projectPath || !/^QUEUE-[a-f0-9]{64}$/.test(queueId) || !Array.isArray(queue.tasks)) return undefined;
  const projectVerificationCommands = optionalStrings(project, "verificationCommands");
  if (projectVerificationCommands === null) return undefined;
  const sourceHash = sha256(rawYaml);
  const sourceByteLength = Buffer.byteLength(rawYaml, "utf8");
  const sourceWatermark = `AMK-QUEUE-${sourceHash}-${sourceByteLength}`;
  const projectId = amkProjectIdV1(projectPath);
  const identity = { sourceId: `queue:${queueId}`, sha256: sourceHash, byteLength: sourceByteLength, watermark: sourceWatermark };
  const tasks: SelectedProjectionTaskEvidenceV1[] = [];
  for (const [index, rawTask] of queue.tasks.entries()) {
    const task = object(rawTask);
    const title = text(task?.title);
    const prompt = text(task?.prompt);
    if (!task || !title || !prompt) return undefined;
    const allowedPaths = optionalStrings(task, "allowedPaths");
    const verificationCommands = optionalStrings(task, "verificationCommands");
    const executionGuards = optionalStrings(task, "executionGuards");
    const dependsOn = optionalStrings(task, "dependsOn");
    const requiresCheckpointsFrom = optionalStrings(task, "requiresCheckpointsFrom");
    if ([allowedPaths, verificationCommands, executionGuards, dependsOn, requiresCheckpointsFrom].includes(null)) return undefined;
    tasks.push({
      key: text(task.key) ?? `queue-task-${index + 1}`,
      title,
      prompt,
      allowedPaths: allowedPaths ?? undefined,
      verificationCommands: [...new Set([...(projectVerificationCommands ?? []), ...(verificationCommands ?? [])])],
      executionGuards: executionGuards ?? undefined,
      dependsOn: dependsOn ?? undefined,
      requiresCheckpointsFrom: requiresCheckpointsFrom ?? undefined,
      status: "pending",
      terminalStatusReconciled: false,
      authorizationEvidenceVerified: false,
    });
  }
  return {
    descriptor: { selectorKind: "queue", projectId, queueId, sourceHash, sourceByteLength, sourceWatermark, taskCount: tasks.length },
    taskEvidence: { projectId, sourceKind: "queue", selectedSource: identity, currentSource: identity, tasks },
    verificationEvidence: [],
    reviewEvidence: [],
  };
}
