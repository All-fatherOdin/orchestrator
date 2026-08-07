import assert from "node:assert/strict";
import test from "node:test";
import {
  AMK_CONTRACTS,
  amkDownloadPayload,
  amkSourceKey,
  buildAmkProjectionRequest,
  type AmkSource,
  type ProjectionResponse,
} from "./AmkProjectArtifactsDashboard.tsx";

const source: AmkSource = {
  selectorKind: "run",
  projectId: `PROJECT-${"a".repeat(64)}`,
  runId: "run-1",
  sourceHash: "b".repeat(64),
  sourceByteLength: 2048,
  sourceWatermark: `AMK-RUN-${"b".repeat(64)}-2048`,
  runStatus: "completed",
  taskCount: 2,
};
const queueSource: AmkSource = {
  selectorKind: "queue",
  projectId: `PROJECT-${"e".repeat(64)}`,
  queueId: `QUEUE-${"f".repeat(64)}`,
  sourceHash: "1".repeat(64),
  sourceByteLength: 1024,
  sourceWatermark: `AMK-QUEUE-${"1".repeat(64)}-1024`,
  taskCount: 1,
};

test("AMK UI request contains only the exact closed selector and contract subset", () => {
  const request = buildAmkProjectionRequest(source, ["TaskContractV3", "ReviewReceiptV1"], "request-1");
  assert.deepEqual(Object.keys(request).sort(), [
    "contractType", "contractVersion", "contracts", "projectId", "requestId", "runId", "selectorKind",
    "sourceByteLength", "sourceHash", "sourceWatermark",
  ]);
  assert.deepEqual(request.contracts, ["TaskContractV3", "ReviewReceiptV1"]);
  assert.equal(JSON.stringify(request).includes("path"), false);
  assert.equal(JSON.stringify(request).includes("prompt"), false);
});

test("AMK UI builds a queue request without a path or run selector", () => {
  const request = buildAmkProjectionRequest(queueSource, ["TaskContractV3"], "queue-request-1");
  assert.deepEqual(Object.keys(request).sort(), [
    "contractType", "contractVersion", "contracts", "projectId", "queueId", "requestId", "selectorKind",
    "sourceByteLength", "sourceHash", "sourceWatermark",
  ]);
  assert.equal("runId" in request, false);
  assert.equal(JSON.stringify(request).includes("path"), false);
});

test("AMK selection identity changes with every fenced source field", () => {
  const original = amkSourceKey(source);
  assert.notEqual(amkSourceKey({ ...source, sourceHash: "c".repeat(64) }), original);
  assert.notEqual(amkSourceKey({ ...source, sourceByteLength: 2049 }), original);
  assert.notEqual(amkSourceKey({ ...source, sourceWatermark: `${source.sourceWatermark}-changed` }), original);
  assert.deepEqual(AMK_CONTRACTS, ["TaskContractV3", "WorkItemGraphV1", "VerificationReceiptV2", "ReviewReceiptV1"]);
});

test("AMK download serializes only the already returned bounded response", () => {
  const response: ProjectionResponse = {
    contractType: "AmkProjectArtifactsProjectionResponseV1",
    contractVersion: "1.0",
    requestId: "request-1",
    source,
    results: [],
    readOnly: true,
    navigationOnly: true,
    activated: false,
    filesModified: false,
    responseId: `AMK-HTTP-${"d".repeat(64)}`,
  };
  const payload = amkDownloadPayload(response);
  assert.match(payload.filename, /^amk-project-artifacts-run-1-[a-f0-9]{12}\.json$/);
  assert.deepEqual(JSON.parse(payload.json), response);
});
