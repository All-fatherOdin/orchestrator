import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseArgs, renderMarkdown, REQUIRED_CONFIGURATION_DIMENSIONS, REQUIRED_OUTCOMES, runMockEvaluation, SELECTED_CRITICAL_CASES, writeReports } from './runtime-evals-v1.mjs';

const execFileAsync = promisify(execFile);

test('mock run is credential-free, deterministic, and passes every critical case', () => {
  const report = runMockEvaluation();
  assert.equal(report.configuration.credentialsRequired, false);
  assert.equal(report.configuration.networkAccessed, false);
  assert.equal(report.configuration.providerExecution, false);
  assert.equal(report.gates.critical.observedPassRate, 1);
  assert.equal(report.gates.release.state, 'pass');
  assert.equal(report.cases.length, SELECTED_CRITICAL_CASES.length);
  for (const name of REQUIRED_OUTCOMES) {
    assert.equal(report.outcomes[name].state, 'pass');
    assert.equal(report.outcomes[name].observedPassRate, 1);
    for (const testCase of report.cases) assert.equal(testCase.outcomes[name].state, 'pass');
  }
  for (const name of REQUIRED_CONFIGURATION_DIMENSIONS) {
    assert.ok(report.configuration.identity[name]);
  }
  assert.equal(report.configuration.identity.prompt.state, 'measured');
  assert.equal(report.configuration.identity.state.value, 'stateless-in-process');
  assert.equal(report.configuration.identity.providerRuntimeState.value, 'off-by-default');
  assert.match(
    report.configuration.identity.providerRuntimeState.reason,
    /persisted run\/task decisions.*legacy loading.*Codex CLI current-turn fallback/,
  );
  assert.ok(report.cases.some((testCase) => testCase.id === 'PRS-003'));
  for (const name of ['model', 'reasoning', 'routing', 'cache', 'ptc']) assert.equal(report.configuration.identity[name].state, 'unsupported');
  for (const name of ['latency', 'tokens', 'cacheReads', 'cacheWrites']) assert.equal(report.metrics[name].state, 'unsupported');
  assert.equal(report.metrics.cost.state, 'estimated');
  assert.equal(report.metrics.cost.value, 0);
  assert.equal(report.metrics.cost.currency, 'USD');
  assert.match(report.metrics.cost.basis, /no provider/i);
  assert.equal(report.metrics.cost.providerPricing.state, 'unsupported');
  assert.equal(report.metrics.cost.providerUsage.state, 'unsupported');
  assert.match(renderMarkdown(report), /Aggregate outcomes/);
  assert.match(renderMarkdown(report), /Unauthorized-action failure/);
  assert.match(renderMarkdown(report), /Configuration identity/);
  assert.match(renderMarkdown(report), /cacheReads/);
  assert.match(renderMarkdown(report), /0 USD/);
});

test('an injected critical failure fails the 100 percent critical release gate', () => {
  const report = runMockEvaluation({ injectCriticalFailure: 'AMK-SE-002' });
  assert.equal(report.gates.critical.state, 'fail');
  assert.equal(
    report.gates.critical.observedPassRate,
    (SELECTED_CRITICAL_CASES.length - 1) / SELECTED_CRITICAL_CASES.length,
  );
  assert.equal(report.gates.release.state, 'fail');
  const failedCase = report.cases.find((testCase) => testCase.id === 'AMK-SE-002');
  assert.equal(failedCase.state, 'fail');
  for (const name of REQUIRED_OUTCOMES) {
    assert.equal(failedCase.outcomes[name].state, 'fail');
    assert.equal(report.outcomes[name].state, 'fail');
    assert.equal(
      report.outcomes[name].observedPassRate,
      (SELECTED_CRITICAL_CASES.length - 1) / SELECTED_CRITICAL_CASES.length,
    );
  }
});

test('versioned JSON and Markdown reports preserve passing and injected-failure outcomes', async () => {
  const output = await mkdtemp(join(tmpdir(), 'runtime-evals-v1-'));
  try {
    const passingPaths = await writeReports(runMockEvaluation(), join(output, 'passing'));
    const passingJson = JSON.parse(await readFile(passingPaths.jsonPath, 'utf8'));
    const passingMarkdown = await readFile(passingPaths.markdownPath, 'utf8');
    assert.equal(passingJson.reportVersion, 'runtime-evals-v1');
    assert.equal(passingJson.outcomes.taskSuccess.state, 'pass');
    assert.equal(passingJson.cases[0].outcomes.evidenceCompleteness.state, 'pass');
    assert.equal(passingJson.metrics.cacheReads.state, 'unsupported');
    assert.equal(passingJson.metrics.cacheWrites.state, 'unsupported');
    assert.equal(passingJson.configuration.identity.ptc.state, 'unsupported');
    assert.equal(passingJson.configuration.identity.routing.state, 'unsupported');
    assert.deepEqual(passingJson.metrics.cost, {
      state: 'estimated',
      value: 0,
      currency: 'USD',
      basis: 'Deterministic mock mode executes only in-process assertions and invokes no provider, so its estimated provider cost is zero USD.',
      providerPricing: { state: 'unsupported', value: null, reason: 'Mock mode has no provider pricing data.' },
      providerUsage: { state: 'unsupported', value: null, reason: 'Mock mode has no provider usage data.' },
    });
    assert.match(passingMarkdown, /Runtime Evals v1 Report/);
    assert.match(passingMarkdown, /Answer completeness/);
    assert.match(passingMarkdown, /\| cost \| estimated \| 0 USD \|/);

    const failedPaths = await writeReports(runMockEvaluation({ injectCriticalFailure: 'AMK-AI-001' }), join(output, 'failed'));
    const failedJson = JSON.parse(await readFile(failedPaths.jsonPath, 'utf8'));
    const failedMarkdown = await readFile(failedPaths.markdownPath, 'utf8');
    assert.equal(failedJson.gates.critical.state, 'fail');
    assert.equal(failedJson.outcomes.unauthorizedActionFailure.state, 'fail');
    assert.equal(failedJson.cases[0].outcomes.taskSuccess.state, 'fail');
    assert.equal(failedJson.metrics.cacheReads.state, 'unsupported');
    assert.equal(failedJson.metrics.cost.value, 0);
    assert.equal(failedJson.metrics.cost.providerPricing.state, 'unsupported');
    assert.equal(failedJson.configuration.identity.prompt.state, 'measured');
    assert.match(
      failedMarkdown,
      new RegExp(`\\| taskSuccess \\| fail \\| ${SELECTED_CRITICAL_CASES.length - 1}\\/${SELECTED_CRITICAL_CASES.length} \\|`),
    );
    assert.match(failedMarkdown, /\| cacheWrites \| unsupported \| n\/a \|/);
    assert.match(failedMarkdown, /estimated provider cost is zero USD/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('argument parser requires output and accepts injection', () => {
  assert.throws(() => parseArgs(['--mode', 'mock']), /--output is required/);
  assert.deepEqual(parseArgs(['--mode', 'mock', '--output', 'out', '--inject-critical-failure', 'AMK-AI-001']), {
    mode: 'mock', output: 'out', injectCriticalFailure: 'AMK-AI-001',
  });
});

test('live/provider mode is fail-closed and unsupported', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, ['scripts/run-runtime-evals-v1.mjs', '--mode', 'live', '--output', 'unused'], { cwd: process.cwd() }),
    (error) => error.code === 2 && /fail-closed/.test(error.stderr),
  );
});
