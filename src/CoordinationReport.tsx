import { coordinationPhases, sumMeasures, type CoordinationReport as Report, type Measure } from "../shared/coordination-economics";

const labels = { executor: "Исполнитель", reviewer: "Ревьюер", correction: "Исправления" };
const statuses: Record<string, string> = { completed: "завершена", failed: "ошибка", timed_out: "тайм-аут", cancelled: "отменена", running: "выполняется", pending: "ожидание", skipped: "пропущена", blocked: "заблокирована", approved: "одобрено", changes_requested: "нужны исправления", unavailable: "недоступно" };
const numbers = new Intl.NumberFormat("ru-RU");
function measure(value: Measure, time = false) {
  if (value.value === null) return "Нет данных";
  const text = time ? `${numbers.format(value.value / 1000)} с` : numbers.format(value.value);
  return value.state === "partial" ? `${text} · частично` : text;
}

export function CoordinationReport({ report, taskId }: { report: Report; taskId?: string }) {
  const tasks = taskId === undefined ? report.tasks : report.tasks.filter(task => task.id === taskId);
  return <section className="coordinationReport" aria-label={`Стоимость координации ${report.runId}`}>
    <h3>Стоимость координации</h3>
    <p>Запуск <code>{report.runId}</code> · длительность запуска: {measure(report.durationMs, true)}.</p>
    <p>Вызовы подтверждены завершёнными записями бюджета исполнения. Токены старых запусков — частичные наблюдения; число событий usage не равно числу вызовов. Кэш уже входит во входящие токены.</p>
    <div className="coordinationScroll"><table>
      <caption>{taskId === undefined ? "Все задачи запуска" : `Задача ${taskId}`} · данные по ролям</caption>
      <thead><tr><th scope="col">Роль</th><th scope="col">Подтверждённые вызовы</th><th scope="col">Входящие токены</th><th scope="col">Исходящие токены</th><th scope="col">Кэш-чтение</th><th scope="col">Кэш-запись</th><th scope="col">Время резервирования</th></tr></thead>
      <tbody>{coordinationPhases.map(phase => {
        const costs = tasks.map(task => task.phases[phase]);
        return <tr key={phase}><th scope="row">{labels[phase]}</th><td>{measure(sumMeasures(costs.map(cost => cost.calls)))}</td>
          <td>{measure(sumMeasures(costs.map(cost => cost.tokens.inputTokens)))}</td><td>{measure(sumMeasures(costs.map(cost => cost.tokens.outputTokens)))}</td>
          <td>{measure(sumMeasures(costs.map(cost => cost.tokens.cachedInputTokens)))}</td><td>{measure(sumMeasures(costs.map(cost => cost.tokens.cacheWriteTokens)))}</td>
          <td>{measure(sumMeasures(costs.map(cost => cost.reservedMs)), true)}</td></tr>;
      })}</tbody>
    </table></div>
    <small>Если таблица не помещается, прокрутите её вправо, чтобы увидеть все показатели.</small>
    <p>Время резервирования — от допуска вызова до записи результата, включая подготовку. Это не чистое время модели. Денежная стоимость и время ожидания зависимостей не определены.</p>
    <ul>{tasks.map(task => <li key={task.id}><b>{task.id}</b> · статус: {statuses[task.status] ?? task.status} · ревью: {task.reviewStatus ? statuses[task.reviewStatus] ?? task.reviewStatus : "нет данных"}
      <span>Время задачи: {measure(task.durationMs, true)} · попытки исполнителя: {measure(task.executorAttempts)} · попытки исправления: {measure(task.correctionAttempts)}</span>
      <span>{task.evidence === "budget" ? "Источник: проверенные записи бюджета. Значения относятся к записанному состоянию запуска." : task.evidence === "invalid" ? "Записи бюджета не прошли проверку. Метрики вызовов и токенов недоступны." : task.evidence === "carried" ? "Результат перенесён из другого запуска. Его расход здесь не учитывается." : "Старый формат: полнота телеметрии и число вызовов неизвестны. Дубликаты с одинаковой ролью, попыткой и временем исключены."}</span>
    </li>)}</ul>
  </section>;
}
