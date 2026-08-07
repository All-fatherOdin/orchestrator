import { useEffect, useMemo, useRef, useState } from "react";

export const AMK_CONTRACTS = [
  "TaskContractV3",
  "WorkItemGraphV1",
  "VerificationReceiptV2",
  "ReviewReceiptV1",
] as const;

type AmkContract = (typeof AMK_CONTRACTS)[number];
type AmkStatus = "compatible" | "partial" | "unsupported" | "conflict" | "stale";

type AmkSourceBase = {
  projectId: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  taskCount: number;
};
export type AmkSource = AmkSourceBase & ({
  selectorKind: "run";
  runId: string;
  runStatus: string;
  startedAt?: string;
  finishedAt?: string;
} | { selectorKind: "queue"; queueId: string });

type Discovery = {
  contractType: "AmkProjectArtifactsDiscoveryV1";
  contractVersion: "1.0";
  pinnedAmkCommit: string;
  supportedContracts: AmkContract[];
  selectorKinds: ["run", "queue"];
  limits: { requestBytes: number; responseBytes: number; tasks: number; evidenceItems: number; sources: number };
  sources: AmkSource[];
  readOnly: true;
  navigationOnly: true;
  activated: false;
  filesModified: false;
};

type ProjectionResult = {
  contractType: AmkContract;
  contractVersion: string;
  projectionVersion: "1.0";
  pinnedAmkCommit: string;
  schemaSha256: string;
  status: AmkStatus;
  reasonCodes: string[];
  projectionId: string;
  artifact: null;
  artifactAvailable: false;
  artifactSha256: string | null;
  artifactByteLength: number;
  readOnly: true;
  navigationOnly: true;
  activated: false;
  filesModified: false;
};

export type ProjectionResponse = {
  contractType: "AmkProjectArtifactsProjectionResponseV1";
  contractVersion: "1.0";
  requestId: string;
  source: AmkSource;
  results: ProjectionResult[];
  readOnly: true;
  navigationOnly: true;
  activated: false;
  filesModified: false;
  responseId: string;
};

type ApiError = { code?: string; message?: string; error?: string };

const contractLabels: Record<AmkContract, string> = {
  TaskContractV3: "Контракты задач",
  WorkItemGraphV1: "Граф работ",
  VerificationReceiptV2: "Квитанции проверки",
  ReviewReceiptV1: "Квитанции ревью",
};

const statusLabels: Record<AmkStatus, string> = {
  compatible: "Совместимо",
  partial: "Частично",
  unsupported: "Не поддерживается",
  conflict: "Конфликт",
  stale: "Источник устарел",
};

const errorLabels: Record<string, string> = {
  SOURCE_STALE: "Источник изменился после выбора",
  SOURCE_CONFLICT: "Идентификатор источника конфликтует",
  SOURCE_NOT_FOUND: "Выбранный запуск больше недоступен",
  SOURCE_LIMIT_EXCEEDED: "Источник превышает закрытые лимиты",
  REQUEST_TOO_LARGE: "Запрос превышает 8 КиБ",
  RESPONSE_TOO_LARGE: "Ответ превышает 512 КиБ",
  SOURCE_UNAVAILABLE: "Источник временно недоступен",
};

function short(value: string, length = 14) {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function amkSourceKey(source: AmkSource) {
  const id = source.selectorKind === "run" ? source.runId : source.queueId;
  return `${source.projectId}:${source.selectorKind}:${id}:${source.sourceHash}:${source.sourceByteLength}:${source.sourceWatermark}`;
}

export function buildAmkProjectionRequest(
  source: AmkSource,
  contracts: readonly AmkContract[],
  requestId: string,
) {
  return {
    contractType: "AmkProjectArtifactsProjectionRequestV1" as const,
    contractVersion: "1.0" as const,
    requestId,
    projectId: source.projectId,
    selectorKind: source.selectorKind,
    ...(source.selectorKind === "run" ? { runId: source.runId } : { queueId: source.queueId }),
    sourceHash: source.sourceHash,
    sourceByteLength: source.sourceByteLength,
    sourceWatermark: source.sourceWatermark,
    contracts: [...contracts],
  };
}

export function amkDownloadPayload(response: ProjectionResponse) {
  const sourceId = response.source.selectorKind === "run" ? response.source.runId : response.source.queueId;
  const identity = `${sourceId}-${response.responseId.slice(-12)}`.replace(/[^A-Za-z0-9._-]/g, "-");
  return {
    filename: `amk-project-artifacts-${identity}.json`,
    json: JSON.stringify(response, null, 2),
  };
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg>;
}

function statusTone(status: AmkStatus) {
  if (status === "compatible") return "compatible";
  if (status === "partial") return "partial";
  return status;
}

function download(response: ProjectionResponse) {
  const payload = amkDownloadPayload(response);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload.json], { type: "application/json" }));
  link.download = payload.filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
}

export function AmkProjectArtifactsDashboard() {
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [sourceKey, setSourceKey] = useState("");
  const [contracts, setContracts] = useState<AmkContract[]>([...AMK_CONTRACTS]);
  const [projection, setProjection] = useState<ProjectionResponse | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [projecting, setProjecting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const discoveryRequest = useRef(0);
  const projectionRequest = useRef(0);

  const source = useMemo(
    () => discovery?.sources.find((item) => amkSourceKey(item) === sourceKey) ?? null,
    [discovery, sourceKey],
  );

  async function loadDiscovery() {
    const request = ++discoveryRequest.current;
    ++projectionRequest.current;
    setLoadingDiscovery(true);
    setProjecting(false);
    setProjection(null);
    setError(null);
    try {
      const response = await fetch("/api/amk-project-artifacts/v1", { cache: "no-store" });
      const body = await response.json() as Discovery | ApiError;
      if (!response.ok) throw body;
      if (request !== discoveryRequest.current) return;
      const next = body as Discovery;
      setDiscovery(next);
      setSourceKey((current) => next.sources.some((item) => amkSourceKey(item) === current)
        ? current
        : next.sources[0] ? amkSourceKey(next.sources[0]) : "");
    } catch (reason) {
      if (request !== discoveryRequest.current) return;
      const failure = reason as ApiError;
      setDiscovery(null);
      setSourceKey("");
      setError({ code: failure.code ?? "SOURCE_UNAVAILABLE", message: failure.message ?? failure.error ?? "Не удалось прочитать список запусков." });
    } finally {
      if (request === discoveryRequest.current) setLoadingDiscovery(false);
    }
  }

  useEffect(() => { void loadDiscovery(); }, []);

  function invalidate() {
    ++projectionRequest.current;
    setProjecting(false);
    setProjection(null);
    setError(null);
  }

  function chooseSource(value: string) {
    invalidate();
    setSourceKey(value);
  }

  function toggleContract(contract: AmkContract) {
    invalidate();
    setContracts((current) => current.includes(contract)
      ? current.filter((item) => item !== contract)
      : AMK_CONTRACTS.filter((item) => item === contract || current.includes(item)));
  }

  async function project() {
    if (!source || !contracts.length) return;
    const request = ++projectionRequest.current;
    setProjecting(true);
    setError(null);
    setProjection(null);
    try {
      const response = await fetch("/api/amk-project-artifacts/v1/project", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildAmkProjectionRequest(source, contracts, crypto.randomUUID())),
      });
      const body = await response.json() as ProjectionResponse | ApiError;
      if (!response.ok) throw body;
      if (request === projectionRequest.current) setProjection(body as ProjectionResponse);
    } catch (reason) {
      if (request !== projectionRequest.current) return;
      const failure = reason as ApiError;
      setError({ code: failure.code ?? "SOURCE_UNAVAILABLE", message: failure.message ?? failure.error ?? "Не удалось построить AMK-проекцию." });
    } finally {
      if (request === projectionRequest.current) setProjecting(false);
    }
  }

  const counts = useMemo(() => {
    const result = { compatible: 0, partial: 0, unsupported: 0, conflict: 0, stale: 0 };
    for (const item of projection?.results ?? []) result[item.status] += 1;
    return result;
  }, [projection]);

  return <div className="amkWorkspace">
    <section className="amkBuilder" aria-label="Построение AMK-проекции">
      <header>
        <div><small>AGENT MEMORY KIT · V5</small><h2>Артефакты проекта</h2><p>Совместимость существующего запуска без импорта, записи или активации.</p></div>
        <button className="amkReload" onClick={() => void loadDiscovery()} disabled={loadingDiscovery || projecting}>Обновить источники</button>
      </header>
      {loadingDiscovery ? <div className="amkLoading" role="status"><i /><span>Чтение безопасных идентификаторов запусков…</span></div> : discovery ? <>
        <div className="amkFields">
          <label>Источник<select aria-label="Источник для AMK-проекции" value={sourceKey} onChange={(event) => chooseSource(event.target.value)}><option value="">Выберите запуск или очередь</option>{discovery.sources.map((item) => <option key={amkSourceKey(item)} value={amkSourceKey(item)}>{item.selectorKind === "run" ? `${item.runId} · ${item.runStatus}` : `${short(item.queueId, 18)} · очередь`} · {item.taskCount} задач</option>)}</select></label>
          <div className="amkIdentity"><span>Версия AMK</span><code>{short(discovery.pinnedAmkCommit, 16)}</code></div>
          <div className="amkIdentity"><span>Режим</span><strong>Только чтение</strong></div>
        </div>
        <fieldset className="amkContracts"><legend>Контракты для проверки</legend>{AMK_CONTRACTS.map((contract) => <label key={contract}><input type="checkbox" checked={contracts.includes(contract)} onChange={() => toggleContract(contract)} /><span><b>{contractLabels[contract]}</b><code>{contract}</code></span></label>)}</fieldset>
        {source ? <div className="amkSource"><div><span>Проект</span><code>{short(source.projectId, 24)}</code></div><div><span>Хеш источника</span><code>{short(source.sourceHash, 18)}</code></div><div><span>Отметка данных</span><code>{short(source.sourceWatermark, 24)}</code></div><div><span>Размер</span><strong>{source.sourceByteLength.toLocaleString("ru-RU")} байт</strong></div></div> : <div className="amkInlineNotice">Нет доступного запуска. API не принимает путь или содержимое очереди вручную.</div>}
        <footer><span>Лимиты: {discovery.limits.tasks} задач · {Math.round(discovery.limits.responseBytes / 1024)} КиБ ответ</span><button onClick={() => void project()} disabled={!source || !contracts.length || projecting}>{projecting ? "Проверка…" : "Построить проекцию"}</button></footer>
      </> : null}
    </section>

    {error ? <section className={`amkState ${error.code === "SOURCE_STALE" ? "stale" : "error"}`} role="alert"><small>{error.code}</small><h3>{errorLabels[error.code] ?? "Проекция недоступна"}</h3><p>{error.message}</p><button onClick={() => void loadDiscovery()}>Перечитать текущие источники</button></section> : null}

    {projection ? <section className="amkResult" aria-label="Результат AMK-проекции">
      <header><div><small>{projection.contractType} · {projection.contractVersion}</small><h2>{projection.source.selectorKind === "run" ? projection.source.runId : short(projection.source.queueId, 26)}</h2><p>Результат привязан к точному хешу и отметке выбранного источника.</p></div><div className="amkResultIdentity"><span>Ответ готов</span><code>{short(projection.responseId, 18)}</code></div></header>
      <div className="amkSummary"><div><span>Совместимо</span><strong>{counts.compatible}</strong></div><div><span>Частично</span><strong>{counts.partial}</strong></div><div><span>Не поддерживается</span><strong>{counts.unsupported}</strong></div><div><span>Всего результатов</span><strong>{projection.results.length}</strong></div><div><span>Отметка данных</span><code>{short(projection.source.sourceWatermark, 20)}</code></div></div>
      <div className="amkFrontier" role="status"><div><b>Frontier не активирован</b><span>Проекция навигационная и не может запускать или выбирать задачи.</span></div><dl><div><dt>readOnly</dt><dd>{String(projection.readOnly)}</dd></div><div><dt>navigationOnly</dt><dd>{String(projection.navigationOnly)}</dd></div><div><dt>activated</dt><dd>{String(projection.activated)}</dd></div><div><dt>filesModified</dt><dd>{String(projection.filesModified)}</dd></div></dl></div>
      <div className="amkResults">{contracts.map((contract) => {
        const items = projection.results.filter((item) => item.contractType === contract);
        return <article key={contract}><header><div><small>{contract}</small><h3>{contractLabels[contract]}</h3></div><strong>{items.length} результатов</strong></header>{items.length ? <div>{items.map((item) => <section key={item.projectionId}><div><span className={`amkStatus ${statusTone(item.status)}`}>{statusLabels[item.status]}</span><code>{short(item.projectionId, 22)}</code></div><p>{item.reasonCodes.map((reason) => <code key={reason}>{reason}</code>)}</p><footer><span>Артефакт скрыт политикой конфиденциальности</span><code>{item.artifactSha256 ? short(item.artifactSha256, 18) : "нет тела"}</code></footer></section>)}</div> : <p className="amkNoEvidence">Для этого контракта в выбранном запуске нет безопасных evidence items.</p>}</article>;
      })}</div>
      <footer><span>Скачивается только уже отображённый ограниченный ответ.</span><button className="amkDownload" onClick={() => download(projection)}><DownloadIcon /> Скачать JSON</button></footer>
    </section> : !error && !loadingDiscovery ? <div className="operatorEmpty amkWaiting"><span aria-hidden="true">◇</span><h3>Проекция ещё не построена</h3><p>Выберите запуск и контракты. Изменение выбора удалит предыдущий результат.</p></div> : null}
  </div>;
}
