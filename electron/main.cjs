const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const port = Number(process.env.ORCHESTRATOR_PORT || 4318);
const url = `http://127.0.0.1:${port}`;
let mainWindow;
let serverProcess;
let isQuitting = false;

function waitForServer(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });
      request.on("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error("The local Orchestrator server did not start in time."));
          return;
        }
        setTimeout(check, 200);
      });
      request.setTimeout(1_000, () => request.destroy());
    };
    check();
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

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: app.getPath("userData"),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      ORCHESTRATOR_NO_OPEN: "1",
      ORCHESTRATOR_WEB_ROOT: webRoot,
      ORCHESTRATOR_DATA_DIR: dataDirectory,
      PORT: String(port),
    },
    stdio: "ignore",
    windowsHide: true,
  });

  serverProcess.once("exit", (code) => {
    if (!isQuitting) {
      dialog.showErrorBox(
        "Orchestrator stopped",
        `The local server stopped unexpectedly (exit code ${code ?? "unknown"}).`,
      );
      app.quit();
    }
  });
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(serverProcess.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    serverProcess.kill();
  }
}

function createWindow() {
  const icon = app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(app.getAppPath(), "build", "icon.ico");
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    icon,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.loadURL(url);
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
    createWindow();
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
  stopServer();
});
