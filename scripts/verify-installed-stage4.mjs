// Read-only deployment/pilot gates. All roots and artifact bindings are explicit.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, relative, isAbsolute } from "node:path";

const args = process.argv.slice(2), options = {};
assert.equal(args.length % 2, 0);
for (let i = 0; i < args.length; i += 2) {
  assert.ok(["--root", "--binding", "--check", "--run", "--kind"].includes(args[i]));
  assert.ok(!Object.hasOwn(options, args[i])); options[args[i]] = args[i + 1];
}
assert.ok(options["--root"] && options["--binding"] && options["--check"]);
const root = resolve(options["--root"]);
const bytes = path => readFileSync(path);
const hash = path => createHash("sha256").update(bytes(path)).digest("hex");
const load = path => JSON.parse(bytes(path).toString("utf8").replace(/^\uFEFF/u, ""));
const binding = load(resolve(options["--binding"]));
assert.equal(binding.version, 1); assert.equal(resolve(binding.sourceRoot), root);
const source = name => {
  assert.ok(!isAbsolute(name) && !name.includes("\\") && name.split("/").every(p => p && p !== "." && p !== ".."));
  const path = resolve(root, name), local = relative(root, path);
  assert.ok(local && !isAbsolute(local) && !local.startsWith("..")); return path;
};
assert.equal(hash(source("scripts/verify-installed-stage4.mjs")), binding.checkerSha256);

async function deployment() {
  assert.ok(binding.assets.length > 0);
  for (const asset of binding.assets) {
    assert.equal(hash(source(asset.source)), asset.sha256, asset.source);
    assert.equal(hash(join(binding.installedResources, asset.installed)), asset.sha256, asset.installed);
  }
  const health = await (await fetch(binding.endpoint + "/api/health")).json();
  assert.equal(health.service, "codex-orchestrator"); assert.equal(health.ok, true);
  assert.equal(health.desktopInstanceToken, binding.desktopInstanceToken);
  const desktop = await (await fetch(binding.endpoint + "/api/desktop-runtime")).json();
  assert.equal(desktop.serverMode, "owned-desktop"); assert.equal(desktop.version, binding.versionString);
  assert.equal(resolve(desktop.dataDirectory), resolve(binding.dataDirectory));
}
function reports(text) {
  return [...text.matchAll(/(?:ℹ|#) tests (\d+)\r?\n(?:ℹ|#) suites \d+\r?\n(?:ℹ|#) pass (\d+)\r?\n(?:ℹ|#) fail (\d+)\r?\n(?:ℹ|#) cancelled \d+\r?\n(?:ℹ|#) skipped (\d+)/gu)]
    .map(match => match.slice(1).map(Number));
}
function sourceAcceptance() {
  for (const item of binding.sources) assert.equal(hash(source(item.path)), item.sha256, item.path);
  for (const item of binding.acceptanceFiles) assert.equal(hash(source(item.path)), item.sha256, item.path);
  const evidence = binding.acceptance;
  for (const name of ["fullExit", "focusedExit", "gisExit", "electronExit"]) assert.equal(load(source(evidence[name])).exitCode, 0);
  assert.deepEqual(reports(bytes(source(evidence.fullLog)).toString("utf8")), [[670, 669, 0, 1], [1, 1, 0, 0], [1, 1, 0, 0]]);
  assert.deepEqual(reports(bytes(source(evidence.focusedLog)).toString("utf8")), [[23, 23, 0, 0]]);
  assert.deepEqual(reports(bytes(source(evidence.gisLog)).toString("utf8")), [[2, 2, 0, 0]]);
  assert.deepEqual(reports(bytes(source(evidence.electronLog)).toString("utf8")), [[26, 26, 0, 0]]);
}
async function receipt() {
  assert.ok(options["--run"] && ["smoke", "pilot"].includes(options["--kind"]));
  const path = resolve(options["--run"]), run = load(path);
  assert.equal(path, resolve(binding.dataDirectory, "runs", run.id, "run.json"));
  assert.equal(run.status, "completed"); assert.equal(run.tasks.length, 2);
  assert.ok(Date.parse(run.startedAt) >= Date.parse(binding.restartedAt));
  for (const task of run.tasks) {
    assert.equal(task.status, "completed"); assert.deepEqual(task.allowedPaths, []);
    assert.equal(task.authorizationEvidence.technicalPermission, "read_only");
    assert.equal(task.authorizationEvidence.decision, "authorized");
    assert.equal(task.executionAttempts, 1); assert.deepEqual(task.changedFiles, []);
    assert.ok(task.verificationEvidence.length > 0);
    for (const evidence of task.verificationEvidence) {
      assert.equal(evidence.exitCode, 0); assert.equal(evidence.timedOut, false);
      const result = JSON.parse(evidence.output.trim()); assert.equal(result.outcome, "pass");
      assert.equal(result.backendSha256, binding.assets.find(a => a.installed === "server.cjs").sha256);
    }
    if (options["--kind"] !== "pilot") continue;
    assert.equal(task.reviewProtocol, "invocation-mcp-v1"); assert.equal(task.reviewTransportRecovery, "once-v1");
    assert.equal(task.reviewStatus, "approved"); assert.equal(task.structuredReviews.length, 1);
    assert.equal(task.reviewTransportRecoveries.length, 1);
    const recovery = task.reviewTransportRecoveries[0]; assert.equal(recovery.state, "closed");
    assert.ok(task.structuredReviewInvocations.length >= 1 && task.structuredReviewInvocations.length <= 2);
    const receipt = task.structuredReviews[0], identity = receipt.identity;
    assert.deepEqual(identity, task.structuredReviewInvocations.at(-1));
    const dir = join(binding.dataDirectory, "runs", run.id, `${task.id}-structured-reviews`, identity.invocationId);
    for (const [file, field] of [["snapshot.json", "snapshotSha256"], ["terminal.json", "terminalSha256"], ["state.json", "closedStateSha256"], ["submitted/verdict.json", "verdictSha256"]])
      assert.equal(hash(join(dir, file)), receipt[field]);
    const terminal = load(join(dir, "terminal.json")); assert.equal(terminal.code, 0);
    assert.equal(terminal.timedOut, false); assert.equal(terminal.cancelled, false);
    assert.equal(load(join(dir, "state.json")).status, "closed");
    assert.equal(load(join(dir, "submitted/verdict.json")).status, "approved");
  }
  await deployment(); sourceAcceptance();
  return { runId: run.id, canonicalSha256: hash(path), reviewerInvocations: run.tasks.map(t => t.structuredReviewInvocations?.length ?? 0) };
}
let details = {};
if (options["--check"] === "deployment") await deployment();
else if (options["--check"] === "source") sourceAcceptance();
else if (options["--check"] === "receipt") details = await receipt();
else assert.fail("Unknown check");
console.log(JSON.stringify({ outcome: "pass", check: options["--check"], backendSha256: binding.assets.find(a => a.installed === "server.cjs").sha256, ...details }));
