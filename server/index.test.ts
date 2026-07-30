import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import Ajv2020 from "ajv8/dist/2020.js";
import type {
  ArchitectReplanReceiptV1,
  PlanAuthorizationV1,
  PlanningContractV1,
  TrustedRepositorySnapshotV1,
} from "./change-control-v1/index.ts";

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
  powershellVerificationSyntaxPreflight,
  verificationCommandInvocation,
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
  FallbackContextProvider,
  RepositoryContextHelperProvider,
  resolveTaskContext,
  cachePreflightContexts,
  contextsForRun,
  createRun,
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
const {
  ChangeControlError,
  ChangeControlStore,
} = await import("./change-control-v1/index.ts");
const testNodeExecutable = process.env.ORCHESTRATOR_TEST_NODE ?? process.execPath;

const planningShaOne = "1".repeat(40);
const planningShaTwo = "2".repeat(40);

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

test("visual task editor exposes accessible optional context controls", () => {
  const markup = renderToStaticMarkup(createElement(TaskContextControls, {
    task: { title: "Review", prompt: "Review repository", contextProfile: "review" },
    onChange: () => undefined,
  }));
  assert.match(markup, /<label[^>]*>Context profile/);
  assert.match(markup, /<label[^>]*>Maximum context sources/);
  assert.match(markup, /aria-label="Context profile"/);
  assert.match(markup, /aria-label="Maximum context sources"/);
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
