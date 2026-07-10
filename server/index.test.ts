import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";

process.env.ORCHESTRATOR_TEST = "1";

const {
  acquireProjectLock,
  outsideAllowedPaths,
  recoverRun,
  releaseProjectLock,
  resolveTaskStatus,
  resumeRun,
  retryRun,
  validateQueue,
} = await import("./index.ts");

function task(id: string, status: string): any {
  return {
    id,
    title: id,
    prompt: "Test task",
    model: "terra",
    effort: "light",
    status,
    log: [] as string[],
  };
}

function run(tasks: any[], status = "failed"): any {
  return {
    id: "run-1",
    project: { name: "Test", path: process.cwd() },
    status,
    review: {
      enabled: true,
      model: "terra",
      effort: "light",
      maxCorrections: 1,
    },
    limits: {
      taskTimeoutMinutes: 30,
      reviewerTimeoutMinutes: 10,
      maxTaskRetries: 1,
    },
    git: { checkpointCommits: false },
    tasks,
  };
}

test("validates YAML queue, models, limits, and Sol effort", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-test-"));
  try {
    const queue = parse(
      `project:\n  name: Test\n  path: ${project.replace(/\\/g, "\\\\")}\nlimits:\n  taskTimeoutMinutes: 20\n  reviewerTimeoutMinutes: 5\n  maxTaskRetries: 2\ntasks:\n  - title: Safe task\n    prompt: Do work\n    model: terra\n    effort: medium`,
    ) as unknown;
    const result = validateQueue(queue);
    assert.equal(result.limits.taskTimeoutMinutes, 20);
    assert.equal(result.limits.maxTaskRetries, 2);
    assert.equal(result.tasks[0].model, "terra");
    assert.throws(
      () =>
        validateQueue({
          ...(queue as object),
          tasks: [
            { title: "Too costly", prompt: "No", model: "sol", effort: "high" },
          ],
        }),
      /Sol with high effort/,
    );
    assert.throws(
      () =>
        validateQueue({
          ...(queue as object),
          limits: { taskTimeoutMinutes: 0 },
        }),
      /taskTimeoutMinutes/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("enforces allowedPaths and resolves completed, skipped, cancelled, failed, and timeout states", () => {
  assert.deepEqual(
    outsideAllowedPaths(["src/safe/a.ts", "README.md"], ["src/safe"]),
    ["README.md"],
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: [],
    }),
    "completed",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: true,
      exitCode: 1,
      timedOut: false,
      violations: [],
    }),
    "skipped",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: true,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: [],
    }),
    "cancelled",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 1,
      timedOut: false,
      violations: [],
    }),
    "failed",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 1,
      timedOut: true,
      violations: [],
    }),
    "timed_out",
  );
  assert.equal(
    resolveTaskStatus({
      cancelled: false,
      skipped: false,
      exitCode: 0,
      timedOut: false,
      violations: ["README.md"],
    }),
    "failed",
  );
});

test("retry and resume reset only incomplete tasks into a new run", () => {
  const completed = task("done", "completed");
  const failed = {
    ...task("failed", "failed"),
    finalOutput: "broken",
    checkpoint: { hash: "abc", message: "old", createdAt: "now" },
  };
  const pending = task("pending", "pending");
  const source = run([completed, failed, pending]);
  const retry = retryRun(source, failed);
  assert.equal(retry.tasks.length, 1);
  assert.equal(retry.tasks[0].status, "pending");
  assert.equal(retry.tasks[0].finalOutput, undefined);
  assert.equal(retry.tasks[0].checkpoint, undefined);
  const resumed = resumeRun(source);
  assert.ok(resumed);
  assert.deepEqual(
    resumed.tasks.map((item) => item.title),
    ["failed", "pending"],
  );
  assert.ok(resumed.tasks.every((item) => item.status === "pending"));
});

test("recovery after restart fails an in-progress task and preserves its run record", () => {
  const active = { ...task("active", "running"), log: ["agent started"] };
  const source = run([active], "running");
  const recovered = recoverRun(source);
  assert.equal(recovered.status, "failed");
  assert.equal(recovered.tasks[0].status, "failed");
  assert.equal(recovered.tasks[0].exitCode, 1);
  assert.ok(recovered.tasks[0].finishedAt);
  assert.match(
    recovered.tasks[0].log.at(-1) ?? "",
    /process ended before Codex/,
  );
});

test("project lock prevents two orchestrator runs from using the same repository", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-lock-"));
  const first = run([task("first", "pending")], "idle");
  const second = run([task("second", "pending")], "idle");
  first.id = "first-run";
  second.id = "second-run";
  first.project.path = project;
  second.project.path = project;
  try {
    await acquireProjectLock(first);
    await assert.rejects(() => acquireProjectLock(second), /Project is locked/);
    await releaseProjectLock(first);
    await acquireProjectLock(second);
  } finally {
    await releaseProjectLock(first);
    await releaseProjectLock(second);
    await rm(project, { recursive: true, force: true });
  }
});
