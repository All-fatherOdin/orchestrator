import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,mkdir,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
const data=await mkdtemp(join(tmpdir(),"orchestrator-audit-test-"));
process.env.ORCHESTRATOR_TEST="1";process.env.ORCHESTRATOR_DATA_DIR=data;
const {validateTaskQueue,createRun,executeQueue,runTaskVerification,buildReviewerPrompt}=await import("./index.ts");
test.after(()=>rm(data,{recursive:true,force:true,maxRetries:5}));
test("audit gate blocks wrong literals, coverage and prose before reviewer and snapshots the corrected answer",async()=>{
 const root=await mkdtemp(join(tmpdir(),"orchestrator-audit-pipeline-"));
 const saved={bin:process.env.CODEX_BIN,script:process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT,result:process.env.ORCHESTRATOR_RESULT_PATH};
 try{
  const provider=join(root,"provider.cjs");
  const coverage=[{id:'yes-assertion',case:'Exact yes literal assertion in supplied source.txt',status:'covered',evidence:[{path:'source.txt',lines:[1,1]}]}];
  await writeFile(provider,`const fs=require('fs'),path=require('path');let prompt='';process.stdin.on('data',s=>prompt+=s);process.stdin.on('end',()=>{const a=process.argv.slice(2),out=a[a.indexOf('--output-last-message')+1],review=out.includes('-review-'),mode=path.basename(process.cwd());if(review)fs.appendFileSync(path.join(__dirname,'reviews'),path.basename(out)+'\\n');const payload={facts:{yes:mode==='bad'?'✅':'Да'}};if(mode.startsWith('coverage-')){payload.coverage=${JSON.stringify(coverage)};if(mode==='coverage-bad')payload.coverage[0].status='not-covered';}fs.writeFileSync(out,review?'VERDICT: APPROVED':'\`\`\`json\\n'+JSON.stringify(payload)+'\\n\`\`\`\\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED'+(mode==='coverage-prose'?'\\nThis case has no tests.':''));});`);
  process.env.CODEX_BIN=process.execPath;process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT=provider;process.env.ORCHESTRATOR_RESULT_PATH="forged";
  for(const mode of ["good","bad","coverage-good","coverage-bad","coverage-prose"]){
   const project=join(root,mode);await mkdir(project);const source=mode.startsWith('coverage-')?'assert.equal(format(true), "Да");':'yes = "Да"';await writeFile(join(project,"source.txt"),source);
   const contract=JSON.stringify({version:mode.startsWith('coverage-')?2:1,sources:[{path:"source.txt",sha256:createHash('sha256').update(source).digest('hex'),ranges:[[1,1]]}],facts:{yes:"Да"},...(mode.startsWith('coverage-')?{coverage}:{})});await writeFile(join(project,"contract.json"),contract);
   execFileSync("git",["init"],{cwd:project,stdio:"ignore"});execFileSync("git",["add","."],{cwd:project});execFileSync("git",["-c","user.name=Test","-c","user.email=test@localhost","commit","-m","fixture"],{cwd:project,stdio:"ignore"});
   const command=`node "${resolve('scripts/audit-evidence.mjs')}" verify "${join(project,'contract.json')}" "${project}" ${createHash('sha256').update(contract).digest('hex')}`;
   const queue=validateTaskQueue({project:{path:project},review:{enabled:true,maxCorrections:0},tasks:[{key:"audit",title:"Audit",prompt:"Read facts",allowedPaths:[],authorization:{enabled:true,intent:"review",technicalPermission:"read_only",sideEffectRisk:"none"},preconditions:['node -e "if(process.env.ORCHESTRATOR_RESULT_PATH) process.exit(8)"'],verificationCommands:[command]},{key:"next",title:"Next",prompt:"Next",dependsOn:["audit"]}]});
   const run=await createRun(queue);await executeQueue(run);const task=run.tasks[0];
   const good=mode==='good'||mode==='coverage-good';
   assert.equal(task.status,good?'completed':'failed');assert.equal(task.preconditionEvidence?.[0].exitCode,0);
   assert.equal(task.verificationEvidence?.[0].exitCode,good?0:1);
   const reviewLog=await readFile(join(root,'reviews'),'utf8');assert.equal(reviewLog.includes(task.id),good);
   if(mode==='coverage-good')assert.match(task.verificationEvidence?.[0].output??'',/audit-facts-coverage-matched-v2/);
   if(mode==='coverage-bad')assert.match(task.verificationEvidence?.[0].output??'',/AUDIT_COVERAGE_MISMATCH/);
   if(mode==='coverage-prose')assert.match(task.verificationEvidence?.[0].output??'',/AUDIT_UNSTRUCTURED_CLAIM/);
   if(mode==='good'){
    assert.match(buildReviewerPrompt(task,run.project),/untrusted claims/);assert.doesNotMatch(buildReviewerPrompt(task,run.project),/authoritative task outcome/);
    assert.match(buildReviewerPrompt(task,run.project),/contradictions between structured facts/);
    assert.match(buildReviewerPrompt(task,run.project),/not your response format/);
    assert.match(buildReviewerPrompt(task,run.project),/no JSON blocks, no copied facts/);
    assert.match(buildReviewerPrompt(task,run.project),/If approved, return only VERDICT: APPROVED/);
    assert.match(buildReviewerPrompt(task,run.project),/Include every blocking finding/);
    task.finalOutput='```json\n{"facts":{"yes":"wrong"}}\n```';const result=await runTaskVerification(run,task);assert.notEqual(result.code,0);
   }
  }
 }finally{
  for(const [key,value]of Object.entries({CODEX_BIN:saved.bin,ORCHESTRATOR_TEST_CODEX_SCRIPT:saved.script,ORCHESTRATOR_RESULT_PATH:saved.result}))if(value===undefined)delete process.env[key];else process.env[key]=value;
  await rm(root,{recursive:true,force:true,maxRetries:5});
 }
});
