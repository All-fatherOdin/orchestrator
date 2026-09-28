import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { main, parsePublication } from './quality-audit-isolated.mjs'

test('Описание публикации отвергает команды, обход пути и повтор результата', () => {
  const b = { id: 'one', run: 'runs/one' }
  const step = { selection: 'runs/one/selection.json', manifest: 'runs/one/manifest.json', completion: 'runs/one/completion.json', artifactDir: 'runs/one/artifacts', output: 'runs/one/result.json' }
  const good = { schemaVersion: 1, batchId: 'one', steps: [step] }
  assert.deepEqual(parsePublication(good, b), good)
  for (const output of ['runs/one/../other/result.json', 'C:/result.json', 'runs/two/result.json', 'runs/one\\result.json'])
    assert.throws(() => parsePublication({ ...good, steps: [{ ...step, output }] }, b))
  assert.throws(() => parsePublication({ ...good, steps: [step, step] }, b))
  assert.throws(() => parsePublication({ ...good, command: 'anything' }, b))
})

test('Хост проверяет цепочку и повторяет финализатор, не копируя staged state в canonical', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-publish-test-'))
  const project = path.join(root, 'memory'), stage = path.join(root, 'sealed'), dir = path.join(root, 'queue')
  for (const p of [project, stage, dir]) fs.mkdirSync(p)
  const git = args => execFileSync('git', args, { cwd: project, stdio: 'pipe' })
  git(['init', '-q', '-b', 'main'])
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'fixture'])
  git(['remote', 'add', 'origin', project])
  const run = 'projects/gis2-front/operations/runs/one'
  const state = 'projects/gis2-front/operations/state'
  fs.mkdirSync(path.join(project, state), { recursive: true })
  fs.writeFileSync(path.join(project, state, 'quality-coverage.json'), 'ORIGINAL')
  fs.writeFileSync(path.join(project, state, 'quality-baseline.json'), 'BASELINE')
  fs.mkdirSync(path.join(stage, run), { recursive: true })
  const write = (p, value) => fs.writeFileSync(path.join(stage, run, p), JSON.stringify(value))
  const step = { selection: `${run}/selection.json`, manifest: `${run}/manifest.json`, completion: `${run}/completion.json`, artifactDir: `${run}/artifacts`, output: `${run}/result.json` }
  for (const name of ['selection.json','manifest.json','completion.json']) write(name, {})
  write('result.json', { native: true })
  fs.writeFileSync(path.join(stage, run, 'result.md'), 'NATIVE_REPORT')
  write('receipt.json', { results: [{ canonical: step.output }] })
  write('publication.json', { schemaVersion: 1, batchId: 'one', steps: [step] })
  fs.mkdirSync(path.join(stage, state), { recursive: true })
  fs.writeFileSync(path.join(stage, state, 'quality-coverage.json'), 'DO_NOT_COPY')
  fs.writeFileSync(path.join(dir, 'gate.mjs'), `import fs from 'node:fs';import assert from 'node:assert/strict';if(process.argv[2]==='before')assert.equal(fs.readFileSync('${state}/quality-coverage.json','utf8'),'ORIGINAL');`)
  fs.mkdirSync(path.join(project, 'runtime'))
  fs.writeFileSync(path.join(project, 'runtime', 'quality-catch-up-orchestrator.mjs'), `import fs from 'node:fs';import assert from 'node:assert/strict';const a=process.argv.slice(2),v=k=>a[a.indexOf('--'+k)+1];assert.equal(a[0],'finalize');assert.equal(fs.readFileSync(v('coverage'),'utf8'),'ORIGINAL');assert.ok(!fs.existsSync(v('output').replace(/\\.json$/,'.md')));fs.writeFileSync(v('coverage'),'NATIVE_UPDATE');fs.writeFileSync(v('output'),JSON.stringify({native:true}),{flag:'wx'});fs.writeFileSync(v('output').replace(/\\.json$/,'.md'),'NATIVE_REPORT',{flag:'wx'});`)
  const manifest = path.join(dir, 'manifest.json')
  fs.writeFileSync(manifest, JSON.stringify({projectRoot:project,runtime:'runtime',auditRoot:project,batches:[{id:'one',run}]}))
  const previous = [process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE, process.env.ORCHESTRATOR_CANONICAL_PROJECT]
  process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE = stage
  process.env.ORCHESTRATOR_CANONICAL_PROJECT = project
  try {
    main(['verify', manifest, 'one'])
    assert.equal(fs.readFileSync(path.join(project,state,'quality-coverage.json'),'utf8'),'ORIGINAL')
    main(['publish', manifest, 'one'])
    assert.equal(fs.readFileSync(path.join(project,state,'quality-coverage.json'),'utf8'),'NATIVE_UPDATE')
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project,step.output))),{native:true})
    assert.throws(()=>main(['publish',manifest,'one']))
  } finally {
    for (const [i,k] of ['ORCHESTRATOR_ARTIFACT_WORKSPACE','ORCHESTRATOR_CANONICAL_PROJECT'].entries()) {
      if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i]
    }
  }
})
