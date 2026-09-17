import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";

const excluded = new Set([".git", "node_modules", ".orchestrator", "queues", "dist", "build", "release"]);
export async function discoverTests(root) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && !excluded.has(entry.name)) await visit(path);
      else if (entry.isFile() && /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name))
        found.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
  await visit(root);
  return found.sort();
}

// Keep resource-sensitive Windows cases isolated, but never hide a failure by retrying.
export const isolated = [
  "Phase 4 correlation is atomic across server processes",
  "MergeRequestV1 production target fencing has one cross-process winner after release and dead takeover",
];
async function run(args) {
  return new Promise(resolveExit => {
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...args], {
      stdio: "inherit", windowsHide: true,
    });
    child.on("error", error => { console.error(error.message); resolveExit(1); });
    child.on("exit", code => resolveExit(code ?? 1));
  });
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const tests = await discoverTests(process.cwd());
  if (!tests.length) throw new Error("No test files discovered.");
  console.log(`Discovered ${tests.length} test files.`);
  if (process.argv.includes("--list")) console.log(tests.join("\n"));
  else {
    const pattern = `^(?:${isolated.join("|")})$`;
    let failed = await run(["--test-skip-pattern", pattern, ...tests]);
    for (const name of isolated) {
      const result = await run(["--test-name-pattern", `^${name}$`, "server/index.test.ts"]);
      if (result) failed = result;
    }
    process.exitCode = failed;
  }
}
