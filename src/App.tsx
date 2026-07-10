import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Status = "pending" | "running" | "completed" | "failed" | "cancelled";
type Task = { id: string; title: string; prompt: string; model: "luna" | "terra" | "sol"; effort: "light" | "medium" | "high"; status: Status; startedAt?: string; finishedAt?: string; log: string[] };
type Run = { id: string; project: { name: string; path: string }; status: string; startedAt?: string; finishedAt?: string; tasks: Task[] };
const statusLabel: Record<Status, string> = { pending: "В очереди", running: "Выполняется", completed: "Готово", failed: "Ошибка", cancelled: "Отменено" };
const emptyQueue = `project:\n  name: My project\n  path: D:\\\\work\\\\my-project\ntasks:\n  - title: Fix TypeScript errors\n    prompt: Fix TypeScript errors in the notifications module and run checks.\n    model: terra\n    effort: medium\n    allowedPaths: [src/notifications]`;

function duration(start?: string, end?: string) { if (!start) return "—"; const seconds = Math.max(0, Math.floor(((end ? new Date(end) : new Date()).getTime() - new Date(start).getTime()) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }
function time(value?: string) { return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"; }

export function App() {
  const [run, setRun] = useState<Run | null>(null);
  const [queue, setQueue] = useState(emptyQueue);
  const [error, setError] = useState("");
  const [clock, setClock] = useState(Date.now());
  const current = run?.tasks.find((task) => task.status === "running") ?? run?.tasks.at(-1);
  const completed = run?.tasks.filter((task) => task.status === "completed").length ?? 0;
  const distribution = useMemo(() => Object.entries((run?.tasks ?? []).reduce<Record<string, number>>((all, task) => ({ ...all, [task.model]: (all[task.model] ?? 0) + 1 }), {})), [run]);

  useEffect(() => { fetch("/api/run").then((response) => response.json()).then(setRun).catch(() => undefined); const events = new EventSource("/api/events"); events.addEventListener("run", (event) => setRun(JSON.parse((event as MessageEvent).data))); return () => events.close(); }, []);
  useEffect(() => { const interval = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  async function start() { setError(""); try { const parsed = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: queue }).then(async (response) => { const value = await response.json(); if (!response.ok) throw new Error(value.error); return value; }); setRun(parsed); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not start run."); } }
  async function cancel() { await fetch("/api/cancel", { method: "POST" }); }
  function loadFile(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (file) void file.text().then(setQueue); }
  void clock;

  return <main className="shell">
    <aside className="sidebar"><div className="brand"><span className="brandMark">◉</span> Orchestrator</div><div className="navTitle">WORKSPACE</div><div className="projectName">{run?.project.name ?? "New run"}<small>{run?.project.path ?? "Choose a YAML queue"}</small></div><nav><a className="active">Queue</a><a>Runs</a><a>Archive</a><a>Models</a><a>Settings</a></nav><div className="sidebarFoot">v0.1.0 · local<br/><span>●</span> Codex CLI pipeline</div></aside>
    <section className="workspace">
      <header><div><h1>{run?.project.name ?? "New orchestration run"}</h1><p>{run ? `Run ${run.id}` : "Paste or upload the task queue to begin."}</p></div><div className="headerActions"><label className="upload">Upload YAML<input type="file" accept=".yml,.yaml" onChange={loadFile}/></label><button className="primary" onClick={start} disabled={run?.status === "running"}>▶ Start run</button></div></header>
      {!run && <section className="queueEditor"><div><h2>Queue definition</h2><p>One task at a time. Each runs in a new Codex session in the target project.</p></div><textarea value={queue} onChange={(event) => setQueue(event.target.value)} spellCheck={false}/>{error && <div className="error">{error}</div>}<div className="rules"><b>Guardrails</b><span>Models: Luna, Terra, Sol</span><span>Effort: light, medium, high</span><span>Sol × high is blocked</span></div></section>}
      {run && <><section className="metrics"><Metric label="Completed" value={`${completed} / ${run.tasks.length}`}/><Metric label="Run time" value={duration(run.startedAt, run.finishedAt)}/><Metric label="Status" value={run.status}/><div className="metric distribution"><span>Model mix</span>{distribution.map(([model, count]) => <div key={model}><b>{model}</b><i style={{ width: `${(count / run.tasks.length) * 100}%` }}/><em>{count}</em></div>)}</div></section><section className="queue"><div className="sectionHeading"><h2>Execution queue</h2><span>{run.tasks.length} tasks · sequential mode</span></div>{run.tasks.map((task, index) => <article className={`task ${task.status}`} key={task.id}><div className="taskNumber">{String(index + 1).padStart(2, "0")}</div><div className="taskBody"><h3>{task.title}</h3><p>{task.prompt}</p><small>{task.model} · {task.effort} effort</small></div><div className="taskMeta"><span className="status">{statusLabel[task.status]}</span><b>{duration(task.startedAt, task.finishedAt)}</b></div></article>)}</section></>}
    </section>
    <aside className="inspector"><div className="inspectorTop"><span>LIVE INSPECTOR</span><i className={run?.status === "running" ? "pulse" : ""}>●</i></div>{current ? <><h2>{current.title}</h2><span className={`status ${current.status}`}>{statusLabel[current.status]}</span><dl><dt>Model</dt><dd>{current.model}</dd><dt>Effort</dt><dd>{current.effort}</dd><dt>Started</dt><dd>{time(current.startedAt)}</dd><dt>Elapsed</dt><dd className="timer">{duration(current.startedAt, current.finishedAt)}</dd></dl><h3>Activity</h3><pre>{current.log.slice(-12).join("\n") || "Waiting for the executor…"}</pre>{run?.status === "running" && <button className="danger" onClick={cancel}>Cancel run</button>}</> : <div className="empty">The selected task will show its live details and event output here.</div>}</aside>
  </main>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
