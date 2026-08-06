const { app, BrowserWindow, dialog, Notification } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  configureSingleInstance,
  configureWindowsAppIdentity,
  createRunEventStream,
  createRunNotificationTracker,
  createServerLogHandles,
  deliverNativeNotification,
  ensureServerAvailability,
  isCompatibleHealth,
  restoreAndFocusWindow,
  shouldStartRunNotifications,
  shouldReportServerExit,
  shouldStopServerOnQuit,
} = require("./lifecycle.cjs");

const port = Number(process.env.ORCHESTRATOR_PORT || 4318);
const url = `http://127.0.0.1:${port}`;
let mainWindow;
let serverProcess;
let isQuitting = false;
let ownsServer = false;
let serverReady = false;
let serverStderrPath;
let runEventStream;

configureWindowsAppIdentity(app, process.platform);

function appIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(app.getAppPath(), "build", "icon.ico");
}

function probeCompatibleServer() {
  return new Promise((resolve) => {
    const request = http.get(`${url}/api/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(response.statusCode === 200 && isCompatibleHealth(JSON.parse(body)));
        } catch {
          resolve(false);
        }
      });
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

function waitForServer(child, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action, value) => {
      if (settled) return;
      settled = true;
      child.removeListener("exit", onExit);
      action(value);
    };
    const onExit = (code) => finish(
      reject,
      new Error(`The local Orchestrator server exited during startup (exit code ${code ?? "unknown"}).`),
    );
    child.once("exit", onExit);
    const check = async () => {
      if (await probeCompatibleServer()) return finish(resolve);
      if (Date.now() >= deadline)
        return finish(reject, new Error("The local Orchestrator server did not start in time."));
      setTimeout(check, 200);
    };
    void check();
  });
}

function startServer() {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, "server.cjs")
    : path.join(app.getAppPath(), "build", "server.cjs");
  const webRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dist")
    : path.join(app.getAppPath(), "dist");
  const portableWorkspaceData = path.resolve(
    process.resourcesPath,
    "..",
    "..",
    "..",
    ".orchestrator",
  );
  const dataDirectory =
    process.env.ORCHESTRATOR_DATA_DIR ||
    (app.isPackaged && existsSync(portableWorkspaceData)
      ? portableWorkspaceData
      : path.join(app.getPath("userData"), ".orchestrator"));

  const logs = createServerLogHandles(dataDirectory);
  serverStderrPath = logs.stderrPath;
  try {
    return spawn(process.execPath, [serverPath], {
      cwd: app.getPath("userData"),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        ORCHESTRATOR_NO_OPEN: "1",
        ORCHESTRATOR_WEB_ROOT: webRoot,
        ORCHESTRATOR_DATA_DIR: dataDirectory,
        PORT: String(port),
      },
      stdio: logs.stdio,
      windowsHide: true,
    });
  } finally {
    logs.close();
  }

}

function stopServerProcess(processToStop) {
  if (!processToStop || processToStop.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(processToStop.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    processToStop.kill();
  }
}

function stopServer() {
  if (ownsServer) stopServerProcess(serverProcess);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: appIconPath(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.loadURL(url);
}

function startRunNotifications() {
  try {
    if (isQuitting || !shouldStartRunNotifications(process.platform, Notification)) return;
    const tracker = createRunNotificationTracker();
    runEventStream = createRunEventStream({
      http,
      url: `${url}/api/events`,
      onRun(run) {
        const content = tracker.observe(run);
        if (!content) return;
        deliverNativeNotification(
          Notification,
          { ...content, icon: appIconPath() },
          () => restoreAndFocusWindow(mainWindow),
        );
      },
    });
  } catch {
    runEventStream = undefined;
  }
}

function stopRunNotifications() {
  runEventStream?.stop();
  runEventStream = undefined;
}

if (configureSingleInstance(app, () => mainWindow)) {
  app.whenReady().then(async () => {
    try {
      const availability = await ensureServerAvailability({
        probe: probeCompatibleServer,
        start: startServer,
        wait: waitForServer,
        stop: async (child) => stopServerProcess(child),
      });
      ownsServer = availability.ownsServer;
      serverProcess = availability.process;
      serverReady = true;
      serverProcess?.once("exit", (code) => {
        if (!shouldReportServerExit({ isQuitting, ownsServer, serverReady })) return;
        dialog.showErrorBox(
          "Orchestrator stopped",
          `The local server stopped unexpectedly (exit code ${code ?? "unknown"}).` +
            (serverStderrPath ? `\n\nServer log: ${serverStderrPath}` : ""),
        );
        app.quit();
      });
      createWindow();
      startRunNotifications();
    } catch (error) {
      isQuitting = true;
      stopServer();
      dialog.showErrorBox("Unable to start Orchestrator", error.message);
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    isQuitting = true;
    stopRunNotifications();
    if (shouldStopServerOnQuit({ ownsServer })) stopServer();
  });
}
