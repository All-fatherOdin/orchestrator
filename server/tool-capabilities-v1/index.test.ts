import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv8/dist/2020.js";
import schema from "./schemas/tool-capabilities-v1.schema.json";
import examples from "./schemas/tool-capabilities-v1.examples.json";
import {
  TOOL_CAPABILITY_MANIFEST_HASH_V1,
  TOOL_CAPABILITY_MANIFEST_V1,
  ToolCapabilityErrorV1,
  assertToolCapabilityDecisionV1,
  assertToolCapabilityManifestV1,
  createToolChainRequestV1,
  evaluateToolCapabilityChainV1,
  toolCapabilityManifestHashV1,
  type ToolCapabilityManifestV1,
} from "./index.ts";

test("Tool Capability v1 closed schemas accept fixtures and reject unknown fields", () => {
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(examples.manifest), true, JSON.stringify(validate.errors));
  assert.equal(validate(examples.request), true, JSON.stringify(validate.errors));
  assert.equal(validate(examples.decision), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...examples.manifest, promptDescription: "safe" }), false);
});

test("Tool Capability v1 production manifest is canonical and complete", () => {
  assert.doesNotThrow(() => assertToolCapabilityManifestV1(TOOL_CAPABILITY_MANIFEST_V1));
  assert.equal(TOOL_CAPABILITY_MANIFEST_V1.entries.length, 18);
  assert.equal(TOOL_CAPABILITY_MANIFEST_V1.acceptedPaths.length, 1);
  assert.equal(
    toolCapabilityManifestHashV1(TOOL_CAPABILITY_MANIFEST_V1),
    TOOL_CAPABILITY_MANIFEST_HASH_V1,
  );
  const changed = structuredClone(TOOL_CAPABILITY_MANIFEST_V1) as unknown as {
    entries: Array<{ toolId: string }>;
  };
  changed.entries.reverse();
  assert.throws(
    () => assertToolCapabilityManifestV1(changed),
    (error: unknown) =>
      error instanceof ToolCapabilityErrorV1 &&
      error.reasonCode === "TOOL_CAPABILITY_MANIFEST_INVALID",
  );
});

test("Tool Capability v1 allows the deterministic local PTC chain", () => {
  const request = createToolChainRequestV1({
    requestId: "ptc-chain:test",
    toolIds: [
      "context-ptc.filter-v1",
      "context-ptc.join-v1",
      "context-ptc.rank-v1",
      "context-ptc.deduplicate-v1",
      "context-ptc.aggregate-v1",
      "context-ptc.schema-validate-v1",
    ],
    owningEvidenceRefs: ["context:test"],
  });
  const decision = evaluateToolCapabilityChainV1(request);
  assert.equal(decision.disposition, "allow");
  assert.deepEqual(decision.reasonCodes, ["TOOL_CAPABILITY_ALLOWED"]);
  assert.equal(decision.capabilityUnion.externalCommunication, false);
  assert.doesNotThrow(() => assertToolCapabilityDecisionV1(decision));
});

test("Tool Capability v1 rejects unknown and composed direct-only tools", () => {
  const unknown = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "unknown:test",
      toolIds: ["model-described.safe-tool-v1"],
    }),
  );
  assert.equal(unknown.disposition, "reject");
  assert.deepEqual(unknown.reasonCodes, ["TOOL_CAPABILITY_UNKNOWN_HIGH_RISK"]);

  const composed = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "doctor-chain:test",
      toolIds: [
        "doctor.workspace-reconcile-v1",
        "operator.dispatch-wave-v1",
      ],
      owningEvidenceRefs: ["warden:test", "operator:test"],
    }),
  );
  assert.equal(composed.disposition, "reject");
  assert.deepEqual(composed.reasonCodes, ["TOOL_CAPABILITY_DIRECT_ONLY"]);
});

test("Tool Capability v1 unions split chain risk and denies writes", () => {
  const base = {
    owner: "context-router" as const,
    boundary: "in_process" as const,
    mutation: "none" as const,
    credentialUse: "none" as const,
    isolation: "in_process_validated" as const,
    chainMode: "composable" as const,
    owningGate: "context-direct-validation",
  };
  const manifest: ToolCapabilityManifestV1 = {
    contractType: "ToolCapabilityManifestV1",
    contractVersion: "1.0",
    manifestId: "orchestrator-tool-capabilities-v1",
    manifestVersion: 1,
    entries: [
      {
        ...base,
        toolId: "test.external-v1",
        privateDataAccess: "none",
        untrustedInput: "none",
        externalCommunication: "read_only",
      },
      {
        ...base,
        toolId: "test.private-v1",
        privateDataAccess: "credential_or_private",
        untrustedInput: "none",
        externalCommunication: "none",
      },
      {
        ...base,
        toolId: "test.untrusted-v1",
        privateDataAccess: "none",
        untrustedInput: "bounded_external",
        externalCommunication: "none",
      },
    ],
    acceptedPaths: [],
  };
  const decision = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "split-risk:test",
      toolIds: ["test.private-v1", "test.untrusted-v1", "test.external-v1"],
      manifest,
    }),
    manifest,
  );
  assert.equal(decision.disposition, "reject");
  assert.deepEqual(decision.reasonCodes, [
    "TOOL_CAPABILITY_ACCEPTED_PATH_REQUIRED",
    "TOOL_CAPABILITY_LETHAL_TRIFECTA",
  ]);

  const externalWrite = structuredClone(manifest) as unknown as {
    entries: Array<ToolCapabilityManifestV1["entries"][number]>;
  };
  externalWrite.entries[0] = {
    ...externalWrite.entries[0],
    externalCommunication: "write",
  };
  const writeDecision = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "external-write:test",
      toolIds: ["test.external-v1"],
      manifest: externalWrite as unknown as ToolCapabilityManifestV1,
    }),
    externalWrite as unknown as ToolCapabilityManifestV1,
  );
  assert.deepEqual(writeDecision.reasonCodes, [
    "TOOL_CAPABILITY_EXTERNAL_WRITE_DENIED",
  ]);
});

test("Tool Capability v1 admits only the exact accepted GitHub read path", () => {
  const withoutPath = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "github-read:missing-path",
      toolIds: ["connector.github-deployment-read-v1"],
      owningEvidenceRefs: ["github-deployment:test"],
    }),
  );
  assert.equal(withoutPath.disposition, "reject");
  assert.deepEqual(withoutPath.reasonCodes, [
    "TOOL_CAPABILITY_ACCEPTED_PATH_REQUIRED",
    "TOOL_CAPABILITY_LETHAL_TRIFECTA",
  ]);

  const allowed = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "github-read:accepted",
      toolIds: ["connector.github-deployment-read-v1"],
      executionPathId: "github-deployment-read-v1",
      owningEvidenceRefs: ["github-deployment:test"],
    }),
  );
  assert.equal(allowed.disposition, "allow");

  const changedManifest = structuredClone(
    TOOL_CAPABILITY_MANIFEST_V1,
  ) as unknown as ToolCapabilityManifestV1;
  const unsafePath = structuredClone(changedManifest) as unknown as {
    acceptedPaths: Array<{ requiredOwningGate: string }>;
  };
  unsafePath.acceptedPaths[0].requiredOwningGate = "generic-confirmation";
  assert.throws(() => assertToolCapabilityManifestV1(unsafePath));
});

test("Tool Capability v1 keeps opaque Codex tools unsupported", () => {
  const decision = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "codex-tools:test",
      toolIds: ["codex-cli.opaque-local-tools-v1"],
      owningEvidenceRefs: ["codex-process:test"],
    }),
  );
  assert.equal(decision.disposition, "unsupported");
  assert.deepEqual(decision.reasonCodes, [
    "TOOL_CAPABILITY_UNSUPPORTED_BOUNDARY",
  ]);
});

test("Tool Capability v1 replay rejects changed decision evidence", () => {
  const decision = evaluateToolCapabilityChainV1(
    createToolChainRequestV1({
      requestId: "replay:test",
      toolIds: ["operator.resolve-incident-v1"],
      owningEvidenceRefs: ["operator:test"],
    }),
  );
  assert.doesNotThrow(() => assertToolCapabilityDecisionV1(decision));
  assert.throws(
    () =>
      assertToolCapabilityDecisionV1({
        ...decision,
        disposition: "reject",
        reasonCodes: ["TOOL_CAPABILITY_DIRECT_ONLY"],
      }),
    (error: unknown) =>
      error instanceof ToolCapabilityErrorV1 &&
      error.reasonCode === "TOOL_CAPABILITY_REPLAY_INVALID",
  );
});
