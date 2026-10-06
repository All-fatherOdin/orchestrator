import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { evidenceDirectory } from './evidence-directory.mjs'
import { checkCompletedCell, checkCandidateValidation, checkReviewedFiles } from './profile-gate.mjs'

test('explicit evidence directory preserves ordered phase/batch and rejects implicit roots', () => {
  const argv = ['node', 'gate', '--evidence-dir', os.tmpdir(), 'after', 'q1000-001']
  assert.equal(evidenceDirectory(argv), path.resolve(os.tmpdir()))
  assert.deepEqual(argv.slice(2), ['after', 'q1000-001'])
  for (const args of [[], ['after'], ['--evidence-dir', 'relative']])
    assert.throws(() => evidenceDirectory(['node', 'gate', ...args]))
})

test('candidate completion requires successful matching validation and exact reviewed membership', () => {
  for (const profile of ['shared-ui-bypass', 'duplicate-implementation']) {
    checkCompletedCell(profile, {}, 'cell')
    const v = { status: 'success', profile, headCommit: 'head', coverageCompletionAllowed: true,
      reviews: [{ disposition: 'confirmed' }], reviewedFiles: ['b', 'a'] }
    assert.deepEqual(checkCandidateValidation(v, profile, 'head'), ['b', 'a'])
    checkReviewedFiles(v.reviewedFiles, ['a', 'b'])
    for (const change of [{ status: 'failed' }, { profile: 'security-risk' }, { headCommit: 'other' },
      { coverageCompletionAllowed: false }, { reviews: [{ disposition: 'limitation' }] }])
      assert.throws(() => checkCandidateValidation({ ...v, ...change }, profile, 'head'))
  }
  assert.throws(() => checkReviewedFiles(['a', 'a'], ['a', 'b']))
  assert.throws(() => checkReviewedFiles(['a'], ['a', 'b']))
  assert.throws(() => checkCompletedCell('unknown', {}, 'cell'))
  for (const profile of ['business-logic-regression', 'security-risk', 'performance-regression']) {
    assert.throws(() => checkCompletedCell(profile, {}, 'cell'))
    checkCompletedCell(profile, { dependencyFootprint: ['dependency'] }, 'cell')
  }
})

test('source gate verifies all 17 accepted packages and fails on changed bound evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-source-gate-'))
  const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value))
  const gate = fileURLToPath(new URL('./source-gate.mjs', import.meta.url))
  const invoke = () => execFileSync(process.execPath, [gate, '--evidence-dir', dir], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  try {
    write('artifact.json', { value: 1 })
    const completed = Array.from({ length: 17 }, (_, i) => ({ taskId: `t${i}`, key: `k${i}`,
      files: [{ path: 'artifact.json', sha256: hash(path.join(dir, 'artifact.json')) }] }))
    write('run.json', { id: 'source', tasks: [...completed.map(t => ({ id: t.taskId, key: t.key,
      status: 'completed', reviewStatus: 'approved' })), { id: 'failed', status: 'failed', processProgress: { phase: 'finalized' } }] })
    write('manifest.json', { projectRoot: dir })
    write('source-binding.json', { records: [{ path: path.join(dir, 'run.json'), sha256: hash(path.join(dir, 'run.json')) }],
      completed, unpublishedTask: { runId: 'source', taskId: 'failed' } })
    assert.deepEqual(JSON.parse(invoke()), { status: 'passed', acceptedPackages: 17, readOnly: true })
    write('artifact.json', { value: 2 })
    assert.throws(invoke)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
