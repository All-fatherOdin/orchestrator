export type DiagnosticTask = {
  id: string; key?: string; title: string; status: string; dependsOn?: string[]; log: string[];
  timedOut?: boolean; reviewStatus?: string;
  authorizationEvidence?: { enabled: boolean; decision: string; reason: string };
  verificationEvidence?: { command: string; exitCode: number; timedOut: boolean; output: string }[];
};
type Guidance = { reason: string; next: string; evidence: string[]; dependencies?: DiagnosticTask[] };

/** Read-only explanation; never grants retry, approval or execution authority. */
export function taskFailureGuidance(task: DiagnosticTask, tasks: DiagnosticTask[]): Guidance | undefined {
  if (!["blocked", "failed", "timed_out"].includes(task.status)) return undefined;
  const dependencies = (task.dependsOn ?? []).flatMap(key => tasks.filter(item => item.key === key && item.status !== "completed"));
  if (task.status === "blocked" && dependencies.length)
    return { reason: "Не завершены необходимые задачи", next: "Откройте задачу-предшественник и устраните её причину остановки. Затем возобновите очередь, когда текущий запуск завершится.",
      evidence: dependencies.map(item => `${item.key}: ${item.title} (${item.status})`), dependencies };
  const authorization = task.authorizationEvidence;
  if (authorization?.enabled && authorization.decision === "denied")
    return { reason: "Недостаточно разрешений для выполнения", next: "Проверьте разрешения и точный объём работ в YAML. После согласования загрузите исправленную очередь как новую: повтор использует старые разрешения.", evidence: [authorization.reason] };
  const gates = task.verificationEvidence?.filter(item => item.exitCode !== 0 || item.timedOut) ?? [];
  if (gates.length)
    return { reason: "Обязательные проверки не прошли", next: "Откройте доказательства ниже и журнал. Исправьте причину проваленной проверки в разрешённом объёме и повторите задачу после завершения запуска.",
      evidence: gates.map(item => `${item.command}\nКод завершения: ${item.exitCode}${item.timedOut ? "; время проверки истекло" : ""}\n${item.output}`) };
  if (task.status === "timed_out" || task.timedOut || task.reviewStatus === "timed_out")
    return { reason: "Истекло время выполнения или проверки", next: "Проверьте последнее действие в журнале. Если нужен больший таймаут, измените YAML и загрузите новую очередь; обычный повтор сохраняет прежний лимит.", evidence: [`Статус: ${task.status}; проверка: ${task.reviewStatus ?? "нет данных"}`] };
  if (["changes_requested", "unavailable"].includes(task.reviewStatus ?? ""))
    return { reason: task.reviewStatus === "changes_requested" ? "Проверяющий запросил исправления" : "Не удалось получить результат ревью",
      next: "Прочитайте отчёт проверяющего и журнал. Устраните замечания или причину недоступности ревью перед повтором.", evidence: [`Ревью: ${task.reviewStatus}`] };
  // Legacy records have runner diagnostics only in the log. Match closed prefixes,
  // show the exact observation, and never infer missing permission or success.
  const rules: [string, string, string][] = [
    ["Stored authorization is stale or mismatched;", "Разрешение устарело", "Сверьте ветку, задачу и область изменений с согласованными разрешениями. Загрузите новую очередь с актуальным контрактом."],
    ["Verification authorization denied:", "Проверки не имеют разрешения на запуск", "Добавьте согласованный контракт авторизации для обязательных проверок и загрузите новую очередь."],
    ["Checkpoint precondition failed:", "Нет необходимой контрольной точки", "Проверьте результат задачи-предшественника и её контрольный коммит. Не обходите это условие повтором."],
    ["Route compatibility denied:", "Выбранная модель или режим недоступны", "Проверьте доступные модели и режим усилия. Исправьте настройки в YAML и загрузите новую очередь."],
    ["Managed merge stopped safely:", "Слияние остановлено", "Откройте Control Plane и проверьте состояние плана и разрешения. Требуется актуальное решение перед продолжением."],
    ["Task blocked because an executable precondition failed.", "Не выполнено предварительное условие", "Найдите результат предварительной команды в журнале и устраните причину перед повтором."],
  ];
  for (const [prefix, reason, next] of rules) {
    const evidence = task.log.filter(line => line.startsWith(prefix)).at(-1);
    if (evidence) return { reason, next, evidence: [evidence] };
  }
  return { reason: "Задача остановлена; точная причина требует проверки", next: "Откройте журнал и результат задачи. По имеющимся данным безопасный способ продолжения не определён.", evidence: [`Статус: ${task.status}`, ...task.log.slice(-3)] };
}

export function TaskFailurePanel({ task, tasks, onSelectTask, onShowLog }: {
  task: DiagnosticTask; tasks: DiagnosticTask[]; onSelectTask: (id: string) => void; onShowLog: () => void;
}) {
  const guidance = taskFailureGuidance(task, tasks);
  if (!guidance) return null;
  return <section className="failureGuidance" aria-label="Причина остановки">
    <h3>{guidance.reason}</h3>
    <p><strong>Следующий шаг. </strong>{guidance.next}</p>
    {guidance.dependencies?.map(item => <button key={item.id} onClick={() => onSelectTask(item.id)}>Открыть: {item.title}</button>)}
    <button onClick={onShowLog}>Показать весь журнал</button>
    <details><summary>Основание для объяснения</summary>{guidance.evidence.map((item, index) => <pre key={index}>{item}</pre>)}</details>
  </section>;
}

export type PreflightCheck = { name: string; ok: boolean; detail: string };
export function preflightNextStep(name: string): string {
  const normalized = name.replace(/^Pipeline queue \d+ /, "");
  if (normalized === "YAML queue") return "Исправьте указанные поля или структуру YAML и снова нажмите «Запустить».";
  if (/^Task \d+ (verification )?authorization$/.test(normalized)) return "Сверьте разрешения, согласованный объём файлов и команды проверки. Загрузите исправленный YAML после согласования.";
  if (normalized === "Git repository") return "Выберите существующий Git-репозиторий и проверьте путь проекта в очереди.";
  if (normalized === "Initial workspace state") return "Сверьте ветку, HEAD и незакоммиченные изменения с объявленным начальным состоянием. Не удаляйте изменения автоматически.";
  if (normalized === "Codex CLI") return "Проверьте установку и доступность Codex CLI для процесса Orchestrator, затем повторите проверку.";
  if (normalized === "Codex sandbox") return "Проверьте настройку изолированной среды Codex по сообщению ниже. Сохраните требуемые ограничения доступа.";
  if (normalized === "Managed Python" || /^Command runtime: /.test(normalized) || /^Task \d+ runtime: /.test(normalized)) return "Настройте указанный инструмент или переменную окружения для процесса Orchestrator и повторите проверку.";
  return "Исправьте условие, указанное в результате проверки, затем повторите запуск. Если причина неясна, сохраните сообщение для диагностики.";
}

export function PreflightFailurePanel({ checks }: { checks: PreflightCheck[] }) {
  if (!checks.length) return null;
  return <section className="failureGuidance preflightFailures" role="alert" aria-label="Что мешает запуску">
    <h2>Что мешает запуску</h2>
    <p>Очередь не запущена. Исправьте условия ниже и повторите запуск.</p>
    {checks.map((check, index) => <article key={`${check.name}-${index}`}>
      <h3>{check.name}</h3><p>{preflightNextStep(check.name)}</p>
      <details><summary>Результат проверки</summary><pre>{check.detail}</pre></details>
    </article>)}
  </section>;
}
