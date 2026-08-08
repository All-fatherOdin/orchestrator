import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  HaltRecordV1,
  IncidentRecordV1,
} from "../halts-incidents-v1/index.ts";
import type {
  AttemptConfigurationBindingV1,
  ResolvedModelExecutionV1,
} from "../prompt-model-eval-v1/index.ts";
import {
  INCIDENT_EVAL_CANDIDATE_LIMITS_V1,
  INCIDENT_EVAL_CANDIDATE_REASON_CODES_V1,
  INCIDENT_EVAL_CANDIDATE_STATUSES_V1,
  IncidentEvalCandidateErrorV1,
  assertIncidentEvalCandidateV1,
  buildIncidentEvalCandidateSourceSnapshotV1,
  canonicalIncidentEvalCandidateJsonV1,
  incidentEvalCandidateCaseSemanticsV1,
  normalizeIncidentEvalCandidateProposalV1,
  previewIncidentEvalCandidateV1,
  validateIncidentEvalCandidateSchemaV1,
  type IncidentEvalCandidateProposalV1,
  type IncidentEvalCandidateTrustedInputV1,
  type IncidentEvalPhase5JoinInputV1,
} from "./index.ts";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

function halt(overrides: Partial<HaltRecordV1> = {}): HaltRecordV1 {
  return {
    contractType: "HaltRecordV1",
    contractVersion: "1.0",
    haltId: "halt-one",
    projectId: "project-one",
    changeId: "change-one",
    correlationId: "correlation-one",
    scope: {
      waveId: "wave-one",
      taskId: "task-one",
      attemptId: "attempt-one",
      planRevision: 1,
      runId: "run-one",
      workspaceAttemptId: "workspace-one",
      mergeRequestId: null,
      commitId: null,
    },
    detector: {
      detectorId: "detector:verification",
      detectorEventId: "event:verification-one",
      detectorCode: "VERIFICATION_FAILED",
    },
    occurredAt: "2026-08-08T10:00:00.000Z",
    publishedAt: "2026-08-08T10:00:01.000Z",
    observation: {
      fingerprintVersion: "observation-v1",
      fingerprint: HASH_B,
      operationKind: "verification",
      component: "focused-test",
      normalizedFailureCode: "TEST_FAILED",
    },
    evidenceRefs: ["evidence:halt-one", "evidence:shared"],
    severity: "blocking",
    state: "classified",
    classificationAssessmentId: "assessment-one",
    haltClass: "acceptance_or_verification_failure",
    effectiveIncidentId: "incident-one",
    lastTransitionReasonCode: "INCIDENT_NEW",
    ...overrides,
  };
}

function incident(overrides: Partial<IncidentRecordV1> = {}): IncidentRecordV1 {
  return {
    contractType: "IncidentRecordV1",
    contractVersion: "1.0",
    incidentId: "incident-one",
    projectId: "project-one",
    changeId: "change-one",
    incidentFingerprintVersion: "incident-v1",
    incidentFingerprint: HASH_C,
    taxonomyPolicyVersion: "halt-taxonomy-v1",
    firstOccurrenceAt: "2026-08-08T10:00:00.000Z",
    latestOccurrenceAt: "2026-08-08T10:00:00.000Z",
    haltIds: ["halt-one"],
    affectedEntities: [
      {
        projectId: "project-one",
        changeId: "change-one",
        waveId: "wave-one",
        taskId: "task-one",
        operationKind: "verification",
        component: "focused-test",
      },
    ],
    severity: "blocking",
    ownerKind: "human",
    state: "open",
    correlationWindowPolicy: { durationSeconds: 3600, reopenUntil: null },
    reopenOrdinal: 0,
    correlationReasonCode: "INCIDENT_NEW",
    openedAt: "2026-08-08T10:00:01.000Z",
    ...overrides,
  };
}

function attemptBinding(
  overrides: Partial<AttemptConfigurationBindingV1> = {},
): AttemptConfigurationBindingV1 {
  return {
    contractType: "AttemptConfigurationBindingV1",
    contractVersion: "1.0",
    bindingId: "binding-attempt-one",
    bindingScope: "attempt",
    role: "executor",
    projectId: "project-one",
    changeId: "change-one",
    waveId: "wave-one",
    taskId: "task-one",
    runId: "run-one",
    attemptId: "attempt-one",
    plan: { planId: "plan-one", revision: 1, planBaseSha: HASH_A },
    authorizationId: "authorization-one",
    workspace: {
      workspaceAttemptId: "workspace-one",
      repositoryId: "repository-one",
      baseSha: HASH_A,
    },
    promptArtifactIds: ["prompt:executor-v1"],
    compositeManifestHash: HASH_B,
    compiler: { compilerId: "compiler-one", version: "1.0" },
    inputSchemaVersion: "task-input-v1",
    inputFingerprint: {
      algorithm: "scoped-sha256",
      scopeId: "attempt-one",
      value: HASH_C,
    },
    modelRouteId: "route:terra-v1",
    expectedRuntime: {
      runtimeId: "codex-cli",
      toolRoute: "local-tools",
      capabilityMapVersion: "capability-map-v1",
    },
    boundBy: "publisher:one",
    reason: "canonical-attempt-binding",
    boundAt: "2026-08-08T10:01:00.000Z",
    publicationSequence: 10,
    evidenceSnapshotHash: HASH_D,
    ...overrides,
  };
}

function resolvedExecution(
  overrides: Partial<ResolvedModelExecutionV1> = {},
): ResolvedModelExecutionV1 {
  return {
    contractType: "ResolvedModelExecutionV1",
    contractVersion: "1.0",
    resolutionId: "resolution-one",
    bindingId: "binding-attempt-one",
    projectId: "project-one",
    changeId: "change-one",
    waveId: "wave-one",
    taskId: "task-one",
    runId: "run-one",
    attemptId: "attempt-one",
    modelRouteId: "route:terra-v1",
    providerId: "openai",
    providerAdapterId: "codex-cli",
    providerAdapterVersion: "1.0",
    runtimeId: "codex-cli",
    providerModelId: "gpt-test",
    resolvedModelClass: "terra",
    capabilityMapVersion: "capability-map-v1",
    reasoningLevel: "medium",
    toolRoute: "local-tools",
    resolutionReasonCode: "REQUESTED_ROUTE_RESOLVED",
    fallback: { used: false },
    startedAt: "2026-08-08T10:01:01.000Z",
    measurements: {
      inputTokens: { state: "unsupported" },
      outputTokens: { state: "unsupported" },
      latency: { state: "unsupported" },
      cost: { state: "unsupported" },
      cache: { state: "unsupported" },
      providerMetadata: { state: "unsupported" },
    },
    ...overrides,
  };
}

function completeJoin(
  bindingOverrides: Partial<AttemptConfigurationBindingV1> = {},
  executionOverrides: Partial<ResolvedModelExecutionV1> = {},
): IncidentEvalPhase5JoinInputV1 {
  const binding = attemptBinding(bindingOverrides);
  return {
    attemptBinding: binding,
    execution: resolvedExecution({
      bindingId: binding.bindingId,
      projectId: binding.projectId,
      changeId: binding.changeId,
      waveId: binding.waveId,
      taskId: binding.taskId,
      runId: binding.runId,
      attemptId: binding.attemptId,
      modelRouteId: binding.modelRouteId,
      ...executionOverrides,
    }),
    evidenceRefs: ["evidence:phase5-one"],
  };
}

function trusted(
  overrides: Partial<IncidentEvalCandidateTrustedInputV1> = {},
): IncidentEvalCandidateTrustedInputV1 {
  return {
    projectId: "project-one",
    watermark: { sequence: 12, hash: HASH_A },
    incident: incident(),
    effectiveHalts: [halt()],
    incidentEvidenceRefs: ["evidence:incident-one"],
    phase5Joins: [completeJoin()],
    registeredExecutableOracleRefs: ["oracle:objective-v1"],
    ...overrides,
  };
}

function proposal(
  overrides: Partial<IncidentEvalCandidateProposalV1> = {},
): IncidentEvalCandidateProposalV1 {
  const result = {
    contractType: "IncidentEvalCandidateProposalV1",
    contractVersion: "1.0",
    incidentId: "incident-one",
    expectedWatermark: { sequence: 12, hash: HASH_A },
    fixture: {
      fixtureRef: "fixture:incident-one-v1",
      contentHash: HASH_B,
      byteLength: 4096,
      privacyClassification: "public_fixture",
    },
    oracle: { kind: "executable", oracleRef: "oracle:objective-v1" },
    selectedEvidenceRefs: ["evidence:halt-one", "evidence:phase5-one"],
    selector: { attemptId: "attempt-one" },
    idempotencyKey: "record:incident-one-v1",
    ...overrides,
  } as IncidentEvalCandidateProposalV1 & { selector?: IncidentEvalCandidateProposalV1["selector"] };
  if (result.selector === undefined) delete result.selector;
  return result;
}

function expectPrivateError(
  operation: () => unknown,
  reasonCode: string,
  rejectedContent?: string,
): IncidentEvalCandidateErrorV1 {
  let captured: unknown;
  assert.throws(operation, (error: unknown) => {
    captured = error;
    return (
      error instanceof IncidentEvalCandidateErrorV1 &&
      error.reasonCode === reasonCode &&
      (!rejectedContent || !error.message.includes(rejectedContent))
    );
  });
  return captured as IncidentEvalCandidateErrorV1;
}

test("closed Draft 2020-12 schemas accept valid fixtures and reject invalid fixtures", () => {
  const schemaDocument = JSON.parse(
    readFileSync(
      new URL("./schemas/incident-eval-candidates-v1.schema.json", import.meta.url),
      "utf8",
    ),
  ) as { $schema: string };
  assert.equal(schemaDocument.$schema, "https://json-schema.org/draft/2020-12/schema");

  const fixtures = JSON.parse(
    readFileSync(
      new URL("./schemas/incident-eval-candidates-v1.examples.json", import.meta.url),
      "utf8",
    ),
  ) as {
    valid: Array<{ schemaDefinition: Parameters<typeof validateIncidentEvalCandidateSchemaV1>[0]; value: unknown }>;
    invalid: Array<{ schemaDefinition: Parameters<typeof validateIncidentEvalCandidateSchemaV1>[0]; value: unknown }>;
  };
  for (const fixture of fixtures.valid)
    assert.equal(
      validateIncidentEvalCandidateSchemaV1(fixture.schemaDefinition, fixture.value),
      true,
      fixture.schemaDefinition,
    );
  for (const fixture of fixtures.invalid)
    assert.equal(
      validateIncidentEvalCandidateSchemaV1(fixture.schemaDefinition, fixture.value),
      false,
      fixture.schemaDefinition,
    );

  const unknownField = { ...proposal(), projectId: "caller-project" };
  expectPrivateError(
    () => normalizeIncidentEvalCandidateProposalV1(unknownField),
    "REQUEST_SCHEMA_INVALID",
  );
  expectPrivateError(
    () =>
      normalizeIncidentEvalCandidateProposalV1({
        ...proposal(),
        contractVersion: "2.0",
      }),
    "REQUEST_VERSION_UNSUPPORTED",
  );
});

test("ready executable preview derives exact Phase 4 and Phase 5 identity", () => {
  const result = previewIncidentEvalCandidateV1(proposal(), trusted());
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;

  assert.equal(result.projectId, "project-one");
  assert.equal(result.incidentId, "incident-one");
  assert.equal(result.candidate.changeId, "change-one");
  assert.deepEqual(result.candidate.haltIds, ["halt-one"]);
  assert.equal(result.candidate.waveId, "wave-one");
  assert.equal(result.candidate.taskId, "task-one");
  assert.equal(result.candidate.attemptId, "attempt-one");
  assert.deepEqual(result.candidate.phase5Lineage, {
    state: "supported",
    bindingId: "binding-attempt-one",
    resolutionId: "resolution-one",
    promptArtifactIds: ["prompt:executor-v1"],
    modelRouteId: "route:terra-v1",
  });
  assert.deepEqual(result.reasonCodes, []);
  assert.equal(result.wouldMutate, false);
  assert.match(result.candidate.candidateId, /^iec_[a-f0-9]{64}$/);
  assert.equal(result.confirmation.candidateHash, result.candidateHash);
  assert.equal(
    validateIncidentEvalCandidateSchemaV1("IncidentEvalCandidatePreviewV1", result),
    true,
  );
});

test("ready human-oracle candidate makes absent Phase 5 lineage explicit and reuses EvalCase semantics", () => {
  const request = proposal({
    oracle: { kind: "human", oracleRef: "oracle:human-review-required-v1" },
    selectedEvidenceRefs: ["evidence:incident-one"],
    selector: undefined,
    fixture: {
      ...proposal().fixture,
      privacyClassification: "approved_internal_fixture",
    },
  });
  const result = previewIncidentEvalCandidateV1(
    request,
    trusted({ phase5Joins: [] }),
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.candidate.phase5Lineage, {
    state: "unsupported",
    reasonCode: "PHASE5_LINEAGE_NOT_AVAILABLE",
  });
  assert.deepEqual(incidentEvalCandidateCaseSemanticsV1(result.candidate), {
    inputFixtureRef: "fixture:incident-one-v1",
    acceptanceOracle: {
      kind: "human",
      oracleRef: "oracle:human-review-required-v1",
    },
    severity: "blocking",
    expectedEvidenceRefs: ["evidence:incident-one"],
  });
});

test("normalization is canonical, deterministic, byte-equal, and does not mutate input", () => {
  const request = proposal({
    selectedEvidenceRefs: [
      "evidence:phase5-one",
      "evidence:halt-one",
      "evidence:halt-one",
    ],
  });
  const beforeRequest = structuredClone(request);
  const source = trusted({
    incidentEvidenceRefs: ["evidence:incident-one"],
    registeredExecutableOracleRefs: ["oracle:objective-v1"],
  });
  const beforeSource = structuredClone(source);
  const first = previewIncidentEvalCandidateV1(request, source);
  const second = previewIncidentEvalCandidateV1(
    proposal({
      selectedEvidenceRefs: ["evidence:halt-one", "evidence:phase5-one"],
    }),
    source,
  );
  assert.deepEqual(request, beforeRequest);
  assert.deepEqual(source, beforeSource);
  assert.equal(
    canonicalIncidentEvalCandidateJsonV1(first),
    canonicalIncidentEvalCandidateJsonV1(second),
  );
  assert.deepEqual(first, second);
});

test("candidate identity excludes ledger sequence, publication clocks, and actor display text", () => {
  const first = previewIncidentEvalCandidateV1(proposal(), trusted());
  const changedSource = trusted({
    watermark: { sequence: 99, hash: HASH_D },
    incident: incident({
      firstOccurrenceAt: "2026-08-09T10:00:00.000Z",
      latestOccurrenceAt: "2026-08-09T10:01:00.000Z",
      openedAt: "2026-08-09T10:00:01.000Z",
    }),
    effectiveHalts: [
      halt({
        occurredAt: "2026-08-09T10:00:00.000Z",
        publishedAt: "2026-08-09T10:00:01.000Z",
      }),
    ],
    phase5Joins: [
      completeJoin(
        {
          boundBy: "human:Different Display Name",
          boundAt: "2026-08-09T10:01:00.000Z",
          publicationSequence: 999,
        },
        { startedAt: "2026-08-09T10:01:01.000Z" },
      ),
    ],
  });
  const second = previewIncidentEvalCandidateV1(
    proposal({ expectedWatermark: changedSource.watermark }),
    changedSource,
  );
  assert.equal(first.status, "ready");
  assert.equal(second.status, "ready");
  if (first.status !== "ready" || second.status !== "ready") return;
  assert.equal(first.candidate.candidateId, second.candidate.candidateId);
  assert.equal(first.candidate.sourceSnapshotHash, second.candidate.sourceSnapshotHash);
  assert.notEqual(first.candidateHash, second.candidateHash);
});

test("source snapshot changes on canonical incident lifecycle state and remains closed", () => {
  const open = buildIncidentEvalCandidateSourceSnapshotV1(trusted());
  const reopened = buildIncidentEvalCandidateSourceSnapshotV1(
    trusted({
      incident: incident({ state: "reopened", reopenOrdinal: 1 }),
    }),
  );
  assert.notEqual(open.sourceSnapshotHash, reopened.sourceSnapshotHash);
  assert.equal(
    validateIncidentEvalCandidateSchemaV1(
      "IncidentEvalCandidateSourceSnapshotV1",
      open,
    ),
    true,
  );
  assert.equal(open.incidentState, "open");
  assert.deepEqual(open.orderedHaltIds, ["halt-one"]);
});

test("candidate semantic, identity, and content-hash tampering fail with stable private codes", () => {
  const result = previewIncidentEvalCandidateV1(proposal(), trusted());
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.doesNotThrow(() =>
    assertIncidentEvalCandidateV1(result.candidate, result.candidateHash),
  );
  expectPrivateError(
    () =>
      assertIncidentEvalCandidateV1({
        ...result.candidate,
        candidateId: `iec_${HASH_D}`,
      }),
    "CANDIDATE_IDENTITY_INVALID",
  );
  expectPrivateError(
    () => assertIncidentEvalCandidateV1(result.candidate, HASH_D),
    "CANDIDATE_HASH_INVALID",
  );
  expectPrivateError(
    () =>
      assertIncidentEvalCandidateV1({
        ...result.candidate,
        evidenceRefs: [...result.candidate.evidenceRefs].reverse(),
      }),
    "CANDIDATE_SEMANTIC_INVALID",
  );
});

test("preview implements stale, insufficient-evidence, unsupported, and conflict states", () => {
  const stale = previewIncidentEvalCandidateV1(
    proposal({ expectedWatermark: { sequence: 11, hash: HASH_D } }),
    trusted(),
  );
  assert.equal(stale.status, "stale");
  assert.deepEqual(stale.reasonCodes, ["PROJECT_SOURCE_STALE"]);

  const missingIncident = previewIncidentEvalCandidateV1(
    proposal(),
    trusted({ incident: null }),
  );
  assert.equal(missingIncident.status, "insufficient-evidence");
  assert.deepEqual(missingIncident.reasonCodes, ["INCIDENT_MISSING"]);

  const missingHalt = previewIncidentEvalCandidateV1(
    proposal(),
    trusted({ effectiveHalts: [] }),
  );
  assert.equal(missingHalt.status, "insufficient-evidence");
  assert.deepEqual(missingHalt.reasonCodes, ["HALT_MISSING"]);

  const unknownEvidence = previewIncidentEvalCandidateV1(
    proposal({ selectedEvidenceRefs: ["evidence:unknown"] }),
    trusted(),
  );
  assert.equal(unknownEvidence.status, "insufficient-evidence");
  assert.deepEqual(unknownEvidence.reasonCodes, ["EVIDENCE_UNKNOWN"]);

  const unsupportedOracle = previewIncidentEvalCandidateV1(
    proposal({ oracle: { kind: "executable", oracleRef: "oracle:not-registered" } }),
    trusted(),
  );
  assert.equal(unsupportedOracle.status, "unsupported");
  assert.deepEqual(unsupportedOracle.reasonCodes, ["ORACLE_UNREGISTERED"]);

  const unsupportedAttempt = previewIncidentEvalCandidateV1(
    proposal({ selector: { attemptId: "attempt-missing" } }),
    trusted(),
  );
  assert.equal(unsupportedAttempt.status, "unsupported");
  assert.deepEqual(unsupportedAttempt.reasonCodes, ["ATTEMPT_LINEAGE_UNSUPPORTED"]);

  const identityConflict = previewIncidentEvalCandidateV1(
    proposal({ incidentId: "incident-other" }),
    trusted(),
  );
  assert.equal(identityConflict.status, "conflict");
  assert.deepEqual(identityConflict.reasonCodes, ["INCIDENT_IDENTITY_MISMATCH"]);

  const secondJoin = completeJoin(
    { bindingId: "binding-attempt-two" },
    { resolutionId: "resolution-two" },
  );
  const ambiguous = previewIncidentEvalCandidateV1(
    proposal({ selector: undefined }),
    trusted({ phase5Joins: [completeJoin(), secondJoin] }),
  );
  assert.equal(ambiguous.status, "conflict");
  assert.deepEqual(ambiguous.reasonCodes, ["ATTEMPT_LINEAGE_CONFLICT"]);
});

test("exact invocation selector produces exact optional invocation lineage", () => {
  const attempt = attemptBinding();
  const invocation = attemptBinding({
    bindingId: "binding-invocation-one",
    bindingScope: "invocation",
    invocationId: "invocation-one",
    parentAttemptBindingId: attempt.bindingId,
  });
  const execution = resolvedExecution({
    resolutionId: "resolution-invocation-one",
    bindingId: invocation.bindingId,
    invocationId: "invocation-one",
  });
  const join: IncidentEvalPhase5JoinInputV1 = {
    attemptBinding: attempt,
    invocationBinding: invocation,
    execution,
    evidenceRefs: ["evidence:phase5-one"],
  };
  const result = previewIncidentEvalCandidateV1(
    proposal({ selector: { attemptId: "attempt-one", invocationId: "invocation-one" } }),
    trusted({ phase5Joins: [join] }),
  );
  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.deepEqual(result.candidate.phase5Lineage, {
    state: "supported",
    bindingId: "binding-attempt-one",
    invocationBindingId: "binding-invocation-one",
    resolutionId: "resolution-invocation-one",
    invocationId: "invocation-one",
    promptArtifactIds: ["prompt:executor-v1"],
    modelRouteId: "route:terra-v1",
  });
});

test("exact invocation selection fences evidence to that one Phase 5 join", () => {
  const attempt = attemptBinding();
  const invocationOne = attemptBinding({
    bindingId: "binding-invocation-one",
    bindingScope: "invocation",
    invocationId: "invocation-one",
    parentAttemptBindingId: attempt.bindingId,
  });
  const invocationTwo = attemptBinding({
    bindingId: "binding-invocation-two",
    bindingScope: "invocation",
    invocationId: "invocation-two",
    parentAttemptBindingId: attempt.bindingId,
  });
  const joins: IncidentEvalPhase5JoinInputV1[] = [
    {
      attemptBinding: attempt,
      invocationBinding: invocationOne,
      execution: resolvedExecution({
        resolutionId: "resolution-invocation-one",
        bindingId: invocationOne.bindingId,
        invocationId: invocationOne.invocationId,
      }),
      evidenceRefs: ["evidence:invocation-one"],
    },
    {
      attemptBinding: attempt,
      invocationBinding: invocationTwo,
      execution: resolvedExecution({
        resolutionId: "resolution-invocation-two",
        bindingId: invocationTwo.bindingId,
        invocationId: invocationTwo.invocationId,
      }),
      evidenceRefs: ["evidence:invocation-two"],
    },
  ];
  const exact = previewIncidentEvalCandidateV1(
    proposal({
      selector: { attemptId: "attempt-one", invocationId: "invocation-one" },
      selectedEvidenceRefs: ["evidence:halt-one", "evidence:invocation-one"],
    }),
    trusted({ phase5Joins: joins }),
  );
  assert.equal(exact.status, "ready");

  const injected = previewIncidentEvalCandidateV1(
    proposal({
      selector: { attemptId: "attempt-one", invocationId: "invocation-one" },
      selectedEvidenceRefs: ["evidence:halt-one", "evidence:invocation-two"],
    }),
    trusted({ phase5Joins: joins }),
  );
  assert.equal(injected.status, "insufficient-evidence");
  assert.deepEqual(injected.reasonCodes, ["EVIDENCE_UNKNOWN"]);
});

test("multiple complete or unresolved Phase 5 joins require an exact selector", () => {
  const unresolvedBinding = attemptBinding({
    bindingId: "binding-attempt-two",
    attemptId: "attempt-two",
  });
  const unresolved: IncidentEvalPhase5JoinInputV1 = {
    attemptBinding: unresolvedBinding,
    evidenceRefs: ["evidence:phase5-two"],
  };

  for (const joins of [
    [completeJoin(), unresolved],
    [
      {
        attemptBinding: attemptBinding(),
        evidenceRefs: ["evidence:phase5-one"],
      },
      unresolved,
    ],
  ]) {
    const result = previewIncidentEvalCandidateV1(
      proposal({
        selector: undefined,
        selectedEvidenceRefs: ["evidence:halt-one"],
      }),
      trusted({ phase5Joins: joins }),
    );
    assert.equal(result.status, "conflict");
    assert.deepEqual(result.reasonCodes, ["ATTEMPT_LINEAGE_CONFLICT"]);
  }
});

test("prohibited fields, secrets, paths, URLs, fixture bytes, and raw content fail privately", () => {
  const forbidden = [
    ["prompt", "private prompt"],
    ["response", "private response"],
    ["transcript", "private transcript"],
    ["hiddenReasoning", "private reasoning"],
    ["rawDiff", "private diff"],
    ["rawLog", "private log"],
    ["credentials", "private credential"],
    ["fixtureBytes", "embedded bytes"],
    ["url", "https://example.invalid/private"],
    ["path", "C:\\private\\fixture.json"],
  ] as const;
  for (const [key, rejected] of forbidden)
    expectPrivateError(
      () => normalizeIncidentEvalCandidateProposalV1({ ...proposal(), [key]: rejected }),
      "PROHIBITED_FIELD",
      rejected,
    );

  const secret = "Bearer secret-token-value-123456";
  expectPrivateError(
    () =>
      normalizeIncidentEvalCandidateProposalV1({
        ...proposal(),
        fixture: { ...proposal().fixture, fixtureRef: secret },
      }),
    "SECRET_LIKE_INPUT",
    secret,
  );
  expectPrivateError(
    () =>
      normalizeIncidentEvalCandidateProposalV1({
        ...proposal(),
        fixture: {
          ...proposal().fixture,
          fixtureRef: "https://example.invalid/fixture",
        },
      }),
    "FIXTURE_REFERENCE_INVALID",
    "example.invalid",
  );
  expectPrivateError(
    () =>
      normalizeIncidentEvalCandidateProposalV1({
        ...proposal(),
        fixture: { ...proposal().fixture, fixtureRef: "C:\\fixtures\\one.json" },
      }),
    "FIXTURE_REFERENCE_INVALID",
    "fixtures",
  );
  for (const relativePath of [
    "private/fixture.json",
    "fixtures/nested/one.json",
    "./fixture.json",
    "../fixture.json",
  ]) {
    assert.equal(
      validateIncidentEvalCandidateSchemaV1("IncidentEvalCandidateProposalV1", {
        ...proposal(),
        fixture: { ...proposal().fixture, fixtureRef: relativePath },
      }),
      false,
      relativePath,
    );
    expectPrivateError(
      () =>
        normalizeIncidentEvalCandidateProposalV1({
          ...proposal(),
          fixture: { ...proposal().fixture, fixtureRef: relativePath },
        }),
      "FIXTURE_REFERENCE_INVALID",
      relativePath,
    );
  }

  const ready = previewIncidentEvalCandidateV1(proposal(), trusted());
  const serialized = canonicalIncidentEvalCandidateJsonV1(ready).toLowerCase();
  for (const forbiddenName of [
    "prompt\"",
    "response",
    "transcript",
    "hiddenreasoning",
    "rawdiff",
    "rawlog",
    "credential",
    "fixturebytes",
    "http://",
    "https://",
  ])
    assert.equal(serialized.includes(forbiddenName), false, forbiddenName);
});

test("fixed byte, string, count, fixture, prompt-artifact, and diagnostic limits fail closed", () => {
  expectPrivateError(
    () =>
      normalizeIncidentEvalCandidateProposalV1({
        ...proposal(),
        idempotencyKey: "x".repeat(
          INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxStringLength + 1,
        ),
      }),
    "REQUEST_LIMIT_EXCEEDED",
  );
  expectPrivateError(
    () =>
      normalizeIncidentEvalCandidateProposalV1({
        ...proposal(),
        selectedEvidenceRefs: Array.from(
          { length: INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxEvidenceRefs + 1 },
          (_, index) => `evidence:item-${index}`,
        ),
      }),
    "COUNT_LIMIT_EXCEEDED",
  );
  expectPrivateError(
    () =>
      normalizeIncidentEvalCandidateProposalV1({
        ...proposal(),
        fixture: {
          ...proposal().fixture,
          byteLength: INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxFixtureBytes + 1,
        },
      }),
    "FIXTURE_SIZE_INVALID",
  );

  const tooManyPrompts = Array.from(
    { length: INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxPromptArtifactCount + 1 },
    (_, index) => `prompt:item-${index}`,
  );
  const promptLimit = previewIncidentEvalCandidateV1(
    proposal(),
    trusted({
      phase5Joins: [completeJoin({ promptArtifactIds: tooManyPrompts })],
    }),
  );
  assert.equal(promptLimit.status, "conflict");
  assert.deepEqual(promptLimit.reasonCodes, ["COUNT_LIMIT_EXCEEDED"]);
  assert.ok(
    promptLimit.diagnostics.every(
      (diagnostic) =>
        diagnostic.length <= INCIDENT_EVAL_CANDIDATE_LIMITS_V1.maxDiagnosticLength,
    ),
  );
});

test("all public states, oracle/fixture classes, and stable reason codes remain closed", () => {
  assert.deepEqual(INCIDENT_EVAL_CANDIDATE_STATUSES_V1, [
    "ready",
    "insufficient-evidence",
    "unsupported",
    "conflict",
    "stale",
  ]);
  for (const code of [
    "REQUEST_SCHEMA_INVALID",
    "PROJECT_SOURCE_STALE",
    "EVIDENCE_UNKNOWN",
    "ATTEMPT_LINEAGE_UNSUPPORTED",
    "BINDING_LINEAGE_CONFLICT",
    "FIXTURE_PRIVACY_INVALID",
    "ORACLE_UNREGISTERED",
    "CANDIDATE_HASH_INVALID",
    "PREVIEW_CONFIRMATION_MISMATCH",
    "EXPLICIT_CONFIRMATION_REQUIRED",
    "IDEMPOTENCY_CONFLICT",
    "LEDGER_CORRUPTION",
    "CONCURRENT_STALE_CONTENDER",
  ])
    assert.ok(INCIDENT_EVAL_CANDIDATE_REASON_CODES_V1.includes(code as never));
});

test("the pure module has no writer, persistence, network, route, provider, or mutation surface", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  for (const forbidden of [
    "node:fs",
    "node:http",
    "node:https",
    "express",
    "fetch(",
    "appendFile",
    "writeFile",
    "ProjectWriter",
    "EvalSuiteV1",
    "transitionIncident",
  ])
    assert.equal(source.includes(forbidden), false, forbidden);
});
