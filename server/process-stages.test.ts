import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareArtifactStage } from "./isolated-artifacts.ts";
import { executeProcess, restoreProcessStage, processSha, type ProcessHandler, type ProcessProgress, type ProcessHooks } from "./process-stages.ts";

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "process-stages-")), project = join(root, "project"), parent = join(root, "attempt");
  mkdirSync(join(project, "state"), { recursive: true });
  writeFileSync(join(project, "state/value.txt"), "0");
  let stage = await prepareArtifactStage(project, parent, { contractType: "IsolatedArtifactsV1", contractVersion: "1.0", inputPaths: ["state"], publishCommands: ["unused"] });
  let saved: ProcessProgress | undefined, authority = "approved";
  let executor = 0, verification = 0, review = 0, effects = 0;
  const handler: ProcessHandler = {
    identity: { name: "counter-fixture", version: "1", implementation: processSha("counter"), configuration: processSha("increment=1") },
    attempts: { verification: 2, review: 2, publication: 3 },
    publication: { recovery: "conditional-files", temporarySuffix: ".process-publication.tmp", sealedDirectory: "sealed-process" },
    fence: async () => {},
    execute: async context => {
      executor++; context.progress.attempts.executor++;
      await context.save();
      await context.checkpoint("prepared");
      const answer = await hooks.analyze("Increment the counter"); assert.equal(answer, "1");
      await context.checkpoint("analyzed");
      writeFileSync(join(stage.root, "state/value.txt"), answer);
      mkdirSync(join(stage.root, "result")); writeFileSync(join(stage.root, "result/receipt.txt"), "counter=1");
      await context.checkpoint("finalized");
    },
    buildPublicationPlan: async (current, baseline) => [...current].filter(([key, value]) => baseline.get(key) !== value).map(([key]) => key).sort((a, b) => a.localeCompare(b)),
    validatePublished: async () => { assert.equal(readFileSync(join(project, "state/value.txt"), "utf8"), "1"); },
  };
  const hooks: ProcessHooks = {
    persist: async p => { saved = structuredClone(p); writeFileSync(join(root, "progress.json"), JSON.stringify(p)); },
    authority: async () => authority,
    analyze: async () => "1",
    verify: async () => { verification++; return { code: 0, timedOut: false, receipts: { call: verification } }; },
    review: async () => { review++; return { status: "approved", receipts: { call: review } }; },
    boundary: async name => { if (name.startsWith("publication-file:")) effects++; },
  };
  return { root, project, handler, hooks,
    saved: () => saved!, counts: () => ({ executor, verification, review, effects }),
    authority: (value: string) => { authority = value; },
    run: () => executeProcess({ handler, stage, allowedPaths: ["state/**", "result/**"], runId: "run", taskId: "task", progress: saved, hooks }),
    restart: async () => { saved = JSON.parse(readFileSync(join(root, "progress.json"), "utf8")); stage = await restoreProcessStage(project, parent, saved!); stage.inputPaths = ["state"]; },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test("independent process retains executor across transient verification/review and JSON restart", async () => {
  for (const failure of ["verification", "review"]) {
    const f = await fixture();
    try {
      let calls = 0;
      if (failure === "verification") {
        const verify = f.hooks.verify; f.hooks.verify = async () => ({ ...await verify(), code: calls++ === 0 ? 75 : 0 });
      } else {
        const review = f.hooks.review; f.hooks.review = async () => ({ ...await review(), status: calls++ === 0 ? "unavailable" : "approved" });
      }
      await assert.rejects(f.run());
      assert.equal(f.saved().phase, failure === "verification" ? "finalized" : "verified");
      await f.restart(); await f.run();
      assert.deepEqual(f.counts(), { executor: 1, verification: failure === "verification" ? 2 : 1, review: failure === "review" ? 2 : 1, effects: 2 });
      assert.equal(f.saved().phase, "published");
      await f.restart(); await f.run();
      assert.equal(f.counts().effects, 2); assert.equal(f.counts().executor, 1);
      assert.ok(!JSON.stringify(f.saved()).toLowerCase().includes("gis"));
    } finally { f.cleanup(); }
  }
});

test("deterministic errors and exhausted stage budgets never repeat executor", async () => {
  for (const code of [1, 75]) {
    const f = await fixture();
    try {
      const verify = f.hooks.verify; f.hooks.verify = async () => ({ ...await verify(), code });
      await assert.rejects(f.run()); await f.restart();
      if (code === 75) { await assert.rejects(f.run()); await f.restart(); }
      await assert.rejects(f.run(), code === 75 ? /budget exhausted/ : /Deterministic/);
      assert.equal(f.counts().executor, 1); assert.equal(f.counts().verification, code === 75 ? 2 : 1);
      assert.equal(readFileSync(join(f.project, "state/value.txt"), "utf8"), "0");
    } finally { f.cleanup(); }
  }
});

test("handler/configuration/authority/input/artifact identity changes reject before another call", async () => {
  for (const change of ["handler", "config", "authority", "input", "artifact", "legacy", "plan"]) {
    const f = await fixture();
    try {
      let stopped = false;
      f.hooks.boundary = async name => { if (name === "finalized" && !stopped) { stopped = true; throw new Error("controlled interruption"); } };
      await assert.rejects(f.run()); await f.restart();
      if (change === "handler") f.handler.identity.implementation = processSha("changed");
      if (change === "config") f.handler.identity.configuration = processSha("changed");
      if (change === "authority") f.authority("revoked");
      if (change === "input") writeFileSync(join(f.project, "state/value.txt"), "2");
      if (change === "artifact") {
        const progress = f.saved(); writeFileSync(join(f.root, "attempt/workspace/state/value.txt"), "2"); assert.equal(progress.phase, "finalized");
      }
      if (change === "legacy") Object.assign(f.saved(), { contractType: "OldProgress" });
      if (change === "plan") f.handler.buildPublicationPlan = async () => [];
      await assert.rejects(f.run());
      assert.equal(f.counts().executor, 1);
      if (change !== "plan") { assert.equal(f.counts().verification, 0); assert.equal(f.counts().review, 0); }
      assert.equal(existsSync(join(f.project, "result/receipt.txt")), false);
    } finally { f.cleanup(); }
  }
});

test("same core publication recovers all effect boundaries without double application", async () => {
  for (const target of ["approved", "publishing", "publication-before-effect", "publication-temp:result/receipt.txt", "publication-file:result/receipt.txt", "publication-temp:state/value.txt", "publication-file:state/value.txt", "publication-after-effect", "published"]) {
    const f = await fixture();
    try {
      let stopped = false;
      const boundary = f.hooks.boundary;
      f.hooks.boundary = async name => { await boundary?.(name); if (name === target && !stopped) { stopped = true; throw new Error("controlled interruption"); } };
      await assert.rejects(f.run(), /controlled interruption/);
      await f.restart(); await f.run();
      assert.equal(f.saved().phase, "published", target);
      assert.deepEqual(f.counts(), { executor: 1, verification: 1, review: 1, effects: 2 });
    } finally { f.cleanup(); }
  }
});

test("unsupported handler publication recovery rejects without another effect", async () => {
  const f = await fixture();
  try {
    f.handler.publication.recovery = "unsupported";
    f.hooks.boundary = async name => { if (name === "publishing") throw new Error("controlled interruption"); };
    await assert.rejects(f.run()); await f.restart();
    await assert.rejects(f.run(), /recovery unsupported/);
    assert.equal(f.counts().executor, 1); assert.equal(f.counts().effects, 0);
  } finally { f.cleanup(); }
});

test("core source contains no domain path, contract or GIS branch", () => {
  const source = readFileSync(new URL("./process-stages.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /gis|quality-coverage|auditRoot|profile|gisPackage/i);
});
