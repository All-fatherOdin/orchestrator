const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildRunNotification,
  configureSingleInstance,
  configureWindowsAppIdentity,
  createRunEventStream,
  createRunNotificationTracker,
  createServerLogHandles,
  deliverNativeNotification,
  isCompatibleHealth,
  isOwnedHealth,
  isNativeNotificationSupported,
  isNotifiableTerminalStatus,
  resolveDesktopDataDirectory,
  selectRunTerminalTransition,
  selectDesktopPort,
  shouldStartRunNotifications,
  shouldReportServerExit,
  shouldStopServerOnQuit,
  startOwnedServer,
} = require("./lifecycle.cjs");

test("main interface keeps known user-facing labels in Russian", () => {
  const sources = [
    "src/App.tsx",
    "src/UsagePage.tsx",
    "src/OperatorDashboard.tsx",
    "src/AuditBundlesDashboard.tsx",
    "src/OutcomeScorecardsDashboard.tsx",
  ].map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
  const forbiddenLabels = [
    "Context profile",
    "Maximum context sources",
    "Require repository helper",
    "Context preflight",
    "Add task",
    "No tracked diff for this file.",
    "Reading Phase 6 evidence sources",
    "Build a bounded audit bundle",
    "Audit bundle result",
    "Project range",
    "Exact change",
    "Generate bundle",
    "Download bounded JSON",
    "Bundle not generated",
    "<code>receipt</code>",
    "Загружаем очереди pipeline",
    "Отчёт reviewer",
    "Чтение данных проектов Phase 6",
    "Checkpoint-коммиты",
    "Model\n",
    "Effort\n",
    "Timeout, min",
    "Retries\n",
    "Task {preview.task}",
    "fallback: ${preview.fallbackReason}",
    "Очереди pipeline",
    "Diff задачи",
    "Возобновить pipeline",
    "Phase 6 evidence sources are unavailable.",
  ];

  for (const label of forbiddenLabels) {
    assert.equal(sources.some((source) => source.includes(label)), false, `visible English label returned: ${label}`);
  }
});

test("main interface exposes bounded Russian desktop diagnostics states", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");
  for (const label of [
    "Сервер программы",
    "Хранилище:",
    "Сохранённых запусков:",
    "Загрузка сведений…",
    "Сведения настольной версии недоступны",
  ]) assert.equal(source.includes(label), true, `missing desktop diagnostics label: ${label}`);
});

test("Windows desktop registers the Orchestrator notification identity", () => {
  const calls = [];
  const app = {
    setName: (name) => calls.push(["name", name]),
    setAppUserModelId: (appId) => calls.push(["appId", appId]),
  };
  assert.equal(configureWindowsAppIdentity(app, "win32"), true);
  assert.deepEqual(calls, [
    ["name", "Orchestrator"],
    ["appId", "com.codex.orchestrator"],
  ]);
  assert.equal(configureWindowsAppIdentity(app, "linux"), false);
  assert.equal(calls.length, 2);
});

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

test("desktop always starts and owns its server process", async () => {
  const child = { pid: 42 };
  const spawned = await startOwnedServer({
    start: () => child,
    wait: async (value) => assert.equal(value, child),
  });
  assert.deepEqual(spawned, { ownsServer: true, process: child });
});

test("failed startup handshake stops the child process", async () => {
  const child = { pid: 77 };
  let stopped;
  await assert.rejects(
    startOwnedServer({
      start: () => child,
      wait: async () => { throw new Error("startup failed"); },
      stop: async (value) => { stopped = value; },
    }),
    /startup failed/,
  );
  assert.equal(stopped, child);
});

test("desktop health handshake requires its exact process token", () => {
  assert.equal(isCompatibleHealth({ ok: true, service: "codex-orchestrator", apiVersion: 1 }), true);
  assert.equal(isCompatibleHealth({ ok: true }), false);
  assert.equal(isCompatibleHealth({ ok: true, service: "other", apiVersion: 1 }), false);
  assert.equal(isOwnedHealth({ ok: true, service: "codex-orchestrator", apiVersion: 1, desktopInstanceToken: "owned" }, "owned"), true);
  assert.equal(isOwnedHealth({ ok: true, service: "codex-orchestrator", apiVersion: 1, desktopInstanceToken: "other" }, "owned"), false);
  assert.equal(isOwnedHealth({ ok: true, service: "codex-orchestrator", apiVersion: 1 }, "owned"), false);
});

test("desktop selects its preferred port or an operating-system fallback", async () => {
  const preferredCalls = [];
  assert.equal(await selectDesktopPort(4318, async (port) => {
    preferredCalls.push(port);
    return port;
  }), 4318);
  assert.deepEqual(preferredCalls, [4318]);

  const fallbackCalls = [];
  assert.equal(await selectDesktopPort(4318, async (port) => {
    fallbackCalls.push(port);
    return port === 0 ? 54812 : undefined;
  }), 54812);
  assert.deepEqual(fallbackCalls, [4318, 0]);
  await assert.rejects(selectDesktopPort(0, async () => undefined), /between 1 and 65535/);
  await assert.rejects(selectDesktopPort(4318, async () => undefined), /No local port/);
});

test("desktop data stays under userData unless explicitly overridden", () => {
  assert.equal(
    resolveDesktopDataDirectory({ userData: "C:\\Users\\Owner\\AppData\\Roaming\\Orchestrator" }),
    path.join("C:\\Users\\Owner\\AppData\\Roaming\\Orchestrator", ".orchestrator"),
  );
  assert.equal(
    resolveDesktopDataDirectory({ override: "C:\\test-data", userData: "ignored" }),
    path.resolve("C:\\test-data"),
  );
});

test("server exit reporting remains ownership-aware", () => {
  assert.equal(shouldReportServerExit({ isQuitting: false, ownsServer: true, serverReady: true }), true);
  assert.equal(shouldReportServerExit({ isQuitting: false, ownsServer: false, serverReady: true }), false);
  assert.equal(shouldReportServerExit({ isQuitting: true, ownsServer: true, serverReady: true }), false);
  assert.equal(shouldReportServerExit({ isQuitting: false, ownsServer: true, serverReady: false }), false);
});

test("desktop shutdown stops only the server process it owns", () => {
  assert.equal(shouldStopServerOnQuit({ ownsServer: true }), true);
  assert.equal(shouldStopServerOnQuit({ ownsServer: false }), false);
});

test("desktop server logs stdout and stderr to durable append-only files", () => {
  const calls = [];
  const closed = [];
  const handles = createServerLogHandles("C:\\data", {
    mkdirSync: (directory, options) => calls.push(["mkdir", directory, options]),
    openSync: (file, flags) => {
      calls.push(["open", file, flags]);
      return calls.length;
    },
    closeSync: (descriptor) => closed.push(descriptor),
  });

  assert.deepEqual(handles.stdio, ["ignore", handles.stdout, handles.stderr]);
  assert.match(handles.stdoutPath, /server\.stdout\.log$/);
  assert.match(handles.stderrPath, /server\.stderr\.log$/);
  assert.deepEqual(
    calls.filter(([kind]) => kind === "open").map(([, , flags]) => flags),
    ["a", "a"],
  );

  handles.close();
  assert.deepEqual(closed, [handles.stdout, handles.stderr]);
});

test("only same-run running or paused transitions select supported terminal outcomes", () => {
  for (const from of ["running", "paused"])
    for (const to of ["completed", "failed", "cancelled"])
      assert.equal(
        selectRunTerminalTransition({ id: "run-1", status: from }, { id: "run-1", status: to }),
        to,
      );

  assert.equal(
    selectRunTerminalTransition(
      { id: "run-1", status: "running" },
      { id: "run-2", status: "completed" },
    ),
    undefined,
  );
  assert.equal(
    selectRunTerminalTransition(
      { id: "run-1", status: "idle" },
      { id: "run-1", status: "completed" },
    ),
    undefined,
  );
  assert.equal(
    selectRunTerminalTransition(
      { id: "run-1", status: "running" },
      { id: "run-1", status: "timed_out" },
    ),
    undefined,
  );
});

test("completed, failed, and cancelled are the only notifiable terminal statuses", () => {
  for (const status of ["completed", "failed", "cancelled"])
    assert.equal(isNotifiableTerminalStatus(status), true);
  for (const status of ["idle", "running", "paused", "timed_out", "blocked", undefined])
    assert.equal(isNotifiableTerminalStatus(status), false);
});

test("tracker suppresses startup replay and deduplicates SSE snapshots and reconnect replay", () => {
  const tracker = createRunNotificationTracker();
  const terminalReplay = {
    id: "old-run",
    status: "completed",
    project: { name: "Старый проект" },
  };
  assert.equal(tracker.observe(terminalReplay), undefined);
  assert.equal(tracker.observe(terminalReplay), undefined);

  const running = {
    id: "live-run",
    status: "running",
    project: { name: "Живой проект" },
  };
  assert.equal(tracker.observe(running), undefined);
  assert.equal(tracker.observe(running), undefined);
  const completed = { ...running, status: "completed" };
  assert.deepEqual(tracker.observe(completed), buildRunNotification(completed));
  assert.equal(tracker.observe(completed), undefined);
  assert.equal(tracker.observe(running), undefined);
  assert.equal(tracker.observe(completed), undefined);
});

test("tracker emits once for paused-to-failed and running-to-cancelled runs", () => {
  const tracker = createRunNotificationTracker();
  for (const [id, from, to] of [
    ["failed-run", "paused", "failed"],
    ["cancelled-run", "running", "cancelled"],
  ]) {
    assert.equal(tracker.observe({ id, status: from, project: { name: "Проект" } }), undefined);
    assert.equal(tracker.observe({ id, status: to, project: { name: "Проект" } }).title.length > 0, true);
    assert.equal(tracker.observe({ id, status: to, project: { name: "Проект" } }), undefined);
  }
});

test("notification content is concise Russian text and excludes private run details", () => {
  const run = {
    id: "run-private",
    status: "failed",
    project: {
      name: "  Проект\u202e Альфа\n ",
      path: "C:\\private\\repository",
    },
    tasks: [{ title: "Secret task", log: ["token=do-not-copy"] }],
  };
  const content = buildRunNotification(run);
  assert.deepEqual(content, {
    title: "Очередь завершилась с ошибкой",
    body: "Проект «Проект Альфа». Результат: ошибка.",
  });
  assert.match(`${content.title} ${content.body}`, /\p{Script=Cyrillic}/u);
  assert.doesNotMatch(JSON.stringify(content), /private|Secret|token|do-not-copy/i);

  assert.deepEqual(buildRunNotification({ status: "cancelled", project: { path: "C:\\secret" } }), {
    title: "Очередь отменена",
    body: "Очередь Orchestrator. Результат: отменено.",
  });
});

test("unsupported or failing native notifications are silent", () => {
  class UnsupportedNotification {
    static isSupported() { return false; }
    constructor() { assert.fail("unsupported notification must not be constructed"); }
  }
  class ThrowingSupportNotification {
    static isSupported() { throw new Error("platform probe failed"); }
  }
  class ThrowingShowNotification {
    static isSupported() { return true; }
    show() { throw new Error("native delivery failed"); }
  }

  assert.equal(isNativeNotificationSupported(UnsupportedNotification), false);
  assert.equal(isNativeNotificationSupported(ThrowingSupportNotification), false);
  assert.equal(deliverNativeNotification(UnsupportedNotification, { title: "x", body: "y" }), false);
  assert.equal(deliverNativeNotification(ThrowingShowNotification, { title: "x", body: "y" }), false);
});

test("run notifications start only on Windows with supported native notifications", () => {
  class SupportedNotification {
    static isSupported() { return true; }
  }
  class UnsupportedNotification {
    static isSupported() { return false; }
  }

  assert.equal(shouldStartRunNotifications("win32", SupportedNotification), true);
  assert.equal(shouldStartRunNotifications("win32", UnsupportedNotification), false);
  assert.equal(shouldStartRunNotifications("darwin", SupportedNotification), false);
  assert.equal(shouldStartRunNotifications("linux", SupportedNotification), false);
});

test("native notification click handler is passive and can focus the existing window", () => {
  let instance;
  let clicks = 0;
  class SupportedNotification extends EventEmitter {
    static isSupported() { return true; }
    constructor(content) {
      super();
      instance = this;
      this.content = content;
    }
    show() { this.shown = true; }
  }
  const content = { title: "Очередь завершена", body: "Результат: успешно.", icon: "C:\\app\\icon.ico" };
  assert.equal(deliverNativeNotification(SupportedNotification, content, () => { clicks += 1; }), true);
  assert.equal(instance.shown, true);
  assert.deepEqual(instance.content, content);
  instance.emit("click");
  assert.equal(clicks, 1);
});

test("run SSE stream reconnects with bounded backoff and stop clears timers and sockets", () => {
  const connections = [];
  const timers = [];
  const cleared = [];
  const runs = [];
  const http = {
    get(url, options, onResponse) {
      const request = new EventEmitter();
      request.destroy = () => { request.destroyed = true; };
      connections.push({ url, options, onResponse, request });
      return request;
    },
  };
  const stream = createRunEventStream({
    http,
    url: "http://127.0.0.1:4318/api/events",
    onRun: (run) => runs.push(run),
    reconnectDelaysMs: [10, 20],
    setTimer: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => cleared.push(timer),
  });
  assert.equal(connections.length, 1);
  assert.deepEqual(connections[0].options, { headers: { Accept: "text/event-stream" } });

  const firstResponse = new EventEmitter();
  firstResponse.statusCode = 200;
  firstResponse.setEncoding = (encoding) => assert.equal(encoding, "utf8");
  firstResponse.destroy = () => { firstResponse.destroyed = true; };
  connections[0].onResponse(firstResponse);
  firstResponse.emit("data", "event: run\r\ndata: {\"id\":\"run-1\",\"status\":\"running\"}\r\n\r\n");
  assert.deepEqual(runs, [{ id: "run-1", status: "running" }]);
  firstResponse.emit("close");
  firstResponse.emit("end");
  assert.deepEqual(timers.map((timer) => timer.delay), [10]);

  timers[0].callback();
  assert.equal(connections.length, 2);
  connections[1].request.emit("error", new Error("disconnect"));
  assert.deepEqual(timers.map((timer) => timer.delay), [10, 20]);
  timers[1].callback();
  connections[2].request.emit("error", new Error("disconnect again"));
  assert.deepEqual(timers.map((timer) => timer.delay), [10, 20, 20]);

  stream.stop();
  assert.deepEqual(cleared, [timers[2]]);
  timers[2].callback();
  assert.equal(connections.length, 3);

  const activeStream = createRunEventStream({
    http,
    url: "http://127.0.0.1:4318/api/events",
    onRun: () => undefined,
    reconnectDelaysMs: [10],
    setTimer: (callback, delay) => ({ callback, delay }),
    clearTimer: () => undefined,
  });
  const activeConnection = connections[3];
  const activeResponse = new EventEmitter();
  activeResponse.statusCode = 200;
  activeResponse.setEncoding = () => undefined;
  activeResponse.destroy = () => { activeResponse.destroyed = true; };
  activeConnection.onResponse(activeResponse);
  activeStream.stop();
  assert.equal(activeConnection.request.destroyed, true);
  assert.equal(activeResponse.destroyed, true);
});
