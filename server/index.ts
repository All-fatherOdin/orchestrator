import express from "express";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "yaml";

type Model = "luna" | "terra" | "sol";
type Effort = "light" | "medium" | "high";
type Status =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "skipped";
type Limits = {
  taskTimeoutMinutes: number;
  reviewerTimeoutMinutes: number;
  maxTaskRetries: number;
};
type GitSettings = { checkpointCommits: boolean };
type Checkpoint = { hash: string; message: string; createdAt: string };
type ProjectLock = { path: string; acquiredAt: string };
type ProjectSettings = {
  profileId?: string;
  verificationCommands?: string[];
  defaultModel?: Model;
  defaultEffort?: Effort;
  allowedModels?: Model[];
};
type ProjectProfile = {
  id: string;
  name: string;
  path: string;
  verificationCommands: string[];
  defaultModel: Model;
  defaultEffort: Effort;
  allowedModels: Model[];
};
type TaskInput = {
  title: string;
  prompt: string;
  model?: Model;
  effort?: Effort;
  allowedPaths?: string[];
  timeoutMinutes?: number;
  maxRetries?: number;
};
type ReviewStatus =
  "pending" | "approved" | "changes_requested" | "unavailable" | "timed_out";
type ReviewSettings = {
  enabled: boolean;
  model: Model;
  effort: Effort;
  maxCorrections: number;
};
type Task = TaskInput & {
  id: string;
  model: Model;
  effort: Effort;
  status: Status;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  timedOut?: boolean;
  log: string[];
  changedFiles?: string[];
  diff?: string;
  finalOutput?: string;
  reviewStatus?: ReviewStatus;
  reviewOutput?: string;
  attempts?: number;
  executionAttempts?: number;
  checkpoint?: Checkpoint;
};
type Run = {
  id: string;
  project: { name: string; path: string } & ProjectSettings;
  status:
    | "idle"
    | "running"
    | "paused"
    | "completed"
    | "failed"
    | "timed_out"
    | "cancelled";
  startedAt?: string;
  finishedAt?: string;
  pausedAt?: string;
  pauseRequested?: boolean;
  tasks: Task[];
  review: ReviewSettings;
  limits: Limits;
  git: GitSettings;
  lock?: ProjectLock;
};

const MODEL_IDS: Record<Model, string> = {
  luna: "gpt-5.6-luna",
  terra: "gpt-5.6-terra",
  sol: "gpt-5.6-sol",
};
const runsDirectory = resolve(".orchestrator", "runs");
const settingsFile = resolve(".orchestrator", "settings.json");
const projectsFile = resolve(".orchestrator", "projects.json");
const defaultReviewSettings: ReviewSettings = {
  enabled: true,
  model: "terra",
  effort: "light",
  maxCorrections: 1,
};
const defaultLimits: Limits = {
  taskTimeoutMinutes: 30,
  reviewerTimeoutMinutes: 10,
  maxTaskRetries: 1,
};
const defaultGitSettings: GitSettings = { checkpointCommits: false };
let reviewSettings: ReviewSettings = defaultReviewSettings;
let savedProjects: ProjectProfile[] = [];
const windowsCodexBin = join(
  process.env.LOCALAPPDATA || "",
  "Microsoft",
  "WinGet",
  "Packages",
  "OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe",
  "codex-x86_64-pc-windows-msvc.exe",
);
let activeRun: Run | undefined;
let activeProcess: ReturnType<typeof spawn> | undefined;
let skippedTaskId: string | undefined;
let resumePausedRun: (() => void) | undefined;
const subscribers = new Set<express.Response>();

const timestamp = () => new Date().toISOString();
const identifier = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isCancelled = (run: Run) => run.status === "cancelled";
const projectLockName = ".codex-orchestrator.lock";
const lastSettledTask = (run: Run) =>
  [...run.tasks]
    .reverse()
    .find((task) => task.status === "completed" || task.status === "skipped");
function findDesktopCodexBin() {
  if (process.platform !== "win32") return undefined;
  const root = join(process.env.LOCALAPPDATA || "", "OpenAI", "Codex", "bin");
  if (!existsSync(root)) return undefined;
  try {
    return readdirSync(root)
      .map((entry) => join(root, entry, "codex.exe"))
      .filter(existsSync)
      .sort(
        (left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs,
      )[0];
  } catch {
    return undefined;
  }
}
const codexBin = () =>
  process.env.CODEX_BIN ||
  findDesktopCodexBin() ||
  (process.platform === "win32" && existsSync(windowsCodexBin)
    ? windowsCodexBin
    : "codex");

function publish(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  subscribers.forEach((response) => response.write(message));
}

async function persist(run: Run) {
  await mkdir(join(runsDirectory, run.id), { recursive: true });
  await writeFile(
    join(runsDirectory, run.id, "run.json"),
    JSON.stringify(run, null, 2),
  );
}
function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function acquireProjectLock(run: Run) {
  const path = join(run.project.path, projectLockName);
  const payload = JSON.stringify(
    {
      runId: run.id,
      pid: process.pid,
      acquiredAt: timestamp(),
      project: run.project.path,
    },
    null,
    2,
  );
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(payload, "utf8");
    await handle.close();
    run.lock = { path, acquiredAt: timestamp() };
    return run.lock;
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "EEXIST"
    )
      throw error;
    let existing: { runId?: string; pid?: number } | undefined;
    try {
      existing = JSON.parse(await readFile(path, "utf8")) as {
        runId?: string;
        pid?: number;
      };
    } catch {
      /* malformed locks are treated as stale */
    }
    if (existing?.pid && processIsAlive(existing.pid))
      throw new Error(
        `Project is locked by run ${existing.runId ?? "unknown"} (PID ${existing.pid}).`,
      );
    await unlink(path).catch(() => undefined);
    return acquireProjectLock(run);
  }
}

export async function releaseProjectLock(run: Run) {
  const path = run.lock?.path ?? join(run.project.path, projectLockName);
  try {
    const existing = JSON.parse(await readFile(path, "utf8")) as {
      runId?: string;
      pid?: number;
    };
    if (existing.runId === run.id && existing.pid === process.pid)
      await unlink(path);
  } catch {
    /* the lock was already removed or belongs to another process */
  }
  run.lock = undefined;
}
async function loadSettings() {
  if (existsSync(settingsFile))
    reviewSettings = {
      ...defaultReviewSettings,
      ...JSON.parse(await readFile(settingsFile, "utf8")),
    };
}
async function persistSettings() {
  await mkdir(resolve(".orchestrator"), { recursive: true });
  await writeFile(settingsFile, JSON.stringify(reviewSettings, null, 2));
}
async function loadProjects() {
  if (existsSync(projectsFile))
    savedProjects = JSON.parse(
      await readFile(projectsFile, "utf8"),
    ) as ProjectProfile[];
}
async function persistProjects() {
  await mkdir(resolve(".orchestrator"), { recursive: true });
  await writeFile(projectsFile, JSON.stringify(savedProjects, null, 2));
}

async function recoverInterruptedRuns() {
  if (!existsSync(runsDirectory)) return;
  const pausedRuns: Run[] = [];
  for (const entry of await readdir(runsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = join(runsDirectory, entry.name, "run.json");
    if (!existsSync(file)) continue;
    const run = JSON.parse(await readFile(file, "utf8")) as Run;
    if (run.status === "paused") {
      pausedRuns.push(run);
      continue;
    }
    if (run.status !== "running") continue;
    recoverRun(run);
    await persist(run);
  }
  for (const run of pausedRuns.sort((left, right) =>
    (right.startedAt || "").localeCompare(left.startedAt || ""),
  )) {
    try {
      await acquireProjectLock(run);
      activeRun = run;
      break;
    } catch {
      /* another orchestrator owns this project */
    }
  }
}

async function loadRun(id: string) {
  const file = join(runsDirectory, id, "run.json");
  if (!existsSync(file)) return undefined;
  return JSON.parse(await readFile(file, "utf8")) as Run;
}

async function listRuns() {
  if (!existsSync(runsDirectory)) return [];
  const entries = await readdir(runsDirectory, { withFileTypes: true });
  const runs = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => loadRun(entry.name)),
  );
  return runs
    .filter((run): run is Run => Boolean(run))
    .sort((left, right) =>
      (right.startedAt || "").localeCompare(left.startedAt || ""),
    );
}

function readGitStatus(cwd: string) {
  return new Promise<Set<string>>((resolveStatus) => {
    const child = spawn("git", ["status", "--porcelain=v1", "-uall"], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", () => {
      const paths = output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.slice(3).split("\\").join("/"));
      resolveStatus(new Set(paths));
    });
    child.on("error", () => resolveStatus(new Set()));
  });
}

function taskEvent(line: string) {
  try {
    const event = JSON.parse(line) as {
      type?: string;
      item?: {
        type?: string;
        text?: string;
        message?: string;
        command?: string;
        cmd?: string;
        exit_code?: number;
      };
    };
    if (event.type === "thread.started") return "AGENT: Сессия Codex создана";
    if (event.type === "turn.started") return "AGENT: Агент приступил к задаче";
    if (event.item?.type === "agent_message" && event.item.text)
      return `AGENT: ${event.item.text}`;
    if (event.item?.type === "command_execution")
      return `COMMAND: ${event.item.command ?? event.item.cmd ?? "Команда выполняется"}${event.item.exit_code === undefined ? "" : ` (exit ${event.item.exit_code})`}`;
    if (event.item?.type === "error" && event.item.message)
      return `ERROR: Codex: ${event.item.message}`;
    return undefined;
  } catch {
    if (line.startsWith("Reading additional"))
      return "AGENT: Подготовка контекста проекта";
    if (/^warning[:\s]/i.test(line)) return `WARNING: ${line}`;
    if (/^(error|fatal)[:\s]/i.test(line)) return `ERROR: ${line}`;
    return undefined;
  }
}

function markdownReport(run: Run) {
  const limits = run.limits ?? defaultLimits;
  const heading = `# Orchestrator report — ${run.project.name}\n\n`;
  const details = [
    `Run: \`${run.id}\``,
    `Status: **${run.status}**`,
    `Project: \`${run.project.path}\``,
    `Started: ${run.startedAt ?? "—"}`,
    `Finished: ${run.finishedAt ?? "—"}`,
  ].join("\n");
  const tasks = run.tasks
    .map((task, index) => {
      const meta = [
        `Status: **${task.status}**`,
        `Model: ${task.model}`,
        `Effort: ${task.effort}`,
        `Executor attempts: ${task.executionAttempts ?? 0}/${(task.maxRetries ?? limits.maxTaskRetries) + 1}`,
        `Timeout: ${task.timeoutMinutes ?? limits.taskTimeoutMinutes} min`,
        `Reviewer: ${task.reviewStatus ?? "—"}`,
      ].join("\n");
      const logs = task.log.length
        ? `\n\n## Logs\n\n\`\`\`text\n${task.log.join("\n")}\n\`\`\``
        : "";
      const output = task.finalOutput
        ? `\n\n## Codex result\n\n${task.finalOutput}`
        : "";
      const review = task.reviewOutput
        ? `\n\n## Reviewer report\n\n${task.reviewOutput}`
        : "";
      return `## ${index + 1}. ${task.title}\n\n${meta}${logs}${output}${review}`;
    })
    .join("\n\n---\n\n");
  return `${heading}${details}\n\n---\n\n${tasks}\n`;
}

export function outsideAllowedPaths(
  paths: string[],
  allowedPaths: string[] | undefined,
) {
  if (!allowedPaths?.length) return [];
  const allowed = allowedPaths.map((path) =>
    path.replace(/\\/g, "/").replace(/\/$/, ""),
  );
  return paths.filter(
    (path) =>
      !allowed.some((root) => path === root || path.startsWith(`${root}/`)),
  );
}

export function validateQueue(value: unknown): {
  project: { name: string; path: string } & ProjectSettings;
  tasks: TaskInput[];
  limits: Limits;
  git: GitSettings;
} {
  const queue = value as {
    project?: { name?: string; path?: string } & ProjectSettings;
    tasks?: unknown;
    limits?: Partial<Limits>;
    git?: Partial<GitSettings>;
  };
  if (
    !queue?.project?.path ||
    !Array.isArray(queue.tasks) ||
    queue.tasks.length === 0
  )
    throw new Error("Queue must include project.path and at least one task.");
  const project = queue.project;
  const projectPath = resolve(project.path!);
  if (!existsSync(projectPath))
    throw new Error(`Project path does not exist: ${projectPath}`);
  const limits = { ...defaultLimits, ...queue.limits };
  if (
    !Number.isInteger(limits.taskTimeoutMinutes) ||
    limits.taskTimeoutMinutes < 1 ||
    limits.taskTimeoutMinutes > 240
  )
    throw new Error(
      "limits.taskTimeoutMinutes must be an integer from 1 to 240.",
    );
  if (
    !Number.isInteger(limits.reviewerTimeoutMinutes) ||
    limits.reviewerTimeoutMinutes < 1 ||
    limits.reviewerTimeoutMinutes > 60
  )
    throw new Error(
      "limits.reviewerTimeoutMinutes must be an integer from 1 to 60.",
    );
  if (
    !Number.isInteger(limits.maxTaskRetries) ||
    limits.maxTaskRetries < 0 ||
    limits.maxTaskRetries > 3
  )
    throw new Error("limits.maxTaskRetries must be an integer from 0 to 3.");
  if (
    queue.git?.checkpointCommits !== undefined &&
    typeof queue.git.checkpointCommits !== "boolean"
  )
    throw new Error("git.checkpointCommits must be true or false.");
  const tasks = queue.tasks.map((candidate, index) => {
    const task = candidate as TaskInput;
    const model = task.model ?? project.defaultModel ?? "terra";
    const effort = task.effort ?? project.defaultEffort ?? "medium";
    if (!task.title || !task.prompt)
      throw new Error(`Task ${index + 1} needs title and prompt.`);
    if (!Object.hasOwn(MODEL_IDS, model))
      throw new Error(`Task ${index + 1}: unsupported model.`);
    if (project.allowedModels?.length && !project.allowedModels.includes(model))
      throw new Error(
        `Task ${index + 1}: model is not enabled for this project.`,
      );
    if (!["light", "medium", "high"].includes(effort))
      throw new Error(`Task ${index + 1}: unsupported effort.`);
    if (model === "sol" && effort === "high")
      throw new Error(
        `Task ${index + 1}: Sol with high effort is disabled in MVP.`,
      );
    if (
      task.timeoutMinutes !== undefined &&
      (!Number.isInteger(task.timeoutMinutes) ||
        task.timeoutMinutes < 1 ||
        task.timeoutMinutes > 240)
    )
      throw new Error(
        `Task ${index + 1}: timeoutMinutes must be an integer from 1 to 240.`,
      );
    if (
      task.maxRetries !== undefined &&
      (!Number.isInteger(task.maxRetries) ||
        task.maxRetries < 0 ||
        task.maxRetries > 3)
    )
      throw new Error(
        `Task ${index + 1}: maxRetries must be an integer from 0 to 3.`,
      );
    return { ...task, model, effort };
  });
  const verificationCommands =
    project.verificationCommands?.filter(Boolean) ?? [];
  return {
    project: {
      name: project.name || projectPath.split(/[\\/]/).pop() || "Project",
      path: projectPath,
      profileId: project.profileId,
      verificationCommands,
      defaultModel: project.defaultModel,
      defaultEffort: project.defaultEffort,
      allowedModels: project.allowedModels,
    },
    tasks,
    limits,
    git: { ...defaultGitSettings, ...queue.git },
  };
}

export function resolveTaskStatus({
  cancelled,
  skipped,
  exitCode,
  timedOut,
  violations,
}: {
  cancelled: boolean;
  skipped: boolean;
  exitCode: number;
  timedOut: boolean;
  violations: string[];
}): Status {
  if (cancelled) return "cancelled";
  if (skipped) return "skipped";
  if (timedOut) return "timed_out";
  return exitCode === 0 && violations.length === 0 ? "completed" : "failed";
}

export function recoverRun(run: Run) {
  if (run.status !== "running") return run;
  const task = run.tasks.find((candidate) => candidate.status === "running");
  if (task) {
    task.status = "failed";
    task.finishedAt = timestamp();
    task.exitCode = 1;
    task.log.push(
      `[${task.finishedAt}] Orchestrator process ended before Codex returned a result.`,
    );
  }
  run.status = "failed";
  run.finishedAt = timestamp();
  return run;
}

export function retryRun(source: Run, task: Task): Run {
  return {
    id: identifier(),
    project: source.project,
    status: "idle",
    review: { ...reviewSettings },
    limits: source.limits ?? defaultLimits,
    git: source.git ?? defaultGitSettings,
    tasks: [
      {
        ...task,
        id: identifier(),
        status: "pending",
        log: [],
        startedAt: undefined,
        finishedAt: undefined,
        exitCode: undefined,
        timedOut: undefined,
        changedFiles: undefined,
        diff: undefined,
        finalOutput: undefined,
        reviewStatus: undefined,
        reviewOutput: undefined,
        attempts: undefined,
        executionAttempts: undefined,
        checkpoint: undefined,
      },
    ],
  };
}

export function resumeRun(source: Run): Run | undefined {
  const firstIncomplete = source.tasks.findIndex(
    (task) => task.status !== "completed",
  );
  if (firstIncomplete < 0) return undefined;
  const remaining = source.tasks
    .slice(firstIncomplete)
    .map((task) => ({
      ...task,
      id: identifier(),
      status: "pending" as Status,
      log: [`Возобновлено из run ${source.id}`],
      startedAt: undefined,
      finishedAt: undefined,
      exitCode: undefined,
      timedOut: undefined,
      changedFiles: undefined,
      diff: undefined,
      finalOutput: undefined,
      reviewStatus: undefined,
      reviewOutput: undefined,
      attempts: undefined,
      executionAttempts: undefined,
      checkpoint: undefined,
    }));
  return {
    id: identifier(),
    project: source.project,
    status: "idle",
    review: { ...reviewSettings },
    limits: source.limits ?? defaultLimits,
    git: source.git ?? defaultGitSettings,
    tasks: remaining,
  };
}

async function waitForProcess(
  child: ReturnType<typeof spawn>,
  timeoutMinutes: number,
  onTimeout: () => void,
) {
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    onTimeout();
    child.kill();
  }, timeoutMinutes * 60_000);
  const exitCode = await new Promise<number>((done) => {
    child.on("close", (code) => done(code ?? 1));
    child.on("error", () => done(1));
  });
  clearTimeout(timer);
  return { exitCode, timedOut };
}

async function commandSucceeds(command: string, args: string[], cwd?: string) {
  return new Promise<boolean>((done) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd,
        shell: false,
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      done(false);
      return;
    }
    child.on("close", (code) => done(code === 0));
    child.on("error", () => done(false));
  });
}

async function runGit(cwd: string, args: string[]) {
  return new Promise<{ code: number; output: string }>((done) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", args, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      done({ code: 1, output: "Could not start git." });
      return;
    }
    let output = "";
    const consume = (chunk: Buffer) => {
      output += chunk.toString();
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    child.on("close", (code) =>
      done({ code: code ?? 1, output: output.trim() }),
    );
    child.on("error", (error) => done({ code: 1, output: error.message }));
  });
}

async function createCheckpoint(run: Run, task: Task) {
  if (!run.git?.checkpointCommits || !task.changedFiles?.length) return;
  const message = `orchestrator: ${task.title}`.slice(0, 200);
  const stage = await runGit(run.project.path, [
    "add",
    "--",
    ...task.changedFiles,
  ]);
  if (stage.code !== 0) {
    task.log.push(`Checkpoint не создан: git add: ${stage.output || "ошибка"}`);
    return;
  }
  const commit = await runGit(run.project.path, [
    "commit",
    "--only",
    "-m",
    message,
    "--",
    ...task.changedFiles,
  ]);
  if (commit.code !== 0) {
    task.log.push(
      `Checkpoint не создан: ${commit.output || "нет изменений для commit"}`,
    );
    return;
  }
  const head = await runGit(run.project.path, ["rev-parse", "HEAD"]);
  if (head.code !== 0) {
    task.log.push("Checkpoint создан, но hash не получен.");
    return;
  }
  task.checkpoint = { hash: head.output, message, createdAt: timestamp() };
  task.log.push(`Checkpoint создан: ${task.checkpoint.hash.slice(0, 8)}`);
}

async function readGitDiff(cwd: string, paths: string[]) {
  if (!paths.length) return "";
  return new Promise<string>((done) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn("git", ["diff", "--no-ext-diff", "--", ...paths], {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      done("");
      return;
    }
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("close", () => done(output.slice(0, 100_000)));
    child.on("error", () => done(""));
  });
}

async function preflight(value: unknown) {
  const queue = validateQueue(value);
  const cli = await commandSucceeds(codexBin(), ["exec", "--help"]);
  const git = await commandSucceeds(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    queue.project.path,
  );
  const agentsPath = join(queue.project.path, "AGENTS.md");
  const packageFile = join(queue.project.path, "package.json");
  const scripts = existsSync(packageFile)
    ? ((
        JSON.parse(await readFile(packageFile, "utf8")) as {
          scripts?: Record<string, string>;
        }
      ).scripts ?? {})
    : {};
  const checks = queue.tasks.flatMap((task, index) => {
    const modelOk = Object.hasOwn(MODEL_IDS, task.model ?? "terra");
    return [
      {
        name: `Task ${index + 1} model`,
        ok: modelOk,
        detail: task.model ?? "terra",
      },
    ];
  });
  const result = {
    ok: cli && git && checks.every((check) => check.ok),
    checks: [
      { name: "Codex CLI", ok: cli, detail: codexBin() },
      { name: "Git repository", ok: git, detail: queue.project.path },
      {
        name: "AGENTS.md",
        ok: existsSync(agentsPath),
        detail: existsSync(agentsPath) ? "Found" : "Optional but recommended",
      },
      {
        name: "Test commands",
        ok: true,
        detail:
          queue.project.verificationCommands?.join(" · ") ||
          Object.keys(scripts)
            .filter((name) => /test|lint|typecheck|check/i.test(name))
            .join(", ") ||
          "No package scripts found",
      },
      ...checks,
    ],
  };
  return result;
}

function buildPrompt(task: Task, project: ProjectSettings) {
  const paths = task.allowedPaths?.length
    ? `\nAllowed paths: ${task.allowedPaths.join(", ")}`
    : "";
  const checks = project.verificationCommands?.length
    ? `\n- Run these project verification commands when relevant:\n${project.verificationCommands.map((command) => `  - ${command}`).join("\n")}`
    : "\n- Run relevant verification commands.";
  return `Work on this single task in the current repository.\n\nTask: ${task.prompt}${paths}\n\nRequirements:\n- Read repository instructions, especially AGENTS.md, before changing code.\n- Keep changes within the task scope.${checks}\n- Do not create git commits.\n- Finish with changed files, checks run, and remaining risks.`;
}

async function reviewTask(run: Run, task: Task) {
  if (!run.review.enabled) {
    task.reviewStatus = "approved";
    task.log.push("Reviewer отключён в настройках");
    return;
  }
  task.reviewStatus = "pending";
  task.log.push("Запущена независимая проверка reviewer");
  await persist(run);
  publish("run", run);
  const outputFile = join(runsDirectory, run.id, `${task.id}-review.md`);
  const prompt = `Review the current git diff for this completed task. Do not edit files.\n\nTask: ${task.title}\nScope: ${task.prompt}\n\nCheck correctness, scope, allowed paths, and whether relevant verification was run. End with exactly one line: VERDICT: APPROVED or VERDICT: CHANGES_REQUESTED. Then list concise findings.`;
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      codexBin(),
      [
        "exec",
        "--ephemeral",
        "--cd",
        run.project.path,
        "--model",
        MODEL_IDS[run.review.model],
        "-c",
        `model_reasoning_effort=\"${run.review.effort}\"`,
        "--output-last-message",
        outputFile,
        prompt,
      ],
      {
        cwd: run.project.path,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    task.reviewStatus = "unavailable";
    task.log.push(
      `Reviewer unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }
  const { exitCode, timedOut } = await waitForProcess(
    child,
    run.limits.reviewerTimeoutMinutes,
    () =>
      task.log.push(
        `Reviewer превысил лимит ${run.limits.reviewerTimeoutMinutes} мин. и был остановлен.`,
      ),
  );
  task.reviewOutput = existsSync(outputFile)
    ? (await readFile(outputFile, "utf8")).slice(0, 24_000)
    : "Reviewer did not return a report.";
  task.reviewStatus = timedOut
    ? "timed_out"
    : exitCode === 0 && /VERDICT:\s*APPROVED/i.test(task.reviewOutput)
      ? "approved"
      : exitCode === 0
        ? "changes_requested"
        : "unavailable";
  task.log.push(
    task.reviewStatus === "approved"
      ? "Reviewer: одобрено"
      : `Reviewer: ${task.reviewStatus}`,
  );
}

async function correctTask(run: Run, task: Task) {
  task.attempts = (task.attempts ?? 1) + 1;
  task.log.push(
    `Автоисправление по замечаниям reviewer (попытка ${task.attempts}/${run.review.maxCorrections + 1})`,
  );
  await persist(run);
  publish("run", run);
  const outputFile = join(
    runsDirectory,
    run.id,
    `${task.id}-fix-${task.attempts}.md`,
  );
  const prompt = `${buildPrompt(task, run.project)}\n\nReviewer found these issues:\n${task.reviewOutput ?? "No report available."}\n\nFix only the reviewer findings. Do not create a git commit.`;
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      codexBin(),
      [
        "exec",
        "--ephemeral",
        "--json",
        "--cd",
        run.project.path,
        "--model",
        MODEL_IDS[task.model],
        "-c",
        `model_reasoning_effort=\"${task.effort}\"`,
        "--output-last-message",
        outputFile,
        prompt,
      ],
      {
        cwd: run.project.path,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    task.log.push(
      `Автоисправление не запущено: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { code: 1, timedOut: false };
  }
  activeProcess = child;
  const { exitCode: code, timedOut } = await waitForProcess(
    child,
    task.timeoutMinutes ?? run.limits.taskTimeoutMinutes,
    () =>
      task.log.push(
        `Автоисправление превысило лимит ${task.timeoutMinutes ?? run.limits.taskTimeoutMinutes} мин. и было остановлено.`,
      ),
  );
  activeProcess = undefined;
  if (existsSync(outputFile))
    task.finalOutput = (await readFile(outputFile, "utf8")).slice(0, 24_000);
  task.log.push(
    code === 0
      ? "Автоисправление завершено"
      : "Автоисправление завершилось ошибкой",
  );
  return { code, timedOut };
}

async function pauseBeforeNextTask(run: Run) {
  if (!run.pauseRequested || isCancelled(run)) return;
  run.status = "paused";
  run.pausedAt = timestamp();
  lastSettledTask(run)?.log.push("Очередь приостановлена между задачами.");
  const resumed = new Promise<void>((done) => {
    resumePausedRun = done;
  });
  await persist(run);
  publish("run", run);
  await resumed;
}

async function executeQueue(run: Run) {
  run.status = "running";
  run.startedAt ??= timestamp();
  run.pausedAt = undefined;
  await persist(run);
  publish("run", run);
  for (const task of run.tasks) {
    if (isCancelled(run)) break;
    await pauseBeforeNextTask(run);
    if (isCancelled(run)) break;
    if (task.status !== "pending") continue;
    const baseline = await readGitStatus(run.project.path);
    task.status = "running";
    task.startedAt = timestamp();
    task.attempts = 1;
    task.executionAttempts = 0;
    task.timedOut = false;
    task.log.push(`Запущено: ${task.model} / ${task.effort}`);
    await persist(run);
    publish("run", run);
    const outputFile = join(runsDirectory, run.id, `${task.id}-final.md`);
    const args = [
      "exec",
      "--ephemeral",
      "--json",
      "--cd",
      run.project.path,
      "--model",
      MODEL_IDS[task.model],
      "-c",
      `model_reasoning_effort=\"${task.effort}\"`,
      "--output-last-message",
      outputFile,
      buildPrompt(task, run.project),
    ];
    const maxRetries = task.maxRetries ?? run.limits.maxTaskRetries;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      task.executionAttempts = attempt;
      task.log.push(
        `Запуск исполнителя ${attempt}/${maxRetries + 1} · лимит ${task.timeoutMinutes ?? run.limits.taskTimeoutMinutes} мин.`,
      );
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(codexBin(), args, {
          cwd: run.project.path,
          shell: false,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        task.exitCode = 1;
        task.log.push(
          `Could not start Codex CLI: ${error instanceof Error ? error.message : String(error)}`,
        );
        break;
      }
      activeProcess = child;
      const consume = (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          const readable = line.trim() && taskEvent(line.trim());
          if (readable) task.log.push(readable.slice(0, 1600));
        }
        publish("log", {
          runId: run.id,
          taskId: task.id,
          lines: task.log.slice(-8),
        });
      };
      child.stdout?.on("data", consume);
      child.stderr?.on("data", consume);
      const result = await waitForProcess(
        child,
        task.timeoutMinutes ?? run.limits.taskTimeoutMinutes,
        () =>
          task.log.push(
            `Задача превысила лимит ${task.timeoutMinutes ?? run.limits.taskTimeoutMinutes} мин. и была остановлена.`,
          ),
      );
      activeProcess = undefined;
      task.exitCode = result.exitCode;
      task.timedOut ||= result.timedOut;
      if (task.exitCode === 0 || isCancelled(run) || skippedTaskId === task.id)
        break;
      if (attempt <= maxRetries)
        task.log.push(
          `Попытка ${attempt} завершилась с ошибкой; повторный запуск.`,
        );
    }
    task.finishedAt = timestamp();
    if (existsSync(outputFile))
      task.finalOutput = (await readFile(outputFile, "utf8")).slice(0, 24_000);
    const changed = await readGitStatus(run.project.path);
    task.changedFiles = [...changed].filter((path) => !baseline.has(path));
    task.diff = await readGitDiff(run.project.path, task.changedFiles);
    const violations = outsideAllowedPaths(
      task.changedFiles,
      task.allowedPaths,
    );
    if (violations.length)
      task.log.push(
        `Остановка: изменены файлы вне allowedPaths — ${violations.join(", ")}`,
      );
    task.status = resolveTaskStatus({
      cancelled: isCancelled(run),
      skipped: skippedTaskId === task.id,
      exitCode: task.exitCode ?? 1,
      timedOut: Boolean(task.timedOut),
      violations,
    });
    if (task.status === "skipped") {
      task.log.push("Пропущено пользователем");
      skippedTaskId = undefined;
    }
    if (task.status === "completed") {
      await reviewTask(run, task);
      if (
        task.reviewStatus === "changes_requested" &&
        (task.attempts ?? 1) <= run.review.maxCorrections &&
        !isCancelled(run)
      ) {
        const fixResult = await correctTask(run, task);
        if (fixResult.timedOut) task.status = "timed_out";
        else if (fixResult.code === 0 && !isCancelled(run))
          await reviewTask(run, task);
      }
      if (task.reviewStatus === "timed_out") task.status = "timed_out";
      else if (
        task.reviewStatus === "changes_requested" ||
        task.reviewStatus === "unavailable"
      )
        task.status = "failed";
    }
    if (task.status === "completed") await createCheckpoint(run, task);
    await persist(run);
    publish("run", run);
    if (task.status === "failed" || task.status === "timed_out") {
      run.status = task.status === "timed_out" ? "timed_out" : "failed";
      break;
    }
  }
  if (run.status === "running") run.status = "completed";
  run.finishedAt = timestamp();
  await persist(run);
  publish("run", run);
}

async function execute(run: Run) {
  try {
    await executeQueue(run);
  } finally {
    await releaseProjectLock(run);
    await persist(run);
    publish("run", run);
  }
}

function normalizeProjectProfile(
  value: unknown,
  id = identifier(),
): ProjectProfile {
  const input = value as Partial<ProjectProfile>;
  const path = input.path ? resolve(input.path) : "";
  const allowedModels = input.allowedModels?.filter((model): model is Model =>
    Object.hasOwn(MODEL_IDS, model),
  ) ?? ["luna", "terra", "sol"];
  if (!input.name?.trim() || !path || !existsSync(path))
    throw new Error("Project name and an existing path are required.");
  if (!Object.hasOwn(MODEL_IDS, input.defaultModel ?? "terra"))
    throw new Error("Invalid default model.");
  if (!["light", "medium", "high"].includes(input.defaultEffort ?? "medium"))
    throw new Error("Invalid default effort.");
  if (
    !allowedModels.length ||
    !allowedModels.includes(input.defaultModel ?? "terra")
  )
    throw new Error("Default model must be enabled for the project.");
  return {
    id,
    name: input.name.trim(),
    path,
    verificationCommands: (input.verificationCommands ?? [])
      .map((command) => command.trim())
      .filter(Boolean),
    defaultModel: input.defaultModel ?? "terra",
    defaultEffort: input.defaultEffort ?? "medium",
    allowedModels,
  };
}

const app = express();
app.use(express.json({ limit: "64kb" }));
app.use(
  express.text({
    type: ["application/yaml", "text/yaml", "text/plain"],
    limit: "1mb",
  }),
);
app.get("/api/health", (_, response) =>
  response.json({ ok: true, codexBin: codexBin(), cliModelIds: MODEL_IDS }),
);
app.get("/api/run", (_, response) => response.json(activeRun ?? null));
app.get("/api/projects", (_, response) => response.json(savedProjects));
app.post("/api/projects", async (request, response) => {
  try {
    const profile = normalizeProjectProfile(request.body);
    savedProjects.push(profile);
    await persistProjects();
    return response.status(201).json(profile);
  } catch (error) {
    return response
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Invalid project profile.",
      });
  }
});
app.put("/api/projects/:id", async (request, response) => {
  const index = savedProjects.findIndex(
    (project) => project.id === request.params.id,
  );
  if (index < 0)
    return response.status(404).json({ error: "Project profile not found." });
  try {
    const profile = normalizeProjectProfile(request.body, request.params.id);
    savedProjects[index] = profile;
    await persistProjects();
    return response.json(profile);
  } catch (error) {
    return response
      .status(400)
      .json({
        error:
          error instanceof Error ? error.message : "Invalid project profile.",
      });
  }
});
app.delete("/api/projects/:id", async (request, response) => {
  const before = savedProjects.length;
  savedProjects = savedProjects.filter(
    (project) => project.id !== request.params.id,
  );
  if (savedProjects.length === before)
    return response.status(404).json({ error: "Project profile not found." });
  await persistProjects();
  return response.status(204).end();
});
app.get("/api/settings", (_, response) => response.json(reviewSettings));
app.put("/api/settings", async (request, response) => {
  const next = request.body as Partial<ReviewSettings>;
  if (
    !Object.hasOwn(MODEL_IDS, next.model ?? reviewSettings.model) ||
    !["light", "medium", "high"].includes(
      next.effort ?? reviewSettings.effort,
    ) ||
    !Number.isInteger(next.maxCorrections ?? reviewSettings.maxCorrections) ||
    (next.maxCorrections ?? reviewSettings.maxCorrections) < 0 ||
    (next.maxCorrections ?? reviewSettings.maxCorrections) > 3
  )
    return response.status(400).json({ error: "Invalid reviewer settings." });
  reviewSettings = { ...reviewSettings, ...next };
  await persistSettings();
  return response.json(reviewSettings);
});
app.get("/api/runs", async (_, response) => response.json(await listRuns()));
app.get("/api/runs/:id", async (request, response) => {
  const run = await loadRun(request.params.id);
  return run
    ? response.json(run)
    : response.status(404).json({ error: "Run not found." });
});
app.get("/api/runs/:id/report", async (request, response) => {
  const run =
    activeRun?.id === request.params.id
      ? activeRun
      : await loadRun(request.params.id);
  if (!run) return response.status(404).json({ error: "Run not found." });
  response.type("text/markdown");
  response.attachment(`orchestrator-${run.id}-report.md`);
  return response.send(markdownReport(run));
});
app.get("/api/runs/:runId/tasks/:taskId/diff", async (request, response) => {
  const run = await loadRun(request.params.runId);
  const task = run?.tasks.find(
    (candidate) => candidate.id === request.params.taskId,
  );
  if (!run || !task)
    return response.status(404).json({ error: "Task not found." });
  const file =
    typeof request.query.file === "string" ? request.query.file : undefined;
  return response.json({
    files: task.changedFiles ?? [],
    diff: file
      ? await readGitDiff(run.project.path, [file])
      : (task.diff ?? ""),
  });
});
app.post(
  "/api/runs/:runId/checkpoints/:taskId/rollback",
  async (request, response) => {
    if (activeRun?.status === "running" || activeRun?.status === "paused")
      return response
        .status(409)
        .json({ error: "Pause or finish the active run before rolling back." });
    if ((request.body as { confirm?: boolean } | undefined)?.confirm !== true)
      return response
        .status(400)
        .json({ error: "Rollback requires explicit confirmation." });
    const run = await loadRun(request.params.runId);
    const task = run?.tasks.find(
      (candidate) => candidate.id === request.params.taskId,
    );
    if (!run || !task?.checkpoint)
      return response.status(404).json({ error: "Checkpoint not found." });
    const status = await runGit(run.project.path, ["status", "--porcelain=v1"]);
    if (status.code !== 0)
      return response
        .status(409)
        .json({ error: status.output || "Could not read git status." });
    if (status.output)
      return response
        .status(409)
        .json({
          error:
            "Working tree is not clean. Commit or stash changes before rollback.",
        });
    const reset = await runGit(run.project.path, [
      "reset",
      "--hard",
      task.checkpoint.hash,
    ]);
    if (reset.code !== 0)
      return response
        .status(500)
        .json({ error: reset.output || "Git reset failed." });
    return response.json({ ok: true, checkpoint: task.checkpoint });
  },
);
app.get("/api/events", (request, response) => {
  response.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  response.flushHeaders();
  subscribers.add(response);
  if (activeRun)
    response.write(`event: run\ndata: ${JSON.stringify(activeRun)}\n\n`);
  request.on("close", () => subscribers.delete(response));
});
app.post("/api/preflight", async (request, response) => {
  try {
    const result = await preflight(
      typeof request.body === "string" ? parse(request.body) : request.body,
    );
    return response.json(result);
  } catch (error) {
    return response
      .status(400)
      .json({
        ok: false,
        checks: [
          {
            name: "YAML queue",
            ok: false,
            detail: error instanceof Error ? error.message : "Invalid queue",
          },
        ],
      });
  }
});
app.post("/api/runs", async (request, response) => {
  try {
    if (activeRun?.status === "running" || activeRun?.status === "paused")
      return response.status(409).json({ error: "A run is already active." });
    const queue = validateQueue(
      typeof request.body === "string" ? parse(request.body) : request.body,
    );
    const run: Run = {
      id: identifier(),
      project: queue.project,
      status: "idle",
      review: { ...reviewSettings },
      limits: queue.limits,
      git: queue.git,
      tasks: queue.tasks.map((task) => ({
        ...task,
        model: task.model!,
        effort: task.effort!,
        id: identifier(),
        status: "pending",
        log: [],
      })),
    };
    try {
      await acquireProjectLock(run);
    } catch (error) {
      return response
        .status(409)
        .json({
          error: error instanceof Error ? error.message : "Project is locked.",
        });
    }
    activeRun = run;
    void execute(run);
    response.status(201).json(run);
  } catch (error) {
    response
      .status(400)
      .json({
        error: error instanceof Error ? error.message : "Invalid queue.",
      });
  }
});
app.post("/api/pause", async (_, response) => {
  if (!activeRun || activeRun.status !== "running")
    return response.status(409).json({ error: "No running queue to pause." });
  activeRun.pauseRequested = true;
  const task =
    activeRun.tasks.find((candidate) => candidate.status === "running") ??
    lastSettledTask(activeRun);
  task?.log.push(
    "Пауза запрошена: текущая задача завершится, затем очередь остановится.",
  );
  await persist(activeRun);
  publish("run", activeRun);
  return response.json(activeRun);
});
app.post("/api/continue", async (_, response) => {
  if (!activeRun || activeRun.status !== "paused")
    return response.status(409).json({ error: "No paused queue to continue." });
  activeRun.status = "running";
  activeRun.pauseRequested = false;
  activeRun.pausedAt = undefined;
  lastSettledTask(activeRun)?.log.push("Очередь продолжена.");
  const resume = resumePausedRun;
  resumePausedRun = undefined;
  await persist(activeRun);
  publish("run", activeRun);
  if (resume) resume();
  else void execute(activeRun);
  return response.json(activeRun);
});
app.post("/api/cancel", async (_, response) => {
  if (
    !activeRun ||
    (activeRun.status !== "running" && activeRun.status !== "paused")
  )
    return response.status(409).json({ error: "No active run." });
  activeRun.status = "cancelled";
  activeRun.pauseRequested = false;
  const task = activeRun.tasks.find(
    (candidate) => candidate.status === "running",
  );
  if (task) {
    task.status = "cancelled";
    task.finishedAt = timestamp();
    task.log.push("Отменено пользователем");
  }
  activeProcess?.kill();
  const resume = resumePausedRun;
  resumePausedRun = undefined;
  await persist(activeRun);
  publish("run", activeRun);
  resume?.();
  response.json(activeRun);
});
app.post("/api/skip", async (_, response) => {
  if (!activeRun || activeRun.status !== "running" || !activeProcess)
    return response
      .status(409)
      .json({ error: "No task is currently running." });
  const task = activeRun.tasks.find(
    (candidate) => candidate.status === "running",
  );
  if (!task)
    return response
      .status(409)
      .json({ error: "No task is currently running." });
  skippedTaskId = task.id;
  task.log.push("Запрошен пропуск задачи");
  activeProcess.kill();
  await persist(activeRun);
  publish("run", activeRun);
  return response.json(activeRun);
});
app.post("/api/runs/:runId/tasks/:taskId/retry", async (request, response) => {
  if (activeRun?.status === "running" || activeRun?.status === "paused")
    return response.status(409).json({ error: "A run is already active." });
  const source = await loadRun(request.params.runId);
  const task = source?.tasks.find(
    (candidate) => candidate.id === request.params.taskId,
  );
  if (!source || !task)
    return response.status(404).json({ error: "Task not found." });
  const retry = retryRun(source, task);
  try {
    await acquireProjectLock(retry);
  } catch (error) {
    return response
      .status(409)
      .json({
        error: error instanceof Error ? error.message : "Project is locked.",
      });
  }
  activeRun = retry;
  void execute(retry);
  return response.status(201).json(retry);
});
app.post("/api/runs/:id/resume", async (request, response) => {
  if (activeRun?.status === "running" || activeRun?.status === "paused")
    return response.status(409).json({ error: "A run is already active." });
  const source = await loadRun(request.params.id);
  if (!source) return response.status(404).json({ error: "Run not found." });
  const resumed = resumeRun(source);
  if (!resumed)
    return response
      .status(409)
      .json({ error: "All tasks in this run are already complete." });
  try {
    await acquireProjectLock(resumed);
  } catch (error) {
    return response
      .status(409)
      .json({
        error: error instanceof Error ? error.message : "Project is locked.",
      });
  }
  activeRun = resumed;
  void execute(resumed);
  return response.status(201).json(resumed);
});
app.use(express.static(resolve("dist")));
app.get("/{*splat}", async (_, response) => {
  const index = resolve("dist/index.html");
  if (existsSync(index)) return response.sendFile(index);
  return response.status(404).send("Run npm run dev for the Vite dashboard.");
});

const port = Number(process.env.PORT || 4318);
if (process.env.ORCHESTRATOR_TEST !== "1") {
  void Promise.all([
    recoverInterruptedRuns(),
    loadSettings(),
    loadProjects(),
  ]).then(() =>
    app.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`Orchestrator on ${url}`);
      if (process.env.ORCHESTRATOR_NO_OPEN !== "1") {
        if (process.platform === "win32")
          spawn("cmd", ["/c", "start", "", url], {
            detached: true,
            stdio: "ignore",
          }).unref();
        else if (process.platform === "darwin")
          spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
        else
          spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
      }
    }),
  );
}
