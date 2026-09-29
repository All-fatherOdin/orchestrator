import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const [manifestFile, input, output] = process.argv.slice(2)
assert.ok(manifestFile && input && output, 'Usage: quality-audit-scope.mjs QUEUE_MANIFEST INPUT_SCOPE OUTPUT_SCOPE')
const stage = fs.realpathSync(process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE)
const target = path.resolve(output)
const relative = path.relative(stage, target)
assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'Output must stay inside the stage')
assert.equal(fs.realpathSync(path.dirname(target)).toLowerCase(), path.dirname(target).toLowerCase(), 'Output parent must not redirect through links')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const library = path.join(manifest.projectRoot, manifest.runtime, 'profile-bundle-lib.mjs')
const { scopeFingerprint } = await import(pathToFileURL(library).href)
const scope = JSON.parse(fs.readFileSync(input, 'utf8'))
assert.ok(['business-logic-regression', 'security-risk', 'performance-regression'].includes(scope.profile))
scope.scopeFingerprint = scopeFingerprint(scope)
fs.writeFileSync(target, JSON.stringify(scope, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ status: 'fingerprinted', output: target, fingerprint: scope.scopeFingerprint }))
