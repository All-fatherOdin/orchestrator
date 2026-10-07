// Read-only equality gate for a clean verification checkout. This does not
// change the source worktree/index or turn its dirty-state gates into passes.
// node scripts/verify-source-snapshot.mjs SOURCE_ROOT SNAPSHOT_ROOT
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { open, lstat } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";

const [sourceArg, snapshotArg, ...extra] = process.argv.slice(2);
assert.ok(sourceArg && snapshotArg && !extra.length, "Expected source and snapshot roots");
const source = resolve(sourceArg), snapshot = resolve(snapshotArg);
assert.notEqual(source, snapshot, "Snapshot must be a separate checkout");
const git = (root, args) => execFileSync("git", args, { cwd: root, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
const inventory = root => [...new Set(git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"]).split("\0").filter(Boolean))].sort();
const names = inventory(source);
assert.deepEqual(inventory(snapshot), names, "Snapshot tracked/untracked source inventory differs");
assert.equal(git(snapshot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), "", "Snapshot must be clean");
const hash = value => createHash("sha256").update(value).digest("hex");
async function read(root, name) {
  assert.ok(!name.includes("\\") && !isAbsolute(name) && name.split("/").every(p => p && p !== "." && p !== ".."), "Invalid inventory path");
  const path = resolve(root, name), local = relative(root, path);
  assert.ok(local && !isAbsolute(local) && !local.startsWith(".."), "Source escaped its root");
  assert.ok((await lstat(path)).isFile(), "Only regular source files may be compared");
  const file = await open(path, "r");
  try {
    const before = await file.stat({ bigint: true }), bytes = await file.readFile(), after = await file.stat({ bigint: true });
    for (const key of ["ino", "dev", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[key], before[key], "Source changed during comparison");
    assert.ok(before.size === BigInt(bytes.length), "Incomplete source read");
    return hash(bytes);
  } finally { await file.close(); }
}
const hashes = [];
for (const name of names) {
  const sourceHash = await read(source, name);
  assert.equal(await read(snapshot, name), sourceHash, `Snapshot bytes differ: ${name}`);
  hashes.push([name, sourceHash]);
}
assert.deepEqual(inventory(source), names, "Source inventory changed during comparison");
assert.equal(git(snapshot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), "", "Snapshot changed during comparison");
console.log(JSON.stringify({ outcome: "pass", source, snapshot, sourceHead: git(source, ["rev-parse", "HEAD"]).trim(), snapshotHead: git(snapshot, ["rev-parse", "HEAD"]).trim(), files: names.length, inventorySha256: hash(JSON.stringify(hashes)) }));
