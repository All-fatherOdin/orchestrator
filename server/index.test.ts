import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse, stringify } from "yaml";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

process.env.ORCHESTRATOR_TEST = "1";
const testDataDirectory = await mkdtemp(join(tmpdir(), "orchestrator-test-data-"));
process.env.ORCHESTRATOR_DATA_DIR = testDataDirectory;
test.after(async () => rm(testDataDirectory, { recursive: true, force: true }));

const {
  acquireProjectLock,
  blockTasksWithFailedDependencies,
  outsideAllowedPaths,
  recoverRun,
  releaseProjectLock,
  resolveReviewedTaskStatus,
  resolveTaskStatus,
  schedulerSnapshot,
  selectRunnableTasks,
  resumeRun,
  retryRun,
  usageFromEvent,
  outcomeClass,
  durationMs,
  projectTaskMetrics,
  projectRunMetrics,
  loadPipeline,
  validateQueue,
  FallbackContextProvider,
  RepositoryContextHelperProvider,
  resolveTaskContext,
  cachePreflightContexts,
  contextsForRun,
  createRun,
  buildPrompt,
  createContextRequestV1,
  validateContextContractV1,
  bindBeforeRecovery,
  runHasLiveOwner,
  previewGoalBuddyTask,
  createGoalReceiptEnvelopeV1,
  finalizeSettledTask,
  validateGoalReceiptEnvelopeV1,
} = await import("./index.ts");
const { TaskContextControls, contextProfileTaskPatch, optionalNumberValue } = await import("../src/App.tsx");
const testNodeExecutable = process.env.ORCHESTRATOR_TEST_NODE ?? process.execPath;

test("server binds successfully before recovery mutates persisted runs", async () => {
  const events: string[] = [];
  const server = { close: () => undefined };
  assert.equal(
    await bindBeforeRecovery(
      async () => { events.push("listen"); return server; },
      async () => { events.push("recover"); },
    ),
    server,
  );
  assert.deepEqual(events, ["listen", "recover"]);

  let recovered = false;
  await assert.rejects(
    bindBeforeRecovery(
      async () => { throw new Error("EADDRINUSE"); },
      async () => { recovered = true; },
    ),
    /EADDRINUSE/,
  );
  assert.equal(recovered, false);

  let closed = false;
  await assert.rejects(
    bindBeforeRecovery(
      async () => ({ close: (done: () => void) => { closed = true; done(); } }),
      async () => { throw new Error("recovery failed"); },
    ),
    /recovery failed/,
  );
  assert.equal(closed, true);
});

test("recovery recognizes a live matching run owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orchestrator-live-owner-"));
  const lockPath = join(directory, ".codex-orchestrator.lock");
  try {
    await writeFile(lockPath, JSON.stringify({ runId: "run-live", pid: 1234 }), "utf8");
    const run = {
      id: "run-live",
      project: { path: directory },
      lock: { path: lockPath, acquiredAt: new Date().toISOString() },
    };
    assert.equal(await runHasLiveOwner(run, (pid: number) => pid === 1234), true);
    assert.equal(await runHasLiveOwner({ ...run, id: "other-run" }, () => true), false);
    assert.equal(await runHasLiveOwner(run, () => false), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("vendors exact Context Contract v1 schemas with recorded provenance", async () => {
  const expected = {
    "context-request-v1.schema.json": "20a74bb97390dc1543504c852fe5c72d8f81d53bf2ec3da964f7e36f47c083f3",
    "context-bundle-v1.schema.json": "18c9b99f8eff25c75bb4a4b723c7bbfdcca331afa8b69c5e3ddeb9f7ce4a7b99",
    "context-receipt-v1.schema.json": "daf185539344f646c16c6834a4d1578b61d812a7bf3c7ff94f1181de55ab22ec",
  };
  for (const [name, hash] of Object.entries(expected)) {
    const snapshot = await readFile(join("server", "context-contract-v1", "schemas", name));
    assert.equal(createHash("sha256").update(snapshot).digest("hex"), hash);
  }
  const provenance = await readFile(join("server", "context-contract-v1", "schemas", "PROVENANCE.md"), "utf8");
  assert.match(provenance, /AI-assisted_System_Design_and_Agent_Memory_Kit/);
  assert.match(provenance, /JSON Schema Draft 2020-12/);
});

test("Ajv 2020 validates generated ContextRequestV1 and rejects observable mismatches", () => {
  const request = createContextRequestV1({
    projectPath: "C:/safe-project",
    requestId: "request-schema",
    task: "Review repository",
    profile: "review",
    maxSources: 2,
  });
  assert.equal(validateContextContractV1("request", request), request);
  assert.throws(
    () => validateContextContractV1("request", { ...request, contract_version: "2.0" }),
    /CONTEXT_SCHEMA_MISMATCH.*ContextRequestV1/,
  );
});

test("visual task editor exposes accessible optional context controls", () => {
  const markup = renderToStaticMarkup(createElement(TaskContextControls, {
    task: { title: "Review", prompt: "Review repository", contextProfile: "review" },
    onChange: () => undefined,
  }));
  assert.match(markup, /<label[^>]*>Context profile/);
  assert.match(markup, /<label[^>]*>Maximum context sources/);
  assert.match(markup, /aria-label="Context profile"/);
  assert.match(markup, /aria-label="Maximum context sources"/);
  assert.match(markup, /type="number"[^>]*min="1"[^>]*max="50"[^>]*step="1"/);
});

test("context editor values round-trip through YAML without losing optional state", () => {
  const enabled = {
    title: "Review",
    prompt: "Review repository",
    ...contextProfileTaskPatch("review"),
    maxSources: optionalNumberValue("7"),
  };
  assert.deepEqual(parse(stringify({ tasks: [enabled] })).tasks[0], {
    title: "Review",
    prompt: "Review repository",
    contextProfile: "review",
    maxSources: 7,
  });
  const disabled = { ...enabled, ...contextProfileTaskPatch("") };
  assert.deepEqual(parse(stringify({ tasks: [disabled] })).tasks[0], {
    title: "Review",
    prompt: "Review repository",
  });
  assert.equal(optionalNumberValue(""), undefined);
  assert.equal(optionalNumberValue("1.5"), 1.5);
});

test("maps lifecycle statuses to outcome classes and derives only valid durations", () => {
  assert.equal(outcomeClass("completed"), "success");
  for (const status of ["failed", "timed_out", "blocked"])
    assert.equal(outcomeClass(status), "failure");
  for (const status of ["cancelled", "skipped"])
    assert.equal(outcomeClass(status), "interrupted");
  for (const status of ["idle", "pending", "running", "paused", "future_status"])
    assert.equal(outcomeClass(status), "pending");

  assert.equal(durationMs("2026-07-21T10:00:00.000Z", "2026-07-21T10:00:02.500Z"), 2500);
  assert.equal(durationMs(undefined, "2026-07-21T10:00:02.500Z"), null);
  assert.equal(durationMs("invalid", "2026-07-21T10:00:02.500Z"), null);
  assert.equal(durationMs("2026-07-21T10:00:03.000Z", "2026-07-21T10:00:02.500Z"), null);
});

test("projects stored attempts and cycles with usage fallbacks for legacy tasks", () => {
  const stored = projectTaskMetrics({
    ...task("stored", "completed"), executionAttempts: 0, attempts: 3,
  });
  assert.equal(stored.executionAttempts, 0);
  assert.equal(stored.reviewCorrectionCycles, 2);

  const fallback = projectTaskMetrics({
    ...task("legacy", "completed"),
    usage: [
      { phase: "executor", attempt: 1 },
      { phase: "executor", attempt: 3 },
      { phase: "correction", attempt: 1 },
      { phase: "correction", attempt: 1 },
      { phase: "correction", attempt: 2 },
    ],
  });
  assert.equal(fallback.executionAttempts, 3);
  assert.equal(fallback.reviewCorrectionCycles, 2);

  const unknown = projectTaskMetrics(task("unknown", "pending"));
  assert.equal(unknown.executionAttempts, null);
  assert.equal(unknown.reviewCorrectionCycles, null);
});

test("aggregates normalized tokens without double-counting cached input", () => {
  const metrics = projectTaskMetrics({
    ...task("tokens", "completed"),
    usage: [
      { phase: "executor", attempt: 1, inputTokens: 100.9, outputTokens: 25.8, cachedInputTokens: 80.2 },
      { phase: "reviewer", attempt: 1, inputTokens: -10, outputTokens: Number.NaN, cachedInputTokens: Infinity },
      { phase: "correction", attempt: 1, inputTokens: "7", outputTokens: null, cachedInputTokens: 2 },
    ],
  });
  assert.deepEqual(metrics.tokens, {
    inputTokens: 100,
    outputTokens: 25,
    cachedInputTokens: 82,
    totalTokens: 125,
    calls: 3,
  });
  assert.deepEqual(projectTaskMetrics(task("no-usage", "completed")).tokens, {
    inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0, calls: 0,
  });
});

test("projects legacy runs without exposing task content or mutating the source", () => {
  const source = run([{
    ...task("private", "completed"),
    prompt: "secret prompt", log: ["secret log"], finalOutput: "secret output",
    reviewOutput: "secret review", diff: "secret diff",
    startedAt: "2026-07-21T10:00:00.000Z", finishedAt: "2026-07-21T10:00:01.000Z",
    usage: [{ phase: "executor", attempt: 1, recordedAt: "now", inputTokens: 4, outputTokens: 6, cachedInputTokens: 3 }],
  }], "completed");
  source.startedAt = "2026-07-21T10:00:00.000Z";
  source.finishedAt = "2026-07-21T10:00:02.000Z";
  const before = JSON.stringify(source);
  const metrics = projectRunMetrics(source);

  assert.equal(metrics.durationMs, 2000);
  assert.equal(metrics.outcome, "success");
  assert.equal(metrics.tasks[0].durationMs, 1000);
  assert.equal(metrics.tokens.totalTokens, 10);
  assert.equal(JSON.stringify(source), before);
  const serialized = JSON.stringify(metrics);
  for (const forbidden of ["secret prompt", "secret log", "secret output", "secret review", "secret diff"])
    assert.equal(serialized.includes(forbidden), false);
});

test("reads machine-readable token usage from completed Codex turns", () => {
  assert.deepEqual(
    usageFromEvent('{"type":"turn.completed","usage":{"input_tokens":120,"output_tokens":45,"cached_input_tokens":80}}'),
    { inputTokens: 120, outputTokens: 45, cachedInputTokens: 80 },
  );
  assert.equal(usageFromEvent('{"type":"turn.started"}'), undefined);
  assert.equal(usageFromEvent("not json"), undefined);
});

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
    assert.equal(result.limits.maxParallelTasks, 1);
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

test("validates opt-in context profile and bounded maxSources", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-input-"));
  try {
    const base = { project: { path: project }, tasks: [{ title: "Context", prompt: "Review docs" }] };
    assert.equal(validateQueue(base).tasks[0].contextProfile, undefined);
    assert.equal(
      validateQueue({ ...base, tasks: [{ ...base.tasks[0], contextProfile: "review", maxSources: 7 }] }).tasks[0].maxSources,
      7,
    );
    assert.throws(
      () => validateQueue({ ...base, tasks: [{ ...base.tasks[0], maxSources: 7 }] }),
      /contextProfile/,
    );
    assert.throws(
      () => validateQueue({ ...base, tasks: [{ ...base.tasks[0], contextProfile: "Review Docs" }] }),
      /contextProfile/,
    );
    assert.throws(
      () => validateQueue({ ...base, tasks: [{ ...base.tasks[0], contextProfile: "review", maxSources: 0 }] }),
      /maxSources/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("safe fallback selects only fixed root entrypoints and emits ContextReceiptV1", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-fallback-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    await writeFile(join(project, "README.md"), "safe");
    await writeFile(join(project, ".env"), "SECRET=never-read");
    await mkdir(join(project, "data"));
    await writeFile(join(project, "data", "private.md"), "never-read");
    const result = await new FallbackContextProvider().provide({
      projectPath: project,
      requestId: "request-fallback",
      task: "Review repository",
      profile: "review",
      maxSources: 1,
    });
    assert.equal(result.provider, "fallback");
    assert.deepEqual(result.bundle.sources.map((source: { path: string }) => source.path), ["AGENTS.md"]);
    assert.equal(result.receipt.contract_type, "ContextReceiptV1");
    assert.equal(result.receipt.counts.selected_sources, 2);
    assert.equal(result.receipt.counts.omitted_sources, 1);
    assert.equal(validateContextContractV1("bundle", result.bundle), result.bundle);
    assert.equal(validateContextContractV1("receipt", result.receipt), result.receipt);
    assert.equal(JSON.stringify(result).includes(".env"), false);
    assert.equal(JSON.stringify(result).includes("private.md"), false);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("helper timeout, invalid JSON, and contract mismatch use observable safe fallback", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-helper-"));
  try {
    await mkdir(join(project, "scripts"));
    await writeFile(join(project, "AGENTS.md"), "safe");
    const cases = [
      ["timeout", "setTimeout(() => console.log('{}'), 500);", "HELPER_TIMEOUT", 30],
      ["invalid", "console.log('not json');", "HELPER_INVALID_JSON", 1_000],
      ["mismatch", "console.log(JSON.stringify({bundle_type:'wrong'}));", "HELPER_CONTRACT_MISMATCH", 1_000],
    ] as const;
    for (const [name, source, reason, timeoutMs] of cases) {
      const helper = `scripts/${name}.cjs`;
      await writeFile(join(project, helper), source);
      const result = await resolveTaskContext(
        { projectPath: project, requestId: `request-${name}`, task: "Review", profile: "review", maxSources: 2 },
        new RepositoryContextHelperProvider({ executable: testNodeExecutable, helperRelativePath: helper, timeoutMs }),
        new FallbackContextProvider(),
      );
      assert.equal(result.provider, "fallback");
      assert.equal(result.fallbackReason, reason);
      assert.ok(result.receipt.reason_codes.includes(reason));
    }
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("helper adapter preserves safety evidence and rejects divergent receipt selections", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-consistency-"));
  try {
    await mkdir(join(project, "scripts"));
    await writeFile(join(project, "AGENTS.md"), "safe");
    const source = {
      path: "AGENTS.md", priority: "P0", authority: "entrypoint", status: "active",
      layer: "root", retrieval_mode: "startup_required", inclusion_reason: "selected by helper",
    };
    const payload = {
      bundle_type: "api_agent_context_bundle", request_id: "request-consistent", profile: "review",
      mutation_scope: "read-only", runtime_scope_expanded: false, broker_or_data_scope_expanded: false,
      read_set: [source], context: { read_set: [source] },
      request_envelope: { request_id: "request-consistent", profile: "review", max_sources: 1, forbidden_paths: ["data/**"] },
      skipped_high_risk_context: [{ path_glob: "data/**", reason: "excluded by helper" }],
      skipped_trigger_only_context: [],
      selected_source_count: 4,
      omitted_source_count: 3,
      truncated: true,
      receipt: { receipt_type: "api_agent_context_receipt", request_id: "request-consistent", profile: "review", read_set: [source] },
    };
    const provider = new RepositoryContextHelperProvider({ executable: testNodeExecutable, helperRelativePath: "scripts/valid.cjs", timeoutMs: 1_000 });
    const request = { projectPath: project, requestId: "request-consistent", task: "Review", profile: "review", maxSources: 1 };
    const valid = provider.normalize(payload, request);
    assert.deepEqual(valid.bundle.selection.skipped_high_risk_context, payload.skipped_high_risk_context);
    assert.deepEqual(valid.bundle.selection.selected_source_count, 4);
    assert.deepEqual(valid.bundle.selection.omitted_source_count, 3);
    assert.deepEqual(valid.bundle.selection.truncated, true);
    assert.deepEqual(valid.receipt.counts, {
      requested_max_sources: 1,
      selected_sources: 4,
      omitted_sources: 3,
    });

    payload.receipt.read_set = [];
    const divergent = await resolveTaskContext(
      request,
      { provide: async () => provider.normalize(payload, request) },
      new FallbackContextProvider(),
    );
    assert.equal(divergent.fallbackReason, "HELPER_CONTRACT_MISMATCH");

    payload.receipt.read_set = [source];
    payload.selected_source_count = 3;
    const inconsistent = await resolveTaskContext(
      request,
      { provide: async () => provider.normalize(payload, request) },
      new FallbackContextProvider(),
    );
    assert.equal(inconsistent.provider, "fallback");
    assert.equal(inconsistent.fallbackReason, "HELPER_CONTRACT_MISMATCH");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("preflight context is reused for prompt and serialized run receipt", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-context-reuse-"));
  try {
    await writeFile(join(project, "AGENTS.md"), "safe");
    const queue = validateQueue({
      project: { path: project },
      tasks: [{ title: "Context", prompt: "Review", contextProfile: "review", maxSources: 2 }],
    });
    const context = await new FallbackContextProvider().provide({
      projectPath: project, requestId: "request-reuse", task: "Review", profile: "review", maxSources: 2,
    });
    cachePreflightContexts(queue, [context]);
    const consumed = await contextsForRun(queue);
    assert.strictEqual(consumed[0], context);
    const created = createRun(queue, undefined, consumed);
    assert.strictEqual(created.tasks[0].context, context);
    assert.strictEqual(created.contextReceipts?.[0], context.receipt);
    assert.match(buildPrompt(created.tasks[0], created.project), /AGENTS\.md/);
    const stored = JSON.parse(JSON.stringify(created));
    assert.equal(stored.contextReceipts[0].contract_type, "ContextReceiptV1");
    assert.equal(stored.contextReceipts[0].request_id, "request-reuse");
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("loads every queue in a sequential pipeline before it starts", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-pipeline-"));
  const first = join(project, "first.yaml");
  const second = join(project, "second.yaml");
  const queue = (title: string) => `project:\n  path: ${project.replace(/\\/g, "\\\\")}\ntasks:\n  - title: ${title}\n    prompt: Do work`;
  try {
    await writeFile(first, queue("First"));
    await writeFile(second, queue("Second"));
    const pipeline = await loadPipeline({
      queues: [{ file: first }, { file: second }],
    });
    assert.equal(pipeline.queues.length, 2);
    assert.equal(pipeline.queues[0].queue.tasks[0].title, "First");
    await assert.rejects(
      () => loadPipeline({ queues: [{ file: first }, { file: join(project, "missing.yaml") }] }),
      /does not exist/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("resolves automatic models within project and task constraints", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-routing-"));
  try {
    const queue = validateQueue({
      project: { path: project, allowedModels: ["luna", "terra", "sol"] },
      tasks: [
        { title: "Update wording", prompt: "Correct a typo", model: "auto" },
        { title: "API integration", prompt: "Add integration tests", model: "auto" },
        { title: "Migration", prompt: "Create a database migration", model: "auto", minModel: "terra" },
      ],
    });
    assert.equal(queue.tasks[0].model, "luna");
    assert.equal(queue.tasks[0].requestedModel, "auto");
    assert.equal(queue.tasks[1].model, "terra");
    assert.equal(queue.tasks[2].model, "sol");
    assert.match(queue.tasks[2].modelSelectionReason, /^auto:/);
    assert.throws(
      () => validateQueue({
        project: { path: project, allowedModels: ["luna"] },
        tasks: [{ title: "Important", prompt: "Work", model: "auto", minModel: "terra" }],
      }),
      /No enabled model/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("validates parallelism limits and exclusive task resources", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-parallelism-"));
  try {
    const queue = validateQueue({
      project: { path: project },
      limits: { maxParallelTasks: 3 },
      tasks: [
        {
          key: "database-migration",
          title: "Migration",
          prompt: "Run migration",
          resources: ["postgres-schema", "staging.db"],
        },
      ],
    });
    assert.equal(queue.limits.maxParallelTasks, 3);
    assert.deepEqual(queue.tasks[0].resources, ["postgres-schema", "staging.db"]);
    assert.throws(
      () =>
        validateQueue({
          project: { path: project },
          limits: { maxParallelTasks: 5 },
          tasks: [{ title: "Task", prompt: "Do work" }],
        }),
      /maxParallelTasks/,
    );
    assert.throws(
      () =>
        validateQueue({
          project: { path: project },
          tasks: [
            {
              title: "Task",
              prompt: "Do work",
              resources: ["staging", "staging"],
            },
          ],
        }),
      /resources must not contain duplicates/,
    );
    assert.throws(
      () =>
        validateQueue({
          project: { path: project },
          tasks: [
            { title: "Task", prompt: "Do work", resources: ["not allowed"] },
          ],
        }),
      /resources must use/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("validates task dependency graphs for parallel scheduling", async () => {
  const project = await mkdtemp(join(tmpdir(), "orchestrator-dependencies-"));
  try {
    const base = { project: { path: project } };
    const queue = validateQueue({
      ...base,
      tasks: [
        { key: "api", title: "API", prompt: "Build API" },
        { key: "ui", title: "UI", prompt: "Build UI" },
        {
          key: "e2e",
          title: "E2E",
          prompt: "Test the flow",
          dependsOn: ["api", "ui"],
        },
      ],
    });
    assert.deepEqual(queue.tasks[2].dependsOn, ["api", "ui"]);
    assert.throws(
      () =>
        validateQueue({
          ...base,
          tasks: [
            { key: "first", title: "First", prompt: "Do first", dependsOn: ["second"] },
            { key: "second", title: "Second", prompt: "Do second", dependsOn: ["first"] },
          ],
        }),
      /cycle/,
    );
    assert.throws(
      () =>
        validateQueue({
          ...base,
          tasks: [
            { key: "known", title: "Known", prompt: "Do known" },
            { key: "later", title: "Later", prompt: "Do later", dependsOn: ["missing"] },
          ],
        }),
      /unknown task key/,
    );
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test("schedules ready graph branches while respecting dependencies and conflicts", () => {
  const api = {
    ...task("api", "pending"),
    key: "api",
    allowedPaths: ["src/api"],
  };
  const web = {
    ...task("web", "pending"),
    key: "web",
    allowedPaths: ["src/web"],
  };
  const integration = {
    ...task("integration", "pending"),
    key: "integration",
    dependsOn: ["api", "web"],
    allowedPaths: ["tests/integration"],
  };
  assert.deepEqual(
    selectRunnableTasks([api, web, integration], 3).map((item) => item.key),
    ["api", "web"],
  );
  api.status = "completed";
  web.status = "completed";
  assert.deepEqual(
    selectRunnableTasks([api, web, integration], 3).map((item) => item.key),
    ["integration"],
  );

  const migration = {
    ...task("migration", "pending"),
    allowedPaths: ["db/migrations"],
    resources: ["postgres-schema"],
  };
  const seed = {
    ...task("seed", "pending"),
    allowedPaths: ["db/seeds"],
    resources: ["postgres-schema"],
  };
  assert.deepEqual(
    selectRunnableTasks([migration, seed], 2).map((item) => item.id),
    ["migration"],
  );

  const failed = { ...task("failed", "failed"), key: "failed" };
  const dependent = {
    ...task("dependent", "pending"),
    key: "dependent",
    dependsOn: ["failed"],
  };
  assert.equal(blockTasksWithFailedDependencies([failed, dependent]), true);
  assert.equal(dependent.status, "blocked");

  const snapshotRun = run([api, web, integration], "running");
  snapshotRun.limits.maxParallelTasks = 3;
  api.status = "running";
  const snapshot = schedulerSnapshot(snapshotRun);
  assert.equal(snapshot.availableSlots, 2);
  assert.deepEqual(snapshot.runningTaskIds, ["api"]);
});

test("scheduler enforces slot budgets and safe path conflicts", () => {
  const first = { ...task("first", "pending"), allowedPaths: ["src/first"] };
  const second = { ...task("second", "pending"), allowedPaths: ["src/second"] };
  const third = { ...task("third", "pending"), allowedPaths: ["src/third"] };
  assert.deepEqual(
    selectRunnableTasks([first, second, third], 2).map((item) => item.id),
    ["first", "second"],
  );

  const unscoped = { ...task("unscoped", "pending") };
  assert.deepEqual(
    selectRunnableTasks([unscoped, first], 2).map((item) => item.id),
    ["unscoped"],
  );

  const parentPath = {
    ...task("parent-path", "pending"),
    allowedPaths: ["src/shared"],
  };
  const childPath = {
    ...task("child-path", "pending"),
    allowedPaths: ["src/shared/components"],
  };
  assert.deepEqual(
    selectRunnableTasks([parentPath, childPath], 2).map((item) => item.id),
    ["parent-path"],
  );

  const active = {
    ...task("active", "running"),
    allowedPaths: ["src/api"],
  };
  const conflicting = {
    ...task("conflicting", "pending"),
    allowedPaths: ["src/api/client"],
  };
  assert.deepEqual(selectRunnableTasks([conflicting], 1, [active]), []);
});

test("scheduler blocks transitive descendants and reports ready versus waiting work", () => {
  const failed = { ...task("failed", "failed"), key: "api" };
  const grandchild = {
    ...task("grandchild", "pending"),
    key: "deploy",
    dependsOn: ["build"],
  };
  const child = {
    ...task("child", "pending"),
    key: "build",
    dependsOn: ["api"],
  };
  const graph = [failed, grandchild, child];
  assert.equal(blockTasksWithFailedDependencies(graph), true);
  assert.equal(child.status, "blocked");
  assert.equal(grandchild.status, "pending");
  assert.equal(blockTasksWithFailedDependencies(graph), true);
  assert.equal(grandchild.status, "blocked");

  const active = {
    ...task("active", "running"),
    key: "api",
    allowedPaths: ["src/api"],
  };
  const ready = {
    ...task("ready", "pending"),
    key: "web",
    allowedPaths: ["src/web"],
  };
  const waiting = {
    ...task("waiting", "pending"),
    key: "e2e",
    dependsOn: ["api"],
    allowedPaths: ["tests/e2e"],
  };
  const snapshotRun = run([active, ready, waiting], "running");
  snapshotRun.limits.maxParallelTasks = 3;
  const snapshot = schedulerSnapshot(snapshotRun);
  assert.equal(snapshot.availableSlots, 2);
  assert.deepEqual(snapshot.readyTaskKeys, ["web"]);
  assert.deepEqual(snapshot.waitingTaskKeys, ["e2e"]);
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

test("retry and resume preserve completed work and reset graph descendants", () => {
  const completed = { ...task("done", "completed"), key: "setup" };
  const failed = {
    ...task("failed", "failed"),
    key: "api",
    finalOutput: "broken",
    checkpoint: { hash: "abc", message: "old", createdAt: "now" },
  };
  const blocked = {
    ...task("blocked", "blocked"),
    key: "e2e",
    dependsOn: ["api"],
  };
  const source = run([completed, failed, blocked]);
  const retry = retryRun(source, failed);
  assert.deepEqual(
    retry.tasks.map((item) => item.status),
    ["completed", "pending", "pending"],
  );
  assert.equal(retry.tasks[1].finalOutput, undefined);
  assert.equal(retry.tasks[1].checkpoint, undefined);
  const resumed = resumeRun(source);
  assert.ok(resumed);
  assert.deepEqual(
    resumed.tasks.map((item) => item.status),
    ["completed", "pending", "pending"],
  );
});

test("keeps a successful task completed when the reviewer is unavailable", () => {
  assert.equal(resolveReviewedTaskStatus("completed", "approved"), "completed");
  assert.equal(resolveReviewedTaskStatus("completed", "unavailable"), "completed");
  assert.equal(resolveReviewedTaskStatus("completed", "changes_requested"), "failed");
  assert.equal(resolveReviewedTaskStatus("completed", "timed_out"), "timed_out");
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

test("GoalBuddy bridge maps one active task through preview, run linkage, and a separate receipt without changing state", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-goalbuddy-"));
  const project = join(root, "repository");
  const statePath = join(root, "state.yaml");
  const objective = "Implement the bounded bridge slice.";
  const board = {
    version: 2,
    goal: { title: "Bridge fixture", slug: "bridge-fixture" },
    active_task: "T042",
    tasks: [
      {
        id: "T042",
        type: "worker",
        status: "active",
        objective,
        allowed_files: ["server/index.ts"],
        verify: ["npm test"],
        stop_if: ["Need files outside allowed_files."],
      },
      { id: "T043", type: "worker", status: "queued", objective: "Do not select me." },
    ],
  };
  try {
    await mkdir(project);
    await writeFile(statePath, stringify(board), "utf8");
    const before = createHash("sha256").update(await readFile(statePath)).digest("hex");

    const preview = await previewGoalBuddyTask({ statePath, projectPath: project });
    assert.equal(preview.contract_type, "GoalBuddyTaskPreviewV1");
    assert.equal(preview.taskInput.title, objective);
    assert.equal(preview.taskInput.prompt, objective);
    assert.deepEqual(preview.taskInput.allowedPaths, ["server/index.ts"]);
    assert.deepEqual(preview.taskInput.verificationCommands, ["npm test"]);
    assert.deepEqual(preview.taskInput.executionGuards, ["Need files outside allowed_files."]);
    assert.equal(preview.taskInput.externalTaskId, "T042");
    assert.ok(preview.taskInput.goalBuddy);
    assert.equal(preview.taskInput.goalBuddy.goalSlug, "bridge-fixture");
    assert.equal(preview.taskInput.goalBuddy.stateSha256, before);
    assert.equal(preview.queue.git.checkpointCommits, false);

    const queue = validateQueue(preview.queue);
    const created = createRun(queue);
    const linkedTask = created.tasks[0];
    assert.equal(linkedTask.externalTaskId, "T042");
    assert.ok(linkedTask.goalBuddy);
    assert.equal(linkedTask.goalBuddy.goalSlug, "bridge-fixture");
    assert.equal(created.project.path, project);
    assert.match(buildPrompt(linkedTask, created.project), /Need files outside allowed_files/);
    assert.match(buildPrompt(linkedTask, created.project), /npm test/);

    linkedTask.status = "completed";
    linkedTask.startedAt = new Date(Date.now() - 100).toISOString();
    linkedTask.finishedAt = new Date().toISOString();
    const written = await finalizeSettledTask(created, linkedTask);
    assert.ok(written);
    assert.notEqual(written.path, statePath);
    const receipt = validateGoalReceiptEnvelopeV1(
      JSON.parse(await readFile(written.path, "utf8")),
    );
    assert.equal(receipt.contract_type, "GoalReceiptEnvelopeV1");
    assert.equal(receipt.goal.slug, "bridge-fixture");
    assert.equal(receipt.task.external_task_id, "T042");
    assert.equal(receipt.repository.path, project);
    assert.equal(receipt.orchestrator.run_id, created.id);
    assert.equal(receipt.orchestrator.task_id, linkedTask.id);
    assert.equal(receipt.outcome.task_status, "completed");
    assert.equal(receipt.outcome.outcome_class, "success");
    assert.equal(receipt.source_state_unchanged, true);
    assert.equal(linkedTask.goalReceiptPath, written.path);
    const storedRun = JSON.parse(
      await readFile(join(testDataDirectory, "runs", created.id, "run.json"), "utf8"),
    );
    assert.equal(storedRun.tasks[0].goalBuddy.goalSlug, "bridge-fixture");
    assert.equal(storedRun.tasks[0].externalTaskId, "T042");
    assert.equal(storedRun.tasks[0].goalReceiptPath, written.path);
    assert.equal(
      createHash("sha256").update(await readFile(statePath)).digest("hex"),
      before,
    );

    for (const [status, expected] of [
      ["failed", "failure"],
      ["cancelled", "interrupted"],
    ] as const) {
      const envelope = createGoalReceiptEnvelopeV1(created, { ...linkedTask, status }, true);
      assert.equal(envelope.outcome.task_status, status);
      assert.equal(envelope.outcome.outcome_class, expected);
    }

    await writeFile(
      statePath,
      stringify({ ...board, active_task: null, tasks: board.tasks.map((task) => ({ ...task, status: "queued" })) }),
      "utf8",
    );
    await assert.rejects(
      () => previewGoalBuddyTask({ statePath, projectPath: project }),
      /exactly one active task/,
    );
    await writeFile(
      statePath,
      stringify({ ...board, tasks: board.tasks.map((task) => ({ ...task, status: "active" })) }),
      "utf8",
    );
    await assert.rejects(
      () => previewGoalBuddyTask({ statePath, projectPath: project }),
      /exactly one active task/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
