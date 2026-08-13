import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv8/dist/2020.js";
import schema from "./schemas/workflow-evals-v1.schema.json";
import examples from "./schemas/workflow-evals-v1.examples.json";
import {
  WORKFLOW_EVAL_FIXTURES_V1,
  WORKFLOW_EVAL_MANIFEST_V1,
  WorkflowContextPtcExecutorV1,
  WorkflowEvalErrorV1,
  WorkflowTraceRecorderV1,
  assertWorkflowEvalFixtureV1,
  assertWorkflowEvalResultV1,
  canonicalWorkflowEvalJsonV1,
  createWorkflowGitHubFetchV1,
  evaluateModelGradingV1,
  evaluateWorkflowTraceV1,
  runDeclaredFixtureV1,
  workflowEvalFixtureV1,
  workflowEvalSha256V1,
  workflowEvalToPhase5ObservationV1,
  type WorkflowEvalTraceV1,
} from "./index.ts";
import {
  ContextPtcFailure,
  LocalDeterministicContextPtcExecutor,
  applyContextProgrammaticReductionV1,
} from "../programmatic-tool-calling-v1/index.ts";
import type { ContextProviderResult } from "../index.ts";
import {
  GitHubDeploymentConnectorServiceV1,
  loadGitHubDeploymentConnectorConfigV1,
} from "../github-deployment-connector-v1/index.ts";
import type { OperationalOutcomeProjectionV1 } from "../operational-outcomes-v1/index.ts";

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const failsWith = (reasonCode: string) => (error: unknown) => error instanceof WorkflowEvalErrorV1 && error.reasonCode === reasonCode && error.message === "Workflow eval rejected.";
function rehashTrace(trace: WorkflowEvalTraceV1, patch: Record<string, unknown>) {
  const { traceHash: _old, ...body } = { ...structuredClone(trace), ...patch };
  return { ...body, traceHash: workflowEvalSha256V1(body) } as WorkflowEvalTraceV1;
}

test("S5 closed schema accepts all examples and rejects extensions and unknown enums", () => {
  for (const value of Object.values(examples)) assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...examples.fixture, extra: true }), false);
  assert.equal(validate({ ...examples.fixture, expectedDisposition: "maybe" }), false);
});

test("S5 manifest is exact, sorted, complete, and deeply immutable", () => {
  assert.equal(WORKFLOW_EVAL_MANIFEST_V1.fixtures.length, 3);
  assert.deepEqual(WORKFLOW_EVAL_MANIFEST_V1.fixtures.map((item) => item.fixtureId), [...WORKFLOW_EVAL_MANIFEST_V1.fixtures.map((item) => item.fixtureId)].sort());
  assert.deepEqual(WORKFLOW_EVAL_MANIFEST_V1.operations.map((item) => item.operationId), [...WORKFLOW_EVAL_MANIFEST_V1.operations.map((item) => item.operationId)].sort());
  assert.equal(Object.isFrozen(WORKFLOW_EVAL_MANIFEST_V1), true);
  assert.equal(Object.isFrozen(WORKFLOW_EVAL_MANIFEST_V1.fixtures[0]), true);
  assert.throws(() => { (WORKFLOW_EVAL_MANIFEST_V1.fixtures as unknown[]).push({}); }, TypeError);
});

test("S5 three declared families replay deterministically with zero prohibited effects", () => {
  assert.deepEqual(WORKFLOW_EVAL_FIXTURES_V1.map((fixture) => fixture.workflowFamily).sort(), ["context_ptc_reduction", "github_deployment_intake", "s4_capability_denial"]);
  for (const fixture of WORKFLOW_EVAL_FIXTURES_V1) {
    const first = runDeclaredFixtureV1(fixture);
    const second = runDeclaredFixtureV1(fixture);
    assert.equal(canonicalWorkflowEvalJsonV1(first), canonicalWorkflowEvalJsonV1(second));
    assert.equal(first.result.disposition, "passed");
    assert.deepEqual(first.result.reasonCodes, ["WORKFLOW_EVAL_PASSED"]);
    assert.equal(first.result.oracles.length, 13);
    assert.equal(first.result.oracles.every((oracle) => oracle.status === "pass"), true);
    assert.deepEqual(first.trace.effects, fixture.expectedEffects);
    assertWorkflowEvalResultV1(first.result, fixture, first.trace);
  }
});

test("S5 validates duplicates, cycles, privacy, and fixture limits without echoing input", () => {
  const base = structuredClone(workflowEvalFixtureV1("github-deployment-intake-v1"));
  assert.throws(() => assertWorkflowEvalFixtureV1({ ...base, orderEdges: [...base.orderEdges, base.orderEdges[0]] }), failsWith("WORKFLOW_EVAL_SCHEMA_INVALID"));
  assert.throws(() => assertWorkflowEvalFixtureV1({ ...base, orderEdges: [{ beforeCallId: "github-get-deployment", afterCallId: "github-get-status" }, { beforeCallId: "github-get-status", afterCallId: "github-get-deployment" }] }), failsWith("WORKFLOW_EVAL_SCHEMA_INVALID"));
  assert.throws(() => assertWorkflowEvalFixtureV1({ ...base, input: { password: "PRIVATE_VALUE" } }), (error: unknown) => failsWith("WORKFLOW_EVAL_PRIVACY_REJECTED")(error) && !String((error as Error).message).includes("PRIVATE_VALUE"));
  assert.throws(() => assertWorkflowEvalFixtureV1({ ...base, limits: { ...base.limits, maxTraceBytes: 65537 } }), failsWith("WORKFLOW_EVAL_SCHEMA_INVALID"));
});

test("S5 recorder rejects undeclared and forbidden calls before adapter outcome", async () => {
  const fixture = workflowEvalFixtureV1("github-deployment-intake-v1");
  const recorder = new WorkflowTraceRecorderV1(fixture);
  let delegated = 0;
  const fetcher = createWorkflowGitHubFetchV1(recorder, async () => { delegated += 1; return new Response("{}"); });
  await assert.rejects(() => fetcher("https://api.github.test/repos/o/r/issues"), failsWith("WORKFLOW_EVAL_FORBIDDEN_CALL"));
  assert.equal(delegated, 0);
  assert.throws(() => recorder.record("github.unknown", {}, {}, "unknown"), failsWith("WORKFLOW_EVAL_UNDECLARED_CALL"));
});

test("S5 GitHub adapter runs through the real connector preview with three GETs", async () => {
  const fixture = workflowEvalFixtureV1("github-deployment-intake-v1");
  const recorder = new WorkflowTraceRecorderV1(fixture);
  const bodies = [
    { id: 42, sha: "1".repeat(40), environment: "production", production_environment: true, repository_url: "https://api.github.com/repos/owner-one/repository-one" },
    { id: 101, state: "success", environment: "production", created_at: "2026-08-13T00:00:00Z", repository_url: "https://api.github.com/repos/owner-one/repository-one", deployment_url: "https://api.github.com/repos/owner-one/repository-one/deployments/42" },
    { sha: "1".repeat(40), tree: { sha: "2".repeat(40) } },
  ];
  const fetcher = createWorkflowGitHubFetchV1(recorder, async () => new Response(JSON.stringify(bodies.shift()), { status: 200, headers: { "content-type": "application/json" } }));
  const config = loadGitHubDeploymentConnectorConfigV1({ ORCHESTRATOR_GITHUB_DEPLOYMENTS_OWNER: "owner-one", ORCHESTRATOR_GITHUB_DEPLOYMENTS_REPOSITORY: "repository-one", ORCHESTRATOR_GITHUB_DEPLOYMENTS_PRODUCTION_ENVIRONMENT: "production", ORCHESTRATOR_GITHUB_DEPLOYMENTS_SOURCE_ID: "github-source", ORCHESTRATOR_GITHUB_DEPLOYMENTS_TOKEN: "test-only" })!;
  const watermark = { sequence: 1, hash: "a".repeat(64) };
  const projection = { contractType: "OperationalOutcomeProjectionV1", contractVersion: "1.0", projectId: "project-public", watermark, sources: [{ sourceId: "github-source", family: "deployment", sourceSystem: "github-deployments", formatVersion: "github-deployments-v1", allowedKinds: ["deployment"], privacyClass: "restricted-metadata-only", projectId: "project-public", ownerActor: "owner", status: "active", registeredAt: "2026-08-13T00:00:00.000Z", registeredSequence: 1, sourceHash: "b".repeat(64) }], observations: [], attributions: [], receipts: [] } as OperationalOutcomeProjectionV1;
  const service = new GitHubDeploymentConnectorServiceV1(config, {
    getChangeDetails: async () => ({ targetCommitSha: "1".repeat(40), targetTreeSha: "2".repeat(40) }),
    getOperationalOutcomeProjectionV1: async () => projection,
    previewOperationalOutcomeImportV1: async () => ({ contractType: "OperationalOutcomePreviewV1", contractVersion: "1.0", requestId: "github-preview", allowed: true, reasonCodes: [], sourceWatermark: watermark, contentHash: "c".repeat(64), observationCount: 1, wouldMutate: false }),
    executeOperationalOutcomeImportV1: async () => { throw new Error("not authorized"); },
  }, fetcher);
  const preview = await service.preview({ contractType: "GitHubDeploymentConnectorPreviewRequestV1", contractVersion: "1.0", requestId: "github-preview", idempotencyKey: "github-preview", projectId: "project-public", changeId: "change-public", actor: "owner", observedProject: watermark, sourceId: "github-source", deploymentId: "42", deploymentStatusId: "101", confirm: false });
  assert.equal(preview.allowed, true);
  assert.equal(bodies.length, 0);
  const trace = recorder.finish("completed", [preview.toolCapabilityDecision.decisionId]);
  const result = evaluateWorkflowTraceV1(fixture, trace);
  assert.equal(result.disposition, "passed", JSON.stringify(result.reasonCodes));
});

test("S5 independently reports argument, outcome, order, terminal, effect, and adapter failures", () => {
  const fixture = workflowEvalFixtureV1("github-deployment-intake-v1");
  const { trace } = runDeclaredFixtureV1(fixture);
  const calls = structuredClone(trace.calls).map((call, index) => index === 0 ? { ...call, argumentHash: "a".repeat(64) } : index === 1 ? { ...call, outcomeHash: "b".repeat(64) } : { ...call, virtualStep: 1 });
  const tampered = rehashTrace(trace, { calls, terminalState: "rejected", effects: { ...trace.effects, mockInteractions: 2 }, runnerAdapterVersion: "2.0" });
  const result = evaluateWorkflowTraceV1(fixture, tampered);
  assert.equal(result.disposition, "failed");
  for (const reason of ["WORKFLOW_EVAL_ARGUMENT_MISMATCH", "WORKFLOW_EVAL_OUTCOME_MISMATCH", "WORKFLOW_EVAL_ORDER_VIOLATION", "WORKFLOW_EVAL_TERMINAL_STATE_MISMATCH", "WORKFLOW_EVAL_PROHIBITED_EFFECT", "WORKFLOW_EVAL_ADAPTER_MISMATCH"]) assert.equal(result.reasonCodes.includes(reason as never), true);
});

test("S5 failure injection is exact and deterministic", () => {
  const fixture = workflowEvalFixtureV1("context-ptc-reduction-v1");
  const { result } = runDeclaredFixtureV1(fixture);
  assert.equal(result.oracles.find((oracle) => oracle.oracleId === "failure-injection")?.status, "pass");
  assert.equal(result.reasonCodes.includes("WORKFLOW_EVAL_FAILURE_INJECTION_MISMATCH"), false);
});

test("S5 PTC adapter runs through the real reduction and preserves one retry", async () => {
  const fixture = workflowEvalFixtureV1("context-ptc-reduction-v1");
  const recorder = new WorkflowTraceRecorderV1(fixture);
  const local = new LocalDeterministicContextPtcExecutor();
  let first = true;
  const adapter = new WorkflowContextPtcExecutorV1(recorder, {
    describe: (operation) => local.describe(operation),
    execute: async (call) => {
      if (first && call.operation === "filter") { first = false; throw new ContextPtcFailure("PTC_RETRYABLE", "injected", true); }
      return local.execute(call);
    },
  });
  const routed = {
    provider: "fallback",
    bundle: {
      contract_type: "ContextBundleV1", contract_version: "1.0", bundle_id: "bundle-public", request_id: "context-public", task: "Review", profile: "review", generated_at: "2026-08-13T00:00:00.000Z",
      policy_refs: { context_index: "index", retrieval_policy: "retrieval", retrieval_scoring_policy: "scoring" }, sources: [],
      selection: { max_sources: 1, selected_source_count: 0, omitted_source_count: 0, missing_required_paths: [], skipped_trigger_only_context: [], skipped_high_risk_context: [], truncated: false },
      scope_expansion: { runtime: false, external_system: false, data: false, project_map_mutated: false },
    },
    receipt: {
      contract_type: "ContextReceiptV1", contract_version: "1.0", receipt_id: "receipt-public", request_id: "context-public", bundle_id: "bundle-public", outcome: "pass", reason_codes: [], checks: [], counts: { requested_max_sources: 1, selected_sources: 0, omitted_sources: 0 },
      policy_refs: { context_index: "index", retrieval_policy: "retrieval", retrieval_scoring_policy: "scoring" }, tools: { requested: [], allowed: [], denied: [] }, changed_paths: [], scope_expansion: { runtime: false, external_system: false, data: false, project_map_mutated: false },
    },
  } as ContextProviderResult;
  const reduced = await applyContextProgrammaticReductionV1(routed, { enabled: true, executor: adapter, maxAttempts: 2 }, (_kind, value) => value);
  assert.equal(reduced.programmaticReduction?.state, "applied");
  assert.equal(reduced.programmaticReduction?.call_receipts[0].attempts, 2);
  const trace = recorder.finish("completed", [reduced.programmaticReduction!.tool_capability_decision.decisionId]);
  const result = evaluateWorkflowTraceV1(fixture, trace);
  assert.equal(result.disposition, "passed", JSON.stringify(result.reasonCodes));
});

test("S5 rejects a validly rehashed fixture that is not manifest-bound", () => {
  const base = workflowEvalFixtureV1("github-deployment-intake-v1");
  const changed = { ...structuredClone(base), input: { ...base.input, deploymentId: "dep-2" } };
  assertWorkflowEvalFixtureV1(changed);
  const recorder = new WorkflowTraceRecorderV1(changed);
  for (const call of changed.expectedCalls) recorder.record(call.operationId, { path: "/deployments/dep-1" }, { status: "success" }, call.publicSummary);
  const decisionId = runDeclaredFixtureV1(base).trace.s4DecisionIds[0];
  const trace = recorder.finish(changed.expectedTerminalState, [decisionId]);
  assert.equal(evaluateWorkflowTraceV1(changed, trace).reasonCodes.includes("WORKFLOW_EVAL_FIXTURE_CHANGED"), true);
});

test("S5 trace and result tampering fail closed", () => {
  const fixture = workflowEvalFixtureV1("s4-capability-denial-v1");
  const { trace, result } = runDeclaredFixtureV1(fixture);
  assert.throws(() => evaluateWorkflowTraceV1(fixture, { ...trace, terminalState: "completed" }), failsWith("WORKFLOW_EVAL_REPLAY_INVALID"));
  assert.throws(() => assertWorkflowEvalResultV1({ ...result, disposition: "failed" }), failsWith("WORKFLOW_EVAL_REPLAY_INVALID"));
});

test("S5 privacy oracle rejects a validly rehashed private summary", () => {
  const fixture = workflowEvalFixtureV1("github-deployment-intake-v1");
  const { trace } = runDeclaredFixtureV1(fixture);
  const calls = trace.calls.map((call, index) => index === 0 ? { ...call, publicSummary: "secret value" } : call);
  const result = evaluateWorkflowTraceV1(fixture, rehashTrace(trace, { calls }));
  assert.equal(result.reasonCodes.includes("WORKFLOW_EVAL_PRIVACY_REJECTED"), true);
  assert.equal(result.oracles.find((oracle) => oracle.oracleId === "privacy")?.status, "fail");
});

test("S5 maps validated results to Phase 5 without publishing state", () => {
  const result = runDeclaredFixtureV1(workflowEvalFixtureV1("s4-capability-denial-v1")).result;
  const observation = workflowEvalToPhase5ObservationV1(result, {
    evalObservationId: "observation-s5", evalRunId: "run-s5", evalCaseId: "case-s5", sampleOrdinal: 1, candidateId: "candidate-s5", invocationId: "invocation-s5",
    member: { changeId: "change-s5", waveId: "wave-s5", taskId: "task-s5", bindingId: "binding-s5", commitSha: "a".repeat(40) },
    haltIds: [], incidentIds: [], incidentCoverage: { startsAt: "2026-08-13T00:00:00.000Z", endsAt: "2026-08-13T01:00:00.000Z", sourceRefs: ["fixture:s5"] }, observedAt: "2026-08-13T01:00:00.000Z",
  });
  assert.equal(observation.result, "passed");
  assert.deepEqual(observation.policyViolationCodes, []);
  assert.equal(Object.keys(observation.outcomes).length, 13);
});

test("S5 explicitly rejects model grading", () => {
  assert.throws(() => evaluateModelGradingV1(), failsWith("WORKFLOW_EVAL_MODEL_GRADING_UNSUPPORTED"));
});
