import express from "express";
import Ajv2020 from "ajv8/dist/2020.js";
import { spawn } from "node:child_process";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
import { basename, dirname, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { renderProductionLegacyPromptV1 } from "./prompt-compiler-v1/legacy-prompt-renderer.mjs";
// The static imports keep exact schema snapshots embedded in the desktop server bundle.
import contextRequestV1Schema from "./context-contract-v1/schemas/context-request-v1.schema.json";
import contextBundleV1Schema from "./context-contract-v1/schemas/context-bundle-v1.schema.json";
import contextReceiptV1Schema from "./context-contract-v1/schemas/context-receipt-v1.schema.json";
import {
  applyContextProgrammaticReductionV1,
  type ContextProgrammaticReductionV1,
  type ContextPtcOptions,
} from "./programmatic-tool-calling-v1/index.ts";
import {
  providerReasoningModeV1,
  recordProviderRuntimeStateForAdapterV1,
  sanitizeProviderReplayItemsV1,
  selectProviderRuntimeContinuationV1,
  validateProviderRuntimeStateV1,
  type ProviderRuntimeAdapterV1,
  type ProviderRuntimeDecisionV1,
  type ProviderRuntimeIdentityV1,
  type ProviderRuntimeStateV1,
} from "./provider-runtime-state-v1/index.ts";
import {
  ChangeControlError,
  ChangeControlStore,
  attemptEvidenceSnapshotHashV1,
  compositePromptManifestHashV1,
  promptModelSha256V1,
  scopedInputFingerprintV1,
  type DriftAssessmentV1,
  type MergeRequestV1,
  type PlanReferenceV1,
  type CreateChangeInput,
  type CreateWaveInput,
  type DispatchWaveInput,
  type CorrectIncidentCorrelationInputV1,
  type DetectAndClassifyHaltInputV1,
  type EvaluateWardenVerdictInputV1,
  type ExecuteDoctorRepairInputV1,
  type AuthorizeTaskRetryInputV1,
  type AuthorizeWaveResumeInputV1,
  type PublishArchitectReplanReceiptInput,
  type PublishPlanAuthorizationInput,
  type PublishPlanningContractInput,
  type PublishPromptArtifactInputV1,
  type RevokePromptArtifactInputV1,
  type PublishModelRouteInputV1,
  type RevokeModelRouteInputV1,
  type BindAttemptConfigurationInputV1,
  type RecordResolvedModelExecutionInputV1,
  type PublishEvalLineageEventInputV1,
  type PublishComputedEvalReportInputV1,
  type RecordRuntimeEvalImportInputV1,
  type ResolveIncidentInputV1,
  type TrustedRepositorySnapshotV1,
  type TransitionChangeInput,
  type TransitionHaltInputV1,
  type TransitionIncidentInputV1,
  type TransitionWardenRepairLeaseInputV1,
  type TransitionTaskInput,
  type TransitionWaveInput,
  type AttemptConfigurationBindingV1,
} from "./change-control-v1/index.ts";
import {
  canonicalWorkspaceRunFieldsV1,
  checkpointWorkspaceAttemptV1 as checkpointOwnedWorkspaceAttemptV1,
  cleanupWorkspaceAttemptV1 as cleanupOwnedWorkspaceAttemptV1,
  executeMergeRequestV1 as executeOwnedMergeRequestV1,
  inspectWorkspaceAttemptV1 as inspectOwnedWorkspaceAttemptV1,
  provisionWorkspaceAttemptV1 as provisionOwnedWorkspaceAttemptV1,
  recoverWorkspaceAttemptV1 as recoverOwnedWorkspaceAttemptV1,
  recoverMergeRequestV1 as recoverOwnedMergeRequestV1,
  replayWorkspaceAttemptEventsV1 as replayOwnedWorkspaceAttemptEventsV1,
  replayWorkspaceMutationAuthorityEventsV1,
  repositoryIdentityV1 as ownedRepositoryIdentityV1,
  sealWorkspaceAttemptV1 as sealOwnedWorkspaceAttemptV1,
  serializeWorkspaceRunStateV1,
  workspaceMutationContextV1,
  workspaceReadContextV1,
  type WorkspaceAttemptTransitionEventV1,
  type WorkspaceMutationAuthorityEventV1,
  type WorkspaceMutationAuthorityV1,
  type MergeRequestTransitionEventV1,
} from "./workspace-merge-v1/index.ts";
import {
  doctorObservationHashV1,
  type DoctorAdapterContextV1,
  type DoctorAdapterObservationContextV1,
  type DoctorAdapterRegistryV1,
  type DoctorObservationV1,
  type MergeSafeAbortResumeInputV1,
  type OwnedCleanupRetryInputV1,
  type ProviderReadRetryInputV1,
  type RegisteredProcessRetryInputV1,
  type WorkspaceReconcileInputV1,
} from "./halts-incidents-v1/index.ts";
import {
  OPERATOR_PROJECTION_VIEWS_V1,
  OperatorProjectionErrorV1,
  OperatorProjectionServiceV1,
  parseOperatorProjectionQueryV1,
  type OperatorProjectionViewV1,
} from "./operator-projections-v1/index.ts";
import {
  OperatorActionContractErrorV1,
  OperatorActionServiceV1,
} from "./operator-actions-v1/index.ts";
import {
  AuditBundleErrorV1,
  AuditBundleServiceV1,
  ChangeControlAuditEvidenceAdapterV1,
  parseAuditBundleRequestV1,
} from "./audit-bundles-v1/index.ts";
import {
  OUTCOME_SCORECARD_POLICY_VERSION_V1,
  OutcomeScorecardErrorV1,
  OutcomeScorecardServiceV1,
  parseOutcomeScorecardDiscoveryRequestV1,
  type OutcomeScorecardSourcesV1,
} from "./outcome-scorecards-v1/index.ts";
export {
  canonicalWorkspaceRunFieldsV1,
  checkpointWorkspaceAttemptV1,
  cleanupWorkspaceAttemptV1,
  executeInWorkspaceAttemptV1,
  executeMergeRequestV1,
  inspectWorkspaceAttemptV1,
  provisionWorkspaceAttemptV1,
  recoverWorkspaceAttemptV1,
  recoverMergeRequestV1,
  recoverWorkspaceAttemptLeaseV1,
  replayWorkspaceAttemptEventsV1,
  replayMergeRequestEventsV1,
  replayWorkspaceMutationAuthorityEventsV1,
  repositoryIdentityV1,
  sealWorkspaceAttemptV1,
  workspacePathContainedV1,
  workspaceMutationContextV1,
  workspaceReadContextV1,
  type MergeRequestTransitionEventV1,
  WorkspaceLifecycleErrorV1,
} from "./workspace-merge-v1/index.ts";
export {
  PROVIDER_RUNTIME_STATE_VERSION,
  changedProviderRuntimeIdentityV1,
  createProviderRuntimeIdentityV1,
  providerReasoningModeV1,
  providerRuntimeIdentityFingerprintV1,
  recordProviderRuntimeStateV1,
  recordProviderRuntimeStateForAdapterV1,
  sanitizeProviderReplayItemsV1,
  selectProviderRuntimeContinuationV1,
  validateProviderRuntimeStateV1,
} from "./provider-runtime-state-v1/index.ts";
export type {
  ProviderRuntimeAdapterV1,
  ProviderReasoningModeV1,
  ProviderReasoningSummaryV1,
  ProviderReplayItemV1,
  ProviderRuntimeDecisionV1,
  ProviderRuntimeIdentityComponentV1,
  ProviderRuntimeIdentityV1,
  ProviderRuntimeStateV1,
} from "./provider-runtime-state-v1/index.ts";
export {
  CONTEXT_PTC_OPERATIONS,
  ContextPtcFailure,
  LocalDeterministicContextPtcExecutor,
  applyContextProgrammaticReductionV1,
} from "./programmatic-tool-calling-v1/index.ts";
export type {
  ContextProgrammaticReductionV1,
  ContextPtcCallResultV1,
  ContextPtcCallV1,
  ContextPtcExecutor,
  ContextPtcOptions,
  ContextPtcToolDescriptor,
} from "./programmatic-tool-calling-v1/index.ts";

type Model = "luna" | "terra" | "sol";
type RequestedModel = Model | "auto";
type Effort = "light" | "medium" | "high";
export type CodexToolRoute = "local-codex-tools";
type RuntimeEnvironment = Record<string, string | undefined>;

export function codexReasoningEffort(effort: Effort) {
  return effort === "light" ? "low" : effort;
}
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
type Checkpoint = {
  hash: string;
  parentHash: string;
  branch: string;
  ledgerId: string;
  message: string;
  createdAt: string;
};
/** Persisted for audit only. It is never an authority for a rollback. */
type CheckpointLedgerEntry = {
  ledgerId: string;
  runId: string;
  taskId: string;
  commitHash: string;
  parentHash: string;
  branch: string;
  message: string;
  createdAt: string;
};
type ProjectLock = { path: string; acquiredAt: string };
type ProjectSettings = {
  profileId?: string;
  verificationCommands?: string[];
  defaultModel?: Model;
  defaultEffort?: Effort;
  allowedModels?: Model[];
  /** Explicit, independently configured approvals for exact local apply scopes. */
  approvedApplyContracts?: TaskApplyApprovalContract[];
};
export type TaskIntent = "answer" | "review" | "diagnose" | "apply";
export type TechnicalPermission = "read_only" | "reversible_local_write";
export type SideEffectRisk = "none" | "reversible_local_write" | "external_write" | "destructive" | "costly" | "publication" | "scope_expansion" | "ambiguous";
export type TaskAuthorization = {
  /** Opt-in rollout gate. Omitted and false preserve legacy queue behavior. */
  enabled: boolean;
  /** What the user asked for; it is not inferred from the task prompt. */
  intent?: TaskIntent;
  /** The executor capability granted independently of intent. */
  technicalPermission?: TechnicalPermission;
  /** Classified side-effect risk, independently of capability and scope. */
  sideEffectRisk?: SideEffectRisk;
  /** Fresh, human-approved identifier for one reversible local apply contract. */
  approvalId?: string;
};
export type TaskApplyApprovalContract = {
  approvalId: string;
  intent: "apply";
  technicalPermission: "reversible_local_write";
  sideEffectRisk: "reversible_local_write";
  allowedPaths: string[];
  preconditions?: string[];
  verificationCommands: string[];
};
export type TaskAuthorizationEvidence = {
  contractType: "TaskAuthorizationEvidenceV1";
  enabled: boolean;
  decision: "authorized" | "denied" | "disabled";
  reason: string;
  intent?: TaskIntent;
  technicalPermission?: TechnicalPermission;
  sideEffectRisk?: SideEffectRisk;
  approvalId?: string;
  allowedPaths: string[];
  preconditions?: string[];
  verificationCommands: string[];
  scopeFingerprint: string;
  goalFingerprint: string;
  branch: string;
  authorityFingerprint: string;
  approvalContractFingerprint?: string;
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
  /** Read-only commands executed by the orchestrator before the executor starts. */
  preconditions?: string[];
  verificationCommands?: string[];
  executionGuards?: string[];
  /** Direct predecessors whose successful task-owned checkpoint must exist. */
  requiresCheckpointsFrom?: string[];
  timeoutMinutes?: number;
  maxRetries?: number;
  /** Opts the task into Context Contract v1 selection. */
  contextProfile?: string;
  /** Maximum number of context sources selected for this task. */
  maxSources?: number;
  /** Fail preflight instead of using the controlled context fallback. */
  requireRepositoryContext?: boolean;
  /** Configuration-gated task-level authorization boundary. Disabled by default. */
  authorization?: TaskAuthorization;
  /** Exact Phase 2 scope that opts a newly authorized task into Phase 3 isolation. */
  workspace?: {
    contractType: "ManagedWorkspaceBindingV1";
    contractVersion: "1.0";
    projectId: string;
    changeId: string;
    waveId: string;
    taskId: string;
  };
  /** Explicit Phase 5 opt-in. Rendered prompts are fingerprinted, never persisted. */
  promptModel?: {
    contractType: "PromptModelExecutionConfigurationV1";
    contractVersion: "1.0";
    roles: {
      executor: PromptModelRoleConfigurationV1;
      reviewer?: PromptModelRoleConfigurationV1;
      correction?: PromptModelRoleConfigurationV1;
    };
  };
};

type PromptModelRoleConfigurationV1 = {
  promptArtifactIds: string[];
  modelRouteId: string;
  compiler: { compilerId: string; version: string };
  inputSchemaVersion: string;
  expectedRuntime: {
    runtimeId: string;
    toolRoute: string;
    capabilityMapVersion: string;
  };
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
  programmaticReduction?: ContextProgrammaticReductionV1;
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
    const legacyScopeSafe = legacy.broker_or_data_scope_expanded === false;
    const splitScopeSafe = legacy.external_system_scope_expanded === false && legacy.data_scope_expanded === false;
    if (legacy.runtime_scope_expanded !== false || (!legacyScopeSafe && !splitScopeSafe))
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
    const hasOmissionMetadata = legacy.selected_source_count !== undefined
      || legacy.omitted_source_count !== undefined
      || legacy.truncated !== undefined;
    const selected = hasOmissionMetadata ? legacy.selected_source_count : sources.length;
    const omitted = hasOmissionMetadata ? legacy.omitted_source_count : 0;
    const truncated = hasOmissionMetadata ? legacy.truncated : false;
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

export function contextPtcEnabled(environment: RuntimeEnvironment = process.env) {
  return environment.ORCHESTRATOR_CONTEXT_PTC_V1 === "1";
}

export async function resolveTaskContext(
  request: ContextProviderRequest,
  primary: ContextProvider = new RepositoryContextHelperProvider(),
  fallback: ContextProvider = new FallbackContextProvider(),
  ptc: ContextPtcOptions = { enabled: contextPtcEnabled() },
) {
  let routed: ContextProviderResult;
  try { routed = await primary.provide(request); }
  catch (error) {
    const reason = error instanceof ContextProviderFailure ? error.reasonCode : "HELPER_FAILED";
    const result = await fallback.provide(request);
    result.fallbackReason = reason;
    result.receipt.reason_codes = [reason];
    result.receipt.checks = [{ check_id: "repository_helper", status: "fail", reason_codes: [reason] }, { check_id: "safe_fallback", status: "pass", reason_codes: [] }];
    validateContextContractV1("bundle", result.bundle);
    validateContextContractV1("receipt", result.receipt);
    routed = result;
  }
  return applyContextProgrammaticReductionV1(routed, ptc, validateContextContractV1);
}
type ResolvedTask = Omit<TaskInput, "model" | "effort"> & {
  model: Model;
  effort: Effort;
  requestedModel: RequestedModel;
  modelSelectionReason: string;
};
type ReviewStatus =
  "pending" | "approved" | "changes_requested" | "unavailable" | "timed_out";
type ExecutionPhase = "precondition" | "executor" | "reviewer" | "correction";
type ExecutorOutcome = "COMPLETED" | "STOPPED";
type ExecutorOutcomeAssessment = {
  disposition: "completed" | "stopped" | "invalid" | "legacy";
  outcome?: ExecutorOutcome;
  reason: string;
};
const EXECUTOR_OUTCOME_CONTRACT_VERSION = 1 as const;
const EXECUTOR_OUTCOME_MARKER = "ORCHESTRATOR_EXECUTOR_OUTCOME_V1";
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
  /** Task-owned paths retained across retry runs for authoritative review lineage. */
  retryLineageChangedFiles?: string[];
  diff?: string;
  finalOutput?: string;
  reviewStatus?: ReviewStatus;
  reviewOutput?: string;
  reviewWriteViolations?: string[];
  /** A subprocess is still responsible for this task even if an earlier phase succeeded. */
  executionPhase?: ExecutionPhase;
  attempts?: number;
  executionAttempts?: number;
  checkpoint?: Checkpoint;
  /** Machine-readable accounting emitted by Codex CLI JSON events. */
  usage?: UsageRecord[];
  context?: ContextProviderResult;
  authorizationEvidence?: TaskAuthorizationEvidence;
  /** Absent on historical records created before the executor outcome contract. */
  executorOutcomeContractVersion?: typeof EXECUTOR_OUTCOME_CONTRACT_VERSION;
  executorOutcome?: ExecutorOutcome;
  executorOutcomeReason?: string;
  /** Ephemeral provider metadata; never truth, completion, approval, or durable memory. */
  providerRuntimeState?: ProviderRuntimeStateV1;
  /** Last bounded selection persisted before an executor continuation. */
  providerRuntimeDecision?: ProviderRuntimeDecisionV1;
  providerRuntimeIdentity?: ProviderRuntimeIdentityV1;
  workspaceAttemptId?: string;
  workspacePath?: string;
  /** Non-sensitive references into the canonical Phase 5 project ledger. */
  promptModelExecutionRefs?: Array<{
    role: "executor" | "reviewer" | "correction";
    attemptOrdinal: number;
    attemptId: string;
    invocationId?: string;
    bindingId: string;
    resolutionId: string;
  }>;
};
type UsageRecord = {
  phase: "executor" | "reviewer" | "correction";
  attempt: number;
  recordedAt: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  /** Provider-reported cache population tokens, when the active provider exposes them. */
  cacheWriteTokens?: number;
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
  checkpointLedger?: CheckpointLedgerEntry[];
  lock?: ProjectLock;
  pipeline?: {
    id: string;
    file: string;
    index: number;
    total: number;
    kind?: "queues";
  };
  contextReceipts?: ContextReceiptV1[];
  workspaceAttempts?: import("./change-control-v1/index.ts").WorkspaceAttemptV1[];
  workspaceAttemptEvents?: WorkspaceAttemptTransitionEventV1[];
  workspaceMutationAuthorities?: WorkspaceMutationAuthorityV1[];
  workspaceMutationAuthorityEvents?: WorkspaceMutationAuthorityEventV1[];
  mergeRequests?: import("./change-control-v1/index.ts").MergeRequestV1[];
  mergeRequestEvents?: MergeRequestTransitionEventV1[];
  mergeReceipts?: import("./change-control-v1/index.ts").MergeReceiptV1[];
};
type PipelineInput = { queues: Array<{ file: string }> };
type LoadedPipelineEntry = {
  file: string;
  queue: ReturnType<typeof validateQueue>;
};
type LoadedPipeline = {
  id: string;
  kind?: "queues";
  queues: LoadedPipelineEntry[];
  currentIndex: number;
  currentRunId?: string;
  status: Run["status"];
  runs?: Array<{
    index: number;
    file: string;
    runId: string;
    status: Run["status"];
  }>;
};
type PipelineView = {
  id: string;
  kind: "queues";
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
  cacheWriteTokens: number;
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
    return { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, totalTokens: 0, calls: 0 };
  const totals = usage.reduce(
    (sum, record) => {
      if (!record || typeof record !== "object") return sum;
      const entry = record as Record<string, unknown>;
      sum.inputTokens += normalizedTokens(entry.inputTokens);
      sum.outputTokens += normalizedTokens(entry.outputTokens);
      sum.cachedInputTokens += normalizedTokens(entry.cachedInputTokens);
      sum.cacheWriteTokens += normalizedTokens(entry.cacheWriteTokens);
      sum.calls += 1;
      return sum;
    },
    { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, calls: 0 },
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
    cacheWriteTokens: sum.cacheWriteTokens + task.tokens.cacheWriteTokens,
    totalTokens: sum.totalTokens + task.tokens.totalTokens,
    calls: sum.calls + task.tokens.calls,
  }), { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, totalTokens: 0, calls: 0 });
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

/**
 * Terra and Sol are the established Codex CLI routes. Luna stays opt-in until
 * the installed runtime has been verified to accept it with local Codex tools.
 * This is deliberately an environment capability, not an optimistic fallback.
 */
export function installedCodexModels(environment: RuntimeEnvironment = process.env): Model[] {
  return environment.CODEX_LUNA_SUPPORTED === "1"
    ? ["luna", "terra", "sol"]
    : ["terra", "sol"];
}

export function assertCodexRouteCompatible(
  model: Model,
  effort: Effort,
  toolRoute: CodexToolRoute = "local-codex-tools",
  environment: RuntimeEnvironment = process.env,
) {
  if (!installedCodexModels(environment).includes(model))
    throw new Error(`Model ${model} is not enabled by the installed Codex runtime for ${toolRoute}.`);
  // The UI exposes only the GPT-5.6 reasoning efforts that map directly to
  // Codex's low, medium, and high settings. Do not silently coerce a route.
  if (!(["light", "medium", "high"] as string[]).includes(effort))
    throw new Error(`Reasoning effort ${effort} is not supported for ${model}.`);
  return { model: MODEL_IDS[model], reasoningEffort: codexReasoningEffort(effort), toolRoute };
}

function autoModelRecommendation(task: TaskInput): {
  model: Model;
  reason: string;
} {
  if (task.minModel === "sol")
    return { model: "sol", reason: "explicit quality-first minimum" };
  const text = `${task.title} ${task.prompt}`.toLowerCase();
  if (/\b(security|auth(?:entication|orization)?|migration|architecture|incident|production|payment|billing|concurrency|distributed|integration|debug|refactor|test|api|database|multiple files)\b/.test(text))
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
    .filter((model) => installedCodexModels().includes(model))
    .filter((model) => MODEL_RANK[model] >= MODEL_RANK[minimum]);
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
const doctorReadSuccesses = new Set<string>();
export const DOCTOR_REGISTERED_GIT_HEAD_COMMAND_HASH_V1 = createHash("sha256")
  .update("git\0rev-parse\0--verify\0HEAD^{commit}")
  .digest("hex");
export const DOCTOR_REGISTERED_GIT_HEAD_ARGUMENTS_HASH_V1 = createHash("sha256")
  .update("rev-parse\0--verify\0HEAD^{commit}")
  .digest("hex");

function productionDoctorObservationV1(
  state: DoctorObservationV1["state"],
  code: string,
  evidenceRefs: readonly string[],
): DoctorObservationV1 {
  const body = { state, observationCode: code, evidenceRefs };
  return { ...body, evidenceHash: doctorObservationHashV1(body) };
}

async function productionDoctorRunV1(runId: string) {
  const statePath = join(runsDirectory, runId, "run.json");
  if (!existsSync(statePath)) return undefined;
  const run = await loadCanonicalRunRecordV1(statePath);
  const fields = await canonicalWorkspaceRunFieldsV1(statePath);
  return { run, fields, statePath };
}

function productionDoctorAdaptersV1(): DoctorAdapterRegistryV1 {
  const providerRead = {
    observe: async (
      input: ProviderReadRetryInputV1,
      context: DoctorAdapterObservationContextV1,
    ) => {
      if (
        input.providerOperationId !== "persisted-project-snapshot-v1" ||
        input.resourceIdentity !== context.projectId
      )
        return productionDoctorObservationV1(
          "stop",
          "provider-read-not-registered",
          ["doctor:provider-read:not-registered"],
        );
      return productionDoctorObservationV1(
        doctorReadSuccesses.has(context.idempotencyKey) ? "succeeded" : "ready",
        doctorReadSuccesses.has(context.idempotencyKey)
          ? "provider-read-succeeded"
          : "provider-read-ready",
        ["doctor:provider-read:" + context.projectId],
      );
    },
    executeAttempt: async (
      _input: ProviderReadRetryInputV1,
      context: DoctorAdapterContextV1,
    ) => {
      await context.assertLiveFence();
      await resolvePersistedProjectSnapshot(context.projectId);
      doctorReadSuccesses.add(context.idempotencyKey);
      return {
        outcome: "completed" as const,
        outcomeCode: "provider-read-completed",
        evidenceRefs: ["doctor:provider-read:" + context.projectId],
      };
    },
  };
  const registeredProcess = {
    observe: async (
      input: RegisteredProcessRetryInputV1,
      context: DoctorAdapterObservationContextV1,
    ) => {
      const registered =
        input.operationId === "project-git-head-read-v1" &&
        input.operationKind === "git-read" &&
        input.commandHash === DOCTOR_REGISTERED_GIT_HEAD_COMMAND_HASH_V1 &&
        input.fixedArgumentsHash ===
          DOCTOR_REGISTERED_GIT_HEAD_ARGUMENTS_HASH_V1 &&
        input.effectContract === "read_only_non_mutating";
      if (!registered)
        return productionDoctorObservationV1(
          "stop",
          "registered-process-not-registered",
          ["doctor:registered-process:not-registered"],
        );
      return productionDoctorObservationV1(
        doctorReadSuccesses.has(context.idempotencyKey) ? "succeeded" : "ready",
        doctorReadSuccesses.has(context.idempotencyKey)
          ? "registered-process-succeeded"
          : "registered-process-ready",
        ["doctor:registered-process:" + context.projectId],
      );
    },
    executeAttempt: async (
      _input: RegisteredProcessRetryInputV1,
      context: DoctorAdapterContextV1,
    ) => {
      await context.assertLiveFence();
      await resolvePersistedProjectSnapshot(context.projectId);
      doctorReadSuccesses.add(context.idempotencyKey);
      return {
        outcome: "completed" as const,
        outcomeCode: "registered-process-completed",
        evidenceRefs: ["doctor:registered-process:" + context.projectId],
      };
    },
  };
  const workspaceReconcile = {
    observe: async (input: WorkspaceReconcileInputV1) => {
      const found = await productionDoctorRunV1(input.runId);
      const attempt = found?.fields.workspaceAttempts.find(
        (candidate) => candidate.workspaceAttemptId === input.workspaceAttemptId,
      );
      if (!found || !attempt)
        return productionDoctorObservationV1(
          "stop",
          "workspace-attempt-missing",
          ["doctor:workspace:missing"],
        );
      const state =
        attempt.state === "quarantined"
          ? "ambiguous"
          : ["active", "sealed"].includes(attempt.state)
            ? "succeeded"
            : ["provisioning", "recovery_pending"].includes(attempt.state)
              ? "ready"
              : "stop";
      return productionDoctorObservationV1(
        state,
        "workspace-" + attempt.state.replaceAll("_", "-"),
        ["workspace-attempt:" + attempt.workspaceAttemptId, "workspace-state:" + attempt.state],
      );
    },
    executeAttempt: async (
      input: WorkspaceReconcileInputV1,
      context: DoctorAdapterContextV1,
    ) => {
      await context.assertLiveFence();
      const found = await productionDoctorRunV1(input.runId);
      if (!found) throw new Error("Registered run was not found.");
      const attempt = await recoverOwnedWorkspaceAttemptV1(
        found.statePath,
        found.run.project.path,
        input.workspaceAttemptId,
      );
      return {
        outcome:
          attempt.state === "quarantined"
            ? ("ambiguous" as const)
            : ("completed" as const),
        outcomeCode: "workspace-reconcile-" + attempt.state.replaceAll("_", "-"),
        evidenceRefs: attempt.evidenceRefs,
      };
    },
  };
  const mergeRecovery = {
    observe: async (input: MergeSafeAbortResumeInputV1) => {
      const found = await productionDoctorRunV1(input.runId);
      const request = found?.fields.mergeRequests.find(
        (candidate) =>
          candidate.mergeRequestId === input.mergeRequestId &&
          candidate.workspaceAttemptId === input.workspaceAttemptId,
      );
      const receipt = found?.fields.mergeReceipts.find(
        (candidate) => candidate.mergeRequestId === input.mergeRequestId,
      );
      if (!found || !request)
        return productionDoctorObservationV1(
          "stop",
          "merge-request-missing",
          ["doctor:merge:missing"],
        );
      const state = receipt
        ? receipt.result === "quarantined"
          ? "ambiguous"
          : "succeeded"
        : request.state === "quarantined"
          ? "ambiguous"
          : "ready";
      return productionDoctorObservationV1(
        state,
        receipt ? "merge-receipt-" + receipt.result.replaceAll("_", "-") : "merge-recovery-ready",
        receipt?.evidenceRefs ?? request.evidenceRefs,
      );
    },
    executeAttempt: async (
      input: MergeSafeAbortResumeInputV1,
      context: DoctorAdapterContextV1,
    ) => {
      await context.assertLiveFence();
      const found = await productionDoctorRunV1(input.runId);
      const request = found?.fields.mergeRequests.find(
        (candidate) =>
          candidate.mergeRequestId === input.mergeRequestId &&
          candidate.workspaceAttemptId === input.workspaceAttemptId,
      );
      if (!found || !request) throw new Error("Registered merge request was not found.");
      const receipt = await recoverOwnedMergeRequestV1(
        {
          statePath: found.statePath,
          repositoryPath: found.run.project.path,
          workspaceAttemptId: input.workspaceAttemptId,
          plan: request.plan,
          verificationCommands: request.verificationCommands.map(
            ({ command }) => command,
          ),
          transitionedBy: "system:doctor-v1",
          onReplanRequired: (evidence) => recordManagedMergeDriftV1(evidence),
        },
        input.mergeRequestId,
      );
      return {
        outcome:
          receipt.result === "quarantined"
            ? ("ambiguous" as const)
            : receipt.result === "recovery_pending"
              ? ("terminal_failure" as const)
              : ("completed" as const),
        outcomeCode: "merge-recovery-" + receipt.result.replaceAll("_", "-"),
        evidenceRefs: receipt.evidenceRefs,
      };
    },
  };
  const ownedCleanup = {
    observe: async (input: OwnedCleanupRetryInputV1) => {
      const found = await productionDoctorRunV1(input.runId);
      const attempt = found?.fields.workspaceAttempts.find(
        (candidate) => candidate.workspaceAttemptId === input.workspaceAttemptId,
      );
      if (!found || !attempt)
        return productionDoctorObservationV1(
          "stop",
          "cleanup-attempt-missing",
          ["doctor:cleanup:missing"],
        );
      const state =
        attempt.state === "cleaned"
          ? "succeeded"
          : attempt.state === "quarantined"
            ? "ambiguous"
            : [
                  "active",
                  "sealed",
                  "merged",
                  "replan_required",
                  "cleanup_pending",
                  "recovery_pending",
                ].includes(attempt.state)
              ? "ready"
              : "stop";
      return productionDoctorObservationV1(
        state,
        "cleanup-" + attempt.state.replaceAll("_", "-"),
        ["workspace-attempt:" + attempt.workspaceAttemptId, "workspace-state:" + attempt.state],
      );
    },
    executeAttempt: async (
      input: OwnedCleanupRetryInputV1,
      context: DoctorAdapterContextV1,
    ) => {
      await context.assertLiveFence();
      const found = await productionDoctorRunV1(input.runId);
      if (!found) throw new Error("Registered cleanup run was not found.");
      const attempt = await cleanupOwnedWorkspaceAttemptV1(
        found.statePath,
        found.run.project.path,
        input.workspaceAttemptId,
      );
      return {
        outcome:
          attempt.state === "quarantined"
            ? ("ambiguous" as const)
            : attempt.state === "cleaned"
              ? ("completed" as const)
              : ("terminal_failure" as const),
        outcomeCode: "owned-cleanup-" + attempt.state.replaceAll("_", "-"),
        evidenceRefs: attempt.evidenceRefs,
      };
    },
  };
  return {
    "provider-read-retry-v1": providerRead,
    "registered-process-retry-v1": registeredProcess,
    "workspace-reconcile-v1": workspaceReconcile,
    "merge-safe-abort-resume-v1": mergeRecovery,
    "owned-cleanup-retry-v1": ownedCleanup,
  };
}

export const changeControlStore = new ChangeControlStore(
  join(dataDirectory, "change-control-v1"),
  {
    resolveRepositorySnapshot: resolvePersistedProjectSnapshot,
    doctorAdapters: productionDoctorAdaptersV1(),
  },
);
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
const checkpointWriteChains = new Map<string, Promise<void>>();
const taskFinalizationChains = new Map<string, Promise<void>>();
let codexCliCheck: Promise<boolean> | undefined;

/**
 * This key and the receipts derived from it deliberately never leave this
 * server process. JSON records, Git metadata, and frozen objects are all
 * attacker-controlled evidence after a restart.
 */
const managedCheckpointTrustRoot = randomBytes(32);
type ManagedCheckpointReceipt = CheckpointLedgerEntry & { canonical: string; tag: Buffer };
const managedCheckpointReceipts = new Map<string, ManagedCheckpointReceipt>();

const timestamp = () => new Date().toISOString();
const identifier = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isCancelled = (run: Run) => run.status === "cancelled";
const legacyProjectLockName = ".codex-orchestrator.lock";
const projectLocksDirectory = join(dataDirectory, "project-locks");
const projectLockPath = (projectPath: string) => {
  const resolved = resolve(projectPath);
  const identity = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  const digest = createHash("sha256").update(identity).digest("hex");
  return join(projectLocksDirectory, `${digest}.lock`);
};
const lastSettledTask = (run: Run) =>
  [...run.tasks]
    .reverse()
    .find((task) => task.status === "completed" || task.status === "skipped");

function checkpointCanonical(entry: CheckpointLedgerEntry) {
  return JSON.stringify({
    runId: entry.runId,
    taskId: entry.taskId,
    commitHash: entry.commitHash,
    parentHash: entry.parentHash,
    branch: entry.branch,
    ledgerId: entry.ledgerId,
    message: entry.message,
    createdAt: entry.createdAt,
  });
}

function checkpointTag(canonical: string) {
  return createHmac("sha256", managedCheckpointTrustRoot)
    .update(canonical)
    .digest();
}

function sameCheckpointEntry(
  left: CheckpointLedgerEntry,
  right: CheckpointLedgerEntry,
) {
  return checkpointCanonical(left) === checkpointCanonical(right);
}

function serializeCheckpointWrite<T>(
  key: string,
  operation: () => Promise<T>,
) {
  const previous = checkpointWriteChains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const settled = next.then(() => undefined, () => undefined);
  checkpointWriteChains.set(key, settled);
  void settled.finally(() => {
    if (checkpointWriteChains.get(key) === settled) checkpointWriteChains.delete(key);
  }).catch(() => undefined);
  return next;
}

function serializeTaskFinalization<T>(
  run: Run,
  _task: Task,
  operation: () => Promise<T>,
) {
  // Finalization includes the repository-target merge. Serialize all tasks
  // in one run/project so a second same-base attempt observes the first
  // committed target after its lease is released, then records drift.
  const key = `${run.id}\0${resolve(run.project.path)}`;
  const previous = taskFinalizationChains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const settled = next.then(() => undefined, () => undefined);
  taskFinalizationChains.set(key, settled);
  void settled.finally(() => {
    if (taskFinalizationChains.get(key) === settled) taskFinalizationChains.delete(key);
  }).catch(() => undefined);
  return next;
}
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

export function writeTextAtomically(file: string, content: string) {
  const previous = jsonWriteChains.get(file) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      await mkdir(dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.${identifier()}.tmp`;
      try {
        await writeFile(temporary, content);
        await renameWithTransientWindowsRetry(temporary, file);
      } catch (error) {
        await unlink(temporary).catch(() => undefined);
        throw error;
      }
  });
  jsonWriteChains.set(file, next);
  const cleanup = () => {
    if (jsonWriteChains.get(file) === next) jsonWriteChains.delete(file);
  };
  void next.then(cleanup, cleanup);
  return next;
}

const TRANSIENT_WINDOWS_RENAME_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const WINDOWS_RENAME_RETRY_DELAYS_MS = [25, 50, 100, 200, 400, 800, 1_600, 2_000] as const;

export async function renameWithTransientWindowsRetry(
  source: string,
  destination: string,
  options: {
    platform?: NodeJS.Platform;
    renameFile?: (source: string, destination: string) => Promise<void>;
    wait?: (delayMs: number) => Promise<void>;
  } = {},
) {
  const platform = options.platform ?? process.platform;
  const renameFile = options.renameFile ?? rename;
  const wait = options.wait ?? ((delayMs: number) =>
    new Promise<void>((resolveWait) => setTimeout(resolveWait, delayMs)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      await renameFile(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (
        platform !== "win32" ||
        !code ||
        !TRANSIENT_WINDOWS_RENAME_CODES.has(code) ||
        attempt >= WINDOWS_RENAME_RETRY_DELAYS_MS.length
      ) throw error;
      await wait(WINDOWS_RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}

function writeJsonAtomically(file: string, value: unknown) {
  return writeTextAtomically(file, JSON.stringify(value, null, 2));
}

function taskOwnsExecution(task: Pick<Task, "status" | "executionPhase">) {
  return task.status === "pending" || task.status === "running" || Boolean(task.executionPhase);
}

/**
 * The only run-status authority. A task is not complete while any execution
 * phase owns it, even if the executor phase itself already returned success.
 */
export function reconcileRunState(
  run: Run,
  hasLiveWork = false,
): Run["status"] {
  if (run.status === "idle" || run.status === "paused") {
    run.finishedAt = undefined;
    return run.status;
  }
  if (run.status === "cancelled") {
    for (const task of run.tasks) {
      if (
        !task.executionPhase &&
        (task.status === "pending" ||
          (task.status === "running" && !hasLiveWork))
      ) {
        task.status = "cancelled";
        task.finishedAt ??= timestamp();
      }
    }
  }
  const statusBeforeReconciliation = run.status;
  for (const task of run.tasks) {
    if (task.executionPhase) {
      task.status = "running";
      task.finishedAt = undefined;
    }
  }
  const hasTaskOwnedExecution = run.tasks.some(taskOwnsExecution);
  if (run.status === "cancelled") {
    if (hasTaskOwnedExecution) run.finishedAt = undefined;
    else run.finishedAt ??= timestamp();
    return run.status;
  }
  // A matching live project lock prevents recovery, but is not evidence that
  // this persisted run has unfinished work. Terminal task state remains final.
  if (hasTaskOwnedExecution) {
    run.status = "running";
    run.finishedAt = undefined;
    return run.status;
  }
  if (run.tasks.some((task) => task.status === "timed_out"))
    run.status = "timed_out";
  else if (run.tasks.some((task) => task.status === "failed" || task.status === "blocked"))
    run.status = "failed";
  else if (run.tasks.every((task) => task.status === "completed" || task.status === "skipped"))
    run.status = "completed";
  else
    run.status = "failed";
  if (run.status !== statusBeforeReconciliation || !run.finishedAt)
    run.finishedAt = timestamp();
  return run.status;
}

async function persist(run: Run) {
  const file = join(runsDirectory, run.id, "run.json");
  await serializeWorkspaceRunStateV1(file, async () => {
    if (existsSync(file)) {
      const fields = await canonicalWorkspaceRunFieldsV1(file);
      Object.assign(run, fields);
    }
    reconcileRunState(run);
    await writeJsonAtomically(file, run);
  });
}
export const persistRun = persist;
function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function reconcileLegacyProjectLock(projectPath: string) {
  const path = join(projectPath, legacyProjectLockName);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return;
    throw error;
  }
  let owner: { runId?: string; pid?: number } | undefined;
  try {
    owner = JSON.parse(raw) as { runId?: string; pid?: number };
  } catch {
    /* malformed legacy locks are stale */
  }
  if (owner?.pid && processIsAlive(owner.pid))
    throw new Error(
      `Project is locked by run ${owner.runId ?? "unknown"} (PID ${owner.pid}).`,
    );
  await unlink(path).catch((error) => {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      throw error;
  });
}

export async function acquireProjectLock(run: Run) {
  const path = projectLockPath(run.project.path);
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
    await reconcileLegacyProjectLock(run.project.path);
    await mkdir(projectLocksDirectory, { recursive: true });
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
  const path = run.lock?.path ?? projectLockPath(run.project.path);
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
async function recoverDoctorRepairsForStartupV1() {
  for (const project of savedProjects)
    await changeControlStore.recoverDoctorRepairs(project.id);
}
async function persistProjects() {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(projectsFile, JSON.stringify(savedProjects, null, 2));
}

export async function runHasLiveOwner(
  run: {
    id: string;
    project: { path: string };
    lock?: { path: string; acquiredAt: string };
  },
  isAlive: (pid: number) => boolean = processIsAlive,
) {
  const path = run.lock?.path ?? projectLockPath(run.project.path);
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

export async function clearDeadProjectLock(
  run: {
    id: string;
    project: { path: string };
    lock?: { path: string; acquiredAt: string };
  },
  isAlive: (pid: number) => boolean = processIsAlive,
) {
  const path = run.lock?.path ?? projectLockPath(run.project.path);
  try {
    const owner = JSON.parse(await readFile(path, "utf8")) as {
      runId?: string;
      pid?: number;
    };
    if (
      owner.runId !== run.id ||
      typeof owner.pid !== "number" ||
      owner.pid <= 0 ||
      isAlive(owner.pid)
    )
      return false;
    await unlink(path);
    run.lock = undefined;
    return true;
  } catch {
    return false;
  }
}

export async function reconcilePersistedRunOwner(
  run: {
    id: string;
    project: { path: string };
    lock?: { path: string; acquiredAt: string };
  },
  isAlive: (pid: number) => boolean = processIsAlive,
) {
  const hasLiveOwner = await runHasLiveOwner(run, isAlive);
  if (!hasLiveOwner) await clearDeadProjectLock(run, isAlive);
  return hasLiveOwner;
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

async function recoverManagedWorkspacesForStartupV1(
  run: Run,
  file: string,
) {
  const fields = await canonicalWorkspaceRunFieldsV1(file);
  Object.assign(run, fields);
  const replayed = replayOwnedWorkspaceAttemptEventsV1(
    fields.workspaceAttemptEvents,
  );
  replayWorkspaceMutationAuthorityEventsV1(
    fields.workspaceMutationAuthorityEvents,
  );
  const mergeRequests = fields.mergeRequests;
  for (const attempt of replayed.values()) {
    const matches = run.tasks.filter(
      (task) =>
        task.workspaceAttemptId === attempt.workspaceAttemptId ||
        (task.workspace?.taskId === attempt.taskId &&
          task.id === attempt.attemptId),
    );
    if (matches.length !== 1)
      throw new Error(
        `Workspace attempt ${attempt.workspaceAttemptId} has no unique managed task binding.`,
      );
    const task = matches[0];
    task.workspaceAttemptId = attempt.workspaceAttemptId;
    task.workspacePath = attempt.workspacePath;
    if (attempt.state === "cleaned" || attempt.state === "quarantined")
      continue;
    const request = mergeRequests.find(
      (candidate) =>
        candidate.workspaceAttemptId === attempt.workspaceAttemptId,
    );
    if (
      request &&
      !fields.mergeReceipts.some(
        (receipt) => receipt.mergeRequestId === request.mergeRequestId,
      )
    ) {
      const persistedDrift = await persistedManagedMergeDriftV1(
        task,
        request,
      );
      if (persistedDrift) {
        const receipt = await recoverOwnedMergeRequestV1(
          {
            statePath: file,
            repositoryPath: run.project.path,
            workspaceAttemptId: attempt.workspaceAttemptId,
            plan: request.plan,
            verificationCommands: request.verificationCommands.map(
              ({ command }) => command,
            ),
            replanOnly: true,
            transitionedBy: "managed-startup:v1",
            onReplanRequired: (evidence) =>
              recordManagedMergeDriftV1(evidence),
          },
          request.mergeRequestId,
        );
        if (
          receipt.result !== "replan_required" ||
          receipt.driftAssessmentId !== persistedDrift.assessmentId
        )
          throw new Error(
            `Managed startup did not converge the exact persisted Phase 2 drift assessment: result=${receipt.result}, receiptAssessment=${receipt.driftAssessmentId ?? "missing"}, persistedAssessment=${persistedDrift.assessmentId}.`,
          );
        task.status = "blocked";
        task.log.push(
          "Managed merge recovery requires architect replan and fresh human authorization.",
        );
        continue;
      }
      const authorized = await authorizedWorkspacePlanV1(run, task);
      // Legacy records and records whose live Phase 2 authority was removed
      // remain sealed. Startup must not synthesize replacement authority or
      // touch the target merely because a merge request was persisted.
      if (!authorized) {
        try {
          await workspaceReadContextV1(
            file,
            run.project.path,
            attempt.workspaceAttemptId,
          );
        } catch {
          await recoverOwnedWorkspaceAttemptV1(
            file,
            run.project.path,
            attempt.workspaceAttemptId,
          );
        }
        continue;
      }
      const receipt = await recoverOwnedMergeRequestV1(
        {
          statePath: file,
          repositoryPath: run.project.path,
          workspaceAttemptId: attempt.workspaceAttemptId,
          plan: authorized.reference,
          verificationCommands: managedVerificationCommandsV1(task),
          transitionedBy: "managed-startup:v1",
          onReplanRequired: (evidence) =>
            recordManagedMergeDriftV1(evidence),
        },
        request.mergeRequestId,
      );
      if (receipt.result === "merged")
        await cleanupOwnedWorkspaceAttemptV1(
          file,
          run.project.path,
          attempt.workspaceAttemptId,
        );
      else {
        task.status = "blocked";
        task.log.push(
          `Managed merge recovery requires intervention: ${receipt.result}.`,
        );
      }
      continue;
    }
    if (attempt.state === "merged") {
      await cleanupOwnedWorkspaceAttemptV1(
        file,
        run.project.path,
        attempt.workspaceAttemptId,
      );
      continue;
    }
    if (attempt.state === "sealed" && task.status === "completed") {
      const authorized = await authorizedWorkspacePlanV1(run, task);
      // A sealed source is evidence, not merge authority. Preserve legacy
      // sealed attempts exactly until a current Phase 2 authorization exists.
      if (!authorized) {
        try {
          await workspaceReadContextV1(
            file,
            run.project.path,
            attempt.workspaceAttemptId,
          );
        } catch {
          await recoverOwnedWorkspaceAttemptV1(
            file,
            run.project.path,
            attempt.workspaceAttemptId,
          );
        }
        continue;
      }
      const receipt = await executeOwnedMergeRequestV1({
        statePath: file,
        repositoryPath: run.project.path,
        workspaceAttemptId: attempt.workspaceAttemptId,
        plan: authorized.reference,
        verificationCommands: managedVerificationCommandsV1(task),
        transitionedBy: "managed-startup:v1",
        onReplanRequired: (evidence) =>
          recordManagedMergeDriftV1(evidence),
      });
      if (receipt.result === "merged")
        await cleanupOwnedWorkspaceAttemptV1(
          file,
          run.project.path,
          attempt.workspaceAttemptId,
        );
      else task.status = "blocked";
      continue;
    }
    if (
      attempt.state === "cleanup_pending" ||
      (attempt.state === "recovery_pending" &&
        attempt.evidenceRefs.includes("cleanup:requested"))
    ) {
      await cleanupOwnedWorkspaceAttemptV1(
        file,
        run.project.path,
        attempt.workspaceAttemptId,
      );
      continue;
    }
    await recoverOwnedWorkspaceAttemptV1(
      file,
      run.project.path,
      attempt.workspaceAttemptId,
    );
  }
  Object.assign(run, await canonicalWorkspaceRunFieldsV1(file));
}

async function loadCanonicalRunRecordV1(file: string): Promise<Run> {
  const run = normalizeProviderRuntimePersistenceV1(
    JSON.parse(await readFile(file, "utf8")) as Run,
  );
  Object.assign(run, await canonicalWorkspaceRunFieldsV1(file));
  return run;
}

export async function recoverPersistedRunForStartup(
  file: string,
  report: (message: string) => void = (message) => console.error(message),
): Promise<Run | undefined> {
  try {
    const run = await loadCanonicalRunRecordV1(file);
    const branch = await currentBranchIdentity(run.project.path);
    if (runRequiresReplayAuthorization(run))
      assertStoredRunAuthorizations(run, branch);
    const hasLiveOwner = await reconcilePersistedRunOwner(run);
    reconcileRunState(run, hasLiveOwner);
    if (hasLiveOwner) return undefined;
    await recoverManagedWorkspacesForStartupV1(run, file);
    if (run.status === "paused" && !run.tasks.some(taskOwnsExecution)) {
      await persist(run);
      return run;
    }
    if (run.status === "running") recoverRun(run, branch);
    await persist(run);
    return undefined;
  } catch (error) {
    const runId = basename(dirname(file));
    report(
      `Could not recover persisted run "${runId}"; it was left inactive: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return undefined;
  }
}

async function recoverInterruptedRuns() {
  if (!existsSync(runsDirectory)) return;
  const pausedRuns: Run[] = [];
  for (const entry of await readdir(runsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(runsDirectory, entry.name, "run.json");
    if (!existsSync(file)) continue;
    const pausedRun = await recoverPersistedRunForStartup(file);
    if (pausedRun) pausedRuns.push(pausedRun);
  }
  for (const run of pausedRuns.sort((left, right) =>
    (right.startedAt || "").localeCompare(left.startedAt || ""),
  )) {
    if (activeRun) continue;
    try {
      await acquireProjectLock(run);
      activeRun = run;
      activePipeline = run.pipeline
        ? await loadPersistedPipeline(run.pipeline.id)
        : undefined;
    } catch {
      /* another orchestrator owns this project */
    }
  }
}

export async function loadRun(id: string) {
  const file = join(runsDirectory, id, "run.json");
  if (!existsSync(file)) return undefined;
  const run = await loadCanonicalRunRecordV1(file);
  const branch = await currentBranchIdentity(run.project.path);
  if (runRequiresReplayAuthorization(run))
    assertStoredRunAuthorizations(run, branch);
  const before = JSON.stringify(run);
  const hasLiveOwner = await reconcilePersistedRunOwner(run);
  reconcileRunState(run, hasLiveOwner);
  if (!hasLiveOwner && run.status === "running" && run.tasks.some(taskOwnsExecution))
    recoverRun(run, branch);
  if (JSON.stringify(run) !== before) {
    await persist(run);
    publish("run", run);
  }
  return run;
}

export async function loadRunSummary(id: string): Promise<RunSummary | undefined> {
  const run = await loadRun(id);
  return run ? runSummary(run) : undefined;
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
      cacheWriteTokens: value("cache_write_tokens") || value("cache_creation_input_tokens"),
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

function isCodexNonFatalDiagnostic(message: string) {
  return /^Skill descriptions were shortened to fit the \d+% skills context budget\./i.test(message);
}

export function taskEvent(line: string) {
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
      return `${isCodexNonFatalDiagnostic(event.item.message) ? "WARNING" : "ERROR"}: Codex: ${event.item.message}`;
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
        `Provider runtime: ${task.providerRuntimeDecision
          ? `${task.providerRuntimeDecision.strategy} (${task.providerRuntimeDecision.reason}; invalidated: ${task.providerRuntimeDecision.invalidatedBy.join(", ") || "none"})`
          : "—"}`,
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
    path.replace(/\\/g, "/").replace(/\/\*\*$/, "").replace(/\/$/, ""),
  );
  return paths.filter(
    (path) =>
      !allowed.some((root) => path === root || path.startsWith(`${root}/`)),
  );
}

function authorizationScope(
  task: Pick<TaskInput, "allowedPaths" | "preconditions" | "verificationCommands">,
  project: ProjectSettings,
) {
  const preconditions = [...(task.preconditions ?? [])];
  return {
    allowedPaths: [...(task.allowedPaths ?? [])],
    ...(preconditions.length ? { preconditions } : {}),
    verificationCommands: [...new Set([...(project.verificationCommands ?? []), ...(task.verificationCommands ?? [])])],
  };
}

function exactLineEvidencePreflight(
  task: Pick<TaskInput, "prompt" | "verificationCommands">,
  project: ProjectSettings,
) {
  const requiresExactLines = [
    /\bexact\s+(?:file\s+)?paths?\s+and\s+lines?\b/i,
    /\bexact\s+(?:file|path)\/line\s+evidence\b/i,
    /\b(?:cite|report|include|provide)\b[^\r\n.]{0,80}\bexact\b[^\r\n.]{0,40}\blines?\b/i,
    /\bline-numbered\s+(?:content|evidence|output)\b/i,
    /\bточн\w*\b[^\r\n.]{0,60}\bстрок\w*\b/i,
  ].some((pattern) => pattern.test(task.prompt));
  if (!requiresExactLines)
    return {
      required: false,
      ok: true,
      detail: "No exact line-evidence requirement detected.",
    };

  const commands = [
    ...(project.verificationCommands ?? []),
    ...(task.verificationCommands ?? []),
  ];
  const hasLineNumberedReader = commands.some((command) =>
    (/\bSelect-String\b/i.test(command) && !/\s-Quiet\b/i.test(command)) ||
    (/\brg(?:\.exe)?\b/i.test(command) &&
      /(?:^|\s)(?:-n\b|--line-number\b)/i.test(command)) ||
    (/\bfindstr(?:\.exe)?\b/i.test(command) && /\s\/n\b/i.test(command)) ||
    (/\bGet-Content\b/i.test(command) &&
      /\bForEach-Object\b/i.test(command) &&
      /\+\+/.test(command)),
  );
  return hasLineNumberedReader
    ? {
        required: true,
        ok: true,
        detail: "Exact line evidence has a line-numbered content reader.",
      }
    : {
        required: true,
        ok: false,
        detail:
          "Exact line evidence is required, but verificationCommands do not include a line-numbered content reader.",
      };
}

export function reviewerEvidencePreflight(
  task: Pick<TaskInput, "prompt" | "verificationCommands">,
  project: ProjectSettings,
) {
  const exactLineEvidence = exactLineEvidencePreflight(task, project);
  if (exactLineEvidence.required) return exactLineEvidence;
  const requiresContentInspection = [
    /\b(?:review|inspect|read|validate|check)\b[^\r\n.]{0,80}\bcontents?\b/i,
    /\b(?:review|inspect|read)\b[^\r\n.]{0,80}\b(?:documents?|artifacts?|files?)\b/i,
    /\b(?:contents?|documents?|artifacts?|files?)\b[^\r\n.]{0,80}\b(?:review|inspection|validation)\b/i,
  ].some((pattern) => pattern.test(task.prompt));
  if (!requiresContentInspection) return exactLineEvidence;
  const commands = [
    ...(project.verificationCommands ?? []),
    ...(task.verificationCommands ?? []),
  ];
  const hasContentReader = commands.some(
    (command) =>
      (/\brg(?:\.exe)?\b/i.test(command) &&
        !/(?:^|\s)(?:-l\b|--files-with-matches\b|--files\b)/i.test(command)) ||
      (/\bSelect-String\b/i.test(command) && !/\s-Quiet\b/i.test(command)) ||
      /\bGet-Content\b/i.test(command) ||
      (/\bfindstr(?:\.exe)?\b/i.test(command) && /\s\/n\b/i.test(command)),
  );
  return hasContentReader
    ? {
        required: true,
        ok: true,
        detail: "Document review has content-readable evidence.",
      }
    : {
        required: true,
        ok: false,
        detail:
          "Document content review is required, but verificationCommands do not include content-readable evidence.",
      };
}

export function verificationCommandViolations(
  task: Pick<TaskInput, "allowedPaths" | "verificationCommands">,
  project: Pick<ProjectSettings, "verificationCommands">,
) {
  const commands = [
    ...(project.verificationCommands ?? []),
    ...(task.verificationCommands ?? []),
  ];
  const violations: string[] = [];
  if (
    task.allowedPaths?.length &&
    commands.some(
      (command) =>
        /\bgit(?:\.exe)?\s+diff\b[^\r\n]*(?:--quiet\b|--exit-code\b)/i.test(command) ||
        (/\bgit(?:\.exe)?\s+status\b[^\r\n]*--porcelain\b/i.test(command) &&
          /\b(?:if|throw)\b|\bexit\s+1\b|\btest\s+-z\b|\[\s+-z\b/i.test(command)),
    )
  )
    violations.push(
      "Writable tasks cannot use a post-change verification command that requires the Git worktree to be clean.",
    );
  if (
    commands.some(
      (command) =>
        /\bgit(?:\.exe)?\s+diff\b[^\r\n]*--no-index\b[^\r\n]*--check\b/i.test(
          command,
        ) && !/\bexit\s+0\b/i.test(command),
    )
  )
    violations.push(
      "PowerShell git diff --no-index --check wrappers must end with an explicit exit 0 after handling expected native exit code 1.",
    );
  if (
    commands.some(
      (command) =>
        /\bGet-Content\b/i.test(command) &&
        !/\s-TotalCount\b/i.test(command) &&
        !/\|\s*Select-Object\b[^\r\n]*(?:-First|-Last)\b/i.test(command) &&
        !/\|\s*Select-String\b/i.test(command) &&
        !/\|\s*(?:ConvertFrom-[A-Za-z]+|Test-[A-Za-z]+|Measure-Object|Out-Null)\b/i.test(
          command,
        ),
    )
  )
    violations.push(
      "Document evidence must be bounded or targeted; do not emit an entire file with Get-Content.",
    );
  return violations;
}

function isLikelyPowerShellCommand(command: string) {
  return (
    /^\s*(?:&\s*)?(?:"[^"]+\.ps1"|'[^']+\.ps1'|[^\s"';&|]+\.ps1)(?:\s|$)/i.test(
      command,
    ) ||
    /^\s*(?:pwsh(?:\.exe)?|powershell(?:\.exe)?)\b[^\r\n]*\s-File(?:\s|$)/i.test(
      command,
    ) ||
    /\$env:[A-Za-z_]/i.test(command) ||
    /(?:^|[;&|]\s*)\$[A-Za-z_]/i.test(command) ||
    /\b(?:Get|Set|Test|Select|ForEach|Where|Write|Resolve|Join|Split|ConvertTo|ConvertFrom)-[A-Za-z]+\b/i.test(command) ||
    /\b(?:foreach|param|try|catch)\s*\(/i.test(command) ||
    /@\(/.test(command)
  );
}

export function inlineCommandViolations(commands: readonly string[]) {
  const violations: string[] = [];
  if (
    commands.some(
      (command) =>
        command.length > 400 &&
        /\bpython(?:\.exe)?\b[^\r\n]*\s-c(?:\s|$)/i.test(command),
    )
  )
    violations.push(
      "Long inline Python -c verification is not supported; move it to a versioned script.",
    );
  if (
    commands.some(
      (command) =>
        command.length > 1_200 &&
        isLikelyPowerShellCommand(command) &&
        !/^\s*(?:&\s*)?(?:"[^"]+\.ps1"|'[^']+\.ps1'|[^\s"';&|]+\.ps1)(?:\s|$)/i.test(
          command,
        ),
    )
  )
    violations.push(
      "Long inline PowerShell verification is not supported; move it to a versioned .ps1 script.",
    );
  return violations;
}

async function powershellSyntaxViolation(command: string) {
  const syntaxParserTimeoutMs = 10_000;
  const encodedSource = Buffer.from(command, "utf8").toString("base64");
  const parserScript = [
    `$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedSource}'))`,
    "$tokens = $null",
    "$errors = $null",
    "[System.Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors) | Out-Null",
    "if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
  ].join("; ");
  return await new Promise<string | undefined>((resolveResult) => {
    const child = spawn(
      process.platform === "win32" ? "powershell.exe" : "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", parserScript],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    let diagnostics = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    const settle = (value: string | undefined) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolveResult(value);
    };
    timeout = setTimeout(() => {
      child.kill();
      settle(
        `PowerShell syntax parser timed out after ${syntaxParserTimeoutMs} ms.`,
      );
    }, syntaxParserTimeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      diagnostics = `${diagnostics}${chunk.toString()}`.slice(-2_000);
    });
    child.once("error", (error) =>
      settle(`PowerShell syntax parser could not start: ${error.message}`),
    );
    child.once("close", (code) =>
      settle(
        code === 0
          ? undefined
          : `PowerShell syntax error: ${diagnostics.trim() || `parser exited ${code}`}`,
      ),
    );
  });
}

export async function powershellVerificationSyntaxPreflight(
  commands: string[],
) {
  const powershellCommands = commands.filter(isLikelyPowerShellCommand);
  if (!powershellCommands.length)
    return {
      required: false,
      ok: true,
      detail: "No PowerShell verification commands detected.",
    };
  for (const command of powershellCommands) {
    const violation = await powershellSyntaxViolation(command);
    if (violation)
      return { required: true, ok: false, detail: violation };
  }
  return {
    required: true,
    ok: true,
    detail: `${powershellCommands.length} PowerShell verification command(s) parsed successfully.`,
  };
}

export function verificationCommandInvocation(command: string) {
  if (isLikelyPowerShellCommand(command))
    return {
      executable: process.platform === "win32" ? "powershell.exe" : "pwsh",
      args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
      shell: false,
    };
  return { executable: command, args: [] as string[], shell: true };
}

export function taskAllowsCorrection(
  task: Pick<TaskInput, "allowedPaths">,
) {
  return task.allowedPaths === undefined || task.allowedPaths.length > 0;
}

export function checkpointRequirementViolation(
  tasks: ReadonlyArray<{
    key?: string;
    checkpoint?: { hash?: string };
  }>,
  task: Pick<TaskInput, "requiresCheckpointsFrom">,
) {
  for (const key of task.requiresCheckpointsFrom ?? []) {
    const predecessor = tasks.find((candidate) => candidate.key === key);
    if (!predecessor?.checkpoint?.hash)
      return `Required predecessor "${key}" did not create a checkpoint.`;
  }
  return undefined;
}

function scopeFingerprint(scope: {
  allowedPaths: string[];
  preconditions?: string[];
  verificationCommands: string[];
}) {
  return createHash("sha256").update(JSON.stringify(scope)).digest("hex");
}

function taskGoalFingerprint(
  task: Partial<Pick<TaskInput, "key" | "title" | "prompt">>,
) {
  return createHash("sha256").update(JSON.stringify({
    key: task.key ?? "",
    title: task.title ?? "",
    prompt: task.prompt ?? "",
  })).digest("hex");
}

function taskAuthorityFingerprint(
  authorization: TaskAuthorization | undefined,
  project: ProjectSettings & { name?: string; path?: string },
) {
  return createHash("sha256").update(JSON.stringify({
    projectName: project.name ?? "",
    projectPath: project.path ?? "",
    approvalId: authorization?.approvalId ?? "",
  })).digest("hex");
}

function applyContractFingerprint(contract: TaskApplyApprovalContract) {
  return createHash("sha256").update(JSON.stringify(contract)).digest("hex");
}

function matchingApplyContract(
  authorization: TaskAuthorization,
  scope: {
    allowedPaths: string[];
    preconditions?: string[];
    verificationCommands: string[];
  },
  project: ProjectSettings,
) {
  const contract = project.approvedApplyContracts?.find(
    (candidate) => candidate.approvalId === authorization.approvalId,
  );
  if (!contract) return undefined;
  const contractScope = {
    allowedPaths: contract.allowedPaths,
    ...(contract.preconditions?.length
      ? { preconditions: contract.preconditions }
      : {}),
    verificationCommands: contract.verificationCommands,
  };
  return contract.intent === "apply" &&
    contract.technicalPermission === "reversible_local_write" &&
    contract.sideEffectRisk === "reversible_local_write" &&
    scopeFingerprint(contractScope) === scopeFingerprint(scope)
    ? contract
    : undefined;
}

/**
 * Evaluates the opt-in authorization boundary without inferring intent, risk, or
 * capability from the task prompt. All non-local or ambiguous effects fail closed.
 */
export function authorizeTask(
  task: Pick<TaskInput, "authorization" | "allowedPaths" | "preconditions" | "verificationCommands"> &
    Partial<Pick<TaskInput, "key" | "title" | "prompt">>,
  project: ProjectSettings = {},
  branch = "",
): TaskAuthorizationEvidence {
  const authorization = task.authorization;
  const scope = authorizationScope(task, project);
  const base = {
    contractType: "TaskAuthorizationEvidenceV1" as const,
    enabled: Boolean(authorization?.enabled),
    intent: authorization?.intent,
    technicalPermission: authorization?.technicalPermission,
    sideEffectRisk: authorization?.sideEffectRisk,
    approvalId: authorization?.approvalId,
    ...scope,
    scopeFingerprint: scopeFingerprint(scope),
    goalFingerprint: taskGoalFingerprint(task),
    branch,
    authorityFingerprint: taskAuthorityFingerprint(authorization, project),
  };
  if (!authorization?.enabled)
    return { ...base, decision: "disabled", reason: "FEATURE_DISABLED" };
  if (!authorization.intent || !authorization.technicalPermission || !authorization.sideEffectRisk)
    return { ...base, decision: "denied", reason: "AMBIGUOUS_CLASSIFICATION" };
  if (["external_write", "destructive", "costly", "publication", "scope_expansion", "ambiguous"].includes(authorization.sideEffectRisk))
    return { ...base, decision: "denied", reason: "FRESH_EXPLICIT_GATE_REQUIRED" };
  if (["answer", "review", "diagnose"].includes(authorization.intent)) {
    if (authorization.technicalPermission !== "read_only" || authorization.sideEffectRisk !== "none")
      return { ...base, decision: "denied", reason: "NON_MUTATING_CONTRACT_REQUIRED" };
    return { ...base, decision: "authorized", reason: "NON_MUTATING_AUTHORIZED" };
  }
  if (authorization.intent !== "apply" || authorization.technicalPermission !== "reversible_local_write" || authorization.sideEffectRisk !== "reversible_local_write")
    return { ...base, decision: "denied", reason: "APPLY_CONTRACT_MISMATCH" };
  if (!authorization.approvalId?.trim())
    return { ...base, decision: "denied", reason: "FRESH_EXPLICIT_GATE_REQUIRED" };
  if (!scope.allowedPaths.length || !scope.verificationCommands.length)
    return { ...base, decision: "denied", reason: "EXACT_SCOPE_REQUIRED" };
  const approval = matchingApplyContract(authorization, scope, project);
  if (!approval)
    return { ...base, decision: "denied", reason: "APPROVAL_CONTRACT_MISMATCH" };
  return {
    ...base,
    decision: "authorized",
    reason: "APPROVED_REVERSIBLE_LOCAL_APPLY",
    approvalContractFingerprint: applyContractFingerprint(approval),
  };
}

/** Replay only succeeds when current inputs and the configured approval reproduce stored evidence. */
export function replayTaskAuthorization(
  evidence: TaskAuthorizationEvidence,
  task: Pick<TaskInput, "authorization" | "allowedPaths" | "preconditions" | "verificationCommands"> &
    Partial<Pick<TaskInput, "key" | "title" | "prompt">>,
  project: ProjectSettings = {},
  branch = evidence.branch,
) {
  const replayed = authorizeTask(task, project, branch);
  return JSON.stringify(replayed) === JSON.stringify(evidence);
}

/** Verifies loaded evidence against the current task, contract, branch, and authority. */
export function verifyStoredTaskAuthorization(
  evidence: TaskAuthorizationEvidence | undefined,
  task: Pick<TaskInput, "authorization" | "allowedPaths" | "preconditions" | "verificationCommands"> &
    Partial<Pick<TaskInput, "key" | "title" | "prompt">>,
  project: ProjectSettings = {},
  branch = evidence?.branch ?? "",
) {
  if (!evidence) return false;
  return replayTaskAuthorization(evidence, task, project, branch);
}

export const codexCliProviderRuntimeAdapterV1: ProviderRuntimeAdapterV1 =
  Object.freeze({
    id: "codex-cli-ephemeral-v1",
    supportsPreviousResponseId: false,
    supportsManualReplay: false,
  });

function providerRuntimeComponentFingerprintV1(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

type ProviderRuntimeTaskV1 = Pick<
  Task,
  | "key"
  | "title"
  | "prompt"
  | "allowedPaths"
  | "verificationCommands"
  | "model"
  | "requestedModel"
  | "minModel"
  | "effort"
  | "modelSelectionReason"
  | "context"
  | "authorization"
  | "authorizationEvidence"
>;
type ProviderRuntimeProjectV1 = ProjectSettings & {
  name?: string;
  path?: string;
};

export function providerRuntimeIdentityForTaskV1(
  task: ProviderRuntimeTaskV1,
  project: ProviderRuntimeProjectV1,
  branch: string,
): ProviderRuntimeIdentityV1 {
  const authorization =
    task.authorizationEvidence ?? authorizeTask(task, project, branch);
  return {
    goal: taskGoalFingerprint(task),
    scope: scopeFingerprint(authorizationScope(task, project)),
    branch: branch || "branch-unavailable",
    priority: providerRuntimeComponentFingerprintV1({
      model: task.model,
      requestedModel: task.requestedModel,
      minModel: task.minModel ?? "",
      effort: task.effort,
      modelSelectionReason: task.modelSelectionReason,
      sources: (task.context?.bundle.sources ?? []).map((source) => ({
        path: source.path,
        priority: source.priority,
        authority: source.authority,
      })),
    }),
    authorization: providerRuntimeComponentFingerprintV1({
      configuredAuthorization: task.authorization ?? null,
      approvedApplyContracts: project.approvedApplyContracts ?? [],
      contractType: authorization.contractType,
      enabled: authorization.enabled,
      decision: authorization.decision,
      reason: authorization.reason,
      intent: authorization.intent ?? "",
      technicalPermission: authorization.technicalPermission ?? "",
      sideEffectRisk: authorization.sideEffectRisk ?? "",
      approvalId: authorization.approvalId ?? "",
      authorityFingerprint: authorization.authorityFingerprint,
      approvalContractFingerprint:
        authorization.approvalContractFingerprint ?? "",
    }),
  };
}

export function prepareProviderRuntimeContinuationForTaskV1(input: {
  task: ProviderRuntimeTaskV1 & {
    providerRuntimeState?: ProviderRuntimeStateV1;
  };
  project: ProviderRuntimeProjectV1;
  branch: string;
  environment?: RuntimeEnvironment;
  adapter?: ProviderRuntimeAdapterV1;
}) {
  const adapter = input.adapter ?? codexCliProviderRuntimeAdapterV1;
  const mode = providerReasoningModeV1(input.environment);
  const identity = providerRuntimeIdentityForTaskV1(
    input.task,
    input.project,
    input.branch,
  );
  const decision = selectProviderRuntimeContinuationV1({
    mode,
    identity,
    state: input.branch ? input.task.providerRuntimeState : undefined,
    supportsPreviousResponseId: adapter.supportsPreviousResponseId,
    supportsManualReplay: adapter.supportsManualReplay,
  });
  const invalidated = decision.invalidatedBy.length
    ? decision.invalidatedBy.join(",")
    : "none";
  return {
    identity,
    decision,
    state:
      decision.stateDisposition === "retain"
        ? input.task.providerRuntimeState
        : undefined,
    log:
      `Provider runtime: adapter=${adapter.id} strategy=${decision.strategy} ` +
      `reason=${decision.reason} invalidated=${invalidated}`,
  };
}

export function normalizeProviderRuntimePersistenceV1(run: Run) {
  for (const task of run.tasks) {
    if (task.providerRuntimeState)
      task.providerRuntimeState = validateProviderRuntimeStateV1(
        task.providerRuntimeState,
      );
    if (!task.providerRuntimeDecision) continue;
    const decision = task.providerRuntimeDecision;
    task.providerRuntimeDecision = {
      mode: decision.mode,
      stateDisposition: decision.stateDisposition,
      strategy: decision.strategy,
      reason: decision.reason,
      invalidatedBy: [...decision.invalidatedBy],
      previousResponseId: decision.previousResponseId,
      manualReplayItems: decision.manualReplayItems
        ? sanitizeProviderReplayItemsV1(decision.manualReplayItems)
        : undefined,
    };
  }
  return run;
}

export function taskSandbox(evidence: TaskAuthorizationEvidence) {
  return evidence.enabled && evidence.intent !== "apply" ? "read-only" : "workspace-write";
}

export function codexExecutionBoundaryArgs(
  evidence: TaskAuthorizationEvidence,
  phase: "executor" | "reviewer" | "correction",
) {
  if (phase === "reviewer")
    return [
      "-c",
      "default_permissions='orchestrator-reviewer'",
      "-c",
      "permissions.orchestrator-reviewer={ filesystem = { ':minimal' = 'read', ':tmpdir' = 'write', ':workspace_roots' = { '.' = 'read' } }, network = { enabled = false } }",
    ];
  const sandbox = taskSandbox(evidence);
  const args = ["--sandbox", sandbox];
  if (evidence.enabled)
    args.push("-c", "sandbox_workspace_write.network_access=false");
  return args;
}

export function codexExecCommandStartArgs(
  evidence: TaskAuthorizationEvidence,
  phase: "executor" | "reviewer" | "correction",
) {
  return ["exec", ...codexExecutionBoundaryArgs(evidence, phase)];
}

export function orchestratorVerificationCommands(
  evidence: TaskAuthorizationEvidence,
) {
  return evidence.enabled &&
    evidence.decision === "authorized" &&
    evidence.intent === "apply"
    ? [...evidence.verificationCommands]
    : [];
}

export function authorizationWriteViolations(
  evidence: TaskAuthorizationEvidence,
  changedFiles: string[],
) {
  if (!evidence.enabled) return [];
  if (evidence.intent !== "apply") return changedFiles;
  return outsideAllowedPaths(changedFiles, evidence.allowedPaths);
}

function assertStoredRunAuthorizations(run: Run, branch?: string) {
  for (const task of run.tasks) {
    if (!task.authorization?.enabled && !task.authorizationEvidence?.enabled)
      continue;
    if (!verifyStoredTaskAuthorization(
      task.authorizationEvidence,
      task,
      run.project,
      branch ?? task.authorizationEvidence?.branch ?? "",
    ))
      throw new Error(
        `Stored authorization for task "${task.title}" is stale or mismatched; a fresh contract is required.`,
      );
  }
}

export function runRequiresReplayAuthorization(
  run: Pick<Run, "status">,
) {
  return run.status === "idle" ||
    run.status === "running" ||
    run.status === "paused";
}

async function taskAuthorizationIdentityViolations(run: Run, task: Task) {
  if (!task.authorizationEvidence?.enabled) return [];
  return verifyStoredTaskAuthorization(
    task.authorizationEvidence,
    task,
    run.project,
    await currentBranchIdentity(run.project.path),
  )
    ? []
    : ["<authorization-identity-changed>"];
}

export function windowsPytestBasetempViolation(command: string) {
  const invokesPytest =
    /(?:python(?:\.exe)?["']?\s+-m\s+pytest\b|(?:^|[;&|]\s*|[\\/])pytest(?:\.exe)?(?=\s|$))/i;
  if (!invokesPytest.test(command)) return undefined;
  const match = command.match(
    /--basetemp(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;|]+))/i,
  );
  if (!match)
    return "Windows pytest verification must set --basetemp to a unique direct child of $env:TEMP containing $PID.";
  const basetemp = match[1] ?? match[2] ?? match[3] ?? "";
  const tempPrefix = /\$(?:env:TEMP|\{env:TEMP\})[\\/]/i;
  if (!tempPrefix.test(basetemp))
    return "Windows pytest --basetemp must be a direct child of $env:TEMP, not the workspace or pytest's shared user-temp directory.";
  if (/[\\/]/.test(basetemp.replace(tempPrefix, "")))
    return "Windows pytest --basetemp must be a direct child of $env:TEMP without nested directories.";
  if (!/\$PID\b/i.test(basetemp))
    return "Windows pytest --basetemp must contain $PID so executor, reviewer, and correction processes never reuse it.";
  return undefined;
}

function assertWindowsPytestVerificationCommands(
  commands: string[] | undefined,
  field: string,
) {
  if (process.platform !== "win32" || !commands) return;
  for (const command of commands) {
    const violation = windowsPytestBasetempViolation(command);
    if (violation) throw new Error(`${field}: ${violation}`);
  }
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
  if (
    project.verificationCommands !== undefined &&
    (!Array.isArray(project.verificationCommands) ||
      project.verificationCommands.some(
        (command) => typeof command !== "string" || !command.trim(),
      ))
  )
    throw new Error(
      "project.verificationCommands must be a list of non-empty strings.",
    );
  assertWindowsPytestVerificationCommands(
    project.verificationCommands,
    "project.verificationCommands",
  );
  const projectInlineViolations = inlineCommandViolations(
    project.verificationCommands ?? [],
  );
  if (projectInlineViolations.length)
    throw new Error(
      `project.verificationCommands: ${projectInlineViolations.join(" ")}`,
    );
  if (project.approvedApplyContracts !== undefined) {
    if (!Array.isArray(project.approvedApplyContracts))
      throw new Error("project.approvedApplyContracts must be a list.");
    const approvalIds = new Set<string>();
    for (const contract of project.approvedApplyContracts) {
      if (!contract || typeof contract !== "object" ||
        typeof contract.approvalId !== "string" || !contract.approvalId.trim() ||
        contract.intent !== "apply" ||
        contract.technicalPermission !== "reversible_local_write" ||
        contract.sideEffectRisk !== "reversible_local_write" ||
        !Array.isArray(contract.allowedPaths) || !contract.allowedPaths.length ||
        (contract.preconditions !== undefined &&
          (!Array.isArray(contract.preconditions) ||
            contract.preconditions.some(
              (item) => typeof item !== "string" || !item.trim(),
            ))) ||
        !Array.isArray(contract.verificationCommands) || !contract.verificationCommands.length ||
        [...contract.allowedPaths, ...contract.verificationCommands].some((item) => typeof item !== "string" || !item.trim()))
        throw new Error("project.approvedApplyContracts entries must declare one exact reversible local apply scope.");
      if (approvalIds.has(contract.approvalId))
        throw new Error("project.approvedApplyContracts approvalId values must be unique.");
      assertWindowsPytestVerificationCommands(
        contract.preconditions,
        `project.approvedApplyContracts ${contract.approvalId} preconditions`,
      );
      assertWindowsPytestVerificationCommands(
        contract.verificationCommands,
        `project.approvedApplyContracts ${contract.approvalId}`,
      );
      approvalIds.add(contract.approvalId);
    }
  }
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
    assertCodexRouteCompatible(model, effort);
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
      task.requireRepositoryContext !== undefined &&
      typeof task.requireRepositoryContext !== "boolean"
    )
      throw new Error(
        `Task ${index + 1}: requireRepositoryContext must be true or false.`,
      );
    if (task.requireRepositoryContext && task.contextProfile === undefined)
      throw new Error(
        `Task ${index + 1}: requireRepositoryContext requires contextProfile.`,
      );
    if (
      task.maxSources !== undefined &&
      (!Number.isInteger(task.maxSources) || task.maxSources < 1 || task.maxSources > 50)
    )
      throw new Error(`Task ${index + 1}: maxSources must be an integer from 1 to 50.`);
    for (const [field, value] of [
      ["allowedPaths", task.allowedPaths],
      ["preconditions", task.preconditions],
      ["verificationCommands", task.verificationCommands],
      ["executionGuards", task.executionGuards],
      ["requiresCheckpointsFrom", task.requiresCheckpointsFrom],
    ] as const) {
      if (
        value !== undefined &&
        (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim()))
      )
        throw new Error(`Task ${index + 1}: ${field} must be a list of non-empty strings.`);
    }
    assertWindowsPytestVerificationCommands(
      task.preconditions,
      `Task ${index + 1} Windows pytest precondition`,
    );
    assertWindowsPytestVerificationCommands(
      task.verificationCommands,
      `Task ${index + 1} Windows pytest verification`,
    );
    const commandViolations = verificationCommandViolations(task, project);
    if (commandViolations.length)
      throw new Error(
        `Task ${index + 1} verificationCommands: ${commandViolations.join(" ")}`,
      );
    const inlineViolations = inlineCommandViolations([
      ...(task.preconditions ?? []),
      ...(task.verificationCommands ?? []),
    ]);
    if (inlineViolations.length)
      throw new Error(
        `Task ${index + 1} commands: ${inlineViolations.join(" ")}`,
      );
    const preconditionViolations = verificationCommandViolations(
      {
        allowedPaths: [],
        verificationCommands: task.preconditions,
      },
      {},
    );
    if (preconditionViolations.length)
      throw new Error(
        `Task ${index + 1} preconditions: ${preconditionViolations.join(" ")}`,
      );
    const authorization = task.authorization;
    if (authorization !== undefined) {
      if (!authorization || typeof authorization !== "object" || typeof authorization.enabled !== "boolean")
        throw new Error(`Task ${index + 1}: authorization must include enabled: true or false.`);
      if (authorization.enabled) {
        if (!(["answer", "review", "diagnose", "apply"] as string[]).includes(authorization.intent ?? ""))
          throw new Error(`Task ${index + 1}: enabled authorization requires a recognized intent.`);
        if (!(["read_only", "reversible_local_write"] as string[]).includes(authorization.technicalPermission ?? ""))
          throw new Error(`Task ${index + 1}: enabled authorization requires a recognized technicalPermission.`);
        if (!(["none", "reversible_local_write", "external_write", "destructive", "costly", "publication", "scope_expansion", "ambiguous"] as string[]).includes(authorization.sideEffectRisk ?? ""))
          throw new Error(`Task ${index + 1}: enabled authorization requires a recognized sideEffectRisk.`);
      }
      if (authorization.approvalId !== undefined && (typeof authorization.approvalId !== "string" || !authorization.approvalId.trim()))
        throw new Error(`Task ${index + 1}: authorization.approvalId must be a non-empty string.`);
    }
    const workspace = task.workspace;
    if (workspace !== undefined) {
      const identifiers = [
        workspace?.projectId,
        workspace?.changeId,
        workspace?.waveId,
        workspace?.taskId,
      ];
      if (
        !workspace ||
        workspace.contractType !== "ManagedWorkspaceBindingV1" ||
        workspace.contractVersion !== "1.0" ||
        identifiers.some(
          (value) =>
            typeof value !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value),
        )
      )
        throw new Error(
          `Task ${index + 1}: workspace must be a complete ManagedWorkspaceBindingV1.`,
        );
      if (
        !authorization?.enabled ||
        authorization.intent !== "apply" ||
        authorization.technicalPermission !== "reversible_local_write" ||
        authorization.sideEffectRisk !== "reversible_local_write"
      )
        throw new Error(
          `Task ${index + 1}: Phase 3 workspace isolation requires an enabled reversible apply authorization.`,
        );
    }
    const promptModel = task.promptModel;
    if (promptModel !== undefined) {
      if (
        !workspace ||
        promptModel.contractType !== "PromptModelExecutionConfigurationV1" ||
        promptModel.contractVersion !== "1.0" ||
        !promptModel.roles ||
        typeof promptModel.roles !== "object"
      )
        throw new Error(
          `Task ${index + 1}: promptModel requires a managed Phase 2/3 workspace and the v1 configuration envelope.`,
        );
      const configuredRoles = Object.entries(promptModel.roles) as Array<
        [string, PromptModelRoleConfigurationV1 | undefined]
      >;
      if (
        !configuredRoles.some(([role, value]) => role === "executor" && value) ||
        configuredRoles.some(
          ([role]) => !["executor", "reviewer", "correction"].includes(role),
        )
      )
        throw new Error(
          `Task ${index + 1}: promptModel.roles must declare executor and only known invocation roles.`,
        );
      for (const [role, configuration] of configuredRoles) {
        if (!configuration) continue;
        const identifiers = [
          configuration.modelRouteId,
          configuration.compiler?.compilerId,
          configuration.compiler?.version,
          configuration.inputSchemaVersion,
          configuration.expectedRuntime?.runtimeId,
          configuration.expectedRuntime?.toolRoute,
          configuration.expectedRuntime?.capabilityMapVersion,
          ...(configuration.promptArtifactIds ?? []),
        ];
        if (
          !Array.isArray(configuration.promptArtifactIds) ||
          configuration.promptArtifactIds.length === 0 ||
          new Set(configuration.promptArtifactIds).size !==
            configuration.promptArtifactIds.length ||
          identifiers.some(
            (value) =>
              typeof value !== "string" ||
              !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value),
          )
        )
          throw new Error(
            `Task ${index + 1}: promptModel ${role} configuration has invalid or duplicate immutable identities.`,
          );
      }
    }
    return {
      key: task.key,
      dependsOn: task.dependsOn,
      resources: task.resources,
      title: task.title,
      prompt: task.prompt,
      model,
      minModel: task.minModel,
      effort,
      allowedPaths: task.allowedPaths,
      preconditions: task.preconditions,
      verificationCommands: task.verificationCommands,
      executionGuards: task.executionGuards,
      requiresCheckpointsFrom: task.requiresCheckpointsFrom,
      timeoutMinutes: task.timeoutMinutes,
      maxRetries: task.maxRetries,
      contextProfile: task.contextProfile,
      maxSources: task.maxSources,
      requireRepositoryContext: task.requireRepositoryContext,
      authorization: task.authorization,
      workspace: task.workspace,
      promptModel: task.promptModel,
      requestedModel: selection.requestedModel,
      modelSelectionReason: selection.reason,
    };
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
  const tasksByKey = new Map(
    tasks.flatMap((task) => task.key ? [[task.key, task] as const] : []),
  );
  tasks.forEach((task, index) => {
    if (!task.requiresCheckpointsFrom?.length) return;
    if (!task.key)
      throw new Error(
        `Task ${index + 1}: key is required when requiresCheckpointsFrom is used.`,
      );
    if (new Set(task.requiresCheckpointsFrom).size !== task.requiresCheckpointsFrom.length)
      throw new Error(
        `Task ${index + 1}: requiresCheckpointsFrom must not contain duplicates.`,
      );
    for (const predecessorKey of task.requiresCheckpointsFrom) {
      if (!task.dependsOn?.includes(predecessorKey))
        throw new Error(
          `Task ${index + 1}: requiresCheckpointsFrom "${predecessorKey}" must also be a direct dependsOn entry.`,
        );
      const predecessor = tasksByKey.get(predecessorKey);
      if (!predecessor)
        throw new Error(
          `Task ${index + 1}: requiresCheckpointsFrom references unknown task key "${predecessorKey}".`,
        );
      if (queue.git?.checkpointCommits !== true && !predecessor.workspace)
        throw new Error(
          `Task ${index + 1}: requiresCheckpointsFrom requires git.checkpointCommits: true for ordinary predecessor "${predecessorKey}".`,
        );
      if (predecessor.allowedPaths?.length === 0)
        throw new Error(
          `Task ${index + 1}: read-only predecessor "${predecessorKey}" cannot produce a checkpoint.`,
        );
    }
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
  return {
    project: {
      name: project.name || projectPath.split(/[\\/]/).pop() || "Project",
      path: projectPath,
      profileId: project.profileId,
      verificationCommands,
      defaultModel: project.defaultModel,
      defaultEffort: project.defaultEffort,
      allowedModels: project.allowedModels,
      approvedApplyContracts: project.approvedApplyContracts,
    },
    tasks,
    limits,
    git: { ...defaultGitSettings, ...queue.git },
  };
}

/** User-authored queues are reserved for two or more independently useful tasks. */
export function validateTaskQueue(value: unknown): ReturnType<typeof validateQueue> {
  const queue = validateQueue(value);
  if (queue.tasks.length < 2)
    throw new Error(
      "An Orchestrator task queue must include at least two tasks. Run one task in the current Codex session.",
    );
  return queue;
}

export function resolveTaskStatus({
  cancelled,
  skipped,
  exitCode,
  timedOut,
  violations,
  executorOutcome,
}: {
  cancelled: boolean;
  skipped: boolean;
  exitCode: number;
  timedOut: boolean;
  violations: string[];
  executorOutcome?: ExecutorOutcomeAssessment;
}): Status {
  if (cancelled) return "cancelled";
  if (skipped) return "skipped";
  if (timedOut) return "timed_out";
  return exitCode === 0 &&
    violations.length === 0 &&
    (!executorOutcome ||
      executorOutcome.disposition === "completed" ||
      executorOutcome.disposition === "legacy")
    ? "completed"
    : "failed";
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
    pipeline.currentIndex > pipeline.queues.length ||
    (pipeline.currentIndex === pipeline.queues.length && pipeline.status !== "completed")
  )
    throw new Error(`Saved pipeline ${id} is invalid.`);
  return pipeline;
}

function pipelineView(pipeline: LoadedPipeline): PipelineView {
  return {
    id: pipeline.id,
    kind: pipeline.kind ?? "queues",
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
  if (reviewStatus === "approved") return "completed";
  if (reviewStatus === "timed_out") return "timed_out";
  return "failed";
}

export function assessExecutorOutcome(
  output: string | undefined,
  contractVersion: number | undefined,
): ExecutorOutcomeAssessment {
  if (contractVersion === undefined)
    return {
      disposition: "legacy",
      reason: "Historical execution has no executor outcome contract.",
    };
  if (contractVersion !== EXECUTOR_OUTCOME_CONTRACT_VERSION)
    return {
      disposition: "invalid",
      reason: `Unsupported executor outcome contract version: ${contractVersion}.`,
    };
  const markerLines = (output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${EXECUTOR_OUTCOME_MARKER}:`));
  if (markerLines.length === 0)
    return {
      disposition: "invalid",
      reason: `Required executor outcome marker ${EXECUTOR_OUTCOME_MARKER} is missing.`,
    };
  if (markerLines.length !== 1)
    return {
      disposition: "invalid",
      reason: `Required executor outcome marker ${EXECUTOR_OUTCOME_MARKER} must appear exactly once.`,
    };
  const match = markerLines[0].match(
    /^ORCHESTRATOR_EXECUTOR_OUTCOME_V1: (COMPLETED|STOPPED)$/,
  );
  if (!match)
    return {
      disposition: "invalid",
      reason: `Required executor outcome marker ${EXECUTOR_OUTCOME_MARKER} is malformed.`,
    };
  const outcome = match[1] as ExecutorOutcome;
  return outcome === "COMPLETED"
    ? {
        disposition: "completed",
        outcome,
        reason: "Executor reported COMPLETED.",
      }
    : {
        disposition: "stopped",
        outcome,
        reason: "Executor reported STOPPED; the requested outcome was not delivered.",
      };
}

export function assessReviewerResult({
  exitCode,
  timedOut,
  report,
}: {
  exitCode: number;
  timedOut: boolean;
  report: string | undefined;
}): { status: ReviewStatus; reason: string } {
  if (timedOut)
    return { status: "timed_out", reason: "Reviewer timed out before approval." };
  if (exitCode !== 0)
    return {
      status: "unavailable",
      reason: `Reviewer exited with code ${exitCode}; approval was not established.`,
    };
  if (!report?.trim())
    return {
      status: "unavailable",
      reason: "Reviewer did not return a report; approval was not established.",
    };
  const verdictLines = report
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("VERDICT:"));
  if (verdictLines.length !== 1)
    return {
      status: "changes_requested",
      reason: "Reviewer report must contain exactly one machine-readable verdict.",
    };
  const verdict = verdictLines[0].match(
    /^VERDICT: (APPROVED|CHANGES_REQUESTED)$/,
  )?.[1];
  if (!verdict)
    return {
      status: "changes_requested",
      reason: "Reviewer report contains a malformed verdict.",
    };
  return verdict === "APPROVED"
    ? { status: "approved", reason: "Reviewer approved the task." }
    : {
        status: "changes_requested",
        reason: "Reviewer requested changes.",
      };
}

export function boundedReviewerDiagnostics(value: string) {
  return value.trim().slice(-8_000);
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
  const runningTasks = run.tasks.filter((task) =>
    task.status === "running" || Boolean(task.executionPhase),
  );
  const availableSlots = Math.max(
    0,
    run.status === "running" ? run.limits.maxParallelTasks - runningTasks.length : 0,
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
        return { file, queue: validateTaskQueue(parse(source)) };
      } catch (error) {
        throw new Error(
          `Pipeline queue ${index + 1} is invalid (${file}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
  return {
    id: identifier(),
    kind: "queues",
    queues,
    currentIndex: 0,
    status: "running",
  };
}

export function boundedFinalOutput(source: string, limit = 24_000) {
  if (source.length <= limit) return source;
  const tailSize = Math.min(8_000, Math.floor(limit / 2));
  const headSize = limit - tailSize;
  return `${source.slice(0, headSize)}\n\n[...output truncated...]\n\n${source.slice(-tailSize)}`;
}

export function taskWriteViolations(
  task: Pick<Task, "allowedPaths">,
  changedFiles: string[],
) {
  return outsideAllowedPaths(changedFiles, task.allowedPaths);
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
      executorOutcomeContractVersion: EXECUTOR_OUTCOME_CONTRACT_VERSION,
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
      preconditions: task.preconditions,
      verificationCommands: task.verificationCommands,
      executionGuards: task.executionGuards,
      requiresCheckpointsFrom: task.requiresCheckpointsFrom,
      timeoutMinutes: task.timeoutMinutes,
      maxRetries: task.maxRetries,
      contextProfile: task.contextProfile,
      maxSources: task.maxSources,
      requireRepositoryContext: task.requireRepositoryContext,
      authorization: task.authorization,
      workspace: task.workspace,
      promptModel: task.promptModel,
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
    kind: "queues",
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
    queue = validateTaskQueue(parse(source));
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

export function recoverRun(run: Run, branch?: string) {
  normalizeProviderRuntimePersistenceV1(run);
  assertStoredRunAuthorizations(run, branch);
  if (
    (run.status === "cancelled" || run.status === "paused" || run.status === "idle") &&
    !run.tasks.some(taskOwnsExecution)
  )
    return run;
  const runningTasks = run.tasks.filter(
    (candidate) => candidate.status === "running" || Boolean(candidate.executionPhase),
  );
  if (run.status !== "running" && !runningTasks.length) return run;
  for (const task of runningTasks) {
    task.status = "failed";
    task.executionPhase = undefined;
    task.finishedAt = timestamp();
    task.exitCode = 1;
    task.log.push(
      `[${task.finishedAt}] Orchestrator process ended before Codex returned a result.`,
    );
  }
  for (const task of run.tasks.filter((candidate) => candidate.status === "pending")) {
    task.status = "blocked";
    task.finishedAt = timestamp();
    task.log.push(
      `[${task.finishedAt}] Orchestrator process ended before pending work could start.`,
    );
  }
  reconcileRunState(run);
  return run;
}

function resetTaskForRun(task: Task, sourceRunId: string) {
  const retryLineageChangedFiles = [
    ...new Set([
      ...(task.retryLineageChangedFiles ?? []),
      ...(task.changedFiles ?? []),
    ]),
  ].sort();
  return {
    ...task,
    providerRuntimeState: task.providerRuntimeState
      ? validateProviderRuntimeStateV1(task.providerRuntimeState)
      : undefined,
    id: identifier(),
    status: "pending" as Status,
    log: [`Restarted from run ${sourceRunId}`],
    startedAt: undefined,
    finishedAt: undefined,
    exitCode: undefined,
    timedOut: undefined,
    changedFiles: undefined,
    retryLineageChangedFiles:
      retryLineageChangedFiles.length > 0
        ? retryLineageChangedFiles
        : undefined,
    diff: undefined,
    finalOutput: undefined,
    reviewStatus: undefined,
    reviewOutput: undefined,
    reviewWriteViolations: undefined,
    attempts: undefined,
    executionAttempts: undefined,
    checkpoint: undefined,
    workspaceAttemptId: undefined,
    workspacePath: undefined,
    providerRuntimeDecision: undefined,
    providerRuntimeIdentity: undefined,
    promptModelExecutionRefs: undefined,
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

export function retryRun(source: Run, task: Task, branch?: string): Run {
  assertStoredRunAuthorizations(source, branch);
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
        : {
            ...candidate,
            id: identifier(),
            providerRuntimeState: candidate.providerRuntimeState
              ? validateProviderRuntimeStateV1(candidate.providerRuntimeState)
              : undefined,
          },
    ),
  };
}

export function resumeRun(source: Run, branch?: string): Run | undefined {
  assertStoredRunAuthorizations(source, branch);
  if (source.tasks.every((task) => task.status === "completed")) return undefined;
  const remaining = source.tasks
    .map((task) => task.status === "completed" ? {
      ...task,
      id: identifier(),
      providerRuntimeState: task.providerRuntimeState
        ? validateProviderRuntimeStateV1(task.providerRuntimeState)
        : undefined,
    } : ({
      ...task,
      id: identifier(),
      providerRuntimeState: task.providerRuntimeState
        ? validateProviderRuntimeStateV1(task.providerRuntimeState)
        : undefined,
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
      reviewWriteViolations: undefined,
      attempts: undefined,
      executionAttempts: undefined,
      checkpoint: undefined,
      workspaceAttemptId: undefined,
      workspacePath: undefined,
      providerRuntimeDecision: undefined,
      providerRuntimeIdentity: undefined,
      promptModelExecutionRefs: undefined,
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

export function repositoryIdentityForGitRoot(root: string) {
  const resolvedRoot = resolve(root);
  const canonicalRoot =
    process.platform === "win32" ? resolvedRoot.toLowerCase() : resolvedRoot;
  return createHash("sha256").update(canonicalRoot).digest("hex");
}

type GitSnapshotObservation = Readonly<{
  topLevel: Readonly<{ code: number; output: string }>;
  head: Readonly<{ code: number; output: string }>;
  ref: Readonly<{ code: number; output: string }>;
  status: Readonly<{ code: number; output: string }>;
}>;

export function gitSnapshotObservationsMatch(
  first: GitSnapshotObservation,
  second: GitSnapshotObservation,
) {
  return (
    first.topLevel.code === 0 &&
    first.head.code === 0 &&
    first.ref.code === 0 &&
    first.status.code === 0 &&
    second.topLevel.code === 0 &&
    second.head.code === 0 &&
    second.ref.code === 0 &&
    second.status.code === 0 &&
    first.topLevel.output === second.topLevel.output &&
    first.head.output === second.head.output &&
    first.ref.output === second.ref.output &&
    first.status.output === second.status.output
  );
}

async function resolvePersistedProjectSnapshot(
  projectId: string,
): Promise<TrustedRepositorySnapshotV1> {
  const matches = savedProjects.filter((profile) => profile.id === projectId);
  if (matches.length !== 1)
    throw new Error(
      `Project ${projectId} does not resolve to exactly one persisted Project Profile.`,
    );
  const profile = matches[0];
  const observe = async (): Promise<GitSnapshotObservation> => {
    const [topLevel, head, ref, status] = await Promise.all([
      runGit(profile.path, ["rev-parse", "--show-toplevel"]),
      runGit(profile.path, ["rev-parse", "--verify", "HEAD^{commit}"]),
      runGit(profile.path, ["rev-parse", "--symbolic-full-name", "HEAD"]),
      runGit(profile.path, ["status", "--porcelain=v1", "-uall"]),
    ]);
    return { topLevel, head, ref, status };
  };
  const first = await observe();
  const second = await observe();
  const { topLevel, head, ref, status } = second;
  if (
    !gitSnapshotObservationsMatch(first, second) ||
    !topLevel.output ||
    !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head.output) ||
    !ref.output
  )
    throw new Error(
      `The persisted Project Profile for ${projectId} does not resolve to a stable readable Git snapshot.`,
    );
  const changedPaths = status.output
    ? status.output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.slice(3).split("\\").join("/"))
    : [];
  return {
    repositoryId: repositoryIdentityForGitRoot(topLevel.output),
    sha: head.output,
    hashAlgorithm: head.output.length === 64 ? "sha256" : "sha1",
    ref: ref.output,
    worktreeState: changedPaths.length > 0 ? "dirty" : "clean",
    changedPaths,
  };
}

const runStatePath = (runId: string) =>
  join(runsDirectory, runId, "run.json");

function managedVerificationCommandsV1(task: Task) {
  if (!task.authorizationEvidence)
    throw new Error(
      "Managed workspace merge requires persisted authorization evidence.",
    );
  const commands = orchestratorVerificationCommands(
    task.authorizationEvidence,
  );
  if (!commands.length)
    throw new Error(
      "Managed workspace merge requires recorded verification commands.",
    );
  return commands;
}

function samePlanReferenceV1(
  left: PlanReferenceV1 | undefined,
  right: PlanReferenceV1,
) {
  return Boolean(
    left &&
      left.planId === right.planId &&
      left.revision === right.revision &&
      left.planBaseSha === right.planBaseSha,
  );
}

async function authorizedWorkspacePlanV1(run: Run, task: Task) {
  const binding = task.workspace;
  if (!binding) return undefined;
  if (
    !task.authorizationEvidence?.enabled ||
    task.authorizationEvidence.decision !== "authorized" ||
    task.authorizationEvidence.intent !== "apply"
  )
    throw new Error(
      "Phase 3 workspace provisioning requires the exact authorized reversible apply evidence.",
    );
  const projection = await changeControlStore.getPlanningProjection(
    binding.projectId,
    binding.changeId,
    binding.waveId,
  );
  const plan = projection.plans.at(-1);
  if (!plan || plan.status !== "dispatched")
    throw new Error(
      "Phase 3 workspace provisioning requires the latest Phase 2 plan to be dispatched.",
    );
  const reference: PlanReferenceV1 = {
    planId: plan.contract.planId,
    revision: plan.contract.revision,
    planBaseSha: plan.contract.planBase.sha,
  };
  const allowedReceipts = projection.dispatchGateReceipts.filter(
    (receipt) =>
      receipt.result === "allowed" &&
      samePlanReferenceV1(receipt.plan, reference),
  );
  if (
    allowedReceipts.length !== 1 ||
    !plan.authorization ||
    plan.authorization.decision !== "authorized" ||
    !plan.contract.taskPlans.some(
      (plannedTask) => plannedTask.taskId === binding.taskId,
    ) ||
    !plan.contract.planBase.ref
  )
    throw new Error(
      "Phase 3 binding disagrees with the exact authorized Phase 2 plan, task, or dispatch receipt.",
    );
  const repositoryId = await ownedRepositoryIdentityV1(run.project.path);
  if (repositoryId !== plan.contract.planBase.repositoryId)
    throw new Error(
      "Phase 3 repository identity disagrees with the authorized Phase 2 plan.",
    );
  return {
    binding,
    reference,
    authorizationId: plan.authorization.authorizationId,
    repositoryId,
    targetRef: plan.contract.planBase.ref,
    baseSha: plan.contract.planBase.sha,
  };
}

async function recordManagedMergeDriftV1(evidence: {
  driftAssessmentId: string;
  mergeRequestId: string;
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  plan: PlanReferenceV1;
  expectedTargetSha: string;
  observedTargetSha: string;
  sourceSha: string;
  requiresArchitectReplan: true;
  requiresFreshHumanAuthorization: true;
}) {
  const assessment = await changeControlStore.recordMergeTargetDrift(
    evidence.projectId,
    evidence.changeId,
    evidence.waveId,
    {
      actor: "merge-controller:v1",
      assessmentId: evidence.driftAssessmentId,
      plan: evidence.plan,
      taskId: evidence.taskId,
      mergeRequestId: evidence.mergeRequestId,
      expectedTargetSha: evidence.expectedTargetSha,
      observedTargetSha: evidence.observedTargetSha,
      sealedSourceSha: evidence.sourceSha,
    },
  );
  if (
    assessment.status !== "stale" ||
    assessment.observedBase.sha !== evidence.observedTargetSha ||
    assessment.plan.planId !== evidence.plan.planId ||
    assessment.plan.revision !== evidence.plan.revision ||
    assessment.plan.planBaseSha !== evidence.plan.planBaseSha ||
    !assessment.evidenceRefs.includes(
      `merge:request:${evidence.mergeRequestId}`,
    ) ||
    !assessment.evidenceRefs.includes(`merge:task:${evidence.taskId}`) ||
    !assessment.evidenceRefs.includes(
      `git:prior-head:${evidence.expectedTargetSha}`,
    ) ||
    !assessment.evidenceRefs.includes(
      `git:head:${evidence.observedTargetSha}`,
    ) ||
    !assessment.evidenceRefs.includes(
      "requirement:fresh-human-authorization",
    )
  )
    throw new Error(
      "Phase 2 did not persist the exact linked target-drift assessment required for architect replan.",
    );
  return {
    driftAssessmentId: assessment.assessmentId,
    evidenceRefs: assessment.evidenceRefs,
  };
}

async function persistedManagedMergeDriftV1(
  task: Task,
  request: MergeRequestV1,
): Promise<DriftAssessmentV1 | undefined> {
  const binding = task.workspace;
  if (
    !binding ||
    binding.projectId !== request.projectId ||
    binding.changeId !== request.changeId ||
    binding.waveId !== request.waveId ||
    binding.taskId !== request.taskId
  )
    throw new Error(
      "Persisted merge request disagrees with its managed Phase 2 task binding.",
    );
  const projection = await changeControlStore.getPlanningProjection(
    binding.projectId,
    binding.changeId,
    binding.waveId,
  );
  const matches = projection.driftAssessments.filter((assessment) =>
    assessment.evidenceRefs.includes(
      `merge:request:${request.mergeRequestId}`,
    ),
  );
  if (matches.length > 1)
    throw new Error(
      "Persisted merge request has multiple Phase 2 drift assessments.",
    );
  const assessment = matches[0];
  if (!assessment) return undefined;
  if (
    request.state !== "validating" ||
    assessment.status !== "stale" ||
    assessment.requiresReplan !== true ||
    !samePlanReferenceV1(assessment.plan, request.plan) ||
    assessment.observedBase.repositoryId !== request.repositoryId ||
    assessment.observedBase.sha === request.expectedTargetSha ||
    assessment.changedPaths.length !== 0 ||
    assessment.reasons.length !== 1 ||
    assessment.reasons[0].code !== "BASE_SHA_MISMATCH" ||
    !assessment.evidenceRefs.includes(`merge:task:${request.taskId}`) ||
    !assessment.evidenceRefs.includes(
      `git:prior-head:${request.expectedTargetSha}`,
    ) ||
    !assessment.evidenceRefs.includes(
      `git:head:${assessment.observedBase.sha}`,
    ) ||
    !assessment.evidenceRefs.includes(
      `git:sealed-source:${request.sealedSourceSha}`,
    ) ||
    !assessment.evidenceRefs.includes(
      `plan:${request.plan.planId}:${request.plan.revision}:${request.plan.planBaseSha}`,
    ) ||
    !assessment.evidenceRefs.includes("requirement:architect-replan") ||
    !assessment.evidenceRefs.includes(
      "requirement:fresh-human-authorization",
    )
  )
    throw new Error(
      "Persisted Phase 2 drift assessment conflicts with the canonical merge request.",
    );
  return assessment;
}

async function provisionManagedTaskWorkspaceV1(run: Run, task: Task) {
  const authorized = await authorizedWorkspacePlanV1(run, task);
  if (!authorized) return undefined;
  const statePath = runStatePath(run.id);
  if (!task.workspaceAttemptId) {
    await persist(run);
    const attemptId = task.id;
    const ownedRoot = join(
      dirname(resolve(run.project.path)),
      ".orchestrator-workspaces-v1",
      authorized.repositoryId,
    );
    const attempt = await provisionOwnedWorkspaceAttemptV1({
      statePath,
      repositoryPath: run.project.path,
      ownedRoot,
      workspacePath: join(ownedRoot, run.id, attemptId),
      projectId: authorized.binding.projectId,
      repositoryId: authorized.repositoryId,
      changeId: authorized.binding.changeId,
      waveId: authorized.binding.waveId,
      taskId: authorized.binding.taskId,
      runId: run.id,
      attemptId,
      plan: authorized.reference,
      targetRef: authorized.targetRef,
      baseSha: authorized.baseSha,
      transitionedBy: "managed-execution:v1",
    });
    task.workspaceAttemptId = attempt.workspaceAttemptId;
    task.workspacePath = attempt.workspacePath;
    await persist(run);
  }
  const attempt = await inspectOwnedWorkspaceAttemptV1(
    statePath,
    task.workspaceAttemptId,
  );
  if (
    attempt.runId !== run.id ||
    attempt.taskId !== authorized.binding.taskId ||
    !samePlanReferenceV1(attempt.plan, authorized.reference)
  )
    throw new Error(
      "Persisted workspace attempt disagrees with current Phase 2 authorization.",
    );
  task.workspacePath = attempt.workspacePath;
  return workspaceMutationContextV1(
    statePath,
    run.project.path,
    attempt.workspaceAttemptId,
  );
}

async function taskExecutionPathV1(run: Run, task: Task) {
  if (!task.workspace) return run.project.path;
  const context = await provisionManagedTaskWorkspaceV1(run, task);
  if (!context)
    throw new Error("Managed workspace binding did not produce an owned workspace.");
  return context.workspacePath;
}

function promptModelRuntimeIdentityV1(...parts: unknown[]) {
  return promptModelSha256V1(JSON.stringify(parts)).slice(0, 40);
}

function unsupportedRuntimeMeasurementsV1() {
  return {
    inputTokens: { state: "unsupported" as const },
    outputTokens: { state: "unsupported" as const },
    latency: { state: "unsupported" as const },
    cost: { state: "unsupported" as const },
    cache: { state: "unsupported" as const },
    providerMetadata: { state: "unsupported" as const },
  };
}

async function preparePromptModelExecutionV1(
  run: Run,
  task: Task,
  role: "executor" | "reviewer" | "correction",
  attemptOrdinal: number,
  renderedPrompt: string,
  resolvedModel: Model,
  reasoningLevel: Effort,
) {
  if (!task.promptModel) return undefined;
  const configuration = task.promptModel.roles[role];
  if (!configuration)
    throw new ChangeControlError(
      `Phase 5 ${role} invocation has no published configuration reference.`,
      "NOT_READY",
      409,
      ["ATTEMPT_BINDING_MISSING"],
    );
  const authorized = await authorizedWorkspacePlanV1(run, task);
  if (!authorized || !task.workspaceAttemptId)
    throw new ChangeControlError(
      "Phase 5 requires the exact managed workspace and Phase 2 authorization before binding.",
      "NOT_READY",
      409,
      ["ATTEMPT_BINDING_STALE"],
    );
  const workspaceAttempt = await inspectOwnedWorkspaceAttemptV1(
    runStatePath(run.id),
    task.workspaceAttemptId,
  );
  if (
    workspaceAttempt.projectId !== authorized.binding.projectId ||
    workspaceAttempt.changeId !== authorized.binding.changeId ||
    workspaceAttempt.waveId !== authorized.binding.waveId ||
    workspaceAttempt.taskId !== authorized.binding.taskId ||
    workspaceAttempt.repositoryId !== authorized.repositoryId ||
    workspaceAttempt.baseSha !== authorized.baseSha ||
    !samePlanReferenceV1(workspaceAttempt.plan, authorized.reference)
  )
    throw new ChangeControlError(
      "Phase 5 workspace identity disagrees with the exact Phase 2/3 attempt.",
      "NOT_READY",
      409,
      ["CROSS_ENTITY_IDENTITY_MISMATCH"],
    );

  const attemptId = `pm-attempt:${promptModelRuntimeIdentityV1(run.id, task.id, attemptOrdinal)}`;
  const priorAttempt = task.promptModelExecutionRefs?.find(
    (reference) =>
      reference.role === "executor" &&
      reference.attemptOrdinal === attemptOrdinal,
  );
  const invocationId =
    role === "executor"
      ? undefined
      : `pm-invocation:${promptModelRuntimeIdentityV1(run.id, task.id, attemptOrdinal, role, task.attempts ?? 1)}`;
  if (role !== "executor" && !priorAttempt)
    throw new ChangeControlError(
      `Phase 5 ${role} invocation has no exact parent attempt binding.`,
      "NOT_READY",
      409,
      ["ATTEMPT_BINDING_MISSING"],
    );
  const bindingId = `pm-binding:${promptModelRuntimeIdentityV1(attemptId, invocationId ?? "executor")}`;
  const scopeId = `pm-input:${promptModelRuntimeIdentityV1(bindingId, role)}`;
  const boundAt = task.startedAt ?? run.startedAt;
  if (!boundAt)
    throw new Error("Phase 5 binding requires a persisted attempt start time.");
  const bindingIdentity = {
    bindingScope: role === "executor" ? ("attempt" as const) : ("invocation" as const),
    role,
    projectId: authorized.binding.projectId,
    changeId: authorized.binding.changeId,
    waveId: authorized.binding.waveId,
    taskId: authorized.binding.taskId,
    runId: run.id,
    attemptId,
    ...(invocationId ? { invocationId } : {}),
    ...(priorAttempt ? { parentAttemptBindingId: priorAttempt.bindingId } : {}),
    plan: authorized.reference,
    authorizationId: authorized.authorizationId,
    workspace: {
      workspaceAttemptId: workspaceAttempt.workspaceAttemptId,
      repositoryId: workspaceAttempt.repositoryId,
      baseSha: workspaceAttempt.baseSha,
    },
    promptArtifactIds: configuration.promptArtifactIds,
    compositeManifestHash: compositePromptManifestHashV1(
      configuration.promptArtifactIds,
      configuration.compiler,
    ),
    compiler: configuration.compiler,
    inputSchemaVersion: configuration.inputSchemaVersion,
    inputFingerprint: scopedInputFingerprintV1(scopeId, renderedPrompt),
    modelRouteId: configuration.modelRouteId,
    expectedRuntime: configuration.expectedRuntime,
  };
  const binding: Omit<AttemptConfigurationBindingV1, "publicationSequence"> = {
    contractType: "AttemptConfigurationBindingV1",
    contractVersion: "1.0",
    bindingId,
    ...bindingIdentity,
    boundBy: "dispatch-gate:prompt-model-v1",
    reason: `managed-${role}-pre-execution-binding`,
    boundAt,
    evidenceSnapshotHash: attemptEvidenceSnapshotHashV1(bindingIdentity),
  };
  const bindingEvent = await changeControlStore.bindAttemptConfigurationV1(
    authorized.binding.projectId,
    authorized.binding.changeId,
    {
      publisherOccurrenceId: `pm-occurrence:${promptModelRuntimeIdentityV1("binding", bindingId)}`,
      binding,
    },
  );
  const publishedBinding = bindingEvent.payload
    .binding as AttemptConfigurationBindingV1;
  const dispatchIdentity = {
    projectId: authorized.binding.projectId,
    changeId: authorized.binding.changeId,
    waveId: authorized.binding.waveId,
    taskId: authorized.binding.taskId,
    runId: run.id,
    attemptId,
    plan: authorized.reference,
    authorizationId: authorized.authorizationId,
    workspace: binding.workspace,
  };
  if (invocationId)
    await changeControlStore.assertInvocationConfigurationDispatchableV1(
      authorized.binding.projectId,
      { ...dispatchIdentity, invocationId },
    );
  else
    await changeControlStore.assertAttemptConfigurationDispatchableV1(
      authorized.binding.projectId,
      dispatchIdentity,
    );

  const projection = await changeControlStore.getPromptModelLineageProjectionV1(
    authorized.binding.projectId,
  );
  const route = projection.modelRoutes.find(
    (candidate) => candidate.route.modelRouteId === configuration.modelRouteId,
  )?.route;
  if (!route)
    throw new ChangeControlError(
      "Phase 5 resolution references an unknown model route.",
      "NOT_READY",
      409,
      ["MODEL_ROUTE_UNKNOWN"],
    );
  const fallbackUsed =
    route.requestedModelClass !== "auto" &&
    route.requestedModelClass !== resolvedModel;
  const resolutionId = `pm-resolution:${promptModelRuntimeIdentityV1(bindingId, MODEL_IDS[resolvedModel], reasoningLevel)}`;
  const resolution = {
    contractType: "ResolvedModelExecutionV1" as const,
    contractVersion: "1.0" as const,
    resolutionId,
    bindingId: publishedBinding.bindingId,
    projectId: publishedBinding.projectId,
    changeId: publishedBinding.changeId,
    waveId: publishedBinding.waveId,
    taskId: publishedBinding.taskId,
    runId: publishedBinding.runId,
    attemptId: publishedBinding.attemptId,
    ...(publishedBinding.invocationId
      ? { invocationId: publishedBinding.invocationId }
      : {}),
    modelRouteId: publishedBinding.modelRouteId,
    providerId: "openai",
    providerAdapterId: "codex-cli",
    providerAdapterVersion: "1.0",
    runtimeId: "codex-cli",
    providerModelId: MODEL_IDS[resolvedModel],
    resolvedModelClass: resolvedModel,
    capabilityMapVersion: "codex-cli-capabilities-v1",
    reasoningLevel,
    toolRoute: "local-tools",
    resolutionReasonCode: fallbackUsed
      ? "RUNTIME_DECLARED_FALLBACK"
      : "REQUESTED_ROUTE_RESOLVED",
    fallback: fallbackUsed
      ? {
          used: true as const,
          sourceModelClass: route.requestedModelClass,
          reasonCode: "RUNTIME_DECLARED_FALLBACK",
        }
      : { used: false as const },
    startedAt: boundAt,
    measurements: unsupportedRuntimeMeasurementsV1(),
  };
  await changeControlStore.recordResolvedModelExecutionV1(
    authorized.binding.projectId,
    authorized.binding.changeId,
    {
      publisherOccurrenceId: `pm-occurrence:${promptModelRuntimeIdentityV1("resolution", resolutionId)}`,
      actor: "runtime-adapter:codex-cli-v1",
      resolution,
    },
  );
  const reference = {
    role,
    attemptOrdinal,
    attemptId,
    ...(invocationId ? { invocationId } : {}),
    bindingId,
    resolutionId,
  };
  task.promptModelExecutionRefs ??= [];
  const existingIndex = task.promptModelExecutionRefs.findIndex(
    (candidate) =>
      candidate.role === role &&
      candidate.attemptOrdinal === attemptOrdinal &&
      candidate.invocationId === invocationId,
  );
  if (existingIndex === -1) task.promptModelExecutionRefs.push(reference);
  else task.promptModelExecutionRefs[existingIndex] = reference;
  await persist(run);
  return reference;
}

async function taskReadPathV1(run: Run, task: Task) {
  if (!task.workspace) return run.project.path;
  if (!task.workspaceAttemptId)
    throw new Error(
      "Managed task has no canonical owned workspace attempt for reading.",
    );
  return (
    await workspaceReadContextV1(
      runStatePath(run.id),
      run.project.path,
      task.workspaceAttemptId,
    )
  ).workspacePath;
}

async function readWorkspaceSnapshot(cwd: string) {
  const paths = await readGitStatus(cwd);
  const snapshot = new Map<string, string>();
  const head = await runGit(cwd, ["rev-parse", "HEAD"]);
  snapshot.set("\0HEAD", head.code === 0 ? head.output : "");
  snapshot.set("\0BRANCH", await currentBranchIdentity(cwd));
  await Promise.all([...paths].map(async (path) => {
    const absolute = resolve(cwd, path);
    const root = `${resolve(cwd)}${process.platform === "win32" ? "\\" : "/"}`;
    if (absolute !== resolve(cwd) && !absolute.startsWith(root)) return;
    try {
      const content = await readFile(absolute);
      snapshot.set(path, createHash("sha256").update(content).digest("hex"));
    } catch {
      snapshot.set(path, "<missing>");
    }
  }));
  return snapshot;
}

function changedWorkspaceFiles(
  baseline: Map<string, string>,
  current: Map<string, string>,
  ignoredPaths: string[] = [],
) {
  const ignored = new Set(ignoredPaths.map((path) => path.split("\\").join("/")));
  const changed = [...new Set([...baseline.keys(), ...current.keys()])]
    .filter((path) => path !== "\0HEAD" && path !== "\0BRANCH")
    .filter((path) => !ignored.has(path))
    .filter((path) => baseline.get(path) !== current.get(path));
  if (baseline.get("\0HEAD") !== current.get("\0HEAD"))
    changed.push("<git-head-changed>");
  if (baseline.get("\0BRANCH") !== current.get("\0BRANCH"))
    changed.push("<git-branch-changed>");
  return changed;
}

function authoritativeTaskChangedFiles(
  task: Task,
  currentAttemptChangedFiles: string[],
) {
  return [
    ...new Set([
      ...(task.retryLineageChangedFiles ?? []),
      ...currentAttemptChangedFiles,
    ]),
  ].sort();
}

async function currentBranchIdentity(cwd: string) {
  const branch = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch.code !== 0) return "";
  if (branch.output !== "HEAD") return branch.output;
  const head = await runGit(cwd, ["rev-parse", "HEAD"]);
  return head.code === 0 ? `detached:${head.output}` : "";
}

export async function createCheckpoint(run: Run, task: Task) {
  return serializeCheckpointWrite(resolve(run.project.path), async () => {
  if (
    task.checkpoint ||
    (!task.workspaceAttemptId && !run.git?.checkpointCommits) ||
    !task.changedFiles?.length
  ) return;
  const paths = task.changedFiles.filter((path) =>
    path !== "<git-head-changed>" && path !== "<git-branch-changed>",
  );
  if (!paths.length) return;
  const cwd = await taskExecutionPathV1(run, task);
  const branch = await currentBranchIdentity(cwd);
  if (!branch) {
    task.log.push("Checkpoint was not created: branch identity is unavailable.");
    return;
  }
  const parent = await runGit(cwd, ["rev-parse", "HEAD"]);
  if (parent.code !== 0 || !parent.output) {
    task.log.push("Checkpoint was not created: parent commit is unavailable.");
    return;
  }
  const message = `orchestrator: ${task.title}`.slice(0, 200);
  let head: { code: number; output: string };
  if (task.workspaceAttemptId) {
    try {
      head = {
        code: 0,
        output: await checkpointOwnedWorkspaceAttemptV1(
          runStatePath(run.id),
          run.project.path,
          task.workspaceAttemptId,
          paths,
          message,
        ),
      };
    } catch (error) {
      task.log.push(
        `Checkpoint was not created in the owned workspace: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
  } else {
  const stage = await runGit(cwd, [
    "add",
    "--",
    ...paths,
  ]);
  if (stage.code !== 0) {
    task.log.push(`Checkpoint не создан: git add: ${stage.output || "ошибка"}`);
    return;
  }
  const commit = await runGit(cwd, [
    "commit",
    "--only",
    "-m",
    message,
    "--",
    ...paths,
  ]);
  if (commit.code !== 0) {
    task.log.push(
      `Checkpoint не создан: ${commit.output || "нет изменений для commit"}`,
    );
    return;
  }
  head = await runGit(cwd, ["rev-parse", "HEAD"]);
  }
  if (head.code !== 0) {
    task.log.push("Checkpoint создан, но hash не получен.");
    return;
  }
  const ledger: CheckpointLedgerEntry = {
    ledgerId: randomBytes(24).toString("hex"),
    runId: run.id,
    taskId: task.id,
    commitHash: head.output,
    parentHash: parent.output,
    branch,
    message,
    createdAt: timestamp(),
  };
  const canonical = checkpointCanonical(ledger);
  managedCheckpointReceipts.set(ledger.ledgerId, {
    ...ledger,
    canonical,
    tag: checkpointTag(canonical),
  });
  run.checkpointLedger ??= [];
  run.checkpointLedger.push({ ...ledger });
  task.checkpoint = {
    hash: ledger.commitHash,
    parentHash: ledger.parentHash,
    branch: ledger.branch,
    ledgerId: ledger.ledgerId,
    message: ledger.message,
    createdAt: ledger.createdAt,
  };
  task.log.push(`Checkpoint создан: ${task.checkpoint.hash.slice(0, 8)}`);
  });
}

/**
 * Verifies a checkpoint against the server's ephemeral receipt before it is
 * treated as a managed rollback baseline. A fresh server has no receipts.
 */
export async function isManagedCheckpoint(run: Run, task: Task) {
  const checkpoint = task.checkpoint;
  if (!checkpoint) return false;
  const candidate: CheckpointLedgerEntry = {
    ledgerId: checkpoint.ledgerId,
    runId: run.id,
    taskId: task.id,
    commitHash: checkpoint.hash,
    parentHash: checkpoint.parentHash,
    branch: checkpoint.branch,
    message: checkpoint.message,
    createdAt: checkpoint.createdAt,
  };
  const ledgerCandidates = (run.checkpointLedger ?? []).filter((entry) =>
    entry.ledgerId === candidate.ledgerId,
  );
  if (ledgerCandidates.length !== 1 || !sameCheckpointEntry(ledgerCandidates[0], candidate))
    return false;
  if (run.tasks.filter((candidateTask) => candidateTask.id === task.id).length !== 1)
    return false;
  const receipt = managedCheckpointReceipts.get(candidate.ledgerId);
  if (!receipt || !sameCheckpointEntry(receipt, candidate)) return false;
  const tag = checkpointTag(receipt.canonical);
  if (tag.length !== receipt.tag.length || !timingSafeEqual(tag, receipt.tag)) return false;
  const [branch, head, commit, directParent] = await Promise.all([
    currentBranchIdentity(run.project.path),
    runGit(run.project.path, ["rev-parse", "HEAD"]),
    runGit(run.project.path, ["rev-parse", candidate.commitHash]),
    runGit(run.project.path, ["rev-parse", `${candidate.commitHash}^`]),
  ]);
  if (
    branch !== candidate.branch ||
    head.code !== 0 ||
    commit.code !== 0 ||
    commit.output !== candidate.commitHash ||
    directParent.code !== 0 ||
    directParent.output !== candidate.parentHash
  )
    return false;
  // An ancestor alone is not trustworthy: a user can force-push an arbitrary
  // descendant while retaining this commit. Continue only along a branch tip
  // that this process itself authenticated for this same run. Commit hashes
  // can legitimately recur across independent repositories and runs.
  const trustedHeadReceipts = [...managedCheckpointReceipts.values()].filter(
    (entry) =>
      entry.runId === candidate.runId &&
      entry.commitHash === head.output &&
      entry.branch === branch,
  );
  if (trustedHeadReceipts.length !== 1) return false;
  const isAncestor = await runGit(run.project.path, [
    "merge-base",
    "--is-ancestor",
    candidate.commitHash,
    head.output,
  ]);
  return isAncestor.code === 0;
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
  const pipeline = isPipeline(value)
    ? await loadPipeline(value)
    : undefined;
  const queue = pipeline?.queues[0].queue ?? validateTaskQueue(value);
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
  const checks = (
    await Promise.all(queue.tasks.map(async (task, index) => {
      const modelOk = Object.hasOwn(MODEL_IDS, task.model ?? "terra");
      const evidence = reviewerEvidencePreflight(task, queue.project);
      const powershellSyntax = await powershellVerificationSyntaxPreflight([
        ...(queue.project.verificationCommands ?? []),
        ...(task.preconditions ?? []),
        ...(task.verificationCommands ?? []),
      ]);
      return [
        {
          name: `Task ${index + 1} model`,
          ok: modelOk,
          detail: task.model ?? "terra",
        },
        ...(evidence.required
          ? [{
              name: `Task ${index + 1} reviewer evidence`,
              ok: evidence.ok,
              detail: evidence.detail,
            }]
          : []),
        ...(powershellSyntax.required
          ? [{
              name: `Task ${index + 1} PowerShell syntax`,
              ok: powershellSyntax.ok,
              detail: powershellSyntax.detail,
            }]
          : []),
      ];
    }))
  ).flat();
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
        ok: !queue.tasks[index].requireRepositoryContext ||
          !context.fallbackReason,
        detail: context.fallbackReason
          ? queue.tasks[index].requireRepositoryContext
            ? `Repository context required; fallback rejected: ${context.fallbackReason}`
            : `Controlled fallback: ${context.fallbackReason}`
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
  return renderProductionLegacyPromptV1({
    task,
    project,
    authorization:
      task.authorizationEvidence ?? authorizeTask(task, project),
  });
}

export function codexPromptInvocation(args: string[], prompt: string) {
  return {
    args: [...args, "-"],
    stdin: prompt,
  };
}

function spawnCodexWithPrompt(
  args: string[],
  prompt: string,
  cwd: string,
) {
  const invocation = codexPromptInvocation(args, prompt);
  const testScript =
    process.env.ORCHESTRATOR_TEST === "1"
      ? process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT
      : undefined;
  const child = spawn(
    codexBin(),
    [...(testScript ? [testScript] : []), ...invocation.args],
    {
    cwd,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    },
  );
  child.stdin?.on("error", () => undefined);
  child.stdin?.end(invocation.stdin);
  return child;
}

export function buildReviewerPrompt(task: Task, project: ProjectSettings) {
  const verificationCommands =
    task.authorizationEvidence?.verificationCommands ??
    authorizationScope(task, project).verificationCommands;
  const changedFiles = task.changedFiles ?? [];
  const taskChangeSet = changedFiles.length
    ? changedFiles.map((path) => `- ${path}`).join("\n")
    : "- (no task-owned file changes detected)";
  const taskDiff = task.diff?.trim() ||
    "(No tracked diff is available. Inspect only the exact task-change paths listed above; a listed path may be newly untracked.)";
  const verification = verificationCommands.length
    ? [
        "Run only these exact verification commands verbatim:",
        ...verificationCommands.map((command, index) => `${index + 1}. ${command}`),
        "Do not substitute executables, aliases, launchers, or commands.",
        "Do not treat a failure of an unconfigured command as verification evidence.",
      ].join("\n")
    : "No verification commands are configured; do not invent substitute commands.";
  return [
    "Review only the authoritative task change set below. Do not edit files.",
    "",
    `Task: ${task.title}`,
    `Scope: ${task.prompt}`,
    "",
    "Task change set (authoritative):",
    taskChangeSet,
    "",
    "Task-scoped tracked diff:",
    taskDiff,
    "",
    "Pre-existing modified, deleted, or untracked files outside this task change set are out of scope.",
    "Do not request their removal or modification and do not treat them as task scope violations.",
    "",
    verification,
    "",
    "Check correctness, scope, allowed paths, and the exact verification results.",
    "Include exactly one standalone line: VERDICT: APPROVED or VERDICT: CHANGES_REQUESTED.",
    "List concise findings.",
  ].join("\n");
}

async function reviewTask(run: Run, task: Task) {
  if (!run.review.enabled) {
    task.reviewStatus = "approved";
    task.log.push("Reviewer отключён в настройках");
    return;
  }
  task.executionPhase = "reviewer";
  task.reviewStatus = "pending";
  task.reviewWriteViolations = undefined;
  const executionPath = await taskExecutionPathV1(run, task);
  const reviewBaseline = await readWorkspaceSnapshot(executionPath);
  task.log.push("Запущена независимая проверка reviewer");
  await persist(run);
  publish("run", run);
  const outputFile = join(
    runsDirectory,
    run.id,
    `${task.id}-review-${task.attempts ?? 1}.md`,
  );
  const prompt = buildReviewerPrompt(task, run.project);
  let child: ReturnType<typeof spawn>;
  try {
    await preparePromptModelExecutionV1(
      run,
      task,
      "reviewer",
      task.executionAttempts ?? 1,
      prompt,
      run.review.model,
      run.review.effort,
    );
    child = spawnCodexWithPrompt(
      [
        ...codexExecCommandStartArgs(
          task.authorizationEvidence ?? authorizeTask(task, run.project),
          "reviewer",
        ),
        "--ephemeral",
        "--json",
        "--cd",
        executionPath,
        "--model",
        MODEL_IDS[run.review.model],
        "-c",
        `model_reasoning_effort=\"${codexReasoningEffort(run.review.effort)}\"`,
        "--output-last-message",
        outputFile,
      ],
      prompt,
      executionPath,
    );
  } catch (error) {
    task.executionPhase = undefined;
    task.reviewStatus = "unavailable";
    task.log.push(
      `Reviewer unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    await persist(run);
    publish("run", run);
    return;
  }
  let diagnostics = "";
  const consumeStdout = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      const trimmed = line.trim();
      recordUsage(task, trimmed, "reviewer", 1);
      const readable = trimmed && taskEvent(trimmed);
      if (readable)
        diagnostics = boundedReviewerDiagnostics(`${diagnostics}\n${readable}`);
    }
  };
  const consumeStderr = (chunk: Buffer) => {
    const text = chunk.toString();
    diagnostics = boundedReviewerDiagnostics(`${diagnostics}${text}`);
    for (const line of text.split(/\r?\n/))
      recordUsage(task, line.trim(), "reviewer", 1);
  };
  child.stdout?.on("data", consumeStdout);
  child.stderr?.on("data", consumeStderr);
  activeProcesses.set(task.id, child);
  const { exitCode, timedOut } = await waitForProcess(
    child,
    run.limits.reviewerTimeoutMinutes,
    () =>
      task.log.push(
        `Reviewer превысил лимит ${run.limits.reviewerTimeoutMinutes} мин. и был остановлен.`,
      ),
  );
  const report = existsSync(outputFile)
    ? (await readFile(outputFile, "utf8")).slice(0, 24_000)
    : undefined;
  task.reviewOutput = report ?? "Reviewer did not return a report.";
  const assessment = assessReviewerResult({ exitCode, timedOut, report });
  task.reviewStatus = assessment.status;
  if (task.reviewStatus !== "approved") task.log.push(assessment.reason);
  if (diagnostics) task.log.push(`Reviewer diagnostics:\n${diagnostics}`);
  const reviewCurrent = await readWorkspaceSnapshot(executionPath);
  const reviewOutputPath = relative(executionPath, outputFile);
  const reviewWrites = changedWorkspaceFiles(
    reviewBaseline,
    reviewCurrent,
    [reviewOutputPath],
  );
  activeProcesses.delete(task.id);
  task.executionPhase = undefined;
  if (reviewWrites.length) {
    task.reviewWriteViolations = reviewWrites;
    task.reviewStatus = "changes_requested";
    task.log.push(
      `Reviewer violated its read-only boundary: ${reviewWrites.join(", ")}`,
    );
  }
  task.log.push(
    task.reviewStatus === "approved"
      ? "Reviewer: одобрено"
      : `Reviewer: ${task.reviewStatus}`,
  );
  await persist(run);
  publish("run", run);
}

async function prepareExecutorProviderRuntime(
  run: Run,
  task: Task,
  phase: "executor" | "correction",
) {
  const selected = prepareProviderRuntimeContinuationForTaskV1({
    task,
    project: run.project,
    branch: await currentBranchIdentity(await taskExecutionPathV1(run, task)),
  });
  task.providerRuntimeIdentity = selected.identity;
  task.providerRuntimeDecision = selected.decision;
  task.providerRuntimeState = selected.state;
  task.log.push(`${phase}: ${selected.log}`);
  await persist(run);
  publish("run", run);
}

async function correctTask(run: Run, task: Task) {
  task.executionPhase = "correction";
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
  const executionPath = await taskExecutionPathV1(run, task);
  await prepareExecutorProviderRuntime(run, task, "correction");
  let child: ReturnType<typeof spawn>;
  try {
    await preparePromptModelExecutionV1(
      run,
      task,
      "correction",
      task.executionAttempts ?? 1,
      prompt,
      task.model,
      task.effort,
    );
    child = spawnCodexWithPrompt(
      [
        ...codexExecCommandStartArgs(
          task.authorizationEvidence ?? authorizeTask(task, run.project),
          "correction",
        ),
        "--ephemeral",
        "--json",
        "--cd",
        executionPath,
        "--model",
        MODEL_IDS[task.model],
        "-c",
        `model_reasoning_effort=\"${codexReasoningEffort(task.effort)}\"`,
        "--output-last-message",
        outputFile,
      ],
      prompt,
      executionPath,
    );
  } catch (error) {
    task.executionPhase = undefined;
    task.log.push(
      `Автоисправление не запущено: ${error instanceof Error ? error.message : String(error)}`,
    );
    await persist(run);
    publish("run", run);
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
  task.executionPhase = undefined;
  if (existsSync(outputFile))
    task.finalOutput = (await readFile(outputFile, "utf8")).slice(0, 24_000);
  const executorOutcome = assessExecutorOutcome(
    task.finalOutput,
    task.executorOutcomeContractVersion,
  );
  task.executorOutcome = executorOutcome.outcome;
  task.executorOutcomeReason = executorOutcome.reason;
  if (
    executorOutcome.disposition === "stopped" ||
    executorOutcome.disposition === "invalid"
  )
    task.log.push(`Correction outcome rejected: ${executorOutcome.reason}`);
  const effectiveCode =
    code === 0 &&
    (executorOutcome.disposition === "stopped" ||
      executorOutcome.disposition === "invalid")
      ? 1
      : code;
  task.log.push(
    effectiveCode === 0
      ? "Автоисправление завершено"
      : "Автоисправление завершилось ошибкой",
  );
  return { code: effectiveCode, timedOut };
}

async function runConfiguredTaskCommands(
  run: Run,
  task: Task,
  commands: readonly string[],
  label: string,
) {
  for (const command of commands) {
    const executionPath = await taskExecutionPathV1(run, task);
    task.log.push(`${label}: ${command}`);
    let child: ReturnType<typeof spawn>;
    try {
      const invocation = verificationCommandInvocation(command);
      child = spawn(invocation.executable, invocation.args, {
        cwd: executionPath,
        shell: invocation.shell,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      task.log.push(
        `Verification could not start: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { code: 1, timedOut: false };
    }
    let output = "";
    const consume = (chunk: Buffer) => {
      output = `${output}${chunk.toString()}`.slice(-8_000);
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    const result = await waitForProcess(
      child,
      task.timeoutMinutes ?? run.limits.taskTimeoutMinutes,
      () => task.log.push(`Verification timed out: ${command}`),
    );
    if (output.trim()) task.log.push(output.trim());
    if (result.exitCode !== 0 || result.timedOut) return {
      code: result.exitCode || 1,
      timedOut: result.timedOut,
    };
  }
  return { code: 0, timedOut: false };
}

async function runTaskVerification(run: Run, task: Task) {
  const evidence = task.authorizationEvidence;
  if (!evidence) return { code: 0, timedOut: false };
  return runConfiguredTaskCommands(
    run,
    task,
    orchestratorVerificationCommands(evidence),
    "Orchestrator verification",
  );
}

async function runTaskPreconditions(run: Run, task: Task) {
  return runConfiguredTaskCommands(
    run,
    task,
    task.preconditions ?? [],
    "Orchestrator precondition",
  );
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
  return serializeTaskFinalization(run, task, async () => {
    if (task.status === "completed") {
      await createCheckpoint(run, task);
      if (task.workspaceAttemptId) {
        const attempt = await inspectOwnedWorkspaceAttemptV1(
          runStatePath(run.id),
          task.workspaceAttemptId,
        );
        let sealed = attempt;
        if (attempt.state === "active")
          sealed = await sealOwnedWorkspaceAttemptV1(
            runStatePath(run.id),
            run.project.path,
            task.workspaceAttemptId,
          );
        else if (attempt.state !== "sealed")
          throw new Error(
            `Completed managed task cannot finalize from workspace state ${attempt.state}.`,
          );
        const authorized = await authorizedWorkspacePlanV1(run, task);
        if (
          !authorized ||
          !samePlanReferenceV1(sealed.plan, authorized.reference)
        )
          throw new Error(
            "Managed merge requires the exact current Phase 2 plan and fresh authorization.",
          );
        const receipt = await executeOwnedMergeRequestV1({
          statePath: runStatePath(run.id),
          repositoryPath: run.project.path,
          workspaceAttemptId: task.workspaceAttemptId,
          plan: authorized.reference,
          verificationCommands: managedVerificationCommandsV1(task),
          transitionedBy: "managed-completion:v1",
          onReplanRequired: (evidence) =>
            recordManagedMergeDriftV1(evidence),
        });
        if (receipt.result === "merged") {
          await cleanupOwnedWorkspaceAttemptV1(
            runStatePath(run.id),
            run.project.path,
            task.workspaceAttemptId,
          );
          task.log.push(
            `Managed merge completed: ${receipt.mergeCommitSha}.`,
          );
        } else {
          task.status = "blocked";
          task.log.push(
            `Managed merge stopped safely: ${receipt.result}; fresh planning/authorization is required.`,
          );
        }
      }
    }
    await persist(run);
  });
}

async function executeTask(run: Run, task: Task): Promise<Status> {
    const branch = await currentBranchIdentity(run.project.path);
    if (
      task.authorizationEvidence?.enabled &&
      !verifyStoredTaskAuthorization(
        task.authorizationEvidence,
        task,
        run.project,
        branch,
      )
    ) {
      task.status = "blocked";
      task.startedAt = timestamp();
      task.finishedAt = task.startedAt;
      task.exitCode = 1;
      task.log.push("Stored authorization is stale or mismatched; a fresh contract is required.");
      await finalizeSettledTask(run, task);
      publish("run", run);
      return task.status;
    }
    task.authorizationEvidence ??= authorizeTask(task, run.project, branch);
    if (task.authorizationEvidence.enabled && task.authorizationEvidence.decision !== "authorized") {
      task.status = "blocked";
      task.startedAt = timestamp();
      task.finishedAt = task.startedAt;
      task.exitCode = 1;
      task.log.push(`Authorization denied: ${task.authorizationEvidence.reason}.`);
      await finalizeSettledTask(run, task);
      publish("run", run);
      return task.status;
    }
    try {
      assertCodexRouteCompatible(task.model, task.effort);
    } catch (error) {
      task.status = "blocked";
      task.startedAt = timestamp();
      task.finishedAt = task.startedAt;
      task.exitCode = 1;
      task.log.push(`Route compatibility denied: ${error instanceof Error ? error.message : String(error)}`);
      await finalizeSettledTask(run, task);
      publish("run", run);
      return task.status;
    }
    const checkpointViolation = checkpointRequirementViolation(run.tasks, task);
    if (checkpointViolation) {
      task.status = "blocked";
      task.startedAt = timestamp();
      task.finishedAt = task.startedAt;
      task.exitCode = 1;
      task.log.push(`Checkpoint precondition failed: ${checkpointViolation}`);
      await finalizeSettledTask(run, task);
      publish("run", run);
      return task.status;
    }
    const executionPath = await taskExecutionPathV1(run, task);
    const preconditionBaseline = await readWorkspaceSnapshot(executionPath);
    task.status = "running";
    task.executionPhase = "precondition";
    task.startedAt = timestamp();
    task.timedOut = false;
    await persist(run);
    publish("run", run);
    const preconditionResult = await runTaskPreconditions(run, task);
    const preconditionCurrent = await readWorkspaceSnapshot(executionPath);
    const preconditionWrites = changedWorkspaceFiles(
      preconditionBaseline,
      preconditionCurrent,
    );
    task.executionPhase = undefined;
    if (
      preconditionResult.code !== 0 ||
      preconditionResult.timedOut ||
      preconditionWrites.length
    ) {
      task.status = "blocked";
      task.finishedAt = timestamp();
      task.exitCode = preconditionResult.code || 1;
      task.timedOut = preconditionResult.timedOut;
      if (preconditionWrites.length)
        task.log.push(
          `Preconditions violated their read-only boundary: ${preconditionWrites.join(", ")}`,
        );
      else
        task.log.push("Task blocked because an executable precondition failed.");
      await finalizeSettledTask(run, task);
      publish("run", run);
      return task.status;
    }
    const baseline = await readWorkspaceSnapshot(executionPath);
    task.executionPhase = "executor";
    task.attempts = 1;
    task.executionAttempts = 0;
    task.log.push(`Запущено: ${task.model} / ${task.effort}`);
    await persist(run);
    publish("run", run);
    const outputFile = join(runsDirectory, run.id, `${task.id}-final.md`);
    const prompt = buildPrompt(task, run.project);
    const args = [
      ...codexExecCommandStartArgs(task.authorizationEvidence, "executor"),
      "--ephemeral",
      "--json",
      "--cd",
      executionPath,
      "--model",
      MODEL_IDS[task.model],
      "-c",
      `model_reasoning_effort=\"${codexReasoningEffort(task.effort)}\"`,
      "--output-last-message",
      outputFile,
    ];
    const maxRetries = task.maxRetries ?? run.limits.maxTaskRetries;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      task.executionAttempts = attempt;
      task.log.push(
        `Запуск исполнителя ${attempt}/${maxRetries + 1} · лимит ${task.timeoutMinutes ?? run.limits.taskTimeoutMinutes} мин.`,
      );
      await prepareExecutorProviderRuntime(run, task, "executor");
      let child: ReturnType<typeof spawn>;
      try {
        if (task.workspaceAttemptId)
          await workspaceMutationContextV1(
            runStatePath(run.id),
            run.project.path,
            task.workspaceAttemptId,
          );
        await preparePromptModelExecutionV1(
          run,
          task,
          "executor",
          attempt,
          prompt,
          task.model,
          task.effort,
        );
        child = spawnCodexWithPrompt(args, prompt, executionPath);
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
    task.finishedAt = undefined;
    if (existsSync(outputFile))
      task.finalOutput = boundedFinalOutput(await readFile(outputFile, "utf8"));
    const executorOutcome = assessExecutorOutcome(
      task.finalOutput,
      task.executorOutcomeContractVersion,
    );
    task.executorOutcome = executorOutcome.outcome;
    task.executorOutcomeReason = executorOutcome.reason;
    if (
      executorOutcome.disposition === "stopped" ||
      executorOutcome.disposition === "invalid"
    )
      task.log.push(`Executor outcome rejected: ${executorOutcome.reason}`);
    let changed = await readWorkspaceSnapshot(executionPath);
    task.changedFiles = authoritativeTaskChangedFiles(
      task,
      changedWorkspaceFiles(baseline, changed),
    );
    let violations = [...new Set([
      ...taskWriteViolations(task, task.changedFiles),
      ...authorizationWriteViolations(task.authorizationEvidence, task.changedFiles),
      ...await taskAuthorizationIdentityViolations(run, task),
    ])];
    if (
      task.exitCode === 0 &&
      !violations.length &&
      (executorOutcome.disposition === "completed" ||
        executorOutcome.disposition === "legacy") &&
      !isCancelled(run) &&
      !skippedTaskIds.has(task.id)
    ) {
      const verification = await runTaskVerification(run, task);
      if (verification.timedOut) task.timedOut = true;
      if (verification.code !== 0) task.exitCode = verification.code;
    }
    changed = await readWorkspaceSnapshot(executionPath);
    task.changedFiles = authoritativeTaskChangedFiles(
      task,
      changedWorkspaceFiles(baseline, changed),
    );
    task.diff = await readGitDiff(executionPath, task.changedFiles);
    violations = [...new Set([
      ...taskWriteViolations(task, task.changedFiles),
      ...authorizationWriteViolations(task.authorizationEvidence, task.changedFiles),
      ...await taskAuthorizationIdentityViolations(run, task),
    ])];
    if (violations.length)
      task.log.push(
        `Остановка: изменены файлы вне allowedPaths — ${violations.join(", ")}`,
      );
    let settledStatus = resolveTaskStatus({
      cancelled: isCancelled(run),
      skipped: skippedTaskIds.has(task.id),
      exitCode: task.exitCode ?? 1,
      timedOut: Boolean(task.timedOut),
      violations,
      executorOutcome,
    });
    if (settledStatus === "skipped") {
      task.log.push("Пропущено пользователем");
      skippedTaskIds.delete(task.id);
    }
    if (settledStatus === "completed") {
      task.executionPhase = undefined;
      await reviewTask(run, task);
      if (
        task.reviewStatus === "changes_requested" &&
        !task.reviewWriteViolations?.length &&
        taskAllowsCorrection(task) &&
        (!task.authorizationEvidence.enabled || task.authorizationEvidence.intent === "apply") &&
        (task.attempts ?? 1) <= run.review.maxCorrections &&
        !isCancelled(run)
      ) {
        const fixResult = await correctTask(run, task);
        if (fixResult.timedOut) settledStatus = "timed_out";
        else if (fixResult.code === 0 && !isCancelled(run)) {
          const verification = await runTaskVerification(run, task);
          if (verification.timedOut) settledStatus = "timed_out";
          else if (verification.code !== 0) settledStatus = "failed";
          changed = await readWorkspaceSnapshot(executionPath);
          task.changedFiles = authoritativeTaskChangedFiles(
            task,
            changedWorkspaceFiles(baseline, changed),
          );
          task.diff = await readGitDiff(executionPath, task.changedFiles);
          violations = [...new Set([
            ...taskWriteViolations(task, task.changedFiles),
            ...authorizationWriteViolations(
              task.authorizationEvidence,
              task.changedFiles,
            ),
            ...await taskAuthorizationIdentityViolations(run, task),
          ])];
          if (violations.length) {
            settledStatus = "failed";
            task.log.push(
              `Correction changed files outside its exact authorization: ${violations.join(", ")}`,
            );
          } else if (settledStatus === "completed")
            await reviewTask(run, task);
        }
      }
      if (
        task.reviewStatus === "changes_requested" &&
        !taskAllowsCorrection(task)
      )
        task.log.push(
          "Correction skipped: allowedPaths is explicitly empty, so the task is read-only.",
        );
      task.status = resolveReviewedTaskStatus(settledStatus, task.reviewStatus);
      if (task.reviewStatus === "unavailable")
        task.log.push("Reviewer unavailable: task result retained without reviewer approval.");
    }
    if (settledStatus !== "completed") task.status = settledStatus;
    task.executionPhase = undefined;
    task.finishedAt ??= timestamp();
    await finalizeSettledTask(run, task);
    publish("run", run);
    return task.status;
}

export async function executeQueue(run: Run) {
  const branch = await currentBranchIdentity(run.project.path);
  for (const task of run.tasks) {
    if (!task.authorization?.enabled || task.authorizationEvidence) continue;
    task.authorizationEvidence = authorizeTask(task, run.project, branch);
  }
  assertStoredRunAuthorizations(run, branch);
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
        task.executionPhase = undefined;
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
  reconcileRunState(run);
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

export function runInBackground(
  operation: Promise<unknown>,
  report: (error: unknown) => void = (error) =>
    console.error("Background Orchestrator operation failed.", error),
) {
  void operation.then(undefined, (error) => {
    try {
      report(error);
    } catch (reportError) {
      console.error("Could not report a background Orchestrator failure.", reportError);
    }
  });
}

async function startPipelineQueue(pipeline: LoadedPipeline) {
  const entry = pipeline.queues[pipeline.currentIndex];
  if (!entry) return;
  const pipelineLink: Run["pipeline"] = {
    id: pipeline.id,
    file: entry.file,
    index: pipeline.currentIndex + 1,
    total: pipeline.queues.length,
    kind: pipeline.kind ?? "queues",
  };
  const contexts = await contextsForRun(entry.queue);
  const run = createRun(entry.queue, pipelineLink, contexts);
  await acquireProjectLock(run);
  pipeline.currentRunId = run.id;
  pipeline.runs ??= [];
  pipeline.runs.push({
    index: pipeline.currentIndex,
    file: entry.file,
    runId: run.id,
    status: run.status,
  });
  activeRun = run;
  // A run must be durable before its executor starts. Besides making it visible
  // to the history endpoint immediately, this keeps a launch from disappearing
  // if the process exits while the executor is being scheduled.
  await Promise.all([persistPipeline(pipeline), persist(run)]);
  publish("run", run);
  runInBackground(execute(run));
}

async function continuePipeline(run: Run) {
  const pipeline = activePipeline;
  if (!pipeline || pipeline.currentRunId !== run.id) return;
  const recorded = pipeline.runs?.find((candidate) => candidate.runId === run.id);
  if (recorded) recorded.status = run.status;
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

export const app = express();
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
function sendChangeControlError(
  response: express.Response,
  error: unknown,
) {
  if (error instanceof ChangeControlError)
    return response
      .status(error.status)
      .json({
        error: error.message,
        code: error.code,
        ...(error.reasons ? { reasons: error.reasons } : {}),
      });
  return response
    .status(500)
    .json({ error: "Change-control storage failed.", code: "STORAGE_FAILURE" });
}

app.post(
  "/api/change-control/projects/:projectId/changes",
  async (request, response) => {
    try {
      const aggregate = await changeControlStore.create(
        request.params.projectId,
        request.body as CreateChangeInput,
      );
      return response.status(201).json(aggregate);
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/changes",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.list(request.params.projectId),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/changes/:changeId",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.get(
          request.params.projectId,
          request.params.changeId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/transitions",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.transition(
          request.params.projectId,
          request.params.changeId,
          request.body as TransitionChangeInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.createWave(
          request.params.projectId,
          request.params.changeId,
          request.body as CreateWaveInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/changes/:changeId/waves",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.listWaves(
          request.params.projectId,
          request.params.changeId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getWave(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getPlanningProjection(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning/contracts",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.publishPlanningContract(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.body as PublishPlanningContractInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning/authorizations",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.publishPlanAuthorization(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.body as PublishPlanAuthorizationInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/planning/architect-replan-receipts",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.publishArchitectReplanReceipt(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.body as PublishArchitectReplanReceiptInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/dispatch",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.dispatchWave(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.body as DispatchWaveInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/transitions",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.transitionWave(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.body as TransitionWaveInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/tasks/:taskId/transitions",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.transitionTask(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.params.taskId,
          request.body as TransitionTaskInput,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/prompt-model-lineage",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getPromptModelLineageProjectionV1(
          request.params.projectId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/prompt-artifacts",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.publishPromptArtifactV1(
          request.params.projectId,
          request.params.changeId,
          request.body as PublishPromptArtifactInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/prompt-artifacts/:artifactId/revocations",
  async (request, response) => {
    try {
      const input = request.body as RevokePromptArtifactInputV1;
      if (input.revocation?.entityId !== request.params.artifactId)
        throw new ChangeControlError(
          "Prompt artifact path and revocation identity must match exactly.",
          "INVALID_INPUT",
          400,
          ["CROSS_ENTITY_IDENTITY_MISMATCH"],
        );
      return response.status(201).json(
        await changeControlStore.revokePromptArtifactV1(
          request.params.projectId,
          request.params.changeId,
          input,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/model-routes",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.publishModelRouteV1(
          request.params.projectId,
          request.params.changeId,
          request.body as PublishModelRouteInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/model-routes/:routeId/revocations",
  async (request, response) => {
    try {
      const input = request.body as RevokeModelRouteInputV1;
      if (input.revocation?.entityId !== request.params.routeId)
        throw new ChangeControlError(
          "Model route path and revocation identity must match exactly.",
          "INVALID_INPUT",
          400,
          ["CROSS_ENTITY_IDENTITY_MISMATCH"],
        );
      return response.status(201).json(
        await changeControlStore.revokeModelRouteV1(
          request.params.projectId,
          request.params.changeId,
          input,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/attempt-configuration-bindings",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.bindAttemptConfigurationV1(
          request.params.projectId,
          request.params.changeId,
          request.body as BindAttemptConfigurationInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/model-executions",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.recordResolvedModelExecutionV1(
          request.params.projectId,
          request.params.changeId,
          request.body as RecordResolvedModelExecutionInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
export const operatorProjectionServiceV1 = new OperatorProjectionServiceV1(
  changeControlStore,
);
export const operatorActionServiceV1 = new OperatorActionServiceV1(
  changeControlStore,
);
export const auditBundleServiceV1 = new AuditBundleServiceV1(
  new ChangeControlAuditEvidenceAdapterV1(changeControlStore),
);
export function createOutcomeScorecardServiceV1(
  store: Pick<ChangeControlStore, "readAuditEvidenceV1">,
  runRecordsDirectory = runsDirectory,
) {
  const sources: OutcomeScorecardSourcesV1 = {
    readProjectEvidence: (projectId) => store.readAuditEvidenceV1(projectId),
    readRunRecord: async (runId) => {
      try {
        return await readFile(join(runRecordsDirectory, runId, "run.json"), "utf8");
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) return undefined;
        throw error;
      }
    },
  };
  return new OutcomeScorecardServiceV1(sources);
}
export const outcomeScorecardServiceV1 = createOutcomeScorecardServiceV1(
  changeControlStore,
);
app.get(
  "/api/change-control/projects/:projectId/eval-lineage",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getEvalLineageProjectionV1(
          request.params.projectId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/eval-events",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.publishEvalLineageEventV1(
          request.params.projectId,
          request.params.changeId,
          request.body as PublishEvalLineageEventInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/eval-reports",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.publishComputedEvalReportV1(
          request.params.projectId,
          request.params.changeId,
          request.body as PublishComputedEvalReportInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/runtime-eval-imports",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.recordRuntimeEvalImportV1(
          request.params.projectId,
          request.params.changeId,
          request.body as RecordRuntimeEvalImportInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/halts",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.detectAndClassifyHalt(
          request.params.projectId,
          request.body as DetectAndClassifyHaltInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/halts-incidents",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getHaltIncidentProjection(
          request.params.projectId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/tasks/:taskId/retry-authorizations",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.authorizeTaskRetry(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.params.taskId,
          request.body as AuthorizeTaskRetryInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/changes/:changeId/waves/:waveId/resume-authorizations",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.authorizeWaveResume(
          request.params.projectId,
          request.params.changeId,
          request.params.waveId,
          request.body as AuthorizeWaveResumeInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/warden",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getWardenProjection(request.params.projectId),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/doctor",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getDoctorProjection(request.params.projectId),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/halts/:haltId",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getHalt(
          request.params.projectId,
          request.params.haltId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/halts/:haltId/transitions",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.transitionHalt(
          request.params.projectId,
          request.params.haltId,
          request.body as TransitionHaltInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/halts/:haltId/correlations",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.correctIncidentCorrelation(
          request.params.projectId,
          request.params.haltId,
          request.body as CorrectIncidentCorrelationInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/halts/:haltId/warden-verdicts",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getWardenVerdict(
          request.params.projectId,
          request.params.haltId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/halts/:haltId/warden-verdicts",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.evaluateWardenVerdict(
          request.params.projectId,
          request.params.haltId,
          request.body as EvaluateWardenVerdictInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/halts/:haltId/repair-lease/transitions",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.transitionWardenRepairLease(
          request.params.projectId,
          request.params.haltId,
          request.body as TransitionWardenRepairLeaseInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/halts/:haltId/doctor-repairs",
  async (request, response) => {
    try {
      return response.status(201).json(
        await changeControlStore.executeDoctorRepair(
          request.params.projectId,
          request.params.haltId,
          request.body as ExecuteDoctorRepairInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/doctor-repairs/:receiptId",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getDoctorRepair(
          request.params.projectId,
          request.params.receiptId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/incidents/:incidentId",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.getIncident(
          request.params.projectId,
          request.params.incidentId,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/incidents/:incidentId/transitions",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.transitionIncident(
          request.params.projectId,
          request.params.incidentId,
          request.body as TransitionIncidentInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.post(
  "/api/change-control/projects/:projectId/incidents/:incidentId/resolutions",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.resolveIncident(
          request.params.projectId,
          request.params.incidentId,
          request.body as ResolveIncidentInputV1,
        ),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
app.get(
  "/api/change-control/projects/:projectId/execution-bucket",
  async (request, response) => {
    try {
      return response.json(
        await changeControlStore.executionBucket(request.params.projectId),
      );
    } catch (error) {
      return sendChangeControlError(response, error);
    }
  },
);
for (const view of OPERATOR_PROJECTION_VIEWS_V1) {
  app.get(`/api/operator-projections/v1/${view}`, async (request, response) => {
    try {
      const query = parseOperatorProjectionQueryV1(
        request.query as Record<string, unknown>,
      );
      return response.json(
        await operatorProjectionServiceV1.project(
          view as OperatorProjectionViewV1,
          query,
        ),
      );
    } catch (error) {
      if (error instanceof OperatorProjectionErrorV1)
        return response.status(error.status).json({
          error: error.message,
          code: error.code,
        });
      return sendChangeControlError(response, error);
    }
  });
}
function auditBundleQueryValueV1(
  query: Record<string, unknown>,
  name: string,
): string | undefined {
  const value = query[name];
  if (value === undefined) return undefined;
  if (typeof value !== "string")
    throw new AuditBundleErrorV1(
      "SCHEMA_INVALID",
      "Audit bundle query values must be singular strings.",
      400,
    );
  return value;
}

function auditBundleSequenceV1(
  query: Record<string, unknown>,
  name: "fromSequence" | "toSequence",
): number {
  const value = auditBundleQueryValueV1(query, name);
  if (value === undefined || !/^[1-9][0-9]*$/.test(value))
    throw new AuditBundleErrorV1(
      "SEQUENCE_RANGE_INVALID",
      "Audit bundle sequence bounds must be canonical positive integers.",
      400,
    );
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new AuditBundleErrorV1(
      "SEQUENCE_RANGE_INVALID",
      "Audit bundle sequence bounds must be safe integers.",
      400,
    );
  return parsed;
}

function auditBundleIdentifierV1(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
  )
    throw new AuditBundleErrorV1(
      "INVALID_SELECTOR",
      "Audit bundle path identity is invalid.",
      400,
    );
  return value;
}

function assertAuditBundleQueryKeysV1(
  query: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  if (Object.keys(query).some((key) => !allowed.has(key)))
    throw new AuditBundleErrorV1(
      "INVALID_SELECTOR",
      "Audit bundle query contains an unsupported selector field.",
      400,
    );
}

function sendAuditBundleErrorV1(
  response: express.Response,
  error: unknown,
) {
  if (error instanceof AuditBundleErrorV1)
    return response.status(error.status).json({
      error: "Audit bundle request rejected.",
      code: error.code,
    });
  return response.status(503).json({
    error: "Audit bundle service unavailable.",
    code: "SOURCE_UNAVAILABLE",
  });
}

export function installAuditBundleRoutesV1(
  targetApp: express.Express,
  service: Pick<AuditBundleServiceV1, "create">,
) {
  targetApp.get(
    "/api/audit-bundles/v1/projects/:projectId",
    async (request, response) => {
      try {
        const query = request.query as Record<string, unknown>;
        assertAuditBundleQueryKeysV1(
          query,
          new Set(["fromSequence", "toSequence", "sourceWatermark"]),
        );
        const sourceWatermark = auditBundleQueryValueV1(query, "sourceWatermark");
        const bundleRequest = parseAuditBundleRequestV1({
          selector: {
            selectorType: "project-sequence-range",
            projectId: auditBundleIdentifierV1(request.params.projectId),
            fromSequence: auditBundleSequenceV1(query, "fromSequence"),
            toSequence: auditBundleSequenceV1(query, "toSequence"),
          },
          ...(sourceWatermark !== undefined ? { sourceWatermark } : {}),
        });
        return response.json(await service.create(bundleRequest));
      } catch (error) {
        return sendAuditBundleErrorV1(response, error);
      }
    },
  );
  targetApp.get(
    "/api/audit-bundles/v1/projects/:projectId/changes/:changeId",
    async (request, response) => {
      try {
        const query = request.query as Record<string, unknown>;
        assertAuditBundleQueryKeysV1(query, new Set(["sourceWatermark"]));
        const sourceWatermark = auditBundleQueryValueV1(query, "sourceWatermark");
        const bundleRequest = parseAuditBundleRequestV1({
          selector: {
            selectorType: "exact-change",
            projectId: auditBundleIdentifierV1(request.params.projectId),
            changeId: auditBundleIdentifierV1(request.params.changeId),
          },
          ...(sourceWatermark !== undefined ? { sourceWatermark } : {}),
        });
        return response.json(await service.create(bundleRequest));
      } catch (error) {
        return sendAuditBundleErrorV1(response, error);
      }
    },
  );
}
installAuditBundleRoutesV1(app, auditBundleServiceV1);
function outcomeScorecardQuerySequenceV1(
  query: Record<string, unknown>,
  name: "fromSequence" | "toSequence",
): number {
  const value = query[name];
  if (
    typeof value !== "string" ||
    !/^[1-9][0-9]*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    throw new OutcomeScorecardErrorV1(
      "COHORT_INVALID",
      "The discovery sequence bounds are invalid.",
    );
  return Number(value);
}

function outcomeScorecardErrorStatusV1(error: OutcomeScorecardErrorV1) {
  if (
    error.reasonCode === "SOURCE_WATERMARK_CHANGED" ||
    error.reasonCode === "RUN_IDENTITY_CHANGED" ||
    error.reasonCode === "EVIDENCE_CONFLICT"
  ) return 409;
  if (
    error.reasonCode === "COHORT_LIMIT_EXCEEDED" ||
    error.reasonCode === "SCORECARD_TOO_LARGE"
  ) return 413;
  if (error.reasonCode === "SOURCE_UNAVAILABLE") return 503;
  return 400;
}

function sendOutcomeScorecardErrorV1(
  response: express.Response,
  error: unknown,
) {
  if (error instanceof OutcomeScorecardErrorV1)
    return response.status(outcomeScorecardErrorStatusV1(error)).json({
      error: "Outcome scorecard request rejected.",
      code: error.reasonCode,
    });
  return response.status(503).json({
    error: "Outcome scorecard service unavailable.",
    code: "SOURCE_UNAVAILABLE",
  });
}

export function installOutcomeScorecardRoutesV1(
  targetApp: express.Express,
  service: Pick<OutcomeScorecardServiceV1, "discover" | "compute">,
) {
  targetApp.get(
    "/api/outcome-scorecards/v1/projects/:projectId/discovery",
    async (request, response) => {
      try {
        const query = request.query as Record<string, unknown>;
        if (
          Object.keys(query).some(
            (key) => key !== "fromSequence" && key !== "toSequence",
          )
        )
          throw new OutcomeScorecardErrorV1(
            "COHORT_INVALID",
            "The discovery query is invalid.",
          );
        const discoveryRequest = parseOutcomeScorecardDiscoveryRequestV1({
          contractType: "OutcomeScorecardDiscoveryRequestV1",
          contractVersion: "1.0",
          policyVersion: OUTCOME_SCORECARD_POLICY_VERSION_V1,
          selector: {
            projectId: request.params.projectId,
            fromSequence: outcomeScorecardQuerySequenceV1(query, "fromSequence"),
            toSequence: outcomeScorecardQuerySequenceV1(query, "toSequence"),
          },
        });
        return response.json(await service.discover(discoveryRequest));
      } catch (error) {
        return sendOutcomeScorecardErrorV1(response, error);
      }
    },
  );
  targetApp.post(
    "/api/outcome-scorecards/v1/compute",
    async (request, response) => {
      try {
        return response.json(await service.compute(request.body));
      } catch (error) {
        return sendOutcomeScorecardErrorV1(response, error);
      }
    },
  );
  targetApp.use(
    "/api/outcome-scorecards/v1",
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      const bodyError = error as { type?: unknown; status?: unknown };
      const tooLarge =
        bodyError?.type === "entity.too.large" || bodyError?.status === 413;
      return response.status(tooLarge ? 413 : 400).json({
        error: "Outcome scorecard request rejected.",
        code: tooLarge ? "COHORT_LIMIT_EXCEEDED" : "COHORT_INVALID",
      });
    },
  );
}
installOutcomeScorecardRoutesV1(app, outcomeScorecardServiceV1);
function sendOperatorActionErrorV1(
  response: express.Response,
  error: unknown,
) {
  if (error instanceof OperatorActionContractErrorV1) {
    const conflictCodes = new Set([
      "SOURCE_WATERMARK_CHANGED",
      "PROJECT_STATE_CHANGED",
      "TARGET_STATE_CHANGED",
      "AUTHORITY_REQUIRED",
      "GATE_REJECTED",
      "IDEMPOTENCY_CONFLICT",
    ]);
    return response.status(conflictCodes.has(error.code) ? 409 : 400).json({
      error: "Operator action rejected.",
      code: error.code,
    });
  }
  return sendChangeControlError(response, error);
}
export function installOperatorActionRoutesV1(
  targetApp: express.Express,
  service: OperatorActionServiceV1,
) {
  targetApp.post("/api/operator-actions/v1/preview", async (request, response) => {
    try {
      return response.json(await service.preview(request.body));
    } catch (error) {
      return sendOperatorActionErrorV1(response, error);
    }
  });
  targetApp.post("/api/operator-actions/v1/execute", async (request, response) => {
    try {
      return response.json(await service.execute(request.body));
    } catch (error) {
      return sendOperatorActionErrorV1(response, error);
    }
  });
  targetApp.get(
    "/api/operator-actions/v1/receipts/:receiptId",
    async (request, response) => {
      try {
        return response.json(await service.receipt(request.params.receiptId));
      } catch (error) {
        return sendOperatorActionErrorV1(response, error);
      }
    },
  );
}
installOperatorActionRoutesV1(app, operatorActionServiceV1);
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
  const diffPath = file ? await taskReadPathV1(run, task) : undefined;
  return response.json({
    files: task.changedFiles ?? [],
    diff: file
      ? await readGitDiff(diffPath!, [file])
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
    if (!await isManagedCheckpoint(run, task))
      return response.status(409).json({
        error: "Checkpoint is not authenticated by this server process.",
      });
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
    const queue = validateTaskQueue(value);
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
    runInBackground(execute(run));
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
  else runInBackground(execute(activeRun));
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
  runInBackground(execute(retry));
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
  runInBackground(execute(resumed));
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
      await loadProjects();
      await Promise.all([
        recoverInterruptedRuns(),
        ensureRunSummaries(),
        recoverDoctorRepairsForStartupV1(),
      ]);
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
