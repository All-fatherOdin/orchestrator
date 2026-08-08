import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { ChangeControlError, ChangeControlStore } from "../change-control-v1/index.ts";
import {
  observationFingerprintV1,
  type AttributionAssessmentV1,
  type HaltRecordV1,
} from "../halts-incidents-v1/index.ts";
import {
  IncidentEvalCandidateErrorV1,
  assertIncidentEvalCandidateReceiptV1,
  canonicalIncidentEvalCandidateJsonV1,
  normalizeRecordIncidentEvalCandidateRequestV1,
  validateIncidentEvalCandidateSchemaV1,
  type IncidentEvalCandidatePreviewV1,
  type IncidentEvalCandidateProposalV1,
  type RecordIncidentEvalCandidateRequestV1,
} from "./index.ts";
import {
  captureIncidentEvalCandidateJsonBodyByteLengthV1,
  installIncidentEvalCandidateRoutesV1,
} from "./http.ts";

const projectId = "incident-candidate-project";
const changeId = "incident-candidate-change";
const waveId = "incident-candidate-wave";
const taskId = "incident-candidate-task";
const haltId = "incident-candidate-halt";
const evidenceRef = "evidence:incident-candidate-halt";
const fixtureHash = "a".repeat(64);

type SeededFixtureV1 = Awaited<ReturnType<typeof seedFixtureV1>>;

async function filesystemSnapshotV1(root: string) {
  const names = (await readdir(root, { recursive: true }).catch(() => []))
    .map(String)
    .sort();
  const files: Array<readonly [string, string]> = [];
  for (const name of names) {
    const path = join(root, name);
    const bytes = await readFile(path).catch(() => undefined);
    if (bytes) files.push([name, bytes.toString("base64")]);
  }
  return { names, files };
}

async function projectLedgerFileV1(storeRoot: string) {
  const names = await readdir(join(storeRoot, "projects"));
  assert.equal(names.length, 1);
  return join(storeRoot, "projects", names[0]!);
}

function eventHashV1(event: Record<string, unknown>) {
  return createHash("sha256")
    .update(canonicalIncidentEvalCandidateJsonV1(event))
    .digest("hex");
}

function haltContractsV1(now: string) {
  const scope = {
    waveId,
    taskId,
    attemptId: null,
    planRevision: null,
    runId: null,
    workspaceAttemptId: null,
    mergeRequestId: null,
    commitId: null,
  } as const;
  const haltWithoutFingerprint: HaltRecordV1 = {
    contractType: "HaltRecordV1",
    contractVersion: "1.0",
    haltId,
    projectId,
    changeId,
    correlationId: "correlation:incident-candidate",
    scope,
    detector: {
      detectorId: "detector:incident-candidate-test",
      detectorEventId: "detector-event:incident-candidate-test",
      detectorCode: "ACCEPTANCE_ORACLE_FAILED",
    },
    occurredAt: now,
    publishedAt: now,
    observation: {
      fingerprintVersion: "observation-v1",
      fingerprint: "",
      operationKind: "verification",
      component: "focused-test-runner",
      normalizedFailureCode: "ACCEPTANCE_FAILED",
    },
    evidenceRefs: [evidenceRef],
    severity: "blocking",
    state: "detected",
  };
  const halt: HaltRecordV1 = {
    ...haltWithoutFingerprint,
    observation: {
      ...haltWithoutFingerprint.observation,
      fingerprint: observationFingerprintV1(haltWithoutFingerprint),
    },
  };
  const assessment: AttributionAssessmentV1 = {
    contractType: "AttributionAssessmentV1",
    contractVersion: "1.0",
    assessmentId: "assessment:incident-candidate-test",
    haltId,
    projectId,
    changeId,
    scope,
    haltClass: "acceptance_or_verification_failure",
    confidence: "exact",
    affectedEntity: {
      projectId,
      changeId,
      waveId,
      taskId,
      operationKind: "verification",
      component: "focused-test-runner",
    },
    normalizedRootCauseKey: "oracle:acceptance-failed",
    candidateCauses: [
      {
        causeKey: "oracle:acceptance-failed",
        evidenceRefs: [evidenceRef],
      },
    ],
    alternativeCandidates: [],
    evidence: {
      detectorEvidenceRefs: [evidenceRef],
      declaredWriteSet: [],
      actualChangedPaths: [],
      gitEvidenceRefs: [],
      outcomeEvidenceRefs: [evidenceRef],
      sideEffectState: "none",
    },
    classifier: {
      classifierId: "classifier:incident-candidate-test",
      method: "deterministic",
    },
    assessedAt: now,
    taxonomyPolicyVersion: "halt-taxonomy-v1",
  };
  return { halt, assessment };
}

async function seedFixtureV1(prefix = "incident-eval-candidate-v1-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const storeRoot = join(root, "change-control-v1");
  const now = "2026-08-08T10:00:00.000Z";
  const store = new ChangeControlStore(storeRoot, { now: () => now });
  await store.create(projectId, { changeId, actor: "human:fixture-owner" });
  await store.createWave(projectId, changeId, {
    waveId,
    actor: "human:fixture-owner",
    tasks: [{ taskId }],
  });
  const aggregate = await store.detectAndClassifyHalt(
    projectId,
    haltContractsV1(now),
  );
  const projection = await store.getIncidentEvalCandidateProjectionV1(projectId);
  const proposal: IncidentEvalCandidateProposalV1 = {
    contractType: "IncidentEvalCandidateProposalV1",
    contractVersion: "1.0",
    incidentId: aggregate.incident.incidentId,
    expectedWatermark: projection.watermark,
    fixture: {
      fixtureRef: "fixture:incident-candidate-v1",
      contentHash: fixtureHash,
      byteLength: 128,
      privacyClassification: "approved_internal_fixture",
    },
    oracle: {
      kind: "human",
      oracleRef: "oracle:explicit-human-review-v1",
    },
    selectedEvidenceRefs: [evidenceRef],
    idempotencyKey: "record:incident-candidate-v1",
  };
  return {
    root,
    storeRoot,
    store,
    incidentId: aggregate.incident.incidentId,
    proposal,
  };
}

async function readyPreviewV1(fixture: SeededFixtureV1) {
  const preview = await fixture.store.previewIncidentEvalCandidateV1(
    projectId,
    fixture.incidentId,
    fixture.proposal,
  );
  assert.equal(preview.status, "ready");
  return preview as Extract<IncidentEvalCandidatePreviewV1, { status: "ready" }>;
}

function recordingRequestV1(
  fixture: SeededFixtureV1,
  preview: Extract<IncidentEvalCandidatePreviewV1, { status: "ready" }>,
  overrides: Partial<RecordIncidentEvalCandidateRequestV1> = {},
): RecordIncidentEvalCandidateRequestV1 {
  return {
    contractType: "RecordIncidentEvalCandidateRequestV1",
    contractVersion: "1.0",
    proposal: fixture.proposal,
    confirmation: preview.confirmation,
    confirmed: true,
    actor: "human:candidate-recorder",
    ...overrides,
  };
}

async function startHttpV1(store: ChangeControlStore) {
  const app = express();
  app.use(
    express.json({
      limit: "64kb",
      verify: captureIncidentEvalCandidateJsonBodyByteLengthV1,
    }),
  );
  installIncidentEvalCandidateRoutesV1(app, store);
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    base: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        (server as Server).close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("S1 raw JSON byte capture is separate and non-enumerable", () => {
  const request = {} as express.Request;
  captureIncidentEvalCandidateJsonBodyByteLengthV1(
    request,
    {} as express.Response,
    Buffer.alloc(16_384),
  );
  assert.deepEqual(Object.keys(request), []);
  const symbols = Object.getOwnPropertySymbols(request);
  assert.equal(symbols.length, 1);
  assert.deepEqual(Object.getOwnPropertyDescriptor(request, symbols[0]!), {
    value: 16_384,
    writable: false,
    enumerable: false,
    configurable: false,
  });
});

test("record request and receipt schemas are closed, versioned, and explicitly confirmed", async () => {
  const fixture = await seedFixtureV1();
  try {
    const preview = await readyPreviewV1(fixture);
    const request = recordingRequestV1(fixture, preview);
    assert.equal(
      validateIncidentEvalCandidateSchemaV1(
        "RecordIncidentEvalCandidateRequestV1",
        request,
      ),
      true,
    );
    assert.deepEqual(normalizeRecordIncidentEvalCandidateRequestV1(request), request);
    assert.throws(
      () =>
        normalizeRecordIncidentEvalCandidateRequestV1({
          ...request,
          confirmed: false,
        }),
      (error: unknown) =>
        error instanceof IncidentEvalCandidateErrorV1 &&
        error.reasonCode === "EXPLICIT_CONFIRMATION_REQUIRED",
    );
    assert.throws(
      () =>
        normalizeRecordIncidentEvalCandidateRequestV1({
          ...request,
          privateExtra: "not-allowed",
        }),
      (error: unknown) =>
        error instanceof IncidentEvalCandidateErrorV1 &&
        error.reasonCode === "REQUEST_SCHEMA_INVALID",
    );
    const receipt = await fixture.store.recordIncidentEvalCandidateV1(
      projectId,
      fixture.incidentId,
      request,
    );
    assertIncidentEvalCandidateReceiptV1(receipt);
    assert.equal(
      validateIncidentEvalCandidateSchemaV1(
        "IncidentEvalCandidateReceiptV1",
        receipt,
      ),
      true,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("preview reads one exact snapshot and mutates no ledger, run, queue, goal, Project Map, Git, or target bytes", async () => {
  const fixture = await seedFixtureV1();
  try {
    for (const marker of [
      "runs/run.json",
      "queues/tasks.yaml",
      "goals/state.yaml",
      "project-map/working-state.yaml",
      "git/HEAD",
      "target/source.ts",
    ]) {
      const path = join(fixture.root, marker);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, `unchanged:${marker}`, "utf8");
    }
    const before = await filesystemSnapshotV1(fixture.root);
    const first = await readyPreviewV1(fixture);
    const second = await readyPreviewV1(fixture);
    assert.equal(
      canonicalIncidentEvalCandidateJsonV1(first),
      canonicalIncidentEvalCandidateJsonV1(second),
    );
    assert.equal(first.wouldMutate, false);
    assert.deepEqual(await filesystemSnapshotV1(fixture.root), before);

    const restarted = new ChangeControlStore(fixture.storeRoot);
    assert.deepEqual(
      await restarted.getIncidentEvalCandidateProjectionV1(projectId),
      {
        contractType: "IncidentEvalCandidateProjectionV1",
        contractVersion: "1.0",
        projectId,
        watermark: first.observedWatermark,
        candidates: [],
        receipts: [],
      },
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("recording appends exactly one candidate event, preserves hash chain, and changes no incident or eval lifecycle", async () => {
  const fixture = await seedFixtureV1();
  try {
    const preview = await readyPreviewV1(fixture);
    const incidentBefore = await fixture.store.getIncident(
      projectId,
      fixture.incidentId,
    );
    const haltIncidentBefore = await fixture.store.getHaltIncidentProjection(projectId);
    const evalBefore = await fixture.store.getEvalLineageProjectionV1(projectId);
    const receipt = await fixture.store.recordIncidentEvalCandidateV1(
      projectId,
      fixture.incidentId,
      recordingRequestV1(fixture, preview),
    );
    assert.equal(receipt.outcome, "recorded");
    const file = await projectLedgerFileV1(fixture.storeRoot);
    const ledger = JSON.parse(await readFile(file, "utf8")) as {
      events: Array<Record<string, unknown> & { hash: string; previousHash: string | null }>;
    };
    const candidateEvents = ledger.events.filter(
      (event) => event.type === "incident.eval-candidate-recorded",
    );
    assert.equal(candidateEvents.length, 1);
    for (let index = 0; index < ledger.events.length; index += 1) {
      const event = ledger.events[index]!;
      assert.equal(event.previousHash, index ? ledger.events[index - 1]!.hash : null);
      const { hash, ...hashInput } = event;
      assert.equal(hash, eventHashV1(hashInput));
    }
    assert.deepEqual(
      await fixture.store.getIncident(projectId, fixture.incidentId),
      incidentBefore,
    );
    assert.deepEqual(
      await fixture.store.getHaltIncidentProjection(projectId),
      haltIncidentBefore,
    );
    assert.deepEqual(await fixture.store.getEvalLineageProjectionV1(projectId), evalBefore);
    assert.equal(evalBefore.suites.length, 0);
    assert.equal(evalBefore.runs.length, 0);
    assert.equal(evalBefore.reports.length, 0);
    assert.equal(evalBefore.championDecisions.length, 0);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("restart replay reconstructs equal projections, exact retry returns the receipt, and conflicting key reuse fails closed", async () => {
  const fixture = await seedFixtureV1();
  try {
    const preview = await readyPreviewV1(fixture);
    const request = recordingRequestV1(fixture, preview);
    const first = await fixture.store.recordIncidentEvalCandidateV1(
      projectId,
      fixture.incidentId,
      request,
    );
    const bytesAfterFirst = await readFile(await projectLedgerFileV1(fixture.storeRoot));
    const projectedBeforeRestart =
      await fixture.store.getIncidentEvalCandidateProjectionV1(projectId);
    const restarted = new ChangeControlStore(fixture.storeRoot);
    const replayed = await restarted.getIncidentEvalCandidateProjectionV1(projectId);
    assert.deepEqual(replayed, projectedBeforeRestart);
    assert.equal(replayed.candidates.length, 1);
    assert.equal(replayed.receipts.length, 1);
    assert.equal(replayed.receipts[0]!.receiptId, first.receiptId);

    const retry = await restarted.recordIncidentEvalCandidateV1(
      projectId,
      fixture.incidentId,
      request,
    );
    assert.equal(retry.outcome, "already-recorded");
    assert.equal(retry.receiptId, first.receiptId);
    assert.equal(retry.eventId, first.eventId);
    assert.deepEqual(
      await readFile(await projectLedgerFileV1(fixture.storeRoot)),
      bytesAfterFirst,
    );
    await assert.rejects(
      restarted.recordIncidentEvalCandidateV1(
        projectId,
        fixture.incidentId,
        { ...request, actor: "human:conflicting-recorder" },
      ),
      (error: unknown) =>
        error instanceof IncidentEvalCandidateErrorV1 &&
        error.reasonCode === "IDEMPOTENCY_CONFLICT",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("serialized concurrent equal requests append once and a different contender fails stale", async () => {
  const equalFixture = await seedFixtureV1("incident-eval-candidate-equal-");
  try {
    const preview = await readyPreviewV1(equalFixture);
    const request = recordingRequestV1(equalFixture, preview);
    const contender = new ChangeControlStore(equalFixture.storeRoot);
    const results = await Promise.all([
      equalFixture.store.recordIncidentEvalCandidateV1(
        projectId,
        equalFixture.incidentId,
        request,
      ),
      contender.recordIncidentEvalCandidateV1(
        projectId,
        equalFixture.incidentId,
        request,
      ),
    ]);
    assert.deepEqual(
      results.map((receipt) => receipt.outcome).sort(),
      ["already-recorded", "recorded"],
    );
    const projection = await contender.getIncidentEvalCandidateProjectionV1(projectId);
    assert.equal(projection.candidates.length, 1);
    assert.equal(projection.receipts.length, 1);
  } finally {
    await rm(equalFixture.root, { recursive: true, force: true });
  }

  const staleFixture = await seedFixtureV1("incident-eval-candidate-stale-");
  try {
    const firstPreview = await readyPreviewV1(staleFixture);
    const secondProposal = {
      ...staleFixture.proposal,
      idempotencyKey: "record:incident-candidate-contender-v1",
    };
    const secondPreview = await staleFixture.store.previewIncidentEvalCandidateV1(
      projectId,
      staleFixture.incidentId,
      secondProposal,
    );
    assert.equal(secondPreview.status, "ready");
    if (secondPreview.status !== "ready") return;
    const contender = new ChangeControlStore(staleFixture.storeRoot);
    const settled = await Promise.allSettled([
      staleFixture.store.recordIncidentEvalCandidateV1(
        projectId,
        staleFixture.incidentId,
        recordingRequestV1(staleFixture, firstPreview),
      ),
      contender.recordIncidentEvalCandidateV1(
        projectId,
        staleFixture.incidentId,
        {
          contractType: "RecordIncidentEvalCandidateRequestV1",
          contractVersion: "1.0",
          proposal: secondProposal,
          confirmation: secondPreview.confirmation,
          confirmed: true,
          actor: "human:candidate-recorder",
        },
      ),
    ]);
    assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    assert.ok(rejection);
    assert.ok(rejection.reason instanceof IncidentEvalCandidateErrorV1);
    assert.equal(rejection.reason.reasonCode, "CONCURRENT_STALE_CONTENDER");
    assert.equal(
      (await contender.getIncidentEvalCandidateProjectionV1(projectId)).candidates.length,
      1,
    );
  } finally {
    await rm(staleFixture.root, { recursive: true, force: true });
  }
});

test("replay rejects privacy/schema tampering even when the final event hash is recomputed", async () => {
  const fixture = await seedFixtureV1();
  try {
    const preview = await readyPreviewV1(fixture);
    await fixture.store.recordIncidentEvalCandidateV1(
      projectId,
      fixture.incidentId,
      recordingRequestV1(fixture, preview),
    );
    const file = await projectLedgerFileV1(fixture.storeRoot);
    const ledger = JSON.parse(await readFile(file, "utf8")) as {
      events: Array<Record<string, unknown> & { hash: string; payload: Record<string, unknown> }>;
    };
    const event = ledger.events.at(-1)!;
    (event.payload.candidate as Record<string, unknown>).prompt =
      "PRIVATE_PROMPT_MUST_NOT_SURVIVE_REPLAY";
    const { hash: _hash, ...hashInput } = event;
    event.hash = eventHashV1(hashInput);
    await writeFile(file, JSON.stringify(ledger, null, 2), "utf8");
    await assert.rejects(
      new ChangeControlStore(fixture.storeRoot).getIncidentEvalCandidateProjectionV1(
        projectId,
      ),
      (error: unknown) =>
        error instanceof ChangeControlError && error.code === "CORRUPT_LEDGER",
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("the two closed HTTP routes enforce path identity, privacy, confirmation, retry, and unsupported methods", async () => {
  const fixture = await seedFixtureV1();
  let http: Awaited<ReturnType<typeof startHttpV1>> | undefined;
  try {
    http = await startHttpV1(fixture.store);
    const route = `${http.base}/api/change-control/projects/${projectId}/incidents/${fixture.incidentId}/eval-candidates`;
    const before = await filesystemSnapshotV1(fixture.root);
    const previewResponse = await fetch(`${route}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixture.proposal),
    });
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()) as Extract<
      IncidentEvalCandidatePreviewV1,
      { status: "ready" }
    >;
    assert.equal(preview.status, "ready");
    assert.deepEqual(await filesystemSnapshotV1(fixture.root), before);

    const proposalJson = JSON.stringify(fixture.proposal);
    const exactBoundaryResponse = await fetch(`${route}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `${" ".repeat(16_384 - Buffer.byteLength(proposalJson))}${proposalJson}`,
    });
    assert.equal(exactBoundaryResponse.status, 200);
    assert.equal(
      ((await exactBoundaryResponse.json()) as { status: string }).status,
      "ready",
    );

    const paddedOverLimitResponse = await fetch(`${route}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `${" ".repeat(16_385 - Buffer.byteLength(proposalJson))}${proposalJson}`,
    });
    assert.equal(paddedOverLimitResponse.status, 413);
    assert.equal(
      ((await paddedOverLimitResponse.json()) as { code: string }).code,
      "REQUEST_LIMIT_EXCEEDED",
    );
    assert.deepEqual(await filesystemSnapshotV1(fixture.root), before);

    const privateResponse = await fetch(`${route}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...fixture.proposal,
        prompt: "PRIVATE_HTTP_PROMPT_MUST_NOT_ECHO",
      }),
    });
    assert.equal(privateResponse.status, 400);
    const privateText = await privateResponse.text();
    assert.match(privateText, /PROHIBITED_FIELD/);
    assert.doesNotMatch(privateText, /PRIVATE_HTTP_PROMPT_MUST_NOT_ECHO/);
    assert.deepEqual(await filesystemSnapshotV1(fixture.root), before);

    const missingConfirmation = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...recordingRequestV1(fixture, preview),
        confirmed: false,
      }),
    });
    assert.equal(missingConfirmation.status, 400);
    assert.equal(
      ((await missingConfirmation.json()) as { code: string }).code,
      "EXPLICIT_CONFIRMATION_REQUIRED",
    );
    const request = recordingRequestV1(fixture, preview);
    const recorded = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(recorded.status, 201);
    assert.equal(((await recorded.json()) as { outcome: string }).outcome, "recorded");
    const retry = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    assert.equal(retry.status, 200);
    assert.equal(
      ((await retry.json()) as { outcome: string }).outcome,
      "already-recorded",
    );

    const mismatch = await fetch(
      `${http.base}/api/change-control/projects/${projectId}/incidents/another-incident/eval-candidates/preview`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(fixture.proposal),
      },
    );
    assert.equal(mismatch.status, 409);
    assert.equal(
      ((await mismatch.json()) as { code: string }).code,
      "INCIDENT_IDENTITY_MISMATCH",
    );
    for (const exactRoute of [route, `${route}/preview`]) {
      for (const method of ["GET", "PUT", "DELETE"]) {
        const unsupported = await fetch(exactRoute, { method });
        assert.equal(unsupported.status, 405, `${method} ${exactRoute}`);
        assert.match(
          unsupported.headers.get("content-type") ?? "",
          /^application\/json\b/,
        );
        assert.deepEqual(await unsupported.json(), {
          error: "Incident eval candidate request rejected.",
          code: "METHOD_NOT_ALLOWED",
        });
      }
    }
  } finally {
    await http?.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});
