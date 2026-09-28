import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync, execFileSync } from "node:child_process";

const data = await mkdtemp(join(tmpdir(), "orchestrator-project-trust-"));
process.env.ORCHESTRATOR_TEST = "1";
process.env.ORCHESTRATOR_DATA_DIR = data;
const { verificationProcessEnvironment, codexProcessOptions, captureInitialWorkspaceStateV1 } = await import("./index.ts");
test.after(() => rm(data, { recursive: true, force: true }));

test("project trust is exact, process-local and preserves inherited configuration", () => {
  const input = { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "Test" };
  const snapshot = { ...input };
  const env = verificationProcessEnvironment(data, input);
  assert.deepEqual(input, snapshot);
  assert.equal(env.GIT_CONFIG_COUNT, "2");
  assert.equal(env.GIT_CONFIG_KEY_0, "user.name");
  assert.equal(env.GIT_CONFIG_KEY_1, "safe.directory");
  assert.equal(env.GIT_CONFIG_VALUE_1, resolve(data));
  assert.equal(codexProcessOptions(data, input).env.GIT_CONFIG_VALUE_1, resolve(data));
  assert.throws(() => verificationProcessEnvironment(data, { GIT_CONFIG_COUNT: "invalid" }));
});

test("foreign-owner project works only in scoped children, including runner Git calls", async () => {
  const root = await mkdtemp(join(data, "repo-"));
  execFileSync("git", ["init", root], { stdio: "ignore" });
  execFileSync("git", ["-C", root, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--allow-empty", "-m", "fixture"], { stdio: "ignore" });
  const configPath = join(root, ".git", "config");
  const configBefore = await readFile(configPath);
  const env = { ...process.env, GIT_TEST_ASSUME_DIFFERENT_OWNER: "1", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: "" };
  const args = ["-C", root, "rev-parse", "--is-inside-work-tree"];
  const denied = spawnSync("git", args, { env, encoding: "utf8" });
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /dubious ownership/);
  const accepted = spawnSync("git", args, { env: verificationProcessEnvironment(root, env), encoding: "utf8" });
  assert.equal(accepted.status, 0, accepted.stderr);
  const unrelated = spawnSync("git", args, { env: verificationProcessEnvironment(data, env), encoding: "utf8" });
  assert.notEqual(unrelated.status, 0, "Trust must not include descendant repositories");
  const keys = ["GIT_TEST_ASSUME_DIFFERENT_OWNER", "GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0"];
  const saved = keys.map(key => process.env[key]);
  try {
    for (const key of keys) process.env[key] = env[key as keyof typeof env];
    const state = await captureInitialWorkspaceStateV1(root);
    assert.equal(state.mode, "clean");
  } finally {
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
  }
  assert.deepEqual(await readFile(configPath), configBefore);
});
