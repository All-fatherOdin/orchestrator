// Explicit opt-in for Node tools inside the Windows restricted-token sandbox.
// Keep child execution and permissions unchanged; capture streams in stage files.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');

const stage = process.env.ORCHESTRATOR_ARTIFACT_WORKSPACE;
if (!stage || !path.isAbsolute(stage)) throw new Error('File stdio requires an isolated artifact workspace');
const scratch = path.join(stage, '.orchestrator-scratch');
if (fs.realpathSync(scratch).toLowerCase() !== path.resolve(scratch).toLowerCase())
  throw new Error('Scratch must not redirect through a link');
// Nested audit run directories can exceed Win32 temporary-path limits.
// Native tools and their children must use the runner's workspace-root scratch.
process.env.TEMP = process.env.TMP = process.env.TMPDIR = scratch;
const original = cp.spawnSync;
cp.spawnSync = function (file, args, options) {
  if (!Array.isArray(args)) { options = args; args = []; }
  options = options || {};
  const stdio = options.stdio === undefined || options.stdio === 'pipe'
    ? ['pipe', 'pipe', 'pipe'] : Array.isArray(options.stdio) ? [...options.stdio] : null;
  if (!stdio || stdio.length > 3) return original(file, args, options);
  for (let i = 0; i < 3; i++) if (stdio[i] == null) stdio[i] = 'pipe';
  if (!stdio.includes('pipe')) return original(file, args, options);
  const dir = fs.mkdtempSync(path.join(scratch, 'stdio-'));
  const descriptors = [];
  try {
    const files = stdio.map((mode, index) => {
      if (mode !== 'pipe') return null;
      const target = path.join(dir, String(index));
      if (index === 0) fs.writeFileSync(target, options.input ?? '', { flag: 'wx' });
      const fd = fs.openSync(target, index === 0 ? 'r' : 'wx');
      descriptors.push(fd); stdio[index] = fd; return target;
    });
    const childOptions = { ...options, stdio };
    delete childOptions.input;
    const result = original(file, args, childOptions);
    const limit = options.maxBuffer ?? 1024 * 1024;
    const captured = [null, null, null];
    for (const index of [1, 2]) {
      if (!files[index]) continue;
      const size = fs.statSync(files[index]).size;
      if (size > limit) {
        result.error ??= Object.assign(new Error('Captured output exceeds maxBuffer'), { code: 'ENOBUFS' });
        result.status = null;
        continue;
      }
      captured[index] = fs.readFileSync(files[index]);
      if (options.encoding && options.encoding !== 'buffer') captured[index] = captured[index].toString(options.encoding);
    }
    result.output = captured;
    result.stdout = captured[1]; result.stderr = captured[2];
    return result;
  } finally {
    for (const fd of descriptors) fs.closeSync(fd);
    fs.rmSync(dir, { recursive: true });
  }
};
syncBuiltinESMExports();
// Native finalizer and detectors launch Node children; retain the same adapter.
const option = `--require ${JSON.stringify(__filename)}`;
if (!(process.env.NODE_OPTIONS || '').includes(__filename))
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} ${option}`.trim();
