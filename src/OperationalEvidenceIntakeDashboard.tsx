import { useEffect, useMemo, useRef, useState } from "react";

type ProjectionItem = { projectId: string; entityId: string; data: Record<string, unknown> };
type Phase6Projection = {
  sourceWatermarks: Array<{ projectId: string; sequence: number; hash: string | null }>;
  items: ProjectionItem[];
};
type EvidenceSource = {
  sourceId: string; family: string; sourceSystem: string; formatVersion: string;
  allowedKinds: string[]; privacyClass: string; status: string; ownerActor: string;
  registeredAt: string; registeredSequence: number; sourceHash: string;
};
type Observation = Record<string, unknown> & {
  observationId: string; sourceRecordId: string; occurredAt: string; evidenceRefs: string[];
};
type Attribution = {
  observationId: string; changeId: string; decision: string; reasonCode: string;
  evidenceRefs: string[]; decidedBy: string; decidedAt: string; sequence: number;
};
type Receipt = {
  receiptId: string; operationKind: string; actor: string; contentHash: string;
  sourceWatermark: { sequence: number; hash: string | null };
  resultingWatermark: { sequence: number; hash: string | null };
  observationIds: string[]; publishedAt: string; receiptHash: string;
};
export type OperationalEvidenceProjection = {
  contractType: "OperationalOutcomeProjectionV1"; contractVersion: "1.0";
  projectId: string; watermark: { sequence: number; hash: string | null };
  sources: EvidenceSource[]; observations: Observation[]; attributions: Attribution[]; receipts: Receipt[];
};

export function operationalEvidenceProjectionUrl(projectId: string, changeId: string): string {
  if (!projectId || !changeId) throw new Error("Требуется точная идентичность проекта и изменения.");
  return `/api/operational-outcomes/v1/projects/${encodeURIComponent(projectId)}/changes/${encodeURIComponent(changeId)}`;
}

export function operationalEvidenceErrorState(code: string): { kind: string; title: string } {
  if (code === "OUTCOME_PROJECT_WATERMARK_CHANGED") return { kind: "stale", title: "Данные устарели" };
  if (code === "OUTCOME_PRIVACY_VIOLATION") return { kind: "privacy-rejected", title: "Данные отклонены политикой конфиденциальности" };
  if (code === "OUTCOME_MANIFEST_TOO_LARGE") return { kind: "limit-rejected", title: "Превышен допустимый объём данных" };
  return { kind: "unavailable", title: "Данные результатов недоступны" };
}

function short(value: string | null | undefined, length = 16): string {
  return value ? value.slice(0, length) : "начало";
}

function date(value: string | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString("ru-RU");
}

function observationKind(item: Observation): string {
  if ("environmentClass" in item) return "развёртывание";
  if ("defectClass" in item) return "дефект";
  if ("minorUnits" in item) return "стоимость провайдера";
  return "наблюдение";
}

function observationState(item: Observation): string {
  return String(item.outcome ?? item.lifecycleState ?? item.measurementState ?? "зафиксировано");
}

function BoundedRefs({ values }: { values: string[] | undefined }) {
  const refs = values?.slice(0, 3) ?? [];
  return refs.length ? <ul className="intakeRefs">{refs.map((ref) => <li key={ref}><code>{ref}</code></li>)}</ul> : <span className="intakeMuted">Нет ограниченных ссылок</span>;
}

function EmptyGroup({ children }: { children: string }) {
  return <p className="intakeGroupEmpty">{children}</p>;
}

export function OperationalEvidenceProjectionResult({ projection, changeId }: { projection: OperationalEvidenceProjection; changeId: string }) {
  return <section className="intakeProjection" aria-label="Проекция данных результатов">
    <header><div><small>ПРОЕКЦИЯ ТОЛЬКО ДЛЯ ЧТЕНИЯ</small><h2>{projection.projectId} / {changeId}</h2></div><div className="intakeMark"><span>Отметка проекта · посл. {projection.watermark.sequence}</span><code>{short(projection.watermark.hash, 24)}</code></div></header>
    <div className="intakeSummary" aria-label="Сводка данных результатов">
      <div><span>Источники</span><strong>{projection.sources.length}</strong></div>
      <div><span>Наблюдения</span><strong>{projection.observations.length}</strong></div>
      <div><span>Атрибуции</span><strong>{projection.attributions.length}</strong></div>
      <div><span>Квитанции</span><strong>{projection.receipts.length}</strong></div>
    </div>
    <section className="intakeGroup"><header><h3>Источники доказательств</h3><span>{projection.sources.length}</span></header>
      {projection.sources.length ? <div className="intakeCards">{projection.sources.map((source) => <article key={source.sourceId}>
        <div><b>{source.family}</b><span className={`intakeStatus ${source.status}`}>{source.status}</span></div>
        <code>{source.sourceId}</code><p>{source.sourceSystem} · формат {source.formatVersion}</p>
        <dl><div><dt>Владелец</dt><dd>{source.ownerActor}</dd></div><div><dt>Политика</dt><dd>{source.privacyClass}</dd></div><div><dt>Регистрация</dt><dd>посл. {source.registeredSequence}</dd></div></dl>
        <small>Хеш {short(source.sourceHash, 20)} · {date(source.registeredAt)}</small>
      </article>)}</div> : <EmptyGroup>Для выбранного изменения источники ещё не зарегистрированы.</EmptyGroup>}
    </section>
    <section className="intakeGroup"><header><h3>Операционные наблюдения</h3><span>{projection.observations.length}</span></header>
      {projection.observations.length ? <div className="intakeRows">{projection.observations.map((item) => <article key={item.observationId}>
        <div><span className="intakeKind">{observationKind(item)}</span><b>{observationState(item)}</b><time>{date(item.occurredAt)}</time></div>
        <code>{item.observationId}</code><small>Запись источника: {item.sourceRecordId}</small><BoundedRefs values={item.evidenceRefs} />
      </article>)}</div> : <EmptyGroup>Для выбранного изменения наблюдений пока нет.</EmptyGroup>}
    </section>
    <section className="intakeGroup"><header><h3>Решения об атрибуции</h3><span>{projection.attributions.length}</span></header>
      {projection.attributions.length ? <div className="intakeRows">{projection.attributions.map((item) => <article key={`${item.observationId}:${item.sequence}`}>
        <div><span className={`intakeStatus ${item.decision}`}>{item.decision}</span><b>{item.reasonCode}</b><time>{date(item.decidedAt)}</time></div>
        <code>{item.observationId} → {item.changeId}</code><small>Решение: {item.decidedBy} · посл. {item.sequence}</small><BoundedRefs values={item.evidenceRefs} />
      </article>)}</div> : <EmptyGroup>Решений об атрибуции для выбранного изменения нет.</EmptyGroup>}
    </section>
    <section className="intakeGroup"><header><h3>Неизменяемые квитанции</h3><span>{projection.receipts.length}</span></header>
      {projection.receipts.length ? <div className="intakeRows receipts">{projection.receipts.map((item) => <article key={item.receiptId}>
        <div><span className="intakeKind">{item.operationKind}</span><b>{item.actor}</b><time>{date(item.publishedAt)}</time></div>
        <code>{item.receiptId}</code><small>Результат: посл. {item.resultingWatermark.sequence} · {short(item.resultingWatermark.hash, 18)}</small>
        <p>{item.observationIds.length ? `${item.observationIds.length} набл.` : "Без новых наблюдений"} · квитанция {short(item.receiptHash, 18)}</p>
      </article>)}</div> : <EmptyGroup>Квитанций для выбранного изменения пока нет.</EmptyGroup>}
    </section>
  </section>;
}

export function OperationalEvidenceIntakeDashboard() {
  const [projects, setProjects] = useState<Phase6Projection["sourceWatermarks"]>([]);
  const [changes, setChanges] = useState<Array<{ projectId: string; changeId: string }>>([]);
  const [projectId, setProjectId] = useState("");
  const [changeId, setChangeId] = useState("");
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [projection, setProjection] = useState<OperationalEvidenceProjection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const sourceRequestRef = useRef(0);
  const projectionRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++sourceRequestRef.current;
    Promise.all([
      fetch("/api/operator-projections/v1/overview?limit=25", { cache: "no-store" }),
      fetch("/api/operator-projections/v1/execution-bucket?limit=25", { cache: "no-store" }),
    ]).then(async ([projectsResponse, changesResponse]) => {
      if (!projectsResponse.ok || !changesResponse.ok) throw Object.assign(new Error("Источники выбора фазы 6 недоступны."), { code: "SOURCE_UNAVAILABLE" });
      const [projectProjection, changeProjection] = await Promise.all([projectsResponse.json() as Promise<Phase6Projection>, changesResponse.json() as Promise<Phase6Projection>]);
      if (requestId !== sourceRequestRef.current) return;
      const seen = new Set<string>();
      const nextChanges = changeProjection.items.flatMap((item) => {
        const nextChangeId = String(item.data.changeId ?? item.entityId ?? "");
        const key = `${item.projectId}\0${nextChangeId}`;
        if (!nextChangeId || seen.has(key)) return [];
        seen.add(key); return [{ projectId: item.projectId, changeId: nextChangeId }];
      });
      const firstProject = projectProjection.sourceWatermarks.find((item) => nextChanges.some((change) => change.projectId === item.projectId));
      setProjects(projectProjection.sourceWatermarks); setChanges(nextChanges);
      const nextProjectId = firstProject?.projectId ?? projectProjection.sourceWatermarks[0]?.projectId ?? "";
      setProjectId(nextProjectId);
      setChangeId(nextChanges.find((item) => item.projectId === nextProjectId)?.changeId ?? "");
      setError(null);
    }).catch((reason) => {
      if (requestId === sourceRequestRef.current) setError({ code: reason.code ?? "SOURCE_UNAVAILABLE", message: reason instanceof Error ? reason.message : "Источники выбора недоступны." });
    }).finally(() => { if (requestId === sourceRequestRef.current) setSourcesLoading(false); });
    return () => { sourceRequestRef.current += 1; };
  }, []);

  const projectChanges = useMemo(() => changes.filter((item) => item.projectId === projectId), [changes, projectId]);

  function clearResult() { projectionRequestRef.current += 1; setProjection(null); setError(null); setLoading(false); }

  function chooseProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    setChangeId(changes.find((item) => item.projectId === nextProjectId)?.changeId ?? "");
    clearResult();
  }

  async function loadProjection() {
    if (!projectId || !changeId) return;
    const requestId = ++projectionRequestRef.current;
    setLoading(true); setError(null);
    try {
      const response = await fetch(operationalEvidenceProjectionUrl(projectId, changeId), { cache: "no-store" });
      const body = await response.json() as OperationalEvidenceProjection | { code?: string; error?: string };
      if (!response.ok) throw Object.assign(new Error("error" in body && body.error ? body.error : "Не удалось прочитать данные результатов."), { code: "code" in body ? body.code : undefined });
      if (requestId === projectionRequestRef.current) setProjection(body as OperationalEvidenceProjection);
    } catch (reason) {
      const value = reason as Error & { code?: string };
      if (requestId === projectionRequestRef.current) { setProjection(null); setError({ code: value.code ?? "SOURCE_UNAVAILABLE", message: value.message }); }
    } finally { if (requestId === projectionRequestRef.current) setLoading(false); }
  }

  if (sourcesLoading) return <div className="operatorLoading"><i /><span>Чтение точных проектов и изменений фазы 6…</span></div>;
  if (!projects.length) return <div className="operatorEmpty"><span aria-hidden="true">○</span><h3>Нет источников результатов</h3><p>Проверенные журналы проектов пока не дают доступного выбора.</p></div>;
  const state = error ? operationalEvidenceErrorState(error.code) : null;
  return <div className="intakeWorkspace">
    <section className="intakeSelector" aria-label="Выбор данных результатов">
      <header><div><small>РУЧНОЙ ПРИЁМ · СРЕЗ 1</small><h2>Данные операционных результатов</h2></div><span>Только чтение</span></header>
      <div className="intakeFields">
        <label>Точный проект<select aria-label="Проект данных результатов" value={projectId} onChange={(event) => chooseProject(event.target.value)}>{projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.projectId} · посл. {item.sequence}</option>)}</select></label>
        <label>Точное изменение<select aria-label="Изменение данных результатов" value={changeId} onChange={(event) => { setChangeId(event.target.value); clearResult(); }}>{projectChanges.map((item) => <option key={item.changeId} value={item.changeId}>{item.changeId}</option>)}</select></label>
      </div>
      {!projectChanges.length ? <p className="intakeNotice">Для этого проекта на ограниченной странице фазы 6 точных изменений нет.</p> : null}
      <footer><span>Запрос выполняется только по явному действию и ничего не изменяет.</span><button onClick={() => void loadProjection()} disabled={loading || !changeId}>{loading ? "Читаем…" : projection ? "Обновить данные" : "Показать данные"}</button></footer>
    </section>
    {loading ? <div className="intakeLoading"><i /><div><b>Чтение проекции Phase 10</b><span>{projectId} / {changeId}</span></div></div> : null}
    {error && state ? <section className={`intakeState ${state.kind}`} role="alert"><small>{error.code}</small><h3>{state.title}</h3><p>{error.message}</p><button onClick={() => void loadProjection()} disabled={!changeId}>Повторить чтение</button></section> : null}
    {!loading && !error && projection ? <OperationalEvidenceProjectionResult projection={projection} changeId={changeId} /> : null}
    {!loading && !error && !projection ? <div className="operatorEmpty intakeWaiting"><span aria-hidden="true">↳</span><h3>Выберите точное изменение</h3><p>Затем явно запросите ограниченную проекцию Phase 10.</p></div> : null}
  </div>;
}
