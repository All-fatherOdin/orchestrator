import { isMap, isSeq, parseDocument } from "yaml";

type RecordValue = Record<string, unknown>;
export type QueueIssue = { path: string; message: string; level: "error" | "hint"; task?: number };
export type QueueInspection = { value?: RecordValue; editable: boolean; issues: QueueIssue[]; pipeline: boolean };
const record = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");

export function inspectQueue(source: string): QueueInspection {
  const issues: QueueIssue[] = [];
  const issue = (path: string, message: string, task?: number, level: QueueIssue["level"] = "error") => issues.push({ path, message, task, level });
  try {
    if (source.length > 1_000_000) throw new Error("Документ слишком большой для визуального редактора.");
    const document = parseDocument(source);
    if (document.errors.length) {
      const error = document.errors[0];
      const position = error.linePos?.[0];
      issue("YAML", `${position ? `Строка ${position.line}, столбец ${position.col}: ` : ""}${error.message}`);
      return { editable: false, issues, pipeline: false };
    }
    const value: unknown = document.toJS({ maxAliasCount: 50 });
    if (!record(value)) throw new Error("В корне YAML нужен объект с project и tasks.");
    if (Array.isArray(value.queues)) return { value, editable: false, issues: [], pipeline: true };
    if (!record(value.project) || typeof value.project.path !== "string" || !value.project.path.trim())
      issue("project.path", "Укажите путь к целевому Git-репозиторию.");
    if (!Array.isArray(value.tasks)) {
      issue("tasks", "Добавьте список задач: tasks: с элементами через дефис.");
      return { value, editable: false, issues, pipeline: false };
    }
    if (value.tasks.length < 2) issue("tasks", "В очереди нужны минимум две независимо полезные задачи. Одну задачу выполните в текущей сессии.");
    if (value.tasks.length > 200) throw new Error("Более 200 задач: используйте YAML и серверную проверку.");
    let editable = true;
    if (record(value.project)) for (const field of ["name", "path"])
      if (value.project[field] !== undefined && typeof value.project[field] !== "string") {
        editable = false; issue(`project.${field}`, "Здесь нужна строка.");
      }
    for (const field of ["project", "limits", "git"])
      if (value[field] !== undefined && !record(value[field])) {
        editable = false; issue(field, "Здесь нужен объект полей, а не список или скаляр.");
      }
    if (record(value.limits)) for (const field of ["taskTimeoutMinutes", "reviewerTimeoutMinutes", "maxTaskRetries", "maxParallelTasks"])
      if (value.limits[field] !== undefined && typeof value.limits[field] !== "number") {
        editable = false; issue(`limits.${field}`, "Укажите число.");
      }
    if (record(value.git) && value.git.checkpointCommits !== undefined && typeof value.git.checkpointCommits !== "boolean") {
      editable = false; issue("git.checkpointCommits", "Укажите true или false.");
    }
    const keys = new Map<string, number[]>();
    value.tasks.forEach((task: unknown, index: number) => {
      const path = `tasks[${index}]`;
      if (!record(task)) { editable = false; issue(path, "Задача должна быть объектом полей.", index); return; }
      for (const field of ["title", "prompt"])
        if (typeof task[field] !== "string" || !task[field].trim()) issue(`${path}.${field}`, field === "title" ? "Добавьте название задачи." : "Опишите результат работы и способ его проверки.", index);
      for (const field of ["title", "prompt", "key", "model", "effort", "contextProfile"])
        if (task[field] !== undefined && typeof task[field] !== "string") {
          editable = false; issue(`${path}.${field}`, "Здесь нужна строка.", index);
        }
      for (const field of ["timeoutMinutes", "maxRetries", "maxSources"])
        if (task[field] !== undefined && typeof task[field] !== "number") {
          editable = false; issue(`${path}.${field}`, "Здесь нужно число.", index);
        }
      if (task.requireRepositoryContext !== undefined && typeof task.requireRepositoryContext !== "boolean") {
        editable = false; issue(`${path}.requireRepositoryContext`, "Укажите true или false.", index);
      }
      for (const field of ["dependsOn", "resources", "allowedPaths", "verificationCommands"])
        if (task[field] !== undefined && !strings(task[field])) {
          editable = false; issue(`${path}.${field}`, "Здесь нужен список строк, например [first-task, second-task].", index);
        } else if (strings(task[field]) && task[field].some(item => !item.trim()))
          issue(`${path}.${field}`, "Удалите пустые элементы списка.", index);
      if (typeof task.key === "string") {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(task.key)) issue(`${path}.key`, "Ключ: латинские буквы, цифры, дефис или подчёркивание; без пробелов.", index);
        keys.set(task.key, [...(keys.get(task.key) ?? []), index]);
      }
      if (task.allowedPaths === undefined) issue(`${path}.allowedPaths`, "Явно задайте область файлов. [] означает только чтение; отсутствие поля не равно пустому списку.", index, "hint");
      if (task.verificationCommands === undefined) issue(`${path}.verificationCommands`, "Укажите команды проверки или проверьте, заданы ли они на уровне проекта.", index, "hint");
    });
    for (const [key, indices] of keys) if (indices.length > 1)
      for (const index of indices) issue(`tasks[${index}].key`, `Ключ «${key}» повторяется в задачах ${indices.map(i => i + 1).join(", ")}.`, index);
    const graph = new Map<string, string[]>();
    value.tasks.forEach((task: unknown, index: number) => {
      if (!record(task) || !strings(task.dependsOn) || !task.dependsOn.length) return;
      const path = `tasks[${index}].dependsOn`;
      if (!task.key) issue(`tasks[${index}].key`, "Добавьте key задаче с зависимостями.", index);
      if (new Set(task.dependsOn).size !== task.dependsOn.length) issue(path, "Уберите повторяющиеся зависимости.", index);
      for (const key of task.dependsOn) {
        if (!keys.has(key)) issue(path, `Задача «${key}» не найдена. Укажите точный key, а не название или номер.`, index);
        if (key === task.key) issue(path, "Задача не может зависеть от самой себя.", index);
      }
      if (typeof task.key === "string" && keys.get(task.key)?.length === 1) graph.set(task.key, task.dependsOn);
    });
    const visited = new Set<string>();
    const active: string[] = [];
    const visit = (key: string) => {
      const cycleAt = active.indexOf(key);
      if (cycleAt >= 0) {
        const cycle = [...active.slice(cycleAt), key];
        const index = keys.get(key)?.[0];
        issue(`tasks[${index}].dependsOn`, `Цикл зависимостей: ${cycle.join(" → ")}. Разорвите одну из связей.`, index);
        return;
      }
      if (visited.has(key)) return;
      visited.add(key); active.push(key);
      for (const dependency of graph.get(key) ?? []) if (keys.get(dependency)?.length === 1) visit(dependency);
      active.pop();
    };
    for (const key of graph.keys()) visit(key);
    return { value, editable, issues, pipeline: false };
  } catch (error) {
    issue("YAML", error instanceof Error ? error.message : "Не удалось прочитать YAML.");
    return { editable: false, issues, pipeline: false };
  }
}

function editableDocument(source: string) {
  const document = parseDocument(source);
  if (document.errors.length || !isMap(document.contents)) throw new Error("Исправьте структуру YAML перед изменением через форму.");
  return document;
}

/** Modify only addressed nodes; comments, unknown contracts and sibling tasks survive. */
export function patchQueueFields(source: string, path: (string | number)[], patch: RecordValue): string {
  const document = editableDocument(source);
  const target = document.getIn(path, true);
  if (target !== undefined && !isMap(target)) throw new Error("Этот раздел использует ссылку YAML или неверный тип. Исправьте его непосредственно в YAML.");
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) document.deleteIn([...path, field]);
    else document.setIn([...path, field], value);
  }
  return document.toString();
}

export function editQueueTaskOrder(source: string, order: (number | RecordValue)[]): string {
  const document = editableDocument(source);
  const tasks = document.get("tasks", true);
  if (!isSeq(tasks)) throw new Error("Для изменения порядка нужен обычный список tasks в YAML.");
  const nodes = [...tasks.items];
  tasks.items = order.map(item => {
    if (typeof item !== "number") return document.createNode(item);
    if (!Number.isInteger(item) || item < 0 || item >= nodes.length) throw new Error("Задача больше не существует.");
    return nodes[item];
  });
  return document.toString();
}
