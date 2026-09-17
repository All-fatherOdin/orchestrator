import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "watch", "server/index.ts"], {
  stdio: "inherit", windowsHide: true,
  env: { ...process.env, ORCHESTRATOR_DEV_ORIGIN: "http://localhost:4317" },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
