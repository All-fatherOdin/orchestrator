import { parseArgs, runMockEvaluation, writeReports } from '../runtime-evals-v1/runtime-evals-v1.mjs';

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode !== 'mock') {
    throw new Error(`Mode '${options.mode}' is unsupported. Live/provider execution is fail-closed and intentionally unavailable in runtime-evals-v1.`);
  }
  const report = runMockEvaluation(options);
  const paths = await writeReports(report, options.output);
  console.log(`Runtime Evals v1 ${report.gates.release.state}: ${report.gates.critical.passed}/${report.gates.critical.total} critical cases passed.`);
  console.log(`JSON report: ${paths.jsonPath}`);
  console.log(`Markdown report: ${paths.markdownPath}`);
  process.exitCode = report.gates.release.state === 'pass' ? 0 : 1;
} catch (error) {
  console.error(`runtime-evals-v1: ${error.message}`);
  process.exitCode = 2;
}
