import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AMK_QUEUE_DRAFT_MAX_FILE_BYTES,
  AmkQueueDraftDashboard,
  amkQueueDraftInputKey,
  amkQueueDraftResponseMatches,
  buildAmkQueueDraftPreviewRequest,
  createAmkQueueDraftMappings,
  createAmkQueueDraftSourceFence,
  downloadAmkQueueDraftYaml,
  parseAmkQueueDraftArtifact,
  validateAmkQueueDraftFile,
  validateAmkQueueDraftMappings,
  type AmkQueueDraftArtifact,
  type AmkQueueDraftResponse,
  type AmkQueueDraftTarget,
} from "./AmkQueueDraftDashboard.tsx";

test("queue-draft workspace renders readable Russian UI copy", () => {
  const markup = renderToStaticMarkup(createElement(AmkQueueDraftDashboard));

  assert.match(markup, /Черновик очереди/);
  assert.match(markup, /Один локальный JSON/);
  assert.match(markup, /Текущего предпросмотра нет/);
  assert.doesNotMatch(markup, /Р§РµСЂРЅРѕ|Р§|Рµ|СЂ/);
});

const artifact = parseAmkQueueDraftArtifact(JSON.stringify({
  TaskContractV3: [
    { task_id: "TASK-alpha", title: "Alpha", scope: { project_files: ["src/alpha.ts", "tests/alpha.test.ts"] } },
    { task_id: "TASK-beta", scope: { project_files: ["src/beta.ts"] } },
  ],
  WorkItemGraphV1: [],
  VerificationReceiptV2: [],
  ReviewReceiptV1: [],
}));

const target: AmkQueueDraftTarget = {
  targetId: `PROJECT-${"a".repeat(64)}`,
  targetHash: "b".repeat(64),
  targetWatermark: `AMK-TARGET-${"b".repeat(64)}-0`,
  name: "Configured target",
  defaultModel: "terra",
  defaultEffort: "medium",
  allowedModels: ["terra", "sol"],
};

test("queue-draft UI rejects a wrong local type and an oversized file before reading", () => {
  assert.equal(validateAmkQueueDraftFile({ name: "draft.txt", type: "text/plain", size: 12 })?.code, "FILE_TYPE_UNSUPPORTED");
  assert.equal(validateAmkQueueDraftFile({ name: "draft.json", type: "application/json", size: 0 })?.code, "FILE_EMPTY");
  assert.equal(validateAmkQueueDraftFile({ name: "draft.json", type: "application/json", size: AMK_QUEUE_DRAFT_MAX_FILE_BYTES + 1 })?.code, "REQUEST_TOO_LARGE");
  assert.equal(validateAmkQueueDraftFile({ name: "DRAFT.JSON", type: "", size: 128 }), null);
});

test("local bundle parsing exposes only the supported closed artifact families", () => {
  assert.equal(artifact.TaskContractV3.length, 2);
  assert.throws(
    () => parseAmkQueueDraftArtifact(JSON.stringify({ TaskContractV3: artifact.TaskContractV3, UnknownContractV1: [] })),
    (error: unknown) => (error as { code?: string }).code === "SOURCE_UNSUPPORTED",
  );
  assert.throws(
    () => parseAmkQueueDraftArtifact(JSON.stringify({ WorkItemGraphV1: [] })),
    (error: unknown) => (error as { code?: string }).code === "SOURCE_UNSUPPORTED",
  );
});

test("mapping guidance requires missing title, allowedPaths, and verificationCommands explicitly", () => {
  const empty = createAmkQueueDraftMappings(artifact);
  const issues = validateAmkQueueDraftMappings(artifact, empty);
  assert.deepEqual(issues.map((issue) => [issue.taskId, issue.code]), [
    ["TASK-alpha", "PATHS"],
    ["TASK-alpha", "COMMANDS"],
    ["TASK-beta", "TITLE"],
    ["TASK-beta", "PATHS"],
    ["TASK-beta", "COMMANDS"],
  ]);

  const complete = [
    { ...empty[0], allowedPaths: ["src/alpha.ts"], verificationCommandsText: "npm.cmd test -- alpha" },
    { ...empty[1], operatorTitle: "Beta", allowedPaths: ["src/beta.ts"], verificationCommandsText: "npm.cmd test -- beta" },
  ];
  assert.deepEqual(validateAmkQueueDraftMappings(artifact, complete), []);
});

test("preview request uses exact server target and canonical local source fences without a caller path", async () => {
  const fence = await createAmkQueueDraftSourceFence(artifact);
  const mappings = createAmkQueueDraftMappings(artifact);
  mappings[0] = { ...mappings[0], allowedPaths: ["src/alpha.ts"], verificationCommandsText: "npm.cmd test -- alpha" };
  mappings[1] = { ...mappings[1], operatorTitle: "Beta", allowedPaths: ["src/beta.ts"], verificationCommandsText: "npm.cmd test -- beta" };
  const request = buildAmkQueueDraftPreviewRequest(artifact, mappings, target, fence);

  assert.deepEqual(Object.keys(request).sort(), [
    "artifact", "contractType", "contractVersion", "mappings", "sourceByteLength", "sourceHash",
    "sourceWatermark", "targetHash", "targetId", "targetWatermark",
  ]);
  assert.equal('path' in request, false);
  assert.equal(JSON.stringify(request).includes('"path":'), false);
  assert.equal(request.mappings[0].operatorTitle, undefined);
  assert.equal(request.mappings[1].operatorTitle, "Beta");
  assert.match(request.sourceWatermark, /^AMK-UPLOAD-[a-f0-9]{64}-[0-9]+$/);

  const originalKey = amkQueueDraftInputKey(request);
  assert.notEqual(amkQueueDraftInputKey({ ...request, sourceWatermark: `${request.sourceWatermark}-changed` }), originalKey);
  assert.notEqual(amkQueueDraftInputKey({ ...request, targetWatermark: `${request.targetWatermark}-changed` }), originalKey);
  assert.notEqual(amkQueueDraftInputKey({ ...request, mappings: request.mappings.map((mapping, index) => index ? mapping : { ...mapping, allowedPaths: ["tests/alpha.test.ts"] }) }), originalKey);
});

test("download uses only the current returned YAML and always removes and revokes its temporary link", async () => {
  const fence = await createAmkQueueDraftSourceFence(artifact);
  const mappings = [
    { taskId: "TASK-alpha", operatorTitle: "", allowedPaths: ["src/alpha.ts"], verificationCommandsText: "npm.cmd test -- alpha" },
    { taskId: "TASK-beta", operatorTitle: "Beta", allowedPaths: ["src/beta.ts"], verificationCommandsText: "npm.cmd test -- beta" },
  ];
  const request = buildAmkQueueDraftPreviewRequest(artifact, mappings, target, fence);
  const yaml = "project:\n  name: configured\n";
  const response: AmkQueueDraftResponse = {
    contractType: "AmkQueueDraftResponseV1",
    contractVersion: "1.0",
    targetId: request.targetId,
    targetHash: request.targetHash,
    targetWatermark: request.targetWatermark,
    sourceHash: request.sourceHash,
    sourceByteLength: request.sourceByteLength,
    sourceWatermark: request.sourceWatermark,
    taskCount: 2,
    compatibility: { workItemGraphCount: 0, verificationReceiptCount: 0, reviewReceiptCount: 0, schedulerAuthority: false, verificationAuthority: false, reviewAuthority: false, executionAuthority: false },
    queueDraft: { tasks: [
      { key: "task-alpha", title: "Alpha", allowedPaths: ["src/alpha.ts"], verificationCommands: ["npm.cmd test -- alpha"] },
      { key: "task-beta", title: "Beta", allowedPaths: ["src/beta.ts"], verificationCommands: ["npm.cmd test -- beta"] },
    ] },
    yaml,
    yamlByteLength: new TextEncoder().encode(yaml).byteLength,
    wouldMutate: false,
    authorizationGranted: false,
  };
  assert.equal(amkQueueDraftResponseMatches(response, request), true);
  assert.equal(amkQueueDraftResponseMatches({ ...response, sourceWatermark: `${response.sourceWatermark}-stale` }, request), false);

  let appended = false;
  let clicked = false;
  let removed = false;
  let revoked = "";
  let blob: Blob | null = null;
  const link = { href: "", download: "", click: () => { clicked = true; }, remove: () => { removed = true; } };
  downloadAmkQueueDraftYaml(response, {
    document: { body: { append: (candidate: unknown) => { appended = candidate === link; } }, createElement: () => link } as never,
    URL: { createObjectURL: (candidate: Blob | MediaSource) => { blob = candidate as Blob; return "blob:queue-draft"; }, revokeObjectURL: (value: string) => { revoked = value; } },
    Blob,
  });

  assert.equal(await blob!.text(), yaml);
  assert.equal(link.download, `amk-queue-draft-${response.sourceHash.slice(0, 12)}.yaml`);
  assert.equal(appended, true);
  assert.equal(clicked, true);
  assert.equal(removed, true);
  assert.equal(revoked, "blob:queue-draft");
});

test("a changed artifact produces a different source watermark", async () => {
  const original = await createAmkQueueDraftSourceFence(artifact);
  const changed: AmkQueueDraftArtifact = {
    ...artifact,
    TaskContractV3: artifact.TaskContractV3.map((task, index) => index ? task : { ...task, title: "Changed alpha" }),
  };
  const next = await createAmkQueueDraftSourceFence(changed);
  assert.notEqual(next.sourceHash, original.sourceHash);
  assert.notEqual(next.sourceWatermark, original.sourceWatermark);
});
