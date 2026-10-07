import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

export function checkRecoverySource(record, binding) {
  assert.equal(record.id, binding.sourceRunId, 'Source run identity mismatch')
  assert.ok(['failed', 'timed_out', 'cancelled'].includes(record.status), 'Source run must be terminal unsuccessful')
  const matches = record.tasks.filter(task => task.id === binding.sourceTaskId)
  assert.equal(matches.length, 1, 'Source task must be unique')
  const task = matches[0]
  assert.equal(task.key, binding.sourceTaskKey, 'Source task key mismatch')
  assert.equal(task.status, 'failed', 'GIS source task must be failed')
  assert.equal(task.processProgress?.phase, 'verified', 'GIS_RECOVERY_PREPARED_SOURCE_UNSUPPORTED: legacy verified-source checker requires verified source; it does not validate PreparedCorrectionRecoveryV1')
  assert.equal(task.reviewStatus, 'changes_requested', 'GIS source requires current rejected review')
  assert.equal(task.authorizationEvidence?.decision, 'authorized', 'Source authorization evidence missing')
  assert.ok(task.verificationEvidence?.length, 'Source verification evidence missing')
  for (const receipt of task.verificationEvidence) {
    assert.equal(receipt.exitCode, 0, 'Source verification failed')
    assert.equal(receipt.timedOut, false, 'Source verification timed out')
  }
  return task
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [file, runId, taskId, taskKey, expectedHash] = process.argv.slice(2)
    assert.ok(file && path.isAbsolute(file), 'Exact absolute canonical run path required')
    assert.match(expectedHash ?? '', /^[a-f0-9]{64}$/, 'Pinned canonical SHA-256 required')
    const bytes = fs.readFileSync(file)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expectedHash, 'Canonical source changed')
    const task = checkRecoverySource(JSON.parse(bytes), { sourceRunId: runId, sourceTaskId: taskId, sourceTaskKey: taskKey })
    console.log(JSON.stringify({ outcome: 'pass', sourceRunId: runId, sourceTaskId: task.id, scope: 'Source eligibility only; does not replace runner authorization replay or artifact fencing' }))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
