import { useEffect, useMemo, useRef, useState } from "react";
import { AuditBundlesDashboard } from "./AuditBundlesDashboard";

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

type OperatorActionKind = "transition-incident" | "resolve-incident";
type ActionSelection = { item: ProjectionItem; kind: OperatorActionKind };
type ActionPreview = {
  request: Record<string, unknown>; previewHash: string; allowed: boolean;
  reasonCodes: string[]; warnings: string[]; currentSourceWatermark: string;
  expectedCanonicalEventType: string | null; evidenceRefs: string[];
};
type ActionReceipt = {
  receiptId: string; actionKind: string; outcome: string; reasonCodes: string[];
  canonicalEvent: { eventId: string; eventType: string; eventHash: string } | null;
  resultingProjectSequence: number | null; resultingProjectHash: string | null;
  receiptHash: string;
};

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function operatorActionSourceWatermark(mark: OperatorProjection["sourceWatermarks"][number]): Promise<string> {
  return sha256({ sourceWatermarks: [{ ...mark, sourceRef: `change-control:${mark.projectId}` }], unavailable: [] });
}

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
function ProjectionTable({ projection, onAction }: { projection: OperatorProjection; onAction: (selection: ActionSelection) => void }) {
  const fields = primaryFields[projection.view as Exclude<OperatorView, "overview">];
  if (!projection.items.length) return <EmptyState message={`No ${operatorViews.find((view) => view.id === projection.view)?.label.toLowerCase()} records match this scope.`} />;
  return <div className="operatorTable" role="table" aria-label={`${projection.view} projection`}>
    <div className="operatorTableHead" role="row"><span>Entity</span><span>Project</span><span>State</span><span>Evidence</span></div>
    {projection.items.map((item) => { const facts = fields.flatMap((key) => item.data[key] === undefined ? [] : [[key, item.data[key]] as const]); const state = facts[0]?.[1] ?? item.kind; return <article className="operatorTableRow" role="row" key={item.sortKey}>
      <div><small>{item.kind.replaceAll("-", " ")}</small><b>{item.entityId}</b><div className="operatorFacts">{facts.slice(1).map(([key, value]) => <span key={key}>{labels[key] ?? key}: <strong>{display(value)}</strong></span>)}</div></div>
      <code>{item.projectId}</code><span className={`operatorState ${tone(state)}`}>{display(state)}</span>
      <div className="operatorEvidence">{item.evidenceRefs.length ? item.evidenceRefs.slice(0, 3).map((evidence) => <code key={evidence}>{evidence}</code>) : <span>—</span>}{projection.view === "incidents" ? <div className="operatorActions"><button onClick={() => onAction({ item, kind: "transition-incident" })}>Transition</button><button onClick={() => onAction({ item, kind: "resolve-incident" })}>Resolve</button></div> : null}</div>
    </article>; })}
  </div>;
}
function EmptyState({ message }: { message: string }) { return <div className="operatorEmpty"><span aria-hidden="true">○</span><h3>Nothing to show</h3><p>{message}</p></div>; }

function ActionDialog({ selection, mark, onClose, onExecuted }: { selection: ActionSelection; mark: OperatorProjection["sourceWatermarks"][number]; onClose: () => void; onExecuted: () => Promise<void> }) {
  const [actor, setActor] = useState(""); const [reason, setReason] = useState("");
  const [transition, setTransition] = useState<"investigating" | "escalated">("investigating");
  const [reasonCode, setReasonCode] = useState("HUMAN_AUTHORITY_REQUIRED");
  const [observation, setObservation] = useState(""); const [correlationWindow, setCorrelationWindow] = useState(3600);
  const [preview, setPreview] = useState<ActionPreview | null>(null); const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const closeRef = useRef<HTMLButtonElement>(null);
  const incidentId = String(selection.item.data.incidentId ?? selection.item.entityId); const changeId = String(selection.item.data.changeId ?? "");
  const label = selection.kind === "transition-incident" ? "Transition incident" : "Resolve incident";
  useEffect(() => { closeRef.current?.focus(); const listener = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) onClose(); }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, [busy, onClose]);
  function invalidate() { setPreview(null); setReceipt(null); setError(""); }
  async function requestForPreview() {
    const requestId = crypto.randomUUID(); const sourceWatermark = await operatorActionSourceWatermark(mark);
    const base = { contractType: "OperatorActionRequestV1", contractVersion: "1.0", requestId, actionKind: selection.kind, target: { projectId: selection.item.projectId, changeId, incidentId }, actor: actor.trim(), reason: reason.trim(), expectedSourceWatermark: sourceWatermark, expectedProjectSequence: mark.sequence, expectedProjectHash: mark.hash, idempotencyKey: `${selection.item.projectId}:${selection.kind}:${requestId}` };
    if (selection.kind === "transition-incident") return { ...base, input: { to: transition, reasonCode, evidenceRefs: selection.item.evidenceRefs } };
    const receiptId = crypto.randomUUID();
    return { ...base, input: { receipt: { contractType: "IncidentResolutionReceiptV1", contractVersion: "1.0", receiptId, incidentId, projectId: selection.item.projectId, changeId, resolutionKind: "resolved", oracle: { kind: "human", outcome: "passed", observationResult: observation.trim() }, noActiveHealing: true, evidenceRefs: selection.item.evidenceRefs, resolvedBy: actor.trim(), taxonomyPolicyVersion: "halt-taxonomy-v1", correlationWindowSeconds: correlationWindow } } };
  }
  async function previewAction() {
    setBusy(true); setError(""); setReceipt(null);
    try { const response = await fetch("/api/operator-actions/v1/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(await requestForPreview()) }); const body = await response.json(); if (!response.ok) throw new Error(`${body.code ? `${body.code}: ` : ""}${body.error ?? "Preview failed."}`); setPreview(body as ActionPreview); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : "Preview failed."); }
    finally { setBusy(false); }
  }
  async function executeAction() {
    if (!preview?.allowed) return; setBusy(true); setError("");
    try { const response = await fetch("/api/operator-actions/v1/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: preview.request, previewHash: preview.previewHash, confirmed: true }) }); const body = await response.json(); if (!response.ok) throw new Error(`${body.code ? `${body.code}: ` : ""}${body.error ?? "Execution failed."}`); setReceipt(body as ActionReceipt); setPreview(null); await onExecuted(); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : "Execution failed. Refresh evidence and preview again."); }
    finally { setBusy(false); }
  }
  const formReady = actor.trim().length > 2 && reason.trim().length > 7 && (selection.kind !== "resolve-incident" || observation.trim().length > 7);
  return <div className="operatorDialogBackdrop" role="presentation"><section className="operatorDialog" role="dialog" aria-modal="true" aria-labelledby="operator-action-title"><header><div><small>OPERATOR ACTION</small><h2 id="operator-action-title">{label}</h2></div><button ref={closeRef} aria-label="Close operator action" onClick={onClose} disabled={busy}>×</button></header><div className="operatorActionIdentity"><span><small>Project</small><code>{selection.item.projectId}</code></span><span><small>Target</small><code>{incidentId}</code></span><span><small>Evidence watermark</small><code>{mark.hash?.slice(0, 12) ?? "genesis"} · seq {mark.sequence}</code></span></div>{receipt ? <div className="operatorReceipt" role="status"><b>Immutable receipt recorded</b><strong>{receipt.outcome}</strong><code>{receipt.receiptId}</code><p>{receipt.canonicalEvent?.eventType ?? "No canonical event"} · sequence {receipt.resultingProjectSequence ?? "—"}</p><small>Receipt hash {receipt.receiptHash}</small></div> : <><div className="operatorActionForm"><label>Actor<input value={actor} placeholder="human:operator-id" onChange={(event) => { setActor(event.target.value); invalidate(); }} /></label><label>Required reason<textarea value={reason} placeholder="Explain why this action is authorized now." onChange={(event) => { setReason(event.target.value); invalidate(); }} /></label>{selection.kind === "transition-incident" ? <div className="operatorActionGrid"><label>Transition<select value={transition} onChange={(event) => { setTransition(event.target.value as typeof transition); invalidate(); }}><option value="investigating">Investigating</option><option value="escalated">Escalated</option></select></label><label>Reason code<input value={reasonCode} onChange={(event) => { setReasonCode(event.target.value); invalidate(); }} /></label></div> : <><label>Passed resolution observation<textarea value={observation} placeholder="Record the bounded human oracle result." onChange={(event) => { setObservation(event.target.value); invalidate(); }} /></label><label>Correlation window (seconds)<input type="number" min="1" value={correlationWindow} onChange={(event) => { setCorrelationWindow(Number(event.target.value)); invalidate(); }} /></label></>}</div>{preview ? <div className={`operatorPreview ${preview.allowed ? "allowed" : "denied"}`} role="status"><div><b>{preview.allowed ? "Preview allowed" : "Preview denied"}</b><span>{preview.expectedCanonicalEventType ?? preview.reasonCodes.join(", ")}</span></div><code>{preview.currentSourceWatermark.slice(0, 16)}</code>{preview.warnings.length ? <p>Warnings: {preview.warnings.join(", ")}</p> : null}</div> : null}{error ? <p className="operatorActionError" role="alert">{error}</p> : null}<footer><button className="secondary" onClick={onClose} disabled={busy}>Cancel</button><button onClick={() => void previewAction()} disabled={busy || !formReady}>{busy ? "Checking…" : "Get fresh preview"}</button><button className="dangerAction" onClick={() => void executeAction()} disabled={busy || !preview?.allowed}>Confirm and execute</button></footer></>}</section></div>;
}

export function OperatorDashboard() {
  const [section, setSection] = useState<"projections" | "audit">("projections");
  const [view, setView] = useState<OperatorView>("overview");
  const [projection, setProjection] = useState<OperatorProjection | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [cursorHistory, setCursorHistory] = useState<string[]>([]); const cursor = cursorHistory.at(-1);
  const requestIdRef = useRef(0);
  const [action, setAction] = useState<ActionSelection | null>(null);
  async function load(targetView = view, targetCursor = cursor) {
    const requestId = ++requestIdRef.current;
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ limit: "25" }); if (targetCursor) query.set("cursor", targetCursor);
      const response = await fetch(`/api/operator-projections/v1/${targetView}?${query}`, { cache: "no-store" });
      const body = await response.json() as OperatorProjection | { error?: string; code?: string };
      if (!response.ok) throw new Error(`${"code" in body && body.code ? `${body.code}: ` : ""}${"error" in body && body.error ? body.error : "Projection request failed."}`);
      if (requestId === requestIdRef.current) setProjection(body as OperatorProjection);
    } catch (reason) {
      if (requestId === requestIdRef.current) { setProjection(null); setError(reason instanceof Error ? reason.message : "Projection request failed."); }
    }
    finally { if (requestId === requestIdRef.current) setLoading(false); }
  }
  useEffect(() => { void load(view, cursor); }, [view, cursor]);
  const totals = useMemo(() => ({ sources: Number(projection?.aggregates.totalSources ?? 0), available: Number(projection?.aggregates.availableSources ?? 0), unavailable: Number(projection?.aggregates.unavailableSources ?? 0), records: projection?.page.totalItems ?? 0 }), [projection]);
  function selectView(next: OperatorView) { setView(next); setProjection(null); setCursorHistory([]); }
  return <section className="operatorPage">
    <header className="operatorHeader"><div><h1>Control plane</h1><p>Operational evidence and explicitly confirmed actions across validated project ledgers.</p></div><button className="operatorRefresh" onClick={() => void load()} disabled={loading}><RefreshIcon /> Refresh</button></header>
    <nav className="operatorTabs" aria-label="Operator views">{operatorViews.map((item) => <button key={item.id} className={section === "projections" && view === item.id ? "active" : ""} onClick={() => { setSection("projections"); selectView(item.id); }}>{item.label}</button>)}<button className={section === "audit" ? "active" : ""} onClick={() => { setSection("audit"); setAction(null); }}>Audit bundles</button></nav>
    {section === "audit" ? <AuditBundlesDashboard /> : <>
    <div className="operatorSummary" aria-label="Projection summary"><div><span>Sources</span><strong>{totals.sources}</strong></div><div><span>Available</span><strong>{totals.available}</strong></div><div><span>Unavailable</span><strong className={totals.unavailable ? "alert" : ""}>{totals.unavailable}</strong></div><div><span>Records</span><strong>{totals.records}</strong></div><div className="operatorWatermark"><span>Watermark</span><code>{projection?.sourceWatermark.slice(0, 12) ?? "waiting"}</code></div></div>
    {projection?.warnings.length ? <div className="operatorWarnings" role="status">{projection.warnings.map((warning) => <p key={`${warning.sourceRef}-${warning.message}`}><b>{warning.code.replaceAll("_", " ")}</b><span>{warning.projectId ?? warning.sourceRef}</span><small>{warning.message}</small></p>)}</div> : null}
    {loading ? <div className="operatorLoading"><i /><span>Reading canonical projections…</span></div> : error ? <div className="operatorError" role="alert"><b>Projection unavailable</b><p>{error}</p><button onClick={() => { setCursorHistory([]); void load(view, undefined); }}>Retry from current sources</button></div> : projection ? <>{view === "overview" ? <Overview projection={projection} /> : <ProjectionTable projection={projection} onAction={setAction} />}<footer className="operatorPagination"><span>{projection.page.totalItems ? `${cursorHistory.length * projection.page.limit + 1}–${Math.min((cursorHistory.length + 1) * projection.page.limit, projection.page.totalItems)} of ${projection.page.totalItems}` : "0 records"}</span><button aria-label="Previous page" disabled={!cursorHistory.length || loading} onClick={() => setCursorHistory((items) => items.slice(0, -1))}><ArrowIcon direction="left" /></button><button aria-label="Next page" disabled={!projection.page.nextCursor || loading} onClick={() => setCursorHistory((items) => [...items, projection.page.nextCursor!])}><ArrowIcon direction="right" /></button></footer></> : null}
    {action && projection ? <ActionDialog selection={action} mark={projection.sourceWatermarks.find((item) => item.projectId === action.item.projectId)!} onClose={() => setAction(null)} onExecuted={async () => { await load(view, cursor); }} /> : null}</>}
  </section>;
}
