import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTests, isolated } from "./test-all.mjs";

test("each isolated test selector binds one exact existing test name", async () => {
  const source = await readFile(new URL("../server/index.test.ts", import.meta.url), "utf8");
  const names = [...source.matchAll(/test\(\s*"([^"]+)"/g)].map(match => match[1]);
  for (const name of isolated) assert.equal(names.filter(candidate => candidate === name).length, 1, name);
});

test("test discovery automatically includes new suites and excludes generated/local queues", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-test-discovery-"));
  try {
    for (const file of ["server/new.test.ts", "new-domain/new.spec.mjs", "src/new.test.tsx", "electron/new.test.cjs", "node_modules/no.test.js", "queues/no.test.ts", "dist/no.test.js"]){
      await mkdir(join(root, file, ".."), { recursive: true });
      await writeFile(join(root, file), "");
    }
    assert.deepEqual(await discoverTests(root), ["electron/new.test.cjs", "new-domain/new.spec.mjs", "server/new.test.ts", "src/new.test.tsx"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
