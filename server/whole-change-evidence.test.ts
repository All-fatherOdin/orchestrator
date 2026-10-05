import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
process.env.ORCHESTRATOR_TEST = "1";
process.env.ORCHESTRATOR_DATA_DIR = await mkdtemp(join(tmpdir(), "whole-change-records-"));
const { validateQueue, createRun, prepareWholeChangeAcceptanceEvidence, buildReviewerPrompt } = await import("./index.ts");

async function fixture(count: number) {
  const root = await mkdtemp(join(tmpdir(), "whole-change-count-"));
  execFileSync("git", ["init", root], { stdio: "pipe" });
  const files = Array.from({ length: count }, (_, i) => `file-${i}.txt`);
  const run = createRun(validateQueue({ project: { path: root }, tasks: [
    { key: "writer", title: "Writer", prompt: "Write exact files", allowedPaths: files },
    { key: "accept", title: "Accept", prompt: "Review complete evidence", allowedPaths: [], dependsOn: ["writer"],
      authorization: { enabled: true, intent: "review", technicalPermission: "read_only", sideEffectRisk: "none" },
      wholeChangeAcceptance: { contractType: "WholeChangeAcceptanceV1", contractVersion: "1.0", predecessorTaskKeys: ["writer"] } },
  ] }));
  Object.assign(run.tasks[0], { status: "completed", reviewStatus: "approved", changedFiles: files });
  return { root, files, run, accept: run.tasks[1] };
}

test("whole-change accepts exactly 4096 owned files with a complete bounded external handoff", async () => {
  const f = await fixture(4096);
  for (const file of f.files) await writeFile(join(f.root, file), file);
  const evidence = (await prepareWholeChangeAcceptanceEvidence(f.run, f.accept))!;
  assert.equal(evidence.aggregateChangedFiles.length, 4096);
  assert.equal(evidence.contentEvidence.length, 4096);
  const record = JSON.parse(await readFile(evidence.handoffRecord!.path, "utf8"));
  assert.deepEqual(record.aggregateChangedFiles, [...f.files].sort());
  assert.equal(record.contentEvidence.length, 4096);
  for (const item of record.contentEvidence) assert.equal(item.content, item.path);
  assert.deepEqual(record.predecessorEvidence[0].changedFiles, f.files);
  const prompt = buildReviewerPrompt(f.accept, f.run.project);
  assert.ok(prompt.includes(evidence.handoffRecord!.path));
  assert.ok(Buffer.byteLength(prompt) < 20_000);
  const replay = JSON.parse(JSON.stringify(f.run));
  assert.deepEqual(await prepareWholeChangeAcceptanceEvidence(replay, replay.tasks[1]), evidence);
  await writeFile(join(f.root, f.files[0]), "changed target");
  await assert.rejects(prepareWholeChangeAcceptanceEvidence(replay, replay.tasks[1]), /HANDOFF_CHANGED/);
  await writeFile(join(f.root, f.files[0]), f.files[0]);
  await writeFile(evidence.handoffRecord!.path, "changed");
  await assert.rejects(prepareWholeChangeAcceptanceEvidence(replay, replay.tasks[1]), /HANDOFF_CHANGED/);
});

test("whole-change rejects 4097 paths before reading any owned file", async () => {
  const f = await fixture(4097);
  await assert.rejects(prepareWholeChangeAcceptanceEvidence(f.run, f.accept), /AGGREGATE_INVALID_OR_OVERSIZED/);
  assert.equal(f.accept.wholeChangeAcceptanceEvidence, undefined);
});

test("large unsealed untracked bytes are still rejected instead of replaced by hashes", async () => {
  const f = await fixture(1);
  await writeFile(join(f.root, f.files[0]), "x".repeat(16_385));
  await assert.rejects(prepareWholeChangeAcceptanceEvidence(f.run, f.accept), /CONTENT_OVERSIZED/);
});

test("large isolated bytes require matching current stage, runner seal and successful publication", async () => {
  const f = await fixture(1), owner = f.run.tasks[0];
  owner.isolatedArtifacts = { contractType: "IsolatedArtifactsV1", contractVersion: "1.0", inputPaths: [f.files[0]], publishCommands: ["publisher"] };
  owner.publicationEvidence = [{ command: "publisher", exitCode: 0, timedOut: false, output: "published" }];
  const parent = join(process.env.ORCHESTRATOR_DATA_DIR!, "runs", f.run.id, `${owner.id}-isolated`);
  const stage = join(parent, "workspace"), sealed = join(parent, "sealed");
  await mkdir(stage, { recursive: true });await mkdir(sealed);
  const bytes = "x".repeat(40_000);
  for (const root of [f.root, stage, sealed]) await writeFile(join(root, f.files[0]), bytes);
  const { createHash } = await import("node:crypto");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(parent, "publication-started.json"), JSON.stringify({ stage, files: { [f.files[0]]: sha256 } }));
  const evidence = (await prepareWholeChangeAcceptanceEvidence(f.run, f.accept))!;
  assert.equal(evidence.contentEvidence[0].isolatedArtifactEvidence!.taskId, owner.id);
  assert.equal(evidence.contentEvidence[0].sha256, sha256);
  assert.ok(buildReviewerPrompt(f.accept, f.run.project).includes("SealedArtifactEvidenceV1"));
  await writeFile(join(sealed, f.files[0]), "changed");
  await assert.rejects(prepareWholeChangeAcceptanceEvidence(f.run, f.accept), /ISOLATED_SEAL_CHANGED/);
  await writeFile(join(sealed, f.files[0]), bytes);
  owner.publicationEvidence[0].exitCode = 1;
  await assert.rejects(prepareWholeChangeAcceptanceEvidence(f.run, f.accept), /CONTENT_OVERSIZED/);
});
