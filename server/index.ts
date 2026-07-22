import express from "express";
import Ajv2020 from "ajv8/dist/2020.js";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { parse, parseDocument } from "yaml";
// The static imports keep exact schema snapshots embedded in the desktop server bundle.
import contextRequestV1Schema from "./context-contract-v1/schemas/context-request-v1.schema.json";
import contextBundleV1Schema from "./context-contract-v1/schemas/context-bundle-v1.schema.json";
import contextReceiptV1Schema from "./context-contract-v1/schemas/context-receipt-v1.schema.json";
import goalReceiptEnvelopeV1Schema from "./goalbuddy-bridge-v1/schemas/goal-receipt-envelope-v1.schema.json";

type Model = "luna" | "terra" | "sol";
type RequestedModel = Model | "auto";
type Effort = "light" | "medium" | "high";
type Status =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "skipped"
  | "blocked";
type Limits = {
  taskTimeoutMinutes: number;
  reviewerTimeoutMinutes: number;
  maxTaskRetries: number;
  maxParallelTasks: number;
};
type GitSettings = { checkpointCommits: boolean };
type Checkpoint = { hash: string; message: string; createdAt: string };
type ProjectLock = { path: string; acquiredAt: string };
type ProjectSettings = {
  profileId?: string;
  verificationCommands?: string[];
  defaultModel?: Model;
  defaultEffort?: Effort;
  allowedModels?: Model[];
};
type ProjectProfile = {
  id: string;
  name: string;
  path: string;
  verificationCommands: string[];
  defaultModel: Model;
  defaultEffort: Effort;
  allowedModels: Model[];
};
export type GoalBuddyTaskLinkV1 = {
  goalSlug: string;
  goalTitle: string;
  externalTaskId: string;
  objective: string;
  statePath: string;
  stateSha256: string;
};
export type TaskInput = {
  /** Stable YAML identifier used to declare dependencies. */
  key?: string;
  /** YAML task keys that must complete before this task may start. */
  dependsOn?: string[];
  /** Named exclusive resources; tasks sharing one must not run concurrently. */
  resources?: string[];
  title: string;
  prompt: string;
  /** `auto` lets the orchestrator choose a model before the run begins. */
  model?: RequestedModel;
  /** Do not route this task below this model when `model: auto` is used. */
  minModel?: Model;
  effort?: Effort;
  allowedPaths?: string[];
  verificationCommands?: string[];
  executionGuards?: string[];
  externalTaskId?: string;
  goalBuddy?: GoalBuddyTaskLinkV1;
  timeoutMinutes?: number;
  maxRetries?: number;
  /** Opts the task into Context Contract v1 selection. */
  contextProfile?: string;
  /** Maximum number of context sources selected for this task. */
  maxSources?: number;
};

export type GoalReceiptEnvelopeV1 = {
  contract_type: "GoalReceiptEnvelopeV1";
  contract_version: "1.0";
  created_at: string;
  goal: { slug: string; title: string; state_path: string; state_sha256: string };
  task: {
    external_task_id: string;
    objective: string;
    allowed_paths: string[];
    verification_commands: string[];
    execution_guards: string[];
  };
  repository: { path: string };
  orchestrator: { run_id: string; task_id: string };
  outcome: { task_status: Status; outcome_class: OutcomeClass };
  source_state_unchanged: boolean;
};

export type OrchestratorGoalSyncV1 = {
  contract_type: "OrchestratorGoalSyncV1";
  run_id: string;
  task_id: string;
  external_task_id: string;
  run_status: Status;
  outcome_class: OutcomeClass;
  receipt_path: string;
  receipt_contract_type: "GoalReceiptEnvelopeV1";
  synchronized_at: string;
};

type GoalBuddySyncState = {
  status: "synced" | "conflict" | "failed";
  synchronizedAt?: string;
  error?: string;
};

type ContextPolicyRefs = {
  context_index: string;
  retrieval_policy: string;
  retrieval_scoring_policy: string;
};
export type ContextRequestV1 = {
  contract_type: "ContextRequestV1";
  contract_version: "1.0";
  request_id: string;
  task: string;
  profile: string;
  mutation_scope: "read_only";
  selection: {
    max_sources: number;
    include_triggered: boolean;
    required_paths: string[];
    forbidden_paths: string[];
  };
  requested_tools: string[];
  policy_refs: ContextPolicyRefs;
};
export type ContextSourceV1 = {
  path: string;
  priority: string;
  authority: string;
  status: string;
  layer: string;
  retrieval_mode: string;
  inclusion_reason: string;
  evidence_refs?: string[];
};
export type ContextBundleV1 = {
  contract_type: "ContextBundleV1";
  contract_version: "1.0";
  bundle_id: string;
  request_id: string;
  profile: string;
  policy_refs: ContextPolicyRefs;
  sources: ContextSourceV1[];
  selection: {
    max_sources: number;
    selected_source_count: number;
    omitted_source_count: number;
    missing_required_paths: string[];
    skipped_trigger_only_context: string[];
    skipped_high_risk_context: Array<{ path_glob: string; reason: string }>;
    truncated: boolean;
  };
  scope_expansion: { runtime: false; external_system: false; data: false; project_map_mutated: false };
};
export type ContextReceiptV1 = {
  contract_type: "ContextReceiptV1";
  contract_version: "1.0";
  receipt_id: string;
  request_id: string;
  bundle_id: string;
  outcome: "pass" | "fail";
  reason_codes: string[];
  checks: Array<{ check_id: string; status: "pass" | "fail"; reason_codes: string[] }>;
  counts: { requested_max_sources: number; selected_sources: number; omitted_sources: number };
  policy_refs: ContextPolicyRefs;
  tools: { requested: string[]; allowed: string[]; denied: Array<{ tool: string; reason_code: string }> };
  changed_paths: [];
  scope_expansion: { runtime: false; external_system: false; data: false; project_map_mutated: false };
};
export type ContextProviderRequest = {
  projectPath: string;
  requestId: string;
  task: string;
  profile: string;
  maxSources: number;
};
export type ContextProviderResult = {
  provider: "repository-helper" | "fallback";
  bundle: ContextBundleV1;
  receipt: ContextReceiptV1;
  fallbackReason?: string;
};
export interface ContextProvider {
  provide(request: ContextProviderRequest): Promise<ContextProviderResult>;
}

const CONTEXT_POLICY_REFS: ContextPolicyRefs = {
  context_index: "docs/project_map/context_index.yaml",
  retrieval_policy: "docs/project_map/retrieval_policy.yaml",
  retrieval_scoring_policy: "docs/project_map/retrieval_scoring_policy.yaml",
};
const NO_SCOPE_EXPANSION = {
  runtime: false,
  external_system: false,
  data: false,
  project_map_mutated: false,
} as const;
const SAFE_FALLBACK_FILES = ["AGENTS.md", "README.md"] as const;
const CONTEXT_FORBIDDEN_PATHS = [
  ".env",
  ".env.*",
  "data/**",
  "output/**",
  "logs/**",
  "secrets/**",
  ".git/**",
  ".venv/**",
] as const;

class ContextProviderFailure extends Error {
  constructor(readonly reasonCode: string, message: string) {
    super(message);
  }
}

const contextContractAjv = new Ajv2020({ allErrors: true, strict: true });
const contextContractValidators = {
  request: contextContractAjv.compile(contextRequestV1Schema),
  bundle: contextContractAjv.compile(contextBundleV1Schema),
  receipt: contextContractAjv.compile(contextReceiptV1Schema),
};
const contextContractNames = {
  request: "ContextRequestV1",
  bundle: "ContextBundleV1",
  receipt: "ContextReceiptV1",
} as const;
const goalReceiptAjv = new Ajv2020({ allErrors: true, strict: true, formats: {
  "date-time": true,
} });
const goalReceiptValidator = goalReceiptAjv.compile(goalReceiptEnvelopeV1Schema);

export function validateGoalReceiptEnvelopeV1<T>(payload: T): T & GoalReceiptEnvelopeV1 {
  if (!goalReceiptValidator(payload)) {
    const details = goalReceiptAjv.errorsText(goalReceiptValidator.errors, { separator: "; " });
    throw new Error(`GOAL_RECEIPT_SCHEMA_MISMATCH: ${details}`);
  }
  return payload as T & GoalReceiptEnvelopeV1;
}

export function validateContextContractV1<T>(kind: keyof typeof contextContractValidators, payload: T): T {
  const validate = contextContractValidators[kind];
  if (!validate(payload)) {
    const details = contextContractAjv.errorsText(validate.errors, { separator: "; " });
    throw new ContextProviderFailure(
      "CONTEXT_SCHEMA_MISMATCH",
      `CONTEXT_SCHEMA_MISMATCH: ${contextContractNames[kind]} failed runtime validation: ${details}`,
    );
  }
  return payload;
}

export function createContextRequestV1(request: ContextProviderRequest): ContextRequestV1 {
  return validateContextContractV1("request", {
    contract_type: "ContextRequestV1",
    contract_version: "1.0",
    request_id: request.requestId,
    task: request.task,
    profile: request.profile,
    mutation_scope: "read_only",
    selection: {
      max_sources: request.maxSources,
      include_triggered: false,
      required_paths: [],
      forbidden_paths: [...CONTEXT_FORBIDDEN_PATHS],
    },
    requested_tools: [],
    policy_refs: CONTEXT_POLICY_REFS,
  });
}

function safeContextPath(path: string) {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  const parts = normalized.split("/");
  return Boolean(normalized) && !normalized.startsWith("/") && !normalized.includes("../") &&
    !parts.some((part) => part === "data" || part === "output" || part === "logs" || part === "secrets" || part === ".git" || part === ".venv" || part === "__pycache__" || part === ".pytest_cache") &&
    !parts.some((part) => part === ".env" || part.startsWith(".env.")) &&
    !/\.(?:db|sqlite|sqlite3|log|pyc)$/i.test(normalized) && !normalized.endsWith("/desktop.ini") && normalized !== "desktop.ini";
}

function matchesPathGlob(path: string, glob: string) {
  const normalizedPath = path.replace(/\\/g, "/");
  const escaped = glob.replace(/\\/g, "/").replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*");
  return new RegExp(`^${pattern}$`, "i").test(normalizedPath);
}

function contextResult(
  request: ContextProviderRequest,
  provider: ContextProviderResult["provider"],
  sources: ContextSourceV1[],
  options: { selected?: number; omitted?: number; truncated?: boolean; skippedTriggered?: string[]; skippedHighRisk?: Array<{ path_glob: string; reason: string }>; reasonCode?: string } = {},
): ContextProviderResult {
  const bundleId = `bundle-${request.requestId}`;
  const reasonCodes = options.reasonCode ? [options.reasonCode] : [];
  const omitted = options.omitted ?? 0;
  const selected = options.selected ?? sources.length + omitted;
  const truncated = options.truncated ?? omitted > 0;
  if (sources.length > request.maxSources || selected !== sources.length + omitted || truncated !== (omitted > 0))
    throw new ContextProviderFailure("CONTEXT_CONSISTENCY_MISMATCH", "Generated context selection counts are inconsistent.");
  const bundle: ContextBundleV1 = {
    contract_type: "ContextBundleV1",
    contract_version: "1.0",
    bundle_id: bundleId,
    request_id: request.requestId,
    profile: request.profile,
    policy_refs: CONTEXT_POLICY_REFS,
    sources,
    selection: {
      max_sources: request.maxSources,
      selected_source_count: selected,
      omitted_source_count: omitted,
      missing_required_paths: [],
      skipped_trigger_only_context: options.skippedTriggered ?? [],
      skipped_high_risk_context: options.skippedHighRisk ?? [],
      truncated,
    },
    scope_expansion: NO_SCOPE_EXPANSION,
  };
  const receipt: ContextReceiptV1 = {
    contract_type: "ContextReceiptV1",
    contract_version: "1.0",
    receipt_id: `receipt-${request.requestId}`,
    request_id: request.requestId,
    bundle_id: bundleId,
    outcome: "pass",
    reason_codes: reasonCodes,
    checks: [{ check_id: "context_selection", status: "pass", reason_codes: reasonCodes }],
    counts: { requested_max_sources: request.maxSources, selected_sources: selected, omitted_sources: omitted },
    policy_refs: CONTEXT_POLICY_REFS,
    tools: { requested: [], allowed: [], denied: [] },
    changed_paths: [],
    scope_expansion: NO_SCOPE_EXPANSION,
  };
  validateContextContractV1("bundle", bundle);
  validateContextContractV1("receipt", receipt);
  return {
    provider,
    fallbackReason: options.reasonCode,
    bundle,
    receipt,
  };
}

export class FallbackContextProvider implements ContextProvider {
  async provide(request: ContextProviderRequest): Promise<ContextProviderResult> {
    createContextRequestV1(request);
    const availableSources = SAFE_FALLBACK_FILES
      .filter((path) => existsSync(join(request.projectPath, path)))
      .map((path): ContextSourceV1 => ({
        path,
        priority: "P0",
        authority: "repository_entrypoint",
        status: "active",
        layer: "root_entrypoint",
        retrieval_mode: "startup_required",
        inclusion_reason: "fixed safe fallback entrypoint",
      }));
    const sources = availableSources.slice(0, request.maxSources);
    const omitted = availableSources.length - sources.length;
    return contextResult(request, "fallback", sources, {
      selected: availableSources.length,
      omitted,
      truncated: omitted > 0,
    });
  }
}

type RepositoryContextHelperOptions = {
  executable?: string;
  helperRelativePath?: string;
  timeoutMs?: number;
};

export class RepositoryContextHelperProvider implements ContextProvider {
  constructor(private readonly options: RepositoryContextHelperOptions = {}) {}

  async provide(request: ContextProviderRequest): Promise<ContextProviderResult> {
    createContextRequestV1(request);
    const helper = join(request.projectPath, this.options.helperRelativePath ?? "scripts/ai_context_helper.py");
    if (!existsSync(helper))
      throw new ContextProviderFailure("HELPER_UNAVAILABLE", "Repository context helper was not found.");
    const executable = this.options.executable ?? process.env.PYTHON_BIN ?? "python";
    const args = [helper, "--root", request.projectPath, "api-context", "--request-id", request.requestId, "--task", request.task, "--profile", request.profile, "--max-sources", String(request.maxSources), "--format", "json"];
    const output = await new Promise<string>((resolveOutput, reject) => {
      const child = spawn(executable, args, { cwd: request.projectPath, windowsHide: true });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolveOutput(stdout);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new ContextProviderFailure("HELPER_TIMEOUT", "Repository context helper timed out."));
      }, this.options.timeoutMs ?? 5_000);
      child.stdout?.on("data", (chunk: Buffer) => { stdout = (stdout + chunk.toString()).slice(0, 1_000_000); });
      child.stderr?.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(0, 20_000); });
      child.on("error", () => finish(new ContextProviderFailure("HELPER_UNAVAILABLE", "Repository context helper could not start.")));
      child.on("close", (code) => code === 0 ? finish() : finish(new ContextProviderFailure("HELPER_FAILED", stderr.trim() || `Repository context helper exited with code ${code}.`)));
    });
    let value: unknown;
    try { value = JSON.parse(output); }
    catch { throw new ContextProviderFailure("HELPER_INVALID_JSON", "Repository context helper returned invalid JSON."); }
    return this.normalize(value, request);
  }

  normalize(value: unknown, request: ContextProviderRequest): ContextProviderResult {
    const legacy = value as Record<string, unknown>;
    const readSet = legacy?.read_set;
    const receipt = legacy?.receipt as Record<string, unknown> | undefined;
    const context = legacy?.context as Record<string, unknown> | undefined;
    const envelope = legacy?.request_envelope as Record<string, unknown> | undefined;
    if (legacy?.bundle_type !== "api_agent_context_bundle" || legacy.request_id !== request.requestId || legacy.profile !== request.profile || legacy.mutation_scope !== "read-only" || !Array.isArray(readSet) || receipt?.receipt_type !== "api_agent_context_receipt")
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper response does not match its compatibility contract.");
    if (envelope?.request_id !== request.requestId || envelope.profile !== request.profile || envelope.max_sources !== request.maxSources || receipt.request_id !== request.requestId || receipt.profile !== request.profile)
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper request identity diverged across payload sections.");
    if (!Array.isArray(context?.read_set) || !Array.isArray(receipt.read_set) || JSON.stringify(context.read_set) !== JSON.stringify(readSet) || JSON.stringify(receipt.read_set) !== JSON.stringify(readSet))
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper read sets diverged across bundle, context, and receipt.");
    if (legacy.runtime_scope_expanded !== false || legacy.broker_or_data_scope_expanded !== false)
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper expanded runtime or data scope.");
    const forbiddenPaths = Array.isArray(envelope.forbidden_paths) && envelope.forbidden_paths.every((item) => typeof item === "string" && item)
      ? envelope.forbidden_paths as string[]
      : (() => { throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper omitted forbidden path evidence."); })();
    const skippedHighRisk = Array.isArray(legacy.skipped_high_risk_context)
      ? legacy.skipped_high_risk_context.map((item) => {
          const entry = item as Record<string, unknown>;
          if (typeof entry?.path_glob !== "string" || !entry.path_glob || typeof entry.reason !== "string" || !entry.reason)
            throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper returned invalid high-risk exclusion evidence.");
          return { path_glob: entry.path_glob, reason: entry.reason };
        })
      : (() => { throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper omitted high-risk exclusion evidence."); })();
    const skippedTriggered = Array.isArray(legacy.skipped_trigger_only_context)
      ? legacy.skipped_trigger_only_context.map((item) => typeof item === "string" ? item : String((item as Record<string, unknown>)?.path ?? "")).filter(Boolean)
      : [];
    const sources = readSet.map((item) => {
      const source = item as Record<string, unknown>;
      for (const key of ["path", "priority", "authority", "status", "layer", "retrieval_mode", "inclusion_reason"])
        if (typeof source[key] !== "string" || !source[key])
          throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", `Repository context helper source is missing ${key}.`);
      if (!safeContextPath(String(source.path)) || forbiddenPaths.some((glob) => matchesPathGlob(String(source.path), glob)))
        throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper selected a forbidden path.");
      return {
        path: String(source.path), priority: String(source.priority), authority: String(source.authority), status: String(source.status),
        layer: String(source.layer), retrieval_mode: String(source.retrieval_mode), inclusion_reason: String(source.inclusion_reason),
      } satisfies ContextSourceV1;
    });
    if (sources.length > request.maxSources)
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper exceeded maxSources.");
    const selected = legacy.selected_source_count;
    const omitted = legacy.omitted_source_count;
    const truncated = legacy.truncated;
    if (!Number.isInteger(selected) || Number(selected) < sources.length)
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper selected_source_count is inconsistent with its read set.");
    if (!Number.isInteger(omitted) || Number(omitted) < 0 || Number(selected) !== sources.length + Number(omitted) || typeof truncated !== "boolean" || truncated !== (Number(omitted) > 0))
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper omission metadata is inconsistent.");
    if (truncated && sources.length !== request.maxSources)
      throw new ContextProviderFailure("HELPER_CONTRACT_MISMATCH", "Repository context helper truncated before filling maxSources.");
    return contextResult(request, "repository-helper", sources, {
      selected: Number(selected),
      omitted: Number(omitted),
      truncated,
      skippedTriggered,
      skippedHighRisk,
    });
  }
}

export async function resolveTaskContext(request: ContextProviderRequest, primary: ContextProvider = new RepositoryContextHelperProvider(), fallback: ContextProvider = new FallbackContextProvider()) {
  try { return await primary.provide(request); }
  catch (error) {
    const reason = error instanceof ContextProviderFailure ? error.reasonCode : "HELPER_FAILED";
    const result = await fallback.provide(request);
    result.fallbackReason = reason;
    result.receipt.reason_codes = [reason];
    result.receipt.checks = [{ check_id: "repository_helper", status: "fail", reason_codes: [reason] }, { check_id: "safe_fallback", status: "pass", reason_codes: [] }];
    validateContextContractV1("bundle", result.bundle);
    validateContextContractV1("receipt", result.receipt);
    return result;
  }
}
type ResolvedTask = Omit<TaskInput, "model" | "effort"> & {
  model: Model;
  effort: Effort;
  requestedModel: RequestedModel;
  modelSelectionReason: string;
};
type ReviewStatus =
  "pending" | "approved" | "changes_requested" | "unavailable" | "timed_out";
type ReviewSettings = {
  enabled: boolean;
  model: Model;
  effort: Effort;
  maxCorrections: number;
};
type Task = ResolvedTask & {
  id: string;
  model: Model;
  requestedModel: RequestedModel;
  modelSelectionReason: string;
  effort: Effort;
  status: Status;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  timedOut?: boolean;
  log: string[];
  changedFiles?: string[];
  diff?: string;
  finalOutput?: string;
  reviewStatus?: ReviewStatus;
  reviewOutput?: string;
  attempts?: number;
  executionAttempts?: number;
  checkpoint?: Checkpoint;
  goalReceiptPath?: string;
  goalBuddySync?: GoalBuddySyncState;
  /** Machine-readable accounting emitted by Codex CLI JSON events. */
  usage?: UsageRecord[];
  context?: ContextProviderResult;
};
type UsageRecord = {
  phase: "executor" | "reviewer" | "correction";
  attempt: number;
  recordedAt: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};
type Run = {
  id: string;
  project: { name: string; path: string } & ProjectSettings;
  status:
    | "idle"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "timed_out"
    | "cancelled";
  startedAt?: string;
  finishedAt?: string;
  pausedAt?: string;
  pauseRequested?: boolean;
  tasks: Task[];
  review: ReviewSettings;
  limits: Limits;
  git: GitSettings;
  lock?: ProjectLock;
  pipeline?: { id: string; file: string; index: number; total: number };
  contextReceipts?: ContextReceiptV1[];
};
type PipelineInput = { queues: Array<{ file: string }> };
type LoadedPipeline = {
  id: string;
  queues: Array<{ file: string; queue: ReturnType<typeof validateQueue> }>;
  currentIndex: number;
  currentRunId?: string;
  status: Run["status"];
};
type PipelineView = {
  id: string;
  currentIndex: number;
  status: Run["status"];
  queues: Array<{ index: number; file: string; name: string; state: "completed" | "current" | "pending" }>;
};
type RunSummary = Pick<
  Run,
  "id" | "project" | "status" | "startedAt" | "finishedAt" | "pipeline"
> & { taskCount: number; schemaVersion: 2 };

export type OutcomeClass = "success" | "failure" | "interrupted" | "pending";
type TokenMetrics = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  calls: number;
};

export function outcomeClass(status: string): OutcomeClass {
  if (status === "completed") return "success";
  if (status === "failed" || status === "timed_out" || status === "blocked") return "failure";
  if (status === "cancelled" || status === "skipped") return "interrupted";
  return "pending";
}

export function durationMs(startedAt?: string, finishedAt?: string): number | null {
  if (!startedAt || !finishedAt) return null;
  const start = Date.parse(startedAt);
  const finish = Date.parse(finishedAt);
  return Number.isFinite(start) && Number.isFinite(finish) && finish >= start
    ? finish - start
    : null;
}

function normalizedTokens(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : 0;
}

function tokenMetrics(usage: unknown): TokenMetrics {
  if (!Array.isArray(usage))
    return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0, calls: 0 };
  const totals = usage.reduce(
    (sum, record) => {
      if (!record || typeof record !== "object") return sum;
      const entry = record as Record<string, unknown>;
      sum.inputTokens += normalizedTokens(entry.inputTokens);
      sum.outputTokens += normalizedTokens(entry.outputTokens);
      sum.cachedInputTokens += normalizedTokens(entry.cachedInputTokens);
      sum.calls += 1;
      return sum;
    },
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, calls: 0 },
  );
  return { ...totals, totalTokens: totals.inputTokens + totals.outputTokens };
}

function usageRecords(task: Task): Array<Record<string, unknown>> {
  return Array.isArray(task.usage)
    ? task.usage.filter((entry): entry is UsageRecord => Boolean(entry) && typeof entry === "object")
    : [];
}

export function projectTaskMetrics(task: Task) {
  const records = usageRecords(task);
  const storedExecutions = typeof task.executionAttempts === "number"
    && Number.isFinite(task.executionAttempts)
    && Number.isInteger(task.executionAttempts)
    && task.executionAttempts >= 0
    ? task.executionAttempts
    : null;
  const executorAttempts = records
    .filter((entry) => entry.phase === "executor")
    .map((entry) => entry.attempt)
    .filter((attempt): attempt is number => typeof attempt === "number" && Number.isInteger(attempt) && attempt > 0);
  const executionAttempts = storedExecutions ?? (executorAttempts.length ? Math.max(...executorAttempts) : null);
  const storedCycles = typeof task.attempts === "number" && Number.isFinite(task.attempts) && task.attempts >= 0
    ? Math.max(0, Math.trunc(task.attempts) - 1)
    : null;
  const correctionAttempts = new Set(records
    .filter((entry) => entry.phase === "correction")
    .map((entry) => entry.attempt)
    .filter((attempt): attempt is number => typeof attempt === "number" && Number.isInteger(attempt) && attempt > 0));
  const reviewCorrectionCycles = storedCycles ?? (correctionAttempts.size ? correctionAttempts.size : null);

  return {
    id: task.id,
    key: task.key,
    status: task.status,
    outcome: outcomeClass(task.status),
    durationMs: durationMs(task.startedAt, task.finishedAt),
    executionAttempts,
    reviewCorrectionCycles,
    tokens: tokenMetrics(task.usage),
  };
}

export function projectRunMetrics(run: Run) {
  const tasks = run.tasks.map(projectTaskMetrics);
  const tokens = tasks.reduce<TokenMetrics>((sum, task) => ({
    inputTokens: sum.inputTokens + task.tokens.inputTokens,
    outputTokens: sum.outputTokens + task.tokens.outputTokens,
    cachedInputTokens: sum.cachedInputTokens + task.tokens.cachedInputTokens,
    totalTokens: sum.totalTokens + task.tokens.totalTokens,
    calls: sum.calls + task.tokens.calls,
  }), { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0, calls: 0 });
  return {
    id: run.id,
    status: run.status,
    outcome: outcomeClass(run.status),
    durationMs: durationMs(run.startedAt, run.finishedAt),
    tokens,
    tasks,
  };
}

const MODEL_IDS: Record<Model, string> = {
  luna: "gpt-5.6-luna",
  terra: "gpt-5.6-terra",
  sol: "gpt-5.6-sol",
};
const MODEL_RANK: Record<Model, number> = { luna: 0, terra: 1, sol: 2 };

function autoModelRecommendation(task: TaskInput): {
  model: Model;
  reason: string;
} {
  const text = `${task.title} ${task.prompt}`.toLowerCase();
  if (/\b(security|auth(?:entication|orization)?|migration|architecture|incident|production|payment|billing|concurrency|distributed)\b/.test(text))
    return { model: "sol", reason: "high-risk or cross-cutting task" };
  if (/\b(integration|debug|refactor|test|api|database|multiple files)\b/.test(text))
    return { model: "terra", reason: "implementation or verification task" };
  return { model: "luna", reason: "contained task" };
}

function resolveTaskModel(task: TaskInput, project: ProjectSettings) {
  const requestedModel = task.model ?? project.defaultModel ?? "terra";
  if (requestedModel !== "auto")
    return { model: requestedModel, requestedModel, reason: "explicit task or project default" };

  const recommendation = autoModelRecommendation(task);
  const minimum = task.minModel ?? "luna";
  const available = (project.allowedModels?.length ? project.allowedModels : Object.keys(MODEL_IDS) as Model[])
    .filter((model) => MODEL_RANK[model] >= MODEL_RANK[minimum])
    .filter((model) => !(model === "sol" && task.effort === "high"));
  if (!available.length)
    throw new Error("No enabled model satisfies this task's minModel and effort.");
  const model = [...available]
    .filter((candidate) => MODEL_RANK[candidate] <= MODEL_RANK[recommendation.model])
    .at(-1) ?? available[0];
  return { model, requestedModel, reason: `auto: ${recommendation.reason}` };
}
const portableDataDirectory = process.env.ORCHESTRATOR_WEB_ROOT
  ? resolve(process.env.ORCHESTRATOR_WEB_ROOT, "..", "..", "..", "..", ".orchestrator")
  : undefined;
const dataDirectory = resolve(
  process.env.ORCHESTRATOR_DATA_DIR ||
    (portableDataDirectory && existsSync(portableDataDirectory)
      ? portableDataDirectory
      : ".orchestrator"),
);
const runsDirectory = join(dataDirectory, "runs");
const pipelinesDirectory = join(dataDirectory, "plans");
const projectsFile = join(dataDirectory, "projects.json");
const defaultReviewSettings: ReviewSettings = {
  enabled: true,
  model: "terra",
  effort: "light",
  maxCorrections: 1,
};
const defaultLimits: Limits = {
  taskTimeoutMinutes: 30,
  reviewerTimeoutMinutes: 10,
  maxTaskRetries: 1,
  maxParallelTasks: 1,
};
const defaultGitSettings: GitSettings = { checkpointCommits: false };
let savedProjects: ProjectProfile[] = [];
const windowsCodexBin = join(
  process.env.LOCALAPPDATA || "",
  "Microsoft",
  "WinGet",
  "Packages",
  "OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe",
  "codex-x86_64-pc-windows-msvc.exe",
);
let activeRun: Run | undefined;
let activePipeline: LoadedPipeline | undefined;
const activeProcesses = new Map<string, ReturnType<typeof spawn>>();
const skippedTaskIds = new Set<string>();
let resumePausedRun: (() => void) | undefined;
const subscribers = new Set<express.Response>();
const jsonWriteChains = new Map<string, Promise<void>>();
let codexCliCheck: Promise<boolean> | undefined;

const timestamp = () => new Date().toISOString();
const identifier = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isCancelled = (run: Run) => run.status === "cancelled";
const projectLockName = ".codex-orchestrator.lock";
const lastSettledTask = (run: Run) =>
  [...run.tasks]
    .reverse()
    .find((task) => task.status === "completed" || task.status === "skipped");
function findDesktopCodexBin() {
  if (process.platform !== "win32") return undefined;
  const root = join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "bin");
  if (!existsSync(root)) return undefined;
  try {
    return readdirSync(root)
      .map((entry) => join(root, entry, "codex.exe"))
      .filter(existsSync)
      .sort(
        (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs,
      )[0];
  } catch {
    return undefined;
  }
}
const codexBin = () =>
  process.env.CODEX_BIN ||
  findDesktopCodexBin() ||
  (process.platform === "win32" && existsSync(windowsCodexBin)
    ? windowsCodexBin
    : "codex");

function publish(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  subscribers.forEach((response) => response.write(message));
}

function writeTextAtomically(file: string, content: string) {
  const previous = jsonWriteChains.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.${identifier()}.tmp`;
      try {
        await writeFile(temporary, content);
        await rename(temporary, file);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
    });
  jsonWriteChains.set(file, next);
  void next.finally(() => {
    if (jsonWriteChains.get(file) === next) jsonWriteChains.delete(file);
  });
  return next;
}

function writeJsonAtomically(file: string, value: unknown) {
  return writeTextAtomically(file, JSON.stringify(value, null, 2));
}

function persist(run: Run) {
  return Promise.all([
    writeJsonAtomically(join(runsDirectory, run.id, "run.json"), run),
    writeJsonAtomically(join(runsDirectory, run.id, "summary.json"), runSummary(run)),
  ]).then(
    () => undefined,
  );
}
function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireProjectLock(run: Run) {
  const path = join(run.project.path, projectLockName);
  const payload = JSON.stringify(
    {
      runId: run.id,
      pid: process.pid,
      acquiredAt: timestamp(),
      project: run.project.path,
    },
    null,
    2,
  );
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(payload, "utf8");
    await handle.close();
    run.lock = { path, acquiredAt: timestamp() };
    return run.lock;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    )
      throw error;
    let existing: { runId?: string; pid?: number } | undefined;
    try {
      existing = JSON.parse(await readFile(path, "utf8")) as {
        runId?: string;
        pid?: number;
      };
    } catch {
      /* malformed locks are treated as stale */
    }
    if (existing?.pid && processIsAlive(existing.pid))
      throw new Error(
        `Project is locked by run ${existing.runId ?? "unknown"} (PID ${existing.pid}).`,
      );
    await unlink(path).catch(() => undefined);
    return acquireProjectLock(run);
  }
}

export async function releaseProjectLock(run: Run) {
  const path = run.lock?.path ?? join(run.project.path, projectLockName);
  try {
    const existing = JSON.parse(await readFile(path, "utf8")) as {
      runId?: string;
      pid?: number;
    };
    if (existing.runId === run.id && existing.pid === process.pid)
      await unlink(path);
  } catch {
    /* the lock was already removed or belongs to another process */
  }
  run.lock = undefined;
}
async function loadProjects() {
  if (existsSync(projectsFile))
    savedProjects = JSON.parse(
      await readFile(projectsFile, "utf8"),
    ) as ProjectProfile[];
}
async function persistProjects() {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(projectsFile, JSON.stringify(savedProjects, null, 2));
}

type GoalBuddyPreviewInput = {
  statePath: string;
  projectPath: string;
  expectedStateSha256?: string;
};

function goalBuddyStringList(value: unknown, field: string) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))
    throw new Error(`GoalBuddy active task ${field} must be a list of non-empty strings.`);
  return value.map((item) => item.trim());
}

export async function previewGoalBuddyTask(input: GoalBuddyPreviewInput) {
  if (!input?.statePath || !input?.projectPath)
    throw new Error("statePath and projectPath are required.");
  const statePath = resolve(input.statePath);
  const projectPath = resolve(input.projectPath);
  const source = await readFile(statePath);
  const stateSha256 = createHash("sha256").update(source).digest("hex");
  if (input.expectedStateSha256 && input.expectedStateSha256 !== stateSha256)
    throw new Error("Selected GoalBuddy state.yaml changed after preview.");
  const board = parse(source.toString("utf8")) as {
    goal?: { slug?: unknown; title?: unknown };
    active_task?: unknown;
    tasks?: unknown;
  };
  if (!Array.isArray(board?.tasks))
    throw new Error("GoalBuddy state.yaml must contain tasks.");
  const active = board.tasks.filter(
    (candidate): candidate is Record<string, unknown> =>
      Boolean(candidate) && typeof candidate === "object" &&
      (candidate as Record<string, unknown>).status === "active",
  );
  if (active.length !== 1)
    throw new Error(`GoalBuddy state.yaml must contain exactly one active task; found ${active.length}.`);
  const task = active[0];
  const externalTaskId = typeof task.id === "string" ? task.id.trim() : "";
  const objective = typeof task.objective === "string" ? task.objective.trim() : "";
  const goalSlug = typeof board.goal?.slug === "string" ? board.goal.slug.trim() : "";
  const goalTitle = typeof board.goal?.title === "string" ? board.goal.title.trim() : goalSlug;
  if (!externalTaskId || !objective || !goalSlug)
    throw new Error("GoalBuddy goal slug, active task id, and objective are required.");
  if (board.active_task !== externalTaskId)
    throw new Error("GoalBuddy active_task must match the single active task id.");
  const allowedPaths = goalBuddyStringList(task.allowed_files, "allowed_files");
  const verificationCommands = goalBuddyStringList(task.verify, "verify");
  const executionGuards = goalBuddyStringList(task.stop_if, "stop_if");
  const orchestratorSync = task.orchestrator_sync && typeof task.orchestrator_sync === "object"
    ? task.orchestrator_sync as OrchestratorGoalSyncV1
    : undefined;
  const goalBuddy: GoalBuddyTaskLinkV1 = {
    goalSlug,
    goalTitle: goalTitle || goalSlug,
    externalTaskId,
    objective,
    statePath,
    stateSha256,
  };
  const taskInput: TaskInput = {
    key: externalTaskId,
    title: objective,
    prompt: objective,
    allowedPaths,
    verificationCommands,
    executionGuards,
    externalTaskId,
    goalBuddy,
  };
  return {
    contract_type: "GoalBuddyTaskPreviewV1" as const,
    contract_version: "1.0" as const,
    source: { statePath, stateSha256 },
    orchestratorSync,
    taskInput,
    queue: {
      project: { path: projectPath },
      tasks: [taskInput],
      git: { checkpointCommits: false },
    },
    runRequest: { statePath, projectPath, expectedStateSha256: stateSha256 },
  };
}

export function createGoalReceiptEnvelopeV1(
  run: Run,
  task: Task,
  sourceStateUnchanged: boolean,
): GoalReceiptEnvelopeV1 {
  const link = task.goalBuddy;
  if (!link || !task.externalTaskId)
    throw new Error("Task does not contain GoalBuddy linkage.");
  return validateGoalReceiptEnvelopeV1({
    contract_type: "GoalReceiptEnvelopeV1",
    contract_version: "1.0",
    created_at: timestamp(),
    goal: {
      slug: link.goalSlug,
      title: link.goalTitle,
      state_path: link.statePath,
      state_sha256: link.stateSha256,
    },
    task: {
      external_task_id: task.externalTaskId,
      objective: link.objective,
      allowed_paths: task.allowedPaths ?? [],
      verification_commands: task.verificationCommands ?? [],
      execution_guards: task.executionGuards ?? [],
    },
    repository: { path: run.project.path },
    orchestrator: { run_id: run.id, task_id: task.id },
    outcome: { task_status: task.status, outcome_class: outcomeClass(task.status) },
    source_state_unchanged: sourceStateUnchanged,
  });
}

export async function writeGoalReceiptEnvelopeV1(run: Run, task: Task) {
  const link = task.goalBuddy;
  if (!link) throw new Error("Task does not contain GoalBuddy linkage.");
  let sourceStateUnchanged = false;
  try {
    const current = await readFile(link.statePath);
    sourceStateUnchanged = createHash("sha256").update(current).digest("hex") === link.stateSha256;
  } catch {
    sourceStateUnchanged = false;
  }
  if (!sourceStateUnchanged) {
    task.status = "failed";
    task.log.push("GoalBuddy source state changed or became unreadable after preview.");
  }
  const path = join(runsDirectory, run.id, `${task.id}-goal-receipt-v1.json`);
  task.goalReceiptPath = path;
  const envelope = createGoalReceiptEnvelopeV1(run, task, sourceStateUnchanged);
  await writeJsonAtomically(path, envelope);
  return { path, envelope };
}

class GoalBuddySyncConflict extends Error {}

function isSameGoalBuddySync(
  value: unknown,
  run: Run,
  task: Task,
  receiptPath: string,
): value is OrchestratorGoalSyncV1 {
  if (!value || typeof value !== "object") return false;
  const sync = value as Partial<OrchestratorGoalSyncV1>;
  return sync.contract_type === "OrchestratorGoalSyncV1" &&
    sync.run_id === run.id &&
    sync.task_id === task.id &&
    sync.external_task_id === task.externalTaskId &&
    sync.receipt_path === receiptPath;
}

export async function syncGoalBuddyTaskReceipt(
  run: Run,
  task: Task,
  written: { path: string; envelope: GoalReceiptEnvelopeV1 },
) {
  const link = task.goalBuddy;
  if (!link || !task.externalTaskId)
    throw new Error("Task does not contain GoalBuddy linkage.");

  const source = await readFile(link.statePath);
  const document = parseDocument(source.toString("utf8"));
  if (document.errors.length)
    throw new Error(`GoalBuddy state.yaml is invalid: ${document.errors[0].message}`);
  const board = document.toJS() as { active_task?: unknown; tasks?: unknown };
  if (!Array.isArray(board.tasks))
    throw new GoalBuddySyncConflict("GoalBuddy state.yaml no longer contains tasks.");
  const matchingIndexes = board.tasks
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) =>
      Boolean(candidate) && typeof candidate === "object" &&
      (candidate as Record<string, unknown>).id === task.externalTaskId
    );
  if (matchingIndexes.length !== 1)
    throw new GoalBuddySyncConflict("GoalBuddy task linkage is no longer unique.");
  const { candidate, index } = matchingIndexes[0];
  const boardTask = candidate as Record<string, unknown>;

  if (isSameGoalBuddySync(boardTask.orchestrator_sync, run, task, written.path)) {
    const synchronizedAt = (boardTask.orchestrator_sync as OrchestratorGoalSyncV1).synchronized_at;
    task.goalBuddySync = { status: "synced", synchronizedAt };
    return boardTask.orchestrator_sync as OrchestratorGoalSyncV1;
  }

  const currentSha256 = createHash("sha256").update(source).digest("hex");
  if (currentSha256 !== link.stateSha256)
    throw new GoalBuddySyncConflict("GoalBuddy state.yaml changed after preview.");
  if (board.active_task !== task.externalTaskId || boardTask.status !== "active")
    throw new GoalBuddySyncConflict("GoalBuddy active task changed after preview.");

  const sync: OrchestratorGoalSyncV1 = {
    contract_type: "OrchestratorGoalSyncV1",
    run_id: run.id,
    task_id: task.id,
    external_task_id: task.externalTaskId,
    run_status: task.status,
    outcome_class: outcomeClass(task.status),
    receipt_path: written.path,
    receipt_contract_type: "GoalReceiptEnvelopeV1",
    synchronized_at: timestamp(),
  };
  document.setIn(["tasks", index, "orchestrator_sync"], sync);
  await writeTextAtomically(link.statePath, document.toString());
  task.goalBuddySync = { status: "synced", synchronizedAt: sync.synchronized_at };
  return sync;
}

export async function runHasLiveOwner(
  run: {
    id: string;
    project: { path: string };
    lock?: { path: string; acquiredAt: string };
  },
  isAlive: (pid: number) => boolean = processIsAlive,
) {
  const path = run.lock?.path ?? join(run.project.path, projectLockName);
  try {
    const owner = JSON.parse(await readFile(path, "utf8")) as {
      runId?: string;
      pid?: number;
    };
    return owner.runId === run.id &&
      typeof owner.pid === "number" &&
      owner.pid > 0 &&
      isAlive(owner.pid);
  } catch {
    return false;
  }
}

export async function bindBeforeRecovery<T extends {
  close?: (callback: () => void) => void;
}>(
  bind: () => Promise<T>,
  recover: () => Promise<void>,
) {
  const server = await bind();
  try {
    await recover();
    return server;
  } catch (error) {
    if (typeof server.close === "function") {
      await new Promise<void>((resolveClose) => {
        try {
          server.close?.(resolveClose);
        } catch {
          resolveClose();
        }
      });
    }
    throw error;
  }
}

async function recoverInterruptedRuns() {
  if (!existsSync(runsDirectory)) return;
  const pausedRuns: Run[] = [];
  for (const entry of await readdir(runsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(runsDirectory, entry.name, "run.json");
    if (!existsSync(file)) continue;
    const run = JSON.parse(await readFile(file, "utf8")) as Run;
    if (run.status === "paused") {
      pausedRuns.push(run);
      continue;
    }
    if (run.status !== "running" || await runHasLiveOwner(run)) continue;
    recoverRun(run);
    await persist(run);
  }
  for (const run of pausedRuns.sort((left, right) =>
    (right.startedAt || "").localeCompare(left.startedAt || ""),
  )) {
    try {
      await acquireProjectLock(run);
      activeRun = run;
      activePipeline = run.pipeline
        ? await loadPersistedPipeline(run.pipeline.id)
        : undefined;
      break;
    } catch {
      /* another orchestrator owns this project */
    }
  }
}

async function loadRun(id: string) {
  const file = join(runsDirectory, id, "run.json");
  if (!existsSync(file)) return undefined;
  return JSON.parse(await readFile(file, "utf8")) as Run;
}

async function loadRunSummary(id: string): Promise<RunSummary | undefined> {
  const file = join(runsDirectory, id, "summary.json");
  if (existsSync(file)) {
    const summary = JSON.parse(await readFile(file, "utf8")) as RunSummary;
    if (summary.schemaVersion === 2) return summary;
    const run = await loadRun(id);
    if (!run) return summary;
    const refreshed = runSummary(run);
    void writeJsonAtomically(file, refreshed);
    return refreshed;
  }
  const run = await loadRun(id);
  if (!run) return undefined;
  const summary = runSummary(run);
  void writeJsonAtomically(file, summary);
  return summary;
}

async function listRuns() {
  if (!existsSync(runsDirectory)) return [];
  const entries = await readdir(runsDirectory, { withFileTypes: true });
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => loadRunSummary(entry.name).catch(() => undefined)),
  );
  return runs
    .filter((run): run is RunSummary => Boolean(run))
    .sort((left, right) =>
      (right.startedAt || "").localeCompare(left.startedAt || ""),
    );
}

function readGitStatus(cwd: string) {
  return new Promise<Set<string>>((resolveStatus) => {
    const child = spawn("git", ["status", "--porcelain=v1", "-uall"], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", () => {
      const paths = output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.slice(3).split("\\").join("/"));
      resolveStatus(new Set(paths));
    });
    child.on("error", () => resolveStatus(new Set()));
  });
}

export function usageFromEvent(line: string): Omit<UsageRecord, "phase" | "attempt" | "recordedAt"> | undefined {
  try {
    const event = JSON.parse(line) as Record<string, unknown>;
    if (event.type !== "turn.completed") return undefined;
    const usage = event.usage as Record<string, unknown> | undefined;
    if (!usage) return undefined;
    const value = (key: string) => {
      const candidate = usage[key];
      return typeof candidate === "number" && Number.isFinite(candidate)
        ? Math.max(0, Math.trunc(candidate))
        : 0;
    };
    return {
      inputTokens: value("input_tokens"),
      outputTokens: value("output_tokens"),
      cachedInputTokens: value("cached_input_tokens"),
    };
  } catch {
    return undefined;
  }
}

function recordUsage(task: Task, line: string, phase: UsageRecord["phase"], attempt: number) {
  const usage = usageFromEvent(line);
  if (!usage) return;
  task.usage ??= [];
  task.usage.push({ ...usage, phase, attempt, recordedAt: timestamp() });
}

function taskEvent(line: string) {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      item?: {
        type?: string;
        text?: string;
        message?: string;
        command?: string;
        cmd?: string;
        exit_code?: number;
      };
    };
    if (event.type === "thread.started") return "AGENT: Сессия Codex создана";
    if (event.type === "turn.started") return "AGENT: Агент приступил к задаче";
    if (event.item?.type === "agent_message" && event.item.text)
      return `AGENT: ${event.item.text}`;
    if (event.item?.type === "command_execution")
      return `COMMAND: ${event.item.command ?? event.item.cmd ?? "Команда выполняется"}${event.item.exit_code === undefined ? "" : ` (exit ${event.item.exit_code})`}`;
    if (event.item?.type === "error" && event.item.message)
      return `ERROR: Codex: ${event.item.message}`;
    return undefined;
  } catch {
    if (line.startsWith("Reading additional"))
      return "AGENT: Подготовка контекста проекта";
    if (/^warning[:\s]/i.test(line)) return `WARNING: ${line}`;
    if (/^(error|fatal)[:\s]/i.test(line)) return `ERROR: ${line}`;
    return undefined;
  }
}

function markdownReport(run: Run) {
  const limits = run.limits ?? defaultLimits;
  const heading = `# Orchestrator report — ${run.project.name}\n\n`;
  const details = [
    `Run: \`${run.id}\``,
    `Status: **${run.status}**`,
    `Project: \`${run.project.path}\``,
    `Started: ${run.startedAt ?? "—"}`,
    `Finished: ${run.finishedAt ?? "—"}`,
  ].join("\n");
  const tasks = run.tasks
    .map((task, index) => {
      const usage = (task.usage ?? []).reduce(
        (total, entry) => ({
          input: total.input + entry.inputTokens,
          output: total.output + entry.outputTokens,
          cached: total.cached + entry.cachedInputTokens,
        }),
        { input: 0, output: 0, cached: 0 },
      );
      const meta = [
        `Status: **${task.status}**`,
        `Model: ${task.model}`,
        `Model selection: ${task.requestedModel} (${task.modelSelectionReason})`,
        `Effort: ${task.effort}`,
        `Executor attempts: ${task.executionAttempts ?? 0}/${(task.maxRetries ?? limits.maxTaskRetries) + 1}`,
        `Timeout: ${task.timeoutMinutes ?? limits.taskTimeoutMinutes} min`,
        `Reviewer: ${task.reviewStatus ?? "—"}`,
        `Usage: ${usage.input} input / ${usage.output} output / ${usage.cached} cached tokens`,
      ].join("\n");
      const logs = task.log.length
        ? `\n\n## Logs\n\n\`\`\`text\n${task.log.join("\n")}\n\`\`\``
        : "";
      const output = task.finalOutput
        ? `\n\n## Codex result\n\n${task.finalOutput}`
        : "";
      const review = task.reviewOutput
        ? `\n\n## Reviewer report\n\n${task.reviewOutput}`
        : "";
      return `## ${index + 1}. ${task.title}\n\n${meta}${logs}${output}${review}`;
    })
    .join("\n\n---\n\n");
  return `${heading}${details}\n\n---\n\n${tasks}\n`;
}

export function outsideAllowedPaths(
  paths: string[],
  allowedPaths: string[] | undefined,
) {
  if (!allowedPaths?.length) return [];
  const allowed = allowedPaths.map((path) =>
    path.replace(/\\/g, "/").replace(/\/$/, ""),
  );
  return paths.filter(
    (path) =>
      !allowed.some((root) => path === root || path.startsWith(`${root}/`)),
  );
}

export function validateQueue(value: unknown): {
  project: { name: string; path: string } & ProjectSettings;
  tasks: ResolvedTask[];
  limits: Limits;
  git: GitSettings;
} {
  const queue = value as {
    project?: { name?: string; path?: string } & ProjectSettings;
    tasks?: unknown;
    limits?: Partial<Limits>;
    git?: Partial<GitSettings>;
  };
  if (
    !queue?.project?.path ||
    !Array.isArray(queue.tasks) ||
    queue.tasks.length === 0
  )
    throw new Error("Queue must include project.path and at least one task.");
  const project = queue.project;
  const projectPath = resolve(project.path!);
  if (!existsSync(projectPath))
    throw new Error(`Project path does not exist: ${projectPath}`);
  const limits = { ...defaultLimits, ...queue.limits };
  if (
    !Number.isInteger(limits.taskTimeoutMinutes) ||
    limits.taskTimeoutMinutes < 1 ||
    limits.taskTimeoutMinutes > 240
  )
    throw new Error(
      "limits.taskTimeoutMinutes must be an integer from 1 to 240.",
    );
  if (
    !Number.isInteger(limits.reviewerTimeoutMinutes) ||
    limits.reviewerTimeoutMinutes < 1 ||
    limits.reviewerTimeoutMinutes > 60
  )
    throw new Error(
      "limits.reviewerTimeoutMinutes must be an integer from 1 to 60.",
    );
  if (
    !Number.isInteger(limits.maxTaskRetries) ||
    limits.maxTaskRetries < 0 ||
    limits.maxTaskRetries > 3
  )
    throw new Error("limits.maxTaskRetries must be an integer from 0 to 3.");
  if (
    !Number.isInteger(limits.maxParallelTasks) ||
    limits.maxParallelTasks < 1 ||
    limits.maxParallelTasks > 4
  )
    throw new Error(
      "limits.maxParallelTasks must be an integer from 1 to 4.",
    );
  if (
    queue.git?.checkpointCommits !== undefined &&
    typeof queue.git.checkpointCommits !== "boolean"
  )
    throw new Error("git.checkpointCommits must be true or false.");
  const tasks = queue.tasks.map((candidate, index) => {
    const task = candidate as TaskInput;
    const effort = task.effort ?? project.defaultEffort ?? "medium";
    if (!task.title || !task.prompt)
      throw new Error(`Task ${index + 1} needs title and prompt.`);
    if (
      task.key !== undefined &&
      (typeof task.key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(task.key))
    )
      throw new Error(
        `Task ${index + 1}: key must use letters, numbers, hyphens, or underscores.`,
      );
    if (
      task.dependsOn !== undefined &&
      (!Array.isArray(task.dependsOn) ||
        task.dependsOn.some((dependency) => typeof dependency !== "string"))
    )
      throw new Error(`Task ${index + 1}: dependsOn must be a list of task keys.`);
    if (
      task.resources !== undefined &&
      (!Array.isArray(task.resources) ||
        task.resources.some(
          (resource) =>
            typeof resource !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(resource),
        ))
    )
      throw new Error(
        `Task ${index + 1}: resources must use letters, numbers, dots, hyphens, or underscores.`,
      );
    if (
      task.resources &&
      new Set(task.resources).size !== task.resources.length
    )
      throw new Error(`Task ${index + 1}: resources must not contain duplicates.`);
    if (task.model !== undefined && task.model !== "auto" && !Object.hasOwn(MODEL_IDS, task.model))
      throw new Error(`Task ${index + 1}: unsupported model.`);
    if (task.minModel !== undefined && !Object.hasOwn(MODEL_IDS, task.minModel))
      throw new Error(`Task ${index +1}: unsupported minModel.`);
    const selection = resolveTaskModel({ ...task, effort }, project);
    const model = selection.model;
    if (project.allowedModels?.length && !project.allowedModels.includes(model))
      throw new Error(
        `Task ${index + 1}: model is not enabled for this project.`,
      );
    if (!["light", "medium", "high"].includes(effort))
      throw new Error(`Task ${index + 1}: unsupported effort.`);
    if (model === "sol" && effort === "high")
      throw new Error(
        `Task ${index + 1}: Sol with high effort is disabled in MVP.`,
      );
    if (
      task.timeoutMinutes !== undefined &&
      (!Number.isInteger(task.timeoutMinutes) ||
        task.timeoutMinutes < 1 ||
        task.timeoutMinutes > 240)
    )
      throw new Error(
        `Task ${index + 1}: timeoutMinutes must be an integer from 1 to 240.`,
      );
    if (
      task.maxRetries !== undefined &&
      (!Number.isInteger(task.maxRetries) ||
        task.maxRetries < 0 ||
        task.maxRetries > 3)
    )
      throw new Error(
        `Task ${index + 1}: maxRetries must be an integer from 0 to 3.`,
      );
    if (
      task.contextProfile !== undefined &&
      (typeof task.contextProfile !== "string" ||
        !/^[a-z][a-z0-9_]*$/.test(task.contextProfile))
    )
      throw new Error(
        `Task ${index + 1}: contextProfile must use lowercase letters, numbers, and underscores.`,
      );
    if (task.maxSources !== undefined && task.contextProfile === undefined)
      throw new Error(`Task ${index + 1}: maxSources requires contextProfile.`);
    if (
      task.maxSources !== undefined &&
      (!Number.isInteger(task.maxSources) || task.maxSources < 1 || task.maxSources > 50)
    )
      throw new Error(`Task ${index + 1}: maxSources must be an integer from 1 to 50.`);
    for (const [field, value] of [
      ["allowedPaths", task.allowedPaths],
      ["verificationCommands", task.verificationCommands],
      ["executionGuards", task.executionGuards],
    ] as const) {
      if (
        value !== undefined &&
        (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))
      )
        throw new Error(`Task ${index + 1}: ${field} must be a list of non-empty strings.`);
    }
    if (task.externalTaskId !== undefined && (!task.externalTaskId.trim()))
      throw new Error(`Task ${index + 1}: externalTaskId must be a non-empty string.`);
    if (task.goalBuddy) {
      const link = task.goalBuddy;
      if (
        !link.goalSlug?.trim() || !link.goalTitle?.trim() ||
        !link.externalTaskId?.trim() || !link.objective?.trim() ||
        !link.statePath?.trim() || !/^[a-f0-9]{64}$/.test(link.stateSha256)
      )
        throw new Error(`Task ${index + 1}: invalid GoalBuddy linkage.`);
      if (task.externalTaskId !== link.externalTaskId)
        throw new Error(`Task ${index + 1}: externalTaskId must match GoalBuddy task id.`);
    }
    return { ...task, model, effort, requestedModel: selection.requestedModel, modelSelectionReason: selection.reason };
  });
  const taskKeys = new Set<string>();
  tasks.forEach((task, index) => {
    if (!task.key) return;
    if (taskKeys.has(task.key))
      throw new Error(`Task ${index + 1}: duplicate task key \"${task.key}\".`);
    taskKeys.add(task.key);
  });
  const dependencies = new Map<string, string[]>();
  tasks.forEach((task, index) => {
    if (!task.dependsOn?.length) return;
    if (!task.key)
      throw new Error(`Task ${index + 1}: key is required when dependsOn is used.`);
    if (new Set(task.dependsOn).size !== task.dependsOn.length)
      throw new Error(`Task ${index + 1}: dependsOn must not contain duplicates.`);
    task.dependsOn.forEach((dependency) => {
      if (!taskKeys.has(dependency))
        throw new Error(
          `Task ${index + 1}: dependsOn references unknown task key \"${dependency}\".`,
        );
      if (dependency === task.key)
        throw new Error(`Task ${index + 1}: a task cannot depend on itself.`);
    });
    dependencies.set(task.key, task.dependsOn);
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key))
      throw new Error(`Task dependencies contain a cycle involving \"${key}\".`);
    if (visited.has(key)) return;
    visiting.add(key);
    dependencies.get(key)?.forEach(visit);
    visiting.delete(key);
    visited.add(key);
  };
  taskKeys.forEach(visit);
  const verificationCommands =
    project.verificationCommands?.filter(Boolean) ?? [];
  if (tasks.some((task) => task.goalBuddy) && queue.git?.checkpointCommits)
    throw new Error("GoalBuddy bridge runs cannot enable automatic checkpoint commits.");
  return {
    project: {
      name: project.name || projectPath.split(/[\\/]/).pop() || "Project",
      path: projectPath,
      profileId: project.profileId,
      verificationCommands,
      defaultModel: project.defaultModel,
      defaultEffort: project.defaultEffort,
      allowedModels: project.allowedModels,
    },
    tasks,
    limits,
    git: { ...defaultGitSettings, ...queue.git },
  };
}

export function resolveTaskStatus({
  cancelled,
  skipped,
  exitCode,
  timedOut,
  violations,
}: {
  cancelled: boolean;
  skipped: boolean;
  exitCode: number;
  timedOut: boolean;
  violations: string[];
}): Status {
  if (cancelled) return "cancelled";
  if (skipped) return "skipped";
  if (timedOut) return "timed_out";
  return exitCode === 0 && violations.length === 0 ? "completed" : "failed";
}

async function ensureRunSummaries() {
  if (!existsSync(runsDirectory)) return;
  const entries = await readdir(runsDirectory, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => loadRunSummary(entry.name).catch(() => undefined)),
  );
}

function runSummary(run: Run): RunSummary {
  return {
    id: run.id,
    project: run.project,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    pipeline: run.pipeline,
    taskCount: run.tasks.length,
    schemaVersion: 2,
  };
}

function pipelineFile(pipeline: LoadedPipeline) {
  return join(pipelinesDirectory, pipeline.id, "plan.json");
}

function persistPipeline(pipeline: LoadedPipeline) {
  const file = pipelineFile(pipeline);
  return writeJsonAtomically(file, pipeline);
}

async function loadPersistedPipeline(id: string): Promise<LoadedPipeline | undefined> {
  const file = join(pipelinesDirectory, id, "plan.json");
  if (!existsSync(file)) return undefined;
  const pipeline = JSON.parse(await readFile(file, "utf8")) as LoadedPipeline;
  if (
    pipeline.id !== id ||
    !Array.isArray(pipeline.queues) ||
    !Number.isInteger(pipeline.currentIndex) ||
    pipeline.currentIndex < 0 ||
    pipeline.currentIndex >= pipeline.queues.length
  )
    throw new Error(`Saved pipeline ${id} is invalid.`);
  return pipeline;
}

function pipelineView(pipeline: LoadedPipeline): PipelineView {
  return {
    id: pipeline.id,
    currentIndex: pipeline.currentIndex,
    status: pipeline.status,
    queues: pipeline.queues.map((entry, index) => ({
      index,
      file: entry.file,
      name: entry.file === "(current queue)" ? "Текущая очередь" : basename(entry.file),
      state:
        index < pipeline.currentIndex
          ? "completed"
          : index === pipeline.currentIndex
            ? "current"
            : "pending",
    })),
  };
}

export function resolveReviewedTaskStatus(
  status: Status,
  reviewStatus?: ReviewStatus,
): Status {
  if (status !== "completed") return status;
  if (reviewStatus === "timed_out") return "timed_out";
  if (reviewStatus === "changes_requested") return "failed";
  return "completed";
}

function pathsOverlap(left: string, right: string) {
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  );
}

export function tasksConflict(left: Task, right: Task) {
  const leftResources = new Set(left.resources ?? []);
  if ((right.resources ?? []).some((resource) => leftResources.has(resource)))
    return true;
  if (!left.allowedPaths?.length || !right.allowedPaths?.length) return true;
  return left.allowedPaths.some((leftPath) =>
    right.allowedPaths!.some((rightPath) => pathsOverlap(leftPath, rightPath)),
  );
}

export function blockTasksWithFailedDependencies(tasks: Task[]) {
  const byKey = new Map(
    tasks.flatMap((task) => (task.key ? [[task.key, task] as const] : [])),
  );
  let changed = false;
  for (const task of tasks) {
    if (task.status !== "pending" || !task.dependsOn?.length) continue;
    const failedDependency = task.dependsOn.find((key) => {
      const status = byKey.get(key)?.status;
      return (
        status === "failed" ||
        status === "timed_out" ||
        status === "cancelled" ||
        status === "skipped" ||
        status === "blocked"
      );
    });
    if (!failedDependency) continue;
    task.status = "blocked";
    task.finishedAt = timestamp();
    task.log.push(`Blocked: dependency \"${failedDependency}\" did not complete.`);
    changed = true;
  }
  return changed;
}

export function selectRunnableTasks(
  tasks: Task[],
  maxTasks: number,
  runningTasks: Task[] = [],
) {
  const byKey = new Map(
    tasks.flatMap((task) => (task.key ? [[task.key, task] as const] : [])),
  );
  const selected: Task[] = [];
  for (const task of tasks) {
    if (selected.length >= maxTasks || task.status !== "pending") continue;
    if (
      task.dependsOn?.some(
        (dependency) => byKey.get(dependency)?.status !== "completed",
      )
    )
      continue;
    if ([...runningTasks, ...selected].some((other) => tasksConflict(task, other)))
      continue;
    selected.push(task);
  }
  return selected;
}

export function schedulerSnapshot(run: Run) {
  const runningTasks = run.tasks.filter((task) => task.status === "running");
  const availableSlots = Math.max(
    0,
    run.limits.maxParallelTasks - runningTasks.length,
  );
  const readyTasks = selectRunnableTasks(
    run.tasks,
    availableSlots,
    runningTasks,
  );
  return {
    maxParallelTasks: run.limits.maxParallelTasks,
    runningTaskIds: runningTasks.map((task) => task.id),
    availableSlots,
    readyTaskKeys: readyTasks.map((task) => task.key ?? task.id),
    waitingTaskKeys: run.tasks
      .filter((task) => task.status === "pending" && !readyTasks.includes(task))
      .map((task) => task.key ?? task.id),
  };
}

function isPipeline(value: unknown): value is PipelineInput {
  return Boolean(
    value &&
      typeof value === "object" &&
      "queues" in value &&
      Array.isArray((value as PipelineInput).queues),
  );
}

/** Read every queue before work begins, so a later invalid file cannot leave a partial plan running. */
export async function loadPipeline(value: unknown): Promise<LoadedPipeline> {
  if (!isPipeline(value) || value.queues.length === 0)
    throw new Error("Pipeline must include at least one queue file.");
  const queues = await Promise.all(
    value.queues.map(async (entry, index) => {
      if (!entry || typeof entry.file !== "string" || !entry.file.trim())
        throw new Error(`Pipeline queue ${index + 1} must include a file path.`);
      const file = resolve(entry.file);
      if (!existsSync(file))
        throw new Error(`Pipeline queue ${index + 1} file does not exist: ${file}`);
      let source: string;
      try {
        source = await readFile(file, "utf8");
      } catch {
        throw new Error(`Pipeline queue ${index + 1} could not be read: ${file}`);
      }
      try {
        return { file, queue: validateQueue(parse(source)) };
      } catch (error) {
        throw new Error(
          `Pipeline queue ${index + 1} is invalid (${file}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
  return { id: identifier(), queues, currentIndex: 0, status: "running" };
}

export function createRun(
  queue: ReturnType<typeof validateQueue>,
  pipeline?: Run["pipeline"],
  contexts: Array<ContextProviderResult | undefined> = [],
): Run {
  return {
    id: identifier(),
    project: queue.project,
    status: "idle",
    review: { ...defaultReviewSettings },
    limits: queue.limits,
    git: queue.git,
    pipeline,
    contextReceipts: contexts.flatMap((context) => context ? [context.receipt] : []),
    tasks: queue.tasks.map((task, index) => ({
      ...task,
      id: identifier(),
      status: "pending",
      log: [],
      context: contexts[index],
    })),
  };
}

function queueFromRun(run: Run): ReturnType<typeof validateQueue> {
  return {
    project: run.project,
    limits: run.limits,
    git: run.git,
    tasks: run.tasks.map((task) => ({
      key: task.key,
      dependsOn: task.dependsOn,
      resources: task.resources,
      title: task.title,
      prompt: task.prompt,
      model: task.model,
      minModel: task.minModel,
      effort: task.effort,
      allowedPaths: task.allowedPaths,
      verificationCommands: task.verificationCommands,
      executionGuards: task.executionGuards,
      externalTaskId: task.externalTaskId,
      goalBuddy: task.goalBuddy,
      timeoutMinutes: task.timeoutMinutes,
      maxRetries: task.maxRetries,
      contextProfile: task.contextProfile,
      maxSources: task.maxSources,
      requestedModel: task.requestedModel,
      modelSelectionReason: task.modelSelectionReason,
    })),
  };
}

async function activePipelineForAppend() {
  if (!activeRun || (activeRun.status !== "running" && activeRun.status !== "paused"))
    throw new Error("No active queue to append to.");
  if (activePipeline) return activePipeline;
  const pipeline: LoadedPipeline = {
    id: identifier(),
    queues: [{ file: "(current queue)", queue: queueFromRun(activeRun) }],
    currentIndex: 0,
    currentRunId: activeRun.id,
    status: activeRun.status,
  };
  activePipeline = pipeline;
  activeRun.pipeline = { id: pipeline.id, file: "(current queue)", index: 1, total: 1 };
  await persistPipeline(pipeline);
  return pipeline;
}

async function appendPipelineQueue(source: string, filename: string) {
  const pipeline = await activePipelineForAppend();
  let queue: ReturnType<typeof validateQueue>;
  try {
    queue = validateQueue(parse(source));
  } catch (error) {
    throw new Error(
      `Invalid appended YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const safeName = basename(filename || "queue.yaml").replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = join(pipelinesDirectory, pipeline.id, "queues", `${identifier()}-${safeName}`);
  await mkdir(join(pipelinesDirectory, pipeline.id, "queues"), { recursive: true });
  await writeFile(file, source, "utf8");
  pipeline.queues.push({ file, queue });
  activeRun!.pipeline = {
    id: pipeline.id,
    file: activeRun!.pipeline?.file ?? "(current queue)",
    index: pipeline.currentIndex + 1,
    total: pipeline.queues.length,
  };
  await Promise.all([persistPipeline(pipeline), persist(activeRun!)]);
  publish("run", activeRun);
  return {
    position: pipeline.queues.length,
    total: pipeline.queues.length,
    file,
    pipeline: pipelineView(pipeline),
  };
}

async function removePipelineQueue(index: number) {
  const pipeline = activePipeline;
  if (!pipeline) throw new Error("No active pipeline.");
  if (!Number.isInteger(index) || index <= pipeline.currentIndex)
    throw new Error("Only queued files after the current queue can be removed.");
  const entry = pipeline.queues[index];
  if (!entry) throw new Error("Queued file not found.");
  pipeline.queues.splice(index, 1);
  if (activeRun?.pipeline) activeRun.pipeline.total = pipeline.queues.length;
  const ownedQueueDirectory = resolve(pipelinesDirectory, pipeline.id, "queues");
  const file = resolve(entry.file);
  if (file.startsWith(`${ownedQueueDirectory}${process.platform === "win32" ? "\\" : "/"}`))
    await unlink(file).catch(() => undefined);
  await Promise.all([
    persistPipeline(pipeline),
    activeRun ? persist(activeRun) : Promise.resolve(),
  ]);
  if (activeRun) publish("run", activeRun);
  return pipelineView(pipeline);
}

export function recoverRun(run: Run) {
  if (run.status !== "running") return run;
  const runningTasks = run.tasks.filter(
    (candidate) => candidate.status === "running",
  );
  for (const task of runningTasks) {
    task.status = "failed";
    task.finishedAt = timestamp();
    task.exitCode = 1;
    task.log.push(
      `[${task.finishedAt}] Orchestrator process ended before Codex returned a result.`,
    );
  }
  run.status = "failed";
  run.finishedAt = timestamp();
  return run;
}

function resetTaskForRun(task: Task, sourceRunId: string) {
  return {
    ...task,
    id: identifier(),
    status: "pending" as Status,
    log: [`Restarted from run ${sourceRunId}`],
    startedAt: undefined,
    finishedAt: undefined,
    exitCode: undefined,
    timedOut: undefined,
    changedFiles: undefined,
    diff: undefined,
    finalOutput: undefined,
    reviewStatus: undefined,
    reviewOutput: undefined,
    attempts: undefined,
    executionAttempts: undefined,
    checkpoint: undefined,
  };
}

function dependentTaskKeys(tasks: Task[], rootKey?: string) {
  if (!rootKey) return new Set<string>();
  const keys = new Set([rootKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) {
      if (
        task.key &&
        !keys.has(task.key) &&
        task.dependsOn?.some((dependency) => keys.has(dependency))
      ) {
        keys.add(task.key);
        changed = true;
      }
    }
  }
  return keys;
}

export function retryRun(source: Run, task: Task): Run {
  const retryKeys = dependentTaskKeys(source.tasks, task.key);
  return {
    id: identifier(),
    project: source.project,
    status: "idle",
    review: { ...defaultReviewSettings },
    limits: source.limits ?? defaultLimits,
    git: source.git ?? defaultGitSettings,
    tasks: source.tasks.map((candidate) =>
      candidate.id === task.id || (candidate.key && retryKeys.has(candidate.key))
        ? resetTaskForRun(candidate, source.id)
        : { ...candidate, id: identifier() },
    ),
  };
}

export function resumeRun(source: Run): Run | undefined {
  if (source.tasks.every((task) => task.status === "completed")) return undefined;
  const remaining = source.tasks
    .map((task) => task.status === "completed" ? { ...task, id: identifier() } : ({
      ...task,
      id: identifier(),
      status: "pending" as Status,
      log: [`Возобновлено из run ${source.id}`],
      startedAt: undefined,
      finishedAt: undefined,
      exitCode: undefined,
      timedOut: undefined,
      changedFiles: undefined,
      diff: undefined,
      finalOutput: undefined,
      reviewStatus: undefined,
      reviewOutput: undefined,
      attempts: undefined,
      executionAttempts: undefined,
      checkpoint: undefined,
    }));
  return {
    id: identifier(),
    project: source.project,
    status: "idle",
    review: { ...defaultReviewSettings },
    limits: source.limits ?? defaultLimits,
    git: source.git ?? defaultGitSettings,
    tasks: remaining,
  };
}

async function waitForProcess(
  child: ReturnType<typeof spawn>,
  timeoutMinutes: number,
  onTimeout: () => void,
) {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    onTimeout();
    child.kill();
  }, timeoutMinutes * 60_000);
  const exitCode = await new Promise<number>((done) => {
    child.on("close", (code) => done(code ?? 1));
    child.on("error", () => done(1));
  });
  clearTimeout(timer);
  return { exitCode, timedOut };
}

async function commandSucceeds(command: string, args: string[], cwd?: string) {
  return new Promise<boolean>((done) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      done(false);
      return;
    }
    child.on("close", (code) => done(code === 0));
    child.on("error", () => done(false));
  });
}

function codexCliAvailable() {
  codexCliCheck ??= commandSucceeds(codexBin(), ["exec", "--help"]);
  return codexCliCheck;
}

async function runGit(cwd: string, args: string[]) {
  return new Promise<{ code: number; output: string }>((done) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      done({ code: 1, output: "Could not start git." });
      return;
    }
    let output = "";
    const consume = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    child.on("close", (code) =>
      done({ code: code ?? 1, output: output.trim() }),
    );
    child.on("error", (error) => done({ code: 1, output: error.message }));
  });
}

async function createCheckpoint(run: Run, task: Task) {
  if (!run.git?.checkpointCommits || !task.changedFiles?.length) return;
  const message = `orchestrator: ${task.title}`.slice(0, 200);
  const stage = await runGit(run.project.path, [
    "add",
    "--",
    ...task.changedFiles,
  ]);
  if (stage.code !== 0) {
    task.log.push(`Checkpoint не создан: git add: ${stage.output || "ошибка"}`);
    return;
  }
  const commit = await runGit(run.project.path, [
    "commit",
    "--only",
    "-m",
    message,
    "--",
    ...task.changedFiles,
  ]);
  if (commit.code !== 0) {
    task.log.push(
      `Checkpoint не создан: ${commit.output || "нет изменений для commit"}`,
    );
    return;
  }
  const head = await runGit(run.project.path, ["rev-parse", "HEAD"]);
  if (head.code !== 0) {
    task.log.push("Checkpoint создан, но hash не получен.");
    return;
  }
  task.checkpoint = { hash: head.output, message, createdAt: timestamp() };
  task.log.push(`Checkpoint создан: ${task.checkpoint.hash.slice(0, 8)}`);
}

async function readGitDiff(cwd: string, paths: string[]) {
  if (!paths.length) return "";
  return new Promise<string>((done) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", ["diff", "--no-ext-diff", "--", ...paths], {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      done("");
      return;
    }
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", () => done(output.slice(0, 100_000)));
    child.on("error", () => done(""));
  });
}

const preflightContextCache = new Map<string, Array<ContextProviderResult | undefined>>();

function contextCacheKey(queue: ReturnType<typeof validateQueue>) {
  return JSON.stringify({
    projectPath: queue.project.path,
    tasks: queue.tasks.map((task) => ({
      key: task.key,
      prompt: task.prompt,
      contextProfile: task.contextProfile,
      maxSources: task.maxSources,
    })),
  });
}

async function resolveQueueContexts(queue: ReturnType<typeof validateQueue>) {
  return Promise.all(queue.tasks.map((task, index) =>
    task.contextProfile
      ? resolveTaskContext({
          projectPath: queue.project.path,
          requestId: `context-${identifier()}-${index + 1}`,
          task: task.prompt,
          profile: task.contextProfile,
          maxSources: task.maxSources ?? 12,
        })
      : Promise.resolve(undefined),
  ));
}

export function cachePreflightContexts(queue: ReturnType<typeof validateQueue>, contexts: Array<ContextProviderResult | undefined>) {
  if (preflightContextCache.size >= 20)
    preflightContextCache.delete(preflightContextCache.keys().next().value!);
  preflightContextCache.set(contextCacheKey(queue), contexts);
}

export async function contextsForRun(queue: ReturnType<typeof validateQueue>) {
  const key = contextCacheKey(queue);
  const cached = preflightContextCache.get(key);
  if (cached) {
    preflightContextCache.delete(key);
    return cached;
  }
  return resolveQueueContexts(queue);
}

async function preflight(value: unknown) {
  const pipeline = isPipeline(value) ? await loadPipeline(value) : undefined;
  const queue = pipeline?.queues[0].queue ?? validateQueue(value);
  const agentsPath = join(queue.project.path, "AGENTS.md");
  const packageFile = join(queue.project.path, "package.json");
  const [cli, git, scripts] = await Promise.all([
    codexCliAvailable(),
    commandSucceeds(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      queue.project.path,
    ),
    existsSync(packageFile)
      ? readFile(packageFile, "utf8").then(
          (source) =>
            (JSON.parse(source) as { scripts?: Record<string, string> }).scripts ?? {},
        )
      : Promise.resolve({}),
  ]);
  const checks = queue.tasks.flatMap((task, index) => {
    const modelOk = Object.hasOwn(MODEL_IDS, task.model ?? "terra");
    return [
      {
        name: `Task ${index + 1} model`,
        ok: modelOk,
        detail: task.model ?? "terra",
      },
    ];
  });
  const contexts = await resolveQueueContexts(queue);
  if (contexts.some(Boolean)) {
    cachePreflightContexts(queue, contexts);
  }
  const result = {
    ok: cli && git && checks.every((check) => check.ok),
    checks: [
      { name: "Codex CLI", ok: cli, detail: codexBin() },
      { name: "Git repository", ok: git, detail: queue.project.path },
      {
        name: "AGENTS.md",
        ok: existsSync(agentsPath),
        detail: existsSync(agentsPath) ? "Found" : "Optional but recommended",
      },
      {
        name: "Test commands",
        ok: true,
        detail:
          queue.project.verificationCommands?.join(" · ") ||
          Object.keys(scripts)
            .filter((name) => /test|lint|typecheck|check/i.test(name))
            .join(", ") ||
          "No package scripts found",
      },
      ...checks,
      ...contexts.flatMap((context, index) => context ? [{
        name: `Task ${index + 1} context`,
        ok: true,
        detail: context.fallbackReason
          ? `Controlled fallback: ${context.fallbackReason}`
          : `${context.bundle.sources.length} source(s) from repository helper`,
      }] : []),
      ...(pipeline
        ? [
            {
              name: "Pipeline files",
              ok: true,
              detail: `${pipeline.queues.length} queues validated`,
            },
          ]
        : []),
    ],
    contextPreviews: contexts.flatMap((context, index) => context ? [{
      task: index + 1,
      profile: context.bundle.profile,
      provider: context.provider,
      fallbackReason: context.fallbackReason,
      sources: context.bundle.sources.map((source) => ({
        path: source.path,
        priority: source.priority,
        authority: source.authority,
        inclusionReason: source.inclusion_reason,
      })),
    }] : []),
  };
  return result;
}

export function buildPrompt(task: Task, project: ProjectSettings) {
  const paths = task.allowedPaths?.length
    ? `\nAllowed paths: ${task.allowedPaths.join(", ")}`
    : "";
  const verificationCommands = [
    ...(project.verificationCommands ?? []),
    ...(task.verificationCommands ?? []),
  ].filter((command, index, commands) => commands.indexOf(command) === index);
  const checks = verificationCommands.length
    ? `\n- Run these verification commands when relevant:\n${verificationCommands.map((command) => `  - ${command}`).join("\n")}`
    : "\n- Run relevant verification commands.";
  const guards = task.executionGuards?.length
    ? `\n- Stop if any execution guard applies:\n${task.executionGuards.map((guard) => `  - ${guard}`).join("\n")}`
    : "";
  const context = task.context
    ? `\n\nContext Contract v1 (${task.context.provider}${task.context.fallbackReason ? `; controlled fallback: ${task.context.fallbackReason}` : ""}):\n${task.context.bundle.sources.map((source) => `- ${source.path} [${source.priority}; ${source.authority}] — ${source.inclusion_reason}`).join("\n")}`
    : "";
  return `Work on this single task in the current repository.\n\nTask: ${task.prompt}${paths}${context}\n\nRequirements:\n- Read repository instructions, especially AGENTS.md, before changing code.\n- Keep changes within the task scope.${checks}${guards}\n- Do not create git commits.\n- Finish with changed files, checks run, and remaining risks.`;
}

async function reviewTask(run: Run, task: Task) {
  if (!run.review.enabled) {
    task.reviewStatus = "approved";
    task.log.push("Reviewer отключён в настройках");
    return;
  }
  task.reviewStatus = "pending";
  task.log.push("Запущена независимая проверка reviewer");
  await persist(run);
  publish("run", run);
  const outputFile = join(runsDirectory, run.id, `${task.id}-review.md`);
  const prompt = `Review the current git diff for this completed task. Do not edit files.\n\nTask: ${task.title}\nScope: ${task.prompt}\n\nCheck correctness, scope, allowed paths, and whether relevant verification was run. End with exactly one line: VERDICT: APPROVED or VERDICT: CHANGES_REQUESTED. Then list concise findings.`;
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      codexBin(),
      [
        "exec",
        "--ephemeral",
        "--json",
        "--cd",
        run.project.path,
        "--model",
        MODEL_IDS[run.review.model],
        "-c",
        `model_reasoning_effort=\"${run.review.effort}\"`,
        "--output-last-message",
        outputFile,
        prompt,
      ],
      {
        cwd: run.project.path,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    task.reviewStatus = "unavailable";
    task.log.push(
      `Reviewer unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const consume = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/))
      recordUsage(task, line.trim(), "reviewer", 1);
  };
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  const { exitCode, timedOut } = await waitForProcess(
    child,
    run.limits.reviewerTimeoutMinutes,
    () =>
      task.log.push(
        `Reviewer превысил лимит ${run.limits.reviewerTimeoutMinutes} мин. и был остановлен.`,
      ),
  );
  task.reviewOutput = existsSync(outputFile)
    ? (await readFile(outputFile, "utf8")).slice(0, 24_000)
    : "Reviewer did not return a report.";
  task.reviewStatus = timedOut
    ? "timed_out"
    : exitCode === 0 && /VERDICT:\s*APPROVED/i.test(task.reviewOutput)
      ? "approved"
      : exitCode === 0
        ? "changes_requested"
        : "unavailable";
  task.log.push(
    task.reviewStatus === "approved"
      ? "Reviewer: одобрено"
      : `Reviewer: ${task.reviewStatus}`,
  );
}

async function correctTask(run: Run, task: Task) {
  task.attempts = (task.attempts ?? 1) + 1;
  task.log.push(
    `Автоисправление по замечаниям reviewer (попытка ${task.attempts}/${run.review.maxCorrections + 1})`,
  );
  await persist(run);
  publish("run", run);
  const outputFile = join(
    runsDirectory,
    run.id,
    `${task.id}-fix-${task.attempts}.md`,
  );
  const prompt = `${buildPrompt(task, run.project)}\n\nReviewer found these issues:\n${task.reviewOutput ?? "No report available."}\n\nFix only the reviewer findings. Do not create a git commit.`;
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      codexBin(),
      [
        "exec",
        "--ephemeral",
        "--json",
        "--cd",
        run.project.path,
        "--model",
        MODEL_IDS[task.model],
        "-c",
        `model_reasoning_effort=\"${task.effort}\"`,
        "--output-last-message",
        outputFile,
        prompt,
      ],
      {
        cwd: run.project.path,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    task.log.push(
      `Автоисправление не запущено: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { code: 1, timedOut: false };
  }
  activeProcesses.set(task.id, child);
  const consume = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/))
      recordUsage(task, line.trim(), "correction", task.attempts ?? 1);
  };
  child.stdout?.on("data", consume);
  child.stderr?.on("data", consume);
  const { exitCode: code, timedOut } = await waitForProcess(
    child,
    task.timeoutMinutes ?? run.limits.taskTimeoutMinutes,
    () =>
      task.log.push(
        `Автоисправление превысило лимит ${task.timeoutMinutes ?? run.limits.taskTimeoutMinutes} мин. и было остановлено.`,
      ),
  );
  activeProcesses.delete(task.id);
  if (existsSync(outputFile))
    task.finalOutput = (await readFile(outputFile, "utf8")).slice(0, 24_000);
  task.log.push(
    code === 0
      ? "Автоисправление завершено"
      : "Автоисправление завершилось ошибкой",
  );
  return { code, timedOut };
}

async function pauseBeforeNextTask(run: Run) {
  if (!run.pauseRequested || isCancelled(run)) return;
  run.status = "paused";
  run.pausedAt = timestamp();
  lastSettledTask(run)?.log.push("Очередь приостановлена между задачами.");
  const resumed = new Promise<void>((done) => {
    resumePausedRun = done;
  });
  await persist(run);
  publish("run", run);
  await resumed;
}

export async function finalizeSettledTask(run: Run, task: Task) {
  let goalReceipt: Awaited<ReturnType<typeof writeGoalReceiptEnvelopeV1>> | undefined;
  if (task.goalBuddy) {
    try {
      goalReceipt = await writeGoalReceiptEnvelopeV1(run, task);
    } catch (error) {
      task.status = "failed";
      task.log.push(
        `GoalReceiptEnvelopeV1 could not be written: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (goalReceipt) {
      try {
        await syncGoalBuddyTaskReceipt(run, task, goalReceipt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        task.goalBuddySync = {
          status: error instanceof GoalBuddySyncConflict ? "conflict" : "failed",
          error: message,
        };
        task.log.push(`GoalBuddy sync could not be written: ${message}`);
      }
    }
  }
  if (task.status === "completed") await createCheckpoint(run, task);
  await persist(run);
  return goalReceipt;
}

async function executeTask(run: Run, task: Task): Promise<Status> {
    const baseline = await readGitStatus(run.project.path);
    task.status = "running";
    task.startedAt = timestamp();
    task.attempts = 1;
    task.executionAttempts = 0;
    task.timedOut = false;
    task.log.push(`Запущено: ${task.model} / ${task.effort}`);
    await persist(run);
    publish("run", run);
    const outputFile = join(runsDirectory, run.id, `${task.id}-final.md`);
    const args = [
      "exec",
      "--ephemeral",
      "--json",
      "--cd",
      run.project.path,
      "--model",
      MODEL_IDS[task.model],
      "-c",
      `model_reasoning_effort=\"${task.effort}\"`,
      "--output-last-message",
      outputFile,
      buildPrompt(task, run.project),
    ];
    const maxRetries = task.maxRetries ?? run.limits.maxTaskRetries;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      task.executionAttempts = attempt;
      task.log.push(
        `Запуск исполнителя ${attempt}/${maxRetries + 1} · лимит ${task.timeoutMinutes ?? run.limits.taskTimeoutMinutes} мин.`,
      );
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(codexBin(), args, {
          cwd: run.project.path,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        task.exitCode = 1;
        task.log.push(
          `Could not start Codex CLI: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }
      activeProcesses.set(task.id, child);
      const consume = (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          recordUsage(task, line.trim(), "executor", attempt);
          const readable = line.trim() && taskEvent(line.trim());
          if (readable) task.log.push(readable.slice(0, 1600));
        }
        publish("log", {
          runId: run.id,
          taskId: task.id,
          lines: task.log.slice(-8),
        });
      };
      child.stdout?.on("data", consume);
      child.stderr?.on("data", consume);
      const result = await waitForProcess(
        child,
        task.timeoutMinutes ?? run.limits.taskTimeoutMinutes,
        () =>
          task.log.push(
            `Задача превысила лимит ${task.timeoutMinutes ?? run.limits.taskTimeoutMinutes} мин. и была остановлена.`,
          ),
      );
      activeProcesses.delete(task.id);
      task.exitCode = result.exitCode;
      task.timedOut ||= result.timedOut;
      if (task.exitCode === 0 || isCancelled(run) || skippedTaskIds.has(task.id))
        break;
      if (attempt <= maxRetries)
        task.log.push(
          `Попытка ${attempt} завершилась с ошибкой; повторный запуск.`,
        );
    }
    task.finishedAt = timestamp();
    if (existsSync(outputFile))
      task.finalOutput = (await readFile(outputFile, "utf8")).slice(0, 24_000);
    const changed = await readGitStatus(run.project.path);
    task.changedFiles = [...changed].filter((path) => !baseline.has(path));
    task.diff = await readGitDiff(run.project.path, task.changedFiles);
    const violations = outsideAllowedPaths(
      task.changedFiles,
      task.allowedPaths,
    );
    if (violations.length)
      task.log.push(
        `Остановка: изменены файлы вне allowedPaths — ${violations.join(", ")}`,
      );
    task.status = resolveTaskStatus({
      cancelled: isCancelled(run),
      skipped: skippedTaskIds.has(task.id),
      exitCode: task.exitCode ?? 1,
      timedOut: Boolean(task.timedOut),
      violations,
    });
    if (task.status === "skipped") {
      task.log.push("Пропущено пользователем");
      skippedTaskIds.delete(task.id);
    }
    if (task.status === "completed") {
      await reviewTask(run, task);
      if (
        task.reviewStatus === "changes_requested" &&
        (task.attempts ?? 1) <= run.review.maxCorrections &&
        !isCancelled(run)
      ) {
        const fixResult = await correctTask(run, task);
        if (fixResult.timedOut) task.status = "timed_out";
        else if (fixResult.code === 0 && !isCancelled(run))
          await reviewTask(run, task);
      }
      task.status = resolveReviewedTaskStatus(task.status, task.reviewStatus);
      if (task.reviewStatus === "unavailable")
        task.log.push("Reviewer unavailable: task result retained without reviewer approval.");
    }
    await finalizeSettledTask(run, task);
    publish("run", run);
    return task.status;
}

async function executeQueue(run: Run) {
  run.status = "running";
  run.startedAt ??= timestamp();
  run.pausedAt = undefined;
  await persist(run);
  publish("run", run);
  const running = new Map<string, Promise<{ id: string; status: Status }>>();
  const startTask = (task: Task) => {
    const execution = executeTask(run, task)
      .then((status) => ({ id: task.id, status }))
      .catch(async (error) => {
        task.status = "failed";
        task.finishedAt = timestamp();
        task.exitCode ??= 1;
        task.log.push(
          `Task execution failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
        );
        await persist(run);
        publish("run", run);
        return { id: task.id, status: task.status };
      });
    running.set(task.id, execution);
  };

  while (true) {
    const blocked = blockTasksWithFailedDependencies(run.tasks);
    if (blocked) {
      await persist(run);
      publish("run", run);
    }
    if (run.pauseRequested && running.size === 0 && !isCancelled(run)) {
      await pauseBeforeNextTask(run);
      continue;
    }
    if (!isCancelled(run) && !run.pauseRequested) {
      const ready = selectRunnableTasks(
        run.tasks,
        run.limits.maxParallelTasks - running.size,
        run.tasks.filter((task) => task.status === "running"),
      );
      ready.forEach(startTask);
    }
    if (running.size) {
      const settled = await Promise.race(running.values());
      running.delete(settled.id);
      continue;
    }
    if (isCancelled(run) || !run.tasks.some((task) => task.status === "pending"))
      break;

    // A validated acyclic graph cannot normally reach this branch. Preserve a
    // terminal record instead of leaving an unreachable task pending forever.
    for (const task of run.tasks.filter((task) => task.status === "pending")) {
      task.status = "blocked";
      task.finishedAt = timestamp();
      task.log.push("Blocked: no runnable dependency path remains.");
    }
    await persist(run);
    publish("run", run);
    break;
  }
  if (!isCancelled(run)) {
    if (run.tasks.some((task) => task.status === "timed_out"))
      run.status = "timed_out";
    else if (
      run.tasks.some(
        (task) => task.status === "failed" || task.status === "blocked",
      )
    )
      run.status = "failed";
    else run.status = "completed";
  }
  run.finishedAt = timestamp();
  await persist(run);
  publish("run", run);
}

async function execute(run: Run) {
  try {
    await executeQueue(run);
  } finally {
    await releaseProjectLock(run);
    await persist(run);
    publish("run", run);
    await continuePipeline(run);
  }
}

async function startPipelineQueue(pipeline: LoadedPipeline) {
  const entry = pipeline.queues[pipeline.currentIndex];
  if (!entry) return;
  const contexts = await contextsForRun(entry.queue);
  const run = createRun(entry.queue, {
    id: pipeline.id,
    file: entry.file,
    index: pipeline.currentIndex + 1,
    total: pipeline.queues.length,
  }, contexts);
  await acquireProjectLock(run);
  pipeline.currentRunId = run.id;
  activeRun = run;
  // A run must be durable before its executor starts. Besides making it visible
  // to the history endpoint immediately, this keeps a launch from disappearing
  // if the process exits while the executor is being scheduled.
  await Promise.all([persistPipeline(pipeline), persist(run)]);
  publish("run", run);
  void execute(run);
}

async function continuePipeline(run: Run) {
  const pipeline = activePipeline;
  if (!pipeline || pipeline.currentRunId !== run.id) return;
  if (run.status !== "completed") {
    pipeline.status = run.status;
    await persistPipeline(pipeline);
    return;
  }
  pipeline.currentIndex += 1;
  if (pipeline.currentIndex >= pipeline.queues.length) {
    pipeline.status = "completed";
    await persistPipeline(pipeline);
    return;
  }
  try {
    await startPipelineQueue(pipeline);
  } catch (error) {
    pipeline.status = "failed";
    await persistPipeline(pipeline);
    lastSettledTask(run)?.log.push(
      `Pipeline could not start the next queue: ${error instanceof Error ? error.message : String(error)}`,
    );
    await persist(run);
    publish("run", run);
  }
}

function normalizeProjectProfile(
  value: unknown,
  id = identifier(),
): ProjectProfile {
  const input = value as Partial<ProjectProfile>;
  const path = input.path ? resolve(input.path) : "";
  const allowedModels = input.allowedModels?.filter((model): model is Model =>
    Object.hasOwn(MODEL_IDS, model),
  ) ?? ["luna", "terra", "sol"];
  if (!input.name?.trim() || !path || !existsSync(path))
    throw new Error("Project name and an existing path are required.");
  if (!Object.hasOwn(MODEL_IDS, input.defaultModel ?? "terra"))
    throw new Error("Invalid default model.");
  if (!["light", "medium", "high"].includes(input.defaultEffort ?? "medium"))
    throw new Error("Invalid default effort.");
  if (
    !allowedModels.length ||
    !allowedModels.includes(input.defaultModel ?? "terra")
  )
    throw new Error("Default model must be enabled for the project.");
  return {
    id,
    name: input.name.trim(),
    path,
    verificationCommands: (input.verificationCommands ?? [])
      .map((command) => command.trim())
      .filter(Boolean),
    defaultModel: input.defaultModel ?? "terra",
    defaultEffort: input.defaultEffort ?? "medium",
    allowedModels,
  };
}

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(
  express.text({
    type: ["application/yaml", "text/yaml", "text/plain"],
    limit: "1mb",
  }),
);
app.get("/api/health", (_, response) =>
  response.json({
    ok: true,
    service: "codex-orchestrator",
    apiVersion: 1,
    codexBin: codexBin(),
    cliModelIds: MODEL_IDS,
  }),
);
app.get("/api/run", (_, response) => response.json(activeRun ?? null));
app.get("/api/run/scheduler", (_, response) =>
  response.json(activeRun ? schedulerSnapshot(activeRun) : null),
);
app.get("/api/pipeline", (_, response) =>
  response.json(activePipeline ? pipelineView(activePipeline) : null),
);
app.get("/api/pipeline/:id", async (request, response) => {
  try {
    const pipeline = await loadPersistedPipeline(request.params.id);
    return pipeline
      ? response.json(pipelineView(pipeline))
      : response.status(404).json({ error: "Pipeline not found." });
  } catch (error) {
    return response.status(500).json({
      error: error instanceof Error ? error.message : "Could not load pipeline.",
    });
  }
});
app.get("/api/projects", (_, response) => response.json(savedProjects));
app.post("/api/projects", async (request, response) => {
  try {
    const profile = normalizeProjectProfile(request.body);
    savedProjects.push(profile);
    await persistProjects();
    return response.status(201).json(profile);
  } catch (error) {
    return response
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Invalid project profile.",
      });
  }
});
app.put("/api/projects/:id", async (request, response) => {
  const index = savedProjects.findIndex(
    (project) => project.id === request.params.id,
  );
  if (index < 0)
    return response.status(404).json({ error: "Project profile not found." });
  try {
    const profile = normalizeProjectProfile(request.body, request.params.id);
    savedProjects[index] = profile;
    await persistProjects();
    return response.json(profile);
  } catch (error) {
    return response
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Invalid project profile.",
      });
  }
});
app.delete("/api/projects/:id", async (request, response) => {
  const before = savedProjects.length;
  savedProjects = savedProjects.filter(
    (project) => project.id !== request.params.id,
  );
  if (savedProjects.length === before)
    return response.status(404).json({ error: "Project profile not found." });
  await persistProjects();
  return response.status(204).end();
});
app.get("/api/runs", async (request, response) => {
  const offset = Math.max(0, Number.parseInt(String(request.query.offset ?? "0"), 10) || 0);
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(String(request.query.limit ?? "5"), 10) || 5),
  );
  const runs = await listRuns();
  return response.json({ total: runs.length, runs: runs.slice(offset, offset + limit) });
});
app.get("/api/runs/:id", async (request, response) => {
  const run = await loadRun(request.params.id);
  return run
    ? response.json(run)
    : response.status(404).json({ error: "Run not found." });
});
app.get("/api/runs/:id/metrics", async (request, response) => {
  const run = activeRun?.id === request.params.id
    ? activeRun
    : await loadRun(request.params.id);
  return run
    ? response.json(projectRunMetrics(run))
    : response.status(404).json({ error: "Run not found." });
});
app.get("/api/pipelines/:id/runs", async (request, response) => {
  const summaries = await listRuns();
  const matching = summaries.filter(
    (summary) => summary.pipeline?.id === request.params.id,
  );
  const runs = await Promise.all(matching.map((summary) => loadRun(summary.id)));
  return response.json({
    id: request.params.id,
    runs: runs.filter((run): run is Run => Boolean(run)),
  });
});
app.delete("/api/runs/:id", async (request, response) => {
  if (activeRun?.id === request.params.id)
    return response.status(409).json({ error: "The active run cannot be deleted." });
  const run = await loadRun(request.params.id);
  if (!run) return response.status(404).json({ error: "Run not found." });
  if (run.status === "running" || run.status === "paused")
    return response.status(409).json({ error: "Only finished runs can be deleted." });
  await rm(join(runsDirectory, run.id), { recursive: true, force: true });
  return response.status(204).end();
});
app.get("/api/runs/:id/report", async (request, response) => {
  const run =
    activeRun?.id === request.params.id
      ? activeRun
      : await loadRun(request.params.id);
  if (!run) return response.status(404).json({ error: "Run not found." });
  response.type("text/markdown");
  response.attachment(`orchestrator-${run.id}-report.md`);
  return response.send(markdownReport(run));
});
app.get("/api/runs/:runId/tasks/:taskId/diff", async (request, response) => {
  const run = await loadRun(request.params.runId);
  const task = run?.tasks.find(
    (candidate) => candidate.id === request.params.taskId,
  );
  if (!run || !task)
    return response.status(404).json({ error: "Task not found." });
  const file =
    typeof request.query.file === "string" ? request.query.file : undefined;
  return response.json({
    files: task.changedFiles ?? [],
    diff: file
      ? await readGitDiff(run.project.path, [file])
      : (task.diff ?? ""),
  });
});
app.post(
  "/api/runs/:runId/checkpoints/:taskId/rollback",
  async (request, response) => {
    if (activeRun?.status === "running" || activeRun?.status === "paused")
      return response
        .status(409)
        .json({ error: "Pause or finish the active run before rolling back." });
    if ((request.body as { confirm?: boolean } | undefined)?.confirm !== true)
      return response
        .status(400)
        .json({ error: "Rollback requires explicit confirmation." });
    const run = await loadRun(request.params.runId);
    const task = run?.tasks.find(
      (candidate) => candidate.id === request.params.taskId,
    );
    if (!run || !task?.checkpoint)
      return response.status(404).json({ error: "Checkpoint not found." });
    const status = await runGit(run.project.path, ["status", "--porcelain=v1"]);
    if (status.code !== 0)
      return response
        .status(409)
        .json({ error: status.output || "Could not read git status." });
    if (status.output)
      return response
        .status(409)
        .json({
          error:
            "Working tree is not clean. Commit or stash changes before rollback.",
        });
    const reset = await runGit(run.project.path, [
      "reset",
      "--hard",
      task.checkpoint.hash,
    ]);
    if (reset.code !== 0)
      return response
        .status(500)
        .json({ error: reset.output || "Git reset failed." });
    return response.json({ ok: true, checkpoint: task.checkpoint });
  },
);
app.get("/api/events", (request, response) => {
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.flushHeaders();
  subscribers.add(response);
  if (activeRun)
    response.write(`event: run\ndata: ${JSON.stringify(activeRun)}\n\n`);
  request.on("close", () => subscribers.delete(response));
});
app.post("/api/goalbuddy/preview", async (request, response) => {
  try {
    const input = typeof request.body === "string" ? parse(request.body) : request.body;
    return response.json(await previewGoalBuddyTask(input as GoalBuddyPreviewInput));
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "Invalid GoalBuddy state selection.",
    });
  }
});
app.post("/api/goalbuddy/runs", async (request, response) => {
  try {
    if (activeRun?.status === "running" || activeRun?.status === "paused")
      return response.status(409).json({ error: "A run is already active." });
    const input = typeof request.body === "string" ? parse(request.body) : request.body;
    const preview = await previewGoalBuddyTask(input as GoalBuddyPreviewInput);
    const queue = validateQueue(preview.queue);
    const run = createRun(queue, undefined, await contextsForRun(queue));
    try {
      await acquireProjectLock(run);
    } catch (error) {
      return response.status(409).json({
        error: error instanceof Error ? error.message : "Project is locked.",
      });
    }
    activePipeline = undefined;
    activeRun = run;
    await persist(run);
    void execute(run);
    return response.status(201).json(run);
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "Invalid GoalBuddy run request.",
    });
  }
});
app.post("/api/preflight", async (request, response) => {
  try {
    const result = await preflight(
      typeof request.body === "string" ? parse(request.body) : request.body,
    );
    return response.json(result);
  } catch (error) {
    return response
      .status(400)
      .json({
        ok: false,
        checks: [
          {
            name: "YAML queue",
            ok: false,
            detail: error instanceof Error ? error.message : "Invalid queue",
          },
        ],
      });
  }
});
app.post("/api/runs", async (request, response) => {
  try {
    if (activeRun?.status === "running" || activeRun?.status === "paused")
      return response.status(409).json({ error: "A run is already active." });
    const value =
      typeof request.body === "string" ? parse(request.body) : request.body;
    if (isPipeline(value)) {
      const pipeline = await loadPipeline(value);
      activePipeline = pipeline;
      try {
        await startPipelineQueue(pipeline);
        return response.status(201).json(activeRun);
      } catch (error) {
        activePipeline = undefined;
        throw error;
      }
    }
    activePipeline = undefined;
    const queue = validateQueue(value);
    const run = createRun(queue, undefined, await contextsForRun(queue));
    try {
      await acquireProjectLock(run);
    } catch (error) {
      return response
        .status(409)
        .json({
          error: error instanceof Error ? error.message : "Project is locked.",
        });
    }
    activeRun = run;
    await persist(run);
    void execute(run);
    response.status(201).json(run);
  } catch (error) {
    response
      .status(400)
      .json({
        error: error instanceof Error ? error.message : "Invalid queue.",
      });
  }
});
app.post("/api/pipeline/append", async (request, response) => {
  try {
    if (typeof request.body !== "string")
      throw new Error("Appended queue must be sent as YAML text.");
    const result = await appendPipelineQueue(
      request.body,
      request.header("X-Queue-Filename") ?? "queue.yaml",
    );
    return response.status(201).json(result);
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "Could not append queue.",
    });
  }
});
app.delete("/api/pipeline/queues/:index", async (request, response) => {
  try {
    return response.json(await removePipelineQueue(Number(request.params.index)));
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "Could not remove queued file.",
    });
  }
});
app.post("/api/pause", async (_, response) => {
  if (!activeRun || activeRun.status !== "running")
    return response.status(409).json({ error: "No running queue to pause." });
  activeRun.pauseRequested = true;
  const runningTasks = activeRun.tasks.filter(
    (candidate) => candidate.status === "running",
  );
  const pauseLogTarget = runningTasks[0] ?? lastSettledTask(activeRun);
  runningTasks.slice(1).forEach((task) =>
    task.log.push("Pause requested: no new tasks will start after active work settles."),
  );
  pauseLogTarget?.log.push(
    "Пауза запрошена: текущая задача завершится, затем очередь остановится.",
  );
  await persist(activeRun);
  publish("run", activeRun);
  return response.json(activeRun);
});
app.post("/api/continue", async (_, response) => {
  if (!activeRun || activeRun.status !== "paused")
    return response.status(409).json({ error: "No paused queue to continue." });
  activeRun.status = "running";
  activeRun.pauseRequested = false;
  activeRun.pausedAt = undefined;
  if (activePipeline) {
    activePipeline.status = "running";
    await persistPipeline(activePipeline);
  }
  lastSettledTask(activeRun)?.log.push("Очередь продолжена.");
  const resume = resumePausedRun;
  resumePausedRun = undefined;
  await persist(activeRun);
  publish("run", activeRun);
  if (resume) resume();
  else void execute(activeRun);
  return response.json(activeRun);
});
app.post("/api/cancel", async (_, response) => {
  if (
    !activeRun ||
    (activeRun.status !== "running" && activeRun.status !== "paused")
  )
    return response.status(409).json({ error: "No active run." });
  activeRun.status = "cancelled";
  if (activePipeline?.currentRunId === activeRun.id)
    activePipeline.status = "cancelled";
  activeRun.pauseRequested = false;
  const tasks = activeRun.tasks.filter(
    (candidate) => candidate.status === "running",
  );
  for (const task of tasks) {
    task.status = "cancelled";
    task.finishedAt = timestamp();
    task.log.push("Отменено пользователем");
  }
  activeProcesses.forEach((process) => process.kill());
  const resume = resumePausedRun;
  resumePausedRun = undefined;
  await persist(activeRun);
  if (activePipeline?.currentRunId === activeRun.id)
    await persistPipeline(activePipeline);
  publish("run", activeRun);
  resume?.();
  response.json(activeRun);
});
app.post("/api/skip", async (request, response) => {
  if (!activeRun || activeRun.status !== "running" || !activeProcesses.size)
    return response
      .status(409)
      .json({ error: "No task is currently running." });
  const taskId = (request.body as { taskId?: unknown })?.taskId;
  if (typeof taskId !== "string")
    return response.status(400).json({ error: "taskId is required." });
  const task = activeRun.tasks.find((candidate) => candidate.id === taskId);
  if (!task || task.status !== "running" || !activeProcesses.has(task.id))
    return response
      .status(409)
      .json({ error: "The selected task is not currently running." });
  skippedTaskIds.add(task.id);
  task.log.push("Запрошен пропуск задачи");
  activeProcesses.get(task.id)?.kill();
  await persist(activeRun);
  publish("run", activeRun);
  return response.json(activeRun);
});
app.post("/api/runs/:runId/tasks/:taskId/retry", async (request, response) => {
  if (activeRun?.status === "running" || activeRun?.status === "paused")
    return response.status(409).json({ error: "A run is already active." });
  const source = await loadRun(request.params.runId);
  const task = source?.tasks.find(
    (candidate) => candidate.id === request.params.taskId,
  );
  if (!source || !task)
    return response.status(404).json({ error: "Task not found." });
  const retry = retryRun(source, task);
  try {
    await acquireProjectLock(retry);
  } catch (error) {
    return response
      .status(409)
      .json({
        error: error instanceof Error ? error.message : "Project is locked.",
      });
  }
  activeRun = retry;
  await persist(retry);
  void execute(retry);
  return response.status(201).json(retry);
});
app.post("/api/runs/:id/resume", async (request, response) => {
  if (activeRun?.status === "running" || activeRun?.status === "paused")
    return response.status(409).json({ error: "A run is already active." });
  const source = await loadRun(request.params.id);
  if (!source) return response.status(404).json({ error: "Run not found." });
  const resumed = resumeRun(source);
  if (!resumed)
    return response
      .status(409)
      .json({ error: "All tasks in this run are already complete." });
  let pipeline: LoadedPipeline | undefined;
  try {
    if (source.pipeline) {
      pipeline = await loadPersistedPipeline(source.pipeline.id);
      if (!pipeline) throw new Error("Saved pipeline was not found.");
      pipeline.currentRunId = resumed.id;
      pipeline.status = "running";
      resumed.pipeline = {
        ...source.pipeline,
        total: pipeline.queues.length,
      };
    }
    await acquireProjectLock(resumed);
  } catch (error) {
    return response
      .status(409)
      .json({
        error: error instanceof Error ? error.message : "Project is locked.",
      });
  }
  activeRun = resumed;
  activePipeline = pipeline;
  await Promise.all([
    persist(resumed),
    pipeline ? persistPipeline(pipeline) : Promise.resolve(),
  ]);
  void execute(resumed);
  return response.status(201).json(resumed);
});
const webRoot = resolve(process.env.ORCHESTRATOR_WEB_ROOT || "dist");
app.use(express.static(webRoot));
app.get("/{*splat}", async (_, response) => {
  const index = resolve(webRoot, "index.html");
  if (existsSync(index)) return response.sendFile(index);
  return response.status(404).send("Run npm run dev for the Vite dashboard.");
});

const port = Number(process.env.PORT || 4318);
if (process.env.ORCHESTRATOR_TEST !== "1") {
  void codexCliAvailable();
  const listen = () => new Promise<ReturnType<typeof app.listen>>((resolveListen, rejectListen) => {
    const server = app.listen(port);
    server.once("error", rejectListen);
    server.once("listening", () => resolveListen(server));
  });
  void bindBeforeRecovery(
    listen,
    async () => {
      await Promise.all([recoverInterruptedRuns(), ensureRunSummaries(), loadProjects()]);
    },
  ).then(() => {
      const url = `http://localhost:${port}`;
      console.log(`Orchestrator on ${url}`);
      if (process.env.ORCHESTRATOR_NO_OPEN !== "1") {
        if (process.platform === "win32")
          spawn("cmd", ["/c", "start", "", url], {
            detached: true,
            stdio: "ignore",
          }).unref();
        else if (process.platform === "darwin")
          spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
        else
          spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      }
    })
    .catch((error) => {
      console.error(`Orchestrator failed to start: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
