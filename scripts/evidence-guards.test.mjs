import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { importRecoveryEvidence, checkAuditTime, utcMillis } from './evidence-guards.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const script = resolve('scripts/evidence-guards.mjs');
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'orchestrator-evidence-guards-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const sourceRoot = join(root, 'source'), targetRoot = join(root, 'target');
  await mkdir(sourceRoot); await mkdir(targetRoot);
  return { root, sourceRoot, targetRoot };
}
const importManifest = (roots, files) => ({ contractType: 'RecoveryEvidenceImportV1', contractVersion: '1.0', sourceRoot: roots.sourceRoot, targetRoot: roots.targetRoot, files });

test('recovery import preserves a richer pinned scope byte-for-byte and imports missing evidence', async t => {
  const roots = await fixture(t);
  const source = '{"files":["a"]}', existing = '{"files":["a"],"originalMetadata":"retain"}\n';
  await writeFile(join(roots.sourceRoot, 'scope.json'), source);
  await writeFile(join(roots.sourceRoot, 'detector.json'), 'result');
  await writeFile(join(roots.targetRoot, 'scope.json'), existing);
  const manifest = importManifest(roots, [
    { source: 'scope.json', destination: 'scope.json', sourceSha256: sha(source), existingDestinationSha256: sha(existing) },
    { source: 'detector.json', destination: 'supplied.json', sourceSha256: sha('result') },
  ]);
  const receipt = await importRecoveryEvidence(manifest);
  assert.deepEqual(receipt.files.map(file => file.disposition), ['preserved', 'imported']);
  assert.equal(await readFile(join(roots.targetRoot, 'scope.json'), 'utf8'), existing);
  assert.equal(await readFile(join(roots.targetRoot, 'supplied.json'), 'utf8'), 'result');
  assert.deepEqual((await importRecoveryEvidence(manifest)).files.map(file => file.disposition), ['preserved', 'preserved']);
  assert.deepEqual((await readdir(roots.targetRoot)).sort(), ['scope.json', 'supplied.json']);
});

test('recovery import validates the entire batch before writes and never overwrites a mismatch', async t => {
  const roots = await fixture(t);
  await writeFile(join(roots.sourceRoot, 'first'), 'first');
  await writeFile(join(roots.sourceRoot, 'second'), 'second');
  const manifest = importManifest(roots, [
    { source: 'first', destination: 'first', sourceSha256: sha('first') },
    { source: 'second', destination: 'second', sourceSha256: sha('WRONG') },
  ]);
  await assert.rejects(importRecoveryEvidence(manifest), /HASH_MISMATCH/);
  assert.deepEqual(await readdir(roots.targetRoot), []);
  manifest.files[1].sourceSha256 = sha('second');
  await writeFile(join(roots.targetRoot, 'second'), 'original target');
  await assert.rejects(importRecoveryEvidence(manifest), /HASH_MISMATCH/);
  assert.deepEqual(await readdir(roots.targetRoot), ['second']);
  assert.equal(await readFile(join(roots.targetRoot, 'second'), 'utf8'), 'original target');
  await rm(join(roots.targetRoot, 'second'));
  manifest.files[1].existingDestinationSha256 = sha('required original');
  await assert.rejects(importRecoveryEvidence(manifest), /PRESERVED_DESTINATION_MISSING/);
  assert.deepEqual(await readdir(roots.targetRoot), []);
});

test('concurrent imports cannot replace a published destination and leave no staging files', async t => {
  const roots = await fixture(t);
  await writeFile(join(roots.sourceRoot, 'a'), 'A');
  await writeFile(join(roots.sourceRoot, 'b'), 'B');
  const manifests = ['a', 'b'].map(name => importManifest(roots, [{ source: name, destination: 'result', sourceSha256: sha(name.toUpperCase()) }]));
  const results = await Promise.allSettled(manifests.map(importRecoveryEvidence));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const winner = results.findIndex(result => result.status === 'fulfilled');
  assert.equal(await readFile(join(roots.targetRoot, 'result'), 'utf8'), winner === 0 ? 'A' : 'B');
  assert.deepEqual(await readdir(roots.targetRoot), ['result']);
  const repeated = await Promise.all([importRecoveryEvidence(manifests[winner]), importRecoveryEvidence(manifests[winner])]);
  assert.ok(repeated.every(receipt => receipt.files[0].disposition === 'preserved'));
});

test('recovery import rejects traversal, duplicated aliases, unsupported fields, and linked parents', async t => {
  const roots = await fixture(t);
  await writeFile(join(roots.sourceRoot, 'source'), 'bytes');
  const entry = { source: 'source', destination: 'target', sourceSha256: sha('bytes') };
  for (const destination of ['../escape', '/escape', 'C:/escape', 'a\\b', 'nul', 'a.', 'a//b', 'a/*'])
    await assert.rejects(importRecoveryEvidence(importManifest(roots, [{ ...entry, destination }])), /PATH_INVALID/);
  await assert.rejects(importRecoveryEvidence(importManifest(roots, [entry, { ...entry, destination: 'TARGET' }])), /DUPLICATE/);
  await assert.rejects(importRecoveryEvidence(importManifest(roots, [{ ...entry, overwrite: true }])), /MANIFEST_INVALID/);
  await symlink(roots.sourceRoot, join(roots.targetRoot, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(importRecoveryEvidence(importManifest(roots, [{ ...entry, destination: 'linked/new-file' }])), /NOT_REGULAR/);
  assert.deepEqual(await readdir(roots.sourceRoot), ['source']);
});

async function timeManifest(root, finishedAt, states = ['2026-09-21T10:00:00.000Z', '2026-09-21T10:05:00.000Z']) {
  const completion = JSON.stringify({ finishedAt });
  await writeFile(join(root, 'completion.json'), completion);
  const refs = [];
  for (const [index, updatedAt] of states.entries()) {
    const bytes = JSON.stringify({ audit: { updatedAt } });
    const path = `state-${index}.json`;
    await writeFile(join(root, path), bytes);
    refs.push({ path, sha256: sha(bytes), pointer: '/audit/updatedAt' });
  }
  return { contractType: 'AuditTimeGuardV1', contractVersion: '1.0', root,
    completion: { path: 'completion.json', sha256: sha(completion), pointer: '/finishedAt' }, states: refs };
}

test('audit time accepts equality and progression against every state without changing inputs', async t => {
  const { root } = await fixture(t);
  const now = Date.parse('2026-09-21T10:10:00.000Z');
  for (const finished of ['2026-09-21T10:05:00Z', '2026-09-21T10:09:59.1Z']) {
    const manifest = await timeManifest(root, finished);
    const before = await Promise.all([manifest.completion, ...manifest.states].map(ref => readFile(join(root, ref.path))));
    const result = await checkAuditTime(manifest, () => now);
    assert.equal(result.status, 'passed');
    assert.equal(result.finishedAt, new Date(finished).toISOString());
    const after = await Promise.all([manifest.completion, ...manifest.states].map(ref => readFile(join(root, ref.path))));
    assert.deepEqual(after, before);
  }
});

test('audit time rejects regression, future completion, clock rollback, malformed UTC, and changed state hashes', async t => {
  const { root } = await fixture(t);
  const now = Date.parse('2026-09-21T10:10:00.000Z');
  for (const [finished, error] of [
    ['2026-09-21T10:04:59.999Z', /REGRESSION/], ['2026-09-21T10:10:00.001Z', /IN_FUTURE/],
    ['2026-02-30T10:10:00Z', /INVALID_UTC/], ['2026-09-21T10:10:00+00:00', /INVALID_UTC/], [null, /INVALID_UTC/],
  ]) await assert.rejects(checkAuditTime(await timeManifest(root, finished), () => now), error);
  const manifest = await timeManifest(root, '2026-09-21T10:05:00.000Z');
  await assert.rejects(checkAuditTime(manifest, () => now - 3600000), /IN_FUTURE/);
  manifest.states[0].pointer = '/missing';
  await assert.rejects(checkAuditTime(manifest, () => now), /FIELD_MISSING/);
  manifest.states[0].pointer = '/audit/updatedAt';
  await writeFile(join(root, manifest.states[0].path), '{"audit":{"updatedAt":"2026-09-21T10:01:00Z"}}');
  await assert.rejects(checkAuditTime(manifest, () => now), /HASH_MISMATCH/);
  assert.throws(() => utcMillis('2026-09-21'), /INVALID_UTC/);
});

test('guarded finalizer refuses invalid time or modified manifest before launching the child', async t => {
  const { root } = await fixture(t);
  let manifest = await timeManifest(root, '2020-01-01T00:00:00Z', ['2020-01-01T00:00:01Z']);
  const file = join(root, 'manifest.json');
  const run = async (expectedHash) => {
    const bytes = JSON.stringify(manifest); await writeFile(file, bytes);
    return spawnSync(process.execPath, [script, 'finalize', file, expectedHash ?? sha(bytes), '--', process.execPath,
      '-e', "require('node:fs').writeFileSync('finalized','ok')"], { encoding: 'utf8', windowsHide: true });
  };
  let result = await run();
  assert.notEqual(result.status, 0); assert.match(result.stderr, /REGRESSION/);
  await assert.rejects(readFile(join(root, 'finalized')), /ENOENT/);
  manifest = await timeManifest(root, '2020-01-01T00:00:02Z', ['2020-01-01T00:00:01Z']);
  result = await run(sha('old manifest'));
  assert.notEqual(result.status, 0); assert.match(result.stderr, /MANIFEST_HASH_MISMATCH/);
  await assert.rejects(readFile(join(root, 'finalized')), /ENOENT/);
  result = await run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(join(root, 'finalized'), 'utf8'), 'ok');
  assert.equal(JSON.parse(result.stdout).status, 'passed');
  const manifestBytes = await readFile(file);
  const failed = spawnSync(process.execPath, [script, 'finalize', file, sha(manifestBytes), '--', process.execPath,
    '-e', 'process.exit(9)'], { encoding: 'utf8', windowsHide: true });
  assert.notEqual(failed.status, 0);
  assert.match(failed.stderr, /AUDIT_FINALIZER_FAILED/);
  assert.equal(failed.stdout, '');
});

test('CLI import pins manifest bytes and now reads the system clock', async t => {
  const roots = await fixture(t);
  await writeFile(join(roots.sourceRoot, 'a'), 'a');
  const bytes = JSON.stringify(importManifest(roots, [{ source: 'a', destination: 'b', sourceSha256: sha('a') }]));
  const file = join(roots.root, 'import.json'); await writeFile(file, bytes);
  const result = spawnSync(process.execPath, [script, 'import', file, sha(bytes)], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).manifestSha256, sha(bytes));
  assert.equal(await readFile(join(roots.targetRoot, 'b'), 'utf8'), 'a');
  const before = Date.now();
  const clock = spawnSync(process.execPath, [script, 'now'], { encoding: 'utf8' });
  assert.equal(clock.status, 0);
  const observed = utcMillis(clock.stdout.trim());
  assert.ok(observed >= before && observed <= Date.now());
});
