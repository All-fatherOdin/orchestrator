import { createHash } from "node:crypto";
import { validateAmkProjectArtifactV2 } from "./validator.ts";

export const AMK_V5_PINNED_COMMIT = "86ffff56a61d51817891af9be569cb4c2923430a" as const;
export const AMK_SOURCE_HASH_PREFIX_LENGTH = 16;

const TASK_SCHEMA_SHA256 = "4988645351f73821cbbc3cdb08bfedbc0ae6a39741a3ed62320de1a34a8109e3";
const GRAPH_SCHEMA_SHA256 = "bc2444ad6b330f23cfbcfc84bebc0be1f1efb48aff87a142ce6e2379a90ecfdb";
const FAIL_CLOSED_POLICY =
  "docs/context_governance_rules.md#task-local-retrieval §6 — Report missing or conflicting evidence instead of filling gaps from model memory.";
const RECOVERY_POLICY =
  "docs/source_of_truth_hierarchy.md#conflict-rule §1-2 — use the higher source; report the conflict.";

export const AMK_PROJECTION_STATUSES = [
  "compatible",
  "partial",
  "unsupported",
  "conflict",
  "stale",
] as const;

export type AmkProjectionStatus = (typeof AMK_PROJECTION_STATUSES)[number];
export type OrchestratorProjectionTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "cancelled"
  | "blocked"
  | "failed"
  | "timed_out"
  | "skipped";

export type ProjectionSourceIdentityV1 = Readonly<{
  sourceId: string;
  sha256: string;
  byteLength: number;
  watermark: string | null;
}>;

export type ProjectionTaskAuthorizationEvidenceV1 = Readonly<{
  contractType: "TaskAuthorizationEvidenceV1";
  decision: "authorized" | "denied" | "disabled";
  intent?: "answer" | "review" | "diagnose" | "apply";
  technicalPermission?: "read_only" | "reversible_local_write";
  sideEffectRisk?:
    | "none"
    | "reversible_local_write"
    | "external_write"
    | "destructive"
    | "costly"
    | "publication"
    | "scope_expansion"
    | "ambiguous";
  allowedPaths: readonly string[];
  verificationCommands: readonly string[];
  scopeFingerprint: string;
  goalFingerprint: string;
  authorityFingerprint: string;
}>;

export type SelectedProjectionTaskEvidenceV1 = Readonly<{
  key?: string;
  title: string;
  prompt: string;
  allowedPaths?: readonly string[];
  verificationCommands?: readonly string[];
  executionGuards?: readonly string[];
  dependsOn?: readonly string[];
  requiresCheckpointsFrom?: readonly string[];
  status?: OrchestratorProjectionTaskStatus;
  /** Required before a run's completed state can become AMK completed/verified. */
  terminalStatusReconciled?: boolean;
  authorizationEvidence?: ProjectionTaskAuthorizationEvidenceV1;
  /** Proves exact replay against current task/project inputs; mere presence is insufficient. */
  authorizationEvidenceVerified?: boolean;
}>;

export type SelectedQueueRunProjectionEvidenceV1 = Readonly<{
  projectId: string;
  sourceKind: "queue" | "run";
  selectedSource: ProjectionSourceIdentityV1;
  currentSource: ProjectionSourceIdentityV1;
  tasks: readonly SelectedProjectionTaskEvidenceV1[];
}>;

export type TaskContractProjectionInputV1 = Readonly<{
  evidence: SelectedQueueRunProjectionEvidenceV1;
  taskKey: string;
}>;

export type WorkItemGraphProjectionInputV1 = Readonly<{
  evidence: SelectedQueueRunProjectionEvidenceV1;
}>;

export type TaskContractV3 = Readonly<{
  schema_version: "3.0";
  governance: Readonly<{
    contract_version: "3.0";
    supersedes: "TaskContractV2";
    effective_from: string;
    compatibility: "breaking";
    migration_note: string;
  }>;
  task_id: string;
  title: string;
  status: "active" | "blocked" | "completed" | "cancelled" | "archived";
  intent:
    | "answer"
    | "analyze"
    | "plan"
    | "retrieve_context"
    | "stage"
    | "apply"
    | "implement"
    | "memory_update"
    | "external_research"
    | "research"
    | "unknown";
  permission_mode: "explain-only" | "dry-run" | "read-only" | "apply";
  goal: string;
  scope: Readonly<{
    project_map: readonly string[];
    project_files: readonly string[];
    external_sources: readonly string[];
  }>;
  commitment_refs: readonly string[];
  expected_outcomes: readonly string[];
  stop_conditions: readonly string[];
  rollback_or_recovery: readonly string[];
  reversibility: "reversible" | "partially_reversible" | "irreversible" | "unknown";
  expected_side_effects: readonly string[];
  done_definition: readonly string[];
  workflow_profile: Readonly<{
    mode: "standard";
    task_scale: "unknown";
    risk_class: "unknown";
    delivery_strategy: "unknown";
    work_item_graph_ref: null;
    plan_challenge_ref: null;
    exploration_map_ref: null;
    triage_item_ref: null;
    design_probe_ref: null;
    review_policy: "unknown";
    review_receipt_refs: readonly string[];
    capability_impact: "unknown";
    capability_refs: readonly string[];
    domain_context_refs: readonly string[];
  }>;
}>;

export type WorkItemGraphV1 = Readonly<{
  schema_version: "1.0";
  graph_id: string;
  task_id: string;
  items: readonly Readonly<{
    id: string;
    title: string;
    behavior: string;
    vertical_scope: readonly string[];
    acceptance_claims: readonly string[];
    verification_recipe: readonly string[];
    context_fit: "unknown";
    status: "proposed" | "blocked" | "active" | "verified" | "cancelled";
    blocked_by: readonly string[];
  }>[];
  frontier_assertion: Readonly<{
    item_ids: readonly string[];
    navigation_only: true;
  }>;
  owner_review: "pending";
}>;

export type AmkProjectionResultV1<T> = Readonly<{
  contractType: "TaskContractV3" | "WorkItemGraphV1";
  contractVersion: "3.0" | "1.0";
  projectionVersion: "1.0";
  pinnedAmkCommit: typeof AMK_V5_PINNED_COMMIT;
  schemaSha256: string;
  status: AmkProjectionStatus;
  reasonCodes: readonly string[];
  artifact: T | null;
  selectedSource: ProjectionSourceIdentityV1;
  currentSource: ProjectionSourceIdentityV1;
  projectionId: string;
  readOnly: true;
  navigationOnly: true;
  activated: false;
  filesModified: false;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedStrings = (values: readonly string[] | undefined): string[] =>
  [...(values ?? [])].sort(compareText);

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, item]) => [key, canonicalValue(item)]),
  );
  return value;
}

export function canonicalProjectionJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

function sameOrderedStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validSource(identity: ProjectionSourceIdentityV1): boolean {
  return Boolean(identity.sourceId) && /^[a-f0-9]{64}$/.test(identity.sha256) &&
    Number.isSafeInteger(identity.byteLength) && identity.byteLength >= 0 &&
    (identity.watermark === null || typeof identity.watermark === "string");
}

function sourceProblem(evidence: SelectedQueueRunProjectionEvidenceV1): Readonly<{
  status: "conflict" | "stale";
  reason: string;
}> | undefined {
  const { selectedSource: selected, currentSource: current } = evidence;
  if (!evidence.projectId || !validSource(selected) || !validSource(current))
    return { status: "conflict", reason: "SOURCE_IDENTITY_INVALID" };
  if (selected.sourceId !== current.sourceId)
    return { status: "conflict", reason: "SOURCE_IDENTITY_CONFLICT" };
  if (
    selected.sha256 !== current.sha256 ||
    selected.byteLength !== current.byteLength ||
    selected.watermark !== current.watermark
  ) return { status: "stale", reason: "SOURCE_IDENTITY_OR_WATERMARK_STALE" };
  return undefined;
}

function buildResult<T>(
  evidence: SelectedQueueRunProjectionEvidenceV1,
  contractType: "TaskContractV3" | "WorkItemGraphV1",
  contractVersion: "3.0" | "1.0",
  schemaSha256: string,
  status: AmkProjectionStatus,
  reasonCodes: readonly string[],
  artifact: T | null,
): AmkProjectionResultV1<T> {
  const body = {
    contractType,
    contractVersion,
    projectionVersion: "1.0" as const,
    pinnedAmkCommit: AMK_V5_PINNED_COMMIT,
    schemaSha256,
    status,
    reasonCodes: [...new Set(reasonCodes)].sort(compareText),
    artifact,
    selectedSource: { ...evidence.selectedSource },
    currentSource: { ...evidence.currentSource },
    readOnly: true as const,
    navigationOnly: true as const,
    activated: false as const,
    filesModified: false as const,
  };
  return deepFreeze({
    ...body,
    projectionId: `AMK-PROJECTION-${sha256(canonicalProjectionJson(body))}`,
  });
}

function taskId(sourceHash: string, key: string): string {
  return `TASK-${sourceHash.slice(0, AMK_SOURCE_HASH_PREFIX_LENGTH)}-${key}`;
}

function workItemId(sourceHash: string, key: string): string {
  return `WI-${sourceHash.slice(0, AMK_SOURCE_HASH_PREFIX_LENGTH)}-${key}`;
}

function stableKey(key: string | undefined): key is string {
  return typeof key === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(key);
}

function duplicateKeys(tasks: readonly SelectedProjectionTaskEvidenceV1[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const task of tasks) {
    if (!task.key) continue;
    if (seen.has(task.key)) duplicates.add(task.key);
    seen.add(task.key);
  }
  return [...duplicates].sort(compareText);
}

function taskStatus(status: OrchestratorProjectionTaskStatus | undefined): TaskContractV3["status"] | undefined {
  switch (status) {
    case "pending":
    case "running": return "active";
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "blocked": return "blocked";
    default: return undefined;
  }
}

const unsupportedStatus = (status: OrchestratorProjectionTaskStatus | undefined): boolean =>
  status === "failed" || status === "timed_out" || status === "skipped";

function verifiedAuthorization(task: SelectedProjectionTaskEvidenceV1) {
  const authorization = task.authorizationEvidence;
  if (task.authorizationEvidenceVerified !== true || authorization?.decision !== "authorized")
    return undefined;
  if (
    authorization.contractType !== "TaskAuthorizationEvidenceV1" ||
    !sameOrderedStrings(authorization.allowedPaths, task.allowedPaths ?? []) ||
    !sameOrderedStrings(authorization.verificationCommands, task.verificationCommands ?? [])
  ) return "conflict" as const;
  return authorization;
}

function authorizationIntent(
  authorization: ProjectionTaskAuthorizationEvidenceV1 | undefined,
): TaskContractV3["intent"] {
  if (authorization?.intent === "answer") return "answer";
  if (authorization?.intent === "apply") return "apply";
  return "unknown";
}

function permissionMode(
  authorization: ProjectionTaskAuthorizationEvidenceV1 | undefined,
): TaskContractV3["permission_mode"] {
  if (authorization?.technicalPermission === "read_only") return "read-only";
  if (
    authorization?.intent === "apply" &&
    authorization.technicalPermission === "reversible_local_write" &&
    authorization.sideEffectRisk === "reversible_local_write"
  ) return "apply";
  return "explain-only";
}

export function projectTaskContractV3(
  input: TaskContractProjectionInputV1,
): AmkProjectionResultV1<TaskContractV3> {
  const { evidence } = input;
  const sourceIssue = sourceProblem(evidence);
  if (sourceIssue) return buildResult(
    evidence,
    "TaskContractV3",
    "3.0",
    TASK_SCHEMA_SHA256,
    sourceIssue.status,
    [sourceIssue.reason],
    null,
  );
  if (!stableKey(input.taskKey)) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "unsupported", ["TASK_STABLE_KEY_REQUIRED"], null,
  );
  if (duplicateKeys(evidence.tasks).length) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "conflict", ["TASK_DUPLICATE_KEY"], null,
  );
  const task = evidence.tasks.find((candidate) => candidate.key === input.taskKey);
  if (!task) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "unsupported", ["TASK_NOT_FOUND"], null,
  );
  if (unsupportedStatus(task.status)) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "unsupported", [`TASK_STATUS_UNSUPPORTED_${task.status!.toUpperCase()}`], null,
  );
  if (evidence.sourceKind !== "run" || !task.status) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "partial", ["TASK_CANONICAL_RUN_STATUS_UNAVAILABLE"], null,
  );
  if (task.status === "completed" && task.terminalStatusReconciled !== true) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "conflict", ["TASK_COMPLETION_NOT_RECONCILED"], null,
  );
  const mappedStatus = taskStatus(task.status);
  if (!mappedStatus) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "unsupported", ["TASK_STATUS_UNSUPPORTED"], null,
  );
  const authorization = verifiedAuthorization(task);
  if (authorization === "conflict") return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "conflict", ["TASK_AUTHORIZATION_SCOPE_CONFLICT"], null,
  );
  const artifact: TaskContractV3 = {
    schema_version: "3.0",
    governance: {
      contract_version: "3.0",
      supersedes: "TaskContractV2",
      effective_from: "2026-08-07",
      compatibility: "breaking",
      migration_note: "Read-only conservative projection from accepted AMK v5 integration contract v1.",
    },
    task_id: taskId(evidence.selectedSource.sha256, input.taskKey),
    title: task.title,
    status: mappedStatus,
    intent: authorizationIntent(authorization),
    permission_mode: permissionMode(authorization),
    goal: task.prompt,
    scope: {
      project_map: [],
      project_files: sortedStrings(task.allowedPaths),
      external_sources: [],
    },
    commitment_refs: [],
    expected_outcomes: [FAIL_CLOSED_POLICY],
    stop_conditions: task.executionGuards?.length
      ? sortedStrings(task.executionGuards)
      : [FAIL_CLOSED_POLICY],
    rollback_or_recovery: [RECOVERY_POLICY],
    reversibility: authorization?.sideEffectRisk === "reversible_local_write"
      ? "reversible"
      : "unknown",
    expected_side_effects: authorization?.sideEffectRisk === "reversible_local_write"
      ? ["reversible_local_write"]
      : [],
    done_definition: task.verificationCommands?.length
      ? sortedStrings(task.verificationCommands)
      : [FAIL_CLOSED_POLICY],
    workflow_profile: {
      mode: "standard",
      task_scale: "unknown",
      risk_class: "unknown",
      delivery_strategy: "unknown",
      work_item_graph_ref: null,
      plan_challenge_ref: null,
      exploration_map_ref: null,
      triage_item_ref: null,
      design_probe_ref: null,
      review_policy: "unknown",
      review_receipt_refs: [],
      capability_impact: "unknown",
      capability_refs: [],
      domain_context_refs: [],
    },
  };
  const validation = validateAmkProjectArtifactV2("TaskContractV3", artifact);
  if (!validation.valid) return buildResult(
    evidence, "TaskContractV3", "3.0", TASK_SCHEMA_SHA256,
    "conflict", ["TASK_PROJECTED_ARTIFACT_INVALID", ...validation.reasonCodes], null,
  );
  return buildResult(
    evidence,
    "TaskContractV3",
    "3.0",
    TASK_SCHEMA_SHA256,
    "partial",
    [
      "TASK_EXPECTED_OUTCOMES_USE_FAIL_CLOSED_POLICY",
      "TASK_ROLLBACK_USES_FAIL_CLOSED_POLICY",
      "TASK_WORKFLOW_FIELDS_UNKNOWN",
      ...(authorization ? [] : ["TASK_AUTHORIZATION_UNPROVEN"]),
    ],
    artifact,
  );
}

function graphStatus(task: SelectedProjectionTaskEvidenceV1): WorkItemGraphV1["items"][number]["status"] | undefined {
  switch (task.status) {
    case undefined:
    case "pending": return "proposed";
    case "running": return "active";
    case "completed": return task.terminalStatusReconciled === true ? "verified" : undefined;
    case "cancelled": return "cancelled";
    case "blocked": return "blocked";
    default: return undefined;
  }
}

function dependencyCycle(tasks: readonly SelectedProjectionTaskEvidenceV1[]): boolean {
  const graph = new Map(tasks.map((task) => [task.key!, task.dependsOn ?? []]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    for (const dependency of graph.get(key) ?? []) if (visit(dependency)) return true;
    visiting.delete(key);
    visited.add(key);
    return false;
  };
  return [...graph.keys()].some(visit);
}

export function projectWorkItemGraphV1(
  input: WorkItemGraphProjectionInputV1,
): AmkProjectionResultV1<WorkItemGraphV1> {
  const { evidence } = input;
  const sourceIssue = sourceProblem(evidence);
  if (sourceIssue) return buildResult(
    evidence,
    "WorkItemGraphV1",
    "1.0",
    GRAPH_SCHEMA_SHA256,
    sourceIssue.status,
    [sourceIssue.reason],
    null,
  );
  if (!evidence.tasks.length || evidence.tasks.some((task) => !stableKey(task.key)))
    return buildResult(
      evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
      "unsupported", ["GRAPH_STABLE_TASK_KEYS_REQUIRED"], null,
    );
  if (duplicateKeys(evidence.tasks).length) return buildResult(
    evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
    "conflict", ["GRAPH_DUPLICATE_TASK_KEY"], null,
  );
  const keys = new Set(evidence.tasks.map((task) => task.key!));
  if (evidence.tasks.some((task) => (task.dependsOn ?? []).some((key) => !keys.has(key))))
    return buildResult(
      evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
      "conflict", ["GRAPH_UNKNOWN_DEPENDENCY"], null,
    );
  if (evidence.tasks.some((task) => new Set(task.dependsOn ?? []).size !== (task.dependsOn ?? []).length))
    return buildResult(
      evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
      "conflict", ["GRAPH_DUPLICATE_DEPENDENCY"], null,
    );
  if (dependencyCycle(evidence.tasks)) return buildResult(
    evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
    "conflict", ["GRAPH_DEPENDENCY_CYCLE"], null,
  );
  if (evidence.tasks.some((task) => unsupportedStatus(task.status))) return buildResult(
    evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
    "unsupported", ["GRAPH_TASK_STATUS_UNSUPPORTED"], null,
  );
  if (evidence.tasks.some((task) => task.status === "completed" && task.terminalStatusReconciled !== true))
    return buildResult(
      evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
      "conflict", ["GRAPH_TERMINAL_STATUS_CONFLICT"], null,
    );

  const prefix = evidence.selectedSource.sha256.slice(0, AMK_SOURCE_HASH_PREFIX_LENGTH);
  const artifact: WorkItemGraphV1 = {
    schema_version: "1.0",
    graph_id: `WIG-${prefix}`,
    task_id: `TASK-QUEUE-${prefix}`,
    items: [...evidence.tasks]
      .sort((left, right) => compareText(left.key!, right.key!))
      .map((task) => ({
        id: workItemId(evidence.selectedSource.sha256, task.key!),
        title: task.title,
        behavior: task.prompt,
        vertical_scope: task.allowedPaths?.length
          ? sortedStrings(task.allowedPaths)
          : ["read-only navigation"],
        acceptance_claims: [FAIL_CLOSED_POLICY],
        verification_recipe: task.verificationCommands?.length
          ? sortedStrings(task.verificationCommands)
          : [FAIL_CLOSED_POLICY],
        context_fit: "unknown" as const,
        status: graphStatus(task)!,
        blocked_by: sortedStrings(task.dependsOn).map((key) =>
          workItemId(evidence.selectedSource.sha256, key)
        ),
      })),
    frontier_assertion: {
      item_ids: [],
      navigation_only: true,
    },
    owner_review: "pending",
  };
  const validation = validateAmkProjectArtifactV2("WorkItemGraphV1", artifact);
  if (!validation.valid) return buildResult(
    evidence, "WorkItemGraphV1", "1.0", GRAPH_SCHEMA_SHA256,
    "conflict", ["GRAPH_PROJECTED_ARTIFACT_INVALID", ...validation.reasonCodes], null,
  );
  return buildResult(
    evidence,
    "WorkItemGraphV1",
    "1.0",
    GRAPH_SCHEMA_SHA256,
    "partial",
    [
      "GRAPH_CONTEXT_FIT_UNKNOWN",
      "GRAPH_FRONTIER_INACTIVE",
      "GRAPH_NAVIGATION_ONLY",
      "GRAPH_OWNER_REVIEW_PENDING",
      "GRAPH_PARENT_TASK_NAVIGATION_ONLY",
    ],
    artifact,
  );
}
