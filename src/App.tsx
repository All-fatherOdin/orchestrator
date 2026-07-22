import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { parse, stringify } from "yaml";
import { UsagePage } from "./UsagePage";
import { GoalBuddyPage } from "./GoalBuddyPage";

type Status =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "skipped"
  | "blocked";
type Limits = {
  taskTimeoutMinutes: number;
  reviewerTimeoutMinutes: number;
  maxTaskRetries: number;
  maxParallelTasks: number;
};
type GitSettings = { checkpointCommits: boolean };
type ProjectProfile = {
  id: string;
  name: string;
  path: string;
  verificationCommands: string[];
  defaultModel: "luna" | "terra" | "sol";
  defaultEffort: "light" | "medium" | "high";
  allowedModels: Array<"luna" | "terra" | "sol">;
};
type Checkpoint = { hash: string; message: string; createdAt: string };
type Task = {
  id: string;
  key?: string;
  dependsOn?: string[];
  resources?: string[];
  title: string;
  prompt: string;
  allowedPaths?: string[];
  timeoutMinutes?: number;
  maxRetries?: number;
  model: "luna" | "terra" | "sol";
  requestedModel: "auto" | "luna" | "terra" | "sol";
  modelSelectionReason: string;
  effort: "light" | "medium" | "high";
  status: Status;
  startedAt?: string;
  finishedAt?: string;
  timedOut?: boolean;
  log: string[];
  changedFiles?: string[];
  diff?: string;
  finalOutput?: string;
  reviewStatus?:
    "pending" | "approved" | "changes_requested" | "unavailable" | "timed_out";
  reviewOutput?: string;
  attempts?: number;
  executionAttempts?: number;
  checkpoint?: Checkpoint;
};
type Run = {
  id: string;
  project: { name: string; path: string };
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
  pipeline?: {
    id: string;
    file: string;
    index: number;
    total: number;
    kind?: "queues" | "goalbuddy";
  };
  limits: Limits;
  git: GitSettings;
  tasks: Task[];
};
type PipelineView = {
  id: string;
  kind: "queues" | "goalbuddy";
  currentIndex: number;
  status: Run["status"];
  receiptPath?: string;
  queues: Array<{
    index: number;
    file: string;
    name: string;
    state: "completed" | "current" | "pending";
  }>;
};
type RunSummary = Pick<
  Run,
  "id" | "project" | "status" | "startedAt" | "finishedAt"
> & { taskCount: number };
type DraftTask = {
  key?: string;
  dependsOn?: string[];
  resources?: string[];
  title: string;
  prompt: string;
  model?: "auto" | "luna" | "terra" | "sol";
  minModel?: "luna" | "terra" | "sol";
  effort?: "light" | "medium" | "high";
  allowedPaths?: string[];
  timeoutMinutes?: number;
  maxRetries?: number;
  contextProfile?: string;
  maxSources?: number;
};
type ContextPreview = {
  task: number;
  profile: string;
  provider: "repository-helper" | "fallback";
  fallbackReason?: string;
  sources: Array<{ path: string; priority: string; authority: string; inclusionReason: string }>;
};
type DraftQueue = {
  project?: {
    name?: string;
    path?: string;
    profileId?: string;
    verificationCommands?: string[];
    defaultModel?: ProjectProfile["defaultModel"];
    defaultEffort?: ProjectProfile["defaultEffort"];
    allowedModels?: ProjectProfile["allowedModels"];
  };
  limits?: Partial<Limits>;
  git?: Partial<GitSettings>;
  tasks?: DraftTask[];
};
export function contextProfileTaskPatch(value: string): Partial<Pick<DraftTask, "contextProfile" | "maxSources">> {
  return value
    ? { contextProfile: value }
    : { contextProfile: undefined, maxSources: undefined };
}

export function optionalNumberValue(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

export function TaskContextControls({
  task,
  onChange,
}: {
  task: DraftTask;
  onChange: (patch: Partial<DraftTask>) => void;
}) {
  return (
    <>
      <label>
        Context profile
        <input
          aria-label="Context profile"
          value={task.contextProfile ?? ""}
          placeholder="Optional, e.g. review"
          onChange={(event) => onChange(contextProfileTaskPatch(event.target.value))}
        />
      </label>
      <label>
        Maximum context sources
        <input
          aria-label="Maximum context sources"
          type="number"
          min="1"
          max="50"
          step="1"
          placeholder="Default: 12"
          disabled={!task.contextProfile}
          value={task.maxSources ?? ""}
          onChange={(event) => onChange({
            maxSources: optionalNumberValue(event.target.value),
          })}
        />
      </label>
    </>
  );
}

type LogFilter = "agent" | "command" | "warning" | "error";
const statusLabel: Record<Status, string> = {
  pending: "В очереди",
  running: "Выполняется",
  completed: "Готово",
  failed: "Ошибка",
  timed_out: "Время истекло",
  cancelled: "Отменено",
  skipped: "Пропущено",
  blocked: "Заблокировано",
};
const statusSymbol: Record<Exclude<Status, "running">, string> = {
  pending: "…",
  completed: "✓",
  failed: "×",
  timed_out: "⌛",
  cancelled: "×",
  skipped: "→",
  blocked: "⊘",
};
const runStatusLabel: Record<Run["status"], string> = {
  idle: "Ожидание",
  running: "Выполняется",
  paused: "На паузе",
  completed: "Готово",
  failed: "Ошибка",
  timed_out: "Время истекло",
  cancelled: "Отменено",
};
const emptyQueue = `project:\n  name: My project\n  path: D:\\\\work\\\\my-project\nlimits:\n  taskTimeoutMinutes: 30\n  reviewerTimeoutMinutes: 10\n  maxTaskRetries: 1\n  maxParallelTasks: 1\ntasks:\n  - key: notifications-types\n    title: Fix TypeScript errors\n    prompt: Fix TypeScript errors in the notifications module and run checks.\n    model: terra\n    effort: medium\n    allowedPaths: [src/notifications]`;

function runSummary(run: Run): RunSummary {
  return {
    id: run.id,
    project: run.project,
    status: run.status,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    taskCount: run.tasks.length,
  };
}

async function parseJsonResponse<T>(response: Response, context: string): Promise<T> {
  const body = await response.text();
  if (!body.trim())
    throw new Error(
      `${context}: сервер вернул пустой ответ (HTTP ${response.status || "нет статуса"}). Повторите запрос; если ошибка сохранится, проверьте backend.`,
    );
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(
      `${context}: сервер вернул некорректный JSON (HTTP ${response.status}).`,
    );
  }
}

function duration(start?: string, end?: string) {
  if (!start) return "—";
  const seconds = Math.max(
    0,
    Math.floor(
      ((end ? new Date(end) : new Date()).getTime() -
        new Date(start).getTime()) /
        1000,
    ),
  );
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function time(value?: string) {
  return value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
}
function logFilter(message: string): LogFilter {
  if (/^(COMMAND|CMD):/i.test(message)) return "command";
  if (/^(WARNING|WARN):/i.test(message) || /предупрежд/i.test(message))
    return "warning";
  if (
    /^(ERROR):/i.test(message) ||
    /ошиб|превысил лимит|timed.?out/i.test(message)
  )
    return "error";
  return "agent";
}
const logFilterLabels: Record<LogFilter, string> = {
  agent: "Агент",
  command: "Команды",
  warning: "Предупреждения",
  error: "Ошибки",
};

export function App() {
  const [run, setRun] = useState<Run | null>(null);
  const [queue, setQueue] = useState(emptyQueue);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isRunLoading, setIsRunLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [isPipelineLoading, setIsPipelineLoading] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [runToDelete, setRunToDelete] = useState<RunSummary | null>(null);
  const [contextPreviews, setContextPreviews] = useState<ContextPreview[]>([]);
  const [isDeletingRun, setIsDeletingRun] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineView | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showGoalBuddy, setShowGoalBuddy] = useState(false);
  const [projects, setProjects] = useState<ProjectProfile[]>([]);
  const [projectForm, setProjectForm] = useState({
    name: "",
    path: "",
    verificationCommands: "",
    defaultModel: "terra" as ProjectProfile["defaultModel"],
    defaultEffort: "medium" as ProjectProfile["defaultEffort"],
  });
  const [selectedDiffFile, setSelectedDiffFile] = useState("");
  const [taskDiff, setTaskDiff] = useState("");
  const [logFilters, setLogFilters] = useState<Set<LogFilter>>(
    () => new Set(["agent", "command", "warning", "error"]),
  );
  const [logSearch, setLogSearch] = useState("");
  const current =
    run?.tasks.find((task) => task.status === "running") ??
    run?.tasks.find((task) => task.status === "failed") ??
    run?.tasks.at(-1);
  const completed =
    run?.tasks.filter((task) => task.status === "completed").length ?? 0;
  const runningCount =
    run?.tasks.filter((task) => task.status === "running").length ?? 0;
  const maxParallelTasks = run?.limits.maxParallelTasks ?? 1;
  const availableSlots = Math.max(0, maxParallelTasks - runningCount);
  const taskByKey = useMemo(
    () => new Map((run?.tasks ?? []).flatMap((task) => (task.key ? [[task.key, task] as const] : []))),
    [run?.tasks],
  );
  const distribution = useMemo(
    () =>
      Object.entries(
        (run?.tasks ?? []).reduce<Record<string, number>>(
          (all, task) => ({ ...all, [task.model]: (all[task.model] ?? 0) + 1 }),
          {},
        ),
      ),
    [run],
  );
  const draft = useMemo(() => {
    try {
      return parse(queue) as DraftQueue;
    } catch {
      return undefined;
    }
  }, [queue]);
  const visibleLog = useMemo(
    () =>
      (current?.log ?? []).filter(
        (message) =>
          logFilters.has(logFilter(message)) &&
          message.toLowerCase().includes(logSearch.trim().toLowerCase()),
      ),
    [current?.log, logFilters, logSearch],
  );
  function taskStateDetail(task: Task) {
    if (task.status === "running") return "Выполнение и проверки";
    if (task.status === "blocked")
      return task.log.find((line) => line.startsWith("Blocked:")) ?? "Заблокировано";
    if (task.status === "pending") {
      const unmet = (task.dependsOn ?? []).filter(
        (key) => taskByKey.get(key)?.status !== "completed",
      );
      return unmet.length ? `Ожидает: ${unmet.join(", ")}` : "Готова к запуску";
    }
    return `${task.model} · ${task.effort} effort`;
  }

  useEffect(() => {
    void fetch("/api/run")
      .then((response) => response.json())
      .then((active) => {
        setRun(active);
        if (active?.pipeline) void refreshPipeline(active.pipeline.id);
      })
      .catch(() => undefined)
      .finally(() => setIsRunLoading(false));
    void Promise.all([
      fetch("/api/projects").then((response) => response.json()),
      fetch("/api/pipeline").then((response) => response.json()),
    ])
      .then(([profiles, currentPipeline]) => {
        setProjects(profiles);
        setPipeline(currentPipeline);
      })
      .catch(() => undefined)
      .finally(() => setIsProjectsLoading(false));
    void refreshHistory(0);
    const events = new EventSource("/api/events");
    events.addEventListener("run", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as Run;
      setRun(next);
    });
    return () => events.close();
  }, []);
  useEffect(() => {
    if (run?.pipeline) void refreshPipeline(run.pipeline.id);
  }, [run?.pipeline?.id, run?.pipeline?.index, run?.pipeline?.total]);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (
      !run ||
      !["idle", "running", "paused"].includes(run.status)
    )
      return;
    let disposed = false;
    const synchronize = async () => {
      try {
        const response = await fetch("/api/run", { cache: "no-store" });
        if (!response.ok) return;
        const active = await parseJsonResponse<Run | null>(
          response,
          "Синхронизация запуска",
        );
        if (!disposed && active?.id === run.id) setRun(active);
      } catch {
        // SSE remains the primary transport; the next polling tick will retry.
      }
    };
    void synchronize();
    const interval = window.setInterval(() => void synchronize(), 1_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [run?.id, run?.status]);
  useEffect(() => {
    if (!run || !current?.changedFiles?.length) {
      setTaskDiff("");
      return;
    }
    const file = selectedDiffFile || current.changedFiles[0];
    void fetch(
      `/api/runs/${run.id}/tasks/${current.id}/diff?file=${encodeURIComponent(file)}`,
    )
      .then((response) => response.json())
      .then((value) => setTaskDiff(value.diff ?? ""))
      .catch(() => setTaskDiff(""));
  }, [run?.id, current?.id, selectedDiffFile]);
  useEffect(() => {
    if (!error && !notice) return;
    const timer = window.setTimeout(() => {
      setError("");
      setNotice("");
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [error, notice]);
  async function refreshHistory(offset = historyOffset) {
    setIsHistoryLoading(true);
    try {
      const response = await fetch(`/api/runs?offset=${offset}&limit=5`);
      if (!response.ok) throw new Error("Could not load run history.");
      const value = (await response.json()) as {
        total: number;
        runs: RunSummary[];
      };
      setHistory(value.runs);
      setHistoryTotal(value.total);
      setHistoryOffset(offset);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load run history.",
      );
    } finally {
      setIsHistoryLoading(false);
    }
  }
  async function refreshPipeline(pipelineId?: string) {
    setIsPipelineLoading(true);
    try {
      const response = await fetch(
        pipelineId ? `/api/pipeline/${pipelineId}` : "/api/pipeline",
      );
      if (!response.ok) throw new Error("Could not load pipeline.");
      setPipeline((await response.json()) as PipelineView | null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load pipeline.");
    } finally {
      setIsPipelineLoading(false);
    }
  }
  async function openHistoryRun(id: string) {
    try {
      const response = await fetch(`/api/runs/${id}`);
      if (!response.ok) throw new Error("Could not load run details.");
      const details = (await response.json()) as Run;
      setRun(details);
      if (details.pipeline) await refreshPipeline(details.pipeline.id);
      setShowHistory(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not load run details.",
      );
    }
  }
  async function deleteHistoryRun(id: string) {
    setIsDeletingRun(true);
    try {
      const response = await fetch(`/api/runs/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const value = (await response.json()) as { error?: string };
        throw new Error(value.error ?? "Could not delete run.");
      }
      const nextOffset =
        history.length === 1 && historyOffset > 0 ? historyOffset - 5 : historyOffset;
      await refreshHistory(nextOffset);
      setRunToDelete(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete run.");
    } finally {
      setIsDeletingRun(false);
    }
  }
  async function start() {
    setError("");
    setIsStarting(true);
    try {
      const preflight = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: queue,
      }).then(
        (response) =>
          parseJsonResponse<{
            ok: boolean;
            checks: { name: string; ok: boolean; detail: string }[];
            contextPreviews?: ContextPreview[];
          }>(response, "Проверка очереди"),
      );
      if (!preflight.ok)
        throw new Error(
          preflight.checks
            .filter((check) => !check.ok)
            .map((check) => `${check.name}: ${check.detail}`)
            .join("; "),
        );
      setContextPreviews(preflight.contextPreviews ?? []);
      const parsed = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: queue,
      }).then(async (response) => {
        const value = await parseJsonResponse<Run | { error?: string }>(
          response,
          "Запуск очереди",
        );
        if (!response.ok)
          throw new Error("error" in value ? value.error : "Не удалось запустить очередь.");
        return value as Run;
      });
      setRun(parsed);
      setHistory((previous) => [
        runSummary(parsed),
        ...previous.filter((item) => item.id !== parsed.id),
      ].slice(0, 5));
      setHistoryTotal((total) => total + 1);
      void refreshPipeline();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not start run.",
      );
    } finally {
      setIsStarting(false);
    }
  }
  async function cancel() {
    await fetch("/api/cancel", { method: "POST" });
  }
  async function skip(task: Task) {
    const response = await fetch("/api/skip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id }),
    });
    if (!response.ok)
      setError(
        ((await response.json()) as { error?: string }).error ??
          "Could not skip task.",
      );
  }
  async function pause() {
    const response = await fetch("/api/pause", { method: "POST" });
    if (!response.ok)
      setError(
        ((await response.json()) as { error?: string }).error ??
          "Could not pause queue.",
      );
  }
  async function continueRun() {
    const response = await fetch("/api/continue", { method: "POST" });
    if (!response.ok)
      setError(
        ((await response.json()) as { error?: string }).error ??
          "Could not continue queue.",
      );
  }
  async function retry(task: Task) {
    const response = await fetch(
      `/api/runs/${run?.id}/tasks/${task.id}/retry`,
      { method: "POST" },
    );
    const next = (await response.json()) as Run | { error: string };
    if ("error" in next) setError(next.error);
    else {
      setRun(next);
      if (next.pipeline) void refreshPipeline(next.pipeline.id);
    }
  }
  async function resume() {
    const response = await fetch(`/api/runs/${run?.id}/resume`, {
      method: "POST",
    });
    const next = (await response.json()) as Run | { error: string };
    if ("error" in next) setError(next.error);
    else {
      setRun(next);
      setHistory((previous) => [
        runSummary(next),
        ...previous.filter((item) => item.id !== next.id),
      ].slice(0, 5));
      if (next.pipeline) void refreshPipeline(next.pipeline.id);
      setShowHistory(false);
    }
  }
  async function downloadReport() {
    if (!run) return;
    const response = await fetch(`/api/runs/${run.id}/report`);
    if (!response.ok) {
      setError("Could not download report.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `orchestrator-${run.id}-report.md`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function rollbackCheckpoint(task: Task) {
    if (!run || !task.checkpoint) return;
    if (
      !window.confirm(
        `Откатить Git-репозиторий к checkpoint ${task.checkpoint.hash.slice(0, 8)}? Незакоммиченные изменения блокируют эту операцию.`,
      )
    )
      return;
    const response = await fetch(
      `/api/runs/${run.id}/checkpoints/${task.id}/rollback`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      },
    );
    if (!response.ok) {
      setError(
        ((await response.json()) as { error?: string }).error ??
          "Rollback failed.",
      );
      return;
    }
    setNotice(`Откат выполнен к ${task.checkpoint.hash.slice(0, 8)}.`);
  }
  function toggleLogFilter(filter: LogFilter) {
    setLogFilters((currentFilters) => {
      const next = new Set(currentFilters);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }
  function loadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void file.text().then((source) => {
      setQueue(source);
      setRun(null);
      setError("");
    });
  }
  function appendFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void (async () => {
      setError("");
      try {
        const source = await file.text();
        const response = await fetch("/api/pipeline/append", {
          method: "POST",
          headers: {
            "Content-Type": "text/yaml",
            "X-Queue-Filename": file.name,
          },
          body: source,
        });
        const value = (await response.json()) as {
          error?: string;
          position?: number;
          pipeline?: PipelineView;
        };
        if (!response.ok) throw new Error(value.error ?? "Could not append queue.");
        setNotice(`Очередь добавлена после текущей (позиция ${value.position}).`);
        if (value.pipeline) setPipeline(value.pipeline);
        else await refreshPipeline(run?.pipeline?.id);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Не удалось добавить очередь.");
      }
    })();
  }
  async function removeQueuedFile(index: number) {
    try {
      const response = await fetch(`/api/pipeline/queues/${index}`, {
        method: "DELETE",
      });
      const value = (await response.json()) as PipelineView | { error?: string };
      if (!response.ok)
        throw new Error(
          "error" in value ? value.error : "Could not remove queued file.",
        );
      setPipeline(value as PipelineView);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not remove queued file.",
      );
    }
  }
  function changeTasks(change: (tasks: DraftTask[]) => DraftTask[]) {
    if (!draft?.tasks) {
      setError("Исправьте YAML, чтобы открыть визуальный редактор.");
      return;
    }
    setError("");
    setQueue(stringify({ ...draft, tasks: change(draft.tasks) }));
  }
  function updateLimits(patch: Partial<Limits>) {
    if (!draft) return;
    setQueue(
      stringify({
        ...draft,
        limits: {
          taskTimeoutMinutes: 30,
          reviewerTimeoutMinutes: 10,
          maxTaskRetries: 1,
          maxParallelTasks: 1,
          ...draft.limits,
          ...patch,
        },
      }),
    );
  }
  function updateGit(patch: Partial<GitSettings>) {
    if (!draft) return;
    setQueue(
      stringify({
        ...draft,
        git: { checkpointCommits: false, ...draft.git, ...patch },
      }),
    );
  }
  async function saveProject() {
    const payload = {
      ...projectForm,
      verificationCommands: projectForm.verificationCommands
        .split("\n")
        .map((command) => command.trim())
        .filter(Boolean),
      allowedModels: ["luna", "terra", "sol"],
    };
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const next = (await response.json()) as ProjectProfile | { error: string };
    if ("error" in next) {
      setError(next.error);
      return;
    }
    setProjects((items) => [...items, next]);
    setProjectForm({
      name: "",
      path: "",
      verificationCommands: "",
      defaultModel: "terra",
      defaultEffort: "medium",
    });
  }
  function useProject(profile: ProjectProfile) {
    const next = {
      ...draft,
      project: {
        name: profile.name,
        path: profile.path,
        profileId: profile.id,
        verificationCommands: profile.verificationCommands,
        defaultModel: profile.defaultModel,
        defaultEffort: profile.defaultEffort,
        allowedModels: profile.allowedModels,
      },
    };
    setQueue(stringify(next));
    setShowProjects(false);
    setShowHistory(false);
  }
  async function deleteProject(id: string) {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((items) => items.filter((profile) => profile.id !== id));
  }
  function updateTask(index: number, patch: Partial<DraftTask>) {
    changeTasks((tasks) =>
      tasks.map((task, position) =>
        position === index ? { ...task, ...patch } : task,
      ),
    );
  }
  function moveTask(index: number, direction: -1 | 1) {
    changeTasks((tasks) => {
      const next = [...tasks];
      const target = index + direction;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  void clock;

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandIcon /> Orchestrator
        </div>
        <div className="navTitle">WORKSPACE</div>
        <div className="projectName">
          {run?.project.name ?? "Новый запуск"}
          <small>{run?.project.path ?? "Загрузите YAML-очередь"}</small>
        </div>
        <nav>
          <button
            className={!showHistory && !showProjects && !showUsage && !showGoalBuddy ? "active" : ""}
            onClick={() => {
              setShowHistory(false);
              setShowProjects(false);
              setShowUsage(false);
              setShowGoalBuddy(false);
            }}
          >
            Очередь
          </button>
          <button
            className={showHistory ? "active" : ""}
            onClick={() => {
              setShowHistory(true);
              setShowProjects(false);
              setShowUsage(false);
              setShowGoalBuddy(false);
              void refreshHistory(0);
            }}
          >
            Запуски <em>{historyTotal}</em>
          </button>
          <button
            className={showProjects ? "active" : ""}
            onClick={() => {
              setShowProjects(true);
              setShowHistory(false);
              setShowUsage(false);
              setShowGoalBuddy(false);
            }}
          >
            Проекты <em>{projects.length}</em>
          </button>
          <button
            className={showUsage ? "active" : ""}
            onClick={() => {
              setShowUsage(true);
              setShowHistory(false);
              setShowProjects(false);
              setShowGoalBuddy(false);
            }}
          >
            Расход
          </button>
          <button
            className={showGoalBuddy ? "active" : ""}
            onClick={() => {
              setShowGoalBuddy(true);
              setShowUsage(false);
              setShowHistory(false);
              setShowProjects(false);
            }}
          >
            GoalBuddy
          </button>
        </nav>
        <div className="sidebarFoot">
          v0.1.0 · local
          <br />
          <span>●</span> Codex CLI pipeline
        </div>
      </aside>
      <section className="workspace">
        {!showUsage && !showGoalBuddy && <header>
          <div>
            <h1>
              <FolderIcon />
              <span className="projectTitle">
                {run?.project.name ?? "Новый запуск"}
                <span className="localChip">Локальный</span>
              </span>
            </h1>
            <p>
              {run
                ? `Запуск ${run.id}`
                : "Вставьте или загрузите очередь задач."}
            </p>
          </div>
          <div className="headerActions">
            <label
              className={`upload ${isStarting || run?.status === "running" || run?.status === "paused" ? "disabled" : ""}`}
            >
              Загрузить YAML
              <input
                type="file"
                accept=".yml,.yaml"
                onChange={loadFile}
                disabled={isStarting || run?.status === "running" || run?.status === "paused"}
              />
            </label>
            {(run?.status === "running" || run?.status === "paused") && (
              <label className="upload">
                Добавить YAML после текущей
                <input type="file" accept=".yml,.yaml" onChange={appendFile} />
              </label>
            )}
            {run?.status === "paused" && (
              <button className="primary" onClick={() => void continueRun()}>
                ▶ Продолжить
              </button>
            )}
            <button
              className="primary"
              onClick={start}
              disabled={isStarting || run?.status === "running" || run?.status === "paused"}
            >
              {isStarting ? "Проверка и запуск…" : "▶ Запустить"}
            </button>
          </div>
        </header>}
        {(error || notice) && (
          <Toast
            message={error || notice}
            tone={error ? "error" : "success"}
            onClose={() => {
              setError("");
              setNotice("");
            }}
          />
        )}
        {runToDelete && (
          <DeleteRunModal
            run={runToDelete}
            isDeleting={isDeletingRun}
            onCancel={() => setRunToDelete(null)}
            onConfirm={() => void deleteHistoryRun(runToDelete.id)}
          />
        )}
        {showGoalBuddy ? (
          <GoalBuddyPage<Run>
            defaultProjectPath={run?.project.path}
            runBlocked={run?.status === "running" || run?.status === "paused"}
            onError={setError}
            onRunStarted={(startedRun) => {
              setRun(startedRun);
              setShowGoalBuddy(false);
              setHistory((previous) => [
                runSummary(startedRun),
                ...previous.filter((item) => item.id !== startedRun.id),
              ].slice(0, 5));
              setHistoryTotal((total) => total + 1);
            }}
          />
        ) : showUsage ? <UsagePage activeRun={run} /> : showProjects ? (
          <section className="projectsPanel">
            <div className="sectionHeading">
              <h2>Сохранённые проекты</h2>
              <span>{projects.length} профилей</span>
            </div>
            <div className="projectForm">
              <input
                placeholder="Название проекта"
                value={projectForm.name}
                onChange={(event) =>
                  setProjectForm({ ...projectForm, name: event.target.value })
                }
              />
              <input
                placeholder="Абсолютный путь к репозиторию"
                value={projectForm.path}
                onChange={(event) =>
                  setProjectForm({ ...projectForm, path: event.target.value })
                }
              />
              <textarea
                placeholder="Команды проверки, по одной на строку"
                value={projectForm.verificationCommands}
                onChange={(event) =>
                  setProjectForm({
                    ...projectForm,
                    verificationCommands: event.target.value,
                  })
                }
              />
              <label>
                Модель по умолчанию
                <select
                  value={projectForm.defaultModel}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      defaultModel: event.target
                        .value as ProjectProfile["defaultModel"],
                    })
                  }
                >
                  <option value="luna">Luna</option>
                  <option value="terra">Terra</option>
                  <option value="sol">Sol</option>
                </select>
              </label>
              <label>
                Усилие по умолчанию
                <select
                  value={projectForm.defaultEffort}
                  onChange={(event) =>
                    setProjectForm({
                      ...projectForm,
                      defaultEffort: event.target
                        .value as ProjectProfile["defaultEffort"],
                    })
                  }
                >
                  <option value="light">Light</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <button className="primary" onClick={() => void saveProject()}>
                Сохранить проект
              </button>
            </div>
            {isProjectsLoading ? (
              <LoadingState label="Загружаем сохранённые проекты…" />
            ) : (
            <div className="projectList">
              {projects.map((profile) => (
                <article key={profile.id}>
                  <div>
                    <b>{profile.name}</b>
                    <small>{profile.path}</small>
                    <code>
                      {profile.defaultModel} · {profile.defaultEffort} ·{" "}
                      {profile.verificationCommands.join(" · ") ||
                        "команды не указаны"}
                    </code>
                  </div>
                  <button
                    onClick={() => useProject(profile)}
                    disabled={Boolean(run)}
                  >
                    Использовать
                  </button>
                  <button
                    className="removeTask"
                    onClick={() => void deleteProject(profile.id)}
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>
            )}
          </section>
        ) : showHistory ? (
          <section className="historyPanel">
            <div className="sectionHeading">
              <h2>История запусков</h2>
              <span>{historyTotal} сохранено</span>
            </div>
            {isHistoryLoading ? (
              <LoadingState label="Загружаем историю запусков…" />
            ) : history.length ? history.map((item) => (
              <article
                className="runRow"
                key={item.id}
              >
                <button className="runOpen" onClick={() => void openHistoryRun(item.id)}>
                  <span className={`runDot ${item.status}`} />
                  <span className="runInfo">
                    <b>{item.project.name}</b>
                    <small>
                      {item.taskCount} задач · {runStatusLabel[item.status]} ·{" "}
                      {duration(item.startedAt, item.finishedAt)}
                    </small>
                  </span>
                  <time>
                    {item.startedAt
                      ? new Date(item.startedAt).toLocaleString()
                      : ""}
                  </time>
                </button>
                <button
                  className="removeTask"
                  onClick={() => setRunToDelete(item)}
                  title="Удалить запуск"
                >
                  ×
                </button>
              </article>
            )) : <p className="empty">Запусков пока нет.</p>}
            {!isHistoryLoading && <div className="historyPagination">
              <button
                onClick={() => void refreshHistory(Math.max(0, historyOffset - 5))}
                disabled={historyOffset === 0}
              >
                Назад
              </button>
              <span>{historyOffset + 1}–{Math.min(historyOffset + 5, historyTotal)} из {historyTotal}</span>
              <button
                onClick={() => void refreshHistory(historyOffset + 5)}
                disabled={historyOffset + 5 >= historyTotal}
              >
                Далее
              </button>
            </div>}
          </section>
        ) : (
          <>
            {isRunLoading && <LoadingState label="Загружаем активную очередь…" />}
            {!run && !isRunLoading && (
              <section className="queueEditor">
                <div>
                  <h2>Описание очереди</h2>
                  <p>Задачи выполняются последовательно, каждая — в новой сессии Codex целевого проекта.</p>
                </div>
                <textarea
                  value={queue}
                  onChange={(event) => setQueue(event.target.value)}
                  spellCheck={false}
                />
                <div className="rules">
                  <b>Ограничения</b>
                  <span>Модели: Luna, Terra, Sol</span>
                  <span>Усилие: лёгкое, среднее, высокое</span>
                  <span>Sol × high is blocked</span>
                </div>
                {draft?.tasks ? (
                  <section className="limitsEditor">
                    <b>Лимиты выполнения</b>
                    <label>
                      Таймаут задачи, мин
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={draft.limits?.taskTimeoutMinutes ?? 30}
                        onChange={(event) =>
                          updateLimits({
                            taskTimeoutMinutes: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Таймаут reviewer, мин
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={draft.limits?.reviewerTimeoutMinutes ?? 10}
                        onChange={(event) =>
                          updateLimits({
                            reviewerTimeoutMinutes: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Повторных попыток
                      <input
                        type="number"
                        min="0"
                        max="3"
                        value={draft.limits?.maxTaskRetries ?? 1}
                        onChange={(event) =>
                          updateLimits({
                            maxTaskRetries: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Параллельных задач
                      <input
                        type="number"
                        min="1"
                        max="4"
                        value={draft.limits?.maxParallelTasks ?? 1}
                        onChange={(event) =>
                          updateLimits({
                            maxParallelTasks: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label className="checkpointToggle">
                      <input
                        type="checkbox"
                        checked={draft.git?.checkpointCommits ?? false}
                        onChange={(event) =>
                          updateGit({ checkpointCommits: event.target.checked })
                        }
                      />
                      Checkpoint-коммиты
                    </label>
                  </section>
                ) : null}
                {draft?.tasks ? (
                  <section className="taskEditor">
                    <div className="sectionHeading">
                      <h2>Редактор задач</h2>
                      <button
                        onClick={() =>
                          changeTasks((tasks) => [
                            ...tasks,
                            {
                              title: "Новая задача",
                              prompt: "Опишите работу, которую нужно выполнить.",
                              model: "auto",
                              effort: "medium",
                              allowedPaths: [],
                            },
                          ])
                        }
                      >
                        + Add task
                      </button>
                    </div>
                    {draft.tasks.map((task, index) => (
                      <article
                        className="editTask"
                        key={`${task.title}-${index}`}
                      >
                        <div className="editOrder">
                          <b>{index + 1}</b>
                          <button
                            onClick={() => moveTask(index, -1)}
                            disabled={index === 0}
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => moveTask(index, 1)}
                            disabled={index === draft.tasks!.length - 1}
                          >
                            ↓
                          </button>
                        </div>
                        <div className="editFields">
                          <input
                            value={task.title}
                            onChange={(event) =>
                              updateTask(index, { title: event.target.value })
                            }
                          />
                          <label>
                            Model
                            <select
                              value={task.model ?? "auto"}
                              onChange={(event) =>
                                updateTask(index, {
                                  model: event.target
                                    .value as DraftTask["model"],
                                })
                              }
                            >
                              <option value="auto">Auto</option>
                              <option value="luna">Luna</option>
                              <option value="terra">Terra</option>
                              <option value="sol">Sol</option>
                            </select>
                          </label>
                          <label>
                            Effort
                            <select
                              value={task.effort ?? "medium"}
                              onChange={(event) =>
                                updateTask(index, {
                                  effort: event.target
                                    .value as DraftTask["effort"],
                                })
                              }
                            >
                              <option value="light">Light</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </label>
                          <label>
                            Timeout, min
                            <input
                              type="number"
                              min="1"
                              max="240"
                            placeholder="Из очереди"
                              value={task.timeoutMinutes ?? ""}
                              onChange={(event) =>
                                updateTask(index, {
                                  timeoutMinutes: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </label>
                          <label>
                            Retries
                            <input
                              type="number"
                              min="0"
                              max="3"
                            placeholder="Из очереди"
                              value={task.maxRetries ?? ""}
                              onChange={(event) =>
                                updateTask(index, {
                                  maxRetries: event.target.value
                                    ? Number(event.target.value)
                                    : undefined,
                                })
                              }
                            />
                          </label>
                          <TaskContextControls
                            task={task}
                            onChange={(patch) => updateTask(index, patch)}
                          />
                          <input
                            className="paths"
                            value={task.key ?? ""}
                            placeholder="key (уникальный идентификатор)"
                            onChange={(event) =>
                              updateTask(index, {
                                key: event.target.value || undefined,
                              })
                            }
                          />
                          <input
                            className="paths"
                            value={(task.dependsOn ?? []).join(", ")}
                            placeholder="dependsOn через запятую"
                            onChange={(event) =>
                              updateTask(index, {
                                dependsOn: event.target.value
                                  .split(",")
                                  .map((key) => key.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                          <input
                            className="paths"
                            value={(task.resources ?? []).join(", ")}
                            placeholder="resources через запятую"
                            onChange={(event) =>
                              updateTask(index, {
                                resources: event.target.value
                                  .split(",")
                                  .map((resource) => resource.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                          <input
                            className="paths"
                            value={(task.allowedPaths ?? []).join(", ")}
                            placeholder="allowedPaths через запятую"
                            onChange={(event) =>
                              updateTask(index, {
                                allowedPaths: event.target.value
                                  .split(",")
                                  .map((path) => path.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </div>
                        <button
                          className="removeTask"
                          onClick={() =>
                            changeTasks((tasks) =>
                              tasks.filter((_, position) => position !== index),
                            )
                          }
                        >
                          ×
                        </button>
                      </article>
                    ))}
                  </section>
                ) : null}
              </section>
            )}
            {contextPreviews.length > 0 && (
              <section className="contextPreview" aria-label="Context preflight preview">
                <div className="sectionHeading">
                  <h2>Context preflight</h2>
                  <span>{contextPreviews.reduce((total, item) => total + item.sources.length, 0)} sources</span>
                </div>
                {contextPreviews.map((preview) => (
                  <article key={`${preview.task}-${preview.profile}`}>
                    <b>Task {preview.task} · {preview.profile}</b>
                    <small>{preview.provider}{preview.fallbackReason ? ` · fallback: ${preview.fallbackReason}` : ""}</small>
                    <ul>
                      {preview.sources.map((source) => (
                        <li key={source.path}>
                          <code>{source.path}</code>
                          <span>{source.priority} · {source.authority}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </section>
            )}
            {run && (
              <>
                <section className="metrics">
                  <Metric
                    label="Выполнено"
                    value={`${completed} / ${run.tasks.length}`}
                  />
                  <Metric
                    label="Общее время"
                    value={duration(run.startedAt, run.finishedAt)}
                  />
                  <Metric
                    label="Статус"
                    value={runStatusLabel[run.status]}
                    status={run.status}
                  />
                  <Metric
                    label="Параллельные задачи"
                    value={`${runningCount} / ${maxParallelTasks}`}
                    detail={`${availableSlots} свободно`}
                  />
                  <div className="metric distribution">
                    <span>Распределение моделей</span>
                    {distribution.map(([model, count]) => (
                      <div key={model}>
                        <b>{model}</b>
                        <i
                          style={{
                            width: `${(count / run.tasks.length) * 100}%`,
                          }}
                        />
                        <em>{count}</em>
                      </div>
                    ))}
                  </div>
                </section>
                {run.status === "paused" && (
                  <div className="pauseNotice">
                    <b>Очередь на паузе</b>
                    <span>
                      Следующая задача не начнётся, пока вы не нажмёте
                      «Продолжить».
                    </span>
                  </div>
                )}
                {isPipelineLoading && run.pipeline && (
                  <LoadingState label="Загружаем очереди pipeline…" />
                )}
                {pipeline && (
                  <section className="pipelinePanel">
                    <div className="sectionHeading">
                      <h2>{pipeline.kind === "goalbuddy" ? "Цепочка GoalBuddy goals" : "Очереди pipeline"}</h2>
                      <span>{pipeline.queues.length} {pipeline.kind === "goalbuddy" ? "goals" : "файлов"}</span>
                    </div>
                    <ol>
                      {pipeline.queues.map((entry) => (
                        <li className={`pipelineQueue ${entry.state}`} key={entry.file}>
                          <span>{String(entry.index + 1).padStart(2, "0")}</span>
                          <div>
                            <b>{entry.name}</b>
                            <small>
                              {entry.state === "completed"
                                ? "Выполнено"
                                : entry.state === "current"
                                  ? "Текущая очередь"
                                  : "Ожидает запуска"}
                            </small>
                          </div>
                          {pipeline.kind !== "goalbuddy" && entry.state === "pending" &&
                            (run.status === "running" || run.status === "paused") && (
                              <button
                                className="removeTask"
                                onClick={() => void removeQueuedFile(entry.index)}
                                title="Удалить из очереди"
                              >
                                ×
                              </button>
                            )}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                <section className="queue">
                  <div className="sectionHeading">
                    <h2>Очередь выполнения</h2>
                    <span>
                      {run.tasks.length} задач · до {maxParallelTasks} параллельно
                    </span>
                  </div>
                  {run.tasks.map((task, index) => (
                    <article className={`task ${task.status}`} key={task.id}>
                      <div className="taskNumber">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div
                        className="taskStateIcon"
                        aria-label={statusLabel[task.status]}
                        title={statusLabel[task.status]}
                      >
                        {task.status === "running" ? (
                          <i />
                        ) : (
                          statusSymbol[task.status]
                        )}
                      </div>
                      <div className="taskBody">
                        <h3 title={task.title}>{task.title}</h3>
                        <code>
                          {[
                            task.key && `#${task.key}`,
                            task.allowedPaths?.[0] ?? "Весь проект",
                            task.resources?.length && `ресурсы: ${task.resources.join(", ")}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </code>
                        <small>
                          {taskStateDetail(task)}
                        </small>
                      </div>
                      <div className="taskMeta">
                        <span className="status">
                          {statusLabel[task.status]}
                        </span>
                        <b>{duration(task.startedAt, task.finishedAt)}</b>
                        {task.checkpoint ? (
                          <button
                            className="checkpoint"
                            onClick={() => void rollbackCheckpoint(task)}
                            title={`Откат к ${task.checkpoint.hash}`}
                          >
                            ↶ {task.checkpoint.hash.slice(0, 8)}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </section>
              </>
            )}
          </>
        )}
      </section>
      <aside className="inspector">
        <div className="inspectorTop">
          <span>ИНСПЕКТОР</span>
          <i className={run?.status === "running" ? "pulse" : ""}>●</i>
        </div>
        {current ? (
          <>
            <div className="inspectorBody">
            <h2>{current.title}</h2>
            <span className={`status ${current.status}`}>
              {statusLabel[current.status]}
            </span>
            <dl>
              <dt>Модель</dt>
              <dd>{current.model}</dd>
              <dt>Усилие</dt>
              <dd>{current.effort}</dd>
              <dt>Запущено</dt>
              <dd>{time(current.startedAt)}</dd>
              <dt>Прошло времени</dt>
              <dd className="timer">
                {duration(current.startedAt, current.finishedAt)}
              </dd>
              <dt>Таймаут</dt>
              <dd>
                {current.timeoutMinutes ?? run?.limits?.taskTimeoutMinutes ?? 30}{" "}
                min
              </dd>
              <dt>Запуски исполнителя</dt>
              <dd>
                {current.executionAttempts ?? 0} /{" "}
                {(current.maxRetries ?? run?.limits?.maxTaskRetries ?? 1) + 1}
              </dd>
              <dt>Файлы</dt>
              <dd>{current.changedFiles?.length ?? "—"}</dd>
              <dt>Проверка</dt>
              <dd>{current.reviewStatus ?? "—"}</dd>
              <dt>Итерации проверки</dt>
              <dd>{current.attempts ?? 0} / 2</dd>
              {current.checkpoint ? (
                <>
                  <dt>Контрольная точка</dt>
                  <dd>{current.checkpoint.hash.slice(0, 8)}</dd>
                </>
              ) : null}
            </dl>
            <div className="logHeading">
              <h3>Активность</h3>
            </div>
            <div className="logControls">
              <input
                aria-label="Поиск в логах"
                placeholder="Поиск в логах"
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
              />
              <div className="logFilters">
                {(Object.keys(logFilterLabels) as LogFilter[]).map((filter) => (
                  <button
                    key={filter}
                    className={logFilters.has(filter) ? "selected" : ""}
                    onClick={() => toggleLogFilter(filter)}
                  >
                    {logFilterLabels[filter]}
                  </button>
                ))}
              </div>
            </div>
            <pre className="activityLog">
              {visibleLog.join("\n") || "Нет событий по выбранным фильтрам."}
            </pre>
            {current.changedFiles?.length ? (
              <details className="result">
                <summary>Изменённые файлы ({current.changedFiles.length})</summary>
                <ul>
                  {current.changedFiles.map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            {current.changedFiles?.length ? (
              <details className="result" open>
                <summary>Diff задачи</summary>
                <select
                  className="diffSelect"
                  value={selectedDiffFile || current.changedFiles[0]}
                  onChange={(event) => setSelectedDiffFile(event.target.value)}
                >
                  {current.changedFiles.map((file) => (
                    <option key={file} value={file}>
                      {file}
                    </option>
                  ))}
                </select>
                <pre>{taskDiff || "No tracked diff for this file."}</pre>
              </details>
            ) : null}
            {current.finalOutput ? (
              <details className="result" open>
                <summary>Результат Codex</summary>
                <pre>{current.finalOutput}</pre>
              </details>
            ) : null}
            {current.reviewOutput ? (
              <details className="result" open>
                <summary>Отчёт reviewer · {current.reviewStatus}</summary>
                <pre>{current.reviewOutput}</pre>
              </details>
            ) : null}
            </div>
            <div className="inspectorActions">
            <button
              className="downloadReport"
              onClick={() => void downloadReport()}
            >
              ↓ Скачать отчёт
            </button>
            {run?.status === "running" && (
              <>
                <button
                  className="pause"
                  onClick={() => void pause()}
                  disabled={run.pauseRequested}
                >
                  ⏸ {run.pauseRequested ? "Пауза запрошена" : "Пауза"}
                </button>
                {current.status === "running" && (
                  <button onClick={() => void skip(current)}>Пропустить задачу</button>
                )}
                <button className="danger" onClick={cancel}>
                  Отменить запуск
                </button>
              </>
            )}
            {run?.status === "paused" && (
              <>
                <button className="primary" onClick={() => void continueRun()}>
                  ▶ Продолжить очередь
                </button>
                <button className="danger" onClick={cancel}>
                  Отменить запуск
                </button>
              </>
            )}
            {run &&
              run.status !== "running" &&
              run.status !== "paused" &&
              run.status !== "completed" && (
                <button onClick={() => void resume()}>Возобновить pipeline</button>
              )}
            {(current.status === "failed" ||
              current.status === "timed_out" ||
              current.status === "cancelled") && (
              <button onClick={() => void retry(current)}>Повторить задачу</button>
            )}
            </div>
          </>
        ) : (
          <div className="empty inspectorBody">
            The selected task will show its live details and event output here.
          </div>
        )}
      </aside>
    </main>
  );
}
function Metric({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail?: string;
  status?: Run["status"];
}) {
  return (
    <div className={`metric ${status ? "statusMetric" : ""}`}>
      <span>{label}</span>
      {status ? (
        <strong className={`runStateValue ${status}`}>
          <i aria-hidden="true" />
          {value}
        </strong>
      ) : (
        <strong>{value}</strong>
      )}
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="loadingState" role="status" aria-live="polite">
      <i />
      <span>{label}</span>
    </div>
  );
}

function Toast({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone: "error" | "success";
  onClose: () => void;
}) {
  return (
    <div className={`toast ${tone}`} role="alert" aria-live="assertive">
      <span>{tone === "error" ? "!" : "✓"}</span>
      <p>{message}</p>
      <button onClick={onClose} aria-label="Закрыть уведомление">×</button>
    </div>
  );
}

function DeleteRunModal({
  run,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  run: RunSummary;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) onCancel();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isDeleting, onCancel]);

  return (
    <div
      className="modalBackdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isDeleting) onCancel();
      }}
    >
      <section
        className="modalDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-run-title"
      >
        <button
          className="modalClose"
          onClick={onCancel}
          disabled={isDeleting}
          aria-label="Закрыть окно"
        >
          ×
        </button>
        <span className="modalIcon" aria-hidden="true">!</span>
        <h2 id="delete-run-title">Удалить запуск?</h2>
        <p>
          <b>{run.project.name}</b>
          <small>{run.id}</small>
        </p>
        <p className="modalHint">
          Запись запуска, локальные логи и результаты задач будут удалены без возможности восстановления.
        </p>
        <div className="modalActions">
          <button onClick={onCancel} disabled={isDeleting}>Отмена</button>
          <button className="modalDelete" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "Удаляем…" : "Удалить запуск"}
          </button>
        </div>
      </section>
    </div>
  );
}

function BrandIcon() {
  return <svg className="brandMark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.75 27.5 9.35v13.3L16 29.25 4.5 22.65V9.35Z"/><circle cx="16" cy="16" r="5.1"/></svg>;
}

function FolderIcon() {
  return <svg className="projectFolder" viewBox="0 0 32 32" aria-hidden="true"><path d="M3.5 9.25h8.1l2.5 3.1h14.4v11.9a3 3 0 0 1-3 3H6.5a3 3 0 0 1-3-3Z"/><path d="M3.5 12.35h25"/></svg>;
}
