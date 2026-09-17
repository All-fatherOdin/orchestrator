import assert from "node:assert/strict";
import test from "node:test";
import { createApiFetch } from "./api-client.ts";

test("API client shares session acquisition, preserves payloads, never replays effects, and renews after 401", async () => {
  let sessions = 0;
  let actions = 0;
  const client = createApiFetch(async (input, init) => {
    if (String(input).endsWith("/api/session")) {
      sessions++;
      return Response.json({ token: "a".repeat(64) });
    }
    actions++;
    assert.equal(init?.body, "original");
    assert.equal(new Headers(init?.headers).get("X-Orchestrator-Token"), "a".repeat(64));
    return Response.json({}, { status: actions === 3 ? 401 : 200 });
  });
  await Promise.all([1, 2].map(() => client("http://localhost:4318/api/action", { method: "POST", body: "original" })));
  assert.equal(sessions, 1);
  await client("http://localhost:4318/api/action", { method: "POST", body: "original" });
  assert.equal(actions, 3);
  await client("http://localhost:4318/api/action", { method: "POST", body: "original" });
  assert.equal(sessions, 2);
  assert.equal(actions, 4);
});

test("failed session acquisition is retriable and sends no mutation", async () => {
  let requests = 0;
  const client = createApiFetch(async input => {
    requests++;
    assert.match(String(input), /\/api\/session$/);
    return Response.json({}, { status: 503 });
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(client("http://localhost:4318/api/action", { method: "POST" }), /сессию/);
  assert.equal(requests, 2);
});
