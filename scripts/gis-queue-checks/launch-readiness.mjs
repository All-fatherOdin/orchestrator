import { evidenceDirectory } from './evidence-directory.mjs'
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const dir=evidenceDirectory(),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),load=p=>JSON.parse(fs.readFileSync(p));
const b=load(path.join(dir,'deployment-binding.json'));execFileSync(process.execPath,[b.deployedSmokeGate],{windowsHide:true,stdio:'pipe'});
const s=load(path.join(dir,'pilot-acceptance.json')),r=load(s.canonicalRecord);
assert.equal(s.status,'passed');assert.equal(hash(s.canonicalRecord),s.canonicalSha256);
assert.equal(s.backendSha256,b.backendSha256);assert.equal(hash(path.join(dir,'manifest.json')),s.fullManifestSha256);
assert.equal(r.status,'completed');assert.equal(r.tasks.length,2);
assert.deepEqual(r.tasks.map(t=>t.key),['closed-transport-proof','native-limitation-proof']);
for(const t of r.tasks){
  assert.equal(t.status,'completed');assert.equal(t.reviewStatus,'approved');assert.deepEqual(t.allowedPaths,[]);
  assert.equal(t.authorization.technicalPermission,'read_only');assert.ok(t.verificationEvidence.length>0);
  for(const e of t.verificationEvidence){assert.equal(e.exitCode,0);assert.equal(e.timedOut,false);const v=JSON.parse(e.output);assert.equal(v.status,'passed');assert.equal(v.sourcePilot,s.sourcePilotRunId);assert.equal(v.writerStatus,'completed');assert.equal(v.writerReview,'approved');assert.equal(v.nativeStatus,'success');assert.equal(v.completedCoverageCells,0);assert.equal(v.readOnly,true);}
}
assert.equal(hash(s.sourceCanonicalRecord),s.sourceCanonicalSha256);
const source=load(s.sourceCanonicalRecord),writer=source.tasks.find(t=>t.id===s.sourceWriterId);
assert.equal(source.id,s.sourcePilotRunId);assert.equal(source.status,'failed');
assert.equal(writer.status,'completed');assert.equal(writer.reviewStatus,'approved');assert.equal(writer.processProgress.phase,'published');
assert.notEqual(path.resolve(source.project.path),path.resolve(load(path.join(dir,'manifest.json')).projectRoot));
// Replay the accepted pilot in its own manifest root, never the calling writer's staged workspace.
const replayEnv={...process.env};delete replayEnv.ORCHESTRATOR_ARTIFACT_WORKSPACE;delete replayEnv.ORCHESTRATOR_CANONICAL_PROJECT;delete replayEnv.ORCHESTRATOR_PUBLICATION_HOST;
execFileSync(process.execPath,[s.pilotGate],{windowsHide:true,stdio:'pipe',env:replayEnv});
console.log(JSON.stringify({status:'passed',closedAcceptance:r.id,pilot:source.id,writers:1,protocol:'structured-output-v1',backendSha256:b.backendSha256}));
