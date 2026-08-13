import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import schema from "./schemas/execution-budgets-v1.schema.json";

export const EXECUTION_BUDGET_CONTRACT_VERSION_V1 = "1.0" as const;

export type ExecutionBudgetPhaseV1 = "executor" | "reviewer" | "correction";
export type ExecutionBudgetDispositionV1 =
  | "allow"
  | "reject"
  | "defer"
  | "human-decision-required";
export type ExecutionBudgetReasonCodeV1 =
  | "EXECUTION_BUDGET_ADMITTED"
  | "EXECUTION_BUDGET_POLICY_INVALID"
  | "EXECUTION_BUDGET_IDENTITY_CHANGED"
  | "EXECUTION_BUDGET_TOTAL_EXHAUSTED"
  | "EXECUTION_BUDGET_PHASE_EXHAUSTED"
  | "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED"
  | "EXECUTION_BUDGET_RESERVATION_CONFLICT"
  | "EXECUTION_BUDGET_REPLAY_INVALID"
  | "EXECUTION_BUDGET_USAGE_MISSING"
  | "EXECUTION_BUDGET_USAGE_CONFLICTING"
  | "EXECUTION_BUDGET_TOKEN_ENFORCEMENT_UNSUPPORTED"
  | "EXECUTION_BUDGET_CAPABILITY_CHANGED"
  | "EXECUTION_BUDGET_DEFERRED_TO_LIVE_RESERVATION";

export class ExecutionBudgetErrorV1 extends Error {
  constructor(readonly reasonCode: ExecutionBudgetReasonCodeV1, message: string) {
    super(message);
    this.name = "ExecutionBudgetErrorV1";
  }
}

export type ExecutionBudgetPolicyV1 = Readonly<{
  contractType: "ExecutionBudgetPolicyV1";
  contractVersion: "1.0";
  budgetId: string;
  maxProviderInvocations: number;
  phaseCaps: Readonly<Record<ExecutionBudgetPhaseV1, number>>;
}>;

export type ExecutionBudgetOptionalIdentityV1 = Readonly<
  { state: "bound"; hash: string } | { state: "unsupported" }
>;

export type ExecutionBudgetAdmissionV1 = Readonly<{
  contractType: "ExecutionBudgetAdmissionV1";
  contractVersion: "1.0";
  admissionId: string;
  budgetHash: string;
  runId: string;
  taskId: string;
  phase: ExecutionBudgetPhaseV1;
  phaseOrdinal: number;
  taskInvocationOrdinal: number;
  resolvedModel: "luna" | "terra" | "sol";
  providerRuntimeIdentity: ExecutionBudgetOptionalIdentityV1;
  attemptBinding: ExecutionBudgetOptionalIdentityV1;
  disposition: ExecutionBudgetDispositionV1;
  reasonCode:
    | "EXECUTION_BUDGET_ADMITTED"
    | "EXECUTION_BUDGET_POLICY_INVALID"
    | "EXECUTION_BUDGET_TOTAL_EXHAUSTED"
    | "EXECUTION_BUDGET_PHASE_EXHAUSTED"
    | "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED"
    | "EXECUTION_BUDGET_RESERVATION_CONFLICT"
    | "EXECUTION_BUDGET_DEFERRED_TO_LIVE_RESERVATION";
  recordedAt: string;
}>;

export type ExecutionBudgetUsageV1 = Readonly<
  | {
      state: "measured";
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      cacheWriteTokens: number;
    }
  | { state: "unsupported" | "missing" | "conflicting" }
>;

export type ExecutionBudgetSettlementStatusV1 =
  | "completed"
  | "failed"
  | "timed_out"
  | "cancelled"
  | "not_started_after_reservation"
  | "recovery_ambiguous";

export type ExecutionBudgetSettlementV1 = Readonly<{
  contractType: "ExecutionBudgetSettlementV1";
  contractVersion: "1.0";
  settlementId: string;
  admissionId: string;
  budgetHash: string;
  runId: string;
  taskId: string;
  status: ExecutionBudgetSettlementStatusV1;
  usage: ExecutionBudgetUsageV1;
  settledAt: string;
}>;

export type ExecutionBudgetEvidenceV1 =
  | ExecutionBudgetAdmissionV1
  | ExecutionBudgetSettlementV1;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateContract = ajv.compile(schema);
const SHA256 = /^[a-f0-9]{64}$/;

export function canonicalExecutionBudgetJsonV1(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map(canonicalExecutionBudgetJsonV1).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalExecutionBudgetJsonV1(object[key])}`,
    )
    .join(",")}}`;
}

export function executionBudgetSha256V1(value: unknown): string {
  const input =
    typeof value === "string" || value instanceof Uint8Array
      ? value
      : canonicalExecutionBudgetJsonV1(value);
  return createHash("sha256").update(input).digest("hex");
}

export function executionBudgetPolicyHashV1(
  policy: ExecutionBudgetPolicyV1,
): string {
  return executionBudgetSha256V1(policy);
}

export function assertExecutionBudgetPolicyV1(
  value: unknown,
  runtime?: Readonly<{
    maxExecutorInvocations: number;
    maxCorrections: number;
  }>,
): asserts value is ExecutionBudgetPolicyV1 {
  if (
    !validateContract(value) ||
    (value as { contractType?: string })?.contractType !==
      "ExecutionBudgetPolicyV1"
  )
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_POLICY_INVALID",
      "Execution budget policy does not match its closed schema.",
    );
  const policy = value as ExecutionBudgetPolicyV1;
  const phaseTotal =
    policy.phaseCaps.executor +
    policy.phaseCaps.reviewer +
    policy.phaseCaps.correction;
  if (
    policy.maxProviderInvocations > phaseTotal ||
    policy.maxProviderInvocations < 2 ||
    Object.values(policy.phaseCaps).some(
      (cap) => cap > policy.maxProviderInvocations,
    ) ||
    (policy.phaseCaps.correction > 0 && policy.phaseCaps.reviewer !== 2)
  )
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_POLICY_INVALID",
      "Execution budget totals or reviewer/correction capacity are contradictory.",
    );
  if (
    runtime &&
    (policy.phaseCaps.executor > runtime.maxExecutorInvocations ||
      policy.phaseCaps.correction > runtime.maxCorrections)
  )
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_POLICY_INVALID",
      "Execution budget exceeds the existing executor or correction limit.",
    );
}

function admissionProjectionV1(
  admission: Omit<ExecutionBudgetAdmissionV1, "admissionId" | "recordedAt">,
) {
  return admission;
}

function admissionIdV1(
  admission: Omit<ExecutionBudgetAdmissionV1, "admissionId" | "recordedAt">,
) {
  return `budget-admission:${executionBudgetSha256V1(
    admissionProjectionV1(admission),
  ).slice(0, 40)}`;
}

function settlementIdV1(
  settlement: Omit<ExecutionBudgetSettlementV1, "settlementId" | "settledAt">,
) {
  return `budget-settlement:${executionBudgetSha256V1(settlement).slice(0, 40)}`;
}

function admissionsV1(evidence: readonly ExecutionBudgetEvidenceV1[]) {
  return evidence.filter(
    (entry): entry is ExecutionBudgetAdmissionV1 =>
      entry.contractType === "ExecutionBudgetAdmissionV1",
  );
}

function settlementsV1(evidence: readonly ExecutionBudgetEvidenceV1[]) {
  return evidence.filter(
    (entry): entry is ExecutionBudgetSettlementV1 =>
      entry.contractType === "ExecutionBudgetSettlementV1",
  );
}

export function assertExecutionBudgetEvidenceV1(
  policy: ExecutionBudgetPolicyV1,
  runId: string,
  taskId: string,
  evidence: readonly ExecutionBudgetEvidenceV1[],
) {
  assertExecutionBudgetPolicyV1(policy);
  if (!Array.isArray(evidence) || evidence.length > policy.maxProviderInvocations * 2 + 3)
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_REPLAY_INVALID",
      "Execution budget evidence is unbounded.",
    );
  const budgetHash = executionBudgetPolicyHashV1(policy);
  const seenEvidence = new Set<string>();
  const allowed: ExecutionBudgetAdmissionV1[] = [];
  const settledAdmissions = new Set<string>();
  const phaseCounts: Record<ExecutionBudgetPhaseV1, number> = {
    executor: 0,
    reviewer: 0,
    correction: 0,
  };
  const allowById = new Map<string, ExecutionBudgetAdmissionV1>();

  for (const entry of evidence) {
    const schemaValid = validateContract(entry);
    if (!schemaValid)
      throw new ExecutionBudgetErrorV1(
        "EXECUTION_BUDGET_REPLAY_INVALID",
        "Execution budget evidence does not match its closed schema.",
      );
    const current = entry as ExecutionBudgetEvidenceV1;
    const identity =
      current.contractType === "ExecutionBudgetAdmissionV1"
        ? current.admissionId
        : current.settlementId;
    if (seenEvidence.has(identity))
      throw new ExecutionBudgetErrorV1(
        "EXECUTION_BUDGET_REPLAY_INVALID",
        "Execution budget evidence identity is duplicated.",
      );
    seenEvidence.add(identity);
    if (
      current.budgetHash !== budgetHash ||
      current.runId !== runId ||
      current.taskId !== taskId
    )
      throw new ExecutionBudgetErrorV1(
        "EXECUTION_BUDGET_IDENTITY_CHANGED",
        "Execution budget evidence identity changed.",
      );

    if (current.contractType === "ExecutionBudgetAdmissionV1") {
      const { admissionId, recordedAt: _recordedAt, ...projection } = current;
      if (admissionId !== admissionIdV1(projection))
        throw new ExecutionBudgetErrorV1(
          "EXECUTION_BUDGET_REPLAY_INVALID",
          "Execution budget admission hash is invalid.",
        );
      const dispositionValid =
        (current.disposition === "allow" &&
          current.reasonCode === "EXECUTION_BUDGET_ADMITTED") ||
        (current.disposition === "defer" &&
          current.reasonCode ===
            "EXECUTION_BUDGET_DEFERRED_TO_LIVE_RESERVATION") ||
        (current.disposition === "human-decision-required" &&
          current.phase === "reviewer" &&
          current.reasonCode === "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED") ||
        (current.disposition === "reject" &&
          current.reasonCode !== "EXECUTION_BUDGET_ADMITTED" &&
          current.reasonCode !==
            "EXECUTION_BUDGET_DEFERRED_TO_LIVE_RESERVATION");
      if (!dispositionValid)
        throw new ExecutionBudgetErrorV1(
          "EXECUTION_BUDGET_REPLAY_INVALID",
          "Execution budget admission disposition and reason disagree.",
        );
      if (current.disposition !== "allow") continue;
      const prior = allowed.at(-1);
      if (prior && !settledAdmissions.has(prior.admissionId))
        throw new ExecutionBudgetErrorV1(
          "EXECUTION_BUDGET_REPLAY_INVALID",
          "A new execution budget reservation precedes settlement of the prior reservation.",
        );
      const expectedTaskOrdinal = allowed.length + 1;
      const expectedPhaseOrdinal = phaseCounts[current.phase] + 1;
      if (
        current.taskInvocationOrdinal !== expectedTaskOrdinal ||
        current.phaseOrdinal !== expectedPhaseOrdinal
      )
        throw new ExecutionBudgetErrorV1(
          "EXECUTION_BUDGET_REPLAY_INVALID",
          "Execution budget admission ordinals are not contiguous.",
        );
      allowed.push(current);
      phaseCounts[current.phase] += 1;
      allowById.set(current.admissionId, current);
      if (
        allowed.length > policy.maxProviderInvocations ||
        phaseCounts[current.phase] > policy.phaseCaps[current.phase]
      )
        throw new ExecutionBudgetErrorV1(
          "EXECUTION_BUDGET_REPLAY_INVALID",
          "Execution budget evidence exceeds an accepted cap.",
        );
      continue;
    }

    const admission = allowById.get(current.admissionId);
    if (!admission || settledAdmissions.has(current.admissionId))
      throw new ExecutionBudgetErrorV1(
        "EXECUTION_BUDGET_REPLAY_INVALID",
        "Execution budget settlement has no unique prior reservation.",
      );
    const { settlementId, settledAt: _settledAt, ...projection } = current;
    if (settlementId !== settlementIdV1(projection))
      throw new ExecutionBudgetErrorV1(
        "EXECUTION_BUDGET_REPLAY_INVALID",
        "Execution budget settlement hash is invalid.",
      );
    settledAdmissions.add(current.admissionId);
  }

  const open = allowed.filter(
    (entry) => !settledAdmissions.has(entry.admissionId),
  );
  if (open.length > 1 || (open.length === 1 && allowed.at(-1) !== open[0]))
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_REPLAY_INVALID",
      "Only the last execution budget reservation may remain unsettled.",
    );
}

function deniedDispositionV1(
  phase: ExecutionBudgetPhaseV1,
): "reject" | "human-decision-required" {
  return phase === "reviewer" ? "human-decision-required" : "reject";
}

export function createExecutionBudgetAdmissionV1(input: Readonly<{
  policy: ExecutionBudgetPolicyV1;
  runId: string;
  taskId: string;
  phase: ExecutionBudgetPhaseV1;
  resolvedModel: "luna" | "terra" | "sol";
  providerRuntimeIdentity?: ExecutionBudgetOptionalIdentityV1;
  attemptBinding?: ExecutionBudgetOptionalIdentityV1;
  evidence: readonly ExecutionBudgetEvidenceV1[];
  recordedAt: string;
}>) {
  assertExecutionBudgetPolicyV1(input.policy);
  assertExecutionBudgetEvidenceV1(
    input.policy,
    input.runId,
    input.taskId,
    input.evidence,
  );
  const admissions = admissionsV1(input.evidence);
  const settlements = new Set(
    settlementsV1(input.evidence).map((entry) => entry.admissionId),
  );
  const allowed = admissions.filter((entry) => entry.disposition === "allow");
  const open = allowed.find((entry) => !settlements.has(entry.admissionId));
  const phaseCount = allowed.filter((entry) => entry.phase === input.phase).length;
  const reviewerCount = allowed.filter((entry) => entry.phase === "reviewer").length;
  const taskInvocationOrdinal = allowed.length + 1;
  const phaseOrdinal = phaseCount + 1;

  let disposition: ExecutionBudgetDispositionV1 = "allow";
  let reasonCode: ExecutionBudgetAdmissionV1["reasonCode"] =
    "EXECUTION_BUDGET_ADMITTED";
  if (open) {
    disposition = "defer";
    reasonCode = "EXECUTION_BUDGET_DEFERRED_TO_LIVE_RESERVATION";
  } else if (allowed.length >= input.policy.maxProviderInvocations) {
    disposition = deniedDispositionV1(input.phase);
    reasonCode =
      input.phase === "reviewer"
        ? "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED"
        : "EXECUTION_BUDGET_TOTAL_EXHAUSTED";
  } else if (phaseCount >= input.policy.phaseCaps[input.phase]) {
    disposition = deniedDispositionV1(input.phase);
    reasonCode =
      input.phase === "reviewer"
        ? "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED"
        : "EXECUTION_BUDGET_PHASE_EXHAUSTED";
  } else {
    const remainingAfter =
      input.policy.maxProviderInvocations - allowed.length - 1;
    const reviewerRemainingAfter =
      input.policy.phaseCaps.reviewer - reviewerCount;
    const mustReserveReviewer =
      (input.phase === "executor" && reviewerCount === 0) ||
      input.phase === "correction";
    if (
      mustReserveReviewer &&
      (remainingAfter < 1 || reviewerRemainingAfter < 1)
    ) {
      disposition = "reject";
      reasonCode = "EXECUTION_BUDGET_REQUIRED_REVIEW_BLOCKED";
    }
  }

  const withoutIdentity = {
    contractType: "ExecutionBudgetAdmissionV1" as const,
    contractVersion: EXECUTION_BUDGET_CONTRACT_VERSION_V1,
    budgetHash: executionBudgetPolicyHashV1(input.policy),
    runId: input.runId,
    taskId: input.taskId,
    phase: input.phase,
    phaseOrdinal,
    taskInvocationOrdinal,
    resolvedModel: input.resolvedModel,
    providerRuntimeIdentity: input.providerRuntimeIdentity ?? {
      state: "unsupported" as const,
    },
    attemptBinding: input.attemptBinding ?? { state: "unsupported" as const },
    disposition,
    reasonCode,
  };
  const admission: ExecutionBudgetAdmissionV1 = Object.freeze({
    ...withoutIdentity,
    admissionId: admissionIdV1(withoutIdentity),
    recordedAt: input.recordedAt,
  });
  if (!validateContract(admission))
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_POLICY_INVALID",
      "Generated execution budget admission failed its closed schema.",
    );
  return admission;
}

export function normalizeExecutionBudgetUsageV1(
  records: ReadonlyArray<
    Readonly<{
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      cacheWriteTokens?: number;
    }>
  >,
): ExecutionBudgetUsageV1 {
  if (records.length === 0) return Object.freeze({ state: "missing" });
  const normalized = records.map((record) => ({
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    cachedInputTokens: record.cachedInputTokens,
    cacheWriteTokens: record.cacheWriteTokens ?? 0,
  }));
  if (
    normalized.some((record) =>
      Object.values(record).some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      ),
    )
  )
    return Object.freeze({ state: "conflicting" });
  const first = canonicalExecutionBudgetJsonV1(normalized[0]);
  if (
    normalized.some(
      (record) => canonicalExecutionBudgetJsonV1(record) !== first,
    )
  )
    return Object.freeze({ state: "conflicting" });
  return Object.freeze({ state: "measured", ...normalized[0] });
}

export function createExecutionBudgetSettlementV1(input: Readonly<{
  policy: ExecutionBudgetPolicyV1;
  admission: ExecutionBudgetAdmissionV1;
  status: ExecutionBudgetSettlementStatusV1;
  usage: ExecutionBudgetUsageV1;
  settledAt: string;
}>) {
  assertExecutionBudgetPolicyV1(input.policy);
  if (
    input.admission.disposition !== "allow" ||
    input.admission.budgetHash !== executionBudgetPolicyHashV1(input.policy)
  )
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_RESERVATION_CONFLICT",
      "Only an exact allowed reservation can settle.",
    );
  const withoutIdentity = {
    contractType: "ExecutionBudgetSettlementV1" as const,
    contractVersion: EXECUTION_BUDGET_CONTRACT_VERSION_V1,
    admissionId: input.admission.admissionId,
    budgetHash: input.admission.budgetHash,
    runId: input.admission.runId,
    taskId: input.admission.taskId,
    status: input.status,
    usage: input.usage,
  };
  const settlement: ExecutionBudgetSettlementV1 = Object.freeze({
    ...withoutIdentity,
    settlementId: settlementIdV1(withoutIdentity),
    settledAt: input.settledAt,
  });
  if (!validateContract(settlement))
    throw new ExecutionBudgetErrorV1(
      "EXECUTION_BUDGET_RESERVATION_CONFLICT",
      "Generated execution budget settlement failed its closed schema.",
    );
  return settlement;
}

export function executionBudgetProjectionV1(
  policy: ExecutionBudgetPolicyV1,
  evidence: readonly ExecutionBudgetEvidenceV1[],
) {
  const allowed = admissionsV1(evidence).filter(
    (entry) => entry.disposition === "allow",
  );
  const consumedByPhase = {
    executor: allowed.filter((entry) => entry.phase === "executor").length,
    reviewer: allowed.filter((entry) => entry.phase === "reviewer").length,
    correction: allowed.filter((entry) => entry.phase === "correction").length,
  };
  return Object.freeze({
    budgetId: policy.budgetId,
    budgetHash: executionBudgetPolicyHashV1(policy),
    maxProviderInvocations: policy.maxProviderInvocations,
    consumedProviderInvocations: allowed.length,
    remainingProviderInvocations:
      policy.maxProviderInvocations - allowed.length,
    phaseCaps: { ...policy.phaseCaps },
    consumedByPhase,
    tokenEnforcement: "unsupported" as const,
  });
}
