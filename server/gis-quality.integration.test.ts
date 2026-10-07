import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync, rmdirSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { gisSha, type GisPackageV1 } from "./gis-quality.ts";
import { reportSchema } from "./agent-report.ts";
process.env.ORCHESTRATOR_TEST = "1";
const data = mkdtempSync(join(tmpdir(), "gis-run-records-"));
process.env.ORCHESTRATOR_DATA_DIR = data;
const { validateQueue, createRun, executeQueue, resumeRun, configureGisLifecycleTestBoundary, loadRun, prepareWholeChangeAcceptanceEvidence, structuredRecoveryReviewTargets, markRunReadyForLaunch, queueRecoveryContractChecks } = await import("./index.ts");

function fixture(mode: string, budget?: "enabled" | "deny", transportCase?: string) {
  const correctionMode = mode.startsWith("correction");
  const root = mkdtempSync(join(tmpdir(), "gis-handler-fixture-")), project = join(root, "project"), contracts = join(project, "contracts"), runtime = join(project, "runtime"), state = "projects/gis2-front/operations/state", runPath = "projects/gis2-front/operations/runs/fixture-one";
  for (const p of [contracts, runtime, join(project, state)]) mkdirSync(p, { recursive: true });
  const put = (p: string, v: unknown) => { mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`); };
  const pin = (p: string) => ({ path: resolve(p), sha256: gisSha(readFileSync(p)) });
  for (const name of ["coverage", "baseline"]) put(join(project, state, `quality-${name}.json`), { completed: 0 });
  put(join(runtime, "config.json"), {}); put(join(contracts, "preflight.json"), {});
  put(join(contracts, "block.json"), {});
  const native = `import fs from 'node:fs';import path from 'node:path';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1],put=(p,x)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\\n',{flag:'wx'})};if(a[0]==='prepare'){put(v('selection'),{headCommit:'a'.repeat(40),baseCommit:'a'.repeat(40),files:[{path:'one.ts',blobSha:'1'.repeat(40)},{path:'two.ts',blobSha:'2'.repeat(40)}]});put(v('manifest'),{runId:'fixture-one',manifestFingerprint:'b'.repeat(64),createdAt:new Date().toISOString()});}else{const before=JSON.parse(fs.readFileSync(v('coverage')));if(path.dirname(v('coverage'))!==v('state-dir'))throw Error('state path mismatch');const after={completed:before.completed+2};for(const n of ['coverage','baseline'])fs.writeFileSync(v(n),JSON.stringify(after,null,2)+'\\n');put(v('output'),{status:'success',completed:after.completed});fs.writeFileSync(v('output').replace(/\\.json$/,'.md'),'native report\\n',{flag:'wx'});}`;
  writeFileSync(join(runtime, "quality-catch-up-orchestrator.mjs"), native);
  writeFileSync(join(runtime, "profile-bundle-lib.mjs"), `export const scopeFingerprint=()=> 'c'.repeat(64);`);
  writeFileSync(join(runtime, "security-risk-bundle.mjs"), `import fs from 'node:fs';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1],s=JSON.parse(fs.readFileSync(v('scope')));fs.writeFileSync(v('output'),JSON.stringify({profile:'security-risk',bundleFingerprint:'d'.repeat(64),rules:['SEC-ONE','SEC-TWO'],reviewUnits:s.reviewUnits.map(u=>({...u,primary:{path:u.primaryFile},completeForProfile:true,signals:[{ruleId:u.primaryFile==='one.ts'?'SEC-ONE':'SEC-TWO'}]}))}),{flag:'wx'});`);
  writeFileSync(join(runtime, "validate-profile-analysis.mjs"), `import fs from 'node:fs';import path from 'node:path';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1],r=JSON.parse(fs.readFileSync(v('response')));fs.mkdirSync(path.dirname(v('output')),{recursive:true});fs.writeFileSync(v('output'),JSON.stringify({status:'success',coverageCompletionAllowed:true,reviewedUnits:r.reviewedUnits,limitations:r.limitations}),{flag:'wx'});`);
  put(join(contracts, "scope.json"), { schemaVersion: 1, profile: "security-risk", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile: "one.ts" }, { primaryFile: "two.ts" }] });
  const checker = join(contracts, "check.mjs"), sentinel = join(root, "verify-once");
  writeFileSync(checker, `import fs from 'node:fs';import assert from 'node:assert/strict';${mode === "verify" ? `if(!fs.existsSync(${JSON.stringify(sentinel)})){fs.writeFileSync(${JSON.stringify(sentinel)},'seen');process.exit(75);}` : mode === "deterministic" ? "process.exit(1);" : ""}assert.equal(JSON.parse(fs.readFileSync('projects/gis2-front/operations/state/quality-coverage.json')).completed,2);`);
  put(join(runtime, "schemas/profile-analysis-response.schema.json"), { type: "object", required: ["reviewedUnits", "findings", "limitations"] });
  const runtimeEvidence = ["schemas/profile-analysis-response.schema.json", "config.json", "quality-catch-up-orchestrator.mjs", "profile-bundle-lib.mjs", "security-risk-bundle.mjs", "validate-profile-analysis.mjs"].map(n => ({ path: `runtime/${n}`, sha256: pin(join(runtime, n)).sha256 }));
  if (transportCase === "tools-schema-missing") runtimeEvidence.splice(0, 1);
  if (mode === "performance") {
    writeFileSync(join(runtime, "performance-regression-bundle.mjs"), readFileSync(join(runtime, "security-risk-bundle.mjs"), "utf8").replace("profile:'security-risk'", "profile:'performance-regression'").replace("bundleFingerprint:'d'.repeat(64)", "bundleFingerprint:s.reviewUnits[0].primaryFile==='one.ts'?'1'.repeat(64):'2'.repeat(64)"));
    writeFileSync(join(runtime, "performance-baseline.mjs"), `import fs from 'node:fs';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1],b=JSON.parse(fs.readFileSync(v('bundle')));fs.writeFileSync(v('output'),JSON.stringify({sourceBundleFingerprint:b.bundleFingerprint,measurements:[]}),{flag:'wx'});`);
    writeFileSync(join(runtime, "validate-profile-analysis.mjs"), `import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1];assert.ok(a.includes('--baseline'),'Performance requires --baseline');const b=JSON.parse(fs.readFileSync(v('bundle'))),baseline=JSON.parse(fs.readFileSync(v('baseline')));assert.equal(baseline.sourceBundleFingerprint,b.bundleFingerprint);assert.deepEqual(baseline.measurements,[]);fs.mkdirSync(path.dirname(v('output')),{recursive:true});fs.writeFileSync(v('output'),JSON.stringify({status:'success',coverageCompletionAllowed:true,reviewedUnits:JSON.parse(fs.readFileSync(v('response'))).reviewedUnits,limitations:[]}),{flag:'wx'});`);
    for (const name of ["performance-regression-bundle.mjs", "performance-baseline.mjs", "validate-profile-analysis.mjs"]) { const existing = runtimeEvidence.find(e => e.path === `runtime/${name}`); if (existing) existing.sha256 = pin(join(runtime, name)).sha256; else runtimeEvidence.push({ path: `runtime/${name}`, sha256: pin(join(runtime, name)).sha256 }); }
    put(join(contracts, "scope.json"), { schemaVersion: 1, profile: "performance-regression", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile: "one.ts" }] });
    put(join(contracts, "scope-two.json"), { schemaVersion: 1, profile: "performance-regression", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile: "two.ts" }] });
  }
  if (mode === "business") {
    writeFileSync(join(runtime, "business-logic-bundle.mjs"), readFileSync(join(runtime, "security-risk-bundle.mjs"), "utf8").replace("profile:'security-risk'", "profile:'business-logic-regression'"));
    runtimeEvidence.push({ path: "runtime/business-logic-bundle.mjs", sha256: pin(join(runtime, "business-logic-bundle.mjs")).sha256 });
    put(join(contracts, "scope.json"), { schemaVersion: 1, profile: "business-logic-regression", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile: "one.ts" }, { primaryFile: "two.ts" }] });
  }
  if (correctionMode) {
    put(join(contracts, "scope.json"), { schemaVersion: 1, profile: "security-risk", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile: "one.ts" }] });
    put(join(contracts, "scope-two.json"), { schemaVersion: 1, profile: "security-risk", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile: "two.ts" }] });
  }
  const manifest = join(contracts, "manifest.json");
  put(manifest, { projectRoot: project, auditRoot: project, runtime: "runtime", headCommit: "a".repeat(40), preflightSha256: pin(join(contracts, "preflight.json")).sha256, runtimeEvidence, batches: [{ id: "one", run: runPath, profile: mode === "performance" ? "performance-regression" : mode === "business" ? "business-logic-regression" : "security-risk", blockPath: "block.json", blockSha256: pin(join(contracts, "block.json")).sha256 }] });
  const provider = join(root, "provider.cjs"), reviewerSeen = join(root, "review-once");
  const reviewCorrection = correctionMode ? `if(${mode === "correction-repeat" ? "true" : `!fs.existsSync(${JSON.stringify(reviewerSeen)})`}){fs.writeFileSync(${JSON.stringify(reviewerSeen)},'seen');fs.writeFileSync(out,'VERDICT: CHANGES_REQUESTED\\n- response-0.json: Correct the supported fixture factual error.');return;}` : "";
  writeFileSync(provider, `const fs=require('node:fs');let p='';process.stdin.on('data',x=>p+=x);process.stdin.on('end',()=>{const a=process.argv.slice(2),out=a[a.indexOf('--output-last-message')+1];if(p.startsWith('Review only')){${mode === "review" ? `if(!fs.existsSync(${JSON.stringify(reviewerSeen)})){fs.writeFileSync(${JSON.stringify(reviewerSeen)},'seen');process.exit(75);}` : ""}${reviewCorrection}fs.writeFileSync(out,'VERDICT: APPROVED');return;}if(p.includes('GIS_CORRECTION_INPUT_V1: ')){const input=JSON.parse(p.split('\\n').find(l=>l.startsWith('GIS_CORRECTION_INPUT_V1: ')).slice('GIS_CORRECTION_INPUT_V1: '.length));const patches=input.responses.map(({index,response})=>({index,response:{...response,reviewedUnits:response.reviewedUnits.map(u=>({...u,summaryRu:'Corrected fixture contract and forbidden counterexample.'}))}}));fs.writeFileSync(out,'ORCHESTRATOR_GIS_ANALYSIS_PATCH_V1: '+JSON.stringify({patches})+'\\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED');return;}const bundles=p.match(/Read these exact prepared bundle files: (.*?)\. Do not/)[1].split(', ').map(x=>JSON.parse(fs.readFileSync(x)));const responses=bundles.map(b=>({reviewedUnits:b.reviewUnits.map(u=>({primaryFile:u.primaryFile,disposition:'no-finding',summaryRu:p.includes('Independent reviewer feedback')?'Corrected fixture contract and forbidden counterexample.':'Concrete fixture contract and forbidden counterexample.'})),findings:[],limitations:[]}));fs.writeFileSync(out,'ORCHESTRATOR_GIS_ANALYSIS_V1: '+JSON.stringify({responses})+'\\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED');});`);
  if (transportCase) {
    let originalProvider = readFileSync(provider, "utf8");
    if (["supported-rule", "unsupported-rule", "sibling-rule", "unsupported-patch-rule"].includes(transportCase)) {
      const ruleId = transportCase === "supported-rule" ? "SEC-ONE" : transportCase === "sibling-rule" ? "SEC-TWO" : "SEC-UNSUPPORTED";
      const setFinding = `response.reviewedUnits[0].disposition='finding';response.findings=[{primaryFile:'one.ts',ruleId:${JSON.stringify(ruleId)}}];`;
      if (transportCase === "unsupported-patch-rule") originalProvider = originalProvider.replace("fs.writeFileSync(out,'ORCHESTRATOR_GIS_ANALYSIS_PATCH_V1: '", `{const response=patches[0].response;${setFinding}}fs.writeFileSync(out,'ORCHESTRATOR_GIS_ANALYSIS_PATCH_V1: '`);
      else originalProvider = originalProvider.replace("fs.writeFileSync(out,'ORCHESTRATOR_GIS_ANALYSIS_V1: '", `{const response=responses[0];${setFinding}}fs.writeFileSync(out,'ORCHESTRATOR_GIS_ANALYSIS_V1: '`);
      originalProvider = originalProvider.replace("const bundles=p.match", "const constraints=JSON.parse(p.split('\\n').find(l=>l.startsWith('GIS_FINDING_RULE_CONSTRAINTS_V1: ')).slice('GIS_FINDING_RULE_CONSTRAINTS_V1: '.length));assert.deepEqual(constraints[0].reviewUnits[0],{primaryFile:'one.ts',allowedFindingRuleIds:['SEC-ONE']});assert.ok(p.includes('Never relabel a finding'));const bundles=p.match");
    }
    writeFileSync(provider, `const assert=require('node:assert/strict');const reportFs=require('node:fs');const originalWrite=reportFs.writeFileSync;reportFs.writeFileSync=function(file,value,...rest){const a=process.argv.slice(2),schema=a.indexOf('--output-schema');if(schema<0)return originalWrite.call(this,file,value,...rest);assert.deepEqual(JSON.parse(reportFs.readFileSync(a[schema+1])),${JSON.stringify(reportSchema())});let text=String(value),payload,mode;if(text.startsWith('ORCHESTRATOR_GIS_ANALYSIS_PATCH_V1: ')){mode='patch';payload=JSON.parse(text.split('\\n')[0].slice('ORCHESTRATOR_GIS_ANALYSIS_PATCH_V1: '.length));}else{mode='full';payload=JSON.parse(text.split('\\n')[0].slice('ORCHESTRATOR_GIS_ANALYSIS_V1: '.length));}const scenario=${JSON.stringify(transportCase)};if(scenario==='native-invalid'){payload.responses[0].reviewedUnits[0].disposition='invalid';}if(scenario==='tail'){payload.responses[0].reviewedUnits[0].summaryRu='я'.repeat(25001)+' tail-contract';}if(scenario==='extra')payload.extra=[];if(scenario==='technical')payload.responses[0].schemaVersion=1;if(mode==='patch'&&scenario==='extra-target')payload.patches.push({index:99,response:payload.patches[0].response});if(mode==='patch'&&scenario==='duplicate-target')payload.patches.push(payload.patches[0]);if(mode==='patch'&&scenario==='missing-target')payload.patches=[];let envelope={protocolVersion:'structured-output-v1',outcome:'completed',mode,reason:'',payloadJson:JSON.stringify(payload)};if(scenario==='stopped')Object.assign(envelope,{outcome:'stopped',reason:'Cannot finish',payloadJson:''});if(scenario==='wrong-mode')envelope.mode='patch';if(scenario==='malformed')envelope.payloadJson='{';if(scenario==='duplicate-inner')envelope.payloadJson='{"responses":[],"responses":[]}';let result=JSON.stringify(envelope);if(scenario==='duplicate-outer')result='{"mode":"full",'+result.slice(1);if(scenario==='oversize')result+=' '.repeat(1048577);originalWrite.call(this,file,result,...rest);console.log(JSON.stringify({type:'item.completed',item:{id:'report',type:'agent_message',text:result}}));if(scenario==='failed')console.log(JSON.stringify({type:'turn.failed',error:{message:'failed'}}));else if(scenario==='error')console.log(JSON.stringify({type:'error',message:'failed'}));else if(scenario!=='partial')console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:1,output_tokens:1}}));if(scenario==='nonzero')process.exitCode=1;};\n${originalProvider}`);
    if (transportCase === "native-invalid") {
      writeFileSync(join(runtime, "validate-profile-analysis.mjs"), "process.stderr.write('native invalid disposition');process.exit(1);");
      runtimeEvidence.find(e => e.path === "runtime/validate-profile-analysis.mjs")!.sha256 = pin(join(runtime, "validate-profile-analysis.mjs")).sha256;
      const manifestValue = JSON.parse(readFileSync(manifest, "utf8")); manifestValue.runtimeEvidence = runtimeEvidence; put(manifest, manifestValue);
    }
  }
  const git = (args: string[]) => execFileSync("git", args, { cwd: project, stdio: "pipe" });
  git(["init", "-q", "-b", "main"]); git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-m", "fixture"]);
  const contract: GisPackageV1 = { contractType: "GISPackageV1", contractVersion: "1.0", manifest: pin(manifest), scopes: [pin(join(contracts, "scope.json"))], gates: [pin(checker)], node: pin(process.execPath), stdio: pin(resolve("scripts/sandbox-file-stdio.cjs")), batchId: "one", stageAttempts: { verification: 2, review: 2, publication: 3 } };
  if (transportCase) contract.analysisTransport = "structured-output-v1";
  if (transportCase?.startsWith("tools-")) {
    contract.agentTools = "invocation-mcp-v1";
    if (transportCase === "tools-native-error") {
      writeFileSync(join(runtime, "validate-profile-analysis.mjs"), `import fs from 'node:fs';const a=process.argv.slice(2),out=a[a.indexOf('--output')+1];fs.writeFileSync(out,JSON.stringify({status:'rejected',rejectionsRu:['reviewedUnits[0].summaryRu недостаточно конкретен']}));process.exitCode=4;`);
      runtimeEvidence.find(e => e.path === "runtime/validate-profile-analysis.mjs")!.sha256 = pin(join(runtime, "validate-profile-analysis.mjs")).sha256;
      const manifestValue = JSON.parse(readFileSync(manifest, "utf8")); manifestValue.runtimeEvidence = runtimeEvidence; put(manifest, manifestValue); contract.manifest = pin(manifest);
    }
    writeFileSync(provider, `const fs=require('node:fs'),assert=require('node:assert/strict');let p='';process.stdin.on('data',x=>p+=x);process.stdin.on('end',async()=>{try{const a=process.argv.slice(2),out=a[a.indexOf('--output-last-message')+1];if(p.startsWith('Review only')){${reviewCorrection}fs.writeFileSync(out,'VERDICT: APPROVED');return;}const c=a.find(x=>x.startsWith('mcp_servers.orchestrator_report='));assert.ok(c);const url=/url="([^"]+)"/.exec(c)[1];const call=async(name,args)=>{const r=await(await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.ORCHESTRATOR_REPORT_MCP_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})})).json();return r.result.isError?{error:JSON.parse(r.result.content[0].text).error}:JSON.parse(r.result.content[0].text);};const bundles=p.match(/Read these exact prepared bundle files: (.*?)\\. Do not/)[1].split(', ').map(x=>JSON.parse(fs.readFileSync(x)));const evidence=await call('read_evidence',{evidenceId:'bundle-0',startLine:1,endLine:200});assert.equal(evidence.evidenceId,'bundle-0');const schema=await call('read_evidence',{evidenceId:'report-schema',startLine:1,endLine:200});assert.equal(schema.evidenceId,'report-schema');assert.deepEqual(JSON.parse(schema.text).required,['reviewedUnits','findings','limitations']);assert.equal(typeof evidence.sourceSha256,'string');let payload,mode;if(p.includes('GIS_CORRECTION_INPUT_V1: ')){const input=JSON.parse(p.split('\\n').find(l=>l.startsWith('GIS_CORRECTION_INPUT_V1: ')).slice('GIS_CORRECTION_INPUT_V1: '.length));mode='patch';payload={patches:input.responses.map(({index,response})=>({index,response:{...response,reviewedUnits:response.reviewedUnits.map(u=>({...u,summaryRu:'Corrected fixture contract and forbidden counterexample.'}))}}))};}else{mode='full';payload={responses:bundles.map(b=>({reviewedUnits:b.reviewUnits.map(u=>({primaryFile:u.primaryFile,disposition:'no-finding',summaryRu:'Concrete fixture contract and forbidden counterexample.'})),findings:[],limitations:[]}))};}const scenario=${JSON.stringify(transportCase)};if(scenario==='tools-rule'){payload.responses[0].findings=[{primaryFile:'one.ts',ruleId:'SEC-TWO'}];}const payloadJson=JSON.stringify(payload);const validation=await call('validate_report',{payloadJson});if(scenario==='tools-rule'){assert.deepEqual(validation.errors,[{responseIndex:0,primaryFile:'one.ts',field:'findings[0].ruleId',code:'RULE_NOT_ELIGIBLE'}]);}else assert.deepEqual(validation,{valid:true,errors:[]});if(scenario==='tools-rule'||scenario==='tools-repeat'){const repeated=await call('validate_report',{payloadJson:scenario==='tools-rule'?payloadJson:JSON.stringify({responses:[]})});if(scenario==='tools-rule')assert.equal(repeated.error,'REPEATED_VALIDATION_ERROR');fs.writeFileSync(out,JSON.stringify({outcome:'stopped',reason:'draft rejected'}));}else{if(scenario!=='tools-unsubmitted'){const submitted=await call(mode==='patch'?'patch_report':'submit_report',{payloadJson});assert.equal(submitted.submitted,true);assert.equal(submitted.receipt.mode,mode);const again=await call(mode==='patch'?'patch_report':'submit_report',{payloadJson});assert.deepEqual(again,submitted);}fs.writeFileSync(out,JSON.stringify({outcome:scenario==='tools-stopped'?'stopped':'completed',reason:scenario==='tools-stopped'?'agent stopped':''}));}fs.writeFileSync(${JSON.stringify(join(root, "tools-ready"))},'ready');if(scenario==='tools-cancel'||scenario==='tools-timeout')setTimeout(()=>{},scenario==='tools-timeout'?65000:1000);if(scenario==='tools-valid')for(const n of [2,3,4,5])console.log(JSON.stringify({type:'error',message:'Reconnecting... '+n+'/5 (unexpected status 403 Forbidden: <html>, url: wss://chatgpt.com/backend-api/codex/responses, cf-ray: a464142dfabde955-DME)'}));if(scenario==='tools-error')console.log(JSON.stringify({type:'error',message:'unrecoverable provider error'}));if(scenario!=='tools-partial')console.log(JSON.stringify({type:scenario==='tools-failed'?'turn.failed':'turn.completed',usage:{input_tokens:1,output_tokens:1}}));if(scenario==='tools-nonzero')process.exitCode=1;}catch(e){console.error(e);process.exitCode=1;}});`);
  }
  if (correctionMode) contract.stageAttempts = { verification: 3, review: 3, publication: 3, correction: 2 };
  if (mode === "performance" || correctionMode) contract.scopes.push(pin(join(contracts, "scope-two.json")));
  const isolatedArtifacts = { contractType: "IsolatedArtifactsV1", contractVersion: "1.0", inputPaths: [state], publishCommands: [], ...(mode === "registered" || mode === "performance" || mode === "business" || correctionMode ? { processPackage: { contractType: "ProcessPackageV1", contractVersion: "1.0", handler: "gis-audit", handlerVersion: "1", configuration: contract } } : { gisPackage: contract }) };
  const allowedPaths = [`${runPath}/**`, `${state}/**`], verificationCommands = [`node "${checker}"`], impactPaths = { artifacts: [allowedPaths[0]], state: [allowedPaths[1]] };
  const approval = { approvalId: "gis-fixture", intent: "apply", technicalPermission: "reversible_local_write", sideEffectRisk: "reversible_local_write", isolatedArtifacts, allowedPaths, impactPaths, verificationCommands };
  const queue = validateQueue({ project: { path: project, approvedApplyContracts: [approval] }, limits: { maxParallelTasks: 1, maxTaskRetries: 0 }, review: { enabled: true, maxCorrections: correctionMode ? 2 : 0 }, git: { checkpointCommits: false }, tasks: [{ key: "one", title: "GIS", prompt: "Analyze exact prepared materials.", authoringContract: { contractType: "QueueAuthoringContractV1", contractVersion: "1.0" }, executionKind: { contractType: "TaskExecutionKindV1", contractVersion: "1.0", kind: "ordinary" }, runtimeConstraints: ["Pinned fixture runtime; native process timeout 300000ms and workspace-root TEMP.", correctionMode ? "At most two analysis corrections; preserve rejected artifacts and rerun verification and independent review." : "No executor retries/corrections; same-run bounded continuation."], isolatedArtifacts, allowedPaths, impactPaths, verificationCommands, ...(budget ? { executionBudget: { contractType: "ExecutionBudgetPolicyV1", contractVersion: "1.0", budgetId: "process-correction-budget", maxProviderInvocations: budget === "deny" ? 2 : 4, phaseCaps: budget === "deny" ? { executor: 1, reviewer: 1, correction: 0 } : { executor: 1, reviewer: 2, correction: 1 } } } : {}), authorization: { enabled: true, ...Object.fromEntries(["approvalId", "intent", "technicalPermission", "sideEffectRisk"].map(k => [k, approval[k as keyof typeof approval]])) } }, { key: "accept", dependsOn: ["one"], title: "Acceptance", prompt: "Review exact predecessor.", allowedPaths: [], wholeChangeAcceptance: { contractType: "WholeChangeAcceptanceV1", contractVersion: "1.0", predecessorTaskKeys: ["one"] }, authorization: { enabled: true, intent: "review", technicalPermission: "read_only", sideEffectRisk: "none" } }] });
  return { root, project, state, runPath, provider, queue, checker, manifest };
}

// Five separate scopes make exact [3,4] correction and three byte-preserved
// siblings observable through the production process and persisted restart.
function structuredCorrectionFixture() {
  const f = fixture("correction", undefined, "tools-valid");
  const config = f.queue.tasks[0].isolatedArtifacts!.processPackage!.configuration;
  const manifest = JSON.parse(readFileSync(f.manifest, "utf8"));
  const names = ["one.ts", "two.ts", "three.ts", "four.ts", "five.ts"];
  const native = join(f.project, "runtime/quality-catch-up-orchestrator.mjs");
  let script = readFileSync(native, "utf8");
  script = script.replace("files:[{path:'one.ts',blobSha:'1'.repeat(40)},{path:'two.ts',blobSha:'2'.repeat(40)}]", `files:${JSON.stringify(names.map((path, i) => ({ path, blobSha: String(i + 1).repeat(40) })))}`);
  script = script.replace("before.completed+2", "before.completed+5");
  script = script.replace("{status:'success',completed:after.completed}", "{status:'success',completed:after.completed,checks:[{status:'passed'}],verification:{status:'passed',verificationLevel:'fixture-native-finalizer'}}");
  writeFileSync(native, script);
  manifest.runtimeEvidence.find((entry: { path: string }) => entry.path === "runtime/quality-catch-up-orchestrator.mjs").sha256 = gisSha(readFileSync(native));
  writeFileSync(f.manifest, JSON.stringify(manifest));
  config.manifest.sha256 = gisSha(readFileSync(f.manifest));
  config.scopes = names.map((primaryFile, i) => {
    const path = join(f.project, `contracts/structured-scope-${i}.json`);
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, profile: "security-risk", headCommit: "a".repeat(40), reviewUnits: [{ primaryFile }] }));
    return { path, sha256: gisSha(readFileSync(path)) };
  });
  writeFileSync(f.checker, readFileSync(f.checker, "utf8").replace(".completed,2)", ".completed,5)"));
  config.gates[0].sha256 = gisSha(readFileSync(f.checker));
  const seen = join(f.root, "structured-review-seen");
  const reviewer = `
if(p.startsWith('Independently review the host-owned immutable evidence.')){
  const c=a.find(x=>x.startsWith('mcp_servers.orchestrator_review='));assert.ok(c);
  const url=/url="([^"]+)"/.exec(c)[1];
  const call=async(name,args)=>{const r=await(await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+process.env.ORCHESTRATOR_REPORT_MCP_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})})).json();assert.equal(r.result.isError,undefined,JSON.stringify(r));return JSON.parse(r.result.content[0].text)};
  const identity=JSON.parse(p.split('\\n').find(l=>l.startsWith('Identity: ')).slice(10));
  const snapshotSha256=p.split('\\n').find(l=>l.startsWith('Snapshot SHA256: ')).slice(17);
  const evidence=JSON.parse(p.split('\\n').find(l=>l.startsWith('Evidence: ')).slice(10));
  const first=!fs.existsSync(${JSON.stringify(seen)}),remarks=[];
  await call('read_evidence',{evidenceId:'context',startLine:1,endLine:200});
  if(first)for(const index of [3,4]){const e=evidence.find(e=>e.responseIndex===index);assert.ok(e);await call('read_evidence',{evidenceId:e.id,startLine:1,endLine:200});remarks.push({evidenceId:e.id,field:'reviewedUnits[0].summaryRu',category:'correctness',message:'Correct the supported fixture factual error.',responseIndex:index})}
  const payloadJson=JSON.stringify({protocolVersion:'invocation-mcp-v1',invocationId:identity.invocationId,snapshotSha256,status:first?'changes_requested':'approved',reason:first?'Correct responses 3 and 4.':'',remarks});
  await call('submit_verdict',{payloadJson});fs.writeFileSync(${JSON.stringify(seen)},'seen');
  fs.writeFileSync(out,JSON.stringify({outcome:'completed',reason:''}));console.log(JSON.stringify({type:'turn.completed'}));return;
}
`;
  let provider = readFileSync(f.provider, "utf8");
  provider = provider.replace("let p='';", "if(process.argv.includes('list')){console.log('[]');process.exit(0)}let p='';");
  provider = provider.replace("if(p.startsWith('Review only'))", reviewer + "if(p.startsWith('Review only'))");
  // Whole-change's legacy reviewer approves; only the structured writer emits
  // changes_requested, so prose cannot accidentally supply its targets.
  provider = provider.replace(/if\(p\.startsWith\('Review only'\)\)\{.*?fs\.writeFileSync\(out,'VERDICT: APPROVED'\);return;\}/u, "if(p.startsWith('Review only')){fs.writeFileSync(out,'VERDICT: APPROVED');return;}");
  writeFileSync(f.provider, provider);
  f.queue.tasks[0].reviewProtocol = "invocation-mcp-v1";
  f.queue.project.approvedApplyContracts![0].reviewProtocol = "invocation-mcp-v1";
  f.queue.project.approvedApplyContracts![0].isolatedArtifacts = structuredClone(f.queue.tasks[0].isolatedArtifacts);
  f.queue = validateQueue(f.queue);
  return f;
}

function structuredTransportFixture(mode: string) {
  const f = structuredCorrectionFixture(), config = f.queue.tasks[0].isolatedArtifacts!.processPackage!.configuration;
  config.scopes = config.scopes.slice(0, 2);
  const native = join(f.project, "runtime/quality-catch-up-orchestrator.mjs");
  writeFileSync(native, readFileSync(native, "utf8").replace("before.completed+5", "before.completed+2").replace(/files:\[[^\]]+\]/u, `files:${JSON.stringify(["one.ts", "two.ts"].map((path, i) => ({ path, blobSha: String(i + 1).repeat(40) })))}`));
  const manifest = JSON.parse(readFileSync(f.manifest, "utf8"));
  manifest.runtimeEvidence.find((e: { path: string }) => e.path === "runtime/quality-catch-up-orchestrator.mjs").sha256 = gisSha(readFileSync(native));
  writeFileSync(f.manifest, JSON.stringify(manifest)); config.manifest.sha256 = gisSha(readFileSync(f.manifest));
  writeFileSync(f.checker, readFileSync(f.checker, "utf8").replace(".completed,5)", ".completed,2)")); config.gates[0].sha256 = gisSha(readFileSync(f.checker));
  const counter = join(f.root, "transport-review-count");
  let provider = readFileSync(f.provider, "utf8");
  provider = provider.replace(/const first=!fs\.existsSync\([^\n]*\),remarks=\[\];/u, "const first=false,remarks=[];");
  const failure = `for(let i=1;i<=5;i++)console.log(JSON.stringify({type:'error',message:'Reconnecting... '+i+'/5 (unexpected status 403 Forbidden: <html>, url: wss://chatgpt.com/backend-api/codex/responses, cf-ray: abc-DME)'}));console.log(JSON.stringify({type:'turn.failed'}));process.exitCode=1;return;`;
  provider = provider.replace("  const c=a.find", `  const counter=${JSON.stringify(counter)};const reviewNumber=fs.existsSync(counter)?Number(fs.readFileSync(counter))+1:1;fs.writeFileSync(counter,String(reviewNumber));${["submitted-failed", "correction"].includes(mode) ? "" : `if(reviewNumber===1||${mode === "twice"}){${failure}}`}\n  const c=a.find`);
  if (mode === "correction") provider = provider.replace("const first=false,remarks=[];", "const first=reviewNumber===1,remarks=[];").replace("for(const index of [3,4])", "for(const index of [0])");
  if (mode === "submitted-failed") provider = provider.replace("  await call('submit_verdict',{payloadJson});", `  await call('submit_verdict',{payloadJson});if(reviewNumber===1){${failure}}`);
  writeFileSync(f.provider, provider);
  f.queue.tasks[0].reviewTransportRecovery = "once-v1";
  f.queue.project.approvedApplyContracts![0].reviewTransportRecovery = "once-v1";
  f.queue.project.approvedApplyContracts![0].isolatedArtifacts = structuredClone(f.queue.tasks[0].isolatedArtifacts);
  f.queue = validateQueue(f.queue);
  return { ...f, counter };
}

test("Stage 4 structured GIS recovery retains verification and executor through transport failure and reserved restart", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const mode of ["recover", "twice", "submitted-failed", "restart-reserved", "restart-closed"]) {
      const f = structuredTransportFixture(mode); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      let interrupted = false;
      if (mode.startsWith("restart")) configureGisLifecycleTestBoundary(async name => {
        const boundary = mode === "restart-reserved" ? "review-recovery-after-reservation" : "review-recovery-closed";
        if (name === boundary && !interrupted) { interrupted = true; throw new Error("Fixture host interrupted before GIS review checkpoint"); }
      });
      let run = createRun(f.queue); await executeQueue(run); configureGisLifecycleTestBoundary();
      if (mode.startsWith("restart")) {
        assert.ok(interrupted); assert.equal(run.tasks[0].status, "failed");
        assert.equal(run.tasks[0].processProgress!.attempts.executor, 1); assert.equal(run.tasks[0].processProgress!.attempts.verification, 1); assert.equal(run.tasks[0].processProgress!.attempts.publication, 0);
        const saved = await loadRun(run.id); assert.ok(saved); const continued = resumeRun(JSON.parse(JSON.stringify(saved))); assert.ok(continued);
        run = continued; await executeQueue(run);
      }
      const t = run.tasks[0], p = t.processProgress!;
      assert.equal(t.status, mode === "twice" ? "failed" : "completed", `${mode}: ${t.log.join("\n")}`);
      assert.equal(p.attempts.executor, 1); assert.equal(p.attempts.verification, 1); assert.equal(p.attempts.review, 1); assert.equal(p.attempts.publication, mode === "twice" ? 0 : 1);
      assert.equal(Number(readFileSync(f.counter, "utf8")), 2); assert.equal(t.structuredReviewInvocations!.length, 2);
      assert.equal(t.agentReports!.length, 1); assert.equal(t.reviewTransportRecoveries!.length, 1); assert.equal(t.reviewTransportRecoveries![0].state, "closed");
      assert.equal(t.structuredReviews?.length ?? 0, mode === "twice" ? 0 : 1);
      assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, mode === "twice" ? 0 : 2);
      assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-baseline.json"), "utf8")).completed, mode === "twice" ? 0 : 2);
      assert.equal(existsSync(join(f.project, f.runPath, "publication.json")), mode !== "twice");
      if (mode === "twice") {
        const continued = resumeRun(JSON.parse(JSON.stringify(run))); assert.ok(continued); await executeQueue(continued);
        assert.equal(continued.tasks[0].status, "failed"); assert.equal(Number(readFileSync(f.counter, "utf8")), 2); assert.equal(continued.tasks[0].processProgress!.attempts.publication, 0);
      }
    }
  } finally {
    configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin;
    if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script;
  }
});

test("Stage 4 structured GIS correction binds a fresh recovery cycle to its newly verified executor result", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = structuredTransportFixture("correction"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const run = createRun(f.queue); await executeQueue(run); const t = run.tasks[0], p = t.processProgress!;
    assert.equal(run.status, "completed", t.log.join("\n"));
    assert.equal(p.attempts.executor, 2); assert.equal(p.attempts.verification, 2); assert.equal(p.attempts.review, 2); assert.equal(p.attempts.publication, 1);
    assert.equal(t.reviewTransportRecoveries!.length, 2); assert.notEqual(t.reviewTransportRecoveries![0].resultSha256, t.reviewTransportRecoveries![1].resultSha256);
    assert.ok(t.reviewTransportRecoveries!.every(c => c.state === "closed" && c.receipt && !c.retry));
    assert.equal(t.agentReports!.length, 2); assert.equal(t.structuredReviews!.length, 2); assert.equal(Number(readFileSync(f.counter, "utf8")), 2);
    assert.match(JSON.parse(readFileSync(join(f.project, f.runPath, "response-0.json"), "utf8")).reviewedUnits[0].summaryRu, /^Corrected fixture/);
    assert.match(JSON.parse(readFileSync(join(f.project, f.runPath, "response-1.json"), "utf8")).reviewedUnits[0].summaryRu, /^Concrete fixture/);
    assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 2);
    assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-baseline.json"), "utf8")).completed, 2);
    const restored = await loadRun(run.id); assert.ok(restored); assert.equal(restored.status, "completed");
  } finally {
    if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin;
    if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script;
  }
});

test("structured GIS reviewer correction survives JSON restart and rejects forged targets and receipts", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = structuredCorrectionFixture(); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    let stopped = false;
    configureGisLifecycleTestBoundary(async name => { if (name === "finalized" && !stopped) { stopped = true; throw Error("controlled interruption before structured review"); } });
    let run = createRun(f.queue); await executeQueue(run); configureGisLifecycleTestBoundary();
    assert.equal(run.tasks[0].processProgress!.phase, "finalized");
    const persisted = await loadRun(run.id); assert.ok(persisted); const resumed = resumeRun(JSON.parse(JSON.stringify(persisted))); assert.ok(resumed);
    run = resumed;
    // Interrupt after the structured correction has finalized, so restart must
    // replay the rejected verdict and its correction history before approval.
    configureGisLifecycleTestBoundary(async (name, active) => { if (name === "finalized" && active.tasks[0].processProgress!.attempts.executor === 2) throw Error("controlled interruption after structured patch"); });
    await executeQueue(run); configureGisLifecycleTestBoundary();
    const task = run.tasks[0], progress = task.processProgress!;
    assert.equal(progress.phase, "finalized", task.log.join("\n")); assert.equal(progress.attempts.executor, 2);
    assert.deepEqual(task.reviewTargets, [3, 4]);
    const rejected = progress.history.find(h => h.stage === "review")!.receipt as { status: typeof task.reviewStatus; output: string };
    assert.equal(rejected.status, "changes_requested");
    const sourceView = JSON.parse(JSON.stringify(run));
    sourceView.tasks[0].reviewStatus = rejected.status;
    sourceView.tasks[0].reviewOutput = rejected.output;
    assert.deepEqual(await structuredRecoveryReviewTargets(sourceView, sourceView.tasks[0]), [3, 4]);
    const archived = (progress.history.find(h => h.stage === "analysis-correction")!.receipt as { archived: string; correctionTargets: number[] });
    assert.deepEqual(archived.correctionTargets, [3, 4]);
    const staged = join(data, "runs", run.id, `${task.id}-isolated/workspace`, f.runPath);
    for (const i of [0, 1, 2]) assert.deepEqual(readFileSync(join(staged, `response-${i}.json`)), readFileSync(join(archived.archived, f.runPath, `response-${i}.json`)));
    for (const i of [3, 4]) assert.match(JSON.parse(readFileSync(join(staged, `response-${i}.json`), "utf8")).reviewedUnits[0].summaryRu, /^Corrected fixture/);
    const saved = await loadRun(run.id); assert.ok(saved);
    for (const mutate of [
      (t: typeof task) => { t.reviewProtocol = undefined; t.authorizationEvidence!.reviewProtocol = undefined; t.structuredReviews = undefined; },
      (t: typeof task) => { t.structuredReviews = []; },
      (t: typeof task) => { t.structuredReviews![0].identity.taskId = "foreign"; },
      (t: typeof task) => { t.structuredReviewInvocations!.push({ ...t.structuredReviewInvocations![0], invocationId: "b".repeat(32), ordinal: 2 }); },
      (t: typeof task) => { t.reviewTargets = [0]; },
    ]) {
      const forged = JSON.parse(JSON.stringify(sourceView)); mutate(forged.tasks[0]);
      await assert.rejects(structuredRecoveryReviewTargets(forged, forged.tasks[0]));
    }
    for (const { mutate, expected } of [
      { mutate: (r: typeof run) => { (r.tasks[0].processProgress!.history.find(h => h.stage === "analysis-correction")!.receipt as { correctionTargets: number[] }).correctionTargets = [0]; }, expected: /Structured correction targets changed/u },
      { mutate: (r: typeof run) => { r.tasks[0].structuredReviews![0].verdictSha256 = "f".repeat(64); }, expected: /'f{64}'/u },
    ]) {
      const forged = JSON.parse(JSON.stringify(saved)); mutate(forged); const candidate = resumeRun(forged); assert.ok(candidate); await executeQueue(candidate);
      assert.equal(candidate.tasks[0].status, "failed"); assert.equal(candidate.tasks[0].processProgress!.attempts.executor, 2); assert.equal(candidate.tasks[0].processProgress!.attempts.publication, 0);
      assert.ok(candidate.tasks[0].log.some(line => expected.test(line)), candidate.tasks[0].log.join("\n"));
    }
    const final = resumeRun(JSON.parse(JSON.stringify(saved))); assert.ok(final); await executeQueue(final);
    assert.equal(final.status, "completed", final.tasks.map(t => t.log.join("\n")).join("\n"));
    assert.equal(final.tasks[0].processProgress!.attempts.executor, 2); assert.equal(final.tasks[0].processProgress!.attempts.review, 2); assert.equal(final.tasks[0].processProgress!.attempts.publication, 1);
    for (const i of [0, 1, 2]) assert.deepEqual(readFileSync(join(f.project, f.runPath, `response-${i}.json`)), readFileSync(join(archived.archived, f.runPath, `response-${i}.json`)));
    assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 5);
    assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-baseline.json"), "utf8")).completed, 5);
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("GIS finding rules are supplied to analysis and rejected before native validation or response writes", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const scenario of ["supported-rule", "unsupported-rule", "sibling-rule", "unsupported-patch-rule"]) {
      const patch = scenario === "unsupported-patch-rule", f = fixture(patch ? "correction" : "registered", undefined, scenario);
      process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      const run = createRun(f.queue); await executeQueue(run); const task = run.tasks[0], progress = task.processProgress!;
      assert.equal(task.status, scenario === "supported-rule" ? "completed" : "failed", task.log.join("\n"));
      const nativeValidations = progress.native.filter(n => n.args.some(arg => arg.endsWith("validate-profile-analysis.mjs")));
      if (scenario === "supported-rule") {
        assert.equal(nativeValidations.length, 1, "Eligible finding must still pass the native validator");
        assert.equal(progress.attempts.publication, 1);
      } else {
        assert.equal(nativeValidations.length, patch ? 2 : 0, "Rejected report must not run a new native validation");
        assert.equal(progress.attempts.executor, patch ? 2 : 1, "No automatic rule repair or extra analysis attempt");
        assert.equal(progress.attempts.publication, 0);
        assert.ok(task.log.some(line => line.includes("ruleId") && line.includes("not supported for one.ts")), task.log.join("\n"));
        assert.equal(existsSync(join(data, "runs", run.id, `${task.id}-isolated`, "workspace", f.runPath, "response-0.json")), false);
        assert.equal(existsSync(join(f.project, f.runPath)), false);
        assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 0);
      }
    }
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("invocation MCP full/patch production lifecycle retains gates, exact siblings and closed restart receipts", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const mode of ["registered", "correction"]) {
      const f = fixture(mode, undefined, "tools-valid"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      let stopped = false;
      configureGisLifecycleTestBoundary(async name => { if (mode === "registered" && name === "finalized" && !stopped) { stopped = true; throw Error("controlled interruption for restart"); } });
      let run = createRun(f.queue); await executeQueue(run);
      if (mode === "registered") { assert.equal(run.tasks[0].processProgress!.phase, "finalized"); const stored = await loadRun(run.id); assert.ok(stored); const resumed = resumeRun(stored); assert.ok(resumed); run = resumed; await executeQueue(run); }
      configureGisLifecycleTestBoundary(); const task = run.tasks[0], progress = task.processProgress!;
      assert.equal(task.status, "completed", task.log.join("\n")); assert.equal(task.agentReports?.length, mode === "correction" ? 2 : 1);
      assert.equal(progress.attempts.verification, mode === "correction" ? 2 : 1); assert.equal(progress.attempts.review, mode === "correction" ? 2 : 1); assert.equal(progress.attempts.publication, 1);
      for (const [i, identity] of task.agentReports!.entries()) {
        assert.equal(identity.transport, "invocation-mcp-v1"); assert.deepEqual(task.agentToolInvocations![i], identity);
        const terminal = JSON.parse(readFileSync(join(data, "runs", run.id, `${task.id}-agent-reports`, identity.invocationId, "terminal-evidence.json"), "utf8"));
        assert.deepEqual(terminal.identity, identity); assert.equal(terminal.code, 0); assert.equal(terminal.failure, false); assert.equal(terminal.counts.completed, 1); assert.equal(terminal.counts.transportRetries, 4); assert.equal(terminal.counts.errors, 4);
        const file = join(data, "runs", run.id, `${task.id}-agent-reports`, identity.invocationId, "tools-state.json"), state = JSON.parse(readFileSync(file, "utf8"));
        assert.equal(state.status, "closed"); assert.equal(state.validations, 1); assert.equal(state.calls, 5); assert.equal(task.agentToolStateReceipts![i].sha256, gisSha(readFileSync(file)));
      }
      if (mode === "correction") { const archive = progress.history.find(h => h.stage === "analysis-correction")!.receipt as { archived: string }; assert.deepEqual(readFileSync(join(archive.archived, f.runPath, "response-1.json")), readFileSync(join(f.project, f.runPath, "response-1.json"))); }
      const loaded = await loadRun(run.id); assert.ok(loaded); assert.equal(resumeRun(loaded), undefined, "Completed restart cannot request more analysis");
    }
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("invocation MCP denied budget, native errors and tampered closed state never publish or reanalyze", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const scenario of ["budget", "native", "state"]) {
      const f = fixture(scenario === "budget" ? "correction" : "registered", scenario === "budget" ? "deny" : undefined, scenario === "native" ? "tools-native-error" : "tools-valid");
      process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      let interrupted = false; configureGisLifecycleTestBoundary(async name => { if (scenario === "state" && name === "finalized" && !interrupted) { interrupted = true; throw Error("controlled interruption for restart"); } });
      let run = createRun(f.queue); await executeQueue(run); configureGisLifecycleTestBoundary();
      if (scenario === "state") {
        const task = run.tasks[0], identity = task.agentReports![0], file = join(data, "runs", run.id, `${task.id}-agent-reports`, identity.invocationId, "tools-state.json"); writeFileSync(file, "{}");
        const loaded = await loadRun(run.id); assert.ok(loaded); const resumed = resumeRun(loaded); assert.ok(resumed); run = resumed; await executeQueue(run); assert.equal(run.tasks[0].processProgress!.attempts.executor, 1); assert.ok(run.tasks[0].log.some(x => x.includes("Tool state receipt changed")));
      }
      assert.notEqual(run.tasks[0].status, "completed", run.tasks[0].log.join("\n")); assert.equal(run.tasks[0].processProgress!.attempts.publication, 0); assert.equal(existsSync(join(f.project, f.runPath)), false);
      if (scenario === "native") {
        const identity = run.tasks[0].agentToolInvocations![0], storage = join(data, "runs", run.id, `${run.tasks[0].id}-agent-reports`, identity.invocationId); assert.equal(existsSync(join(storage, "submitted")), false);
        const validationDir = (await import("node:fs/promises")).readdir; const validation = (await validationDir(storage)).find(x => x.startsWith("validation-")); assert.ok(validation);
        const native = JSON.parse(readFileSync(join(storage, validation, "validation-0.json"), "utf8")); assert.deepEqual(native.rejectionsRu, ["reviewedUnits[0].summaryRu недостаточно конкретен"]); assert.equal(run.tasks[0].processProgress!.attempts.verification, 0);
      }
      if (scenario === "budget") { assert.equal(run.tasks[0].agentReports?.length, 1); assert.equal(run.tasks[0].processProgress!.attempts.executor, 2); const admissions = run.tasks[0].executionBudgetEvidence!.filter(x => x.contractType === "ExecutionBudgetAdmissionV1" && x.phase === "correction"); assert.equal(admissions.length, 1); assert.ok(admissions[0].contractType === "ExecutionBudgetAdmissionV1"); assert.notEqual(admissions[0].disposition, "allow"); }
    }
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("invocation MCP successful submission cannot compensate for failed/stopped/partial/unsubmitted/cancelled/timed-out CLI", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const scenario of ["tools-nonzero", "tools-failed", "tools-error", "tools-partial", "tools-stopped", "tools-unsubmitted", "tools-rule", "tools-cancel", "tools-timeout"]) {
      const f = fixture("registered", undefined, scenario); f.queue.tasks[0].timeoutMinutes = 1;
      process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      const run = createRun(f.queue), timer = scenario === "tools-cancel" ? setInterval(() => { if (existsSync(join(f.root, "tools-ready"))) run.status = "cancelled"; }, 10) : undefined;
      try { await executeQueue(run); } finally { if (timer) clearInterval(timer); }
      const task = run.tasks[0]; assert.notEqual(task.status, "completed", scenario + task.log.join("\n")); assert.equal(task.agentReports?.length ?? 0, 0); assert.equal(task.processProgress!.attempts.verification, 0); assert.equal(task.processProgress!.attempts.review, 0); assert.equal(task.processProgress!.attempts.publication, 0); assert.equal(existsSync(join(f.project, f.runPath)), false);
      if (scenario === "tools-timeout") assert.equal(task.timedOut, true);
    }
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("structured-output-v1 full and targeted patch traverse production mock lifecycle", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const mode of ["registered", "correction", "correction-repeat"]) {
      const f = fixture(mode, undefined, "valid"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      const run = createRun(f.queue); await executeQueue(run);
      const task = run.tasks[0], progress = task.processProgress!;
      assert.equal(task.status, mode === "correction-repeat" ? "failed" : "completed", task.log.join("\n"));
      assert.equal(task.agentReports?.length, mode === "registered" ? 1 : 2);
      assert.equal(progress.attempts.executor, mode === "registered" ? 1 : 2);
      assert.equal(progress.attempts.review, mode === "registered" ? 1 : 2);
      assert.equal(progress.attempts.publication, mode === "correction-repeat" ? 0 : 1);
      if (mode === "correction") {
        const archive = progress.history.find(h => h.stage === "analysis-correction")!.receipt as { archived: string };
        const before = readFileSync(join(archive.archived, f.runPath, "response-1.json"));
        const after = readFileSync(join(f.project, f.runPath, "response-1.json"));
        assert.deepEqual(after, before); assert.equal(gisSha(after), gisSha(before));
        assert.notEqual(gisSha(readFileSync(join(archive.archived, f.runPath, "response-0.json"))), gisSha(readFileSync(join(f.project, f.runPath, "response-0.json"))));
        assert.equal(task.agentReports!.at(-1)!.mode, "patch");
      }
    }
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("structured-output-v1 invalid transport/provider/native reports never publish", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const scenario of ["stopped", "nonzero", "failed", "error", "partial", "wrong-mode", "malformed", "duplicate-outer", "duplicate-inner", "extra", "technical", "oversize", "native-invalid", "extra-target", "missing-target", "duplicate-target"]) {
      const f = fixture(scenario.endsWith("target") ? "correction" : "registered", undefined, scenario);
      process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      const run = createRun(f.queue); await executeQueue(run);
      const task = run.tasks[0]; assert.equal(task.status, "failed", `${scenario}: ${task.log.join("\n")}`);
      assert.equal(task.processProgress!.attempts.publication, 0);
      assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 0);
      assert.equal(existsSync(join(f.project, f.runPath)), false);
      if (scenario === "native-invalid") assert.ok(task.processProgress!.native.some(n => n.exitCode === 1 && n.stderr.includes("native invalid")));
    }
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("structured-output-v1 full raw tail survives native lifecycle", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("registered", undefined, "tail"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.tasks[0].status, "completed", run.tasks[0].log.join("\n"));
    assert.equal(JSON.parse(readFileSync(join(f.project, f.runPath, "response-0.json"), "utf8")).reviewedUnits[0].summaryRu, "я".repeat(25001) + " tail-contract");
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("structured-output-v1 receipt interruption/tampering and denied correction never publish", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const scenario of ["agent-report-before-receipt", "agent-report-after-receipt", "schema", "raw", "receipt", "identity", "denied"]) {
      const f = fixture(scenario === "denied" ? "correction" : "registered", scenario === "denied" ? "deny" : undefined, "valid");
      process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      configureGisLifecycleTestBoundary(async (name, run, taskId) => {
        if (name === scenario) throw new Error("controlled receipt interruption");
        if (name !== "analyzed" || scenario === "denied" || scenario.startsWith("agent-report")) return;
        const identity = run.tasks.find(t => t.id === taskId)!.agentReports![0];
        const root = join(data, "runs", run.id, `${taskId}-agent-reports`, identity.invocationId);
        if (scenario === "identity") identity.invocationId = "0".repeat(32);
        else writeFileSync(join(root, scenario === "schema" ? "schema.json" : scenario === "raw" ? "result.json" : "receipt.json"), "{}");
      });
      const run = createRun(f.queue); await executeQueue(run);
      const task = run.tasks[0]; assert.equal(task.status, "failed", `${scenario}: ${task.log.join("\n")}`);
      assert.equal(task.processProgress!.attempts.publication, 0);
      assert.equal(existsSync(join(f.project, f.runPath)), false);
      assert.equal(task.processProgress!.attempts.executor, scenario === "denied" ? 2 : 1);
      if (scenario.startsWith("agent-report")) assert.equal(task.agentReports?.length ?? 0, 0);
    }
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("structured-output-v1 timeout and cancellation reject completed raw output", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const scenario of ["timeout", "cancel"]) {
      const f = fixture("registered", undefined, "valid"), ready = join(f.root, "ready");
      const providerText = readFileSync(f.provider, "utf8");
      writeFileSync(f.provider, providerText.replace("originalWrite.call(this,file,result,...rest);", `originalWrite.call(this,file,result,...rest);originalWrite.call(this,${JSON.stringify(ready)},'ready');setTimeout(()=>{},${scenario === "timeout" ? 65000 : 1000});`));
      f.queue.tasks[0].timeoutMinutes = 1;
      process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      const run = createRun(f.queue);
      const timer = scenario === "cancel" ? setInterval(() => { if (existsSync(ready)) run.status = "cancelled"; }, 10) : undefined;
      try { await executeQueue(run); } finally { if (timer) clearInterval(timer); }
      const task = run.tasks[0]; assert.notEqual(task.status, "completed", task.log.join("\n"));
      assert.equal(existsSync(ready), true);
      assert.equal(task.agentReports?.length ?? 0, 0);
      assert.equal(task.processProgress!.attempts.publication, 0);
      assert.equal(task.processProgress!.native.length, 3, "Only capability probe, native preparation and bundle creation precede failed analysis");
      if (scenario === "timeout") assert.equal(task.timedOut, true);
    }
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});
test("production GIS lifecycle retains analysis through transient verify/review failure and JSON restart", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const mode of ["verify", "review", "publication", "lost-ack", "deterministic"]) {
      const f = fixture(mode); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      let interrupted = false;
      configureGisLifecycleTestBoundary(async name => {
        if (!interrupted && ((mode === "publication" && name === `publication-file:${f.state}/quality-baseline.json`) || (mode === "lost-ack" && name === "publication-after-effect"))) { interrupted = true; throw new Error("controlled interruption"); }
      });
      const first = createRun(f.queue); await executeQueue(first);
      assert.equal(first.tasks[0].status, "failed", first.tasks[0].log.join("\n"));
      assert.equal(first.tasks[0].executionAttempts, 1);
      assert.ok(first.tasks[0].gisProgress);
      const record = await loadRun(first.id); assert.ok(record);
      assert.deepEqual(record.tasks[0].gisProgress, first.tasks[0].gisProgress);
      if (mode === "deterministic") { assert.throws(() => resumeRun(record), /deterministic/); continue; }
      const resumed = resumeRun(JSON.parse(JSON.stringify(record))); assert.ok(resumed);
      assert.equal(resumed.id, first.id); assert.equal(resumed.tasks[0].id, first.tasks[0].id);
      await executeQueue(resumed);
      assert.equal(resumed.tasks[0].status, "completed", resumed.tasks[0].log.join("\n"));
      assert.equal(resumed.tasks[0].executionAttempts, 1);
      assert.equal(resumed.tasks[0].gisProgress!.attempts.executor, 1);
      assert.equal(resumed.tasks[0].gisProgress!.attempts.verification, mode === "verify" ? 2 : 1);
      assert.equal(resumed.tasks[0].gisProgress!.attempts.review, mode === "review" ? 2 : 1);
      assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 2);
      assert.equal(resumed.tasks[0].gisProgress!.phase, "published");
      assert.ok(existsSync(join(data, "runs", first.id, "run.json")));
    }
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("registered GIS process uses generic persisted progress and same-run continuation", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("registered"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    let stopped = false;
    configureGisLifecycleTestBoundary(async name => { if (name === "finalized" && !stopped) { stopped = true; throw new Error("controlled interruption"); } });
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.tasks[0].processProgress?.phase, "finalized"); assert.equal(run.tasks[0].gisProgress, undefined);
    const persisted = await loadRun(run.id); assert.ok(persisted);
    const resumed = resumeRun(persisted)!; await executeQueue(resumed);
    assert.equal(resumed.status, "completed", resumed.tasks[0].log.join("\n"));
    assert.equal(resumed.tasks[0].processProgress?.phase, "published");
    assert.equal(resumed.tasks[0].executionAttempts, 1);
    assert.equal(resumed.tasks[0].processProgress?.handler.name, "gis-audit");
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("retained GIS result refuses changed artifacts, runtime, inputs, authority and receipts before another executor", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    for (const change of ["artifact", "runtime", "input", "authority", "receipt", "provider"]) {
      const f = fixture("verify"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
      const first = createRun(f.queue); await executeQueue(first);
      assert.equal(first.tasks[0].gisProgress?.phase, "finalized", first.tasks[0].log.join("\n"));
      const resumed = resumeRun(JSON.parse(JSON.stringify(first)))!;
      const stage = join(data, "runs", first.id, `${first.tasks[0].id}-isolated`, "workspace");
      if (change === "artifact") writeFileSync(join(stage, f.runPath, "receipt.json"), "changed");
      if (change === "runtime") writeFileSync(join(f.project, "runtime/config.json"), "changed");
      if (change === "input") writeFileSync(join(f.project, f.state, "quality-coverage.json"), "changed");
      if (change === "provider") writeFileSync(f.provider, "changed");
      if (change === "authority") resumed.tasks[0].authorization!.approvalId = "revoked";
      if (change === "receipt") { resumed.tasks[0].gisProgress!.phase = "verified"; resumed.tasks[0].verificationEvidence![0].exitCode = 1; }
      try { await executeQueue(resumed); } catch { /* topology/authority failures can precede task dispatch */ }
      assert.notEqual(resumed.tasks[0].status, "completed");
      assert.equal(resumed.tasks[0].executionAttempts, 1);
      assert.equal(existsSync(join(f.project, f.runPath)), false);
    }
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("business handler calls the native business-logic bundle entrypoint", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("business"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.status, "completed", run.tasks.map(t => t.log.join("\n")).join("\n"));
    assert.ok(run.tasks[0].processProgress!.native.some(e => e.args.some(a => a.endsWith("business-logic-bundle.mjs"))));
    assert.equal(run.tasks[0].processProgress!.attempts.executor, 1);
    assert.equal(existsSync(join(f.project, f.runPath, "after-coverage.json")), true);
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("performance handler supplies a separate native baseline for every bundle to validation", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("performance"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.status, "completed", run.tasks.map(t => t.log.join("\n")).join("\n"));
    const progress = run.tasks[0].processProgress!;
    assert.equal(progress.attempts.executor, 1);
    const baselines = progress.native.filter(e => e.args.some(a => a.endsWith("performance-baseline.mjs")));
    const validations = progress.native.filter(e => e.args.some(a => a.endsWith("validate-profile-analysis.mjs")));
    assert.equal(baselines.length, 2); assert.equal(validations.length, 2);
    for (const [i, entry] of validations.entries()) { assert.equal(entry.exitCode, 0); assert.ok(entry.args[entry.args.indexOf("--baseline") + 1].endsWith(`performance-baseline-${i}.json`)); }
    for (const [i, fingerprint] of ["1".repeat(64), "2".repeat(64)].entries()) assert.deepEqual(JSON.parse(readFileSync(join(f.project, f.runPath, `performance-baseline-${i}.json`), "utf8")), { sourceBundleFingerprint: fingerprint, measurements: [] });
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("GIS review correction uses the existing correction budget and retains both analyses", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("correction", "enabled"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    for (const name of ["coverage", "baseline"]) writeFileSync(join(f.project, f.state, `quality-${name}.json`), JSON.stringify({ completed: 0, retainedFixtureData: "x".repeat(40_000) }));
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.status, "completed", run.tasks.map(t => t.log.join("\n")).join("\n"));
    const task = run.tasks[0], p = task.processProgress!;
    assert.equal(p.attempts.executor, 2); assert.equal(p.attempts.verification, 2); assert.equal(p.attempts.review, 2);
    assert.equal(task.executionAttempts, 1); assert.equal(task.attempts, 2);
    const admissions = task.executionBudgetEvidence!.filter(e => e.contractType === "ExecutionBudgetAdmissionV1");
    assert.deepEqual(admissions.map(e => e.phase), ["executor", "reviewer", "correction", "reviewer"]);
    assert.ok(admissions.every(e => e.disposition === "allow"));
    assert.equal(task.reviewStatus, "approved");
    const rejected = p.history.find(h => h.stage === "analysis-correction")!.receipt as { archived: string };
    const response = (root: string) => JSON.parse(readFileSync(join(root, f.runPath, "response-0.json"), "utf8")).reviewedUnits[0].summaryRu;
    assert.match(response(rejected.archived), /^Concrete fixture/);
    assert.match(response(f.project), /^Corrected fixture/);
    const sibling = (root: string) => readFileSync(join(root, f.runPath, "response-1.json"));
    assert.deepEqual(sibling(f.project), sibling(rejected.archived), "Unrejected sibling bytes must survive correction");
    const patch = p.history.find(h => h.stage === "analysis-patch")!.receipt as { targets: number[]; preserved: Array<{ index: number; sha256: string }> };
    assert.deepEqual(patch.targets, [0]); assert.deepEqual(patch.preserved, [{ index: 1, sha256: gisSha(sibling(f.project)) }]);
    assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 2);
    assert.ok(task.log.some(l => l.includes("Автоисправление")));
    assert.equal(run.tasks[1].status, "completed");
    assert.ok(run.tasks[1].wholeChangeAcceptanceEvidence!.contentEvidence.some(e => e.gisNativeEvidence));
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("GIS explicit bounded recovery patches the canonical failed analysis without regenerating siblings", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("correction-seed"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const writer = f.queue.tasks[0], config = writer.isolatedArtifacts!.processPackage!.configuration;
    config.stageAttempts.verification = 1; config.stageAttempts.review = 1;
    f.queue.project.approvedApplyContracts![0].isolatedArtifacts = structuredClone(writer.isolatedArtifacts);
    const failed = createRun(f.queue); await executeQueue(failed);
    assert.equal(failed.status, "failed"); assert.equal(failed.tasks[0].processProgress!.phase, "verified"); assert.equal(failed.tasks[0].reviewStatus, "changes_requested");
    const sourceRoot = join(data, "runs", failed.id, `${failed.tasks[0].id}-isolated`, "workspace");
    const q = structuredClone(f.queue);
    q.tasks[0].executionKind = { contractType: "TaskExecutionKindV1", contractVersion: "1.0", kind: "recovery" };
    q.tasks[0].recovery = { contractType: "RecoveryTaskBindingV1", contractVersion: "1.0", sourceRunId: failed.id, sourceTaskId: failed.tasks[0].id };
    const sourceFile = join(data, "runs", failed.id, "run.json"), sourceBytes = readFileSync(sourceFile);
    configureGisLifecycleTestBoundary(async (name, active) => {
      if (name === "prepared" && active.id !== failed.id) writeFileSync(sourceFile, Buffer.concat([sourceBytes, Buffer.from(" ")]));
    });
    const stale = createRun(validateQueue(q)); await executeQueue(stale);
    assert.equal(stale.status, "failed");
    assert.ok(stale.tasks[0].log.some(line => line.includes("GIS retained source record changed")));
    assert.ok(!existsSync(join(f.project, f.runPath, "response-0.json")));
    configureGisLifecycleTestBoundary(); writeFileSync(sourceFile, sourceBytes);
    const cancelledSource = JSON.parse(sourceBytes.toString("utf8"));
    cancelledSource.tasks[0].status = "cancelled";
    writeFileSync(sourceFile, JSON.stringify(cancelledSource));
    const invalidSource = createRun(validateQueue(q)); await executeQueue(invalidSource);
    assert.equal(invalidSource.status, "failed");
    assert.ok(invalidSource.tasks[0].log.some(line => line.includes("GIS recovery requires failed verified changes_requested source analysis")));
    assert.equal(invalidSource.tasks[0].processProgress, undefined);
    assert.equal(existsSync(join(f.project, f.runPath)), false);
    writeFileSync(sourceFile, sourceBytes);
    const recovered = createRun(validateQueue(q)); await executeQueue(recovered);
    assert.equal(recovered.status, "completed", recovered.tasks.map(t => t.log.join("\n")).join("\n"));
    const p = recovered.tasks[0].processProgress!;
    assert.equal(p.attempts.executor, 1); assert.equal(p.attempts.review, 1); assert.equal(p.attempts.verification, 1);
    assert.deepEqual(readFileSync(join(f.project, f.runPath, "response-1.json")), readFileSync(join(sourceRoot, f.runPath, "response-1.json")));
    assert.match(JSON.parse(readFileSync(join(f.project, f.runPath, "response-0.json"), "utf8")).reviewedUnits[0].summaryRu, /^Corrected fixture/);
    assert.equal((p.history.find(h => h.stage === "analysis-patch")!.receipt as { source: { runId: string } }).source.runId, failed.id);
    assert.equal(failed.tasks[0].status, "failed");
  } finally { configureGisLifecycleTestBoundary(); if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("GIS prepared correction opt-in recovers once with source counters and immutable siblings", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = structuredCorrectionFixture(), failedOnce = join(f.root, "correction-failed-once");
    const injection = `if(p.includes('GIS_CORRECTION_INPUT_V1: ')&&!fs.existsSync(${JSON.stringify(failedOnce)})){fs.writeFileSync(${JSON.stringify(failedOnce)},'failed');const message='unexpected status 403 Forbidden: blocked, url: https://chatgpt.com/backend-api/codex/responses, cf-ray: abc-FRA';console.log(JSON.stringify({type:'error',message}));console.log(JSON.stringify({type:'turn.failed',error:{message}}));process.exitCode=1;return;}`;
    writeFileSync(f.provider, readFileSync(f.provider,"utf8").replace("if(p.startsWith('Independently review", injection + "if(p.startsWith('Independently review"));
    process.env.CODEX_BIN=process.execPath;process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT=f.provider;
    const source=createRun(f.queue);await executeQueue(source);const failed=source.tasks[0],p=failed.processProgress!;
    assert.equal(p.phase,"prepared",failed.log.join("\n"));assert.equal(failed.status,"failed");assert.equal(p.attempts.executor,2);
    const sourceFile=join(data,"runs",source.id,"run.json"),bytes=readFileSync(sourceFile),invocation=failed.agentToolInvocations!.at(-1)!;
    const storage=join(data,"runs",source.id,`${failed.id}-agent-reports`,invocation.invocationId),q=structuredClone(f.queue);
    const writer=q.tasks[0];writer.executionKind={contractType:"TaskExecutionKindV1",contractVersion:"1.0",kind:"recovery"};
    writer.recovery={contractType:"RecoveryTaskBindingV1",contractVersion:"1.0",sourceRunId:source.id,sourceTaskId:failed.id,preparedCorrection:{contractType:"PreparedCorrectionRecoveryV1",contractVersion:"1.0",diagnosticCoverage:"retained-events-manual-v1",sourceSha256:gisSha(bytes),invocationId:invocation.invocationId,terminalSha256:gisSha(readFileSync(join(storage,"terminal-evidence.json"))),toolsStateSha256:gisSha(readFileSync(join(storage,"tools-state.json")))}};
    writer.isolatedArtifacts!.processPackage!.configuration.stageAttempts={verification:1,review:1,publication:1,correction:0};
    q.review.maxCorrections=0;
    q.project.approvedApplyContracts![0].isolatedArtifacts=structuredClone(writer.isolatedArtifacts);
    q.project.approvedApplyContracts![0].preparedCorrection=structuredClone(writer.recovery.preparedCorrection);
    const empty=structuredClone(q);empty.tasks[0].verificationCommands=[];empty.project.verificationCommands=[];empty.project.approvedApplyContracts![0].verificationCommands=[];
    assert.throws(()=>validateQueue(empty),/reversible local apply scope/);
    const checks=await queueRecoveryContractChecks(empty);
    assert.ok(checks.some(c=>!c.ok&&c.detail.includes('nonempty machine verification')));
    const recovered=createRun(validateQueue(q));await markRunReadyForLaunch(recovered);
    const claim=join(data,"runs",source.id,`${failed.id}-prepared-correction-recovery.json`),claimBytes=readFileSync(claim),reloaded=JSON.parse(JSON.stringify(recovered));
    unlinkSync(claim);await assert.rejects(markRunReadyForLaunch(reloaded));assert.equal(existsSync(claim),false,'Replay cannot recreate a missing reservation');
    writeFileSync(claim,claimBytes,{flag:'wx'});await markRunReadyForLaunch(reloaded);await executeQueue(reloaded);
    Object.assign(recovered,reloaded);
    assert.equal(recovered.status,"completed",recovered.tasks[0].log.join("\n"));
    const rp=recovered.tasks[0].processProgress!;assert.deepEqual(rp.attempts,{executor:1,verification:1,review:1,publication:1});
    const patch=rp.history.find(h=>h.stage==='analysis-patch')!.receipt as {sourceAttempts:unknown};assert.deepEqual(patch.sourceAttempts,p.attempts);
    const archived=(p.history.find(h=>h.stage==='analysis-correction')!.receipt as {archived:string}).archived;
    for(const i of [0,1,2])assert.deepEqual(readFileSync(join(f.project,f.runPath,`response-${i}.json`)),readFileSync(join(archived,f.runPath,`response-${i}.json`)));
    assert.deepEqual(readFileSync(sourceFile),bytes,'Historical source must remain immutable');
    await assert.rejects(markRunReadyForLaunch(createRun(validateQueue(q))),/already reserved/);
    assert.equal(JSON.parse(readFileSync(join(f.project,f.state,"quality-coverage.json"),"utf8")).completed,5);
  } finally { if(original.bin===undefined)delete process.env.CODEX_BIN;else process.env.CODEX_BIN=original.bin;if(original.script===undefined)delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT;else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT=original.script; }
});

test("GIS prelaunch successor preserves failed claims, fences compatible gates and publishes once", async () => {
  const original={bin:process.env.CODEX_BIN,script:process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT};
  try {
    const f=structuredCorrectionFixture(), failedOnce=join(f.root,'prelaunch-correction-failed-once'), mechanical=join(f.root,'mechanical-source.txt');
    const pin=(path:string)=>({path:resolve(path),sha256:gisSha(readFileSync(path))});
    writeFileSync(mechanical,'old source');
    const config=f.queue.tasks[0].isolatedArtifacts!.processPackage!.configuration;
    const manifest=JSON.parse(readFileSync(f.manifest,'utf8'));manifest.mechanicalEvidence=[pin(mechanical)];writeFileSync(f.manifest,JSON.stringify(manifest));config.manifest=pin(f.manifest);
    const checker=readFileSync(f.checker,'utf8').replace('assert.equal(',`if(process.argv[2]==='before'){const m=JSON.parse(fs.readFileSync(new URL('manifest.json',import.meta.url)));for(const e of m.mechanicalEvidence)assert.equal((await import('node:crypto')).createHash('sha256').update(fs.readFileSync(e.path)).digest('hex'),e.sha256,'Queue implementation changed');}else assert.equal(`);
    writeFileSync(f.checker,checker);config.gates[0]=pin(f.checker);
    const before=`node "${f.checker}" before one`;
    f.queue.tasks[0].preconditions=[before];f.queue.project.approvedApplyContracts![0].preconditions=[before];f.queue.project.approvedApplyContracts![0].isolatedArtifacts=structuredClone(f.queue.tasks[0].isolatedArtifacts);
    const injection=`if(p.includes('GIS_CORRECTION_INPUT_V1: ')&&!fs.existsSync(${JSON.stringify(failedOnce)})){fs.writeFileSync(${JSON.stringify(failedOnce)},'failed');const message='unexpected status 403 Forbidden: blocked, url: https://chatgpt.com/backend-api/codex/responses, cf-ray: abc-FRA';console.log(JSON.stringify({type:'error',message}));console.log(JSON.stringify({type:'turn.failed',error:{message}}));process.exitCode=1;return;}`;
    writeFileSync(f.provider,readFileSync(f.provider,'utf8').replace("if(p.startsWith('Independently review",injection+"if(p.startsWith('Independently review"));process.env.CODEX_BIN=process.execPath;process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT=f.provider;
    const source=createRun(validateQueue(f.queue));await executeQueue(source);const failed=source.tasks[0];assert.equal(failed.processProgress!.phase,'prepared');
    const sourceFile=join(data,'runs',source.id,'run.json'),sourceBytes=readFileSync(sourceFile),invocation=failed.agentToolInvocations!.at(-1)!,storage=join(data,'runs',source.id,`${failed.id}-agent-reports`,invocation.invocationId);
    const q=structuredClone(f.queue),writer=q.tasks[0];writer.executionKind={contractType:'TaskExecutionKindV1',contractVersion:'1.0',kind:'recovery'};
    writer.recovery={contractType:'RecoveryTaskBindingV1',contractVersion:'1.0',sourceRunId:source.id,sourceTaskId:failed.id,preparedCorrection:{contractType:'PreparedCorrectionRecoveryV1',contractVersion:'1.0',diagnosticCoverage:'retained-events-manual-v1',sourceSha256:gisSha(sourceBytes),invocationId:invocation.invocationId,terminalSha256:gisSha(readFileSync(join(storage,'terminal-evidence.json'))),toolsStateSha256:gisSha(readFileSync(join(storage,'tools-state.json')))}};
    writer.isolatedArtifacts!.processPackage!.configuration.stageAttempts={verification:1,review:1,publication:1,correction:0};q.review.maxCorrections=0;
    q.project.approvedApplyContracts![0].isolatedArtifacts=structuredClone(writer.isolatedArtifacts);q.project.approvedApplyContracts![0].preparedCorrection=structuredClone(writer.recovery.preparedCorrection);
    writeFileSync(mechanical,'new source');
    const predecessor=createRun(validateQueue(q));await markRunReadyForLaunch(predecessor);await executeQueue(predecessor);assert.equal(predecessor.status,'failed');assert.equal(predecessor.tasks[0].processProgress,undefined);assert.equal(predecessor.tasks[0].agentToolInvocations,undefined);
    const predecessorFile=join(data,'runs',predecessor.id,'run.json'),predecessorBytes=readFileSync(predecessorFile),claim=join(data,'runs',source.id,`${failed.id}-prepared-correction-recovery.json`),claimBytes=readFileSync(claim);
    const freshDir=join(f.project,'compatible-contracts');mkdirSync(freshDir);const freshManifest=join(freshDir,'manifest.json'),freshGate=join(freshDir,'check.mjs');
    const replacement=structuredClone(manifest);replacement.mechanicalEvidence=[pin(mechanical)];writeFileSync(freshManifest,JSON.stringify(replacement));writeFileSync(freshGate,checker);
    for(const name of ['preflight.json','block.json'])copyFileSync(join(f.project,'contracts',name),join(freshDir,name));
    const c=writer.isolatedArtifacts!.processPackage!.configuration;c.manifest=pin(freshManifest);c.gates=[pin(freshGate)];writer.preconditions=[`node "${freshGate}" before one`];
    writer.recovery.preparedCorrection!.mechanicalCompatibility={contractType:'GISMechanicalCompatibilityV1',contractVersion:'1.0',manifest:pin(freshManifest)};
    writer.recovery.preparedCorrection!.prelaunchSuccessor={contractType:'PrelaunchSuccessorV1',contractVersion:'1.0',runId:predecessor.id,taskId:predecessor.tasks[0].id,canonicalSha256:gisSha(predecessorBytes),reservationSha256:gisSha(claimBytes)};
    writer.verificationCommands=writer.verificationCommands!.map(command=>command.replace(f.checker,freshGate));
    q.project.approvedApplyContracts![0].verificationCommands=structuredClone(writer.verificationCommands);
    q.project.approvedApplyContracts![0].preconditions=structuredClone(writer.preconditions);q.project.approvedApplyContracts![0].isolatedArtifacts=structuredClone(writer.isolatedArtifacts);q.project.approvedApplyContracts![0].preparedCorrection=structuredClone(writer.recovery.preparedCorrection);
    const reviewStorage=join(data,'runs',predecessor.id,`${predecessor.tasks[0].id}-structured-reviews`);mkdirSync(reviewStorage);const denied=await queueRecoveryContractChecks(validateQueue(q));assert.ok(denied.some(check=>!check.ok&&check.detail.includes('reviewer storage')));assert.deepEqual(readFileSync(predecessorFile),predecessorBytes,'Rejected predecessor inspection is read-only');rmdirSync(reviewStorage);
    const providerStorage=join(data,'runs',predecessor.id,`${predecessor.tasks[0].id}-agent-reports`);mkdirSync(providerStorage);assert.ok((await queueRecoveryContractChecks(validateQueue(q))).some(check=>!check.ok&&check.detail.includes('provider storage')));rmdirSync(providerStorage);
    const stale=JSON.parse(predecessorBytes.toString('utf8'));stale.status='running';const staleBytes=Buffer.from(JSON.stringify(stale));writeFileSync(predecessorFile,staleBytes);const staleQueue=structuredClone(q);staleQueue.tasks[0].recovery!.preparedCorrection!.prelaunchSuccessor!.canonicalSha256=gisSha(staleBytes);staleQueue.project.approvedApplyContracts![0].preparedCorrection=structuredClone(staleQueue.tasks[0].recovery!.preparedCorrection);
    assert.ok((await queueRecoveryContractChecks(validateQueue(staleQueue))).some(check=>!check.ok));assert.deepEqual(readFileSync(predecessorFile),staleBytes,'A stale-owner predecessor must be rejected without reconciliation writes');writeFileSync(predecessorFile,predecessorBytes);
    writeFileSync(freshGate,checker+'\n// altered gate');assert.ok((await queueRecoveryContractChecks(validateQueue(q))).some(check=>!check.ok));writeFileSync(freshGate,checker);
    const recovered=createRun(validateQueue(q));await markRunReadyForLaunch(recovered);
    const successorClaim=join(data,'runs',source.id,`${failed.id}-prepared-correction-recovery-prelaunch-v1.json`),successorBytes=readFileSync(successorClaim),reload=JSON.parse(JSON.stringify(recovered));
    unlinkSync(successorClaim);await assert.rejects(markRunReadyForLaunch(reload));assert.equal(existsSync(successorClaim),false);writeFileSync(successorClaim,successorBytes,{flag:'wx'});await markRunReadyForLaunch(reload);
    await assert.rejects(markRunReadyForLaunch(createRun(validateQueue(q))),/already reserved/);
    await executeQueue(reload);assert.equal(reload.status,'completed',reload.tasks[0].log.join('\n'));assert.deepEqual(reload.tasks[0].processProgress!.attempts,{executor:1,verification:1,review:1,publication:1});
    assert.deepEqual(readFileSync(sourceFile),sourceBytes);assert.deepEqual(readFileSync(predecessorFile),predecessorBytes);assert.deepEqual(readFileSync(claim),claimBytes);assert.deepEqual(readFileSync(successorClaim),successorBytes);
    const archived=(failed.processProgress!.history.find(h=>h.stage==='analysis-correction')!.receipt as {archived:string}).archived;
    for(const i of [0,1,2])assert.deepEqual(readFileSync(join(f.project,f.runPath,`response-${i}.json`)),readFileSync(join(archived,f.runPath,`response-${i}.json`)));
    assert.equal(JSON.parse(readFileSync(join(f.project,f.state,'quality-coverage.json'),'utf8')).completed,5);
  }finally{if(original.bin===undefined)delete process.env.CODEX_BIN;else process.env.CODEX_BIN=original.bin;if(original.script===undefined)delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT;else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT=original.script;}
});

test("GIS correction obeys a denied hard invocation budget without another analysis or publication", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("correction", "deny"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const run = createRun(f.queue); await executeQueue(run);
    const task = run.tasks[0]; assert.equal(task.status, "failed");
    const admissions = task.executionBudgetEvidence!.filter(e => e.contractType === "ExecutionBudgetAdmissionV1");
    assert.deepEqual(admissions.map(e => e.phase), ["executor", "reviewer", "correction"]);
    assert.notEqual(admissions.at(-1)!.disposition, "allow");
    assert.equal(task.processProgress!.attempts.review, 1); assert.equal(task.processProgress!.attempts.publication, 0);
    assert.equal(existsSync(join(f.project, f.runPath)), false);
    assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 0);
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("GIS repeated review rejection stops without publication and cannot reset through resume", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("correction-repeat"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const run = createRun(f.queue); await executeQueue(run);
    const task = run.tasks[0];
    assert.equal(task.status, "failed"); assert.equal(task.processProgress!.attempts.executor, 2);
    assert.equal(task.processProgress!.history.at(-1)!.result, "repeated-feedback");
    assert.equal(task.processProgress!.attempts.publication, 0);
    assert.equal(JSON.parse(readFileSync(join(f.project, f.state, "quality-coverage.json"), "utf8")).completed, 0);
    assert.equal(existsSync(join(f.project, f.runPath)), false);
    const record = await loadRun(run.id); assert.ok(record); assert.throws(() => resumeRun(record), /deterministic/);
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});

test("large native GIS artifacts have closed whole-change receipts; altered native receipts reject", async () => {
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    const f = fixture("large"); process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    for (const name of ["coverage", "baseline"]) writeFileSync(join(f.project, f.state, `quality-${name}.json`), JSON.stringify({ completed: 0, retainedFixtureData: "x".repeat(40_000) }));
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.status, "completed", run.tasks.map(t => t.log.join("\n")).join("\n"));
    const handoff = run.tasks[1].wholeChangeAcceptanceEvidence!;
    const large = handoff.contentEvidence.filter(e => e.gisNativeEvidence);
    assert.equal(large.length, 2);
    for (const e of large) { assert.equal(e.gisNativeEvidence!.contractType, "GISNativeArtifactEvidenceV1"); assert.equal(e.gisNativeEvidence!.taskId, run.tasks[0].id); assert.equal(e.sha256, gisSha(readFileSync(join(f.project, e.path)))); assert.ok(e.gisNativeEvidence!.byteLength > 16_384); }
    run.tasks[0].gisProgress!.native[0].exitCode = null;
    await assert.rejects(prepareWholeChangeAcceptanceEvidence(run, run.tasks[1]), /NATIVE_EVIDENCE_CHANGED/);
  } finally { if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin; if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script; }
});


test("invocation MCP requires the exact manifest-pinned report schema before provider authority", async () => {
  const f = fixture("registered", undefined, "tools-schema-missing");
  const original = { bin: process.env.CODEX_BIN, script: process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT };
  try {
    process.env.CODEX_BIN = process.execPath; process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = f.provider;
    const run = createRun(f.queue); await executeQueue(run);
    assert.equal(run.tasks[0].status, "failed");
    assert.match(run.tasks[0].log.join("\n"), /Native report schema is not pinned/);
    assert.equal(run.tasks[0].agentToolInvocations?.length ?? 0, 0);
    assert.equal(run.tasks[0].processProgress!.attempts.publication, 0);
  } finally {
    if (original.bin === undefined) delete process.env.CODEX_BIN; else process.env.CODEX_BIN = original.bin;
    if (original.script === undefined) delete process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT; else process.env.ORCHESTRATOR_TEST_CODEX_SCRIPT = original.script;
  }
});
