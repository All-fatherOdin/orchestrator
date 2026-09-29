import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {checkCompletedCell} from './profile-gate.mjs'
const [manifestFile,phase,id]=process.argv.slice(2),m=JSON.parse(fs.readFileSync(manifestFile)),root=process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE||m.projectRoot
const load=p=>JSON.parse(fs.readFileSync(p)),hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),semantic=v=>createHash('sha256').update(JSON.stringify(v,null,2)+'\n').digest('hex')
const lib=await import(pathToFileURL(path.join(m.projectRoot,m.runtime,'quality-coverage-lib.mjs')).href),profiles=lib.compileScope(load(path.join(m.projectRoot,m.runtime,'config.json'))).profiles
const state=m.statePath,flatten=c=>new Map(c.files.flatMap(f=>f.cells.map(cell=>[`${cell.profile}:${f.path}`,{blobSha:f.blobSha,cell}])));
for(const e of m.runtimeEvidence)assert.equal(hash(path.join(m.projectRoot,e.path)),e.sha256)
for(const e of m.protectedState)assert.equal(hash(path.join(root,e.path)),e.sha256)
assert.deepEqual(fs.readdirSync(path.join(root,state)).sort(),[...m.protectedState.map(e=>path.basename(e.path)),'quality-coverage.json','quality-baseline.json'].sort())
const batches=phase==='final'?m.batches:[m.batches.find(b=>b.id===id)];assert.ok(batches.every(Boolean))
for(const b of batches){
 const folder=path.join(root,b.run),before=load(path.join(folder,'before-coverage.json')),after=load(path.join(folder,'after-coverage.json')),a=flatten(before),z=flatten(after),owned=new Set(b.cells.map(c=>`${b.profile}:${c.path}`));
 assert.deepEqual(lib.validateCoverageState(after,profiles),[]);assert.deepEqual([...a.keys()],[...z.keys()]);assert.equal(owned.size,2);let completed=0;
 for(const[k,prior]of a){if(!owned.has(k))assert.deepEqual(z.get(k),prior,`unowned cell changed ${k}`);else{assert.equal(z.get(k).blobSha,prior.blobSha);assert.equal(z.get(k).cell.status,'completed');assert.equal(z.get(k).cell.completedHead,m.headCommit);checkCompletedCell(b.profile,z.get(k).cell,k);completed++}}
 assert.equal(completed,2);assert.equal(after.stats.completed,before.stats.completed+2);assert.equal(after.stats.openCells,before.stats.openCells-2);
 const prepared=load(path.join(folder,'manifest.json'));assert.equal(prepared.privateStateMutationAllowed,false);assert.equal(prepared.status,'prepared');const receipt=load(path.join(folder,'receipt.json')),publication=load(path.join(folder,'publication.json'));assert.equal(receipt.results.length,1);assert.deepEqual(publication.steps.map(s=>s.output),receipt.results.map(r=>r.canonical));
 const refs=new Set(m.runtimeEvidence.map(e=>e.sha256));const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(e.name.endsWith('.json'))refs.add(hash(p))}};walk(folder);
 for(const pair of receipt.results){assert.equal(hash(path.join(root,pair.canonical)),hash(path.join(root,pair.isolated)));assert.equal(hash(path.join(root,pair.canonical.replace(/\.json$/,'.md'))),hash(path.join(root,pair.isolated.replace(/\.json$/,'.md'))));const result=load(path.join(root,pair.canonical));assert.equal(result.status,'success');assert.equal(result.privateStateMutationAllowed,true);assert.equal(result.customerRepositoryMutationAllowed,false);assert.equal(result.coverageDelta.selectedCells,2);assert.equal(result.coverageDelta.completedCells,2);assert.ok(result.verification.evidenceRefs.includes(`coverage-before:sha256:${semantic(before)}`));assert.ok(result.verification.evidenceRefs.includes(`coverage-after:sha256:${semantic(after)}`));for(const ref of result.verification.evidenceRefs)assert.ok(refs.has(ref.split(':').at(-1)),`missing native input ${ref}`);execFileSync(process.execPath,[path.join(m.projectRoot,m.runtime,'validate-contracts.mjs'),'--run-result',path.join(root,pair.canonical)],{stdio:'pipe',windowsHide:true,cwd:path.join(m.projectRoot,m.runtime)})}
 const index=m.batches.indexOf(b),previous=index?path.join(m.projectRoot,m.batches[index-1].run,'after-coverage.json'):m.initialCoverage;assert.equal(hash(path.join(folder,'before-coverage.json')),hash(previous));
 for(const name of ['coverage','baseline']){if(index)assert.equal(hash(path.join(folder,`before-${name}.json`)),hash(path.join(m.projectRoot,m.batches[index-1].run,`after-${name}.json`)));if(phase!=='final'||b===m.batches.at(-1))assert.equal(hash(path.join(folder,`after-${name}.json`)),hash(path.join(root,state,`quality-${name}.json`)))}
}
if(phase==='final'){const first=load(path.join(root,m.batches[0].run,'before-coverage.json')),last=load(path.join(root,state,'quality-coverage.json'));assert.equal(last.stats.completed,first.stats.completed+4);assert.equal(last.stats.openCells,first.stats.openCells-4)}
console.log(JSON.stringify({status:'passed',phase,batches:batches.length,selectedCells:batches.length*2,completedCells:batches.length*2,stateMutation:false}))
