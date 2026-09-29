import assert from "node:assert/strict";
import test from "node:test";
import { createUsageUpdates, watchUsage, type UsageSnapshot } from "./usage-updates";
import { loadUsageData } from "./useUsageData";

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function scheduler() {
  const pending = new Map<number, () => void>();
  return {
    pending,
    schedule(callback: () => void, delay: number) {
      assert.equal(pending.has(delay), false);
      pending.set(delay, callback);
      return () => { pending.delete(delay); };
    },
    async fire(delay: number) {
      const callback = pending.get(delay);
      assert.ok(callback, `Expected a ${delay} ms timer`);
      pending.delete(delay);
      callback();
      await flush();
    },
  };
}
const run = (task = {}) => ({ id: "r1", project: { name: "fixture" }, status: "running",
  pipeline: { id: "p1" }, tasks: [{ id: "t1", status: "running", usage: [{ inputTokens: 10 }], ...task }] });

test("logs cause no usage requests; telemetry and lifecycle changes refresh the selected pipeline", async () => {
  const updates = createUsageUpdates(); updates.connection(true); updates.publish(run());
  const clock = scheduler(); let calls = 0;
  const stop = watchUsage({ source: "pipeline:p1", updates, schedule: clock.schedule,
    load: async () => ++calls, change: () => {} });
  await flush();
  for (let i = 0; i < 100; i++) updates.publish(run({ log: [String(i)], finalOutput: String(i), diff: String(i) }));
  assert.equal(calls, 1); assert.equal(clock.pending.size, 0);
  for (let i = 11; i <= 20; i++) updates.publish(run({ usage: [{ inputTokens: i }] }));
  assert.equal(clock.pending.size, 1);
  await clock.fire(100); assert.equal(calls, 2);
  for (const change of [
    { status: "completed", finishedAt: "2026-09-18T10:00:00Z" },
    { executionAttempts: 2 }, { attempts: 3 }, { reviewStatus: "approved" },
    { executionBudgetEvidence: [{ settledAt: "2026-09-18T10:00:00Z" }] },
  ]) {
    updates.publish(run(change)); await clock.fire(100);
  }
  assert.equal(calls, 7);
  updates.publish({ ...run(), id: "r2", pipeline: { id: "other" } });
  assert.equal(clock.pending.size, 0);
  updates.publish({ ...run(), id: "r3" });
  await clock.fire(100); assert.equal(calls, 8);
  stop();
});

test("refresh is single-flight with one trailing request, and disposal rejects late responses", async () => {
  const updates = createUsageUpdates(); updates.connection(true);
  const clock = scheduler(); const snapshots: UsageSnapshot<number>[] = [];
  const resolvers: ((value: number) => void)[] = []; let signal: AbortSignal | undefined;
  const stop = watchUsage({ source: "run:r1", updates, schedule: clock.schedule,
    load: s => { signal = s; return new Promise<number>(resolve => resolvers.push(resolve)); },
    change: value => snapshots.push(value) });
  for (let i = 0; i < 20; i++) updates.publish(run({ executionAttempts: i }));
  assert.equal(resolvers.length, 1);
  resolvers[0](1); await flush(); await clock.fire(100);
  assert.equal(resolvers.length, 2);
  assert.deepEqual(snapshots.at(-1), { data: 1, loading: false });
  stop(); assert.equal(signal?.aborted, true);
  resolvers[1](2); await flush();
  assert.equal(snapshots.at(-1)?.data, 1); assert.equal(clock.pending.size, 0);
});

test("disconnect polls slowly, reconnect reconciles once, and failures retain the snapshot", async () => {
  const updates = createUsageUpdates(); updates.connection(true);
  const clock = scheduler(); let fail = false; let calls = 0;
  const snapshots: UsageSnapshot<number>[] = [];
  const stop = watchUsage({ source: "run:r1", updates, schedule: clock.schedule,
    load: async () => { calls++; if (fail) throw Error("offline"); return calls; },
    change: value => snapshots.push(value) });
  await flush(); assert.equal(clock.pending.size, 0);
  updates.connection(false); await clock.fire(30_000); assert.equal(calls, 2);
  updates.connection(true); assert.equal(clock.pending.has(30_000), false);
  await clock.fire(100); assert.equal(calls, 3); assert.equal(clock.pending.size, 0);
  fail = true; updates.publish(run()); await clock.fire(100);
  assert.equal(snapshots.at(-1)?.data, 3); assert.equal(snapshots.at(-1)?.loading, false);
  assert.ok(snapshots.at(-1)?.error);
  fail = false; await clock.fire(30_000);
  assert.equal(snapshots.at(-1)?.data, 5); assert.equal(snapshots.at(-1)?.error, undefined);
  assert.equal(clock.pending.size, 0); stop();
});

test("a source switch cannot deliver the old response to the new view", async () => {
  const updates = createUsageUpdates(); updates.connection(true);
  const clock = scheduler(); const seen: string[] = [];
  let resolveOld!: (value: string) => void;
  const stopOld = watchUsage({ source: "run:old", updates, schedule: clock.schedule,
    load: () => new Promise<string>(resolve => { resolveOld = resolve; }),
    change: value => { if (value.data) seen.push(value.data); } });
  stopOld();
  const stopNew = watchUsage({ source: "run:new", updates, schedule: clock.schedule,
    load: async () => "new", change: value => { if (value.data) seen.push(value.data); } });
  await flush(); resolveOld("old"); await flush();
  assert.deepEqual(seen, ["new"]); stopNew();
});

test("run and metrics are loaded together, including every pipeline sibling; HTTP errors reject", async () => {
  const paths: string[] = []; let failMetrics = false;
  const fetcher = (async (input, init) => {
    const path = String(input); paths.push(path); assert.ok(init?.signal);
    if (path.endsWith("/runs")) return Response.json({ runs: [{ id: "a" }, { id: "b" }] });
    if (failMetrics) return new Response("unavailable", { status: 503 });
    const id = path.includes("/a/") ? "a" : "b";
    return Response.json({ id, tokens: { totalTokens: id === "a" ? 12 : 34 } });
  }) as typeof fetch;
  const data = await loadUsageData("pipeline:p1", new AbortController().signal, fetcher);
  assert.deepEqual(paths, ["/api/pipelines/p1/runs", "/api/runs/a/metrics", "/api/runs/b/metrics"]);
  assert.equal(data.metricsByRun.a.tokens.totalTokens, 12);
  assert.equal(data.metricsByRun.b.tokens.totalTokens, 34);
  failMetrics = true;
  await assert.rejects(loadUsageData("pipeline:p1", new AbortController().signal, fetcher));
});
