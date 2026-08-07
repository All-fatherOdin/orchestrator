import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  SUPPORTED_AMK_PROJECT_ARTIFACTS_V2,
  validateAmkProjectArtifactBundleV2,
  validateAmkProjectArtifactV2,
} from "./validator.ts";

type Fixture = Readonly<{
  valid: Record<string, unknown>;
  invalid: Record<string, unknown>;
  semanticCases: readonly Readonly<{
    contract: string;
    expectedReasonCodes: readonly string[];
  }>[];
}>;

const fixturePath = fileURLToPath(new URL("./fixtures/amk-project-artifacts-v2.json", import.meta.url));
const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;

test("AMK Project Artifact V2 vendored valid and invalid fixtures match pinned expectations", () => {
  assert.deepEqual(SUPPORTED_AMK_PROJECT_ARTIFACTS_V2, [
    "TaskContractV3",
    "WorkItemGraphV1",
    "VerificationReceiptV2",
    "ReviewReceiptV1",
  ]);

  for (const contract of SUPPORTED_AMK_PROJECT_ARTIFACTS_V2) {
    const valid = validateAmkProjectArtifactV2(contract, fixture.valid[contract]);
    assert.equal(valid.valid, true, `${contract} valid fixture: ${valid.reasonCodes.join(", ")}`);

    const invalid = validateAmkProjectArtifactV2(contract, fixture.invalid[contract]);
    assert.equal(invalid.valid, false, `${contract} invalid fixture was accepted`);
    assert.ok(invalid.reasonCodes.includes("SCHEMA_INVALID") || invalid.semanticReasonCodes.length > 0);
  }
});

test("AMK Project Artifact V2 semantic reason codes match the pinned selected corpus", () => {
  for (const semanticCase of fixture.semanticCases) {
    const result = validateAmkProjectArtifactV2(
      semanticCase.contract,
      fixture.invalid[semanticCase.contract],
    );
    assert.deepEqual(result.semanticReasonCodes, semanticCase.expectedReasonCodes);
  }
});

test("AMK Project Artifact V2 fails closed for unknown contracts, versions, and properties", () => {
  const task = structuredClone(fixture.valid.TaskContractV3) as Record<string, unknown>;
  task.schema_version = "3.1";
  assert.deepEqual(validateAmkProjectArtifactV2("TaskContractV3", task).reasonCodes, ["SCHEMA_INVALID"]);

  const graph = structuredClone(fixture.valid.WorkItemGraphV1) as Record<string, unknown>;
  graph.unrecognized = true;
  assert.deepEqual(validateAmkProjectArtifactV2("WorkItemGraphV1", graph).reasonCodes, ["SCHEMA_INVALID"]);

  const unknown = validateAmkProjectArtifactV2("UnknownArtifactV1", {});
  assert.deepEqual(unknown.reasonCodes, ["UNKNOWN_CONTRACT"]);
  assert.equal(unknown.valid, false);
});

test("AMK Project Artifact V2 validates only applicable Task-to-Graph and Task-to-Review links", () => {
  const validBundle = validateAmkProjectArtifactBundleV2({
    TaskContractV3: fixture.valid.TaskContractV3,
    WorkItemGraphV1: fixture.valid.WorkItemGraphV1,
    ReviewReceiptV1: fixture.valid.ReviewReceiptV1,
    VerificationReceiptV2: fixture.valid.VerificationReceiptV2,
  });
  assert.equal(validBundle.valid, true, validBundle.reasonCodes.join(", "));
  assert.deepEqual(validBundle.crossContractReasonCodes, []);

  const graph = structuredClone(fixture.valid.WorkItemGraphV1) as Record<string, unknown>;
  graph.graph_id = "WIG-DIFFERENT";
  assert.deepEqual(validateAmkProjectArtifactBundleV2({
    TaskContractV3: fixture.valid.TaskContractV3,
    WorkItemGraphV1: graph,
    ReviewReceiptV1: fixture.valid.ReviewReceiptV1,
  }).crossContractReasonCodes, ["TASK_GRAPH_REF_UNRESOLVED"]);

  const review = structuredClone(fixture.valid.ReviewReceiptV1) as Record<string, unknown>;
  review.owner_disposition = "pending";
  assert.deepEqual(validateAmkProjectArtifactBundleV2({
    TaskContractV3: fixture.valid.TaskContractV3,
    WorkItemGraphV1: fixture.valid.WorkItemGraphV1,
    ReviewReceiptV1: review,
  }).crossContractReasonCodes, ["TASK_REQUIRED_REVIEW_NOT_ACCEPTED"]);
});
