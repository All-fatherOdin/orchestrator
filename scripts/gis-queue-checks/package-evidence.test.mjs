import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { assertPackageEvidence } from './package-evidence.mjs'
const hash = value => createHash('sha256').update(`${JSON.stringify(value, null, 2)}\n`).digest('hex')
const fixture = () => {
  const before = { files: [{ path: 'a.ts', blobSha: 'a', cells: [{ profile: 'p', status: 'pending' }, { profile: 'sibling', status: 'pending' }] }, { path: 'b.ts', blobSha: 'b', cells: [{ profile: 'p', status: 'pending' }] }] }
  const after = structuredClone(before); after.files[0].cells[0].status = 'completed'; after.files[1].cells[0].status = 'omitted'
  const middle = structuredClone(before); middle.files[0].cells[0].status = 'completed'
  const result = (a, b, completed) => ({ status: 'success', verification: { evidenceRefs: [`coverage-before:sha256:${hash(a)}`, `coverage-after:sha256:${hash(b)}`] }, profileResults: [{ profile: 'p', selectedCells: 1, completedCells: completed }] })
  return { batch: { id: 'batch', profile: 'p', cells: [{ path: 'a.ts' }, { path: 'b.ts' }] }, before, after, receipt: { batchId: 'batch', results: [{ canonical: 'one' }, { canonical: 'two' }] }, results: [result(before, middle, 1), result(middle, after, 0)] }
}
test('multiple native records accumulate exact totals, preserve siblings and include zero', () => {
  assert.deepEqual(assertPackageEvidence(fixture()), { selected: 2, completed: 1, omitted: 1, failed: 0 })
})
test('null, absent counts, duplicates, near-match profiles and sibling changes fail closed', () => {
  for (const mutate of [f => { f.results[1].profileResults[0].completedCells = null }, f => { delete f.results[1].profileResults[0].completedCells }, f => { f.receipt.results[1].canonical = 'one' }, f => { f.results[1].profileResults[0].profile = 'p ' }, f => { f.after.files[0].cells[1].status = 'completed' }, f => { f.results[0].profileResults[0].selectedCells = 2 }, f => { f.batch.cells.push({ path: 'a.ts' }) }]) {
    const f = fixture(); mutate(f); assert.throws(() => assertPackageEvidence(f))
  }
})
test('ambiguous predecessor refs and compensated per-record contradictions fail closed', () => {
  for (const mutate of [f => { f.results[0].verification.evidenceRefs.push('coverage-before:sha256:foreign') }, f => { f.results[0].profileResults[0].selectedCells = 0; f.results[1].profileResults[0].selectedCells = 2 }, f => { f.results[1].profileResults.push({ profile: 'p', selectedCells: 0, completedCells: 0 }) }]) {
    const f = fixture(); mutate(f); assert.throws(() => assertPackageEvidence(f))
  }
})
