import { FormEvent, useState } from "react";

type GoalBuddySelection = {
  statePath: string;
  projectPath: string;
};

type GoalBuddyPreview = {
  contract_type: "GoalBuddyTaskPreviewV1";
  source: { statePath: string; stateSha256: string };
  taskInput: {
    title: string;
    prompt: string;
    allowedPaths?: string[];
    verificationCommands?: string[];
    executionGuards?: string[];
    externalTaskId?: string;
    goalBuddy?: { goalSlug: string; goalTitle: string };
  };
};

type GoalBuddyPipelinePreview = {
  contract_type: "GoalBuddyPipelinePreviewV1";
  projectPath: string;
  goals: Array<{
    index: number;
    statePath: string;
    goalSlug?: string;
    stateSha256?: string;
    activeTaskId?: string;
    activeTaskTitle?: string;
  }>;
  policy: { stopOnFailure: true; autoCommit: false };
};

export function goalBuddyRunRequest(
  selection: GoalBuddySelection,
  expectedStateSha256: string,
) {
  return { ...selection, expectedStateSha256 };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await response.json() as T | { error?: string };
  if (!response.ok)
    throw new Error("error" in (value as object)
      ? (value as { error?: string }).error ?? `HTTP ${response.status}`
      : `HTTP ${response.status}`);
  return value as T;
}

export function GoalBuddyPage<TRun>({
  defaultProjectPath = "",
  runBlocked = false,
  onRunStarted,
  onError,
}: {
  defaultProjectPath?: string;
  runBlocked?: boolean;
  onRunStarted: (run: TRun) => void;
  onError: (message: string) => void;
}) {
  const [statePath, setStatePath] = useState("");
  const [projectPath, setProjectPath] = useState(defaultProjectPath);
  const [preview, setPreview] = useState<GoalBuddyPreview | null>(null);
  const [chainPaths, setChainPaths] = useState("");
  const [pipelinePreview, setPipelinePreview] = useState<GoalBuddyPipelinePreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPreviewingPipeline, setIsPreviewingPipeline] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const selection = { statePath: statePath.trim(), projectPath: projectPath.trim() };
  const canPreview = Boolean(selection.statePath && selection.projectPath) &&
    !isPreviewing && !isStarting;
  const pipelineStatePaths = chainPaths
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
  const pipelineRequest = {
    version: 1,
    projectPath: selection.projectPath,
    goals: pipelineStatePaths.map((statePath) => ({ statePath })),
    policy: { stopOnFailure: true, autoCommit: false },
  };
  const canPreviewPipeline = Boolean(selection.projectPath && pipelineStatePaths.length) &&
    !isPreviewingPipeline && !isStarting;

  function changeStatePath(value: string) {
    setStatePath(value);
    setPreview(null);
  }

  function changeProjectPath(value: string) {
    setProjectPath(value);
    setPreview(null);
    setPipelinePreview(null);
  }

  function changeChainPaths(value: string) {
    setChainPaths(value);
    setPipelinePreview(null);
  }

  async function createPreview(event: FormEvent) {
    event.preventDefault();
    if (!canPreview) return;
    setIsPreviewing(true);
    try {
      setPreview(await postJson<GoalBuddyPreview>("/api/goalbuddy/preview", selection));
    } catch (error) {
      setPreview(null);
      onError(error instanceof Error ? error.message : "Не удалось проверить GoalBuddy-карточку.");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function startRun() {
    if (!preview || isStarting || runBlocked) return;
    setIsStarting(true);
    try {
      const run = await postJson<TRun>(
        "/api/goalbuddy/runs",
        goalBuddyRunRequest(selection, preview.source.stateSha256),
      );
      onRunStarted(run);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось запустить GoalBuddy-карточку.");
    } finally {
      setIsStarting(false);
    }
  }

  async function createPipelinePreview() {
    if (!canPreviewPipeline) return;
    setIsPreviewingPipeline(true);
    try {
      setPipelinePreview(await postJson<GoalBuddyPipelinePreview>(
        "/api/goalbuddy/pipelines/preview",
        pipelineRequest,
      ));
    } catch (error) {
      setPipelinePreview(null);
      onError(error instanceof Error ? error.message : "Не удалось проверить цепочку GoalBuddy.");
    } finally {
      setIsPreviewingPipeline(false);
    }
  }

  async function startPipeline() {
    if (!pipelinePreview || isStarting || runBlocked) return;
    setIsStarting(true);
    try {
      const run = await postJson<TRun>("/api/goalbuddy/pipelines", pipelineRequest);
      onRunStarted(run);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Не удалось запустить цепочку GoalBuddy.");
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="goalBuddyPage">
      <div className="goalBuddyHeading">
        <div>
          <h2>GoalBuddy bridge</h2>
          <p>Выберите board и репозиторий, проверьте mapping, затем запустите активную карточку.</p>
        </div>
        <span>preview → run → receipt</span>
      </div>

      <form className="goalBuddySelector" onSubmit={(event) => void createPreview(event)}>
        <label>
          GoalBuddy state.yaml
          <input
            aria-label="GoalBuddy state.yaml path"
            value={statePath}
            onChange={(event) => changeStatePath(event.target.value)}
            placeholder="D:\\goals\\my-goal\\state.yaml"
            spellCheck={false}
          />
        </label>
        <label>
          Repository
          <input
            aria-label="GoalBuddy repository path"
            value={projectPath}
            onChange={(event) => changeProjectPath(event.target.value)}
            placeholder="D:\\work\\my-project"
            spellCheck={false}
          />
        </label>
        <button type="submit" disabled={!canPreview}>
          {isPreviewing ? "Проверяем…" : "Проверить карточку"}
        </button>
      </form>

      {preview ? (
        <section className="goalBuddyPreview" aria-live="polite">
          <div className="goalBuddyPreviewTitle">
            <div>
              <span>{preview.taskInput.externalTaskId}</span>
              <h3>{preview.taskInput.title}</h3>
              <p>{preview.taskInput.goalBuddy?.goalTitle ?? preview.taskInput.goalBuddy?.goalSlug}</p>
            </div>
            <code title={preview.source.stateSha256}>{preview.source.stateSha256.slice(0, 12)}</code>
          </div>
          <dl className="goalBuddyMapping">
            <div><dt>objective</dt><dd>title + prompt</dd></div>
            <div><dt>allowed_files</dt><dd>{preview.taskInput.allowedPaths?.join(", ") || "—"}</dd></div>
            <div><dt>verify</dt><dd>{preview.taskInput.verificationCommands?.join(" · ") || "—"}</dd></div>
            <div><dt>stop_if</dt><dd>{preview.taskInput.executionGuards?.join(" · ") || "—"}</dd></div>
            <div><dt>task id</dt><dd>{preview.taskInput.externalTaskId}</dd></div>
          </dl>
        </section>
      ) : (
        <div className="goalBuddyEmpty" aria-live="polite">
          Preview покажет точный TaskInput до запуска агента.
        </div>
      )}

      <div className="goalBuddyAdvanceNote">
        <b>После успешного run</b>
        <span>Следующая queued-карточка будет автоматически добавлена в этот run и запущена в новом контексте.</span>
      </div>

      <div className="goalBuddyActions">
        <small>{runBlocked
          ? "Дождитесь завершения текущего run перед запуском GoalBuddy-карточки."
          : "Run использует SHA из preview и остановится, если board изменился."}</small>
        <button
          className="primary"
          type="button"
          disabled={!preview || isStarting || isPreviewing || runBlocked}
          onClick={() => void startRun()}
        >
          {isStarting ? "Запускаем…" : "Запустить карточку"}
        </button>
      </div>

      <section className="goalBuddyPipelineBuilder">
        <div className="goalBuddyPreviewTitle">
          <div>
            <span>serial goal pipeline</span>
            <h3>Последовательная цепочка goals</h3>
            <p>Один путь к state.yaml на строку. Следующий goal стартует только после подтверждённого T999 audit предыдущего.</p>
          </div>
        </div>
        <label>
          GoalBuddy goals в порядке запуска
          <textarea
            aria-label="GoalBuddy goal chain paths"
            value={chainPaths}
            onChange={(event) => changeChainPaths(event.target.value)}
            placeholder={"D:\\repo\\docs\\goals\\first\\state.yaml\nD:\\repo\\docs\\goals\\second\\state.yaml"}
            spellCheck={false}
          />
        </label>
        {pipelinePreview && (
          <ol className="goalBuddyPipelinePreview" aria-live="polite">
            {pipelinePreview.goals.map((goal) => (
              <li key={goal.statePath}>
                <b>{goal.goalSlug ?? goal.statePath}</b>
                <span>{goal.activeTaskId} · {goal.activeTaskTitle}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="goalBuddyActions">
          <button
            type="button"
            disabled={!canPreviewPipeline}
            onClick={() => void createPipelinePreview()}
          >
            {isPreviewingPipeline ? "Проверяем цепочку…" : "Проверить цепочку"}
          </button>
          <button
            className="primary"
            type="button"
            disabled={!pipelinePreview || isStarting || runBlocked}
            onClick={() => void startPipeline()}
          >
            {isStarting ? "Запускаем…" : "Запустить цепочку"}
          </button>
        </div>
        <small>Все boards проверяются до старта. Ошибка, conflict или неподтверждённый oracle останавливают цепочку; commits не создаются.</small>
      </section>
    </section>
  );
}
