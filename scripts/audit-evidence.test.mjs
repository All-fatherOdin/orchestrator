import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink,truncate} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {loadAuditContract,verifyAuditAnswer,main} from './audit-evidence.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const answer=facts=>'```json\n'+JSON.stringify({facts})+'\n```\nUnverified commentary';
test('audit evidence preserves exact null/zero/whitespace/Unicode and produces only deterministic facts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'audit-facts-'));
 try{
  const source='const yes = "Да";\nconst no = "Нет";\n';await writeFile(join(root,'source.ts'),source);
  const facts={yes:'Да',no:'Нет',missing:null,zero:0,spaced:' true '};
  const contract={version:1,sources:[{path:'source.ts',sha256:hash(source),ranges:[[1,2]]}],facts};
  const file=join(root,'contract.json');await writeFile(file,JSON.stringify(contract));
  const loaded=await loadAuditContract(file,root);const text=answer(facts);
  const result=verifyAuditAnswer(text,loaded);assert.deepEqual(result.facts,facts);assert.equal(result.narrativeStatus,'unverified');assert.equal(result.answerSha256,hash(text));
  const context=await main(['context',file,root]);assert(!/[^\x00-\x7f]/.test(context));assert.deepEqual(JSON.parse(context).sources[0].excerpts[0].lines,source.trimEnd().split('\n'));assert(!context.includes('"facts"'));
  await writeFile(join(root,'answer.md'),text);assert.deepEqual(JSON.parse(await main(['verify',file,root,loaded.contractSha256],{ORCHESTRATOR_RESULT_PATH:join(root,'answer.md')})),result);
  for(const key of Object.keys(facts)){assert.throws(()=>verifyAuditAnswer(answer({...facts,[key]:'wrong'}),loaded),/MISMATCH/);}
  for(const bad of [answer({...facts,yes:'✅'}),answer({...facts,zero:null}),answer({...facts,spaced:'true'}),answer({}),text+text,'```json\n{"facts":{},"facts":'+JSON.stringify(facts)+'}\n```'])assert.throws(()=>verifyAuditAnswer(bad,loaded));
  for(const number of ['1e309','-0','9007199254740993','0.5'])assert.throws(()=>verifyAuditAnswer('```json\n{"facts":{"zero":'+number+'}}\n```',loaded),/AUDIT_NUMBER/);
  await assert.rejects(main(['verify',file,root,'0'.repeat(64)],{}),/CONTRACT_CHANGED/);
  await assert.rejects(main(['verify',file,root,loaded.contractSha256],{}),/RESULT_PATH_MISSING/);
  await symlink(root,join(root,'alias'),process.platform==='win32'?'junction':'dir');
  await writeFile(file,JSON.stringify({...contract,sources:[{...contract.sources[0],path:'alias/source.ts'}]}));
  await assert.rejects(loadAuditContract(file,root),/AUDIT_SYMLINK/);
  await rm(join(root,'alias'));
  await writeFile(file,JSON.stringify(contract));await truncate(join(root,'source.ts'),1024*1024+1);
  await assert.rejects(loadAuditContract(file,root),/AUDIT_SIZE/);await writeFile(join(root,'source.ts'),source);
  for(const sources of [[...contract.sources,...contract.sources],[{...contract.sources[0],ranges:[[1,2],[2,2]]}],[{...contract.sources[0],path:'../source.ts'}],[{...contract.sources[0],path:'src./source.ts'}],[{...contract.sources[0],path:'nul'}],[{...contract.sources[0],ranges:[[0,1]]}]]){
   await writeFile(file,JSON.stringify({...contract,sources}));await assert.rejects(loadAuditContract(file,root));
  }
  await writeFile(file,JSON.stringify(contract));await writeFile(join(root,'source.ts'),'changed');await assert.rejects(loadAuditContract(file,root),/SOURCE_CHANGED/);
  await writeFile(join(root,'source.ts'),source);await writeFile(file,JSON.stringify({...contract,facts:{...facts,yes:'✅'}}));await assert.rejects(main(['verify',file,root,loaded.contractSha256],{ORCHESTRATOR_RESULT_PATH:join(root,'answer.md')}),/CONTRACT_CHANGED/);
 }finally{await rm(root,{recursive:true,force:true});}
});
