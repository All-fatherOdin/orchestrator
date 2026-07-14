import { useEffect, useMemo, useState } from "react";

type UsageRecord = { inputTokens: number; outputTokens: number; cachedInputTokens: number };
type Task = { id: string; key?: string; title: string; model: string; usage?: UsageRecord[] };
export type UsageRun = {
  id: string;
  project: { name: string };
  status: string;
  startedAt?: string;
  pipeline?: { id: string; file: string; index: number; total: number };
  tasks: Task[];
};
type RunSummary = Pick<UsageRun, "id" | "project" | "status" | "startedAt" | "pipeline"> & { taskCount: number };
type ViewTask = Task & { runId: string; queueIndex?: number };
type Totals = { input: number; output: number; cached: number; calls: number };

const pageSize = 5;
const zero: Totals = { input: 0, output: 0, cached: 0, calls: 0 };
const format = new Intl.NumberFormat("ru-RU");

function totals(tasks: Task[]): Totals {
  return tasks.reduce<Totals>((all, task) => (task.usage ?? []).reduce(
    (sum, entry) => ({ input: sum.input + entry.inputTokens, output: sum.output + entry.outputTokens, cached: sum.cached + entry.cachedInputTokens, calls: sum.calls + 1 }),
    all,
  ), zero);
}
function TaskBar({ task, maximum }: { task: ViewTask; maximum: number }) {
  const value = totals([task]);
  const total = value.input + value.output + value.cached;
  const width = maximum ? Math.max(2, total / maximum * 100) : 0;
  return <div className="usageBarRow" title={`${task.title}: ${format.format(total)} токенов`}>
    <span className="usageBarLabel">{task.queueIndex ? `Q${task.queueIndex} · ` : ""}{task.key ?? task.id}</span>
    <div className="usageBarTrack"><div className="usageBar" style={{ width: `${width}%` }}>
      {value.input ? <i className="input" style={{ flex: value.input }} /> : null}
      {value.output ? <i className="output" style={{ flex: value.output }} /> : null}
      {value.cached ? <i className="cached" style={{ flex: value.cached }} /> : null}
    </div></div><b>{format.format(total)}</b>
  </div>;
}

export function UsagePage({ activeRun }: { activeRun: UsageRun | null }) {
  const initialSource = activeRun ? `${activeRun.pipeline ? "pipeline" : "run"}:${activeRun.pipeline?.id ?? activeRun.id}` : "";
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsTotal, setRunsTotal] = useState(0);
  const [runsOffset, setRunsOffset] = useState(0);
  const [source, setSource] = useState(initialSource);
  const [sourceRuns, setSourceRuns] = useState<UsageRun[]>(activeRun ? [activeRun] : []);
  const [queueId, setQueueId] = useState("all");
  const [taskId, setTaskId] = useState("all");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void fetch(`/api/runs?offset=${runsOffset}&limit=${pageSize}`)
      .then((response) => response.ok ? response.json() : { runs: [], total: 0 })
      .then((value: { runs: RunSummary[]; total: number }) => { setRuns(value.runs); setRunsTotal(value.total); })
      .catch(() => { setRuns([]); setRunsTotal(0); });
  }, [runsOffset]);
  useEffect(() => {
    if (activeRun && !source) setSource(`${activeRun.pipeline ? "pipeline" : "run"}:${activeRun.pipeline?.id ?? activeRun.id}`);
  }, [activeRun, source]);
  useEffect(() => {
    if (!source) return;
    const [kind, id] = source.split(":", 2);
    if (kind === "run" && activeRun?.id === id) { setSourceRuns([activeRun]); return; }
    setLoading(true);
    const path = kind === "pipeline" ? `/api/pipelines/${encodeURIComponent(id)}/runs` : `/api/runs/${encodeURIComponent(id)}`;
    void fetch(path).then((response) => response.ok ? response.json() : null).then((value: UsageRun | { runs: UsageRun[] } | null) => {
      setSourceRuns(value && "runs" in value ? value.runs : value ? [value] : []);
    }).catch(() => setSourceRuns([])).finally(() => setLoading(false));
  }, [activeRun, source]);
  useEffect(() => { setQueueId("all"); setTaskId("all"); }, [source]);
  useEffect(() => setTaskId("all"), [queueId]);

  const sources = useMemo(() => {
    const seen = new Set<string>();
    return runs.flatMap((run) => {
      const value = run.pipeline ? `pipeline:${run.pipeline.id}` : `run:${run.id}`;
      if (seen.has(value)) return [];
      seen.add(value);
      return [{ value, label: run.pipeline ? `Pipeline · ${run.project.name} · ${run.pipeline.total} очереди` : `${run.project.name} · ${run.startedAt ? new Date(run.startedAt).toLocaleString() : run.id}` }];
    });
  }, [runs]);
  const visibleRuns = queueId === "all" ? sourceRuns : sourceRuns.filter((run) => run.id === queueId);
  const allTasks = useMemo<ViewTask[]>(() => visibleRuns.flatMap((run) => run.tasks.map((task) => ({ ...task, runId: run.id, queueIndex: run.pipeline?.index }))), [visibleRuns]);
  const visibleTasks = taskId === "all" ? allTasks : allTasks.filter((task) => `${task.runId}:${task.id}` === taskId);
  const usage = useMemo(() => totals(visibleTasks), [visibleTasks]);
  const maximum = useMemo(() => Math.max(0, ...allTasks.map((task) => { const value = totals([task]); return value.input + value.output + value.cached; })), [allTasks]);
  const hasUsage = usage.calls > 0;
  const isPipeline = source.startsWith("pipeline:");

  return <section className="usagePage">
    <div className="sectionHeading usageHeading"><div><h2>Расход</h2><span>Токены по запуску, очереди и отдельной задаче</span></div></div>
    <div className="usageFilters">
      <label>Запуск или pipeline<select value={source} onChange={(event) => setSource(event.target.value)}>
        {!sources.length ? <option value="">Нет запусков</option> : null}
        {sources.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select></label>
      <label>Очередь<select value={queueId} onChange={(event) => setQueueId(event.target.value)} disabled={!sourceRuns.length || !isPipeline}>
        <option value="all">{isPipeline ? "Все очереди pipeline" : "Текущая очередь"}</option>
        {isPipeline ? sourceRuns.map((run) => <option key={run.id} value={run.id}>Очередь {run.pipeline?.index} из {run.pipeline?.total} · {run.project.name}</option>) : null}
      </select></label>
      <label>Задача<select value={taskId} onChange={(event) => setTaskId(event.target.value)} disabled={!allTasks.length}>
        <option value="all">Все задачи</option>
        {allTasks.map((task) => <option key={`${task.runId}:${task.id}`} value={`${task.runId}:${task.id}`}>{task.queueIndex ? `Q${task.queueIndex} · ` : ""}{task.key ?? task.id} · {task.title}</option>)}
      </select></label>
    </div>
    <div className="usagePagination"><span>Запуски: {runsTotal ? `${runsOffset + 1}–${Math.min(runsOffset + pageSize, runsTotal)} из ${runsTotal}` : "нет"}</span><button onClick={() => setRunsOffset((value) => Math.max(0, value - pageSize))} disabled={runsOffset === 0}>Назад</button><button onClick={() => setRunsOffset((value) => value + pageSize)} disabled={runsOffset + pageSize >= runsTotal}>Далее</button></div>
    {loading ? <p className="empty">Загружаем данные запуска…</p> : !sourceRuns.length ? <p className="empty">Выберите запуск, чтобы посмотреть расход.</p> : <>
      <div className="usageMetrics"><UsageMetric label="Входящие токены" value={usage.input} /><UsageMetric label="Исходящие токены" value={usage.output} /><UsageMetric label="Кэш-токены" value={usage.cached} /><article className="usageMetric"><span>Стоимость</span><strong>Не предоставлена CLI</strong><small>Без тарифов провайдера оценка была бы неточной</small></article></div>
      {!hasUsage ? <p className="usageEmpty">Для выбранных данных пока нет usage-событий. Они появятся у новых запусков после завершения хода Codex CLI.</p> : <>
        {taskId === "all" ? <section className="usageChart"><div className="usageChartHead"><h3>{isPipeline && queueId === "all" ? "Токены по всем очередям" : "Токены по задачам"}</h3><span><i className="input" /> входящие <i className="output" /> исходящие <i className="cached" /> кэш</span></div>{allTasks.map((task) => <TaskBar key={`${task.runId}:${task.id}`} task={task} maximum={maximum} />)}</section> : null}
        <section className="usageTable"><h3>Детализация задач</h3><div className="usageTableHead"><span>Задача</span><span>Модель</span><span>Входящие</span><span>Исходящие</span><span>Кэш</span><span>Вызовы</span></div>{visibleTasks.map((task) => { const value = totals([task]); return <div className="usageTableRow" key={`${task.runId}:${task.id}`}><b>{task.key ?? task.id}<small>{task.queueIndex ? `Очередь ${task.queueIndex} · ` : ""}{task.title}</small></b><span>{task.model}</span><span>{format.format(value.input)}</span><span>{format.format(value.output)}</span><span>{format.format(value.cached)}</span><span>{value.calls}</span></div>; })}</section>
      </>}
    </>}
  </section>;
}
function UsageMetric({ label, value }: { label: string; value: number }) { return <article className="usageMetric"><span>{label}</span><strong>{format.format(value)}</strong><small>Во всех выбранных вызовах</small></article>; }
