import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const median = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
};

const executeWorkstream = async (workstream) => {
  await new Promise((resolve) => setTimeout(resolve, workstream.delayMs));
  return {
    id: workstream.id,
    allowedPaths: workstream.allowedPaths,
    facts: workstream.facts,
    evidence: workstream.evidence,
    receipt: hash({
      id: workstream.id,
      facts: workstream.facts,
      evidence: workstream.evidence,
    }),
  };
};

const synthesize = (results) => ({
  root: "/root",
  results: [...results].sort((a, b) => a.id.localeCompare(b.id)),
  evidence: [...new Set(results.flatMap((result) => result.evidence))].sort(),
});

async function timed(mode, workstreams) {
  const started = performance.now();
  const results = [];
  if (mode === "single-agent") {
    for (const workstream of workstreams)
      results.push(await executeWorkstream(workstream));
  } else {
    results.push(...(await Promise.all(workstreams.map(executeWorkstream))));
  }
  return { elapsedMs: performance.now() - started, synthesis: synthesize(results) };
}

const tokenAccounting = (fixtures) => {
  const work = fixtures.workstreams.reduce(
    (sum, item) => ({
      input: sum.input + item.tokenInputs.input,
      output: sum.output + item.tokenInputs.output,
    }),
    { input: 0, output: 0 },
  );
  const { accounting } = fixtures;
  const single = {
    input: accounting.singleAgentRootInput + work.input,
    output: accounting.singleAgentSynthesisOutput + work.output,
  };
  const multi = {
    input:
      accounting.multiAgentRootInput +
      accounting.multiAgentDelegationOverheadInput +
      work.input,
    output: accounting.multiAgentSynthesisOutput + work.output,
  };
  const cost = (entry) =>
    entry.input * accounting.costWeights.input +
    entry.output * accounting.costWeights.output;
  return {
    unit: "deterministic fixture token units (not provider-reported tokens)",
    costInputUnit:
      "weighted fixture units; input weight 1, output weight 4 (not currency)",
    singleAgent: { ...single, total: single.input + single.output, costInput: cost(single) },
    multiAgent: { ...multi, total: multi.input + multi.output, costInput: cost(multi) },
  };
};

const providerCompatibility = {
  evidenceAsOf: "2026-07-23",
  sources: [
    {
      url: "https://developers.openai.com/api/docs/guides/responses-multi-agent",
      claim:
        "Responses API Multi-agent is a GPT-5.6 beta enabled by multi_agent.enabled and responses_multi_agent=v1; default recommended concurrency is three.",
    },
    {
      url: "https://developers.openai.com/api/docs/guides/responses-multi-agent#limitations",
      claim:
        "With Multi-agent enabled, /responses/compact, reasoning.summary, and max_tool_calls are unsupported; automatic per-agent compaction is implicit.",
    },
    {
      url: "https://developers.openai.com/api/docs/guides/amazon-bedrock#responses-api-feature-availability",
      claim: "Responses API Multi-agent is not available through Amazon Bedrock.",
    },
  ],
  openAiResponsesApi: {
    multiAgentBeta: true,
    maxToolCalls: false,
    explicitCompaction: false,
    automaticPerAgentCompaction: true,
    reasoningSummary: false,
    responseItemReplay: true,
  },
  amazonBedrockResponsesCompatibleRuntime: { multiAgentBeta: false },
  repositoryRuntime: {
    route: "fresh ephemeral Codex CLI sessions",
    directResponsesApiAdapter: false,
    openAiSdkDependency: false,
    productionImport: false,
  },
  codexMultiAgentFlag: {
    capability: "Codex runtime collaboration mode",
    sameAsResponsesApiMultiAgent: false,
    gateInput: false,
  },
};

export async function runResponsesMultiAgentPilotV1({ iterations = 5 } = {}) {
  const thresholds = await readJson(
    join(root, "server", "multi-agent-pilot-v1", "thresholds.json"),
  );
  const fixtures = await readJson(
    join(here, "responses-multi-agent-fixtures-v1.json"),
  );
  const packageManifest = await readJson(join(root, "package.json"));
  const activeServerSource = await readFile(join(root, "server", "index.ts"), "utf8");
  const productionInspection = {
    activeServerPilotImportCount: (
      activeServerSource.match(/multi-agent-pilot-v1/g) ?? []
    ).length,
    activeServerResponsesBetaTokenCount: (
      activeServerSource.match(/responses_multi_agent|multi_agent\.enabled/g) ?? []
    ).length,
    openAiSdkDependency:
      packageManifest.dependencies?.openai !== undefined ||
      packageManifest.devDependencies?.openai !== undefined,
  };
  const productionDisabled =
    productionInspection.activeServerPilotImportCount === 0 &&
    productionInspection.activeServerResponsesBetaTokenCount === 0 &&
    productionInspection.openAiSdkDependency === false;
  if (!thresholds.declaredBeforeBenchmark)
    throw new Error("GO thresholds must be declared before benchmark execution.");
  if (!Number.isInteger(iterations) || iterations < 3)
    throw new Error("At least three timing iterations are required.");

  const scopes = fixtures.workstreams.flatMap((workstream, owner) =>
    workstream.allowedPaths.map((path) => ({
      path: path.replaceAll("\\", "/").replace(/^\.\/|\/$/g, "").toLowerCase(),
      owner,
    })),
  );
  const disjointWriteScopes = scopes.every((left, leftIndex) =>
    scopes.every(
      (right, rightIndex) =>
        leftIndex === rightIndex ||
        left.owner === right.owner ||
        !(
          left.path === right.path ||
          left.path.startsWith(`${right.path}/`) ||
          right.path.startsWith(`${left.path}/`)
        ),
    ),
  );
  if (!disjointWriteScopes) throw new Error("Fixture write scopes overlap.");
  if (
    fixtures.workstreams.length >
    thresholds.execution.maximumConcurrentSubagents
  )
    throw new Error("Fixture exceeds the declared subagent cap.");

  const singleRuns = [];
  const multiRuns = [];
  for (let index = 0; index < iterations; index += 1) {
    singleRuns.push(await timed("single-agent", fixtures.workstreams));
    multiRuns.push(await timed("responses-api-multi-agent-simulation", fixtures.workstreams));
  }
  const singleMs = median(singleRuns.map((run) => run.elapsedMs));
  const multiMs = median(multiRuns.map((run) => run.elapsedMs));
  const baseline = singleRuns[0].synthesis;
  const candidate = multiRuns[0].synthesis;
  const expectedEvidence = fixtures.workstreams.flatMap((item) => item.evidence);
  const evidencePreservationRatio =
    candidate.evidence.filter((item) => expectedEvidence.includes(item)).length /
    expectedEvidence.length;
  const replayMatchRatio = hash(candidate) === hash(synthesize(candidate.results)) ? 1 : 0;
  const duplicateWorkCount =
    candidate.results.length - new Set(candidate.results.map((item) => item.id)).size;
  const finalSynthesisRatio =
    candidate.root === "/root" &&
    candidate.results.length === fixtures.workstreams.length
      ? 1
      : 0;
  const quality = (synthesis) =>
    (synthesis.results.length === fixtures.workstreams.length ? 0.5 : 0) +
    (synthesis.evidence.length === expectedEvidence.length ? 0.5 : 0);
  const tokens = tokenAccounting(fixtures);
  const measurements = {
    timing: {
      clock: "performance.now",
      iterations,
      statistic: "median",
      singleAgentMs: Number(singleMs.toFixed(3)),
      multiAgentSimulationMs: Number(multiMs.toFixed(3)),
      wallClockImprovementRatio: Number(((singleMs - multiMs) / singleMs).toFixed(4)),
      samples: {
        singleAgentMs: singleRuns.map((run) => Number(run.elapsedMs.toFixed(3))),
        multiAgentSimulationMs: multiRuns.map((run) => Number(run.elapsedMs.toFixed(3))),
      },
    },
    quality: {
      singleAgent: quality(baseline),
      multiAgentSimulation: quality(candidate),
      improvement: quality(candidate) - quality(baseline),
    },
    tokens,
    tokenInputRatio: Number((tokens.multiAgent.total / tokens.singleAgent.total).toFixed(4)),
    costInputRatio: Number(
      (tokens.multiAgent.costInput / tokens.singleAgent.costInput).toFixed(4),
    ),
    toolCalls: {
      singleAgent: fixtures.workstreams.length,
      multiAgentSimulation: fixtures.workstreams.length,
      responsesApiMaxToolCallsSupported: false,
    },
    compaction: {
      localFixtureReplayPreserved: replayMatchRatio === 1,
      responsesApiExplicitCompactSupported: false,
      responsesApiAutomaticPerAgentCompaction: true,
    },
    reasoningSummary: {
      localFixtureSummaryCompatible: true,
      responsesApiReasoningSummarySupported: false,
    },
    evidencePreservationRatio,
    replayMatchRatio,
    responsesApiResponseItemReplaySupported:
      providerCompatibility.openAiResponsesApi.responseItemReplay,
    duplicateWorkCount,
    finalSynthesisRatio,
    disjointWriteScopes,
    concurrentSubagents: fixtures.workstreams.length,
    rootSynthesisCount: fixtures.rootSynthesisCount,
  };

  const checks = {
    valueGain:
      measurements.timing.wallClockImprovementRatio >=
        thresholds.value.minimumWallClockImprovementRatio ||
      measurements.quality.improvement >= thresholds.value.minimumQualityImprovement,
    quality:
      measurements.quality.multiAgentSimulation >= thresholds.value.minimumQualityScore &&
      measurements.quality.multiAgentSimulation >= measurements.quality.singleAgent,
    tokens:
      measurements.tokenInputRatio <= thresholds.value.maximumTokenInputRatio,
    costInputs:
      measurements.costInputRatio <= thresholds.value.maximumCostInputRatio,
    evidence:
      evidencePreservationRatio >=
      thresholds.correctness.minimumEvidencePreservationRatio,
    replay:
      replayMatchRatio >= thresholds.correctness.minimumReplayMatchRatio,
    duplicateWork:
      duplicateWorkCount <= thresholds.correctness.maximumDuplicateWorkCount,
    synthesis:
      finalSynthesisRatio >= thresholds.correctness.minimumFinalSynthesisRatio,
    disjointWriteScopes,
    subagentCap:
      fixtures.workstreams.length <=
      thresholds.execution.maximumConcurrentSubagents,
    oneRootSynthesis:
      fixtures.rootSynthesisCount === thresholds.execution.requiredRootSyntheses,
    responsesApiCapability: providerCompatibility.openAiResponsesApi.multiAgentBeta,
    maxToolCallsCompatibility: providerCompatibility.openAiResponsesApi.maxToolCalls,
    compactionCompatibility:
      providerCompatibility.openAiResponsesApi.explicitCompaction,
    reasoningSummaryCompatibility:
      providerCompatibility.openAiResponsesApi.reasoningSummary,
    providerRuntimeRoute:
      providerCompatibility.repositoryRuntime.directResponsesApiAdapter,
    productionDisabled,
    codexFlagNotConflated:
      providerCompatibility.codexMultiAgentFlag.sameAsResponsesApiMultiAgent === false &&
      providerCompatibility.codexMultiAgentFlag.gateInput === false,
  };
  const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const decision = failedChecks.length === 0 ? "GO" : "NO";
  return {
    schemaVersion: "responses-multi-agent-decision-v1",
    decision,
    summary:
      decision === "GO"
        ? "All predeclared value, correctness, compatibility, and rollout gates passed."
        : "Production delegation remains disabled because one or more predeclared hard gates failed.",
    benchmark: {
      mode: "deterministic-local-fixtures",
      simulatesResponsesApiSchedulingOnly: true,
      providerCallMade: false,
      credentialsRequired: false,
      networkAccessed: false,
      liveLatencyOrQualityClaim: false,
      fixtureSet: fixtures.fixtureSet,
    },
    distinction: {
      responsesApiMultiAgent:
        "Provider beta controlled by Responses request multi_agent.enabled plus responses_multi_agent=v1.",
      codexMultiAgent:
        "Separate Codex runtime collaboration mode; it is neither evidence for nor an input to this Responses API gate.",
    },
    thresholds,
    measurements,
    checks,
    failedChecks,
    providerRuntimeCompatibility: providerCompatibility,
    evidence: {
      baselineSynthesisHash: hash(baseline),
      candidateSynthesisHash: hash(candidate),
      replaySynthesisHash: hash(synthesize(candidate.results)),
      stableFixtureIdentity: hash(fixtures),
      thresholdIdentity: hash(thresholds),
      note: stable({ fixtureSet: fixtures.fixtureSet, thresholds: thresholds.schemaVersion }),
    },
    production: {
      responsesApiDelegationEnabled: false,
      activeServerImportsPilot:
        productionInspection.activeServerPilotImportCount > 0,
      enablementImplemented: false,
      repositoryInspection: productionInspection,
      rollbackConditions: [
        "Any predeclared threshold regresses.",
        "Provider beta schema or availability changes.",
        "Tool-call limiting, evidence, replay, compaction, or reasoning-summary behavior becomes incompatible.",
        "Write scopes overlap, subagent concurrency exceeds three, duplicate work appears, or root synthesis is missing.",
        "Token or weighted cost inputs exceed 1.5x the single-agent baseline.",
      ],
      rollbackAction:
        "Keep the active server on its existing single-agent Codex CLI execution path; remove any future adapter import or request-level enablement.",
    },
  };
}

export async function writeResponsesMultiAgentDecisionV1(output, options) {
  const report = await runResponsesMultiAgentPilotV1(options);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

if (
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])
) {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex < 0 || !process.argv[outputIndex + 1])
    throw new Error("--output is required");
  const report = await writeResponsesMultiAgentDecisionV1(
    process.argv[outputIndex + 1],
  );
  console.log(`${report.decision}: ${report.failedChecks.join(", ") || "all gates passed"}`);
}
