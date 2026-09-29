import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assertReplayReadback, inventory } from './quality-audit-replay.mjs'

test('q1000-002: finalizer twins do not establish the workspace state transition', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gis-state-regression-'))
  try {
    const state = path.join(root, 'projects/gis2-front/operations/state')
    fs.mkdirSync(state, { recursive: true })
    const digest = s => createHash('sha256').update(s).digest('hex')
    const expected = { 'after-coverage.json': digest('AFTER'), 'after-baseline.json': digest('BASELINE_AFTER'), 'result.json': digest('RESULT') }
    const batch = { run: 'runs/one', results: [{ canonical: 'runs/one/result.json' }] }
    fs.mkdirSync(path.join(root, 'runs/one'), { recursive: true })
    fs.writeFileSync(path.join(root, 'runs/one/result.json'), 'RESULT')
    fs.writeFileSync(path.join(state, 'quality-coverage.json'), 'BEFORE')
    fs.writeFileSync(path.join(state, 'quality-baseline.json'), 'BASELINE_BEFORE')
    assert.throws(() => assertReplayReadback(root, batch, expected), /coverage differs/)
    fs.writeFileSync(path.join(state, 'quality-coverage.json'), 'AFTER')
    assert.throws(() => assertReplayReadback(root, batch, expected), /baseline differs/)
    fs.writeFileSync(path.join(state, 'quality-baseline.json'), 'BASELINE_AFTER')
    assertReplayReadback(root, batch, expected)
    fs.writeFileSync(path.join(root, 'runs/one/result.json'), 'TAMPERED')
    assert.throws(() => assertReplayReadback(root, batch, expected), /result differs/)
  } finally { fs.rmSync(root, { recursive: true }) }
})

test('evidence inventory binds bytes and rejects hard-linked artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gis-evidence-regression-'))
  try {
    fs.writeFileSync(path.join(root, 'one.json'), '{}')
    const before = inventory(root)
    fs.writeFileSync(path.join(root, 'one.json'), '[]')
    assert.notDeepEqual(inventory(root), before)
    fs.linkSync(path.join(root, 'one.json'), path.join(root, 'two.json'))
    assert.throws(() => inventory(root))
  } finally { fs.rmSync(root, { recursive: true }) }
})
