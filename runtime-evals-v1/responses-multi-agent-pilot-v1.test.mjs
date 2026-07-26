import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  runResponsesMultiAgentPilotV1,
  writeResponsesMultiAgentDecisionV1,
} from "./responses-multi-agent-pilot-v1.mjs";

test("offline pilot is bounded, reproducible in shape, and fail-closed", async () => {
  const report = await runResponsesMultiAgentPilotV1({ iterations: 3 });
  assert.equal(report.benchmark.providerCallMade, false);
  assert.equal(report.benchmark.credentialsRequired, false);
  assert.equal(report.benchmark.networkAccessed, false);
  assert.equal(report.benchmark.liveLatencyOrQualityClaim, false);
  assert.equal(report.measurements.concurrentSubagents, 3);
  assert.equal(report.measurements.rootSynthesisCount, 1);
  assert.equal(report.measurements.disjointWriteScopes, true);
  assert.equal(report.measurements.evidencePreservationRatio, 1);
  assert.equal(report.measurements.replayMatchRatio, 1);
  assert.equal(report.measurements.duplicateWorkCount, 0);
  assert.equal(report.measurements.finalSynthesisRatio, 1);
  assert.equal(report.checks.codexFlagNotConflated, true);
  assert.equal(report.decision, "NO");
  assert.equal(report.production.responsesApiDelegationEnabled, false);
  assert.equal(report.production.enablementImplemented, false);
  assert.deepEqual(report.production.repositoryInspection, {
    activeServerPilotImportCount: 0,
    activeServerResponsesBetaTokenCount: 0,
    openAiSdkDependency: false,
  });
  for (const hardFailure of [
    "maxToolCallsCompatibility",
    "compactionCompatibility",
    "reasoningSummaryCompatibility",
    "providerRuntimeRoute",
  ])
    assert.ok(report.failedChecks.includes(hardFailure));
});

test("checked-in decision artifact proves production remains disabled", async () => {
  const artifact = JSON.parse(
    await readFile(
      new URL("./responses-multi-agent-decision-v1.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(artifact.schemaVersion, "responses-multi-agent-decision-v1");
  assert.equal(artifact.decision, "NO");
  assert.equal(artifact.thresholds.declaredBeforeBenchmark, true);
  assert.equal(artifact.production.responsesApiDelegationEnabled, false);
  assert.equal(artifact.production.activeServerImportsPilot, false);
  assert.equal(artifact.production.enablementImplemented, false);
  assert.equal(artifact.production.repositoryInspection.activeServerPilotImportCount, 0);
  assert.equal(
    artifact.production.repositoryInspection.activeServerResponsesBetaTokenCount,
    0,
  );
  assert.equal(artifact.production.repositoryInspection.openAiSdkDependency, false);
  assert.ok(artifact.production.rollbackConditions.length >= 4);
});

test("decision writer emits machine-readable NO without provider access", async () => {
  const target = new URL("./responses-multi-agent-decision-v1.tmp.json", import.meta.url);
  try {
    const report = await writeResponsesMultiAgentDecisionV1(target, {
      iterations: 3,
    });
    const written = JSON.parse(await readFile(target, "utf8"));
    assert.equal(written.decision, "NO");
    assert.equal(written.evidence.thresholdIdentity, report.evidence.thresholdIdentity);
  } finally {
    const { rm } = await import("node:fs/promises");
    await rm(target, { force: true });
  }
});
