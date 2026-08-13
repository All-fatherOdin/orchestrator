import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
// @ts-expect-error The production JavaScript compiler is intentionally consumed directly.
import { compileStablePrefixV1 } from "../server/prompt-compiler-v1/prompt-compiler-v1.mjs";
import {
  assertContextBudgetBaselineV1,
  buildContextBudgetReportV1,
  canonicalJsonV1,
  ContextBudgetErrorV1,
  estimateTokensV1,
  sha256V1,
  type ContextBudgetBaselineV1,
  type ContextBudgetCurrentSourceV1,
} from "../server/context-budget-v1/index.ts";

type Args = { root: string; baseline: string; requestId: string };

function parseArgs(argv: string[]): Args {
  const args: Args = { root: process.cwd(), baseline: "docs/context-budget-baseline-v1.json", requestId: "context-budget-report-v1" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1];
    if (argv[index] === "--root" && value) { args.root = value; index++; }
    else if (argv[index] === "--baseline" && value) { args.baseline = value; index++; }
    else if (argv[index] === "--request-id" && value) { args.requestId = value; index++; }
    else throw new ContextBudgetErrorV1("CONTEXT_BUDGET_INTERNAL_CONFLICT", "Context budget command arguments are invalid.");
  }
  return args;
}

function safeFile(root: string, identity: string) {
  if (isAbsolute(identity) || identity.includes("\\") || identity.split("/").includes(".."))
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_ESCAPE", "Context budget source escaped the project root.");
  const candidate = resolve(root, identity);
  let actual: string;
  try { actual = realpathSync(candidate); }
  catch { throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_MISSING", "A required context budget source is missing."); }
  const contained = relative(realpathSync(root), actual);
  if (!contained || contained === ".." || contained.startsWith(`..${sep}`) || isAbsolute(contained))
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_ESCAPE", "Context budget source escaped the project root.");
  const before = statSync(actual);
  if (!before.isFile()) throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_ESCAPE", "Context budget source is not a regular file.");
  const bytes = readFileSync(actual);
  const after = statSync(actual);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs)
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_CHANGED", "Context budget source changed during measurement.");
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_INVALID_UTF8", "Context budget source is not strict UTF-8."); }
  return bytes;
}

function helperReadSet(root: string, profile: string, maxSources: number) {
  const python = process.env.PYTHON_BIN;
  if (!python) throw new ContextBudgetErrorV1("CONTEXT_BUDGET_HELPER_UNAVAILABLE", "PYTHON_BIN is required for context budget reporting.");
  const result = spawnSync(python, ["scripts/ai_context_helper.py", "--root", ".", "read-set", "--profile", profile, "--max-sources", String(maxSources), "--format", "json"], {
    cwd: root, encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 1_000_000,
  });
  if (result.error || result.status !== 0) throw new ContextBudgetErrorV1("CONTEXT_BUDGET_HELPER_UNAVAILABLE", "Context helper did not complete.");
  let value: unknown;
  try { value = JSON.parse(result.stdout); }
  catch { throw new ContextBudgetErrorV1("CONTEXT_BUDGET_HELPER_MISMATCH", "Context helper returned invalid JSON."); }
  const readSet = (value as { read_set?: unknown })?.read_set;
  if (!Array.isArray(readSet)) throw new ContextBudgetErrorV1("CONTEXT_BUDGET_HELPER_MISMATCH", "Context helper omitted its read set.");
  return readSet.map((entry) => (entry as { path?: unknown }).path).filter((path): path is string => typeof path === "string");
}

function gitObservation(root: string, measured: ReadonlySet<string>, baselinePath: string) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  const status = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: root, encoding: "utf8", windowsHide: true });
  const paths = status.split("\0").filter(Boolean).map((entry) => {
    const path = entry.slice(3);
    const arrow = path.lastIndexOf(" -> ");
    return (arrow >= 0 ? path.slice(arrow + 4) : path).replaceAll("\\", "/");
  });
  return { head, dirty: paths.length > 0, overlappingPaths: [...new Set(paths.filter((path) => measured.has(path) || path === baselinePath))].sort() };
}

export function runContextBudgetReportCliV1(args: Args) {
  const root = realpathSync(resolve(args.root));
  const baselineIdentity = args.baseline.replaceAll("\\", "/");
  const baselineBytes = safeFile(root, baselineIdentity);
  let baselineValue: unknown;
  try { baselineValue = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(baselineBytes)); }
  catch { throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_INVALID", "Context budget baseline is invalid JSON."); }
  assertContextBudgetBaselineV1(baselineValue);
  const baseline = baselineValue as ContextBudgetBaselineV1;
  for (const profile of baseline.profiles) {
    const actual = helperReadSet(root, profile.profile, profile.maxSources);
    if (canonicalJsonV1(actual) !== canonicalJsonV1(profile.expectedPaths))
      throw new ContextBudgetErrorV1("CONTEXT_BUDGET_HELPER_MISMATCH", "Context helper selection changed from the accepted baseline.");
  }
  const currentSources: ContextBudgetCurrentSourceV1[] = baseline.sources.map((source) => {
    let bytes: Uint8Array;
    if (source.sourceClass === "fixed_prompt_prefix") {
      try { bytes = Buffer.from(String(compileStablePrefixV1({})), "utf8"); }
      catch { throw new ContextBudgetErrorV1("CONTEXT_BUDGET_PREFIX_UNAVAILABLE", "Stable prompt prefix is unavailable."); }
    } else bytes = safeFile(root, source.identity);
    return { sourceClass: source.sourceClass, identity: source.identity, sha256: sha256V1(bytes), byteCount: bytes.byteLength, tokenEvidence: estimateTokensV1(bytes.byteLength) };
  });
  const measured = new Set(baseline.sources.filter((source) => source.sourceClass !== "fixed_prompt_prefix").map((source) => source.identity));
  return buildContextBudgetReportV1({ requestId: args.requestId, baseline, baselineBytes, currentSources, project: gitObservation(root, measured, baselineIdentity) });
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) {
  try {
    const report = runContextBudgetReportCliV1(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${canonicalJsonV1(report)}\n`);
    process.exitCode = report.outcome === "fail" ? 1 : 0;
  } catch (error) {
    const reason = error instanceof ContextBudgetErrorV1 ? error.reasonCode : "CONTEXT_BUDGET_INTERNAL_CONFLICT";
    process.stderr.write(`${reason}\n`);
    process.exitCode = 1;
  }
}
