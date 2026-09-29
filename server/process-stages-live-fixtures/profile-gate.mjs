import assert from 'node:assert/strict'
export const candidateProfiles = ['shared-ui-bypass', 'duplicate-implementation']
export function checkCompletedCell(profile, cell, key) {
  if (['business-logic-regression', 'security-risk', 'performance-regression'].includes(profile))
    assert.ok(cell.dependencyFootprint, `Missing footprint: ${key}`)
  else assert.ok(candidateProfiles.includes(profile), `Unknown profile: ${profile}`)
}
export function checkCandidateValidation(validation, profile, head) {
  assert.equal(validation.status, 'success')
  assert.equal(validation.profile, profile)
  assert.equal(validation.headCommit, head)
  assert.equal(validation.coverageCompletionAllowed, true)
  assert.ok(!validation.reviews.some(r => r.disposition === 'limitation'))
  return validation.reviewedFiles
}
export function checkReviewedFiles(reviewedFiles, completedFiles) {
  assert.deepEqual([...reviewedFiles].sort(), [...completedFiles].sort(), 'Candidate reviewedFiles must match completed cells exactly')
}
