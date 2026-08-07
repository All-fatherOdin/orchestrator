import { useEffect, useState } from "react";
import type { EvidenceSource, OperationalEvidenceProjection, Receipt } from "./OperationalEvidenceIntakeDashboard";

type ConnectorRequest = {
  contractType: "GitHubDeploymentConnectorPreviewRequestV1" | "GitHubDeploymentConnectorExecuteRequestV1";
  contractVersion: "1.0"; requestId: string; idempotencyKey: string; projectId: string; changeId: string; actor: string;
  observedProject: OperationalEvidenceProjection["watermark"]; sourceId: string; deploymentId: string; deploymentStatusId: string;
  confirm: boolean; remoteSnapshotHash?: string; contentHash?: string;
};
export type GitHubDeploymentConnectorPreview = {
  contractType: "GitHubDeploymentConnectorPreviewV1"; contractVersion: "1.0"; requestId: string; allowed: boolean; reasonCodes: string[];
  remoteSnapshotHash: string; contentHash: string; sourceWatermark: OperationalEvidenceProjection["watermark"]; observationCount: 1; wouldMutate: false;
  observation: { observationId: string; sourceRecordId: string; deploymentId: string; deploymentStatusId: string; occurredAt: string; commitSha: string; treeSha: string; environmentClass: "production"; outcome: "succeeded" | "failed"; evidenceRefs: string[] };
};
type ConnectorError = { code: string; message: string; retryAfterSeconds?: number; rateLimitResetAt?: string };
const DECIMAL_ID = /^[1-9][0-9]{0,19}$/;

function identity() { const suffix = crypto.randomUUID().replaceAll("-", ""); return { requestId: `phase12:${suffix}`, idempotencyKey: `phase12:${suffix}:once` }; }
export function compatibleGitHubDeploymentSources(sources: readonly EvidenceSource[]): EvidenceSource[] {
  return sources.filter((source) => source.status === "active" && source.family === "deployment" && source.sourceSystem === "github-deployments" && source.formatVersion === "github-deployments-v1" && source.allowedKinds.includes("deployment"));
}
export function githubDeploymentPreviewMatches(request: ConnectorRequest, preview: GitHubDeploymentConnectorPreview, watermark: OperationalEvidenceProjection["watermark"]): boolean {
  return request.requestId === preview.requestId && request.observedProject.sequence === watermark.sequence && request.observedProject.hash === watermark.hash && preview.sourceWatermark.sequence === watermark.sequence && preview.sourceWatermark.hash === watermark.hash;
}
export function githubDeploymentErrorTitle(code: string): string {
  if (code === "CONNECTOR_PROJECT_WATERMARK_CHANGED") return "Проекция устарела";
  if (code === "CONNECTOR_REMOTE_SNAPSHOT_CHANGED") return "Снимок GitHub изменился";
  if (code === "CONNECTOR_REMOTE_RATE_LIMITED") return "GitHub ограничил частоту запросов";
  if (code === "CONNECTOR_RESULT_AMBIGUOUS") return "Результат импорта неизвестен";
  if (["CONNECTOR_NOT_CONFIGURED", "CONNECTOR_SECRET_UNAVAILABLE", "CONNECTOR_SOURCE_INVALID"].includes(code)) return "Коннектор недоступен";
  return "Запрос коннектора отклонён";
}
async function postConnector<T>(path: string, request: ConnectorRequest, ambiguousOnTransport: boolean): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }); }
  catch { throw { code: ambiguousOnTransport ? "CONNECTOR_RESULT_AMBIGUOUS" : "CONNECTOR_REMOTE_UNAVAILABLE", message: ambiguousOnTransport ? "Результат неизвестен. Сначала сверьте квитанции Phase 10." : "GitHub сейчас недоступен. Автоматического повтора нет." } satisfies ConnectorError; }
  const body = await response.json().catch(() => ({})) as T & { code?: string; retryAfterSeconds?: number; rateLimitResetAt?: string };
  if (!response.ok) throw { code: body.code ?? (ambiguousOnTransport ? "CONNECTOR_RESULT_AMBIGUOUS" : "CONNECTOR_REMOTE_UNAVAILABLE"), message: "Операция отклонена без раскрытия удалённых данных.", ...(body.retryAfterSeconds !== undefined ? { retryAfterSeconds: body.retryAfterSeconds } : {}), ...(body.rateLimitResetAt !== undefined ? { rateLimitResetAt: body.rateLimitResetAt } : {}) } satisfies ConnectorError;
  return body;
}
function compactHash(value: string) { return value.slice(0, 18); }

export function GitHubDeploymentConnectorWorkflow({ projectId, changeId, actor, projection, onRefresh }: { projectId: string; changeId: string; actor: string; projection: OperationalEvidenceProjection; onRefresh: () => Promise<OperationalEvidenceProjection | null> }) {
  const sources = compatibleGitHubDeploymentSources(projection.sources);
  const [sourceId, setSourceId] = useState(sources.length === 1 ? sources[0].sourceId : "");
  const [deploymentId, setDeploymentId] = useState(""); const [deploymentStatusId, setDeploymentStatusId] = useState("");
  const [request, setRequest] = useState<ConnectorRequest | null>(null); const [preview, setPreview] = useState<GitHubDeploymentConnectorPreview | null>(null); const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null); const [error, setError] = useState<ConnectorError | null>(null); const [pendingExecute, setPendingExecute] = useState<ConnectorRequest | null>(null); const [retryAllowed, setRetryAllowed] = useState(false); const [busy, setBusy] = useState(false);
  const semanticKey = `${actor}\0${sourceId}\0${deploymentId}\0${deploymentStatusId}`; const watermarkKey = `${projection.watermark.sequence}:${projection.watermark.hash ?? ""}`;
  function clearPrepared() { setRequest(null); setPreview(null); setConfirmed(false); setError(null); setPendingExecute(null); setRetryAllowed(false); }
  useEffect(() => { clearPrepared(); }, [semanticKey, watermarkKey]);
  const inputReady = actor.trim().length >= 3 && sources.some((source) => source.sourceId === sourceId) && DECIMAL_ID.test(deploymentId) && DECIMAL_ID.test(deploymentStatusId);
  const previewFresh = Boolean(request && preview && githubDeploymentPreviewMatches(request, preview, projection.watermark));

  async function createPreview() {
    if (!inputReady) return; setBusy(true); clearPrepared(); setReceipt(null); const ids = identity();
    const nextRequest: ConnectorRequest = { contractType: "GitHubDeploymentConnectorPreviewRequestV1", contractVersion: "1.0", ...ids, projectId, changeId, actor: actor.trim(), observedProject: { ...projection.watermark }, sourceId, deploymentId, deploymentStatusId, confirm: false };
    try { const nextPreview = await postConnector<GitHubDeploymentConnectorPreview>("/api/evidence-connectors/v1/github-deployments/preview", nextRequest, false); setRequest(nextRequest); setPreview(nextPreview); }
    catch (cause) { setError(cause as ConnectorError); } finally { setBusy(false); }
  }
  async function execute(exactRequest?: ConnectorRequest) {
    if (!exactRequest && (!request || !preview || !preview.allowed || !previewFresh || !confirmed)) return;
    const executeRequest = exactRequest ?? { ...request!, contractType: "GitHubDeploymentConnectorExecuteRequestV1" as const, confirm: true, remoteSnapshotHash: preview!.remoteSnapshotHash, contentHash: preview!.contentHash };
    setBusy(true); setError(null);
    try { const nextReceipt = await postConnector<Receipt>("/api/evidence-connectors/v1/github-deployments/execute", executeRequest, true); setReceipt(nextReceipt); setRequest(null); setPreview(null); setConfirmed(false); setPendingExecute(null); setRetryAllowed(false); await onRefresh(); }
    catch (cause) { const nextError = cause as ConnectorError; setError(nextError); if (nextError.code === "CONNECTOR_RESULT_AMBIGUOUS") { setPendingExecute(executeRequest); setRetryAllowed(false); } if (["CONNECTOR_REMOTE_SNAPSHOT_CHANGED", "CONNECTOR_PROJECT_WATERMARK_CHANGED"].includes(nextError.code)) { setRequest(null); setPreview(null); setConfirmed(false); } }
    finally { setBusy(false); }
  }
  async function reconcile() {
    if (!pendingExecute) return; setBusy(true); const refreshed = await onRefresh(); const found = refreshed?.receipts.find((item) => item.requestId === pendingExecute.requestId);
    if (found) { setReceipt(found); setError(null); setPendingExecute(null); setRetryAllowed(false); setRequest(null); setPreview(null); setConfirmed(false); }
    else { setError({ code: "CONNECTOR_RESULT_AMBIGUOUS", message: "Квитанция не найдена. Разрешён только точный повтор того же запроса." }); setRetryAllowed(true); }
    setBusy(false);
  }

  return <div className="intakeWorkflowBody githubConnectorWorkflow">
    {!sources.length ? <div className="intakeConnectorAvailability unavailable" role="status"><b>Коннектор недоступен</b><p>Для изменения нет активного источника deployment с системой github-deployments и форматом github-deployments-v1.</p></div> : <><div className="intakeConnectorAvailability"><b>GitHub Deployments готов к ручному чтению</b><span>Только три точных GET · без токена и координат репозитория в браузере</span></div><div className="intakeWorkflowFields"><label>Источник Phase 10<select aria-label="Источник GitHub Deployments" value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Выберите источник</option>{sources.map((source) => <option key={source.sourceId} value={source.sourceId}>{source.sourceId}</option>)}</select></label><label>Deployment ID<input aria-label="GitHub deployment ID" inputMode="numeric" pattern="[1-9][0-9]{0,19}" value={deploymentId} onChange={(event) => setDeploymentId(event.target.value)} /></label><label>Deployment status ID<input aria-label="GitHub deployment status ID" inputMode="numeric" pattern="[1-9][0-9]{0,19}" value={deploymentStatusId} onChange={(event) => setDeploymentStatusId(event.target.value)} /></label><label>Режим<input readOnly value="production · исход GitHub определяет результат" /></label></div></>}
    {preview ? <div className={`intakeConnectorPreview ${preview.allowed ? "allowed" : "denied"}`} role="status"><header><div><b>{preview.allowed ? "Снимок готов к подтверждению" : "Импорт отклонён"}</b><span>Один очищенный результат · без изменений</span></div><code>{compactHash(preview.remoteSnapshotHash)}</code></header><dl><div><dt>Результат</dt><dd>{preview.observation.outcome}</dd></div><div><dt>Среда</dt><dd>{preview.observation.environmentClass}</dd></div><div><dt>Deployment / status</dt><dd>{preview.observation.deploymentId} / {preview.observation.deploymentStatusId}</dd></div><div><dt>Commit / tree</dt><dd><code>{compactHash(preview.observation.commitSha)} / {compactHash(preview.observation.treeSha)}</code></dd></div><div><dt>Зафиксировано</dt><dd>{new Date(preview.observation.occurredAt).toLocaleString("ru-RU")}</dd></div><div><dt>Content hash</dt><dd><code>{compactHash(preview.contentHash)}</code></dd></div></dl>{preview.reasonCodes.length ? <p>{preview.reasonCodes.join(", ")}</p> : null}{!previewFresh ? <p>Предпросмотр устарел — выполните точное чтение заново.</p> : null}{preview.allowed && previewFresh ? <label className="intakeConfirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Я проверил точные идентичности и явно подтверждаю импорт одного результата.</label> : null}</div> : null}
    {error ? <div className={`intakeWorkflowError ${error.code === "CONNECTOR_RESULT_AMBIGUOUS" ? "ambiguous" : ""}`} role="alert"><small>{error.code}</small><div><b>{githubDeploymentErrorTitle(error.code)}</b><p>{error.message}</p>{error.retryAfterSeconds !== undefined ? <span>Повтор не ранее чем через {error.retryAfterSeconds} сек.</span> : null}{error.rateLimitResetAt ? <span>Сброс лимита: {new Date(error.rateLimitResetAt).toLocaleString("ru-RU")}</span> : null}</div><div>{pendingExecute ? <button onClick={() => void reconcile()} disabled={busy}>{busy ? "Сверяем…" : "Сверить квитанции"}</button> : null}{pendingExecute && retryAllowed ? <button onClick={() => void execute(pendingExecute)} disabled={busy}>Повторить тот же запрос</button> : null}{error.code === "CONNECTOR_PROJECT_WATERMARK_CHANGED" ? <button onClick={() => void onRefresh()} disabled={busy}>Обновить проекцию</button> : null}</div></div> : null}
    {receipt ? <div className="intakeMutationReceipt" role="status"><b>Неизменяемая квитанция Phase 10 получена</b><span>{receipt.operationKind}</span><code>{receipt.receiptId}</code><p>Результат · посл. {receipt.resultingWatermark.sequence} · {compactHash(receipt.receiptHash)}</p></div> : null}
    <footer><span>Автоматических повторов, опроса и удалённых изменений нет.</span><button className="secondary" onClick={() => void createPreview()} disabled={busy || !inputReady}>{busy && !preview ? "Читаем…" : "Получить снимок без изменений"}</button><button onClick={() => void execute()} disabled={busy || !preview?.allowed || !previewFresh || !confirmed}>{busy && preview ? "Импортируем…" : "Явно подтвердить импорт"}</button></footer>
  </div>;
}
