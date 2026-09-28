import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.ORCHESTRATOR_TEST = "1";
const { validateQueue, createRun, executeQueue, authorizeTask, replayTaskAuthorization, codexApplyPermissionPolicy } = await import("./index.ts");

test("Изолированный исполнитель: проверка и ревью предшествуют переносу; отказы сохраняют оригинал", async () => {
  const root = await mkdtemp(join(tmpdir(), "orchestrator-isolated-integration-"));
  const provider = join(root, "provider.cjs");
  const checker = join(root, "check.cjs");
  const publisher = join(root, "publish.cjs");
  await writeFile(provider, `const fs=require('node:fs'),path=require('node:path');let prompt='';process.stdin.on('data',x=>prompt+=x);process.stdin.on('end',()=>{const a=process.argv.slice(2),out=a[a.indexOf('--output-last-message')+1],review=prompt.startsWith('Review only');if(!a.includes('--skip-git-repo-check'))throw Error('isolated repository check flag missing');const stage=process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE,canonical=process.env.ORCHESTRATOR_CANONICAL_PROJECT;if(process.cwd()!==stage)throw Error('cwd not isolated');if(fs.existsSync(path.join(canonical,'result.txt')))throw Error('published before review');if(!review){fs.writeFileSync('result.txt',prompt.includes('BAD_RESULT')?'bad':'42');}else if(prompt.includes('TAMPER_RESULT'))fs.writeFileSync('result.txt','tampered');fs.writeFileSync(out,review?(prompt.includes('REJECT_RESULT')?'VERDICT: CHANGES_REQUESTED':'VERDICT: APPROVED'):'ORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED');});`);
  await writeFile(checker, `const fs=require('node:fs'),assert=require('node:assert/strict');assert.equal(fs.readFileSync('result.txt','utf8'),'42');`);
  await writeFile(publisher, `const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const stage=process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE;assert.equal(path.basename(stage),'sealed');const record=JSON.parse(fs.readFileSync(path.resolve(stage,'../../run.json'),'utf8'));assert.equal(record.tasks[0].status,'running');assert.equal(process.cwd(),process.env.ORCHESTRATOR_CANONICAL_PROJECT);assert.equal(fs.readFileSync(path.join(stage,'result.txt'),'utf8'),'42');fs.copyFileSync(path.join(stage,'result.txt'),'result.txt',fs.constants.COPYFILE_EXCL);if(path.basename(process.cwd())==='FAIL_PUBLICATION')process.exit(9);`);
  const previous = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  process.env.CODEX_BIN = process.execPath;
  process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = provider;
  try {
    for (const mode of ['GOOD_RESULT', 'BAD_RESULT', 'REJECT_RESULT', 'TAMPER_RESULT', 'FAIL_PUBLICATION']) {
      const project = join(root, mode);
      await mkdir(project);
      execFileSync('git', ['init', '-q'], { cwd: project });
      await writeFile(join(project, 'input.txt'), 'original');
      const isolation = { contractType: 'IsolatedArtifactsV1', contractVersion: '1.0', inputPaths: ['input.txt'], publishCommands: [`node "${publisher}"`] };
      const contract = { approvalId: mode, intent: 'apply', technicalPermission: 'reversible_local_write', sideEffectRisk: 'reversible_local_write', allowedPaths: ['result.txt'], impactPaths: { artifacts: ['result.txt'] }, verificationCommands: [`node "${checker}"`], isolatedArtifacts: isolation };
      const task = { key: 'audit', title: mode, prompt: mode, allowedPaths: contract.allowedPaths, impactPaths: contract.impactPaths, isolatedArtifacts: isolation, verificationCommands: contract.verificationCommands, authoringContract: { contractType: 'QueueAuthoringContractV1', contractVersion: '1.0' }, executionKind: { contractType: 'TaskExecutionKindV1', contractVersion: '1.0', kind: 'ordinary' }, runtimeConstraints: ['Only isolated result.txt may be published.'], authorization: { enabled: true, ...Object.fromEntries(['approvalId', 'intent', 'technicalPermission', 'sideEffectRisk'].map(k => [k, contract[k as keyof typeof contract]])) } };
      const queue = validateQueue({ project: { path: project, approvedApplyContracts: [contract] }, limits: { maxParallelTasks: 1, maxTaskRetries: 0 }, review: { enabled: true, maxCorrections: 0 }, git: { checkpointCommits: false }, tasks: [task, { key: 'accept', title: 'Итоговая проверка', prompt: 'Проверить результат', dependsOn: ['audit'], allowedPaths: [], authorization: { enabled: true, intent: 'review', technicalPermission: 'read_only', sideEffectRisk: 'none' } }] });
      const auth = authorizeTask(queue.tasks[0], queue.project);
      assert.equal(auth.decision, 'authorized');
      assert.ok(codexApplyPermissionPolicy(auth).includes('"." = "write"'));
      const changed = structuredClone(queue.tasks[0]);
      changed.isolatedArtifacts!.publishCommands = ['node "other.cjs"'];
      assert.equal(replayTaskAuthorization(auth, changed, queue.project), false);
      const run = createRun(queue);
      // The second task is irrelevant to this task-level boundary fixture.
      run.tasks[1].status = 'skipped';
      await executeQueue(run);
      if (mode === 'GOOD_RESULT') {
        assert.equal(run.tasks[0].status, 'completed', run.tasks[0].log.join('\n'));
        assert.equal(await readFile(join(project, 'result.txt'), 'utf8'), '42');
        assert.equal(run.tasks[0].publicationEvidence?.[0].exitCode, 0);
      } else if (mode === 'FAIL_PUBLICATION') {
        assert.equal(run.tasks[0].status, 'failed');
        assert.equal(run.tasks[0].publicationEvidence?.[0].exitCode, 9);
        assert.equal(await readFile(join(project, 'result.txt'), 'utf8'), '42');
      } else {
        assert.notEqual(run.tasks[0].status, 'completed');
        await assert.rejects(access(join(project, 'result.txt')));
        assert.equal(run.tasks[0].publicationEvidence, undefined);
      }
      assert.equal(await readFile(join(project, 'input.txt'), 'utf8'), 'original');
    }
  } finally {
    if (previous.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = previous.bin;
    if (previous.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = previous.script;
  }
});
