import assert from "node:assert/strict";
import test from "node:test";
import {
  projectReviewReceiptV1,
  projectVerificationReceiptV2,
  type ClosedCommandVerificationEvidenceV1,
  type ClosedReviewEvidenceV1,
  type CurrentRunReviewEvidenceV1,
  type CurrentRunVerificationEvidenceV1,
  type EvidenceProjectionSourceV1,
} from "./evidence-projections.ts";
import { validateAmkProjectArtifactV2 } from "./validator.ts";

const source = {
  sourceId: "run:amk-slice-3",
  sha256: "c".repeat(64),
  byteLength: 4096,
  watermark: "run-wm-3",
} as const;

function sourceEvidence(): EvidenceProjectionSourceV1 {
  return {
    projectId: "orchestrator",
    selectedSource: { ...source },
    currentSource: { ...source },
    taskId: "TASK-cccccccccccccccc-evidence",
  };
}

function closedVerification(): ClosedCommandVerificationEvidenceV1 {
  return {
    ...sourceEvidence(),
    evidenceKind: "closed_command_result",
    attempt: {
      attemptId: "attempt-2",
      attemptOrdinal: 2,
      evidenceRef: "attempt:2",
    },
    command: {
      configuredCommand: "npm.cmd run check",
      evidenceRef: "command:configured-check",
    },
    environment: {
      environmentRef: "env:windows-node22",
      verifierType: "project_test",
      verificationLevel: "integration",
      evidenceRef: "environment:windows-node22",
    },
    result: {
      attemptId: "attempt-2",
      command: "npm.cmd run check",
      environmentRef: "env:windows-node22",
      exitCode: 0,
      timedOut: false,
      evidenceRef: "result:check:sha256:1234",
      verifiedAt: "2026-08-07T12:00:00Z",
    },
    subjectRefs: ["WI-evidence", "CAP-evidence"],
    claimIds: ["claim:typecheck"],
    evidenceRefs: ["run:amk-slice-3", "result:check:sha256:1234"],
  };
}

function currentVerification(): CurrentRunVerificationEvidenceV1 {
  return {
    ...sourceEvidence(),
    evidenceKind: "current_run",
    attempt: {
      attemptId: "attempt-current-1",
      attemptOrdinal: 1,
      evidenceRef: "run-task-attempt:1",
    },
    configuredCommand: "npm.cmd run check",
    subjectRefs: ["WI-evidence"],
    verifiedAt: "2026-08-07T12:00:00Z",
    aggregateExitCode: 0,
    aggregateTimedOut: false,
    logEvidenceRefs: ["log:text-that-says-passed"],
  };
}

function closedReview(): ClosedReviewEvidenceV1 {
  return {
    ...sourceEvidence(),
    evidenceKind: "closed_review_result",
    attempt: {
      attemptId: "review-attempt-3",
      attemptOrdinal: 3,
      evidenceRef: "review-attempt:3",
    },
    profile: "fresh_context",
    result: {
      attemptId: "review-attempt-3",
      taskOwnedChangeSetRef: "change-set:exact",
      resultRefs: ["change-set:exact", "result:outcome-only"],
      evidenceRef: "review-result-binding:3",
    },
    criteria: {
      attemptId: "review-attempt-3",
      taskContractRef: "task-contract:exact",
      verificationCommandRefs: ["command:npm-check"],
      evidenceRef: "review-criteria-binding:3",
    },
    reasoningExclusion: {
      attemptId: "review-attempt-3",
      authorReasoningIncluded: false,
      evidenceRef: "review-input:outcome-only-v1",
    },
    mutationIsolation: {
      attemptId: "review-attempt-3",
      mutationPerformed: false,
      evidenceRef: "workspace-snapshot:no-mutation",
    },
    repairAuthority: {
      attemptId: "review-attempt-3",
      repairAuthorized: false,
      evidenceRef: "review-sandbox:no-repair",
    },
    verdict: {
      attemptId: "review-attempt-3",
      value: "approved",
      evidenceRef: "review-verdict:approved",
    },
    findings: [],
    intentionalDecisionRefs: [],
    evidenceRefs: ["review-attempt:3", "review-verdict:approved"],
  };
}

test("closed command evidence produces a compatible passed receipt with stable exact identity", () => {
  const evidence = closedVerification();
  const snapshot = structuredClone(evidence);
  const first = projectVerificationReceiptV2({ evidence });
  const reordered = projectVerificationReceiptV2({
    evidence: {
      ...evidence,
      subjectRefs: [...evidence.subjectRefs].reverse(),
      evidenceRefs: [...evidence.evidenceRefs].reverse(),
    },
  });

  assert.deepEqual(evidence, snapshot);
  assert.equal(first.status, "compatible");
  assert.equal(first.artifact?.status, "passed");
  assert.equal(first.artifact?.environment_ref, "env:windows-node22");
  assert.equal(first.artifact?.verification_level, "integration");
  assert.ok(first.artifact);
  assert.equal(validateAmkProjectArtifactV2("VerificationReceiptV2", first.artifact).valid, true);
  assert.equal(first.artifact.receipt_id, reordered.artifact?.receipt_id);
  assert.equal(first.projectionId, reordered.projectionId);
  assert.equal(first.readOnly, true);
  assert.equal(first.navigationOnly, true);
  assert.equal(first.activated, false);
  assert.equal(first.filesModified, false);
});

test("current aggregate outcome and human-readable logs remain inconclusive, never passed", () => {
  const evidence = currentVerification();
  const projected = projectVerificationReceiptV2({ evidence });
  assert.equal(projected.status, "partial");
  assert.equal(projected.artifact?.status, "inconclusive");
  assert.notEqual(projected.artifact?.status, "passed");
  assert.deepEqual(projected.reasonCodes, [
    "VERIFICATION_CURRENT_RUN_ENVIRONMENT_UNPROVEN",
    "VERIFICATION_CURRENT_RUN_PER_COMMAND_RESULT_UNAVAILABLE",
  ]);
  assert.ok(!projected.artifact?.evidence_refs.includes("log:text-that-says-passed"));

  const legacy = projectVerificationReceiptV2({
    evidence: { ...sourceEvidence(), evidenceKind: "legacy_run" },
  });
  assert.equal(legacy.status, "unsupported");
  assert.equal(legacy.artifact, null);
  assert.deepEqual(legacy.reasonCodes, ["VERIFICATION_LEGACY_PER_COMMAND_RESULT_UNAVAILABLE"]);
});

test("passed command result without exact evidence bindings is rejected deterministically", () => {
  const evidence = closedVerification();
  const unsupported = projectVerificationReceiptV2({
    evidence: {
      ...evidence,
      attempt: { ...evidence.attempt, evidenceRef: "" },
      command: { ...evidence.command, evidenceRef: "" },
      environment: { ...evidence.environment, evidenceRef: "" },
      result: { ...evidence.result, evidenceRef: "" },
      evidenceRefs: [],
    },
  });
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.artifact, null);
  assert.deepEqual(unsupported.reasonCodes, [
    "VERIFICATION_EXACT_EVIDENCE_BINDINGS_REQUIRED",
    "VERIFICATION_PASS_EVIDENCE_REQUIRED",
  ]);
});

test("verification result must bind the exact attempt, command, and environment", () => {
  const evidence = closedVerification();
  const cases = [
    ["attemptId", "other-attempt", "VERIFICATION_ATTEMPT_BINDING_CONFLICT"],
    ["command", "npm test", "VERIFICATION_COMMAND_BINDING_CONFLICT"],
    ["environmentRef", "env:other", "VERIFICATION_ENVIRONMENT_BINDING_CONFLICT"],
  ] as const;
  for (const [field, value, reason] of cases) {
    const result = projectVerificationReceiptV2({
      evidence: { ...evidence, result: { ...evidence.result, [field]: value } },
    });
    assert.equal(result.status, "conflict");
    assert.deepEqual(result.reasonCodes, [reason]);
  }

  const timedOut = projectVerificationReceiptV2({
    evidence: { ...evidence, result: { ...evidence.result, timedOut: true } },
  });
  assert.equal(timedOut.status, "compatible");
  assert.equal(timedOut.artifact?.status, "inconclusive");
  assert.deepEqual(timedOut.reasonCodes, ["VERIFICATION_COMMAND_TIMED_OUT"]);
});

test("current and legacy reviewer evidence cannot prove author reasoning exclusion", () => {
  const current: CurrentRunReviewEvidenceV1 = {
    ...sourceEvidence(),
    evidenceKind: "current_run",
    reviewerInputKind: "unrestricted_final_output",
    mutationIsolationEvidenceRef: "workspace-snapshot:no-mutation",
    repairAuthorityExclusionEvidenceRef: "reviewer:no-repair",
  };
  const projected = projectReviewReceiptV1({ evidence: current });
  assert.equal(projected.status, "unsupported");
  assert.equal(projected.artifact, null);
  assert.deepEqual(projected.reasonCodes, [
    "REVIEW_CURRENT_FINAL_OUTPUT_REASONING_EXCLUSION_UNPROVEN",
  ]);

  const legacy = projectReviewReceiptV1({
    evidence: { ...sourceEvidence(), evidenceKind: "legacy_run" },
  });
  assert.equal(legacy.status, "unsupported");
  assert.deepEqual(legacy.reasonCodes, ["REVIEW_LEGACY_REASONING_EXCLUSION_UNPROVEN"]);
});

test("closed review evidence is compatible but absent owner evidence remains pending", () => {
  const evidence = closedReview();
  const snapshot = structuredClone(evidence);
  const first = projectReviewReceiptV1({ evidence });
  const reordered = projectReviewReceiptV1({
    evidence: {
      ...evidence,
      result: { ...evidence.result, resultRefs: [...evidence.result.resultRefs].reverse() },
      criteria: {
        ...evidence.criteria,
        verificationCommandRefs: [...evidence.criteria.verificationCommandRefs].reverse(),
      },
      evidenceRefs: [...evidence.evidenceRefs].reverse(),
    },
  });

  assert.deepEqual(evidence, snapshot);
  assert.equal(first.status, "compatible");
  assert.ok(first.artifact);
  assert.equal(first.artifact.status, "passed");
  assert.equal(first.artifact.author_reasoning_included, false);
  assert.equal(first.artifact.mutation_performed, false);
  assert.equal(first.artifact.repair_authorized, false);
  assert.equal(first.artifact.owner_disposition, "pending");
  assert.deepEqual(first.reasonCodes, ["REVIEW_OWNER_DISPOSITION_UNPROVEN_PENDING"]);
  assert.equal(validateAmkProjectArtifactV2("ReviewReceiptV1", first.artifact).valid, true);
  assert.equal(first.artifact.review_id, reordered.artifact?.review_id);
  assert.equal(first.projectionId, reordered.projectionId);
});

test("review compatibility requires exact criteria, isolation, no-repair, and attempt bindings", () => {
  const evidence = closedReview();
  const missingCriteria = projectReviewReceiptV1({
    evidence: { ...evidence, criteria: { ...evidence.criteria, verificationCommandRefs: [] } },
  });
  assert.equal(missingCriteria.status, "unsupported");
  assert.deepEqual(missingCriteria.reasonCodes, ["REVIEW_EXACT_EVIDENCE_BINDINGS_REQUIRED"]);

  const wrongAttempt = projectReviewReceiptV1({
    evidence: { ...evidence, verdict: { ...evidence.verdict, attemptId: "review-attempt-4" } },
  });
  assert.equal(wrongAttempt.status, "conflict");
  assert.deepEqual(wrongAttempt.reasonCodes, ["REVIEW_ATTEMPT_BINDING_CONFLICT"]);

  const mutation = projectReviewReceiptV1({
    evidence: {
      ...evidence,
      mutationIsolation: {
        ...evidence.mutationIsolation,
        mutationPerformed: true,
      },
    } as unknown as ClosedReviewEvidenceV1,
  });
  assert.equal(mutation.status, "unsupported");
  assert.deepEqual(mutation.reasonCodes, ["REVIEW_MUTATION_ISOLATION_REQUIRED"]);

  const repair = projectReviewReceiptV1({
    evidence: {
      ...evidence,
      repairAuthority: { ...evidence.repairAuthority, repairAuthorized: true },
    } as unknown as ClosedReviewEvidenceV1,
  });
  assert.equal(repair.status, "unsupported");
  assert.deepEqual(repair.reasonCodes, ["REVIEW_REPAIR_AUTHORITY_EXCLUSION_REQUIRED"]);
});

test("reasoning-exclusion proof is mandatory and source identity changes fail closed", () => {
  const evidence = closedReview();
  const reasoning = projectReviewReceiptV1({
    evidence: {
      ...evidence,
      reasoningExclusion: {
        ...evidence.reasoningExclusion,
        authorReasoningIncluded: true,
      },
    } as unknown as ClosedReviewEvidenceV1,
  });
  assert.equal(reasoning.status, "unsupported");
  assert.deepEqual(reasoning.reasonCodes, ["REVIEW_AUTHOR_REASONING_EXCLUSION_REQUIRED"]);

  const stale = projectReviewReceiptV1({
    evidence: {
      ...evidence,
      currentSource: { ...evidence.currentSource, watermark: "run-wm-4" },
    },
  });
  assert.equal(stale.status, "stale");
  assert.equal(stale.artifact, null);
  assert.deepEqual(stale.reasonCodes, ["SOURCE_IDENTITY_OR_WATERMARK_STALE"]);
});
