import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertReviewArtifacts, captureReviewArtifacts, validateReviewArtifacts } from "./review-artifacts.ts";

const declarations = [{ artifactDir: "artifacts", path: "validated/candidate-validation.json" }];
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

test("review artifacts reject ambiguous declarations, aliases, traversal, and extra fields", () => {
  assert.deepEqual(validateReviewArtifacts(declarations), declarations);
  for (const path of ["", "../a", "/a", "C:/a", "a\\b", "a//b", "a/./b", "a/*", "a?", "a[1]", "a:b", "nul", "a.", "a ", "a\n"])
    assert.throws(() => validateReviewArtifacts([{ artifactDir: "artifacts", path }]), /REVIEW_ARTIFACT/);
  for (const artifactDir of ["", "..", "../outside", "/tmp", "C:/temp", "a\\b"])
    assert.throws(() => validateReviewArtifacts([{ artifactDir, path: "file.json" }]), /REVIEW_ARTIFACT/);
  for (const value of [null, [], Array(33).fill(declarations[0]), [...declarations, ...declarations],
    [{ artifactDir: ".", path: "a/b" }, { artifactDir: "a", path: "b" }],
    [{ artifactDir: ".", path: "a" }, { artifactDir: ".", path: "A" }],
    [{ ...declarations[0], sha256: "invented" }], [{ path: "a" }]])
    assert.throws(() => validateReviewArtifacts(value), /REVIEW_ARTIFACT/);
});

test("review artifacts hash empty files and reject oversized files before reading their contents", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-artifact-size-"));
  try {
    const file = join(root, "empty");
    await writeFile(file, "");
    const refs = [{ artifactDir: ".", path: "empty" }];
    assert.equal((await captureReviewArtifacts(root, refs)).files[0].sha256, hash(""));
    await truncate(file, 64 * 1024 * 1024 + 1);
    await assert.rejects(captureReviewArtifacts(root, refs), /SIZE_LIMIT/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("review artifacts bind exact nested bytes and reject missing, changed, reordered, and symlinked evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-artifact-paths-"));
  try {
    await mkdir(join(root, "artifacts/validated"), { recursive: true });
    const correct = '{"valid":true}\n';
    const file = join(root, "artifacts/validated/candidate-validation.json");
    await writeFile(file, correct);
    await writeFile(join(root, "candidate-validation.json"), "root decoy");
    await writeFile(join(root, "artifacts/candidate-validation.json"), "directory decoy");
    const evidence = await captureReviewArtifacts(root, declarations);
    assert.deepEqual(evidence.files, [{ ...declarations[0], repositoryPath: "artifacts/validated/candidate-validation.json", absolutePath: join(evidence.workspacePath, "artifacts/validated/candidate-validation.json"), sha256: hash(correct), sizeBytes: Buffer.byteLength(correct) }]);
    await assertReviewArtifacts(root, declarations, evidence);
    const pair = [...declarations, { artifactDir: ".", path: "candidate-validation.json" }];
    const ordered = await captureReviewArtifacts(root, pair);
    await assert.rejects(assertReviewArtifacts(root, pair, { ...ordered, files: [...ordered.files].reverse() }), /EVIDENCE_CHANGED/);
    await assert.rejects(assertReviewArtifacts(root, declarations, undefined), /EVIDENCE_MISSING/);
    await assert.rejects(assertReviewArtifacts(root, declarations, { ...evidence, workspacePath: root + "-other" }), /EVIDENCE_CHANGED/);
    await assert.rejects(assertReviewArtifacts(root, declarations, { ...evidence, files: [] }), /EVIDENCE_CHANGED/);
    await writeFile(file, '{"valid":false}');
    await assert.rejects(assertReviewArtifacts(root, declarations, evidence), /EVIDENCE_CHANGED/);
    await rm(file);
    await assert.rejects(captureReviewArtifacts(root, declarations), /ENOENT/); // Neither decoy is a substitute.
    await mkdir(file);
    await assert.rejects(captureReviewArtifacts(root, declarations), /NOT_REGULAR/);
    await rm(file, { recursive: true });
    const alternate = join(root, "alternate");
    await mkdir(alternate);
    await writeFile(join(alternate, "candidate-validation.json"), correct);
    await rm(join(root, "artifacts/validated"), { recursive: true });
    await symlink(alternate, join(root, "artifacts/validated"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(captureReviewArtifacts(root, declarations), /NOT_REGULAR/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// These tests exercise the actual executor -> machine gate -> reviewer pipeline.
const data = await mkdtemp(join(tmpdir(), "orchestrator-artifact-runs-"));
process.env.ORCHESTRATOR_TEST = "1";
process.env.ORCHESTRATOR_DATA_DIR = data;
const { validateTaskQueue, createRun, executeQueue, loadRun, retryRun, resumeRun, authorizeTask,
  verifyStoredTaskAuthorization, assertTaskReviewArtifacts, buildReviewerPrompt, prepareWholeChangeAcceptanceEvidence } = await import("./index.ts");
test.after(() => rm(data, { recursive: true, force: true, maxRetries: 5 }));
const authorization = { enabled: true, intent: "review" as const, technicalPermission: "read_only" as const, sideEffectRisk: "none" as const };
function queue(root: string) {
  return { project: { path: root }, review: { enabled: true, maxCorrections: 0 }, tasks: [
    { key: "inspect", title: "Inspect artifact", prompt: "Read the exact validation artifact.", allowedPaths: [], authorization,
      reviewArtifacts: declarations, verificationCommands: ["node verify.cjs"] },
    { key: "next", title: "Next", prompt: "Next", dependsOn: ["inspect"] },
  ] };
}

test("review artifact declarations are authorization-bound, replayable, and require machine gates", () => {
  const input = queue(process.cwd());
  const parsed = validateTaskQueue(input);
  const task = parsed.tasks[0];
  const evidence = authorizeTask(task, parsed.project);
  assert.ok(verifyStoredTaskAuthorization(evidence, task, parsed.project));
  assert.equal(verifyStoredTaskAuthorization(evidence, { ...task, reviewArtifacts: [{ artifactDir: ".", path: "candidate-validation.json" }] }, parsed.project), false);
  assert.equal(verifyStoredTaskAuthorization(evidence, { ...task, reviewArtifacts: undefined }, parsed.project), false);
  for (const change of [{ authorization: undefined }, { verificationMode: "advisory" }, { verificationCommands: [] }, { reviewArtifacts: [] }]) {
    const invalid = structuredClone(input);
    Object.assign(invalid.tasks[0], change);
    assert.throws(() => validateTaskQueue(invalid), /reviewArtifacts|REVIEW_ARTIFACT|advisory verification/);
  }
});

test("review artifacts persist after gates, reach reviewer, and block missing files or mutation during review", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-artifact-integration-"));
  const priorBin = process.env.CODEX_BIN;
  const priorScript = process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT;
  try {
    const provider = join(root, "provider.cjs");
    await writeFile(provider, `const fs=require('node:fs'),path=require('node:path');let prompt='';
process.stdin.on('data',s=>prompt+=s);process.stdin.on('end',()=>{
 const args=process.argv.slice(2);const output=args[args.indexOf('--output-last-message')+1];
 const reviewer=output.includes('-review-');
 if(reviewer){
   if(!prompt.includes('Runner-verified review artifacts')||!prompt.includes('artifacts/validated/candidate-validation.json')||!prompt.includes('${hash('{"valid":true}\n')}'))process.exit(9);
   fs.appendFileSync(path.join(__dirname,path.basename(process.cwd())+'.reviewed'),'reviewed');
   if(path.basename(process.cwd())==='changed')fs.writeFileSync('artifacts/validated/candidate-validation.json','changed during reviewer');
 }
 fs.writeFileSync(output,reviewer?'VERDICT: APPROVED':'ORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED');
});`);
    process.env.CODEX_BIN = process.execPath;
    process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = provider;
    for (const mode of ["valid", "missing", "failed-gate", "changed", "no-review"]) {
      const project = join(root, mode);
      await mkdir(join(project, "artifacts/validated"), { recursive: true });
      await writeFile(join(project, ".gitignore"), "artifacts/\n"); // Hash guard must cover ignored artifacts too.
      await writeFile(join(project, "verify.cjs"), mode === "failed-gate" ? "process.exit(7)" : "console.log('GATE_OK')");
      await writeFile(join(project, "candidate-validation.json"), "decoy");
      if (mode !== "missing") await writeFile(join(project, "artifacts/validated/candidate-validation.json"), '{"valid":true}\n');
      const git = (...args: string[]) => execFileSync("git", ["-C", project, ...args], { stdio: "pipe" });
      git("init"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "add", ".");
      git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "baseline");
      const run = createRun(validateTaskQueue(queue(project)));
      if (mode === "no-review") run.review.enabled = false;
      run.tasks[1].status = "skipped";
      run.tasks[0].reviewArtifactEvidence = { workspacePath: "stale-workspace", files: [] };
      await executeQueue(run);
      const task = run.tasks[0];
      const success = mode === "valid" || mode === "no-review";
      assert.equal(task.status, success ? "completed" : "failed", task.log.join("\n"));
      assert.equal(task.reviewStatus, success ? "approved" : mode === "changed" ? "changes_requested" : undefined);
      const saved = await loadRun(run.id);
      assert.deepEqual(saved?.tasks[0].reviewArtifactEvidence, task.reviewArtifactEvidence);
      assert.deepEqual(saved?.tasks[0].reviewArtifacts, declarations);
      assert.equal(retryRun(run, task).tasks[0].reviewArtifactEvidence, undefined);
      assert.deepEqual(retryRun(run, task).tasks[0].reviewArtifacts, declarations);
      if (!success) {
        assert.equal(resumeRun(run)?.tasks[0].reviewArtifactEvidence, undefined);
        assert.deepEqual(resumeRun(run)?.tasks[0].reviewArtifacts, declarations);
      }
      if (mode === "no-review") {
        assert.equal(task.reviewArtifactEvidence?.files.length, 1);
        await assert.rejects(readFile(join(root, mode + ".reviewed")), /ENOENT/);
      }
      if (mode === "missing" || mode === "failed-gate") {
        assert.equal(task.reviewArtifactEvidence, undefined);
        await assert.rejects(readFile(join(root, mode + ".reviewed")), /ENOENT/);
      }
      if (mode === "valid") {
        assert.match(buildReviewerPrompt(task, run.project), /Do not prepend artifactDir twice/);
        await assertTaskReviewArtifacts(run, task);
        const accept = run.tasks[1];
        accept.allowedPaths = [];
        accept.wholeChangeAcceptance = { contractType: "WholeChangeAcceptanceV1", contractVersion: "1.0", predecessorTaskKeys: ["inspect"] };
        const handoff = await prepareWholeChangeAcceptanceEvidence(run, accept);
        assert.deepEqual(handoff?.predecessorEvidence[0].reviewArtifactEvidence, task.reviewArtifactEvidence);
        await writeFile(join(project, "artifacts/validated/candidate-validation.json"), "changed before reviewer");
        await assert.rejects(assertTaskReviewArtifacts(run, task), /EVIDENCE_CHANGED/);
        await assert.rejects(prepareWholeChangeAcceptanceEvidence(run, accept), /EVIDENCE_CHANGED/);
      }
      if (mode === "changed") assert.match(task.reviewOutput!, /REVIEW_ARTIFACT_EVIDENCE_CHANGED/);
    }
  } finally {
    if (priorBin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = priorBin;
    if (priorScript === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = priorScript;
    await rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
