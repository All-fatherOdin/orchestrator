const fs = require("node:fs");
const path = require("node:path");

const ORCHESTRATOR_SERVICE = "codex-orchestrator";
const ORCHESTRATOR_API_VERSION = 1;

function configureSingleInstance(app, getMainWindow) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on("second-instance", () => {
    const window = getMainWindow();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  return true;
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
  ORCHESTRATOR_API_VERSION,
  ORCHESTRATOR_SERVICE,
  configureSingleInstance,
  createServerLogHandles,
  ensureServerAvailability,
  isCompatibleHealth,
  shouldReportServerExit,
  shouldStopServerOnQuit,
};
