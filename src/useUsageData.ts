import { useEffect, useState } from "react";
import { apiFetch } from "./api-client";
import type { RunMetrics, UsageRun } from "./UsagePage";
import { usageUpdates, watchUsage, type UsageSnapshot } from "./usage-updates";

type UsageData = { sourceRuns: UsageRun[]; metricsByRun: Record<string, RunMetrics> };
const empty: UsageData = { sourceRuns: [], metricsByRun: {} };

export async function loadUsageData(source: string, signal: AbortSignal, fetcher = apiFetch): Promise<UsageData> {
  const [kind, id] = source.split(":", 2);
  const read = async <T,>(path: string): Promise<T> => {
    const response = await fetcher(path, { signal, cache: "no-store" });
    if (!response.ok) throw new Error("Usage request failed");
    return response.json() as Promise<T>;
  };
  const sourceRuns = kind === "pipeline"
    ? (await read<{ runs: UsageRun[] }>(`/api/pipelines/${encodeURIComponent(id)}/runs`)).runs
    : [await read<UsageRun>(`/api/runs/${encodeURIComponent(id)}`)];
  const metrics = await Promise.all(sourceRuns.map(run => read<RunMetrics>(`/api/runs/${encodeURIComponent(run.id)}/metrics`)));
  // Publish runs and metrics together; never mix a new token snapshot with old metrics.
  return { sourceRuns, metricsByRun: Object.fromEntries(metrics.map(value => [value.id, value])) };
}

export function useUsageData(source: string) {
  const [state, setState] = useState<UsageSnapshot<UsageData> & { source: string }>({ source: "", loading: false });
  useEffect(() => {
    if (!source) return;
    return watchUsage({ source, updates: usageUpdates,
      load: signal => loadUsageData(source, signal),
      change: snapshot => setState({ ...snapshot, source }),
    });
  }, [source]);
  const current: UsageSnapshot<UsageData> = state.source === source ? state : { loading: Boolean(source) };
  return { ...(current.data ?? empty), loading: current.loading, error: current.error };
}
