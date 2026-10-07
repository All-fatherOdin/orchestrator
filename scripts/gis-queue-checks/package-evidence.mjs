import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const sha = value => createHash('sha256').update(value).digest('hex')
const semanticHash = value => sha(`${JSON.stringify(value, null, 2)}\n`)
const integer = value => { assert.ok(Number.isSafeInteger(value) && value >= 0, 'Missing or invalid native count'); return value }
const inventory = coverage => {
  const result = new Map()
  for (const file of coverage.files) for (const cell of file.cells) {
    const key = `${cell.profile}:${file.path}`
    assert.ok(!result.has(key), 'Duplicate coverage cell')
    result.set(key, { blobSha: file.blobSha, cell })
  }
  return result
}

export function assertPackageEvidence({ batch, before, after, receipt, results }) {
  const owned = batch.cells.map(cell => `${batch.profile}:${cell.path}`)
  assert.equal(new Set(owned).size, owned.length, 'Duplicate selected cell')
  const a = inventory(before), b = inventory(after)
  assert.deepEqual([...a.keys()], [...b.keys()], 'Inventory changed')
  let completed = 0, omitted = 0, failed = 0
  for (const [key, prior] of a) {
    if (!owned.includes(key)) { assert.deepEqual(b.get(key), prior, 'Sibling cell changed'); continue }
    assert.equal(b.get(key).blobSha, prior.blobSha)
    const status = b.get(key).cell.status
    assert.ok(['completed', 'omitted', 'failed'].includes(status), 'Owned cell unfinished')
    if (status === 'completed') completed++
    if (status === 'omitted') omitted++
    if (status === 'failed') failed++
  }
  assert.equal(completed + omitted + failed, owned.length, 'Selected cell absent')
  assert.equal(receipt.batchId, batch.id)
  assert.equal(receipt.results.length, results.length)
  assert.ok(results.length > 0)
  assert.equal(new Set(receipt.results.map(pair => pair.canonical)).size, results.length, 'Duplicate native result')
  let selectedTotal = 0, completedTotal = 0, predecessor = semanticHash(before)
  for (const result of results) {
    assert.equal(result.status, 'success')
    const refs = result.verification.evidenceRefs
    assert.deepEqual(refs.filter(ref => ref.startsWith('coverage-before:sha256:')), [`coverage-before:sha256:${predecessor}`], 'Native predecessor mismatch')
    const successors = refs.filter(ref => ref.startsWith('coverage-after:sha256:'))
    assert.equal(successors.length, 1)
    predecessor = successors[0].split(':').at(-1)
    assert.ok(result.profileResults.length > 0)
    assert.equal(new Set(result.profileResults.map(profile => profile.profile)).size, result.profileResults.length, 'Duplicate profile row')
    for (const profile of result.profileResults) {
      assert.equal(profile.profile, batch.profile, 'Sibling profile in result')
      const selected = integer(profile.selectedCells), done = integer(profile.completedCells)
      assert.ok(done <= selected, 'Completed exceeds selected')
      selectedTotal += selected
      completedTotal += done
    }
  }
  assert.equal(predecessor, semanticHash(after), 'Native final readback mismatch')
  assert.equal(selectedTotal, owned.length, 'Selected total mismatch')
  assert.equal(completedTotal, completed, 'Completed total mismatch')
  return { selected: selectedTotal, completed, omitted, failed }
}

export function readPackageEvidence(root, manifestPath, batchId, beforePath, afterPath, receiptPath) {
  const read = name => {
    assert.ok(name && !path.isAbsolute(name) && !name.includes('\\') && name.split('/').every(part => part && part !== '.' && part !== '..'))
    return JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const matches = manifest.batches.filter(batch => batch.id === batchId)
  assert.equal(matches.length, 1)
  const batch = matches[0]
  assert.deepEqual([beforePath, afterPath, receiptPath], ['before-coverage.json', 'after-coverage.json', 'receipt.json'].map(name => `${batch.run}/${name}`))
  const receipt = read(receiptPath)
  const results = receipt.results.map(pair => {
    for (const name of [pair.canonical, pair.isolated]) assert.ok(name.startsWith(`${batch.run}/`), 'Native result escaped package')
    const result = read(pair.canonical), isolated = read(pair.isolated)
    assert.deepEqual(result, isolated)
    return result
  })
  return assertPackageEvidence({ batch, before: read(beforePath), after: read(afterPath), receipt, results })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 8)
    console.log(JSON.stringify({ outcome: 'pass', ...readPackageEvidence(...process.argv.slice(2)) }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
