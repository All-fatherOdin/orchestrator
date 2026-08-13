import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import schema from "./schemas/workflow-evals-v1.schema.json";
import manifestJson from "./workflow-eval-manifest-v1.json";
import githubFixtureJson from "./fixtures/github-deployment-intake-v1.json";
import ptcFixtureJson from "./fixtures/context-ptc-reduction-v1.json";
import denialFixtureJson from "./fixtures/s4-capability-denial-v1.json";
import {
  TOOL_CAPABILITY_MANIFEST_HASH_V1,
  TOOL_CAPABILITY_MANIFEST_V1,
  createToolChainRequestV1,
  evaluateToolCapabilityChainV1,
} from "../tool-capabilities-v1/index.ts";
import {
  assertEvalSchemaV1,
  type EvalObservationV1,
} from "../prompt-model-eval-v1/eval-lineage-v1.ts";
import type { GitHubDeploymentConnectorServiceV1 } from "../github-deployment-connector-v1/index.ts";
import type {
  ContextPtcCallResultV1,
  ContextPtcCallV1,
  ContextPtcExecutor,
  ContextPtcOperation,
  ContextPtcToolDescriptor,
} from "../programmatic-tool-calling-v1/index.ts";

export const WORKFLOW_EVAL_REASON_CODES_V1 = [
  "WORKFLOW_EVAL_PASSED", "WORKFLOW_EVAL_SCHEMA_INVALID",
  "WORKFLOW_EVAL_MANIFEST_CHANGED", "WORKFLOW_EVAL_FIXTURE_CHANGED",
  "WORKFLOW_EVAL_S4_IDENTITY_CHANGED", "WORKFLOW_EVAL_ADAPTER_MISMATCH",
  "WORKFLOW_EVAL_UNDECLARED_CALL", "WORKFLOW_EVAL_EXPECTED_CALL_MISSING",
  "WORKFLOW_EVAL_FORBIDDEN_CALL", "WORKFLOW_EVAL_ARGUMENT_MISMATCH",
  "WORKFLOW_EVAL_OUTCOME_MISMATCH", "WORKFLOW_EVAL_ORDER_VIOLATION",
  "WORKFLOW_EVAL_FAILURE_INJECTION_MISMATCH",
  "WORKFLOW_EVAL_TERMINAL_STATE_MISMATCH", "WORKFLOW_EVAL_PROHIBITED_EFFECT",
  "WORKFLOW_EVAL_LIMIT_EXCEEDED", "WORKFLOW_EVAL_PRIVACY_REJECTED",
  "WORKFLOW_EVAL_REPLAY_INVALID", "WORKFLOW_EVAL_MODEL_GRADING_UNSUPPORTED",
] as const;
export type WorkflowEvalReasonCodeV1 = typeof WORKFLOW_EVAL_REASON_CODES_V1[number];
export type WorkflowFamilyV1 = "github_deployment_intake" | "context_ptc_reduction" | "s4_capability_denial";
export type WorkflowEffectCountersV1 = Readonly<{ mockInteractions: number; liveNetworkRequests: 0; providerCalls: 0; credentialReads: 0; externalWrites: 0; uncontrolledFilesystemWrites: 0; canonicalLedgerWrites: 0 }>;
export type WorkflowExpectedCallV1 = Readonly<{ callId: string; operationId: string; occurrence: number; argumentHash: string; outcomeKind: "returned" | "rejected"; outcomeHash: string; publicSummary: string }>;
export type WorkflowEvalFixtureV1 = Readonly<{ contractType: "WorkflowEvalFixtureV1"; contractVersion: "1.0"; fixtureId: string; fixtureVersion: number; workflowFamily: WorkflowFamilyV1; privacyClassification: "public_fixture"; input: Readonly<Record<string, string | number | boolean>>; toolIds: readonly string[]; requiredS4Disposition: "allow" | "reject" | "unsupported"; requiredS4ReasonCodes: readonly string[]; expectedCalls: readonly WorkflowExpectedCallV1[]; forbiddenOperationIds: readonly string[]; orderEdges: readonly Readonly<{ beforeCallId: string; afterCallId: string }>[]; failureInjection?: Readonly<{ callId: string; phase: "before" | "instead"; errorCode: string; retryExpectation: "none" | "one_retry" | "direct_fallback" }>; expectedTerminalState: "completed" | "rejected" | "direct_fallback" | "unsupported"; expectedDisposition: "passed" | "failed" | "unsupported"; expectedReasonCodes: readonly WorkflowEvalReasonCodeV1[]; evidenceRefs: readonly string[]; expectedEffects: WorkflowEffectCountersV1; limits: Readonly<{ maxCalls: number; maxTraceBytes: number; maxPublicSummaryBytes: number; maxVirtualSteps: number }> }>;
export type WorkflowEvalManifestV1 = Readonly<{ contractType: "WorkflowEvalManifestV1"; contractVersion: "1.0"; manifestId: string; manifestVersion: number; s4ManifestId: string; s4ManifestVersion: number; s4ManifestHash: string; fixtures: readonly Readonly<{ fixtureId: string; workflowFamily: WorkflowFamilyV1; fixtureVersion: number; fixtureHash: string; toolIds: readonly string[]; runnerAdapterId: string; runnerAdapterVersion: string }>[]; operations: readonly Readonly<{ operationId: string; workflowFamily: WorkflowFamilyV1 }>[] }>;
export type WorkflowTraceCallV1 = WorkflowExpectedCallV1 & Readonly<{ virtualStep: number }>;
export type WorkflowEvalTraceV1 = Readonly<{ contractType: "WorkflowEvalTraceV1"; contractVersion: "1.0"; manifestId: string; manifestVersion: number; fixtureId: string; fixtureVersion: number; fixtureHash: string; runnerAdapterId: string; runnerAdapterVersion: string; s4ManifestHash: string; calls: readonly WorkflowTraceCallV1[]; s4DecisionIds: readonly string[]; terminalState: WorkflowEvalFixtureV1["expectedTerminalState"]; effects: WorkflowEffectCountersV1; traceHash: string }>;
export type WorkflowOracleV1 = Readonly<{ oracleId: string; status: "pass" | "fail" | "unsupported"; evidenceRefs: readonly string[] }>;
export type WorkflowEvalResultV1 = Readonly<{ contractType: "WorkflowEvalResultV1"; contractVersion: "1.0"; manifestId: string; manifestVersion: number; fixtureId: string; fixtureVersion: number; fixtureHash: string; traceHash: string; runnerAdapterId: string; runnerAdapterVersion: string; s4ManifestHash: string; disposition: "passed" | "failed" | "unsupported"; reasonCodes: readonly WorkflowEvalReasonCodeV1[]; oracles: readonly WorkflowOracleV1[]; evidenceRefs: readonly string[]; resultHash: string }>;

export class WorkflowEvalErrorV1 extends Error {
  constructor(readonly reasonCode: WorkflowEvalReasonCodeV1, message = "Workflow eval rejected.") { super(message); this.name = "WorkflowEvalErrorV1"; }
}
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
export function canonicalWorkflowEvalJsonV1(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalWorkflowEvalJsonV1).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalWorkflowEvalJsonV1(record[key])}`).join(",")}}`;
}
export const workflowEvalSha256V1 = (value: unknown) => createHash("sha256").update(canonicalWorkflowEvalJsonV1(value)).digest("hex");
function fail(code: WorkflowEvalReasonCodeV1): never { throw new WorkflowEvalErrorV1(code); }
function assertContract<T>(value: unknown, type: string): asserts value is T {
  if (!validate(value) || (value as { contractType?: string })?.contractType !== type) fail("WORKFLOW_EVAL_SCHEMA_INVALID");
}
function sortedUnique(values: readonly string[]) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "en")); }
function isPrivacyRejected(value: unknown) {
  const text = canonicalWorkflowEvalJsonV1(value);
  return /authorization|cookie|password|secret|token|prompt|stack|[A-Za-z]:\\|\/home\//i.test(text);
}
function assertPrivacy(value: unknown) {
  if (isPrivacyRejected(value)) fail("WORKFLOW_EVAL_PRIVACY_REJECTED");
}
function assertAcyclic(fixture: WorkflowEvalFixtureV1) {
  const ids = new Set(fixture.expectedCalls.map((call) => call.callId));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map([...ids].map((id) => [id, 0]));
  const edgeIds = fixture.orderEdges.map((edge) => `${edge.beforeCallId}\0${edge.afterCallId}`);
  if (new Set(edgeIds).size !== edgeIds.length) fail("WORKFLOW_EVAL_SCHEMA_INVALID");
  for (const edge of fixture.orderEdges) {
    if (!ids.has(edge.beforeCallId) || !ids.has(edge.afterCallId) || edge.beforeCallId === edge.afterCallId) fail("WORKFLOW_EVAL_SCHEMA_INVALID");
    outgoing.set(edge.beforeCallId, [...(outgoing.get(edge.beforeCallId) ?? []), edge.afterCallId]);
    indegree.set(edge.afterCallId, (indegree.get(edge.afterCallId) ?? 0) + 1);
  }
  const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) { const id = queue.shift()!; visited += 1; for (const next of outgoing.get(id) ?? []) { const degree = indegree.get(next)! - 1; indegree.set(next, degree); if (degree === 0) queue.push(next); } }
  if (visited !== ids.size) fail("WORKFLOW_EVAL_SCHEMA_INVALID");
}
export function assertWorkflowEvalFixtureV1(value: unknown): asserts value is WorkflowEvalFixtureV1 {
  assertContract<WorkflowEvalFixtureV1>(value, "WorkflowEvalFixtureV1");
  const fixture = value as WorkflowEvalFixtureV1;
  if (Buffer.byteLength(canonicalWorkflowEvalJsonV1(fixture)) > 65536) fail("WORKFLOW_EVAL_LIMIT_EXCEEDED");
  assertPrivacy(fixture);
  const callIds = fixture.expectedCalls.map((call) => call.callId);
  const operationIds = fixture.expectedCalls.map((call) => call.operationId);
  if (new Set(callIds).size !== callIds.length || new Set(fixture.evidenceRefs).size !== fixture.evidenceRefs.length || new Set(fixture.expectedReasonCodes).size !== fixture.expectedReasonCodes.length || new Set(fixture.forbiddenOperationIds).size !== fixture.forbiddenOperationIds.length || operationIds.some((id) => fixture.forbiddenOperationIds.includes(id)) || (fixture.failureInjection && !callIds.includes(fixture.failureInjection.callId))) fail("WORKFLOW_EVAL_SCHEMA_INVALID");
  assertAcyclic(fixture);
}
const fixtureList = [ptcFixtureJson, githubFixtureJson, denialFixtureJson] as unknown[];
for (const fixture of fixtureList) assertWorkflowEvalFixtureV1(fixture);
const fixtures = fixtureList as WorkflowEvalFixtureV1[];
function assertManifest(value: unknown): asserts value is WorkflowEvalManifestV1 {
  assertContract<WorkflowEvalManifestV1>(value, "WorkflowEvalManifestV1");
  const manifest = value as WorkflowEvalManifestV1;
  if (manifest.s4ManifestId !== TOOL_CAPABILITY_MANIFEST_V1.manifestId || manifest.s4ManifestVersion !== TOOL_CAPABILITY_MANIFEST_V1.manifestVersion || manifest.s4ManifestHash !== TOOL_CAPABILITY_MANIFEST_HASH_V1) fail("WORKFLOW_EVAL_S4_IDENTITY_CHANGED");
  if (canonicalWorkflowEvalJsonV1(manifest.fixtures.map((entry) => entry.fixtureId)) !== canonicalWorkflowEvalJsonV1(sortedUnique(manifest.fixtures.map((entry) => entry.fixtureId)))) fail("WORKFLOW_EVAL_MANIFEST_CHANGED");
  if (new Set(manifest.operations.map((entry) => entry.operationId)).size !== manifest.operations.length) fail("WORKFLOW_EVAL_MANIFEST_CHANGED");
  if (canonicalWorkflowEvalJsonV1(manifest.operations.map((entry) => entry.operationId)) !== canonicalWorkflowEvalJsonV1(sortedUnique(manifest.operations.map((entry) => entry.operationId)))) fail("WORKFLOW_EVAL_MANIFEST_CHANGED");
  for (const entry of manifest.fixtures) {
    const fixture = fixtures.find((item) => item.fixtureId === entry.fixtureId);
    if (!fixture || workflowEvalSha256V1(fixture) !== entry.fixtureHash || canonicalWorkflowEvalJsonV1(fixture.toolIds) !== canonicalWorkflowEvalJsonV1(entry.toolIds) || fixture.workflowFamily !== entry.workflowFamily) fail("WORKFLOW_EVAL_FIXTURE_CHANGED");
    const owned = new Set(manifest.operations.filter((operation) => operation.workflowFamily === fixture.workflowFamily).map((operation) => operation.operationId));
    const declared = new Set(manifest.operations.map((operation) => operation.operationId));
    if (fixture.expectedCalls.some((call) => !owned.has(call.operationId)) || fixture.forbiddenOperationIds.some((operationId) => !declared.has(operationId))) fail("WORKFLOW_EVAL_MANIFEST_CHANGED");
  }
  const s4Ids = new Set(TOOL_CAPABILITY_MANIFEST_V1.entries.map((entry) => entry.toolId));
  if (manifest.fixtures.some((entry) => entry.toolIds.some((id) => !s4Ids.has(id)))) fail("WORKFLOW_EVAL_S4_IDENTITY_CHANGED");
}
assertManifest(manifestJson);
export const WORKFLOW_EVAL_MANIFEST_V1 = deepFreeze(structuredClone(manifestJson as WorkflowEvalManifestV1));
export const WORKFLOW_EVAL_FIXTURES_V1 = deepFreeze(structuredClone(fixtures));
function deepFreeze<T>(value: T): T { if (value && typeof value === "object") { Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child); } return value; }
export function workflowEvalFixtureV1(id: string) { const fixture = WORKFLOW_EVAL_FIXTURES_V1.find((item) => item.fixtureId === id); if (!fixture) fail("WORKFLOW_EVAL_FIXTURE_CHANGED"); return fixture; }

export class WorkflowTraceRecorderV1 {
  private readonly calls: WorkflowTraceCallV1[] = [];
  private readonly counts = new Map<string, number>();
  constructor(readonly fixture: WorkflowEvalFixtureV1) {}
  assertDeclared(operationId: string) {
    const occurrence = (this.counts.get(operationId) ?? 0) + 1;
    const expected = this.fixture.expectedCalls.find((call) => call.operationId === operationId && call.occurrence === occurrence);
    if (this.fixture.forbiddenOperationIds.includes(operationId)) fail("WORKFLOW_EVAL_FORBIDDEN_CALL");
    if (!expected) fail("WORKFLOW_EVAL_UNDECLARED_CALL");
    return expected;
  }
  record(operationId: string, argument: unknown, outcome: unknown, summary: string, outcomeKind: "returned" | "rejected" = "returned") {
    assertPrivacy({ argument, outcome, summary });
    const occurrence = (this.counts.get(operationId) ?? 0) + 1;
    const expected = this.assertDeclared(operationId);
    this.counts.set(operationId, occurrence);
    this.calls.push({ callId: expected.callId, operationId, occurrence, argumentHash: workflowEvalSha256V1(argument), outcomeKind, outcomeHash: workflowEvalSha256V1(outcome), publicSummary: summary, virtualStep: this.calls.length + 1 });
  }
  finish(terminalState: WorkflowEvalTraceV1["terminalState"], s4DecisionIds: readonly string[]): WorkflowEvalTraceV1 {
    const entry = WORKFLOW_EVAL_MANIFEST_V1.fixtures.find((item) => item.fixtureId === this.fixture.fixtureId)!;
    const body = { contractType: "WorkflowEvalTraceV1" as const, contractVersion: "1.0" as const, manifestId: WORKFLOW_EVAL_MANIFEST_V1.manifestId, manifestVersion: WORKFLOW_EVAL_MANIFEST_V1.manifestVersion, fixtureId: this.fixture.fixtureId, fixtureVersion: this.fixture.fixtureVersion, fixtureHash: workflowEvalSha256V1(this.fixture), runnerAdapterId: entry.runnerAdapterId, runnerAdapterVersion: entry.runnerAdapterVersion, s4ManifestHash: TOOL_CAPABILITY_MANIFEST_HASH_V1, calls: [...this.calls], s4DecisionIds: [...s4DecisionIds], terminalState, effects: { mockInteractions: this.calls.length, liveNetworkRequests: 0 as const, providerCalls: 0 as const, credentialReads: 0 as const, externalWrites: 0 as const, uncontrolledFilesystemWrites: 0 as const, canonicalLedgerWrites: 0 as const } };
    const trace = { ...body, traceHash: workflowEvalSha256V1(body) };
    return deepFreeze(trace);
  }
}

type GitHubFetchV1 = NonNullable<ConstructorParameters<typeof GitHubDeploymentConnectorServiceV1>[2]>;
export function createWorkflowGitHubFetchV1(recorder: WorkflowTraceRecorderV1, delegate: GitHubFetchV1): GitHubFetchV1 {
  return async (input, init) => {
    if ((init?.method ?? "GET") !== "GET" || init?.body !== undefined) fail("WORKFLOW_EVAL_ADAPTER_MISMATCH");
    const path = new URL(input).pathname;
    const operationId = /\/deployments\/[^/]+\/statuses\//.test(path) ? "github.fetch-status" : /\/deployments\/[^/]+$/.test(path) ? "github.fetch-deployment" : /\/git\/commits\//.test(path) ? "github.fetch-target" : "github.remote-write";
    recorder.assertDeclared(operationId);
    const response = await delegate(input, init);
    recorder.record(operationId, { path: "/deployments/dep-1" }, { status: "success" }, operationId === "github.fetch-deployment" ? "fixed deployment response" : operationId === "github.fetch-status" ? "terminal status response" : "fixed target response", response.ok ? "returned" : "rejected");
    return response;
  };
}

export class WorkflowContextPtcExecutorV1 implements ContextPtcExecutor {
  constructor(private readonly recorder: WorkflowTraceRecorderV1, private readonly delegate: ContextPtcExecutor) {}
  describe(operation: ContextPtcOperation): ContextPtcToolDescriptor | undefined { return this.delegate.describe(operation); }
  async execute(call: ContextPtcCallV1): Promise<ContextPtcCallResultV1> {
    const operationId = `ptc.${call.operation.replace("schema_validate", "schema-validate")}`;
    this.recorder.assertDeclared(operationId);
    try {
      const result = await this.delegate.execute(call);
      this.recorder.record(operationId, { operation: call.operation }, { ok: true }, `${operationId.slice(4).replace("schema-validate", "schema validation")} result`);
      return result;
    } catch (error) {
      const expected = this.recorder.assertDeclared(operationId);
      const errorCode = this.recorder.fixture.failureInjection?.callId === expected.callId ? this.recorder.fixture.failureInjection.errorCode : "PTC_EXECUTION_FAILED";
      this.recorder.record(operationId, { operation: call.operation }, { errorCode }, `${operationId.slice(4)} rejected`, "rejected");
      throw error;
    }
  }
}
const oracleIds = ["schema", "s4-decision", "expected-calls", "forbidden-calls", "argument-hashes", "outcomes", "partial-order", "failure-injection", "terminal-state", "effects", "limits", "privacy", "deterministic-replay"] as const;
function capabilityRequestForFixtureV1(fixture: WorkflowEvalFixtureV1) {
  const ptcRequestId = String(fixture.input.requestId ?? fixture.fixtureId);
  const githubRequestId = String(fixture.input.requestId ?? "github-preview");
  return createToolChainRequestV1({
    requestId: fixture.workflowFamily === "context_ptc_reduction" ? `ptc-chain:${ptcRequestId}` : fixture.workflowFamily === "github_deployment_intake" ? `github-tool:${githubRequestId}` : `workflow:${fixture.fixtureId}`,
    toolIds: fixture.toolIds,
    executionPathId: fixture.workflowFamily === "github_deployment_intake" ? "github-deployment-read-v1" : undefined,
    owningEvidenceRefs: fixture.workflowFamily === "context_ptc_reduction" ? [`context-router:${ptcRequestId}`] : fixture.workflowFamily === "github_deployment_intake" ? [`github-deployment:${fixture.input.deploymentId}`, `github-deployment-status:${fixture.input.deploymentStatusId}`] : [`fixture:${fixture.fixtureId}`],
  });
}
export function evaluateWorkflowTraceV1(fixture: WorkflowEvalFixtureV1, trace: WorkflowEvalTraceV1): WorkflowEvalResultV1 {
  assertWorkflowEvalFixtureV1(fixture); assertContract<WorkflowEvalTraceV1>(trace, "WorkflowEvalTraceV1");
  const { traceHash, ...traceBody } = trace; if (traceHash !== workflowEvalSha256V1(traceBody)) fail("WORKFLOW_EVAL_REPLAY_INVALID");
  const failures = new Set<WorkflowEvalReasonCodeV1>();
  const failedOracles = new Set<string>();
  const reject = (oracleId: typeof oracleIds[number], reason: WorkflowEvalReasonCodeV1) => { failedOracles.add(oracleId); failures.add(reason); };
  const entry = WORKFLOW_EVAL_MANIFEST_V1.fixtures.find((item) => item.fixtureId === fixture.fixtureId);
  if (trace.manifestId !== WORKFLOW_EVAL_MANIFEST_V1.manifestId || trace.manifestVersion !== WORKFLOW_EVAL_MANIFEST_V1.manifestVersion || trace.fixtureId !== fixture.fixtureId || trace.fixtureVersion !== fixture.fixtureVersion || !entry || entry.fixtureHash !== workflowEvalSha256V1(fixture) || trace.fixtureHash !== entry.fixtureHash) reject("schema", "WORKFLOW_EVAL_FIXTURE_CHANGED");
  if (trace.runnerAdapterId !== entry?.runnerAdapterId || trace.runnerAdapterVersion !== entry?.runnerAdapterVersion) reject("schema", "WORKFLOW_EVAL_ADAPTER_MISMATCH");
  if (trace.s4ManifestHash !== TOOL_CAPABILITY_MANIFEST_HASH_V1) reject("s4-decision", "WORKFLOW_EVAL_S4_IDENTITY_CHANGED");
  const decision = evaluateToolCapabilityChainV1(capabilityRequestForFixtureV1(fixture));
  if (decision.disposition !== fixture.requiredS4Disposition || canonicalWorkflowEvalJsonV1(decision.reasonCodes) !== canonicalWorkflowEvalJsonV1(fixture.requiredS4ReasonCodes) || canonicalWorkflowEvalJsonV1(trace.s4DecisionIds) !== canonicalWorkflowEvalJsonV1([decision.decisionId])) reject("s4-decision", "WORKFLOW_EVAL_S4_IDENTITY_CHANGED");
  const actualById = new Map(trace.calls.map((call) => [call.callId, call]));
  if (actualById.size !== trace.calls.length || fixture.expectedCalls.some((call) => !actualById.has(call.callId))) reject("expected-calls", "WORKFLOW_EVAL_EXPECTED_CALL_MISSING");
  if (trace.calls.some((actual) => !fixture.expectedCalls.some((expected) => expected.callId === actual.callId && expected.operationId === actual.operationId && expected.occurrence === actual.occurrence))) reject("expected-calls", "WORKFLOW_EVAL_UNDECLARED_CALL");
  if (trace.calls.some((call) => fixture.forbiddenOperationIds.includes(call.operationId))) reject("forbidden-calls", "WORKFLOW_EVAL_FORBIDDEN_CALL");
  if (fixture.expectedCalls.some((expected) => actualById.get(expected.callId)?.argumentHash !== expected.argumentHash)) reject("argument-hashes", "WORKFLOW_EVAL_ARGUMENT_MISMATCH");
  if (fixture.expectedCalls.some((expected) => { const actual = actualById.get(expected.callId); return actual?.outcomeHash !== expected.outcomeHash || actual?.outcomeKind !== expected.outcomeKind; })) reject("outcomes", "WORKFLOW_EVAL_OUTCOME_MISMATCH");
  if (fixture.orderEdges.some((edge) => (actualById.get(edge.beforeCallId)?.virtualStep ?? Infinity) >= (actualById.get(edge.afterCallId)?.virtualStep ?? -Infinity))) reject("partial-order", "WORKFLOW_EVAL_ORDER_VIOLATION");
  if (fixture.failureInjection) {
    const injected = actualById.get(fixture.failureInjection.callId);
    const laterSameOperation = injected && trace.calls.find((call) => call.operationId === injected.operationId && call.occurrence === injected.occurrence + 1 && call.virtualStep > injected.virtualStep);
    const retryMatches = fixture.failureInjection.retryExpectation === "one_retry" ? Boolean(laterSameOperation) : fixture.failureInjection.retryExpectation === "none" ? !laterSameOperation : trace.terminalState === "direct_fallback";
    if (!injected || injected.outcomeKind !== "rejected" || injected.outcomeHash !== workflowEvalSha256V1({ errorCode: fixture.failureInjection.errorCode }) || !retryMatches) reject("failure-injection", "WORKFLOW_EVAL_FAILURE_INJECTION_MISMATCH");
  }
  if (trace.terminalState !== fixture.expectedTerminalState) reject("terminal-state", "WORKFLOW_EVAL_TERMINAL_STATE_MISMATCH");
  if (canonicalWorkflowEvalJsonV1(trace.effects) !== canonicalWorkflowEvalJsonV1(fixture.expectedEffects)) reject("effects", "WORKFLOW_EVAL_PROHIBITED_EFFECT");
  if (trace.calls.length > fixture.limits.maxCalls || Buffer.byteLength(canonicalWorkflowEvalJsonV1(trace)) > fixture.limits.maxTraceBytes || trace.calls.some((call) => Buffer.byteLength(call.publicSummary) > fixture.limits.maxPublicSummaryBytes || call.virtualStep > fixture.limits.maxVirtualSteps)) reject("limits", "WORKFLOW_EVAL_LIMIT_EXCEEDED");
  if (isPrivacyRejected(trace)) reject("privacy", "WORKFLOW_EVAL_PRIVACY_REJECTED");
  const disposition = failures.size ? "failed" as const : fixture.expectedDisposition;
  const reasonCodes = failures.size ? [...failures].sort() : [...fixture.expectedReasonCodes];
  const oracles = oracleIds.map((oracleId) => ({ oracleId, status: failedOracles.has(oracleId) ? "fail" as const : "pass" as const, evidenceRefs: [`trace:${trace.traceHash}`] }));
  const body = { contractType: "WorkflowEvalResultV1" as const, contractVersion: "1.0" as const, manifestId: trace.manifestId, manifestVersion: trace.manifestVersion, fixtureId: fixture.fixtureId, fixtureVersion: fixture.fixtureVersion, fixtureHash: trace.fixtureHash, traceHash: trace.traceHash, runnerAdapterId: trace.runnerAdapterId, runnerAdapterVersion: trace.runnerAdapterVersion, s4ManifestHash: trace.s4ManifestHash, disposition, reasonCodes, oracles, evidenceRefs: sortedUnique([...fixture.evidenceRefs, `trace:${trace.traceHash}`, ...trace.s4DecisionIds.map((id) => `s4:${id}`)]) };
  const result = { ...body, resultHash: workflowEvalSha256V1(body) } as WorkflowEvalResultV1;
  if (Buffer.byteLength(canonicalWorkflowEvalJsonV1(result)) > 65536) fail("WORKFLOW_EVAL_LIMIT_EXCEEDED");
  assertContract<WorkflowEvalResultV1>(result, "WorkflowEvalResultV1"); return deepFreeze(result);
}
export function assertWorkflowEvalResultV1(result: WorkflowEvalResultV1, fixture = workflowEvalFixtureV1(result.fixtureId), trace?: WorkflowEvalTraceV1) {
  assertContract<WorkflowEvalResultV1>(result, "WorkflowEvalResultV1");
  const { resultHash, ...body } = result; if (resultHash !== workflowEvalSha256V1(body) || fixture.fixtureVersion !== result.fixtureVersion || (trace && canonicalWorkflowEvalJsonV1(evaluateWorkflowTraceV1(fixture, trace)) !== canonicalWorkflowEvalJsonV1(result))) fail("WORKFLOW_EVAL_REPLAY_INVALID");
}
export function workflowEvalToPhase5ObservationV1(result: WorkflowEvalResultV1, envelope: Readonly<{ evalObservationId: string; evalRunId: string; evalCaseId: string; sampleOrdinal: number; candidateId: string; invocationId: string; member: EvalObservationV1["member"]; haltIds: readonly string[]; incidentIds: readonly string[]; incidentCoverage: EvalObservationV1["incidentCoverage"]; observedAt: string }>): EvalObservationV1 {
  assertWorkflowEvalResultV1(result);
  const observation: EvalObservationV1 = { contractType: "EvalObservationV1", contractVersion: "1.0", ...envelope, result: result.disposition, outcomes: Object.fromEntries(result.oracles.map((oracle) => [oracle.oracleId, { state: oracle.status, evidenceRefs: [...oracle.evidenceRefs, `workflow-result:${result.resultHash}`] }])), metrics: {}, policyViolationCodes: result.disposition === "failed" ? [...result.reasonCodes] : [], haltIds: [...envelope.haltIds], incidentIds: [...envelope.incidentIds], incidentCoverage: envelope.incidentCoverage, observedAt: envelope.observedAt };
  assertEvalSchemaV1<EvalObservationV1>("EvalObservationV1", observation); return deepFreeze(observation);
}
export function runDeclaredFixtureV1(fixture: WorkflowEvalFixtureV1): { trace: WorkflowEvalTraceV1; result: WorkflowEvalResultV1 } {
  const recorder = new WorkflowTraceRecorderV1(fixture);
  for (const call of fixture.expectedCalls) {
    const injected = fixture.failureInjection?.callId === call.callId;
    recorder.record(call.operationId, { ...(call.operationId.startsWith("ptc.") ? { operation: call.operationId.slice(4).replace("schema-validate", "schema_validate") } : { path: "/deployments/dep-1" }) }, injected ? { errorCode: fixture.failureInjection!.errorCode } : call.operationId.startsWith("ptc.") ? { ok: true } : { status: "success" }, call.publicSummary, injected ? "rejected" : call.outcomeKind);
  }
  const decision = evaluateToolCapabilityChainV1(capabilityRequestForFixtureV1(fixture));
  const trace = recorder.finish(fixture.expectedTerminalState, [decision.decisionId]); return { trace, result: evaluateWorkflowTraceV1(fixture, trace) };
}

export function evaluateModelGradingV1(): never {
  fail("WORKFLOW_EVAL_MODEL_GRADING_UNSUPPORTED");
}
