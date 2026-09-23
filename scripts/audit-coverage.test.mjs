import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadAuditContract,verifyAuditAnswer,main} from './audit-evidence.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const output=(facts,coverage)=>'```json\n'+JSON.stringify({facts,coverage})+'\n```\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED';

test('v2 distinguishes direct filter gaps, existing display coverage and unknown coverage without accepting prose',async()=>{
 const root=await mkdtemp(join(tmpdir(),'audit-coverage-'));
 try {
  const source='expect(display("Отчет")).toBe("Отчет");\nexpect(display("Параметр в отчете")).toBe("Параметр в отчете");\n';
  const file=join(root,'contract.json');await writeFile(join(root,'labels.test.ts'),source);
  const ref=lines=>[{path:'labels.test.ts',lines}];
  const coverage=[
   {id:'display-known',case:'Known localized entity display, in supplied labels.test.ts only',status:'covered',evidence:ref([1,1])},
   {id:'display-unknown',case:'Unknown localized entity display, in supplied labels.test.ts only',status:'covered',evidence:ref([2,2])},
   {id:'filter-direct',case:'Direct filter assertion, in full supplied labels.test.ts only',status:'not-covered',evidence:ref([1,3])},
   {id:'integration',case:'Coverage of other project tests not supplied here',status:'unknown',evidence:ref([1,3])},
  ];
  const contract={version:2,sources:[{path:'labels.test.ts',sha256:hash(source),ranges:[[1,3]]}],facts:{nullValue:null,zero:0,spaced:' true '},coverage};
  const save=async c=>writeFile(file,JSON.stringify(c));await save(contract);const loaded=await loadAuditContract(file,root);
  const text=output(contract.facts,coverage),report=verifyAuditAnswer(text,loaded);
  assert.equal(report.kind,'audit-facts-coverage-matched-v2');assert.equal(report.narrativeStatus,'not-permitted');assert.deepEqual(report.coverage,coverage);
  assert.equal(report.coverageBasis,'owner-authored-expectations');assert.equal(report.answerSha256,hash(text));
  assert(Buffer.byteLength(JSON.stringify(report))<8000);
  const context=JSON.parse(await main(['context',file,root]));assert.equal(context.kind,'audit-context-v2');
  assert.deepEqual(context.coverageCases,coverage.map(({status,...question})=>question));assert(context.coverageCases.every(c=>!('status' in c)));assert(!('facts' in context));
  assert.deepEqual(context.sources[0].excerpts[0].lines,source.split('\n'));
  for(let i=0;i<coverage.length;i++){
   const changed=structuredClone(coverage);changed[i].status=changed[i].status==='covered'?'not-covered':'covered';
   assert.throws(()=>verifyAuditAnswer(output(contract.facts,changed),loaded),/COVERAGE_MISMATCH/);
  }
  for(const wrong of [coverage.slice(1),[...coverage,coverage[0]],[...coverage].reverse(),coverage.map(x=>({...x,case:'All aliases have no tests'})),coverage.map(x=>({...x,evidence:ref([1,1])}))])assert.throws(()=>verifyAuditAnswer(output(contract.facts,wrong),loaded),/COVERAGE_MISMATCH/);
  for(const suffix of ['No aliases have tests.','Удаление по source всегда очищает ключ.','```text\nunverified\n```','ORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED'])assert.throws(()=>verifyAuditAnswer(text+'\n'+suffix,loaded),/UNSTRUCTURED/);
  assert.throws(()=>verifyAuditAnswer('Unverified claim\n'+text,loaded),/UNSTRUCTURED/);
  assert.throws(()=>verifyAuditAnswer(text.replace('ORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED',''),loaded),/UNSTRUCTURED/);
  assert.throws(()=>verifyAuditAnswer(text+text,loaded),/ANSWER_BLOCK/);
  assert.throws(()=>verifyAuditAnswer(text.replace('"coverage":','"coverage":[],"coverage":'),loaded),/DUPLICATE/);
  assert.throws(()=>verifyAuditAnswer(output({...contract.facts,zero:null},coverage),loaded),/FACT_MISMATCH/);
  const resultFile=join(root,'answer.md');await writeFile(resultFile,text);
  assert.deepEqual(JSON.parse(await main(['verify',file,root,loaded.contractSha256],{ORCHESTRATOR_RESULT_PATH:resultFile})),report);
  const mutations=[
   c=>c.coverage=[],c=>c.coverage.push(c.coverage[0]),c=>c.coverage[0].id='../escape',
   c=>c.coverage[0].case='',c=>c.coverage[0].status='partial',c=>c.coverage[0].evidence=[],
   c=>c.coverage[0].evidence[0].path='other.test.ts',c=>c.coverage[0].evidence[0].lines=[0,1],
   c=>c.coverage[0].evidence[0].lines=[1,4],c=>c.coverage[0].evidence[0].lines=[2,1],
   c=>c.coverage[0].evidence.push({lines:[1,1],path:'labels.test.ts'}),
   c=>c.coverage[0].extra=true,c=>c.coverage[0].evidence[0].extra=true,
   c=>c.coverage[0]={'case,evidence':c.coverage[0].case,id:'display-known',status:'covered'},
   c=>c.coverage=Array.from({length:33},(_,i)=>({...c.coverage[0],id:'case-'+i})),
   c=>c.coverage=Array.from({length:20},(_,i)=>({...c.coverage[0],id:'case-'+i,case:'я'.repeat(250)})),
  ];
  for(const mutate of mutations){const c=structuredClone(contract);mutate(c);await save(c);await assert.rejects(loadAuditContract(file,root),/AUDIT_/);}
  await save({...contract,coverage:coverage.map(c=>({...c,status:'unknown'}))});
  await assert.rejects(main(['verify',file,root,loaded.contractSha256],{ORCHESTRATOR_RESULT_PATH:resultFile}),/CONTRACT_CHANGED/);
  await save(contract);await writeFile(join(root,'labels.test.ts'),source+'// changed');await assert.rejects(loadAuditContract(file,root),/SOURCE_CHANGED/);
  assert.equal(await readFile(resultFile,'utf8'),text);
 } finally {await rm(root,{recursive:true,force:true});}
});
