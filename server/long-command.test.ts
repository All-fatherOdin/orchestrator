import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const data = await mkdtemp(join(tmpdir(), "orchestrator-long-command-data-"));
process.env.ORCHESTRATOR_TEST = "1";
process.env.ORCHESTRATOR_DATA_DIR = data;
const { createRun, validateTaskQueue, authorizeTask, runTaskVerification, executeQueue, taskEvent } = await import("./index.ts");
test.after(() => rm(data, { recursive: true, force: true, maxRetries: 5 }));
const authorization = { enabled: true, intent: "review" as const, technicalPermission: "read_only" as const, sideEffectRisk: "none" as const };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-long-command-project-"));
  execFileSync("git", ["init", root], { stdio: "ignore" });
  await writeFile(join(root, "baseline.txt"), "baseline\n");
  execFileSync("git", ["-C", root, "add", "."], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "baseline"], { stdio: "ignore" });
  return root;
}

function makeRun(root: string, command: string) {
  return createRun(validateTaskQueue({ project: { path: root }, review: { enabled: false },
    limits: { taskTimeoutMinutes: 1, maxTaskRetries: 0 }, tasks: [
      { key: "long", title: "Long command", prompt: "Inspect only.", allowedPaths: [], authorization, verificationCommands: [command] },
      { key: "next", title: "Next", prompt: "Next", dependsOn: ["long"] },
    ] }));
}

test("runner waits past 30 seconds of silence and persists terminal verification evidence", { timeout: 55_000 }, async () => {
  const root = await fixture();
  try {
    const command = 'node -e "setTimeout(()=>console.log(\'LONG_COMMAND_COMPLETED\'),35000)"';
    const run = makeRun(root, command);
    const task = run.tasks[0];
    task.authorizationEvidence = authorizeTask(task, run.project);
    const started = performance.now();
    const result = await runTaskVerification(run, task);
    assert.ok(performance.now() - started >= 35_000);
    assert.deepEqual(result, { code: 0, timedOut: false });
    assert.deepEqual(task.verificationEvidence, [{ command, exitCode: 0, timedOut: false, output: "LONG_COMMAND_COMPLETED" }]);
    const saved = JSON.parse(await readFile(join(data, "runs", run.id, "run.json"), "utf8"));
    assert.deepEqual(saved.tasks[0].verificationEvidence, task.verificationEvidence);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
});

test("runner records its own short timeout as failed terminal verification evidence", async () => {
  const root = await fixture();
  try {
    const command = 'node -e "setInterval(()=>{},1000)"';
    const run = makeRun(root, command);
    const task = run.tasks[0];
    task.authorizationEvidence = authorizeTask(task, run.project);
    // Directly shorten the runner deadline; public YAML continues requiring minutes.
    task.timeoutMinutes = 0.002;
    const result = await runTaskVerification(run, task);
    assert.equal(result.timedOut, true);
    assert.notEqual(result.code, 0);
    assert.equal(task.verificationEvidence?.[0].timedOut, true);
    assert.notEqual(task.verificationEvidence?.[0].exitCode, 0);
    const saved = JSON.parse(await readFile(join(data, "runs", run.id, "run.json"), "utf8"));
    assert.deepEqual(saved.tasks[0].verificationEvidence, task.verificationEvidence);
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5 }); }
});

test("nested CLI timeout survives canonical logs without becoming an Orchestrator timeout", async () => {
  const root = await fixture();
  const previousBin = process.env.CODEX_BIN;
  const previousScript = process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT;
  try {
    const item = { id: "detector-1", type: "command_execution", command: "node detector.mjs", status: "failed", exit_code: 124,
      aggregated_output: "command timed out after 30000 milliseconds" };
    const event = { type: "item.completed", item };
    assert.match(taskEvent(JSON.stringify(event))!, /command timed out after 30000 milliseconds/);
    const provider = join(data, "nested-timeout-provider.cjs");
    await writeFile(provider, `const fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>{
      console.log(${JSON.stringify(JSON.stringify({ type: "item.started", item: { ...item, status: "in_progress", exit_code: null, aggregated_output: "" } }))});
      console.log(${JSON.stringify(JSON.stringify(event))});
      const args=process.argv.slice(2);fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'ORCHESTRATOR_EXECUTOR_OUTCOME_V1: STOPPED');
    });`);
    process.env.CODEX_BIN = process.execPath;
    process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = provider;
    const run = makeRun(root, 'node -e "console.log(\'MUST_NOT_RUN\')"');
    run.tasks[1].status = "skipped";
    await executeQueue(run);
    const saved = JSON.parse(await readFile(join(data, "runs", run.id, "run.json"), "utf8"));
    const task = saved.tasks[0];
    assert.equal(task.status, "failed");
    assert.equal(task.exitCode, 0); // Provider process completed; its nested command did not.
    assert.equal(Boolean(task.timedOut), false);
    assert.equal(task.executorOutcome, "STOPPED");
    assert.equal(task.verificationEvidence, undefined);
    assert.ok(task.log.some((line: string) => /running; no terminal receipt/.test(line)));
    assert.ok(task.log.some((line: string) => /terminal; exit 124/.test(line) && /command timed out after 30000 milliseconds/.test(line)));
  } finally {
    if (previousBin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = previousBin;
    if (previousScript === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = previousScript;
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
