import assert from "node:assert/strict";
import test from "node:test";
import {
  projectTaskContractV3,
  projectWorkItemGraphV1,
  type SelectedQueueRunProjectionEvidenceV1,
  type SelectedProjectionTaskEvidenceV1,
} from "./projections.ts";
import { validateAmkProjectArtifactV2 } from "./validator.ts";

const queueHash = "a".repeat(64);
const source = {
  sourceId: "queue:accepted-slice-2",
  sha256: queueHash,
  byteLength: 2048,
  watermark: "wm-7",
} as const;

function evidence(): SelectedQueueRunProjectionEvidenceV1 {
  return {
    projectId: "orchestrator",
    sourceKind: "run",
    selectedSource: { ...source },
    currentSource: { ...source },
    tasks: [
      {
        key: "web",
        title: "Web slice",
        prompt: "Keep this prompt verbatim.\nDo not strengthen it.",
        allowedPaths: ["src/web/z.ts", "src/web/a.ts"],
        verificationCommands: ["npm test -- web", "npm run check"],
        executionGuards: ["Stop on missing evidence."],
        dependsOn: ["api"],
        status: "pending",
      },
      {
        key: "api",
        title: "API slice",
        prompt: "Implement the API slice.",
        allowedPaths: ["src/api.ts"],
        verificationCommands: ["npm test -- api"],
        status: "completed",
        terminalStatusReconciled: true,
        authorizationEvidenceVerified: true,
        authorizationEvidence: {
          contractType: "TaskAuthorizationEvidenceV1",
          decision: "authorized",
          intent: "apply",
          technicalPermission: "reversible_local_write",
          sideEffectRisk: "reversible_local_write",
          allowedPaths: ["src/api.ts"],
          verificationCommands: ["npm test -- api"],
          scopeFingerprint: "scope-api",
          goalFingerprint: "goal-api",
          authorityFingerprint: "authority-api",
        },
      },
    ],
  };
}

function withTask(
  input: SelectedQueueRunProjectionEvidenceV1,
  key: string,
  changes: Partial<SelectedProjectionTaskEvidenceV1>,
): SelectedQueueRunProjectionEvidenceV1 {
  return {
    ...input,
    tasks: input.tasks.map((task) => task.key === key ? { ...task, ...changes } : task),
  };
}

test("TaskContractV3 copies goal verbatim, preserves unknowns, and uses only exact authorization", () => {
  const input = evidence();
  const projected = projectTaskContractV3({ evidence: input, taskKey: "api" });
  assert.equal(projected.status, "partial");
  assert.ok(projected.artifact);
  assert.equal(projected.artifact.goal, "Implement the API slice.");
  assert.equal(projected.artifact.intent, "apply");
  assert.equal(projected.artifact.permission_mode, "apply");
  assert.deepEqual(projected.artifact.scope.project_files, ["src/api.ts"]);
  assert.equal(projected.artifact.workflow_profile.risk_class, "unknown");
  assert.equal(projected.artifact.workflow_profile.review_policy, "unknown");
  assert.equal(projected.artifact.workflow_profile.capability_impact, "unknown");
  assert.equal(validateAmkProjectArtifactV2("TaskContractV3", projected.artifact).valid, true);

  const unverified = withTask(input, "api", { authorizationEvidenceVerified: false });
  const conservative = projectTaskContractV3({ evidence: unverified, taskKey: "api" });
  assert.equal(conservative.artifact?.intent, "unknown");
  assert.equal(conservative.artifact?.permission_mode, "explain-only");
});

test("projections have canonical ordering, stable identity, and do not mutate input", () => {
  const input = evidence();
  const snapshot = structuredClone(input);
  const firstGraph = projectWorkItemGraphV1({ evidence: input });
  const secondGraph = projectWorkItemGraphV1({
    evidence: { ...input, tasks: [...input.tasks].reverse() },
  });
  assert.deepEqual(input, snapshot);
  assert.equal(firstGraph.projectionId, secondGraph.projectionId);
  assert.deepEqual(firstGraph.artifact?.items.map((item) => item.title), ["API slice", "Web slice"]);
  assert.deepEqual(firstGraph.artifact?.items[1].blocked_by, [`WI-${"a".repeat(16)}-api`]);

  const task = projectTaskContractV3({ evidence: input, taskKey: "web" });
  assert.equal(task.artifact?.goal, "Keep this prompt verbatim.\nDo not strengthen it.");
  assert.deepEqual(task.artifact?.scope.project_files, ["src/web/a.ts", "src/web/z.ts"]);
  assert.equal(task.projectionId, projectTaskContractV3({ evidence: input, taskKey: "web" }).projectionId);
});

test("graph is partial, navigation-only, inactive, non-authoritative, and has an empty AMK frontier", () => {
  const projected = projectWorkItemGraphV1({ evidence: evidence() });
  assert.equal(projected.status, "partial");
  assert.equal(projected.navigationOnly, true);
  assert.equal(projected.activated, false);
  assert.equal(projected.readOnly, true);
  assert.equal(projected.filesModified, false);
  assert.ok(projected.artifact);
  assert.equal(projected.artifact.task_id, `TASK-QUEUE-${"a".repeat(16)}`);
  assert.equal(projected.artifact.owner_review, "pending");
  assert.deepEqual(projected.artifact.frontier_assertion, {
    item_ids: [],
    navigation_only: true,
  });
  assert.ok(projected.artifact.items.every((item) => item.context_fit === "unknown"));
  assert.equal(validateAmkProjectArtifactV2("WorkItemGraphV1", projected.artifact).valid, true);
});

test("graph rejects cycles and unknown dependencies instead of deriving them", () => {
  const cyclic = withTask(evidence(), "api", { dependsOn: ["web"] });
  const cycle = projectWorkItemGraphV1({ evidence: cyclic });
  assert.equal(cycle.status, "conflict");
  assert.deepEqual(cycle.reasonCodes, ["GRAPH_DEPENDENCY_CYCLE"]);
  assert.equal(cycle.artifact, null);

  const unknown = withTask(evidence(), "web", { dependsOn: ["missing"] });
  const missing = projectWorkItemGraphV1({ evidence: unknown });
  assert.equal(missing.status, "conflict");
  assert.deepEqual(missing.reasonCodes, ["GRAPH_UNKNOWN_DEPENDENCY"]);
  assert.equal(missing.artifact, null);
});

test("contradictory source identity conflicts and changed identity or watermark is stale", () => {
  const base = evidence();
  const contradictory = {
    ...base,
    currentSource: { ...base.currentSource, sourceId: "queue:other" },
  };
  assert.equal(projectWorkItemGraphV1({ evidence: contradictory }).status, "conflict");

  for (const currentSource of [
    { ...source, sha256: "b".repeat(64) },
    { ...source, watermark: "wm-8" },
  ]) {
    const changed = { ...evidence(), currentSource };
    const task = projectTaskContractV3({ evidence: changed, taskKey: "api" });
    assert.equal(task.status, "stale");
    assert.equal(task.artifact, null);
  }
});

test("legacy partial evidence and failed, timed_out, and skipped outcomes stay unsupported", () => {
  const legacy = {
    ...withTask(evidence(), "web", { status: undefined }),
    sourceKind: "queue" as const,
  };
  const partial = projectTaskContractV3({ evidence: legacy, taskKey: "web" });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.reasonCodes, ["TASK_CANONICAL_RUN_STATUS_UNAVAILABLE"]);
  assert.equal(partial.artifact, null);

  for (const status of ["failed", "timed_out", "skipped"] as const) {
    const input = withTask(evidence(), "web", { status });
    const task = projectTaskContractV3({ evidence: input, taskKey: "web" });
    assert.equal(task.status, "unsupported");
    assert.equal(task.artifact, null);
    const graph = projectWorkItemGraphV1({ evidence: input });
    assert.equal(graph.status, "unsupported");
    assert.equal(graph.artifact, null);
  }
});

test("completed evidence must be canonically reconciled and exact authorization cannot widen scope", () => {
  const terminal = withTask(evidence(), "api", { terminalStatusReconciled: false });
  assert.equal(projectTaskContractV3({ evidence: terminal, taskKey: "api" }).status, "conflict");
  assert.equal(projectWorkItemGraphV1({ evidence: terminal }).status, "conflict");

  const base = evidence();
  const api = base.tasks.find((task) => task.key === "api")!;
  const widened = withTask(base, "api", {
    authorizationEvidence: { ...api.authorizationEvidence!, allowedPaths: ["src"] },
  });
  const result = projectTaskContractV3({ evidence: widened, taskKey: "api" });
  assert.equal(result.status, "conflict");
  assert.equal(result.artifact, null);
  assert.deepEqual(result.reasonCodes, ["TASK_AUTHORIZATION_SCOPE_CONFLICT"]);
});
