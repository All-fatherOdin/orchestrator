import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

test("source snapshot gate proves full inventory and rejects dirty, missing and clean changed bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "source-snapshot-gate-")), source = join(root, "source"), snapshot = join(root, "snapshot");
  const script = fileURLToPath(new URL("./verify-source-snapshot.mjs", import.meta.url));
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, windowsHide: true, stdio: "pipe" });
  const commit = cwd => { git(cwd, "add", "--all"); git(cwd, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture"); };
  const check = () => spawnSync(process.execPath, [script, source, snapshot], { windowsHide: true, encoding: "utf8", timeout: 10000 });
  try {
    for (const cwd of [source, snapshot]) { mkdirSync(cwd); git(cwd, "init"); writeFileSync(join(cwd, "a.txt"), "tracked\n"); commit(cwd); }
    // b is untracked in source and tracked in the clean snapshot. Both bytes
    // and inclusion are required, independent of source index membership.
    for (const cwd of [source, snapshot]) writeFileSync(join(cwd, "b.txt"), "untracked\n");
    commit(snapshot);
    const pass = check(); assert.equal(pass.status, 0, pass.stderr); assert.equal(JSON.parse(pass.stdout).files, 2);
    writeFileSync(join(snapshot, "a.txt"), "changed\n");
    const dirty = check(); assert.notEqual(dirty.status, 0); assert.match(dirty.stderr, /Snapshot must be clean/);
    commit(snapshot);
    const changed = check(); assert.notEqual(changed.status, 0); assert.match(changed.stderr, /Snapshot bytes differ: a.txt/);
    writeFileSync(join(snapshot, "a.txt"), "tracked\n"); commit(snapshot);
    writeFileSync(join(source, "c.txt"), "another untracked source\n");
    const missing = check(); assert.notEqual(missing.status, 0); assert.match(missing.stderr, /inventory differs/);
  } finally {
    assert.ok(resolve(root).startsWith(`${resolve(tmpdir())}${sep}`)); rmSync(root, { recursive: true, force: true });
  }
});
