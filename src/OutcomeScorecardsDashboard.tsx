import { useEffect, useRef, useState } from "react";

const POLICY_VERSION = "outcome-scorecard-policy-v1" as const;

type ProjectEvidence = { projectId: string; sequence: number; hash: string | null };
type Phase6Overview = { sourceWatermarks: ProjectEvidence[] };
type SourceWatermark = { sequence: number; hash: string | null };
type RunIdentity = { runId: string; algorithm: "sha256"; sha256: string; byteLength: number };
type Finding = {
  code: string;
  subjectType: string;
  subjectRef: string;
  evidenceRefs: readonly string[];
};
type Privacy = {
  policyVersion: string;
  prohibitedFieldsExcluded: true;
  diagnosticsBounded: true;
};

export type OutcomeScorecardDiscovery = {
  contractType: "OutcomeScorecardDiscoveryV1";
  contractVersion: "1.0";
  policyVersion: typeof POLICY_VERSION;
  selector: { projectId: string; fromSequence: number; toSequence: number; runIds?: readonly string[] };
  sourceWatermark: SourceWatermark;
  candidates: readonly { identity: RunIdentity; joinRefs: readonly string[] }[];
  findings: readonly Finding[];
  privacy: Privacy;
  discoveryHash: string;
};

type MetricEvidence = {
  subjectRef: string;
  numeratorContribution: number;
  denominatorContribution: 0 | 1;
  excluded: boolean;
  value?: number;
  reasonCode?: string;
  evidenceRefs: readonly string[];
};
type Metric = {
  metricId: string;
  status: "complete" | "insufficient-evidence";
  numerator: number;
  denominator: number;
  excludedCount: number;
  coverage: number;
  policyVersion: string;
  value: number | null;
  unit?: string;
  evidence: readonly MetricEvidence[];
  distribution?: {
    count: number;
    sum: number;
    min: number | null;
    max: number | null;
    rawValues?: readonly number[];
    percentiles?: { p50: number; p90: number; p95: number };
  };
};

export type OutcomeScorecard = {
  contractType: "OutcomeScorecardV1";
  contractVersion: "1.0";
  policyVersion: string;
  selector: { projectId: string; fromSequence: number; toSequence: number; runIds?: readonly string[] };
  cohortId: string;
  sourceWatermarks: { project: SourceWatermark; runs: readonly RunIdentity[] };
  cohort: {
    includedRuns: readonly { identity: RunIdentity; evidenceRefs: readonly string[] }[];
    excludedRuns: readonly Finding[];
    includedTasks: readonly { taskRef: string; evidenceRefs: readonly string[] }[];
    excludedTasks: readonly Finding[];
    includedAttempts: readonly { attemptRef: string; evidenceRefs: readonly string[] }[];
    excludedAttempts: readonly Finding[];
  };
  metrics: {
    delivery: Record<string, Metric>;
    qualitySafety: Record<string, Metric>;
    operational?: Record<string, Metric>;
    unsupported: readonly {
      outcomeClass: string;
      status: "unsupported";
      reasonCode: "METRIC_UNSUPPORTED";
      missingAuthority: string;
      evidenceRefs: readonly string[];
    }[];
  };
  findings: readonly Finding[];
  privacy: Privacy;
  completeness: {
    complete: boolean;
    checks: readonly { checkId: string; status: "pass" | "insufficient-evidence"; reasonCodes: readonly string[] }[];
  };
  scorecardHash: string;
};

export type OutcomeScorecardRequest = {
  contractType: "OutcomeScorecardRequestV1";
  contractVersion: "1.0";
  policyVersion: typeof POLICY_VERSION;
  selector: {
    projectId: string;
    fromSequence: number;
    toSequence: number;
    runIds: string[];
  };
  sourceWatermark: SourceWatermark;
  runRecordIdentities: RunIdentity[];
};

export type OutcomeScorecardRejectedState =
  | "stale"
  | "incomplete"
  | "privacy-rejected"
  | "limit-rejected"
  | "unavailable";

export function outcomeScorecardDiscoveryUrl(
  projectId: string,
  fromSequence: number,
  toSequence: number,
): string {
  if (!projectId || !Number.isSafeInteger(fromSequence) || !Number.isSafeInteger(toSequence) || fromSequence < 1 || toSequence < fromSequence)
    throw new Error("Нужны проект и корректный включительный диапазон последовательности.");
  const query = new URLSearchParams({
    fromSequence: String(fromSequence),
    toSequence: String(toSequence),
  });
  return `/api/outcome-scorecards/v1/projects/${encodeURIComponent(projectId)}/discovery?${query}`;
}

export function outcomeScorecardComputeRequest(
  discovery: OutcomeScorecardDiscovery,
  selectedRunIds: readonly string[],
): OutcomeScorecardRequest {
  const ids = [...new Set(selectedRunIds)].sort();
  const candidates = new Map(discovery.candidates.map((candidate) => [candidate.identity.runId, candidate.identity]));
  const identities = ids.map((runId) => {
    const identity = candidates.get(runId);
    if (!identity) throw new Error("Выбранного запуска нет в привязанном результате поиска.");
    return { ...identity };
  });
  return {
    contractType: "OutcomeScorecardRequestV1",
    contractVersion: "1.0",
    policyVersion: POLICY_VERSION,
    selector: {
      projectId: discovery.selector.projectId,
      fromSequence: discovery.selector.fromSequence,
      toSequence: discovery.selector.toSequence,
      runIds: ids,
    },
    sourceWatermark: { ...discovery.sourceWatermark },
    runRecordIdentities: identities,
  };
}

export function outcomeScorecardEvidenceMatches(
  bound: OutcomeScorecardDiscovery,
  refreshed: OutcomeScorecardDiscovery,
  selectedRunIds: readonly string[],
): boolean {
  if (
    bound.selector.projectId !== refreshed.selector.projectId ||
    bound.selector.fromSequence !== refreshed.selector.fromSequence ||
    bound.selector.toSequence !== refreshed.selector.toSequence ||
    bound.sourceWatermark.sequence !== refreshed.sourceWatermark.sequence ||
    bound.sourceWatermark.hash !== refreshed.sourceWatermark.hash
  ) return false;
  const refreshedIdentities = new Map(refreshed.candidates.map((candidate) => [candidate.identity.runId, candidate.identity]));
  return selectedRunIds.every((runId) => {
    const previous = bound.candidates.find((candidate) => candidate.identity.runId === runId)?.identity;
    const next = refreshedIdentities.get(runId);
    return !!previous && !!next && previous.algorithm === next.algorithm && previous.sha256 === next.sha256 && previous.byteLength === next.byteLength;
  });
}

export function outcomeScorecardRejectedState(code: string): OutcomeScorecardRejectedState {
  if (["SOURCE_WATERMARK_CHANGED", "RUN_IDENTITY_CHANGED", "EVIDENCE_CONFLICT"].includes(code)) return "stale";
  if (code === "PRIVACY_VIOLATION") return "privacy-rejected";
  if (["COHORT_LIMIT_EXCEEDED", "SCORECARD_TOO_LARGE"].includes(code)) return "limit-rejected";
  if (code === "EVIDENCE_INCOMPLETE") return "incomplete";
  return "unavailable";
}

export function outcomeScorecardDownload(
  scorecard: OutcomeScorecard | null,
): { filename: string; mediaType: "application/json"; json: string } | null {
  if (!scorecard) return null;
  const identity = `${scorecard.selector.projectId}-${scorecard.selector.fromSequence}-${scorecard.selector.toSequence}-${scorecard.scorecardHash.slice(0, 12)}`
    .replace(/[^a-zA-Z0-9._-]/g, "-");
  return {
    filename: `outcome-scorecard-${identity}.json`,
    mediaType: "application/json",
    json: JSON.stringify(scorecard, null, 2),
  };
}

export function outcomeScorecardMetricValue(metric: Metric): string {
  if (metric.status !== "complete" || metric.denominator === 0 || metric.value === null) return "Не рассчитано";
  if (["firstPassAcceptanceRate", "overrideRate", "humanEscalationRate", "haltRecurrenceRate", "deploymentFailureRate", "rollbackRate", "hotfixRate", "productionReworkRate"].includes(metric.metricId))
    return metric.value.toLocaleString("ru-RU", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (metric.metricId === "dispatchToAcceptedMs") return `${Math.round(metric.value).toLocaleString("ru-RU")} мс`;
  if (metric.metricId === "providerMonetaryCost" && metric.unit) {
    const currency = metric.unit.split(":")[0];
    return (metric.value / 100).toLocaleString("ru-RU", { style: "currency", currency });
  }
  return metric.value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function short(value: string | null | undefined, length = 16) {
  return value ? value.slice(0, length) : "начало";
}

const metricLabels: Record<string, string> = {
  firstPassAcceptanceRate: "Принятие с первой попытки",
  reviewCorrectionCycles: "Циклы проверки и исправлений",
  dispatchToAcceptedMs: "Время от запуска до принятия",
  tokensPerAcceptedTask: "Токены на принятую задачу",
  overrideRate: "Доля обходов диспетчеризации",
  humanEscalationRate: "Доля эскалаций человеку",
  haltRecurrenceRate: "Доля повторных остановок",
  escapedDefects7Day: "Пропущенные дефекты за 7 дней",
  escapedDefects30Day: "Пропущенные дефекты за 30 дней",
  escapedDefects90Day: "Пропущенные дефекты за 90 дней",
  deploymentFailureRate: "Доля неудачных развёртываний",
  rollbackRate: "Доля откатов",
  hotfixRate: "Доля срочных исправлений",
  productionReworkRate: "Доля доработок в рабочей среде",
  providerMonetaryCost: "Денежная стоимость провайдера",
};

const unsupportedLabels: Record<string, string> = {
  escapedDefects7Day: "Пропущенные дефекты за 7 дней",
  escapedDefects30Day: "Пропущенные дефекты за 30 дней",
  escapedDefects90Day: "Пропущенные дефекты за 90 дней",
  deploymentFailureRate: "Доля неудачных развёртываний",
  rollbackRate: "Доля откатов",
  hotfixRate: "Доля срочных исправлений",
  productionReworkRate: "Доля доработок в рабочей среде",
  providerMonetaryCost: "Денежная стоимость провайдера",
  businessImpact: "Влияние на бизнес",
  customerImpact: "Влияние на клиентов",
  productivitySavings: "Экономия рабочего времени",
  bugFreeDelivery: "Поставка без дефектов",
  manualBaselineComparison: "Сравнение с ручной базой",
};

const authorityLabels: Record<string, string> = {
  "post-delivery-defect-authority": "нет авторитетного источника дефектов после поставки",
  "deployment-authority": "нет авторитетного источника развёртываний",
  "provider-billing-authority": "нет авторитетного источника биллинга провайдера",
  "business-outcome-authority": "нет авторитетного источника бизнес-результатов",
  "customer-outcome-authority": "нет авторитетного источника клиентских результатов",
  "productivity-baseline-authority": "нет версионированной базы производительности",
  "versioned-cohort-authority": "нет авторитетной версионированной когорты",
};

function metricLabel(metricId: string) {
  return metricLabels[metricId] ?? metricId;
}

function subjectLabel(subjectType: string) {
  return ({ run: "запуск", task: "задача", attempt: "попытка", metric: "метрика", cohort: "когорта", project: "проект" } as Record<string, string>)[subjectType] ?? subjectType;
}

function PrivacyPanel({ privacy }: { privacy: Privacy }) {
  return <article className="scorecardPrivacy" aria-label="Статус конфиденциальности">
    <h3>Граница конфиденциальности</h3>
    <p><span>Политика</span><code>{privacy.policyVersion}</code></p>
    <p><span>Запрещённые поля</span><strong>Исключены</strong></p>
    <p><span>Диагностика</span><strong>Ограничена</strong></p>
  </article>;
}

function ReferenceList({ references }: { references: readonly string[] }) {
  return references.length
    ? <ul className="scorecardRefs">{references.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul>
    : <p className="scorecardNoRefs">Ссылки на доказательства не получены.</p>;
}

function MetricCard({ metric }: { metric: Metric }) {
  const insufficient = metric.status === "insufficient-evidence" || metric.denominator === 0;
  return <article className={`scorecardMetric ${insufficient ? "insufficient" : "complete"}`}>
    <header>
      <div><small>{metric.metricId}</small><h3>{metricLabel(metric.metricId)}</h3></div>
      <span>{insufficient ? "недостаточно данных" : "готово"}</span>
    </header>
    <strong className="scorecardMetricValue">{outcomeScorecardMetricValue(metric)}</strong>
    {insufficient ? <p className="scorecardMetricGuard" role="status">Числовой результат не показан: данные неполны или знаменатель равен нулю.</p> : null}
    <dl className="scorecardMetricFacts">
      <div><dt>Числитель</dt><dd>{metric.numerator}</dd></div>
      <div><dt>Знаменатель</dt><dd>{metric.denominator}</dd></div>
      <div><dt>Исключено</dt><dd>{metric.excludedCount}</dd></div>
      <div><dt>Покрытие</dt><dd>{metric.coverage.toLocaleString("ru-RU", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 })}</dd></div>
    </dl>
    <p className="scorecardPolicy"><span>Политика метрики</span><code>{metric.policyVersion}</code></p>
    {metric.unit ? <p className="scorecardPolicy"><span>Единица</span><code>{metric.unit}</code></p> : null}
    {metric.distribution ? <div className="scorecardDistribution" aria-label={`Ограниченное распределение: ${metricLabel(metric.metricId)}`}>
      <h4>Ограниченное распределение</h4>
      <dl>
        <div><dt>Количество</dt><dd>{metric.distribution.count}</dd></div>
        <div><dt>Сумма</dt><dd>{metric.distribution.sum}</dd></div>
        <div><dt>Мин.</dt><dd>{metric.distribution.min ?? "—"}</dd></div>
        <div><dt>Макс.</dt><dd>{metric.distribution.max ?? "—"}</dd></div>
      </dl>
      {metric.distribution.rawValues ? <p><span>Исходные значения</span><code>{metric.distribution.rawValues.join(", ") || "—"}</code></p> : null}
      {metric.distribution.percentiles ? <p><span>Перцентили</span><code>p50 {metric.distribution.percentiles.p50} · p90 {metric.distribution.percentiles.p90} · p95 {metric.distribution.percentiles.p95}</code></p> : null}
      {!metric.distribution.rawValues && !metric.distribution.percentiles ? <p><span>Наблюдения</span><code>Не получены</code></p> : null}
    </div> : <div className="scorecardDistribution none"><h4>Ограниченное распределение</h4><p>Для этой долевой метрики распределение не определено.</p></div>}
    <details className="scorecardEvidence">
      <summary>Ссылки на доказательства · {metric.evidence.length}</summary>
      {metric.evidence.length ? metric.evidence.map((item) => <section key={item.subjectRef}>
        <header><code>{item.subjectRef}</code><span>{item.excluded ? "исключено" : "включено"}</span></header>
        <p>Числитель {item.numeratorContribution} · знаменатель {item.denominatorContribution}{item.value === undefined ? "" : ` · значение ${item.value}`}</p>
        {item.reasonCode ? <b>{item.reasonCode}</b> : null}
        <ReferenceList references={item.evidenceRefs} />
      </section>) : <p className="scorecardNoRefs">Наблюдения для метрики не получены.</p>}
    </details>
  </article>;
}

function Findings({ title, findings }: { title: string; findings: readonly Finding[] }) {
  return <section className="scorecardFindings">
    <header><h3>{title}</h3><span>Найдено: {findings.length}</span></header>
    {findings.length ? findings.map((finding, index) => <article key={`${finding.code}:${finding.subjectRef}:${index}`}>
      <div><b>{finding.code}</b><span>{subjectLabel(finding.subjectType)}</span></div>
      <code>{finding.subjectRef}</code>
      <ReferenceList references={finding.evidenceRefs} />
    </article>) : <p className="scorecardClear">Исключений и предупреждений нет.</p>}
  </section>;
}

export function OutcomeScorecardResult({ scorecard, onDownload }: { scorecard: OutcomeScorecard; onDownload?: () => void }) {
  const metrics = [
    ...Object.values(scorecard.metrics.delivery),
    ...Object.values(scorecard.metrics.qualitySafety),
    ...Object.values(scorecard.metrics.operational ?? {}),
  ];
  const exclusions = [
    ...scorecard.cohort.excludedRuns,
    ...scorecard.cohort.excludedTasks,
    ...scorecard.cohort.excludedAttempts,
  ];
  return <section className="scorecardResult" aria-label="Результат сводки">
    <header>
      <div><small>{scorecard.contractType} · {scorecard.contractVersion}</small><h2>{scorecard.selector.projectId}</h2><p>Включительный диапазон {scorecard.selector.fromSequence}–{scorecard.selector.toSequence}</p></div>
      <div className={`scorecardCompleteness ${scorecard.completeness.complete ? "complete" : "incomplete"}`}><span>{scorecard.completeness.complete ? "готово" : "неполно"}</span><code>{short(scorecard.scorecardHash)}</code></div>
    </header>
    {!scorecard.completeness.complete ? <div className="scorecardIncomplete" role="status"><b>Неполная сводка</b><span>Для одной или нескольких метрик недостаточно данных. Отсутствующие результаты не рассчитываются.</span></div> : null}
    <div className="scorecardSummary">
      <div><span>Запуски</span><strong>{scorecard.cohort.includedRuns.length}</strong></div>
      <div><span>Задачи</span><strong>{scorecard.cohort.includedTasks.length}</strong></div>
      <div><span>Попытки</span><strong>{scorecard.cohort.includedAttempts.length}</strong></div>
      <div><span>Исключения</span><strong>{exclusions.length}</strong></div>
      <div><span>Водяной знак проекта</span><code>посл. {scorecard.sourceWatermarks.project.sequence} · {short(scorecard.sourceWatermarks.project.hash)}</code></div>
      <div><span>scorecardHash</span><code>{scorecard.scorecardHash}</code></div>
    </div>
    <section className="scorecardWatermarks"><header><h3>Неизменяемые водяные знаки источников</h3><span>Запусков: {scorecard.sourceWatermarks.runs.length}</span></header>
      {scorecard.sourceWatermarks.runs.map((identity) => <p key={identity.runId}><code>{identity.runId}</code><span>{identity.byteLength.toLocaleString("ru-RU")} байт</span><code>{identity.algorithm}:{identity.sha256}</code></p>)}
      {!scorecard.sourceWatermarks.runs.length ? <p className="scorecardClear">Включённые идентификаторы запусков не получены.</p> : null}
    </section>
    <div className="scorecardPrivacyRow"><PrivacyPanel privacy={scorecard.privacy} /><article><h3>Проверки полноты</h3>{scorecard.completeness.checks.map((check) => {
      const metricId = check.checkId.startsWith("metric:") ? check.checkId.slice("metric:".length) : check.checkId;
      return <p key={check.checkId}><span title={check.checkId}>{metricLabel(metricId)}</span><strong className={check.status === "pass" ? "pass" : "insufficient"}>{check.status === "pass" ? "пройдено" : "недостаточно данных"}</strong><small>{check.reasonCodes.join(", ") || "Замечаний нет"}</small></p>;
    })}</article></div>
    <section className="scorecardMetrics"><header><h2>Измеренные результаты</h2><p>Для каждой метрики v1 показаны статус и доказательства.</p></header><div>{metrics.map((metric) => <MetricCard key={metric.metricId} metric={metric} />)}</div></section>
    <Findings title="Предупреждения и исключения" findings={scorecard.findings.length ? scorecard.findings : exclusions} />
    <section className="scorecardUnsupported"><header><h2>Неподдерживаемые классы результатов</h2><p>Для них нет принятого источника v1, поэтому значения не выводятся.</p></header><div>{scorecard.metrics.unsupported.map((item) => <article key={item.outcomeClass}><span>не поддерживается</span><small>{item.outcomeClass}</small><h3>{unsupportedLabels[item.outcomeClass] ?? item.outcomeClass}</h3><p><b>{item.reasonCode}</b> · {authorityLabels[item.missingAuthority] ?? "нет принятого авторитетного источника"}</p><code>{item.missingAuthority}</code><ReferenceList references={item.evidenceRefs} /></article>)}</div></section>
    <footer><span>Скачивается уже полученный ограниченный JSON без повторного расчёта.</span><button type="button" onClick={onDownload} disabled={!onDownload}>Скачать ограниченный JSON</button></footer>
  </section>;
}

export function OutcomeScorecardErrorState({ code, onReset }: { code: string; onReset: () => void }) {
  const state = outcomeScorecardRejectedState(code);
  const content: Record<OutcomeScorecardRejectedState, [string, string]> = {
    stale: ["Данные устарели", "Изменился водяной знак проекта или неизменяемый идентификатор запуска."],
    incomplete: ["Данные неполны", "Для выбранной когорты нельзя построить полную сводку."],
    "privacy-rejected": ["Отклонено политикой конфиденциальности", "Ответ отклонён до показа запрещённых данных."],
    "limit-rejected": ["Ограниченная когорта отклонена", "Когорта или ответ превышает принятые ограничения фазы 9."],
    unavailable: ["Данные о результатах недоступны", "Версионированный источник фазы 6 или 9 недоступен."],
  };
  return <section className={`scorecardState ${state}`} role="alert"><small>{code}</small><h3>{content[state][0]}</h3><p>{content[state][1]}</p><button type="button" onClick={onReset}>Выбрать актуальные данные</button></section>;
}

export function OutcomeScorecardsDashboard() {
  const [projects, setProjects] = useState<ProjectEvidence[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [fromSequence, setFromSequence] = useState(1);
  const [toSequence, setToSequence] = useState(1);
  const [discovery, setDiscovery] = useState<OutcomeScorecardDiscovery | null>(null);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([]);
  const [scorecard, setScorecard] = useState<OutcomeScorecard | null>(null);
  const [loading, setLoading] = useState<"discovery" | "refresh" | "compute" | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const sourceRequestRef = useRef(0);
  const evidenceRequestRef = useRef(0);

  useEffect(() => {
    const requestId = ++sourceRequestRef.current;
    fetch("/api/operator-projections/v1/overview?limit=25", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("SOURCE_UNAVAILABLE");
        return response.json() as Promise<Phase6Overview>;
      })
      .then((overview) => {
        if (requestId !== sourceRequestRef.current) return;
        setProjects(overview.sourceWatermarks);
        const first = overview.sourceWatermarks[0];
        if (first) {
          setProjectId(first.projectId);
          setToSequence(Math.max(first.sequence, 1));
        }
      })
      .catch(() => { if (requestId === sourceRequestRef.current) setErrorCode("SOURCE_UNAVAILABLE"); })
      .finally(() => { if (requestId === sourceRequestRef.current) setSourcesLoading(false); });
    return () => { sourceRequestRef.current += 1; evidenceRequestRef.current += 1; };
  }, []);

  const selectedProject = projects.find((project) => project.projectId === projectId);
  const rangeValid = !!projectId && Number.isSafeInteger(fromSequence) && Number.isSafeInteger(toSequence) && fromSequence > 0 && toSequence >= fromSequence && toSequence <= (selectedProject?.sequence ?? 0);

  function clearBoundEvidence() {
    evidenceRequestRef.current += 1;
    setDiscovery(null);
    setSelectedRunIds([]);
    setScorecard(null);
    setErrorCode(null);
    setLoading(null);
  }

  function chooseProject(nextProjectId: string) {
    clearBoundEvidence();
    setProjectId(nextProjectId);
    setFromSequence(1);
    setToSequence(Math.max(projects.find((project) => project.projectId === nextProjectId)?.sequence ?? 1, 1));
  }

  async function discover(refresh: boolean) {
    if (!rangeValid) return;
    const bound = discovery;
    const boundRunIds = selectedRunIds;
    const requestId = ++evidenceRequestRef.current;
    setLoading(refresh ? "refresh" : "discovery");
    setErrorCode(null);
    if (!refresh) setScorecard(null);
    try {
      const response = await fetch(outcomeScorecardDiscoveryUrl(projectId, fromSequence, toSequence), { cache: "no-store" });
      const body = await response.json() as OutcomeScorecardDiscovery | { code?: string };
      if (!response.ok) throw Object.assign(new Error("Поиск отклонён"), { code: "code" in body ? body.code : undefined });
      if (requestId !== evidenceRequestRef.current) return;
      const next = body as OutcomeScorecardDiscovery;
      if (refresh && bound && !outcomeScorecardEvidenceMatches(bound, next, boundRunIds)) {
        setScorecard(null);
        setErrorCode("SOURCE_WATERMARK_CHANGED");
        return;
      }
      setDiscovery(next);
      setSelectedRunIds(refresh ? boundRunIds : next.candidates.map((candidate) => candidate.identity.runId));
    } catch (reason) {
      if (requestId === evidenceRequestRef.current) setErrorCode((reason as { code?: string }).code ?? "SOURCE_UNAVAILABLE");
    } finally {
      if (requestId === evidenceRequestRef.current) setLoading(null);
    }
  }

  async function compute() {
    if (!discovery || !selectedRunIds.length) return;
    const requestId = ++evidenceRequestRef.current;
    setLoading("compute");
    setErrorCode(null);
    setScorecard(null);
    try {
      const request = outcomeScorecardComputeRequest(discovery, selectedRunIds);
      const response = await fetch("/api/outcome-scorecards/v1/compute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json() as OutcomeScorecard | { code?: string };
      if (!response.ok) throw Object.assign(new Error("Расчёт отклонён"), { code: "code" in body ? body.code : undefined });
      if (requestId === evidenceRequestRef.current) setScorecard(body as OutcomeScorecard);
    } catch (reason) {
      if (requestId === evidenceRequestRef.current) setErrorCode((reason as { code?: string }).code ?? "SOURCE_UNAVAILABLE");
    } finally {
      if (requestId === evidenceRequestRef.current) setLoading(null);
    }
  }

  function downloadReturnedScorecard() {
    const artifact = outcomeScorecardDownload(scorecard);
    if (!artifact) return;
    const url = URL.createObjectURL(new Blob([artifact.json], { type: artifact.mediaType }));
    const link = document.createElement("a");
    link.href = url;
    link.download = artifact.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function selectRun(runId: string, selected: boolean) {
    setSelectedRunIds((current) => selected ? [...new Set([...current, runId])].sort() : current.filter((item) => item !== runId));
    setScorecard(null);
    setErrorCode(null);
  }

  if (sourcesLoading) return <div className="operatorLoading"><i /><span>Чтение данных проектов фазы 6…</span></div>;
  if (errorCode && !projects.length) return <OutcomeScorecardErrorState code={errorCode} onReset={() => window.location.reload()} />;
  if (!projects.length) return <div className="operatorEmpty"><span aria-hidden="true">○</span><h3>Нет источников результатов</h3><p>В ограниченном обзоре фазы 6 нет проектов.</p></div>;

  return <div className="scorecardWorkspace">
    <section className="scorecardBuilder" aria-label="Выбор когорты для сводки результатов">
      <header><div><small>РЕЗУЛЬТАТЫ · ТОЛЬКО ЧТЕНИЕ</small><h2>Рассчитать ограниченную сводку</h2></div><span>Без канонических записей</span></header>
      <div className="scorecardFields">
        <label>Проект<select aria-label="Проект сводки результатов" value={projectId} onChange={(event) => chooseProject(event.target.value)}>{projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.projectId} · посл. {project.sequence}</option>)}</select></label>
        <label>Начальная последовательность<input aria-label="Начальная последовательность сводки" type="number" min="1" max={selectedProject?.sequence ?? 1} value={fromSequence} onChange={(event) => { clearBoundEvidence(); setFromSequence(Number(event.target.value)); }} /></label>
        <label>Конечная последовательность<input aria-label="Конечная последовательность сводки" type="number" min={fromSequence} max={selectedProject?.sequence ?? 1} value={toSequence} onChange={(event) => { clearBoundEvidence(); setToSequence(Number(event.target.value)); }} /></label>
      </div>
      <footer><span>Включительный канонический диапазон · {fromSequence}–{toSequence}</span><button type="button" onClick={() => void discover(false)} disabled={!rangeValid || loading !== null}>{loading === "discovery" ? "Поиск…" : "Найти точные запуски"}</button></footer>
    </section>

    {loading ? <section className="scorecardLoading" role="status"><i /><div><b>{loading === "compute" ? "Расчёт сводки" : loading === "refresh" ? "Проверка привязанных данных" : "Поиск точных запусков"}</b><span>Читаются только версионированные данные фаз 6, 9 и 10.</span></div></section> : null}
    {errorCode ? <OutcomeScorecardErrorState code={errorCode} onReset={() => { clearBoundEvidence(); }} /> : null}

    {discovery && !errorCode ? <section className="scorecardDiscovery" aria-label="Найденные точные идентификаторы запусков">
      <header><div><small>{discovery.contractType} · {discovery.contractVersion}</small><h2>Выберите точные идентификаторы запусков</h2></div><div><span>Последовательность проекта: {discovery.sourceWatermark.sequence}</span><code>{short(discovery.sourceWatermark.hash)}</code></div></header>
      <div className="scorecardDiscoveryMeta"><span>Хеш поиска</span><code>{discovery.discoveryHash}</code><PrivacyPanel privacy={discovery.privacy} /></div>
      {discovery.findings.length ? <Findings title="Предупреждения и исключения поиска" findings={discovery.findings} /> : null}
      {discovery.candidates.length ? <fieldset className="scorecardRuns"><legend>Точные ID найденных запусков · выбрано: {selectedRunIds.length}</legend>{discovery.candidates.map((candidate) => <label key={candidate.identity.runId}><input type="checkbox" checked={selectedRunIds.includes(candidate.identity.runId)} onChange={(event) => selectRun(candidate.identity.runId, event.target.checked)} /><span><b>{candidate.identity.runId}</b><code>{candidate.identity.algorithm}:{candidate.identity.sha256}</code><small>{candidate.identity.byteLength.toLocaleString("ru-RU")} байт · ссылок связи: {candidate.joinRefs.length}</small></span></label>)}</fieldset>
        : <div className="operatorEmpty scorecardEmpty"><span aria-hidden="true">○</span><h3>Связанные запуски не найдены</h3><p>Для заданного диапазона нет точного связанного запуска. Нулевой результат не подставляется.</p></div>}
      <footer><button type="button" className="secondary" onClick={() => void discover(true)} disabled={loading !== null}>Проверить привязанные данные</button><span>Расчёт привязывается к полученному водяному знаку и выбранным неизменяемым идентификаторам.</span><button type="button" onClick={() => void compute()} disabled={loading !== null || !selectedRunIds.length}>Рассчитать сводку</button></footer>
    </section> : !errorCode ? <div className="operatorEmpty scorecardWaiting"><span aria-hidden="true">↓</span><h3>Когорта ещё не найдена</h3><p>Выберите проект и включительный диапазон. Расчёт и скачивание не запускаются автоматически.</p></div> : null}

    {scorecard && !errorCode ? <OutcomeScorecardResult scorecard={scorecard} onDownload={downloadReturnedScorecard} /> : null}
  </div>;
}
