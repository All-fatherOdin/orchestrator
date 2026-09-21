import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, open, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const MAX_FILE = 16 * 1024 * 1024;
const MAX_TOTAL = 64 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
function object(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      required.some(key => !Object.hasOwn(value, key)) ||
      Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) fail('EVIDENCE_MANIFEST_INVALID');
}
function sha(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('EVIDENCE_SHA256_INVALID');
  return value;
}
function filePath(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\\:*?\[\]<>|"\x00-\x1f\x7f]/.test(value) ||
      value.split('/').some(part => !part || part === '.' || part === '..' || part.trim() !== part ||
        part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('EVIDENCE_PATH_INVALID');
  return value;
}
async function rootPath(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail('EVIDENCE_ROOT_MUST_BE_ABSOLUTE');
  const root = await realpath(value);
  if (!(await lstat(root)).isDirectory()) fail('EVIDENCE_ROOT_NOT_DIRECTORY');
  return root;
}
async function exactPath(root, relative, allowMissing = false) {
  const parts = filePath(relative).split('/');
  let path = root;
  for (let index = 0; index < parts.length; index++) {
    path = join(path, parts[index]);
    let stat;
    try { stat = await lstat(path); } catch (error) {
      if (allowMissing && index === parts.length - 1 && error.code === 'ENOENT') return path;
      throw error;
    }
    if (stat.isSymbolicLink() || (index === parts.length - 1 ? !stat.isFile() : !stat.isDirectory()))
      fail('EVIDENCE_PATH_NOT_REGULAR');
  }
  return path;
}
async function bytesAt(root, relative, expected, budget) {
  const path = await exactPath(root, relative);
  const stat = await lstat(path);
  if (stat.size > MAX_FILE || (budget.bytes += stat.size) > MAX_TOTAL) fail('EVIDENCE_SIZE_LIMIT');
  const bytes = await readFile(path);
  if (bytes.length !== stat.size || hash(bytes) !== sha(expected)) fail(`EVIDENCE_HASH_MISMATCH: ${relative}`);
  await exactPath(root, relative);
  return bytes;
}
async function existingDestination(root, entry, budget) {
  const path = await exactPath(root, entry.destination, true);
  try { await lstat(path); } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  await bytesAt(root, entry.destination, entry.existingDestinationSha256 ?? entry.sourceSha256, budget);
  return true;
}

/** Byte-exact import; never merges JSON or replaces an existing file. */
export async function importRecoveryEvidence(manifest) {
  object(manifest, ['contractType', 'contractVersion', 'sourceRoot', 'targetRoot', 'files']);
  if (manifest.contractType !== 'RecoveryEvidenceImportV1' || manifest.contractVersion !== '1.0' ||
      !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 64) fail('EVIDENCE_MANIFEST_INVALID');
  const entries = manifest.files.map(entry => {
    object(entry, ['source', 'destination', 'sourceSha256'], ['existingDestinationSha256']);
    filePath(entry.source); filePath(entry.destination); sha(entry.sourceSha256);
    if (entry.existingDestinationSha256 !== undefined) sha(entry.existingDestinationSha256);
    return { ...entry };
  });
  for (const key of ['source', 'destination'])
    if (new Set(entries.map(entry => entry[key].toLowerCase())).size !== entries.length) fail('EVIDENCE_DUPLICATE_PATH');
  const sourceRoot = await rootPath(manifest.sourceRoot);
  const targetRoot = await rootPath(manifest.targetRoot);
  const sourceBudget = { bytes: 0 }, targetBudget = { bytes: 0 };
  const prepared = [];
  // Validate the entire batch before any filesystem write. Capture verified bytes,
  // rather than re-reading an unchecked source in a later copyFile operation.
  for (const entry of entries) {
    const bytes = await bytesAt(sourceRoot, entry.source, entry.sourceSha256, sourceBudget);
    const exists = await existingDestination(targetRoot, entry, targetBudget);
    if (!exists && entry.existingDestinationSha256 && entry.existingDestinationSha256 !== entry.sourceSha256)
      fail('EVIDENCE_PRESERVED_DESTINATION_MISSING');
    prepared.push({ entry, bytes });
  }
  const files = [];
  for (const { entry, bytes } of prepared) {
    if (await existingDestination(targetRoot, entry, { bytes: 0 })) {
      files.push({ path: entry.destination, disposition: 'preserved', sha256: entry.existingDestinationSha256 ?? entry.sourceSha256 });
      continue;
    }
    if (entry.existingDestinationSha256 && entry.existingDestinationSha256 !== entry.sourceSha256)
      fail('EVIDENCE_PRESERVED_DESTINATION_MISSING');
    const destination = await exactPath(targetRoot, entry.destination, true);
    const staging = join(dirname(destination), `.orchestrator-import-${randomUUID()}.tmp`);
    const handle = await open(staging, 'wx');
    try {
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await exactPath(targetRoot, entry.destination, true);
      // Publishing a hard link is atomic and fails if the destination exists.
      // No rename/replace operation is allowed, including concurrent imports.
      try {
        await link(staging, destination);
        files.push({ path: entry.destination, disposition: 'imported', sha256: entry.sourceSha256 });
      } catch (error) {
        if (error.code !== 'EEXIST' || !await existingDestination(targetRoot, entry, { bytes: 0 })) throw error;
        files.push({ path: entry.destination, disposition: 'preserved', sha256: entry.existingDestinationSha256 ?? entry.sourceSha256 });
      }
    } finally { await unlink(staging); }
  }
  for (const file of files) await bytesAt(targetRoot, file.path, file.sha256, { bytes: 0 });
  return { status: 'passed', sourceRoot, targetRoot, files };
}

function pointerValue(document, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || pointer.length > 1024 || /~(?![01])/.test(pointer)) fail('AUDIT_TIME_POINTER_INVALID');
  let value = document;
  for (const key of pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~')))
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) fail('AUDIT_TIME_FIELD_MISSING');
    else value = value[key];
  return value;
}
export function utcMillis(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail('AUDIT_TIME_INVALID_UTC');
  const time = Date.parse(value);
  const normalized = value.includes('.') ? value.replace(/\.(\d+)Z$/, (_, digits) => `.${digits.padEnd(3, '0')}Z`) : value.replace('Z', '.000Z');
  if (!Number.isFinite(time) || new Date(time).toISOString() !== normalized) fail('AUDIT_TIME_INVALID_UTC');
  return time;
}
function timeReference(value) {
  object(value, ['path', 'sha256', 'pointer']);
  filePath(value.path); sha(value.sha256);
  // Validate syntax even before loading a document.
  if (typeof value.pointer !== 'string' || !value.pointer.startsWith('/') || /~(?![01])/.test(value.pointer)) fail('AUDIT_TIME_POINTER_INVALID');
}

/** Check explicit JSON fields. Never infer a domain's canonical files or rewrite clocks. */
export async function checkAuditTime(manifest, clock = Date.now) {
  object(manifest, ['contractType', 'contractVersion', 'root', 'completion', 'states']);
  if (manifest.contractType !== 'AuditTimeGuardV1' || manifest.contractVersion !== '1.0' ||
      !Array.isArray(manifest.states) || !manifest.states.length || manifest.states.length > 32) fail('AUDIT_TIME_MANIFEST_INVALID');
  for (const ref of [manifest.completion, ...manifest.states]) timeReference(ref);
  const refs = [manifest.completion, ...manifest.states];
  if (new Set(refs.map(ref => `${ref.path.toLowerCase()}\0${ref.pointer}`)).size !== refs.length) fail('AUDIT_TIME_DUPLICATE_REFERENCE');
  const root = await rootPath(manifest.root);
  const budget = { bytes: 0 };
  const times = [];
  for (const ref of refs) {
    const document = JSON.parse((await bytesAt(root, ref.path, ref.sha256, budget)).toString('utf8'));
    times.push(utcMillis(pointerValue(document, ref.pointer)));
  }
  const now = clock();
  if (!Number.isSafeInteger(now)) fail('AUDIT_CLOCK_INVALID');
  const [finished, ...previous] = times;
  if (finished > now) fail('AUDIT_TIME_IN_FUTURE');
  if (previous.some(time => time > finished)) fail('AUDIT_TIME_REGRESSION');
  return { status: 'passed', observedAt: new Date(now).toISOString(), finishedAt: new Date(finished).toISOString(), stateTimes: previous.map(time => new Date(time).toISOString()) };
}

export async function main(args) {
  if (args.length === 1 && args[0] === 'now') {
    console.log(new Date().toISOString());
    return;
  }
  const [operation, manifestPath, manifestSha256, separator, executable, ...commandArgs] = args;
  if (!['import', 'check-time', 'finalize'].includes(operation) || !manifestPath ||
      (operation === 'finalize' ? separator !== '--' || !executable || !isAbsolute(executable) : args.length !== 3))
    fail('Usage: evidence-guards.mjs now | import|check-time MANIFEST SHA256 | finalize MANIFEST SHA256 -- ABSOLUTE_EXECUTABLE ARGS...');
  const stat = await lstat(manifestPath);
  if (!stat.isFile() || stat.size > 256 * 1024) fail('EVIDENCE_MANIFEST_INVALID');
  const bytes = await readFile(manifestPath);
  if (bytes.length !== stat.size || hash(bytes) !== sha(manifestSha256)) fail('EVIDENCE_MANIFEST_HASH_MISMATCH');
  const manifest = JSON.parse(bytes.toString('utf8'));
  const finalizerRoot = operation === 'finalize' ? await rootPath(manifest.root) : undefined;
  const receipt = operation === 'import' ? await importRecoveryEvidence(manifest) : await checkAuditTime(manifest);
  if (operation === 'finalize') {
    // Domain-specific locking and atomic state transitions remain the finalizer's responsibility.
    const result = spawnSync(executable, commandArgs, { cwd: finalizerRoot, shell: false, windowsHide: true, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) fail(`AUDIT_FINALIZER_FAILED: exit=${result.status}, signal=${result.signal}`);
  }
  console.log(JSON.stringify({ ...receipt, manifestSha256 }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
