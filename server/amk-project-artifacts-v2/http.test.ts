import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import Ajv2020 from "ajv8/dist/2020.js";
import {
  AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT,
  AmkFilesystemRunSourceAdapterV1,
} from "./filesystem-adapter.ts";
import {
  AmkProjectArtifactsServiceV1,
  captureAmkJsonBodyByteLengthV1,
  installAmkProjectArtifactsRoutesV1,
  type AmkProjectionRequestV1,
  type AmkRunSourceAdapterV1,
} from "./http.ts";
import { parseAmkRunProjectionSourceV1 } from "./run-source.ts";
import { amkQueueIdV1, parseAmkQueueProjectionSourceV1 } from "./queue-source.ts";
import requestSchema from "./schemas/http-request-v1.schema.json";
import discoverySchema from "./schemas/http-discovery-v1.schema.json";
import responseSchema from "./schemas/http-projection-response-v1.schema.json";
import errorSchema from "./schemas/http-error-v1.schema.json";

function runJson(prompt = "TOP SECRET PROMPT", runId = "run-1") {
  return JSON.stringify({
    id: runId,
    project: { name: "Private project", path: "C:\\private\\repository" },
    status: "completed",
    startedAt: "2026-08-07T10:00:00.000Z",
    finishedAt: "2026-08-07T10:10:00.000Z",
    tasks: [{
      id: "task-1",
      key: "api",
      title: "Private title",
      prompt,
      status: "completed",
      finishedAt: "2026-08-07T10:09:00.000Z",
      exitCode: 0,
      allowedPaths: ["C:\\private\\repository\\secret.ts"],
      verificationCommands: ["npm test -- secret"],
      reviewStatus: "approved",
      finalOutput: "PRIVATE TRANSCRIPT",
    }],
    review: { enabled: true },
  });
}

function requestFor(source: NonNullable<ReturnType<typeof parseAmkRunProjectionSourceV1>>): AmkProjectionRequestV1 {
  return {
    contractType: "AmkProjectArtifactsProjectionRequestV1",
    contractVersion: "1.0",
    requestId: "request-1",
    projectId: source.descriptor.projectId,
    selectorKind: "run",
    runId: source.descriptor.runId,
    sourceHash: source.descriptor.sourceHash,
    sourceByteLength: source.descriptor.sourceByteLength,
    sourceWatermark: source.descriptor.sourceWatermark,
    contracts: ["TaskContractV3", "WorkItemGraphV1", "VerificationReceiptV2", "ReviewReceiptV1"],
  };
}

function queueYaml() {
  return [
    "project:",
    "  name: Private queue project",
    "  path: C:\\\\private\\\\queue-repository",
    "  verificationCommands: [npm run project-check]",
    "tasks:",
    "  - key: queue-api",
    "    title: Private queue title",
    "    prompt: TOP SECRET QUEUE PROMPT",
    "    allowedPaths: [src/private.ts]",
    "    verificationCommands: [npm test -- private]",
    "    executionGuards: [Stop on private condition]",
  ].join("\n");
}

test("run adapter derives opaque identity and never modifies the selected run", async () => {
  const root = await mkdtemp(join(tmpdir(), "amk-http-"));
  const runDirectory = join(root, "run-1");
  await mkdir(runDirectory);
  const file = join(runDirectory, "run.json");
  const original = runJson();
  await writeFile(file, original, "utf8");

  const adapter = new AmkFilesystemRunSourceAdapterV1(root);
  const source = await adapter.load("run", "run-1");
  assert.ok(source);
  assert.match(source.descriptor.projectId, /^PROJECT-[a-f0-9]{64}$/);
  assert.equal(source.descriptor.sourceHash.length, 64);
  assert.equal(source.taskEvidence.tasks[0].authorizationEvidenceVerified, false);
  assert.equal(source.verificationEvidence.length, 1);
  assert.equal(source.reviewEvidence[0].reviewerInputKind, "unrestricted_final_output");
  assert.equal(await readFile(file, "utf8"), original);

  const mismatchedDirectory = join(root, "run-mismatch");
  await mkdir(mismatchedDirectory);
  await writeFile(join(mismatchedDirectory, "run.json"), runJson("private", "another-run"), "utf8");
  assert.equal(await adapter.load("run", "run-mismatch"), undefined);
  const unsafeStatus = JSON.parse(runJson()) as Record<string, unknown>;
  unsafeStatus.status = "C:\\private\\secret";
  assert.equal(parseAmkRunProjectionSourceV1(JSON.stringify(unsafeStatus)), undefined);
});

test("filesystem discovery scans no more than its fixed source limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "amk-discovery-"));
  await Promise.all(Array.from({ length: AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT + 3 }, async (_, index) => {
    const runId = `run-${String(index).padStart(3, "0")}`;
    const directory = join(root, runId);
    await mkdir(directory);
    await writeFile(join(directory, "run.json"), runJson("private", runId), "utf8");
  }));
  const sources = await new AmkFilesystemRunSourceAdapterV1(root).list();
  assert.equal(sources.length, AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT);
});

test("queue adapter exposes only an opaque selector and projects without execution evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "amk-queue-runs-"));
  const queues = await mkdtemp(join(tmpdir(), "amk-queues-"));
  const fileName = "private-plan.yaml";
  const raw = queueYaml();
  await writeFile(join(queues, fileName), raw, "utf8");
  const queueId = amkQueueIdV1(fileName);
  const parsed = parseAmkQueueProjectionSourceV1(raw, queueId);
  assert.ok(parsed);
  const adapter = new AmkFilesystemRunSourceAdapterV1(root, queues);
  const discovered = await adapter.list();
  assert.deepEqual(discovered, [parsed.descriptor]);
  assert.equal(JSON.stringify(discovered).includes(fileName), false);
  assert.equal(JSON.stringify(discovered).includes("private\\\\queue-repository"), false);
  const loaded = await adapter.load("queue", queueId);
  assert.ok(loaded && loaded.descriptor.selectorKind === "queue");
  assert.equal(loaded.verificationEvidence.length, 0);
  assert.equal(loaded.reviewEvidence.length, 0);
  assert.deepEqual(loaded.taskEvidence.tasks[0].verificationCommands, ["npm run project-check", "npm test -- private"]);
  assert.equal(parseAmkQueueProjectionSourceV1(raw.replace("allowedPaths: [src/private.ts]", "allowedPaths: private"), queueId), undefined);

  const request: AmkProjectionRequestV1 = {
    contractType: "AmkProjectArtifactsProjectionRequestV1",
    contractVersion: "1.0",
    requestId: "queue-request-1",
    projectId: parsed.descriptor.projectId,
    selectorKind: "queue",
    queueId,
    sourceHash: parsed.descriptor.sourceHash,
    sourceByteLength: parsed.descriptor.sourceByteLength,
    sourceWatermark: parsed.descriptor.sourceWatermark,
    contracts: ["TaskContractV3", "WorkItemGraphV1", "VerificationReceiptV2", "ReviewReceiptV1"],
  };
  const response = await new AmkProjectArtifactsServiceV1(adapter).project(request);
  assert.deepEqual(response.results.map((result) => result.contractType), ["TaskContractV3", "WorkItemGraphV1"]);
  const serialized = JSON.stringify(response);
  for (const forbidden of [fileName, "TOP SECRET QUEUE PROMPT", "npm test -- private", "private.ts", "queue-repository"])
    assert.equal(serialized.includes(forbidden), false);
});

test("service emits deterministic redacted projections and detects stale sources", async () => {
  const first = parseAmkRunProjectionSourceV1(runJson());
  const changed = parseAmkRunProjectionSourceV1(runJson("CHANGED SECRET PROMPT"));
  assert.ok(first && changed);
  let current = first;
  const adapter: AmkRunSourceAdapterV1 = {
    list: async () => [current.descriptor],
    load: async () => current,
  };
  const service = new AmkProjectArtifactsServiceV1(adapter);
  const request = requestFor(first);
  const one = await service.project(request);
  const two = await service.project(request);
  assert.deepEqual(one, two);
  const serialized = JSON.stringify(one);
  for (const forbidden of ["TOP SECRET PROMPT", "npm test -- secret", "C:\\\\private", "PRIVATE TRANSCRIPT"])
    assert.equal(serialized.includes(forbidden), false);
  assert.ok(one.results.length >= 4);
  assert.ok(one.results.every((result) => result.artifact === null && result.artifactAvailable === false));
  assert.ok(one.results.every((result) => result.reasonCodes.includes("HTTP_ARTIFACT_REDACTED_BY_PRIVACY_POLICY")));

  current = changed;
  await assert.rejects(() => service.project(request), (error: unknown) =>
    Boolean(error && typeof error === "object" && "code" in error && error.code === "SOURCE_STALE"));
});

test("closed HTTP schemas validate emitted envelopes and reject added properties", async () => {
  const source = parseAmkRunProjectionSourceV1(runJson());
  assert.ok(source);
  const service = new AmkProjectArtifactsServiceV1({
    list: async () => [source.descriptor],
    load: async () => source,
  });
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateRequest = ajv.compile(requestSchema);
  const validateDiscovery = ajv.compile(discoverySchema);
  const validateResponse = ajv.compile(responseSchema);
  const validateError = ajv.compile(errorSchema);
  const request = requestFor(source);
  const discovery = await service.discover();
  const response = await service.project(request);
  const error = {
    contractType: "AmkProjectArtifactsErrorV1",
    contractVersion: "1.0",
    code: "SOURCE_STALE",
    message: "Selected source is stale.",
    readOnly: true,
    navigationOnly: true,
    activated: false,
    filesModified: false,
  };
  assert.equal(validateRequest(request), true, JSON.stringify(validateRequest.errors));
  assert.equal(validateDiscovery(discovery), true, JSON.stringify(validateDiscovery.errors));
  assert.equal(validateResponse(response), true, JSON.stringify(validateResponse.errors));
  assert.equal(validateError(error), true, JSON.stringify(validateError.errors));
  assert.equal(validateRequest({ ...request, prompt: "forbidden" }), false);
  assert.equal(validateRequest({ ...request, queueId: `QUEUE-${"e".repeat(64)}` }), false);
  assert.equal(validateResponse({ ...response, importAllowed: true }), false);
});

test("HTTP routes enforce the closed request and 8 KiB boundary", async (context) => {
  const source = parseAmkRunProjectionSourceV1(runJson());
  assert.ok(source);
  const service = new AmkProjectArtifactsServiceV1({
    list: async () => [source.descriptor],
    load: async () => source,
  });
  const app = express();
  app.use(express.json({ limit: "64kb", verify: captureAmkJsonBodyByteLengthV1 }));
  installAmkProjectArtifactsRoutesV1(app, service);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;

  const discovery = await fetch(`${base}/api/amk-project-artifacts/v1`);
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json() as { sources: unknown[] }).sources.length, 1);

  const unknownField = await fetch(`${base}/api/amk-project-artifacts/v1/project`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...requestFor(source), path: "C:\\private\\repository" }),
  });
  assert.equal(unknownField.status, 400);
  assert.equal((await unknownField.json() as { code: string }).code, "REQUEST_UNKNOWN_FIELD");

  const oversized = await fetch(`${base}/api/amk-project-artifacts/v1/project`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...requestFor(source), unknown: "x".repeat(9_000) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json() as { code: string }).code, "REQUEST_TOO_LARGE");

  const whitespacePadded = await fetch(`${base}/api/amk-project-artifacts/v1/project`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: `${" ".repeat(8_200)}${JSON.stringify(requestFor(source))}`,
  });
  assert.equal(whitespacePadded.status, 413);
  assert.equal((await whitespacePadded.json() as { code: string }).code, "REQUEST_TOO_LARGE");
});
