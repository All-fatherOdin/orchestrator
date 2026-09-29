import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, linkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileGisPublication, gisSha, validateGisPackage, type GisPublicationEntry } from "./gis-quality.ts";
import { validateIsolatedArtifacts } from "./isolated-artifacts.ts";
import { selectProcessPackage, validateProcessPackage } from "./process-handlers.ts";

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
