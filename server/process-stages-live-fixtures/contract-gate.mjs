import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const [manifestFile, phase, id] = process.argv.slice(2)
const load = p => JSON.parse(fs.readFileSync(p))
const m = load(manifestFile), root = process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE || m.projectRoot
const prior = JSON.parse(execFileSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'live-gate.mjs'), ...process.argv.slice(2)], { encoding: 'utf8', windowsHide: true }))
const batches = phase === 'final' ? m.batches : [m.batches.find(b => b.id === id)]
for (const b of batches) {
  const dir = path.join(root, b.run), bundle = load(path.join(dir, 'bundle-0.json'))
  const response = load(path.join(dir, 'response-0.json')), validationPath = path.join(dir, 'validated-artifacts/validation-0.json')
  const validation = load(validationPath), completion = load(path.join(dir, 'completion.json'))
  assert.equal(response.bundleFingerprint, bundle.bundleFingerprint)
  assert.equal(validation.bundleFingerprint, bundle.bundleFingerprint)
  const validationSha256 = createHash('sha256').update(fs.readFileSync(validationPath)).digest('hex')
  assert.equal(completion.profiles.length, 1)
  assert.equal(completion.profiles[0].artifactSha256, validationSha256)
  for (const name of ['isolated-finalizer', 'canonical-finalizer']) {
    const result = load(path.join(dir, name, 'run-result.json'))
    assert.equal(result.profileResults.length, 1)
    assert.equal(result.profileResults[0].profile, bundle.profile)
    // Existing native producer deliberately stores the validation digest here.
    // It is not used as evidence of the raw bundle identity.
    assert.equal(result.profileResults[0].bundleFingerprint, validationSha256)
  }
}
console.log(JSON.stringify({ ...prior, rawBundleBindings: 'passed', nativeLegacyProfileFingerprint: 'validated-artifact-sha256' }))
