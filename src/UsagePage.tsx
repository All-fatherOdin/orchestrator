import { useEffect, useMemo, useState } from "react";

type UsageRecord = { inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheWriteTokens?: number };
type Task = { id: string; key?: string; title: string; model: string; usage?: UsageRecord[] };
type OutcomeClass = "success" | "failure" | "interrupted" | "pending";
type TokenMetrics = { inputTokens: number; outputTokens: number; cachedInputTokens: number; cacheWriteTokens?: number; totalTokens: number; calls: number };
type TaskMetrics = { id: string; key?: string; status: string; outcome: OutcomeClass; durationMs: number | null; executionAttempts: number | null; reviewCorrectionCycles: number | null; tokens: TokenMetrics };
type RunMetrics = { id: string; status: string; outcome: OutcomeClass; durationMs: number | null; tokens: TokenMetrics; tasks: TaskMetrics[] };
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
export type UsageTotals = { input: number; output: number; cacheRead: number; cacheWrite: number; calls: number };

const pageSize = 5;
const zero: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
const format = new Intl.NumberFormat("ru-RU");
const outcomeLabels: Record<OutcomeClass, string> = { success: "Успешно", failure: "Ошибка", interrupted: "Прервано", pending: "В процессе" };

function formatDuration(value: number | null) {
  if (value === null) return "—";
  if (value < 1_000) return `${value} мс`;
  const seconds = Math.floor(value / 1_000);
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин ${seconds % 60} с`;
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

function tokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** Aggregates persisted call telemetry; cache fields are deliberately excluded from input/output totals. */
export function aggregateUsage(tasks: Pick<Task, "usage">[]): UsageTotals {
  return tasks.reduce<UsageTotals>((all, task) => (task.usage ?? []).reduce(
    (sum, entry) => ({ input: sum.input + tokenCount(entry.inputTokens), output: sum.output + tokenCount(entry.outputTokens), cacheRead: sum.cacheRead + tokenCount(entry.cachedInputTokens), cacheWrite: sum.cacheWrite + tokenCount(entry.cacheWriteTokens), calls: sum.calls + 1 }),
    all,
  ), zero);
}

function totals(tasks: Task[]): UsageTotals { return aggregateUsage(tasks); }

function metricTokenCount(metrics: TokenMetrics | undefined, field: "cachedInputTokens" | "cacheWriteTokens") {
  return tokenCount(metrics?.[field]);
}
function TaskBar({ task, maximum }: { task: ViewTask; maximum: number }) {
  const value = totals([task]);
  const total = value.input + value.output;
  const uncachedInput = Math.max(0, value.input - value.cacheRead);
  const width = maximum ? Math.max(2, total / maximum * 100) : 0;
  return <div className="usageBarRow" title={`${task.title}: ${format.format(total)} токенов; кэш-чтение: ${format.format(value.cacheRead)}; кэш-запись: ${format.format(value.cacheWrite)}`}>
    <span className="usageBarLabel">{task.queueIndex ? `Q${task.queueIndex} · ` : ""}{task.key ?? task.id}</span>
    <div className="usageBarTrack"><div className="usageBar" style={{ width: `${width}%` }}>
      {uncachedInput ? <i className="input" style={{ flex: uncachedInput }} /> : null}
      {value.output ? <i className="output" style={{ flex: value.output }} /> : null}
      {value.cacheRead ? <i className="cached" style={{ flex: value.cacheRead }} /> : null}
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
  const [metricsByRun, setMetricsByRun] = useState<Record<string, RunMetrics>>({});

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
  useEffect(() => {
    let cancelled = false;
    if (!sourceRuns.length) {
      setMetricsByRun({});
      return () => { cancelled = true; };
    }
    void Promise.all(sourceRuns.map(async (run) => {
      const response = await fetch(`/api/runs/${encodeURIComponent(run.id)}/metrics`);
      return response.ok ? response.json() as Promise<RunMetrics> : null;
    })).then((values) => {
      if (!cancelled) setMetricsByRun(Object.fromEntries(values.filter((value): value is RunMetrics => Boolean(value)).map((value) => [value.id, value])));
    }).catch(() => { if (!cancelled) setMetricsByRun({}); });
    return () => { cancelled = true; };
  }, [sourceRuns]);

  const sources = useMemo(() => {
    const seen = new Set<string>();
    return runs.flatMap((run) => {
      const value = run.pipeline ? `pipeline:${run.pipeline.id}` : `run:${run.id}`;
      if (seen.has(value)) return [];
      seen.add(value);
      return [{ value, label: run.pipeline ? `Pipeline · ${run.project.name} · ${run.pipeline.total} очереди` : `${run.project.name} · ${run.startedAt ? new Date(run.startedAt).toLocaleString() : run.id}` }];
    });
  }, [runs]);
  useEffect(() => {
    if (!source && sources.length) setSource(sources[0].value);
  }, [source, sources]);
  const visibleRuns = queueId === "all" ? sourceRuns : sourceRuns.filter((run) => run.id === queueId);
  const allTasks = useMemo<ViewTask[]>(() => visibleRuns.flatMap((run) => run.tasks.map((task) => ({ ...task, runId: run.id, queueIndex: run.pipeline?.index }))), [visibleRuns]);
  const visibleTasks = taskId === "all" ? allTasks : allTasks.filter((task) => `${task.runId}:${task.id}` === taskId);
  const usage = useMemo(() => totals(visibleTasks), [visibleTasks]);
  const metricsByTask = useMemo(() => new Map(visibleRuns.flatMap((run) => (metricsByRun[run.id]?.tasks ?? []).map((task) => [`${run.id}:${task.id}`, task] as const))), [metricsByRun, visibleRuns]);
  const visibleMetrics = useMemo(() => visibleTasks.map((task) => metricsByTask.get(`${task.runId}:${task.id}`)).filter((task): task is TaskMetrics => Boolean(task)), [metricsByTask, visibleTasks]);
  const endpointCacheTotals = useMemo(() => visibleMetrics.reduce((sum, task) => ({
    read: sum.read + metricTokenCount(task.tokens, "cachedInputTokens"),
    write: sum.write + metricTokenCount(task.tokens, "cacheWriteTokens"),
  }), { read: 0, write: 0 }), [visibleMetrics]);
  const processTotals = useMemo(() => {
    const durations = visibleMetrics.map((task) => task.durationMs).filter((value): value is number => value !== null);
    const attempts = visibleMetrics.map((task) => task.executionAttempts).filter((value): value is number => value !== null);
    const cycles = visibleMetrics.map((task) => task.reviewCorrectionCycles).filter((value): value is number => value !== null);
    return {
      durationMs: durations.length ? durations.reduce((sum, value) => sum + value, 0) : null,
      attempts: attempts.length ? attempts.reduce((sum, value) => sum + value, 0) : null,
      cycles: cycles.length ? cycles.reduce((sum, value) => sum + value, 0) : null,
    };
  }, [visibleMetrics]);
  const maximum = useMemo(() => Math.max(0, ...allTasks.map((task) => { const value = totals([task]); return value.input + value.output; })), [allTasks]);
  const hasUsage = usage.calls > 0;
  const hasProcessMetrics = visibleMetrics.length > 0;
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
      <div className="usageMetrics"><UsageMetric label="Всего токенов" value={usage.input + usage.output} /><UsageMetric label="Входящие токены" value={usage.input} /><UsageMetric label="Исходящие токены" value={usage.output} /><UsageMetric label="Кэш-чтение" value={usage.cacheRead} title={`Метрики endpoint: ${format.format(endpointCacheTotals.read)}`} /><UsageMetric label="Кэш-запись" value={usage.cacheWrite} title={`Метрики endpoint: ${format.format(endpointCacheTotals.write)}`} /><ProcessMetric label="Время задач" value={formatDuration(processTotals.durationMs)} /><ProcessMetric label="Запуски исполнителя" value={processTotals.attempts === null ? "—" : format.format(processTotals.attempts)} /><ProcessMetric label="Циклы проверки" value={processTotals.cycles === null ? "—" : format.format(processTotals.cycles)} /><article className="usageMetric"><span>Стоимость</span><strong>Не предоставлена CLI</strong><small>Без тарифов провайдера оценка была бы неточной</small></article></div>
      {!hasUsage && !hasProcessMetrics ? <p className="usageEmpty">Для выбранных данных пока нет telemetry-событий. Метрики появятся у новых запусков; старые записи продолжат открываться без миграции.</p> : <>
        {hasUsage && taskId === "all" ? <section className="usageChart"><div className="usageChartHead"><h3>{isPipeline && queueId === "all" ? "Токены по всем очередям" : "Токены по задачам"}</h3><span><i className="input" /> входящие без кэша <i className="output" /> исходящие <i className="cached" /> кэш-чтение</span></div>{allTasks.map((task) => <TaskBar key={`${task.runId}:${task.id}`} task={task} maximum={maximum} />)}</section> : null}
        {!hasUsage ? <p className="usageEmpty">Токены для этих задач не записаны; процессные метрики показаны по доступным lifecycle-полям.</p> : null}
        <section className="usageTable"><h3>Детализация задач</h3><div className="usageTableHead"><span>Задача</span><span>Модель</span><span>Входящие</span><span>Исходящие</span><span>Кэш-чтение</span><span>Кэш-запись</span><span>Вызовы</span><span>Исход</span></div>{visibleTasks.map((task) => { const value = totals([task]); const process = metricsByTask.get(`${task.runId}:${task.id}`); const cacheRead = process ? metricTokenCount(process.tokens, "cachedInputTokens") : value.cacheRead; const cacheWrite = process ? metricTokenCount(process.tokens, "cacheWriteTokens") : value.cacheWrite; return <div className="usageTableRow" key={`${task.runId}:${task.id}`}><b>{task.key ?? task.id}<small>{task.queueIndex ? `Очередь ${task.queueIndex} · ` : ""}{task.title}</small><small className="usageProcessLine">{process ? `${formatDuration(process.durationMs)} · запусков: ${process.executionAttempts ?? "—"} · циклов: ${process.reviewCorrectionCycles ?? "—"} · всего: ${format.format(process.tokens.totalTokens)} токенов · кэш-чтение: ${format.format(cacheRead)} · кэш-запись: ${format.format(cacheWrite)}` : "Метрики недоступны"}</small></b><span>{task.model}</span><span>{format.format(value.input)}</span><span>{format.format(value.output)}</span><span>{format.format(cacheRead)}</span><span>{format.format(cacheWrite)}</span><span>{value.calls}</span><span className={`usageOutcome ${process?.outcome ?? "pending"}`}>{process ? outcomeLabels[process.outcome] : "—"}</span></div>; })}</section>
      </>}
    </>}
  </section>;
}
function UsageMetric({ label, value, title }: { label: string; value: number; title?: string }) { return <article className="usageMetric" title={title}><span>{label}</span><strong>{format.format(value)}</strong><small>Во всех выбранных вызовах</small></article>; }
function ProcessMetric({ label, value }: { label: string; value: string }) { return <article className="usageMetric"><span>{label}</span><strong>{value}</strong><small>По выбранным задачам</small></article>; }
