type RunUpdate = {
  id: string; project: unknown; status: string; startedAt?: string; finishedAt?: string;
  pipeline?: { id: string }; tasks: object[];
};
type Update = { sources?: string[]; connected: boolean };

// These are the inputs of the usage view and the server's clock-free metrics
// projections. Logs, prompts, diffs and other executor output are deliberately absent.
const taskFields = ["id", "key", "title", "model", "status", "startedAt", "finishedAt",
  "usage", "executionAttempts", "attempts", "reviewStatus", "executionBudget",
  "executionBudgetEvidence", "executionBudgetCarriedCompletion"] as const;

export function createUsageUpdates() {
  const signatures = new Map<string, string>();
  const listeners = new Set<(event: Update) => void>();
  let connected = false;
  return {
    get connected() { return connected; },
    subscribe(listener: (event: Update) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    connection(value: boolean) {
      if (value === connected) return;
      connected = value;
      for (const listener of listeners) listener({ connected });
    },
    publish(run: RunUpdate | null) {
      if (!run) return;
      const signature = JSON.stringify([run.project, run.status, run.startedAt, run.finishedAt,
        run.pipeline, run.tasks.map(task => taskFields.map(field => (task as Record<string, unknown>)[field]))]);
      if (signatures.get(run.id) === signature) return;
      signatures.set(run.id, signature);
      // This is an invalidation index, not a persistent run cache.
      if (signatures.size > 100) signatures.delete(signatures.keys().next().value!);
      const sources = [`run:${run.id}`, ...(run.pipeline ? [`pipeline:${run.pipeline.id}`] : [])];
      for (const listener of listeners) listener({ sources, connected });
    },
  };
}

export const usageUpdates = createUsageUpdates();

export type UsageSnapshot<T> = { data?: T; loading: boolean; error?: string };

/** One request at a time, one trailing refresh, and no healthy-stream polling. */
export function watchUsage<T>(options: {
  source: string;
  updates: ReturnType<typeof createUsageUpdates>;
  load: (signal: AbortSignal) => Promise<T>;
  change: (snapshot: UsageSnapshot<T>) => void;
  schedule?: (callback: () => void, delay: number) => () => void;
}) {
  const schedule = options.schedule ?? ((callback, delay) => {
    const timer = setTimeout(callback, delay);
    return () => clearTimeout(timer);
  });
  const abort = new AbortController();
  let snapshot: UsageSnapshot<T> = { loading: true };
  let busy = false;
  let dirty = false;
  let cancelTimer: (() => void) | undefined;
  let scheduledDelay: number | undefined;
  const cancel = () => { cancelTimer?.(); cancelTimer = undefined; scheduledDelay = undefined; };
  const queue = (delay: number) => {
    if (cancelTimer && scheduledDelay === delay) return;
    cancel();
    scheduledDelay = delay;
    cancelTimer = schedule(() => { cancelTimer = undefined; scheduledDelay = undefined; void refresh(); }, delay);
  };
  const refresh = async () => {
    if (abort.signal.aborted) return;
    if (busy) { dirty = true; return; }
    cancel();
    busy = true;
    dirty = false;
    try {
      const data = await options.load(abort.signal);
      if (!abort.signal.aborted) snapshot = { data, loading: false };
    } catch {
      if (!abort.signal.aborted) snapshot = { ...snapshot, loading: false,
        error: snapshot.data === undefined ? "Не удалось загрузить расход. Повторим запрос автоматически."
          : "Не удалось обновить расход. Показаны последние доступные данные." };
    } finally {
      busy = false;
      if (!abort.signal.aborted) {
        options.change(snapshot);
        if (dirty) queue(100);
        else if (!options.updates.connected || snapshot.error) queue(30_000);
      }
    }
  };
  const unsubscribe = options.updates.subscribe(event => {
    if (event.sources && !event.sources.includes(options.source)) return;
    if (!event.sources && !event.connected) {
      if (!busy && !cancelTimer) queue(30_000);
      return;
    }
    if (busy) dirty = true;
    else queue(100);
  });
  options.change(snapshot);
  void refresh();
  return () => { abort.abort(); cancel(); unsubscribe(); };
}
