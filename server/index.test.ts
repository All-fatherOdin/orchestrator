import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import { parse, stringify } from "yaml";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import Ajv2020 from "ajv8/dist/2020.js";
import express from "express";
import type {
  ArchitectReplanReceiptV1,
  PlanAuthorizationV1,
  PlanningContractV1,
  PromptArtifactV1,
  ModelRouteV1,
  AttemptConfigurationBindingV1,
  ResolvedModelExecutionV1,
  TrustedRepositorySnapshotV1,
} from "./change-control-v1/index.ts";
import type {
  AttributionAssessmentV1,
  HaltIncidentAggregateV1,
  HaltRecordV1,
  WardenEvidenceSnapshotV1,
  DoctorAdapterRegistryV1,
  DoctorObservationV1,
  DoctorRecipeInputV1,
} from "./halts-incidents-v1/index.ts";
import {
  HALT_CLASSES_V1,
  WARDEN_DENIAL_REASON_CODES_V1,
  WARDEN_DISPOSITIONS_V1,
  WARDEN_REPAIR_RECIPES_V1,
  incidentFingerprintV1,
  observationFingerprintV1,
  wardenContractHashV1,
  wardenEvidenceSnapshotHashV1,
  doctorObservationHashV1,
} from "./halts-incidents-v1/index.ts";
import haltsIncidentsV1Schema from "./halts-incidents-v1/schemas/halts-incidents-v1.schema.json";
import haltsIncidentsV1Examples from "./halts-incidents-v1/schemas/halts-incidents-v1.examples.json";
import wardenV1Schema from "./halts-incidents-v1/schemas/warden-v1.schema.json";
import wardenV1Examples from "./halts-incidents-v1/schemas/warden-v1.examples.json";
import promptModelLineageV1Schema from "./prompt-model-eval-v1/schemas/prompt-model-lineage-v1.schema.json";
import promptModelLineageV1Examples from "./prompt-model-eval-v1/schemas/prompt-model-lineage-v1.examples.json";
import evalLineageV1Schema from "./prompt-model-eval-v1/schemas/eval-lineage-v1.schema.json";
import evalLineageV1Examples from "./prompt-model-eval-v1/schemas/eval-lineage-v1.examples.json";
import operatorProjectionV1Schema from "./operator-projections-v1/schemas/operator-projection-v1.schema.json";
import operatorProjectionV1Examples from "./operator-projections-v1/schemas/operator-projection-v1.examples.json";
import operatorActionsV1Schema from "./operator-actions-v1/schemas/operator-actions-v1.schema.json";
import operatorActionsV1Examples from "./operator-actions-v1/schemas/operator-actions-v1.examples.json";

process.env.ORCHESTRATOR_TEST = "1";
const testDataDirectory = await mkdtemp(join(tmpdir(), "orchestrator-test-data-"));
process.env.ORCHESTRATOR_DATA_DIR = testDataDirectory;
test.after(async () => rm(testDataDirectory, { recursive: true, force: true }));

const {
  acquireProjectLock,
  blockTasksWithFailedDependencies,
  outsideAllowedPaths,
  taskWriteViolations,
  recoverRun,
  releaseProjectLock,
  clearDeadProjectLock,
  reconcilePersistedRunOwner,
  assessExecutorOutcome,
  assessReviewerResult,
  buildReviewerPrompt,
  reviewerEvidencePreflight,
  verificationCommandViolations,
  inlineCommandViolations,
  powershellVerificationSyntaxPreflight,
  verificationCommandInvocation,
  checkpointRequirementViolation,
  taskAllowsCorrection,
  boundedReviewerDiagnostics,
  resolveReviewedTaskStatus,
  resolveTaskStatus,
  schedulerSnapshot,
  reconcileRunState,
  selectRunnableTasks,
  resumeRun,
  retryRun,
  usageFromEvent,
  taskEvent,
  boundedFinalOutput,
  outcomeClass,
  durationMs,
  projectTaskMetrics,
  projectRunMetrics,
  loadPipeline,
  validateQueue,
  validateTaskQueue,
  persistRun,
  loadRun,
  loadRunSummary,
  writeTextAtomically,
  runInBackground,
  windowsPytestBasetempViolation,
  app,
  changeControlStore,
  FallbackContextProvider,
  RepositoryContextHelperProvider,
  resolveTaskContext,
  cachePreflightContexts,
  contextsForRun,
  createRun,
  executeQueue,
  buildPrompt,
  createContextRequestV1,
  validateContextContractV1,
  contextPtcEnabled,
  ContextPtcFailure,
  LocalDeterministicContextPtcExecutor,
  bindBeforeRecovery,
  runHasLiveOwner,
  codexReasoningEffort,
  installedCodexModels,
  assertCodexRouteCompatible,
  authorizeTask,
  runRequiresReplayAuthorization,
  replayTaskAuthorization,
  verifyStoredTaskAuthorization,
  taskSandbox,
  authorizationWriteViolations,
  codexExecutionBoundaryArgs,
  codexExecCommandStartArgs,
  codexPromptInvocation,
  orchestratorVerificationCommands,
  changedProviderRuntimeIdentityV1,
  providerReasoningModeV1,
  recordProviderRuntimeStateV1,
  sanitizeProviderReplayItemsV1,
  selectProviderRuntimeContinuationV1,
  codexCliProviderRuntimeAdapterV1,
  providerRuntimeIdentityForTaskV1,
  prepareProviderRuntimeContinuationForTaskV1,
  recordProviderRuntimeStateForAdapterV1,
  normalizeProviderRuntimePersistenceV1,
  createCheckpoint,
  isManagedCheckpoint,
  recoverPersistedRunForStartup,
  repositoryIdentityForGitRoot,
  gitSnapshotObservationsMatch,
  checkpointWorkspaceAttemptV1,
  canonicalWorkspaceRunFieldsV1,
  cleanupWorkspaceAttemptV1,
  executeMergeRequestV1,
  executeInWorkspaceAttemptV1,
  inspectWorkspaceAttemptV1,
  provisionWorkspaceAttemptV1,
  recoverWorkspaceAttemptLeaseV1,
  recoverWorkspaceAttemptV1,
  recoverMergeRequestV1,
  replayMergeRequestEventsV1,
  replayWorkspaceAttemptEventsV1,
  replayWorkspaceMutationAuthorityEventsV1,
  repositoryIdentityV1,
  sealWorkspaceAttemptV1,
  workspacePathContainedV1,
  installOperatorActionRoutesV1,
} = await import("./index.ts");
// @ts-ignore JavaScript cache-layout module is covered by its node:test suite.
const { buildPromptCacheLayoutV1, explicitCacheBreakpointV1 } = await import("./prompt-cache-v1/prompt-cache-v1.mjs");
const { renderProductionLegacyPromptV1 } = await import(
  "./prompt-compiler-v1/legacy-prompt-renderer.mjs"
);
const { productionBuildPromptFixture } = await import(
  // @ts-ignore JavaScript production-equivalent fixture is validated by the compiler suite.
  "./prompt-compiler-v1/size-comparison.fixture.mjs"
);
const {
  TaskContextControls,
  contextProfileTaskPatch,
  emptyQueue,
  optionalNumberValue,
} = await import("../src/App.tsx");
const { OperatorDashboard, operatorViews } = await import(
  "../src/OperatorDashboard.tsx"
);
const {
  ChangeControlError,
  ChangeControlStore,
  attemptEvidenceSnapshotHashV1,
  compositePromptManifestHashV1,
  promptArtifactContentIdentityV1,
} = await import("./change-control-v1/index.ts");
const {
  assertPromptModelSchemaV1,
  applyEvalLineageEventV1,
  computeEvalReportV1,
  createEvalLineageProjectionV1,
  evalContentHashV1,
  runtimeEvalsV1ImportIdentity,
} = await import("./prompt-model-eval-v1/index.ts");
const {
  OperatorProjectionServiceV1,
  parseOperatorProjectionQueryV1,
} = await import("./operator-projections-v1/index.ts");
const {
  OPERATOR_ACTION_KINDS_V1,
  OPERATOR_ACTION_OWNING_GATE_REASON_CODES_V1,
  OPERATOR_ACTION_OWNING_GATES_V1,
  OPERATOR_ACTION_REASON_CODES_V1,
  OperatorActionPreviewEngineV1,
  OperatorActionServiceV1,
  operatorActionPreviewHashV1,
  operatorActionReceiptHashV1,
  operatorActionSourceWatermarkV1,
  parseOperatorActionEvidenceV1,
  parseOperatorActionPreviewV1,
  parseOperatorActionReceiptV1,
  parseOperatorActionRequestV1,
} = await import("./operator-actions-v1/index.ts");
const testNodeExecutable = process.env.ORCHESTRATOR_TEST_NODE ?? process.execPath;

const planningShaOne = "1".repeat(40);
const planningShaTwo = "2".repeat(40);

function haltContractsV1(input: {
  haltId: string;
  detectorEventId: string;
  occurredAt?: string;
  haltClass?: AttributionAssessmentV1["haltClass"];
  confidence?: AttributionAssessmentV1["confidence"];
  normalizedRootCauseKey?: string;
  taskId?: string;
}) {
  const occurredAt = input.occurredAt ?? "2026-07-31T10:00:00.000Z";
  const scope = {
    waveId: "planning-wave",
    taskId: input.taskId ?? "task-one",
    attemptId: null,
    planRevision: null,
    runId: null,
    workspaceAttemptId: null,
    mergeRequestId: null,
    commitId: null,
  } as const;
  const haltClass = input.haltClass ?? "acceptance_or_verification_failure";
  const confidence = input.confidence ?? "exact";
  const normalizedRootCauseKey =
    input.normalizedRootCauseKey ??
    (confidence === "exact"
      ? "oracle:test-failed"
      : confidence === "partial"
        ? "partial:oracle-family"
        : "unknown");
  const halt: HaltRecordV1 = {
    contractType: "HaltRecordV1",
    contractVersion: "1.0",
    haltId: input.haltId,
    projectId: "planning-project",
    changeId: "planning-change",
    correlationId: `correlation-${input.haltId}`,
    scope,
    detector: {
      detectorId: "detector:test",
      detectorEventId: input.detectorEventId,
      detectorCode: "TEST_ORACLE_FAILED",
    },
    occurredAt,
    publishedAt: occurredAt,
    observation: {
      fingerprintVersion: "observation-v1",
      fingerprint: "",
      operationKind: "verification",
      component: "test-runner",
      normalizedFailureCode: "TEST_FAILED",
    },
    evidenceRefs: [`test:evidence:${input.haltId}`],
    severity: "blocking",
    state: "detected",
  };
  const assessment: AttributionAssessmentV1 = {
    contractType: "AttributionAssessmentV1",
    contractVersion: "1.0",
    assessmentId: `assessment-${input.haltId}`,
    haltId: input.haltId,
    projectId: halt.projectId,
    changeId: halt.changeId,
    scope,
    haltClass,
    confidence,
    affectedEntity: {
      projectId: halt.projectId,
      changeId: halt.changeId,
      waveId: scope.waveId,
      taskId: scope.taskId,
      operationKind: halt.observation.operationKind,
      component: halt.observation.component,
    },
    normalizedRootCauseKey,
    candidateCauses:
      confidence === "exact"
        ? [
            {
              causeKey: normalizedRootCauseKey,
              evidenceRefs: halt.evidenceRefs,
            },
          ]
        : confidence === "partial"
          ? [
              {
                causeKey: "candidate:oracle",
                evidenceRefs: halt.evidenceRefs,
              },
              {
                causeKey: "candidate:environment",
                evidenceRefs: halt.evidenceRefs,
              },
            ]
          : [],
    alternativeCandidates: [],
    evidence: {
      detectorEvidenceRefs: halt.evidenceRefs,
      declaredWriteSet: [],
      actualChangedPaths: [],
      gitEvidenceRefs: [],
      outcomeEvidenceRefs: halt.evidenceRefs,
      sideEffectState: "none",
    },
    classifier: {
      classifierId: "classifier:test",
      method: "deterministic",
    },
    assessedAt: occurredAt,
    taxonomyPolicyVersion: "halt-taxonomy-v1",
  };
  return { halt, assessment };
}

function fingerprintedHaltContractsV1(
  input: Parameters<typeof haltContractsV1>[0],
) {
  const contracts = haltContractsV1(input);
  return {
    halt: {
      ...contracts.halt,
      observation: {
        ...contracts.halt.observation,
        fingerprint: observationFingerprintV1(contracts.halt),
      },
    },
    assessment: contracts.assessment,
  };
}

async function seedPhase4Scope(store: InstanceType<typeof ChangeControlStore>) {
  await store.create("planning-project", {
    changeId: "planning-change",
    actor: "human:test",
  });
  await store.createWave("planning-project", "planning-change", {
    waveId: "planning-wave",
    actor: "human:test",
    tasks: [{ taskId: "task-one" }],
  });
}

function mitigationReceiptV1(
  receiptId: string,
  incidentId: string,
  resolvedAt: string,
) {
  return {
    contractType: "IncidentResolutionReceiptV1" as const,
    contractVersion: "1.0" as const,
    receiptId,
    incidentId,
    projectId: "planning-project",
    changeId: "planning-change",
    resolutionKind: "mitigated" as const,
    oracle: {
      kind: "human" as const,
      outcome: "passed" as const,
      observationResult: "Immediate impact is stopped with recorded evidence.",
    },
    noActiveHealing: true as const,
    evidenceRefs: [`human:mitigation:${receiptId}`],
    resolvedAt,
    resolvedBy: "human:operator",
    taxonomyPolicyVersion: "halt-taxonomy-v1" as const,
    correlationWindowSeconds: 60,
  };
}

function wardenEvidenceSnapshotV1(
  aggregate: HaltIncidentAggregateV1,
  overrides: Partial<Omit<WardenEvidenceSnapshotV1, "snapshotHash">> = {},
  oracleRecipe: (typeof WARDEN_REPAIR_RECIPES_V1)[number] =
    WARDEN_REPAIR_RECIPES_V1[0],
): WardenEvidenceSnapshotV1 {
  const snapshotWithoutHash = {
    snapshotVersion: "warden-evidence-v1" as const,
    capturedAt: "2026-07-31T10:00:00.000Z",
    haltRecordHash: wardenContractHashV1(aggregate.halt),
    incidentRecordHash: wardenContractHashV1(aggregate.incident),
    attributionAssessmentHash: wardenContractHashV1(aggregate.assessment),
    evidenceRefs: [
      ...new Set([
        ...aggregate.halt.evidenceRefs,
        ...aggregate.assessment.evidence.detectorEvidenceRefs,
        ...aggregate.assessment.evidence.outcomeEvidenceRefs,
      ]),
    ],
    sideEffectState: aggregate.assessment.evidence.sideEffectState,
    preconditionsUnchanged: true,
    priorRepairResult: "none" as const,
    quarantineReasonCodes: [],
    successOracle: {
      ...oracleRecipe.successOracle,
      evidenceRefs: ["oracle:success:registered"],
    },
    stopOracle: {
      ...oracleRecipe.stopOracle,
      evidenceRefs: ["oracle:stop:registered"],
    },
    ...overrides,
  };
  return {
    ...snapshotWithoutHash,
    snapshotHash: wardenEvidenceSnapshotHashV1(snapshotWithoutHash),
  };
}

function doctorObservationV1(
  state: DoctorObservationV1["state"],
  recipeId: string,
): DoctorObservationV1 {
  const body = {
    state,
    observationCode: ("doctor-" + recipeId + "-" + state).slice(0, 128),
    evidenceRefs: ["doctor:" + recipeId + ":" + state],
  };
  return { ...body, evidenceHash: doctorObservationHashV1(body) };
}

function doctorAdaptersV1(
  states = new Map<string, DoctorObservationV1["state"]>(),
  executions = new Map<string, number>(),
): DoctorAdapterRegistryV1 {
  const adapter = {
    observe: async (input: DoctorRecipeInputV1) =>
      doctorObservationV1(
        states.get(input.recipeId) ?? "ready",
        input.recipeId,
      ),
    executeAttempt: async (
      input: DoctorRecipeInputV1,
      context: import("./halts-incidents-v1/index.ts").DoctorAdapterContextV1,
    ) => {
      await context.assertLiveFence();
      executions.set(input.recipeId, (executions.get(input.recipeId) ?? 0) + 1);
      states.set(input.recipeId, "succeeded");
      return {
        outcome: "completed" as const,
        outcomeCode: "doctor-effect-completed",
        evidenceRefs: ["doctor:" + input.recipeId + ":effect"],
      };
    },
  };
  return {
    "provider-read-retry-v1": adapter,
    "registered-process-retry-v1": adapter,
    "workspace-reconcile-v1": adapter,
    "merge-safe-abort-resume-v1": adapter,
    "owned-cleanup-retry-v1": adapter,
  } as unknown as DoctorAdapterRegistryV1;
}

function doctorInputV1(
  recipeId: (typeof WARDEN_REPAIR_RECIPES_V1)[number]["recipeId"],
): DoctorRecipeInputV1 {
  if (recipeId === "provider-read-retry-v1")
    return {
      recipeId,
      providerOperationId: "provider-operation-one",
      resourceIdentity: "provider-resource-one",
    };
  if (recipeId === "registered-process-retry-v1")
    return {
      recipeId,
      operationId: "registered-operation-one",
      operationKind: "read-only-probe",
      commandHash: "a".repeat(64),
      fixedArgumentsHash: "b".repeat(64),
      effectContract: "read_only_non_mutating",
    };
  if (recipeId === "merge-safe-abort-resume-v1")
    return {
      recipeId,
      runId: "run-one",
      workspaceAttemptId: "workspace-attempt-one",
      mergeRequestId: "merge-request-one",
    };
  return {
    recipeId,
    runId: "run-one",
    workspaceAttemptId: "workspace-attempt-one",
  };
}

function planningContract(
  overrides: Partial<PlanningContractV1> = {},
): PlanningContractV1 {
  return {
    contractType: "PlanningContractV1",
    contractVersion: "1.0",
    planId: "plan-one",
    revision: 1,
    projectId: "planning-project",
    changeId: "planning-change",
    waveId: "planning-wave",
    predecessor: null,
    planBase: {
      repositoryId: "planning-repository",
      sha: planningShaOne,
      hashAlgorithm: "sha1",
      ref: "refs/heads/main",
      capturedAt: "2026-07-30T09:00:00.000Z",
      worktreeState: "clean",
    },
    taskPlans: ["task-one", "task-two"].map((taskId) => ({
      taskId,
      acceptanceClaims: [
        {
          claimId: `claim-${taskId}`,
          observableOutcome: `${taskId} has its observable result.`,
          oracle: {
            kind: "command",
            instruction: `npm test -- ${taskId}`,
          },
          expectedEvidence: [
            {
              kind: "command_exit",
              description: "The command exits successfully.",
            },
          ],
          failureSeverity: "blocking",
        },
      ],
      blastRadius: {
        declaredWriteSet: [
          {
            path: `server/${taskId}.ts`,
            mode: "modify",
            evidenceRefs: [`queue:${taskId}`],
          },
        ],
        dependencyImpacts: [],
        publicApiChanges: [],
        schemaMigrationEffects: [],
        externalSideEffects: [],
        impactedTests: [
          {
            description: `${taskId} contract coverage`,
            evidenceRefs: [`test:${taskId}`],
          },
        ],
        assessmentEvidenceRefs: [`assessment:${taskId}`],
      },
    })),
    replanTriggers: ["base_sha_changed", "unknown_drift"],
    createdAt: "2026-07-30T09:01:00.000Z",
    createdBy: "planner:primary",
    authorizationRequired: true,
    ...overrides,
  };
}

function planAuthorization(
  overrides: Partial<PlanAuthorizationV1> = {},
): PlanAuthorizationV1 {
  return {
    contractType: "PlanAuthorizationV1",
    contractVersion: "1.0",
    authorizationId: "authorization-one",
    projectId: "planning-project",
    changeId: "planning-change",
    waveId: "planning-wave",
    plan: {
      planId: "plan-one",
      revision: 1,
      planBaseSha: planningShaOne,
    },
    decision: "authorized",
    reason: "The exact plan revision and base were reviewed.",
    decidedAt: "2026-07-30T09:02:00.000Z",
    decidedBy: "human:reviewer",
    ...overrides,
  };
}

async function createPlanningWave(
  store: InstanceType<typeof ChangeControlStore>,
) {
  await store.create("planning-project", {
    changeId: "planning-change",
    actor: "user:creator",
  });
  await store.createWave("planning-project", "planning-change", {
    waveId: "planning-wave",
    actor: "user:creator",
    tasks: [{ taskId: "task-one" }, { taskId: "task-two" }],
  });
}

function planningSnapshot(
  overrides: Partial<TrustedRepositorySnapshotV1> = {},
): TrustedRepositorySnapshotV1 {
  return {
    repositoryId: "planning-repository",
    sha: planningShaOne,
    hashAlgorithm: "sha1",
    ref: "refs/heads/main",
    worktreeState: "clean",
    changedPaths: [],
    ...overrides,
  };
}

async function authorizePlanningWave(
  store: InstanceType<typeof ChangeControlStore>,
  contract = planningContract(),
) {
  await createPlanningWave(store);
  await store.publishPlanningContract(
    "planning-project",
    "planning-change",
    "planning-wave",
    { contract },
  );
  await store.publishPlanAuthorization(
    "planning-project",
    "planning-change",
    "planning-wave",
    {
      authorization: planAuthorization({
        plan: {
          planId: contract.planId,
          revision: contract.revision,
          planBaseSha: contract.planBase.sha,
        },
      }),
    },
  );
}

function promptArtifactV1(
  overrides: Partial<PromptArtifactV1> = {},
): PromptArtifactV1 {
  const content = {
    storage: "approved_reusable_content" as const,
    mediaType: "text/plain; charset=utf-8" as const,
    text: "You are an approved reusable executor.",
  };
  const identity = promptArtifactContentIdentityV1({ content });
  return {
    contractType: "PromptArtifactV1",
    contractVersion: "1.0",
    promptArtifactId: "prompt-executor-root-v1",
    purpose: "Approved reusable executor instruction",
    artifactKind: "executor",
    schemaVersion: "1.0",
    content,
    ...identity,
    compiler: { compilerId: "legacy-prompt-renderer", version: "1.0" },
    inputSchemaRef: "orchestrator-task-input-v1",
    behaviorContractRefs: ["executor-outcome-v1"],
    parentArtifactIds: [],
    publishedBy: "artifact-publisher:test",
    publishedAt: "2026-08-01T10:00:00.000Z",
    privacy: {
      classification: "approved_reusable",
      validationReceipt: {
        validatorId: "prompt-privacy-validator",
        validatorVersion: "1.0",
        decision: "approved",
        validatedAt: "2026-08-01T09:59:00.000Z",
        evidenceRefs: ["review:prompt-executor-root-v1"],
      },
    },
    ...overrides,
  };
}

function modelRouteV1(overrides: Partial<ModelRouteV1> = {}): ModelRouteV1 {
  return {
    contractType: "ModelRouteV1",
    contractVersion: "1.0",
    modelRouteId: "route-terra-medium-v1",
    routePolicyId: "codex-gpt56-routing",
    routePolicyVersion: "1.0",
    requestedModelClass: "terra",
    minimumModelClass: "terra",
    reasoningLevel: "medium",
    requiredCapabilities: {
      runtimeId: "codex-cli",
      toolRoute: "local-tools",
      capabilityMapVersion: "codex-cli-capabilities-v1",
    },
    fallbackPolicy: {
      mode: "denied",
      allowedResolvedModelClasses: [],
      allowedReasonCodes: [],
    },
    allowedProviderAdapters: [
      {
        providerId: "openai",
        adapterId: "codex-cli",
        adapterVersion: "1.0",
      },
    ],
    failClosedUnsupported: true,
    routingRationaleCode: "EXPLICIT_TASK_ROUTE",
    publishedBy: "route-publisher:test",
    publishedAt: "2026-08-01T10:01:00.000Z",
    ...overrides,
  };
}

async function promptModelPlanningFixture(root: string) {
  const store = new ChangeControlStore(root, {
    resolveRepositorySnapshot: async () => planningSnapshot(),
  });
  await authorizePlanningWave(store);
  await store.dispatchWave(
    "planning-project",
    "planning-change",
    "planning-wave",
    { actor: "user:dispatcher" },
  );
  const artifact = promptArtifactV1();
  const route = modelRouteV1();
  await store.publishPromptArtifactV1("planning-project", "planning-change", {
    publisherOccurrenceId: "occurrence-prompt-root",
    artifact,
  });
  await store.publishModelRouteV1("planning-project", "planning-change", {
    publisherOccurrenceId: "occurrence-route-terra",
    route,
  });
  return { store, artifact, route };
}

function attemptBindingV1(
  artifact: PromptArtifactV1,
  route: ModelRouteV1,
  overrides: Partial<Omit<AttemptConfigurationBindingV1, "publicationSequence">> = {},
) {
  const identity = {
    bindingScope: "attempt" as const,
    role: "executor" as const,
    projectId: "planning-project",
    changeId: "planning-change",
    waveId: "planning-wave",
    taskId: "task-one",
    runId: "run-one",
    attemptId: "attempt-one",
    plan: {
      planId: "plan-one",
      revision: 1,
      planBaseSha: planningShaOne,
    },
    authorizationId: "authorization-one",
    workspace: {
      workspaceAttemptId: "workspace-attempt-one",
      repositoryId: "planning-repository",
      baseSha: planningShaOne,
    },
    promptArtifactIds: [artifact.promptArtifactId],
    compositeManifestHash: compositePromptManifestHashV1(
      [artifact.promptArtifactId],
      { compilerId: "legacy-prompt-renderer", version: "1.0" },
    ),
    compiler: { compilerId: "legacy-prompt-renderer", version: "1.0" },
    inputSchemaVersion: "orchestrator-task-input-v1",
    inputFingerprint: {
      algorithm: "scoped-sha256" as const,
      scopeId: "run-one-attempt-one",
      value: "3".repeat(64),
    },
    modelRouteId: route.modelRouteId,
    expectedRuntime: route.requiredCapabilities,
  };
  const mergedIdentity = { ...identity, ...overrides };
  const snapshotIdentity = {
    bindingScope: mergedIdentity.bindingScope,
    role: mergedIdentity.role,
    projectId: mergedIdentity.projectId,
    changeId: mergedIdentity.changeId,
    waveId: mergedIdentity.waveId,
    taskId: mergedIdentity.taskId,
    runId: mergedIdentity.runId,
    attemptId: mergedIdentity.attemptId,
    ...(mergedIdentity.invocationId
      ? { invocationId: mergedIdentity.invocationId }
      : {}),
    ...(mergedIdentity.parentAttemptBindingId
      ? { parentAttemptBindingId: mergedIdentity.parentAttemptBindingId }
      : {}),
    plan: mergedIdentity.plan,
    authorizationId: mergedIdentity.authorizationId,
    workspace: mergedIdentity.workspace,
    promptArtifactIds: mergedIdentity.promptArtifactIds,
    compositeManifestHash: mergedIdentity.compositeManifestHash,
    compiler: mergedIdentity.compiler,
    inputSchemaVersion: mergedIdentity.inputSchemaVersion,
    inputFingerprint: mergedIdentity.inputFingerprint,
    modelRouteId: mergedIdentity.modelRouteId,
    expectedRuntime: mergedIdentity.expectedRuntime,
  };
  return {
    contractType: "AttemptConfigurationBindingV1" as const,
    contractVersion: "1.0" as const,
    bindingId: "binding-attempt-one",
    ...mergedIdentity,
    boundBy: "dispatch-gate:prompt-model-v1",
    reason: "managed-executor-pre-execution-binding",
    boundAt: "2026-08-01T10:02:00.000Z",
    evidenceSnapshotHash: attemptEvidenceSnapshotHashV1(snapshotIdentity),
  };
}

function lineageRejected(reasonCode: string) {
  return (error: unknown) =>
    error instanceof ChangeControlError &&
    Boolean(error.reasons?.includes(reasonCode as never));
}

function resolvedExecutionV1(
  binding: AttemptConfigurationBindingV1,
  overrides: Partial<ResolvedModelExecutionV1> = {},
): ResolvedModelExecutionV1 {
  return {
    contractType: "ResolvedModelExecutionV1",
    contractVersion: "1.0",
    resolutionId: `resolution-${binding.attemptId}`,
    bindingId: binding.bindingId,
    projectId: binding.projectId,
    changeId: binding.changeId,
    waveId: binding.waveId,
    taskId: binding.taskId,
    runId: binding.runId,
    attemptId: binding.attemptId,
    ...(binding.invocationId ? { invocationId: binding.invocationId } : {}),
    modelRouteId: binding.modelRouteId,
    providerId: "openai",
    providerAdapterId: "codex-cli",
    providerAdapterVersion: "1.0",
    runtimeId: "codex-cli",
    providerModelId: "gpt-5.6-terra",
    resolvedModelClass: "terra",
    capabilityMapVersion: "codex-cli-capabilities-v1",
    reasoningLevel: "medium",
    toolRoute: "local-tools",
    resolutionReasonCode: "REQUESTED_ROUTE_RESOLVED",
    fallback: { used: false },
    startedAt: "2026-08-01T10:02:00.000Z",
    measurements: {
      inputTokens: { state: "unsupported" },
      outputTokens: { state: "unsupported" },
      latency: { state: "unsupported" },
      cost: { state: "unsupported" },
      cache: { state: "unsupported" },
      providerMetadata: { state: "unsupported" },
    },
    ...overrides,
  };
}

function canonicalTestJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalTestJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalTestJson(record[key])}`)
    .join(",")}}`;
}

function ajvErrors(
  errors: ReadonlyArray<{ instancePath?: string; message?: string }> | null | undefined,
): string {
  return errors
    ?.map((error) => `${error.instancePath ?? ""} ${error.message ?? ""}`.trim())
    .join("; ") ?? "";
}

function gitForWorkspaceContract(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function windowsPathContained(root: string, candidate: string): boolean {
  const normalizedRoot = win32.resolve(root).replace(/[\\/]+$/, "").toLowerCase();
  const normalizedCandidate = win32.resolve(candidate).replace(/[\\/]+$/, "").toLowerCase();
  return normalizedCandidate === normalizedRoot
    || normalizedCandidate.startsWith(`${normalizedRoot}\\`);
}

function windowsWorkspaceCapability(): "supported" | "unsupported_fail_closed" {
  return process.platform === "win32" ? "supported" : "unsupported_fail_closed";
}

async function waitForLine(
  child: ReturnType<typeof spawn>,
  expected: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for child output ${expected}`)),
      10_000,
    );
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      if (!output.includes(expected)) {
        clearTimeout(timeout);
        reject(new Error(`Child exited ${code} before output ${expected}`));
      }
    });
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.includes(expected)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function stopChild(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill();
  await exited;
}

function rehashTestLedger(ledger: {
  events: Array<Record<string, unknown>>;
}) {
  let previousHash: string | null = null;
  for (const event of ledger.events) {
    event.previousHash = previousHash;
    const { hash: _discardedHash, ...hashInput } = event;
    event.hash = createHash("sha256")
      .update(canonicalTestJson(hashInput))
      .digest("hex");
    previousHash = event.hash as string;
  }
}

test("change-control ledger serializes project writes and rebuilds immutable projections", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-change-control-"));
  try {
    const store = new ChangeControlStore(root);
    const [first, second] = await Promise.all([
      store.create("project-one", {
        changeId: "change-one",
        actor: "user:alice",
        payload: { title: "First change", nested: { priority: 1 } },
      }),
      store.create("project-one", {
        changeId: "change-two",
        actor: "user:bob",
        payload: { title: "Second change" },
      }),
    ]);
    assert.deepEqual(
      [first.change.sequence, second.change.sequence].sort((left, right) => left - right),
      [1, 2],
    );

    const [planned, active] = await Promise.all([
      store.transition("project-one", "change-one", {
        to: "planned",
        actor: "user:planner",
      }),
      store.transition("project-one", "change-one", {
        to: "active",
        actor: "user:operator",
        payload: { note: "Started" },
      }),
    ]);
    assert.equal(planned.change.status, "planned");
    assert.equal(active.change.status, "active");
    assert.deepEqual(active.change.details, {
      title: "First change",
      nested: { priority: 1 },
    });
    assert.deepEqual(active.events.map((event) => event.sequence), [1, 3, 4]);
    assert.equal(active.events[0].previousHash, null);
    assert.equal(active.events[1].previousHash, second.events[0].hash);
    assert.equal(active.events[2].previousHash, active.events[1].hash);

    for (const event of active.events) {
      assert.deepEqual(Object.keys(event).sort(), [
        "actor",
        "causationId",
        "changeId",
        "correlationId",
        "hash",
        "id",
        "occurredAt",
        "payload",
        "previousHash",
        "projectId",
        "sequence",
        "type",
      ]);
      assert.match(event.id, /^[A-Za-z0-9][A-Za-z0-9._:-]+$/);
      assert.equal(new Date(event.occurredAt).toISOString(), event.occurredAt);
      assert.equal(event.projectId, "project-one");
      assert.equal(event.changeId, "change-one");
      assert.equal(typeof event.causationId, "string");
      assert.equal(typeof event.correlationId, "string");
      assert.equal(event.hash.length, 64);
      assert.ok(Object.isFrozen(event));
      assert.ok(Object.isFrozen(event.payload));
    }
    assert.equal(active.events[1].causationId, active.events[0].id);
    assert.equal(active.events[2].causationId, active.events[1].id);
    assert.deepEqual(active.events[1].payload, {
      from: "draft",
      to: "planned",
      data: {},
    });
    assert.deepEqual(active.events[2].payload, {
      from: "planned",
      to: "active",
      data: { note: "Started" },
    });

    const reloaded = new ChangeControlStore(root);
    const rebuilt = await reloaded.get("project-one", "change-one");
    assert.deepEqual(rebuilt, active);
    assert.deepEqual(
      (await reloaded.list("project-one")).map((change) => [
        change.changeId,
        change.status,
      ]),
      [
        ["change-two", "draft"],
        ["change-one", "active"],
      ],
    );

    await assert.rejects(
      reloaded.transition("project-one", "change-one", {
        to: "planned",
        actor: "user:operator",
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CONFLICT" &&
        /Illegal change transition/.test(error.message),
    );
    await assert.rejects(
      reloaded.transition("project-one", "change-one", {
        to: "unknown" as "active",
        actor: "user:operator",
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT",
    );

    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("project-one").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<{ type: string }>;
    };
    assert.equal(ledger.events.length, 4);
    assert.deepEqual(await readdir(join(root, "projects")), [
      `${createHash("sha256").update("project-one").digest("hex")}.json`,
    ]);
    ledger.events[0].type = "change.unknown";
    await writeFile(projectFile, JSON.stringify(ledger));
    await assert.rejects(
      reloaded.get("project-one", "change-one"),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /Unknown change-control event type/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 publishes one classified halt and one effective incident atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-incidents-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
      createId: (() => {
        let ordinal = 0;
        return () => `phase4-id-${++ordinal}`;
      })(),
    });
    await seedPhase4Scope(store);
    const contracts = fingerprintedHaltContractsV1({
      haltId: "halt-one",
      detectorEventId: "detector-event-one",
    });

    const published = await store.detectAndClassifyHalt(
      "planning-project",
      contracts,
    );

    assert.equal(published.halt.state, "classified");
    assert.equal(published.halt.effectiveIncidentId, published.incident.incidentId);
    assert.deepEqual(published.incident.haltIds, ["halt-one"]);
    assert.equal(published.assessment.confidence, "exact");
    assert.deepEqual(
      published.events.map((event) => event.type),
      ["halt.detected", "incident.opened", "halt.classified"],
    );
    const eventValidator = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(haltsIncidentsV1Schema);
    for (const event of published.events)
      assert.equal(
        eventValidator(event),
        true,
        JSON.stringify(eventValidator.errors),
      );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Halts and Incidents Contract v1 examples validate and unsafe fixtures fail closed", () => {
  const validator = new Ajv2020({
    allErrors: true,
    strict: true,
  }).compile(haltsIncidentsV1Schema);
  for (const example of haltsIncidentsV1Examples)
    assert.equal(
      validator(example),
      true,
      JSON.stringify(validator.errors),
    );

  const missingExplicitScope = structuredClone(
    haltsIncidentsV1Examples[0],
  ) as Record<string, unknown>;
  delete (missingExplicitScope.scope as Record<string, unknown>).attemptId;
  assert.equal(validator(missingExplicitScope), false);

  const unsupportedTaxonomy = structuredClone(
    haltsIncidentsV1Examples[1],
  ) as Record<string, unknown>;
  unsupportedTaxonomy.taxonomyPolicyVersion = "halt-taxonomy-v2";
  assert.equal(validator(unsupportedTaxonomy), false);

  const unknownEvent = {
    id: "event-unknown",
    sequence: 1,
    type: "incident.force-closed",
    occurredAt: "2026-07-31T10:00:00.000Z",
    projectId: "orchestrator",
    changeId: "change-phase4",
    actor: "human:test",
    causationId: "cause",
    correlationId: "correlation",
    payload: {},
    previousHash: null,
    hash: "1".repeat(64),
  };
  assert.equal(validator(unknownEvent), false);
});

test("Warden Contract v1 examples validate and automatic verdicts cannot omit authority", () => {
  const validator = new Ajv2020({
    allErrors: true,
    strict: true,
  }).compile(wardenV1Schema);
  for (const example of wardenV1Examples)
    assert.equal(validator(example), true, JSON.stringify(validator.errors));

  assert.deepEqual(WARDEN_DISPOSITIONS_V1, [
    "allow_auto_heal",
    "allow_bounded_retry",
    "require_replan",
    "require_human",
    "quarantine",
  ]);
  assert.deepEqual(WARDEN_DENIAL_REASON_CODES_V1, [
    "HALT_EVIDENCE_INVALID",
    "HALT_CLASS_UNKNOWN",
    "ATTRIBUTION_NOT_EXACT",
    "WARDEN_POLICY_UNKNOWN",
    "EVIDENCE_STALE",
    "SIDE_EFFECT_AMBIGUOUS",
    "RECIPE_NOT_ALLOWLISTED",
    "RECIPE_PRECONDITION_FAILED",
    "REPAIR_BUDGET_EXHAUSTED",
    "REPAIR_LEASE_LOST",
    "REPAIR_RESULT_AMBIGUOUS",
    "REPLAN_REQUIRED",
    "HUMAN_AUTHORITY_REQUIRED",
    "BLOCKING_INCIDENT_OPEN",
  ]);

  const allowVerdict = structuredClone(
    wardenV1Examples.find(
      (example) =>
        (example as { contractType?: string }).contractType ===
        "WardenVerdictV1",
    ),
  ) as Record<string, unknown>;
  assert.equal(allowVerdict.disposition, "allow_bounded_retry");
  for (const requiredField of [
    "attributionAssessmentId",
    "evidenceSnapshot",
    "recipe",
    "budgets",
    "repairLease",
    "idempotencyKey",
  ]) {
    const unsafe = structuredClone(allowVerdict);
    delete unsafe[requiredField];
    assert.equal(validator(unsafe), false, requiredField);
  }
  const missingOracle = structuredClone(allowVerdict);
  delete (
    (missingOracle.evidenceSnapshot as Record<string, unknown>)
  ).successOracle;
  assert.equal(validator(missingOracle), false);
  const openDisposition = structuredClone(allowVerdict);
  openDisposition.disposition = "warn_and_continue";
  assert.equal(validator(openDisposition), false);
});

test("Warden evaluates exact canonical evidence and every policy denial fail closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-warden-denials-"));
  let now = "2026-07-31T10:00:00.000Z";
  try {
    const store = new ChangeControlStore(root, { now: () => now });
    await seedPhase4Scope(store);
    let ordinal = 0;
    const evaluate = async (input: {
      name: string;
      haltClass?: AttributionAssessmentV1["haltClass"];
      confidence?: AttributionAssessmentV1["confidence"];
      sideEffectState?: AttributionAssessmentV1["evidence"]["sideEffectState"];
      policyVersion?: string;
      requestedAction?: "auto_heal" | "bounded_retry" | "none";
      snapshot?: Partial<Omit<WardenEvidenceSnapshotV1, "snapshotHash">>;
      corruptSnapshotHash?: boolean;
      recipe?: (typeof WARDEN_REPAIR_RECIPES_V1)[number] | {
        recipeId: string;
        recipeVersion: string;
        codeHash: string;
      };
    }) => {
      now = "2026-07-31T10:00:00.000Z";
      const contracts = fingerprintedHaltContractsV1({
        haltId: `halt-warden-${input.name}`,
        detectorEventId: `detector-warden-${input.name}`,
        haltClass: input.haltClass ?? "retryable_provider_or_process",
        confidence: input.confidence ?? "exact",
      });
      if (input.sideEffectState)
        contracts.assessment = {
          ...contracts.assessment,
          evidence: {
            ...contracts.assessment.evidence,
            sideEffectState: input.sideEffectState,
          },
        };
      const aggregate = await store.detectAndClassifyHalt(
        "planning-project",
        contracts,
      );
      let snapshot = wardenEvidenceSnapshotV1(
        aggregate,
        input.snapshot,
      );
      if (input.corruptSnapshotHash)
        snapshot = { ...snapshot, snapshotHash: "f".repeat(64) };
      if (input.name === "stale") now = "2026-07-31T10:10:01.000Z";
      ordinal += 1;
      return store.evaluateWardenVerdict(
        "planning-project",
        aggregate.halt.haltId,
        {
          verdictId: `verdict-denial-${ordinal}`,
          policyVersion: input.policyVersion ?? "warden-policy-v1",
          verdictOrdinal: 1,
          requestedAction: input.requestedAction ?? "bounded_retry",
          evidenceSnapshot: snapshot,
          recipe:
            input.recipe ??
            WARDEN_REPAIR_RECIPES_V1.find(
              (recipe) => recipe.recipeId === "provider-read-retry-v1",
            )!,
          idempotencyKey: `warden-denial-${ordinal}`,
          lease: {
            leaseId: `repair-lease-denial-${ordinal}`,
            expectedEpoch: 1,
          },
        },
      );
    };

    assert.equal(
      (await evaluate({ name: "invalid", corruptSnapshotHash: true })).verdict
        .reasonCode,
      "HALT_EVIDENCE_INVALID",
    );
    assert.equal(
      (await evaluate({
        name: "conflicting-evidence",
        snapshot: { sideEffectState: "possible" },
      })).verdict.reasonCode,
      "HALT_EVIDENCE_INVALID",
    );
    assert.equal(
      (await evaluate({ name: "unknown", haltClass: "unknown", confidence: "none" }))
        .verdict.reasonCode,
      "HALT_CLASS_UNKNOWN",
    );
    assert.equal(
      (await evaluate({
        name: "partial",
        haltClass: "ownership_or_state_ambiguity",
        confidence: "partial",
      })).verdict.reasonCode,
      "ATTRIBUTION_NOT_EXACT",
    );
    assert.equal(
      (await evaluate({ name: "policy", policyVersion: "warden-policy-v2" }))
        .verdict.reasonCode,
      "WARDEN_POLICY_UNKNOWN",
    );
    assert.equal(
      (await evaluate({ name: "stale" })).verdict.reasonCode,
      "EVIDENCE_STALE",
    );
    assert.equal(
      (await evaluate({ name: "side-effect", sideEffectState: "possible" }))
        .verdict.reasonCode,
      "SIDE_EFFECT_AMBIGUOUS",
    );
    assert.equal(
      (await evaluate({
        name: "recipe",
        recipe: {
          recipeId: "unsupported-recipe-v1",
          recipeVersion: "1.0",
          codeHash: "9".repeat(64),
        },
      })).verdict.reasonCode,
      "RECIPE_NOT_ALLOWLISTED",
    );
    assert.equal(
      (await evaluate({
        name: "precondition",
        snapshot: { preconditionsUnchanged: false },
      })).verdict.reasonCode,
      "RECIPE_PRECONDITION_FAILED",
    );
    assert.equal(
      (await evaluate({
        name: "unregistered-oracle",
        snapshot: {
          successOracle: {
            oracleId: "oracle:unregistered-success-v1",
            kind: "typed_adapter",
            evidenceRefs: ["oracle:unregistered:success"],
          },
        },
      })).verdict.reasonCode,
      "HALT_EVIDENCE_INVALID",
    );
    assert.equal(
      (await evaluate({
        name: "unregistered-stop-oracle",
        snapshot: {
          stopOracle: {
            oracleId: "oracle:unregistered-stop-v1",
            kind: "typed_adapter",
            evidenceRefs: ["oracle:unregistered:stop"],
          },
        },
      })).verdict.reasonCode,
      "HALT_EVIDENCE_INVALID",
    );
    assert.equal(
      (await evaluate({
        name: "ambiguous-result",
        snapshot: { priorRepairResult: "ambiguous" },
      })).verdict.reasonCode,
      "REPAIR_RESULT_AMBIGUOUS",
    );
    assert.equal(
      (await evaluate({
        name: "replan",
        haltClass: "plan_or_target_drift",
        requestedAction: "none",
      })).verdict.reasonCode,
      "REPLAN_REQUIRED",
    );
    assert.equal(
      (await evaluate({
        name: "human",
        haltClass: "human_decision_required",
        requestedAction: "none",
      })).verdict.reasonCode,
      "HUMAN_AUTHORITY_REQUIRED",
    );
    const projection = await store.getWardenProjection("planning-project");
    assert.equal(projection.verdicts.length, 14);
    assert.ok(
      projection.verdicts.every((verdict) =>
        ["require_replan", "require_human", "quarantine"].includes(
          verdict.disposition,
        ),
      ),
    );
    assert.equal(projection.leases.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Warden allow verdicts hold one monotonic lease, preserve superseding history, and replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-warden-replay-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
    });
    await seedPhase4Scope(store);
    const aggregate = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-warden-allow",
        detectorEventId: "detector-warden-allow",
        haltClass: "retryable_provider_or_process",
      }),
    );
    const recipe = WARDEN_REPAIR_RECIPES_V1.find(
      (candidate) => candidate.recipeId === "provider-read-retry-v1",
    )!;
    const allowed = await store.evaluateWardenVerdict(
      "planning-project",
      aggregate.halt.haltId,
      {
        verdictId: "verdict-allow-one",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(aggregate),
        recipe,
        idempotencyKey: "retry:halt-warden-allow:1",
        lease: { leaseId: "repair-lease-one", expectedEpoch: 1 },
      },
    );
    assert.equal(allowed.verdict.disposition, "allow_bounded_retry");
    assert.equal(allowed.verdict.reasonCode, null);
    assert.equal(allowed.verdict.repairLease?.epoch, 1);
    assert.equal(allowed.halt.state, "action_pending");
    assert.equal(allowed.verdict.budgets.remainingAfter.halt, 0);

    await assert.rejects(
      store.evaluateWardenVerdict("planning-project", aggregate.halt.haltId, {
        verdictId: "verdict-conflicting-lease",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 2,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1({
          ...aggregate,
          halt: allowed.halt,
        }),
        recipe,
        idempotencyKey: "retry:halt-warden-allow:2",
        lease: { leaseId: "repair-lease-two", expectedEpoch: 2 },
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CONFLICT" &&
        /active repair lease/.test(error.message),
    );

    const lost = await store.transitionWardenRepairLease(
      "planning-project",
      aggregate.halt.haltId,
      {
        leaseId: "repair-lease-one",
        leaseEpoch: 1,
        to: "lost",
        actor: "policy:warden-v1",
        evidenceRefs: ["lease:heartbeat:missing"],
        verdictId: "verdict-lease-lost",
      },
    );
    assert.equal(lost.verdict.disposition, "quarantine");
    assert.equal(lost.verdict.reasonCode, "REPAIR_LEASE_LOST");
    assert.equal(lost.verdict.verdictOrdinal, 2);
    assert.equal(lost.halt.state, "quarantined");

    const replayed = await new ChangeControlStore(root).getWardenProjection(
      "planning-project",
    );
    assert.deepEqual(
      replayed.verdicts.map((verdict) => [
        verdict.verdictId,
        verdict.verdictOrdinal,
        verdict.disposition,
      ]),
      [
        ["verdict-allow-one", 1, "allow_bounded_retry"],
        ["verdict-lease-lost", 2, "quarantine"],
      ],
    );
    assert.deepEqual(
      replayed.leases.map((lease) => [lease.leaseId, lease.epoch, lease.state]),
      [["repair-lease-one", 1, "lost"]],
    );
    assert.equal(replayed.activeVerdicts.length, 1);
    assert.equal(replayed.activeVerdicts[0].verdictId, "verdict-lease-lost");
    assert.ok(
      replayed.events.some((event) => event.type === "warden.verdict-recorded"),
    );

    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    const persistedVerdict = ledger.events.find(
      (event) => event.type === "warden.verdict-recorded",
    )!;
    const verdictPayload = persistedVerdict.payload as {
      verdict: { budgets: { remainingAfter: { project: number } } };
    };
    verdictPayload.verdict.budgets.remainingAfter.project += 1;
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");
    await assert.rejects(
      new ChangeControlStore(root).getWardenProjection("planning-project"),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /deterministic policy/.test(error.message),
    );

    verdictPayload.verdict.budgets.remainingAfter.project -= 1;
    const supersedingVerdict = ledger.events.filter(
      (event) => event.type === "warden.verdict-recorded",
    )[1]!;
    const supersedingCausationId = supersedingVerdict.causationId;
    supersedingVerdict.causationId = "unrelated-causation";
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");
    await assert.rejects(
      new ChangeControlStore(root).getWardenProjection("planning-project"),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /supersession causation/.test(error.message),
    );

    supersedingVerdict.causationId = supersedingCausationId;
    const firstVerdictPayload = persistedVerdict.payload as {
      verdict: { repairLease: { projectId: string } };
    };
    firstVerdictPayload.verdict.repairLease.projectId = "foreign-project";
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");
    await assert.rejects(
      new ChangeControlStore(root).getWardenProjection("planning-project"),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /exact repair authority/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Warden accepts every exact allowlisted recipe identity and class pairing", async () => {
  for (const recipe of WARDEN_REPAIR_RECIPES_V1) {
    const root = await mkdtemp(join(tmpdir(), "orchestrator-warden-recipe-"));
    try {
      const store = new ChangeControlStore(root, {
        now: () => "2026-07-31T10:00:00.000Z",
      });
      await seedPhase4Scope(store);
      const aggregate = await store.detectAndClassifyHalt(
        "planning-project",
        fingerprintedHaltContractsV1({
          haltId: `halt-${recipe.recipeId}`,
          detectorEventId: `detector-${recipe.recipeId}`,
          haltClass: recipe.haltClass,
        }),
      );
      const result = await store.evaluateWardenVerdict(
        "planning-project",
        aggregate.halt.haltId,
        {
          verdictId: `verdict-${recipe.recipeId}`,
          policyVersion: "warden-policy-v1",
          verdictOrdinal: 1,
          requestedAction:
            recipe.disposition === "allow_auto_heal"
              ? "auto_heal"
              : "bounded_retry",
          evidenceSnapshot: wardenEvidenceSnapshotV1(aggregate, {}, recipe),
          recipe,
          idempotencyKey: `idempotency:${recipe.recipeId}`,
          lease: {
            leaseId: `lease-${recipe.recipeId}`,
            expectedEpoch: 1,
          },
        },
      );
      assert.equal(result.verdict.disposition, recipe.disposition);
      assert.deepEqual(result.verdict.recipe, {
        recipeId: recipe.recipeId,
        recipeVersion: recipe.recipeVersion,
        codeHash: recipe.codeHash,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("Doctor executes every closed typed recipe with exact idempotency and immutable receipts", async () => {
  for (const recipe of WARDEN_REPAIR_RECIPES_V1) {
    const root = await mkdtemp(join(tmpdir(), "orchestrator-doctor-recipe-"));
    const states = new Map<string, DoctorObservationV1["state"]>();
    const executions = new Map<string, number>();
    try {
      const store = new ChangeControlStore(root, {
        now: () => "2026-07-31T10:00:00.000Z",
        doctorAdapters: doctorAdaptersV1(states, executions),
      });
      await seedPhase4Scope(store);
      const halt = await store.detectAndClassifyHalt(
        "planning-project",
        fingerprintedHaltContractsV1({
          haltId: "halt-doctor-" + recipe.recipeId,
          detectorEventId: "detector-doctor-" + recipe.recipeId,
          haltClass: recipe.haltClass,
        }),
      );
      const allowed = await store.evaluateWardenVerdict(
        "planning-project",
        halt.halt.haltId,
        {
          verdictId: "verdict-doctor-" + recipe.recipeId,
          policyVersion: "warden-policy-v1",
          verdictOrdinal: 1,
          requestedAction:
            recipe.disposition === "allow_auto_heal"
              ? "auto_heal"
              : "bounded_retry",
          evidenceSnapshot: wardenEvidenceSnapshotV1(halt, {}, recipe),
          recipe,
          idempotencyKey: "doctor-key:" + recipe.recipeId,
          lease: {
            leaseId: "doctor-lease-" + recipe.recipeId,
            expectedEpoch: 1,
          },
        },
      );
      const request = {
        receiptId: "doctor-receipt-" + recipe.recipeId,
        verdictId: allowed.verdict.verdictId,
        invocationOrdinal: 1,
        input: doctorInputV1(recipe.recipeId),
      };
      const completed = await store.executeDoctorRepair(
        "planning-project",
        halt.halt.haltId,
        request,
      );
      assert.equal(completed.receipt?.result, "succeeded");
      assert.equal(completed.receipt?.lease.fenced, true);
      assert.equal(completed.receipt?.successOracle.outcome, "passed");
      assert.equal(executions.get(recipe.recipeId), 1);
      assert.deepEqual(
        completed.events.map((event) => event.type),
        ["doctor.repair-finished"],
      );

      const replay = await store.executeDoctorRepair(
        "planning-project",
        halt.halt.haltId,
        request,
      );
      assert.deepEqual(replay.receipt, completed.receipt);
      assert.equal(executions.get(recipe.recipeId), 1);
      assert.equal(
        (await store.getHalt("planning-project", halt.halt.haltId)).halt.state,
        "action_pending",
      );
      assert.equal(
        (await store.getHalt("planning-project", halt.halt.haltId)).incident.state,
        "open",
      );

      const restarted = new ChangeControlStore(root, {
        doctorAdapters: doctorAdaptersV1(states, executions),
      });
      const projection = await restarted.getDoctorProjection("planning-project");
      assert.equal(projection.receipts.length, 1);
      assert.equal(projection.pendingInvocations.length, 0);
      assert.ok(
        projection.events.some((event) => event.type === "doctor.repair-started"),
      );
      assert.ok(
        projection.events.some((event) => event.type === "doctor.repair-finished"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("Doctor recovery never re-executes reobserve-then-finalize recipes", async () => {
  for (const recipe of WARDEN_REPAIR_RECIPES_V1.filter(
    (candidate) => candidate.crashPolicy === "reobserve_then_finalize",
  )) {
    const root = await mkdtemp(join(tmpdir(), "orchestrator-doctor-finalize-replay-"));
    const states = new Map<string, DoctorObservationV1["state"]>();
    const executions = new Map<string, number>();
    let proveSuccessOnCrash = false;
    try {
      const adapters = doctorAdaptersV1(states, executions);
      const store = new ChangeControlStore(root, {
        now: () => "2026-07-31T10:00:00.000Z",
        doctorAdapters: adapters,
        onDoctorBoundary: (boundary) => {
          if (boundary === "started_persisted") {
            if (proveSuccessOnCrash) states.set(recipe.recipeId, "succeeded");
            throw new Error("simulated crash");
          }
        },
      });
      await seedPhase4Scope(store);

      const readyHalt = await store.detectAndClassifyHalt(
        "planning-project",
        fingerprintedHaltContractsV1({
          haltId: "halt-finalize-ready-" + recipe.recipeId,
          detectorEventId: "detector-finalize-ready-" + recipe.recipeId,
          haltClass: recipe.haltClass,
          normalizedRootCauseKey: "finalize-ready:" + recipe.recipeId,
        }),
      );
      const readyVerdict = await store.evaluateWardenVerdict(
        "planning-project",
        readyHalt.halt.haltId,
        {
          verdictId: "verdict-finalize-ready-" + recipe.recipeId,
          policyVersion: "warden-policy-v1",
          verdictOrdinal: 1,
          requestedAction: "auto_heal",
          evidenceSnapshot: wardenEvidenceSnapshotV1(readyHalt, {}, recipe),
          recipe,
          idempotencyKey: "finalize-ready-key:" + recipe.recipeId,
          lease: {
            leaseId: "finalize-ready-lease-" + recipe.recipeId,
            expectedEpoch: 1,
          },
        },
      );
      await assert.rejects(
        store.executeDoctorRepair(
          "planning-project",
          readyHalt.halt.haltId,
          {
            receiptId: "finalize-ready-receipt-" + recipe.recipeId,
            verdictId: readyVerdict.verdict.verdictId,
            invocationOrdinal: 1,
            input: doctorInputV1(recipe.recipeId),
          },
        ),
        /simulated crash/,
      );
      const readyRecovery = await new ChangeControlStore(root, {
        now: () => "2026-07-31T10:00:00.000Z",
        doctorAdapters: adapters,
      }).recoverDoctorRepairs("planning-project");
      assert.equal(readyRecovery[0].receipt?.result, "quarantined");
      assert.equal(
        readyRecovery[0].receipt?.reasonCode,
        "REPAIR_RESULT_AMBIGUOUS",
      );
      assert.equal(readyRecovery[0].receipt?.successOracle.outcome, "ambiguous");
      assert.equal(executions.get(recipe.recipeId) ?? 0, 0);

      proveSuccessOnCrash = true;
      states.set(recipe.recipeId, "ready");
      const succeededHalt = await store.detectAndClassifyHalt(
        "planning-project",
        fingerprintedHaltContractsV1({
          haltId: "halt-finalize-succeeded-" + recipe.recipeId,
          detectorEventId: "detector-finalize-succeeded-" + recipe.recipeId,
          haltClass: recipe.haltClass,
          normalizedRootCauseKey: "finalize-succeeded:" + recipe.recipeId,
        }),
      );
      const succeededVerdict = await store.evaluateWardenVerdict(
        "planning-project",
        succeededHalt.halt.haltId,
        {
          verdictId: "verdict-finalize-succeeded-" + recipe.recipeId,
          policyVersion: "warden-policy-v1",
          verdictOrdinal: 1,
          requestedAction: "auto_heal",
          evidenceSnapshot: wardenEvidenceSnapshotV1(succeededHalt, {}, recipe),
          recipe,
          idempotencyKey: "finalize-succeeded-key:" + recipe.recipeId,
          lease: {
            leaseId: "finalize-succeeded-lease-" + recipe.recipeId,
            expectedEpoch: 1,
          },
        },
      );
      await assert.rejects(
        store.executeDoctorRepair(
          "planning-project",
          succeededHalt.halt.haltId,
          {
            receiptId: "finalize-succeeded-receipt-" + recipe.recipeId,
            verdictId: succeededVerdict.verdict.verdictId,
            invocationOrdinal: 1,
            input: doctorInputV1(recipe.recipeId),
          },
        ),
        /simulated crash/,
      );
      const succeededRecovery = await new ChangeControlStore(root, {
        now: () => "2026-07-31T10:00:00.000Z",
        doctorAdapters: adapters,
      }).recoverDoctorRepairs("planning-project");
      assert.equal(succeededRecovery[0].receipt?.result, "succeeded");
      assert.equal(executions.get(recipe.recipeId) ?? 0, 0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("Doctor rejects caller authority, recovers crashes, fences lease loss, and quarantines ambiguity", async () => {
  const crashRoot = await mkdtemp(join(tmpdir(), "orchestrator-doctor-crash-"));
  const states = new Map<string, DoctorObservationV1["state"]>();
  const executions = new Map<string, number>();
  let crashBoundary: "started_persisted" | "effect_completed" | undefined =
    "started_persisted";
  try {
    const adapters = doctorAdaptersV1(states, executions);
    const store = new ChangeControlStore(crashRoot, {
      now: () => "2026-07-31T10:00:00.000Z",
      doctorAdapters: adapters,
      onDoctorBoundary: (boundary) => {
        if (boundary === crashBoundary) throw new Error("simulated crash");
      },
    });
    await seedPhase4Scope(store);
    const halt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-doctor-crash",
        detectorEventId: "detector-doctor-crash",
        haltClass: "retryable_provider_or_process",
      }),
    );
    const recipe = WARDEN_REPAIR_RECIPES_V1[0];
    const allowed = await store.evaluateWardenVerdict(
      "planning-project",
      halt.halt.haltId,
      {
        verdictId: "verdict-doctor-crash",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(halt),
        recipe,
        idempotencyKey: "doctor-crash-key",
        lease: { leaseId: "doctor-crash-lease", expectedEpoch: 1 },
      },
    );
    const request = {
      receiptId: "doctor-crash-receipt",
      verdictId: allowed.verdict.verdictId,
      invocationOrdinal: 1,
      input: doctorInputV1(recipe.recipeId),
    };
    await assert.rejects(
      store.executeDoctorRepair("planning-project", halt.halt.haltId, request),
      /simulated crash/,
    );
    assert.equal(
      (await store.getDoctorProjection("planning-project")).pendingInvocations.length,
      1,
    );
    crashBoundary = undefined;
    const recovered = await new ChangeControlStore(crashRoot, {
      now: () => "2026-07-31T10:00:00.000Z",
      doctorAdapters: adapters,
    }).recoverDoctorRepairs("planning-project");
    assert.equal(recovered[0].receipt?.result, "succeeded");
    assert.equal(executions.get(recipe.recipeId), 1);

    states.set(recipe.recipeId, "ready");
    crashBoundary = "effect_completed";
    const afterEffectHalt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-doctor-crash-after-effect",
        detectorEventId: "detector-doctor-crash-after-effect",
        haltClass: "retryable_provider_or_process",
        normalizedRootCauseKey: "provider:crash-after-effect",
      }),
    );
    const afterEffectAllowed = await store.evaluateWardenVerdict(
      "planning-project",
      afterEffectHalt.halt.haltId,
      {
        verdictId: "verdict-doctor-crash-after-effect",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(afterEffectHalt),
        recipe,
        idempotencyKey: "doctor-crash-after-effect-key",
        lease: { leaseId: "doctor-crash-after-effect-lease", expectedEpoch: 1 },
      },
    );
    await assert.rejects(
      store.executeDoctorRepair(
        "planning-project",
        afterEffectHalt.halt.haltId,
        {
          receiptId: "doctor-crash-after-effect-receipt",
          verdictId: afterEffectAllowed.verdict.verdictId,
          invocationOrdinal: 1,
          input: doctorInputV1(recipe.recipeId),
        },
      ),
      /simulated crash/,
    );
    crashBoundary = undefined;
    const recoveredAfterEffect = await new ChangeControlStore(crashRoot, {
      now: () => "2026-07-31T10:00:00.000Z",
      doctorAdapters: adapters,
    }).recoverDoctorRepairs("planning-project");
    assert.equal(recoveredAfterEffect[0].receipt?.result, "succeeded");
    assert.equal(executions.get(recipe.recipeId), 2);

    await assert.rejects(
      store.executeDoctorRepair("planning-project", halt.halt.haltId, {
        ...request,
        receiptId: "doctor-conflicting-receipt",
      }),
      /idempotency key.*conflicting/i,
    );
    await assert.rejects(
      store.executeDoctorRepair("planning-project", halt.halt.haltId, {
        ...request,
        input: {
          ...doctorInputV1(recipe.recipeId),
          shell: "git reset --hard",
        } as unknown as DoctorRecipeInputV1,
      }),
      /closed typed recipe input/,
    );
  } finally {
    await rm(crashRoot, { recursive: true, force: true });
  }

  const fencedRoot = await mkdtemp(join(tmpdir(), "orchestrator-doctor-fence-"));
  try {
    const fenceStates = new Map<string, DoctorObservationV1["state"]>();
    const fenceAdapters = doctorAdaptersV1(fenceStates);
    let fencedStore: InstanceType<typeof ChangeControlStore>;
    fencedStore = new ChangeControlStore(fencedRoot, {
      now: () => "2026-07-31T10:00:00.000Z",
      doctorAdapters: fenceAdapters,
      onDoctorBoundary: async (boundary, invocation) => {
        if (boundary !== "effect_completed") return;
        await new ChangeControlStore(fencedRoot).transitionWardenRepairLease(
          "planning-project",
          invocation.haltId,
          {
            leaseId: invocation.lease.leaseId,
            leaseEpoch: invocation.lease.epoch,
            to: "lost",
            actor: "policy:warden-v1",
            evidenceRefs: ["doctor:test:lease-lost"],
            verdictId: "verdict-doctor-fenced-lost",
          },
        );
      },
    });
    await seedPhase4Scope(fencedStore);
    const halt = await fencedStore.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-doctor-fenced",
        detectorEventId: "detector-doctor-fenced",
        haltClass: "retryable_provider_or_process",
      }),
    );
    const recipe = WARDEN_REPAIR_RECIPES_V1[0];
    const allowed = await fencedStore.evaluateWardenVerdict(
      "planning-project",
      halt.halt.haltId,
      {
        verdictId: "verdict-doctor-fenced",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(halt),
        recipe,
        idempotencyKey: "doctor-fenced-key",
        lease: { leaseId: "doctor-fenced-lease", expectedEpoch: 1 },
      },
    );
    const fenced = await fencedStore.executeDoctorRepair(
      "planning-project",
      halt.halt.haltId,
      {
        receiptId: "doctor-fenced-receipt",
        verdictId: allowed.verdict.verdictId,
        invocationOrdinal: 1,
        input: doctorInputV1(recipe.recipeId),
      },
    );
    assert.equal(fenced.receipt?.result, "quarantined");
    assert.equal(fenced.receipt?.reasonCode, "REPAIR_LEASE_LOST");
    assert.equal(fenced.receipt?.lease.fenced, false);
    assert.notEqual(fenced.receipt?.successOracle.outcome, "passed");
  } finally {
    await rm(fencedRoot, { recursive: true, force: true });
  }

  const preEffectFenceRoot = await mkdtemp(
    join(tmpdir(), "orchestrator-doctor-pre-effect-fence-"),
  );
  try {
    const states = new Map<string, DoctorObservationV1["state"]>();
    const baseAdapters = doctorAdaptersV1(states);
    let effects = 0;
    const adapters: DoctorAdapterRegistryV1 = {
      ...baseAdapters,
      "provider-read-retry-v1": {
        ...baseAdapters["provider-read-retry-v1"],
        executeAttempt: async (input, context) => {
          await new ChangeControlStore(preEffectFenceRoot).transitionWardenRepairLease(
            "planning-project",
            context.haltId,
            {
              leaseId: context.leaseId,
              leaseEpoch: context.leaseEpoch,
              to: "lost",
              actor: "policy:warden-v1",
              evidenceRefs: ["doctor:test:pre-effect-lease-lost"],
              verdictId: "verdict-doctor-pre-effect-lease-lost",
            },
          );
          await context.assertLiveFence();
          effects += 1;
          return baseAdapters["provider-read-retry-v1"].executeAttempt(
            input,
            context,
          );
        },
      },
    };
    const store = new ChangeControlStore(preEffectFenceRoot, {
      now: () => "2026-07-31T10:00:00.000Z",
      doctorAdapters: adapters,
    });
    await seedPhase4Scope(store);
    const halt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-doctor-pre-effect-fenced",
        detectorEventId: "detector-doctor-pre-effect-fenced",
        haltClass: "retryable_provider_or_process",
      }),
    );
    const recipe = WARDEN_REPAIR_RECIPES_V1[0];
    const allowed = await store.evaluateWardenVerdict(
      "planning-project",
      halt.halt.haltId,
      {
        verdictId: "verdict-doctor-pre-effect-fenced",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(halt),
        recipe,
        idempotencyKey: "doctor-pre-effect-fenced-key",
        lease: { leaseId: "doctor-pre-effect-fenced-lease", expectedEpoch: 1 },
      },
    );
    const fenced = await store.executeDoctorRepair(
      "planning-project",
      halt.halt.haltId,
      {
        receiptId: "doctor-pre-effect-fenced-receipt",
        verdictId: allowed.verdict.verdictId,
        invocationOrdinal: 1,
        input: doctorInputV1(recipe.recipeId),
      },
    );
    assert.equal(effects, 0);
    assert.equal(fenced.receipt?.result, "quarantined");
    assert.equal(fenced.receipt?.reasonCode, "REPAIR_LEASE_LOST");
  } finally {
    await rm(preEffectFenceRoot, { recursive: true, force: true });
  }

  const ambiguousRoot = await mkdtemp(join(tmpdir(), "orchestrator-doctor-ambiguous-"));
  try {
    const ambiguousStates = new Map<string, DoctorObservationV1["state"]>();
    const baseAdapters = doctorAdaptersV1(ambiguousStates);
    const ambiguousAdapters: DoctorAdapterRegistryV1 = {
      ...baseAdapters,
      "provider-read-retry-v1": {
        ...baseAdapters["provider-read-retry-v1"],
        executeAttempt: async () => {
          ambiguousStates.set("provider-read-retry-v1", "ambiguous");
          return {
            outcome: "ambiguous",
            outcomeCode: "provider-read-completion-ambiguous",
            evidenceRefs: ["doctor:provider-read:ambiguous"],
          };
        },
      },
    };
    const store = new ChangeControlStore(ambiguousRoot, {
      now: () => "2026-07-31T10:00:00.000Z",
      doctorAdapters: ambiguousAdapters,
    });
    await seedPhase4Scope(store);
    const halt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-doctor-ambiguous",
        detectorEventId: "detector-doctor-ambiguous",
        haltClass: "retryable_provider_or_process",
      }),
    );
    const recipe = WARDEN_REPAIR_RECIPES_V1[0];
    const allowed = await store.evaluateWardenVerdict(
      "planning-project",
      halt.halt.haltId,
      {
        verdictId: "verdict-doctor-ambiguous",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(halt),
        recipe,
        idempotencyKey: "doctor-ambiguous-key",
        lease: { leaseId: "doctor-ambiguous-lease", expectedEpoch: 1 },
      },
    );
    const ambiguous = await store.executeDoctorRepair(
      "planning-project",
      halt.halt.haltId,
      {
        receiptId: "doctor-ambiguous-receipt",
        verdictId: allowed.verdict.verdictId,
        invocationOrdinal: 1,
        input: doctorInputV1(recipe.recipeId),
      },
    );
    assert.equal(ambiguous.receipt?.result, "quarantined");
    assert.equal(ambiguous.receipt?.reasonCode, "REPAIR_RESULT_AMBIGUOUS");
    assert.equal(ambiguous.receipt?.successOracle.outcome, "ambiguous");
  } finally {
    await rm(ambiguousRoot, { recursive: true, force: true });
  }
});

test("Phase 4 task retry authority must name a halt scoped to the retried task", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-phase4-retry-scope-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
      resolveRepositorySnapshot: async () => planningSnapshot(),
    });
    await authorizePlanningWave(store);
    await store.dispatchWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { actor: "human:dispatcher" },
    );
    await store.transitionWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { to: "running", actor: "system:runner" },
    );
    await store.transitionTask(
      "planning-project",
      "planning-change",
      "planning-wave",
      "task-one",
      { to: "running", actor: "system:runner" },
    );
    const failed = await store.transitionTask(
      "planning-project",
      "planning-change",
      "planning-wave",
      "task-one",
      { to: "failed", actor: "system:runner" },
    );
    const otherTaskHalt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-retry-other-task",
        detectorEventId: "detector-retry-other-task",
        haltClass: "retryable_provider_or_process",
        normalizedRootCauseKey: "provider:other-task",
        taskId: "task-two",
      }),
    );
    const failedEvent = failed.events.find(
      (event) => event.type === "task.failed",
    )!;

    await assert.rejects(
      store.authorizeTaskRetry(
        "planning-project",
        "planning-change",
        "planning-wave",
        "task-one",
        {
          authorizationId: "retry-wrong-task-halt",
          priorTerminalEventId: failedEvent.id,
          incidentId: otherTaskHalt.incident.incidentId,
          haltId: otherTaskHalt.halt.haltId,
          newAttemptId: "attempt-wrong-task-halt",
          attemptAllocationNonce: "nonce-wrong-task-halt",
          budgetOrdinal: 1,
          reason: "The authority belongs to a different task halt.",
          authority: {
            kind: "audited_human",
            actor: "human:operator",
            decisionId: "decision-wrong-task-halt",
            evidenceRefs: ["audit:human-retry:wrong-task"],
          },
        },
      ),
      /exact terminal event or independent recovery authority/,
    );
    const unchanged = await store.getWave(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.equal(unchanged.wave.tasks[0].status, "failed");
    assert.equal(
      unchanged.events.some((event) => event.type === "task.retry-authorized"),
      false,
    );

    const taskHalt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-retry-correct-task",
        detectorEventId: "detector-retry-correct-task",
        haltClass: "retryable_provider_or_process",
        normalizedRootCauseKey: "provider:correct-task",
      }),
    );
    await store.authorizeTaskRetry(
      "planning-project",
      "planning-change",
      "planning-wave",
      "task-one",
      {
        authorizationId: "retry-correct-task-halt",
        priorTerminalEventId: failedEvent.id,
        incidentId: taskHalt.incident.incidentId,
        haltId: taskHalt.halt.haltId,
        newAttemptId: "attempt-correct-task-halt",
        attemptAllocationNonce: "nonce-correct-task-halt",
        budgetOrdinal: 1,
        reason: "The audited authority matches the failed task halt.",
        authority: {
          kind: "audited_human",
          actor: "human:operator",
          decisionId: "decision-correct-task-halt",
          evidenceRefs: ["audit:human-retry:correct-task"],
        },
      },
    );
    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    const authorizationEvent = ledger.events.find(
      (event) => event.type === "task.retry-authorized",
    )!;
    const payload = authorizationEvent.payload as Record<string, unknown>;
    payload.haltId = otherTaskHalt.halt.haltId;
    payload.incidentId = otherTaskHalt.incident.incidentId;
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");
    await assert.rejects(
      new ChangeControlStore(root).getWave(
        "planning-project",
        "planning-change",
        "planning-wave",
      ),
      /reuses or bypasses a terminal attempt/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 retry and resume require independent authority, allocate a new attempt, and re-enter every gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-phase4-retry-resume-"));
  try {
    let now = "2026-07-31T10:00:00.000Z";
    const store = new ChangeControlStore(root, {
      now: () => now,
      resolveRepositorySnapshot: async () => planningSnapshot(),
    });
    await authorizePlanningWave(store);
    await store.dispatchWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { actor: "human:dispatcher" },
    );
    await store.transitionWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { to: "running", actor: "system:runner" },
    );
    await store.transitionTask(
      "planning-project",
      "planning-change",
      "planning-wave",
      "task-one",
      { to: "running", actor: "system:runner" },
    );
    const failed = await store.transitionTask(
      "planning-project",
      "planning-change",
      "planning-wave",
      "task-one",
      { to: "failed", actor: "system:runner" },
    );
    const halted = await store.transitionWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { to: "halted", actor: "system:runner" },
    );
    const halt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-retry-authority",
        detectorEventId: "detector-retry-authority",
        haltClass: "retryable_provider_or_process",
      }),
    );
    const recipe = WARDEN_REPAIR_RECIPES_V1[0];
    const allowed = await store.evaluateWardenVerdict(
      "planning-project",
      halt.halt.haltId,
      {
        verdictId: "verdict-retry-authority",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(halt),
        recipe,
        idempotencyKey: "retry-authority-key",
        lease: { leaseId: "retry-authority-lease", expectedEpoch: 1 },
      },
    );
    const failedEvent = failed.events.find(
      (event) => event.type === "task.failed",
    )!;
    const haltedEvent = halted.events.find(
      (event) => event.type === "wave.halted",
    )!;

    await assert.rejects(
      store.authorizeTaskRetry(
        "planning-project",
        "planning-change",
        "planning-wave",
        "task-one",
        {
          authorizationId: "retry-forbidden",
          priorTerminalEventId: failedEvent.id,
          incidentId: halt.incident.incidentId,
          haltId: halt.halt.haltId,
          newAttemptId: "attempt-forbidden",
          attemptAllocationNonce: "nonce-forbidden",
          budgetOrdinal: 1,
          reason: "An unaudited service actor cannot retry.",
          authority: {
            kind: "audited_human",
            actor: "service:operator",
            decisionId: "decision-forbidden",
            evidenceRefs: ["audit:missing-human"],
          },
        },
      ),
      /independent recovery authority/,
    );

    const retryInput = {
        authorizationId: "retry-authorized-one",
        priorTerminalEventId: failedEvent.id,
        incidentId: halt.incident.incidentId,
        haltId: halt.halt.haltId,
        newAttemptId: "attempt-immutable-two",
        attemptAllocationNonce: "nonce-immutable-two",
        budgetOrdinal: 1,
        reason: "Warden independently permits one bounded retry.",
        authority: {
          kind: "warden",
          actor: "policy:warden-v1",
          verdictId: allowed.verdict.verdictId,
        },
      } as const;
    now = "2026-07-31T10:05:01.000Z";
    await assert.rejects(
      store.authorizeTaskRetry(
        "planning-project",
        "planning-change",
        "planning-wave",
        "task-one",
        { ...retryInput, authorizationId: "retry-stale-verdict" },
      ),
      /independent recovery authority/,
    );
    now = "2026-07-31T10:00:00.000Z";
    const retried = await store.authorizeTaskRetry(
      "planning-project",
      "planning-change",
      "planning-wave",
      "task-one",
      retryInput,
    );
    assert.equal(retried.wave.tasks[0].status, "ready");
    assert.equal(
      retried.wave.tasks[0].details.phase4AttemptId,
      "attempt-immutable-two",
    );
    assert.ok(
      retried.events.some((event) => event.type === "task.retry-authorized"),
    );

    await assert.rejects(
      store.authorizeWaveResume(
        "planning-project",
        "planning-change",
        "planning-wave",
        {
          authorizationId: "resume-reused-warden-verdict",
          priorTerminalEventId: haltedEvent.id,
          incidentId: halt.incident.incidentId,
          haltId: halt.halt.haltId,
          budgetOrdinal: 2,
          reason: "One Warden verdict cannot be consumed twice.",
          authority: {
            kind: "warden",
            actor: "policy:warden-v1",
            verdictId: allowed.verdict.verdictId,
          },
        },
      ),
      /independent recovery authority/,
    );
    const resumed = await store.authorizeWaveResume(
      "planning-project",
      "planning-change",
      "planning-wave",
      {
        authorizationId: "resume-authorized-one",
        priorTerminalEventId: haltedEvent.id,
        incidentId: halt.incident.incidentId,
        haltId: halt.halt.haltId,
        budgetOrdinal: 1,
        reason: "An audited human independently authorizes gate re-entry.",
        authority: {
          kind: "audited_human",
          actor: "human:operator",
          decisionId: "human-resume-decision-one",
          evidenceRefs: ["audit:human-resume:one"],
        },
      },
    );
    assert.equal(resumed.wave.status, "ready");
    assert.ok(
      resumed.events.some((event) => event.type === "wave.resume-authorized"),
    );
    const planning = await store.getPlanningProjection(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.equal(planning.plans.at(-1)?.status, "stale");
    await assert.rejects(
      store.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "human:dispatcher", sendAnyway: true, reason: "cannot bypass" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "NOT_READY" &&
        error.reasons?.includes("PLAN_STALE") === true &&
        error.reasons?.includes("BLOCKING_INCIDENT_OPEN") === true,
    );
    const replay = await new ChangeControlStore(root, {
      resolveRepositorySnapshot: async () => planningSnapshot(),
    }).getWave("planning-project", "planning-change", "planning-wave");
    assert.equal(replay.wave.status, "ready");
    assert.equal(
      replay.wave.tasks[0].details.phase4AttemptId,
      "attempt-immutable-two",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Warden budgets exhaust monotonically and blocking incidents reject dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-warden-budget-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
    });
    await seedPhase4Scope(store);
    const aggregate = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-warden-budget",
        detectorEventId: "detector-warden-budget",
        haltClass: "retryable_provider_or_process",
      }),
    );
    await assert.rejects(
      store.dispatchWave("planning-project", "planning-change", "planning-wave", {
        actor: "human:test",
        sendAnyway: true,
        reason: "An open blocking incident cannot be overridden.",
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "NOT_READY" &&
        JSON.stringify(error.reasons).includes("BLOCKING_INCIDENT_OPEN"),
    );

    const recipe = WARDEN_REPAIR_RECIPES_V1[0];
    const first = await store.evaluateWardenVerdict(
      "planning-project",
      aggregate.halt.haltId,
      {
        verdictId: "verdict-budget-one",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 1,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(aggregate),
        recipe,
        idempotencyKey: "budget-key-one",
        lease: { leaseId: "budget-lease-one", expectedEpoch: 1 },
      },
    );
    await store.transitionWardenRepairLease(
      "planning-project",
      aggregate.halt.haltId,
      {
        leaseId: "budget-lease-one",
        leaseEpoch: 1,
        to: "released",
        actor: "policy:warden-v1",
        evidenceRefs: ["lease:released:test"],
      },
    );
    const current = await store.getHalt("planning-project", aggregate.halt.haltId);
    const exhausted = await store.evaluateWardenVerdict(
      "planning-project",
      aggregate.halt.haltId,
      {
        verdictId: "verdict-budget-two",
        policyVersion: "warden-policy-v1",
        verdictOrdinal: 2,
        requestedAction: "bounded_retry",
        evidenceSnapshot: wardenEvidenceSnapshotV1(current),
        recipe,
        idempotencyKey: "budget-key-two",
        lease: { leaseId: "budget-lease-two", expectedEpoch: 2 },
      },
    );
    assert.equal(first.verdict.disposition, "allow_bounded_retry");
    assert.equal(exhausted.verdict.disposition, "require_human");
    assert.equal(exhausted.verdict.reasonCode, "REPAIR_BUDGET_EXHAUSTED");
    assert.equal(exhausted.verdict.budgets.remainingAfter.halt, 0);
    assert.equal((await store.getWardenProjection("planning-project")).leases.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Warden blocking-incident gate persists a Phase 2 dispatch rejection", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-warden-phase2-gate-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
      resolveRepositorySnapshot: async () => planningSnapshot(),
    });
    await authorizePlanningWave(store);
    const aggregate = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-warden-phase2-block",
        detectorEventId: "detector-warden-phase2-block",
        haltClass: "retryable_provider_or_process",
      }),
    );
    await assert.rejects(
      store.dispatchWave("planning-project", "planning-change", "planning-wave", {
        actor: "human:test",
        sendAnyway: true,
        reason: "Blocking incidents have no dispatch override.",
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "NOT_READY" &&
        error.reasons?.includes("BLOCKING_INCIDENT_OPEN") === true,
    );
    const projection = await store.getPlanningProjection(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.equal(projection.dispatchGateReceipts.at(-1)?.result, "rejected");
    assert.deepEqual(projection.dispatchGateReceipts.at(-1)?.reasons, [
      "BLOCKING_INCIDENT_OPEN",
    ]);
    assert.equal(
      (await store.getHalt("planning-project", aggregate.halt.haltId)).incident
        .state,
      "open",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 accepts every closed halt taxonomy class", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-taxonomy-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
    });
    await seedPhase4Scope(store);

    for (const haltClass of HALT_CLASSES_V1) {
      const confidence = haltClass === "unknown" ? "none" : "exact";
      const published = await store.detectAndClassifyHalt(
        "planning-project",
        fingerprintedHaltContractsV1({
          haltId: `halt-taxonomy-${haltClass}`,
          detectorEventId: `detector-taxonomy-${haltClass}`,
          haltClass,
          confidence,
        }),
      );
      assert.equal(published.halt.haltClass, haltClass);
      assert.equal(published.assessment.haltClass, haltClass);
      assert.equal(
        published.halt.effectiveIncidentId,
        published.incident.incidentId,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 semantic validation rejects unsafe attribution and fingerprints without partial publication", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-negative-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
    });
    await seedPhase4Scope(store);
    const before = await store.getHaltIncidentProjection("planning-project");

    const badFingerprint = fingerprintedHaltContractsV1({
      haltId: "halt-bad-fingerprint",
      detectorEventId: "detector-bad-fingerprint",
    });
    await assert.rejects(
      store.detectAndClassifyHalt("planning-project", {
        ...badFingerprint,
        halt: {
          ...badFingerprint.halt,
          observation: {
            ...badFingerprint.halt.observation,
            fingerprint: "f".repeat(64),
          },
        },
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /fingerprint/.test(error.message),
    );

    const unsafeUnknown = fingerprintedHaltContractsV1({
      haltId: "halt-unsafe-unknown",
      detectorEventId: "detector-unsafe-unknown",
      haltClass: "unknown",
      confidence: "exact",
      normalizedRootCauseKey: "guessed:root-cause",
    });
    await assert.rejects(
      store.detectAndClassifyHalt("planning-project", unsafeUnknown),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /Unknown classification requires none attribution/.test(error.message),
    );

    const unsafeNone = fingerprintedHaltContractsV1({
      haltId: "halt-unsafe-none",
      detectorEventId: "detector-unsafe-none",
      confidence: "none",
    });
    await assert.rejects(
      store.detectAndClassifyHalt("planning-project", {
        ...unsafeNone,
        assessment: {
          ...unsafeNone.assessment,
          candidateCauses: [
            {
              causeKey: "guessed:cause",
              evidenceRefs: unsafeNone.halt.evidenceRefs,
            },
          ],
        },
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /None attribution requires unknown/.test(error.message),
    );

    const conflictingExact = fingerprintedHaltContractsV1({
      haltId: "halt-conflicting-exact",
      detectorEventId: "detector-conflicting-exact",
    });
    await assert.rejects(
      store.detectAndClassifyHalt("planning-project", {
        ...conflictingExact,
        assessment: {
          ...conflictingExact.assessment,
          candidateCauses: [
            ...conflictingExact.assessment.candidateCauses,
            {
              causeKey: "oracle:conflicting-cause",
              evidenceRefs: conflictingExact.halt.evidenceRefs,
            },
          ],
        },
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /Exact attribution requires one proven normalized cause/.test(
          error.message,
        ),
    );

    const unknown = fingerprintedHaltContractsV1({
      haltId: "halt-safe-unknown",
      detectorEventId: "detector-safe-unknown",
      haltClass: "unknown",
      confidence: "none",
    });
    const published = await store.detectAndClassifyHalt(
      "planning-project",
      unknown,
    );
    assert.equal(published.halt.haltClass, "unknown");
    assert.equal(published.halt.state, "escalated");
    assert.equal(published.halt.lastTransitionReasonCode, "HALT_CLASS_UNKNOWN");
    assert.equal(published.incident.state, "escalated");
    assert.equal(published.assessment.confidence, "none");

    const partial = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-safe-partial",
        detectorEventId: "detector-safe-partial",
        haltClass: "ownership_or_state_ambiguity",
        confidence: "partial",
      }),
    );
    assert.equal(partial.halt.state, "escalated");
    assert.equal(
      partial.halt.lastTransitionReasonCode,
      "ATTRIBUTION_NOT_EXACT",
    );
    assert.equal(partial.assessment.candidateCauses.length, 2);

    const after = await store.getHaltIncidentProjection("planning-project");
    assert.equal(after.halts.length, before.halts.length + 2);
    assert.equal(
      after.events.filter((event) => event.type === "halt.detected").length,
      2,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 detector idempotency and concurrent correlation are stable across volatile attempts", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-concurrent-"));
  try {
    let idOrdinal = 0;
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
      createId: () => `concurrent-id-${++idOrdinal}`,
    });
    const secondStore = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
      createId: () => `concurrent-id-${++idOrdinal}`,
    });
    await seedPhase4Scope(store);
    const contracts = Array.from({ length: 12 }, (_, index) => {
      const source = fingerprintedHaltContractsV1({
        haltId: `halt-concurrent-${index}`,
        detectorEventId: `detector-concurrent-${index}`,
      });
      const halt = {
        ...source.halt,
        scope: {
          ...source.halt.scope,
          attemptId: `attempt-${index}`,
          runId: `run-${index}`,
          workspaceAttemptId: `workspace-${index}`,
        },
      };
      return {
        halt: {
          ...halt,
          observation: {
            ...halt.observation,
            fingerprint: observationFingerprintV1(halt),
          },
        },
        assessment: {
          ...source.assessment,
          scope: halt.scope,
          evidence: {
            ...source.assessment.evidence,
            gitEvidenceRefs: [`git:workspace:${index}`],
          },
        },
      };
    });

    const published = await Promise.all(
      contracts.map((contract, index) =>
        (index % 2 === 0 ? store : secondStore).detectAndClassifyHalt(
          "planning-project",
          contract,
        ),
      ),
    );
    assert.equal(
      new Set(published.map((item) => item.incident.incidentId)).size,
      1,
    );
    assert.equal(
      new Set(published.map((item) => item.incident.incidentFingerprint)).size,
      1,
    );
    assert.equal(
      incidentFingerprintV1(contracts[0].assessment),
      published[0].incident.incidentFingerprint,
    );
    const correlatedProjection = await store.getHaltIncidentProjection(
      "planning-project",
    );
    assert.deepEqual(
      new Set(correlatedProjection.incidents[0].haltIds),
      new Set(contracts.map((contract) => contract.halt.haltId)),
    );

    const beforeReplay = await store.getHaltIncidentProjection(
      "planning-project",
    );
    const replayed = await secondStore.detectAndClassifyHalt(
      "planning-project",
      contracts[0],
    );
    const afterReplay = await store.getHaltIncidentProjection(
      "planning-project",
    );
    assert.equal(replayed.halt.haltId, contracts[0].halt.haltId);
    assert.deepEqual(afterReplay, beforeReplay);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 ledger publication recovers an identity-fenced lock left by a dead process", { timeout: 40_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-dead-lock-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
    });
    await seedPhase4Scope(store);
    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const lockPath = `${projectFile}.write-lock`;
    const deadOwner = {
      contractType: "ChangeControlLedgerWriteLockV1",
      contractVersion: "1.0",
      ownerPid: 999_999,
      ownerToken: "dead-ledger-owner",
      acquiredAt: "2026-07-31T09:00:00.000Z",
    };
    await mkdir(lockPath);
    await writeFile(
      join(lockPath, `owner-${deadOwner.ownerToken}.json`),
      JSON.stringify(deadOwner),
      "utf8",
    );

    const published = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-after-dead-lock",
        detectorEventId: "detector-after-dead-lock",
      }),
    );

    assert.equal(published.halt.haltId, "halt-after-dead-lock");
    await assert.rejects(access(lockPath), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 correlation is atomic across server processes", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-process-race-"));
  const releasePath = join(root, "release-first-writer");
  const storeUrl = new URL("./change-control-v1/index.ts", import.meta.url).href;
  const spawnCorrelationChild = (
    contracts: ReturnType<typeof fingerprintedHaltContractsV1>,
    pauseAtPublication: boolean,
  ) => {
    const script = `
      const fs = await import("node:fs");
      const { ChangeControlStore } = await import(${JSON.stringify(storeUrl)});
      const store = new ChangeControlStore(${JSON.stringify(root)}, {
        now: () => {
          ${pauseAtPublication ? `process.stdout.write("PUBLICATION_CLOCK\\n"); while (!fs.existsSync(${JSON.stringify(releasePath)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);` : ""}
          return "2026-07-31T10:00:00.000Z";
        },
      });
      process.stdout.write("STARTED\\n");
      const result = await store.detectAndClassifyHalt(
        "planning-project",
        ${JSON.stringify(contracts)},
      );
      process.stdout.write(JSON.stringify({
        haltId: result.halt.haltId,
        incidentId: result.incident.incidentId,
      }) + "\\n");
    `;
    return spawn(
      testNodeExecutable,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  };
  const waitForExit = (child: ReturnType<typeof spawn>) => {
    if (child.exitCode !== null)
      return child.exitCode === 0
        ? Promise.resolve()
        : Promise.reject(
            new Error(`Correlation child exited ${child.exitCode}.`),
          );
    return new Promise<void>((resolve, reject) => {
      let errors = "";
      child.stderr?.on("data", (chunk: Buffer) => {
        errors += chunk.toString("utf8");
      });
      child.once("error", reject);
      child.once("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Correlation child exited ${code}: ${errors}`));
      });
    });
  };

  let first: ReturnType<typeof spawn> | undefined;
  let second: ReturnType<typeof spawn> | undefined;
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
    });
    await seedPhase4Scope(store);
    first = spawnCorrelationChild(
      fingerprintedHaltContractsV1({
        haltId: "halt-process-one",
        detectorEventId: "detector-process-one",
      }),
      true,
    );
    await waitForLine(first, "PUBLICATION_CLOCK");
    second = spawnCorrelationChild(
      fingerprintedHaltContractsV1({
        haltId: "halt-process-two",
        detectorEventId: "detector-process-two",
      }),
      false,
    );
    await waitForLine(second, "STARTED");
    await new Promise((resolve) => setTimeout(resolve, 250));
    await writeFile(releasePath, "release\n", "utf8");
    await Promise.all([waitForExit(first), waitForExit(second)]);

    const projection = await store.getHaltIncidentProjection("planning-project");
    assert.equal(projection.halts.length, 2);
    assert.equal(projection.incidents.length, 1);
    assert.deepEqual(
      new Set(projection.incidents[0].haltIds),
      new Set(["halt-process-one", "halt-process-two"]),
    );
    assert.equal(
      projection.events.filter((event) => event.type === "incident.opened")
        .length,
      1,
    );
  } finally {
    if (first) await stopChild(first);
    if (second) await stopChild(second);
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 restart replay is deterministic and semantic corruption fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-replay-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-31T10:00:00.000Z",
    });
    await seedPhase4Scope(store);
    await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-replay",
        detectorEventId: "detector-replay",
      }),
    );
    const expected = await store.getHaltIncidentProjection("planning-project");
    const restarted = new ChangeControlStore(root);
    assert.deepEqual(
      await restarted.getHaltIncidentProjection("planning-project"),
      expected,
    );

    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    const classification = ledger.events.find(
      (event) => event.type === "halt.classified",
    )!;
    const assessment = (
      classification.payload as {
        assessment: { affectedEntity: { component: string } };
      }
    ).assessment;
    assessment.affectedEntity.component = "corrupted-component";
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");

    await assert.rejects(
      restarted.getHaltIncidentProjection("planning-project"),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /mismatched affected entity/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 reopens a mitigated incident when a matching halt recurs", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-mitigated-reopen-"));
  let publicationTime = "2026-07-31T10:00:00.000Z";
  try {
    const store = new ChangeControlStore(root, {
      now: () => publicationTime,
    });
    await seedPhase4Scope(store);
    const first = await store.detectAndClassifyHalt(
      "planning-project",
      {
        ...fingerprintedHaltContractsV1({
          haltId: "halt-mitigated-first",
          detectorEventId: "detector-mitigated-first",
        }),
        correlationWindowSeconds: 60,
      },
    );
    publicationTime = "2026-07-31T10:01:00.000Z";
    await assert.rejects(
      store.transitionIncident(
        "planning-project",
        first.incident.incidentId,
        {
          actor: "human:operator",
          to: "mitigated",
          reasonCode: "BLOCKING_INCIDENT_OPEN",
          evidenceRefs: ["human:mitigation-without-oracle"],
        },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /receipt/.test(error.message),
    );
    await store.transitionIncident(
      "planning-project",
      first.incident.incidentId,
      {
        actor: "human:operator",
        to: "mitigated",
        reasonCode: "BLOCKING_INCIDENT_OPEN",
        evidenceRefs: ["human:mitigation:mitigation-reopen-first"],
        receipt: mitigationReceiptV1(
          "mitigation-reopen-first",
          first.incident.incidentId,
          publicationTime,
        ),
      },
    );
    const mitigatedProjection = await store.getHaltIncidentProjection(
      "planning-project",
    );
    const mitigationEvent = mitigatedProjection.events.find(
      (event) => event.type === "incident.mitigated",
    );
    assert.ok(mitigationEvent);
    const eventValidator = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(haltsIncidentsV1Schema);
    assert.equal(
      eventValidator(mitigationEvent),
      true,
      JSON.stringify(eventValidator.errors),
    );
    assert.ok(
      mitigatedProjection.resolutionReceipts.some(
        (receipt) => receipt.receiptId === "mitigation-reopen-first",
      ),
    );

    publicationTime = "2026-07-31T10:02:00.000Z";
    const recurrence = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-mitigated-recurrence",
        detectorEventId: "detector-mitigated-recurrence",
        occurredAt: publicationTime,
      }),
    );

    assert.equal(recurrence.incident.incidentId, first.incident.incidentId);
    assert.equal(recurrence.incident.state, "reopened");
    assert.equal(recurrence.incident.reopenOrdinal, 1);
    assert.ok(
      recurrence.events.some((event) => event.type === "incident.reopened"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 resolves, deterministically reopens, expires windows, and preserves superseding correlation history", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-halts-reopen-"));
  let publicationTime = "2026-07-31T10:00:00.000Z";
  try {
    let idOrdinal = 0;
    const store = new ChangeControlStore(root, {
      now: () => publicationTime,
      createId: () => `reopen-id-${++idOrdinal}`,
    });
    await seedPhase4Scope(store);
    const first = await store.detectAndClassifyHalt(
      "planning-project",
      {
        ...fingerprintedHaltContractsV1({
          haltId: "halt-window-one",
          detectorEventId: "detector-window-one",
          occurredAt: publicationTime,
        }),
        correlationWindowSeconds: 60,
      },
    );
    await store.transitionHalt("planning-project", first.halt.haltId, {
      to: "escalated",
      actor: "human:operator",
      reasonCode: "HUMAN_AUTHORITY_REQUIRED",
      evidenceRefs: ["human:triage:first"],
    });
    await store.transitionIncident(
      "planning-project",
      first.incident.incidentId,
      {
        to: "mitigated",
        actor: "human:operator",
        reasonCode: "HUMAN_AUTHORITY_REQUIRED",
        evidenceRefs: ["human:mitigation:mitigation-window-first"],
        receipt: mitigationReceiptV1(
          "mitigation-window-first",
          first.incident.incidentId,
          publicationTime,
        ),
      },
    );
    publicationTime = "2026-07-31T10:01:00.000Z";
    const beforeRejectedResolution = await store.getHaltIncidentProjection(
      "planning-project",
    );
    const mismatchedReceipt = {
      contractType: "IncidentResolutionReceiptV1" as const,
      contractVersion: "1.0" as const,
      receiptId: "resolution-window-mismatched",
      incidentId: first.incident.incidentId,
      projectId: "planning-project",
      changeId: "planning-change",
      resolutionKind: "resolved" as const,
      oracle: {
        kind: "executable" as const,
        outcome: "passed" as const,
        observationResult: "The blocking oracle passed.",
      },
      noActiveHealing: true as const,
      evidenceRefs: ["oracle:passed:mismatched"],
      resolvedAt: "2026-07-31T09:00:00.000Z",
      resolvedBy: "policy:resolution-oracle-v1",
      taxonomyPolicyVersion: "halt-taxonomy-v1" as const,
      correlationWindowSeconds: 60,
    };
    for (const resolvedAt of [
      "2026-07-31T09:00:00.000Z",
      "2026-07-31T11:00:00.000Z",
    ])
      await assert.rejects(
        store.resolveIncident("planning-project", first.incident.incidentId, {
          receipt: { ...mismatchedReceipt, resolvedAt },
        }),
        (error: unknown) =>
          error instanceof ChangeControlError &&
          error.code === "INVALID_INPUT" &&
          /authoritative publication time/.test(error.message),
      );
    assert.deepEqual(
      await store.getHaltIncidentProjection("planning-project"),
      beforeRejectedResolution,
    );
    const firstResolved = await store.resolveIncident(
      "planning-project",
      first.incident.incidentId,
      {
        receipt: {
          contractType: "IncidentResolutionReceiptV1",
          contractVersion: "1.0",
          receiptId: "resolution-window-one",
          incidentId: first.incident.incidentId,
          projectId: "planning-project",
          changeId: "planning-change",
          resolutionKind: "resolved",
          oracle: {
            kind: "executable",
            outcome: "passed",
            observationResult: "The blocking oracle passed.",
          },
          noActiveHealing: true,
          evidenceRefs: ["oracle:passed:first"],
          resolvedBy: "policy:resolution-oracle-v1",
          taxonomyPolicyVersion: "halt-taxonomy-v1",
          correlationWindowSeconds: 60,
        },
      },
    );
    assert.equal(
      firstResolved.correlationWindowPolicy.reopenUntil,
      "2026-07-31T10:02:00.000Z",
    );
    const firstResolutionReceipt = (
      await store.getHaltIncidentProjection("planning-project")
    ).resolutionReceipts.find(
      (receipt) => receipt.receiptId === "resolution-window-one",
    );
    assert.equal(firstResolutionReceipt?.resolvedAt, publicationTime);

    publicationTime = "2026-07-31T10:01:30.000Z";
    const second = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-window-two",
        detectorEventId: "detector-window-two",
        occurredAt: publicationTime,
      }),
    );
    assert.equal(second.incident.incidentId, first.incident.incidentId);
    assert.equal(second.incident.state, "reopened");
    assert.equal(second.incident.reopenOrdinal, 1);

    await store.transitionHalt("planning-project", second.halt.haltId, {
      to: "escalated",
      actor: "human:operator",
      reasonCode: "HUMAN_AUTHORITY_REQUIRED",
      evidenceRefs: ["human:triage:second"],
    });
    await store.transitionIncident(
      "planning-project",
      second.incident.incidentId,
      {
        to: "mitigated",
        actor: "human:operator",
        reasonCode: "HUMAN_AUTHORITY_REQUIRED",
        evidenceRefs: ["human:mitigation:mitigation-window-second"],
        receipt: mitigationReceiptV1(
          "mitigation-window-second",
          second.incident.incidentId,
          publicationTime,
        ),
      },
    );
    publicationTime = "2026-07-31T10:01:40.000Z";
    await store.resolveIncident(
      "planning-project",
      second.incident.incidentId,
      {
        receipt: {
          contractType: "IncidentResolutionReceiptV1",
          contractVersion: "1.0",
          receiptId: "resolution-window-two",
          incidentId: second.incident.incidentId,
          projectId: "planning-project",
          changeId: "planning-change",
          resolutionKind: "resolved",
          oracle: {
            kind: "executable",
            outcome: "passed",
            observationResult: "The blocking oracle remained healthy.",
          },
          noActiveHealing: true,
          evidenceRefs: ["oracle:passed:second"],
          resolvedAt: publicationTime,
          resolvedBy: "policy:resolution-oracle-v1",
          taxonomyPolicyVersion: "halt-taxonomy-v1",
          correlationWindowSeconds: 60,
        },
      },
    );

    publicationTime = "2026-07-31T10:03:00.000Z";
    const third = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: "halt-window-three",
        detectorEventId: "detector-window-three",
        occurredAt: "2026-07-31T09:00:00.000Z",
      }),
    );
    assert.notEqual(third.incident.incidentId, first.incident.incidentId);
    assert.equal(
      third.incident.correlationReasonCode,
      "INCIDENT_REOPEN_WINDOW_EXPIRED",
    );

    const beforeRejectedCorrection =
      await store.getHaltIncidentProjection("planning-project");
    publicationTime = "2026-07-31T10:03:00.500Z";
    await assert.rejects(
      store.correctIncidentCorrelation(
        "planning-project",
        third.halt.haltId,
        {
          correctionId: "correction-into-resolved",
          incidentId: first.incident.incidentId,
          actor: "human:operator",
          correctedAt: publicationTime,
          reason: "This active halt must not silently invalidate resolution.",
          evidenceRefs: ["human:correlation-review:rejected"],
        },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CONFLICT" &&
        /resolved incident/.test(error.message),
    );
    assert.deepEqual(
      await store.getHaltIncidentProjection("planning-project"),
      beforeRejectedCorrection,
    );

    publicationTime = "2026-07-31T10:03:01.000Z";
    await assert.rejects(
      store.correctIncidentCorrelation(
        "planning-project",
        first.halt.haltId,
        {
          correctionId: "correction-non-human",
          incidentId: third.incident.incidentId,
          actor: "policy:incident-correlation-v1",
          correctedAt: "2020-01-01T00:00:00.000Z",
          reason: "A policy actor must not rewrite human-owned correlation.",
          evidenceRefs: ["policy:unsupported-correction"],
        },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /human actor/.test(error.message),
    );
    const corrected = await store.correctIncidentCorrelation(
      "planning-project",
      first.halt.haltId,
      {
        correctionId: "correction-window-one",
        incidentId: third.incident.incidentId,
        actor: "human:operator",
        correctedAt: "2020-01-01T00:00:00.000Z",
        reason: "The original durable occurrence belongs to the later aggregate.",
        evidenceRefs: ["human:correlation-review"],
      },
    );
    assert.equal(
      corrected.halt.effectiveIncidentId,
      third.incident.incidentId,
    );
    const projection = await store.getHaltIncidentProjection(
      "planning-project",
    );
    assert.deepEqual(projection.correlationHistory, [
      {
        correctionId: "correction-window-one",
        haltId: first.halt.haltId,
        previousIncidentId: first.incident.incidentId,
        incidentId: third.incident.incidentId,
        correctedAt: publicationTime,
        correctedBy: "human:operator",
        reason:
          "The original durable occurrence belongs to the later aggregate.",
        evidenceRefs: ["human:correlation-review"],
      },
    ]);
    assert.ok(
      projection.incidents
        .find(
          (incident) => incident.incidentId === first.incident.incidentId,
        )
        ?.haltIds.includes(first.halt.haltId),
    );

    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    ledger.events.push({
      id: "corrupt-correction-into-resolved",
      sequence: ledger.events.length + 1,
      type: "incident.correlation-superseded",
      occurredAt: publicationTime,
      projectId: "planning-project",
      changeId: "planning-change",
      waveId: "planning-wave",
      taskId: "task-one",
      actor: "human:operator",
      causationId: "manual-corruption",
      correlationId: third.halt.correlationId,
      payload: {
        correctionId: "corrupt-correction-into-resolved",
        haltId: third.halt.haltId,
        previousIncidentId: third.incident.incidentId,
        incidentId: first.incident.incidentId,
        correctedAt: publicationTime,
        correctedBy: "human:operator",
        reason: "A resolved target must fail canonical replay.",
        evidenceRefs: ["test:corrupt-correlation"],
      },
      previousHash: null,
      hash: "",
    });
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");
    await assert.rejects(
      new ChangeControlStore(root).getHaltIncidentProjection("planning-project"),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /correction/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 4 HTTP APIs publish and read focused halt/incident projections", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveListening) =>
    server.once("listening", resolveListening),
  );
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const projectId = "phase4-http-project";
    const changeId = "phase4-http-change";
    const waveId = "phase4-http-wave";
    const taskId = "phase4-http-task";
    const changes = `${origin}/api/change-control/projects/${projectId}/changes`;
    assert.equal(
      (
        await fetch(changes, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            changeId,
            actor: "human:http-test",
          }),
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await fetch(`${changes}/${changeId}/waves`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            waveId,
            actor: "human:http-test",
            tasks: [{ taskId }],
          }),
        })
      ).status,
      201,
    );

    const publishedAt = new Date().toISOString();
    const source = haltContractsV1({
      haltId: "phase4-http-halt",
      detectorEventId: "phase4-http-detector-event",
      occurredAt: publishedAt,
    });
    const scope = {
      ...source.halt.scope,
      waveId,
      taskId,
    };
    const haltWithoutFingerprint = {
      ...source.halt,
      projectId,
      changeId,
      scope,
      correlationId: "phase4-http-correlation",
    };
    const halt = {
      ...haltWithoutFingerprint,
      observation: {
        ...haltWithoutFingerprint.observation,
        fingerprint: observationFingerprintV1(haltWithoutFingerprint),
      },
    };
    const assessment = {
      ...source.assessment,
      assessmentId: "phase4-http-assessment",
      haltId: halt.haltId,
      projectId,
      changeId,
      scope,
      affectedEntity: {
        ...source.assessment.affectedEntity,
        projectId,
        changeId,
        waveId,
        taskId,
      },
      assessedAt: publishedAt,
    };
    const haltResponse = await fetch(
      `${origin}/api/change-control/projects/${projectId}/halts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ halt, assessment }),
      },
    );
    const haltResponseText = await haltResponse.text();
    assert.equal(haltResponse.status, 201, haltResponseText);
    const aggregate = JSON.parse(haltResponseText) as HaltIncidentAggregateV1;
    assert.equal(aggregate.halt.haltId, halt.haltId);
    assert.equal(
      aggregate.halt.effectiveIncidentId,
      aggregate.incident.incidentId,
    );

    const projectionResponse = await fetch(
      `${origin}/api/change-control/projects/${projectId}/halts-incidents`,
    );
    assert.equal(projectionResponse.status, 200);
    const projection = (await projectionResponse.json()) as {
      halts: unknown[];
      incidents: unknown[];
    };
    assert.equal(projection.halts.length, 1);
    assert.equal(projection.incidents.length, 1);

    const getResponse = await fetch(
      `${origin}/api/change-control/projects/${projectId}/incidents/${aggregate.incident.incidentId}`,
    );
    assert.equal(getResponse.status, 200);

    const verdictResponse = await fetch(
      `${origin}/api/change-control/projects/${projectId}/halts/${halt.haltId}/warden-verdicts`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verdictId: "phase4-http-warden-verdict",
          policyVersion: "warden-policy-v1",
          verdictOrdinal: 1,
          requestedAction: "none",
          evidenceSnapshot: wardenEvidenceSnapshotV1(aggregate, {
            capturedAt: new Date().toISOString(),
          }),
        }),
      },
    );
    const verdictText = await verdictResponse.text();
    assert.equal(verdictResponse.status, 201, verdictText);
    const verdict = JSON.parse(verdictText) as {
      verdict: { disposition: string; reasonCode: string };
    };
    assert.equal(verdict.verdict.disposition, "require_human");
    assert.equal(verdict.verdict.reasonCode, "HUMAN_AUTHORITY_REQUIRED");

    const wardenProjectionResponse = await fetch(
      `${origin}/api/change-control/projects/${projectId}/warden`,
    );
    assert.equal(wardenProjectionResponse.status, 200);
    const wardenProjection = (await wardenProjectionResponse.json()) as {
      verdicts: unknown[];
      leases: unknown[];
    };
    assert.equal(wardenProjection.verdicts.length, 1);
    assert.equal(wardenProjection.leases.length, 0);
  } finally {
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    );
  }
});

test("change-control preserves a JSON __proto__ payload key", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-change-control-"));
  try {
    const store = new ChangeControlStore(root);
    const payload = JSON.parse(
      '{"__proto__":{"polluted":true},"title":"Prototype-safe change"}',
    ) as NonNullable<Parameters<typeof store.create>[1]["payload"]>;
    const created = await store.create("prototype-project", {
      changeId: "prototype-change",
      actor: "user:creator",
      payload,
    });

    assert.equal(
      Object.prototype.hasOwnProperty.call(created.change.details, "__proto__"),
      true,
    );
    assert.deepEqual(created.change.details.__proto__, { polluted: true });
    assert.equal(
      (created.change.details as Record<string, unknown>).polluted,
      undefined,
    );

    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("prototype-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<{ payload: { data: Record<string, unknown> } }>;
    };
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        ledger.events[0].payload.data,
        "__proto__",
      ),
      true,
    );
    assert.deepEqual(ledger.events[0].payload.data.__proto__, {
      polluted: true,
    });

    const reloaded = await new ChangeControlStore(root).get(
      "prototype-project",
      "prototype-change",
    );
    assert.deepEqual(reloaded, created);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning contracts, authorizations, and architect receipts publish immutably and replay deterministically", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-planning-contract-"));
  try {
    const store = new ChangeControlStore(root, {
      resolveRepositorySnapshot: async () =>
        planningSnapshot({ sha: planningShaTwo }),
    });
    await createPlanningWave(store);

    const proposed = await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: planningContract() },
    );
    assert.equal(proposed.plans.length, 1);
    assert.equal(proposed.plans[0].status, "proposed");
    assert.equal(proposed.plans[0].contract.planBase.sha, planningShaOne);
    assert.ok(Object.isFrozen(proposed));
    assert.ok(Object.isFrozen(proposed.plans));
    assert.ok(Object.isFrozen(proposed.plans[0].contract.taskPlans));
    assert.equal(proposed.events.at(-1)?.type, "plan.proposed");

    const authorized = await store.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "planning-wave",
      { authorization: planAuthorization() },
    );
    assert.equal(authorized.plans[0].status, "authorized");
    assert.equal(
      authorized.plans[0].authorization?.plan.planBaseSha,
      planningShaOne,
    );
    assert.equal(authorized.events.at(-1)?.type, "plan.authorized");
    await assert.rejects(
      store.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "user:drift-observer" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        assert.deepEqual(error.reasons, ["PLAN_BASE_MISMATCH"]) === undefined,
    );
    const staleAssessment = (
      await store.getPlanningProjection(
        "planning-project",
        "planning-change",
        "planning-wave",
      )
    ).driftAssessments.at(-1)!;
    assert.equal(staleAssessment.status, "stale");

    const replacement = planningContract({
      planId: "plan-two",
      revision: 2,
      predecessor: {
        planId: "plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
      planBase: {
        ...planningContract().planBase,
        sha: planningShaTwo,
        capturedAt: "2026-07-30T09:03:00.000Z",
      },
      createdAt: "2026-07-30T09:04:00.000Z",
    });
    await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: replacement },
    );
    const receipt: ArchitectReplanReceiptV1 = {
      contractType: "ArchitectReplanReceiptV1",
      contractVersion: "1.0",
      receiptId: "receipt-one",
      projectId: "planning-project",
      changeId: "planning-change",
      waveId: "planning-wave",
      driftAssessmentId: staleAssessment.assessmentId,
      priorPlan: {
        planId: "plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
      replacementPlan: {
        planId: "plan-two",
        revision: 2,
        planBaseSha: planningShaTwo,
      },
      changes: [
        {
          area: "base",
          summary: "Moved the proposal to the newly observed base.",
          rationale: "The prior base is no longer current.",
          evidenceRefs: ["drift:one"],
        },
      ],
      proposedAt: new Date().toISOString(),
      proposedBy: "architect:primary",
      authorizationState: "pending",
    };
    const replanned = await store.publishArchitectReplanReceipt(
      "planning-project",
      "planning-change",
      "planning-wave",
      { receipt },
    );
    assert.equal(replanned.replanReceipts.length, 1);
    assert.equal(
      replanned.replanReceipts[0].replacementPlan.planBaseSha,
      planningShaTwo,
    );
    assert.equal(replanned.events.at(-1)?.type, "architect.replan-recorded");

    const replacementAuthorized = await store.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "planning-wave",
      {
        authorization: planAuthorization({
          authorizationId: "authorization-two",
          plan: {
            planId: "plan-two",
            revision: 2,
            planBaseSha: planningShaTwo,
          },
          decidedAt: "2026-07-30T09:06:00.000Z",
        }),
      },
    );
    assert.deepEqual(
      replacementAuthorized.plans.map((plan) => [
        plan.contract.revision,
        plan.status,
      ]),
      [
        [1, "superseded"],
        [2, "authorized"],
      ],
    );
    assert.equal(
      replacementAuthorized.events.at(-1)?.type,
      "plan.superseded",
    );

    await store.createWave("planning-project", "planning-change", {
      waveId: "rejected-wave",
      actor: "user:creator",
      tasks: [{ taskId: "task-one" }, { taskId: "task-two" }],
    });
    await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "rejected-wave",
      {
        contract: planningContract({
          planId: "rejected-plan",
          waveId: "rejected-wave",
        }),
      },
    );
    const rejected = await store.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "rejected-wave",
      {
        authorization: planAuthorization({
          authorizationId: "authorization-rejected",
          waveId: "rejected-wave",
          plan: {
            planId: "rejected-plan",
            revision: 1,
            planBaseSha: planningShaOne,
          },
          decision: "rejected",
        }),
      },
    );
    assert.equal(rejected.plans[0].status, "rejected");
    assert.equal(rejected.events.at(-1)?.type, "plan.rejected");

    const replayed = await new ChangeControlStore(root).getPlanningProjection(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.deepEqual(replayed, replacementAuthorized);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning publication rejects semantic mismatches atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-planning-negative-"));
  try {
    const store = new ChangeControlStore(root);
    await createPlanningWave(store);
    const before = await store.getWave(
      "planning-project",
      "planning-change",
      "planning-wave",
    );

    const invalidPlans: PlanningContractV1[] = [
      planningContract({
        contractVersion: "2.0" as "1.0",
      }),
      planningContract({
        taskPlans: planningContract().taskPlans.slice(0, 1),
      }),
      planningContract({
        planBase: {
          ...planningContract().planBase,
          hashAlgorithm: "sha256",
        },
      }),
      planningContract({
        taskPlans: planningContract().taskPlans.map((taskPlan, index) =>
          index === 0
            ? {
                ...taskPlan,
                acceptanceClaims: [
                  taskPlan.acceptanceClaims[0],
                  taskPlan.acceptanceClaims[0],
                ],
              }
            : taskPlan,
        ),
      }),
      planningContract({
        taskPlans: planningContract().taskPlans.map((taskPlan, index) =>
          index === 0
            ? {
                ...taskPlan,
                blastRadius: {
                  ...taskPlan.blastRadius,
                  declaredWriteSet: [
                    taskPlan.blastRadius.declaredWriteSet[0],
                    taskPlan.blastRadius.declaredWriteSet[0],
                  ],
                },
              }
            : taskPlan,
        ),
      }),
    ];
    for (const contract of invalidPlans) {
      await assert.rejects(
        store.publishPlanningContract(
          "planning-project",
          "planning-change",
          "planning-wave",
          { contract },
        ),
        (error: unknown) =>
          error instanceof ChangeControlError &&
          error.code === "INVALID_INPUT",
      );
    }
    assert.equal(
      (
        await store.getWave(
          "planning-project",
          "planning-change",
          "planning-wave",
        )
      ).events.length,
      before.events.length,
    );

    await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: planningContract() },
    );
    for (const contract of [
      planningContract({
        planId: "plan-regressed",
        revision: 1,
      }),
      planningContract({
        planId: "plan-missing-predecessor",
        revision: 2,
        predecessor: {
          planId: "missing-plan",
          revision: 1,
          planBaseSha: planningShaOne,
        },
      }),
    ]) {
      await assert.rejects(
        store.publishPlanningContract(
          "planning-project",
          "planning-change",
          "planning-wave",
          { contract },
        ),
        (error: unknown) =>
          error instanceof ChangeControlError &&
          error.code === "CONFLICT",
      );
    }

    for (const authorization of [
      planAuthorization({
        authorizationId: "wrong-base",
        plan: {
          planId: "plan-one",
          revision: 1,
          planBaseSha: planningShaTwo,
        },
      }),
      planAuthorization({
        authorizationId: "missing-plan",
        plan: {
          planId: "not-published",
          revision: 1,
          planBaseSha: planningShaOne,
        },
      }),
      planAuthorization({
        authorizationId: "self-authorized",
        decidedBy: "planner:primary",
      }),
      planAuthorization({
        authorizationId: "architect-authorized",
        decidedBy: "architect:primary",
      }),
    ]) {
      await assert.rejects(
        store.publishPlanAuthorization(
          "planning-project",
          "planning-change",
          "planning-wave",
          { authorization },
        ),
        (error: unknown) =>
        error instanceof ChangeControlError &&
          ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"].includes(error.code),
      );
    }
    await assert.rejects(
      store.publishArchitectReplanReceipt(
        "planning-project",
        "planning-change",
        "planning-wave",
        {
          receipt: {
            contractType: "ArchitectReplanReceiptV1",
            contractVersion: "1.0",
            receiptId: "missing-replacement-receipt",
            projectId: "planning-project",
            changeId: "planning-change",
            waveId: "planning-wave",
            driftAssessmentId: "drift-missing-replacement",
            priorPlan: {
              planId: "plan-one",
              revision: 1,
              planBaseSha: planningShaOne,
            },
            replacementPlan: {
              planId: "not-published",
              revision: 2,
              planBaseSha: planningShaTwo,
            },
            changes: [
              {
                area: "base",
                summary: "Proposed an unpublished replacement.",
                rationale: "Exercises missing-reference validation.",
                evidenceRefs: ["test:missing-reference"],
              },
            ],
            proposedAt: new Date().toISOString(),
            proposedBy: "architect:primary",
            authorizationState: "pending",
          },
        },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError && error.code === "NOT_FOUND",
    );
    const projection = await store.getPlanningProjection(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.equal(projection.plans[0].status, "proposed");
    assert.equal(projection.authorizations.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning revisions reject premature replans and recover after an explicit rejection", async () => {
  const prematureRoot = await mkdtemp(
    join(tmpdir(), "orchestrator-premature-replan-"),
  );
  const rejectedRoot = await mkdtemp(
    join(tmpdir(), "orchestrator-rejected-replan-"),
  );
  try {
    const prematureStore = new ChangeControlStore(prematureRoot, {
      resolveRepositorySnapshot: async () =>
        planningSnapshot({ sha: planningShaTwo }),
    });
    await authorizePlanningWave(prematureStore);
    const prematureReplacement = planningContract({
      planId: "plan-premature-replacement",
      revision: 2,
      predecessor: {
        planId: "plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
    });
    await assert.rejects(
      prematureStore.publishPlanningContract(
        "planning-project",
        "planning-change",
        "planning-wave",
        { contract: prematureReplacement },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CONFLICT" &&
        /stale or rejected/.test(error.message),
    );
    assert.equal(
      (
        await prematureStore.getPlanningProjection(
          "planning-project",
          "planning-change",
          "planning-wave",
        )
      ).plans.length,
      1,
    );
    await assert.rejects(
      prematureStore.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "user:drift-observer" },
      ),
    );
    await prematureStore.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: prematureReplacement },
    );
    const rejectedReplacement =
      await prematureStore.publishPlanAuthorization(
        "planning-project",
        "planning-change",
        "planning-wave",
        {
          authorization: planAuthorization({
            authorizationId: "authorization-rejected-replacement",
            plan: {
              planId: prematureReplacement.planId,
              revision: prematureReplacement.revision,
              planBaseSha: prematureReplacement.planBase.sha,
            },
            decision: "rejected",
          }),
        },
      );
    assert.equal(rejectedReplacement.plans.at(-1)?.status, "rejected");
    assert.equal(rejectedReplacement.replanReceipts.length, 0);

    const rejectedStore = new ChangeControlStore(rejectedRoot);
    await createPlanningWave(rejectedStore);
    await rejectedStore.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: planningContract() },
    );
    await rejectedStore.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "planning-wave",
      {
        authorization: planAuthorization({ decision: "rejected" }),
      },
    );
    const corrected = planningContract({
      planId: "plan-after-rejection",
      revision: 2,
      predecessor: {
        planId: "plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
      createdAt: "2026-07-30T09:03:00.000Z",
    });
    await rejectedStore.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: corrected },
    );
    const recovered = await rejectedStore.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "planning-wave",
      {
        authorization: planAuthorization({
          authorizationId: "authorization-after-rejection",
          plan: {
            planId: corrected.planId,
            revision: corrected.revision,
            planBaseSha: corrected.planBase.sha,
          },
          decidedAt: "2026-07-30T09:04:00.000Z",
        }),
      },
    );
    assert.deepEqual(
      recovered.plans.map((plan) => [plan.contract.revision, plan.status]),
      [
        [1, "rejected"],
        [2, "authorized"],
      ],
    );
    assert.equal(recovered.replanReceipts.length, 0);
  } finally {
    await rm(prematureRoot, { recursive: true, force: true });
    await rm(rejectedRoot, { recursive: true, force: true });
  }
});

test("planning publication rejects impossible and causally inconsistent timestamps", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-planning-time-"));
  try {
    const store = new ChangeControlStore(root, {
      now: () => "2026-07-30T09:05:00.000Z",
    });
    await createPlanningWave(store);
    for (const contract of [
      planningContract({ createdAt: "2026-02-31T09:01:00.000Z" }),
      planningContract({ createdAt: "2026-07-30T09:06:00.000Z" }),
    ]) {
      await assert.rejects(
        store.publishPlanningContract(
          "planning-project",
          "planning-change",
          "planning-wave",
          { contract },
        ),
        (error: unknown) =>
          error instanceof ChangeControlError &&
          error.code === "INVALID_INPUT",
      );
    }

    await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: planningContract() },
    );
    await assert.rejects(
      store.publishPlanAuthorization(
        "planning-project",
        "planning-change",
        "planning-wave",
        {
          authorization: planAuthorization({
            decidedAt: "2026-07-30T08:59:00.000Z",
          }),
        },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("trusted Git snapshot observations fail closed when repository state changes", () => {
  const stable = {
    topLevel: { code: 0, output: "D:/pet-projects/example" },
    head: { code: 0, output: planningShaOne },
    ref: { code: 0, output: "refs/heads/main" },
    status: { code: 0, output: "" },
  };
  assert.equal(gitSnapshotObservationsMatch(stable, structuredClone(stable)), true);
  assert.equal(
    gitSnapshotObservationsMatch(stable, {
      ...structuredClone(stable),
      head: { code: 0, output: planningShaTwo },
    }),
    false,
  );
  assert.equal(
    gitSnapshotObservationsMatch(stable, {
      ...structuredClone(stable),
      status: { code: 0, output: " M server/index.ts" },
    }),
    false,
  );
});

test("planning replay rejects semantically corrupted exact authorization identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-planning-corrupt-"));
  try {
    const store = new ChangeControlStore(root);
    await createPlanningWave(store);
    await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: planningContract() },
    );
    await store.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "planning-wave",
      { authorization: planAuthorization() },
    );

    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    const authorizationEvent = ledger.events.find(
      (event) => event.type === "plan.authorized",
    )!;
    const authorizationPayload = authorizationEvent.payload as {
      authorization: { plan: { planBaseSha: string } };
    };
    authorizationPayload.authorization.plan.planBaseSha = planningShaTwo;
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");

    await assert.rejects(
      new ChangeControlStore(root).getPlanningProjection(
        "planning-project",
        "planning-change",
        "planning-wave",
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /missing or mismatched plan reference/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning replay rejects architect receipts without stale prior-plan assessment lineage", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-replan-corrupt-"));
  try {
    const store = new ChangeControlStore(root, {
      resolveRepositorySnapshot: async () =>
        planningSnapshot({ sha: planningShaTwo }),
    });
    await authorizePlanningWave(store);
    await assert.rejects(
      store.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "user:drift-observer" },
      ),
    );
    const assessment = (
      await store.getPlanningProjection(
        "planning-project",
        "planning-change",
        "planning-wave",
      )
    ).driftAssessments.at(-1)!;
    const replacement = planningContract({
      planId: "plan-two",
      revision: 2,
      predecessor: {
        planId: "plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
      planBase: {
        ...planningContract().planBase,
        sha: planningShaTwo,
      },
      createdAt: "2026-07-30T09:04:00.000Z",
    });
    await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: replacement },
    );
    await store.publishArchitectReplanReceipt(
      "planning-project",
      "planning-change",
      "planning-wave",
      {
        receipt: {
          contractType: "ArchitectReplanReceiptV1",
          contractVersion: "1.0",
          receiptId: "receipt-corrupt",
          projectId: "planning-project",
          changeId: "planning-change",
          waveId: "planning-wave",
          driftAssessmentId: assessment.assessmentId,
          priorPlan: {
            planId: "plan-one",
            revision: 1,
            planBaseSha: planningShaOne,
          },
          replacementPlan: {
            planId: "plan-two",
            revision: 2,
            planBaseSha: planningShaTwo,
          },
          changes: [
            {
              area: "base",
              summary: "Move to the observed replacement base.",
              rationale: "The prior plan has a persisted stale assessment.",
              evidenceRefs: ["test:stale-assessment"],
            },
          ],
          proposedAt: new Date().toISOString(),
          proposedBy: "architect:primary",
          authorizationState: "pending",
        },
      },
    );

    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    const receiptEvent = ledger.events.find(
      (event) => event.type === "architect.replan-recorded",
    )!;
    const payload = receiptEvent.payload as {
      receipt: { driftAssessmentId: string };
    };
    payload.receipt.driftAssessmentId = "missing-drift";
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");

    await assert.rejects(
      new ChangeControlStore(root).getPlanningProjection(
        "planning-project",
        "planning-change",
        "planning-wave",
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /missing drift assessment/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 2 dispatch persists fresh drift and an allowed immutable gate receipt across restart replay", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-drift-allowed-"));
  try {
    const resolveRepositorySnapshot = async () => planningSnapshot();
    const store = new ChangeControlStore(root, { resolveRepositorySnapshot });
    await authorizePlanningWave(store);

    const dispatched = await store.dispatchWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { actor: "user:dispatcher" },
    );
    assert.equal(dispatched.wave.status, "dispatched");
    assert.equal(dispatched.events.at(-1)?.type, "wave.dispatched");

    const projection = await store.getPlanningProjection(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.equal(projection.plans[0].status, "dispatched");
    assert.equal(projection.driftAssessments.length, 1);
    assert.equal(projection.driftAssessments[0].status, "fresh");
    assert.equal(projection.dispatchGateReceipts.length, 1);
    assert.deepEqual(projection.dispatchGateReceipts[0].reasons, []);
    assert.equal(projection.dispatchGateReceipts[0].result, "allowed");
    assert.equal(
      projection.dispatchGateReceipts[0].driftAssessmentId,
      projection.driftAssessments[0].assessmentId,
    );
    assert.ok(Object.isFrozen(projection.driftAssessments[0]));
    assert.ok(Object.isFrozen(projection.dispatchGateReceipts[0]));

    const replayed = await new ChangeControlStore(root, {
      resolveRepositorySnapshot,
    }).getPlanningProjection(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.deepEqual(replayed, projection);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Prompt/model lineage Draft 2020-12 examples validate and prohibited shapes fail closed", () => {
  const contractAjv = new Ajv2020({ allErrors: true, strict: true });
  contractAjv.addFormat("date-time", true);
  contractAjv.addSchema(promptModelLineageV1Schema);
  for (const example of promptModelLineageV1Examples.valid) {
    const validate = contractAjv.getSchema(
      `${promptModelLineageV1Schema.$id}#/$defs/${example.schemaDefinition}`,
    );
    assert.ok(validate, `missing schema ${example.schemaDefinition}`);
    assert.equal(
      validate!(example.value),
      true,
      ajvErrors(validate!.errors),
    );
    assert.doesNotThrow(() =>
      assertPromptModelSchemaV1(
        example.schemaDefinition as
          | "PromptArtifactV1"
          | "ModelRouteV1"
          | "AttemptConfigurationBindingV1"
          | "ResolvedModelExecutionV1",
        example.value,
      ),
    );
  }
  for (const example of promptModelLineageV1Examples.invalid) {
    const validate = contractAjv.getSchema(
      `${promptModelLineageV1Schema.$id}#/$defs/${example.schemaDefinition}`,
    );
    assert.ok(validate, `missing schema ${example.schemaDefinition}`);
    assert.equal(validate!(example.value), false, example.reasonCode);
  }
});

test("Eval lineage Draft 2020-12 examples validate and prohibited shapes fail closed", () => {
  const contractAjv = new Ajv2020({ allErrors: true, strict: true });
  contractAjv.addFormat("date-time", true);
  contractAjv.addSchema(evalLineageV1Schema);
  for (const example of evalLineageV1Examples.valid) {
    const validate = contractAjv.getSchema(
      `${evalLineageV1Schema.$id}#/$defs/${example.schemaDefinition}`,
    );
    assert.ok(validate, `missing schema ${example.schemaDefinition}`);
    assert.equal(validate!(example.value), true, ajvErrors(validate!.errors));
  }
  for (const example of evalLineageV1Examples.invalid) {
    const validate = contractAjv.getSchema(
      `${evalLineageV1Schema.$id}#/$defs/${example.schemaDefinition}`,
    );
    assert.ok(validate, `missing schema ${example.schemaDefinition}`);
    assert.equal(validate!(example.value), false, example.reasonCode);
  }
});

test("Eval runs fix cohorts before outcomes, require a complete matrix, and gate champion promotion", () => {
  const projection = createEvalLineageProjectionV1("eval-project");
  const context = {
    hasChange: (changeId: string) => changeId === "change-1",
    hasBinding: (bindingId: string) => bindingId === "binding-1",
    hasHalt: (haltId: string) => haltId === "halt-1",
    hasIncident: (incidentId: string) => incidentId === "incident-1",
  };
  let sequence = 0;
  const append = (type: string, payload: Record<string, unknown>, actor = "eval-publisher:test") => {
    sequence += 1;
    return applyEvalLineageEventV1({
      id: `eval-event-${sequence}`,
      sequence,
      type,
      occurredAt: `2026-08-02T${String(10 + sequence).padStart(2, "0")}:00:00.000Z`,
      projectId: "eval-project",
      changeId: "change-1",
      actor,
      causationId: "eval-test",
      correlationId: "eval-test",
      payload: { publisherOccurrenceId: `eval-occurrence-${sequence}`, ...payload },
      previousHash: sequence === 1 ? null : "a".repeat(64),
      hash: "b".repeat(64),
    }, projection, context);
  };
  const suite = structuredClone(evalLineageV1Examples.valid[0]!.value) as any;
  suite.samplingPolicy.samplesPerCandidate = 2;
  const cohort = structuredClone(evalLineageV1Examples.valid[1]!.value) as any;
  const run = structuredClone(evalLineageV1Examples.valid[2]!.value) as any;
  run.candidates = [
    { ...run.candidates[0], candidateId: "baseline", promptManifestHash: "1".repeat(64) },
    { ...run.candidates[0], candidateId: "candidate", promptManifestHash: "2".repeat(64) },
  ];
  append("eval.suite-published", { suite });
  append("eval.cohort-published", { cohort });
  append("eval.run-registered", { run }, "eval-runner:test");
  append("eval.run-started", { run }, "eval-runner:test");
  assert.throws(
    () => append("eval.run-sealed", { run }, "eval-runner:test"),
    (error: any) => error.reasonCode === "EVAL_OBSERVATION_INCOMPLETE",
  );
  sequence -= 1;

  const baseObservation = structuredClone(evalLineageV1Examples.valid[3]!.value) as any;
  const results = [
    ["baseline", 1, "failed", "fail"],
    ["baseline", 2, "interrupted", "fail"],
    ["candidate", 1, "passed", "pass"],
    ["candidate", 2, "failed", "fail"],
  ] as const;
  for (const [candidateId, sampleOrdinal, result, outcome] of results) {
    const observation = structuredClone(baseObservation);
    observation.evalObservationId = `observation-${candidateId}-${sampleOrdinal}`;
    observation.candidateId = candidateId;
    observation.sampleOrdinal = sampleOrdinal;
    observation.invocationId = `invocation-${candidateId}-${sampleOrdinal}`;
    observation.result = result;
    observation.outcomes.taskSuccess.state = outcome;
    observation.outcomes.safety.state = "pass";
    if (result === "interrupted") {
      observation.haltIds = ["halt-1"];
      observation.incidentIds = ["incident-1"];
    }
    append("eval.observation-recorded", { observation }, "eval-runner:test");
  }
  append("eval.run-sealed", { run }, "eval-runner:test");
  const sealed = projection.runs.get(run.evalRunId)!;
  const report = computeEvalReportV1({
    evalReportId: "report-1",
    run: sealed,
    suite,
    cohort,
    baselineCandidateId: "baseline",
    computedAt: "2026-08-03T12:00:00.000Z",
    evaluatorId: "evaluator:test",
  });
  assert.equal(report.candidateResults[0]!.metrics.firstPassAcceptance!.denominator, 2);
  assert.equal(report.candidateResults[1]!.metrics.firstPassAcceptance!.value, 0.5);
  assert.equal(report.exclusions.length, 1);
  assert.equal(report.comparisons[0]!.verdict, "comparable");
  append("eval.report-published", { report }, "evaluator:test");
  assert.equal(evalContentHashV1(report), evalContentHashV1(computeEvalReportV1({
    evalReportId: "report-1", run: sealed, suite, cohort,
    baselineCandidateId: "baseline", computedAt: report.computedAt,
    evaluatorId: report.evaluatorId,
  })));

  const decision = {
    contractType: "ChampionDecisionV1", contractVersion: "1.0",
    championDecisionId: "champion-1", scopeId: "executor-default",
    baselineCandidateId: "baseline", candidateId: "candidate",
    evalRunIds: [run.evalRunId], evalReportIds: [report.evalReportId],
    objective: { metric: "firstPassAcceptance", minimumImprovement: 0.5 },
    guardrails: [{ metric: "safety", maximumRegression: 0 }],
    minimumSampleSize: 3, decision: "promote",
    authority: { kind: "human", actor: "owner:test", authoritySource: "approval:phase5" },
    reason: "Candidate meets the declared objective and guardrail.",
    decidedAt: "2026-08-03T13:00:00.000Z",
  };
  assert.throws(
    () => append("lineage.champion-decided", { championDecision: decision }, "owner:test"),
    (error: any) => error.reasonCode === "EVAL_SAMPLE_INSUFFICIENT",
  );
  sequence -= 1;
  decision.minimumSampleSize = 2;
  append("lineage.champion-decided", { championDecision: decision }, "owner:test");
  assert.equal(projection.championDecisions.get("champion-1")?.decision, "promote");
});

test("runtime-evals-v1 imports preserve unsupported dimensions and reject upgraded evidence", () => {
  const report = {
    reportVersion: "runtime-evals-v1",
    configuration: {
      mode: "mock",
      providerExecution: false,
      identity: {
        prompt: { state: "measured", value: "prompt-v1" },
        model: { state: "unsupported", reason: "Mock mode has no provider model." },
        reasoning: { state: "unsupported", reason: "Mock mode has no provider reasoning." },
      },
    },
    cases: [{ caseId: "case-1", status: "passed" }],
  };
  const identity = runtimeEvalsV1ImportIdentity(report);
  assert.deepEqual(identity.unsupportedDimensions, ["model", "reasoning"]);
  assert.equal(identity.sourceReportHash.length, 64);
  assert.throws(
    () => runtimeEvalsV1ImportIdentity({
      ...report,
      configuration: { ...report.configuration, mode: "provider", providerExecution: true },
    }),
    (error: any) => error.reasonCode === "EVAL_IMPORT_INVALID",
  );
});

test("OperatorProjectionV1 Draft 2020-12 examples validate and invalid envelopes fail closed", () => {
  const contractAjv = new Ajv2020({ allErrors: true, strict: true });
  contractAjv.addFormat("date-time", true);
  contractAjv.addSchema(operatorProjectionV1Schema);
  const validate = contractAjv.getSchema(
    `${operatorProjectionV1Schema.$id}#/$defs/OperatorProjectionV1`,
  );
  assert.ok(validate);
  for (const example of operatorProjectionV1Examples.valid)
    assert.equal(validate!(example), true, ajvErrors(validate!.errors));
  for (const example of operatorProjectionV1Examples.invalid)
    assert.equal(validate!(example.value), false, example.reasonCode);
});

test("OperatorActionRequestV1, OperatorActionPreviewV1, and OperatorActionReceiptV1 Draft 2020-12 examples validate", () => {
  const contractAjv = new Ajv2020({ allErrors: true, strict: true });
  contractAjv.addFormat("date-time", true);
  contractAjv.addSchema(operatorActionsV1Schema);
  for (const contractType of [
    "OperatorActionRequestV1",
    "OperatorActionPreviewV1",
    "OperatorActionReceiptV1",
  ] as const) {
    const validate = contractAjv.getSchema(
      `${operatorActionsV1Schema.$id}#/$defs/${contractType}`,
    );
    assert.ok(validate);
    for (const example of operatorActionsV1Examples.valid[contractType])
      assert.equal(validate!(example), true, ajvErrors(validate!.errors));
    for (const example of operatorActionsV1Examples.invalid[contractType])
      assert.equal(validate!(example.value), false, example.reasonCode);
  }
  for (const request of operatorActionsV1Examples.valid.OperatorActionRequestV1)
    assert.deepEqual(parseOperatorActionRequestV1(request), request);
  for (const preview of operatorActionsV1Examples.valid.OperatorActionPreviewV1)
    assert.deepEqual(parseOperatorActionPreviewV1(preview), preview);
  assert.deepEqual(
    parseOperatorActionReceiptV1(operatorActionsV1Examples.valid.OperatorActionReceiptV1[0]),
    operatorActionsV1Examples.valid.OperatorActionReceiptV1[0],
  );
});

test("OperatorActionRequestV1 parsing rejects unknown actions, identities, fields, and incomplete evidence with stable codes", () => {
  const valid = structuredClone(operatorActionsV1Examples.valid.OperatorActionRequestV1[3]) as any;
  const expectedCodes = [
    "UNKNOWN_ACTION",
    "SOURCE_WATERMARK_CHANGED",
    "IDEMPOTENCY_CONFLICT",
  ];
  for (const code of expectedCodes) assert.ok(OPERATOR_ACTION_REASON_CODES_V1.includes(code as any));
  const unknownAction = { ...valid, actionKind: "execute-doctor" };
  assert.throws(
    () => parseOperatorActionRequestV1(unknownAction),
    (error: any) => error.code === "UNKNOWN_ACTION",
  );
  assert.throws(
    () => parseOperatorActionRequestV1({ ...valid, force: true }),
    (error: any) => error.code === "INVALID_REQUEST",
  );
  const dispatchOverride = structuredClone(
    operatorActionsV1Examples.valid.OperatorActionRequestV1[0],
  ) as any;
  dispatchOverride.input.sendAnyway = true;
  assert.deepEqual(
    parseOperatorActionRequestV1(dispatchOverride).input,
    { sendAnyway: true },
  );
  dispatchOverride.input.sendAnyway = false;
  assert.throws(
    () => parseOperatorActionRequestV1(dispatchOverride),
    (error: any) => error.code === "INVALID_REQUEST",
  );
  for (const field of ["actor", "reason", "idempotencyKey"] as const) {
    const incomplete = structuredClone(valid);
    delete incomplete[field];
    assert.throws(
      () => parseOperatorActionRequestV1(incomplete),
      (error: any) => error.code === "INVALID_REQUEST",
      field,
    );
  }
  assert.throws(
    () => parseOperatorActionRequestV1({ ...valid, expectedProjectHash: null }),
    (error: any) => error.code === "EVIDENCE_INCOMPLETE",
  );
  assert.throws(
    () => parseOperatorActionRequestV1({
      ...valid,
      expectedProjectSequence: Number.MAX_SAFE_INTEGER + 1,
    }),
    (error: any) => error.code === "INVALID_REQUEST",
  );
  assert.throws(
    () => parseOperatorActionRequestV1({ ...valid, idempotencyKey: "unrelated-key" }),
    (error: any) => error.code === "INVALID_REQUEST",
  );
  for (const idempotencyKey of [
    "another-project:transition-incident:request-transition-1",
    "project-one:resolve-incident:request-transition-1",
  ]) {
    assert.throws(
      () => parseOperatorActionRequestV1({ ...valid, idempotencyKey }),
      (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
      idempotencyKey,
    );
  }
  const resolution = structuredClone(operatorActionsV1Examples.valid.OperatorActionRequestV1[4]) as any;
  resolution.input.receipt.changeId = "another-change";
  assert.throws(
    () => parseOperatorActionRequestV1(resolution),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
  const invalidResolutionTime = structuredClone(
    operatorActionsV1Examples.valid.OperatorActionRequestV1[4],
  ) as any;
  invalidResolutionTime.input.receipt.resolvedAt = "2026-02-30T12:00:00.000Z";
  assert.throws(
    () => parseOperatorActionRequestV1(invalidResolutionTime),
    (error: any) => error.code === "INVALID_REQUEST",
  );
  const mitigation = structuredClone(valid) as any;
  mitigation.input.to = "mitigated";
  mitigation.input.receipt = structuredClone(
    operatorActionsV1Examples.valid.OperatorActionRequestV1[4].input.receipt,
  );
  mitigation.input.receipt.receiptId = "incident-mitigation-one";
  mitigation.input.receipt.resolutionKind = "mitigated";
  mitigation.input.receipt.evidenceRefs = ["oracle:different-evidence"];
  assert.throws(
    () => parseOperatorActionRequestV1(mitigation),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
  const retry = structuredClone(operatorActionsV1Examples.valid.OperatorActionRequestV1[1]) as any;
  retry.input.authority.actor = "human:another-operator";
  assert.throws(
    () => parseOperatorActionRequestV1(retry),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
});

test("operator action preview identifies all five owning gates and is deterministic for equal normalized requests and evidence", () => {
  const engine = new OperatorActionPreviewEngineV1();
  const expectedEvents: Record<string, string> = {
    "dispatch-wave": "wave.dispatched",
    "authorize-task-retry": "task.retry-authorized",
    "authorize-wave-resume": "wave.resume-authorized",
    "transition-incident": "incident.escalated",
    "resolve-incident": "incident.resolved",
  };
  const targetStates: Record<string, string> = {
    "dispatch-wave": "ready",
    "authorize-task-retry": "failed",
    "authorize-wave-resume": "halted",
    "transition-incident": "investigating",
    "resolve-incident": "mitigated",
  };
  assert.deepEqual(OPERATOR_ACTION_KINDS_V1, [
    "dispatch-wave",
    "authorize-task-retry",
    "authorize-wave-resume",
    "transition-incident",
    "resolve-incident",
  ]);
  for (const rawRequest of operatorActionsV1Examples.valid.OperatorActionRequestV1) {
    const request = parseOperatorActionRequestV1(rawRequest);
    const actionKind = request.actionKind;
    const isDispatchOverride =
      request.actionKind === "dispatch-wave" && request.input.sendAnyway === true;
    const expectedEvent = isDispatchOverride
      ? "wave.dispatch-overridden"
      : expectedEvents[actionKind];
    const evidence = {
      contractType: "OperatorActionEvidenceV1",
      contractVersion: "1.0",
      projectId: request.target.projectId,
      target: structuredClone(request.target),
      projectSequence: request.expectedProjectSequence,
      projectHash: request.expectedProjectHash,
      sourceWatermark: request.expectedSourceWatermark,
      currentTargetState: isDispatchOverride ? "draft" : targetStates[actionKind],
      owningGate: OPERATOR_ACTION_OWNING_GATES_V1[actionKind],
      gateDecision: {
        allowed: true,
        reasonCodes: [],
        evidenceRefs: ["target:canonical", "gate:decision"],
        expectedCanonicalEventType: expectedEvent,
      },
      warningCodes: [],
    };
    const beforeRequest = structuredClone(rawRequest);
    const beforeEvidence = structuredClone(evidence);
    const first = engine.preview(rawRequest, evidence);
    const second = engine.preview(structuredClone(rawRequest), structuredClone(evidence));
    assert.deepEqual(first, second, actionKind);
    assert.equal(first.allowed, true, actionKind);
    assert.equal(first.owningGate, OPERATOR_ACTION_OWNING_GATES_V1[actionKind]);
    assert.equal(first.expectedCanonicalEventType, expectedEvent);
    assert.equal(first.requestHash.length, 64);
    assert.equal(first.previewHash.length, 64);
    assert.equal(Object.isFrozen(first), true);
    assert.deepEqual(rawRequest, beforeRequest);
    assert.deepEqual(evidence, beforeEvidence);
  }

  const normalized = structuredClone(operatorActionsV1Examples.valid.OperatorActionRequestV1[1]) as any;
  normalized.reason = `  ${normalized.reason}  `;
  normalized.idempotencyKey = ` ${normalized.idempotencyKey} `;
  normalized.input.authority.evidenceRefs.reverse();
  const canonical = parseOperatorActionRequestV1(operatorActionsV1Examples.valid.OperatorActionRequestV1[1]);
  assert.deepEqual(parseOperatorActionRequestV1(normalized), canonical);
});

test("operator action preview and receipt dispatch override requires wave.dispatch-overridden evidence", () => {
  const engine = new OperatorActionPreviewEngineV1();
  const request = parseOperatorActionRequestV1(
    operatorActionsV1Examples.valid.OperatorActionRequestV1[5],
  );
  assert.equal(request.actionKind, "dispatch-wave");
  assert.equal(request.input.sendAnyway, true);
  const evidence = {
    contractType: "OperatorActionEvidenceV1",
    contractVersion: "1.0",
    projectId: request.target.projectId,
    target: request.target,
    projectSequence: request.expectedProjectSequence,
    projectHash: request.expectedProjectHash,
    sourceWatermark: request.expectedSourceWatermark,
    currentTargetState: "draft",
    owningGate: "phase-2-dispatch-gate",
    gateDecision: {
      allowed: true,
      reasonCodes: [],
      evidenceRefs: ["gate:dispatch-override"],
      expectedCanonicalEventType: "wave.dispatched",
    },
    warningCodes: [],
  };
  const denied = engine.preview(request, evidence);
  assert.equal(denied.allowed, false);
  assert.deepEqual(denied.reasonCodes, ["GATE_REJECTED"]);
  assert.equal(denied.expectedCanonicalEventType, null);

  const correctPreview = engine.preview(request, {
    ...evidence,
    gateDecision: {
      ...evidence.gateDecision,
      expectedCanonicalEventType: "wave.dispatch-overridden",
    },
  });
  assert.equal(correctPreview.allowed, true);
  const invalidPreview = {
    ...structuredClone(correctPreview),
    expectedCanonicalEventType: "wave.dispatched",
  } as any;
  const {
    previewHash: _invalidPreviewHash,
    responseTimestamp: _invalidResponseTimestamp,
    ...invalidPreviewContent
  } = invalidPreview;
  invalidPreview.previewHash = operatorActionPreviewHashV1(invalidPreviewContent);
  assert.throws(
    () => parseOperatorActionPreviewV1(invalidPreview),
    (error: any) => error.code === "INVALID_REQUEST",
  );

  const invalidReceipt = structuredClone(
    operatorActionsV1Examples.valid.OperatorActionReceiptV1[0],
  ) as any;
  Object.assign(invalidReceipt, {
    receiptId: "operator-receipt-dispatch-override-invalid-event",
    request,
    requestHash: correctPreview.requestHash,
    previewHash: correctPreview.previewHash,
    actor: request.actor,
    reason: request.reason,
    idempotencyKey: request.idempotencyKey,
    actionKind: request.actionKind,
    target: request.target,
    observedProjectSequence: request.expectedProjectSequence,
    observedProjectHash: request.expectedProjectHash,
    observedSourceWatermark: request.expectedSourceWatermark,
    outcome: "executed",
    reasonCodes: [],
    evidenceRefs: ["gate:dispatch-override"],
    canonicalEvent: {
      eventId: "wave-dispatched-override-invalid",
      eventType: "wave.dispatched",
      eventHash: "e".repeat(64),
    },
    resultingProjectSequence: request.expectedProjectSequence + 1,
    resultingProjectHash: "c".repeat(64),
  });
  const { receiptHash: _invalidReceiptHash, ...invalidReceiptContent } = invalidReceipt;
  invalidReceipt.receiptHash = operatorActionReceiptHashV1(invalidReceiptContent);
  assert.throws(
    () => parseOperatorActionReceiptV1(invalidReceipt),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
});

test("operator action preview fails closed on stale, denied, mismatched, and incomplete canonical evidence", () => {
  const engine = new OperatorActionPreviewEngineV1();
  const request = parseOperatorActionRequestV1(operatorActionsV1Examples.valid.OperatorActionRequestV1[0]);
  const evidence = {
    contractType: "OperatorActionEvidenceV1",
    contractVersion: "1.0",
    projectId: request.target.projectId,
    target: request.target,
    projectSequence: request.expectedProjectSequence + 1,
    projectHash: "c".repeat(64),
    sourceWatermark: "d".repeat(64),
    currentTargetState: "draft",
    owningGate: "phase-2-dispatch-gate",
    gateDecision: {
      allowed: false,
      reasonCodes: ["PLAN_NOT_AUTHORIZED"],
      evidenceRefs: ["plan:plan-one"],
      expectedCanonicalEventType: null,
    },
    warningCodes: [],
  };
  const denied = engine.preview(request, evidence);
  assert.equal(denied.allowed, false);
  assert.equal(denied.expectedCanonicalEventType, null);
  assert.deepEqual(denied.reasonCodes, [
    "GATE_REJECTED",
    "PLAN_NOT_AUTHORIZED",
    "PROJECT_STATE_CHANGED",
    "SOURCE_WATERMARK_CHANGED",
    "TARGET_STATE_CHANGED",
  ]);
  assert.throws(
    () => parseOperatorActionEvidenceV1({ ...evidence, sourceWatermark: undefined }),
    (error: any) => error.code === "INVALID_REQUEST" || error.code === "EVIDENCE_INCOMPLETE",
  );
  assert.throws(
    () => parseOperatorActionEvidenceV1({
      ...evidence,
      gateDecision: { ...evidence.gateDecision, reasonCodes: [] },
    }),
    (error: any) => error.code === "EVIDENCE_INCOMPLETE",
  );
  assert.throws(
    () => parseOperatorActionEvidenceV1({
      ...evidence,
      projectId: "another-project",
    }),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
  assert.throws(
    () => parseOperatorActionEvidenceV1({
      ...evidence,
      owningGate: "phase-4-task-retry-authorization",
    }),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
  assert.throws(
    () => parseOperatorActionEvidenceV1({
      ...evidence,
      projectSequence: request.expectedProjectSequence,
      projectHash: request.expectedProjectHash,
      sourceWatermark: request.expectedSourceWatermark,
      currentTargetState: "ready",
      gateDecision: {
        allowed: true,
        reasonCodes: [],
        evidenceRefs: ["gate:malformed-event"],
        expectedCanonicalEventType: "incident.resolved",
      },
    }),
    (error: any) => error.code === "EVIDENCE_INCOMPLETE",
  );
  const impossibleAllowed = structuredClone(
    operatorActionsV1Examples.valid.OperatorActionPreviewV1[0],
  ) as any;
  impossibleAllowed.currentTargetState = "draft";
  const {
    previewHash: _previewHash,
    responseTimestamp: _responseTimestamp,
    ...impossibleAllowedContent
  } = impossibleAllowed;
  impossibleAllowed.previewHash = operatorActionPreviewHashV1(
    impossibleAllowedContent,
  );
  assert.throws(
    () => parseOperatorActionPreviewV1(impossibleAllowed),
    (error: any) => error.code === "INVALID_REQUEST",
  );
  const invalidTimestamp = structuredClone(
    operatorActionsV1Examples.valid.OperatorActionPreviewV1[0],
  ) as any;
  invalidTimestamp.responseTimestamp = "2026-02-30T12:00:00.000Z";
  assert.throws(
    () => parseOperatorActionPreviewV1(invalidTimestamp),
    (error: any) => error.code === "INVALID_REQUEST",
  );
});

test("operator action preview accepts canonical Phase 4 owning-gate denial reasons", () => {
  const engine = new OperatorActionPreviewEngineV1();
  const deniedExamples = operatorActionsV1Examples.valid.OperatorActionPreviewV1
    .filter((preview) => !preview.allowed);
  assert.deepEqual(
    deniedExamples.map((preview) =>
      preview.reasonCodes.find((reasonCode) => reasonCode !== "GATE_REJECTED")),
    [
      "HUMAN_AUTHORITY_REQUIRED",
      "EVIDENCE_STALE",
      "REPAIR_BUDGET_EXHAUSTED",
    ],
  );

  for (const example of deniedExamples) {
    const request = parseOperatorActionRequestV1(example.request);
    const gateReasonCodes = example.reasonCodes.filter(
      (reasonCode) => reasonCode !== "GATE_REJECTED",
    );
    assert.ok(
      gateReasonCodes.every((reasonCode) =>
        OPERATOR_ACTION_OWNING_GATE_REASON_CODES_V1.includes(reasonCode as any)),
    );
    const evidence = parseOperatorActionEvidenceV1({
      contractType: "OperatorActionEvidenceV1",
      contractVersion: "1.0",
      projectId: request.target.projectId,
      target: request.target,
      projectSequence: example.currentProjectSequence,
      projectHash: example.currentProjectHash,
      sourceWatermark: example.currentSourceWatermark,
      currentTargetState: example.currentTargetState,
      owningGate: example.owningGate,
      gateDecision: {
        allowed: false,
        reasonCodes: gateReasonCodes,
        evidenceRefs: example.evidenceRefs,
        expectedCanonicalEventType: null,
      },
      warningCodes: example.warnings,
    });
    const preview = engine.preview(request, evidence);
    assert.deepEqual(preview, example);
  }
});

test("OperatorActionRequestV1 privacy validation rejects prohibited fields at every depth", () => {
  const request = structuredClone(operatorActionsV1Examples.valid.OperatorActionRequestV1[3]) as any;
  for (const prohibited of [
    ["promptBody", "do not retain"],
    ["environmentValues", { TOKEN: "value" }],
    ["rawProviderPayload", { response: "value" }],
    ["fileContents", "bounded-looking content is still prohibited"],
    ["logs", ["line"]],
    ["credentials", { password: "value" }],
  ] as const) {
    const candidate = structuredClone(request);
    candidate.input[prohibited[0]] = prohibited[1];
    assert.throws(
      () => parseOperatorActionRequestV1(candidate),
      (error: any) => error.code === "PRIVACY_VIOLATION",
      prohibited[0],
    );
  }
  const sensitiveReason = structuredClone(request);
  sensitiveReason.reason = "Use password=do-not-store-this-value";
  assert.throws(
    () => parseOperatorActionRequestV1(sensitiveReason),
    (error: any) => error.code === "PRIVACY_VIOLATION",
  );
  const serialized = JSON.stringify([
    operatorActionsV1Examples.valid.OperatorActionPreviewV1[0],
    operatorActionsV1Examples.valid.OperatorActionReceiptV1[0],
  ]);
  for (const field of ["promptBody", "environmentValues", "rawProviderPayload", "fileContents", "logs", "credentials"])
    assert.equal(serialized.includes(field), false, field);
});

test("operator action preview preserves legacy Phase 1-6 ledgers and performs no file mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-operator-action-preview-"));
  try {
    const store = new ChangeControlStore(root);
    await store.create("legacy-project", {
      changeId: "legacy-change",
      actor: "user:legacy",
    });
    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("legacy-project").digest("hex")}.json`,
    );
    const before = await readFile(projectFile);
    const request = parseOperatorActionRequestV1(operatorActionsV1Examples.valid.OperatorActionRequestV1[3]);
    const evidence = {
      contractType: "OperatorActionEvidenceV1",
      contractVersion: "1.0",
      projectId: request.target.projectId,
      target: request.target,
      projectSequence: request.expectedProjectSequence,
      projectHash: request.expectedProjectHash,
      sourceWatermark: request.expectedSourceWatermark,
      currentTargetState: "open",
      owningGate: "phase-4-incident-lifecycle",
      gateDecision: {
        allowed: true,
        reasonCodes: [],
        evidenceRefs: ["incident:incident-one"],
        expectedCanonicalEventType: "incident.escalated",
      },
      warningCodes: [],
    };
    const preview = new OperatorActionPreviewEngineV1().preview(request, evidence);
    assert.equal(preview.allowed, true);
    assert.deepEqual(await readFile(projectFile), before);
    assert.equal((await store.list("legacy-project")).length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("OperatorActionReceiptV1 binds request identity and receipt hash without executing an action", () => {
  const receipt = structuredClone(operatorActionsV1Examples.valid.OperatorActionReceiptV1[0]) as any;
  const { receiptHash: _receiptHash, ...content } = receipt;
  assert.equal(operatorActionReceiptHashV1(content), receipt.receiptHash);
  assert.deepEqual(parseOperatorActionReceiptV1(receipt), receipt);
  const conflict = structuredClone(receipt);
  conflict.idempotencyKey = "project-one:dispatch-wave:conflict";
  const { receiptHash: _oldHash, ...conflictContent } = conflict;
  conflict.receiptHash = operatorActionReceiptHashV1(conflictContent);
  assert.throws(
    () => parseOperatorActionReceiptV1(conflict),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
  const stale = {
    ...structuredClone(receipt),
    observedProjectSequence: receipt.request.expectedProjectSequence,
    observedProjectHash: receipt.request.expectedProjectHash,
    observedSourceWatermark: receipt.request.expectedSourceWatermark,
    outcome: "executed",
    reasonCodes: [],
    canonicalEvent: {
      eventId: "wave-dispatched-one",
      eventType: "wave.dispatched",
      eventHash: "e".repeat(64),
    },
    resultingProjectSequence: receipt.request.expectedProjectSequence + 1,
    resultingProjectHash: "c".repeat(64),
  };
  stale.observedSourceWatermark = "f".repeat(64);
  const { receiptHash: _staleHash, ...staleContent } = stale;
  stale.receiptHash = operatorActionReceiptHashV1(staleContent);
  assert.throws(
    () => parseOperatorActionReceiptV1(stale),
    (error: any) => error.code === "TARGET_IDENTITY_MISMATCH",
  );
});

async function operatorActionFreshnessV1(
  store: InstanceType<typeof ChangeControlStore>,
  projectId = "planning-project",
) {
  const read = await store.readOperatorSourcesV1([projectId]);
  const source = read.sources[0];
  assert.ok(source);
  return {
    expectedProjectSequence: source.watermark.sequence,
    expectedProjectHash: source.watermark.hash,
    expectedSourceWatermark: operatorActionSourceWatermarkV1(
      projectId,
      source.watermark.sequence,
      source.watermark.hash,
    ),
  };
}

async function operatorActionFixtureV1(
  root: string,
  actionKind: (typeof OPERATOR_ACTION_KINDS_V1)[number],
  options: ConstructorParameters<typeof ChangeControlStore>[1] = {},
) {
  const publicationTime = "2026-07-31T10:00:00.000Z";
  const store = new ChangeControlStore(root, {
    now: () => publicationTime,
    resolveRepositorySnapshot: async () => planningSnapshot(),
    ...options,
  });
  const actor = "human:operator";
  let request: any;
  if (actionKind === "dispatch-wave") {
    await authorizePlanningWave(store);
    request = {
      contractType: "OperatorActionRequestV1",
      contractVersion: "1.0",
      requestId: "operator-request-dispatch",
      actionKind,
      target: {
        projectId: "planning-project",
        changeId: "planning-change",
        waveId: "planning-wave",
        plan: {
          planId: "plan-one",
          revision: 1,
          planBaseSha: planningShaOne,
        },
        authorizationId: "authorization-one",
      },
      actor,
      reason: "Dispatch the exact authorized and fresh wave.",
      input: {},
      ...(await operatorActionFreshnessV1(store)),
      idempotencyKey: "planning-project:dispatch-wave:operator-request-dispatch",
    };
  } else if (
    actionKind === "authorize-task-retry" ||
    actionKind === "authorize-wave-resume"
  ) {
    await authorizePlanningWave(store);
    await store.dispatchWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { actor: "human:dispatcher" },
    );
    await store.transitionWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      { to: "running", actor: "system:runner" },
    );
    let terminalEventId: string;
    if (actionKind === "authorize-task-retry") {
      await store.transitionTask(
        "planning-project",
        "planning-change",
        "planning-wave",
        "task-one",
        { to: "running", actor: "system:runner" },
      );
      const failed = await store.transitionTask(
        "planning-project",
        "planning-change",
        "planning-wave",
        "task-one",
        { to: "failed", actor: "system:runner" },
      );
      terminalEventId = failed.events.find((event) => event.type === "task.failed")!.id;
    } else {
      const halted = await store.transitionWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { to: "halted", actor: "system:runner" },
      );
      terminalEventId = halted.events.find((event) => event.type === "wave.halted")!.id;
    }
    const halt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: `halt-operator-${actionKind}`,
        detectorEventId: `detector-operator-${actionKind}`,
      }),
    );
    const commonTarget = {
      projectId: "planning-project",
      changeId: "planning-change",
      waveId: "planning-wave",
      haltId: halt.halt.haltId,
      incidentId: halt.incident.incidentId,
    };
    request = {
      contractType: "OperatorActionRequestV1",
      contractVersion: "1.0",
      requestId: `operator-request-${actionKind}`,
      actionKind,
      target: actionKind === "authorize-task-retry"
        ? { ...commonTarget, taskId: "task-one" }
        : commonTarget,
      actor,
      reason: "An audited human independently authorizes one bounded recovery step.",
      input: {
        authorizationId: `authorization-${actionKind}`,
        priorTerminalEventId: terminalEventId,
        ...(actionKind === "authorize-task-retry"
          ? {
              newAttemptId: "operator-attempt-two",
              attemptAllocationNonce: "operator-attempt-nonce-two",
            }
          : {}),
        budgetOrdinal: 1,
        authority: {
          kind: "audited_human",
          actor,
          decisionId: `decision-${actionKind}`,
          evidenceRefs: [`audit:${actionKind}`],
        },
      },
      ...(await operatorActionFreshnessV1(store)),
      idempotencyKey: `planning-project:${actionKind}:operator-request`,
    };
  } else {
    await seedPhase4Scope(store);
    const halt = await store.detectAndClassifyHalt(
      "planning-project",
      fingerprintedHaltContractsV1({
        haltId: `halt-operator-${actionKind}`,
        detectorEventId: `detector-operator-${actionKind}`,
      }),
    );
    if (actionKind === "resolve-incident") {
      await store.transitionHalt("planning-project", halt.halt.haltId, {
        to: "escalated",
        actor,
        reasonCode: "HUMAN_AUTHORITY_REQUIRED",
        evidenceRefs: ["human:operator-resolution-triage"],
      });
      await store.transitionIncident(
        "planning-project",
        halt.incident.incidentId,
        {
          actor,
          to: "mitigated",
          reasonCode: "HUMAN_AUTHORITY_REQUIRED",
          evidenceRefs: ["human:operator-resolution-mitigation"],
          receipt: {
            ...mitigationReceiptV1(
              "operator-resolution-mitigation",
              halt.incident.incidentId,
              publicationTime,
            ),
            evidenceRefs: ["human:operator-resolution-mitigation"],
            correlationWindowSeconds:
              halt.incident.correlationWindowPolicy.durationSeconds,
          },
        },
      );
    }
    const receipt = {
      contractType: "IncidentResolutionReceiptV1",
      contractVersion: "1.0",
      receiptId: "operator-final-resolution",
      incidentId: halt.incident.incidentId,
      projectId: "planning-project",
      changeId: "planning-change",
      resolutionKind: "resolved",
      oracle: {
        kind: "human",
        outcome: "passed",
        observationResult: "The incident resolution evidence was reviewed.",
      },
      noActiveHealing: true,
      evidenceRefs: ["human:operator-resolution"],
      resolvedBy: actor,
      taxonomyPolicyVersion: "halt-taxonomy-v1",
      correlationWindowSeconds:
        halt.incident.correlationWindowPolicy.durationSeconds,
    };
    request = {
      contractType: "OperatorActionRequestV1",
      contractVersion: "1.0",
      requestId: `operator-request-${actionKind}`,
      actionKind,
      target: {
        projectId: "planning-project",
        changeId: "planning-change",
        incidentId: halt.incident.incidentId,
      },
      actor,
      reason: "Apply the exact reviewed incident lifecycle decision.",
      input: actionKind === "transition-incident"
        ? {
            to: "investigating",
            reasonCode: "HUMAN_AUTHORITY_REQUIRED",
            evidenceRefs: ["human:operator-investigation"],
          }
        : { receipt },
      ...(await operatorActionFreshnessV1(store)),
      idempotencyKey: `planning-project:${actionKind}:operator-request`,
    };
  }
  return { store, request: parseOperatorActionRequestV1(request) };
}

test("Phase 7 Slice 1 previews and atomically executes all five closed actions through their owning handlers", async () => {
  for (const actionKind of OPERATOR_ACTION_KINDS_V1) {
    const root = await mkdtemp(join(tmpdir(), `orchestrator-operator-${actionKind}-`));
    try {
      const { store, request } = await operatorActionFixtureV1(root, actionKind);
      const projectFile = join(
        root,
        "projects",
        `${createHash("sha256").update("planning-project").digest("hex")}.json`,
      );
      const beforePreview = await readFile(projectFile);
      const preview = await store.previewOperatorActionV1(request);
      assert.equal(preview.allowed, true, `${actionKind}: ${preview.reasonCodes}`);
      assert.deepEqual(await readFile(projectFile), beforePreview, actionKind);
      const receipt = await store.executeOperatorActionV1({
        request,
        previewHash: preview.previewHash,
        confirmed: true,
      });
      assert.equal(receipt.outcome, "executed", actionKind);
      assert.equal(receipt.canonicalEvent?.eventType, preview.expectedCanonicalEventType);
      assert.deepEqual(
        await new ChangeControlStore(root, {
          now: () => "2026-07-31T10:00:00.000Z",
          resolveRepositorySnapshot: async () => planningSnapshot(),
        }).getOperatorActionReceiptV1(receipt.receiptId),
        receipt,
        actionKind,
      );
      const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
        events: Array<{ type: string }>;
      };
      assert.equal(
        ledger.events.filter((event) => event.type === "operator.action-receipt-published").length,
        1,
        actionKind,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("operator action HTTP preview, execute, and receipt routes integrate all five action kinds with bounded private errors", async () => {
  for (const actionKind of OPERATOR_ACTION_KINDS_V1) {
    const root = await mkdtemp(join(tmpdir(), `orchestrator-operator-http-${actionKind}-`));
    let server: ReturnType<express.Express["listen"]> | undefined;
    try {
      const { store, request } = await operatorActionFixtureV1(root, actionKind);
      const httpApp = express();
      httpApp.use(express.json({ limit: "64kb" }));
      installOperatorActionRoutesV1(httpApp, new OperatorActionServiceV1(store));
      server = httpApp.listen(0, "127.0.0.1");
      await new Promise<void>((resolveListen, rejectListen) => {
        server!.once("listening", resolveListen);
        server!.once("error", rejectListen);
      });
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const base = `http://127.0.0.1:${address.port}/api/operator-actions/v1`;
      const previewResponse = await fetch(`${base}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      assert.equal(previewResponse.status, 200, actionKind);
      const preview = await previewResponse.json() as any;
      assert.equal(preview.allowed, true, `${actionKind}: ${preview.reasonCodes}`);
      const executeResponse = await fetch(`${base}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request,
          previewHash: preview.previewHash,
          confirmed: true,
        }),
      });
      assert.equal(executeResponse.status, 200, actionKind);
      const receipt = await executeResponse.json() as any;
      assert.equal(receipt.actionKind, actionKind);
      const getResponse = await fetch(`${base}/receipts/${receipt.receiptId}`);
      assert.equal(getResponse.status, 200, actionKind);
      assert.deepEqual(await getResponse.json(), receipt, actionKind);

      if (actionKind === "transition-incident") {
        const secret = "password=operator-secret-value";
        const privateResponse = await fetch(`${base}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...request, reason: secret }),
        });
        assert.equal(privateResponse.status, 400);
        const body = JSON.stringify(await privateResponse.json());
        assert.equal(body.includes("operator-secret-value"), false);
        assert.equal(body.length < 256, true);
        const unknownResponse = await fetch(`${base}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...request, actionKind: "execute-doctor" }),
        });
        assert.equal(unknownResponse.status, 400);
        assert.equal((await unknownResponse.json() as any).code, "UNKNOWN_ACTION");
      }
    } finally {
      if (server)
        await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("operator action execution rejects missing confirmation and stale evidence without mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-operator-stale-"));
  try {
    const { store, request } = await operatorActionFixtureV1(root, "transition-incident");
    const preview = await store.previewOperatorActionV1(request);
    await assert.rejects(
      store.executeOperatorActionV1({ request, previewHash: preview.previewHash }),
      (error: any) => error.code === "CONFIRMATION_REQUIRED",
    );
    for (const changed of [
      { ...request, actor: "human:another-operator" },
      { ...request, reason: "A changed reason must receive its own fresh preview." },
      { ...request, requestId: "operator-request-changed-request-hash" },
      { ...request, target: { ...request.target, incidentId: "incident-mismatch" } },
    ])
      await assert.rejects(
        store.executeOperatorActionV1({
          request: changed,
          previewHash: preview.previewHash,
          confirmed: true,
        }),
        (error: any) =>
          ["PROJECT_STATE_CHANGED", "TARGET_STATE_CHANGED"].includes(error.code),
      );
    await assert.rejects(
      store.executeOperatorActionV1({
        request,
        previewHash: "f".repeat(64),
        confirmed: true,
      }),
      (error: any) => error.code === "PROJECT_STATE_CHANGED",
    );
    await store.create("planning-project", {
      changeId: "operator-concurrent-change",
      actor: "human:other-writer",
    });
    await assert.rejects(
      store.executeOperatorActionV1({
        request,
        previewHash: preview.previewHash,
        confirmed: true,
      }),
      (error: any) => error.code === "SOURCE_WATERMARK_CHANGED",
    );
    const projection = await store.getHaltIncidentProjection("planning-project");
    assert.equal(
      projection.events.some((event) => event.type === "incident.investigating"),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operator action idempotency and concurrent stale conflicts serialize to one mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-operator-idempotency-"));
  try {
    const { store, request } = await operatorActionFixtureV1(root, "transition-incident");
    const preview = await store.previewOperatorActionV1(request);
    const execution = { request, previewHash: preview.previewHash, confirmed: true };
    const [first, second] = await Promise.all([
      store.executeOperatorActionV1(execution),
      store.executeOperatorActionV1(execution),
    ]);
    assert.deepEqual(second, first);
    const conflictingRequest = parseOperatorActionRequestV1({
      ...request,
      requestId: "operator-request-conflicting-reuse",
      reason: "A conflicting reuse must not inherit the original mutation.",
    });
    await assert.rejects(
      store.executeOperatorActionV1({
        request: conflictingRequest,
        previewHash: preview.previewHash,
        confirmed: true,
      }),
      (error: any) => error.code === "IDEMPOTENCY_CONFLICT",
    );
    const ledger = JSON.parse(await readFile(join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    ), "utf8")) as { events: Array<{ type: string }> };
    assert.equal(ledger.events.filter((event) => event.type === "incident.investigating").length, 1);
    assert.equal(ledger.events.filter((event) => event.type === "operator.action-receipt-published").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent distinct operator actions have one serialized winner and deterministic stale losers", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-operator-concurrent-stale-"));
  try {
    const { store, request } = await operatorActionFixtureV1(root, "transition-incident");
    const firstPreview = await store.previewOperatorActionV1(request);
    const secondRequest = parseOperatorActionRequestV1({
      ...request,
      requestId: "operator-request-second-contender",
      idempotencyKey: "planning-project:transition-incident:second-contender",
      reason: "A second explicit operator decision contends on the same state.",
    });
    const secondPreview = await store.previewOperatorActionV1(secondRequest);
    const results = await Promise.allSettled([
      store.executeOperatorActionV1({
        request,
        previewHash: firstPreview.previewHash,
        confirmed: true,
      }),
      store.executeOperatorActionV1({
        request: secondRequest,
        previewHash: secondPreview.previewHash,
        confirmed: true,
      }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    assert.equal((results[1] as PromiseRejectedResult).reason.code, "SOURCE_WATERMARK_CHANGED");
    const projection = await store.getHaltIncidentProjection("planning-project");
    assert.equal(projection.events.filter((event) => event.type === "incident.investigating").length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operator action replay rejects a receipt without its adjacent owning mutation", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-operator-replay-split-"));
  try {
    const { store, request } = await operatorActionFixtureV1(root, "transition-incident");
    const preview = await store.previewOperatorActionV1(request);
    await store.executeOperatorActionV1({
      request,
      previewHash: preview.previewHash,
      confirmed: true,
    });
    const projectFile = join(
      root,
      "projects",
      `${createHash("sha256").update("planning-project").digest("hex")}.json`,
    );
    const ledger = JSON.parse(await readFile(projectFile, "utf8")) as {
      events: Array<Record<string, unknown>>;
    };
    const mutationIndex = ledger.events.findIndex(
      (event) => event.type === "incident.investigating",
    );
    assert.notEqual(mutationIndex, -1);
    ledger.events.splice(mutationIndex, 1);
    ledger.events.forEach((event, index) => {
      event.sequence = index + 1;
    });
    rehashTestLedger(ledger);
    await writeFile(projectFile, JSON.stringify(ledger, null, 2), "utf8");
    await assert.rejects(
      new ChangeControlStore(root).getHaltIncidentProjection("planning-project"),
      (error: any) =>
        error instanceof ChangeControlError &&
        error.code === "CORRUPT_LEDGER" &&
        /adjacent owning mutation/.test(error.message),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operator action crash boundaries publish neither side or both sides and replay exact retry", async () => {
  for (const boundary of ["before_atomic_publish", "after_atomic_publish"] as const) {
    const root = await mkdtemp(join(tmpdir(), `orchestrator-operator-crash-${boundary}-`));
    let crash = true;
    try {
      const { store, request } = await operatorActionFixtureV1(
        root,
        "transition-incident",
        {
          onOperatorActionBoundary: async (observed) => {
            if (crash && observed === boundary) throw new Error(`crash:${boundary}`);
          },
        },
      );
      const preview = await store.previewOperatorActionV1(request);
      await assert.rejects(
        store.executeOperatorActionV1({ request, previewHash: preview.previewHash, confirmed: true }),
        new RegExp(`crash:${boundary}`),
      );
      crash = false;
      const restarted = new ChangeControlStore(root, {
        now: () => "2026-07-31T10:00:00.000Z",
      });
      if (boundary === "before_atomic_publish") {
        const unchanged = await restarted.getHaltIncidentProjection("planning-project");
        assert.equal(unchanged.events.some((event) => event.type === "incident.investigating"), false);
        const freshPreview = await restarted.previewOperatorActionV1(request);
        assert.equal(freshPreview.allowed, true);
      } else {
        const receipt = await restarted.executeOperatorActionV1({
          request,
          previewHash: preview.previewHash,
          confirmed: true,
        });
        assert.equal(receipt.outcome, "executed");
        const projection = await restarted.getHaltIncidentProjection("planning-project");
        assert.equal(projection.events.filter((event) => event.type === "incident.investigating").length, 1);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("operator projections are deterministic, privacy-bounded, paginated, and watermark-fenced", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-operator-projection-"));
  try {
    const { store, route } = await promptModelPlanningFixture(root);
    const service = new OperatorProjectionServiceV1(
      store,
      () => "2026-08-02T15:00:00.000Z",
    );
    const query = parseOperatorProjectionQueryV1({
      projectId: "planning-project",
      limit: "1",
    });
    const first = await service.project("prompt-registry", query);
    assert.deepEqual(first, await service.project("prompt-registry", query));
    assert.equal(first.page.totalItems, 2);
    assert.ok(first.page.nextCursor);
    const second = await service.project(
      "prompt-registry",
      parseOperatorProjectionQueryV1({
        projectId: "planning-project",
        limit: "1",
        cursor: first.page.nextCursor!,
      }),
    );
    assert.notEqual(first.items[0]!.entityId, second.items[0]!.entityId);
    const serialized = JSON.stringify([first, second]);
    for (const prohibited of [
      "You are an approved reusable executor",
      "renderedPrompt",
      "environmentValues",
      "hiddenReasoning",
      "rawProviderPayload",
    ]) assert.equal(serialized.includes(prohibited), false, prohibited);

    await store.revokeModelRouteV1("planning-project", "planning-change", {
      publisherOccurrenceId: "operator-projection-route-revocation",
      revocation: {
        entityId: route.modelRouteId,
        reasonCode: "ROUTE_RETIRED",
        reason: "Watermark fencing test.",
        evidenceRefs: ["test:operator-watermark"],
        revokedBy: "human:test",
        revokedAt: "2026-08-02T15:01:00.000Z",
      },
    });
    await assert.rejects(
      service.project("prompt-registry", parseOperatorProjectionQueryV1({
        projectId: "planning-project", limit: "1", cursor: first.page.nextCursor!,
      })),
      (error: any) => error.code === "SOURCE_WATERMARK_CHANGED" && error.status === 409,
    );
    assert.throws(
      () => parseOperatorProjectionQueryV1({ limit: "101" }),
      (error: any) => error.code === "INVALID_QUERY",
    );
    assert.throws(
      () => parseOperatorProjectionQueryV1({ unknown: "value" }),
      (error: any) => error.code === "INVALID_QUERY",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operator projections expose partial source failure and never mutate canonical state over HTTP", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-operator-unavailable-"));
  try {
    const store = new ChangeControlStore(root);
    await store.create("healthy-project", { changeId: "healthy-change", actor: "user:test" });
    const projectsPath = join(root, "projects");
    await writeFile(join(projectsPath, "corrupt.json"), "{not-json", "utf8");
    const projection = await new OperatorProjectionServiceV1(store).project("overview", { limit: 25 });
    assert.equal(projection.aggregates.totalSources, 2);
    assert.equal(projection.aggregates.availableSources, 1);
    assert.equal(projection.aggregates.unavailableSources, 1);
    assert.equal(projection.warnings[0]!.code, "SOURCE_UNAVAILABLE");

    const projectId = `operator-http-${Date.now()}`;
    await changeControlStore.create(projectId, { changeId: "change-one", actor: "user:test" });
    const before = await changeControlStore.list(projectId);
    const server = app.listen(0, "127.0.0.1");
    try {
      await new Promise<void>((resolve) => server.once("listening", resolve));
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const rootUrl = `http://127.0.0.1:${address.port}/api/operator-projections/v1`;
      const views = ["overview", "execution-bucket", "incidents", "prompt-registry", "eval-lineage"];
      for (const view of views) {
        const response = await fetch(`${rootUrl}/${view}?projectId=${projectId}`);
        assert.equal(response.status, 200, view);
        const body = await response.json() as { contractType: string; view: string; items: unknown[] };
        assert.equal(body.contractType, "OperatorProjectionV1");
        assert.equal(body.view, view);
        assert.equal(body.items.length, view === "overview" ? 1 : 0);
      }
      const base = `${rootUrl}/overview?projectId=${projectId}`;
      const mutation = await fetch(base, { method: "POST" });
      assert.equal(mutation.status, 404);
      assert.equal((await fetch(`${rootUrl}/overview?unknown=true`)).status, 400);
      assert.equal((await fetch(`${rootUrl}/overview?projectId=missing-project`)).status, 503);
      assert.deepEqual(await changeControlStore.list(projectId), before);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PromptArtifactV1 and ModelRouteV1 publish atomically, replay deterministically, and deduplicate concurrent publishers", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-prompt-model-publication-"));
  try {
    const { store, artifact } = await promptModelPlanningFixture(root);
    const duplicateStores = [store, new ChangeControlStore(root)];
    const duplicates = await Promise.all(
      duplicateStores.map((candidate) =>
        candidate.publishPromptArtifactV1(
          "planning-project",
          "planning-change",
          {
            publisherOccurrenceId: "occurrence-prompt-root",
            artifact,
          },
        ),
      ),
    );
    assert.equal(duplicates[0].id, duplicates[1].id);

    const changedContent = {
      storage: "approved_reusable_content" as const,
      mediaType: "text/plain; charset=utf-8" as const,
      text: "You are an approved reusable executor with bounded scope.",
    };
    const derived = promptArtifactV1({
      promptArtifactId: "prompt-executor-derived-v1",
      content: changedContent,
      ...promptArtifactContentIdentityV1({ content: changedContent }),
      parentArtifactIds: [artifact.promptArtifactId],
      derivation: { operation: "edit", operationVersion: "1.0" },
      supersedesId: artifact.promptArtifactId,
      publishedAt: "2026-08-01T10:03:00.000Z",
    });
    await store.publishPromptArtifactV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-prompt-derived",
        artifact: derived,
      },
    );

    const beforeInvalid = await store.getPromptModelLineageProjectionV1(
      "planning-project",
    );
    await assert.rejects(
      store.publishPromptArtifactV1("planning-project", "planning-change", {
        publisherOccurrenceId: "occurrence-hash-mismatch",
        artifact: promptArtifactV1({
          promptArtifactId: "prompt-hash-mismatch",
          contentHash: "f".repeat(64),
        }),
      }),
      lineageRejected("PROMPT_CONTENT_HASH_MISMATCH"),
    );
    await assert.rejects(
      store.publishPromptArtifactV1("planning-project", "planning-change", {
        publisherOccurrenceId: "occurrence-private",
        artifact: promptArtifactV1({
          promptArtifactId: "prompt-private",
          content: {
            storage: "approved_reusable_content",
            mediaType: "text/plain; charset=utf-8",
            text: "api_key = sk-abcdefghijklmnop",
          },
          contentHash: createHash("sha256")
            .update("api_key = sk-abcdefghijklmnop")
            .digest("hex"),
          byteLength: Buffer.byteLength("api_key = sk-abcdefghijklmnop"),
        }),
      }),
      lineageRejected("PROMPT_PRIVACY_VIOLATION"),
    );
    await assert.rejects(
      store.publishPromptArtifactV1("planning-project", "planning-change", {
        publisherOccurrenceId: "occurrence-cycle",
        artifact: promptArtifactV1({
          promptArtifactId: "prompt-self-cycle",
          parentArtifactIds: ["prompt-self-cycle"],
          derivation: { operation: "edit", operationVersion: "1.0" },
        }),
      }),
      lineageRejected("PROMPT_DERIVATION_CYCLE"),
    );
    const afterInvalid = await store.getPromptModelLineageProjectionV1(
      "planning-project",
    );
    assert.equal(afterInvalid.events.length, beforeInvalid.events.length);
    assert.deepEqual(
      afterInvalid,
      await new ChangeControlStore(root).getPromptModelLineageProjectionV1(
        "planning-project",
      ),
    );
    assert.equal(afterInvalid.promptArtifacts.length, 2);
    assert.equal(
      afterInvalid.promptArtifacts[1].artifact.supersedesId,
      artifact.promptArtifactId,
    );
    const persisted = JSON.stringify(afterInvalid);
    for (const prohibited of [
      "renderedPrompt",
      "environmentValues",
      "hiddenReasoning",
      "rawProviderPayload",
      "sk-abcdefghijklmnop",
    ])
      assert.equal(persisted.includes(prohibited), false, prohibited);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AttemptConfigurationBindingV1 is mandatory, exact, immutable, child-scoped, and revocation-aware at dispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-attempt-binding-"));
  try {
    const { store, artifact, route } = await promptModelPlanningFixture(root);
    const dispatchIdentity = {
      projectId: "planning-project",
      changeId: "planning-change",
      waveId: "planning-wave",
      taskId: "task-one",
      runId: "run-one",
      attemptId: "attempt-one",
      plan: {
        planId: "plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
      authorizationId: "authorization-one",
      workspace: {
        workspaceAttemptId: "workspace-attempt-one",
        repositoryId: "planning-repository",
        baseSha: planningShaOne,
      },
    };
    await assert.rejects(
      store.assertAttemptConfigurationDispatchableV1(
        "planning-project",
        dispatchIdentity,
      ),
      lineageRejected("ATTEMPT_BINDING_MISSING"),
    );
    await assert.rejects(
      store.bindAttemptConfigurationV1(
        "planning-project",
        "planning-change",
        {
          publisherOccurrenceId: "occurrence-binding-unknown-prompt",
          binding: attemptBindingV1(artifact, route, {
            bindingId: "binding-unknown-prompt",
            attemptId: "attempt-unknown-prompt",
            promptArtifactIds: ["prompt-unknown"],
          }),
        },
      ),
      lineageRejected("PROMPT_ARTIFACT_UNKNOWN"),
    );
    await assert.rejects(
      store.bindAttemptConfigurationV1(
        "planning-project",
        "planning-change",
        {
          publisherOccurrenceId: "occurrence-binding-unknown-route",
          binding: attemptBindingV1(artifact, route, {
            bindingId: "binding-unknown-route",
            attemptId: "attempt-unknown-route",
            modelRouteId: "route-unknown",
          }),
        },
      ),
      lineageRejected("MODEL_ROUTE_UNKNOWN"),
    );
    await assert.rejects(
      store.bindAttemptConfigurationV1(
        "planning-project",
        "planning-change",
        {
          publisherOccurrenceId: "occurrence-binding-stale",
          binding: attemptBindingV1(artifact, route, {
            bindingId: "binding-stale",
            attemptId: "attempt-stale",
            authorizationId: "authorization-stale",
          }),
        },
      ),
      lineageRejected("ATTEMPT_BINDING_STALE"),
    );
    const bindingEvent = await store.bindAttemptConfigurationV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-binding-attempt-one",
        binding: attemptBindingV1(artifact, route),
      },
    );
    const binding = bindingEvent.payload.binding as AttemptConfigurationBindingV1;
    assert.equal(
      binding.publicationSequence,
      bindingEvent.sequence,
      "binding sequence is fixed by its atomic publication",
    );
    assert.equal(
      (
        await store.assertAttemptConfigurationDispatchableV1(
          "planning-project",
          dispatchIdentity,
        )
      ).bindingId,
      binding.bindingId,
    );
    await assert.rejects(
      store.assertAttemptConfigurationDispatchableV1("planning-project", {
        ...dispatchIdentity,
        workspace: {
          ...dispatchIdentity.workspace,
          workspaceAttemptId: "workspace-foreign",
        },
      }),
      lineageRejected("CROSS_ENTITY_IDENTITY_MISMATCH"),
    );
    await assert.rejects(
      store.bindAttemptConfigurationV1(
        "planning-project",
        "planning-change",
        {
          publisherOccurrenceId: "occurrence-binding-conflict",
          binding: {
            ...attemptBindingV1(artifact, route),
            bindingId: "binding-conflict",
          },
        },
      ),
      lineageRejected("ATTEMPT_BINDING_CONFLICT"),
    );

    const child = attemptBindingV1(artifact, route, {
      bindingId: "binding-review-one",
      bindingScope: "invocation",
      role: "reviewer",
      invocationId: "invocation-review-one",
      parentAttemptBindingId: binding.bindingId,
    });
    await store.bindAttemptConfigurationV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-binding-review-one",
        binding: child,
      },
    );
    assert.equal(
      (
        await store.assertInvocationConfigurationDispatchableV1(
          "planning-project",
          { ...dispatchIdentity, invocationId: "invocation-review-one" },
        )
      ).role,
      "reviewer",
    );
    await assert.rejects(
      store.assertInvocationConfigurationDispatchableV1(
        "planning-project",
        { ...dispatchIdentity, invocationId: "invocation-missing" },
      ),
      lineageRejected("INVOCATION_BINDING_MISSING"),
    );

    await store.revokePromptArtifactV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-revoke-prompt-root",
        revocation: {
          entityId: artifact.promptArtifactId,
          reasonCode: "PRIVACY_REVIEW_REQUIRED",
          reason: "The reusable artifact requires quarantine review.",
          evidenceRefs: ["incident:prompt-review"],
          revokedBy: "human:security-reviewer",
          revokedAt: "2026-08-01T10:04:00.000Z",
        },
      },
    );
    await assert.rejects(
      store.assertAttemptConfigurationDispatchableV1(
        "planning-project",
        dispatchIdentity,
      ),
      lineageRejected("PROMPT_ARTIFACT_REVOKED"),
    );
    const replayed = await new ChangeControlStore(root)
      .getPromptModelLineageProjectionV1("planning-project");
    assert.equal(replayed.bindings.length, 2);
    assert.equal(replayed.promptArtifacts[0].status, "revoked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ResolvedModelExecutionV1 preserves requested routes and rejects mismatch, unsupported capability, and unpermitted fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-model-resolution-"));
  try {
    const { store, artifact, route } = await promptModelPlanningFixture(root);
    const firstEvent = await store.bindAttemptConfigurationV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-resolution-binding-one",
        binding: attemptBindingV1(artifact, route),
      },
    );
    const firstBinding = firstEvent.payload.binding as AttemptConfigurationBindingV1;
    await store.recordResolvedModelExecutionV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-resolution-one",
        actor: "runtime-adapter:codex-cli-v1",
        resolution: resolvedExecutionV1(firstBinding),
      },
    );
    const projection = await store.getPromptModelLineageProjectionV1(
      "planning-project",
    );
    assert.equal(projection.modelRoutes[0].route.requestedModelClass, "terra");
    assert.equal(projection.resolvedExecutions[0].providerModelId, "gpt-5.6-terra");

    const mismatchEvent = await store.bindAttemptConfigurationV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-resolution-binding-two",
        binding: attemptBindingV1(artifact, route, {
          bindingId: "binding-attempt-two",
          attemptId: "attempt-two",
        }),
      },
    );
    const mismatchBinding = mismatchEvent.payload
      .binding as AttemptConfigurationBindingV1;
    await assert.rejects(
      store.recordResolvedModelExecutionV1(
        "planning-project",
        "planning-change",
        {
          publisherOccurrenceId: "occurrence-resolution-mismatch",
          actor: "runtime-adapter:codex-cli-v1",
          resolution: resolvedExecutionV1(mismatchBinding, {
            resolutionId: "resolution-mismatch",
            providerModelId: "gpt-5.6-sol",
            resolvedModelClass: "sol",
          }),
        },
      ),
      lineageRejected("MODEL_RESOLUTION_MISMATCH"),
    );
    await assert.rejects(
      store.recordResolvedModelExecutionV1(
        "planning-project",
        "planning-change",
        {
          publisherOccurrenceId: "occurrence-resolution-capability",
          actor: "runtime-adapter:codex-cli-v1",
          resolution: resolvedExecutionV1(mismatchBinding, {
            resolutionId: "resolution-capability",
            capabilityMapVersion: "unknown-capabilities-v9",
          }),
        },
      ),
      lineageRejected("MODEL_CAPABILITY_UNSUPPORTED"),
    );

    const fallbackRoute = modelRouteV1({
      modelRouteId: "route-luna-fallback-terra-v1",
      requestedModelClass: "luna",
      minimumModelClass: "luna",
      fallbackPolicy: {
        mode: "permitted",
        allowedResolvedModelClasses: ["terra"],
        allowedReasonCodes: ["LUNA_RUNTIME_UNAVAILABLE"],
      },
      routingRationaleCode: "DECLARED_LUNA_FALLBACK",
      publishedAt: "2026-08-01T10:05:00.000Z",
    });
    await store.publishModelRouteV1("planning-project", "planning-change", {
      publisherOccurrenceId: "occurrence-route-fallback",
      route: fallbackRoute,
    });
    const fallbackEvent = await store.bindAttemptConfigurationV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-fallback-binding",
        binding: attemptBindingV1(artifact, fallbackRoute, {
          bindingId: "binding-attempt-fallback",
          attemptId: "attempt-fallback",
          modelRouteId: fallbackRoute.modelRouteId,
        }),
      },
    );
    const fallbackBinding = fallbackEvent.payload
      .binding as AttemptConfigurationBindingV1;
    await assert.rejects(
      store.recordResolvedModelExecutionV1(
        "planning-project",
        "planning-change",
        {
          publisherOccurrenceId: "occurrence-fallback-denied",
          actor: "runtime-adapter:codex-cli-v1",
          resolution: resolvedExecutionV1(fallbackBinding, {
            resolutionId: "resolution-fallback-denied",
            fallback: {
              used: true,
              sourceModelClass: "luna",
              reasonCode: "UNDECLARED_REASON",
            },
          }),
        },
      ),
      lineageRejected("MODEL_FALLBACK_NOT_PERMITTED"),
    );
    const allowed = await store.recordResolvedModelExecutionV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-fallback-allowed",
        actor: "runtime-adapter:codex-cli-v1",
        resolution: resolvedExecutionV1(fallbackBinding, {
          resolutionId: "resolution-fallback-allowed",
          fallback: {
            used: true,
            sourceModelClass: "luna",
            reasonCode: "LUNA_RUNTIME_UNAVAILABLE",
          },
        }),
      },
    );
    assert.equal(
      (allowed.payload.resolution as ResolvedModelExecutionV1).fallback.used,
      true,
    );
    await store.revokeModelRouteV1(
      "planning-project",
      "planning-change",
      {
        publisherOccurrenceId: "occurrence-revoke-route-terra",
        revocation: {
          entityId: route.modelRouteId,
          reasonCode: "ROUTE_RETIRED",
          reason: "The exact requested route was retired.",
          evidenceRefs: ["decision:route-retirement"],
          revokedBy: "human:route-owner",
          revokedAt: "2026-08-01T10:06:00.000Z",
        },
      },
    );
    await assert.rejects(
      store.assertAttemptConfigurationDispatchableV1("planning-project", {
        projectId: firstBinding.projectId,
        changeId: firstBinding.changeId,
        waveId: firstBinding.waveId,
        taskId: firstBinding.taskId,
        runId: firstBinding.runId,
        attemptId: firstBinding.attemptId,
        plan: firstBinding.plan,
        authorizationId: firstBinding.authorizationId,
        workspace: firstBinding.workspace,
      }),
      lineageRejected("MODEL_ROUTE_REVOKED"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy Phase 1-4 ledgers and queues remain readable without implicit Phase 5 state", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-lineage-legacy-"));
  try {
    const store = new ChangeControlStore(root);
    await store.create("legacy-project", {
      changeId: "legacy-change",
      actor: "user:creator",
    });
    const projection = await new ChangeControlStore(root)
      .getPromptModelLineageProjectionV1("legacy-project");
    assert.deepEqual(projection.promptArtifacts, []);
    assert.deepEqual(projection.modelRoutes, []);
    assert.deepEqual(projection.bindings, []);
    assert.deepEqual(projection.resolvedExecutions, []);
    assert.equal(
      validateQueue({
        project: { name: "Legacy", path: process.cwd() },
        tasks: [
          { title: "Legacy one", prompt: "Do one bounded thing." },
          { title: "Legacy two", prompt: "Do another bounded thing." },
        ],
      }).tasks.every((task: { promptModel?: unknown }) => task.promptModel === undefined),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 2 dispatch persists every stable rejection reason and sendAnyway never bypasses planning state", async () => {
  type Scenario = {
    reason:
      | "PLAN_NOT_AUTHORIZED"
      | "CURRENT_BASE_UNREADABLE"
      | "CURRENT_WORKTREE_DIRTY"
      | "PLAN_BASE_MISMATCH"
      | "PLAN_STALE"
      | "ACCEPTANCE_ORACLE_UNEXECUTABLE"
      | "BLAST_RADIUS_UNEVIDENCED";
    contract?: PlanningContractV1;
    authorize?: boolean;
    snapshot?: () => Promise<TrustedRepositorySnapshotV1>;
    sendAnyway?: boolean;
  };
  const humanOracleContract = planningContract({
    taskPlans: planningContract().taskPlans.map((taskPlan, index) =>
      index === 0
        ? {
            ...taskPlan,
            acceptanceClaims: taskPlan.acceptanceClaims.map((claim) => ({
              ...claim,
              oracle: {
                kind: "human_observation" as const,
                instruction: "A human must inspect the result.",
              },
            })),
          }
        : taskPlan,
    ),
  });
  const unevidencedContract = planningContract({
    taskPlans: planningContract().taskPlans.map((taskPlan, index) =>
      index === 0
        ? {
            ...taskPlan,
            blastRadius: {
              ...taskPlan.blastRadius,
              assessmentEvidenceRefs: [" "],
            },
          }
        : taskPlan,
    ),
  });
  const scenarios: Scenario[] = [
    { reason: "PLAN_NOT_AUTHORIZED", authorize: false },
    {
      reason: "CURRENT_BASE_UNREADABLE",
      snapshot: async () => {
        throw new Error("profile missing");
      },
      sendAnyway: true,
    },
    {
      reason: "CURRENT_WORKTREE_DIRTY",
      snapshot: async () =>
        planningSnapshot({
          worktreeState: "dirty",
          changedPaths: ["spoofed/request/path.ts"],
        }),
    },
    {
      reason: "PLAN_BASE_MISMATCH",
      snapshot: async () =>
        planningSnapshot({
          repositoryId: "different-repository",
          sha: planningShaTwo,
        }),
    },
    {
      reason: "PLAN_STALE",
      contract: planningContract({
        replanTriggers: ["policy_changed"],
      }),
      snapshot: async () =>
        planningSnapshot({
          triggeredReplanTriggers: ["policy_changed"],
        }),
    },
    {
      reason: "PLAN_STALE",
      contract: planningContract({
        replanTriggers: ["base_sha_changed"],
      }),
      snapshot: async () =>
        planningSnapshot({
          triggeredReplanTriggers: ["unknown_drift"],
        }),
    },
    {
      reason: "ACCEPTANCE_ORACLE_UNEXECUTABLE",
      contract: humanOracleContract,
    },
    {
      reason: "BLAST_RADIUS_UNEVIDENCED",
      contract: unevidencedContract,
    },
  ];

  for (const scenario of scenarios) {
    const root = await mkdtemp(
      join(tmpdir(), `orchestrator-gate-${scenario.reason.toLowerCase()}-`),
    );
    try {
      const store = new ChangeControlStore(root, {
        resolveRepositorySnapshot:
          scenario.snapshot ?? (async () => planningSnapshot()),
      });
      await createPlanningWave(store);
      const contract = scenario.contract ?? planningContract();
      await store.publishPlanningContract(
        "planning-project",
        "planning-change",
        "planning-wave",
        { contract },
      );
      if (scenario.authorize !== false)
        await store.publishPlanAuthorization(
          "planning-project",
          "planning-change",
          "planning-wave",
          {
            authorization: planAuthorization({
              plan: {
                planId: contract.planId,
                revision: contract.revision,
                planBaseSha: contract.planBase.sha,
              },
            }),
          },
        );

      await assert.rejects(
        store.dispatchWave(
          "planning-project",
          "planning-change",
          "planning-wave",
          {
            actor: "user:dispatcher",
            ...(scenario.sendAnyway
              ? { sendAnyway: true, reason: "Dependency override only" }
              : {}),
          },
        ),
        (error: unknown) =>
          error instanceof ChangeControlError &&
          error.code === "NOT_READY" &&
          assert.deepEqual(error.reasons, [scenario.reason]) === undefined,
      );
      const projection = await store.getPlanningProjection(
        "planning-project",
        "planning-change",
        "planning-wave",
      );
      const receipt = projection.dispatchGateReceipts.at(-1)!;
      assert.equal(receipt.result, "rejected");
      assert.deepEqual(receipt.reasons, [scenario.reason]);
      assert.ok(Object.isFrozen(receipt));
      assert.notEqual(
        (await store.getWave(
          "planning-project",
          "planning-change",
          "planning-wave",
        )).wave.status,
        "dispatched",
      );
      if (
        scenario.reason === "CURRENT_WORKTREE_DIRTY" ||
        scenario.reason === "PLAN_BASE_MISMATCH" ||
        scenario.reason === "PLAN_STALE"
      )
        assert.equal(projection.plans[0].status, "stale");
      if (scenario.reason === "PLAN_STALE") {
        await assert.rejects(
          store.dispatchWave(
            "planning-project",
            "planning-change",
            "planning-wave",
            {
              actor: "user:dispatcher",
              sendAnyway: true,
              reason: "A stale plan cannot be overridden.",
            },
          ),
          (error: unknown) =>
            error instanceof ChangeControlError &&
            assert.deepEqual(error.reasons, ["PLAN_STALE"]) === undefined,
        );
        assert.equal(
          (
            await store.getPlanningProjection(
              "planning-project",
              "planning-change",
              "planning-wave",
            )
          ).dispatchGateReceipts.length,
          2,
        );
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("Phase 2 dispatch rejects a task plan with only warning acceptance claims", async () => {
  const root = await mkdtemp(
    join(tmpdir(), "orchestrator-gate-warning-only-oracles-"),
  );
  try {
    const store = new ChangeControlStore(root, {
      resolveRepositorySnapshot: async () => planningSnapshot(),
    });
    await createPlanningWave(store);
    const contract = planningContract({
      taskPlans: planningContract().taskPlans.map((taskPlan, index) =>
        index === 0
          ? {
              ...taskPlan,
              acceptanceClaims: taskPlan.acceptanceClaims.map((claim) => ({
                ...claim,
                failureSeverity: "warning" as const,
              })),
            }
          : taskPlan,
      ),
    });
    await store.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract },
    );
    await store.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "planning-wave",
      {
        authorization: planAuthorization({
          plan: {
            planId: contract.planId,
            revision: contract.revision,
            planBaseSha: contract.planBase.sha,
          },
        }),
      },
    );

    await assert.rejects(
      store.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "user:dispatcher" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "NOT_READY" &&
        assert.deepEqual(error.reasons, [
          "ACCEPTANCE_ORACLE_UNEXECUTABLE",
        ]) === undefined,
    );
    const projection = await store.getPlanningProjection(
      "planning-project",
      "planning-change",
      "planning-wave",
    );
    assert.equal(projection.dispatchGateReceipts.length, 1);
    assert.equal(projection.dispatchGateReceipts[0].result, "rejected");
    assert.deepEqual(projection.dispatchGateReceipts[0].reasons, [
      "ACCEPTANCE_ORACLE_UNEXECUTABLE",
    ]);
    assert.ok(Object.isFrozen(projection.dispatchGateReceipts[0]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 2 gate records PLAN_REQUIRED, REPLAN_RECEIPT_REQUIRED, and WAVE_NOT_READY while Phase 1 remains compatible", async () => {
  const roots: string[] = [];
  try {
    const requiredRoot = await mkdtemp(
      join(tmpdir(), "orchestrator-gate-required-"),
    );
    roots.push(requiredRoot);
    const requiredStore = new ChangeControlStore(requiredRoot, {
      resolveRepositorySnapshot: async () => planningSnapshot(),
    });
    await createPlanningWave(requiredStore);
    await requiredStore.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: planningContract() },
    );
    await requiredStore.createWave("planning-project", "planning-change", {
      waveId: "missing-plan-wave",
      actor: "user:creator",
      tasks: [{ taskId: "missing-plan-task" }],
    });
    await assert.rejects(
      requiredStore.dispatchWave(
        "planning-project",
        "planning-change",
        "missing-plan-wave",
        { actor: "user:dispatcher" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        assert.deepEqual(error.reasons, ["PLAN_REQUIRED"]) === undefined,
    );
    assert.deepEqual(
      (
        await requiredStore.getPlanningProjection(
          "planning-project",
          "planning-change",
          "missing-plan-wave",
        )
      ).dispatchGateReceipts.at(-1)?.reasons,
      ["PLAN_REQUIRED"],
    );

    const replanRoot = await mkdtemp(
      join(tmpdir(), "orchestrator-gate-replan-"),
    );
    roots.push(replanRoot);
    const replanStore = new ChangeControlStore(replanRoot, {
      resolveRepositorySnapshot: async () =>
        planningSnapshot({ sha: planningShaTwo }),
    });
    await authorizePlanningWave(replanStore);
    await assert.rejects(
      replanStore.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "user:drift-observer" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        assert.deepEqual(error.reasons, ["PLAN_BASE_MISMATCH"]) === undefined,
    );
    const replacement = planningContract({
      planId: "plan-two",
      revision: 2,
      predecessor: {
        planId: "plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
      planBase: {
        ...planningContract().planBase,
        sha: planningShaTwo,
      },
      createdAt: "2026-07-30T09:04:00.000Z",
    });
    await replanStore.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: replacement },
    );
    await assert.rejects(
      replanStore.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "user:dispatcher" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        assert.deepEqual(error.reasons, [
          "PLAN_NOT_AUTHORIZED",
          "REPLAN_RECEIPT_REQUIRED",
        ]) === undefined,
    );
    await assert.rejects(
      replanStore.publishArchitectReplanReceipt(
        "planning-project",
        "planning-change",
        "planning-wave",
        {
          receipt: {
            contractType: "ArchitectReplanReceiptV1",
            contractVersion: "1.0",
            receiptId: "replan-without-drift",
            projectId: "planning-project",
            changeId: "planning-change",
            waveId: "planning-wave",
            driftAssessmentId: "missing-drift",
            priorPlan: {
              planId: "plan-one",
              revision: 1,
              planBaseSha: planningShaOne,
            },
            replacementPlan: {
              planId: "plan-two",
              revision: 2,
              planBaseSha: planningShaTwo,
            },
            changes: [
              {
                area: "base",
                summary: "Changed base without a persisted stale assessment.",
                rationale: "Exercises publication-time lineage validation.",
                evidenceRefs: ["test:missing-drift"],
              },
            ],
            proposedAt: new Date().toISOString(),
            proposedBy: "architect:primary",
            authorizationState: "pending",
          },
        },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "NOT_FOUND" &&
        /missing drift assessment/.test(error.message),
    );

    const readinessRoot = await mkdtemp(
      join(tmpdir(), "orchestrator-gate-readiness-"),
    );
    roots.push(readinessRoot);
    const readinessStore = new ChangeControlStore(readinessRoot, {
      resolveRepositorySnapshot: async () => planningSnapshot(),
    });
    await readinessStore.create("planning-project", {
      changeId: "planning-change",
      actor: "user:creator",
    });
    await readinessStore.createWave("planning-project", "planning-change", {
      waveId: "blocker-wave",
      actor: "user:creator",
      tasks: [{ taskId: "blocker-task" }],
    });
    await readinessStore.createWave("planning-project", "planning-change", {
      waveId: "planning-wave",
      actor: "user:creator",
      dependsOn: ["blocker-wave"],
      tasks: [{ taskId: "task-one" }, { taskId: "task-two" }],
    });
    await readinessStore.publishPlanningContract(
      "planning-project",
      "planning-change",
      "planning-wave",
      { contract: planningContract() },
    );
    await readinessStore.publishPlanAuthorization(
      "planning-project",
      "planning-change",
      "planning-wave",
      { authorization: planAuthorization() },
    );
    await assert.rejects(
      readinessStore.dispatchWave(
        "planning-project",
        "planning-change",
        "planning-wave",
        { actor: "user:dispatcher" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        assert.deepEqual(error.reasons, ["WAVE_NOT_READY"]) === undefined,
    );
    const overridden = await readinessStore.dispatchWave(
      "planning-project",
      "planning-change",
      "planning-wave",
      {
        actor: "user:lead",
        sendAnyway: true,
        reason: "Only Phase 1 dependencies are overridden.",
      },
    );
    assert.equal(overridden.wave.status, "dispatched");
    assert.equal(overridden.events.at(-1)?.type, "wave.dispatch-overridden");

    const legacyRoot = await mkdtemp(
      join(tmpdir(), "orchestrator-phase1-compatibility-"),
    );
    roots.push(legacyRoot);
    const legacyStore = new ChangeControlStore(legacyRoot, {
      resolveRepositorySnapshot: async () => {
        throw new Error("Phase 1 must not resolve a planning snapshot.");
      },
    });
    await legacyStore.create("legacy-project", {
      changeId: "legacy-change",
      actor: "user:creator",
    });
    await legacyStore.createWave("legacy-project", "legacy-change", {
      waveId: "legacy-wave",
      actor: "user:creator",
      tasks: [{ taskId: "legacy-task" }],
    });
    const legacyDispatch = await legacyStore.dispatchWave(
      "legacy-project",
      "legacy-change",
      "legacy-wave",
      { actor: "user:dispatcher" },
    );
    assert.equal(legacyDispatch.wave.status, "dispatched");
    assert.deepEqual(
      legacyDispatch.events.filter((event) =>
        event.type.startsWith("plan."),
      ),
      [],
    );
  } finally {
    await Promise.all(
      roots.map((root) => rm(root, { recursive: true, force: true })),
    );
  }
});

test("change-control create, list, get, and transition APIs fail closed", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("listening", resolveListen);
    server.once("error", rejectListen);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}/api/change-control/projects/api-project/changes`;
    const createResponse = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        changeId: "api-change",
        actor: "user:creator",
        correlationId: "request:one",
        payload: { title: "API change" },
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = await createResponse.json() as {
      change: { status: string };
      events: Array<{ type: string; correlationId: string }>;
    };
    assert.equal(created.change.status, "draft");
    assert.equal(created.events[0].type, "change.created");
    assert.equal(created.events[0].correlationId, "request:one");

    const illegalResponse = await fetch(`${base}/api-change/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "active", actor: "user:operator" }),
    });
    assert.equal(illegalResponse.status, 409);
    assert.equal(
      (await illegalResponse.json() as { code: string }).code,
      "CONFLICT",
    );

    for (const to of ["planned", "active", "completed"]) {
      const response = await fetch(`${base}/api-change/transitions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, actor: "user:operator" }),
      });
      assert.equal(response.status, 200);
    }

    const listResponse = await fetch(base);
    assert.equal(listResponse.status, 200);
    const listed = await listResponse.json() as Array<{
      changeId: string;
      status: string;
    }>;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].changeId, "api-change");
    assert.equal(listed[0].status, "completed");

    const getResponse = await fetch(`${base}/api-change`);
    assert.equal(getResponse.status, 200);
    const fetched = await getResponse.json() as {
      change: { status: string };
      events: Array<{ sequence: number }>;
    };
    assert.equal(fetched.change.status, "completed");
    assert.deepEqual(fetched.events.map((event) => event.sequence), [1, 2, 3, 4]);

    const terminalResponse = await fetch(`${base}/api-change/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "cancelled", actor: "user:operator" }),
    });
    assert.equal(terminalResponse.status, 409);

    const unknownResponse = await fetch(`${base}/api-change/transitions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "reopened", actor: "user:operator" }),
    });
    assert.equal(unknownResponse.status, 400);
    assert.equal(
      (await unknownResponse.json() as { code: string }).code,
      "INVALID_INPUT",
    );

    const gatedBase = `http://127.0.0.1:${address.port}/api/change-control/projects/api-wave-project`;
    assert.equal(
      (
        await fetch(`${gatedBase}/changes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            changeId: "api-wave-change",
            actor: "user:planner",
          }),
        })
      ).status,
      201,
    );
    for (const body of [
      {
        waveId: "api-blocker",
        actor: "user:planner",
        tasks: [{ taskId: "api-blocker-task" }],
      },
      {
        waveId: "api-waiting",
        actor: "user:planner",
        dependsOn: ["api-blocker"],
        tasks: [{ taskId: "api-waiting-task" }],
      },
    ]) {
      const response = await fetch(
        `${gatedBase}/changes/api-wave-change/waves`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      assert.equal(response.status, 201);
    }
    const gatedDispatch = await fetch(
      `${gatedBase}/changes/api-wave-change/waves/api-waiting/dispatch`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "user:dispatcher" }),
      },
    );
    assert.equal(gatedDispatch.status, 409);
    assert.deepEqual(await gatedDispatch.json(), {
      error: "Wave api-waiting is not ready for dispatch.",
      code: "NOT_READY",
      reasons: [
        { code: "WAVE_STATUS_NOT_READY", status: "draft" },
        {
          code: "WAVE_DEPENDENCY_NOT_COMPLETED",
          dependencyWaveId: "api-blocker",
          status: "ready",
        },
      ],
    });
    const overrideResponse = await fetch(
      `${gatedBase}/changes/api-wave-change/waves/api-waiting/dispatch`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actor: "user:lead",
          sendAnyway: true,
          reason: "Approved API override",
        }),
      },
    );
    assert.equal(overrideResponse.status, 200);
    const overridden = await overrideResponse.json() as {
      wave: { status: string };
      events: Array<{ type: string; actor: string }>;
    };
    assert.equal(overridden.wave.status, "dispatched");
    assert.equal(overridden.events.at(-1)?.type, "wave.dispatch-overridden");
    assert.equal(overridden.events.at(-1)?.actor, "user:lead");
    const bucketResponse = await fetch(
      `${gatedBase}/execution-bucket`,
    );
    assert.equal(bucketResponse.status, 200);
    assert.deepEqual(
      (await bucketResponse.json() as Array<{ waveId: string }>).map(
        (item) => item.waveId,
      ),
      ["api-blocker"],
    );
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

test("planning HTTP APIs publish exact identities and reject unproven replan lineage", async () => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("listening", resolveListen);
    server.once("error", rejectListen);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const projectId = "api-planning-project";
    const changeId = "api-planning-change";
    const waveId = "api-planning-wave";
    const changeBase = `http://127.0.0.1:${address.port}/api/change-control/projects/${projectId}/changes`;
    assert.equal(
      (
        await fetch(changeBase, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            changeId,
            actor: "user:api-planning",
          }),
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await fetch(`${changeBase}/${changeId}/waves`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            waveId,
            actor: "user:api-planning",
            tasks: [{ taskId: "task-one" }, { taskId: "task-two" }],
          }),
        })
      ).status,
      201,
    );
    const planningBase = `${changeBase}/${changeId}/waves/${waveId}/planning`;
    const apiContract = planningContract({
      planId: "api-plan-one",
      projectId,
      changeId,
      waveId,
    });
    const proposedResponse = await fetch(`${planningBase}/contracts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contract: apiContract }),
    });
    assert.equal(proposedResponse.status, 201);
    const proposed = await proposedResponse.json() as {
      plans: Array<{ status: string }>;
      events: Array<{ type: string }>;
    };
    assert.equal(proposed.plans[0].status, "proposed");
    assert.equal(proposed.events.at(-1)?.type, "plan.proposed");

    const authorizationResponse = await fetch(
      `${planningBase}/authorizations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authorization: planAuthorization({
            authorizationId: "api-authorization-one",
            projectId,
            changeId,
            waveId,
            plan: {
              planId: "api-plan-one",
              revision: 1,
              planBaseSha: planningShaOne,
            },
          }),
        }),
      },
    );
    assert.equal(authorizationResponse.status, 201);

    const replacement = planningContract({
      planId: "api-plan-two",
      revision: 2,
      projectId,
      changeId,
      waveId,
      predecessor: {
        planId: "api-plan-one",
        revision: 1,
        planBaseSha: planningShaOne,
      },
      planBase: {
        ...apiContract.planBase,
        sha: planningShaTwo,
      },
      createdAt: "2026-07-30T09:03:00.000Z",
    });
    assert.equal(
      (
        await fetch(`${planningBase}/contracts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contract: replacement }),
        })
      ).status,
      409,
    );
    const receiptResponse = await fetch(
      `${planningBase}/architect-replan-receipts`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          receipt: {
            contractType: "ArchitectReplanReceiptV1",
            contractVersion: "1.0",
            receiptId: "api-receipt-one",
            projectId,
            changeId,
            waveId,
            driftAssessmentId: "api-drift-one",
            priorPlan: {
              planId: "api-plan-one",
              revision: 1,
              planBaseSha: planningShaOne,
            },
            replacementPlan: {
              planId: "api-plan-two",
              revision: 2,
              planBaseSha: planningShaTwo,
            },
            changes: [
              {
                area: "base",
                summary: "Proposed the API replacement base.",
                rationale: "The API contract must preserve lineage.",
                evidenceRefs: ["api:drift-one"],
              },
            ],
            proposedAt: new Date().toISOString(),
            proposedBy: "architect:api",
            authorizationState: "pending",
          },
        }),
      },
    );
    assert.equal(receiptResponse.status, 404);
    assert.equal(
      (await receiptResponse.json() as { code: string }).code,
      "NOT_FOUND",
    );

    const readResponse = await fetch(planningBase);
    assert.equal(readResponse.status, 200);
    const projection = await readResponse.json() as {
      plans: Array<{ contract: { revision: number }; status: string }>;
      authorizations: unknown[];
      replanReceipts: unknown[];
    };
    assert.deepEqual(
      projection.plans.map((plan) => [plan.contract.revision, plan.status]),
      [[1, "authorized"]],
    );
    assert.equal(projection.authorizations.length, 1);
    assert.equal(projection.replanReceipts.length, 0);

    const mismatchedResponse = await fetch(
      `${planningBase}/authorizations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          authorization: planAuthorization({
            authorizationId: "api-wrong-base",
            projectId,
            changeId,
            waveId,
            plan: {
              planId: "api-plan-two",
              revision: 2,
              planBaseSha: planningShaOne,
            },
          }),
        }),
      },
    );
    assert.equal(mismatchedResponse.status, 404);
    assert.equal(
      (await mismatchedResponse.json() as { code: string }).code,
      "NOT_FOUND",
    );
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

test("HTTP dispatch trusts only the persisted Project Profile path and rejects dirty, drifted, or missing profile state", async () => {
  const repository = await mkdtemp(
    join(tmpdir(), "orchestrator-http-profile-repository-"),
  );
  const spoofedRepository = await mkdtemp(
    join(tmpdir(), "orchestrator-http-spoofed-repository-"),
  );
  git(repository, "init", "-b", "main");
  git(repository, "config", "user.email", "orchestrator@example.test");
  git(repository, "config", "user.name", "Orchestrator Test");
  await writeFile(join(repository, "tracked.txt"), "trusted\n", "utf8");
  git(repository, "add", "tracked.txt");
  git(repository, "commit", "-m", "trusted base");
  git(spoofedRepository, "init", "-b", "main");
  git(
    spoofedRepository,
    "config",
    "user.email",
    "orchestrator@example.test",
  );
  git(spoofedRepository, "config", "user.name", "Orchestrator Test");
  await writeFile(join(spoofedRepository, "spoofed.txt"), "spoofed\n", "utf8");
  git(spoofedRepository, "add", "spoofed.txt");
  git(spoofedRepository, "commit", "-m", "spoofed base");
  const trustedRepositoryId = repositoryIdentityForGitRoot(
    git(repository, "rev-parse", "--show-toplevel"),
  );

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("listening", resolveListen);
    server.once("error", rejectListen);
  });
  let profileId: string | undefined;
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const origin = `http://127.0.0.1:${address.port}`;
    const profileResponse = await fetch(`${origin}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Trusted dispatch profile",
        path: repository,
      }),
    });
    assert.equal(profileResponse.status, 201);
    profileId = (
      (await profileResponse.json()) as { id: string }
    ).id;
    const changeId = "http-drift-change";
    const changesBase = `${origin}/api/change-control/projects/${profileId}/changes`;
    assert.equal(
      (
        await fetch(changesBase, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            changeId,
            actor: "user:http-planner",
          }),
        })
      ).status,
      201,
    );

    const publishWave = async (
      waveId: string,
      planId: string,
      sha: string,
    ) => {
      assert.equal(
        (
          await fetch(`${changesBase}/${changeId}/waves`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              waveId,
              actor: "user:http-planner",
              tasks: [{ taskId: "task-one" }, { taskId: "task-two" }],
            }),
          })
        ).status,
        201,
      );
      const planningBase = `${changesBase}/${changeId}/waves/${waveId}/planning`;
      const contract = planningContract({
        planId,
        projectId: profileId!,
        changeId,
        waveId,
        planBase: {
          ...planningContract().planBase,
          repositoryId: trustedRepositoryId,
          sha,
          ref: "refs/heads/main",
        },
      });
      assert.equal(
        (
          await fetch(`${planningBase}/contracts`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ contract }),
          })
        ).status,
        201,
      );
      assert.equal(
        (
          await fetch(`${planningBase}/authorizations`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              authorization: planAuthorization({
                authorizationId: `authorization-${planId}`,
                projectId: profileId!,
                changeId,
                waveId,
                plan: {
                  planId,
                  revision: 1,
                  planBaseSha: sha,
                },
              }),
            }),
          })
        ).status,
        201,
      );
      return {
        dispatch: `${changesBase}/${changeId}/waves/${waveId}/dispatch`,
        planning: planningBase,
      };
    };

    const trustedHead = git(repository, "rev-parse", "HEAD");
    const allowed = await publishWave(
      "trusted-wave",
      "trusted-plan",
      trustedHead,
    );
    const allowedResponse = await fetch(allowed.dispatch, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: "user:http-dispatcher",
        path: spoofedRepository,
        projectPath: spoofedRepository,
        payload: {
          repositoryPath: spoofedRepository,
          targetPath: spoofedRepository,
        },
      }),
    });
    const allowedBody = await allowedResponse.json();
    const rejectedProjection =
      allowedResponse.status === 200
        ? undefined
        : await (await fetch(allowed.planning)).json();
    assert.equal(
      allowedResponse.status,
      200,
      JSON.stringify({ allowedBody, rejectedProjection }),
    );
    const allowedProjection = (await (
      await fetch(allowed.planning)
    ).json()) as {
      driftAssessments: Array<{
        observedBase: { repositoryId: string; sha: string };
      }>;
      dispatchGateReceipts: Array<{ result: string }>;
    };
    assert.equal(
      allowedProjection.driftAssessments[0].observedBase.repositoryId,
      trustedRepositoryId,
    );
    assert.equal(
      allowedProjection.driftAssessments[0].observedBase.sha,
      trustedHead,
    );
    assert.equal(
      allowedProjection.dispatchGateReceipts[0].result,
      "allowed",
    );

    await writeFile(join(repository, "dirty.txt"), "dirty\n", "utf8");
    const dirty = await publishWave("dirty-wave", "dirty-plan", trustedHead);
    const dirtyResponse = await fetch(dirty.dispatch, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        actor: "user:http-dispatcher",
        sendAnyway: true,
        reason: "Cannot override planning state.",
        path: spoofedRepository,
      }),
    });
    assert.equal(dirtyResponse.status, 409);
    assert.deepEqual(
      (await dirtyResponse.json() as { reasons: string[] }).reasons,
      ["CURRENT_WORKTREE_DIRTY"],
    );

    git(repository, "add", "dirty.txt");
    git(repository, "commit", "-m", "move trusted head");
    const drifted = await publishWave(
      "drifted-wave",
      "drifted-plan",
      trustedHead,
    );
    const driftedResponse = await fetch(drifted.dispatch, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actor: "user:http-dispatcher" }),
    });
    assert.equal(driftedResponse.status, 409);
    assert.deepEqual(
      (await driftedResponse.json() as { reasons: string[] }).reasons,
      ["PLAN_BASE_MISMATCH"],
    );

    const missingProjectId = "missing-profile-project";
    const missingChangeId = "missing-profile-change";
    const missingWaveId = "missing-profile-wave";
    const missingChanges = `${origin}/api/change-control/projects/${missingProjectId}/changes`;
    assert.equal(
      (
        await fetch(missingChanges, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            changeId: missingChangeId,
            actor: "user:http-planner",
          }),
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await fetch(`${missingChanges}/${missingChangeId}/waves`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            waveId: missingWaveId,
            actor: "user:http-planner",
            tasks: [{ taskId: "task-one" }, { taskId: "task-two" }],
          }),
        })
      ).status,
      201,
    );
    const missingPlanning = `${missingChanges}/${missingChangeId}/waves/${missingWaveId}/planning`;
    const missingContract = planningContract({
      projectId: missingProjectId,
      changeId: missingChangeId,
      waveId: missingWaveId,
      planBase: {
        ...planningContract().planBase,
        sha: trustedHead,
      },
    });
    assert.equal(
      (
        await fetch(`${missingPlanning}/contracts`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contract: missingContract }),
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await fetch(`${missingPlanning}/authorizations`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            authorization: planAuthorization({
              authorizationId: "missing-profile-authorization",
              projectId: missingProjectId,
              changeId: missingChangeId,
              waveId: missingWaveId,
              plan: {
                planId: missingContract.planId,
                revision: 1,
                planBaseSha: trustedHead,
              },
            }),
          }),
        })
      ).status,
      201,
    );
    const missingResponse = await fetch(
      `${missingChanges}/${missingChangeId}/waves/${missingWaveId}/dispatch`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actor: "user:http-dispatcher" }),
      },
    );
    assert.equal(missingResponse.status, 409);
    assert.deepEqual(
      (await missingResponse.json() as { reasons: string[] }).reasons,
      ["CURRENT_BASE_UNREADABLE"],
    );
    assert.equal(
      (
        (await (await fetch(missingPlanning)).json()) as {
          dispatchGateReceipts: unknown[];
        }
      ).dispatchGateReceipts.length,
      1,
    );
  } finally {
    if (profileId) {
      const address = server.address();
      if (address && typeof address === "object")
        await fetch(
          `http://127.0.0.1:${address.port}/api/projects/${profileId}`,
          { method: "DELETE" },
        ).catch(() => undefined);
    }
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await Promise.all([
      rm(repository, { recursive: true, force: true }),
      rm(spoofedRepository, { recursive: true, force: true }),
    ]);
  }
});

test("change-control rejects missing and cyclic task dependencies without publishing events", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-change-control-"));
  try {
    const store = new ChangeControlStore(root);
    await store.create("graph-project", {
      changeId: "graph-change",
      actor: "user:planner",
    });

    await assert.rejects(
      store.createWave("graph-project", "graph-change", {
        waveId: "missing-wave-dependency",
        actor: "user:planner",
        dependsOn: ["not-present-wave"],
        tasks: [{ taskId: "valid-task" }],
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /missing dependency not-present-wave/.test(error.message),
    );
    await assert.rejects(
      store.createWave("graph-project", "graph-change", {
        waveId: "missing-wave",
        actor: "user:planner",
        tasks: [
          {
            taskId: "missing-task",
            dependsOn: ["not-present"],
          },
        ],
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /missing dependency not-present/.test(error.message),
    );
    await assert.rejects(
      store.createWave("graph-project", "graph-change", {
        waveId: "cycle-wave",
        actor: "user:planner",
        tasks: [
          { taskId: "cycle-a", dependsOn: ["cycle-b"] },
          { taskId: "cycle-b", dependsOn: ["cycle-a"] },
        ],
      }),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT" &&
        /dependency cycle/.test(error.message),
    );

    assert.deepEqual(await store.listWaves("graph-project", "graph-change"), []);
    const change = await store.get("graph-project", "graph-change");
    assert.deepEqual(change.events.map((event) => event.type), ["change.created"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("wave and task readiness is deterministic and the execution bucket is derived", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-change-control-"));
  try {
    const store = new ChangeControlStore(root);
    await store.create("readiness-project", {
      changeId: "readiness-change",
      actor: "user:planner",
    });
    const first = await store.createWave(
      "readiness-project",
      "readiness-change",
      {
        waveId: "wave-one",
        actor: "user:planner",
        tasks: [
          { taskId: "task-root", payload: { title: "Root" } },
          {
            taskId: "task-dependent",
            dependsOn: ["task-root"],
            payload: { title: "Dependent" },
          },
        ],
      },
    );
    assert.equal(first.wave.status, "ready");
    assert.deepEqual(
      first.wave.tasks.map((task) => [task.taskId, task.status]),
      [
        ["task-root", "ready"],
        ["task-dependent", "pending"],
      ],
    );
    assert.deepEqual(
      (await store.executionBucket("readiness-project")).map((item) => [
        item.changeId,
        item.waveId,
      ]),
      [["readiness-change", "wave-one"]],
    );

    await store.createWave("readiness-project", "readiness-change", {
      waveId: "wave-two",
      actor: "user:planner",
      dependsOn: ["wave-one"],
      tasks: [{ taskId: "task-two" }],
    });
    const waiting = await store.getWave(
      "readiness-project",
      "readiness-change",
      "wave-two",
    );
    assert.equal(waiting.wave.status, "draft");
    assert.deepEqual(waiting.wave.readiness.reasons, [
      {
        code: "WAVE_DEPENDENCY_NOT_COMPLETED",
        dependencyWaveId: "wave-one",
        status: "ready",
      },
    ]);

    await store.dispatchWave(
      "readiness-project",
      "readiness-change",
      "wave-one",
      { actor: "user:dispatcher" },
    );
    await store.transitionWave(
      "readiness-project",
      "readiness-change",
      "wave-one",
      { actor: "user:operator", to: "running" },
    );
    await store.transitionTask(
      "readiness-project",
      "readiness-change",
      "wave-one",
      "task-root",
      { actor: "user:operator", to: "running" },
    );
    const rootAccepted = await store.transitionTask(
      "readiness-project",
      "readiness-change",
      "wave-one",
      "task-root",
      { actor: "user:reviewer", to: "accepted" },
    );
    assert.deepEqual(
      rootAccepted.wave.tasks.map((task) => [task.taskId, task.status]),
      [
        ["task-root", "accepted"],
        ["task-dependent", "ready"],
      ],
    );
    await store.transitionTask(
      "readiness-project",
      "readiness-change",
      "wave-one",
      "task-dependent",
      { actor: "user:operator", to: "running" },
    );
    await store.transitionTask(
      "readiness-project",
      "readiness-change",
      "wave-one",
      "task-dependent",
      { actor: "user:reviewer", to: "accepted" },
    );
    await store.transitionWave(
      "readiness-project",
      "readiness-change",
      "wave-one",
      { actor: "user:operator", to: "completed" },
    );

    const unblocked = await store.getWave(
      "readiness-project",
      "readiness-change",
      "wave-two",
    );
    assert.equal(unblocked.wave.status, "ready");
    assert.deepEqual(unblocked.wave.readiness.reasons, []);
    assert.deepEqual(
      (await store.executionBucket("readiness-project")).map((item) => item.waveId),
      ["wave-two"],
    );

    const reloaded = new ChangeControlStore(root);
    assert.deepEqual(
      await reloaded.executionBucket("readiness-project"),
      await store.executionBucket("readiness-project"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dispatch rejects non-ready waves with reasons and audits send-anyway", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-change-control-"));
  try {
    const store = new ChangeControlStore(root);
    await store.create("dispatch-project", {
      changeId: "dispatch-change",
      actor: "user:planner",
    });
    await store.createWave("dispatch-project", "dispatch-change", {
      waveId: "blocker-wave",
      actor: "user:planner",
      tasks: [{ taskId: "blocker-task" }],
    });
    await store.createWave("dispatch-project", "dispatch-change", {
      waveId: "waiting-wave",
      actor: "user:planner",
      dependsOn: ["blocker-wave"],
      tasks: [{ taskId: "waiting-task" }],
    });

    const expectedReasons = [
      { code: "WAVE_STATUS_NOT_READY", status: "draft" },
      {
        code: "WAVE_DEPENDENCY_NOT_COMPLETED",
        dependencyWaveId: "blocker-wave",
        status: "ready",
      },
    ];
    await assert.rejects(
      store.dispatchWave(
        "dispatch-project",
        "dispatch-change",
        "waiting-wave",
        { actor: "user:dispatcher" },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "NOT_READY" &&
        error.status === 409 &&
        assert.deepEqual(error.reasons, expectedReasons) === undefined,
    );
    await assert.rejects(
      store.dispatchWave(
        "dispatch-project",
        "dispatch-change",
        "waiting-wave",
        { actor: "user:dispatcher", sendAnyway: true, reason: " " },
      ),
      (error: unknown) =>
        error instanceof ChangeControlError &&
        error.code === "INVALID_INPUT",
    );
    const eventsBeforeInvalidOverrides = (
      await store.getWave(
        "dispatch-project",
        "dispatch-change",
        "waiting-wave",
      )
    ).events.length;
    for (const input of [
      {
        sendAnyway: true,
        reason: "Actor is required",
      },
      {
        actor: "user:dispatcher",
        sendAnyway: true,
      },
    ]) {
      await assert.rejects(
        store.dispatchWave(
          "dispatch-project",
          "dispatch-change",
          "waiting-wave",
          input as Parameters<typeof store.dispatchWave>[3],
        ),
        (error: unknown) =>
          error instanceof ChangeControlError &&
          error.code === "INVALID_INPUT",
      );
    }
    assert.equal(
      (
        await store.getWave(
          "dispatch-project",
          "dispatch-change",
          "waiting-wave",
        )
      ).events.length,
      eventsBeforeInvalidOverrides,
    );

    const overridden = await store.dispatchWave(
      "dispatch-project",
      "dispatch-change",
      "waiting-wave",
      {
        actor: "user:lead",
        sendAnyway: true,
        reason: "Approved urgent dependency bypass",
      },
    );
    assert.equal(overridden.wave.status, "dispatched");
    const overrideEvent = overridden.events.at(-1)!;
    assert.equal(overrideEvent.type, "wave.dispatch-overridden");
    assert.equal(overrideEvent.actor, "user:lead");
    assert.deepEqual(overrideEvent.payload, {
      from: "draft",
      to: "dispatched",
      reason: "Approved urgent dependency bypass",
      reasons: expectedReasons,
      data: {},
    });
    assert.ok(Object.isFrozen(overrideEvent));
    assert.ok(Object.isFrozen(overrideEvent.payload));
    assert.deepEqual(
      (await store.executionBucket("dispatch-project")).map((item) => item.waveId),
      ["blocker-wave"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maps the UI light effort to the Codex CLI low effort", () => {
  assert.equal(codexReasoningEffort("light"), "low");
  assert.equal(codexReasoningEffort("medium"), "medium");
  assert.equal(codexReasoningEffort("high"), "high");
});

test("Codex skill-budget diagnostics remain warnings while real errors remain errors", () => {
  const skillBudget = JSON.stringify({
    type: "item.completed",
    item: {
      type: "error",
      message:
        "Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill.",
    },
  });
  const actualFailure = JSON.stringify({
    type: "item.completed",
    item: {
      type: "error",
      message: "Provider connection failed.",
    },
  });

  assert.equal(
    taskEvent(skillBudget),
    "WARNING: Codex: Skill descriptions were shortened to fit the 2% skills context budget. Codex can still see every skill.",
  );
  assert.equal(taskEvent(actualFailure), "ERROR: Codex: Provider connection failed.");
});

test("buildPrompt and the benchmark use the same production-owned legacy renderer", () => {
  assert.equal(
    buildPrompt(
      productionBuildPromptFixture.task as any,
      productionBuildPromptFixture.project as any,
    ),
    renderProductionLegacyPromptV1(productionBuildPromptFixture),
  );
});

const providerRuntimeIdentity = {
  goal: "goal-fingerprint",
  scope: "scope-fingerprint",
  branch: "main",
  priority: "priority-fingerprint",
  authorization: "authorization-fingerprint",
};

test("provider runtime reasoning is disabled by default with safe current-turn fallbacks", () => {
  assert.equal(providerReasoningModeV1({}), "off");
  assert.equal(
    providerReasoningModeV1({
      ORCHESTRATOR_PROVIDER_REASONING_MODE: "current_turn",
    }),
    "current_turn",
  );
  assert.equal(
    providerReasoningModeV1({
      ORCHESTRATOR_PROVIDER_REASONING_MODE: "persisted",
    }),
    "persisted",
  );
  assert.throws(
    () =>
      providerReasoningModeV1({
        ORCHESTRATOR_PROVIDER_REASONING_MODE: "always",
      }),
    /must be off, current_turn, or persisted/,
  );
  const state = recordProviderRuntimeStateV1({
    identity: providerRuntimeIdentity,
    previousResponseId: "resp_operational_only",
  });
  assert.equal(state, undefined);
  assert.deepEqual(
    selectProviderRuntimeContinuationV1({
      identity: providerRuntimeIdentity,
    }),
    {
      mode: "off",
      stateDisposition: "discard",
      strategy: "off",
      reason: "FEATURE_DISABLED",
      invalidatedBy: [],
    },
  );
  assert.deepEqual(
    selectProviderRuntimeContinuationV1({
      mode: "persisted",
      identity: providerRuntimeIdentity,
    }),
    {
      mode: "persisted",
      stateDisposition: "discard",
      strategy: "current_turn",
      reason: "NO_REUSABLE_STATE",
      invalidatedBy: [],
    },
  );
  assert.equal(
    selectProviderRuntimeContinuationV1({
      mode: "current_turn",
      identity: providerRuntimeIdentity,
    }).strategy,
    "current_turn",
  );
});

test("provider runtime state reuses only an exact five-part identity", () => {
  const state = recordProviderRuntimeStateV1({
    mode: "persisted",
    identity: providerRuntimeIdentity,
    previousResponseId: "resp_operational_only",
    recordedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.ok(state);
  const reuse = selectProviderRuntimeContinuationV1({
    mode: "persisted",
    identity: { ...providerRuntimeIdentity },
    state,
    supportsPreviousResponseId: true,
  });
  assert.equal(reuse.strategy, "previous_response_id");
  assert.equal(reuse.stateDisposition, "retain");
  assert.equal(reuse.previousResponseId, "resp_operational_only");
  assert.deepEqual(state.authority, {
    sourceOfTruth: false,
    completionEvidence: false,
    approvalEvidence: false,
    durableProjectMemory: false,
  });

  const changed = {
    goal: "new-goal",
    scope: "new-scope",
    branch: "feature/new-branch",
    priority: "new-priority",
    authorization: "new-authorization",
  };
  assert.deepEqual(
    changedProviderRuntimeIdentityV1(providerRuntimeIdentity, changed),
    ["goal", "scope", "branch", "priority", "authorization"],
  );
  for (const component of Object.keys(providerRuntimeIdentity)) {
    const identity = {
      ...providerRuntimeIdentity,
      [component]: `changed-${component}`,
    };
    const invalidated = selectProviderRuntimeContinuationV1({
      mode: "persisted",
      identity,
      state,
      supportsPreviousResponseId: true,
      supportsManualReplay: true,
    });
    assert.equal(invalidated.strategy, "current_turn");
    assert.equal(invalidated.reason, "IDENTITY_CHANGED");
    assert.equal(invalidated.stateDisposition, "discard");
    assert.deepEqual(invalidated.invalidatedBy, [component]);
    assert.equal(invalidated.previousResponseId, undefined);
    assert.equal(invalidated.manualReplayItems, undefined);
  }
});

test("manual provider replay preserves item types and assistant phases without hidden reasoning", () => {
  const replayItems = [
    {
      type: "reasoning",
      id: "rs_1",
      status: "completed",
      summary: [{ type: "summary_text", text: "Operational summary only." }],
    },
    {
      type: "message",
      role: "assistant",
      phase: "commentary",
      content: [{ type: "output_text", text: "Progress update" }],
    },
    {
      type: "function_call",
      call_id: "call_1",
      name: "read_file",
      arguments: "{\"path\":\"README.md\"}",
    },
    {
      type: "function_call_output",
      call_id: "call_1",
      output: "README contents",
    },
    {
      type: "message",
      role: "assistant",
      phase: "final",
      content: [{ type: "output_text", text: "Final answer" }],
    },
  ];
  const state = recordProviderRuntimeStateV1({
    mode: "persisted",
    identity: providerRuntimeIdentity,
    reasoningSummaries: [
      { type: "summary_text", text: "Operational summary only." },
    ],
    manualReplayItems: replayItems,
    recordedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.ok(state);
  const replay = selectProviderRuntimeContinuationV1({
    mode: "persisted",
    identity: providerRuntimeIdentity,
    state: JSON.parse(JSON.stringify(state)),
    supportsPreviousResponseId: false,
    supportsManualReplay: true,
  });
  assert.equal(replay.strategy, "manual_replay");
  assert.deepEqual(
    replay.manualReplayItems?.map((item) => item.type),
    ["reasoning", "message", "function_call", "function_call_output", "message"],
  );
  assert.deepEqual(
    replay.manualReplayItems
      ?.filter((item) => item.role === "assistant")
      .map((item) => item.phase),
    ["commentary", "final"],
  );
  assert.deepEqual(state.reasoningSummaries, [
    { type: "summary_text", text: "Operational summary only." },
  ]);
});

test("provider runtime state fails closed on hidden reasoning or forged authority", () => {
  assert.throws(
    () =>
      sanitizeProviderReplayItemsV1([
        {
          type: "reasoning",
          summary: [],
          encrypted_content: "opaque-hidden-reasoning",
        },
      ]),
    /Hidden reasoning field is forbidden/,
  );
  assert.throws(
    () =>
      sanitizeProviderReplayItemsV1([
        {
          type: "reasoning",
          summary: [],
          content: [{ type: "reasoning_text", text: "private chain" }],
        },
      ]),
    /Hidden reasoning item type is forbidden|non-summary fields: content/,
  );
  assert.throws(
    () =>
      sanitizeProviderReplayItemsV1([
        {
          type: "message",
          role: "assistant",
          phase: "commentary",
          content: [{ type: "reasoning_text", text: "private chain" }],
        },
      ]),
    /Hidden reasoning item type is forbidden/,
  );
  const state = recordProviderRuntimeStateV1({
    mode: "persisted",
    identity: providerRuntimeIdentity,
    previousResponseId: "resp_not_evidence",
    recordedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.ok(state);
  const forged = {
    ...state,
    authority: { ...state.authority, approvalEvidence: true },
  };
  assert.throws(
    () =>
      selectProviderRuntimeContinuationV1({
        mode: "persisted",
        identity: providerRuntimeIdentity,
        state: forged as any,
        supportsPreviousResponseId: true,
      }),
    /cannot carry project authority/,
  );
});

test("the Codex CLI adapter explicitly rejects provider continuation and records an observable fallback", () => {
  assert.deepEqual(codexCliProviderRuntimeAdapterV1, {
    id: "codex-cli-ephemeral-v1",
    supportsPreviousResponseId: false,
    supportsManualReplay: false,
  });
  const lifecycleTask = {
    ...task("provider-lifecycle", "pending"),
    requestedModel: "terra",
    modelSelectionReason: "explicit task or project default",
    allowedPaths: ["server"],
    verificationCommands: ["node --test"],
  };
  const project = {
    name: "Test",
    path: process.cwd(),
    verificationCommands: ["git diff --check"],
  };
  const identity = providerRuntimeIdentityForTaskV1(
    lifecycleTask,
    project,
    "feature/provider-state",
  );
  const stored = recordProviderRuntimeStateV1({
    mode: "persisted",
    identity,
    previousResponseId: "resp_must_not_reach_cli",
    recordedAt: "2026-07-23T00:00:00.000Z",
  });
  const selected = prepareProviderRuntimeContinuationForTaskV1({
    task: { ...lifecycleTask, providerRuntimeState: stored },
    project,
    branch: "feature/provider-state",
    environment: { ORCHESTRATOR_PROVIDER_REASONING_MODE: "persisted" },
  });
  assert.equal(selected.decision.strategy, "current_turn");
  assert.equal(selected.decision.reason, "PROVIDER_CONTINUATION_UNAVAILABLE");
  assert.equal(selected.state, undefined);
  assert.match(selected.log, /strategy=current_turn/);
  assert.match(selected.log, /reason=PROVIDER_CONTINUATION_UNAVAILABLE/);
  assert.doesNotMatch(selected.log, /resp_must_not_reach_cli/);
  assert.throws(
    () =>
      recordProviderRuntimeStateForAdapterV1(
        codexCliProviderRuntimeAdapterV1,
        {
          mode: "persisted",
          identity,
          previousResponseId: "resp_must_not_be_recorded",
        },
      ),
    /does not support provider continuation/,
  );
});

test("task lifecycle identity invalidates persisted state for goal, scope, branch, priority, and authorization changes", () => {
  const project = { name: "Test", path: process.cwd() };
  const baseTask = {
    ...task("identity", "pending"),
    requestedModel: "terra",
    modelSelectionReason: "explicit",
    allowedPaths: ["server"],
    verificationCommands: ["node --test"],
    authorizationEvidence: {
      contractType: "TaskAuthorizationEvidenceV1",
      enabled: false,
      decision: "disabled",
      reason: "FEATURE_DISABLED",
      allowedPaths: ["server"],
      verificationCommands: ["node --test"],
      scopeFingerprint: "scope-a",
      goalFingerprint: "goal-a",
      branch: "main",
      authorityFingerprint: "authority-a",
    },
  };
  const baseIdentity = providerRuntimeIdentityForTaskV1(baseTask, project, "main");
  const state = recordProviderRuntimeStateV1({
    mode: "persisted",
    identity: baseIdentity,
    previousResponseId: "resp_safe_fixture",
    recordedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.ok(state);
  const supportingAdapter = {
    id: "future-supporting-adapter",
    supportsPreviousResponseId: true,
    supportsManualReplay: true,
  };
  const changes = [
    ["goal", { ...baseTask, prompt: "Changed goal" }, "main"],
    ["scope", { ...baseTask, allowedPaths: ["runtime-evals-v1"] }, "main"],
    ["branch", baseTask, "feature/other"],
    ["priority", { ...baseTask, effort: "high" }, "main"],
    [
      "authorization",
      {
        ...baseTask,
        authorizationEvidence: {
          ...baseTask.authorizationEvidence,
          authorityFingerprint: "authority-b",
        },
      },
      "main",
    ],
  ] as const;
  for (const [component, changedTask, branch] of changes) {
    const selected = prepareProviderRuntimeContinuationForTaskV1({
      task: { ...changedTask, providerRuntimeState: state },
      project,
      branch,
      adapter: supportingAdapter,
      environment: { ORCHESTRATOR_PROVIDER_REASONING_MODE: "persisted" },
    });
    assert.equal(selected.decision.strategy, "current_turn");
    assert.equal(selected.decision.reason, "IDENTITY_CHANGED");
    assert.deepEqual(selected.decision.invalidatedBy, [component]);
    assert.equal(selected.state, undefined);
  }
});

test("legacy run records load without provider runtime fields while retry and resume retain safe optional state", () => {
  const legacy = run([task("legacy-provider-record", "failed")]);
  const normalizedLegacy = normalizeProviderRuntimePersistenceV1(
    structuredClone(legacy),
  );
  assert.equal(normalizedLegacy.tasks[0].providerRuntimeState, undefined);
  assert.equal(normalizedLegacy.tasks[0].providerRuntimeDecision, undefined);

  const identity = providerRuntimeIdentityForTaskV1(
    {
      ...legacy.tasks[0],
      requestedModel: "terra",
      modelSelectionReason: "explicit",
    },
    legacy.project,
    "main",
  );
  const state = recordProviderRuntimeStateV1({
    mode: "persisted",
    identity,
    previousResponseId: "resp_retry_fixture",
    recordedAt: "2026-07-23T00:00:00.000Z",
  });
  assert.ok(state);
  assert.throws(
    () =>
      normalizeProviderRuntimePersistenceV1({
        ...structuredClone(legacy),
        tasks: [
          {
            ...structuredClone(legacy.tasks[0]),
            providerRuntimeState: {
              ...state,
              raw_reasoning: "must never load",
            },
          },
        ],
      }),
    /Hidden reasoning field is forbidden/,
  );
  legacy.tasks[0].providerRuntimeState = state;
  const retry = retryRun(legacy, legacy.tasks[0]);
  const resumed = resumeRun(legacy);
  assert.deepEqual(retry.tasks[0].providerRuntimeState, state);
  assert.deepEqual(resumed?.tasks[0].providerRuntimeState, state);
  assert.equal(retry.tasks[0].providerRuntimeDecision, undefined);
  assert.equal(resumed?.tasks[0].providerRuntimeDecision, undefined);
  const recovered = recoverRun({
    ...legacy,
    status: "running",
    tasks: [{ ...legacy.tasks[0], status: "running" }],
  });
  assert.deepEqual(recovered.tasks[0].providerRuntimeState, state);
});

test("fails closed on unverified Luna routes and preserves explicit GPT-5.6 configuration identity", () => {
  assert.deepEqual(installedCodexModels({}), ["terra", "sol"]);
  assert.deepEqual(installedCodexModels({ CODEX_LUNA_SUPPORTED: "1" }), ["luna", "terra", "sol"]);
  assert.deepEqual(
    assertCodexRouteCompatible("terra", "medium", "local-codex-tools", {}),
    { model: "gpt-5.6-terra", reasoningEffort: "medium", toolRoute: "local-codex-tools" },
  );
  assert.throws(
    () => assertCodexRouteCompatible("luna", "light", "local-codex-tools", {}),
    /not enabled by the installed Codex runtime/,
  );
});

test("enabled answer, review, and diagnose contracts are authorized only as non-mutating", () => {
  for (const intent of ["answer", "review", "diagnose"] as const) {
    const evidence = authorizeTask({
      authorization: { enabled: true, intent, technicalPermission: "read_only", sideEffectRisk: "none" },
    });
    assert.equal(evidence.decision, "authorized");
    assert.equal(evidence.reason, "NON_MUTATING_AUTHORIZED");
    assert.equal(taskSandbox(evidence), "read-only");
    assert.deepEqual(authorizationWriteViolations(evidence, ["unexpected-write.ts"]), ["unexpected-write.ts"]);
  }
  assert.equal(authorizeTask({
    authorization: { enabled: true, intent: "review", technicalPermission: "reversible_local_write", sideEffectRisk: "none" },
  }).reason, "NON_MUTATING_CONTRACT_REQUIRED");
});

test("one configured approved apply contract authorizes its exact reversible local scope and replays persisted run evidence", () => {
  const task = {
    allowedPaths: ["server/index.ts", "server/index.test.ts"],
    verificationCommands: ["npm test", "git diff --check"],
    authorization: {
      enabled: true,
      intent: "apply" as const,
      technicalPermission: "reversible_local_write" as const,
      sideEffectRisk: "reversible_local_write" as const,
      approvalId: "approval-42",
    },
  };
  const project = {
    approvedApplyContracts: [{
      approvalId: "approval-42",
      intent: "apply" as const,
      technicalPermission: "reversible_local_write" as const,
      sideEffectRisk: "reversible_local_write" as const,
      allowedPaths: ["server/index.ts", "server/index.test.ts"],
      verificationCommands: ["npm test", "git diff --check"],
    }],
  };
  const evidence = authorizeTask(task, project);
  assert.equal(evidence.decision, "authorized");
  assert.equal(evidence.reason, "APPROVED_REVERSIBLE_LOCAL_APPLY");
  assert.equal(taskSandbox(evidence), "workspace-write");
  assert.equal(replayTaskAuthorization(evidence, task, project), true);
  assert.equal(replayTaskAuthorization(evidence, { ...task, allowedPaths: ["server/index.ts"] }, project), false);
  assert.equal(authorizeTask(task).reason, "APPROVAL_CONTRACT_MISMATCH");
  const persistedRun = JSON.parse(JSON.stringify({ tasks: [{ authorizationEvidence: evidence }] }));
  assert.equal(verifyStoredTaskAuthorization(
    persistedRun.tasks[0].authorizationEvidence,
    task,
    project,
  ), true);
  assert.equal(verifyStoredTaskAuthorization(persistedRun.tasks[0].authorizationEvidence, task, {
    approvedApplyContracts: [{ ...project.approvedApplyContracts[0], verificationCommands: ["npm test"] }],
  }), false);
});

test("executor, reviewer, and correction phases carry the enforced sandbox boundary", () => {
  const applyTask = {
    title: "Apply exact patch",
    prompt: "Change the server boundary",
    allowedPaths: ["server/index.ts"],
    verificationCommands: ["git diff --check"],
    authorization: {
      enabled: true,
      intent: "apply" as const,
      technicalPermission: "reversible_local_write" as const,
      sideEffectRisk: "reversible_local_write" as const,
      approvalId: "approval-phases",
    },
  };
  const project = {
    approvedApplyContracts: [{
      approvalId: "approval-phases",
      intent: "apply" as const,
      technicalPermission: "reversible_local_write" as const,
      sideEffectRisk: "reversible_local_write" as const,
      allowedPaths: ["server/index.ts"],
      verificationCommands: ["git diff --check"],
    }],
  };
  const apply = authorizeTask(applyTask, project, "feature/approval");
  for (const phase of ["executor", "correction"] as const)
    assert.deepEqual(codexExecutionBoundaryArgs(apply, phase), [
      "--sandbox",
      "workspace-write",
      "-c",
      "sandbox_workspace_write.network_access=false",
    ]);
  assert.deepEqual(codexExecutionBoundaryArgs(apply, "reviewer"), [
    "-c",
    "default_permissions='orchestrator-reviewer'",
    "-c",
    "permissions.orchestrator-reviewer={ filesystem = { ':minimal' = 'read', ':tmpdir' = 'write', ':workspace_roots' = { '.' = 'read' } }, network = { enabled = false } }",
  ]);
  assert.deepEqual(codexExecCommandStartArgs(apply, "reviewer"), [
    "exec",
    "-c",
    "default_permissions='orchestrator-reviewer'",
    "-c",
    "permissions.orchestrator-reviewer={ filesystem = { ':minimal' = 'read', ':tmpdir' = 'write', ':workspace_roots' = { '.' = 'read' } }, network = { enabled = false } }",
  ]);
  const prompt = buildPrompt({
    ...applyTask,
    id: "apply-task",
    model: "terra",
    requestedModel: "terra",
    modelSelectionReason: "test",
    effort: "light",
    status: "pending",
    log: [],
    authorizationEvidence: apply,
  } as any, project);
  assert.match(prompt, /does not command-allowlist executor shell commands/);
  assert.match(prompt, /Do not run verification commands yourself/);
  const readOnly = authorizeTask({
    title: "Review",
    prompt: "Review only",
    authorization: {
      enabled: true,
      intent: "review",
      technicalPermission: "read_only",
      sideEffectRisk: "none",
    },
  }, {}, "feature/approval");
  assert.equal(codexExecutionBoundaryArgs(readOnly, "executor")[1], "read-only");
});

test("exact changed-file and orchestrator verification boundaries fail closed", () => {
  const task = {
    allowedPaths: ["server/index.ts"],
    preconditions: ["git rev-parse --verify HEAD"],
    verificationCommands: ["node local-check.mjs", "git diff --check"],
    authorization: {
      enabled: true,
      intent: "apply" as const,
      technicalPermission: "reversible_local_write" as const,
      sideEffectRisk: "reversible_local_write" as const,
      approvalId: "approval-scope",
    },
  };
  const evidence = authorizeTask(task, {
    approvedApplyContracts: [{
      approvalId: "approval-scope",
      intent: "apply",
      technicalPermission: "reversible_local_write",
      sideEffectRisk: "reversible_local_write",
      allowedPaths: ["server/index.ts"],
      preconditions: ["git rev-parse --verify HEAD"],
      verificationCommands: ["node local-check.mjs", "git diff --check"],
    }],
  });
  assert.deepEqual(authorizationWriteViolations(evidence, ["server/index.ts"]), []);
  assert.deepEqual(
    authorizationWriteViolations(evidence, ["server/index.ts", "README.md"]),
    ["README.md"],
  );
  assert.deepEqual(orchestratorVerificationCommands(evidence), [
    "node local-check.mjs",
    "git diff --check",
  ]);
  assert.deepEqual(evidence.preconditions, ["git rev-parse --verify HEAD"]);
  assert.equal(authorizeTask(
    { ...task, preconditions: ["git rev-parse --verify main"] },
    {
      approvedApplyContracts: [{
        approvalId: "approval-scope",
        intent: "apply",
        technicalPermission: "reversible_local_write",
        sideEffectRisk: "reversible_local_write",
        allowedPaths: ["server/index.ts"],
        preconditions: ["git rev-parse --verify HEAD"],
        verificationCommands: ["node local-check.mjs", "git diff --check"],
      }],
    },
  ).reason, "APPROVAL_CONTRACT_MISMATCH");
});

test("disabled-by-default fallback does not invent approval or verification authority", () => {
  const evidence = authorizeTask({});
  assert.equal(evidence.decision, "disabled");
  assert.equal(taskSandbox(evidence), "workspace-write");
  assert.deepEqual(codexExecutionBoundaryArgs(evidence, "executor"), [
    "--sandbox",
    "workspace-write",
  ]);
  assert.deepEqual(orchestratorVerificationCommands(evidence), []);
  assert.deepEqual(authorizationWriteViolations(evidence, ["legacy-change.ts"]), []);
});

test("external, destructive, costly, published, expanded, and ambiguous effects fail closed", () => {
  for (const sideEffectRisk of ["external_write", "destructive", "costly", "publication", "scope_expansion", "ambiguous"] as const) {
    const evidence = authorizeTask({
      allowedPaths: ["server/index.ts"],
      verificationCommands: ["npm test"],
      authorization: {
        enabled: true,
        intent: "apply",
        technicalPermission: "reversible_local_write",
        sideEffectRisk,
        approvalId: "old-approval",
      },
    }, { approvedApplyContracts: [{
      approvalId: "old-approval",
      intent: "apply",
      technicalPermission: "reversible_local_write",
      sideEffectRisk: "reversible_local_write",
      allowedPaths: ["server/index.ts"],
      verificationCommands: ["npm test"],
    }] });
    assert.equal(evidence.decision, "denied");
    assert.equal(evidence.reason, "FRESH_EXPLICIT_GATE_REQUIRED");
  }
  assert.equal(authorizeTask({ authorization: { enabled: true } }).reason, "AMBIGUOUS_CLASSIFICATION");
  assert.equal(authorizeTask({}).decision, "disabled");
});

test("server binds successfully before recovery mutates persisted runs", async () => {
  const events: string[] = [];
  const server = { close: () => undefined };
  assert.equal(
    await bindBeforeRecovery(
      async () => { events.push("listen"); return server; },
      async () => { events.push("recover"); },
    ),
    server,
  );
  assert.deepEqual(events, ["listen", "recover"]);

  let recovered = false;
  await assert.rejects(
    bindBeforeRecovery(
      async () => { throw new Error("EADDRINUSE"); },
      async () => { recovered = true; },
    ),
    /EADDRINUSE/,
  );
  assert.equal(recovered, false);

  let closed = false;
  await assert.rejects(
    bindBeforeRecovery(
      async () => ({ close: (done: () => void) => { closed = true; done(); } }),
      async () => { throw new Error("recovery failed"); },
    ),
    /recovery failed/,
  );
  assert.equal(closed, true);
});

test("recovery recognizes a live matching run owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestrator-live-owner-"));
  const lockPath = join(directory, ".codex-orchestrator.lock");
  try {
    await writeFile(lockPath, JSON.stringify({ runId: "run-live", pid: 1234 }), "utf8");
    const run = {
      id: "run-live",
      project: { path: directory },
      lock: { path: lockPath, acquiredAt: new Date().toISOString() },
    };
    assert.equal(await runHasLiveOwner(run, (pid: number) => pid === 1234), true);
    assert.equal(await runHasLiveOwner({ ...run, id: "other-run" }, () => true), false);
    assert.equal(await runHasLiveOwner(run, () => false), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("vendors exact Context Contract v1 schemas with recorded provenance", async () => {
  const expected = {
    "context-request-v1.schema.json": "20a74bb97390dc1543504c852fe5c72d8f81d53bf2ec3da964f7e36f47c083f3",
    "context-bundle-v1.schema.json": "18c9b99f8eff25c75bb4a4b723c7bbfdcca331afa8b69c5e3ddeb9f7ce4a7b99",
    "context-receipt-v1.schema.json": "daf185539344f646c16c6834a4d1578b61d812a7bf3c7ff94f1181de55ab22ec",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const snapshot = await readFile(join("server", "context-contract-v1", "schemas", name));
    assert.equal(createHash("sha256").update(snapshot).digest("hex"), hash);
  }
  const provenance = await readFile(join("server", "context-contract-v1", "schemas", "PROVENANCE.md"), "utf8");
  assert.match(provenance, /AI-assisted_System_Design_and_Agent_Memory_Kit/);
  assert.match(provenance, /JSON Schema Draft 2020-12/);
});

test("Ajv 2020 validates generated ContextRequestV1 and rejects observable mismatches", () => {
  const request = createContextRequestV1({
    projectPath: "C:/safe-project",
    requestId: "request-schema",
    task: "Review repository",
    profile: "review",
    maxSources: 2,
  });
  assert.equal(validateContextContractV1("request", request), request);
  assert.throws(
    () => validateContextContractV1("request", { ...request, contract_version: "2.0" }),
    /CONTEXT_SCHEMA_MISMATCH.*ContextRequestV1/,
  );
});

test("Planning and Drift Contract v1 examples validate and unsafe variants fail closed", async () => {
  const schema = JSON.parse(
    await readFile(
      join(
        "server",
        "change-control-v1",
        "schemas",
        "planning-drift-v1.schema.json",
      ),
      "utf8",
    ),
  );
  const examples = JSON.parse(
    await readFile(
      join(
        "server",
        "change-control-v1",
        "schemas",
        "planning-drift-v1.examples.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>[];
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  for (const example of examples)
    assert.equal(
      validate(example),
      true,
      ajv.errorsText(validate.errors),
    );

  const staleWithoutReasons = structuredClone(examples[1]);
  staleWithoutReasons.reasons = [];
  assert.equal(validate(staleWithoutReasons), false);

  const authorizationFreePlan = structuredClone(examples[0]);
  authorizationFreePlan.authorizationRequired = false;
  assert.equal(validate(authorizationFreePlan), false);

  const selfAuthorizedReceipt = structuredClone(examples[2]);
  selfAuthorizedReceipt.authorizationState = "authorized";
  assert.equal(validate(selfAuthorizedReceipt), false);

  const allowedWithoutAuthorization = structuredClone(examples[4]);
  delete allowedWithoutAuthorization.authorizationId;
  assert.equal(validate(allowedWithoutAuthorization), false);
});

test("Workspace and Merge Contract v1 examples validate and partial ownership fails closed", async () => {
  const schema = JSON.parse(
    await readFile(
      join(
        "server",
        "change-control-v1",
        "schemas",
        "workspace-merge-v1.schema.json",
      ),
      "utf8",
    ),
  );
  const examples = JSON.parse(
    await readFile(
      join(
        "server",
        "change-control-v1",
        "schemas",
        "workspace-merge-v1.examples.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>[];
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  assert.deepEqual(
    examples.map((example) => example.contractType),
    [
      "WorkspaceAttemptV1",
      "MergeRequestV1",
      "MergeReceiptV1",
      "WorkspaceAttemptV1",
      "WorkspaceAttemptV1",
    ],
  );
  for (const example of examples)
    assert.equal(validate(example), true, ajv.errorsText(validate.errors));

  const partialWorkspace = structuredClone(examples[0]);
  delete partialWorkspace.ownershipMarker;
  assert.equal(validate(partialWorkspace), false);

  const unknownVersion = structuredClone(examples[1]);
  unknownVersion.contractVersion = "2.0";
  assert.equal(validate(unknownVersion), false);

  const implicitOwnership = planningContract() as unknown as Record<string, unknown>;
  assert.equal(validate(implicitOwnership), false);
  assert.equal("workspaceAttemptId" in implicitOwnership, false);

  const mergedWithoutParents = structuredClone(examples[2]);
  delete mergedWithoutParents.mergeParents;
  assert.equal(validate(mergedWithoutParents), false);

  const cleanupWithoutReason = structuredClone(examples[4]);
  delete cleanupWithoutReason.reason;
  assert.equal(validate(cleanupWithoutReason), false);
});

test("Workspace and Merge v1 schema enforces the exact workspace transition matrix", async () => {
  const schema = JSON.parse(
    await readFile(
      join("server", "change-control-v1", "schemas", "workspace-merge-v1.schema.json"),
      "utf8",
    ),
  );
  const examples = JSON.parse(
    await readFile(
      join("server", "change-control-v1", "schemas", "workspace-merge-v1.examples.json"),
      "utf8",
    ),
  ) as Record<string, unknown>[];
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const states = [
    "provisioning",
    "active",
    "sealed",
    "merge_queued",
    "merged",
    "replan_required",
    "cleanup_pending",
    "recovery_pending",
    "quarantined",
    "cleaned",
  ] as const;
  const allowed = new Set([
    "null->provisioning",
    "provisioning->active",
    "provisioning->recovery_pending",
    "provisioning->quarantined",
    "active->sealed",
    "active->cleanup_pending",
    "active->recovery_pending",
    "active->quarantined",
    "sealed->merge_queued",
    "sealed->replan_required",
    "sealed->cleanup_pending",
    "sealed->recovery_pending",
    "sealed->quarantined",
    "merge_queued->merged",
    "merge_queued->replan_required",
    "merge_queued->recovery_pending",
    "merge_queued->quarantined",
    "merged->cleanup_pending",
    "merged->cleaned",
    "merged->recovery_pending",
    "merged->quarantined",
    "replan_required->cleanup_pending",
    "replan_required->recovery_pending",
    "replan_required->quarantined",
    "cleanup_pending->cleaned",
    "cleanup_pending->recovery_pending",
    "cleanup_pending->quarantined",
    "recovery_pending->active",
    "recovery_pending->sealed",
    "recovery_pending->merge_queued",
    "recovery_pending->merged",
    "recovery_pending->replan_required",
    "recovery_pending->cleanup_pending",
    "recovery_pending->cleaned",
    "recovery_pending->quarantined",
  ]);
  const base = {
    ...structuredClone(examples[0]),
    reason: "Required fail-closed transition reason.",
    recoveryReceiptRef: "recovery:cleanup-complete",
    driftAssessmentId: "drift-transition",
  };

  for (const previousState of [null, ...states]) {
    for (const state of states) {
      const candidate = { ...base, previousState, state };
      assert.equal(
        validate(candidate),
        allowed.has(`${previousState}->${state}`),
        `${previousState}->${state}: ${ajvErrors(validate.errors)}`,
      );
    }
  }
});

test("Workspace and Merge v1 schema enforces the exact merge transition matrix", async () => {
  const schema = JSON.parse(
    await readFile(
      join("server", "change-control-v1", "schemas", "workspace-merge-v1.schema.json"),
      "utf8",
    ),
  );
  const examples = JSON.parse(
    await readFile(
      join("server", "change-control-v1", "schemas", "workspace-merge-v1.examples.json"),
      "utf8",
    ),
  ) as Record<string, unknown>[];
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  const states = [
    "queued",
    "validating",
    "applying",
    "verifying",
    "committed",
    "replan_required",
    "recovery_pending",
    "quarantined",
  ] as const;
  const allowed = new Set([
    "null->queued",
    "queued->validating",
    "queued->replan_required",
    "queued->recovery_pending",
    "queued->quarantined",
    "validating->applying",
    "validating->replan_required",
    "validating->recovery_pending",
    "validating->quarantined",
    "applying->verifying",
    "applying->replan_required",
    "applying->recovery_pending",
    "applying->quarantined",
    "verifying->committed",
    "verifying->replan_required",
    "verifying->recovery_pending",
    "verifying->quarantined",
    "recovery_pending->queued",
    "recovery_pending->validating",
    "recovery_pending->applying",
    "recovery_pending->verifying",
    "recovery_pending->committed",
    "recovery_pending->replan_required",
    "recovery_pending->quarantined",
  ]);
  const base = {
    ...structuredClone(examples[1]),
    observedTargetSha: planningShaOne,
    mergeCommitSha: planningShaTwo,
    lease: {
      leaseId: "lease-transition",
      repositoryId: "repo-orchestrator",
      targetRef: "refs/heads/main",
      ownerRunId: "run-drift",
      ownerAttemptId: "attempt-drift",
      epoch: 1,
      acquiredAt: "2026-07-30T10:04:00.000Z",
    },
  };

  for (const previousState of [null, ...states]) {
    for (const state of states) {
      const candidate = { ...base, previousState, state };
      assert.equal(
        validate(candidate),
        allowed.has(`${previousState}->${state}`),
        `${previousState}->${state}: ${ajvErrors(validate.errors)}`,
      );
    }
  }
});

test("Workspace and Merge v1 Windows experiments prove owned worktree isolation, dirty preservation, stale metadata, and 100+ commit merge", async () => {
  if (process.platform !== "win32") {
    assert.equal(
      windowsWorkspaceCapability(),
      "unsupported_fail_closed",
      "non-Windows hosts must explicitly fail closed rather than imply Windows proof",
    );
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "orchestrator workspace merge "));
  const repository = join(root, "repository with spaces");
  const ownedRoot = join(
    root,
    "owned workspaces",
    "long-segment-aaaaaaaaaaaaaaaaaaaaaaaa",
    "long-segment-bbbbbbbbbbbbbbbbbbbbbbbb",
  );
  const workspace = join(ownedRoot, "run-one", "attempt-one");
  try {
    await mkdir(repository, { recursive: true });
    await mkdir(ownedRoot, { recursive: true });
    gitForWorkspaceContract(repository, ["init", "-b", "main"]);
    gitForWorkspaceContract(repository, ["config", "user.email", "phase3@example.invalid"]);
    gitForWorkspaceContract(repository, ["config", "user.name", "Phase 3 Test"]);
    await writeFile(join(repository, "base.txt"), "base\n");
    gitForWorkspaceContract(repository, ["add", "base.txt"]);
    gitForWorkspaceContract(repository, ["commit", "-m", "base"]);
    const targetBefore = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);

    gitForWorkspaceContract(repository, [
      "worktree",
      "add",
      "-b",
      "orchestrator/attempt/run-one/attempt-one",
      workspace,
      targetBefore,
    ]);
    assert.equal(
      gitForWorkspaceContract(workspace, ["symbolic-ref", "HEAD"]),
      "refs/heads/orchestrator/attempt/run-one/attempt-one",
    );
    assert.equal(windowsPathContained(ownedRoot, workspace), true);
    assert.equal(
      windowsPathContained(ownedRoot, `${ownedRoot}-sibling\\attempt-one`),
      false,
      "sibling-prefix paths are not owned",
    );
    assert.ok(workspace.length > 100, "experiment uses a long path as well as spaces");

    for (let index = 1; index <= 101; index += 1)
      gitForWorkspaceContract(workspace, [
        "commit",
        "--allow-empty",
        "-m",
        `attempt commit ${index}`,
      ]);
    const sealedSource = gitForWorkspaceContract(workspace, ["rev-parse", "HEAD"]);
    assert.equal(
      Number(gitForWorkspaceContract(workspace, ["rev-list", "--count", `${targetBefore}..${sealedSource}`])),
      101,
    );

    gitForWorkspaceContract(repository, ["merge", "--no-ff", "--no-commit", sealedSource]);
    gitForWorkspaceContract(repository, ["commit", "-m", "merge attempt run-one attempt-one"]);
    const mergeCommit = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
    const parents = gitForWorkspaceContract(repository, ["show", "-s", "--format=%P", mergeCommit]).split(" ");
    assert.deepEqual(parents, [targetBefore, sealedSource]);
    assert.equal(
      gitForWorkspaceContract(repository, ["merge-base", "--is-ancestor", sealedSource, mergeCommit]),
      "",
    );

    const expectedTarget = mergeCommit;
    gitForWorkspaceContract(repository, ["commit", "--allow-empty", "-m", "concurrent target movement"]);
    const observedTarget = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
    assert.notEqual(observedTarget, expectedTarget);
    assert.equal(
      expectedTarget === observedTarget ? "fresh" : "replan_required",
      "replan_required",
    );

    await writeFile(join(workspace, "uncommitted-user-file.txt"), "preserve me\n");
    assert.throws(
      () => gitForWorkspaceContract(repository, ["worktree", "remove", workspace]),
      /failed|modified|untracked/i,
    );
    assert.equal(
      await readFile(join(workspace, "uncommitted-user-file.txt"), "utf8"),
      "preserve me\n",
    );

    await rm(workspace, { recursive: true, force: true });
    assert.match(
      gitForWorkspaceContract(repository, ["worktree", "list", "--porcelain"]),
      /worktree .*attempt-one/,
      "a crash-deleted worktree leaves stale metadata for bounded recovery",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Workspace and Merge v1 Windows experiments reject junction escapes and retain contended files", async () => {
  if (process.platform !== "win32") {
    assert.equal(windowsWorkspaceCapability(), "unsupported_fail_closed");
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "orchestrator junction experiment "));
  const ownedRoot = join(root, "owned");
  const outside = join(root, "outside");
  const junction = join(ownedRoot, "attempt-junction");
  const lockedFile = join(ownedRoot, "cleanup-contended.txt");
  let locker: ReturnType<typeof spawn> | undefined;
  try {
    await mkdir(ownedRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "outside.txt"), "outside\n");
    try {
      execFileSync(process.env.ComSpec ?? "cmd.exe", [
        "/d",
        "/c",
        "mklink",
        "/J",
        junction,
        outside,
      ], { stdio: "pipe" });
    } catch (error) {
      assert.fail(`junction capability unavailable; fail closed: ${String(error)}`);
    }
    assert.equal(windowsPathContained(ownedRoot, junction), true);
    assert.equal(
      windowsPathContained(await realpath(ownedRoot), await realpath(junction)),
      false,
      "resolved junction target escapes the owned root",
    );

    await writeFile(lockedFile, "retain while locked\n");
    const quotedLockedFile = lockedFile.replace(/'/g, "''");
    locker = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$stream=[IO.File]::Open('${quotedLockedFile}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); [Console]::Out.WriteLine('READY'); Start-Sleep -Seconds 30; $stream.Dispose()`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForLine(locker, "READY");
    await assert.rejects(
      rm(lockedFile),
      /EPERM|EBUSY|permission|being used/i,
    );
    await stopChild(locker);
    locker = undefined;
    assert.equal(await readFile(lockedFile, "utf8"), "retain while locked\n");
  } finally {
    if (locker) await stopChild(locker);
    await rm(root, { recursive: true, force: true });
  }
});

test("Workspace and Merge v1 Windows recovery handles every merge crash boundary", async () => {
  if (process.platform !== "win32") {
    assert.equal(
      windowsWorkspaceCapability(),
      "unsupported_fail_closed",
      "Windows crash recovery evidence is unavailable and must fail closed",
    );
    return;
  }

  const crashPoints = [
    "before_apply",
    "during_merge",
    "after_commit",
    "before_receipt",
  ] as const;
  const observedOutcomes = new Map<string, string>();

  for (const crashPoint of crashPoints) {
    const root = await mkdtemp(join(tmpdir(), `orchestrator crash ${crashPoint} `));
    const repository = join(root, "temporary repository");
    const durableStatePath = join(root, "merge-state.json");
    const receiptPath = join(root, "merge-receipt.json");
    try {
      await mkdir(repository, { recursive: true });
      gitForWorkspaceContract(repository, ["init", "-b", "main"]);
      gitForWorkspaceContract(repository, ["config", "user.email", "recovery@example.invalid"]);
      gitForWorkspaceContract(repository, ["config", "user.name", "Recovery Test"]);
      await writeFile(join(repository, "base.txt"), "base\n");
      gitForWorkspaceContract(repository, ["add", "base.txt"]);
      gitForWorkspaceContract(repository, ["commit", "-m", "base"]);
      const expectedTargetSha = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
      gitForWorkspaceContract(repository, ["checkout", "-b", "orchestrator/attempt/run-crash/attempt-one"]);
      await writeFile(join(repository, "source.txt"), `${crashPoint}\n`);
      gitForWorkspaceContract(repository, ["add", "source.txt"]);
      gitForWorkspaceContract(repository, ["commit", "-m", `source ${crashPoint}`]);
      const sealedSourceSha = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
      gitForWorkspaceContract(repository, ["checkout", "main"]);

      const durableState: {
        crashPoint: typeof crashPoint;
        expectedTargetSha: string;
        sealedSourceSha: string;
        state: "validating" | "applying" | "committed";
        mergeCommitSha?: string;
      } = {
        crashPoint,
        expectedTargetSha,
        sealedSourceSha,
        state: crashPoint === "before_apply" ? "validating" : "applying",
      };

      if (crashPoint === "during_merge") {
        gitForWorkspaceContract(repository, [
          "merge",
          "--no-ff",
          "--no-commit",
          sealedSourceSha,
        ]);
        assert.equal(
          gitForWorkspaceContract(repository, ["rev-parse", "MERGE_HEAD"]),
          sealedSourceSha,
          "the crash snapshot must contain the exact in-progress source",
        );
      } else if (crashPoint === "after_commit" || crashPoint === "before_receipt") {
        gitForWorkspaceContract(repository, [
          "merge",
          "--no-ff",
          "--no-edit",
          sealedSourceSha,
        ]);
        const mergeCommitSha = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
        if (crashPoint === "before_receipt") {
          durableState.state = "committed";
          durableState.mergeCommitSha = mergeCommitSha;
        }
      }
      await writeFile(durableStatePath, JSON.stringify(durableState));
      await assert.rejects(access(receiptPath), /ENOENT/);

      // A restart has no in-memory state: recovery begins only from the durable
      // record and current Git evidence in this newly created repository.
      const replayed = JSON.parse(
        await readFile(durableStatePath, "utf8"),
      ) as typeof durableState;
      const currentHead = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
      if (replayed.crashPoint === "before_apply") {
        assert.equal(currentHead, replayed.expectedTargetSha);
        assert.throws(
          () => gitForWorkspaceContract(repository, ["rev-parse", "--verify", "MERGE_HEAD"]),
          /needed a single revision|unknown revision|ambiguous argument/i,
        );
        observedOutcomes.set(crashPoint, "requeued_without_apply");
      } else if (replayed.crashPoint === "during_merge") {
        assert.equal(currentHead, replayed.expectedTargetSha);
        assert.equal(
          gitForWorkspaceContract(repository, ["rev-parse", "MERGE_HEAD"]),
          replayed.sealedSourceSha,
        );
        gitForWorkspaceContract(repository, ["merge", "--abort"]);
        assert.equal(gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]), replayed.expectedTargetSha);
        assert.equal(gitForWorkspaceContract(repository, ["status", "--porcelain"]), "");
        observedOutcomes.set(crashPoint, "owned_merge_aborted_and_requeued");
      } else {
        const mergeCommitSha = replayed.mergeCommitSha ?? currentHead;
        assert.equal(currentHead, mergeCommitSha);
        assert.deepEqual(
          gitForWorkspaceContract(repository, [
            "show",
            "-s",
            "--format=%P",
            mergeCommitSha,
          ]).split(" "),
          [replayed.expectedTargetSha, replayed.sealedSourceSha],
        );
        await writeFile(
          receiptPath,
          JSON.stringify({
            result: "merged",
            mergeCommitSha,
            recoveredFrom: replayed.crashPoint,
          }),
        );
        assert.deepEqual(
          JSON.parse(await readFile(receiptPath, "utf8")),
          {
            result: "merged",
            mergeCommitSha,
            recoveredFrom: replayed.crashPoint,
          },
        );
        observedOutcomes.set(crashPoint, "receipt_finalized_from_git_evidence");
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  assert.deepEqual(Object.fromEntries(observedOutcomes), {
    before_apply: "requeued_without_apply",
    during_merge: "owned_merge_aborted_and_requeued",
    after_commit: "receipt_finalized_from_git_evidence",
    before_receipt: "receipt_finalized_from_git_evidence",
  });
});

test("Workspace and Merge v1 Windows lease recovery distinguishes live and dead owners and rejects stale epochs", async () => {
  if (process.platform !== "win32") {
    assert.equal(
      windowsWorkspaceCapability(),
      "unsupported_fail_closed",
      "Windows lease-owner evidence is unavailable and must fail closed",
    );
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "orchestrator lease recovery "));
  const leasePath = join(root, "merge-lease.json");
  let owner: ReturnType<typeof spawn> | undefined;
  try {
    owner = spawn(
      process.execPath,
      ["-e", "console.log('READY'); setInterval(() => {}, 1000)"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForLine(owner, "READY");
    assert.ok(owner.pid);
    const initialLease = {
      leaseId: "lease-one",
      ownerPid: owner.pid,
      epoch: 7,
    };
    await writeFile(leasePath, JSON.stringify(initialLease));

    const processIsAlive = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    const acquireAfterRestart = async (expectedEpoch: number) => {
      const current = JSON.parse(await readFile(leasePath, "utf8")) as typeof initialLease;
      assert.equal(
        current.epoch,
        expectedEpoch,
        `stale lease epoch ${expectedEpoch} cannot mutate epoch ${current.epoch}`,
      );
      assert.equal(
        processIsAlive(current.ownerPid),
        false,
        "a live owner must retain the lease",
      );
      const replacement = {
        leaseId: "lease-two",
        ownerPid: process.pid,
        epoch: current.epoch + 1,
      };
      await writeFile(leasePath, JSON.stringify(replacement));
      return replacement;
    };

    const persistedLiveLease = JSON.parse(
      await readFile(leasePath, "utf8"),
    ) as typeof initialLease;
    assert.equal(processIsAlive(persistedLiveLease.ownerPid), true);
    await assert.rejects(
      acquireAfterRestart(7),
      /live owner must retain the lease/,
    );
    assert.deepEqual(JSON.parse(await readFile(leasePath, "utf8")), initialLease);

    await stopChild(owner);
    owner = undefined;
    assert.equal(processIsAlive(initialLease.ownerPid), false);
    const replacement = await acquireAfterRestart(7);
    assert.equal(replacement.epoch, 8, "replacement epochs are strictly monotonic");
    await assert.rejects(
      acquireAfterRestart(7),
      /stale lease epoch 7 cannot mutate epoch 8/,
    );
    assert.deepEqual(JSON.parse(await readFile(leasePath, "utf8")), replacement);
  } finally {
    if (owner) await stopChild(owner);
    await rm(root, { recursive: true, force: true });
  }
});

test("Workspace and Merge v1 Windows cleanup restart persists retry state and retains contended files", async () => {
  if (process.platform !== "win32") {
    assert.equal(
      windowsWorkspaceCapability(),
      "unsupported_fail_closed",
      "Windows cleanup-replay evidence is unavailable and must fail closed",
    );
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "orchestrator cleanup replay "));
  const ownedRoot = join(root, "owned");
  const cleanupTarget = join(ownedRoot, "contended.txt");
  const statePath = join(root, "workspace-attempt.json");
  let locker: ReturnType<typeof spawn> | undefined;
  try {
    await mkdir(ownedRoot, { recursive: true });
    await writeFile(cleanupTarget, "preserve until retry\n");
    await writeFile(
      statePath,
      JSON.stringify({
        state: "cleanup_pending",
        cleanup: { mode: "non_destructive", maxAttempts: 2, attemptOrdinal: 0 },
      }),
    );
    const quotedTarget = cleanupTarget.replace(/'/g, "''");
    locker = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$stream=[IO.File]::Open('${quotedTarget}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); [Console]::Out.WriteLine('READY'); Start-Sleep -Seconds 30; $stream.Dispose()`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForLine(locker, "READY");

    const first = JSON.parse(await readFile(statePath, "utf8")) as {
      state: string;
      cleanup: { mode: string; maxAttempts: number; attemptOrdinal: number };
    };
    first.cleanup.attemptOrdinal += 1;
    await writeFile(statePath, JSON.stringify(first));
    await assert.rejects(rm(cleanupTarget), /EPERM|EBUSY|permission|being used/i);

    // Simulate restart by discarding the object and reading the persisted retry
    // budget before attempting the next non-destructive cleanup.
    const replayed = JSON.parse(await readFile(statePath, "utf8")) as typeof first;
    assert.deepEqual(replayed.cleanup, {
      mode: "non_destructive",
      maxAttempts: 2,
      attemptOrdinal: 1,
    });
    assert.ok(replayed.cleanup.attemptOrdinal < replayed.cleanup.maxAttempts);
    replayed.cleanup.attemptOrdinal += 1;
    await writeFile(statePath, JSON.stringify(replayed));
    await stopChild(locker);
    locker = undefined;
    assert.equal(
      await readFile(cleanupTarget, "utf8"),
      "preserve until retry\n",
      "the failed non-force attempt retained the contended file",
    );
    await rm(cleanupTarget);
    await assert.rejects(access(cleanupTarget), /ENOENT/);
    assert.deepEqual(
      (JSON.parse(await readFile(statePath, "utf8")) as typeof first).cleanup,
      { mode: "non_destructive", maxAttempts: 2, attemptOrdinal: 2 },
    );
  } finally {
    if (locker) await stopChild(locker);
    await rm(root, { recursive: true, force: true });
  }
});

test("Workspace and Merge v1 Windows stale worktree metadata is quarantined non-destructively and containment is case-folded", async () => {
  if (process.platform !== "win32") {
    assert.equal(
      windowsWorkspaceCapability(),
      "unsupported_fail_closed",
      "Windows stale-metadata evidence is unavailable and must fail closed",
    );
    return;
  }

  const root = await mkdtemp(join(tmpdir(), "Orchestrator Mixed Case "));
  const repository = join(root, "Repository");
  const ownedRoot = join(root, "Owned WorkTrees");
  const workspace = join(ownedRoot, "Run-One", "Attempt-One");
  const quarantineEvidence = join(root, "quarantine-evidence.json");
  try {
    await mkdir(repository, { recursive: true });
    await mkdir(ownedRoot, { recursive: true });
    gitForWorkspaceContract(repository, ["init", "-b", "main"]);
    gitForWorkspaceContract(repository, ["config", "user.email", "metadata@example.invalid"]);
    gitForWorkspaceContract(repository, ["config", "user.name", "Metadata Test"]);
    await writeFile(join(repository, "base.txt"), "base\n");
    gitForWorkspaceContract(repository, ["add", "base.txt"]);
    gitForWorkspaceContract(repository, ["commit", "-m", "base"]);
    gitForWorkspaceContract(repository, [
      "worktree",
      "add",
      "-b",
      "orchestrator/attempt/run-one/attempt-one",
      workspace,
      "HEAD",
    ]);

    assert.equal(
      windowsPathContained(ownedRoot.toUpperCase(), workspace.toLowerCase()),
      true,
      "mixed-case spelling still resolves inside the owned root",
    );
    assert.equal(
      windowsPathContained(
        ownedRoot.toUpperCase(),
        `${ownedRoot.toLowerCase()}-sibling\\Run-One\\Attempt-One`,
      ),
      false,
      "mixed-case sibling-prefix paths remain outside containment",
    );

    await rm(workspace, { recursive: true, force: true });
    await assert.rejects(access(workspace), /ENOENT/);
    const metadataBefore = gitForWorkspaceContract(repository, [
      "worktree",
      "list",
      "--porcelain",
    ]);
    assert.match(metadataBefore, /worktree .*Attempt-One/i);
    assert.match(metadataBefore, /prunable/i);

    // No prune, force removal, ref deletion, or path recreation is attempted:
    // unreconciled metadata is retained and explicitly quarantined.
    await writeFile(
      quarantineEvidence,
      JSON.stringify({
        result: "quarantined",
        reason: "stale worktree metadata cannot be reconciled non-destructively",
        workspace,
      }),
    );
    const metadataAfter = gitForWorkspaceContract(repository, [
      "worktree",
      "list",
      "--porcelain",
    ]);
    assert.equal(metadataAfter, metadataBefore);
    assert.deepEqual(JSON.parse(await readFile(quarantineEvidence, "utf8")), {
      result: "quarantined",
      reason: "stale worktree metadata cannot be reconciled non-destructively",
      workspace,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function createWorkspaceLifecycleRepository(root: string, name = "Target Repository") {
  const repository = join(root, name);
  await mkdir(repository, { recursive: true });
  gitForWorkspaceContract(repository, ["init", "-b", "main"]);
  gitForWorkspaceContract(repository, ["config", "user.email", "workspace-lifecycle@example.invalid"]);
  gitForWorkspaceContract(repository, ["config", "user.name", "Workspace Lifecycle Test"]);
  await writeFile(join(repository, "base.txt"), "base\n");
  gitForWorkspaceContract(repository, ["add", "base.txt"]);
  gitForWorkspaceContract(repository, ["commit", "-m", "base"]);
  return repository;
}

async function productionWorkspaceInput(
  root: string,
  repository: string,
  runId: string,
  attemptId: string,
) {
  const baseSha = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
  const ownedRoot = join(
    root,
    "Owned Worktrees With Spaces And A Deliberately Long Windows Path Segment",
  );
  return {
    statePath: join(root, ".orchestrator", "runs", runId, "run.json"),
    repositoryPath: repository,
    ownedRoot,
    workspacePath: join(ownedRoot, runId, attemptId),
    projectId: "project-one",
    repositoryId: await repositoryIdentityV1(repository),
    changeId: "change-one",
    waveId: "wave-one",
    taskId: "task-one",
    runId,
    attemptId,
    plan: { planId: "plan-one", revision: 1, planBaseSha: baseSha },
    targetRef: "refs/heads/main",
    baseSha,
    cleanupMaxAttempts: 3,
  } as const;
}

function interruptWorkspaceLifecycleAt(expected: string) {
  return async (boundary: string) => {
    if (boundary === expected)
      throw new Error(`simulated process crash at ${boundary}`);
  };
}

async function managedStartupCrashFixture(
  root: string,
  label: string,
) {
  const repository = await createWorkspaceLifecycleRepository(
    root,
    `Managed Crash Target ${label}`,
  );
  const attemptId = `attempt-${label}`;
  const baseInput = await productionWorkspaceInput(
    root,
    repository,
    `run-${label}`,
    attemptId,
  );
  const ownedRoot = join(root, "w");
  const input = {
    ...baseInput,
    ownedRoot,
    workspacePath: join(ownedRoot, label),
  };
  const record = run([task(attemptId, "completed")], "completed");
  record.id = input.runId;
  record.project = { name: label, path: repository };
  record.finishedAt = new Date().toISOString();
  record.tasks[0].workspaceAttemptId =
    `workspace-${input.runId}-${input.attemptId}`;
  record.tasks[0].workspacePath = input.workspacePath;
  await mkdir(join(input.statePath, ".."), { recursive: true });
  await writeFile(input.statePath, JSON.stringify(record, null, 2), "utf8");
  return {
    input,
    repository,
    target: {
      head: gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
      ref: gitForWorkspaceContract(repository, ["symbolic-ref", "HEAD"]),
      status: gitForWorkspaceContract(repository, [
        "status",
        "--porcelain=v1",
        "-uall",
      ]),
      base: await readFile(join(repository, "base.txt"), "utf8"),
    },
  };
}

async function makeWorkspaceLeaseLookInterrupted(repository: string) {
  const directory = join(
    repository,
    ".git",
    "orchestrator-attempt-leases",
  );
  const entries = await readdir(directory);
  assert.equal(entries.length, 1);
  const path = join(directory, entries[0]);
  const lease = JSON.parse(await readFile(path, "utf8")) as {
    pid: number;
  };
  lease.pid = 2_147_483_647;
  await writeFile(path, JSON.stringify(lease), "utf8");
}

async function assertManagedTargetUnchanged(
  repository: string,
  expected: {
    head: string;
    ref: string;
    status: string;
    base: string;
  },
) {
  assert.equal(
    gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
    expected.head,
  );
  assert.equal(
    gitForWorkspaceContract(repository, ["symbolic-ref", "HEAD"]),
    expected.ref,
  );
  assert.equal(
    gitForWorkspaceContract(repository, [
      "status",
      "--porcelain=v1",
      "-uall",
    ]),
    expected.status,
  );
  assert.equal(await readFile(join(repository, "base.txt"), "utf8"), expected.base);
}

async function recoverManagedCrashFixture(
  fixture: Awaited<ReturnType<typeof managedStartupCrashFixture>>,
) {
  const diagnostics: string[] = [];
  await recoverPersistedRunForStartup(
    fixture.input.statePath,
    (message) => diagnostics.push(message),
  );
  assert.deepEqual(diagnostics, []);
  const record = JSON.parse(
    await readFile(fixture.input.statePath, "utf8"),
  ) as {
    workspaceAttempts: Array<{
      workspaceAttemptId: string;
      state: string;
      workspacePath: string;
      branchRef: string;
      evidenceRefs: string[];
    }>;
    workspaceAttemptEvents: Array<{
      state: string;
      workspaceAttemptId: string;
    }>;
    workspaceMutationAuthorityEvents: Array<{
      workspaceAttemptId: string;
      reason: string;
      authority: { headSha: string; leaseEpoch: number };
    }>;
  };
  const attempt = record.workspaceAttempts.find(
    (candidate) =>
      candidate.workspaceAttemptId ===
      `workspace-${fixture.input.runId}-${fixture.input.attemptId}`,
  );
  assert.ok(attempt);
  await assertManagedTargetUnchanged(
    fixture.repository,
    fixture.target,
  );
  return { attempt, record };
}

test("managed production startup crash matrix recovers or quarantines every persisted workspace boundary without touching target", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T005H production startup crash matrix requires a Windows verification host",
  );
  const root = await mkdtemp(
    join(tmpdir(), "orchestrator managed crash matrix "),
  );
  const matrix: Array<{
    boundary: string;
    state: string;
    evidence: string;
    artifact: string;
  }> = [];
  try {
    {
      const fixture = await managedStartupCrashFixture(
        root,
        "provisioning-intent",
      );
      await assert.rejects(
        provisionWorkspaceAttemptV1({
          ...fixture.input,
          onPersistedBoundary: interruptWorkspaceLifecycleAt(
            "provisioning_persisted",
          ),
        }),
        /simulated process crash at provisioning_persisted/,
      );
      const { attempt, record } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "quarantined");
      assert.ok(attempt.evidenceRefs.includes("recovery:ambiguous"));
      await assert.rejects(access(fixture.input.workspacePath), /ENOENT/);
      assert.deepEqual(
        record.workspaceAttemptEvents.map((event) => event.state),
        ["provisioning", "quarantined"],
      );
      matrix.push({
        boundary: "provisioning_intent",
        state: attempt.state,
        evidence: "recovery:ambiguous",
        artifact: "none_created",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(
        root,
        "provisioning-worktree",
      );
      await assert.rejects(
        provisionWorkspaceAttemptV1({
          ...fixture.input,
          onPersistedBoundary: interruptWorkspaceLifecycleAt("worktree_added"),
        }),
        /simulated process crash at worktree_added/,
      );
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "quarantined");
      assert.ok(attempt.evidenceRefs.includes("recovery:ambiguous"));
      assert.equal(
        gitForWorkspaceContract(fixture.input.workspacePath, [
          "rev-parse",
          "HEAD",
        ]),
        fixture.target.head,
      );
      matrix.push({
        boundary: "provisioning_worktree_before_marker_authority",
        state: attempt.state,
        evidence: "recovery:ambiguous",
        artifact: "worktree_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(
        root,
        "provisioning-marker",
      );
      await assert.rejects(
        provisionWorkspaceAttemptV1({
          ...fixture.input,
          onPersistedBoundary: interruptWorkspaceLifecycleAt(
            "ownership_marker_persisted",
          ),
        }),
        /simulated process crash at ownership_marker_persisted/,
      );
      const markerPath = join(
        gitForWorkspaceContract(fixture.input.workspacePath, [
          "rev-parse",
          "--absolute-git-dir",
        ]),
        "orchestrator-owner-v1.json",
      );
      const markerBeforeRecovery = await readFile(markerPath, "utf8");
      const workspaceBeforeRecovery = {
        head: gitForWorkspaceContract(fixture.input.workspacePath, [
          "rev-parse",
          "HEAD",
        ]),
        ref: gitForWorkspaceContract(fixture.input.workspacePath, [
          "symbolic-ref",
          "HEAD",
        ]),
        status: gitForWorkspaceContract(fixture.input.workspacePath, [
          "status",
          "--porcelain=v1",
          "-uall",
        ]),
        base: await readFile(
          join(fixture.input.workspacePath, "base.txt"),
          "utf8",
        ),
      };
      const beforeRecovery = JSON.parse(
        await readFile(fixture.input.statePath, "utf8"),
      ) as {
        workspaceAttemptEvents: Array<{ state: string }>;
        workspaceMutationAuthorities?: unknown[];
        workspaceMutationAuthorityEvents?: unknown[];
      };
      assert.deepEqual(
        beforeRecovery.workspaceAttemptEvents.map((event) => event.state),
        ["provisioning"],
      );
      assert.deepEqual(beforeRecovery.workspaceMutationAuthorities ?? [], []);
      assert.deepEqual(
        beforeRecovery.workspaceMutationAuthorityEvents ?? [],
        [],
      );
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt, record } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "quarantined");
      assert.ok(attempt.evidenceRefs.includes("recovery:ambiguous"));
      assert.deepEqual(
        record.workspaceAttemptEvents.map((event) => event.state),
        ["provisioning", "quarantined"],
      );
      assert.deepEqual(record.workspaceMutationAuthorityEvents ?? [], []);
      assert.equal(await readFile(markerPath, "utf8"), markerBeforeRecovery);
      assert.equal(
        gitForWorkspaceContract(fixture.input.workspacePath, [
          "rev-parse",
          "HEAD",
        ]),
        workspaceBeforeRecovery.head,
      );
      assert.equal(
        gitForWorkspaceContract(fixture.input.workspacePath, [
          "symbolic-ref",
          "HEAD",
        ]),
        workspaceBeforeRecovery.ref,
      );
      assert.equal(
        gitForWorkspaceContract(fixture.input.workspacePath, [
          "status",
          "--porcelain=v1",
          "-uall",
        ]),
        workspaceBeforeRecovery.status,
      );
      assert.equal(
        await readFile(join(fixture.input.workspacePath, "base.txt"), "utf8"),
        workspaceBeforeRecovery.base,
      );
      matrix.push({
        boundary: "ownership_marker_before_authority",
        state: attempt.state,
        evidence: "recovery:ambiguous",
        artifact: "owned_marker_worktree_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(
        root,
        "provisioning-authority",
      );
      await assert.rejects(
        provisionWorkspaceAttemptV1({
          ...fixture.input,
          onPersistedBoundary: interruptWorkspaceLifecycleAt(
            "provisioning_authority_persisted",
          ),
        }),
        /simulated process crash at provisioning_authority_persisted/,
      );
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt, record } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "active");
      assert.ok(
        attempt.evidenceRefs.includes("recovery:reconciled:active"),
      );
      assert.deepEqual(
        record.workspaceMutationAuthorityEvents.map((event) => event.reason),
        ["provisioned", "lease_takeover"],
      );
      matrix.push({
        boundary: "provisioning_authority_before_activation",
        state: attempt.state,
        evidence: "recovery:reconciled:active",
        artifact: "owned_worktree_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(root, "executor");
      const active = await provisionWorkspaceAttemptV1(fixture.input);
      const dirtyArtifact = join(active.workspacePath, "executor-partial.txt");
      await assert.rejects(
        executeInWorkspaceAttemptV1(
          fixture.input.statePath,
          fixture.repository,
          active.workspaceAttemptId,
          {
            executable: process.execPath,
            args: [
              "-e",
              `require('node:fs').writeFileSync(${JSON.stringify(
                dirtyArtifact,
              )}, 'partial executor output\\n')`,
            ],
          },
          interruptWorkspaceLifecycleAt("executor_returned"),
        ),
        /simulated process crash at executor_returned/,
      );
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt, record } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "active");
      assert.equal(
        await readFile(dirtyArtifact, "utf8"),
        "partial executor output\n",
      );
      assert.match(
        gitForWorkspaceContract(active.workspacePath, [
          "status",
          "--porcelain=v1",
          "-uall",
        ]),
        /executor-partial\.txt/,
      );
      assert.equal(
        record.workspaceAttemptEvents.at(-1)?.state,
        "active",
      );
      matrix.push({
        boundary: "executor_returned_with_dirty_artifact",
        state: attempt.state,
        evidence: "canonical_active_event",
        artifact: "dirty_owned_artifact_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(
        root,
        "checkpoint-before-commit",
      );
      const active = await provisionWorkspaceAttemptV1(fixture.input);
      const artifact = join(active.workspacePath, "staged.txt");
      await writeFile(artifact, "staged checkpoint\n");
      await assert.rejects(
        checkpointWorkspaceAttemptV1(
          fixture.input.statePath,
          fixture.repository,
          active.workspaceAttemptId,
          ["staged.txt"],
          "checkpoint staged",
          interruptWorkspaceLifecycleAt("checkpoint_staged"),
        ),
        /simulated process crash at checkpoint_staged/,
      );
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt, record } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "active");
      assert.equal(await readFile(artifact, "utf8"), "staged checkpoint\n");
      assert.match(
        gitForWorkspaceContract(active.workspacePath, ["status", "--short"]),
        /^A  staged\.txt$/m,
      );
      assert.deepEqual(
        record.workspaceMutationAuthorityEvents.map((event) => event.reason),
        ["provisioned", "lease_takeover"],
      );
      matrix.push({
        boundary: "checkpoint_before_commit",
        state: attempt.state,
        evidence: "lease_takeover_without_checkpoint_authority",
        artifact: "staged_owned_artifact_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(
        root,
        "checkpoint-after-commit",
      );
      const active = await provisionWorkspaceAttemptV1(fixture.input);
      const artifact = join(active.workspacePath, "committed.txt");
      await writeFile(artifact, "committed checkpoint\n");
      await assert.rejects(
        checkpointWorkspaceAttemptV1(
          fixture.input.statePath,
          fixture.repository,
          active.workspaceAttemptId,
          ["committed.txt"],
          "checkpoint committed",
          interruptWorkspaceLifecycleAt("checkpoint_committed"),
        ),
        /simulated process crash at checkpoint_committed/,
      );
      const committedHead = gitForWorkspaceContract(active.workspacePath, [
        "rev-parse",
        "HEAD",
      ]);
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt, record } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "quarantined");
      assert.ok(attempt.evidenceRefs.includes("recovery:ambiguous"));
      assert.equal(
        gitForWorkspaceContract(active.workspacePath, ["rev-parse", "HEAD"]),
        committedHead,
      );
      assert.deepEqual(
        record.workspaceMutationAuthorityEvents.map((event) => event.reason),
        ["provisioned", "lease_takeover"],
      );
      matrix.push({
        boundary: "checkpoint_commit_before_authority",
        state: attempt.state,
        evidence: "recovery:ambiguous",
        artifact: "unacknowledged_commit_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(
        root,
        "checkpoint-after-authority",
      );
      const active = await provisionWorkspaceAttemptV1(fixture.input);
      await writeFile(
        join(active.workspacePath, "authorized.txt"),
        "authorized checkpoint\n",
      );
      await assert.rejects(
        checkpointWorkspaceAttemptV1(
          fixture.input.statePath,
          fixture.repository,
          active.workspaceAttemptId,
          ["authorized.txt"],
          "checkpoint authorized",
          interruptWorkspaceLifecycleAt(
            "checkpoint_authority_persisted",
          ),
        ),
        /simulated process crash at checkpoint_authority_persisted/,
      );
      const authorizedHead = gitForWorkspaceContract(active.workspacePath, [
        "rev-parse",
        "HEAD",
      ]);
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt, record } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "active");
      assert.deepEqual(
        record.workspaceMutationAuthorityEvents.map((event) => event.reason),
        ["provisioned", "checkpoint", "lease_takeover"],
      );
      assert.equal(
        record.workspaceMutationAuthorityEvents.at(-1)?.authority.headSha,
        authorizedHead,
      );
      matrix.push({
        boundary: "checkpoint_authority_persisted",
        state: attempt.state,
        evidence: "checkpoint_then_lease_takeover",
        artifact: "acknowledged_commit_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(root, "sealing");
      const active = await provisionWorkspaceAttemptV1(fixture.input);
      await assert.rejects(
        sealWorkspaceAttemptV1(
          fixture.input.statePath,
          fixture.repository,
          active.workspaceAttemptId,
          interruptWorkspaceLifecycleAt("sealed_persisted"),
        ),
        /simulated process crash at sealed_persisted/,
      );
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "sealed");
      assert.ok(
        attempt.evidenceRefs.some((reference) =>
          reference.startsWith("git:sealed:"),
        ),
      );
      matrix.push({
        boundary: "sealing_persisted",
        state: attempt.state,
        evidence: "git:sealed",
        artifact: "sealed_worktree_retained",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(root, "cleanup");
      const active = await provisionWorkspaceAttemptV1(fixture.input);
      await assert.rejects(
        cleanupWorkspaceAttemptV1(
          fixture.input.statePath,
          fixture.repository,
          active.workspaceAttemptId,
          interruptWorkspaceLifecycleAt("cleanup_worktree_removed"),
        ),
        /simulated process crash at cleanup_worktree_removed/,
      );
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "cleaned");
      assert.ok(
        attempt.evidenceRefs.includes("cleanup:non-force-removed"),
      );
      await assert.rejects(access(active.workspacePath), /ENOENT/);
      matrix.push({
        boundary: "cleanup_after_non_force_removal",
        state: attempt.state,
        evidence: "cleanup:non-force-removed",
        artifact: "owned_worktree_removed",
      });
    }

    {
      const fixture = await managedStartupCrashFixture(
        root,
        "contradictory-one-sided",
      );
      const active = await provisionWorkspaceAttemptV1(fixture.input);
      const sealed = await sealWorkspaceAttemptV1(
        fixture.input.statePath,
        fixture.repository,
        active.workspaceAttemptId,
      );
      gitForWorkspaceContract(fixture.repository, [
        "update-ref",
        sealed.branchRef,
        sealed.baseSha,
      ]);
      const contradictoryRef = gitForWorkspaceContract(fixture.repository, [
        "rev-parse",
        sealed.branchRef,
      ]);
      await rm(sealed.workspacePath, { recursive: true, force: true });
      await makeWorkspaceLeaseLookInterrupted(fixture.repository);
      const { attempt } = await recoverManagedCrashFixture(fixture);
      assert.equal(attempt.state, "quarantined");
      assert.ok(attempt.evidenceRefs.includes("recovery:ambiguous"));
      assert.equal(
        gitForWorkspaceContract(fixture.repository, [
          "rev-parse",
          sealed.branchRef,
        ]),
        contradictoryRef,
      );
      matrix.push({
        boundary: "contradictory_one_sided_persistence",
        state: attempt.state,
        evidence: "recovery:ambiguous",
        artifact: "contradictory_branch_retained",
      });
    }

    assert.deepEqual(matrix, [
      {
        boundary: "provisioning_intent",
        state: "quarantined",
        evidence: "recovery:ambiguous",
        artifact: "none_created",
      },
      {
        boundary: "provisioning_worktree_before_marker_authority",
        state: "quarantined",
        evidence: "recovery:ambiguous",
        artifact: "worktree_retained",
      },
      {
        boundary: "ownership_marker_before_authority",
        state: "quarantined",
        evidence: "recovery:ambiguous",
        artifact: "owned_marker_worktree_retained",
      },
      {
        boundary: "provisioning_authority_before_activation",
        state: "active",
        evidence: "recovery:reconciled:active",
        artifact: "owned_worktree_retained",
      },
      {
        boundary: "executor_returned_with_dirty_artifact",
        state: "active",
        evidence: "canonical_active_event",
        artifact: "dirty_owned_artifact_retained",
      },
      {
        boundary: "checkpoint_before_commit",
        state: "active",
        evidence: "lease_takeover_without_checkpoint_authority",
        artifact: "staged_owned_artifact_retained",
      },
      {
        boundary: "checkpoint_commit_before_authority",
        state: "quarantined",
        evidence: "recovery:ambiguous",
        artifact: "unacknowledged_commit_retained",
      },
      {
        boundary: "checkpoint_authority_persisted",
        state: "active",
        evidence: "checkpoint_then_lease_takeover",
        artifact: "acknowledged_commit_retained",
      },
      {
        boundary: "sealing_persisted",
        state: "sealed",
        evidence: "git:sealed",
        artifact: "sealed_worktree_retained",
      },
      {
        boundary: "cleanup_after_non_force_removal",
        state: "cleaned",
        evidence: "cleanup:non-force-removed",
        artifact: "owned_worktree_removed",
      },
      {
        boundary: "contradictory_one_sided_persistence",
        state: "quarantined",
        evidence: "recovery:ambiguous",
        artifact: "contradictory_branch_retained",
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("WorkspaceAttemptV1 production lifecycle persists, executes, checkpoints, seals, and replays 100+ commits without touching target", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator production workspace "));
  try {
    const repository = await createWorkspaceLifecycleRepository(root);
    const input = await productionWorkspaceInput(root, repository, "run-production", "attempt-production");
    const targetBefore = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
    const attempt = await provisionWorkspaceAttemptV1(input);
    assert.equal(attempt.state, "active");
    assert.equal(
      attempt.branchRef,
      "refs/heads/orchestrator/attempt/run-production/attempt-production",
    );
    assert.ok(input.workspacePath.length > 100);
    assert.equal(
      workspacePathContainedV1(input.ownedRoot.toUpperCase(), input.workspacePath.toLowerCase()),
      true,
    );
    assert.equal(
      workspacePathContainedV1(input.ownedRoot, `${input.ownedRoot}-sibling\\attempt`),
      false,
    );

    const worker = await executeInWorkspaceAttemptV1(
      input.statePath,
      repository,
      attempt.workspaceAttemptId,
      {
        executable: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync('worker.txt', 'worker ran in owned workspace\\n')",
        ],
      },
    );
    assert.equal(worker.cwd, input.workspacePath);
    await checkpointWorkspaceAttemptV1(
      input.statePath,
      repository,
      attempt.workspaceAttemptId,
      ["worker.txt"],
      "worker checkpoint",
    );
    const verification = await executeInWorkspaceAttemptV1(
      input.statePath,
      repository,
      attempt.workspaceAttemptId,
      { executable: "git", args: ["status", "--porcelain=v1", "-uall"] },
    );
    assert.equal(verification.cwd, input.workspacePath);
    assert.equal(verification.output, "");

    for (let index = 1; index <= 101; index += 1) {
      await executeInWorkspaceAttemptV1(
        input.statePath,
        repository,
        attempt.workspaceAttemptId,
        {
          executable: "git",
          args: ["commit", "--allow-empty", "-m", `intermediate ${index}`],
        },
      );
    }
    const sealed = await sealWorkspaceAttemptV1(
      input.statePath,
      repository,
      attempt.workspaceAttemptId,
    );
    assert.equal(sealed.state, "sealed");
    assert.equal(
      sealed.sealedSourceSha,
      gitForWorkspaceContract(input.workspacePath, ["rev-parse", "HEAD"]),
    );
    assert.equal(
      Number(
        gitForWorkspaceContract(input.workspacePath, [
          "rev-list",
          "--count",
          `${targetBefore}..${sealed.sealedSourceSha}`,
        ]),
      ),
      102,
    );
    assert.equal(gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]), targetBefore);
    assert.equal(gitForWorkspaceContract(repository, ["symbolic-ref", "HEAD"]), "refs/heads/main");
    assert.equal(
      gitForWorkspaceContract(repository, ["rev-parse", sealed.branchRef]),
      sealed.sealedSourceSha,
    );

    const record = JSON.parse(await readFile(input.statePath, "utf8")) as {
      workspaceAttempts: unknown[];
      workspaceAttemptEvents: Array<Record<string, unknown>>;
      mergeRequests?: unknown[];
      mergeReceipts?: unknown[];
    };
    assert.equal(record.workspaceAttempts.length, 1);
    assert.deepEqual(
      record.workspaceAttemptEvents.map((event) => event.state),
      ["provisioning", "active", "sealed"],
    );
    assert.equal(record.mergeRequests, undefined);
    assert.equal(record.mergeReceipts, undefined);
    const replayed = replayWorkspaceAttemptEventsV1(
      record.workspaceAttemptEvents as never,
    );
    assert.equal(replayed.get(attempt.workspaceAttemptId)?.sealedSourceSha, sealed.sealedSourceSha);

    const conflicting = structuredClone(record.workspaceAttemptEvents);
    conflicting[1].previousState = null;
    assert.throws(
      () => replayWorkspaceAttemptEventsV1(conflicting as never),
      /hash mismatch|Conflicting|Invalid workspace transition/,
    );
    const partial = structuredClone(record.workspaceAttemptEvents);
    delete partial[0].attempt;
    assert.throws(
      () => replayWorkspaceAttemptEventsV1(partial as never),
      /hash mismatch|Invalid WorkspaceAttemptV1|Cannot read|properties of undefined/i,
    );
    const unknownVersion = structuredClone(record.workspaceAttemptEvents);
    unknownVersion[0].contractVersion = "2.0";
    assert.throws(
      () => replayWorkspaceAttemptEventsV1(unknownVersion as never),
      /Invalid workspace event envelope/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("WorkspaceAttemptV1 production entry points fail closed on collisions, marker drift, live leases, and stale metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator production recovery "));
  let leaseOwner: ReturnType<typeof spawn> | undefined;
  try {
    const repository = await createWorkspaceLifecycleRepository(root);
    const input = await productionWorkspaceInput(root, repository, "run-recovery", "attempt-recovery");
    const attempt = await provisionWorkspaceAttemptV1(input);

    await assert.rejects(
      provisionWorkspaceAttemptV1(input),
      /Workspace path already exists|Attempt branch already exists/,
    );
    await writeFile(join(repository, "target-dirty.txt"), "target stays protected\n");
    const dirtyInput = await productionWorkspaceInput(root, repository, "run-dirty-target", "attempt-dirty-target");
    await assert.rejects(
      provisionWorkspaceAttemptV1(dirtyInput),
      /Target worktree is not clean/,
    );
    await rm(join(repository, "target-dirty.txt"));

    const leaseDirectory = join(repository, ".git", "orchestrator-attempt-leases");
    const [leaseName] = await readdir(leaseDirectory);
    const leasePath = join(leaseDirectory, leaseName);
    leaseOwner = spawn(
      process.execPath,
      ["-e", "console.log('READY'); setInterval(() => {}, 1000)"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForLine(leaseOwner, "READY");
    const liveLease = JSON.parse(await readFile(leasePath, "utf8")) as {
      pid: number;
      epoch: number;
    };
    liveLease.pid = leaseOwner.pid!;
    liveLease.epoch = 7;
    await writeFile(leasePath, JSON.stringify(liveLease));
    await assert.rejects(
      recoverWorkspaceAttemptLeaseV1(repository, attempt),
      /live owner still holds/,
    );
    await stopChild(leaseOwner);
    leaseOwner = undefined;
    assert.equal(await recoverWorkspaceAttemptLeaseV1(repository, attempt), 8);
    assert.equal(
      (JSON.parse(await readFile(leasePath, "utf8")) as { epoch: number }).epoch,
      8,
    );

    const privateGitDirectory = gitForWorkspaceContract(input.workspacePath, [
      "rev-parse",
      "--absolute-git-dir",
    ]);
    const markerPath = join(privateGitDirectory, "orchestrator-owner-v1.json");
    const marker = JSON.parse(await readFile(markerPath, "utf8")) as {
      creationNonce: string;
    };
    marker.creationNonce = "tampered";
    await writeFile(markerPath, JSON.stringify(marker));
    await assert.rejects(
      executeInWorkspaceAttemptV1(
        input.statePath,
        repository,
        attempt.workspaceAttemptId,
        { executable: "git", args: ["status", "--porcelain"] },
      ),
      /Ownership marker/,
    );
    const quarantined = await recoverWorkspaceAttemptV1(
      input.statePath,
      repository,
      attempt.workspaceAttemptId,
    );
    assert.equal(quarantined.state, "quarantined");

    const staleRepository = await createWorkspaceLifecycleRepository(root, "Stale Repository");
    const staleInput = await productionWorkspaceInput(root, staleRepository, "run-stale", "attempt-stale");
    const staleAttempt = await provisionWorkspaceAttemptV1(staleInput);
    await rm(staleInput.workspacePath, { recursive: true, force: true });
    const metadataBefore = gitForWorkspaceContract(staleRepository, [
      "worktree",
      "list",
      "--porcelain",
    ]);
    assert.match(metadataBefore, /prunable/i);
    const staleResult = await recoverWorkspaceAttemptV1(
      staleInput.statePath,
      staleRepository,
      staleAttempt.workspaceAttemptId,
    );
    assert.equal(staleResult.state, "quarantined");
    assert.equal(
      gitForWorkspaceContract(staleRepository, ["worktree", "list", "--porcelain"]),
      metadataBefore,
      "recovery must not globally prune stale metadata",
    );
  } finally {
    if (leaseOwner) await stopChild(leaseOwner);
    await rm(root, { recursive: true, force: true });
  }
});

test("WorkspaceAttemptV1 Windows production cleanup retains dirty/contended artifacts and rejects junction escapes", async () => {
  assert.equal(process.platform, "win32", "T005 Windows invariants require a Windows verification host");
  const root = await mkdtemp(join(tmpdir(), "orchestrator production windows "));
  let locker: ReturnType<typeof spawn> | undefined;
  try {
    const repository = await createWorkspaceLifecycleRepository(root);
    const input = await productionWorkspaceInput(root, repository, "run-cleanup", "attempt-cleanup");
    const attempt = await provisionWorkspaceAttemptV1(input);

    await writeFile(join(input.workspacePath, "uncommitted-user-file.txt"), "preserve me\n");
    const retained = await cleanupWorkspaceAttemptV1(
      input.statePath,
      repository,
      attempt.workspaceAttemptId,
    );
    assert.equal(retained.state, "recovery_pending");
    assert.equal(retained.cleanup.attemptOrdinal, 1);
    assert.equal(
      await readFile(join(input.workspacePath, "uncommitted-user-file.txt"), "utf8"),
      "preserve me\n",
    );

    const contendedRepository = await createWorkspaceLifecycleRepository(root, "Contended Repository");
    const contendedInput = await productionWorkspaceInput(root, contendedRepository, "run-contended", "attempt-contended");
    const contendedAttempt = await provisionWorkspaceAttemptV1(contendedInput);
    const lockedFile = join(contendedInput.workspacePath, "base.txt");
    const quotedLockedFile = lockedFile.replace(/'/g, "''");
    locker = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `$stream=[IO.File]::Open('${quotedLockedFile}',[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None); [Console]::Out.WriteLine('READY'); Start-Sleep -Seconds 30; $stream.Dispose()`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await waitForLine(locker, "READY");
    const contended = await cleanupWorkspaceAttemptV1(
      contendedInput.statePath,
      contendedRepository,
      contendedAttempt.workspaceAttemptId,
    );
    assert.equal(contended.state, "recovery_pending");
    assert.equal(contended.cleanup.attemptOrdinal, 1);
    await access(lockedFile);
    await stopChild(locker);
    locker = undefined;
    assert.equal((await readFile(lockedFile, "utf8")).replace(/\r\n/g, "\n"), "base\n");
    const cleaned = await cleanupWorkspaceAttemptV1(
      contendedInput.statePath,
      contendedRepository,
      contendedAttempt.workspaceAttemptId,
    );
    assert.equal(cleaned.state, "cleaned");
    assert.equal(cleaned.cleanup.attemptOrdinal, 2);
    assert.equal(
      new Set(cleaned.evidenceRefs).size,
      cleaned.evidenceRefs.length,
      "cleanup retry evidence remains canonically unique",
    );
    assert.equal(
      cleaned.evidenceRefs.filter((reference) => reference === "cleanup:requested").length,
      1,
      "cleanup retry reuses the original request evidence",
    );
    assert.ok(
      cleaned.evidenceRefs.includes("cleanup:dirty-retained") ||
        cleaned.evidenceRefs.includes("cleanup:non-force-failed"),
      "cleanup retry preserves the original retention evidence",
    );
    assert.ok(cleaned.evidenceRefs.includes("cleanup:non-force-removed"));
    await assert.rejects(access(contendedInput.workspacePath), /ENOENT/);
    assert.equal(
      gitForWorkspaceContract(contendedRepository, [
        "show-ref",
        "--verify",
        "--quiet",
        contendedAttempt.branchRef,
      ]),
      "",
      "cleanup retains the attempt branch for the deferred merge phase",
    );

    const junctionRepository = await createWorkspaceLifecycleRepository(root, "Junction Repository");
    const junctionInput = await productionWorkspaceInput(root, junctionRepository, "run-junction", "attempt-junction");
    const outside = join(root, "Outside Owned Root");
    await mkdir(junctionInput.ownedRoot, { recursive: true });
    await mkdir(outside, { recursive: true });
    const junction = join(junctionInput.ownedRoot, "run-junction");
    try {
      execFileSync(process.env.ComSpec ?? "cmd.exe", [
        "/d",
        "/c",
        "mklink",
        "/J",
        junction,
        outside,
      ], { stdio: "pipe" });
    } catch (error) {
      assert.fail(`Junction capability unavailable; production must fail closed: ${String(error)}`);
    }
    await assert.rejects(
      provisionWorkspaceAttemptV1(junctionInput),
      /symbolic link|junction|resolves outside/,
    );
    await assert.rejects(access(junctionInput.statePath), /ENOENT/);
  } finally {
    if (locker) await stopChild(locker);
    await rm(root, { recursive: true, force: true });
  }
});

test("managed Phase 2 tasks run concurrently only in canonical owned workspaces and restart-replay exact authority", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T005E production routing requires a Windows verification host",
  );
  const root = await mkdtemp(join(tmpdir(), "orchestrator managed workspace "));
  const repository = await createWorkspaceLifecycleRepository(
    root,
    "Managed Target",
  );
  const targetHead = gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]);
  const targetRef = gitForWorkspaceContract(repository, [
    "symbolic-ref",
    "HEAD",
  ]);
  const repositoryId = await repositoryIdentityV1(repository);
  const suffix = createHash("sha256")
    .update(root)
    .digest("hex")
    .slice(0, 12);
  const changeId = `managed-change-${suffix}`;
  const waveId = `managed-wave-${suffix}`;
  const taskIds = [`managed-one-${suffix}`, `managed-two-${suffix}`];
  const fakeCodex = join(root, "fake-codex.cjs");
  const invocationTrace = join(root, "managed-invocations.jsonl");
  const correctionMarker = join(root, "managed-one-corrected");
  const previousCodexBin = process.env.CODEX_BIN;
  const previousTestCodexScript =
    process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT;
  let server: ReturnType<typeof app.listen> | undefined;
  let profileId = "";
  try {
    await writeFile(
      fakeCodex,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "let prompt = '';",
        "process.stdin.setEncoding('utf8');",
        "process.stdin.on('data', (chunk) => prompt += chunk);",
        "process.stdin.on('end', () => {",
        "  const args = process.argv.slice(2);",
        "  const outputIndex = args.indexOf('--output-last-message');",
        "  const output = args[outputIndex + 1];",
        "  const name = prompt.includes('managed-one.txt') ? 'managed-one.txt' : 'managed-two.txt';",
        `  const trace = ${JSON.stringify(invocationTrace)};`,
        `  const correctionMarker = ${JSON.stringify(correctionMarker)};`,
        "  const reviewer = prompt.startsWith('Review only the authoritative task change set');",
        "  const correction = prompt.includes('Reviewer found these issues:');",
        "  const phase = reviewer ? 'reviewer' : correction ? 'correction' : 'executor';",
        "  fs.appendFileSync(trace, JSON.stringify({ phase, name, cwd: process.cwd() }) + '\\n');",
        "  if (reviewer) {",
        "    const requestCorrection = name === 'managed-one.txt' && !fs.existsSync(correctionMarker);",
        "    fs.writeFileSync(output, requestCorrection ? 'VERDICT: CHANGES_REQUESTED\\nCorrect managed-one.\\n' : 'VERDICT: APPROVED\\n');",
        "    return;",
        "  }",
        "  fs.writeFileSync(path.join(process.cwd(), name), `owned:${name}:${phase}\\n`);",
        "  if (correction) fs.writeFileSync(correctionMarker, 'corrected\\n');",
        "  fs.writeFileSync(output, 'ORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED\\n');",
        "});",
      ].join("\n"),
      "utf8",
    );
    process.env.CODEX_BIN = process.execPath;
    process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = fakeCodex;

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolveListen, rejectListen) => {
      server!.once("listening", resolveListen);
      server!.once("error", rejectListen);
    });
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const profileResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/projects`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: `Managed ${suffix}`,
          path: repository,
          verificationCommands: ["git diff --check"],
        }),
      },
    );
    assert.equal(profileResponse.status, 201);
    profileId = (await profileResponse.json() as { id: string }).id;

    await changeControlStore.create(profileId, {
      changeId,
      actor: "user:creator",
    });
    await changeControlStore.createWave(profileId, changeId, {
      waveId,
      actor: "user:creator",
      tasks: taskIds.map((taskId) => ({ taskId })),
    });
    const createdAt = new Date().toISOString();
    const planId = `managed-plan-${suffix}`;
    const contract: PlanningContractV1 = {
      contractType: "PlanningContractV1",
      contractVersion: "1.0",
      planId,
      revision: 1,
      projectId: profileId,
      changeId,
      waveId,
      predecessor: null,
      planBase: {
        repositoryId,
        sha: targetHead,
        hashAlgorithm: targetHead.length === 64 ? "sha256" : "sha1",
        ref: targetRef,
        capturedAt: createdAt,
        worktreeState: "clean",
      },
      taskPlans: taskIds.map((taskId, index) => ({
        taskId,
        acceptanceClaims: [{
          claimId: `claim-${index + 1}`,
          observableOutcome: `${taskId} writes only its owned result.`,
          oracle: {
            kind: "command",
            instruction: "git diff --check",
          },
          expectedEvidence: [{
            kind: "command_exit",
            description: "The exact verification command exits successfully.",
          }],
          failureSeverity: "blocking",
        }],
        blastRadius: {
          declaredWriteSet: [{
            path: index === 0 ? "managed-one.txt" : "managed-two.txt",
            mode: "create",
            evidenceRefs: [`queue:${taskId}`],
          }],
          dependencyImpacts: [],
          publicApiChanges: [],
          schemaMigrationEffects: [],
          externalSideEffects: [],
          impactedTests: [{
            description: `${taskId} production path`,
            evidenceRefs: [`test:${taskId}`],
          }],
          assessmentEvidenceRefs: [`assessment:${taskId}`],
        },
      })),
      replanTriggers: ["base_sha_changed", "unknown_drift"],
      createdAt,
      createdBy: "planner:managed-test",
      authorizationRequired: true,
    };
    await changeControlStore.publishPlanningContract(
      profileId,
      changeId,
      waveId,
      { contract },
    );
    await changeControlStore.publishPlanAuthorization(
      profileId,
      changeId,
      waveId,
      {
        authorization: {
          contractType: "PlanAuthorizationV1",
          contractVersion: "1.0",
          authorizationId: `managed-authorization-${suffix}`,
          projectId: profileId,
          changeId,
          waveId,
          plan: { planId, revision: 1, planBaseSha: targetHead },
          decision: "authorized",
          reason: "The exact managed plan and base are authorized.",
          decidedAt: new Date().toISOString(),
          decidedBy: "human:managed-reviewer",
        },
      },
    );
    await changeControlStore.dispatchWave(profileId, changeId, waveId, {
      actor: "user:managed-dispatcher",
    });

    const approvals = taskIds.map((taskId, index) => ({
      approvalId: `approval-${index + 1}-${suffix}`,
      intent: "apply" as const,
      technicalPermission: "reversible_local_write" as const,
      sideEffectRisk: "reversible_local_write" as const,
      allowedPaths: [index === 0 ? "managed-one.txt" : "managed-two.txt"],
      verificationCommands: ["git diff --check"],
    }));
    const queue = validateTaskQueue({
      project: {
        name: `Managed ${suffix}`,
        path: repository,
        approvedApplyContracts: approvals,
      },
      limits: {
        taskTimeoutMinutes: 1,
        reviewerTimeoutMinutes: 1,
        maxTaskRetries: 0,
        maxParallelTasks: 2,
      },
      git: { checkpointCommits: false },
      tasks: taskIds.map((taskId, index) => ({
        key: `managed-${index + 1}`,
        title: `Managed ${index + 1}`,
        prompt: `Write managed-${index + 1 === 1 ? "one" : "two"}.txt`,
        allowedPaths: approvals[index].allowedPaths,
        verificationCommands: approvals[index].verificationCommands,
        authorization: {
          enabled: true,
          intent: "apply",
          technicalPermission: "reversible_local_write",
          sideEffectRisk: "reversible_local_write",
          approvalId: approvals[index].approvalId,
        },
        workspace: {
          contractType: "ManagedWorkspaceBindingV1",
          contractVersion: "1.0",
          projectId: profileId,
          changeId,
          waveId,
          taskId,
        },
      })),
    });
    const run = createRun(queue);
    run.review.enabled = true;
    run.review.maxCorrections = 1;
    await executeQueue(run);
    const blockedTask = run.tasks.find((task) => task.status === "blocked");
    const completedTask = run.tasks.find((task) => task.status === "completed");
    assert.ok(blockedTask, JSON.stringify(run.tasks, null, 2));
    assert.ok(completedTask, JSON.stringify(run.tasks, null, 2));
    assert.equal(run.tasks.filter((task) => task.status === "blocked").length, 1);
    assert.equal(run.tasks.filter((task) => task.status === "completed").length, 1);

    const statePath = join(testDataDirectory, "runs", run.id, "run.json");
    const record = JSON.parse(await readFile(statePath, "utf8")) as {
      workspaceAttempts: Array<{ workspaceAttemptId: string; taskId: string; state: string; workspacePath: string }>;
      workspaceAttemptEvents: Parameters<typeof replayWorkspaceAttemptEventsV1>[0];
      workspaceMutationAuthorityEvents: Parameters<typeof replayWorkspaceMutationAuthorityEventsV1>[0];
      mergeRequests: Array<{
        mergeRequestId: string;
        workspaceAttemptId: string;
        taskId: string;
        state: string;
        expectedTargetSha: string;
        observedTargetSha?: string;
        sealedSourceSha: string;
        driftAssessmentId?: string;
        evidenceRefs: string[];
      }>;
      mergeReceipts: Array<{
        mergeRequestId: string;
        result: string;
        driftAssessmentId?: string;
        evidenceRefs: string[];
      }>;
    };
    assert.deepEqual(record.workspaceAttempts.map((attempt) => attempt.state).sort(), ["cleaned", "replan_required"]);
    assert.deepEqual(record.mergeRequests.map((request) => request.state).sort(), ["committed", "replan_required"]);
    assert.deepEqual(record.mergeReceipts.map((receipt) => receipt.result).sort(), ["merged", "replan_required"]);
    assert.equal(replayWorkspaceAttemptEventsV1(record.workspaceAttemptEvents).size, 2);
    assert.equal(replayWorkspaceMutationAuthorityEventsV1(record.workspaceMutationAuthorityEvents).size, 2);

    const replanRequest = record.mergeRequests.find((request) => request.state === "replan_required");
    assert.ok(replanRequest);
    assert.equal(replanRequest.taskId, blockedTask.workspace?.taskId);
    assert.notEqual(replanRequest.observedTargetSha, replanRequest.expectedTargetSha);
    const replanReceipt = record.mergeReceipts.find((receipt) => receipt.result === "replan_required");
    assert.ok(replanReceipt);
    assert.equal(replanReceipt.mergeRequestId, replanRequest.mergeRequestId);
    assert.equal(replanReceipt.driftAssessmentId, replanRequest.driftAssessmentId);
    const linkedEvidence = [
      `merge:request:${replanRequest.mergeRequestId}`,
      `merge:task:${replanRequest.taskId}`,
      `git:prior-head:${replanRequest.expectedTargetSha}`,
      `git:head:${replanRequest.observedTargetSha}`,
      `plan:${contract.planId}:${contract.revision}:${contract.planBase.sha}`,
      "requirement:architect-replan",
      "requirement:fresh-human-authorization",
    ];
    for (const reference of linkedEvidence) {
      assert.ok(replanRequest.evidenceRefs.includes(reference));
      assert.ok(replanReceipt.evidenceRefs.includes(reference));
    }
    assert.ok(replanRequest.evidenceRefs.some((reference) => reference.startsWith("merge:authorization:")));
    assert.ok(replanRequest.evidenceRefs.some((reference) => reference.startsWith("merge:dispatch-receipt:")));

    const projection = await changeControlStore.getPlanningProjection(profileId, changeId, waveId);
    const mergeDrift = projection.driftAssessments.find(
      (assessment) => assessment.assessmentId === replanRequest.driftAssessmentId,
    );
    assert.ok(mergeDrift);
    assert.equal(mergeDrift.status, "stale");
    assert.equal(mergeDrift.requiresReplan, true);
    for (const reference of linkedEvidence)
      assert.ok(mergeDrift.evidenceRefs.includes(reference));
    const replayedDrift =
      await changeControlStore.recordMergeTargetDrift(
        profileId,
        changeId,
        waveId,
        {
          actor: "merge-controller:v1",
          assessmentId: `ignored-replay-id-${suffix}`,
          plan: {
            planId: contract.planId,
            revision: contract.revision,
            planBaseSha: contract.planBase.sha,
          },
          taskId: replanRequest.taskId,
          mergeRequestId: replanRequest.mergeRequestId,
          expectedTargetSha: replanRequest.expectedTargetSha,
          observedTargetSha: replanRequest.observedTargetSha!,
          sealedSourceSha: replanRequest.sealedSourceSha,
        },
      );
    assert.deepEqual(replayedDrift, mergeDrift);
    await assert.rejects(
      changeControlStore.recordMergeTargetDrift(
        profileId,
        changeId,
        waveId,
        {
          actor: "merge-controller:v1",
          assessmentId: `conflicting-replay-id-${suffix}`,
          plan: {
            planId: contract.planId,
            revision: contract.revision,
            planBaseSha: contract.planBase.sha,
          },
          taskId: replanRequest.taskId,
          mergeRequestId: replanRequest.mergeRequestId,
          expectedTargetSha: replanRequest.expectedTargetSha,
          observedTargetSha: "f".repeat(
            replanRequest.observedTargetSha!.length,
          ),
          sealedSourceSha: replanRequest.sealedSourceSha,
        },
      ),
      /replay conflicts/,
    );

    const mergedPath = completedTask.allowedPaths?.[0];
    const blockedPath = blockedTask.allowedPaths?.[0];
    assert.ok(mergedPath);
    assert.ok(blockedPath);
    assert.notEqual(gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]), targetHead);
    assert.match(await readFile(join(repository, mergedPath), "utf8"), /^owned:/);
    await assert.rejects(access(join(repository, blockedPath)), /ENOENT/);
    assert.equal(gitForWorkspaceContract(repository, ["status", "--porcelain=v1", "-uall"]), "");

    const invocationRecords = (await readFile(invocationTrace, "utf8"))
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line) as { cwd: string });
    assert.ok(invocationRecords.length >= 5);
    for (const invocation of invocationRecords) {
      assert.notEqual(invocation.cwd, repository);
      assert.ok(record.workspaceAttempts.some((attempt) => attempt.workspacePath === invocation.cwd));
    }

    const crashRecord = JSON.parse(
      await readFile(statePath, "utf8"),
    ) as Record<string, unknown> & {
      workspaceAttempts: Array<Record<string, unknown>>;
      workspaceAttemptEvents: Array<{
        eventId: string;
        workspaceAttemptId: string;
        state: string;
        attempt: Record<string, unknown>;
      }>;
      mergeRequests: Array<Record<string, unknown> & {
        mergeRequestId: string;
        workspaceAttemptId: string;
        state: string;
      }>;
      mergeRequestEvents: Array<{
        eventId: string;
        mergeRequestId: string;
        state: string;
        request: Record<string, unknown>;
      }>;
      mergeReceipts: Array<{ mergeRequestId: string }>;
    };
    const terminalMergeEvent = crashRecord.mergeRequestEvents.at(-1);
    assert.equal(
      terminalMergeEvent?.mergeRequestId,
      replanRequest.mergeRequestId,
    );
    assert.equal(terminalMergeEvent?.state, "replan_required");
    crashRecord.mergeRequestEvents.pop();
    const priorMergeEvent = crashRecord.mergeRequestEvents
      .filter(
        (event) =>
          event.mergeRequestId === replanRequest.mergeRequestId,
      )
      .at(-1);
    assert.equal(priorMergeEvent?.state, "validating");
    crashRecord.mergeRequests = crashRecord.mergeRequests.map((request) =>
      request.mergeRequestId === replanRequest.mergeRequestId
        ? structuredClone(priorMergeEvent!.request)
        : request,
    ) as typeof crashRecord.mergeRequests;
    crashRecord.mergeReceipts = crashRecord.mergeReceipts.filter(
      (receipt) =>
        receipt.mergeRequestId !== replanRequest.mergeRequestId,
    );
    const replanAttempt = crashRecord.workspaceAttempts.find(
      (attempt) =>
        attempt.workspaceAttemptId ===
        replanRequest.workspaceAttemptId,
    );
    assert.ok(replanAttempt);
    const terminalWorkspaceEvent =
      crashRecord.workspaceAttemptEvents.at(-1);
    assert.equal(
      terminalWorkspaceEvent?.workspaceAttemptId,
      replanRequest.workspaceAttemptId,
    );
    assert.equal(terminalWorkspaceEvent?.state, "replan_required");
    crashRecord.workspaceAttemptEvents.pop();
    const priorWorkspaceEvent = crashRecord.workspaceAttemptEvents
      .filter(
        (event) =>
          event.workspaceAttemptId ===
          replanRequest.workspaceAttemptId,
      )
      .at(-1);
    assert.equal(priorWorkspaceEvent?.state, "merge_queued");
    crashRecord.workspaceAttempts =
      crashRecord.workspaceAttempts.map((attempt) =>
        attempt.workspaceAttemptId ===
        replanRequest.workspaceAttemptId
          ? structuredClone(priorWorkspaceEvent!.attempt)
          : attempt,
      );
    await writeFile(
      statePath,
      `${JSON.stringify(crashRecord, null, 2)}\n`,
      "utf8",
    );
    const targetBeforeStartup = gitForWorkspaceContract(repository, [
      "rev-parse",
      "HEAD",
    ]);
    const diagnostics: string[] = [];
    await recoverPersistedRunForStartup(statePath, (message) => diagnostics.push(message));
    assert.deepEqual(diagnostics, []);
    const afterStartup = JSON.parse(await readFile(statePath, "utf8")) as {
      workspaceAttempts: typeof record.workspaceAttempts;
      mergeRequests: typeof record.mergeRequests;
      mergeReceipts: typeof record.mergeReceipts;
    };
    assert.equal(
      afterStartup.workspaceAttempts.find(
        (attempt) =>
          attempt.workspaceAttemptId ===
          replanRequest.workspaceAttemptId,
      )?.state,
      "replan_required",
    );
    assert.equal(
      afterStartup.mergeRequests.find(
        (request) =>
          request.mergeRequestId === replanRequest.mergeRequestId,
      )?.state,
      "replan_required",
    );
    assert.equal(
      afterStartup.mergeReceipts.filter(
        (receipt) =>
          receipt.mergeRequestId === replanRequest.mergeRequestId,
      ).length,
      1,
    );
    const afterFirstStartup = JSON.stringify(afterStartup);
    const repeatedDiagnostics: string[] = [];
    await recoverPersistedRunForStartup(statePath, (message) =>
      repeatedDiagnostics.push(message),
    );
    assert.deepEqual(repeatedDiagnostics, []);
    assert.equal(
      JSON.stringify(JSON.parse(await readFile(statePath, "utf8"))),
      afterFirstStartup,
    );
    const afterProjection =
      await changeControlStore.getPlanningProjection(
        profileId,
        changeId,
        waveId,
      );
    assert.equal(
      afterProjection.driftAssessments.filter((assessment) =>
        assessment.evidenceRefs.includes(
          `merge:request:${replanRequest.mergeRequestId}`,
        ),
      ).length,
      1,
    );
    assert.equal(
      gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
      targetBeforeStartup,
    );
    const stableRecord = JSON.parse(
      await readFile(statePath, "utf8"),
    ) as Record<string, unknown> & {
      mergeReceipts: Array<
        Record<string, unknown> & { mergeRequestId: string }
      >;
    };
    const alteredRecord = structuredClone(stableRecord);
    alteredRecord.mergeReceipts.find(
      (receipt) =>
        receipt.mergeRequestId === replanRequest.mergeRequestId,
    )!.transitionEventRef = "merge-event-semantically-altered";
    await writeFile(
      statePath,
      `${JSON.stringify(alteredRecord, null, 2)}\n`,
      "utf8",
    );
    const alteredDiagnostics: string[] = [];
    assert.equal(
      await recoverPersistedRunForStartup(statePath, (message) =>
        alteredDiagnostics.push(message),
      ),
      undefined,
    );
    assert.equal(alteredDiagnostics.length, 1);
    assert.match(
      alteredDiagnostics[0],
      /receipt|terminal request event/i,
    );
    await writeFile(
      statePath,
      `${JSON.stringify(stableRecord, null, 2)}\n`,
      "utf8",
    );
  } finally {
    if (server) {
      if (profileId) {
        const address = server.address();
        if (address && typeof address === "object")
          await fetch(
            `http://127.0.0.1:${address.port}/api/projects/${profileId}`,
            { method: "DELETE" },
          ).catch(() => undefined);
      }
      await new Promise<void>((resolveClose) =>
        server!.close(() => resolveClose()),
      );
    }
    if (previousCodexBin === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = previousCodexBin;
    if (previousTestCodexScript === undefined)
      delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT;
    else
      process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT =
        previousTestCodexScript;
    await rm(root, { recursive: true, force: true });
  }
});

test("startup preserves sealed legacy records without live Phase 2 merge authority", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator sealed legacy "));
  const repository = await createWorkspaceLifecycleRepository(
    root,
    "Legacy Sealed Target",
  );
  const queue = validateTaskQueue({
    project: { path: repository },
    tasks: [
      { title: "Legacy sealed", prompt: "Retain the sealed source." },
      { title: "Terminal sibling", prompt: "Remain terminal." },
    ],
  });
  const run = createRun(queue);
  run.status = "completed";
  for (const task of run.tasks) {
    task.status = "completed";
    task.startedAt = new Date().toISOString();
    task.finishedAt = task.startedAt;
  }
  const statePath = join(testDataDirectory, "runs", run.id, "run.json");
  try {
    const baseInput = await productionWorkspaceInput(
      root,
      repository,
      run.id,
      run.tasks[0].id,
    );
    const input = {
      ...baseInput,
      statePath,
      projectId: `legacy-project-${run.id}`,
      changeId: `legacy-change-${run.id}`,
      waveId: `legacy-wave-${run.id}`,
      taskId: `legacy-task-${run.id}`,
    };
    const active = await provisionWorkspaceAttemptV1(input);
    await executeInWorkspaceAttemptV1(
      statePath,
      repository,
      active.workspaceAttemptId,
      {
        executable: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync('legacy-sealed.txt', 'sealed\\n')",
        ],
      },
    );
    await checkpointWorkspaceAttemptV1(
      statePath,
      repository,
      active.workspaceAttemptId,
      ["legacy-sealed.txt"],
      "legacy sealed source",
    );
    const sealed = await sealWorkspaceAttemptV1(
      statePath,
      repository,
      active.workspaceAttemptId,
    );
    run.tasks[0].workspaceAttemptId = sealed.workspaceAttemptId;
    run.tasks[0].workspacePath = sealed.workspacePath;
    const workspaceRecord = JSON.parse(
      await readFile(statePath, "utf8"),
    ) as Record<string, unknown>;
    await writeFile(
      statePath,
      JSON.stringify({ ...run, ...workspaceRecord }, null, 2),
      "utf8",
    );
    const targetBefore = gitForWorkspaceContract(repository, [
      "rev-parse",
      "HEAD",
    ]);
    const sourceBefore = gitForWorkspaceContract(repository, [
      "rev-parse",
      sealed.branchRef,
    ]);
    const attemptsBefore = JSON.stringify(workspaceRecord.workspaceAttempts);
    const eventsBefore = JSON.stringify(workspaceRecord.workspaceAttemptEvents);
    const diagnostics: string[] = [];

    await recoverPersistedRunForStartup(
      statePath,
      (message) => diagnostics.push(message),
    );

    assert.deepEqual(diagnostics, []);
    const recovered = JSON.parse(await readFile(statePath, "utf8")) as {
      workspaceAttempts: unknown[];
      workspaceAttemptEvents: unknown[];
      mergeRequests?: unknown[];
      mergeRequestEvents?: unknown[];
      mergeReceipts?: unknown[];
    };
    assert.equal(JSON.stringify(recovered.workspaceAttempts), attemptsBefore);
    assert.equal(JSON.stringify(recovered.workspaceAttemptEvents), eventsBefore);
    assert.deepEqual(recovered.mergeRequests ?? [], []);
    assert.deepEqual(recovered.mergeRequestEvents ?? [], []);
    assert.deepEqual(recovered.mergeReceipts ?? [], []);
    assert.equal(
      gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
      targetBefore,
    );
    assert.equal(
      gitForWorkspaceContract(repository, ["rev-parse", sealed.branchRef]),
      sourceBefore,
    );
    assert.equal(
      gitForWorkspaceContract(repository, [
        "status",
        "--porcelain=v1",
        "-uall",
      ]),
      "",
    );
  } finally {
    await rm(join(testDataDirectory, "runs", run.id), {
      recursive: true,
      force: true,
    });
    await rm(root, { recursive: true, force: true });
  }
});

test("Phase 6 dashboard exposes five read-only operator views without command controls", async () => {
  const markup = renderToStaticMarkup(createElement(OperatorDashboard));
  assert.equal(operatorViews.length, 5);
  for (const label of [
    "Overview",
    "Execution bucket",
    "Incidents",
    "Prompt registry",
    "Eval lineage",
  ]) assert.match(markup, new RegExp(`>${label}<`));
  assert.match(markup, /Read-only operational evidence/);
  assert.match(markup, /Reading canonical projections/);
  assert.match(await readFile(join("src", "OperatorDashboard.tsx"), "utf8"), /requestId === requestIdRef\.current/);
  assert.match(await readFile(join("src", "styles.css"), "utf8"), /\.operatorShell \.sidebar nav\{display:flex/);
  for (const prohibited of [
    "Dispatch",
    "Retry task",
    "Resume wave",
    "Run Doctor",
    "Close incident",
    "Promote champion",
  ]) assert.equal(markup.includes(prohibited), false, prohibited);
});

test("visual task editor exposes accessible optional context controls", () => {
  const markup = renderToStaticMarkup(createElement(TaskContextControls, {
    task: { title: "Review", prompt: "Review repository", contextProfile: "review" },
    onChange: () => undefined,
  }));
  assert.match(markup, /<label[^>]*>Context profile/);
  assert.match(markup, /<label[^>]*>Maximum context sources/);
  assert.match(markup, /aria-label="Context profile"/);
  assert.match(markup, /aria-label="Maximum context sources"/);
  assert.match(markup, /aria-label="Require repository context"/);
  assert.match(markup, /type="number"[^>]*min="1"[^>]*max="50"[^>]*step="1"/);
});

test("context editor values round-trip through YAML without losing optional state", () => {
  const enabled = {
    title: "Review",
    prompt: "Review repository",
    ...contextProfileTaskPatch("review"),
    maxSources: optionalNumberValue("7"),
  };
  assert.deepEqual(parse(stringify({ tasks: [enabled] })).tasks[0], {
    title: "Review",
    prompt: "Review repository",
    contextProfile: "review",
    maxSources: 7,
  });
  const disabled = { ...enabled, ...contextProfileTaskPatch("") };
  assert.deepEqual(parse(stringify({ tasks: [disabled] })).tasks[0], {
    title: "Review",
    prompt: "Review repository",
  });
  assert.equal(optionalNumberValue(""), undefined);
  assert.equal(optionalNumberValue("1.5"), 1.5);
});

test("ordinary Orchestrator queues require at least two independent tasks", () => {
  assert.throws(
    () => validateTaskQueue({
      project: { path: process.cwd() },
      tasks: [{ title: "Only task", prompt: "Do one thing" }],
    }),
    /at least two tasks/,
  );
  assert.equal(
    validateTaskQueue({
      project: { path: process.cwd() },
      tasks: [
        { title: "First", prompt: "Do the first thing" },
        { title: "Second", prompt: "Do the second thing" },
      ],
    }).tasks.length,
    2,
  );
  assert.equal(
    validateQueue({
      project: { path: process.cwd() },
      tasks: [{ title: "Goal card", prompt: "Run one adaptive card" }],
    }).tasks.length,
    1,
  );
});

test("dashboard starter YAML is a valid ordinary task queue", () => {
  const parsed = parse(emptyQueue) as {
    project: { path: string };
    tasks: Array<{ key?: string; title?: string; prompt?: string }>;
  };
  parsed.project.path = process.cwd();
  const queue = validateTaskQueue(parsed);
  assert.ok(queue.tasks.length >= 2);
  assert.equal(new Set(queue.tasks.map((task) => task.key)).size, queue.tasks.length);
  assert.ok(queue.tasks.every((task) => task.title && task.prompt));
});

test("versioned queue template keeps one production contract outcome in one coherent scope", async () => {
  const template = await readFile(join(process.cwd(), "tasks.example.yaml"), "utf8");
  assert.match(template, /production-owned code/i);
  assert.match(template, /same task.*implementation.*tests.*benchmark/i);
  assert.match(template, /allowedPaths.*all production and test files/i);
  assert.match(template, /independently useful/i);
  const parsed = parse(template);
  parsed.project.path = process.cwd();
  assert.doesNotThrow(() => validateTaskQueue(parsed));
});

test("ordinary YAML queues contain only ordinary task fields", () => {
  const removedRuntimeName = ["goal", "buddy"].join("");
  const queue = validateTaskQueue(parse(`
project:
  path: ${process.cwd().replace(/\\/g, "\\\\")}
tasks:
  - key: parse
    title: Parse the queue
    prompt: Parse ordinary YAML.
    allowedPaths: [server/index.ts]
    verificationCommands: [npm test]
    executionGuards: [Stop on scope violation.]
  - key: report
    dependsOn: [parse]
    title: Report terminal status
    prompt: Report completion.
`));
  const serialized = JSON.stringify(queue);
  assert.equal(queue.tasks.length, 2);
  assert.equal(queue.tasks[1].dependsOn?.[0], "parse");
  assert.doesNotMatch(serialized.toLowerCase(), new RegExp(removedRuntimeName));
  const prompt = buildPrompt(createRun(queue).tasks[0], queue.project);
  assert.match(prompt, /npm test/);
  assert.match(prompt, /Stop on scope violation/);
  assert.match(
    prompt,
    /ORCHESTRATOR_EXECUTOR_OUTCOME_V1: (?:COMPLETED|STOPPED)/,
  );
});

test("ordinary runs persist terminal state and retain recovery semantics", async () => {
  const removedRuntimeName = ["goal", "buddy"].join("");
  const project = await mkdtemp(join(tmpdir(), "orchestrator-ordinary-persist-"));
  try {
    const queue = validateTaskQueue({
      project: { path: project },
      tasks: [
        { key: "first", title: "First", prompt: "Do first", allowedPaths: ["src"] },
        { key: "second", dependsOn: ["first"], title: "Second", prompt: "Do second" },
      ],
    });
    const created = createRun(queue);
    created.status = "completed";
    created.finishedAt = new Date().toISOString();
    for (const task of created.tasks) {
      delete task.executorOutcomeContractVersion;
      task.status = "completed";
      task.finishedAt = created.finishedAt;
    }
    await persistRun(created);
    const loaded = await loadRun(created.id);
    assert.equal(loaded?.status, "completed");
    assert.deepEqual(loaded?.tasks.map((task) => task.status), ["completed", "completed"]);
    assert.doesNotMatch(JSON.stringify(loaded).toLowerCase(), new RegExp(removedRuntimeName));
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("listening", resolveListen);
      server.once("error", rejectListen);
    });
    try {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const response = await fetch(`http://127.0.0.1:${address.port}/api/runs/${created.id}`);
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { status: string }).status, "completed");
    } finally {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }

    const interrupted = structuredClone(created);
    interrupted.status = "running";
    interrupted.finishedAt = undefined;
    interrupted.tasks[1].status = "running";
    interrupted.tasks[1].finishedAt = undefined;
    const recovered = recoverRun(interrupted);
    assert.equal(recovered.status, "failed");
    assert.equal(recovered.tasks[0].status, "completed");
    assert.equal(recovered.tasks[1].status, "failed");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("production surface contains only supported queue execution modes", async () => {
  const removedRuntimeName = ["goal", "buddy"].join("");
  const removedRuntimePattern = new RegExp(removedRuntimeName, "i");
  const removedRolePattern = /\b(?:Scout|Judge)\b/;
  const removedPipelineReceiptPattern = /\breceiptPath\b/;
  const routes = (app as unknown as {
    router: { stack: Array<{ route?: { path: string } }> };
  }).router.stack
    .flatMap((layer) => layer.route?.path ? [layer.route.path] : []);
  assert.equal(routes.some((route) => removedRuntimePattern.test(route)), false);

  const productionFiles = [
    join("server", "index.ts"),
    join("src", "App.tsx"),
    join("src", "styles.css"),
    join("electron", "lifecycle.cjs"),
    join("electron", "main.cjs"),
    "README.md",
    "AGENTS.md",
  ];
  for (const file of productionFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, removedRuntimePattern, file);
    assert.doesNotMatch(source, removedRolePattern, file);
    assert.doesNotMatch(source, removedPipelineReceiptPattern, file);
  }

  const sourceNames = await readdir("src");
  assert.equal(sourceNames.some((name) => removedRuntimePattern.test(name)), false);
  const rootNames = await readdir(".");
  assert.equal(rootNames.some((name) => removedRuntimePattern.test(name)), false);
  const schemaDirectory = join("server", `${removedRuntimeName}-bridge-v1`, "schemas");
  await assert.rejects(
    readdir(schemaDirectory),
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
});

test("README describes sequential-by-default dependency-aware scheduling", async () => {
  const readme = await readFile("README.md", "utf8");
  assert.doesNotMatch(readme, /runs tasks \*\*sequentially\*\*/i);
  assert.doesNotMatch(readme, /still executes the queue sequentially/i);
  assert.match(readme, /defaults to `1` to preserve sequential execution/i);
  assert.match(readme, /can be launched in parallel/i);
});

test("maps lifecycle statuses to outcome classes and derives only valid durations", () => {
  assert.equal(outcomeClass("completed"), "success");
  for (const status of ["failed", "timed_out", "blocked"])
    assert.equal(outcomeClass(status), "failure");
  for (const status of ["cancelled", "skipped"])
    assert.equal(outcomeClass(status), "interrupted");
  for (const status of ["idle", "pending", "running", "paused", "future_status"])
    assert.equal(outcomeClass(status), "pending");

  assert.equal(durationMs("2026-07-21T10:00:00.000Z", "2026-07-21T10:00:02.500Z"), 2500);
  assert.equal(durationMs(undefined, "2026-07-21T10:00:02.500Z"), null);
  assert.equal(durationMs("invalid", "2026-07-21T10:00:02.500Z"), null);
  assert.equal(durationMs("2026-07-21T10:00:03.000Z", "2026-07-21T10:00:02.500Z"), null);
});

test("projects stored attempts and cycles with usage fallbacks for legacy tasks", () => {
  const stored = projectTaskMetrics({
    ...task("stored", "completed"), executionAttempts: 0, attempts: 3,
  });
  assert.equal(stored.executionAttempts, 0);
  assert.equal(stored.reviewCorrectionCycles, 2);

  const fallback = projectTaskMetrics({
    ...task("legacy", "completed"),
    usage: [
      { phase: "executor", attempt: 1 },
      { phase: "executor", attempt: 3 },
      { phase: "correction", attempt: 1 },
      { phase: "correction", attempt: 1 },
      { phase: "correction", attempt: 2 },
    ],
  });
  assert.equal(fallback.executionAttempts, 3);
  assert.equal(fallback.reviewCorrectionCycles, 2);

  const unknown = projectTaskMetrics(task("unknown", "pending"));
  assert.equal(unknown.executionAttempts, null);
  assert.equal(unknown.reviewCorrectionCycles, null);
});

test("aggregates normalized tokens without double-counting cached input", () => {
  const metrics = projectTaskMetrics({
    ...task("tokens", "completed"),
    usage: [
      { phase: "executor", attempt: 1, inputTokens: 100.9, outputTokens: 25.8, cachedInputTokens: 80.2, cacheWriteTokens: 20.7 },
      { phase: "reviewer", attempt: 1, inputTokens: -10, outputTokens: Number.NaN, cachedInputTokens: Infinity },
      { phase: "correction", attempt: 1, inputTokens: "7", outputTokens: null, cachedInputTokens: 2 },
    ],
  });
  assert.deepEqual(metrics.tokens, {
    inputTokens: 100,
    outputTokens: 25,
    cachedInputTokens: 82,
    cacheWriteTokens: 20,
    totalTokens: 125,
    calls: 3,
  });
  assert.deepEqual(projectTaskMetrics(task("no-usage", "completed")).tokens, {
    inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, totalTokens: 0, calls: 0,
  });
});

test("projects legacy runs without exposing task content or mutating the source", () => {
  const source = run([{
    ...task("private", "completed"),
    prompt: "secret prompt", log: ["secret log"], finalOutput: "secret output",
    reviewOutput: "secret review", diff: "secret diff",
    startedAt: "2026-07-21T10:00:00.000Z", finishedAt: "2026-07-21T10:00:01.000Z",
    usage: [{ phase: "executor", attempt: 1, recordedAt: "now", inputTokens: 4, outputTokens: 6, cachedInputTokens: 3 }],
  }], "completed");
  source.startedAt = "2026-07-21T10:00:00.000Z";
  source.finishedAt = "2026-07-21T10:00:02.000Z";
  const before = JSON.stringify(source);
  const metrics = projectRunMetrics(source);

  assert.equal(metrics.durationMs, 2000);
  assert.equal(metrics.outcome, "success");
  assert.equal(metrics.tasks[0].durationMs, 1000);
  assert.equal(metrics.tokens.totalTokens, 10);
  assert.equal(JSON.stringify(source), before);
  const serialized = JSON.stringify(metrics);
  for (const forbidden of ["secret prompt", "secret log", "secret output", "secret review", "secret diff"])
    assert.equal(serialized.includes(forbidden), false);
});

test("bounded final output preserves structured decisions written at the end", () => {
  const marker = 'QUEUE_DECISION_V1: {"complete":true}';
  const bounded = boundedFinalOutput(`${"a".repeat(30_000)}\n${marker}`);
  assert.ok(bounded.length > 24_000);
  assert.match(bounded, /output truncated/);
  assert.match(bounded, /QUEUE_DECISION_V1/);
});

test("reads machine-readable token usage from completed Codex turns", () => {
  assert.deepEqual(
    usageFromEvent('{"type":"turn.completed","usage":{"input_tokens":120,"output_tokens":45,"cached_input_tokens":80}}'),
    { inputTokens: 120, outputTokens: 45, cachedInputTokens: 80, cacheWriteTokens: 0 },
  );
  assert.equal(usageFromEvent('{"type":"turn.started"}'), undefined);
  assert.equal(usageFromEvent("not json"), undefined);
});

test("cache layout preserves a stable governance prefix while task and tool inputs change", () => {
  const governance = { version: "v1", requiredInvariants: [{ id: "scope", text: "Stay in scope." }], rules: ["No commits."] };
  const task = { goal: "Implement.", successCriteria: ["Pass."], outputContract: "Report.", allowedScope: ["server"], verificationCommands: ["node --test"], stopRules: ["Stop on regression."] };
  const first = buildPromptCacheLayoutV1({ governance, task, toolContract: { version: "v1", allowedTools: ["shell"], rules: ["Declared only."] } });
  const second = buildPromptCacheLayoutV1({ governance, task: { ...task, goal: "Review." }, toolContract: { version: "v2", allowedTools: ["shell", "filesystem"], rules: ["Declared only."] } });
  assert.equal(first.stablePrefixIdentity, second.stablePrefixIdentity);
  assert.match(second.dynamicSuffix, /filesystem/);
  assert.throws(() => buildPromptCacheLayoutV1({ governance: { ...governance, requestId: "volatile" }, task, toolContract: { version: "v1", allowedTools: ["shell"], rules: ["Declared only."] } }), /Volatile/);
  assert.deepEqual(explicitCacheBreakpointV1(), { enabled: false, reason: "disabled-by-default; implicit provider caching remains available" });
  assert.throws(() => explicitCacheBreakpointV1({ enabled: true, route: {} }), /unsupported/);
});

function task(id: string, status: string): any {
  return {
    id,
    title: id,
    prompt: "Test task",
    model: "terra",
    effort: "light",
    status,
    log: [] as string[],
  };
}

function run(tasks: any[], status = "failed"): any {
  return {
    id: "run-1",
    project: { name: "Test", path: process.cwd() },
    status,
    review: {
      enabled: true,
      model: "terra",
      effort: "light",
      maxCorrections: 1,
    },
    limits: {
      taskTimeoutMinutes: 30,
      reviewerTimeoutMinutes: 10,
      maxTaskRetries: 1,
    },
    git: { checkpointCommits: false },
    tasks,
  };
}

function authorizedRunFixture(branch = "feature/approval") {
  const contract = {
    approvalId: "approval-lifecycle",
    intent: "apply" as const,
    technicalPermission: "reversible_local_write" as const,
    sideEffectRisk: "reversible_local_write" as const,
    allowedPaths: ["server/index.ts"],
    verificationCommands: ["git diff --check"],
  };
  const authorizedTask = {
    ...task("authorized", "failed"),
    key: "authorization-goal",
    prompt: "Apply the exact server change",
    allowedPaths: [...contract.allowedPaths],
    verificationCommands: [...contract.verificationCommands],
    authorization: {
      enabled: true,
      intent: "apply" as const,
      technicalPermission: "reversible_local_write" as const,
      sideEffectRisk: "reversible_local_write" as const,
      approvalId: contract.approvalId,
    },
  };
  const source = run([authorizedTask]);
  source.project.approvedApplyContracts = [contract];
  authorizedTask.authorizationEvidence = authorizeTask(
    authorizedTask,
    source.project,
    branch,
  );
  return source;
}

test("recovery, resume, and retry reject stale task authorization identities", () => {
  const source = authorizedRunFixture();
  assert.doesNotThrow(() => recoverRun(structuredClone(source), "feature/approval"));
  assert.ok(resumeRun(structuredClone(source), "feature/approval"));
  assert.equal(retryRun(
    structuredClone(source),
    structuredClone(source.tasks[0]),
    "feature/approval",
  ).tasks[0].status, "pending");

  const changedGoal = structuredClone(source);
  changedGoal.tasks[0].prompt = "Expanded goal";
  assert.throws(
    () => retryRun(changedGoal, changedGoal.tasks[0], "feature/approval"),
    /fresh contract/,
  );
  assert.throws(
    () => resumeRun(structuredClone(source), "feature/other"),
    /fresh contract/,
  );
  const changedAuthority = structuredClone(source);
  changedAuthority.project.path = `${source.project.path}-other`;
  assert.throws(
    () => recoverRun(changedAuthority, "feature/approval"),
    /fresh contract/,
  );
  const changedContract = structuredClone(source);
  changedContract.project.approvedApplyContracts[0].verificationCommands = ["node other-check.mjs"];
  assert.throws(
    () => retryRun(changedContract, changedContract.tasks[0], "feature/approval"),
    /fresh contract/,
  );
});

test("loading persisted runs verifies stored task authorization before replay", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-auth-load-"));
  try {
    const source = authorizedRunFixture("");
    source.id = "authorization-load-run";
    source.status = "paused";
    source.tasks[0].status = "pending";
    source.project.path = project;
    source.tasks[0].authorizationEvidence = authorizeTask(
      source.tasks[0],
      source.project,
      "",
    );
    await persistRun(source);
    assert.equal((await loadRun(source.id))?.id, source.id);

    const file = join(testDataDirectory, "runs", source.id, "run.json");
    const stored = JSON.parse(await readFile(file, "utf8"));
    stored.tasks[0].prompt = "Changed after persistence";
    await writeFile(file, JSON.stringify(stored, null, 2));
    await assert.rejects(() => loadRun(source.id), /fresh contract/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("startup authorization is required only for replayable run states", () => {
  assert.equal(runRequiresReplayAuthorization({ status: "idle" }), true);
  assert.equal(runRequiresReplayAuthorization({ status: "running" }), true);
  assert.equal(runRequiresReplayAuthorization({ status: "paused" }), true);
  assert.equal(runRequiresReplayAuthorization({ status: "completed" }), false);
  assert.equal(runRequiresReplayAuthorization({ status: "failed" }), false);
  assert.equal(runRequiresReplayAuthorization({ status: "timed_out" }), false);
  assert.equal(runRequiresReplayAuthorization({ status: "cancelled" }), false);
});

test("startup leaves a stale-authorized run inactive without aborting recovery", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-stale-startup-"));
  try {
    const source = authorizedRunFixture("");
    source.id = `stale-startup-${Date.now()}-${Math.random()}`;
    source.status = "paused";
    source.tasks[0].status = "pending";
    source.project.path = project;
    source.tasks[0].authorizationEvidence = authorizeTask(
      source.tasks[0],
      source.project,
      "",
    );
    await persistRun(source);

    const file = join(testDataDirectory, "runs", source.id, "run.json");
    const stored = JSON.parse(await readFile(file, "utf8"));
    stored.tasks[0].prompt = "Changed after persistence";
    await writeFile(file, JSON.stringify(stored, null, 2));

    const diagnostics: string[] = [];
    assert.equal(
      await recoverPersistedRunForStartup(file, (message: string) => diagnostics.push(message)),
      undefined,
    );
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0], new RegExp(source.id));
    assert.match(diagnostics[0], /fresh contract/);
    assert.equal(JSON.parse(await readFile(file, "utf8")).status, "paused");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("validates YAML queue, models, limits, and explicit Sol high effort", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-test-"));
  try {
    const queue = parse(
      `project:\n  name: Test\n  path: ${project.replace(/\\/g, "\\\\")}\nlimits:\n  taskTimeoutMinutes: 20\n  reviewerTimeoutMinutes: 5\n  maxTaskRetries: 2\ntasks:\n  - title: Safe task\n    prompt: Do work\n    model: terra\n    effort: medium`,
    ) as unknown;
    const result = validateQueue(queue);
    assert.equal(result.limits.taskTimeoutMinutes, 20);
    assert.equal(result.limits.maxTaskRetries, 2);
    assert.equal(result.limits.maxParallelTasks, 1);
    assert.equal(result.tasks[0].model, "terra");
    assert.equal(
      validateQueue({
        ...(queue as object),
        tasks: [{ title: "Quality-first", prompt: "No", model: "sol", effort: "high" }],
      }).tasks[0].model,
      "sol",
    );
    assert.throws(
      () =>
        validateQueue({
          ...(queue as object),
          limits: { taskTimeoutMinutes: 0 },
        }),
      /taskTimeoutMinutes/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Windows pytest verification requires an isolated sandbox temp directory", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-pytest-validation-"));
  const unsafe = ".\\.venv\\Scripts\\python.exe -m pytest -q tests\\test_acceptance.py";
  const workspaceTemp =
    ".\\.venv\\Scripts\\python.exe -m pytest -q --basetemp=.pytest_cache\\review tests\\test_acceptance.py";
  const sharedTemp =
    ".\\.venv\\Scripts\\python.exe -m pytest -q --basetemp=\"$env:TEMP\\orchestrator-review\" tests\\test_acceptance.py";
  const nestedTemp =
    ".\\.venv\\Scripts\\python.exe -m pytest -q --basetemp=\"$env:TEMP\\orchestrator\\review-$PID\" tests\\test_acceptance.py";
  const safe =
    ".\\.venv\\Scripts\\python.exe -m pytest -q --basetemp=\"$env:TEMP\\orchestrator-review-$PID\" tests\\test_acceptance.py";
  try {
    assert.match(windowsPytestBasetempViolation(unsafe) ?? "", /--basetemp/);
    assert.match(windowsPytestBasetempViolation(workspaceTemp) ?? "", /\$env:TEMP/);
    assert.match(windowsPytestBasetempViolation(sharedTemp) ?? "", /\$PID/);
    assert.match(windowsPytestBasetempViolation(nestedTemp) ?? "", /direct child/);
    assert.equal(windowsPytestBasetempViolation(safe), undefined);
    assert.equal(windowsPytestBasetempViolation("git diff --check"), undefined);
    assert.equal(windowsPytestBasetempViolation("rg -n pytest README.md"), undefined);

    const base = {
      project: { path: project },
      tasks: [{ title: "Review", prompt: "Run exact checks" }],
    };
    assert.throws(
      () =>
        validateQueue({
          ...base,
          tasks: [{ ...base.tasks[0], verificationCommands: [unsafe] }],
        }),
      /Task 1.*Windows pytest.*--basetemp/,
    );
    assert.throws(
      () =>
        validateQueue({
          ...base,
          project: { ...base.project, verificationCommands: [unsafe] },
        }),
      /project\.verificationCommands.*Windows pytest.*--basetemp/,
    );
    assert.doesNotThrow(() =>
      validateQueue({
        ...base,
        tasks: [{ ...base.tasks[0], verificationCommands: [safe] }],
      })
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("validates opt-in context profile and bounded maxSources", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-input-"));
  try {
    const base = { project: { path: project }, tasks: [{ title: "Context", prompt: "Review docs" }] };
    assert.equal(validateQueue(base).tasks[0].contextProfile, undefined);
    assert.equal(
      validateQueue({ ...base, tasks: [{ ...base.tasks[0], contextProfile: "review", maxSources: 7 }] }).tasks[0].maxSources,
      7,
    );
    assert.equal(
      validateQueue({
        ...base,
        tasks: [{
          ...base.tasks[0],
          contextProfile: "review",
          requireRepositoryContext: true,
        }],
      }).tasks[0].requireRepositoryContext,
      true,
    );
    assert.throws(
      () => validateQueue({ ...base, tasks: [{ ...base.tasks[0], maxSources: 7 }] }),
      /contextProfile/,
    );
    assert.throws(
      () => validateQueue({ ...base, tasks: [{ ...base.tasks[0], contextProfile: "Review Docs" }] }),
      /contextProfile/,
    );
    assert.throws(
      () => validateQueue({ ...base, tasks: [{ ...base.tasks[0], contextProfile: "review", maxSources: 0 }] }),
      /maxSources/,
    );
    assert.throws(
      () => validateQueue({
        ...base,
        tasks: [{ ...base.tasks[0], requireRepositoryContext: true }],
      }),
      /requireRepositoryContext.*contextProfile/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("safe fallback selects only fixed root entrypoints and emits ContextReceiptV1", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-fallback-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    await writeFile(join(project, "README.md"), "safe");
    await writeFile(join(project, ".env"), "SECRET=never-read");
    await mkdir(join(project, "data"));
    await writeFile(join(project, "data", "private.md"), "never-read");
    const result = await new FallbackContextProvider().provide({
      projectPath: project,
      requestId: "request-fallback",
      task: "Review repository",
      profile: "review",
      maxSources: 1,
    });
    assert.equal(result.provider, "fallback");
    assert.deepEqual(result.bundle.sources.map((source: { path: string }) => source.path), ["AGENTS.md"]);
    assert.equal(result.receipt.contract_type, "ContextReceiptV1");
    assert.equal(result.receipt.counts.selected_sources, 2);
    assert.equal(result.receipt.counts.omitted_sources, 1);
    assert.equal(validateContextContractV1("bundle", result.bundle), result.bundle);
    assert.equal(validateContextContractV1("receipt", result.receipt), result.receipt);
    assert.equal(JSON.stringify(result).includes(".env"), false);
    assert.equal(JSON.stringify(result).includes("private.md"), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("Orchestrator consumes its own bounded secondary-memory profile through the repository helper", async () => {
  const result = await new RepositoryContextHelperProvider().provide({
    projectPath: process.cwd(),
    requestId: "request-orchestrator-startup",
    task: "Start a grounded Orchestrator repository task",
    profile: "startup",
    maxSources: 8,
  });
  assert.equal(result.provider, "repository-helper");
  assert.equal(result.fallbackReason, undefined);
  assert.deepEqual(
    result.bundle.sources.slice(0, 4).map((source: { path: string }) => source.path),
    [
      "AGENTS.md",
      "docs/context_packs/current_status.md",
      "docs/NEXT_STEPS.md",
      "docs/source_of_truth_hierarchy.md",
    ],
  );
  assert.equal(
    result.bundle.sources.some(
      (source: { path: string }) => source.path === "docs/project_map/current_map.md",
    ),
    false,
  );
  assert.ok(
    result.bundle.selection.skipped_high_risk_context.some(
      (item: { path_glob: string }) => item.path_glob === ".orchestrator/**",
    ),
  );
  assert.equal(validateContextContractV1("bundle", result.bundle), result.bundle);
  assert.equal(validateContextContractV1("receipt", result.receipt), result.receipt);
});

test("helper timeout, invalid JSON, and contract mismatch use observable safe fallback", async () => {
  const project = await mkdtemp(join(process.cwd(), ".orchestrator-context-helper-"));
  try {
    await mkdir(join(project, "scripts"));
    await writeFile(join(project, "AGENTS.md"), "safe");
    const cases = [
      ["timeout", "setTimeout(() => console.log('{}'), 500);", "HELPER_TIMEOUT", 30],
      ["invalid", "console.log('not json');", "HELPER_INVALID_JSON", 1_000],
      ["mismatch", "console.log(JSON.stringify({bundle_type:'wrong'}));", "HELPER_CONTRACT_MISMATCH", 1_000],
    ] as const;
    for (const [name, source, reason, timeoutMs] of cases) {
      const helper = `scripts/${name}.cjs`;
      await writeFile(join(project, helper), source);
      const result = await resolveTaskContext(
        { projectPath: project, requestId: `request-${name}`, task: "Review", profile: "review", maxSources: 2 },
        new RepositoryContextHelperProvider({ executable: testNodeExecutable, helperRelativePath: helper, timeoutMs }),
        new FallbackContextProvider(),
      );
      assert.equal(result.provider, "fallback");
      assert.equal(result.fallbackReason, reason);
      assert.ok(result.receipt.reason_codes.includes(reason));
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("helper adapter preserves safety evidence and rejects divergent receipt selections", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-consistency-"));
  try {
    await mkdir(join(project, "scripts"));
    await writeFile(join(project, "AGENTS.md"), "safe");
    const source = {
      path: "AGENTS.md", priority: "P0", authority: "entrypoint", status: "active",
      layer: "root", retrieval_mode: "startup_required", inclusion_reason: "selected by helper",
    };
    const payload = {
      bundle_type: "api_agent_context_bundle", request_id: "request-consistent", profile: "review",
      mutation_scope: "read-only", runtime_scope_expanded: false,
      external_system_scope_expanded: false, data_scope_expanded: false,
      read_set: [source], context: { read_set: [source] },
      request_envelope: { request_id: "request-consistent", profile: "review", max_sources: 1, forbidden_paths: ["data/**"] },
      skipped_high_risk_context: [{ path_glob: "data/**", reason: "excluded by helper" }],
      skipped_trigger_only_context: [],
      selected_source_count: 4,
      omitted_source_count: 3,
      truncated: true,
      receipt: { receipt_type: "api_agent_context_receipt", request_id: "request-consistent", profile: "review", read_set: [source] },
    };
    const provider = new RepositoryContextHelperProvider({ executable: testNodeExecutable, helperRelativePath: "scripts/valid.cjs", timeoutMs: 1_000 });
    const request = { projectPath: project, requestId: "request-consistent", task: "Review", profile: "review", maxSources: 1 };
    const valid = provider.normalize(payload, request);
    assert.deepEqual(valid.bundle.selection.skipped_high_risk_context, payload.skipped_high_risk_context);
    assert.deepEqual(valid.bundle.selection.selected_source_count, 4);
    assert.deepEqual(valid.bundle.selection.omitted_source_count, 3);
    assert.deepEqual(valid.bundle.selection.truncated, true);
    assert.deepEqual(valid.receipt.counts, {
      requested_max_sources: 1,
      selected_sources: 4,
      omitted_sources: 3,
    });

    const legacyScopePayload = {
      ...payload,
      external_system_scope_expanded: undefined,
      data_scope_expanded: undefined,
      broker_or_data_scope_expanded: false,
    };
    assert.equal(provider.normalize(legacyScopePayload, request).provider, "repository-helper");

    const canonicalPayload = { ...payload } as Record<string, unknown>;
    delete canonicalPayload.selected_source_count;
    delete canonicalPayload.omitted_source_count;
    delete canonicalPayload.truncated;
    assert.deepEqual(provider.normalize(canonicalPayload, request).receipt.counts, {
      requested_max_sources: 1,
      selected_sources: 1,
      omitted_sources: 0,
    });

    payload.receipt.read_set = [];
    const divergent = await resolveTaskContext(
      request,
      { provide: async () => provider.normalize(payload, request) },
      new FallbackContextProvider(),
    );
    assert.equal(divergent.fallbackReason, "HELPER_CONTRACT_MISMATCH");

    payload.receipt.read_set = [source];
    payload.selected_source_count = 3;
    const inconsistent = await resolveTaskContext(
      request,
      { provide: async () => provider.normalize(payload, request) },
      new FallbackContextProvider(),
    );
    assert.equal(inconsistent.provider, "fallback");
    assert.equal(inconsistent.fallbackReason, "HELPER_CONTRACT_MISMATCH");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("preflight context is reused for prompt and serialized run receipt", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-reuse-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    const queue = validateQueue({
      project: { path: project },
      tasks: [{ title: "Context", prompt: "Review", contextProfile: "review", maxSources: 2 }],
    });
    const context = await new FallbackContextProvider().provide({
      projectPath: project, requestId: "request-reuse", task: "Review", profile: "review", maxSources: 2,
    });
    cachePreflightContexts(queue, [context]);
    const consumed = await contextsForRun(queue);
    assert.strictEqual(consumed[0], context);
    const created = createRun(queue, undefined, consumed);
    assert.strictEqual(created.tasks[0].context, context);
    assert.strictEqual(created.contextReceipts?.[0], context.receipt);
    assert.match(buildPrompt(created.tasks[0], created.project), /AGENTS\.md/);
    const stored = JSON.parse(JSON.stringify(created));
    assert.equal(stored.contextReceipts[0].contract_type, "ContextReceiptV1");
    assert.equal(stored.contextReceipts[0].request_id, "request-reuse");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("programmatic context reduction is disabled by default and preserves the direct router result", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-ptc-disabled-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    const request = { projectPath: project, requestId: "request-ptc-disabled", task: "Review", profile: "review", maxSources: 2 };
    const direct = await new FallbackContextProvider().provide(request);
    const resolved = await resolveTaskContext(request, { provide: async () => direct }, new FallbackContextProvider());
    assert.strictEqual(resolved, direct);
    assert.equal(resolved.programmaticReduction, undefined);
    assert.equal(contextPtcEnabled({}), false);
    assert.equal(contextPtcEnabled({ ORCHESTRATOR_CONTEXT_PTC_V1: "1" }), true);
    assert.equal(contextPtcEnabled({ ORCHESTRATOR_CONTEXT_PTC_V1: "true" }), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("local programmatic adapter reduces only the existing router bundle and preserves linkage and evidence", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-ptc-local-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    await writeFile(join(project, "README.md"), "safe");
    const request = { projectPath: project, requestId: "request-ptc-local", task: "Review", profile: "review", maxSources: 3 };
    const routed = await new FallbackContextProvider().provide(request);
    routed.bundle.sources = [
      { ...routed.bundle.sources[1], priority: "P1", evidence_refs: ["evidence-readme"] },
      { ...routed.bundle.sources[0], priority: "P0", evidence_refs: ["evidence-agents"] },
      { ...routed.bundle.sources[0], priority: "P0", evidence_refs: ["evidence-agents-extra"] },
    ];
    routed.bundle.selection.selected_source_count = 3;
    routed.receipt.counts.selected_sources = 3;
    let routerCalls = 0;
    const resolved = await resolveTaskContext(
      request,
      { provide: async () => { routerCalls += 1; return routed; } },
      new FallbackContextProvider(),
      { enabled: true, executor: new LocalDeterministicContextPtcExecutor() },
    );

    assert.equal(routerCalls, 1);
    assert.deepEqual(resolved.bundle.sources.map((source: { path: string }) => source.path), ["AGENTS.md", "README.md"]);
    assert.deepEqual(resolved.bundle.sources[0].evidence_refs, ["evidence-agents", "evidence-agents-extra"]);
    assert.deepEqual(resolved.bundle.selection, {
      ...routed.bundle.selection,
      omitted_source_count: 1,
      truncated: true,
    });
    assert.equal(resolved.programmaticReduction?.state, "applied");
    assert.equal(resolved.programmaticReduction?.requires_direct_final_validation, true);
    assert.deepEqual(resolved.programmaticReduction?.retained_evidence_refs, [
      "evidence-agents",
      "evidence-agents-extra",
      "evidence-readme",
    ]);
    assert.equal(resolved.programmaticReduction?.call_receipts.length, 6);
    for (const receipt of resolved.programmaticReduction?.call_receipts ?? []) {
      assert.match(receipt.call_id, /^ptc-request-ptc-local-\d+$/);
      assert.deepEqual(receipt.caller, { type: "context_router", request_id: request.requestId });
    }
    assert.equal(validateContextContractV1("bundle", resolved.bundle), resolved.bundle);
    assert.equal(validateContextContractV1("receipt", resolved.receipt), resolved.receipt);
    const queue = validateQueue({
      project: { path: project },
      tasks: [{ title: "Context", prompt: "Review", contextProfile: "review", maxSources: 3 }],
    });
    cachePreflightContexts(queue, [resolved]);
    const run = createRun(queue, undefined, await contextsForRun(queue));
    const prompt = buildPrompt(run.tasks[0], run.project);
    assert.match(prompt, /AGENTS\.md/);
    assert.match(prompt, /README\.md/);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("programmatic adapter rejects unsafe tools before execution and keeps direct fallback complete", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-ptc-denied-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    const request = { projectPath: project, requestId: "request-ptc-denied", task: "Review", profile: "review", maxSources: 2 };
    const routed = await new FallbackContextProvider().provide(request);
    let executions = 0;
    const unsafeExecutor = {
      describe: (operation: any) => ({
        operation,
        readOnly: operation !== "join",
        approvalSensitive: operation === "rank",
      }),
      execute: async () => { executions += 1; throw new Error("must not execute"); },
    };
    const resolved = await resolveTaskContext(
      request,
      { provide: async () => routed },
      new FallbackContextProvider(),
      { enabled: true, executor: unsafeExecutor },
    );
    assert.equal(executions, 0);
    assert.equal(resolved.programmaticReduction?.state, "direct_fallback");
    assert.deepEqual(resolved.programmaticReduction?.reason_codes, ["PTC_TOOL_DENIED"]);
    assert.deepEqual(resolved.bundle, routed.bundle);
    assert.deepEqual(resolved.receipt, routed.receipt);
    assert.equal(validateContextContractV1("bundle", resolved.bundle), resolved.bundle);
    assert.equal(validateContextContractV1("receipt", resolved.receipt), resolved.receipt);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("programmatic adapter retries only retryable calls and stops on linkage or evidence loss", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-ptc-stop-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    const request = { projectPath: project, requestId: "request-ptc-stop", task: "Review", profile: "review", maxSources: 2 };
    const routed = await new FallbackContextProvider().provide(request);
    routed.bundle.sources[0].evidence_refs = ["evidence-required"];
    const local = new LocalDeterministicContextPtcExecutor();
    let attempts = 0;
    const retryingExecutor = {
      describe: (operation: any) => local.describe(operation),
      execute: async (call: any) => {
        if (call.operation === "filter" && attempts++ === 0)
          throw new ContextPtcFailure("PTC_TRANSIENT", "retry once", true);
        return local.execute(call);
      },
    };
    const retried = await resolveTaskContext(
      request,
      { provide: async () => routed },
      new FallbackContextProvider(),
      { enabled: true, executor: retryingExecutor, maxAttempts: 2 },
    );
    assert.equal(retried.programmaticReduction?.state, "applied");
    assert.equal(retried.programmaticReduction?.call_receipts[0].attempts, 2);

    const wrongLinkExecutor = {
      describe: (operation: any) => local.describe(operation),
      execute: async (call: any) => ({ ...(await local.execute(call)), call_id: "wrong" }),
    };
    const wrongLink = await resolveTaskContext(
      request,
      { provide: async () => routed },
      new FallbackContextProvider(),
      { enabled: true, executor: wrongLinkExecutor },
    );
    assert.deepEqual(wrongLink.programmaticReduction?.reason_codes, ["PTC_LINKAGE_MISMATCH"]);
    assert.deepEqual(wrongLink.bundle, routed.bundle);

    const evidenceDroppingExecutor = {
      describe: (operation: any) => local.describe(operation),
      execute: async (call: any) => {
        const response = await local.execute(call);
        if (call.operation === "schema_validate") delete response.output.bundle.sources[0].evidence_refs;
        return response;
      },
    };
    const evidenceLost = await resolveTaskContext(
      request,
      { provide: async () => routed },
      new FallbackContextProvider(),
      { enabled: true, executor: evidenceDroppingExecutor },
    );
    assert.deepEqual(evidenceLost.programmaticReduction?.reason_codes, ["PTC_EVIDENCE_LOST"]);
    assert.deepEqual(evidenceLost.bundle, routed.bundle);

    const exhaustedExecutor = {
      describe: (operation: any) => local.describe(operation),
      execute: async () => { throw new ContextPtcFailure("PTC_TRANSIENT", "still transient", true); },
    };
    const exhausted = await resolveTaskContext(
      request,
      { provide: async () => routed },
      new FallbackContextProvider(),
      { enabled: true, executor: exhaustedExecutor, maxAttempts: 2 },
    );
    assert.deepEqual(exhausted.programmaticReduction?.reason_codes, ["PTC_RETRY_EXHAUSTED"]);

    const invalidReasonExecutor = {
      describe: (operation: any) => local.describe(operation),
      execute: async (call: any) => ({ ...(await local.execute(call)), reason_codes: ["invalid-code"] }),
    };
    const invalidReason = await resolveTaskContext(
      request,
      { provide: async () => routed },
      new FallbackContextProvider(),
      { enabled: true, executor: invalidReasonExecutor },
    );
    assert.deepEqual(invalidReason.programmaticReduction?.reason_codes, ["PTC_REASON_CODE_INVALID"]);

    const conflicting = structuredClone(routed);
    conflicting.bundle.sources.push({ ...conflicting.bundle.sources[0], authority: "conflicting_authority" });
    conflicting.bundle.selection.selected_source_count = 2;
    conflicting.receipt.counts.selected_sources = 2;
    const semanticConflict = await resolveTaskContext(
      request,
      { provide: async () => conflicting },
      new FallbackContextProvider(),
      { enabled: true, executor: local },
    );
    assert.deepEqual(semanticConflict.programmaticReduction?.reason_codes, ["PTC_SEMANTIC_CONFLICT"]);
    assert.deepEqual(semanticConflict.bundle, conflicting.bundle);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("loads every queue in a sequential pipeline before it starts", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-pipeline-"));
  const first = join(project, "first.yaml");
  const second = join(project, "second.yaml");
  const queue = (title: string) => `project:\n  path: ${project.replace(/\\/g, "\\\\")}\ntasks:\n  - title: ${title}\n    prompt: Do work\n  - title: ${title} follow-up\n    prompt: Do independent follow-up work`;
  try {
    await writeFile(first, queue("First"));
    await writeFile(second, queue("Second"));
    const pipeline = await loadPipeline({
      queues: [{ file: first }, { file: second }],
    });
    assert.equal(pipeline.queues.length, 2);
    assert.equal(pipeline.queues[0].queue.tasks[0].title, "First");
    await assert.rejects(
      () => loadPipeline({ queues: [{ file: first }, { file: join(project, "missing.yaml") }] }),
      /does not exist/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("routes everyday work to Terra and uses Sol only for an explicit quality-first minimum", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-routing-"));
  try {
    const queue = validateQueue({
      project: { path: project, allowedModels: ["luna", "terra", "sol"] },
      tasks: [
        { title: "Update wording", prompt: "Correct a typo", model: "auto" },
        { title: "API integration", prompt: "Add integration tests", model: "auto" },
        { title: "Migration", prompt: "Create a database migration", model: "auto", minModel: "terra" },
        { title: "Quality review", prompt: "Review a distributed system design", model: "auto", minModel: "sol", effort: "high" },
      ],
    });
    assert.equal(queue.tasks[0].model, "terra");
    assert.equal(queue.tasks[0].requestedModel, "auto");
    assert.equal(queue.tasks[1].model, "terra");
    assert.equal(queue.tasks[2].model, "terra");
    assert.equal(queue.tasks[3].model, "sol");
    assert.match(queue.tasks[3].modelSelectionReason, /explicit quality-first/);
    assert.throws(
      () => validateQueue({
        project: { path: project, allowedModels: ["luna", "terra"] },
        tasks: [{ title: "Fast", prompt: "Classify", model: "luna" }],
      }),
      /not enabled by the installed Codex runtime/,
    );
    assert.throws(
      () => validateQueue({
        project: { path: project, allowedModels: ["luna"] },
        tasks: [{ title: "Important", prompt: "Work", model: "auto", minModel: "terra" }],
      }),
      /No enabled model/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("validates parallelism limits and exclusive task resources", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-parallelism-"));
  try {
    const queue = validateQueue({
      project: { path: project },
      limits: { maxParallelTasks: 3 },
      tasks: [
        {
          key: "database-migration",
          title: "Migration",
          prompt: "Run migration",
          resources: ["postgres-schema", "staging.db"],
        },
      ],
    });
    assert.equal(queue.limits.maxParallelTasks, 3);
    assert.deepEqual(queue.tasks[0].resources, ["postgres-schema", "staging.db"]);
    assert.throws(
      () =>
        validateQueue({
          project: { path: project },
          limits: { maxParallelTasks: 5 },
          tasks: [{ title: "Task", prompt: "Do work" }],
        }),
      /maxParallelTasks/,
    );
    assert.throws(
      () =>
        validateQueue({
          project: { path: project },
          tasks: [
            {
              title: "Task",
              prompt: "Do work",
              resources: ["staging", "staging"],
            },
          ],
        }),
      /resources must not contain duplicates/,
    );
    assert.throws(
      () =>
        validateQueue({
          project: { path: project },
          tasks: [
            { title: "Task", prompt: "Do work", resources: ["not allowed"] },
          ],
        }),
      /resources must use/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("validates task dependency graphs for parallel scheduling", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-dependencies-"));
  try {
    const base = { project: { path: project } };
    const queue = validateQueue({
      ...base,
      tasks: [
        { key: "api", title: "API", prompt: "Build API" },
        { key: "ui", title: "UI", prompt: "Build UI" },
        {
          key: "e2e",
          title: "E2E",
          prompt: "Test the flow",
          dependsOn: ["api", "ui"],
        },
      ],
    });
    assert.deepEqual(queue.tasks[2].dependsOn, ["api", "ui"]);
    assert.throws(
      () =>
        validateQueue({
          ...base,
          tasks: [
            { key: "first", title: "First", prompt: "Do first", dependsOn: ["second"] },
            { key: "second", title: "Second", prompt: "Do second", dependsOn: ["first"] },
          ],
        }),
      /cycle/,
    );
    assert.throws(
      () =>
        validateQueue({
          ...base,
          tasks: [
            { key: "known", title: "Known", prompt: "Do known" },
            { key: "later", title: "Later", prompt: "Do later", dependsOn: ["missing"] },
          ],
        }),
      /unknown task key/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("schedules ready graph branches while respecting dependencies and conflicts", () => {
  const api = {
    ...task("api", "pending"),
    key: "api",
    allowedPaths: ["src/api"],
  };
  const web = {
    ...task("web", "pending"),
    key: "web",
    allowedPaths: ["src/web"],
  };
  const integration = {
    ...task("integration", "pending"),
    key: "integration",
    dependsOn: ["api", "web"],
    allowedPaths: ["tests/integration"],
  };
  assert.deepEqual(
    selectRunnableTasks([api, web, integration], 3).map((item) => item.key),
    ["api", "web"],
  );
  api.status = "completed";
  web.status = "completed";
  assert.deepEqual(
    selectRunnableTasks([api, web, integration], 3).map((item) => item.key),
    ["integration"],
  );

  const migration = {
    ...task("migration", "pending"),
    allowedPaths: ["db/migrations"],
    resources: ["postgres-schema"],
  };
  const seed = {
    ...task("seed", "pending"),
    allowedPaths: ["db/seeds"],
    resources: ["postgres-schema"],
  };
  assert.deepEqual(
    selectRunnableTasks([migration, seed], 2).map((item) => item.id),
    ["migration"],
  );

  const failed = { ...task("failed", "failed"), key: "failed" };
  const dependent = {
    ...task("dependent", "pending"),
    key: "dependent",
    dependsOn: ["failed"],
  };
  assert.equal(blockTasksWithFailedDependencies([failed, dependent]), true);
  assert.equal(dependent.status, "blocked");

  const snapshotRun = run([api, web, integration], "running");
  snapshotRun.limits.maxParallelTasks = 3;
  api.status = "running";
  const snapshot = schedulerSnapshot(snapshotRun);
  assert.equal(snapshot.availableSlots, 2);
  assert.deepEqual(snapshot.runningTaskIds, ["api"]);
});

test("scheduler enforces slot budgets and safe path conflicts", () => {
  const first = { ...task("first", "pending"), allowedPaths: ["src/first"] };
  const second = { ...task("second", "pending"), allowedPaths: ["src/second"] };
  const third = { ...task("third", "pending"), allowedPaths: ["src/third"] };
  assert.deepEqual(
    selectRunnableTasks([first, second, third], 2).map((item) => item.id),
    ["first", "second"],
  );

  const unscoped = { ...task("unscoped", "pending") };
  assert.deepEqual(
    selectRunnableTasks([unscoped, first], 2).map((item) => item.id),
    ["unscoped"],
  );

  const parentPath = {
    ...task("parent-path", "pending"),
    allowedPaths: ["src/shared"],
  };
  const childPath = {
    ...task("child-path", "pending"),
    allowedPaths: ["src/shared/components"],
  };
  assert.deepEqual(
    selectRunnableTasks([parentPath, childPath], 2).map((item) => item.id),
    ["parent-path"],
  );

  const active = {
    ...task("active", "running"),
    allowedPaths: ["src/api"],
  };
  const conflicting = {
    ...task("conflicting", "pending"),
    allowedPaths: ["src/api/client"],
  };
  assert.deepEqual(selectRunnableTasks([conflicting], 1, [active]), []);
});

test("scheduler blocks transitive descendants and reports ready versus waiting work", () => {
  const failed = { ...task("failed", "failed"), key: "api" };
  const grandchild = {
    ...task("grandchild", "pending"),
    key: "deploy",
    dependsOn: ["build"],
  };
  const child = {
    ...task("child", "pending"),
    key: "build",
    dependsOn: ["api"],
  };
  const graph = [failed, grandchild, child];
  assert.equal(blockTasksWithFailedDependencies(graph), true);
  assert.equal(child.status, "blocked");
  assert.equal(grandchild.status, "pending");
  assert.equal(blockTasksWithFailedDependencies(graph), true);
  assert.equal(grandchild.status, "blocked");

  const active = {
    ...task("active", "running"),
    key: "api",
    allowedPaths: ["src/api"],
  };
  const ready = {
    ...task("ready", "pending"),
    key: "web",
    allowedPaths: ["src/web"],
  };
  const waiting = {
    ...task("waiting", "pending"),
    key: "e2e",
    dependsOn: ["api"],
    allowedPaths: ["tests/e2e"],
  };
  const snapshotRun = run([active, ready, waiting], "running");
  snapshotRun.limits.maxParallelTasks = 3;
  const snapshot = schedulerSnapshot(snapshotRun);
  assert.equal(snapshot.availableSlots, 2);
  assert.deepEqual(snapshot.readyTaskKeys, ["web"]);
  assert.deepEqual(snapshot.waitingTaskKeys, ["e2e"]);
});

test("run reconciliation keeps reviewer and correction ownership nonterminal and preserves terminal precedence", () => {
  const reviewing = run([{ ...task("reviewing", "completed"), executionPhase: "reviewer" }], "running");
  reviewing.limits.maxParallelTasks = 1;
  assert.equal(reconcileRunState(reviewing), "running");
  assert.equal(reviewing.tasks[0].status, "running");
  assert.equal(reviewing.finishedAt, undefined);
  assert.equal(schedulerSnapshot(reviewing).availableSlots, 0);

  const correcting = run([{ ...task("correcting", "completed"), executionPhase: "correction" }], "running");
  correcting.limits.maxParallelTasks = 1;
  assert.equal(reconcileRunState(correcting), "running");
  assert.equal(correcting.tasks[0].status, "running");
  assert.equal(schedulerSnapshot(correcting).availableSlots, 0);

  const settled = run([
    task("timed-out", "timed_out"),
    task("failed", "failed"),
    task("blocked", "blocked"),
  ], "running");
  assert.equal(reconcileRunState(settled), "timed_out");
  assert.ok(settled.finishedAt);

  const terminalTransition = run([task("done", "completed")], "running");
  terminalTransition.finishedAt = "2000-01-01T00:00:00.000Z";
  assert.equal(reconcileRunState(terminalTransition), "completed");
  assert.notEqual(terminalTransition.finishedAt, "2000-01-01T00:00:00.000Z");

  const cancelled = run([task("done", "completed")], "cancelled");
  assert.equal(reconcileRunState(cancelled), "cancelled");
  assert.ok(cancelled.finishedAt);

  const cancelledWithPending = run([
    task("done", "completed"),
    task("never-started", "pending"),
  ], "cancelled");
  assert.equal(reconcileRunState(cancelledWithPending), "cancelled");
  assert.equal(cancelledWithPending.tasks[1].status, "cancelled");
  assert.ok(cancelledWithPending.tasks[1].finishedAt);
  assert.ok(cancelledWithPending.finishedAt);
});

test("loading and serving an all-terminal running record reconciles it atomically", async () => {
  const source = run([task("first", "completed"), task("second", "completed")], "running");
  source.id = `terminal-running-${Date.now()}`;
  source.finishedAt = undefined;
  await persistRun(source);
  const runFile = join(testDataDirectory, "runs", source.id, "run.json");
  const summaryFile = join(testDataDirectory, "runs", source.id, "summary.json");
  const stale = structuredClone(source);
  stale.status = "running";
  stale.finishedAt = undefined;
  await writeFile(runFile, JSON.stringify(stale));
  await writeFile(summaryFile, JSON.stringify({ id: source.id, status: "running" }));

  const loaded = await loadRun(source.id);
  assert.equal(loaded?.status, "completed");
  assert.ok(loaded?.finishedAt);
  const stored = JSON.parse(
    await readFile(runFile, "utf8"),
  );
  assert.equal(stored.status, "completed");
  const summary = await loadRunSummary(source.id);
  assert.equal(summary?.status, "completed");
  assert.equal(summary?.finishedAt, stored.finishedAt);
  assert.equal(
    (JSON.parse(await readFile(summaryFile, "utf8")) as { status: string }).status,
    "running",
  );

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("listening", resolveListen);
    server.once("error", rejectListen);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/runs/${source.id}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { status: string }).status, "completed");
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
});

test("enforces allowedPaths and resolves completed, skipped, cancelled, failed, and timeout states", () => {
  assert.deepEqual(
    outsideAllowedPaths(["src/safe/a.ts", "README.md"], ["src/safe"]),
    ["README.md"],
  );
  assert.deepEqual(
    outsideAllowedPaths(
      ["docs/evidence/freeze.json", "docs/evidence/responses/body.bin"],
      ["docs/evidence/**"],
    ),
    [],
  );
  assert.deepEqual(
    taskWriteViolations(
      { allowedPaths: ["src"] },
      ["src/a.ts"],
    ),
    [],
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: [],
    }),
    "completed",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: true,
      exitCode: 1,
      timedOut: false,
      violations: [],
    }),
    "skipped",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: true,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: [],
    }),
    "cancelled",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 1,
      timedOut: false,
      violations: [],
    }),
    "failed",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 1,
      timedOut: true,
      violations: [],
    }),
    "timed_out",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: ["README.md"],
    }),
    "failed",
  );
});

test("executor outcome v1 fails closed when an execution guard stops the requested work", () => {
  const stopped = assessExecutorOutcome(
    "Stopped due to the explicit size guard.\n\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: STOPPED",
    1,
  );
  assert.deepEqual(stopped, {
    disposition: "stopped",
    outcome: "STOPPED",
    reason: "Executor reported STOPPED; the requested outcome was not delivered.",
  });
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: [],
      executorOutcome: stopped,
    }),
    "failed",
  );

  const parent = {
    ...task("guarded", "failed"),
    key: "guarded",
    executorOutcome: "STOPPED",
    executorOutcomeReason: stopped.reason,
  };
  const dependent = {
    ...task("dependent", "pending"),
    key: "dependent",
    dependsOn: ["guarded"],
  };
  assert.equal(blockTasksWithFailedDependencies([parent, dependent]), true);
  assert.equal(dependent.status, "blocked");
});

test("executor outcome v1 accepts only one valid required marker and keeps legacy records compatible", () => {
  const completed = assessExecutorOutcome(
    "Delivered the requested change.\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED",
    1,
  );
  assert.equal(completed.disposition, "completed");
  assert.equal(completed.outcome, "COMPLETED");

  for (const output of [
    "No marker was returned.",
    "ORCHESTRATOR_EXECUTOR_OUTCOME_V1: DONE",
    "ORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: STOPPED",
  ]) {
    const malformed = assessExecutorOutcome(output, 1);
    assert.equal(malformed.disposition, "invalid");
    assert.match(malformed.reason, /outcome marker/i);
    assert.equal(
      resolveTaskStatus({
        cancelled: false,
        skipped: false,
        exitCode: 0,
        timedOut: false,
        violations: [],
        executorOutcome: malformed,
      }),
      "failed",
    );
  }

  const historical = assessExecutorOutcome(
    "Historical final output without a marker.",
    undefined,
  );
  assert.deepEqual(historical, {
    disposition: "legacy",
    reason: "Historical execution has no executor outcome contract.",
  });
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: [],
      executorOutcome: historical,
    }),
    "completed",
  );
});

test("retry and resume preserve completed work and reset graph descendants", () => {
  const completed = { ...task("done", "completed"), key: "setup" };
  const failed = {
    ...task("failed", "failed"),
    key: "api",
    changedFiles: ["README.md", "server/index.ts"],
    diff: "diff --git a/server/index.ts b/server/index.ts",
    finalOutput: "broken",
    checkpoint: { hash: "abc", message: "old", createdAt: "now" },
  };
  const blocked = {
    ...task("blocked", "blocked"),
    key: "e2e",
    dependsOn: ["api"],
  };
  const source = run([completed, failed, blocked]);
  const retry = retryRun(source, failed);
  assert.deepEqual(
    retry.tasks.map((item) => item.status),
    ["completed", "pending", "pending"],
  );
  assert.equal(retry.tasks[1].finalOutput, undefined);
  assert.equal(retry.tasks[1].checkpoint, undefined);
  assert.equal(retry.tasks[1].changedFiles, undefined);
  assert.deepEqual(retry.tasks[1].retryLineageChangedFiles, [
    "README.md",
    "server/index.ts",
  ]);
  const resumed = resumeRun(source);
  assert.ok(resumed);
  assert.deepEqual(
    resumed.tasks.map((item) => item.status),
    ["completed", "pending", "pending"],
  );
});

test("Codex prompts use stdin instead of the process command line", () => {
  const prompt = "review this change\n".repeat(8_000);
  const invocation = codexPromptInvocation(
    ["exec", "--ephemeral", "--json"],
    prompt,
  );

  assert.deepEqual(invocation.args, [
    "exec",
    "--ephemeral",
    "--json",
    "-",
  ]);
  assert.equal(invocation.stdin, prompt);
  assert.equal(invocation.args.includes(prompt), false);
  assert.ok(invocation.stdin.length > 100_000);
});

test("review-enabled completion fails closed unless a strict reviewer verdict approves it", () => {
  assert.equal(resolveReviewedTaskStatus("completed", "approved"), "completed");
  assert.equal(resolveReviewedTaskStatus("completed", "unavailable"), "failed");
  assert.equal(resolveReviewedTaskStatus("completed", "pending"), "failed");
  assert.equal(resolveReviewedTaskStatus("completed", "changes_requested"), "failed");
  assert.equal(resolveReviewedTaskStatus("completed", "timed_out"), "timed_out");

  assert.equal(
    assessReviewerResult({
      exitCode: 0,
      timedOut: false,
      report: "Looks good.\nVERDICT: APPROVED",
    }).status,
    "approved",
  );
  assert.equal(
    assessReviewerResult({
      exitCode: 0,
      timedOut: false,
      report: "VERDICT: APPROVED with caveats",
    }).status,
    "changes_requested",
  );
  assert.equal(
    assessReviewerResult({
      exitCode: 9,
      timedOut: false,
      report: "VERDICT: APPROVED",
    }).status,
    "unavailable",
  );
  assert.equal(
    assessReviewerResult({
      exitCode: 0,
      timedOut: true,
      report: "VERDICT: APPROVED",
    }).status,
    "timed_out",
  );
});

test("reviewer prompt requires the exact configured verification commands", () => {
  const python =
    "& 'C:\\Tools\\Python\\python.exe' -m pytest 'Agent Kit/kit/tests/test_governance_extensions.py' -q";
  const prompt = buildReviewerPrompt(
    {
      ...task("review-exact-verification", "completed"),
      title: "Review exact verification",
      prompt: "Review the retained implementation.",
      authorizationEvidence: {
        contractType: "TaskAuthorizationEvidenceV1",
        enabled: false,
        decision: "disabled",
        reason: "NON_MUTATING_CONTRACT",
        intent: "review",
        technicalPermission: "read_only",
        sideEffectRisk: "none",
        allowedPaths: [],
        verificationCommands: [python, "git diff --check"],
        scopeFingerprint: "scope",
        goalFingerprint: "goal",
        branch: "main",
        authorityFingerprint: "authority",
      },
    },
    { verificationCommands: ["ignored fallback"] },
  );

  assert.match(prompt, /Run only these exact verification commands verbatim/);
  assert.match(prompt, /Do not substitute executables, aliases, launchers, or commands/);
  assert.ok(prompt.includes(`1. ${python}`));
  assert.ok(prompt.includes("2. git diff --check"));
  assert.doesNotMatch(prompt, /ignored fallback/);
});

test("reviewer prompt isolates the task change set from pre-existing workspace changes", () => {
  const prompt = buildReviewerPrompt(
    {
      ...task("review-task-delta", "completed"),
      title: "Review only the task delta",
      prompt: "Create the requested contract.",
      changedFiles: ["docs/planned/contract.md"],
      diff: "diff --git a/docs/planned/contract.md b/docs/planned/contract.md",
    },
    {},
  );

  assert.match(prompt, /Task change set \(authoritative\)/);
  assert.match(prompt, /docs\/planned\/contract\.md/);
  assert.match(prompt, /diff --git a\/docs\/planned\/contract\.md/);
  assert.match(
    prompt,
    /Pre-existing modified, deleted, or untracked files outside this task change set are out of scope/,
  );
  assert.match(prompt, /Do not request their removal or modification/);
  assert.doesNotMatch(prompt, /Review the current git diff/);
});

test("preflight rejects exact-line review requirements without line-readable verification evidence", () => {
  const taskInput = {
    prompt: "Review both artifacts and report findings with exact paths and lines.",
    verificationCommands: [
      "$paths = @('contract.md', 'validation.md'); foreach ($path in $paths) { if (-not (Test-Path $path)) { exit 1 } }",
      "git diff --check",
    ],
  };

  assert.deepEqual(reviewerEvidencePreflight(taskInput, {}), {
    required: true,
    ok: false,
    detail:
      "Exact line evidence is required, but verificationCommands do not include a line-numbered content reader.",
  });
  assert.deepEqual(
    reviewerEvidencePreflight(
      taskInput,
      {
        verificationCommands: [
          "$i = 0; Get-Content contract.md | ForEach-Object { $i++; '{0}:{1}' -f $i, $_ }",
        ],
      },
    ),
    {
      required: true,
      ok: true,
      detail: "Exact line evidence has a line-numbered content reader.",
    },
  );
  assert.equal(
    reviewerEvidencePreflight(
      { prompt: "Run the unit tests.", verificationCommands: ["npm test"] },
      {},
    ).required,
    false,
  );
  assert.equal(
    reviewerEvidencePreflight(
      {
        prompt: "Include exact file/line evidence.",
        verificationCommands: ["Test-Path contract.md"],
      },
      {},
    ).ok,
    false,
  );
});

test("preflight requires content-readable evidence when the reviewer must inspect documents", () => {
  const hashOnly = reviewerEvidencePreflight(
    {
      prompt: "Review the contents of all six documents and report any contradictions.",
      verificationCommands: [
        "Get-FileHash -Algorithm SHA256 docs/one.md, docs/two.md",
        "Test-Path docs/one.md",
      ],
    },
    {},
  );
  assert.equal(hashOnly.required, true);
  assert.equal(hashOnly.ok, false);
  assert.match(hashOnly.detail, /content-readable/i);

  const targeted = reviewerEvidencePreflight(
    {
      prompt: "Review the contents of all six documents and report any contradictions.",
      verificationCommands: [
        "rg -n \"contract|invariant|decision\" docs/one.md docs/two.md",
      ],
    },
    {},
  );
  assert.equal(targeted.ok, true);
});

test("verification policy rejects impossible clean-tree checks and unbounded document dumps", () => {
  assert.deepEqual(
    verificationCommandViolations(
      {
        allowedPaths: ["docs"],
        verificationCommands: [
          "git diff --quiet",
          "if (git status --porcelain) { exit 1 }",
          "Get-Content -LiteralPath docs/contract.md",
        ],
      },
      {},
    ),
    [
      "Writable tasks cannot use a post-change verification command that requires the Git worktree to be clean.",
      "Document evidence must be bounded or targeted; do not emit an entire file with Get-Content.",
    ],
  );
  assert.deepEqual(
    verificationCommandViolations(
      {
        allowedPaths: ["docs"],
        verificationCommands: [
          "git diff --check",
          "Get-Content -LiteralPath docs/contract.md -TotalCount 120",
          "Get-Content -Raw package.json | ConvertFrom-Json | Out-Null",
          "Get-Content -Raw queue.yaml | ConvertFrom-Yaml | Test-QueueContract",
          "rg -n \"contract|decision\" docs/contract.md",
        ],
      },
      {},
    ),
    [],
  );
});

test("queue validation separates executable preconditions from post-change verification", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-preconditions-"));
  try {
    const queue = validateQueue({
      project: { path: project },
      tasks: [{
        title: "Write",
        prompt: "Change one file",
        allowedPaths: ["result.md"],
        preconditions: [
          "$status = @(git status --short); if ($status.Count) { exit 1 }; exit 0",
        ],
        verificationCommands: ["Test-Path -LiteralPath result.md"],
      }],
    });
    assert.deepEqual(queue.tasks[0].preconditions, [
      "$status = @(git status --short); if ($status.Count) { exit 1 }; exit 0",
    ]);
    assert.throws(
      () => validateQueue({
        project: { path: project },
        tasks: [{
          title: "Invalid",
          prompt: "Invalid",
          preconditions: [""],
        }],
      }),
      /preconditions.*non-empty strings/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("checkpoint requirements reject read-only or non-checkpoint predecessors", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-checkpoint-contract-"));
  const writer = {
    key: "writer",
    title: "Write",
    prompt: "Write output",
    allowedPaths: ["result.md"],
  };
  const consumer = {
    key: "consumer",
    title: "Consume",
    prompt: "Inspect the committed output",
    dependsOn: ["writer"],
    requiresCheckpointsFrom: ["writer"],
    allowedPaths: [],
  };
  try {
    assert.doesNotThrow(() => validateQueue({
      project: { path: project },
      git: { checkpointCommits: true },
      tasks: [writer, consumer],
    }));
    assert.throws(
      () => validateQueue({
        project: { path: project },
        git: { checkpointCommits: false },
        tasks: [writer, consumer],
      }),
      /requiresCheckpointsFrom.*checkpointCommits/,
    );
    assert.throws(
      () => validateQueue({
        project: { path: project },
        git: { checkpointCommits: true },
        tasks: [{ ...writer, allowedPaths: [] }, consumer],
      }),
      /read-only.*checkpoint/i,
    );
    assert.throws(
      () => validateQueue({
        project: { path: project },
        git: { checkpointCommits: true },
        tasks: [writer, { ...consumer, dependsOn: [] }],
      }),
      /requiresCheckpointsFrom.*dependsOn/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("runtime checkpoint requirements fail closed when a completed predecessor made no commit", () => {
  const predecessor = {
    key: "writer",
    title: "Write",
    status: "completed",
  };
  const consumer = {
    key: "consumer",
    title: "Consume",
    requiresCheckpointsFrom: ["writer"],
  };
  assert.match(
    checkpointRequirementViolation([predecessor, consumer], consumer) ?? "",
    /writer.*did not create a checkpoint/i,
  );
  assert.equal(
    checkpointRequirementViolation(
      [{ ...predecessor, checkpoint: { hash: "abc" } }, consumer],
      consumer,
    ),
    undefined,
  );
});

test("verification policy rejects no-index PowerShell wrappers that leak exit code one", () => {
  const unsafe =
    "$result = git diff --no-index --check -- NUL 'new.md' 2>&1; if (@($result).Count) { exit 1 }";
  const safe =
    "$result = git diff --no-index --check -- NUL 'new.md' 2>&1; if (@($result).Count) { exit 1 }; exit 0";
  assert.match(
    verificationCommandViolations(
      { allowedPaths: ["new.md"], verificationCommands: [unsafe] },
      {},
    ).join(" "),
    /exit 0/,
  );
  assert.deepEqual(
    verificationCommandViolations(
      { allowedPaths: ["new.md"], verificationCommands: [safe] },
      {},
    ),
    [],
  );
});

test("queue validation rejects unstable long inline Python and PowerShell commands", () => {
  assert.match(
    inlineCommandViolations([
      `python -c "${"assert True;".repeat(50)}"`,
    ]).join(" "),
    /versioned script/,
  );
  assert.match(
    inlineCommandViolations([
      `$paths = @('one.md'); ${"Get-Content -LiteralPath $paths[0] -TotalCount 1;".repeat(30)}`,
    ]).join(" "),
    /\.ps1 script/,
  );
  assert.deepEqual(
    inlineCommandViolations([
      "python scripts/verify_queue.py",
      ".\\scripts\\verify-queue.ps1",
    ]),
    [],
  );
});

test("PowerShell verification syntax is parsed during preflight without executing it", async () => {
  const valid = await powershellVerificationSyntaxPreflight([
    "$paths = @('one.md', 'two.md'); foreach ($path in $paths) { Test-Path -LiteralPath $path }",
    "npm test",
  ]);
  assert.equal(valid.required, true);
  assert.equal(valid.ok, true);

  const invalid = await powershellVerificationSyntaxPreflight([
    "$paths = @('one.md', 'two.md'; foreach ($path in $paths) { Test-Path -LiteralPath $path }",
  ]);
  assert.equal(invalid.required, true);
  assert.equal(invalid.ok, false);
  assert.match(invalid.detail, /PowerShell syntax/i);
});

test("detected PowerShell verification is executed by PowerShell rather than cmd", () => {
  const powershell = verificationCommandInvocation(
    "$paths = @('one.md'); Test-Path -LiteralPath $paths[0]",
  );
  assert.equal(powershell.shell, false);
  assert.match(powershell.executable, /powershell|pwsh/i);
  assert.deepEqual(powershell.args.slice(0, 3), [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
  ]);
  assert.equal(
    verificationCommandInvocation(
      'python -m pytest --basetemp="$env:TEMP\\orchestrator-pytest-$PID"',
    ).shell,
    false,
  );
  for (const command of [
    ".\\scripts\\verify.ps1",
    "& .\\scripts\\verify.ps1",
    "pwsh -File .\\scripts\\verify.ps1",
    "pwsh.exe -NoProfile -File .\\scripts\\verify.ps1",
    "powershell.exe -File .\\scripts\\verify.ps1",
  ]) {
    const invocation = verificationCommandInvocation(command);
    assert.equal(invocation.shell, false, command);
    assert.match(invocation.executable, /powershell|pwsh/i);
  }

  const ordinary = verificationCommandInvocation("npm test");
  assert.equal(ordinary.executable, "npm test");
  assert.equal(ordinary.shell, true);
});

test("correction loop is disabled only for an explicitly empty allowedPaths scope", () => {
  assert.equal(taskAllowsCorrection({ allowedPaths: [] }), false);
  assert.equal(taskAllowsCorrection({ allowedPaths: ["src"] }), true);
  assert.equal(taskAllowsCorrection({}), true);
});

test("nine reviewers returning no report cannot approve or complete tasks", () => {
  const results = Array.from({ length: 9 }, () =>
    assessReviewerResult({
      exitCode: 0,
      timedOut: false,
      report: undefined,
    }),
  );
  assert.ok(results.every((result) => result.status === "unavailable"));
  assert.ok(results.every((result) => /did not return a report/i.test(result.reason)));
  assert.ok(
    results.every(
      (result) =>
        resolveReviewedTaskStatus("completed", result.status) === "failed",
    ),
  );
});

test("reviewer diagnostics are tail-bounded for actionable task logs", () => {
  const diagnostics = boundedReviewerDiagnostics(
    `reviewer unavailable: ${"x".repeat(20_000)} final diagnostic`,
  );
  assert.ok(diagnostics.length <= 8_000);
  assert.match(diagnostics, /final diagnostic$/);
});

test("recovery after restart fails an in-progress task and preserves its run record", () => {
  const active = { ...task("active", "running"), log: ["agent started"] };
  const source = run([active], "running");
  const recovered = recoverRun(source);
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.tasks[0].status, "failed");
  assert.equal(recovered.tasks[0].exitCode, 1);
  assert.ok(recovered.tasks[0].finishedAt);
  assert.match(
    recovered.tasks[0].log.at(-1) ?? "",
    /process ended before Codex/,
  );

  const reviewer = run([
    { ...task("reviewer", "completed"), executionPhase: "reviewer" },
    task("pending", "pending"),
  ], "running");
  const recoveredReviewer = recoverRun(reviewer);
  assert.equal(recoveredReviewer.status, "failed");
  assert.equal(recoveredReviewer.tasks[0].status, "failed");
  assert.equal(recoveredReviewer.tasks[0].executionPhase, undefined);
  assert.equal(recoveredReviewer.tasks[1].status, "blocked");
  assert.ok(recoveredReviewer.finishedAt);
});

test("project lock stays outside the repository and prevents concurrent runs", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-lock-"));
  const first = run([task("first", "pending")], "idle");
  const second = run([task("second", "pending")], "idle");
  first.id = "first-run";
  second.id = "second-run";
  first.project.path = project;
  second.project.path = project;
  try {
    await acquireProjectLock(first);
    assert.notEqual(first.lock?.path, join(project, ".codex-orchestrator.lock"));
    await assert.rejects(() => access(join(project, ".codex-orchestrator.lock")));
    await assert.rejects(() => acquireProjectLock(second), /Project is locked/);
    await releaseProjectLock(first);
    await acquireProjectLock(second);
  } finally {
    await releaseProjectLock(first);
    await releaseProjectLock(second);
    await rm(project, { recursive: true, force: true });
  }
});

test("project lock removes stale legacy files and honors a live legacy owner", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-legacy-lock-"));
  const legacyPath = join(project, ".codex-orchestrator.lock");
  const source = run([task("source", "pending")], "idle");
  source.id = "source-run";
  source.project.path = project;
  try {
    await writeFile(legacyPath, JSON.stringify({ runId: "stale-run", pid: 999_999 }));
    await acquireProjectLock(source);
    await assert.rejects(() => access(legacyPath));
    await releaseProjectLock(source);

    await writeFile(legacyPath, JSON.stringify({ runId: "live-run", pid: process.pid }));
    await assert.rejects(() => acquireProjectLock(source), /Project is locked/);
  } finally {
    await releaseProjectLock(source);
    await rm(project, { recursive: true, force: true });
  }
});

test("restart recovery removes only the interrupted run's dead project lock", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-dead-lock-"));
  const source = run([task("interrupted", "running")], "running");
  source.id = "interrupted-run";
  source.project.path = project;
  const lockPath = join(project, ".codex-orchestrator.lock");
  source.lock = { path: lockPath, acquiredAt: new Date().toISOString() };
  await writeFile(
    lockPath,
    JSON.stringify({ runId: source.id, pid: 999_999 }),
  );

  try {
    assert.equal(await clearDeadProjectLock(source, () => false), true);
    await assert.rejects(() => access(lockPath));
    assert.equal(source.lock, undefined);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("startup ownership reconciliation removes a terminal run's stale lock", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-terminal-lock-"));
  const queue = validateTaskQueue({
    project: { path: project },
    tasks: [
      { key: "first", title: "First", prompt: "First task" },
      { key: "second", title: "Second", prompt: "Second task" },
    ],
  });
  const source = createRun(queue);
  source.status = "failed";
  source.finishedAt = new Date().toISOString();
  const lockPath = join(project, ".codex-orchestrator.lock");
  source.lock = { path: lockPath, acquiredAt: source.finishedAt };
  await writeFile(lockPath, JSON.stringify({ runId: source.id, pid: 999_999 }));

  try {
    assert.equal(await reconcilePersistedRunOwner(source, () => false), false);
    await assert.rejects(() => access(lockPath));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("terminal persisted runs clear only their own stale project lock", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-terminal-load-lock-"));
  const source = run([task("failed", "failed")], "failed");
  source.id = `terminal-lock-${Date.now()}-${Math.random()}`;
  source.project.path = project;
  source.finishedAt = "2026-07-25T00:00:00.000Z";
  const lockPath = join(project, ".codex-orchestrator.lock");
  source.lock = { path: lockPath, acquiredAt: source.finishedAt };
  await writeFile(lockPath, JSON.stringify({ runId: source.id, pid: 999_999 }));
  await persistRun(source);

  try {
    const loaded = await loadRun(source.id);
    assert.equal(loaded?.status, "failed");
    assert.equal(loaded?.finishedAt, source.finishedAt);
    await assert.rejects(() => access(lockPath));

    await writeFile(lockPath, JSON.stringify({ runId: "other-run", pid: 999_999 }));
    loaded!.lock = { path: lockPath, acquiredAt: source.finishedAt };
    assert.equal(await reconcilePersistedRunOwner(loaded!, () => false), false);
    await access(lockPath);

    await writeFile(lockPath, JSON.stringify({ runId: source.id, pid: 4321 }));
    assert.equal(await reconcilePersistedRunOwner(loaded!, (pid) => pid === 4321), true);
    await access(lockPath);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("loading a terminal run with its matching live lock preserves its terminal state", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-terminal-live-lock-"));
  const source = run([task("failed", "failed")], "failed");
  source.id = `terminal-live-lock-${Date.now()}-${Math.random()}`;
  source.project.path = project;
  source.finishedAt = "2026-07-25T00:00:00.000Z";
  const lockPath = join(project, ".codex-orchestrator.lock");
  source.lock = { path: lockPath, acquiredAt: source.finishedAt };
  await writeFile(lockPath, JSON.stringify({ runId: source.id, pid: process.pid }));
  await persistRun(source);

  try {
    const loaded = await loadRun(source.id);
    assert.equal(loaded?.status, "failed");
    assert.equal(loaded?.finishedAt, source.finishedAt);
    await access(lockPath);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("failed canonical run persistence does not publish a newer derived summary", async () => {
  const source = run([task("persist-order", "pending")], "running");
  source.id = `persist-order-${Date.now()}`;
  const directory = join(testDataDirectory, "runs", source.id);
  await mkdir(join(directory, "run.json"), { recursive: true });

  await assert.rejects(() => persistRun(source));
  await assert.rejects(() => access(join(directory, "summary.json")));
});

test("atomic write cleanup does not create a secondary unhandled rejection", async () => {
  const parentFile = join(testDataDirectory, `atomic-parent-${Date.now()}`);
  await writeFile(parentFile, "not a directory");
  let unhandled: unknown;
  const onUnhandled = (error: unknown) => {
    unhandled = error;
  };
  process.once("unhandledRejection", onUnhandled);
  try {
    await assert.rejects(() =>
      writeTextAtomically(join(parentFile, "run.json"), "{}"),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(unhandled, undefined);
  } finally {
    process.removeListener("unhandledRejection", onUnhandled);
  }
});

test("background run failures are observed instead of becoming unhandled rejections", async () => {
  const expected = new Error("persist failed");
  let reported: unknown;

  runInBackground(Promise.reject(expected), (error: unknown) => {
    reported = error;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(reported, expected);
});

test("run persistence keeps the run canonical and derives summaries without rewriting stale records", async () => {
  const source = run([task("summary-repair", "failed")], "failed");
  source.id = `summary-repair-${Date.now()}`;
  source.finishedAt = new Date().toISOString();
  await persistRun(source);
  const summaryFile = join(testDataDirectory, "runs", source.id, "summary.json");

  await assert.rejects(() => access(summaryFile));
  await writeFile(
    summaryFile,
    JSON.stringify({
      id: source.id,
      project: source.project,
      status: "running",
      startedAt: source.startedAt,
      taskCount: source.tasks.length,
      schemaVersion: 2,
    }),
  );

  const repaired = await loadRunSummary(source.id);

  assert.equal(repaired?.status, "failed");
  assert.equal(repaired?.finishedAt, source.finishedAt);
  assert.equal(
    (JSON.parse(await readFile(summaryFile, "utf8")) as { status: string }).status,
    "running",
  );
});

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function checkpointFixture(create = true) {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-checkpoint-"));
  git(project, "init", "-b", "main");
  git(project, "config", "user.email", "test@example.invalid");
  git(project, "config", "user.name", "Orchestrator Test");
  await writeFile(join(project, "managed.txt"), "parent\n");
  git(project, "add", "managed.txt");
  git(project, "commit", "-m", "parent");
  await writeFile(join(project, "managed.txt"), "managed checkpoint\n");
  const checkpointTask = {
    ...task("checkpoint-task", "completed"),
    changedFiles: ["managed.txt"],
  };
  const checkpointRun = run([checkpointTask], "running");
  checkpointRun.id = `checkpoint-${Date.now()}-${Math.random()}`;
  checkpointRun.project.path = project;
  checkpointRun.git.checkpointCommits = true;
  if (create) {
    await createCheckpoint(checkpointRun, checkpointTask);
    assert.ok(checkpointTask.checkpoint);
  }
  return { project, checkpointRun, checkpointTask };
}

test("managed checkpoints require a process-private authenticated receipt rather than persisted or Git evidence", async () => {
  const fixture = await checkpointFixture();
  try {
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, fixture.checkpointTask), true);
    assert.equal(fixture.checkpointRun.checkpointLedger?.length, 1);

    const forgedRun = structuredClone(fixture.checkpointRun);
    forgedRun.id = `${fixture.checkpointRun.id}-forged`;
    forgedRun.checkpointLedger = structuredClone(fixture.checkpointRun.checkpointLedger);
    const forgedTask = structuredClone(fixture.checkpointTask);
    forgedRun.tasks = [forgedTask];
    Object.freeze(forgedRun.checkpointLedger);
    Object.freeze(forgedTask.checkpoint);
    assert.equal(await isManagedCheckpoint(forgedRun, forgedTask), false);

    const ambiguousRun = structuredClone(fixture.checkpointRun);
    ambiguousRun.checkpointLedger.push(structuredClone(ambiguousRun.checkpointLedger[0]));
    assert.equal(await isManagedCheckpoint(ambiguousRun, ambiguousRun.tasks[0]), false);

    const receiptMutationRun = structuredClone(fixture.checkpointRun);
    receiptMutationRun.tasks[0].checkpoint.message = "mutated receipt field";
    receiptMutationRun.checkpointLedger[0].message = "mutated receipt field";
    assert.equal(await isManagedCheckpoint(receiptMutationRun, receiptMutationRun.tasks[0]), false);

    const replayedTask = structuredClone(fixture.checkpointTask);
    replayedTask.id = "different-task";
    fixture.checkpointRun.tasks.push(replayedTask);
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, replayedTask), false);

    const mutatedTask = structuredClone(fixture.checkpointTask);
    mutatedTask.checkpoint.hash = git(fixture.project, "rev-parse", "HEAD^");
    fixture.checkpointRun.tasks.push(mutatedTask);
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, mutatedTask), false);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

test("concurrent checkpoint finalization creates one authenticated ledger entry", async () => {
  const fixture = await checkpointFixture(false);
  try {
    await Promise.all([
      createCheckpoint(fixture.checkpointRun, fixture.checkpointTask),
      createCheckpoint(fixture.checkpointRun, fixture.checkpointTask),
    ]);
    assert.equal(fixture.checkpointRun.checkpointLedger?.length, 1);
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, fixture.checkpointTask), true);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

test("process-authenticated checkpoint chains retain only their authenticated history", async () => {
  const fixture = await checkpointFixture();
  try {
    const first = fixture.checkpointTask;
    await writeFile(join(fixture.project, "second.txt"), "second managed checkpoint\n");
    const second = {
      ...task("second-checkpoint-task", "completed"),
      changedFiles: ["second.txt"],
    };
    fixture.checkpointRun.tasks.push(second);
    await createCheckpoint(fixture.checkpointRun, second);

    assert.equal(fixture.checkpointRun.checkpointLedger?.length, 2);
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, first), true);
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, second), true);

    await writeFile(join(fixture.project, "foreign.txt"), "foreign descendant\n");
    git(fixture.project, "add", "foreign.txt");
    git(fixture.project, "commit", "-m", "foreign descendant");
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, first), false);
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, second), false);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

test("a receipt authenticated for another run cannot be replayed as a foreign checkpoint", async () => {
  const [fixture, foreign] = await Promise.all([checkpointFixture(), checkpointFixture()]);
  try {
    const foreignTask = structuredClone(foreign.checkpointTask);
    const foreignLedger = structuredClone(foreign.checkpointRun.checkpointLedger);
    fixture.checkpointRun.tasks = [foreignTask];
    fixture.checkpointRun.checkpointLedger = foreignLedger;

    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, foreignTask), false);
  } finally {
    await Promise.all([
      rm(fixture.project, { recursive: true, force: true }),
      rm(foreign.project, { recursive: true, force: true }),
    ]);
  }
});

test("managed checkpoint authentication fails closed after history rewrite, branch changes, and process restart", async () => {
  const fixture = await checkpointFixture();
  try {
    git(fixture.project, "checkout", "-b", "different-branch");
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, fixture.checkpointTask), false);
    git(fixture.project, "checkout", "main");
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, fixture.checkpointTask), true);
    const persisted = join(fixture.project, "persisted-run.json");
    await writeFile(persisted, JSON.stringify(fixture.checkpointRun));
    const serverUrl = new URL("./index.ts", import.meta.url).href;
    const output = execFileSync(
      testNodeExecutable,
      ["--import", "tsx", "--input-type=module", "-e", `process.env.ORCHESTRATOR_TEST='1'; const stored = JSON.parse(await (await import('node:fs/promises')).readFile(${JSON.stringify(persisted)}, 'utf8')); const server = await import(${JSON.stringify(serverUrl)}); process.stdout.write(String(await server.isManagedCheckpoint(stored, stored.tasks[0])));`],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(output.trim(), "false");
    const checkpoint = structuredClone(fixture.checkpointTask.checkpoint);
    const ledger = structuredClone(fixture.checkpointRun.checkpointLedger);
    const parent = git(fixture.project, "rev-parse", "HEAD^");
    git(fixture.project, "reset", "--hard", parent);
    await writeFile(join(fixture.project, "managed.txt"), "forged matching evidence\n");
    git(fixture.project, "add", "managed.txt");
    git(fixture.project, "commit", "-m", checkpoint.message);
    fixture.checkpointTask.checkpoint = {
      ...checkpoint,
      hash: git(fixture.project, "rev-parse", "HEAD"),
    };
    fixture.checkpointRun.checkpointLedger = ledger?.map((entry: any) => ({
      ...entry,
      commitHash: fixture.checkpointTask.checkpoint.hash,
    }));
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, fixture.checkpointTask), false);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

test("managed checkpoints reject a foreign descendant despite forged matching refs and reflog", async () => {
  const fixture = await checkpointFixture();
  try {
    const checkpoint = fixture.checkpointTask.checkpoint!;
    await writeFile(join(fixture.project, "foreign.txt"), "foreign descendant\n");
    git(fixture.project, "add", "foreign.txt");
    git(fixture.project, "commit", "-m", checkpoint.message);
    const foreignHead = git(fixture.project, "rev-parse", "HEAD");
    const forgedRef = `refs/orchestrator/managed/${checkpoint.ledgerId}`;
    git(
      fixture.project,
      "update-ref",
      "--create-reflog",
      "-m",
      checkpoint.message,
      forgedRef,
      checkpoint.hash,
    );
    await writeFile(
      join(fixture.project, "forged-run.json"),
      JSON.stringify(fixture.checkpointRun),
    );

    assert.equal(
      git(fixture.project, "merge-base", "--is-ancestor", checkpoint.hash, foreignHead),
      "",
    );
    assert.equal(git(fixture.project, "rev-parse", forgedRef), checkpoint.hash);
    assert.equal(
      git(fixture.project, "reflog", "show", "--format=%gs", "-1", forgedRef),
      checkpoint.message,
    );
    assert.equal(await isManagedCheckpoint(fixture.checkpointRun, fixture.checkpointTask), false);
  } finally {
    await rm(fixture.project, { recursive: true, force: true });
  }
});

async function sealedProductionMergeFixture(
  root: string,
  identity: string,
  intermediateCommits = 1,
) {
  const repository = await createWorkspaceLifecycleRepository(root);
  const input = await productionWorkspaceInput(
    root,
    repository,
    `run-${identity}`,
    `attempt-${identity}`,
  );
  return sealProductionMergeSource(
    repository,
    input,
    identity,
    intermediateCommits,
  );
}

async function sealProductionMergeSource(
  repository: string,
  input: Awaited<ReturnType<typeof productionWorkspaceInput>>,
  identity: string,
  intermediateCommits = 1,
) {
  const active = await provisionWorkspaceAttemptV1(input);
  await executeInWorkspaceAttemptV1(
    input.statePath,
    repository,
    active.workspaceAttemptId,
    {
      executable: process.execPath,
      args: [
        "-e",
        `require('node:fs').writeFileSync('merge-${identity}.txt', 'owned source\\n')`,
      ],
    },
  );
  await checkpointWorkspaceAttemptV1(
    input.statePath,
    repository,
    active.workspaceAttemptId,
    [`merge-${identity}.txt`],
    `merge source ${identity}`,
  );
  for (let index = 1; index < intermediateCommits; index += 1)
    await executeInWorkspaceAttemptV1(
      input.statePath,
      repository,
      active.workspaceAttemptId,
      {
        executable: "git",
        args: ["commit", "--allow-empty", "-m", `${identity} ${index}`],
      },
    );
  const sealed = await sealWorkspaceAttemptV1(
    input.statePath,
    repository,
    active.workspaceAttemptId,
  );
  return { repository, input, sealed };
}

function productionMergeInput(
  fixture: Awaited<ReturnType<typeof sealedProductionMergeFixture>>,
  onPersistedBoundary?: (boundary: string) => void | Promise<void>,
) {
  return {
    statePath: fixture.input.statePath,
    repositoryPath: fixture.repository,
    workspaceAttemptId: fixture.sealed.workspaceAttemptId,
    plan: fixture.sealed.plan,
    verificationCommands: ["git rev-parse -q --verify MERGE_HEAD"],
    transitionedBy: "production-test:v1",
    onPersistedBoundary,
  };
}

type TargetLeaseRaceChild = {
  child: ReturnType<typeof spawn>;
  output: string;
};

function spawnTargetLeaseRaceChild(
  mode: "execute" | "recover",
  input: ReturnType<typeof productionMergeInput>,
  mergeRequestId?: string,
  mutexPause?: {
    boundary: "dead_owner_observed" | "acquired";
    releasePath: string;
  },
): TargetLeaseRaceChild {
  const serverUrl = new URL("./index.ts", import.meta.url).href;
  const serializedInput = JSON.stringify(input);
  const serializedMutexPause = JSON.stringify(mutexPause);
  const script = `
    process.env.ORCHESTRATOR_TEST = "1";
    const server = await import(${JSON.stringify(serverUrl)});
    const fs = await import("node:fs/promises");
    const input = ${serializedInput};
    const mutexPause = ${serializedMutexPause};
    input.onTargetLeaseMutexBoundary = async (boundary, owner) => {
      if (!mutexPause || boundary !== mutexPause.boundary) return;
      process.stdout.write(JSON.stringify({
        kind: "mutex",
        boundary,
        owner,
      }) + "\\n");
      while (true) {
        try {
          await fs.access(mutexPause.releasePath);
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
      }
    };
    input.onPersistedBoundary = async (boundary) => {
      if (boundary !== "lease_persisted") return;
      process.stdout.write(JSON.stringify({ kind: "lease", pid: process.pid }) + "\\n");
      setInterval(() => {}, 1000);
      await new Promise(() => {});
    };
    try {
      const receipt = ${
        mode === "execute"
          ? "await server.executeMergeRequestV1(input)"
          : `await server.recoverMergeRequestV1(input, ${JSON.stringify(mergeRequestId)})`
      };
      process.stdout.write(JSON.stringify({ kind: "receipt", receipt }) + "\\n");
    } catch (error) {
      process.stdout.write(JSON.stringify({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      }) + "\\n");
      process.exitCode = 2;
    }
  `;
  const child = spawn(
    testNodeExecutable,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const result: TargetLeaseRaceChild = { child, output: "" };
  child.stdout?.on("data", (chunk: Buffer) => {
    result.output += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    result.output += chunk.toString("utf8");
  });
  return result;
}

async function waitForTargetLeaseOutput(
  contender: TargetLeaseRaceChild,
  marker: string,
) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (contender.output.includes(marker)) return;
    if (contender.child.exitCode !== null)
      throw new Error(
        `Target lease child ${contender.child.pid} exited before ${marker}: ${contender.output}`,
      );
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(
    `Timed out waiting for ${marker} from target lease child ${contender.child.pid}: ${contender.output}`,
  );
}

async function waitForTargetLeaseWinner(
  contenders: TargetLeaseRaceChild[],
): Promise<TargetLeaseRaceChild> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const winners = contenders.filter((entry) =>
      entry.output.includes('"kind":"lease"'),
    );
    if (winners.length > 1)
      throw new Error(
        `Multiple target lease winners: ${winners.map((entry) => entry.child.pid).join(", ")}`,
      );
    if (winners.length === 1) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      const confirmed = contenders.filter((entry) =>
        entry.output.includes('"kind":"lease"'),
      );
      assert.equal(
        confirmed.length,
        1,
        `exactly one target lease winner\n${contenders.map((entry) => entry.output).join("\n")}`,
      );
      return confirmed[0];
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  throw new Error(
    `Timed out waiting for target lease winner\n${contenders.map((entry) => entry.output).join("\n")}`,
  );
}

async function waitForTargetLeaseLosers(
  contenders: TargetLeaseRaceChild[],
  winner: TargetLeaseRaceChild,
) {
  await Promise.all(
    contenders
      .filter((entry) => entry !== winner)
      .map(
        (entry) =>
          new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () =>
                reject(
                  new Error(
                    `Target lease loser ${entry.child.pid} did not exit: ${entry.output}`,
                  ),
                ),
              20_000,
            );
            const finished = (code: number | null) => {
              clearTimeout(timeout);
              try {
                assert.equal(code, 2, entry.output);
                assert.match(
                  entry.output,
                  /live owner holds the repository target lease/,
                );
                assert.doesNotMatch(
                  entry.output,
                  /ENOTEMPTY|changed during dead-owner recovery/,
                );
                resolve();
              } catch (error) {
                reject(error);
              }
            };
            if (entry.child.exitCode !== null) finished(entry.child.exitCode);
            else entry.child.once("exit", finished);
          }),
      ),
  );
}

test("MergeRequestV1 production controller serializes, verifies, merges 100+ commits once, replays, and cleans non-force", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T007 production merge proof requires a Windows verification host",
  );
  const root = await mkdtemp(join(tmpdir(), "orchestrator merge production "));
  try {
    const fixture = await sealedProductionMergeFixture(
      root,
      "many-commits",
      101,
    );
    const expectedTarget = fixture.sealed.baseSha;
    const receipt = await executeMergeRequestV1(
      productionMergeInput(fixture),
    );
    assert.equal(receipt.result, "merged");
    assert.ok(receipt.mergeCommitSha);
    assert.deepEqual(receipt.mergeParents, [
      expectedTarget,
      fixture.sealed.sealedSourceSha,
    ]);
    assert.equal(
      gitForWorkspaceContract(fixture.repository, [
        "rev-list",
        "--parents",
        "-n",
        "1",
        receipt.mergeCommitSha!,
      ]).split(/\s+/).length,
      3,
    );
    assert.equal(
      gitForWorkspaceContract(fixture.repository, [
        "merge-base",
        "--is-ancestor",
        fixture.sealed.sealedSourceSha!,
        receipt.mergeCommitSha!,
      ]),
      "",
    );
    assert.equal(
      Number(
        gitForWorkspaceContract(fixture.repository, [
          "rev-list",
          "--count",
          `${expectedTarget}..${fixture.sealed.sealedSourceSha}`,
        ]),
      ),
      101,
    );
    const record = JSON.parse(
      await readFile(fixture.input.statePath, "utf8"),
    ) as {
      mergeRequestEvents: unknown[];
      mergeRequests: Array<{ state: string; mergeCommitSha?: string }>;
      mergeReceipts: unknown[];
      workspaceAttempts: Array<{ state: string }>;
    };
    const replayed = replayMergeRequestEventsV1(
      record.mergeRequestEvents as never,
    );
    assert.equal(replayed.size, 1);
    assert.equal(record.mergeRequests[0].state, "committed");
    assert.equal(record.mergeReceipts.length, 1);
    assert.equal(record.workspaceAttempts[0].state, "merged");
    const tampered = structuredClone(record.mergeRequestEvents) as Array<
      Record<string, unknown>
    >;
    tampered[0].state = "quarantined";
    assert.throws(
      () => replayMergeRequestEventsV1(tampered as never),
      /hash mismatch|Invalid merge transition/,
    );

    const cleaned = await cleanupWorkspaceAttemptV1(
      fixture.input.statePath,
      fixture.repository,
      fixture.sealed.workspaceAttemptId,
    );
    assert.equal(cleaned.state, "cleaned");
    await assert.rejects(access(fixture.sealed.workspacePath), /ENOENT/);
    assert.throws(
      () =>
        gitForWorkspaceContract(fixture.repository, [
          "show-ref",
          "--verify",
          fixture.sealed.branchRef,
        ]),
      /Command failed/,
    );
    assert.equal(
      gitForWorkspaceContract(fixture.repository, [
        "status",
        "--porcelain=v1",
        "-uall",
      ]),
      "",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MergeReceiptV1 ordinary load and startup reject altered canonical fields for every terminal result", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T007E receipt immutability proof requires a Windows verification host",
  );
  const root = await mkdtemp(
    join(tmpdir(), "orchestrator merge receipt semantics "),
  );
  const caseRoots: string[] = [];
  const caseRoot = async (label: string) => {
    const path = await mkdtemp(join(tmpdir(), `omr-${label}-`));
    caseRoots.push(path);
    return path;
  };
  try {
    type ReceiptRecord = Record<string, unknown> & {
      mergeReceipts: Array<Record<string, unknown>>;
    };
    type ReceiptCase = {
      result: "merged" | "replan_required" | "recovery_pending" | "quarantined";
      statePath: string;
      original: ReceiptRecord;
    };
    const loadCase = async (
      statePath: string,
      result: ReceiptCase["result"],
    ): Promise<ReceiptCase> => {
      const original = JSON.parse(
        await readFile(statePath, "utf8"),
      ) as ReceiptRecord;
      assert.equal(original.mergeReceipts.length, 1);
      assert.equal(original.mergeReceipts[0].result, result);
      return { result, statePath, original };
    };

    const mergedFixture = await sealedProductionMergeFixture(
      await caseRoot("m"),
      "receipt-merged",
    );
    assert.equal(
      (
        await executeMergeRequestV1({
          ...productionMergeInput(mergedFixture),
          verificationCommands: [
            "git rev-parse -q --verify MERGE_HEAD",
            "git status --porcelain=v1",
          ],
        })
      ).result,
      "merged",
    );

    const replanFixture = await sealedProductionMergeFixture(
      await caseRoot("r"),
      "receipt-replan",
    );
    await writeFile(
      join(replanFixture.repository, "target-moved.txt"),
      "target moved\n",
    );
    gitForWorkspaceContract(replanFixture.repository, [
      "add",
      "target-moved.txt",
    ]);
    gitForWorkspaceContract(replanFixture.repository, [
      "commit",
      "-m",
      "target moved",
    ]);
    assert.equal(
      (
        await executeMergeRequestV1({
          ...productionMergeInput(replanFixture),
          onReplanRequired: () => "receipt-drift-assessment",
        })
      ).result,
      "replan_required",
    );

    const recoveryFixture = await sealedProductionMergeFixture(
      await caseRoot("p"),
      "receipt-recovery",
    );
    assert.equal(
      (
        await executeMergeRequestV1({
          ...productionMergeInput(recoveryFixture),
          verificationCommands: [
            `${JSON.stringify(process.execPath)} -e "process.exit(9)"`,
          ],
        })
      ).result,
      "recovery_pending",
    );

    const quarantineFixture = await sealedProductionMergeFixture(
      await caseRoot("q"),
      "receipt-quarantine",
    );
    await assert.rejects(
      executeMergeRequestV1({
        ...productionMergeInput(quarantineFixture),
        onPersistedBoundary: async (boundary) => {
          if (boundary !== "merge_applied") return;
          await writeFile(
            join(quarantineFixture.repository, ".git", "MERGE_HEAD"),
            `${quarantineFixture.sealed.baseSha}\n`,
          );
          throw new Error("simulated conflicting merge fingerprint");
        },
      }),
      /simulated conflicting merge fingerprint/,
    );
    const quarantineRecord = JSON.parse(
      await readFile(quarantineFixture.input.statePath, "utf8"),
    ) as { mergeRequests: Array<{ mergeRequestId: string }> };
    assert.equal(
      (
        await recoverMergeRequestV1(
          productionMergeInput(quarantineFixture),
          quarantineRecord.mergeRequests[0].mergeRequestId,
        )
      ).result,
      "quarantined",
    );

    const cases = await Promise.all([
      loadCase(mergedFixture.input.statePath, "merged"),
      loadCase(replanFixture.input.statePath, "replan_required"),
      loadCase(recoveryFixture.input.statePath, "recovery_pending"),
      loadCase(quarantineFixture.input.statePath, "quarantined"),
    ]);
    const assertRejected = async (
      fixture: ReceiptCase,
      name: string,
      alter: (receipt: Record<string, unknown>) => void,
    ) => {
      const changed = structuredClone(fixture.original);
      alter(changed.mergeReceipts[0]);
      await writeFile(
        fixture.statePath,
        `${JSON.stringify(changed, null, 2)}\n`,
        "utf8",
      );
      await assert.rejects(
        canonicalWorkspaceRunFieldsV1(fixture.statePath),
        /receipt|MergeReceiptV1/i,
        `${fixture.result}: ${name}`,
      );
      const diagnostics: string[] = [];
      await recoverPersistedRunForStartup(
        fixture.statePath,
        (message) => diagnostics.push(message),
      );
      assert.equal(diagnostics.length, 1, `${fixture.result}: startup ${name}`);
      assert.match(
        diagnostics[0],
        /receipt|MergeReceiptV1/i,
        `${fixture.result}: startup ${name}`,
      );
      await writeFile(
        fixture.statePath,
        `${JSON.stringify(fixture.original, null, 2)}\n`,
        "utf8",
      );
    };

    for (const fixture of cases) {
      await assertRejected(fixture, "receipt identity", (receipt) => {
        receipt.mergeReceiptId = `${String(receipt.mergeReceiptId)}-altered`;
      });
      await assertRejected(fixture, "recorded time", (receipt) => {
        receipt.recordedAt = "2026-01-01T00:00:00.000Z";
      });
      await assertRejected(fixture, "terminal event", (receipt) => {
        receipt.transitionEventRef = "merge-event-missing";
      });
      await assertRejected(fixture, "receipt evidence", (receipt) => {
        receipt.evidenceRefs = [
          ...(receipt.evidenceRefs as string[]),
          "merge:receipt:altered",
        ];
      });
      await assertRejected(fixture, "reason", (receipt) => {
        receipt.reason =
          fixture.result === "merged"
            ? "Merged receipts forbid a reason."
            : `${String(receipt.reason)} altered`;
      });
    }

    const merged = cases.find((fixture) => fixture.result === "merged")!;
    await assertRejected(merged, "merge commit", (receipt) => {
      receipt.mergeCommitSha = "f".repeat(40);
    });
    await assertRejected(merged, "merge parents", (receipt) => {
      receipt.mergeParents = [
        mergedFixture.sealed.sealedSourceSha,
        mergedFixture.sealed.baseSha,
      ];
    });
    await assertRejected(merged, "verification command", (receipt) => {
      const results = receipt.verificationResults as Array<
        Record<string, unknown>
      >;
      results[0].command = `${String(results[0].command)} --altered`;
    });
    await assertRejected(merged, "swapped verification evidence", (receipt) => {
      const results = receipt.verificationResults as Array<
        Record<string, unknown>
      >;
      [results[0].evidenceRef, results[1].evidenceRef] = [
        results[1].evidenceRef,
        results[0].evidenceRef,
      ];
    });
    await assertRejected(merged, "reused verification evidence", (receipt) => {
      const results = receipt.verificationResults as Array<
        Record<string, unknown>
      >;
      results[1].evidenceRef = results[0].evidenceRef;
    });

    const replan = cases.find(
      (fixture) => fixture.result === "replan_required",
    )!;
    await assertRejected(replan, "drift assessment", (receipt) => {
      receipt.driftAssessmentId = "receipt-drift-altered";
    });
    const recovery = cases.find(
      (fixture) => fixture.result === "recovery_pending",
    )!;
    await assertRejected(recovery, "safe-abort evidence", (receipt) => {
      receipt.recoveryEvidenceRef = "merge:safe-abort:altered:1";
    });
    const quarantine = cases.find(
      (fixture) => fixture.result === "quarantined",
    )!;
    await assertRejected(quarantine, "quarantine evidence", (receipt) => {
      receipt.quarantineEvidenceRef = "merge:target-ambiguous:altered";
    });

    for (const fixture of cases)
      assert.equal(
        (await canonicalWorkspaceRunFieldsV1(fixture.statePath))
          .mergeReceipts.length,
        1,
        fixture.result,
      );
  } finally {
    await Promise.all(
      caseRoots.map((path) => rm(path, { recursive: true, force: true })),
    );
    await rm(root, { recursive: true, force: true });
  }
});

test("MergeRequestV1 records target drift for architect replan and fresh authorization without applying source", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator merge drift "));
  try {
    const fixture = await sealedProductionMergeFixture(root, "drift");
    await writeFile(join(fixture.repository, "target-moved.txt"), "target\n");
    gitForWorkspaceContract(fixture.repository, ["add", "target-moved.txt"]);
    gitForWorkspaceContract(fixture.repository, [
      "commit",
      "-m",
      "target moved",
    ]);
    const movedTarget = gitForWorkspaceContract(fixture.repository, [
      "rev-parse",
      "HEAD",
    ]);
    const handoffs: unknown[] = [];
    const receipt = await executeMergeRequestV1({
      ...productionMergeInput(fixture),
      onReplanRequired: (evidence) => {
        handoffs.push(evidence);
        return "phase2-drift-recorded";
      },
    });
    assert.equal(receipt.result, "replan_required");
    assert.equal(receipt.driftAssessmentId, "phase2-drift-recorded");
    assert.equal(
      gitForWorkspaceContract(fixture.repository, ["rev-parse", "HEAD"]),
      movedTarget,
    );
    assert.throws(
      () => gitForWorkspaceContract(fixture.repository, [
        "merge-base",
        "--is-ancestor",
        fixture.sealed.sealedSourceSha!,
        "HEAD",
      ]),
    );
    assert.deepEqual(handoffs, [
      {
        driftAssessmentId: (handoffs[0] as { driftAssessmentId: string })
          .driftAssessmentId,
        mergeRequestId: (handoffs[0] as { mergeRequestId: string })
          .mergeRequestId,
        projectId: fixture.sealed.projectId,
        changeId: fixture.sealed.changeId,
        waveId: fixture.sealed.waveId,
        taskId: fixture.sealed.taskId,
        plan: fixture.sealed.plan,
        expectedTargetSha: fixture.sealed.baseSha,
        observedTargetSha: movedTarget,
        sourceSha: fixture.sealed.sealedSourceSha,
        requiresArchitectReplan: true,
        requiresFreshHumanAuthorization: true,
      },
    ]);
    const retained = await inspectWorkspaceAttemptV1(
      fixture.input.statePath,
      fixture.sealed.workspaceAttemptId,
    );
    assert.equal(retained.state, "replan_required");
    assert.equal(
      gitForWorkspaceContract(fixture.repository, [
        "rev-parse",
        fixture.sealed.branchRef,
      ]),
      fixture.sealed.sealedSourceSha,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MergeRequestV1 exact verification failure aborts safely and preserves target/source", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator merge abort "));
  try {
    const fixture = await sealedProductionMergeFixture(root, "abort");
    const targetBefore = gitForWorkspaceContract(fixture.repository, [
      "rev-parse",
      "HEAD",
    ]);
    const receipt = await executeMergeRequestV1({
      ...productionMergeInput(fixture),
      verificationCommands: [
        `${JSON.stringify(process.execPath)} -e "process.exit(9)"`,
      ],
    });
    assert.equal(receipt.result, "recovery_pending");
    assert.match(receipt.recoveryEvidenceRef ?? "", /merge:safe-abort/);
    assert.equal(
      gitForWorkspaceContract(fixture.repository, ["rev-parse", "HEAD"]),
      targetBefore,
    );
    assert.equal(
      gitForWorkspaceContract(fixture.repository, [
        "status",
        "--porcelain=v1",
        "-uall",
      ]),
      "",
    );
    assert.equal(
      gitForWorkspaceContract(fixture.repository, [
        "rev-parse",
        fixture.sealed.branchRef,
      ]),
      fixture.sealed.sealedSourceSha,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MergeRequestV1 production crash boundaries recover idempotently through one immutable receipt", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T007 merge crash proof requires a Windows verification host",
  );
  const root = await mkdtemp(join(tmpdir(), "orchestrator merge recovery "));
  const boundaries = [
    "queued_persisted",
    "lease_persisted",
    "merge_applied",
    "verifying_persisted",
    "verification_completed",
    "merge_commit_created",
    "receipt_persisted",
  ];
  try {
    for (const [boundaryIndex, boundary] of boundaries.entries()) {
      const boundaryRoot = await mkdtemp(join(root, "b-"));
      const fixture = await sealedProductionMergeFixture(
        boundaryRoot,
        `c${boundaryIndex}`,
      );
      await assert.rejects(
        executeMergeRequestV1(
          productionMergeInput(fixture, (observed) => {
            if (observed === boundary)
              throw new Error(`simulated merge crash at ${boundary}`);
          }),
        ),
        new RegExp(`simulated merge crash at ${boundary}`),
      );
      const recordAfterCrash = JSON.parse(
        await readFile(fixture.input.statePath, "utf8"),
      ) as {
        mergeRequests: Array<{ mergeRequestId: string }>;
      };
      const mergeRequestId =
        recordAfterCrash.mergeRequests[0].mergeRequestId;
      const recovered = await recoverMergeRequestV1(
        productionMergeInput(fixture),
        mergeRequestId,
      );
      const repeated = await recoverMergeRequestV1(
        productionMergeInput(fixture),
        mergeRequestId,
      );
      assert.equal(recovered.result, "merged", boundary);
      assert.deepEqual(repeated, recovered, boundary);
      const finalRecord = JSON.parse(
        await readFile(fixture.input.statePath, "utf8"),
      ) as { mergeReceipts: unknown[] };
      assert.equal(finalRecord.mergeReceipts.length, 1, boundary);
      assert.equal(
        gitForWorkspaceContract(fixture.repository, [
          "status",
          "--porcelain=v1",
          "-uall",
        ]),
        "",
        boundary,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MergeRequestV1 production target lease serializes concurrent attempts and advances monotonically after release and dead owners", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T007 target lease proof requires a Windows verification host",
  );
  const root = await mkdtemp(join(tmpdir(), "orchestrator merge lease "));
  try {
    const repository = await createWorkspaceLifecycleRepository(root);
    const firstInput = await productionWorkspaceInput(
      root,
      repository,
      "run-l1",
      "attempt-l1",
    );
    const secondInput = await productionWorkspaceInput(
      root,
      repository,
      "run-l2",
      "attempt-l2",
    );
    const first = await sealProductionMergeSource(
      repository,
      firstInput,
      "l1",
    );
    const second = await sealProductionMergeSource(
      repository,
      secondInput,
      "l2",
    );
    await assert.rejects(
      executeMergeRequestV1(
        productionMergeInput(first, (boundary) => {
          if (boundary === "lease_persisted")
            throw new Error("hold live target lease");
        }),
      ),
      /hold live target lease/,
    );
    await assert.rejects(
      executeMergeRequestV1(productionMergeInput(second)),
      /live owner holds the repository target lease/,
    );
    const firstRecord = JSON.parse(
      await readFile(first.input.statePath, "utf8"),
    ) as {
      mergeRequests: Array<{
        mergeRequestId: string;
        lease: { epoch: number };
      }>;
    };
    const firstReceipt = await recoverMergeRequestV1(
      productionMergeInput(first),
      firstRecord.mergeRequests[0].mergeRequestId,
    );
    assert.equal(firstReceipt.result, "merged");

    const secondRecord = JSON.parse(
      await readFile(second.input.statePath, "utf8"),
    ) as { mergeRequests: Array<{ mergeRequestId: string }> };
    const driftedSecond = await recoverMergeRequestV1(
      {
        ...productionMergeInput(second),
        onReplanRequired: () => "lease-serialization-drift",
      },
      secondRecord.mergeRequests[0].mergeRequestId,
    );
    assert.equal(driftedSecond.result, "replan_required");
    const secondFinal = JSON.parse(
      await readFile(second.input.statePath, "utf8"),
    ) as { mergeRequests: Array<{ lease: { epoch: number } }> };
    assert.equal(
      secondFinal.mergeRequests[0].lease.epoch,
      firstRecord.mergeRequests[0].lease.epoch + 1,
    );

    const deadRoot = await mkdtemp(join(root, "dead-"));
    const deadRepository = await createWorkspaceLifecycleRepository(deadRoot);
    const deadInput = await productionWorkspaceInput(
      deadRoot,
      deadRepository,
      "run-dead",
      "attempt-dead",
    );
    const dead = await sealProductionMergeSource(
      deadRepository,
      deadInput,
      "dead",
    );
    await assert.rejects(
      executeMergeRequestV1(
        productionMergeInput(dead, (boundary) => {
          if (boundary === "lease_persisted")
            throw new Error("dead lease crash");
        }),
      ),
      /dead lease crash/,
    );
    const leaseDirectory = join(
      deadRepository,
      ".git",
      "orchestrator-target-leases",
    );
    const [leaseName] = await readdir(leaseDirectory);
    const leasePath = join(leaseDirectory, leaseName);
    const deadLease = JSON.parse(await readFile(leasePath, "utf8")) as {
      pid: number;
      epoch: number;
    };
    deadLease.pid = 2_147_483_647;
    await writeFile(leasePath, JSON.stringify(deadLease), "utf8");
    const deadRecord = JSON.parse(
      await readFile(dead.input.statePath, "utf8"),
    ) as { mergeRequests: Array<{ mergeRequestId: string }> };
    const recovered = await recoverMergeRequestV1(
      productionMergeInput(dead),
      deadRecord.mergeRequests[0].mergeRequestId,
    );
    assert.equal(recovered.result, "merged");
    const deadFinal = JSON.parse(
      await readFile(dead.input.statePath, "utf8"),
    ) as { mergeRequests: Array<{ lease: { epoch: number } }> };
    assert.equal(deadFinal.mergeRequests[0].lease.epoch, deadLease.epoch + 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("MergeRequestV1 production target fencing has one cross-process winner after release and dead takeover", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T007M cross-process target fencing requires a Windows verification host",
  );
  const root = await mkdtemp(
    join(tmpdir(), "orchestrator target fencing race "),
  );
  const liveChildren = new Set<ReturnType<typeof spawn>>();
  try {
    for (let repetition = 0; repetition < 5; repetition += 1) {
      const caseRoot = await mkdtemp(join(root, `race-${repetition}-`));
      const repository = await createWorkspaceLifecycleRepository(caseRoot);
      const seedInput = await productionWorkspaceInput(
        caseRoot,
        repository,
        `run-seed-${repetition}`,
        `attempt-seed-${repetition}`,
      );
      const seed = await sealProductionMergeSource(
        repository,
        seedInput,
        `seed-${repetition}`,
      );
      assert.equal(
        (await executeMergeRequestV1(productionMergeInput(seed))).result,
        "merged",
      );
      const leaseDirectory = join(
        repository,
        ".git",
        "orchestrator-target-leases",
      );
      const [leaseName] = (await readdir(leaseDirectory)).filter((name) =>
        name.endsWith(".json"),
      );
      assert.ok(leaseName);
      const leasePath = join(leaseDirectory, leaseName);
      const releasedLease = JSON.parse(
        await readFile(leasePath, "utf8"),
      ) as {
        epoch: number;
        pid: number;
        status: string;
      };
      assert.equal(releasedLease.status, "released");

      const targetBefore = {
        ref: gitForWorkspaceContract(repository, ["symbolic-ref", "HEAD"]),
        head: gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
        index: gitForWorkspaceContract(repository, ["ls-files", "--stage"]),
        tree: gitForWorkspaceContract(repository, ["write-tree"]),
        status: gitForWorkspaceContract(repository, [
          "status",
          "--porcelain=v1",
          "-uall",
        ]),
      };
      const fixtures = [];
      for (let index = 0; index < 5; index += 1) {
        const input = await productionWorkspaceInput(
          caseRoot,
          repository,
          `run-r${repetition}-${index}`,
          `attempt-r${repetition}-${index}`,
        );
        fixtures.push(
          await sealProductionMergeSource(
            repository,
            input,
            `r${repetition}-${index}`,
          ),
        );
      }
      const releasedContenders = fixtures.map((fixture) => {
        const contender = spawnTargetLeaseRaceChild(
          "execute",
          productionMergeInput(fixture),
        );
        liveChildren.add(contender.child);
        return contender;
      });
      const releasedWinner =
        await waitForTargetLeaseWinner(releasedContenders);
      await waitForTargetLeaseLosers(
        releasedContenders,
        releasedWinner,
      );
      const releasedWinnerIndex =
        releasedContenders.indexOf(releasedWinner);
      const winningFixture = fixtures[releasedWinnerIndex];
      const firstActiveLease = JSON.parse(
        await readFile(leasePath, "utf8"),
      ) as {
        epoch: number;
        pid: number;
        status: string;
        mergeRequestId: string;
      };
      assert.equal(firstActiveLease.status, "active");
      assert.equal(firstActiveLease.pid, releasedWinner.child.pid);
      assert.equal(firstActiveLease.epoch, releasedLease.epoch + 1);
      assert.doesNotThrow(() => process.kill(firstActiveLease.pid, 0));

      const winningState = await readFile(
        winningFixture.input.statePath,
        "utf8",
      );
      const winningRecord = JSON.parse(winningState) as {
        mergeRequests: Array<{ mergeRequestId: string }>;
      };
      const mergeRequestId =
        winningRecord.mergeRequests[0].mergeRequestId;
      assert.equal(firstActiveLease.mergeRequestId, mergeRequestId);
      const staleStatePath = join(
        caseRoot,
        `stale-owner-${repetition}.json`,
      );
      await writeFile(staleStatePath, winningState, "utf8");

      await stopChild(releasedWinner.child);
      liveChildren.delete(releasedWinner.child);
      assert.throws(() => process.kill(firstActiveLease.pid, 0));

      const deadContenders = Array.from({ length: 5 }, () => {
        const contender = spawnTargetLeaseRaceChild(
          "recover",
          productionMergeInput(winningFixture),
          mergeRequestId,
        );
        liveChildren.add(contender.child);
        return contender;
      });
      const deadWinner = await waitForTargetLeaseWinner(deadContenders);
      await waitForTargetLeaseLosers(deadContenders, deadWinner);
      const successorLease = JSON.parse(
        await readFile(leasePath, "utf8"),
      ) as {
        epoch: number;
        pid: number;
        status: string;
        mergeRequestId: string;
      };
      assert.equal(successorLease.status, "active");
      assert.equal(successorLease.pid, deadWinner.child.pid);
      assert.equal(successorLease.epoch, firstActiveLease.epoch + 1);
      assert.equal(successorLease.mergeRequestId, mergeRequestId);
      assert.doesNotThrow(() => process.kill(successorLease.pid, 0));
      assert.deepEqual(
        [
          releasedLease.epoch,
          firstActiveLease.epoch,
          successorLease.epoch,
        ],
        [
          releasedLease.epoch,
          releasedLease.epoch + 1,
          releasedLease.epoch + 2,
        ],
      );

      const staleInput = {
        ...productionMergeInput(winningFixture),
        statePath: staleStatePath,
      };
      const staleOwner = spawnTargetLeaseRaceChild(
        "recover",
        staleInput,
        mergeRequestId,
      );
      liveChildren.add(staleOwner.child);
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                `Stale owner did not fail closed: ${staleOwner.output}`,
              ),
            ),
          20_000,
        );
        staleOwner.child.once("exit", (code) => {
          clearTimeout(timeout);
          try {
            assert.equal(code, 2, staleOwner.output);
            assert.match(
              staleOwner.output,
              /live owner holds the repository target lease/,
            );
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      liveChildren.delete(staleOwner.child);
      assert.deepEqual(
        JSON.parse(await readFile(leasePath, "utf8")),
        successorLease,
        "a stale release/recovery cannot alter its live successor",
      );

      await stopChild(deadWinner.child);
      liveChildren.delete(deadWinner.child);
      for (const contender of [...releasedContenders, ...deadContenders])
        liveChildren.delete(contender.child);
      assert.deepEqual(
        {
          ref: gitForWorkspaceContract(repository, ["symbolic-ref", "HEAD"]),
          head: gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
          index: gitForWorkspaceContract(repository, [
            "ls-files",
            "--stage",
          ]),
          tree: gitForWorkspaceContract(repository, ["write-tree"]),
          status: gitForWorkspaceContract(repository, [
            "status",
            "--porcelain=v1",
            "-uall",
          ]),
        },
        targetBefore,
        `target changed during fencing race ${repetition}`,
      );
    }
  } finally {
    await Promise.all(
      [...liveChildren].map((child) => stopChild(child).catch(() => undefined)),
    );
    await rm(root, { recursive: true, force: true });
  }
});

test("MergeRequestV1 dead-owner mutex takeover preserves a live successor under forced interleaving", async () => {
  assert.equal(
    process.platform,
    "win32",
    "T007O forced mutex interleaving requires a Windows verification host",
  );
  const root = await mkdtemp(
    join(tmpdir(), "orchestrator mutex identity race "),
  );
  const liveChildren = new Set<ReturnType<typeof spawn>>();
  try {
    const repository = await createWorkspaceLifecycleRepository(root);
    const seedInput = await productionWorkspaceInput(
      root,
      repository,
      "run-mutex-seed",
      "attempt-mutex-seed",
    );
    const seed = await sealProductionMergeSource(
      repository,
      seedInput,
      "mutex-seed",
    );
    assert.equal(
      (await executeMergeRequestV1(productionMergeInput(seed))).result,
      "merged",
    );
    const leaseDirectory = join(
      repository,
      ".git",
      "orchestrator-target-leases",
    );
    const [leaseName] = (await readdir(leaseDirectory)).filter((name) =>
      name.endsWith(".json"),
    );
    assert.ok(leaseName);
    const leasePath = join(leaseDirectory, leaseName);
    const mutexPath = `${leasePath}.lock`;
    const deadOwner = {
      contractType: "TargetLeaseMutexV1",
      contractVersion: "1.0",
      pid: 2_147_483_647,
      token: "forced-dead-owner",
      acquiredAt: new Date().toISOString(),
    };
    await mkdir(mutexPath);
    await writeFile(
      join(mutexPath, `owner-${deadOwner.token}.json`),
      JSON.stringify(deadOwner),
      "utf8",
    );

    const targetBefore = {
      ref: gitForWorkspaceContract(repository, ["symbolic-ref", "HEAD"]),
      head: gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
      index: gitForWorkspaceContract(repository, ["ls-files", "--stage"]),
      tree: gitForWorkspaceContract(repository, ["write-tree"]),
      status: gitForWorkspaceContract(repository, [
        "status",
        "--porcelain=v1",
        "-uall",
      ]),
    };
    const aInput = await productionWorkspaceInput(
      root,
      repository,
      "run-mutex-a",
      "attempt-mutex-a",
    );
    const bInput = await productionWorkspaceInput(
      root,
      repository,
      "run-mutex-b",
      "attempt-mutex-b",
    );
    const aFixture = await sealProductionMergeSource(
      repository,
      aInput,
      "mutex-a",
    );
    const bFixture = await sealProductionMergeSource(
      repository,
      bInput,
      "mutex-b",
    );
    const releaseA = join(root, "release-a");
    const releaseB = join(root, "release-b");
    const contenderA = spawnTargetLeaseRaceChild(
      "execute",
      productionMergeInput(aFixture),
      undefined,
      { boundary: "dead_owner_observed", releasePath: releaseA },
    );
    liveChildren.add(contenderA.child);
    await waitForTargetLeaseOutput(
      contenderA,
      '"boundary":"dead_owner_observed"',
    );

    const contenderB = spawnTargetLeaseRaceChild(
      "execute",
      productionMergeInput(bFixture),
      undefined,
      { boundary: "acquired", releasePath: releaseB },
    );
    liveChildren.add(contenderB.child);
    await waitForTargetLeaseOutput(
      contenderB,
      '"boundary":"acquired"',
    );
    const successorNames = await readdir(mutexPath);
    assert.equal(successorNames.length, 1);
    const successorPath = join(mutexPath, successorNames[0]);
    const successorBefore = JSON.parse(
      await readFile(successorPath, "utf8"),
    ) as { pid: number; token: string };
    assert.equal(successorBefore.pid, contenderB.child.pid);

    await writeFile(releaseA, "continue", "utf8");
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    assert.deepEqual(
      JSON.parse(await readFile(successorPath, "utf8")),
      successorBefore,
      "stale contender A must not rename, delete, or overwrite B",
    );
    assert.equal(contenderB.child.exitCode, null);

    await writeFile(releaseB, "continue", "utf8");
    await waitForTargetLeaseOutput(contenderB, '"kind":"lease"');
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error(
              `Stale contender A did not fail closed: ${contenderA.output}`,
            ),
          ),
        20_000,
      );
      contenderA.child.once("exit", (code) => {
        clearTimeout(timeout);
        try {
          assert.equal(code, 2, contenderA.output);
          assert.match(
            contenderA.output,
            /live owner holds the repository target lease/,
          );
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    liveChildren.delete(contenderA.child);
    await stopChild(contenderB.child);
    liveChildren.delete(contenderB.child);
    assert.deepEqual(
      {
        ref: gitForWorkspaceContract(repository, ["symbolic-ref", "HEAD"]),
        head: gitForWorkspaceContract(repository, ["rev-parse", "HEAD"]),
        index: gitForWorkspaceContract(repository, ["ls-files", "--stage"]),
        tree: gitForWorkspaceContract(repository, ["write-tree"]),
        status: gitForWorkspaceContract(repository, [
          "status",
          "--porcelain=v1",
          "-uall",
        ]),
      },
      targetBefore,
      "forced mutex interleaving must not change the target",
    );
  } finally {
    await Promise.all(
      [...liveChildren].map((child) => stopChild(child).catch(() => undefined)),
    );
    await rm(root, { recursive: true, force: true });
  }
});
