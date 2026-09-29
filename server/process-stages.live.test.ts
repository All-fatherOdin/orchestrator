import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { processSha } from "./process-stages.ts";

/** Opt-in evidence verification after the separately launched genuine-agent runs. */
test("live GIS: same registered handler at two configured roots, native state handoff and persisted recovery", { skip: process.env.PROCESS_STAGES_LIVE !== "1" }, () => {
  const evidence = resolve("queues/process-stages-20260929");
  const load = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const hash = (path: string) => processSha(readFileSync(path));
  for (const [path, expected] of Object.entries(load(join(evidence, "frozen-implementations.json")))) assert.equal(hash(resolve(path)), expected);
  for (const name of ["frozen-small-runner.json", "frozen-contract-runner.json"]) {
    const frozen = load(join(evidence, name)); assert.equal(hash(resolve(frozen.path)), frozen.sha256);
  }
  const reports: unknown[] = [], identities: string[] = [], configurations: string[] = [], locations: string[] = [];
  for (const variant of ["A", "B"]) {
    const loc = load(join(evidence, `LOCATION-${variant}.json`)); locations.push(loc.project);
    const id = load(join(loc.root, "run-id.json")).id;
    const record = join(loc.data, "runs", id, "run.json"), run = load(record), manifest = load(loc.manifest);
    for (const name of ["live-gate.mjs", "profile-gate.mjs"]) assert.equal(hash(join(loc.project, "contracts", name)), hash(resolve("server/process-stages-live-fixtures", name)));
    assert.equal(run.status, "completed"); assert.equal(run.tasks.length, 3);
    const interruption = load(join(loc.root, "controlled-interruption.json"));
    const interruptedRecord = load(join(evidence, `final-interrupted-${variant}-run.json`));
    const interruptedState = load(join(evidence, `final-interrupted-${variant}-state.json`));
    assert.equal(hash(join(evidence, `final-interrupted-${variant}-run.json`)), interruptedState.recordSha256);
    assert.equal(interruptedRecord.id, id); assert.equal(interruptedRecord.tasks[0].processProgress.phase, "publishing");
    assert.equal(interruptedState.state.baseline.actual, interruptedState.state.baseline.after);
    assert.equal(interruptedState.state.coverage.actual, interruptedState.state.coverage.before);
    assert.equal(interruptedState.coverageTempSha256, interruptedState.state.coverage.after);
    assert.equal(interruption.runId, id); assert.equal(interruption.taskId, run.tasks[0].id);
    assert.equal(interruption.boundary, `publication-temp:${loc.state}/quality-coverage.json`);
    assert.equal(interruption.progress, "publishing");
    const prior = load(join(loc.root, "run-report.json"));
    assert.equal(prior.tasks[0].phase, "publishing"); assert.equal(prior.tasks[0].executorCalls, 1);
    for (const [i, t] of run.tasks.slice(0, 2).entries()) {
      assert.equal(t.status, "completed"); assert.equal(t.executionAttempts, 1); assert.equal(t.reviewStatus, "approved");
      assert.equal(t.gisProgress, undefined);
      const p = t.processProgress;
      assert.equal(p.contractType, "ProcessProgressV1"); assert.equal(p.handler.name, "gis-audit"); assert.equal(p.phase, "published");
      assert.equal(p.runId, id); assert.equal(p.taskId, t.id);
      assert.deepEqual(p.attempts, { executor: 1, verification: 1, review: 1, publication: i ? 1 : 2 });
      identities.push(p.handler.implementation); configurations.push(p.handler.configuration);
      assert.ok(p.native.length >= 6);
      for (const n of p.native) {
        assert.equal(n.exitCode, 0); assert.equal(n.args[1], "sandbox"); assert.ok(n.args.includes("orchestrator-apply"));
        assert.ok(n.args.some((a: string) => a.includes("network = { enabled = false }")));
      }
      const effects = p.history.filter((h: { stage: string }) => h.stage === "publication-effect");
      assert.equal(effects.length, p.publication.length); assert.equal(new Set(effects.map((h: { result: string }) => h.result)).size, effects.length);
      assert.equal(p.history.find((h: { stage: string; result: string }) => h.stage === "publication" && h.result === "passed").receipt.writes, i ? p.publication.length : 1);
      assert.deepEqual(p.history.find((h: { stage: string; result: string }) => h.stage === "verification" && h.result === "passed").receipt, t.verificationEvidence);
      assert.ok(t.verificationEvidence.every((e: { exitCode: number; timedOut: boolean }) => e.exitCode === 0 && !e.timedOut));
      const folder = join(loc.project, manifest.batches[i].run);
      for (const name of ["coverage", "baseline"]) {
        assert.equal(hash(join(folder, `after-${name}.json`)), hash(join(folder, "isolated-state", `quality-${name}.json`)));
        if (i) assert.equal(hash(join(folder, `before-${name}.json`)), hash(join(loc.project, manifest.batches[0].run, `after-${name}.json`)));
      }
    }
    assert.ok(run.tasks[2].wholeChangeAcceptanceEvidence);
    const gate = execFileSync(process.execPath, [resolve("server/process-stages-live-fixtures/contract-gate.mjs"), loc.manifest, "final", "all"], { encoding: "utf8", windowsHide: true, env: { ...process.env, ORCHESTRATOR_ARTIFACT_WORKSPACE: loc.project } });
    assert.equal(JSON.parse(gate).rawBundleBindings, "passed");
    assert.equal(JSON.parse(gate).completedCells, 4);
    const initial = load(manifest.initialCoverage), final = load(join(loc.project, loc.state, "quality-coverage.json"));
    assert.equal(initial.stats.completed, 384); assert.equal(final.stats.completed, 388);
    assert.equal(initial.stats.openCells, 6488); assert.equal(final.stats.openCells, 6484);
    const original = load(resolve("queues/gis-protocol-diagnosis-b0fd68b4/final-native-replay/replay-report.json"));
    assert.equal(hash(original.record), loc.sourceRecordSha256);
    reports.push({ variant, canonicalRecord: record, sha256: hash(record), statePath: loc.state, nativeRuntime: manifest.runtime, interruption, finalGate: JSON.parse(gate), initialStats: initial.stats, finalStats: final.stats });
  }
  assert.equal(new Set(locations).size, 2); assert.equal(new Set(identities).size, 1); assert.equal(new Set(configurations).size, 4);
  writeFileSync(join(evidence, "live-acceptance.json"), JSON.stringify({ status: "passed", reports }, null, 2) + "\n", { flag: "wx" });
});
