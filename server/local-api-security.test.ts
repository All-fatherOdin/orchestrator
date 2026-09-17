import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { request as httpRequest } from "node:http";
import { installLocalApiSecurity, LOCAL_API_HOST } from "./local-api-security.ts";
import { createApiFetch } from "../src/api-client.ts";

test("local transport rejects foreign hosts/origins and unauthenticated effects before handlers", async () => {
  const app = express();
  installLocalApiSecurity(app);
  let effects = 0;
  app.get("/api/health", (_, response) => response.json({ ok: true }));
  for (const method of ["post", "put", "patch", "delete"] as const)
    app[method]("/api/action", (_, response) => { effects++; response.json({ ok: true }); });
  const server = app.listen(0, LOCAL_API_HOST);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  assert.equal(address.address, "127.0.0.1");
  const root = `http://127.0.0.1:${address.port}`;
  try {
    const rejectedHeaders: Record<string, string>[] = [
      { Host: `evil.example:${address.port}` },
      { Host: "localhost:1" },
      { Origin: "https://evil.example" },
      { Origin: "null" },
      { Origin: "http://localhost:4317" },
      { "Sec-Fetch-Site": "cross-site" },
    ];
    for (const headers of rejectedHeaders) {
      const status = await new Promise<number | undefined>((resolve, reject) => {
        const request = httpRequest(`${root}/api/health`, { headers }, response => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        });
        request.on("error", reject);
        request.end();
      });
      assert.equal(status, 403, JSON.stringify(headers));
    }
    assert.equal((await fetch(`${root}/api/session`)).status, 403);
    const session = await fetch(`${root}/api/session`, { headers: { "X-Orchestrator-Client": "local-ui", Origin: root } });
    assert.equal(session.headers.get("cache-control"), "no-store");
    const { token } = await session.json();
    assert.match(token, /^[a-f0-9]{64}$/);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      for (const value of [undefined, "a".repeat(64), "z".repeat(64)]) {
        const response = await fetch(`${root}/api/action`, { method,
          headers: value ? { "X-Orchestrator-Token": value } : {},
        });
        assert.equal(response.status, 401);
      }
    }
    assert.equal(effects, 0);
    assert.equal((await fetch(`${root}/API/ACTION/`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${root}/api/action`, { method: "POST", headers: { "X-Orchestrator-Token": token, Origin: "https://evil.example" } })).status, 403);
    assert.equal(effects, 0);
    const client = createApiFetch(fetch);
    assert.equal((await client(`${root}/api/action`, { method: "POST" })).status, 200);
    assert.equal(effects, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test("production app protects routes before parsing and accepts authenticated preflight", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "orchestrator-api-security-"));
  process.env.ORCHESTRATOR_TEST = "1";
  process.env.ORCHESTRATOR_DATA_DIR = directory;
  const { app } = await import("./index.ts");
  const server = app.listen(0, LOCAL_API_HOST);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const root = `http://127.0.0.1:${address.port}`;
  try {
    for (const route of ["/api/runs", "/API/RUNS/", "/api/cancel", "/api/preflight", "/api/amk-queue-drafts/v1/preview"])
      assert.equal((await fetch(root + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status, 401);
    const response = await createApiFetch(fetch)(`${root}/api/preflight`, {
      method: "POST", headers: { "Content-Type": "text/yaml" }, body: "[invalid",
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).checks[0].name, "YAML queue");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});

test("development origin is explicit and restricted to local HTTP on the configured port", async () => {
  assert.throws(() => installLocalApiSecurity(express(), "https://evil.example"));
  const app = express();
  installLocalApiSecurity(app, "http://localhost:4317");
  const server = app.listen(0, LOCAL_API_HOST);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    const cases: [string, number][] = [["http://localhost:4317", 200], ["http://127.0.0.1:4317", 200], ["http://evil.example:4317", 403], ["http://localhost:4319", 403]];
    for (const [origin, expected] of cases) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/api/session`, {
        headers: { Origin: String(origin), "X-Orchestrator-Client": "local-ui" },
      });
      assert.equal(response.status, expected);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
