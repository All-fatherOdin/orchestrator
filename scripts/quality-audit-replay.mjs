// Read-only historical evidence intake; native replay writes only a fresh disposable root.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parsePublication } from './quality-audit-isolated.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const load = p => JSON.parse(fs.readFileSync(p, 'utf8'))
function plainPath(target) {
  let current = path.resolve(target)
  while (true) {
    assert.ok(!fs.lstatSync(current).isSymbolicLink(), `Path contains a link: ${current}`)
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
}
export function inventory(root) {
  plainPath(root)
  const result = {}
  const visit = (dir, prefix = '') => {
    const stat = fs.lstatSync(dir)
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Evidence directory must be plain')
    for (const name of fs.readdirSync(dir).sort()) {
      const target = path.join(dir, name), key = prefix ? `${prefix}/${name}` : name
      const st = fs.lstatSync(target)
      assert.ok(!st.isSymbolicLink(), 'Evidence links are forbidden')
      if (st.isDirectory()) visit(target, key)
      else { assert.ok(st.isFile() && st.nlink === 1); result[key] = sha(fs.readFileSync(target)) }
    }
  }
  visit(root)
  return result
}

export function assertReplayReadback(root, batch, expected) {
  for (const name of ['coverage', 'baseline']) {
    const actual = path.join(root, 'projects/gis2-front/operations/state', `quality-${name}.json`)
    assert.equal(sha(fs.readFileSync(actual)), expected[`after-${name}.json`], `Native replay ${name} differs from retained readback`)
  }
  for (const pair of batch.results) {
    assert.equal(sha(fs.readFileSync(path.join(root, pair.canonical))), expected[pair.canonical.slice(batch.run.length + 1)], 'Native replay result differs')
    const report = pair.canonical.replace(/\.json$/, '.md')
    if (expected[report.slice(batch.run.length + 1)]) assert.equal(sha(fs.readFileSync(path.join(root, report))), expected[report.slice(batch.run.length + 1)], 'Native replay report differs')
  }
}

export function replay({ record, manifestFile, taskId, temporaryParent = os.tmpdir() }) {
  const recordBytes = fs.readFileSync(record), run = JSON.parse(recordBytes)
  const manifestBytes = fs.readFileSync(manifestFile)
  const tasks = run.tasks.filter(t => t.id === taskId)
  assert.equal(tasks.length, 1, 'Source task identity must be unique')
  const task = tasks[0], m = load(manifestFile)
  assert.equal(run.status, 'failed')
  assert.equal(task.status, 'failed')
  assert.equal(task.executorOutcome, 'COMPLETED')
  assert.ok(!task.publicationEvidence?.length, 'Published evidence requires reconciliation, never this replay')
  const b = m.batches.find(b => b.id === task.key)
  assert.ok(b)
  assert.ok(typeof b.run === 'string' && !/[\\:*?\[\]\x00-\x1f]/u.test(b.run) && b.run.split('/').every(p => p && p !== '.' && p !== '..'), 'Batch run must be normalized and relative')
  plainPath(record)
  plainPath(manifestFile)
  plainPath(temporaryParent)
  const sourceRoot = path.join(path.dirname(record), `${taskId}-isolated`, 'workspace')
  const source = path.join(sourceRoot, b.run), before = inventory(source)
  const canonicalState = path.join(m.projectRoot, 'projects/gis2-front/operations/state')
  const canonicalBefore = inventory(canonicalState)
  const sourceState = path.join(sourceRoot, 'projects/gis2-front/operations/state')
  const sourceStateBefore = inventory(sourceState)
  const publication = parsePublication(load(path.join(source, 'publication.json')), b)
  const receipt = load(path.join(source, 'receipt.json'))
  assert.equal(receipt.batchId, b.id)
  assert.equal(receipt.headCommit, m.headCommit)
  assert.deepEqual(publication.steps.map(s => s.output), receipt.results.map(r => r.canonical))
  for (const pair of receipt.results) {
    for (const name of ['canonical', 'isolated']) assert.ok(pair[name].startsWith(`${b.run}/`) && !pair[name].split('/').includes('..'))
    assert.equal(before[pair.canonical.slice(b.run.length + 1)], before[pair.isolated.slice(b.run.length + 1)])
    assert.ok(before[pair.canonical.slice(b.run.length + 1)], 'Missing retained result')
  }
  for (const e of m.runtimeEvidence) assert.equal(sha(fs.readFileSync(path.join(m.projectRoot, e.path))), e.sha256, `Runtime changed: ${e.path}`)
  const root = fs.mkdtempSync(path.join(temporaryParent, 'gis-replay-'))
  const target = path.join(root, b.run), state = path.join(root, 'projects/gis2-front/operations/state')
  fs.mkdirSync(target, { recursive: true })
  fs.mkdirSync(state, { recursive: true })
  fs.mkdirSync(path.join(root, '.orchestrator-scratch'))
  for (const [rel, hash] of Object.entries(before)) {
    const bytes = fs.readFileSync(path.join(source, rel))
    assert.equal(sha(bytes), hash)
    fs.mkdirSync(path.dirname(path.join(target, rel)), { recursive: true })
    fs.writeFileSync(path.join(target, rel), bytes, { flag: 'wx' })
  }
  for (const name of ['coverage', 'baseline']) fs.writeFileSync(path.join(state, `quality-${name}.json`), fs.readFileSync(path.join(target, `before-${name}.json`)), { flag: 'wx' })
  const commands = []
  for (const s of publication.steps) {
    fs.unlinkSync(path.join(root, s.output))
    const md = path.join(root, s.output.replace(/\.json$/, '.md'))
    if (fs.existsSync(md)) fs.unlinkSync(md)
    const args = ['--require', fileURLToPath(new URL('./sandbox-file-stdio.cjs', import.meta.url)), path.join(m.projectRoot, m.runtime, 'quality-catch-up-orchestrator.mjs'), 'finalize',
      '--repo', m.auditRoot, '--config', path.join(m.projectRoot, m.runtime, 'config.json'), '--preflight', path.join(target, 'preflight.json'),
      '--coverage', path.join(state, 'quality-coverage.json'), '--baseline', path.join(state, 'quality-baseline.json'), '--state-dir', state]
    for (const [key, flag] of [['selection','selection'],['manifest','manifest'],['completion','completion'],['artifactDir','artifact-dir'],['output','output']]) args.push(`--${flag}`, path.join(root, s[key]))
    const result = spawnSync(process.execPath, args, { cwd: root, env: { ...process.env, ORCHESTRATOR_ARTIFACT_WORKSPACE: root }, timeout: 300000, windowsHide: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    const command = { executable: process.execPath, args, exitCode: result.status, signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }
    commands.push(command)
    fs.writeFileSync(path.join(root, 'native-commands.json'), JSON.stringify(commands, null, 2))
    assert.equal(result.error, undefined, `Native replay process failed; evidence: ${root}`)
    assert.equal(result.status, 0, `Native replay rejected; evidence: ${root}; ${result.stderr}`)
  }
  assertReplayReadback(root, { ...b, results: receipt.results }, before)
  assert.deepEqual(inventory(source), before, 'Historical artifacts changed during replay')
  assert.deepEqual(inventory(sourceState), sourceStateBefore, 'Historical workspace state changed during replay')
  assert.deepEqual(inventory(canonicalState), canonicalBefore, 'Canonical state changed during replay')
  assert.equal(sha(fs.readFileSync(record)), sha(recordBytes), 'Canonical source record changed')
  assert.equal(sha(fs.readFileSync(manifestFile)), sha(manifestBytes), 'Queue manifest changed during replay')
  for (const e of m.runtimeEvidence) assert.equal(sha(fs.readFileSync(path.join(m.projectRoot, e.path))), e.sha256, `Runtime changed during replay: ${e.path}`)
  const report = { status: 'native-replay-matched', root, sourceRunId: run.id, sourceTaskId: taskId, record, recordSha256: sha(recordBytes), source, files: before,
    manifestFile: path.resolve(manifestFile), manifestSha256: sha(manifestBytes), interpreter: { executable: process.execPath, version: process.version },
    sourceStateBefore, canonicalBefore,
    executorInvocations: 0, canonicalMutation: false, sandbox: 'host-process; restricted-token execution not tested', commands: commands.map(({ stdout, stderr, ...c }) => c) }
  fs.writeFileSync(path.join(root, 'replay-report.json'), JSON.stringify(report, null, 2))
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [record, manifestFile, taskId] = process.argv.slice(2)
  console.log(JSON.stringify(replay({ record, manifestFile, taskId }), null, 2))
}
