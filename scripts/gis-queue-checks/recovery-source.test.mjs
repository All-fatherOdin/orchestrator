import test from 'node:test'
import assert from 'node:assert/strict'
import { checkRecoverySource } from './recovery-source.mjs'

const binding = { sourceRunId: 'run', sourceTaskId: 'task', sourceTaskKey: 'key' }
const fixture = () => ({ id: 'run', status: 'failed', tasks: [{ id: 'task', key: 'key', status: 'failed',
  processProgress: { phase: 'verified' }, reviewStatus: 'changes_requested',
  authorizationEvidence: { decision: 'authorized' }, verificationEvidence: [{ exitCode: 0, timedOut: false }] }] })

test('legacy verified-source checker accepts rejected verified source and blocks prepared correction', () => {
  assert.equal(checkRecoverySource(fixture(), binding).id, 'task')
  const source = fixture(); source.tasks[0].processProgress.phase = 'prepared'
  assert.throws(() => checkRecoverySource(source, binding), /GIS_RECOVERY_PREPARED_SOURCE_UNSUPPORTED/)
})
test('identity, duplicate source, successful review and failed verification fail closed', () => {
  for (const mutate of [r => { r.id = 'other' }, r => { r.tasks.push(r.tasks[0]) },
    r => { r.tasks[0].reviewStatus = 'approved' }, r => { r.tasks[0].verificationEvidence[0].exitCode = 1 }]) {
    const source = fixture(); mutate(source); assert.throws(() => checkRecoverySource(source, binding))
  }
})
