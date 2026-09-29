import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { gisSha, type GisPackageV1 } from "./gis-quality.ts";
process.env.ORCHESTRATOR_TEST = "1";
const data = mkdtempSync(join(tmpdir(), "gis-run-records-"));
process.env.ORCHESTRATOR_DATA_DIR = data;
const { validateQueue, createRun, executeQueue, resumeRun, configureGisLifecycleTestBoundary, loadRun, prepareWholeChangeAcceptanceEvidence } = await import("./index.ts");

function fixture(mode: string) {
  const root = mkdtempSync(join(tmpdir(), "gis-handler-fixture-")), project = join(root, "project"), contracts = join(project, "contracts"), runtime = join(project, "runtime"), state = "projects/gis2-front/operations/state", runPath = "projects/gis2-front/operations/runs/fixture-one";
  for (const p of [contracts, runtime, join(project, state)]) mkdirSync(p, { recursive: true });
  const put = (p: string, v: unknown) => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
  const pin = (p: string) => ({ path: resolve(p), sha256: gisSha(readFileSync(p)) });
  for (const name of ["coverage", "baseline"]) put(join(project, state, `quality-${name}.json`), { completed: 0 });
  put(join(runtime, "config.json"), {}); put(join(contracts, "preflight.json"), {});
  put(join(contracts, "block.json"), {});
  const native = `import fs from 'node:fs';import path from 'node:path';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1],put=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\\n',{flag:'wx'})};if(a[0]==='prepare'){put(v('selection'),{headCommit:'a'.repeat(40),baseCommit:'a'.repeat(40),files:[{path:'one.ts',blobSha:'1'.repeat(40)},{path:'two.ts',blobSha:'2'.repeat(40)}]});put(v('manifest'),{runId:'fixture-one',manifestFingerprint:'b'.repeat(64),createdAt:new Date().toISOString()});}else{const before=JSON.parse(fs.readFileSync(v('coverage')));if(path.dirname(v('coverage'))!==v('state-dir'))throw Error('state path mismatch');const after={completed:before.completed+2};for(const n of ['coverage','baseline'])fs.writeFileSync(v(n),JSON.stringify(after,null,2)+'\\n');put(v('output'),{status:'success',completed:after.completed});fs.writeFileSync(v('output').replace(/\\.json$/,'.md'),'native report\\n',{flag:'wx'});}`;
  writeFileSync(join(runtime, "quality-catch-up-orchestrator.mjs"), native);
  writeFileSync(join(runtime, "profile-bundle-lib.mjs"), `export const scopeFingerprint=()=> 'c'.repeat(64);`);
  writeFileSync(join(runtime, "security-risk-bundle.mjs"), `import fs from 'node:fs';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1],s=JSON.parse(fs.readFileSync(v('scope')));fs.writeFileSync(v('output'),JSON.stringify({profile:'security-risk',bundleFingerprint:'d'.repeat(64),reviewUnits:s.reviewUnits}),{flag:'wx'});`);
  writeFileSync(join(runtime, "validate-profile-analysis.mjs"), `import fs from 'node:fs';import path from 'node:path';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1],r=JSON.parse(fs.readFileSync(v('response')));fs.mkdirSync(path.dirname(v('output')),{recursive:true});fs.writeFileSync(v('output'),JSON.stringify({status:'success',coverageCompletionAllowed:true,limitations:r.limitations}),{flag:'wx'});`);
  put(join(contracts, "scope.json"), { schemaVersion: 1, profile: "security-risk", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile: "one.ts" }, { primaryFile: "two.ts" }] });
  const checker = join(contracts, "check.mjs"), sentinel = join(root, "verify-once");
  writeFileSync(checker, `import fs from 'node:fs';import assert from 'node:assert/strict';${mode === "verify" ? `if(!fs.existsSync(${JSON.stringify(sentinel)})){fs.writeFileSync(${JSON.stringify(sentinel)},'seen');process.exit(75);}` : mode === "deterministic" ? "process.exit(1);" : ""}assert.equal(JSON.parse(fs.readFileSync('projects/gis2-front/operations/state/quality-coverage.json')).completed,2);`);
  const runtimeEvidence = ["config.json", "quality-catch-up-orchestrator.mjs", "profile-bundle-lib.mjs", "security-risk-bundle.mjs", "validate-profile-analysis.mjs"].map(n => ({ path: `runtime/${n}`, sha256: pin(join(runtime, n)).sha256 }));
  const manifest = join(contracts, "manifest.json");
  put(manifest, { projectRoot: project, auditRoot: project, runtime: "runtime", headCommit: "a".repeat(40), preflightSha256: pin(join(contracts, "preflight.json")).sha256, runtimeEvidence, batches: [{ id: "one", run: runPath, profile: "security-risk", blockPath: "block.json", blockSha256: pin(join(contracts, "block.json")).sha256 }] });
  const provider = join(root, "provider.cjs"), reviewerSeen = join(root, "review-once");
  writeFileSync(provider, `const fs=require('node:fs');let p='';process.stdin.on('data',x=>p+=x);process.stdin.on('end',()=>{const a=process.argv.slice(2),out=a[a.indexOf('--output-last-message')+1];if(p.startsWith('Review only')){${mode === "review" ? `if(!fs.existsSync(${JSON.stringify(reviewerSeen)})){fs.writeFileSync(${JSON.stringify(reviewerSeen)},'seen');process.exit(75);}` : ""}fs.writeFileSync(out,'VERDICT: APPROVED');return;}const bundles=p.match(/Read these exact prepared bundle files: (.*?)\. Do not/)[1].split(', ').map(x=>JSON.parse(fs.readFileSync(x)));const responses=bundles.map(b=>({reviewedUnits:b.reviewUnits.map(u=>({primaryFile:u.primaryFile,disposition:'no-finding',summaryRu:'Concrete fixture contract and forbidden counterexample.'})),findings:[],limitations:[]}));fs.writeFileSync(out,'ORCHESTRATOR_GIS_ANALYSIS_V1: '+JSON.stringify({responses})+'\\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED');});`);
  const git = (args: string[]) => execFileSync("git", args, { cwd: project, stdio: "pipe" });
  git(["init", "-q", "-b", "main"]); git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture"]);
  const contract: GisPackageV1 = { contractType: "GISPackageV1", contractVersion: "1.0", manifest: pin(manifest), scopes: [pin(join(contracts, "scope.json"))], gates: [pin(checker)], node: pin(process.execPath), stdio: pin(resolve("scripts/sandbox-file-stdio.cjs")), batchId: "one", stageAttempts: { verification: 2, review: 2, publication: 3 } };
  const isolatedArtifacts = { contractType: "IsolatedArtifactsV1", contractVersion: "1.0", inputPaths: [state], publishCommands: [], ...(mode === "registered" ? { processPackage: { contractType: "ProcessPackageV1", contractVersion: "1.0", handler: "gis-audit", handlerVersion: "1", configuration: contract } } : { gisPackage: contract }) };
  const allowedPaths = [`${runPath}/**`, `${state}/**`], verificationCommands = [`node "${checker}"`], impactPaths = { artifacts: [allowedPaths[0]], state: [allowedPaths[1]] };
  const approval = { approvalId: "gis-fixture", intent: "apply", technicalPermission: "reversible_local_write", sideEffectRisk: "reversible_local_write", isolatedArtifacts, allowedPaths, impactPaths, verificationCommands };
  const queue = validateQueue({ project: { path: project, approvedApplyContracts: [approval] }, limits: { maxParallelTasks: 1, maxTaskRetries: 0 }, review: { enabled: true, maxCorrections: 0 }, git: { checkpointCommits: false }, tasks: [{ key: "one", title: "GIS", prompt: "Analyze exact prepared materials.", authoringContract: { contractType: "QueueAuthoringContractV1", contractVersion: "1.0" }, executionKind: { contractType: "TaskExecutionKindV1", contractVersion: "1.0", kind: "ordinary" }, runtimeConstraints: ["Pinned fixture runtime; native process timeout 300000ms and workspace-root TEMP.", "No executor retries/corrections; same-run bounded continuation."], isolatedArtifacts, allowedPaths, impactPaths, verificationCommands, authorization: { enabled: true, ...Object.fromEntries(["approvalId", "intent", "technicalPermission", "sideEffectRisk"].map(k => [k, approval[k as keyof typeof approval]])) } }, { key: "accept", dependsOn: ["one"], title: "Acceptance", prompt: "Review exact predecessor.", allowedPaths: [], wholeChangeAcceptance: { contractType: "WholeChangeAcceptanceV1", contractVersion: "1.0", predecessorTaskKeys: ["one"] }, authorization: { enabled: true, intent: "review", technicalPermission: "read_only", sideEffectRisk: "none" } }] });
  return { root, project, state, runPath, provider, queue, checker, manifest };
}

test("production GIS lifecycle retains analysis through transient verify/review failure and JSON restart", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const mode of ["verify", "review", "publication", "lost-ack", "deterministic"]) {
      const f = fixture(mode); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      let interrupted = false;
      configureGisLifecycleTestBoundary(async name => {
        if (!interrupted && ((mode === "publication" && name === `publication-file:${f.state}/quality-baseline.json`) || (mode === "lost-ack" && name === "publication-after-effect"))) { interrupted = true; throw new Error("controlled interruption"); }
      });
      const first = createRun(f.queue); await executeQueue(first);
      assert.equal(first.tasks[0].status, "failed", first.tasks[0].log.join("\n"));
      assert.equal(first.tasks[0].executionAttempts, 1);
      assert.ok(first.tasks[0].gisProgress);
      const record = await loadRun(first.id); assert.ok(record);
      assert.deepEqual(record.tasks[0].gisProgress, first.tasks[0].gisProgress);
      if (mode === "deterministic") { assert.throws(() => resumeRun(record), /deterministic/); continue; }
      const resumed = resumeRun(JSON.parse(JSON.stringify(record))); assert.ok(resumed);
      assert.equal(resumed.id, first.id); assert.equal(resumed.tasks[0].id, first.tasks[0].id);
      await executeQueue(resumed);
      assert.equal(resumed.tasks[0].status, "completed", resumed.tasks[0].log.join("\n"));
      assert.equal(resumed.tasks[0].executionAttempts, 1);
      assert.equal(resumed.tasks[0].gisProgress!.attempts.executor, 1);
      assert.equal(resumed.tasks[0].gisProgress!.attempts.verification, mode === "verify" ? 2 : 1);
      assert.equal(resumed.tasks[0].gisProgress!.attempts.review, mode === "review" ? 2 : 1);
      assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 2);
      assert.equal(resumed.tasks[0].gisProgress!.phase, "published");
      assert.ok(existsSync(join(data, "runs", first.id, "run.json")));
    }
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("registered GIS process uses generic persisted progress and same-run continuation", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("registered"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    let stopped = false;
    configureGisLifecycleTestBoundary(async name => { if (name === "finalized" && !stopped) { stopped = true; throw new Error("controlled interruption"); } });
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.tasks[0].processProgress?.phase, "finalized"); assert.equal(run.tasks[0].gisProgress, undefined);
    const persisted = await loadRun(run.id); assert.ok(persisted);
    const resumed = resumeRun(persisted)!; await executeQueue(resumed);
    assert.equal(resumed.status, "completed", resumed.tasks[0].log.join("\n"));
    assert.equal(resumed.tasks[0].processProgress?.phase, "published");
    assert.equal(resumed.tasks[0].executionAttempts, 1);
    assert.equal(resumed.tasks[0].processProgress?.handler.name, "gis-audit");
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("retained GIS result refuses changed artifacts, runtime, inputs, authority and receipts before another executor", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const change of ["artifact", "runtime", "input", "authority", "receipt", "provider"]) {
      const f = fixture("verify"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      const first = createRun(f.queue); await executeQueue(first);
      assert.equal(first.tasks[0].gisProgress?.phase, "finalized", first.tasks[0].log.join("\n"));
      const resumed = resumeRun(JSON.parse(JSON.stringify(first)))!;
      const stage = join(data, "runs", first.id, `${first.tasks[0].id}-isolated`, "workspace");
      if (change === "artifact") writeFileSync(join(stage, f.runPath, "receipt.json"), "changed");
      if (change === "runtime") writeFileSync(join(f.project, "runtime/config.json"), "changed");
      if (change === "input") writeFileSync(join(f.project, f.state, "quality-coverage.json"), "changed");
      if (change === "provider") writeFileSync(f.provider, "changed");
      if (change === "authority") resumed.tasks[0].authorization!.approvalId = "revoked";
      if (change === "receipt") { resumed.tasks[0].gisProgress!.phase = "verified"; resumed.tasks[0].verificationEvidence![0].exitCode = 1; }
      try { await executeQueue(resumed); } catch { /* topology/authority failures can precede task dispatch */ }
      assert.notEqual(resumed.tasks[0].status, "completed");
      assert.equal(resumed.tasks[0].executionAttempts, 1);
      assert.equal(existsSync(join(f.project, f.runPath)), false);
    }
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("large native GIS artifacts have closed whole-change receipts; altered native receipts reject", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("large"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    for (const name of ["coverage", "baseline"]) writeFileSync(join(f.project, f.state, `quality-${name}.json`), JSON.stringify({ completed: 0, retainedFixtureData: "x".repeat(40_000) }));
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.status, "completed", run.tasks.map(t => t.log.join("\n")).join("\n"));
    const handoff = run.tasks[1].wholeChangeAcceptanceEvidence!;
    const large = handoff.contentEvidence.filter(e => e.gisNativeEvidence);
    assert.equal(large.length, 2);
    for (const e of large) { assert.equal(e.gisNativeEvidence!.contractType, "GISNativeArtifactEvidenceV1"); assert.equal(e.gisNativeEvidence!.taskId, run.tasks[0].id); assert.equal(e.sha256, gisSha(readFileSync(join(f.project, e.path)))); assert.ok(e.gisNativeEvidence!.byteLength > 16_384); }
    run.tasks[0].gisProgress!.native[0].exitCode = null;
    await assert.rejects(prepareWholeChangeAcceptanceEvidence(run, run.tasks[1]), /NATIVE_EVIDENCE_CHANGED/);
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
