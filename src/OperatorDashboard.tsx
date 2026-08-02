import { useEffect, useMemo, useState } from "react";

export const operatorViews = [
  { id: "overview", label: "Overview" },
  { id: "execution-bucket", label: "Execution bucket" },
  { id: "incidents", label: "Incidents" },
  { id: "prompt-registry", label: "Prompt registry" },
  { id: "eval-lineage", label: "Eval lineage" },
] as const;
export type OperatorView = (typeof operatorViews)[number]["id"];

type ProjectionItem = { kind: string; projectId: string; entityId: string; sortKey: string; evidenceRefs: string[]; data: Record<string, unknown> };
type OperatorProjection = {
  contractType: "OperatorProjectionV1"; contractVersion: "1.0"; view: OperatorView; generatedAt: string;
  sourceWatermarks: Array<{ projectId: string; sourceRef: string; sequence: number; hash: string | null }>;
  sourceWatermark: string; scope: { mode: "all" | "selected"; projectIds: string[] };
  page: { limit: number; cursor: string | null; nextCursor: string | null; totalItems: number };
  aggregates: Record<string, unknown>; items: ProjectionItem[];
  warnings: Array<{ code: "SOURCE_UNAVAILABLE" | "UNSUPPORTED_DIMENSION"; sourceRef: string; projectId?: string; message: string }>;
};

const labels: Record<string, string> = { changes: "Changes", waves: "Waves", activeWaves: "Active waves", haltedWaves: "Halted waves", readyTasks: "Ready tasks", blockingIncidents: "Blocking incidents", liveRepairLeases: "Live repair leases", evalRuns: "Eval runs", activeChampionDecisions: "Champion decisions" };
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(display).join(", ") : "—";
  return JSON.stringify(value);
}
function tone(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  if (["failed", "halted", "critical", "blocking", "revoked", "unavailable", "not_comparable"].some((token) => text.includes(token))) return "danger";
  if (["ready", "passed", "completed", "published", "active", "sealed", "comparable", "promote"].some((token) => text.includes(token))) return "success";
  if (["unsupported", "interrupted", "running", "warning", "inconclusive"].some((token) => text.includes(token))) return "warning";
  return "neutral";
}
function RefreshIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7" /></svg>; }
function ArrowIcon({ direction }: { direction: "left" | "right" }) { return <svg viewBox="0 0 24 24" aria-hidden="true" className={direction === "left" ? "reverse" : ""}><path d="m9 18 6-6-6-6" /></svg>; }

function Overview({ projection }: { projection: OperatorProjection }) {
  if (!projection.items.length) return <EmptyState message="No validated project ledgers are available yet." />;
  return <div className="operatorOverview">{projection.items.map((item) => <article className="operatorProject" key={item.sortKey}>
    <div className="operatorProjectHead"><div><small>PROJECT</small><h3>{item.projectId}</h3></div><span>seq {projection.sourceWatermarks.find((mark) => mark.projectId === item.projectId)?.sequence ?? 0}</span></div>
    <div className="operatorMetricRail">{Object.entries(item.data).map(([key, value]) => <div key={key}><span>{labels[key] ?? key}</span><strong>{display(value)}</strong></div>)}</div>
  </article>)}</div>;
}

const primaryFields: Record<Exclude<OperatorView, "overview">, string[]> = {
  "execution-bucket": ["status", "dispatchable", "changeId"], incidents: ["state", "severity", "blocking", "haltIds"],
  "prompt-registry": ["status", "artifactKind", "requestedModelClass", "role", "providerModelId"],
  "eval-lineage": ["state", "status", "executionMode", "decision", "unsupportedDimensions"],
};
function ProjectionTable({ projection }: { projection: OperatorProjection }) {
  const fields = primaryFields[projection.view as Exclude<OperatorView, "overview">];
  if (!projection.items.length) return <EmptyState message={`No ${operatorViews.find((view) => view.id === projection.view)?.label.toLowerCase()} records match this scope.`} />;
  return <div className="operatorTable" role="table" aria-label={`${projection.view} projection`}>
    <div className="operatorTableHead" role="row"><span>Entity</span><span>Project</span><span>State</span><span>Evidence</span></div>
    {projection.items.map((item) => { const facts = fields.flatMap((key) => item.data[key] === undefined ? [] : [[key, item.data[key]] as const]); const state = facts[0]?.[1] ?? item.kind; return <article className="operatorTableRow" role="row" key={item.sortKey}>
      <div><small>{item.kind.replaceAll("-", " ")}</small><b>{item.entityId}</b><div className="operatorFacts">{facts.slice(1).map(([key, value]) => <span key={key}>{labels[key] ?? key}: <strong>{display(value)}</strong></span>)}</div></div>
      <code>{item.projectId}</code><span className={`operatorState ${tone(state)}`}>{display(state)}</span>
      <div className="operatorEvidence">{item.evidenceRefs.length ? item.evidenceRefs.slice(0, 3).map((evidence) => <code key={evidence}>{evidence}</code>) : <span>—</span>}</div>
    </article>; })}
  </div>;
}
function EmptyState({ message }: { message: string }) { return <div className="operatorEmpty"><span aria-hidden="true">○</span><h3>Nothing to show</h3><p>{message}</p></div>; }

export function OperatorDashboard() {
  const [view, setView] = useState<OperatorView>("overview");
  const [projection, setProjection] = useState<OperatorProjection | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]); const cursor = cursorHistory.at(-1);
  async function load(targetView = view, targetCursor = cursor) {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ limit: "25" }); if (targetCursor) query.set("cursor", targetCursor);
      const response = await fetch(`/api/operator-projections/v1/${targetView}?${query}`, { cache: "no-store" });
      const body = await response.json() as OperatorProjection | { error?: string; code?: string };
      if (!response.ok) throw new Error(`${"code" in body && body.code ? `${body.code}: ` : ""}${"error" in body && body.error ? body.error : "Projection request failed."}`);
      setProjection(body as OperatorProjection);
    } catch (reason) { setProjection(null); setError(reason instanceof Error ? reason.message : "Projection request failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(view, cursor); }, [view, cursor]);
  const totals = useMemo(() => ({ sources: Number(projection?.aggregates.totalSources ?? 0), available: Number(projection?.aggregates.availableSources ?? 0), unavailable: Number(projection?.aggregates.unavailableSources ?? 0), records: projection?.page.totalItems ?? 0 }), [projection]);
  function selectView(next: OperatorView) { setView(next); setProjection(null); setCursorHistory([]); }
  return <section className="operatorPage">
    <header className="operatorHeader"><div><h1>Control plane</h1><p>Read-only operational evidence across validated project ledgers.</p></div><button className="operatorRefresh" onClick={() => void load()} disabled={loading}><RefreshIcon /> Refresh</button></header>
    <nav className="operatorTabs" aria-label="Operator views">{operatorViews.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => selectView(item.id)}>{item.label}</button>)}</nav>
    <div className="operatorSummary" aria-label="Projection summary"><div><span>Sources</span><strong>{totals.sources}</strong></div><div><span>Available</span><strong>{totals.available}</strong></div><div><span>Unavailable</span><strong className={totals.unavailable ? "alert" : ""}>{totals.unavailable}</strong></div><div><span>Records</span><strong>{totals.records}</strong></div><div className="operatorWatermark"><span>Watermark</span><code>{projection?.sourceWatermark.slice(0, 12) ?? "waiting"}</code></div></div>
    {projection?.warnings.length ? <div className="operatorWarnings" role="status">{projection.warnings.map((warning) => <p key={`${warning.sourceRef}-${warning.message}`}><b>{warning.code.replaceAll("_", " ")}</b><span>{warning.projectId ?? warning.sourceRef}</span><small>{warning.message}</small></p>)}</div> : null}
    {loading ? <div className="operatorLoading"><i /><span>Reading canonical projections…</span></div> : error ? <div className="operatorError" role="alert"><b>Projection unavailable</b><p>{error}</p><button onClick={() => { setCursorHistory([]); void load(view, undefined); }}>Retry from current sources</button></div> : projection ? <>{view === "overview" ? <Overview projection={projection} /> : <ProjectionTable projection={projection} />}<footer className="operatorPagination"><span>{projection.page.totalItems ? `${cursorHistory.length * projection.page.limit + 1}–${Math.min((cursorHistory.length + 1) * projection.page.limit, projection.page.totalItems)} of ${projection.page.totalItems}` : "0 records"}</span><button aria-label="Previous page" disabled={!cursorHistory.length || loading} onClick={() => setCursorHistory((items) => items.slice(0, -1))}><ArrowIcon direction="left" /></button><button aria-label="Next page" disabled={!projection.page.nextCursor || loading} onClick={() => setCursorHistory((items) => [...items, projection.page.nextCursor!])}><ArrowIcon direction="right" /></button></footer></> : null}
  </section>;
}
