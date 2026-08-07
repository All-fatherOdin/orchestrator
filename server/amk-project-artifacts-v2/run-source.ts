import { createHash } from "node:crypto";
import type {
  CurrentRunReviewEvidenceV1,
  CurrentRunVerificationEvidenceV1,
} from "./evidence-projections.ts";
import type {
  OrchestratorProjectionTaskStatus,
  ProjectionTaskAuthorizationEvidenceV1,
  ProjectionSourceIdentityV1,
  SelectedProjectionTaskEvidenceV1,
  SelectedQueueRunProjectionEvidenceV1,
} from "./projections.ts";

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const RUN_STATUSES = new Set(["idle", "running", "paused", "completed", "failed", "timed_out", "cancelled"]);
const TERMINAL_RUN_STATUSES = new Set(["completed", "failed", "timed_out", "cancelled"]);
const TASK_STATUSES = new Set<OrchestratorProjectionTaskStatus>([
  "pending", "running", "completed", "cancelled", "blocked", "failed", "timed_out", "skipped",
]);

type JsonObject = Record<string, unknown>;

export type AmkRunSourceDescriptorV1 = Readonly<{
  selectorKind: "run";
  projectId: string;
  runId: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  runStatus: string;
  taskCount: number;
  startedAt?: string;
  finishedAt?: string;
}>;

export type AmkRunProjectionSourceV1 = Readonly<{
  descriptor: AmkRunSourceDescriptorV1;
  taskEvidence: SelectedQueueRunProjectionEvidenceV1;
  verificationEvidence: readonly CurrentRunVerificationEvidenceV1[];
  reviewEvidence: readonly CurrentRunReviewEvidenceV1[];
}>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isoTimestamp(value: unknown): string | undefined {
  const candidate = text(value);
  return candidate && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(candidate)
    ? candidate
    : undefined;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)
    ? [...new Set(value)]
    : undefined;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function amkProjectIdV1(projectPath: string): string {
  return `PROJECT-${sha256(projectPath.replaceAll("\\", "/").toLowerCase())}`;
}

export function parseAmkRunProjectionSourceV1(rawJson: string): AmkRunProjectionSourceV1 | undefined {
  let parsed: unknown;
  try { parsed = JSON.parse(rawJson); }
  catch { return undefined; }
  const run = object(parsed);
  const runId = text(run?.id);
  const project = object(run?.project);
  const projectPath = text(project?.path);
  const runStatus = text(run?.status);
  if (!run || !runId || !RUN_ID.test(runId) || !projectPath || !runStatus ||
      !RUN_STATUSES.has(runStatus) || !Array.isArray(run.tasks))
    return undefined;

  const sourceHash = sha256(rawJson);
  const sourceByteLength = Buffer.byteLength(rawJson, "utf8");
  const sourceWatermark = `AMK-RUN-${sourceHash}-${sourceByteLength}`;
  const projectId = amkProjectIdV1(projectPath);
  const identity: ProjectionSourceIdentityV1 = {
    sourceId: `run:${runId}`,
    sha256: sourceHash,
    byteLength: sourceByteLength,
    watermark: sourceWatermark,
  };

  const tasks: SelectedProjectionTaskEvidenceV1[] = [];
  const verificationEvidence: CurrentRunVerificationEvidenceV1[] = [];
  const reviewEvidence: CurrentRunReviewEvidenceV1[] = [];
  for (const [index, rawTask] of run.tasks.entries()) {
    const task = object(rawTask);
    const taskId = text(task?.id);
    const title = text(task?.title);
    const prompt = text(task?.prompt);
    if (!task || !taskId || !title || !prompt) return undefined;
    const key = text(task.key) ?? taskId;
    const statusText = text(task.status);
    const status = statusText && TASK_STATUSES.has(statusText as OrchestratorProjectionTaskStatus)
      ? statusText as OrchestratorProjectionTaskStatus
      : undefined;
    const authorization = object(task.authorizationEvidence);
    const decision = text(authorization?.decision);
    const intent = text(authorization?.intent);
    const permission = text(authorization?.technicalPermission);
    const risk = text(authorization?.sideEffectRisk);
    const authorizationEvidence: ProjectionTaskAuthorizationEvidenceV1 | undefined = authorization && authorization.contractType === "TaskAuthorizationEvidenceV1" &&
      (decision === "authorized" || decision === "denied" || decision === "disabled") &&
      strings(authorization.allowedPaths) && strings(authorization.verificationCommands) &&
      text(authorization.scopeFingerprint) && text(authorization.goalFingerprint) &&
      text(authorization.authorityFingerprint)
      ? {
          contractType: "TaskAuthorizationEvidenceV1" as const,
          decision: decision as "authorized" | "denied" | "disabled",
          ...(intent === "answer" || intent === "review" || intent === "diagnose" || intent === "apply"
            ? { intent: intent as "answer" | "review" | "diagnose" | "apply" }
            : {}),
          ...(permission === "read_only" || permission === "reversible_local_write"
            ? { technicalPermission: permission as "read_only" | "reversible_local_write" }
            : {}),
          ...(["none", "reversible_local_write", "external_write", "destructive", "costly", "publication", "scope_expansion", "ambiguous"].includes(risk ?? "")
            ? { sideEffectRisk: risk as "none" | "reversible_local_write" | "external_write" | "destructive" | "costly" | "publication" | "scope_expansion" | "ambiguous" }
            : {}),
          allowedPaths: strings(authorization.allowedPaths)!,
          verificationCommands: strings(authorization.verificationCommands)!,
          scopeFingerprint: text(authorization.scopeFingerprint)!,
          goalFingerprint: text(authorization.goalFingerprint)!,
          authorityFingerprint: text(authorization.authorityFingerprint)!,
        }
      : undefined;
    const taskFinishedAt = isoTimestamp(task.finishedAt);
    const runFinishedAt = isoTimestamp(run.finishedAt);
    const terminalStatusReconciled = Boolean(
      taskFinishedAt && !task.executionPhase && TERMINAL_RUN_STATUSES.has(runStatus),
    );
    tasks.push({
      key,
      title,
      prompt,
      allowedPaths: strings(task.allowedPaths),
      verificationCommands: strings(task.verificationCommands),
      executionGuards: strings(task.executionGuards),
      dependsOn: strings(task.dependsOn),
      requiresCheckpointsFrom: strings(task.requiresCheckpointsFrom),
      status,
      terminalStatusReconciled,
      authorizationEvidence,
      // Stored evidence is not replayed by this read-only adapter.
      authorizationEvidenceVerified: false,
    });

    const commands = authorizationEvidence?.verificationCommands ?? strings(task.verificationCommands) ?? [];
    const verifiedAt = taskFinishedAt ?? runFinishedAt;
    if (verifiedAt) for (const [commandIndex, configuredCommand] of commands.entries()) {
      const attemptOrdinal = Number.isSafeInteger(task.executionAttempts) && Number(task.executionAttempts) > 0
        ? Number(task.executionAttempts)
        : 1;
      const opaque = sha256(`${runId}\0${taskId}\0${index}\0${commandIndex}`).slice(0, 24);
      verificationEvidence.push({
        evidenceKind: "current_run",
        projectId,
        selectedSource: identity,
        currentSource: identity,
        taskId: `TASK-${sha256(`${runId}\0${taskId}`).slice(0, 24)}`,
        attempt: {
          attemptId: `ATTEMPT-${opaque}`,
          attemptOrdinal,
          evidenceRef: `run:${runId}:attempt:${opaque}`,
        },
        configuredCommand,
        verifiedAt,
        ...(Number.isInteger(task.exitCode) ? { aggregateExitCode: Number(task.exitCode) } : {}),
        ...(typeof task.timedOut === "boolean" ? { aggregateTimedOut: task.timedOut } : {}),
      });
    }
    if (["pending", "approved", "changes_requested", "unavailable", "timed_out"].includes(text(task.reviewStatus) ?? "")) {
      reviewEvidence.push({
        evidenceKind: "current_run",
        projectId,
        selectedSource: identity,
        currentSource: identity,
        taskId: `TASK-${sha256(`${runId}\0${taskId}`).slice(0, 24)}`,
        reviewerInputKind: "unrestricted_final_output",
      });
    }
  }

  return {
    descriptor: {
      selectorKind: "run",
      projectId,
      runId,
      sourceHash,
      sourceByteLength,
      sourceWatermark,
      runStatus,
      taskCount: tasks.length,
      ...(isoTimestamp(run.startedAt) ? { startedAt: isoTimestamp(run.startedAt) } : {}),
      ...(isoTimestamp(run.finishedAt) ? { finishedAt: isoTimestamp(run.finishedAt) } : {}),
    },
    taskEvidence: {
      projectId,
      sourceKind: "run",
      selectedSource: identity,
      currentSource: identity,
      tasks,
    },
    verificationEvidence,
    reviewEvidence,
  };
}
