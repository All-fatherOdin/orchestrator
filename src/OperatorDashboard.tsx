import { useEffect, useMemo, useRef, useState } from "react";
import { AuditBundlesDashboard } from "./AuditBundlesDashboard";
import { OutcomeScorecardsDashboard } from "./OutcomeScorecardsDashboard";

export const operatorViews = [
  { id: "overview", label: "Обзор" },
  { id: "execution-bucket", label: "Очередь выполнения" },
  { id: "incidents", label: "Инциденты" },
  { id: "prompt-registry", label: "Реестр промптов" },
  { id: "eval-lineage", label: "История оценок" },
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

const labels: Record<string, string> = { changes: "Изменения", waves: "Волны", activeWaves: "Активные волны", haltedWaves: "Остановленные волны", readyTasks: "Готовые задачи", blockingIncidents: "Блокирующие инциденты", liveRepairLeases: "Активные восстановления", evalRuns: "Запуски оценки", activeChampionDecisions: "Решения по лидеру" };
function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
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
  if (!projection.items.length) return <EmptyState message="Пока нет проверенных журналов проектов." />;
  return <div className="operatorOverview">{projection.items.map((item) => <article className="operatorProject" key={item.sortKey}>
    <div className="operatorProjectHead"><div><small>ПРОЕКТ</small><h3>{item.projectId}</h3></div><span>посл. {projection.sourceWatermarks.find((mark) => mark.projectId === item.projectId)?.sequence ?? 0}</span></div>
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
  if (!projection.items.length) return <EmptyState message={`В выбранной области нет записей раздела «${operatorViews.find((view) => view.id === projection.view)?.label}».`} />;
  return <div className="operatorTable" role="table" aria-label={`Проекция: ${operatorViews.find((view) => view.id === projection.view)?.label}`}>
    <div className="operatorTableHead" role="row"><span>Объект</span><span>Проект</span><span>Состояние</span><span>Данные</span></div>
    {projection.items.map((item) => { const facts = fields.flatMap((key) => item.data[key] === undefined ? [] : [[key, item.data[key]] as const]); const state = facts[0]?.[1] ?? item.kind; return <article className="operatorTableRow" role="row" key={item.sortKey}>
      <div><small>{item.kind.replaceAll("-", " ")}</small><b>{item.entityId}</b><div className="operatorFacts">{facts.slice(1).map(([key, value]) => <span key={key}>{labels[key] ?? key}: <strong>{display(value)}</strong></span>)}</div></div>
      <code>{item.projectId}</code><span className={`operatorState ${tone(state)}`}>{display(state)}</span>
      <div className="operatorEvidence">{item.evidenceRefs.length ? item.evidenceRefs.slice(0, 3).map((evidence) => <code key={evidence}>{evidence}</code>) : <span>—</span>}{projection.view === "incidents" ? <div className="operatorActions"><button onClick={() => onAction({ item, kind: "transition-incident" })}>Перевести</button><button onClick={() => onAction({ item, kind: "resolve-incident" })}>Закрыть</button></div> : null}</div>
    </article>; })}
  </div>;
}
function EmptyState({ message }: { message: string }) { return <div className="operatorEmpty"><span aria-hidden="true">○</span><h3>Нечего показывать</h3><p>{message}</p></div>; }

function ActionDialog({ selection, mark, onClose, onExecuted }: { selection: ActionSelection; mark: OperatorProjection["sourceWatermarks"][number]; onClose: () => void; onExecuted: () => Promise<void> }) {
  const [actor, setActor] = useState(""); const [reason, setReason] = useState("");
  const [transition, setTransition] = useState<"investigating" | "escalated">("investigating");
  const [reasonCode, setReasonCode] = useState("HUMAN_AUTHORITY_REQUIRED");
  const [observation, setObservation] = useState(""); const [correlationWindow, setCorrelationWindow] = useState(3600);
  const [preview, setPreview] = useState<ActionPreview | null>(null); const [receipt, setReceipt] = useState<ActionReceipt | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const closeRef = useRef<HTMLButtonElement>(null);
  const incidentId = String(selection.item.data.incidentId ?? selection.item.entityId); const changeId = String(selection.item.data.changeId ?? "");
  const label = selection.kind === "transition-incident" ? "Перевод инцидента" : "Закрытие инцидента";
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
    try { const response = await fetch("/api/operator-actions/v1/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(await requestForPreview()) }); const body = await response.json(); if (!response.ok) throw new Error(`${body.code ? `${body.code}: ` : ""}${body.error ?? "Не удалось получить предпросмотр."}`); setPreview(body as ActionPreview); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : "Не удалось получить предпросмотр."); }
    finally { setBusy(false); }
  }
  async function executeAction() {
    if (!preview?.allowed) return; setBusy(true); setError("");
    try { const response = await fetch("/api/operator-actions/v1/execute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: preview.request, previewHash: preview.previewHash, confirmed: true }) }); const body = await response.json(); if (!response.ok) throw new Error(`${body.code ? `${body.code}: ` : ""}${body.error ?? "Не удалось выполнить действие."}`); setReceipt(body as ActionReceipt); setPreview(null); await onExecuted(); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : "Не удалось выполнить действие. Обновите данные и повторите предпросмотр."); }
    finally { setBusy(false); }
  }
  const formReady = actor.trim().length > 2 && reason.trim().length > 7 && (selection.kind !== "resolve-incident" || observation.trim().length > 7);
  return <div className="operatorDialogBackdrop" role="presentation"><section className="operatorDialog" role="dialog" aria-modal="true" aria-labelledby="operator-action-title"><header><div><small>ДЕЙСТВИЕ ОПЕРАТОРА</small><h2 id="operator-action-title">{label}</h2></div><button ref={closeRef} aria-label="Закрыть действие оператора" onClick={onClose} disabled={busy}>×</button></header><div className="operatorActionIdentity"><span><small>Проект</small><code>{selection.item.projectId}</code></span><span><small>Цель</small><code>{incidentId}</code></span><span><small>Отметка данных</small><code>{mark.hash?.slice(0, 12) ?? "начало"} · посл. {mark.sequence}</code></span></div>{receipt ? <div className="operatorReceipt" role="status"><b>Неизменяемая квитанция сохранена</b><strong>{receipt.outcome}</strong><code>{receipt.receiptId}</code><p>{receipt.canonicalEvent?.eventType ?? "Нет канонического события"} · последовательность {receipt.resultingProjectSequence ?? "—"}</p><small>Хеш квитанции {receipt.receiptHash}</small></div> : <><div className="operatorActionForm"><label>Оператор<input value={actor} placeholder="human:operator-id" onChange={(event) => { setActor(event.target.value); invalidate(); }} /></label><label>Обязательное обоснование<textarea value={reason} placeholder="Объясните, почему это действие разрешено сейчас." onChange={(event) => { setReason(event.target.value); invalidate(); }} /></label>{selection.kind === "transition-incident" ? <div className="operatorActionGrid"><label>Переход<select value={transition} onChange={(event) => { setTransition(event.target.value as typeof transition); invalidate(); }}><option value="investigating">Расследуется</option><option value="escalated">Эскалирован</option></select></label><label>Код причины<input value={reasonCode} onChange={(event) => { setReasonCode(event.target.value); invalidate(); }} /></label></div> : <><label>Результат проверки закрытия<textarea value={observation} placeholder="Запишите ограниченный результат проверки оператором." onChange={(event) => { setObservation(event.target.value); invalidate(); }} /></label><label>Окно корреляции (секунды)<input type="number" min="1" value={correlationWindow} onChange={(event) => { setCorrelationWindow(Number(event.target.value)); invalidate(); }} /></label></>}</div>{preview ? <div className={`operatorPreview ${preview.allowed ? "allowed" : "denied"}`} role="status"><div><b>{preview.allowed ? "Предпросмотр разрешён" : "Предпросмотр отклонён"}</b><span>{preview.expectedCanonicalEventType ?? preview.reasonCodes.join(", ")}</span></div><code>{preview.currentSourceWatermark.slice(0, 16)}</code>{preview.warnings.length ? <p>Предупреждения: {preview.warnings.join(", ")}</p> : null}</div> : null}{error ? <p className="operatorActionError" role="alert">{error}</p> : null}<footer><button className="secondary" onClick={onClose} disabled={busy}>Отмена</button><button onClick={() => void previewAction()} disabled={busy || !formReady}>{busy ? "Проверка…" : "Обновить предпросмотр"}</button><button className="dangerAction" onClick={() => void executeAction()} disabled={busy || !preview?.allowed}>Подтвердить и выполнить</button></footer></>}</section></div>;
}

export function OperatorDashboard() {
  const [section, setSection] = useState<"projections" | "audit" | "outcomes">("projections");
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
      if (!response.ok) throw new Error(`${"code" in body && body.code ? `${body.code}: ` : ""}${"error" in body && body.error ? body.error : "Не удалось загрузить проекцию."}`);
      if (requestId === requestIdRef.current) setProjection(body as OperatorProjection);
    } catch (reason) {
      if (requestId === requestIdRef.current) { setProjection(null); setError(reason instanceof Error ? reason.message : "Не удалось загрузить проекцию."); }
    }
    finally { if (requestId === requestIdRef.current) setLoading(false); }
  }
  useEffect(() => { void load(view, cursor); }, [view, cursor]);
  const totals = useMemo(() => ({ sources: Number(projection?.aggregates.totalSources ?? 0), available: Number(projection?.aggregates.availableSources ?? 0), unavailable: Number(projection?.aggregates.unavailableSources ?? 0), records: projection?.page.totalItems ?? 0 }), [projection]);
  function selectView(next: OperatorView) { setView(next); setProjection(null); setCursorHistory([]); }
  return <section className="operatorPage">
    <header className="operatorHeader"><div><h1>Панель управления</h1><p>Операционные данные и явно подтверждённые действия по проверенным журналам проектов.</p></div><button className="operatorRefresh" onClick={() => void load()} disabled={loading}><RefreshIcon /> Обновить</button></header>
    <nav className="operatorTabs" aria-label="Разделы панели управления">{operatorViews.map((item) => <button key={item.id} className={section === "projections" && view === item.id ? "active" : ""} onClick={() => { setSection("projections"); selectView(item.id); }}>{item.label}</button>)}<button className={section === "audit" ? "active" : ""} onClick={() => { setSection("audit"); setAction(null); }}>Пакеты аудита</button><button className={section === "outcomes" ? "active" : ""} onClick={() => { setSection("outcomes"); setAction(null); }}>Сводки результатов</button></nav>
    {section === "audit" ? <AuditBundlesDashboard /> : section === "outcomes" ? <OutcomeScorecardsDashboard /> : <>
    <div className="operatorSummary" aria-label="Сводка проекции"><div><span>Источники</span><strong>{totals.sources}</strong></div><div><span>Доступно</span><strong>{totals.available}</strong></div><div><span>Недоступно</span><strong className={totals.unavailable ? "alert" : ""}>{totals.unavailable}</strong></div><div><span>Записи</span><strong>{totals.records}</strong></div><div className="operatorWatermark"><span>Отметка данных</span><code>{projection?.sourceWatermark.slice(0, 12) ?? "ожидание"}</code></div></div>
    {projection?.warnings.length ? <div className="operatorWarnings" role="status">{projection.warnings.map((warning) => <p key={`${warning.sourceRef}-${warning.message}`}><b>{warning.code.replaceAll("_", " ")}</b><span>{warning.projectId ?? warning.sourceRef}</span><small>{warning.message}</small></p>)}</div> : null}
    {loading ? <div className="operatorLoading"><i /><span>Чтение канонических проекций…</span></div> : error ? <div className="operatorError" role="alert"><b>Проекция недоступна</b><p>{error}</p><button onClick={() => { setCursorHistory([]); void load(view, undefined); }}>Повторить с текущими источниками</button></div> : projection ? <>{view === "overview" ? <Overview projection={projection} /> : <ProjectionTable projection={projection} onAction={setAction} />}<footer className="operatorPagination"><span>{projection.page.totalItems ? `${cursorHistory.length * projection.page.limit + 1}–${Math.min((cursorHistory.length + 1) * projection.page.limit, projection.page.totalItems)} из ${projection.page.totalItems}` : "0 записей"}</span><button aria-label="Предыдущая страница" disabled={!cursorHistory.length || loading} onClick={() => setCursorHistory((items) => items.slice(0, -1))}><ArrowIcon direction="left" /></button><button aria-label="Следующая страница" disabled={!projection.page.nextCursor || loading} onClick={() => setCursorHistory((items) => [...items, projection.page.nextCursor!])}><ArrowIcon direction="right" /></button></footer></> : null}
    {action && projection ? <ActionDialog selection={action} mark={projection.sourceWatermarks.find((item) => item.projectId === action.item.projectId)!} onClose={() => setAction(null)} onExecuted={async () => { await load(view, cursor); }} /> : null}</>}
  </section>;
}
