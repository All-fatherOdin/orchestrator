const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
test('Файловый stdio сохраняет stdin, stdout, stderr, коды ошибок и вложенный Node', () => {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'file-stdio-test-'));
  fs.mkdirSync(path.join(stage, '.orchestrator-scratch'));
  const script = `
    const assert=require('node:assert/strict'),cp=require('node:child_process');
    let r=cp.spawnSync(process.execPath,['-e',"process.stdout.write(require('node:fs').readFileSync(0));process.stderr.write('ошибка');process.exitCode=7"],{input:'вход',encoding:'utf8'});
    assert.equal(r.status,7);assert.equal(r.stdout,'вход');assert.equal(r.stderr,'ошибка');
    r=cp.spawnSync(process.execPath,['-e',"const r=require('node:child_process').spawnSync(process.execPath,['-e',\\"process.stdout.write('nested')\\"],{encoding:'utf8'});process.stdout.write(r.stdout)"],{encoding:'utf8'});
    assert.equal(r.status,0);assert.equal(r.stdout,'nested');
    r=cp.spawnSync('nonexistent-file-stdio-tool',[],{encoding:'utf8'});assert.ok(r.error);assert.notEqual(r.status,0);
    r=cp.spawnSync(process.execPath,['-e',"process.stdout.write('long')"],{maxBuffer:2});assert.equal(r.error.code,'ENOBUFS');assert.notEqual(r.status,0);
    r=cp.spawnSync(process.execPath,['-e',"process.stdout.write('bytes')"]);assert.ok(Buffer.isBuffer(r.stdout));
  `;
  try {
    const r = spawnSync(process.execPath, ['--require', path.join(__dirname,'sandbox-file-stdio.cjs'), '-e', script], {env:{...process.env,ORCHESTRATOR_ARTIFACT_WORKSPACE:stage},encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    assert.deepEqual(fs.readdirSync(path.join(stage,'.orchestrator-scratch')),[]);
  } finally {fs.rmSync(stage,{recursive:true,force:true})}
});
