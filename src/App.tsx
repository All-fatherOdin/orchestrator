import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { parse, stringify } from "yaml";

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
  title: string;
  prompt: string;
  allowedPaths?: string[];
  timeoutMinutes?: number;
  maxRetries?: number;
  model: "luna" | "terra" | "sol";
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
  limits: Limits;
  git: GitSettings;
  tasks: Task[];
};
type DraftTask = {
  title: string;
  prompt: string;
  model?: "luna" | "terra" | "sol";
  effort?: "light" | "medium" | "high";
  allowedPaths?: string[];
  timeoutMinutes?: number;
  maxRetries?: number;
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
type LogFilter = "agent" | "command" | "warning" | "error";
const statusLabel: Record<Status, string> = {
  pending: "В очереди",
  running: "Выполняется",
  completed: "Готово",
  failed: "Ошибка",
  timed_out: "Время истекло",
  cancelled: "Отменено",
  skipped: "Пропущено",
};
const statusSymbol: Record<Exclude<Status, "running">, string> = {
  pending: "○",
  completed: "✓",
  failed: "!",
  timed_out: "⌛",
  cancelled: "×",
  skipped: "→",
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
const emptyQueue = `project:\n  name: My project\n  path: D:\\\\work\\\\my-project\nlimits:\n  taskTimeoutMinutes: 30\n  reviewerTimeoutMinutes: 10\n  maxTaskRetries: 1\ntasks:\n  - title: Fix TypeScript errors\n    prompt: Fix TypeScript errors in the notifications module and run checks.\n    model: terra\n    effort: medium\n    allowedPaths: [src/notifications]`;

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
  const [clock, setClock] = useState(Date.now());
  const [history, setHistory] = useState<Run[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
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

  useEffect(() => {
    void Promise.all([
      fetch("/api/run").then((response) => response.json()),
      fetch("/api/runs").then((response) => response.json()),
      fetch("/api/projects").then((response) => response.json()),
    ])
      .then(([active, runs, profiles]) => {
        setRun(active);
        setHistory(runs);
        setProjects(profiles);
      })
      .catch(() => undefined);
    const events = new EventSource("/api/events");
    events.addEventListener("run", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as Run;
      setRun(next);
      setHistory((previous) => [
        next,
        ...previous.filter((item) => item.id !== next.id),
      ]);
    });
    return () => events.close();
  }, []);
  useEffect(() => {
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
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
  async function start() {
    setError("");
    try {
      const preflight = await fetch("/api/preflight", {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: queue,
      }).then(
        (response) =>
          response.json() as Promise<{
            ok: boolean;
            checks: { name: string; ok: boolean; detail: string }[];
          }>,
      );
      if (!preflight.ok)
        throw new Error(
          preflight.checks
            .filter((check) => !check.ok)
            .map((check) => `${check.name}: ${check.detail}`)
            .join("; "),
        );
      const parsed = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "text/yaml" },
        body: queue,
      }).then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      });
      setRun(parsed);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Could not start run.",
      );
    }
  }
  async function cancel() {
    await fetch("/api/cancel", { method: "POST" });
  }
  async function skip() {
    await fetch("/api/skip", { method: "POST" });
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
    else setRun(next);
  }
  async function resume() {
    const response = await fetch(`/api/runs/${run?.id}/resume`, {
      method: "POST",
    });
    const next = (await response.json()) as Run | { error: string };
    if ("error" in next) setError(next.error);
    else {
      setRun(next);
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
    setError(`Откат выполнен к ${task.checkpoint.hash.slice(0, 8)}.`);
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
    if (file) void file.text().then(setQueue);
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
          <span className="brandMark">◉</span> Orchestrator
        </div>
        <div className="navTitle">WORKSPACE</div>
        <div className="projectName">
          {run?.project.name ?? "Новый запуск"}
          <small>{run?.project.path ?? "Загрузите YAML-очередь"}</small>
        </div>
        <nav>
          <button
            className={!showHistory && !showProjects ? "active" : ""}
            onClick={() => {
              setShowHistory(false);
              setShowProjects(false);
            }}
          >
            Очередь
          </button>
          <button
            className={showHistory ? "active" : ""}
            onClick={() => {
              setShowHistory(true);
              setShowProjects(false);
            }}
          >
            Запуски <em>{history.length}</em>
          </button>
          <button
            className={showProjects ? "active" : ""}
            onClick={() => {
              setShowProjects(true);
              setShowHistory(false);
            }}
          >
            Проекты <em>{projects.length}</em>
          </button>
          <a>Архив</a>
          <a>Модели</a>
          <a>Настройки</a>
        </nav>
        <div className="sidebarFoot">
          v0.1.0 · local
          <br />
          <span>●</span> Codex CLI pipeline
        </div>
      </aside>
      <section className="workspace">
        <header>
          <div>
            <h1>
              <span className="projectFolder">▱</span>
              {run?.project.name ?? "Новый запуск"}
              <span className="localChip">Локальный</span>
            </h1>
            <p>
              {run
                ? `Запуск ${run.id}`
                : "Вставьте или загрузите очередь задач."}
            </p>
          </div>
          <div className="headerActions">
            <label className="upload">
              Загрузить YAML
              <input type="file" accept=".yml,.yaml" onChange={loadFile} />
            </label>
            {run?.status === "running" && (
              <button
                className="pause"
                onClick={() => void pause()}
                disabled={run.pauseRequested}
              >
                ⏸{" "}
                {run.pauseRequested ? "Пауза запрошена" : "Пауза после задачи"}
              </button>
            )}
            {run?.status === "paused" && (
              <button className="primary" onClick={() => void continueRun()}>
                ▶ Продолжить
              </button>
            )}
            <button
              className="primary"
              onClick={start}
              disabled={run?.status === "running" || run?.status === "paused"}
            >
              ▶ Запустить
            </button>
          </div>
        </header>
        {showProjects ? (
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
          </section>
        ) : showHistory ? (
          <section className="historyPanel">
            <div className="sectionHeading">
              <h2>История запусков</h2>
              <span>{history.length} сохранено</span>
            </div>
            {history.map((item) => (
              <button
                className="runRow"
                key={item.id}
                onClick={() => {
                  setRun(item);
                  setShowHistory(false);
                }}
              >
                <span className={`runDot ${item.status}`} />
                <span className="runInfo">
                  <b>{item.project.name}</b>
                  <small>
                    {item.tasks.length} задач · {runStatusLabel[item.status]} ·{" "}
                    {duration(item.startedAt, item.finishedAt)}
                  </small>
                </span>
                <time>
                  {item.startedAt
                    ? new Date(item.startedAt).toLocaleString()
                    : ""}
                </time>
              </button>
            ))}
          </section>
        ) : (
          <>
            {!run && (
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
                {error && <div className="error">{error}</div>}
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
                              model: "terra",
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
                              value={task.model ?? "terra"}
                              onChange={(event) =>
                                updateTask(index, {
                                  model: event.target
                                    .value as DraftTask["model"],
                                })
                              }
                            >
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
                  <Metric label="Статус" value={runStatusLabel[run.status]} />
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
                <section className="queue">
                  <div className="sectionHeading">
                    <h2>Очередь выполнения</h2>
                    <span>{run.tasks.length} задач · последовательно</span>
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
                        <code>{task.allowedPaths?.[0] ?? "Весь проект"}</code>
                        <small>
                          {task.status === "pending"
                            ? `Позиция в очереди: ${index + 1}`
                            : task.status === "running"
                              ? "Выполнение и проверки"
                              : `${task.model} · ${task.effort} effort`}
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
          <span>LIVE INSPECTOR</span>
          <i className={run?.status === "running" ? "pulse" : ""}>●</i>
        </div>
        {current ? (
          <>
            <h2>{current.title}</h2>
            <span className={`status ${current.status}`}>
              {statusLabel[current.status]}
            </span>
            <dl>
              <dt>Модель</dt>
              <dd>{current.model}</dd>
              <dt>Усилие</dt>
              <dd>{current.effort}</dd>
              <dt>Started</dt>
              <dd>{time(current.startedAt)}</dd>
              <dt>Elapsed</dt>
              <dd className="timer">
                {duration(current.startedAt, current.finishedAt)}
              </dd>
              <dt>Таймаут</dt>
              <dd>
                {current.timeoutMinutes ?? run?.limits?.taskTimeoutMinutes ?? 30}{" "}
                min
              </dd>
              <dt>Executor</dt>
              <dd>
                {current.executionAttempts ?? 0} /{" "}
                {(current.maxRetries ?? run?.limits?.maxTaskRetries ?? 1) + 1}
              </dd>
              <dt>Files</dt>
              <dd>{current.changedFiles?.length ?? "—"}</dd>
              <dt>Review</dt>
              <dd>{current.reviewStatus ?? "—"}</dd>
              <dt>Attempts</dt>
              <dd>{current.attempts ?? 0} / 2</dd>
              {current.checkpoint ? (
                <>
                  <dt>Checkpoint</dt>
                  <dd>{current.checkpoint.hash.slice(0, 8)}</dd>
                </>
              ) : null}
            </dl>
            <div className="logHeading">
              <h3>Активность</h3>
              <button
                className="downloadReport"
                onClick={() => void downloadReport()}
              >
                ↓ Отчёт
              </button>
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
            {run?.status === "running" && (
              <>
                <button onClick={skip}>Пропустить задачу</button>
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
              <button onClick={() => void retry(current)}>Retry task</button>
            )}
          </>
        ) : (
          <div className="empty">
            The selected task will show its live details and event output here.
          </div>
        )}
      </aside>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
