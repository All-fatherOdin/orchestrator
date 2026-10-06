import { evidenceDirectory } from './evidence-directory.mjs'
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkCompletedCell, checkCandidateValidation, checkReviewedFiles } from './profile-gate.mjs'

const dir = evidenceDirectory()
const load = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const m = load(path.join(dir, 'manifest.json'))
const staged = process.argv[2] === 'after' && process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE;
const root = staged || m.projectRoot;
assert.equal(createHash('sha256').update(fs.readFileSync(m.stdioAdapter.path)).digest('hex'), m.stdioAdapter.sha256, 'Stdio adapter changed');
const state = path.join(root, 'projects/gis2-front/operations/state')
const sha = data => createHash('sha256').update(data).digest('hex')
const hash = file => sha(fs.readFileSync(file))
for (const e of m.mechanicalEvidence || []) assert.equal(hash(e.path), e.sha256, 'Queue implementation changed')
const semanticHash = value => sha(`${JSON.stringify(value, null, 2)}\n`)
const lib = await import(pathToFileURL(path.join(m.projectRoot, m.runtime, 'quality-coverage-lib.mjs')))
const profiles = lib.compileScope(load(path.join(m.projectRoot, m.runtime, 'config.json'))).profiles
const [phase, batchId] = process.argv.slice(2)
if (phase === 'before' && process.env.ORCHESTRATOR_PUBLICATION_HOST !== '1') {
  assert.ok(process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE, 'Requires isolated-artifacts-capable runner; old installed app must not execute this queue')
  assert.equal(path.resolve(process.env.ORCHESTRATOR_CANONICAL_PROJECT), path.resolve(m.projectRoot))
}
assert.ok(['before', 'after', 'final', 'plan', 'prefix'].includes(phase), 'Unknown gate phase')
const batch = m.batches.find(b => b.id === batchId)
if (['before', 'after', 'prefix'].includes(phase)) assert.ok(batch, 'Unknown batch')
for (const e of m.runtimeEvidence) assert.equal(hash(path.join(m.projectRoot, e.path)), e.sha256);
for (const e of m.protectedState) assert.equal(hash(path.join(root, e.path)), e.sha256)
assert.deepEqual(fs.readdirSync(state).sort(), [...m.protectedState.map(e => path.basename(e.path)), 'quality-coverage.json', 'quality-baseline.json'].sort(), 'Unexpected state file or leftover lock/temp')
for (const b of m.batches) assert.equal(hash(path.join(dir, b.blockPath)), b.blockSha256)
const git = args => execFileSync('git', args, { cwd: m.auditRoot, encoding: 'utf8', windowsHide: true }).trim()
if (m.launchEvidence) {
  assert.equal(hash(m.launchEvidence.preflightPath), m.launchEvidence.preflightSha256, 'Prepared preflight changed')
  const { assertQualityPreflight } = await import(pathToFileURL(path.join(m.projectRoot, m.runtime, 'quality-preflight-lib.mjs')))
  assertQualityPreflight(load(m.launchEvidence.preflightPath), m.auditRoot, git, { requireBranchUpdateProof: true })
  for (const ref of ['HEAD', 'origin/main']) {
    assert.equal(execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), m.launchEvidence.memoryHead, 'Memory Git identity changed')
  }
}
assert.equal(hash(path.join(dir, 'preflight.json')), m.preflightSha256, 'Preflight changed');
const { assertQualityPreflight } = await import(pathToFileURL(path.join(m.projectRoot, m.runtime, 'quality-preflight-lib.mjs')));
assertQualityPreflight(load(path.join(dir, 'preflight.json')), m.auditRoot, git, { requireBranchUpdateProof: true });
assert.equal(git(['rev-parse', 'HEAD']), m.headCommit, 'Audit HEAD changed')
assert.equal(git(['branch', '--show-current']), 'dev')
assert.equal(git(['status', '--porcelain']), '', 'Audit worktree dirty')
const canonical = load(path.join(state, 'quality-coverage.json'))
assert.equal(canonical.lastHeadCommit, m.headCommit)
assert.deepEqual(lib.validateCoverageState(canonical, profiles), [])
const key = (f, c) => `${c.profile}:${f.path}`
const flatten = c => new Map(c.files.flatMap(f => f.cells.map(cell => [key(f, cell), { blobSha: f.blobSha, cell }])))
const initial = load(path.join(dir, 'initial-coverage.json'))
const initialMap = flatten(initial)
const planned = m.batches.flatMap(b => b.cells.map(c => `${b.profile}:${c.path}`))
assert.equal(planned.length, m.totalCells)
assert.equal(new Set(planned).size, m.totalCells)
assert.equal(m.batches.length, 77)
for (const b of m.batches) {
  assert.equal(b.cells.length, b.id === 'q1000-002' ? 10 : 5)
  for (const c of b.cells) {
    const previous = initialMap.get(`${b.profile}:${c.path}`)
    assert.equal(previous?.blobSha, c.blobSha)
    assert.equal(previous.cell.status, c.priorStatus)
    assert.ok(['invalidated', 'omitted', 'pending', 'failed'].includes(c.priorStatus))
  }
}
const coveragePath = (b, when) => path.join(root, b.run, `${when}-coverage.json`)
const baselinePath = (b, when) => path.join(root, b.run, `${when}-baseline.json`)
function checkBatch(b, compareCanonical) {
  const before = load(coveragePath(b, 'before'))
  const after = load(coveragePath(b, 'after'))
  if (true) {
    assert.ok(Date.parse(after.updatedAt)>=Date.parse(before.updatedAt), 'Coverage timestamp regressed')
    assert.ok(Date.parse(load(baselinePath(b,'after')).updatedAt)>=Date.parse(load(baselinePath(b,'before')).updatedAt), 'Baseline timestamp regressed')
  }
  assert.deepEqual(lib.validateCoverageState(after, profiles), [])
  assert.equal(after.lastHeadCommit, m.headCommit)
  const a = flatten(before), z = flatten(after)
  assert.deepEqual([...a.keys()], [...z.keys()], 'Inventory changed')
  const owned = new Set(b.cells.map(c => `${b.profile}:${c.path}`))
  let completed = 0
  for (const [k, prior] of a) {
    if (!owned.has(k)) assert.deepEqual(z.get(k), prior, `Unowned cell changed: ${k}`)
    else {
      const cell = z.get(k).cell
      assert.equal(z.get(k).blobSha, prior.blobSha)
      assert.ok(['completed', 'omitted', 'failed'].includes(cell.status), `Unreviewed cell: ${k}`)
      if (cell.status === 'completed') {
        completed++
        assert.equal(cell.completedHead, m.headCommit)
        checkCompletedCell(b.profile, cell, k)
      }
    }
  }
  const receipt = load(path.join(root, b.run, 'receipt.json'))
  assert.equal(receipt.batchId, b.id)
  assert.equal(receipt.headCommit, m.headCommit)
  assert.ok(receipt.results.length > 0)
  const availableHashes = new Set(m.runtimeEvidence.map(e => e.sha256))
  const evidenceByHash = new Map()
  function collectEvidence(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'audit-checkout' || entry.name === '.git') continue
      const file = path.join(folder, entry.name)
      if (entry.isDirectory()) collectEvidence(file)
      else if (entry.name.endsWith('.json')) {
        availableHashes.add(hash(file))
        evidenceByHash.set(hash(file), file)
      }
    }
  }
  collectEvidence(path.join(root, b.run))
  let selectedTotal = 0, completedTotal = 0
  const candidateReviewed = []
  let expectedBefore = semanticHash(before)
  const seen = new Set()
  let lastResult
  for (const pair of receipt.results) {
    for (const p of [pair.canonical, pair.isolated]) {
      assert.ok(p.startsWith(`${b.run}/`) && !p.split('/').includes('..'), 'Result outside owned directory')
    }
    assert.ok(!seen.has(pair.canonical), 'Duplicate result')
    seen.add(pair.canonical)
    const resultFile = path.join(root, pair.canonical)
    const result = load(resultFile)
    assert.equal(hash(resultFile), hash(path.join(root, pair.isolated)), 'Isolated/canonical result differs')
    execFileSync(process.execPath, [path.join(m.projectRoot, m.runtime, 'validate-contracts.mjs'), '--run-result', resultFile], { cwd: path.join(m.projectRoot, 'projects/gis2-front/workspace'), windowsHide: true, stdio: 'pipe' })
    assert.equal(result.status, 'success')
    assert.equal(result.headCommit, m.headCommit)
    const refs = result.verification.evidenceRefs
    for (const ref of refs) {
      const evidenceHash = ref.match(/:sha256:([a-f0-9]{64})$/u)?.[1]
      assert.ok(evidenceHash && availableHashes.has(evidenceHash), `Missing hashed input artifact: ${ref}`)
    }
    assert.ok(refs.includes(`coverage-before:sha256:${expectedBefore}`), 'Broken native result chain')
    expectedBefore = refs.find(r => r.startsWith('coverage-after:sha256:'))?.split(':').at(-1)
    assert.ok(expectedBefore)
    for (const p of result.profileResults) {
      assert.equal(p.profile, b.profile)
      selectedTotal += p.selectedCells
      completedTotal += p.completedCells
    }
    if (['shared-ui-bypass', 'duplicate-implementation'].includes(b.profile)) {
      const ref = refs.find(r => r.startsWith(`profile-${b.profile}:sha256:`))
      assert.ok(ref, 'Missing candidate validation binding')
      const validation = load(evidenceByHash.get(ref.split(':').at(-1)))
      assert.equal(validation.status, 'success')
      assert.equal(validation.profile, b.profile)
      assert.equal(validation.headCommit, m.headCommit)
      if (result.profileResults.some(p => p.completedCells > 0)) {
        candidateReviewed.push(...checkCandidateValidation(validation, b.profile, m.headCommit))
      }
    }
    lastResult = result
  }
  assert.equal(selectedTotal, b.cells.length)
  assert.equal(completedTotal, completed)
  if (['shared-ui-bypass', 'duplicate-implementation'].includes(b.profile)) {
    const completedFiles = b.cells.filter(c => z.get(`${b.profile}:${c.path}`).cell.status === 'completed').map(c => c.path)
    checkReviewedFiles(candidateReviewed, completedFiles)
  }
  assert.equal(expectedBefore, semanticHash(after), 'Final result does not bind readback')
  assert.ok(lastResult.verification.evidenceRefs.includes(`baseline:sha256:${semanticHash(load(baselinePath(b, 'after')))}`))
  const index = m.batches.indexOf(b)
  const expectedCoverage = index ? path.join(m.projectRoot, m.batches[index - 1].run, 'after-coverage.json') : path.join(dir, 'initial-coverage.json')
  const expectedBaseline = index ? path.join(m.projectRoot, m.batches[index - 1].run, 'after-baseline.json') : path.join(dir, 'initial-baseline.json')
  assert.equal(hash(coveragePath(b, 'before')), hash(expectedCoverage), 'Coverage predecessor mismatch')
  assert.equal(hash(baselinePath(b, 'before')), hash(expectedBaseline), 'Baseline predecessor mismatch')
  if (compareCanonical) {
    assert.equal(hash(coveragePath(b, 'after')), hash(path.join(state, 'quality-coverage.json')))
    assert.equal(hash(baselinePath(b, 'after')), hash(path.join(state, 'quality-baseline.json')))
  }
  return completed
}
if (phase === 'plan' || phase === 'before') {
  const index = batch ? m.batches.indexOf(batch) : 0
  const expectedCoverage = index ? coveragePath(m.batches[index - 1], 'after') : path.join(dir, 'initial-coverage.json')
  const expectedBaseline = index ? baselinePath(m.batches[index - 1], 'after') : path.join(dir, 'initial-baseline.json')
  assert.equal(hash(path.join(state, 'quality-coverage.json')), hash(expectedCoverage))
  assert.equal(hash(path.join(state, 'quality-baseline.json')), hash(expectedBaseline))
  if (batch) assert.ok(!fs.existsSync(path.join(root, batch.run)), 'Run directory already exists; inspect receipt instead of replay')
}
let completed
if (phase === 'after') completed = checkBatch(batch, true)
if (phase === 'prefix') {
  const prefix=m.batches.slice(0,m.batches.indexOf(batch)+1)
  completed=prefix.reduce((sum,b,index)=>sum+checkBatch(b,index===prefix.length-1),0)
  assert.equal(canonical.stats.completed,initial.stats.completed+completed)
  assert.equal(canonical.stats.openCells,initial.stats.openCells-completed)
}
if (phase === 'final') {
  completed = m.batches.reduce((sum, b, index) => sum + checkBatch(b, index === m.batches.length - 1), 0)
  assert.equal(canonical.stats.completed, initial.stats.completed + completed)
  assert.equal(canonical.stats.openCells, initial.stats.openCells - completed)
}
console.log(JSON.stringify({ status: 'passed', phase, batchId, plannedCells: m.totalCells, completed, stateMutation: false }))
