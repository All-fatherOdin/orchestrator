import { useEffect, useRef, useState } from "react";
import type { Observation, OperationalEvidenceProjection, Receipt } from "./OperationalEvidenceIntakeDashboard";

type Workflow = "source" | "import" | "attribution";
type Identity = { requestId: string; idempotencyKey: string };
type Preview = {
  contractType: "OperationalOutcomePreviewV1"; contractVersion: "1.0"; requestId: string;
  allowed: boolean; reasonCodes: string[]; sourceWatermark: { sequence: number; hash: string | null };
  contentHash: string; observationCount: number; wouldMutate: false;
};
type Request = Record<string, unknown> & Identity & { observedProject: { sequence: number; hash: string | null } };
type PendingResult = { request: Request; endpoint: string; label: string };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const PROHIBITED_KEYS = new Set(["rawpayload", "promptbody", "hiddenreasoning", "credential", "credentials", "secret", "secrets", "stacktrace", "logs", "filecontent", "customercontent", "personaldata", "invoicedocument", "paymentdetails", "accountnumber", "taxidentifier"]);
const OBSERVATION_KEYS: Record<string, Set<string>> = {
  DeploymentObservationV1: new Set(["contractType", "contractVersion", "observationId", "sourceRecordId", "occurredAt", "evidenceRefs", "supersedesObservationId", "changeId", "commitSha", "treeSha", "environmentClass", "outcome", "predecessorObservationId"]),
  PostDeliveryDefectObservationV1: new Set(["contractType", "contractVersion", "observationId", "sourceRecordId", "occurredAt", "evidenceRefs", "supersedesObservationId", "detectedAt", "releasedCommitSha", "releasedTreeSha", "severity", "defectClass", "lifecycleState", "candidateChangeIds"]),
  ProviderCostObservationV1: new Set(["contractType", "contractVersion", "observationId", "sourceRecordId", "occurredAt", "evidenceRefs", "supersedesObservationId", "changeId", "runId", "taskId", "attemptId", "invocationId", "provider", "billingPeriod", "currency", "minorUnits", "measurementState"]),
};
const KIND_FOR_TYPE: Record<string, string> = { DeploymentObservationV1: "deployment", PostDeliveryDefectObservationV1: "post-delivery-defect", ProviderCostObservationV1: "provider-cost" };
const REQUIRED_KEYS: Record<string, string[]> = {
  DeploymentObservationV1: ["contractType", "contractVersion", "observationId", "sourceRecordId", "occurredAt", "evidenceRefs", "changeId", "commitSha", "treeSha", "environmentClass", "outcome"],
  PostDeliveryDefectObservationV1: ["contractType", "contractVersion", "observationId", "sourceRecordId", "occurredAt", "evidenceRefs", "detectedAt", "releasedCommitSha", "releasedTreeSha", "severity", "defectClass", "lifecycleState", "candidateChangeIds"],
  ProviderCostObservationV1: ["contractType", "contractVersion", "observationId", "sourceRecordId", "occurredAt", "evidenceRefs", "changeId", "runId", "taskId", "attemptId", "invocationId", "provider", "billingPeriod", "currency", "minorUnits", "measurementState"],
};

function bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function identity(): Identity {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  return { requestId: `phase11:${suffix}`, idempotencyKey: `phase11:${suffix}:once` };
}
function canonicalTimestamp(value: unknown): value is string {
  return typeof value === "string" && TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}
function noProhibitedFields(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  if (Array.isArray(value)) return value.every(noProhibitedFields);
  return Object.entries(value as Record<string, unknown>).every(([key, child]) => !PROHIBITED_KEYS.has(key.toLowerCase()) && noProhibitedFields(child));
}
function strings(value: unknown, max: number, identifier = false): value is string[] {
  return Array.isArray(value) && value.length <= max && new Set(value).size === value.length && value.every((item) => typeof item === "string" && item.length > 0 && item.length <= (identifier ? 128 : 256) && (!identifier || IDENTIFIER.test(item)));
}
function observationValid(value: unknown, allowedKinds: readonly string[]): value is Observation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>; const type = String(item.contractType ?? ""); const keys = OBSERVATION_KEYS[type];
  if (!keys || !allowedKinds.includes(KIND_FOR_TYPE[type]) || Object.keys(item).some((key) => !keys.has(key)) || REQUIRED_KEYS[type].some((key) => !(key in item))) return false;
  if (item.contractVersion !== "1.0" || !IDENTIFIER.test(String(item.observationId ?? "")) || !IDENTIFIER.test(String(item.sourceRecordId ?? "")) || !canonicalTimestamp(item.occurredAt) || !strings(item.evidenceRefs, 50)) return false;
  if (item.supersedesObservationId !== undefined && !IDENTIFIER.test(String(item.supersedesObservationId))) return false;
  if (type === "DeploymentObservationV1") return IDENTIFIER.test(String(item.changeId ?? "")) && SHA.test(String(item.commitSha ?? "")) && SHA.test(String(item.treeSha ?? "")) && ["production", "staging", "canary"].includes(String(item.environmentClass)) && ["succeeded", "failed", "rolled-back", "hotfix", "production-rework"].includes(String(item.outcome)) && (item.predecessorObservationId === undefined || IDENTIFIER.test(String(item.predecessorObservationId)));
  if (type === "PostDeliveryDefectObservationV1") return canonicalTimestamp(item.detectedAt) && SHA.test(String(item.releasedCommitSha ?? "")) && SHA.test(String(item.releasedTreeSha ?? "")) && ["low", "medium", "high", "critical"].includes(String(item.severity)) && IDENTIFIER.test(String(item.defectClass ?? "")) && ["open", "resolved", "closed"].includes(String(item.lifecycleState)) && strings(item.candidateChangeIds, 20, true) && item.candidateChangeIds.length > 0;
  return IDENTIFIER.test(String(item.changeId ?? "")) && ["runId", "taskId", "attemptId", "invocationId", "provider"].every((key) => IDENTIFIER.test(String(item[key] ?? ""))) && /^[0-9]{4}-[0-9]{2}$/.test(String(item.billingPeriod ?? "")) && /^[A-Z]{3}$/.test(String(item.currency ?? "")) && Number.isSafeInteger(item.minorUnits) && ["measured", "credited"].includes(String(item.measurementState));
}

export function parseOperationalObservationDraft(raw: string, allowedKinds: readonly string[]): Observation[] {
  if (bytes(raw) > 65_536) throw Object.assign(new Error("Черновик превышает 65 536 байт."), { code: "OUTCOME_MANIFEST_TOO_LARGE" });
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw Object.assign(new Error("Требуется корректный JSON-массив наблюдений."), { code: "OUTCOME_MANIFEST_INVALID" }); }
  if (!noProhibitedFields(parsed)) throw Object.assign(new Error("Черновик содержит запрещённые поля."), { code: "OUTCOME_PRIVACY_VIOLATION" });
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 100 || !parsed.every((item) => observationValid(item, allowedKinds))) throw Object.assign(new Error("Нужен закрытый массив из 1–100 наблюдений разрешённого типа."), { code: "OUTCOME_MANIFEST_INVALID" });
  return structuredClone(parsed) as Observation[];
}

export function operationalRequestFitsLimit(request: unknown): boolean { return bytes(JSON.stringify(request)) <= 65_536; }
export function operationalPreviewMatches(request: Request, preview: Preview, watermark: OperationalEvidenceProjection["watermark"]): boolean {
  return request.requestId === preview.requestId && request.observedProject.sequence === watermark.sequence && request.observedProject.hash === watermark.hash && preview.sourceWatermark.sequence === watermark.sequence && preview.sourceWatermark.hash === watermark.hash;
}

async function postOutcome<T>(path: string, request: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }); }
  catch { throw Object.assign(new Error("Результат запроса неизвестен. Сначала сверьте квитанции."), { code: "AMBIGUOUS_TRANSPORT" }); }
  const body = await response.json().catch(() => ({})) as T & { code?: string };
  if (!response.ok) throw Object.assign(new Error("Операция отклонена сервером."), { code: body.code ?? "SOURCE_UNAVAILABLE" });
  return body;
}

function ReceiptPanel({ receipt }: { receipt: Receipt }) {
  return <div className="intakeMutationReceipt" role="status"><b>Неизменяемая квитанция получена</b><span>{receipt.operationKind}</span><code>{receipt.receiptId}</code><p>Результат · посл. {receipt.resultingWatermark.sequence} · {receipt.receiptHash.slice(0, 18)}</p></div>;
}
function ErrorPanel({ error, onReconcile, onRetry, reconciling }: { error: { code: string; message: string }; onReconcile?: () => void; onRetry?: () => void; reconciling?: boolean }) {
  return <div className={`intakeWorkflowError ${error.code === "AMBIGUOUS_TRANSPORT" ? "ambiguous" : ""}`} role="alert"><small>{error.code}</small><b>{error.message}</b><div>{onReconcile ? <button onClick={onReconcile} disabled={reconciling}>{reconciling ? "Сверяем…" : "Сверить квитанции"}</button> : null}{onRetry ? <button onClick={onRetry} disabled={reconciling}>Повторить тот же запрос</button> : null}</div></div>;
}

export function OperationalEvidenceWorkflows({ projectId, changeId, projection, onRefresh }: { projectId: string; changeId: string; projection: OperationalEvidenceProjection; onRefresh: () => Promise<OperationalEvidenceProjection | null> }) {
  const [workflow, setWorkflow] = useState<Workflow>("source");
  const [actor, setActor] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [pendingResult, setPendingResult] = useState<PendingResult | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const watermarkKey = `${projection.watermark.sequence}:${projection.watermark.hash ?? ""}`;

  const [sourceMode, setSourceMode] = useState<"register" | "revoke">("register");
  const [sourceId, setSourceId] = useState(""); const [family, setFamily] = useState<"deployment" | "defect" | "provider-billing">("deployment");
  const [sourceSystem, setSourceSystem] = useState(""); const [formatVersion, setFormatVersion] = useState("1.0"); const [supersedes, setSupersedes] = useState("");
  const [revokeId, setRevokeId] = useState(""); const [revokeReason, setRevokeReason] = useState<"source-retired" | "source-compromised" | "source-superseded">("source-retired");
  const [lifecycleReview, setLifecycleReview] = useState<PendingResult | null>(null); const [lifecycleBusy, setLifecycleBusy] = useState(false);

  const [importSourceId, setImportSourceId] = useState(""); const [draft, setDraft] = useState("");
  const [importRequest, setImportRequest] = useState<Request | null>(null); const [importPreview, setImportPreview] = useState<Preview | null>(null); const [importBusy, setImportBusy] = useState(false); const fileRef = useRef<HTMLInputElement>(null);

  const [defectId, setDefectId] = useState(""); const [decision, setDecision] = useState<"" | "confirmed" | "rejected" | "unresolved">("");
  const [attributionReason, setAttributionReason] = useState(""); const [attributionRefs, setAttributionRefs] = useState(""); const [supersedesSequence, setSupersedesSequence] = useState("");
  const [attributionRequest, setAttributionRequest] = useState<Request | null>(null); const [attributionPreview, setAttributionPreview] = useState<Preview | null>(null); const [attributionBusy, setAttributionBusy] = useState(false);

  const activeSources = projection.sources.filter((source) => source.status === "active");
  const selectedImportSource = activeSources.find((source) => source.sourceId === importSourceId);
  const defectObservations = projection.observations.filter((item) => item.contractType === "PostDeliveryDefectObservationV1" && Array.isArray(item.candidateChangeIds) && item.candidateChangeIds.includes(changeId));
  const existingAttribution = projection.attributions.find((item) => item.observationId === defectId && item.changeId === changeId);

  useEffect(() => { setLifecycleReview(null); setImportPreview(null); setAttributionPreview(null); }, [watermarkKey]);
  function invalidate(clearReceipt = true) { setLifecycleReview(null); setImportRequest(null); setImportPreview(null); setAttributionRequest(null); setAttributionPreview(null); setError(null); setPendingResult(null); setRetryAllowed(false); if (clearReceipt) setReceipt(null); }
  function chooseWorkflow(next: Workflow) { setWorkflow(next); invalidate(); }

  function base(type: string): Request {
    return { contractType: type, contractVersion: "1.0", ...identity(), projectId, changeId, actor: actor.trim(), observedProject: { ...projection.watermark } };
  }
  function stageLifecycle() {
    setError(null); setReceipt(null);
    if (actor.trim().length < 3) return setError({ code: "LOCAL_VALIDATION", message: "Укажите явного оператора." });
    let request: Request; let endpoint: string; let label: string;
    if (sourceMode === "register") {
      const kind = family === "deployment" ? "deployment" : family === "defect" ? "post-delivery-defect" : "provider-cost";
      if (!IDENTIFIER.test(sourceId) || !IDENTIFIER.test(sourceSystem) || !IDENTIFIER.test(formatVersion) || projection.sources.some((item) => item.sourceId === sourceId) || sourceId === supersedes) return setError({ code: "LOCAL_VALIDATION", message: "Проверьте новую уникальную идентичность источника и закрытые поля." });
      const prior = supersedes ? activeSources.find((item) => item.sourceId === supersedes && item.family === family) : undefined;
      if (supersedes && !prior) return setError({ code: "LOCAL_VALIDATION", message: "Источник для замены должен быть активным и того же семейства." });
      request = { ...base("OperationalEvidenceSourceRegistrationRequestV1"), occurredAt: new Date().toISOString(), source: { sourceId, family, sourceSystem, formatVersion, allowedKinds: [kind], privacyClass: "restricted-metadata-only", ...(supersedes ? { supersedesSourceId: supersedes } : {}) } };
      endpoint = "/api/operational-outcomes/v1/sources/register"; label = "Регистрация источника";
    } else {
      if (!activeSources.some((item) => item.sourceId === revokeId)) return setError({ code: "LOCAL_VALIDATION", message: "Выберите один активный источник." });
      request = { ...base("OperationalEvidenceSourceRevocationRequestV1"), occurredAt: new Date().toISOString(), sourceId: revokeId, reasonCode: revokeReason };
      endpoint = "/api/operational-outcomes/v1/sources/revoke"; label = "Отзыв источника";
    }
    if (!operationalRequestFitsLimit(request)) return setError({ code: "OUTCOME_MANIFEST_TOO_LARGE", message: "Закрытый запрос превышает 65 536 байт." });
    setLifecycleReview({ request, endpoint, label });
  }
  async function executeLifecycle() {
    if (!lifecycleReview) return; setLifecycleBusy(true); setError(null);
    try { const next = await postOutcome<Receipt>(lifecycleReview.endpoint, lifecycleReview.request); setReceipt(next); setLifecycleReview(null); await onRefresh(); }
    catch (cause) { handleExecutionError(cause, lifecycleReview); }
    finally { setLifecycleBusy(false); }
  }

  function clearImportPreview() { setImportRequest(null); setImportPreview(null); setError(null); setPendingResult(null); setRetryAllowed(false); setReceipt(null); }
  async function readFile(file: File | undefined) {
    clearImportPreview(); if (!file) return;
    if (file.size > 65_536) return setError({ code: "OUTCOME_MANIFEST_TOO_LARGE", message: "Файл превышает 65 536 байт." });
    try { const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); setDraft(text); }
    catch { setDraft(""); setError({ code: "OUTCOME_MANIFEST_INVALID", message: "Файл должен быть корректным UTF-8 JSON." }); }
  }
  async function previewImport() {
    setImportBusy(true); setError(null); setReceipt(null);
    try {
      if (actor.trim().length < 3 || !selectedImportSource) throw Object.assign(new Error("Укажите оператора и активный источник."), { code: "LOCAL_VALIDATION" });
      const observations = parseOperationalObservationDraft(draft, selectedImportSource.allowedKinds);
      const request = { ...base("OperationalOutcomeImportRequestV1"), sourceId: selectedImportSource.sourceId, observations, confirm: false };
      if (!operationalRequestFitsLimit(request)) throw Object.assign(new Error("Полный закрытый запрос превышает 65 536 байт."), { code: "OUTCOME_MANIFEST_TOO_LARGE" });
      const preview = await postOutcome<Preview>("/api/operational-outcomes/v1/imports/preview", request);
      setImportRequest(request); setImportPreview(preview); setDraft(""); if (fileRef.current) fileRef.current.value = "";
    } catch (cause) { const value = cause as Error & { code?: string }; setImportRequest(null); setImportPreview(null); setError({ code: value.code ?? "SOURCE_UNAVAILABLE", message: value.message }); }
    finally { setImportBusy(false); }
  }
  async function executeImport() {
    if (!importRequest || !importPreview || !importPreview.allowed || !operationalPreviewMatches(importRequest, importPreview, projection.watermark)) return;
    setImportBusy(true); setError(null); const request = { ...importRequest, confirm: true }; const pending = { request, endpoint: "/api/operational-outcomes/v1/imports/execute", label: "Импорт наблюдений" };
    try { const next = await postOutcome<Receipt>(pending.endpoint, request); setReceipt(next); setImportRequest(null); setImportPreview(null); await onRefresh(); }
    catch (cause) { handleExecutionError(cause, pending); }
    finally { setImportBusy(false); }
  }

  function clearAttributionPreview() { setAttributionRequest(null); setAttributionPreview(null); setError(null); setPendingResult(null); setRetryAllowed(false); setReceipt(null); }
  async function previewAttribution() {
    setAttributionBusy(true); setError(null); setReceipt(null);
    try {
      const refs = attributionRefs.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      if (actor.trim().length < 3 || !defectObservations.some((item) => item.observationId === defectId) || !decision || !IDENTIFIER.test(attributionReason) || !strings(refs, 50)) throw Object.assign(new Error("Заполните точное наблюдение, решение, код причины и допустимые ссылки."), { code: "LOCAL_VALIDATION" });
      const sequence = supersedesSequence ? Number(supersedesSequence) : undefined;
      if ((existingAttribution && sequence !== existingAttribution.sequence) || (!existingAttribution && sequence !== undefined)) throw Object.assign(new Error("Укажите точную текущую последовательность заменяемой атрибуции."), { code: "LOCAL_VALIDATION" });
      const request = { ...base("OperationalDefectAttributionRequestV1"), occurredAt: new Date().toISOString(), observationId: defectId, decision, reasonCode: attributionReason, evidenceRefs: refs, confirm: false, ...(sequence ? { supersedesAttributionSequence: sequence } : {}) };
      if (!operationalRequestFitsLimit(request)) throw Object.assign(new Error("Полный закрытый запрос превышает 65 536 байт."), { code: "OUTCOME_MANIFEST_TOO_LARGE" });
      const preview = await postOutcome<Preview>("/api/operational-outcomes/v1/attributions/preview", request); setAttributionRequest(request); setAttributionPreview(preview);
    } catch (cause) { const value = cause as Error & { code?: string }; setAttributionRequest(null); setAttributionPreview(null); setError({ code: value.code ?? "SOURCE_UNAVAILABLE", message: value.message }); }
    finally { setAttributionBusy(false); }
  }
  async function executeAttribution() {
    if (!attributionRequest || !attributionPreview || !attributionPreview.allowed || !operationalPreviewMatches(attributionRequest, attributionPreview, projection.watermark)) return;
    setAttributionBusy(true); setError(null); const request = { ...attributionRequest, confirm: true }; const pending = { request, endpoint: "/api/operational-outcomes/v1/attributions/execute", label: "Решение об атрибуции" };
    try { const next = await postOutcome<Receipt>(pending.endpoint, request); setReceipt(next); setAttributionRequest(null); setAttributionPreview(null); await onRefresh(); }
    catch (cause) { handleExecutionError(cause, pending); }
    finally { setAttributionBusy(false); }
  }

  function handleExecutionError(cause: unknown, pending: PendingResult) {
    const value = cause as Error & { code?: string }; const nextError = { code: value.code ?? "SOURCE_UNAVAILABLE", message: value.message };
    setError(nextError); if (nextError.code === "AMBIGUOUS_TRANSPORT") { setPendingResult(pending); setRetryAllowed(false); }
    if (nextError.code === "OUTCOME_PROJECT_WATERMARK_CHANGED") { setLifecycleReview(null); setImportPreview(null); setAttributionPreview(null); }
  }
  async function reconcile() {
    if (!pendingResult) return; setReconciling(true);
    const refreshed = await onRefresh(); const found = refreshed?.receipts.find((item) => item.requestId === pendingResult.request.requestId);
    if (found) { setReceipt(found); setError(null); setPendingResult(null); setRetryAllowed(false); }
    else { setError({ code: "AMBIGUOUS_TRANSPORT", message: "Квитанция не найдена. Разрешён только повтор того же запроса." }); setRetryAllowed(true); }
    setReconciling(false);
  }
  async function retryPending() {
    if (!pendingResult || !retryAllowed) return; setReconciling(true); setError(null);
    try { const next = await postOutcome<Receipt>(pendingResult.endpoint, pendingResult.request); setReceipt(next); setPendingResult(null); setRetryAllowed(false); await onRefresh(); }
    catch (cause) { handleExecutionError(cause, pendingResult); }
    finally { setReconciling(false); }
  }

  const previewPanel = (preview: Preview | null, request: Request | null) => preview ? <div className={`intakePreview ${preview.allowed ? "allowed" : "denied"}`} role="status"><div><b>{preview.allowed ? "Предпросмотр разрешён" : "Предпросмотр отклонён"}</b><span>{preview.observationCount} набл. · без изменений</span></div><code>{preview.contentHash.slice(0, 20)}</code>{preview.reasonCodes.length ? <p>{preview.reasonCodes.join(", ")}</p> : null}{request && !operationalPreviewMatches(request, preview, projection.watermark) ? <p>Предпросмотр устарел — выполните его заново.</p> : null}</div> : null;
  const registrationReady = actor.trim().length >= 3 && IDENTIFIER.test(sourceId) && IDENTIFIER.test(sourceSystem) && IDENTIFIER.test(formatVersion);
  const revokeReady = actor.trim().length >= 3 && activeSources.some((item) => item.sourceId === revokeId);

  return <section className="intakeWorkflows" aria-label="Ручные операции с данными результатов">
    <header><div><small>ЯВНОЕ ПОДТВЕРЖДЕНИЕ · СРЕЗ 2</small><h2>Ручной приём доказательств</h2></div><span>Без сохранения черновиков</span></header>
    <nav aria-label="Операции с данными результатов"><button className={workflow === "source" ? "active" : ""} onClick={() => chooseWorkflow("source")}>Источники</button><button className={workflow === "import" ? "active" : ""} onClick={() => chooseWorkflow("import")}>Импорт наблюдений</button><button className={workflow === "attribution" ? "active" : ""} onClick={() => chooseWorkflow("attribution")}>Атрибуция дефекта</button></nav>
    <label className="intakeActor">Явный оператор<input value={actor} placeholder="human:operator-id" maxLength={256} onChange={(event) => { setActor(event.target.value); invalidate(); }} /></label>
    {workflow === "source" ? <div className="intakeWorkflowBody">
      <div className="intakeMode" role="group" aria-label="Операция с источником"><button className={sourceMode === "register" ? "active" : ""} onClick={() => { setSourceMode("register"); invalidate(); }}>Регистрация / замена</button><button className={sourceMode === "revoke" ? "active" : ""} onClick={() => { setSourceMode("revoke"); invalidate(); }}>Отзыв</button></div>
      {sourceMode === "register" ? <div className="intakeWorkflowFields">
        <label>Новый sourceId<input value={sourceId} onChange={(event) => { setSourceId(event.target.value); invalidate(); }} /></label><label>Семейство<select value={family} onChange={(event) => { setFamily(event.target.value as typeof family); setSupersedes(""); invalidate(); }}><option value="deployment">deployment</option><option value="defect">defect</option><option value="provider-billing">provider-billing</option></select></label>
        <label>Система источника<input value={sourceSystem} onChange={(event) => { setSourceSystem(event.target.value); invalidate(); }} /></label><label>Версия формата<input value={formatVersion} onChange={(event) => { setFormatVersion(event.target.value); invalidate(); }} /></label>
        <label>Заменяет активный источник<select value={supersedes} onChange={(event) => { setSupersedes(event.target.value); invalidate(); }}><option value="">Не заменяет</option>{activeSources.filter((item) => item.family === family).map((item) => <option key={item.sourceId} value={item.sourceId}>{item.sourceId}</option>)}</select></label><label>Разрешённый тип<input readOnly value={family === "deployment" ? "deployment" : family === "defect" ? "post-delivery-defect" : "provider-cost"} /></label>
      </div> : <div className="intakeWorkflowFields"><label>Активный источник<select value={revokeId} onChange={(event) => { setRevokeId(event.target.value); invalidate(); }}><option value="">Выберите источник</option>{activeSources.map((item) => <option key={item.sourceId} value={item.sourceId}>{item.sourceId}</option>)}</select></label><label>Причина<select value={revokeReason} onChange={(event) => { setRevokeReason(event.target.value as typeof revokeReason); invalidate(); }}><option value="source-retired">source-retired</option><option value="source-compromised">source-compromised</option><option value="source-superseded">source-superseded</option></select></label></div>}
      {lifecycleReview ? <div className="intakeLocalReview" role="status"><b>Локальная проверка готова</b><span>{lifecycleReview.label}</span><code>{String(lifecycleReview.request.requestId)}</code><dl><div><dt>Оператор</dt><dd>{String(lifecycleReview.request.actor)}</dd></div><div><dt>Источник</dt><dd>{String(lifecycleReview.request.sourceId ?? (lifecycleReview.request.source as Record<string, unknown>)?.sourceId)}</dd></div><div><dt>Семейство / причина</dt><dd>{String((lifecycleReview.request.source as Record<string, unknown>)?.family ?? lifecycleReview.request.reasonCode)}</dd></div><div><dt>Тип / цель замены</dt><dd>{String(((lifecycleReview.request.source as Record<string, unknown>)?.allowedKinds as string[] | undefined)?.join(", ") ?? (lifecycleReview.request.source as Record<string, unknown>)?.supersedesSourceId ?? "—")}</dd></div></dl><p>{projectId} / {changeId} · посл. {lifecycleReview.request.observedProject.sequence}</p></div> : null}
      <footer><button className="secondary" onClick={stageLifecycle} disabled={lifecycleBusy || (sourceMode === "register" ? !registrationReady : !revokeReady)}>Проверить закрытый запрос</button><button onClick={() => void executeLifecycle()} disabled={lifecycleBusy || !lifecycleReview}>{lifecycleBusy ? "Выполняем…" : "Подтвердить и выполнить"}</button></footer>
    </div> : null}
    {workflow === "import" ? <div className="intakeWorkflowBody">
      <div className="intakeWorkflowFields"><label>Активный источник<select value={importSourceId} onChange={(event) => { setImportSourceId(event.target.value); clearImportPreview(); }}><option value="">Выберите источник</option>{activeSources.map((item) => <option key={item.sourceId} value={item.sourceId}>{item.sourceId} · {item.allowedKinds.join(", ")}</option>)}</select></label><label className="intakeFile">Один локальный JSON<input ref={fileRef} type="file" accept="application/json,.json" onChange={(event) => void readFile(event.target.files?.[0])} /><span>Читается локально и не сохраняется</span></label></div>
      <label className="intakeDraft">Или вставьте закрытый JSON-массив<textarea value={draft} onChange={(event) => { setDraft(event.target.value); clearImportPreview(); }} placeholder='[{"contractType":"DeploymentObservationV1",…}]' /></label>
      {previewPanel(importPreview, importRequest)}
      <footer><span>Черновик очищается после успешного предпросмотра.</span><button className="secondary" onClick={() => void previewImport()} disabled={importBusy || !draft || !selectedImportSource}>{importBusy ? "Проверяем…" : "Предпросмотр без изменений"}</button><button onClick={() => void executeImport()} disabled={importBusy || !importRequest || !importPreview?.allowed || !operationalPreviewMatches(importRequest, importPreview, projection.watermark)}>Явно подтвердить импорт</button></footer>
    </div> : null}
    {workflow === "attribution" ? <div className="intakeWorkflowBody">
      <div className="intakeWorkflowFields"><label>Дефект-кандидат<select value={defectId} onChange={(event) => { setDefectId(event.target.value); setSupersedesSequence(""); clearAttributionPreview(); }}><option value="">Выберите наблюдение</option>{defectObservations.map((item) => <option key={item.observationId} value={item.observationId}>{item.observationId}</option>)}</select></label><label>Решение<select value={decision} onChange={(event) => { setDecision(event.target.value as typeof decision); clearAttributionPreview(); }}><option value="">Выберите вручную</option><option value="confirmed">confirmed</option><option value="rejected">rejected</option><option value="unresolved">unresolved</option></select></label><label>Код причины<input value={attributionReason} onChange={(event) => { setAttributionReason(event.target.value); clearAttributionPreview(); }} /></label><label>Последовательность заменяемого решения<input type="number" min="1" value={supersedesSequence} placeholder={existingAttribution ? `Текущая: ${existingAttribution.sequence}` : "Не требуется"} onChange={(event) => { setSupersedesSequence(event.target.value); clearAttributionPreview(); }} /></label></div>
      <label className="intakeDraft">Ссылки на доказательства — по одной в строке<textarea value={attributionRefs} onChange={(event) => { setAttributionRefs(event.target.value); clearAttributionPreview(); }} /></label>
      {previewPanel(attributionPreview, attributionRequest)}
      {!defectObservations.length ? <p className="intakeNotice">Для точного изменения нет дефектов-кандидатов. Решение не может быть создано.</p> : null}
      <footer><span>Решение confirmed никогда не выбирается автоматически.</span><button className="secondary" onClick={() => void previewAttribution()} disabled={attributionBusy || !defectId || !decision}>{attributionBusy ? "Проверяем…" : "Предпросмотр без изменений"}</button><button onClick={() => void executeAttribution()} disabled={attributionBusy || !attributionRequest || !attributionPreview?.allowed || !operationalPreviewMatches(attributionRequest, attributionPreview, projection.watermark)}>Явно подтвердить решение</button></footer>
    </div> : null}
    {error ? <ErrorPanel error={error} onReconcile={pendingResult ? () => void reconcile() : undefined} onRetry={pendingResult && retryAllowed ? () => void retryPending() : undefined} reconciling={reconciling} /> : null}
    {receipt ? <ReceiptPanel receipt={receipt} /> : null}
  </section>;
}
