import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileGisPublication, gisSha, validateGisPackage, gisCompletionStatus, gisCorrectionTargets, applyGisResponsePatches, type GisPublicationEntry } from "./gis-quality.ts";
import { validateIsolatedArtifacts } from "./isolated-artifacts.ts";
import { selectProcessPackage, validateProcessPackage } from "./process-handlers.ts";

test("GIS response patches preserve siblings and reject unknown, duplicate or incomplete targets", () => {
  const responses = ["one.ts", "two.ts", "three.ts"].map(primaryFile => ({ reviewedUnits: [{ primaryFile, summaryRu: "original" }], findings: [], limitations: [] }));
  assert.deepEqual(gisCorrectionTargets("VERDICT: CHANGES_REQUESTED\n- response-1.json: repair the assertion; bundle-0.json is context only.", responses), [1]);
  assert.deepEqual(gisCorrectionTargets("VERDICT: CHANGES_REQUESTED\n- `three.ts`: repair contract.\n- bundle-0.json: fix omitted context.", responses), [0, 2]);
  for (const feedback of ["VERDICT: CHANGES_REQUESTED\n- repair everything", "VERDICT: CHANGES_REQUESTED\n- response-9.json: repair", "VERDICT: CHANGES_REQUESTED", "VERDICT: CHANGES_REQUESTED\n- one.ts contradicts two.ts", "VERDICT: CHANGES_REQUESTED\n- bundle-0.json contradicts bundle-1.json", "VERDICT: CHANGES_REQUESTED\n- two.tsx is wrong"]) assert.throws(() => gisCorrectionTargets(feedback, responses));
  const replacement = { reviewedUnits: [{ primaryFile: "two.ts", summaryRu: "supported corrected contract" }], findings: [], limitations: [] };
  const merged = applyGisResponsePatches(responses, [1], { patches: [{ index: 1, response: replacement }] });
  assert.deepEqual(merged[1], replacement); assert.strictEqual(merged[0], responses[0]); assert.strictEqual(merged[2], responses[2]);
  assert.equal(responses[1].reviewedUnits[0].summaryRu, "original");
  for (const patches of [[], [{ index: 0, response: replacement }], [{ index: 1, response: replacement }, { index: 1, response: replacement }], [{ index: 1, response: { ...replacement, profile: "invented" } }]]) assert.throws(() => applyGisResponsePatches(responses, [1], { patches }));
});

test("GIS completion follows each native validated disposition despite supplemental limitations", () => {
  const validation = { coverageCompletionAllowed: false, limitations: [{ primaryFile: "calendar.ts", code: "missing-runtime-evidence" }], reviewedUnits: [{ primaryFile: "calendar.ts", disposition: "finding" }, { primaryFile: "sibling.ts", disposition: "limitation" }, { primaryFile: "clean.ts", disposition: "no-finding" }] };
  assert.equal(gisCompletionStatus(validation, "calendar.ts"), "completed");
  assert.equal(gisCompletionStatus(validation, "sibling.ts"), "omitted");
  assert.equal(gisCompletionStatus(validation, "clean.ts"), "completed");
  assert.throws(() => gisCompletionStatus(validation, "absent.ts"));
  assert.throws(() => gisCompletionStatus({ reviewedUnits: [{ primaryFile: "x", disposition: "unknown" }] }, "x"));
  assert.throws(() => gisCompletionStatus({ reviewedUnits: [{ primaryFile: "x", disposition: "finding" }, { primaryFile: "x", disposition: "limitation" }] }, "x"));
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "gis-publication-")), project = join(root, "project"), sealed = join(root, "sealed");
  mkdirSync(project); mkdirSync(sealed);
  const paths = ["runs/one/receipt.json", "state/quality-baseline.json", "state/quality-coverage.json"];
  const entries: GisPublicationEntry[] = paths.map((path, i) => ({ path, before: i === 0 ? null : gisSha(`before-${i}`), after: gisSha(`after-${i}`) }));
  for (const [i, path] of paths.entries()) {
    mkdirSync(join(sealed, path, ".."), { recursive: true }); writeFileSync(join(sealed, path), `after-${i}`);
    if (i) { mkdirSync(join(project, path, ".."), { recursive: true }); writeFileSync(join(project, path), `before-${i}`); }
  }
  return { root, project, sealed, entries, allowed: ["runs/one/**", "state/**"], cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("GIS opt-in is closed, bounded, authorization-bindable; legacy contract unchanged", () => {
  const f = { path: join(tmpdir(), "pinned.json"), sha256: "a".repeat(64) };
  const c = { contractType: "GISPackageV1" as const, contractVersion: "1.0" as const, manifest: f, node: f, stdio: f, gates: [f], scopes: [f], batchId: "one", stageAttempts: { verification: 2, review: 2, publication: 3 } };
  assert.deepEqual(validateGisPackage(c), c);
  assert.equal(validateGisPackage({ ...c, analysisTransport: "structured-output-v1" }).analysisTransport, "structured-output-v1");
  for (const analysisTransport of ["unknown", null, undefined]) assert.throws(() => validateGisPackage({ ...c, analysisTransport } as unknown as typeof c));
  assert.deepEqual(validateGisPackage({ ...c, stageAttempts: { ...c.stageAttempts, correction: 2 } }).stageAttempts.correction, 2);
  for (const correction of [-1, 3, 1.5, undefined]) assert.throws(() => validateGisPackage({ ...c, stageAttempts: { ...c.stageAttempts, correction } }));
  assert.throws(() => validateGisPackage({ ...c, stageAttempts: { ...c.stageAttempts, publication: 100 } }));
  assert.throws(() => validateGisPackage({ ...c, command: "arbitrary" } as typeof c));
  assert.throws(() => validateGisPackage({ ...c, scopes: [f, f] }));
  const legacy = { contractType: "IsolatedArtifactsV1" as const, contractVersion: "1.0" as const, inputPaths: ["state"], publishCommands: ["node publish.mjs"] };
  assert.deepEqual(validateIsolatedArtifacts(legacy), legacy);
  assert.deepEqual(validateIsolatedArtifacts({ ...legacy, publishCommands: [], gisPackage: c }).gisPackage, c);
  assert.throws(() => validateIsolatedArtifacts({ ...legacy, gisPackage: c }));
  const processPackage = { contractType: "ProcessPackageV1" as const, contractVersion: "1.0" as const, handler: "gis-audit" as const, handlerVersion: "1" as const, configuration: { ...c, projectConfiguration: { statePath: "domain/state", projectId: "gis2-front" as const } } };
  assert.deepEqual(selectProcessPackage({ processPackage }), processPackage);
  assert.equal(selectProcessPackage({ gisPackage: c })!.handler, "gis-audit");
  assert.equal(selectProcessPackage(), undefined);
  assert.deepEqual(validateIsolatedArtifacts({ ...legacy, publishCommands: [], processPackage }).processPackage, processPackage);
  assert.throws(() => selectProcessPackage({ gisPackage: c, processPackage }));
  assert.throws(() => validateProcessPackage({ ...processPackage, handler: "./untrusted.ts" } as unknown as typeof processPackage));
  assert.throws(() => validateProcessPackage({ ...processPackage, handlerVersion: "2" } as unknown as typeof processPackage));
  assert.throws(() => validateGisPackage({ ...c, projectConfiguration: { statePath: "../state", projectId: "gis2-front" } }));
  assert.throws(() => validateGisPackage({ ...c, projectConfiguration: { statePath: "domain/state", projectId: "other" } } as unknown as typeof c));
});

test("publication interruption at every file/temp boundary resumes only missing writes; duplicate request writes zero", async () => {
  for (const target of ["publication-before-effect", "publication-after-effect", ...["runs/one/receipt.json", "state/quality-baseline.json", "state/quality-coverage.json"].flatMap(p => [`publication-temp:${p}`, `publication-file:${p}`])]) {
    const f = fixture();
    try {
      let stopped = false, applied = 0;
      await assert.rejects(reconcileGisPublication(f.project, f.sealed, f.entries, f.allowed, async () => {}, async name => {
        if (name.startsWith("publication-file:")) applied++;
        if (name === target && !stopped) { stopped = true; throw new Error("controlled interruption"); }
      }), /controlled interruption/);
      const resumed = await reconcileGisPublication(f.project, f.sealed, JSON.parse(JSON.stringify(f.entries)), f.allowed, async () => {});
      assert.equal(applied + resumed.writes, 3, target);
      for (const e of f.entries) assert.equal(gisSha(readFileSync(join(f.project, e.path))), e.after);
      assert.equal((await reconcileGisPublication(f.project, f.sealed, f.entries, f.allowed, async () => {})).writes, 0);
    } finally { f.cleanup(); }
  }
});

test("empty preexisting directory does not prove publication; exact native after bytes do", async () => {
  const f = fixture();
  try {
    mkdirSync(join(f.project, "runs/one"), { recursive: true });
    assert.equal((await reconcileGisPublication(f.project, f.sealed, f.entries, f.allowed, async () => {})).writes, 3);
    assert.equal((await reconcileGisPublication(f.project, f.sealed, f.entries, f.allowed, async () => {})).writes, 0);
  } finally { f.cleanup(); }
});

test("changed canonical or sealed bytes, non-prefix mixed state and authority loss stop before another effect", async () => {
  for (const mode of ["canonical", "sealed", "non-prefix", "authority", "hardlink"]) {
    const f = fixture();
    try {
      if (mode === "canonical") writeFileSync(join(f.project, "state/quality-coverage.json"), "foreign");
      if (mode === "sealed") writeFileSync(join(f.sealed, "state/quality-coverage.json"), "tampered");
      if (mode === "non-prefix") writeFileSync(join(f.project, "state/quality-coverage.json"), "after-2");
      if (mode === "hardlink") linkSync(join(f.project, "state/quality-coverage.json"), join(f.project, "state/other"));
      await assert.rejects(reconcileGisPublication(f.project, f.sealed, f.entries, f.allowed, async () => { if (mode === "authority") throw new Error("authorization revoked"); }));
      assert.equal(existsSync(join(f.project, "runs/one/receipt.json")), false);
      assert.equal(readFileSync(join(f.project, "state/quality-baseline.json"), "utf8"), "before-1");
    } finally { f.cleanup(); }
  }
});
