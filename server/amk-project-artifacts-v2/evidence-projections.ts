import { createHash } from "node:crypto";
import {
  AMK_V5_PINNED_COMMIT,
  canonicalProjectionJson,
  type AmkProjectionStatus,
  type ProjectionSourceIdentityV1,
} from "./projections.ts";
import { validateAmkProjectArtifactV2 } from "./validator.ts";

const VERIFICATION_SCHEMA_SHA256 =
  "29cff93b520ffdc4caeba25a105af785cffc8baa859967552280ef011254372a";
const REVIEW_SCHEMA_SHA256 =
  "9d59ecfb7e7993e2a2dd5fa97300504269a7711337a546584a961ce8eb4c27b6";

export type EvidenceProjectionSourceV1 = Readonly<{
  projectId: string;
  selectedSource: ProjectionSourceIdentityV1;
  currentSource: ProjectionSourceIdentityV1;
  taskId: string;
}>;

export type AttemptEvidenceBindingV1 = Readonly<{
  attemptId: string;
  attemptOrdinal: number;
  evidenceRef: string;
}>;

export type CurrentRunVerificationEvidenceV1 = EvidenceProjectionSourceV1 & Readonly<{
  evidenceKind: "current_run";
  attempt: AttemptEvidenceBindingV1;
  configuredCommand: string;
  subjectRefs?: readonly string[];
  claimIds?: readonly string[];
  verifiedAt: string;
  aggregateExitCode?: number;
  aggregateTimedOut?: boolean;
  logEvidenceRefs?: readonly string[];
}>;

export type LegacyRunVerificationEvidenceV1 = EvidenceProjectionSourceV1 & Readonly<{
  evidenceKind: "legacy_run";
}>;

export type ClosedCommandVerificationEvidenceV1 = EvidenceProjectionSourceV1 & Readonly<{
  evidenceKind: "closed_command_result";
  attempt: AttemptEvidenceBindingV1;
  command: Readonly<{
    configuredCommand: string;
    evidenceRef: string;
  }>;
  environment: Readonly<{
    environmentRef: string;
    verifierType: "project_test" | "tool_output" | "external_source" | "owner" | "human_oracle";
    verificationLevel: "unit" | "integration" | "end_to_end" | "owner_observation" | "unknown";
    evidenceRef: string;
  }>;
  result: Readonly<{
    attemptId: string;
    command: string;
    environmentRef: string;
    exitCode: number;
    timedOut: boolean;
    evidenceRef: string;
    verifiedAt: string;
  }>;
  subjectRefs: readonly string[];
  claimIds?: readonly string[];
  evidenceRefs: readonly string[];
}>;

export type VerificationReceiptProjectionInputV1 = Readonly<{
  evidence:
    | CurrentRunVerificationEvidenceV1
    | LegacyRunVerificationEvidenceV1
    | ClosedCommandVerificationEvidenceV1;
}>;

export type VerificationReceiptV2 = Readonly<{
  schema_version: "2.0";
  receipt_id: string;
  task_id: string;
  subject_refs: readonly string[];
  claim_ids: readonly string[];
  verifier_type: "project_test" | "tool_output" | "external_source" | "owner" | "human_oracle";
  verification_level: "unit" | "integration" | "end_to_end" | "owner_observation" | "unknown";
  environment_ref: string | null;
  status: "passed" | "failed" | "inconclusive" | "unsupported";
  evidence_refs: readonly string[];
  verified_at: string;
}>;

export type ReviewFindingV1 = Readonly<{
  attemptId: string;
  id: string;
  category: "correctness" | "scope" | "contract" | "style";
  severity: "critical" | "high" | "normal" | "advisory";
  statement: string;
  evidenceRefs: readonly string[];
  blocking: boolean;
}>;

export type CurrentRunReviewEvidenceV1 = EvidenceProjectionSourceV1 & Readonly<{
  evidenceKind: "current_run";
  attempt?: AttemptEvidenceBindingV1;
  reviewerInputKind: "unrestricted_final_output";
  mutationIsolationEvidenceRef?: string;
  repairAuthorityExclusionEvidenceRef?: string;
}>;

export type LegacyRunReviewEvidenceV1 = EvidenceProjectionSourceV1 & Readonly<{
  evidenceKind: "legacy_run";
}>;

export type ClosedReviewEvidenceV1 = EvidenceProjectionSourceV1 & Readonly<{
  evidenceKind: "closed_review_result";
  attempt: AttemptEvidenceBindingV1;
  profile: "fresh_context" | "adversarial";
  result: Readonly<{
    attemptId: string;
    taskOwnedChangeSetRef: string;
    resultRefs: readonly string[];
    evidenceRef: string;
  }>;
  criteria: Readonly<{
    attemptId: string;
    taskContractRef: string;
    verificationCommandRefs: readonly string[];
    additionalCriteriaRefs?: readonly string[];
    evidenceRef: string;
  }>;
  reasoningExclusion: Readonly<{
    attemptId: string;
    authorReasoningIncluded: false;
    evidenceRef: string;
  }>;
  mutationIsolation: Readonly<{
    attemptId: string;
    mutationPerformed: false;
    evidenceRef: string;
  }>;
  repairAuthority: Readonly<{
    attemptId: string;
    repairAuthorized: false;
    evidenceRef: string;
  }>;
  verdict: Readonly<{
    attemptId: string;
    value: "approved" | "changes_requested" | "inconclusive";
    evidenceRef: string;
  }>;
  findings: readonly ReviewFindingV1[];
  intentionalDecisionRefs?: readonly string[];
  evidenceRefs: readonly string[];
  ownerDisposition?: Readonly<{
    value: "accepted" | "rejected" | "partially_accepted";
    evidenceRef: string;
  }>;
}>;

export type ReviewReceiptProjectionInputV1 = Readonly<{
  evidence: CurrentRunReviewEvidenceV1 | LegacyRunReviewEvidenceV1 | ClosedReviewEvidenceV1;
}>;

export type ReviewReceiptV1 = Readonly<{
  schema_version: "1.0";
  review_id: string;
  task_id: string;
  profile: "fresh_context" | "adversarial";
  result_refs: readonly string[];
  criteria_refs: readonly string[];
  intentional_decision_refs: readonly string[];
  author_reasoning_included: false;
  mutation_performed: false;
  repair_authorized: false;
  status: "passed" | "findings" | "inconclusive";
  findings: readonly Readonly<{
    id: string;
    category: "correctness" | "scope" | "contract" | "style";
    severity: "critical" | "high" | "normal" | "advisory";
    statement: string;
    evidence_refs: readonly string[];
    blocking: boolean;
  }>[];
  owner_disposition: "pending" | "accepted" | "rejected" | "partially_accepted";
}>;

export type AmkEvidenceProjectionResultV1<T> = Readonly<{
  contractType: "VerificationReceiptV2" | "ReviewReceiptV1";
  contractVersion: "2.0" | "1.0";
  projectionVersion: "1.0";
  pinnedAmkCommit: typeof AMK_V5_PINNED_COMMIT;
  schemaSha256: string;
  status: AmkProjectionStatus;
  reasonCodes: readonly string[];
  artifact: T | null;
  selectedSource: ProjectionSourceIdentityV1;
  currentSource: ProjectionSourceIdentityV1;
  projectionId: string;
  readOnly: true;
  navigationOnly: true;
  activated: false;
  filesModified: false;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedStrings = (values: readonly string[] | undefined): string[] =>
  [...new Set(values ?? [])].sort(compareText);

const nonEmpty = (value: string | undefined): value is string =>
  typeof value === "string" && value.length > 0;

const allNonEmpty = (values: readonly string[]): boolean =>
  values.length > 0 && values.every(nonEmpty);

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item);
  }
  return value;
}

function validSource(identity: ProjectionSourceIdentityV1): boolean {
  return nonEmpty(identity.sourceId) && /^[a-f0-9]{64}$/.test(identity.sha256) &&
    Number.isSafeInteger(identity.byteLength) && identity.byteLength >= 0 &&
    (identity.watermark === null || typeof identity.watermark === "string");
}

function sourceProblem(evidence: EvidenceProjectionSourceV1): Readonly<{
  status: "conflict" | "stale";
  reason: string;
}> | undefined {
  const { selectedSource: selected, currentSource: current } = evidence;
  if (!nonEmpty(evidence.projectId) || !nonEmpty(evidence.taskId) ||
      !validSource(selected) || !validSource(current))
    return { status: "conflict", reason: "SOURCE_IDENTITY_INVALID" };
  if (selected.sourceId !== current.sourceId)
    return { status: "conflict", reason: "SOURCE_IDENTITY_CONFLICT" };
  if (
    selected.sha256 !== current.sha256 ||
    selected.byteLength !== current.byteLength ||
    selected.watermark !== current.watermark
  ) return { status: "stale", reason: "SOURCE_IDENTITY_OR_WATERMARK_STALE" };
  return undefined;
}

function buildResult<T>(
  evidence: EvidenceProjectionSourceV1,
  contractType: "VerificationReceiptV2" | "ReviewReceiptV1",
  contractVersion: "2.0" | "1.0",
  schemaSha256: string,
  status: AmkProjectionStatus,
  reasonCodes: readonly string[],
  artifact: T | null,
): AmkEvidenceProjectionResultV1<T> {
  const body = {
    contractType,
    contractVersion,
    projectionVersion: "1.0" as const,
    pinnedAmkCommit: AMK_V5_PINNED_COMMIT,
    schemaSha256,
    status,
    reasonCodes: sortedStrings(reasonCodes),
    artifact,
    selectedSource: { ...evidence.selectedSource },
    currentSource: { ...evidence.currentSource },
    readOnly: true as const,
    navigationOnly: true as const,
    activated: false as const,
    filesModified: false as const,
  };
  return deepFreeze({
    ...body,
    projectionId: `AMK-EVIDENCE-PROJECTION-${sha256(canonicalProjectionJson(body))}`,
  });
}

function verificationResult(
  evidence: EvidenceProjectionSourceV1,
  status: AmkProjectionStatus,
  reasonCodes: readonly string[],
  artifact: VerificationReceiptV2 | null,
): AmkEvidenceProjectionResultV1<VerificationReceiptV2> {
  return buildResult(
    evidence,
    "VerificationReceiptV2",
    "2.0",
    VERIFICATION_SCHEMA_SHA256,
    status,
    reasonCodes,
    artifact,
  );
}

function reviewResult(
  evidence: EvidenceProjectionSourceV1,
  status: AmkProjectionStatus,
  reasonCodes: readonly string[],
  artifact: ReviewReceiptV1 | null,
): AmkEvidenceProjectionResultV1<ReviewReceiptV1> {
  return buildResult(
    evidence,
    "ReviewReceiptV1",
    "1.0",
    REVIEW_SCHEMA_SHA256,
    status,
    reasonCodes,
    artifact,
  );
}

function attemptValid(attempt: AttemptEvidenceBindingV1): boolean {
  return nonEmpty(attempt.attemptId) && Number.isSafeInteger(attempt.attemptOrdinal) &&
    attempt.attemptOrdinal > 0 && nonEmpty(attempt.evidenceRef);
}

function verificationReceiptId(evidence: CurrentRunVerificationEvidenceV1): string;
function verificationReceiptId(evidence: ClosedCommandVerificationEvidenceV1): string;
function verificationReceiptId(
  evidence: CurrentRunVerificationEvidenceV1 | ClosedCommandVerificationEvidenceV1,
): string {
  const identity = evidence.evidenceKind === "current_run" ? {
    projectId: evidence.projectId,
    selectedSource: evidence.selectedSource,
    taskId: evidence.taskId,
    attempt: evidence.attempt,
    command: evidence.configuredCommand,
    subjectRefs: sortedStrings(evidence.subjectRefs?.length ? evidence.subjectRefs : [evidence.taskId]),
    claimIds: sortedStrings(evidence.claimIds),
    verifiedAt: evidence.verifiedAt,
    status: "inconclusive",
  } : {
    projectId: evidence.projectId,
    selectedSource: evidence.selectedSource,
    taskId: evidence.taskId,
    attempt: evidence.attempt,
    command: evidence.command,
    environment: evidence.environment,
    result: evidence.result,
    subjectRefs: sortedStrings(evidence.subjectRefs),
    claimIds: sortedStrings(evidence.claimIds),
    evidenceRefs: sortedStrings(evidence.evidenceRefs),
  };
  return `VR-${sha256(canonicalProjectionJson(identity))}`;
}

export function projectVerificationReceiptV2(
  input: VerificationReceiptProjectionInputV1,
): AmkEvidenceProjectionResultV1<VerificationReceiptV2> {
  const { evidence } = input;
  const sourceIssue = sourceProblem(evidence);
  if (sourceIssue)
    return verificationResult(evidence, sourceIssue.status, [sourceIssue.reason], null);

  if (evidence.evidenceKind === "legacy_run") return verificationResult(
    evidence,
    "unsupported",
    ["VERIFICATION_LEGACY_PER_COMMAND_RESULT_UNAVAILABLE"],
    null,
  );

  if (evidence.evidenceKind === "current_run") {
    if (!attemptValid(evidence.attempt) || !nonEmpty(evidence.configuredCommand) ||
        !nonEmpty(evidence.verifiedAt)) return verificationResult(
      evidence,
      "unsupported",
      ["VERIFICATION_CURRENT_RUN_BINDING_INCOMPLETE"],
      null,
    );
    const subjectRefs = sortedStrings(evidence.subjectRefs?.length
      ? evidence.subjectRefs
      : [evidence.taskId]);
    if (!allNonEmpty(subjectRefs)) return verificationResult(
      evidence,
      "unsupported",
      ["VERIFICATION_SUBJECT_BINDING_REQUIRED"],
      null,
    );
    const artifact: VerificationReceiptV2 = {
      schema_version: "2.0",
      receipt_id: verificationReceiptId(evidence),
      task_id: evidence.taskId,
      subject_refs: subjectRefs,
      claim_ids: sortedStrings(evidence.claimIds),
      verifier_type: "tool_output",
      verification_level: "unknown",
      environment_ref: null,
      status: "inconclusive",
      evidence_refs: [evidence.attempt.evidenceRef],
      verified_at: evidence.verifiedAt,
    };
    const validation = validateAmkProjectArtifactV2("VerificationReceiptV2", artifact);
    if (!validation.valid) return verificationResult(
      evidence,
      "conflict",
      ["VERIFICATION_PROJECTED_ARTIFACT_INVALID", ...validation.reasonCodes],
      null,
    );
    return verificationResult(
      evidence,
      "partial",
      [
        "VERIFICATION_CURRENT_RUN_ENVIRONMENT_UNPROVEN",
        "VERIFICATION_CURRENT_RUN_PER_COMMAND_RESULT_UNAVAILABLE",
      ],
      artifact,
    );
  }

  const missingBindings = [
    attemptValid(evidence.attempt),
    nonEmpty(evidence.command.configuredCommand),
    nonEmpty(evidence.command.evidenceRef),
    nonEmpty(evidence.environment.environmentRef),
    nonEmpty(evidence.environment.evidenceRef),
    nonEmpty(evidence.result.evidenceRef),
    nonEmpty(evidence.result.verifiedAt),
    allNonEmpty(evidence.subjectRefs),
  ].some((present) => !present);
  const evidenceRefs = sortedStrings([
    ...evidence.evidenceRefs,
    evidence.attempt.evidenceRef,
    evidence.command.evidenceRef,
    evidence.environment.evidenceRef,
    evidence.result.evidenceRef,
  ]);
  if (missingBindings || !allNonEmpty(evidenceRefs)) {
    const passedWithoutEvidence = evidence.result.exitCode === 0 && !evidence.result.timedOut;
    return verificationResult(
      evidence,
      "unsupported",
      [
        "VERIFICATION_EXACT_EVIDENCE_BINDINGS_REQUIRED",
        ...(passedWithoutEvidence ? ["VERIFICATION_PASS_EVIDENCE_REQUIRED"] : []),
      ],
      null,
    );
  }
  if (!Number.isSafeInteger(evidence.result.exitCode)) return verificationResult(
    evidence,
    "unsupported",
    ["VERIFICATION_EXACT_COMMAND_RESULT_REQUIRED"],
    null,
  );
  if (evidence.result.attemptId !== evidence.attempt.attemptId)
    return verificationResult(evidence, "conflict", ["VERIFICATION_ATTEMPT_BINDING_CONFLICT"], null);
  if (evidence.result.command !== evidence.command.configuredCommand)
    return verificationResult(evidence, "conflict", ["VERIFICATION_COMMAND_BINDING_CONFLICT"], null);
  if (evidence.result.environmentRef !== evidence.environment.environmentRef)
    return verificationResult(evidence, "conflict", ["VERIFICATION_ENVIRONMENT_BINDING_CONFLICT"], null);

  const status: VerificationReceiptV2["status"] = evidence.result.timedOut
    ? "inconclusive"
    : evidence.result.exitCode === 0 ? "passed" : "failed";
  const artifact: VerificationReceiptV2 = {
    schema_version: "2.0",
    receipt_id: verificationReceiptId(evidence),
    task_id: evidence.taskId,
    subject_refs: sortedStrings(evidence.subjectRefs),
    claim_ids: sortedStrings(evidence.claimIds),
    verifier_type: evidence.environment.verifierType,
    verification_level: evidence.environment.verificationLevel,
    environment_ref: evidence.environment.environmentRef,
    status,
    evidence_refs: evidenceRefs,
    verified_at: evidence.result.verifiedAt,
  };
  const validation = validateAmkProjectArtifactV2("VerificationReceiptV2", artifact);
  if (!validation.valid) return verificationResult(
    evidence,
    "conflict",
    ["VERIFICATION_PROJECTED_ARTIFACT_INVALID", ...validation.reasonCodes],
    null,
  );
  return verificationResult(
    evidence,
    "compatible",
    status === "inconclusive" ? ["VERIFICATION_COMMAND_TIMED_OUT"] : [],
    artifact,
  );
}

function reviewStatus(verdict: ClosedReviewEvidenceV1["verdict"]["value"]): ReviewReceiptV1["status"] {
  if (verdict === "approved") return "passed";
  if (verdict === "changes_requested") return "findings";
  return "inconclusive";
}

function reviewId(evidence: ClosedReviewEvidenceV1): string {
  return `REV-${sha256(canonicalProjectionJson({
    projectId: evidence.projectId,
    selectedSource: evidence.selectedSource,
    taskId: evidence.taskId,
    attempt: evidence.attempt,
    profile: evidence.profile,
    result: {
      ...evidence.result,
      resultRefs: sortedStrings(evidence.result.resultRefs),
    },
    criteria: {
      ...evidence.criteria,
      verificationCommandRefs: sortedStrings(evidence.criteria.verificationCommandRefs),
      additionalCriteriaRefs: sortedStrings(evidence.criteria.additionalCriteriaRefs),
    },
    reasoningExclusion: evidence.reasoningExclusion,
    mutationIsolation: evidence.mutationIsolation,
    repairAuthority: evidence.repairAuthority,
    verdict: evidence.verdict,
    findings: [...evidence.findings]
      .sort((left, right) => compareText(left.id, right.id))
      .map((finding) => ({ ...finding, evidenceRefs: sortedStrings(finding.evidenceRefs) })),
    intentionalDecisionRefs: sortedStrings(evidence.intentionalDecisionRefs),
    evidenceRefs: sortedStrings(evidence.evidenceRefs),
    ownerDisposition: evidence.ownerDisposition,
  }))}`;
}

export function projectReviewReceiptV1(
  input: ReviewReceiptProjectionInputV1,
): AmkEvidenceProjectionResultV1<ReviewReceiptV1> {
  const { evidence } = input;
  const sourceIssue = sourceProblem(evidence);
  if (sourceIssue) return reviewResult(evidence, sourceIssue.status, [sourceIssue.reason], null);

  if (evidence.evidenceKind === "legacy_run") return reviewResult(
    evidence,
    "unsupported",
    ["REVIEW_LEGACY_REASONING_EXCLUSION_UNPROVEN"],
    null,
  );
  if (evidence.evidenceKind === "current_run") return reviewResult(
    evidence,
    "unsupported",
    ["REVIEW_CURRENT_FINAL_OUTPUT_REASONING_EXCLUSION_UNPROVEN"],
    null,
  );

  const bindings = [
    evidence.attempt.evidenceRef,
    evidence.result.evidenceRef,
    evidence.criteria.evidenceRef,
    evidence.reasoningExclusion.evidenceRef,
    evidence.mutationIsolation.evidenceRef,
    evidence.repairAuthority.evidenceRef,
    evidence.verdict.evidenceRef,
    ...evidence.evidenceRefs,
  ];
  if (!attemptValid(evidence.attempt) || !allNonEmpty(evidence.result.resultRefs) ||
      !nonEmpty(evidence.result.taskOwnedChangeSetRef) ||
      !nonEmpty(evidence.criteria.taskContractRef) ||
      !allNonEmpty(evidence.criteria.verificationCommandRefs) ||
      !allNonEmpty(bindings)) return reviewResult(
    evidence,
    "unsupported",
    ["REVIEW_EXACT_EVIDENCE_BINDINGS_REQUIRED"],
    null,
  );
  const attemptBindings = [
    evidence.result.attemptId,
    evidence.criteria.attemptId,
    evidence.reasoningExclusion.attemptId,
    evidence.mutationIsolation.attemptId,
    evidence.repairAuthority.attemptId,
    evidence.verdict.attemptId,
  ];
  if (attemptBindings.some((attemptId) => attemptId !== evidence.attempt.attemptId))
    return reviewResult(evidence, "conflict", ["REVIEW_ATTEMPT_BINDING_CONFLICT"], null);
  if (evidence.reasoningExclusion.authorReasoningIncluded !== false) return reviewResult(
    evidence,
    "unsupported",
    ["REVIEW_AUTHOR_REASONING_EXCLUSION_REQUIRED"],
    null,
  );
  if (evidence.mutationIsolation.mutationPerformed !== false) return reviewResult(
    evidence,
    "unsupported",
    ["REVIEW_MUTATION_ISOLATION_REQUIRED"],
    null,
  );
  if (evidence.repairAuthority.repairAuthorized !== false) return reviewResult(
    evidence,
    "unsupported",
    ["REVIEW_REPAIR_AUTHORITY_EXCLUSION_REQUIRED"],
    null,
  );
  if (evidence.ownerDisposition && !nonEmpty(evidence.ownerDisposition.evidenceRef))
    return reviewResult(evidence, "unsupported", ["REVIEW_OWNER_DISPOSITION_EVIDENCE_REQUIRED"], null);
  if (evidence.findings.some((finding) => !nonEmpty(finding.id) ||
      finding.attemptId !== evidence.attempt.attemptId ||
      !nonEmpty(finding.statement) || !allNonEmpty(finding.evidenceRefs))) return reviewResult(
    evidence,
    "unsupported",
    ["REVIEW_FINDING_EVIDENCE_REQUIRED"],
    null,
  );
  const findingIds = evidence.findings.map((finding) => finding.id);
  if (new Set(findingIds).size !== findingIds.length)
    return reviewResult(evidence, "conflict", ["REVIEW_DUPLICATE_FINDING_ID"], null);
  if (evidence.verdict.value === "approved" && evidence.findings.some((finding) => finding.blocking))
    return reviewResult(evidence, "conflict", ["REVIEW_PASSED_WITH_BLOCKING_FINDING"], null);

  const status = reviewStatus(evidence.verdict.value);
  const artifact: ReviewReceiptV1 = {
    schema_version: "1.0",
    review_id: reviewId(evidence),
    task_id: evidence.taskId,
    profile: evidence.profile,
    result_refs: sortedStrings([
      evidence.result.taskOwnedChangeSetRef,
      ...evidence.result.resultRefs,
    ]),
    criteria_refs: sortedStrings([
      evidence.criteria.taskContractRef,
      ...evidence.criteria.verificationCommandRefs,
      ...(evidence.criteria.additionalCriteriaRefs ?? []),
    ]),
    intentional_decision_refs: sortedStrings(evidence.intentionalDecisionRefs),
    author_reasoning_included: false,
    mutation_performed: false,
    repair_authorized: false,
    status,
    findings: [...evidence.findings]
      .sort((left, right) => compareText(left.id, right.id))
      .map((finding) => ({
        id: finding.id,
        category: finding.category,
        severity: finding.severity,
        statement: finding.statement,
        evidence_refs: sortedStrings(finding.evidenceRefs),
        blocking: finding.blocking,
      })),
    owner_disposition: evidence.ownerDisposition?.value ?? "pending",
  };
  const validation = validateAmkProjectArtifactV2("ReviewReceiptV1", artifact);
  if (!validation.valid) return reviewResult(
    evidence,
    "conflict",
    ["REVIEW_PROJECTED_ARTIFACT_INVALID", ...validation.reasonCodes],
    null,
  );
  return reviewResult(
    evidence,
    "compatible",
    evidence.ownerDisposition ? [] : ["REVIEW_OWNER_DISPOSITION_UNPROVEN_PENDING"],
    artifact,
  );
}
