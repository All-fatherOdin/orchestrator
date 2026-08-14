const { app, BrowserWindow, dialog, Notification } = require("electron");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const {
  configureSingleInstance,
  configureWindowsAppIdentity,
  createRunEventStream,
  createRunNotificationTracker,
  createServerLogHandles,
  deliverNativeNotification,
  isOwnedHealth,
  resolveDesktopDataDirectory,
  restoreAndFocusWindow,
  selectDesktopPort,
  shouldStartRunNotifications,
  shouldReportServerExit,
  shouldStopServerOnQuit,
  startOwnedServer,
} = require("./lifecycle.cjs");

const preferredPort = Number(process.env.ORCHESTRATOR_PORT || 4318);
const desktopInstanceToken = randomUUID();
let port;
let url;
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

function probeOwnedServer() {
  return new Promise((resolve) => {
    const request = http.get(`${url}/api/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(response.statusCode === 200 && isOwnedHealth(JSON.parse(body), desktopInstanceToken));
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

function reserveAvailablePort(requestedPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    const finish = (value) => {
      server.removeAllListeners();
      resolve(value);
    };
    server.once("error", () => finish(undefined));
    server.listen({ host: "127.0.0.1", port: requestedPort, exclusive: true }, () => {
      const address = server.address();
      const selectedPort = typeof address === "object" && address ? address.port : undefined;
      server.close(() => finish(selectedPort));
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
      if (await probeOwnedServer()) return finish(resolve);
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
  const dataDirectory = resolveDesktopDataDirectory({
    override: process.env.ORCHESTRATOR_DATA_DIR,
    userData: app.getPath("userData"),
  });

  const logs = createServerLogHandles(dataDirectory);
  serverStderrPath = logs.stderrPath;
  try {
    serverProcess = spawn(process.execPath, [serverPath], {
      cwd: app.getPath("userData"),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        ORCHESTRATOR_NO_OPEN: "1",
        ORCHESTRATOR_WEB_ROOT: webRoot,
        ORCHESTRATOR_DATA_DIR: dataDirectory,
        ORCHESTRATOR_DESKTOP_TOKEN: desktopInstanceToken,
        ORCHESTRATOR_DESKTOP_VERSION: app.getVersion(),
        PORT: String(port),
      },
      stdio: logs.stdio,
      windowsHide: true,
    });
    ownsServer = true;
    return serverProcess;
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

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#f4f1eb",
    icon: appIconPath(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once("closed", () => { mainWindow = undefined; });
  await mainWindow.loadFile(path.join(__dirname, "loading.html"));
}

async function loadApplicationWindow() {
  if (isQuitting || !mainWindow || mainWindow.isDestroyed()) return false;
  await mainWindow.loadURL(url);
  return true;
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
      await createWindow();
      port = await selectDesktopPort(preferredPort, reserveAvailablePort);
      url = `http://127.0.0.1:${port}`;
      const availability = await startOwnedServer({
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
      if (!(await loadApplicationWindow())) return;
      startRunNotifications();
    } catch (error) {
      const startupWasCancelled = isQuitting;
      isQuitting = true;
      stopServer();
      if (!startupWasCancelled)
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
