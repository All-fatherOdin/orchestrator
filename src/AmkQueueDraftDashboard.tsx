import { useEffect, useMemo, useRef, useState } from "react";

export const AMK_QUEUE_DRAFT_ENDPOINT = "/api/amk-queue-drafts/v1";
export const AMK_QUEUE_DRAFT_PREVIEW_ENDPOINT = "/api/amk-queue-drafts/v1/preview";
export const AMK_QUEUE_DRAFT_MAX_FILE_BYTES = 256 * 1024;

type JsonRecord = Record<string, unknown>;
type Model = "luna" | "terra" | "sol";
type Effort = "light" | "medium" | "high";

export type AmkQueueDraftTarget = {
  targetId: string;
  targetHash: string;
  targetWatermark: string;
  name: string;
  defaultModel: Model;
  defaultEffort: Effort;
  allowedModels: Model[];
};

type AmkQueueDraftDiscovery = {
  contractType: "AmkQueueDraftDiscoveryV1";
  contractVersion: "1.0";
  operations: ["discover", "preview"];
  sourceContracts: ["TaskContractV3", "WorkItemGraphV1", "VerificationReceiptV2", "ReviewReceiptV1"];
  limits: {
    requestBytes: number;
    responseBytes: number;
    artifactEntries: number;
    tasks: number;
    allowedPaths: number;
    verificationCommands: number;
    targets: number;
  };
  targets: AmkQueueDraftTarget[];
  requestScoped: true;
  previewOnly: true;
  filesModified: false;
};

export type AmkQueueDraftTaskContract = JsonRecord & {
  task_id: string;
  title?: string;
  scope: JsonRecord & { project_files: string[] };
};

export type AmkQueueDraftArtifact = {
  TaskContractV3: AmkQueueDraftTaskContract[];
  WorkItemGraphV1?: JsonRecord[];
  VerificationReceiptV2?: JsonRecord[];
  ReviewReceiptV1?: JsonRecord[];
};

export type AmkQueueDraftMapping = {
  taskId: string;
  operatorTitle: string;
  allowedPaths: string[];
  verificationCommandsText: string;
};

export type AmkQueueDraftSourceFence = {
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
};

export type AmkQueueDraftRequest = {
  contractType: "AmkQueueDraftRequestV1";
  contractVersion: "1.0";
  targetId: string;
  targetHash: string;
  targetWatermark: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  artifact: AmkQueueDraftArtifact;
  mappings: Array<{
    taskId: string;
    independentlyUseful: true;
    operatorTitle?: string;
    allowedPaths: string[];
    verificationCommands: string[];
  }>;
};

export type AmkQueueDraftResponse = {
  contractType: "AmkQueueDraftResponseV1";
  contractVersion: "1.0";
  targetId: string;
  targetHash: string;
  targetWatermark: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  taskCount: number;
  compatibility: {
    workItemGraphCount: number;
    verificationReceiptCount: number;
    reviewReceiptCount: number;
    schedulerAuthority: false;
    verificationAuthority: false;
    reviewAuthority: false;
    executionAuthority: false;
  };
  queueDraft: {
    tasks: Array<{
      key: string;
      title: string;
      allowedPaths: string[];
      verificationCommands: string[];
    }>;
  };
  yaml: string;
  yamlByteLength: number;
  wouldMutate: false;
  authorizationGranted: false;
};

type SafeError = { code: string; message: string };
type ApiError = { code?: unknown; message?: unknown };
type MappingIssue = { taskId: string; code: "TITLE" | "PATHS" | "COMMANDS"; message: string };

const ARTIFACT_FIELDS = new Set([
  "TaskContractV3",
  "WorkItemGraphV1",
  "VerificationReceiptV2",
  "ReviewReceiptV1",
]);
const OPTIONAL_ARTIFACT_FIELDS = ["WorkItemGraphV1", "VerificationReceiptV2", "ReviewReceiptV1"] as const;
const TASK_ID = /^TASK-[A-Za-z0-9._-]+$/;

const errorLabels: Record<string, string> = {
  FILE_TYPE_UNSUPPORTED: "Нужен один локальный файл с расширением .json и типом JSON.",
  FILE_EMPTY: "Выбранный JSON-файл пуст.",
  REQUEST_TOO_LARGE: "Файл или полный запрос превышает предел 256 КиБ.",
  SOURCE_INVALID: "Локальный JSON не соответствует закрытому формату AMK Project Artifact V2.",
  SOURCE_UNSUPPORTED: "В файле нет поддерживаемого набора TaskContractV3 или есть неизвестные типы артефактов.",
  SOURCE_STALE: "Локальный источник изменился после подготовки запроса. Выберите файл заново.",
  TARGET_STALE: "Выбранная цель или её отметка изменилась. Обновите список целей.",
  TARGET_CONFLICT: "Сервер обнаружил конфликт настроенных целей.",
  TARGET_INVALID: "Настроенная цель больше не может быть подтверждена сервером.",
  TASK_CONTRACT_INVALID: "Один из TaskContractV3 не прошёл проверку закреплённого контракта.",
  COMPATIBILITY_INVALID: "Дополнительные графы или квитанции несовместимы с выбранными задачами.",
  TASK_COUNT_INVALID: "Для обычной очереди нужны от 2 до 100 независимо полезных задач.",
  MAPPING_INVALID: "Для каждой задачи нужны точные явные поля сопоставления.",
  PATH_INVALID: "Один из путей AMK не является безопасным нормализованным относительным путём.",
  PATH_OUTSIDE_SCOPE: "Выбранный allowedPath выходит за точный scope.project_files задачи.",
  TASK_KEY_COLLISION: "Идентификаторы задач дают одинаковые ключи очереди.",
  LIMIT_EXCEEDED: "Количество задач, путей, команд или размер поля превышает закрытый предел.",
  QUEUE_VALIDATION_FAILED: "Полный черновик отклонён обычным валидатором очередей.",
  RESPONSE_TOO_LARGE: "Ограниченный ответ предпросмотра превышает 512 КиБ.",
  SERVICE_UNAVAILABLE: "Сервис черновика очереди сейчас недоступен.",
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedJsonValue(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(normalizedJsonValue);
  if (isRecord(value)) {
    const result: JsonRecord = {};
    for (const key of Object.keys(value).sort()) result[key] = normalizedJsonValue(value[key]);
    return result;
  }
  throw new TypeError("Value is not closed JSON.");
}

export function canonicalAmkQueueDraftJson(value: unknown): string {
  return JSON.stringify(normalizedJsonValue(value));
}

function safeError(code: string, fallback?: string): SafeError {
  return { code, message: errorLabels[code] ?? fallback ?? errorLabels.SERVICE_UNAVAILABLE };
}

function throwLocal(code: string): never {
  throw Object.assign(new Error(errorLabels[code] ?? errorLabels.SOURCE_INVALID), { code });
}

function containsOversizedString(value: unknown): boolean {
  if (typeof value === "string") return value.length > 8_192;
  if (Array.isArray(value)) return value.some(containsOversizedString);
  return isRecord(value) && Object.values(value).some(containsOversizedString);
}

export function validateAmkQueueDraftFile(file: Pick<File, "name" | "size" | "type">): SafeError | null {
  const mediaType = file.type.toLowerCase().split(";", 1)[0];
  if (!file.name.toLowerCase().endsWith(".json") || (mediaType !== "" && mediaType !== "application/json"))
    return safeError("FILE_TYPE_UNSUPPORTED");
  if (file.size === 0) return safeError("FILE_EMPTY");
  if (file.size > AMK_QUEUE_DRAFT_MAX_FILE_BYTES) return safeError("REQUEST_TOO_LARGE");
  return null;
}

export function parseAmkQueueDraftArtifact(raw: string): AmkQueueDraftArtifact {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return throwLocal("SOURCE_INVALID");
  }
  if (!isRecord(value)) return throwLocal("SOURCE_INVALID");
  if (!("TaskContractV3" in value) || Object.keys(value).some((key) => !ARTIFACT_FIELDS.has(key)))
    return throwLocal("SOURCE_UNSUPPORTED");
  if (!Array.isArray(value.TaskContractV3) || value.TaskContractV3.length < 2 || value.TaskContractV3.length > 100)
    return throwLocal("TASK_COUNT_INVALID");
  for (const field of OPTIONAL_ARTIFACT_FIELDS)
    if (field in value && (!Array.isArray(value[field]) || value[field].length > 100))
      return throwLocal("SOURCE_INVALID");
  const entryCount = value.TaskContractV3.length + OPTIONAL_ARTIFACT_FIELDS.reduce(
    (count, field) => count + (Array.isArray(value[field]) ? value[field].length : 0),
    0,
  );
  if (entryCount > 100 || containsOversizedString(value)) return throwLocal("LIMIT_EXCEEDED");
  const taskIds = new Set<string>();
  for (const candidate of value.TaskContractV3) {
    if (!isRecord(candidate) || typeof candidate.task_id !== "string" || !TASK_ID.test(candidate.task_id) ||
        !isRecord(candidate.scope) || !Array.isArray(candidate.scope.project_files) ||
        candidate.scope.project_files.length === 0 || candidate.scope.project_files.length > 100 ||
        candidate.scope.project_files.some((path) => typeof path !== "string" || path.length === 0) ||
        (candidate.title !== undefined && typeof candidate.title !== "string"))
      return throwLocal("SOURCE_INVALID");
    if (taskIds.has(candidate.task_id)) return throwLocal("TASK_CONTRACT_INVALID");
    taskIds.add(candidate.task_id);
  }
  return value as AmkQueueDraftArtifact;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createAmkQueueDraftSourceFence(
  artifact: AmkQueueDraftArtifact,
): Promise<AmkQueueDraftSourceFence> {
  const canonical = canonicalAmkQueueDraftJson(artifact);
  const sourceByteLength = new TextEncoder().encode(canonical).byteLength;
  if (sourceByteLength > AMK_QUEUE_DRAFT_MAX_FILE_BYTES) return throwLocal("REQUEST_TOO_LARGE");
  const sourceHash = await sha256Hex(canonical);
  return {
    sourceHash,
    sourceByteLength,
    sourceWatermark: `AMK-UPLOAD-${sourceHash}-${sourceByteLength}`,
  };
}

export function createAmkQueueDraftMappings(artifact: AmkQueueDraftArtifact): AmkQueueDraftMapping[] {
  return artifact.TaskContractV3.map((task) => ({
    taskId: task.task_id,
    operatorTitle: "",
    allowedPaths: [],
    verificationCommandsText: "",
  }));
}

function verificationCommands(mapping: AmkQueueDraftMapping): string[] {
  return mapping.verificationCommandsText.split(/\r?\n/).map((command) => command.trim()).filter(Boolean);
}

export function validateAmkQueueDraftMappings(
  artifact: AmkQueueDraftArtifact,
  mappings: readonly AmkQueueDraftMapping[],
): MappingIssue[] {
  const issues: MappingIssue[] = [];
  if (mappings.length !== artifact.TaskContractV3.length) {
    return [{ taskId: "*", code: "COMMANDS", message: "Сопоставление задач неполно." }];
  }
  let pathCount = 0;
  let commandCount = 0;
  for (const task of artifact.TaskContractV3) {
    const mapping = mappings.find((candidate) => candidate.taskId === task.task_id);
    if (!mapping) {
      issues.push({ taskId: task.task_id, code: "COMMANDS", message: "Нет точного сопоставления задачи." });
      continue;
    }
    if (!task.title?.length && !mapping.operatorTitle.trim())
      issues.push({ taskId: task.task_id, code: "TITLE", message: "Введите отсутствующий заголовок." });
    if (!mapping.allowedPaths.length)
      issues.push({ taskId: task.task_id, code: "PATHS", message: "Выберите хотя бы один allowedPath из scope.project_files." });
    const commands = verificationCommands(mapping);
    if (!commands.length)
      issues.push({ taskId: task.task_id, code: "COMMANDS", message: "Введите хотя бы одну команду проверки." });
    if (new Set(commands).size !== commands.length)
      issues.push({ taskId: task.task_id, code: "COMMANDS", message: "Команды проверки не должны повторяться." });
    pathCount += mapping.allowedPaths.length;
    commandCount += commands.length;
  }
  if (pathCount > 100)
    issues.push({ taskId: "*", code: "PATHS", message: "Во всём черновике допускается не более 100 allowedPaths." });
  if (commandCount > 100)
    issues.push({ taskId: "*", code: "COMMANDS", message: "Во всём черновике допускается не более 100 команд проверки." });
  return issues;
}

export function buildAmkQueueDraftPreviewRequest(
  artifact: AmkQueueDraftArtifact,
  mappings: readonly AmkQueueDraftMapping[],
  target: AmkQueueDraftTarget,
  source: AmkQueueDraftSourceFence,
): AmkQueueDraftRequest {
  return {
    contractType: "AmkQueueDraftRequestV1",
    contractVersion: "1.0",
    targetId: target.targetId,
    targetHash: target.targetHash,
    targetWatermark: target.targetWatermark,
    ...source,
    artifact,
    mappings: artifact.TaskContractV3.map((task) => {
      const mapping = mappings.find((candidate) => candidate.taskId === task.task_id);
      if (!mapping) return throwLocal("MAPPING_INVALID");
      return {
        taskId: task.task_id,
        independentlyUseful: true as const,
        ...(!task.title?.length ? { operatorTitle: mapping.operatorTitle } : {}),
        allowedPaths: [...mapping.allowedPaths],
        verificationCommands: verificationCommands(mapping),
      };
    }),
  };
}

export function amkQueueDraftTargetKey(target: AmkQueueDraftTarget): string {
  return `${target.targetId}:${target.targetHash}:${target.targetWatermark}`;
}

export function amkQueueDraftInputKey(request: AmkQueueDraftRequest): string {
  return canonicalAmkQueueDraftJson({
    targetId: request.targetId,
    targetHash: request.targetHash,
    targetWatermark: request.targetWatermark,
    sourceHash: request.sourceHash,
    sourceByteLength: request.sourceByteLength,
    sourceWatermark: request.sourceWatermark,
    mappings: request.mappings,
  });
}

export function amkQueueDraftResponseMatches(
  response: unknown,
  request: AmkQueueDraftRequest,
): response is AmkQueueDraftResponse {
  if (!isRecord(response) || !isRecord(response.compatibility) || !isRecord(response.queueDraft) ||
      !Array.isArray(response.queueDraft.tasks) || response.queueDraft.tasks.length !== request.mappings.length)
    return false;
  const tasksValid = response.queueDraft.tasks.every((task) => isRecord(task) &&
    typeof task.key === "string" && typeof task.title === "string" &&
    Array.isArray(task.allowedPaths) && Array.isArray(task.verificationCommands));
  return tasksValid && response.contractType === "AmkQueueDraftResponseV1" && response.contractVersion === "1.0" &&
    response.targetId === request.targetId && response.targetHash === request.targetHash &&
    response.targetWatermark === request.targetWatermark && response.sourceHash === request.sourceHash &&
    response.sourceByteLength === request.sourceByteLength && response.sourceWatermark === request.sourceWatermark &&
    response.taskCount === request.mappings.length && typeof response.yaml === "string" && response.yaml.length > 0 &&
    typeof response.yamlByteLength === "number" && response.yamlByteLength <= 512 * 1024 &&
    new TextEncoder().encode(response.yaml).byteLength === response.yamlByteLength &&
    response.compatibility.schedulerAuthority === false && response.compatibility.verificationAuthority === false &&
    response.compatibility.reviewAuthority === false && response.compatibility.executionAuthority === false &&
    response.wouldMutate === false && response.authorizationGranted === false;
}

type DownloadEnvironment = {
  document: Pick<Document, "body" | "createElement">;
  URL: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  Blob: typeof Blob;
};

export function downloadAmkQueueDraftYaml(
  response: AmkQueueDraftResponse,
  environment: DownloadEnvironment = { document, URL, Blob },
): void {
  const objectUrl = environment.URL.createObjectURL(
    new environment.Blob([response.yaml], { type: "application/yaml;charset=utf-8" }),
  );
  const link = environment.document.createElement("a");
  try {
    link.href = objectUrl;
    link.download = `amk-queue-draft-${response.sourceHash.slice(0, 12)}.yaml`;
    environment.document.body.append(link);
    link.click();
  } finally {
    link.remove();
    environment.URL.revokeObjectURL(objectUrl);
  }
}

function short(value: string, length = 18): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

function remoteError(reason: unknown): SafeError {
  const failure = isRecord(reason) ? reason as ApiError : {};
  const code = typeof failure.code === "string" ? failure.code : "SERVICE_UNAVAILABLE";
  return safeError(code);
}

function errorTone(code: string): string {
  if (code.includes("STALE")) return "stale";
  if (code.includes("CONFLICT") || code === "TASK_KEY_COLLISION") return "conflict";
  if (code.includes("UNSUPPORTED") || code === "COMPATIBILITY_INVALID") return "unsupported";
  if (code.includes("LARGE") || code === "LIMIT_EXCEEDED" || code === "RESPONSE_TOO_LARGE") return "bounded";
  return "invalid";
}

function DownloadIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg>;
}

export function AmkQueueDraftDashboard() {
  const [discovery, setDiscovery] = useState<AmkQueueDraftDiscovery | null>(null);
  const [targetKey, setTargetKey] = useState("");
  const [artifact, setArtifact] = useState<AmkQueueDraftArtifact | null>(null);
  const [sourceFence, setSourceFence] = useState<AmkQueueDraftSourceFence | null>(null);
  const [mappings, setMappings] = useState<AmkQueueDraftMapping[]>([]);
  const [localError, setLocalError] = useState<SafeError | null>(null);
  const [apiError, setApiError] = useState<SafeError | null>(null);
  const [loadingDiscovery, setLoadingDiscovery] = useState(true);
  const [readingFile, setReadingFile] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ inputKey: string; response: AmkQueueDraftResponse } | null>(null);
  const discoveryRequest = useRef(0);
  const fileRequest = useRef(0);
  const previewRequest = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const target = useMemo(
    () => discovery?.targets.find((candidate) => amkQueueDraftTargetKey(candidate) === targetKey) ?? null,
    [discovery, targetKey],
  );
  const mappingIssues = useMemo(
    () => artifact ? validateAmkQueueDraftMappings(artifact, mappings) : [],
    [artifact, mappings],
  );
  const request = useMemo(
    () => artifact && sourceFence && target && !mappingIssues.length
      ? buildAmkQueueDraftPreviewRequest(artifact, mappings, target, sourceFence)
      : null,
    [artifact, sourceFence, target, mappings, mappingIssues.length],
  );
  const inputKey = useMemo(() => request ? amkQueueDraftInputKey(request) : "", [request]);
  const currentPreview = preview && request && preview.inputKey === inputKey &&
    amkQueueDraftResponseMatches(preview.response, request) ? preview.response : null;

  function invalidatePreview(): void {
    ++previewRequest.current;
    setPreviewing(false);
    setPreview(null);
    setApiError(null);
  }

  async function loadDiscovery(): Promise<void> {
    const requestId = ++discoveryRequest.current;
    invalidatePreview();
    setLoadingDiscovery(true);
    try {
      const response = await fetch(AMK_QUEUE_DRAFT_ENDPOINT, { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as AmkQueueDraftDiscovery | ApiError;
      if (!response.ok) throw body;
      const next = body as AmkQueueDraftDiscovery;
      if (next.contractType !== "AmkQueueDraftDiscoveryV1" || next.previewOnly !== true ||
          next.filesModified !== false || !Array.isArray(next.targets))
        throw { code: "SERVICE_UNAVAILABLE" };
      if (requestId !== discoveryRequest.current) return;
      setDiscovery(next);
      setTargetKey((current) => next.targets.some((candidate) => amkQueueDraftTargetKey(candidate) === current)
        ? current
        : "");
    } catch (reason) {
      if (requestId !== discoveryRequest.current) return;
      setDiscovery(null);
      setTargetKey("");
      setApiError(remoteError(reason));
    } finally {
      if (requestId === discoveryRequest.current) setLoadingDiscovery(false);
    }
  }

  useEffect(() => {
    void loadDiscovery();
    return () => {
      ++discoveryRequest.current;
      ++fileRequest.current;
      ++previewRequest.current;
    };
  }, []);

  async function chooseFile(file: File | undefined): Promise<void> {
    const requestId = ++fileRequest.current;
    invalidatePreview();
    setReadingFile(false);
    setArtifact(null);
    setSourceFence(null);
    setMappings([]);
    setLocalError(null);
    if (!file) return;
    const fileError = validateAmkQueueDraftFile(file);
    if (fileError) {
      setLocalError(fileError);
      return;
    }
    setReadingFile(true);
    try {
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength > AMK_QUEUE_DRAFT_MAX_FILE_BYTES) return throwLocal("REQUEST_TOO_LARGE");
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const nextArtifact = parseAmkQueueDraftArtifact(raw);
      const nextFence = await createAmkQueueDraftSourceFence(nextArtifact);
      if (requestId !== fileRequest.current) return;
      setArtifact(nextArtifact);
      setSourceFence(nextFence);
      setMappings(createAmkQueueDraftMappings(nextArtifact));
    } catch (reason) {
      if (requestId !== fileRequest.current) return;
      const failure = reason as { code?: unknown };
      const code = typeof failure.code === "string" ? failure.code : "SOURCE_INVALID";
      setLocalError(safeError(code));
    } finally {
      if (requestId === fileRequest.current) setReadingFile(false);
    }
  }

  function updateMapping(taskId: string, update: (current: AmkQueueDraftMapping) => AmkQueueDraftMapping): void {
    invalidatePreview();
    setMappings((current) => current.map((mapping) => mapping.taskId === taskId ? update(mapping) : mapping));
  }

  async function requestPreview(): Promise<void> {
    if (!request) return;
    const requestId = ++previewRequest.current;
    const requestedInputKey = inputKey;
    setPreviewing(true);
    setPreview(null);
    setApiError(null);
    try {
      const response = await fetch(AMK_QUEUE_DRAFT_PREVIEW_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      const body = await response.json().catch(() => ({})) as AmkQueueDraftResponse | ApiError;
      if (!response.ok) throw body;
      if (requestId !== previewRequest.current) return;
      if (!amkQueueDraftResponseMatches(body as AmkQueueDraftResponse, request))
        throw { code: "SOURCE_STALE" };
      setPreview({ inputKey: requestedInputKey, response: body as AmkQueueDraftResponse });
    } catch (reason) {
      if (requestId !== previewRequest.current) return;
      setApiError(remoteError(reason));
    } finally {
      if (requestId === previewRequest.current) setPreviewing(false);
    }
  }

  const error = localError ?? apiError;
  const compatibilityCount = currentPreview ? currentPreview.compatibility.workItemGraphCount +
    currentPreview.compatibility.verificationReceiptCount + currentPreview.compatibility.reviewReceiptCount : 0;

  return <div className="amkQueueWorkspace">
    <section className="amkQueueBuilder" aria-label="Черновик очереди AMK">
      <header>
        <div><small>AGENT MEMORY KIT · PHASE 2</small><h2>Черновик очереди</h2><p>Локальная проверка и ограниченный предпросмотр YAML без сохранения, импорта или запуска.</p></div>
        <button className="amkQueueReload" onClick={() => void loadDiscovery()} disabled={loadingDiscovery || previewing}>Обновить цели</button>
      </header>

      <div className="amkQueueInputs">
        <label className="amkQueueFile">Один локальный JSON
          <input ref={fileInput} type="file" accept="application/json,.json" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            void chooseFile(file);
          }} />
          <span>Только UTF-8 JSON, до 256 КиБ; файл хранится лишь в этой вкладке.</span>
        </label>
        <label>Настроенная цель
          <select aria-label="Настроенная цель для черновика очереди" value={targetKey} onChange={(event) => {
            invalidatePreview();
            setTargetKey(event.target.value);
          }} disabled={loadingDiscovery || !discovery?.targets.length}>
            <option value="">Выберите цель, найденную сервером</option>
            {discovery?.targets.map((candidate) => <option key={amkQueueDraftTargetKey(candidate)} value={amkQueueDraftTargetKey(candidate)}>{candidate.name} · {candidate.defaultModel}/{candidate.defaultEffort}</option>)}
          </select>
          <span>Путь к проекту не вводится и не передаётся браузеру.</span>
        </label>
      </div>

      {loadingDiscovery ? <div className="amkQueueLoading" role="status"><i /><span>Чтение настроенных целей…</span></div> : discovery && !discovery.targets.length ? <div className="amkQueueNotice unsupported" role="status"><small>SOURCE_UNSUPPORTED</small><b>Нет настроенных целей</b><p>Предпросмотр доступен только для цели, обнаруженной сервером.</p></div> : null}

      {readingFile ? <div className="amkQueueLoading" role="status"><i /><span>Локальная проверка JSON и отметки источника…</span></div> : artifact && sourceFence ? <div className="amkQueueValidation" role="status">
        <div><small>ЛОКАЛЬНАЯ ПРОВЕРКА</small><b>Файл принят в памяти вкладки</b><p>{artifact.TaskContractV3.length} задач · {sourceFence.sourceByteLength.toLocaleString("ru-RU")} байт после канонизации</p></div>
        <dl><div><dt>sourceHash</dt><dd>{short(sourceFence.sourceHash)}</dd></div><div><dt>sourceWatermark</dt><dd>{short(sourceFence.sourceWatermark, 28)}</dd></div></dl>
      </div> : !localError ? <div className="amkQueueEmpty"><span aria-hidden="true">◇</span><b>Выберите локальный AMK JSON</b><p>Поддерживается закрытый пакет с 2–100 TaskContractV3.</p></div> : null}

      {artifact ? <div className="amkQueueMappings">
        <header><div><small>ЯВНОЕ СОПОСТАВЛЕНИЕ</small><h3>Поля задач</h3></div><span className={mappingIssues.length ? "incomplete" : "complete"}>{mappingIssues.length ? `${mappingIssues.length} незаполненных полей` : "Сопоставление готово"}</span></header>
        {artifact.TaskContractV3.map((task) => {
          const mapping = mappings.find((candidate) => candidate.taskId === task.task_id);
          if (!mapping) return null;
          const taskIssues = mappingIssues.filter((issue) => issue.taskId === task.task_id);
          return <article key={task.task_id} className="amkQueueTask">
            <header><div><small>{task.task_id}</small><h4>{task.title?.length ? task.title : "Требуется заголовок"}</h4></div><span>{task.scope.project_files.length} путей в scope</span></header>
            {!task.title?.length ? <label className="amkQueueTitle">Отсутствующий title
              <input value={mapping.operatorTitle} maxLength={512} placeholder="Введите точный заголовок задачи" onChange={(event) => updateMapping(task.task_id, (current) => ({ ...current, operatorTitle: event.target.value }))} />
            </label> : null}
            <fieldset className="amkQueuePaths"><legend>allowedPaths — выберите только из scope.project_files</legend>
              {task.scope.project_files.map((path) => <label key={path}><input type="checkbox" checked={mapping.allowedPaths.includes(path)} onChange={(event) => updateMapping(task.task_id, (current) => ({
                ...current,
                allowedPaths: event.target.checked ? [...current.allowedPaths, path] : current.allowedPaths.filter((candidate) => candidate !== path),
              }))} /><code>{path}</code></label>)}
            </fieldset>
            <label className="amkQueueCommands">verificationCommands — одна команда на строку
              <textarea value={mapping.verificationCommandsText} placeholder="npm.cmd test -- task-name" onChange={(event) => updateMapping(task.task_id, (current) => ({ ...current, verificationCommandsText: event.target.value }))} />
            </label>
            {taskIssues.length ? <ul className="amkQueueGuidance">{taskIssues.map((issue) => <li key={`${issue.code}-${issue.message}`}>{issue.message}</li>)}</ul> : <p className="amkQueueMapped">Явные поля этой задачи заполнены.</p>}
          </article>;
        })}
        {mappingIssues.filter((issue) => issue.taskId === "*").map((issue) => <p className="amkQueueGlobalIssue" key={issue.message}>{issue.message}</p>)}
      </div> : null}

      <footer><span>{discovery ? `Пределы: ${discovery.limits.tasks} задач · ${discovery.limits.allowedPaths} путей · ${discovery.limits.verificationCommands} команд` : "Пределы читаются с сервера"}</span><button onClick={() => void requestPreview()} disabled={!request || previewing || readingFile || loadingDiscovery}>{previewing ? "Проверка…" : "Проверить и построить"}</button></footer>
    </section>

    {error ? <section className={`amkQueueState ${errorTone(error.code)}`} role="alert"><small>{error.code}</small><h3>{errorLabels[error.code] ?? "Предпросмотр недоступен"}</h3><p>{error.message}</p></section> : null}

    {currentPreview ? <section className="amkQueuePreview" aria-label="Текущий предпросмотр черновика очереди">
      <header><div><small>ТЕКУЩИЙ ОГРАНИЧЕННЫЙ ОТВЕТ</small><h2>YAML прошёл проверку очереди</h2><p>Ответ связан с текущими файлом, целью, отметками и полями сопоставления.</p></div><span>Без изменений</span></header>
      <div className="amkQueueSummary"><div><span>Задачи</span><strong>{currentPreview.taskCount}</strong></div><div><span>YAML</span><strong>{currentPreview.yamlByteLength.toLocaleString("ru-RU")} Б</strong></div><div><span>Совместимость</span><strong>{compatibilityCount}</strong></div><div><span>Полномочия</span><strong>Нет</strong></div></div>
      <div className="amkQueuePreviewTasks">{currentPreview.queueDraft.tasks.map((task) => <article key={task.key}><header><code>{task.key}</code><b>{task.title}</b></header><dl><div><dt>allowedPaths</dt><dd>{task.allowedPaths.length}</dd></div><div><dt>verificationCommands</dt><dd>{task.verificationCommands.length}</dd></div></dl></article>)}</div>
      <div className="amkQueueAuthority" role="status"><b>Графы и квитанции не передают полномочия</b><p>Планировщик, проверка, ревью и выполнение остаются выключены. Предпросмотр ничего не записал.</p></div>
      <footer><span>Изменение любого входа немедленно удалит этот ответ.</span><button className="amkQueueDownload" onClick={() => downloadAmkQueueDraftYaml(currentPreview)}><DownloadIcon /> Скачать YAML</button></footer>
    </section> : !error && !previewing ? <div className="operatorEmpty amkQueueWaiting"><span aria-hidden="true">◇</span><h3>Текущего предпросмотра нет</h3><p>Заполните все явные поля и запросите проверку. YAML нельзя скачать заранее.</p><button className="amkQueueDownload" disabled><DownloadIcon /> Скачать YAML</button></div> : null}
  </div>;
}
