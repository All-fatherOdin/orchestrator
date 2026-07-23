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

module.exports = {
  ORCHESTRATOR_API_VERSION,
  ORCHESTRATOR_SERVICE,
  configureSingleInstance,
  ensureServerAvailability,
  isCompatibleHealth,
  shouldReportServerExit,
  shouldStopServerOnQuit,
};
