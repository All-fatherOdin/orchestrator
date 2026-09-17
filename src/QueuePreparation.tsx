import { useEffect, useState } from "react";
import type { QueueInspection } from "./queue-editor";

export function QueuePreparation({ inspection }: { inspection: QueueInspection }) {
  if (inspection.pipeline) return <p className="queuePreparation">Это план готовых очередей. Для проверки файлов плана используйте «Проверить без запуска».</p>;
  const errors = inspection.issues.filter(issue => issue.level === "error");
  return <section className="queuePreparation" aria-label="Подготовка очереди">
    <h3>{errors.length ? `Нужно исправить: ${errors.length}` : "Основные поля и зависимости проверены локально"}</h3>
    <p>Подсказки не заменяют серверную проверку путей, среды и разрешений. Она доступна отдельно от запуска.</p>
    {inspection.issues.length > 0 && <ul>{inspection.issues.map((issue, index) => <li key={`${issue.path}-${index}`}>
      <b>{issue.level === "hint" ? "Подсказка" : "Ошибка"} · {issue.task !== undefined ? `Задача ${issue.task + 1}` : issue.path}</b>
      <span>{issue.message}</span>
      <button type="button" onClick={() => {
        const target = document.getElementById(`queue-field-${issue.path}`) ?? document.getElementById("queue-yaml");
        target?.focus(); target?.scrollIntoView({ block: "center" });
      }}>Перейти к {issue.path}</button>
    </li>)}</ul>}
    {!inspection.editable && <p>Визуальная форма недоступна для этой структуры. Исходный текст сохранён — исправьте YAML выше.</p>}
  </section>;
}

/** Keep unfinished lines/separators while typing. Commit the list on blur. */
export function QueueListField({ label, id, values, separator = "\n", onCommit, hint }: {
  label: string; id: string; values?: string[]; separator?: string;
  onCommit: (values: string[]) => void; hint?: string;
}) {
  const serialized = (values ?? []).join(separator);
  const [text, setText] = useState(serialized);
  useEffect(() => setText(serialized), [serialized]);
  return <label className="queueLongField">{label}
    <textarea id={id} aria-label={label} rows={separator === "\n" ? 3 : 2} value={text}
      onChange={event => setText(event.target.value)}
      onBlur={() => {
        if (text !== serialized) onCommit(text.split(separator).map(value => value.trim()).filter(Boolean));
      }} />
    {hint && <small>{hint}</small>}
  </label>;
}
