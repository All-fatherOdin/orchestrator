import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { preparedCorrectionSource, assertClosedCorrectionFailure, reservePreparedCorrection, assertPreparedCorrectionReservation, validatePreparedCorrectionRecovery, assertPrelaunchPredecessor, assertMechanicalManifestCompatibility } from './gis-correction-recovery.ts';
import type { ProcessProgress } from './process-stages.ts';
const hash = (s:string) => createHash('sha256').update(s).digest('hex');
const identity = { runId:'source',taskId:'task',invocationId:'a'.repeat(32),phase:'correction',ordinal:3,mode:'patch',transport:'invocation-mcp-v1' };
function terminal() {
  const message = 'unexpected status 403 Forbidden: blocked, url: https://chatgpt.com/backend-api/codex/responses, cf-ray: abc-FRA';
  const raws = [JSON.stringify({type:'error',message}),JSON.stringify({type:'turn.failed',error:{message}})];
  return {identity,code:1,timedOut:false,cancelled:false,success:false,failure:true,counts:{completed:0,failed:1,errors:1,malformed:0,afterTerminal:0},evidence:raws.map(raw=>({raw,type:JSON.parse(raw).type,bytes:Buffer.byteLength(raw),sha256:hash(raw)}))};
}
function progress() {
  const p = { contractType:'ProcessProgressV1',inputs:{},baseline:{},phase:'prepared',failure:{stage:'prepared',kind:'result-defect'},attempts:{executor:3,verification:2,review:2,publication:0},history:[] } as unknown as ProcessProgress;
  for (const feedback of ['response-2.json: fix fallback','response-2.json: use ASCII hyphen']) {
    p.history.push({stage:'review',result:'changes_requested'});
    p.history.push({stage:'analysis-correction',result:hash(feedback),receipt:{feedback,archived:'archive',artifacts:{}}});
  }
  return p;
}
test('prepared correction recovery retains the last rejected analysis and source reservations', () => {
  const p = progress(), before = JSON.stringify(p);
  assert.equal(preparedCorrectionSource(p).feedback,'response-2.json: use ASCII hyphen');
  assert.equal(JSON.stringify(p),before);
  for (const mutate of [(p:ProcessProgress)=>{p.attempts.executor=2},(p:ProcessProgress)=>{p.attempts.publication=1},(p:ProcessProgress)=>{p.history.at(-2)!.result='approved'},(p:ProcessProgress)=>{p.history.push({stage:'analysis-patch',result:'applied'})},(p:ProcessProgress)=>{p.contractType='legacy' as any},(p:ProcessProgress)=>{p.baseline={extra:'a'.repeat(64)}}]) {
    const p=progress();mutate(p);assert.throws(()=>preparedCorrectionSource(p));
  }
});
test('prepared correction recovery requires closed failure with complete retained 403 diagnostics', () => {
  const state={identity,status:'closed',validations:0};assertClosedCorrectionFailure(terminal(),state,identity);
  for(const mutate of [(t:any)=>{t.timedOut=true},(t:any)=>{t.cancelled=true},(t:any)=>{t.code=2},(t:any)=>{t.counts.errors=2},(t:any)=>{t.evidence[0].sha256='b'.repeat(64)},(t:any)=>{t.evidence[0].raw=JSON.stringify({type:'error',message:'transport failed'});t.evidence[0].bytes=Buffer.byteLength(t.evidence[0].raw);t.evidence[0].sha256=hash(t.evidence[0].raw)}]) {
    const t=terminal();mutate(t);assert.throws(()=>assertClosedCorrectionFailure(t,state,identity));
  }
  assert.throws(()=>assertClosedCorrectionFailure(terminal(),{...state,status:'active'},identity));
  assert.throws(()=>assertClosedCorrectionFailure(terminal(),{...state,validations:1},identity));
});
test('prepared correction reservation survives reload, rejects another owner and has one concurrent winner', async () => {
  const dir=await mkdtemp(join(tmpdir(),'gis-recovery-claim-'));
  try {
    const file=join(dir,'claim.json'),owner={runId:'run',taskId:'task',sourceSha256:'b'.repeat(64),invocationId:identity.invocationId};
    const results=await Promise.allSettled([reservePreparedCorrection(file,owner),reservePreparedCorrection(file,{...owner,runId:'other'})]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    const saved=JSON.parse(await readFile(file,'utf8'));await reservePreparedCorrection(file,saved);
    await assert.rejects(reservePreparedCorrection(file,{...saved,taskId:'new'}),/already reserved/);
    assert.deepEqual(JSON.parse(await readFile(file,'utf8')),saved);
    await assertPreparedCorrectionReservation(file,saved);
    await rm(file);await assert.rejects(assertPreparedCorrectionReservation(file,saved));
    await assert.rejects(readFile(file),'Missing reservation cannot be silently recreated by replay');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('prepared correction opt-in is closed and pins exact source and invocation evidence', () => {
  const v={contractType:'PreparedCorrectionRecoveryV1',contractVersion:'1.0',diagnosticCoverage:'retained-events-manual-v1',sourceSha256:'a'.repeat(64),invocationId:'b'.repeat(32),terminalSha256:'c'.repeat(64),toolsStateSha256:'d'.repeat(64)};
  assert.deepEqual(validatePreparedCorrectionRecovery(v),v);
  assert.throws(()=>validatePreparedCorrectionRecovery({...v,unknown:true}));
  assert.throws(()=>validatePreparedCorrectionRecovery({...v,invocationId:'other'}));
  assert.throws(()=>validatePreparedCorrectionRecovery({...v,diagnosticCoverage:'complete-stream'}));
});
function successorFixture() {
  const previous={contractType:'PreparedCorrectionRecoveryV1',contractVersion:'1.0',diagnosticCoverage:'retained-events-manual-v1',sourceSha256:'a'.repeat(64),invocationId:'b'.repeat(32),terminalSha256:'c'.repeat(64),toolsStateSha256:'d'.repeat(64)};
  const successor={contractType:'PrelaunchSuccessorV1',contractVersion:'1.0',runId:'run-1',taskId:'task-1',canonicalSha256:'e'.repeat(64),reservationSha256:'f'.repeat(64)};
  const binding=validatePreparedCorrectionRecovery({...previous,prelaunchSuccessor:successor,mechanicalCompatibility:{contractType:'GISMechanicalCompatibilityV1',contractVersion:'1.0',manifest:{path:resolveForTest(),sha256:'f'.repeat(64)}}});
  const owner={runId:'run-1',taskId:'task-1',sourceSha256:previous.sourceSha256,invocationId:previous.invocationId};
  const recovery={sourceRunId:'source-1',sourceTaskId:'source-task',preparedCorrection:previous};
  const task:any={id:'task-1',status:'failed',exitCode:1,timedOut:false,startedAt:'2026-10-07T12:00:00Z',finishedAt:'2026-10-07T12:00:01Z',recovery,executionKind:{kind:'recovery'},authorizationEvidence:{decision:'authorized',recovery},preparedCorrectionReservation:owner,preconditions:['deployment','native-before'],preconditionEvidence:[{command:'deployment',exitCode:0,timedOut:false},{command:'native-before',exitCode:1,timedOut:false}]};
  const run:any={id:'run-1',status:'failed',tasks:[task]};
  return {binding,owner,task,run};
}
function resolveForTest(){ return join(tmpdir(),'successor-manifest.json') }
test('prelaunch successor binds a proved unlaunched precondition failure without refunding its owner',()=>{
  const f=successorFixture(),before=JSON.stringify(f);assertPrelaunchPredecessor(f.run,f.task,f.owner,f.binding,'native-before');assert.equal(JSON.stringify(f),before);
  for(const mutate of [(f:any)=>{f.task.agentToolInvocations=[{}]},(f:any)=>{f.task.processProgress={}},(f:any)=>{f.task.executionAttempts=1},(f:any)=>{f.task.verificationEvidence=[{}]},(f:any)=>{f.task.publicationEvidence=[{}]},(f:any)=>{f.task.executionBudgetEvidence=[{}]},(f:any)=>{f.task.reviewStatus='approved'},(f:any)=>{f.task.changedFiles=['output']},(f:any)=>{f.task.timedOut=true},(f:any)=>{f.task.preconditionEvidence[0].exitCode=1},(f:any)=>{f.task.preconditionEvidence.reverse()},(f:any)=>{f.owner.taskId='other'},(f:any)=>{f.run.tasks.push(f.task)},(f:any)=>{f.task.recovery.preparedCorrection.prelaunchSuccessor={}},(f:any)=>{f.task.finishedAt='invalid'}]) {
    const f=successorFixture();mutate(f);assert.throws(()=>assertPrelaunchPredecessor(f.run,f.task,f.owner,f.binding,'native-before'));
  }
  assert.throws(()=>validatePreparedCorrectionRecovery({...f.binding,prelaunchSuccessor:{...f.binding.prelaunchSuccessor,refund:true}}));
});
test('mechanical compatibility allows only current ordered hashes and preserves every native assertion input',()=>{
  const old={projectRoot:'unchanged',batches:[{id:'one'}],mechanicalEvidence:[{path:'code-a',sha256:'a'.repeat(64)},{path:'code-b',sha256:'b'.repeat(64)}]},current=new Map([['code-a','c'.repeat(64)],['code-b','b'.repeat(64)]]),fresh=structuredClone(old);fresh.mechanicalEvidence[0].sha256='c'.repeat(64);
  assertMechanicalManifestCompatibility(old,fresh,current);
  for(const mutate of [(m:any)=>{m.projectRoot='different'},(m:any)=>{m.batches[0].id='other'},(m:any)=>{m.mechanicalEvidence.reverse()},(m:any)=>{m.mechanicalEvidence[0].path='other'},(m:any)=>{m.mechanicalEvidence[0].sha256='d'.repeat(64)},(m:any)=>{m.additional=true}]) {const m=structuredClone(fresh);mutate(m);assert.throws(()=>assertMechanicalManifestCompatibility(old,m,current))}
  assert.throws(()=>assertMechanicalManifestCompatibility(old,old,new Map(old.mechanicalEvidence.map(e=>[e.path,e.sha256]))));
});
