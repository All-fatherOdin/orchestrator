const fs = require("node:fs");
const path = require("node:path");

const ORCHESTRATOR_SERVICE = "codex-orchestrator";
const ORCHESTRATOR_API_VERSION = 1;
const ACTIVE_RUN_STATUSES = new Set(["running", "paused"]);
const NOTIFIABLE_TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
]);
const DEFAULT_RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

function restoreAndFocusWindow(window) {
  if (!window) return;
  try {
    if (typeof window.isDestroyed === "function" && window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  } catch {
    // A click can race with window teardown and must never affect desktop shutdown.
  }
}

function configureSingleInstance(app, getMainWindow) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on("second-instance", () => {
    restoreAndFocusWindow(getMainWindow());
  });
  return true;
}

function isNotifiableTerminalStatus(status) {
  return NOTIFIABLE_TERMINAL_RUN_STATUSES.has(status);
}

function selectRunTerminalTransition(previous, next) {
  if (!previous || !next || previous.id !== next.id) return undefined;
  if (!ACTIVE_RUN_STATUSES.has(previous.status)) return undefined;
  return isNotifiableTerminalStatus(next.status) ? next.status : undefined;
}

function safeProjectName(run) {
  if (!run || typeof run !== "object" || typeof run.project?.name !== "string")
    return undefined;
  const normalized = run.project.name
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!normalized) return undefined;
  return [...normalized].slice(0, 80).join("");
}

function buildRunNotification(run) {
  const content = {
    completed: {
      title: "Очередь завершена",
      summary: "Результат: успешно.",
    },
    failed: {
      title: "Очередь завершилась с ошибкой",
      summary: "Результат: ошибка.",
    },
    cancelled: {
      title: "Очередь отменена",
      summary: "Результат: отменено.",
    },
  }[run?.status];
  if (!content) return undefined;
  const projectName = safeProjectName(run);
  return {
    title: content.title,
    body: projectName
      ? `Проект «${projectName}». ${content.summary}`
      : `Очередь Orchestrator. ${content.summary}`,
  };
}

function createRunNotificationTracker() {
  const observations = new Map();
  return {
    observe(run) {
      if (!run || typeof run.id !== "string" || !run.id || typeof run.status !== "string")
        return undefined;
      const previous = observations.get(run.id);
      const status = selectRunTerminalTransition(previous, run);
      const alreadyNotified = previous?.notified === true;
      observations.set(run.id, {
        id: run.id,
        status: run.status,
        notified: alreadyNotified || Boolean(status),
      });
      return status && !alreadyNotified ? buildRunNotification(run) : undefined;
    },
  };
}

function isNativeNotificationSupported(NotificationClass) {
  try {
    return Boolean(
      NotificationClass &&
        typeof NotificationClass.isSupported === "function" &&
        NotificationClass.isSupported(),
    );
  } catch {
    return false;
  }
}

function shouldStartRunNotifications(platform, NotificationClass) {
  return platform === "win32" && isNativeNotificationSupported(NotificationClass);
}

function deliverNativeNotification(NotificationClass, content, onClick) {
  if (!content || !isNativeNotificationSupported(NotificationClass)) return false;
  try {
    const notification = new NotificationClass(content);
    if (typeof notification.once === "function" && typeof onClick === "function")
      notification.once("click", () => {
        try {
          onClick();
        } catch {
          // Notification interactions are passive and isolated from app lifecycle failures.
        }
      });
    notification.show();
    return true;
  } catch {
    return false;
  }
}

function createSseParser(onEvent) {
  let buffer = "";
  let event = "message";
  let data = [];
  const dispatch = () => {
    if (data.length) onEvent(event, data.join("\n"));
    event = "message";
    data = [];
  };
  const consumeLine = (line) => {
    if (!line) return dispatch();
    if (line.startsWith(":")) return;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    if (field === "data") data.push(value);
  };
  return (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      consumeLine(line);
      newline = buffer.indexOf("\n");
    }
  };
}

function createRunEventStream({
  http,
  url,
  onRun,
  reconnectDelaysMs = DEFAULT_RECONNECT_DELAYS_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let stopped = false;
  let reconnectAttempt = 0;
  let reconnectTimer;
  let activeRequest;
  let activeResponse;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return;
    const index = Math.min(reconnectAttempt, reconnectDelaysMs.length - 1);
    const delay = reconnectDelaysMs[index];
    reconnectAttempt = Math.min(reconnectAttempt + 1, reconnectDelaysMs.length - 1);
    reconnectTimer = setTimer(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;
    let disconnected = false;
    const handleDisconnect = () => {
      if (disconnected) return;
      disconnected = true;
      if (activeResponse === response) activeResponse = undefined;
      if (activeRequest === request) activeRequest = undefined;
      scheduleReconnect();
    };
    let request;
    let response;
    try {
      request = http.get(url, { headers: { Accept: "text/event-stream" } }, (incoming) => {
        response = incoming;
        activeResponse = incoming;
        if (incoming.statusCode !== 200) {
          incoming.resume();
          handleDisconnect();
          return;
        }
        incoming.setEncoding("utf8");
        const parse = createSseParser((event, rawData) => {
          if (event !== "run") return;
          try {
            const run = JSON.parse(rawData);
            onRun(run);
            reconnectAttempt = 0;
          } catch {
            // Malformed or consumer-rejected events cannot affect the desktop lifecycle.
          }
        });
        incoming.on("data", parse);
        incoming.once("end", handleDisconnect);
        incoming.once("close", handleDisconnect);
        incoming.once("error", handleDisconnect);
      });
      activeRequest = request;
      request.once("error", handleDisconnect);
    } catch {
      scheduleReconnect();
    }
  };

  connect();
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (reconnectTimer !== undefined) {
        clearTimer(reconnectTimer);
        reconnectTimer = undefined;
      }
      const response = activeResponse;
      const request = activeRequest;
      activeResponse = undefined;
      activeRequest = undefined;
      try {
        response?.destroy();
      } catch {
        // Stream teardown is best-effort during application shutdown.
      }
      try {
        request?.destroy();
      } catch {
        // Stream teardown is best-effort during application shutdown.
      }
    },
  };
}

function isCompatibleHealth(payload) {
  return Boolean(
    payload &&
      payload.ok === true &&
      payload.service === ORCHESTRATOR_SERVICE &&
      payload.apiVersion === ORCHESTRATOR_API_VERSION,
  );
}

async function ensureServerAvailability({ probe, start, wait, stop = async () => undefined }) {
  if (await probe()) return { mode: "attached", ownsServer: false };
  const process = start();
  try {
    await wait(process);
  } catch (error) {
    await stop(process);
    throw error;
  }
  return { mode: "spawned", ownsServer: true, process };
}

function shouldReportServerExit({ isQuitting, ownsServer, serverReady }) {
  return !isQuitting && ownsServer && serverReady;
}

function shouldStopServerOnQuit({ ownsServer }) {
  return ownsServer === true;
}

function createServerLogHandles(dataDirectory, filesystem = fs) {
  const directory = path.join(dataDirectory, "logs");
  const stdoutPath = path.join(directory, "server.stdout.log");
  const stderrPath = path.join(directory, "server.stderr.log");
  filesystem.mkdirSync(directory, { recursive: true });
  const stdout = filesystem.openSync(stdoutPath, "a");
  let stderr;
  try {
    stderr = filesystem.openSync(stderrPath, "a");
  } catch (error) {
    filesystem.closeSync(stdout);
    throw error;
  }
  return {
    stdout,
    stderr,
    stdoutPath,
    stderrPath,
    stdio: ["ignore", stdout, stderr],
    close() {
      try {
        filesystem.closeSync(stdout);
      } finally {
        filesystem.closeSync(stderr);
      }
    },
  };
}

module.exports = {
  ACTIVE_RUN_STATUSES,
  DEFAULT_RECONNECT_DELAYS_MS,
  NOTIFIABLE_TERMINAL_RUN_STATUSES,
  ORCHESTRATOR_API_VERSION,
  ORCHESTRATOR_SERVICE,
  buildRunNotification,
  configureSingleInstance,
  createRunEventStream,
  createRunNotificationTracker,
  createServerLogHandles,
  deliverNativeNotification,
  ensureServerAvailability,
  isCompatibleHealth,
  isNativeNotificationSupported,
  isNotifiableTerminalStatus,
  restoreAndFocusWindow,
  selectRunTerminalTransition,
  shouldStartRunNotifications,
  shouldReportServerExit,
  shouldStopServerOnQuit,
};
