import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv8/dist/2020.js";
import invalidFixtures from "./fixtures/invalid.json";
import validFixture from "./fixtures/valid.json";
import discoveryV1Schema from "./schemas/discovery-v1.schema.json";
import errorV1Schema from "./schemas/error-v1.schema.json";
import mappingInputV1Schema from "./schemas/mapping-input-v1.schema.json";
import queueDraftV1Schema from "./schemas/queue-draft-v1.schema.json";
import requestV1Schema from "./schemas/request-v1.schema.json";
import responseV1Schema from "./schemas/response-v1.schema.json";
import targetDescriptorV1Schema from "./schemas/target-descriptor-v1.schema.json";
import reviewReceiptV1Schema from "../amk-project-artifacts-v2/schemas/review-receipt-v1.schema.json";
import taskContractV3Schema from "../amk-project-artifacts-v2/schemas/task-contract-v3.schema.json";
import verificationReceiptV2Schema from "../amk-project-artifacts-v2/schemas/verification-receipt-v2.schema.json";
import workItemGraphV1Schema from "../amk-project-artifacts-v2/schemas/work-item-graph-v1.schema.json";

const ajv = new Ajv2020({ allErrors: true, strict: true });
for (const schema of [
  taskContractV3Schema,
  workItemGraphV1Schema,
  verificationReceiptV2Schema,
  reviewReceiptV1Schema,
  mappingInputV1Schema,
  queueDraftV1Schema,
]) ajv.addSchema(schema);

const validators = {
  discovery: ajv.compile(discoveryV1Schema),
  error: ajv.compile(errorV1Schema),
  request: ajv.compile(requestV1Schema),
  response: ajv.compile(responseV1Schema),
  target: ajv.getSchema(targetDescriptorV1Schema.$id) ?? ajv.compile(targetDescriptorV1Schema),
  mapping: ajv.getSchema(mappingInputV1Schema.$id)!,
  queue: ajv.getSchema(queueDraftV1Schema.$id)!,
} as const;

function assertClosedObjects(value: unknown, location = "schema"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertClosedObjects(item, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.type === "object")
    assert.equal(record.additionalProperties, false, `${location} must be closed`);
  for (const [key, item] of Object.entries(record))
    assertClosedObjects(item, `${location}.${key}`);
}

test("all Slice 1 and Slice 2 schemas are closed Draft 2020-12 contracts", () => {
  for (const schema of [
    discoveryV1Schema,
    errorV1Schema,
    requestV1Schema,
    responseV1Schema,
    targetDescriptorV1Schema,
    mappingInputV1Schema,
    queueDraftV1Schema,
  ]) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assertClosedObjects(schema, schema.title);
  }
});

test("Slice 2 discovery and error envelopes are closed, bounded, and path-free", () => {
  const discovery = {
    contractType: "AmkQueueDraftDiscoveryV1",
    contractVersion: "1.0",
    operations: ["discover", "preview"],
    sourceContracts: ["TaskContractV3", "WorkItemGraphV1", "VerificationReceiptV2", "ReviewReceiptV1"],
    limits: {
      requestBytes: 262144,
      responseBytes: 524288,
      artifactEntries: 100,
      tasks: 100,
      allowedPaths: 100,
      verificationCommands: 100,
      targets: 100,
    },
    targets: [{
      targetId: `PROJECT-${"a".repeat(64)}`,
      targetHash: "b".repeat(64),
      targetWatermark: `AMK-TARGET-${"b".repeat(64)}-0`,
      name: "Configured project",
      defaultModel: "terra",
      defaultEffort: "medium",
      allowedModels: ["terra", "sol"],
    }],
    requestScoped: true,
    previewOnly: true,
    filesModified: false,
  };
  assert.equal(validators.discovery(discovery), true, JSON.stringify(validators.discovery.errors));
  assert.equal(JSON.stringify(discovery).includes("path"), false);
  assert.equal(validators.discovery({ ...discovery, outputPath: "queues/draft.yaml" }), false);

  const failure = {
    contractType: "AmkQueueDraftHttpErrorV1",
    contractVersion: "1.0",
    code: "SOURCE_STALE",
    message: "The AMK source identity no longer matches the supplied object.",
    requestScoped: true,
    filesModified: false,
  };
  assert.equal(validators.error(failure), true, JSON.stringify(validators.error.errors));
  assert.equal(validators.error({ ...failure, diagnostics: ["private"] }), false);
});

test("valid request, response, target, mapping, and queue fixtures validate", () => {
  assert.equal(validators.target(validFixture.target), true, JSON.stringify(validators.target.errors));
  assert.equal(validators.request(validFixture.request), true, JSON.stringify(validators.request.errors));
  assert.equal(validators.response(validFixture.response), true, JSON.stringify(validators.response.errors));
  for (const mapping of validFixture.request.mappings)
    assert.equal(validators.mapping(mapping), true, JSON.stringify(validators.mapping.errors));
  assert.equal(validators.queue(validFixture.response.queueDraft), true, JSON.stringify(validators.queue.errors));
});

test("invalid and legacy fixtures fail their declared closed contract", () => {
  for (const fixture of invalidFixtures) {
    const validator = validators[fixture.schema as keyof typeof validators];
    assert.equal(validator(fixture.value), false, fixture.name);
  }
});

test("authority-bearing mapping and queue fields remain impossible", () => {
  const mapping = structuredClone(validFixture.request.mappings[0]) as Record<string, unknown>;
  mapping.dependsOn = ["task-beta_two"];
  assert.equal(validators.mapping(mapping), false);

  const queue = structuredClone(validFixture.response.queueDraft) as {
    tasks: Array<Record<string, unknown>>;
  };
  queue.tasks[0].authorization = { enabled: true };
  queue.tasks[0].workspace = { taskId: "TASK-Alpha.One" };
  assert.equal(validators.queue(queue), false);
});
