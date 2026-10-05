import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, lstatSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inventory, assertPlainPath, assertArtifactStage, type ArtifactStage } from "./isolated-artifacts.ts";
import type { ReportRequest } from "./agent-report.ts";
export const normalizedProcessPath = (p: unknown): p is string => typeof p === "string" && p === p.normalize("NFC") && !/[\\:*?\[\]\x00-\x1f]/u.test(p) && p.split("/").every(s => s && s !== "." && s !== ".." && !/[. ]$/u.test(s) && ![".git", ".orchestrator-scratch"].includes(s.toLowerCase()));
export const ownsProcessPath = (paths: string[], p: string) => paths.some(s => s.endsWith("/**") ? p.startsWith(`${s.slice(0, -3)}/`) : s === p);
export type ProcessPhase = "prepared" | "analyzed" | "finalized" | "verified" | "approved" | "publishing" | "published";
export type ProcessPublicationEntry = { path: string; before: string | null; after: string };
export type ProcessHandlerIdentity = { name: string; version: string; implementation: string; configuration: string };
export type ProcessHooks = {
  persist: (progress: ProcessProgress) => Promise<void>;
  authority: () => Promise<string>;
  analyze: (prompt: string, report?: ReportRequest) => Promise<string>;
  verify: () => Promise<{ code: number; timedOut: boolean; receipts: unknown }>;
  review: () => Promise<{ status: string; receipts: unknown; feedback?: string; correctionAllowed?: boolean }>;
  boundary?: (name: string) => Promise<void>;
};
export type ProcessContext = {
  progress: ProcessProgress;
  save: () => Promise<void>;
  fence: (publication?: boolean) => Promise<void>;
  checkpoint: (phase: "prepared" | "analyzed" | "finalized") => Promise<void>;
  feedback?: string;
};
/** Code-owned implementation. Queue data cannot supply these operations. */
export type ProcessHandler = {
  identity: ProcessHandlerIdentity;
  attempts: { verification: number; review: number; publication: number; correction?: number };
  publication: { recovery: "conditional-files" | "unsupported"; temporarySuffix: string; sealedDirectory: string };
  fence: (progress: ProcessProgress | undefined, publication: boolean) => Promise<void>;
  execute: (context: ProcessContext) => Promise<void>;
  buildPublicationPlan: (current: Map<string, string>, baseline: Map<string, string>) => Promise<string[]>;
  validatePublished: (progress: ProcessProgress) => Promise<void>;
};
export type ProcessProgress = {
  contractType: "ProcessProgressV1"; runId: string; taskId: string; binding: string;
  handler: ProcessHandlerIdentity; phase: ProcessPhase; inputs: Record<string, string>; baseline: Record<string, string>;
  artifacts: Record<string, string>; attempts: { executor: number; verification: number; review: number; publication: number };
  history: Array<{ stage: string; result: string; receipt?: unknown }>;
  native: Array<{ args: string[]; exitCode: number | null; stdout: string; stderr: string }>;
  failure?: { kind: "transient" | "result-defect" | "environment" | "stale" | "ambiguous-effect"; stage: string };
  publication?: ProcessPublicationEntry[]; sealed?: string;
};
export function processSha(bytes: string | Buffer) { return createHash("sha256").update(bytes).digest("hex"); }
export const processImplementationIdentity = (() => {
  const path = typeof import.meta.url === "string" && import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : resolve(process.argv[1]);
  return { path, sha256: processSha(readFileSync(path)) };
})();
export async function restoreProcessStage(project: string, parent: string, p: ProcessProgress): Promise<ArtifactStage> {
  const root = resolve(parent, "workspace");
  await assertPlainPath(parent, root);
  assert.equal(p.contractType, "ProcessProgressV1", "Legacy progress requires fresh authorization; handler identity is unavailable");
  for (const map of [p.inputs, p.baseline, p.artifacts]) for (const [key, value] of Object.entries(map)) { assert.ok(normalizedProcessPath(key)); assert.match(value, /^[a-f0-9]{64}$/u); }
  return { root, project, receipt: join(parent, "stage.json"), inputs: new Map(Object.entries(p.inputs)), baseline: new Map(Object.entries(p.baseline)), inputPaths: [...new Set(Object.keys(p.inputs).map(k => k.split("/").slice(0, -1).join("/")))], reviewed: ["approved", "publishing", "published"].includes(p.phase) ? new Map(Object.entries(p.artifacts)) : undefined, sealedRoot: p.sealed };
}

/** One stage protocol; domain operations and external evidence belong to the handler. */
export async function executeProcess(options: {
  handler: ProcessHandler; stage: ArtifactStage; allowedPaths: string[];
  runId: string; taskId: string; progress?: ProcessProgress; hooks: ProcessHooks; maxCorrections?: number;
}) {
  const { handler, stage, hooks, allowedPaths, runId, taskId } = options;
  for (const n of [handler.attempts.verification, handler.attempts.review, handler.attempts.publication]) assert.ok(Number.isInteger(n) && n >= 1 && n <= 5);
  const configuredCorrections = handler.attempts.correction ?? 0;
  assert.ok(Number.isInteger(configuredCorrections) && configuredCorrections >= 0 && configuredCorrections <= 2, "Process correction limit must be 0..2");
  const reviewerCorrections = options.maxCorrections ?? 0;
  assert.ok(Number.isInteger(reviewerCorrections) && reviewerCorrections >= 0 && reviewerCorrections <= 5);
  const correctionLimit = Math.min(configuredCorrections, reviewerCorrections);
  assert.match(handler.publication.temporarySuffix, /^\.[a-z-]+\.tmp$/u);
  assert.ok(normalizedProcessPath(handler.publication.sealedDirectory));
  let p = options.progress;
  const authorityBinding = await hooks.authority();
  const binding = processSha(JSON.stringify({ authorityBinding, implementation: processImplementationIdentity.sha256,
    allowedPaths, project: stage.project, root: stage.root, inputPaths: stage.inputPaths,
    handler: handler.identity, attempts: handler.attempts, publication: handler.publication, correctionLimit }));
  await handler.fence(p, false);
  if (p) {
    assert.equal(p.contractType, "ProcessProgressV1", "Legacy progress requires fresh authorization; implementation identity is unavailable");
    assert.deepEqual(p.handler, handler.identity, "Process handler/configuration changed");
    assert.equal(p.runId, runId); assert.equal(p.taskId, taskId);
    assert.equal(p.binding, binding, "Process authority/runtime binding changed");
    assert.ok(["finalized", "verified", "approved", "publishing", "published"].includes(p.phase), "Incomplete analysis/finalization cannot be implicitly repeated");
    assert.ok(!p.failure || ["transient", "ambiguous-effect"].includes(p.failure.kind), "Deterministic or stale failure requires a new authorized result");
    assert.deepEqual(Object.fromEntries(stage.inputs), p.inputs, "Process inputs changed");
    assert.deepEqual(Object.fromEntries(stage.baseline), p.baseline, "Process baseline changed");
    for (const n of Object.values(p.attempts)) assert.ok(Number.isInteger(n) && n >= 0 && n <= 5);
    if (["publishing", "published"].includes(p.phase)) {
      assert.equal(handler.publication.recovery, "conditional-files", "Handler publication recovery unsupported");
      assert.ok(p.publication && p.sealed);
      assert.equal(p.sealed, join(dirname(stage.receipt), handler.publication.sealedDirectory), "Process sealed location changed");
    }
  }
  const save = async () => hooks.persist(JSON.parse(JSON.stringify(p!)));
  const fence = async (publication = false) => {
    assert.equal(await hooks.authority(), authorityBinding, "Process authority/runtime binding changed");
    assert.equal(processSha(readFileSync(processImplementationIdentity.path)), processImplementationIdentity.sha256, "Process loaded implementation changed");
    await handler.fence(p, publication);
    if (p) {
      const corrections = p.history.filter(h => h.stage === "analysis-correction");
      if (corrections.length || correctionLimit) {
        assert.equal(p.attempts.executor, corrections.length + 1, "Process correction counter changed");
        assert.ok(corrections.length <= correctionLimit, "Process correction budget exceeded");
      }
      for (const [index, entry] of corrections.entries()) {
        const receipt = entry.receipt as { archived: string; artifacts: Record<string, string>; feedback: string };
        assert.equal(receipt.archived, resolve(dirname(stage.receipt), `rejected-analysis-${index + 1}`), "Process rejection archive location changed");
        assert.equal(entry.result, processSha(receipt.feedback.trim().replace(/\s+/gu, " ")), "Process correction feedback changed");
        await assertPlainPath(dirname(stage.receipt), receipt.archived);
        assert.deepEqual(Object.fromEntries(await inventory(receipt.archived)), receipt.artifacts, "Process rejected artifacts changed");
      }
    }
    if (p && ["finalized", "verified", "approved", "publishing", "published"].includes(p.phase))
      assert.deepEqual(Object.fromEntries(await inventory(stage.root)), p.artifacts, "Process artifacts changed since checkpoint");
    if (!publication) await assertArtifactStage(stage, allowedPaths);
    else if (p?.publication) {
      for (const [key, expected] of stage.inputs) {
        const entry = p.publication!.find(e => e.path === key);
        await assertPlainPath(stage.project, join(stage.project, key));
        const actual = processSha(readFileSync(join(stage.project, key)));
        assert.ok(actual === expected || (entry && actual === entry.after), `Canonical input changed: ${key}`);
      }
      for (const scope of stage.inputPaths) {
        if (lstatSync(join(stage.project, scope)).isDirectory()) {
          const actual = [...(await inventory(join(stage.project, scope))).keys()].map(k => `${scope}/${k}`).sort();
          const ownedTemps: Set<string> = new Set(p.publication!.map(e => `${e.path}${handler.publication.temporarySuffix}`));
          assert.deepEqual(actual.filter(k => !ownedTemps.has(k)), [...stage.inputs.keys()].filter(k => k.startsWith(`${scope}/`)).sort(), "Canonical input inventory changed");
        }
      }
    }
  };
  const checkpoint = async (phase: ProcessPhase) => {
    const order: ProcessPhase[] = ["prepared", "analyzed", "finalized", "verified", "approved", "publishing", "published"];
    assert.ok(order.indexOf(phase) === order.indexOf(p!.phase) + 1 || phase === p!.phase, "Invalid process transition");
    p!.phase = phase; p!.artifacts = Object.fromEntries(await inventory(stage.root)); p!.failure = undefined;
    await save(); await hooks.boundary?.(phase);
    await fence(phase === "publishing" || phase === "published");
  };
  try {
    if (!p) {
      await fence();
      p = { contractType: "ProcessProgressV1", runId, taskId, binding, handler: structuredClone(handler.identity), phase: "prepared",
        inputs: Object.fromEntries(stage.inputs), baseline: Object.fromEntries(stage.baseline), artifacts: {},
        attempts: { executor: 0, verification: 0, review: 0, publication: 0 }, history: [], native: [] };
      await save();
      p.attempts.executor = 1; await save();
      await handler.execute({ progress: p, save, fence, checkpoint });
      assert.equal(p.phase, "finalized", "Handler must finalize before verification");
    }
    const attempt = async (name: "verification" | "review" | "publication") => {
      assert.ok(p!.attempts[name] < handler.attempts[name], `Process ${name} budget exhausted`);
      p!.attempts[name]++; p!.failure = undefined; await save(); await fence(name === "publication");
    };
    while (p.phase === "finalized" || p.phase === "verified") {
      if (p.phase === "finalized") {
        await attempt("verification"); const r = await hooks.verify(); await fence();
        p.history.push({ stage: "verification", result: r.code === 0 && !r.timedOut ? "passed" : "failed", receipt: r.receipts });
        if (r.code !== 0 || r.timedOut) {
          p.failure = { kind: r.code === 75 || r.timedOut ? "transient" : "result-defect", stage: "verification" };
          await save(); throw new Error("Process verification failed; no analysis retry");
        }
        await checkpoint("verified");
      }
      if (p.phase === "verified") {
        await attempt("review"); const r = await hooks.review(); await fence();
        p.history.push({ stage: "review", result: r.status, receipt: r.receipts });
        if (r.status !== "approved") {
          if (r.status === "changes_requested" && r.correctionAllowed === true && correctionLimit > 0) {
            const feedback = r.feedback?.trim();
            assert.ok(feedback && Buffer.byteLength(feedback, "utf8") <= 16_384, "Process correction requires bounded reviewer feedback");
            const digest = processSha(feedback.replace(/\s+/gu, " "));
            const prior = p.history.filter(h => h.stage === "analysis-correction");
            const repeated = prior.some(h => h.result === digest);
            if (!repeated && p.attempts.executor < correctionLimit + 1 &&
              p.attempts.verification < handler.attempts.verification && p.attempts.review < handler.attempts.review) {
              // Preserve the exact rejected workspace; start the replacement from unchanged inputs.
              await fence();
              assert.deepEqual(p.baseline, p.inputs, "Process correction requires an input-only baseline");
              const parent = dirname(stage.receipt), archived = resolve(parent, `rejected-analysis-${p.attempts.executor}`);
              assert.equal(dirname(archived), resolve(parent));
              await assertPlainPath(parent, stage.root);
              assert.ok(!existsSync(archived), "Process rejected-analysis archive already exists");
              p.attempts.executor++;
              p.history.push({ stage: "analysis-correction", result: digest, receipt: { feedback, archived, artifacts: structuredClone(p.artifacts) } });
              await save();
              renameSync(stage.root, archived);
              mkdirSync(stage.root); mkdirSync(join(stage.root, ".orchestrator-scratch"));
              for (const [key, expected] of stage.inputs) {
                await assertPlainPath(stage.project, join(stage.project, key));
                const bytes = readFileSync(join(stage.project, key));
                assert.equal(processSha(bytes), expected, "Process correction input changed");
                mkdirSync(dirname(join(stage.root, key)), { recursive: true });
                await assertPlainPath(stage.root, dirname(join(stage.root, key)));
                writeFileSync(join(stage.root, key), bytes, { flag: "wx" });
              }
              stage.reviewed = undefined; stage.sealedRoot = undefined;
              p.phase = "prepared"; p.artifacts = Object.fromEntries(await inventory(stage.root)); p.failure = undefined;
              await save(); await fence();
              await hooks.boundary?.("analysis-correction");
              await handler.execute({ progress: p, save, fence, checkpoint, feedback });
              assert.equal(p.phase, "finalized", "Handler must finalize corrected analysis before verification");
              continue;
            }
            p.history.push({ stage: "analysis-correction-stop", result: repeated ? "repeated-feedback" : "budget-exhausted" });
          }
          p.failure = { kind: r.status === "unavailable" ? "transient" : "result-defect", stage: "review" };
          await save(); throw new Error("Process independent review not approved; no analysis retry");
        }
        await checkpoint("approved");
      }
    }
    if (p.phase === "approved") {
      await fence();
      const current = await assertArtifactStage(stage, allowedPaths);
      const delta = [...new Set([...stage.baseline.keys(), ...current.keys()])]
        .filter(key => stage.baseline.get(key) !== current.get(key));
      for (const key of delta) assert.ok(current.has(key), `Process publication does not support file deletion: ${key}`);
      const changed = delta.map(key => [key, current.get(key)!] as const);
      const plan = await handler.buildPublicationPlan(current, stage.baseline);
      assert.deepEqual(plan, changed.map(([key]) => key).sort((a, z) => a.localeCompare(z)), "Handler publication plan must cover the exact reviewed delta");
      const entries: ProcessPublicationEntry[] = [];
      for (const [key, after] of changed.sort(([a], [z]) => a.localeCompare(z))) {
        assert.ok(ownsProcessPath(allowedPaths, key) && ownsProcessPath(allowedPaths, `${key}${handler.publication.temporarySuffix}`), "Publication temporary file exceeds authorized scope");
        const target = join(stage.project, key);
        if (existsSync(target)) { await assertPlainPath(stage.project, target); assert.equal(processSha(readFileSync(target)), stage.inputs.get(key), "Unexpected existing publication bytes"); }
        entries.push({ path: key, before: existsSync(target) ? processSha(readFileSync(target)) : null, after });
      }
      const sealed = join(dirname(stage.receipt), handler.publication.sealedDirectory);
      mkdirSync(sealed, { recursive: true }); await assertPlainPath(dirname(stage.receipt), sealed);
      for (const [key, expected] of current) {
        mkdirSync(dirname(join(sealed, key)), { recursive: true }); await assertPlainPath(sealed, dirname(join(sealed, key)));
        const bytes = readFileSync(join(stage.root, key)); assert.equal(processSha(bytes), expected);
        if (existsSync(join(sealed, key))) { await assertPlainPath(sealed, join(sealed, key)); assert.equal(processSha(readFileSync(join(sealed, key))), expected); }
        else writeFileSync(join(sealed, key), bytes, { flag: "wx" });
      }
      p.publication = entries; p.sealed = sealed; await checkpoint("publishing");
    }
    if (p.phase === "publishing" || p.phase === "published") {
      assert.ok(p.sealed && p.publication);
      const receipt = await reconcileFilePublication(stage.project, p.sealed, p.publication, allowedPaths, () => fence(true), async name => {
        if (name.startsWith("publication-file:")) {
          const key = name.slice("publication-file:".length), entry = p!.publication!.find(e => e.path === key)!;
          assert.ok(!p!.history.some(h => h.stage === "publication-effect" && h.result === key), "Duplicate publication effect");
          p!.history.push({ stage: "publication-effect", result: key, receipt: { after: entry.after } }); await save();
        }
        await hooks.boundary?.(name);
      }, handler.publication.temporarySuffix, () => attempt("publication"));
      await handler.validatePublished(p);
      p.history.push({ stage: "publication", result: "passed", receipt }); await checkpoint("published");
    }
    return p;
  } catch (error) {
    if (p && !p.failure) {
      const message = String(error);
      p.failure = { stage: p.phase, kind: /changed|invalid|unexpected|budget|revoked/i.test(message) ? "stale"
        : /EPERM|ENAMETOOLONG|ENOENT|unsupported/i.test(message) ? "environment"
        : ["publishing", "published"].includes(p.phase) ? "ambiguous-effect"
        : /interrupted|interruption/i.test(message) ? "transient" : "result-defect" };
      await save();
    }
    throw error;
  }
}

/** Conditional roll-forward of an independently reviewed file delta. */
export async function reconcileFilePublication(project: string, sealed: string, entries: ProcessPublicationEntry[], allowedPaths: string[], guard: () => Promise<void>, boundary?: ProcessHooks["boundary"], temporarySuffix = ".process-publication.tmp", beforeWrites?: () => Promise<void>) {
  assert.ok(entries.length > 0 && new Set(entries.map(e => e.path)).size === entries.length);
  const inspect = async () => {
    let pending = false;
    const statuses: boolean[] = [];
    for (const e of entries) {
      assert.ok(normalizedProcessPath(e.path) && ownsProcessPath(allowedPaths, e.path));
      assert.match(e.after, /^[a-f0-9]{64}$/u); if (e.before !== null) assert.match(e.before, /^[a-f0-9]{64}$/u);
      await assertPlainPath(sealed, join(sealed, e.path));
      assert.equal(processSha(readFileSync(join(sealed, e.path))), e.after, "Sealed publication bytes changed");
      const target = join(project, e.path);
      const temp = `${target}${temporarySuffix}`;
      if (existsSync(temp)) { await assertPlainPath(project, temp); assert.equal(lstatSync(temp).nlink, 1); assert.equal(processSha(readFileSync(temp)), e.after, "Uncertain publication temporary file"); }
      let parent = dirname(target); while (!existsSync(parent)) parent = dirname(parent);
      await assertPlainPath(project, parent);
      const exists = existsSync(target);
      if (exists) { await assertPlainPath(project, target); assert.equal(lstatSync(target).nlink, 1); }
      const actual = exists ? processSha(readFileSync(target)) : null;
      assert.ok(actual === e.before || actual === e.after, `Ambiguous publication bytes: ${e.path}`);
      const applied = actual === e.after;
      if (!applied) pending = true;
      else if (e.before !== e.after) assert.ok(!pending, "Non-prefix publication requires external reconciliation");
      statuses.push(applied);
    }
    return statuses;
  };
  await guard(); let states = await inspect(); let writes = 0;
  // Acknowledging an already applied delta is read-only and consumes no write attempt.
  if (states.every(Boolean)) {
    await guard(); assert.ok((await inspect()).every(Boolean), "Publication changed during read-only reconciliation");
    await boundary?.("publication-after-effect");
    return { writes, status: "published" };
  }
  await beforeWrites?.();
  await boundary?.("publication-before-effect");
  for (let i = 0; i < entries.length; i++) {
    await guard(); states = await inspect(); if (states[i]) continue;
    const e = entries[i], target = join(project, e.path);
    mkdirSync(dirname(target), { recursive: true }); await assertPlainPath(project, dirname(target));
    const bytes = readFileSync(join(sealed, e.path)); assert.equal(processSha(bytes), e.after);
    const temp = `${target}${temporarySuffix}`;
    assert.ok(ownsProcessPath(allowedPaths, `${e.path}${temporarySuffix}`));
    if (!existsSync(temp)) writeFileSync(temp, bytes, { flag: "wx" });
    await boundary?.(`publication-temp:${e.path}`);
    await guard(); states = await inspect();
    if (states[i]) continue;
    assert.equal(existsSync(target) ? processSha(readFileSync(target)) : null, e.before);
    renameSync(temp, target);
    writes++; await boundary?.(`publication-file:${e.path}`);
  }
  await guard(); assert.ok((await inspect()).every(Boolean));
  await boundary?.("publication-after-effect");
  return { writes, status: "published" };
}
