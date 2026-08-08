import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { amkProjectIdV1 } from "../amk-project-artifacts-v2/run-source.ts";
import {
  AMK_QUEUE_DRAFT_BASE_PATH_V1,
  AMK_QUEUE_DRAFT_PREVIEW_PATH_V1,
  installAmkQueueDraftRoutesV1,
} from "./http.ts";
import {
  AMK_QUEUE_DRAFT_LIMITS_V1,
  createAmkQueueDraftSourceFenceV1,
  type AmkQueueDraftRequestV1,
} from "./mapper.ts";
import {
  AmkQueueDraftServiceV1,
  type AmkQueueDraftConfiguredProjectV1,
} from "./service.ts";
import validFixture from "./fixtures/valid.json";

type JsonObject = Record<string, unknown>;

function configuredProject(path: string, id = "profile-main"): AmkQueueDraftConfiguredProjectV1 {
  return {
    id,
    name: "Configured project",
    path,
    defaultModel: "terra",
    defaultEffort: "medium",
    allowedModels: ["terra", "sol"],
  };
}

function serviceFor(provider: () => readonly AmkQueueDraftConfiguredProjectV1[]) {
  return new AmkQueueDraftServiceV1((value) => value, provider);
}

async function startApi(service: Pick<AmkQueueDraftServiceV1, "discover" | "preview">) {
  const app = express();
  installAmkQueueDraftRoutesV1(app, service);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolveServer) => {
    const listening = app.listen(0, "127.0.0.1", () => resolveServer(listening));
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolveClose, rejectClose) =>
      server.close((error) => error ? rejectClose(error) : resolveClose())),
  };
}

async function jsonResponse(origin: string, path: string, init?: RequestInit) {
  const response = await fetch(`${origin}${path}`, init);
  const text = await response.text();
  return {
    status: response.status,
    allow: response.headers.get("allow"),
    text,
    body: text ? JSON.parse(text) as JsonObject : {},
  };
}

function previewRequest(target: JsonObject): AmkQueueDraftRequestV1 {
  const artifact = structuredClone(validFixture.request.artifact);
  const source = createAmkQueueDraftSourceFenceV1(artifact);
  return {
    ...structuredClone(validFixture.request),
    contractType: "AmkQueueDraftRequestV1",
    contractVersion: "1.0",
    targetId: target.targetId as string,
    targetHash: target.targetHash as string,
    targetWatermark: target.targetWatermark as string,
    ...source,
    artifact,
  } as unknown as AmkQueueDraftRequestV1;
}

function listTree(root: string): string[] {
  return readdirSync(root, { recursive: true }).map(String).sort();
}

test("GET discovers only bounded opaque configured targets and POST returns deterministic YAML", async () => {
  const root = mkdtempSync(join(tmpdir(), "amk-queue-draft-http-"));
  const targetRoot = join(root, "configured-target");
  mkdirSync(targetRoot);
  const before = listTree(root);
  const api = await startApi(serviceFor(() => [configuredProject(targetRoot)]));
  try {
    const discovery = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_BASE_PATH_V1);
    assert.equal(discovery.status, 200);
    assert.equal(discovery.body.contractType, "AmkQueueDraftDiscoveryV1");
    assert.deepEqual((discovery.body.limits as JsonObject), {
      requestBytes: 262144,
      responseBytes: 524288,
      artifactEntries: 100,
      tasks: 100,
      allowedPaths: 100,
      verificationCommands: 100,
      targets: 100,
    });
    const targets = discovery.body.targets as JsonObject[];
    assert.equal(targets.length, 1);
    assert.equal(targets[0].targetId, amkProjectIdV1(targetRoot));
    assert.equal(Object.hasOwn(targets[0], "path"), false);
    assert.equal(Object.hasOwn(targets[0], "profileId"), false);
    assert.equal(discovery.text.includes(targetRoot), false);

    const request = previewRequest(targets[0]);
    const first = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const second = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(first.status, 200);
    assert.equal(first.text, second.text);
    assert.equal(first.body.contractType, "AmkQueueDraftResponseV1");
    assert.equal(typeof first.body.yaml, "string");
    assert.equal((first.body.yaml as string).includes("src/alpha.ts"), true);
    assert.equal(first.body.wouldMutate, false);
    assert.equal(Buffer.byteLength(first.text, "utf8") <= 524288, true);
    assert.deepEqual(listTree(root), before);
  } finally {
    await api.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("raw JSON bytes enforce the exact 256 KiB boundary before closed validation", async () => {
  const root = mkdtempSync(join(tmpdir(), "amk-queue-draft-bytes-"));
  const api = await startApi(serviceFor(() => [configuredProject(root)]));
  try {
    const discovery = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_BASE_PATH_V1);
    const request = previewRequest((discovery.body.targets as JsonObject[])[0]);
    const json = JSON.stringify(request);
    const padding = AMK_QUEUE_DRAFT_LIMITS_V1.maxRequestBytes - Buffer.byteLength(json, "utf8");
    assert.equal(padding > 0, true);
    const atLimit = `${" ".repeat(padding)}${json}`;
    assert.equal(Buffer.byteLength(atLimit, "utf8"), 262144);

    const accepted = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: atLimit,
    });
    assert.equal(accepted.status, 200);

    const rejected = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: ` ${atLimit}`,
    });
    assert.equal(rejected.status, 413);
    assert.equal(rejected.body.code, "REQUEST_TOO_LARGE");
    assert.equal(rejected.text.includes("TaskContractV3"), false);
  } finally {
    await api.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("closed errors reject methods, query fields, private paths, stale sources, and stale targets", async () => {
  const root = mkdtempSync(join(tmpdir(), "amk-queue-draft-errors-"));
  let profiles: readonly AmkQueueDraftConfiguredProjectV1[] = [configuredProject(root)];
  const api = await startApi(serviceFor(() => profiles));
  const privateValue = "C:/private/queues/secret.yaml";
  try {
    for (const [path, method, allow] of [
      [AMK_QUEUE_DRAFT_BASE_PATH_V1, "POST", "GET"],
      [AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, "GET", "POST"],
      [AMK_QUEUE_DRAFT_BASE_PATH_V1, "HEAD", "GET"],
    ] as const) {
      const result = await jsonResponse(api.origin, path, { method });
      assert.equal(result.status, 405);
      assert.equal(result.allow, allow);
      if (method !== "HEAD") assert.equal(result.body.code, "METHOD_NOT_ALLOWED");
    }

    const badQuery = await jsonResponse(api.origin, `${AMK_QUEUE_DRAFT_BASE_PATH_V1}?path=${encodeURIComponent(privateValue)}`);
    assert.equal(badQuery.status, 400);
    assert.equal(badQuery.body.code, "REQUEST_INVALID");
    assert.equal(badQuery.text.includes(privateValue), false);

    const discovery = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_BASE_PATH_V1);
    const request = previewRequest((discovery.body.targets as JsonObject[])[0]);
    const arbitraryPath = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, targetPath: privateValue, outputPath: privateValue }),
    });
    assert.equal(arbitraryPath.status, 400);
    assert.equal(arbitraryPath.body.code, "REQUEST_INVALID");
    assert.equal(arbitraryPath.text.includes(privateValue), false);
    assert.equal(Object.hasOwn(arbitraryPath.body, "yaml"), false);

    const staleSource = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, sourceWatermark: `AMK-UPLOAD-${"d".repeat(64)}-${request.sourceByteLength}` }),
    });
    assert.equal(staleSource.status, 409);
    assert.equal(staleSource.body.code, "SOURCE_STALE");
    assert.equal(Object.hasOwn(staleSource.body, "yaml"), false);

    profiles = [{ ...configuredProject(root), name: "Changed configuration" }];
    const staleTarget = await jsonResponse(api.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(staleTarget.status, 409);
    assert.equal(staleTarget.body.code, "TARGET_STALE");
  } finally {
    await api.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("ambiguous configured identities fail conflict and oversized responses fail closed", async () => {
  const root = mkdtempSync(join(tmpdir(), "amk-queue-draft-conflict-"));
  const conflictApi = await startApi(serviceFor(() => [
    configuredProject(root, "profile-one"),
    configuredProject(root, "profile-two"),
  ]));
  try {
    const conflict = await jsonResponse(conflictApi.origin, AMK_QUEUE_DRAFT_BASE_PATH_V1);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, "TARGET_CONFLICT");
  } finally {
    await conflictApi.close();
  }

  const oversizedApi = await startApi({
    discover: () => ({ privateYaml: "x".repeat(AMK_QUEUE_DRAFT_LIMITS_V1.maxResponseBytes) }) as never,
    preview: () => { throw new Error("not called"); },
  });
  try {
    const oversized = await jsonResponse(oversizedApi.origin, AMK_QUEUE_DRAFT_BASE_PATH_V1);
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.code, "RESPONSE_TOO_LARGE");
    assert.equal(oversized.text.includes("privateYaml"), false);
  } finally {
    await oversizedApi.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("restart reconstructs byte-identical discovery and preview without cache or persistence", async () => {
  const root = mkdtempSync(join(tmpdir(), "amk-queue-draft-restart-"));
  const profiles = [configuredProject(root)] as const;
  let firstDiscovery = "";
  let firstPreview = "";
  const firstApi = await startApi(serviceFor(() => profiles));
  try {
    const discovery = await jsonResponse(firstApi.origin, AMK_QUEUE_DRAFT_BASE_PATH_V1);
    firstDiscovery = discovery.text;
    const request = previewRequest((discovery.body.targets as JsonObject[])[0]);
    firstPreview = (await jsonResponse(firstApi.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    })).text;
  } finally {
    await firstApi.close();
  }

  const secondApi = await startApi(serviceFor(() => profiles));
  try {
    const discovery = await jsonResponse(secondApi.origin, AMK_QUEUE_DRAFT_BASE_PATH_V1);
    const request = previewRequest((discovery.body.targets as JsonObject[])[0]);
    const preview = await jsonResponse(secondApi.origin, AMK_QUEUE_DRAFT_PREVIEW_PATH_V1, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(discovery.text, firstDiscovery);
    assert.equal(preview.text, firstPreview);
    assert.deepEqual(listTree(root), []);
  } finally {
    await secondApi.close();
    rmSync(root, { recursive: true, force: true });
  }
});
