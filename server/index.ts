import express from "express";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "yaml";

type Model = "luna" | "terra" | "sol";
type Effort = "light" | "medium" | "high";
type Status = "pending" | "running" | "completed" | "failed" | "cancelled";
type TaskInput = { title: string; prompt: string; model?: Model; effort?: Effort; allowedPaths?: string[] };
type Task = TaskInput & { id: string; model: Model; effort: Effort; status: Status; startedAt?: string; finishedAt?: string; exitCode?: number; log: string[] };
type Run = { id: string; project: { name: string; path: string }; status: "idle" | "running" | "completed" | "failed" | "cancelled"; startedAt?: string; finishedAt?: string; tasks: Task[] };

const MODEL_IDS: Record<Model, string> = { luna: "gpt-5.6-luna", terra: "gpt-5.6-terra", sol: "gpt-5.6" };
const runsDirectory = resolve(".orchestrator", "runs");
let activeRun: Run | undefined;
let activeProcess: ReturnType<typeof spawn> | undefined;
const subscribers = new Set<express.Response>();

const timestamp = () => new Date().toISOString();
const identifier = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const isCancelled = (run: Run) => run.status === "cancelled";

function publish(event: string, data: unknown) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  subscribers.forEach((response) => response.write(message));
}

async function persist(run: Run) {
  await mkdir(join(runsDirectory, run.id), { recursive: true });
  await writeFile(join(runsDirectory, run.id, "run.json"), JSON.stringify(run, null, 2));
}

function validateQueue(value: unknown): { project: { name: string; path: string }; tasks: TaskInput[] } {
  const queue = value as { project?: { name?: string; path?: string }; tasks?: unknown };
  if (!queue?.project?.path || !Array.isArray(queue.tasks) || queue.tasks.length === 0) throw new Error("Queue must include project.path and at least one task.");
  const projectPath = resolve(queue.project.path);
  if (!existsSync(projectPath)) throw new Error(`Project path does not exist: ${projectPath}`);
  const tasks = queue.tasks.map((candidate, index) => {
    const task = candidate as TaskInput;
    const model = task.model ?? "terra";
    const effort = task.effort ?? "medium";
    if (!task.title || !task.prompt) throw new Error(`Task ${index + 1} needs title and prompt.`);
    if (!Object.hasOwn(MODEL_IDS, model)) throw new Error(`Task ${index + 1}: unsupported model.`);
    if (!["light", "medium", "high"].includes(effort)) throw new Error(`Task ${index + 1}: unsupported effort.`);
    if (model === "sol" && effort === "high") throw new Error(`Task ${index + 1}: Sol with high effort is disabled in MVP.`);
    return { ...task, model, effort };
  });
  return { project: { name: queue.project.name || projectPath.split(/[\\/]/).pop() || "Project", path: projectPath }, tasks };
}

function buildPrompt(task: Task) {
  const paths = task.allowedPaths?.length ? `\nAllowed paths: ${task.allowedPaths.join(", ")}` : "";
  return `Work on this single task in the current repository.\n\nTask: ${task.prompt}${paths}\n\nRequirements:\n- Read repository instructions, especially AGENTS.md, before changing code.\n- Keep changes within the task scope.\n- Run relevant verification commands.\n- Do not create git commits.\n- Finish with changed files, checks run, and remaining risks.`;
}

async function execute(run: Run) {
  run.status = "running"; run.startedAt = timestamp(); await persist(run); publish("run", run);
  for (const task of run.tasks) {
    if (isCancelled(run)) break;
    task.status = "running"; task.startedAt = timestamp(); task.log.push(`[${task.startedAt}] Started with ${task.model}/${task.effort}`);
    await persist(run); publish("run", run);
    const args = ["exec", "--ephemeral", "--json", "--cd", run.project.path, "--model", MODEL_IDS[task.model], "-c", `model_reasoning_effort=\"${task.effort}\"`, buildPrompt(task)];
    // `codex.exe` is directly executable on Windows. Keeping shell disabled prevents
    // task text from being interpreted as shell syntax.
    const child = spawn("codex", args, { cwd: run.project.path, shell: false });
    activeProcess = child;
    await new Promise<void>((done) => {
      const consume = (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) if (line.trim()) task.log.push(line.slice(0, 1600));
        publish("log", { runId: run.id, taskId: task.id, lines: task.log.slice(-8) });
      };
      child.stdout?.on("data", consume); child.stderr?.on("data", consume);
      child.on("close", (code) => { task.exitCode = code ?? 1; done(); });
      child.on("error", (error) => { task.log.push(error.message); task.exitCode = 1; done(); });
    });
    activeProcess = undefined;
    task.finishedAt = timestamp();
    task.status = isCancelled(run) ? "cancelled" : task.exitCode === 0 ? "completed" : "failed";
    await persist(run); publish("run", run);
    if (task.status === "failed") { run.status = "failed"; break; }
  }
  if (run.status === "running") run.status = "completed";
  run.finishedAt = timestamp(); await persist(run); publish("run", run);
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (_, response) => response.json({ ok: true, cliModelIds: MODEL_IDS }));
app.get("/api/run", (_, response) => response.json(activeRun ?? null));
app.get("/api/events", (request, response) => {
  response.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); response.flushHeaders();
  subscribers.add(response); if (activeRun) response.write(`event: run\ndata: ${JSON.stringify(activeRun)}\n\n`);
  request.on("close", () => subscribers.delete(response));
});
app.post("/api/runs", async (request, response) => {
  try {
    if (activeRun?.status === "running") return response.status(409).json({ error: "A run is already active." });
    const queue = validateQueue(request.body);
    const run: Run = { id: identifier(), project: queue.project, status: "idle", tasks: queue.tasks.map((task) => ({ ...task, model: task.model!, effort: task.effort!, id: identifier(), status: "pending", log: [] })) };
    activeRun = run; void execute(run); response.status(201).json(run);
  } catch (error) { response.status(400).json({ error: error instanceof Error ? error.message : "Invalid queue." }); }
});
app.post("/api/cancel", async (_, response) => {
  if (!activeRun || activeRun.status !== "running") return response.status(409).json({ error: "No active run." });
  activeRun.status = "cancelled"; activeProcess?.kill(); await persist(activeRun); publish("run", activeRun); response.json(activeRun);
});
app.use(express.static(resolve("dist")));
app.get("/{*splat}", async (_, response) => {
  const index = resolve("dist/index.html");
  if (existsSync(index)) return response.sendFile(index);
  return response.status(404).send("Run npm run dev for the Vite dashboard.");
});

const port = Number(process.env.PORT || 4318);
app.listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`Orchestrator on ${url}`);
  if (process.env.ORCHESTRATOR_NO_OPEN !== "1") {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
});
