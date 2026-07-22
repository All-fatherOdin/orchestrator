const assert = require("node:assert/strict");
const test = require("node:test");

const {
  configureSingleInstance,
  ensureServerAvailability,
  isCompatibleHealth,
  shouldReportServerExit,
} = require("./lifecycle.cjs");

test("second desktop instance quits without starting another server", async () => {
  let quitCalls = 0;
  let startCalls = 0;
  const app = {
    requestSingleInstanceLock: () => false,
    quit: () => { quitCalls += 1; },
    on: () => assert.fail("second instance must not register lifecycle handlers"),
  };

  assert.equal(configureSingleInstance(app, () => undefined), false);
  assert.equal(quitCalls, 1);
  if (configureSingleInstance(app, () => undefined)) startCalls += 1;
  assert.equal(startCalls, 0);
});

test("second-instance event restores and focuses the existing window", () => {
  let handler;
  const calls = [];
  const window = {
    isMinimized: () => true,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  };
  const app = {
    requestSingleInstanceLock: () => true,
    quit: () => assert.fail("primary instance must remain open"),
    on: (event, callback) => {
      assert.equal(event, "second-instance");
      handler = callback;
    },
  };

  assert.equal(configureSingleInstance(app, () => window), true);
  handler();
  assert.deepEqual(calls, ["restore", "show", "focus"]);
});

test("desktop attaches only to a compatible existing Orchestrator server", async () => {
  let starts = 0;
  const attached = await ensureServerAvailability({
    probe: async () => true,
    start: () => { starts += 1; },
    wait: async () => undefined,
  });
  assert.deepEqual(attached, { mode: "attached", ownsServer: false });
  assert.equal(starts, 0);

  const child = { pid: 42 };
  const spawned = await ensureServerAvailability({
    probe: async () => false,
    start: () => child,
    wait: async (value) => assert.equal(value, child),
  });
  assert.deepEqual(spawned, { mode: "spawned", ownsServer: true, process: child });
});

test("failed startup handshake stops the child process", async () => {
  const child = { pid: 77 };
  let stopped;
  await assert.rejects(
    ensureServerAvailability({
      probe: async () => false,
      start: () => child,
      wait: async () => { throw new Error("startup failed"); },
      stop: async (value) => { stopped = value; },
    }),
    /startup failed/,
  );
  assert.equal(stopped, child);
});

test("health compatibility and exit reporting are ownership-aware", () => {
  assert.equal(isCompatibleHealth({ ok: true, service: "codex-orchestrator", apiVersion: 1 }), true);
  assert.equal(isCompatibleHealth({ ok: true }), false);
  assert.equal(isCompatibleHealth({ ok: true, service: "other", apiVersion: 1 }), false);
  assert.equal(shouldReportServerExit({ isQuitting: false, ownsServer: true, serverReady: true }), true);
  assert.equal(shouldReportServerExit({ isQuitting: false, ownsServer: false, serverReady: true }), false);
  assert.equal(shouldReportServerExit({ isQuitting: true, ownsServer: true, serverReady: true }), false);
  assert.equal(shouldReportServerExit({ isQuitting: false, ownsServer: true, serverReady: false }), false);
});
