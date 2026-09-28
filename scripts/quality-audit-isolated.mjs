// Trusted host bridge for a pinned GIS audit queue. Never execute agent-authored commands.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export function insideRun(run, value) {
  assert.equal(typeof value, 'string')
  assert.ok(value.startsWith(`${run}/`) && !value.includes('\\') && !value.includes(':') && value.split('/').every(p => p && p !== '.' && p !== '..'), 'Evidence path must stay in the exact owned run')
  return value
}

export function parsePublication(value, batch) {
  assert.deepEqual(Object.keys(value).sort(), ['batchId', 'schemaVersion', 'steps'])
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.batchId, batch.id)
  assert.ok(Array.isArray(value.steps) && value.steps.length > 0 && value.steps.length <= 10)
  const outputs = new Set()
  for (const s of value.steps) {
    assert.deepEqual(Object.keys(s).sort(), ['artifactDir', 'completion', 'manifest', 'output', 'selection'])
    for (const p of Object.values(s)) insideRun(batch.run, p)
    assert.ok(s.output.endsWith('.json'), 'Native result must be JSON')
    assert.ok(!outputs.has(s.output), 'Duplicate output')
    outputs.add(s.output)
  }
  return value
}

export function main([phase, manifestFile, batchId]) {
  assert.ok(['verify', 'publish'].includes(phase))
  const load = p => JSON.parse(fs.readFileSync(p, 'utf8'))
  const m = load(manifestFile), b = m.batches.find(b => b.id === batchId)
  assert.ok(b)
  const dir = path.dirname(manifestFile)
  const stage = process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE
  assert.ok(stage && path.isAbsolute(stage) && path.resolve(stage) !== path.resolve(m.projectRoot))
  assert.equal(path.resolve(process.env.ORCHESTRATOR_CANONICAL_PROJECT), path.resolve(m.projectRoot))
  const stageRun = path.join(stage, b.run)
  const publication = parsePublication(load(path.join(stageRun, 'publication.json')), b)
  const gate = (mode, staged) => execFileSync(process.execPath, [path.join(dir, 'gate.mjs'), mode, b.id], {
    env: { ...process.env, ORCHESTRATOR_ARTIFACT_WORKSPACE: staged ? stage : '', ORCHESTRATOR_PUBLICATION_HOST: staged ? '' : '1' }, windowsHide: true, stdio: 'pipe', cwd: m.projectRoot,
  })
  gate('after', true)
  const receipt = load(path.join(stageRun, 'receipt.json'))
  assert.deepEqual(publication.steps.map(s => s.output), receipt.results.map(r => r.canonical), 'Publication must replay exactly the verified result chain')
  if (phase === 'verify') {
    console.log(JSON.stringify({ status: 'passed', batchId, steps: publication.steps.length, stateMutation: false }))
    return
  }
  const git = args => execFileSync('git', args, { cwd: m.projectRoot, encoding: 'utf8', windowsHide: true }).trim()
  git(['fetch', 'origin', 'main'])
  assert.equal(git(['rev-parse', 'HEAD']), git(['rev-parse', 'origin/main']), 'Memory requires fast-forward; stop and regenerate pinned queue')
  gate('before', false)
  // All source bytes, links, output identities and hashes are checked before copying.
  const entries = []
  const walk = (folder, rel = '') => {
    for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, e.name), key = rel ? `${rel}/${e.name}` : e.name
      const st = fs.lstatSync(file)
      assert.ok(!st.isSymbolicLink() && (st.isFile() || st.isDirectory()), 'No links or special artifacts')
      if (st.isDirectory()) walk(file, key)
      else { assert.equal(st.nlink, 1); entries.push([key, fs.readFileSync(file)]) }
    }
  }
  walk(stageRun)
  const hashes = new Map(entries.map(([p, bytes]) => [`${b.run}/${p}`, createHash('sha256').update(bytes).digest('hex')]))
  for (const step of publication.steps) for (const p of [step.selection, step.manifest, step.completion, step.output]) assert.ok(hashes.has(p))
  const destination = path.join(m.projectRoot, b.run)
  let ancestor = path.dirname(destination)
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
  assert.equal(fs.realpathSync(ancestor).toLowerCase(), path.resolve(ancestor).toLowerCase(), 'Publication parent cannot redirect through a junction')
  assert.ok(!fs.existsSync(destination), 'Existing publication requires reconciliation, never overwrite')
  fs.mkdirSync(destination, { recursive: true })
  const outputs = new Set(publication.steps.flatMap(s => [s.output, s.output.replace(/\.json$/, '.md')]))
  for (const [rel, bytes] of entries) {
    if (outputs.has(`${b.run}/${rel}`)) continue
    const target = path.join(destination, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes, { flag: 'wx' })
  }
  const state = path.join(m.projectRoot, 'projects/gis2-front/operations/state')
  const native = path.join(m.projectRoot, m.runtime, 'quality-catch-up-orchestrator.mjs')
  for (const s of publication.steps) {
    const args = ['finalize', '--repo', m.auditRoot, '--config', path.join(m.projectRoot, m.runtime, 'config.json'), '--preflight', path.join(dir, 'preflight.json'),
      '--coverage', path.join(state, 'quality-coverage.json'), '--baseline', path.join(state, 'quality-baseline.json'), '--state-dir', state]
    for (const [key, option] of [['selection', 'selection'], ['manifest', 'manifest'], ['completion', 'completion'], ['artifactDir', 'artifact-dir'], ['output', 'output']]) args.push(`--${option}`, path.join(m.projectRoot, s[key]))
    execFileSync(process.execPath, [native, ...args], { cwd: m.projectRoot, windowsHide: true, stdio: 'pipe', timeout: 300000 })
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(m.projectRoot, s.output))).digest('hex'), hashes.get(s.output), 'Native publication differs from reviewed dry run; stop without retry')
    const report = s.output.replace(/\.json$/, '.md')
    if (hashes.has(report)) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(m.projectRoot, report))).digest('hex'), hashes.get(report), 'Native report differs from reviewed dry run')
  }
  gate('after', false)
  console.log(JSON.stringify({ status: 'published', batchId, steps: publication.steps.length, nativeFinalizer: true }))
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main(process.argv.slice(2))
