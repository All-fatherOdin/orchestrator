import { createHash } from "node:crypto";

export const PROVIDER_RUNTIME_STATE_VERSION = "provider-runtime-state-v1";

export type ProviderReasoningModeV1 = "off" | "current_turn" | "persisted";
export type ProviderRuntimeIdentityComponentV1 =
  | "goal"
  | "scope"
  | "branch"
  | "priority"
  | "authorization";

export type ProviderRuntimeIdentityV1 = {
  goal: string;
  scope: string;
  branch: string;
  priority: string;
  authorization: string;
};

export type ProviderReasoningSummaryV1 = {
  type: "summary_text";
  text: string;
};

export type ProviderReplayItemV1 = {
  type: string;
  role?: string;
  phase?: string;
  [key: string]: unknown;
};

export type ProviderRuntimeStateV1 = {
  contractType: "ProviderRuntimeStateV1";
  contractVersion: "1.0";
  mode: "persisted";
  identity: ProviderRuntimeIdentityV1;
  identityFingerprint: string;
  previousResponseId?: string;
  reasoningSummaries: ProviderReasoningSummaryV1[];
  manualReplayItems: ProviderReplayItemV1[];
  recordedAt: string;
  authority: {
    sourceOfTruth: false;
    completionEvidence: false;
    approvalEvidence: false;
    durableProjectMemory: false;
  };
};

export type ProviderRuntimeDecisionV1 = {
  mode: ProviderReasoningModeV1;
  stateDisposition: "retain" | "discard";
  strategy:
    | "off"
    | "current_turn"
    | "previous_response_id"
    | "manual_replay";
  reason:
    | "FEATURE_DISABLED"
    | "CURRENT_TURN_ONLY"
    | "NO_REUSABLE_STATE"
    | "IDENTITY_CHANGED"
    | "PREVIOUS_RESPONSE_ID_AVAILABLE"
    | "MANUAL_REPLAY_AVAILABLE"
    | "PROVIDER_CONTINUATION_UNAVAILABLE";
  invalidatedBy: ProviderRuntimeIdentityComponentV1[];
  previousResponseId?: string;
  manualReplayItems?: ProviderReplayItemV1[];
};

export type ProviderRuntimeAdapterV1 = {
  id: string;
  supportsPreviousResponseId: boolean;
  supportsManualReplay: boolean;
};

export function providerReasoningModeV1(
  environment: Record<string, string | undefined> = process.env,
): ProviderReasoningModeV1 {
  const value = environment.ORCHESTRATOR_PROVIDER_REASONING_MODE;
  if (value === undefined || value === "") return "off";
  if (value === "off" || value === "current_turn" || value === "persisted")
    return value;
  throw new Error(
    "ORCHESTRATOR_PROVIDER_REASONING_MODE must be off, current_turn, or persisted.",
  );
}

const identityOrder: ProviderRuntimeIdentityComponentV1[] = [
  "goal",
  "scope",
  "branch",
  "priority",
  "authorization",
];

const forbiddenReasoningKeys = new Set([
  "chain_of_thought",
  "encrypted_content",
  "hidden_reasoning",
  "raw_reasoning",
  "reasoning_content",
]);

const forbiddenReasoningTypes = new Set([
  "chain_of_thought",
  "encrypted_reasoning",
  "hidden_reasoning",
  "raw_reasoning",
  "reasoning_content",
  "reasoning_text",
]);

const operationalAuthority = Object.freeze({
  sourceOfTruth: false,
  completionEvidence: false,
  approvalEvidence: false,
  durableProjectMemory: false,
} as const);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function nonEmptyIdentity(value: unknown, component: string) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`Provider runtime ${component} identity must be a non-empty string.`);
  return value;
}

export function createProviderRuntimeIdentityV1(
  identity: ProviderRuntimeIdentityV1,
): ProviderRuntimeIdentityV1 {
  return {
    goal: nonEmptyIdentity(identity.goal, "goal"),
    scope: nonEmptyIdentity(identity.scope, "scope"),
    branch: nonEmptyIdentity(identity.branch, "branch"),
    priority: nonEmptyIdentity(identity.priority, "priority"),
    authorization: nonEmptyIdentity(
      identity.authorization,
      "authorization",
    ),
  };
}

export function providerRuntimeIdentityFingerprintV1(
  identity: ProviderRuntimeIdentityV1,
) {
  return fingerprint(createProviderRuntimeIdentityV1(identity));
}

export function changedProviderRuntimeIdentityV1(
  previous: ProviderRuntimeIdentityV1,
  current: ProviderRuntimeIdentityV1,
) {
  const safePrevious = createProviderRuntimeIdentityV1(previous);
  const safeCurrent = createProviderRuntimeIdentityV1(current);
  return identityOrder.filter(
    (component) => safePrevious[component] !== safeCurrent[component],
  );
}

function assertNoHiddenReasoning(value: unknown, path = "value"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoHiddenReasoning(item, `${path}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  if (
    typeof object.type === "string" &&
    forbiddenReasoningTypes.has(object.type.toLowerCase())
  )
    throw new Error(`Hidden reasoning item type is forbidden at ${path}.type.`);
  for (const [key, child] of Object.entries(object)) {
    if (forbiddenReasoningKeys.has(key.toLowerCase()))
      throw new Error(`Hidden reasoning field is forbidden at ${path}.${key}.`);
    assertNoHiddenReasoning(child, `${path}.${key}`);
  }
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Keeps provider response item shape for manual replay, including item `type`
 * and assistant `phase`, while refusing fields commonly used for hidden or
 * encrypted reasoning. Reasoning items may carry only identifiers, status, and
 * provider-authored summaries.
 */
export function sanitizeProviderReplayItemsV1(
  items: readonly unknown[],
): ProviderReplayItemV1[] {
  return items.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error(`Replay item ${index + 1} must be an object.`);
    const item = value as Record<string, unknown>;
    if (typeof item.type !== "string" || !item.type.trim())
      throw new Error(`Replay item ${index + 1} must preserve a non-empty type.`);
    assertNoHiddenReasoning(item, `replayItems[${index}]`);
    if (
      item.role === "assistant" &&
      item.phase !== undefined &&
      (typeof item.phase !== "string" || !item.phase.trim())
    )
      throw new Error(`Replay item ${index + 1} has an invalid assistant phase.`);
    if (item.type === "reasoning") {
      const allowed = new Set(["type", "id", "status", "summary"]);
      const unexpected = Object.keys(item).filter((key) => !allowed.has(key));
      if (unexpected.length)
        throw new Error(
          `Reasoning replay item ${index + 1} contains non-summary fields: ${unexpected.join(", ")}.`,
        );
    }
    return jsonClone(item) as ProviderReplayItemV1;
  });
}

function sanitizeSummaries(
  summaries: readonly ProviderReasoningSummaryV1[] | undefined,
) {
  return (summaries ?? []).map((summary, index) => {
    assertNoHiddenReasoning(summary, `reasoningSummaries[${index}]`);
    if (
      summary.type !== "summary_text" ||
      typeof summary.text !== "string" ||
      !summary.text.trim()
    )
      throw new Error(`Reasoning summary ${index + 1} must be non-empty summary_text.`);
    return { type: "summary_text" as const, text: summary.text };
  });
}

export function recordProviderRuntimeStateV1(input: {
  mode?: ProviderReasoningModeV1;
  identity: ProviderRuntimeIdentityV1;
  previousResponseId?: string;
  reasoningSummaries?: readonly ProviderReasoningSummaryV1[];
  manualReplayItems?: readonly unknown[];
  recordedAt?: string;
}): ProviderRuntimeStateV1 | undefined {
  const mode = input.mode ?? "off";
  if (mode === "off" || mode === "current_turn") return undefined;
  if (mode !== "persisted")
    throw new Error(`Unsupported provider reasoning mode: ${String(mode)}.`);
  if (
    input.previousResponseId !== undefined &&
    (typeof input.previousResponseId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,256}$/.test(input.previousResponseId))
  )
    throw new Error("Provider response ID must be a sanitized provider identifier.");
  const identity = createProviderRuntimeIdentityV1(input.identity);
  const recordedAt = input.recordedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(recordedAt)))
    throw new Error("Provider runtime recordedAt must be an ISO-compatible timestamp.");
  return {
    contractType: "ProviderRuntimeStateV1",
    contractVersion: "1.0",
    mode: "persisted",
    identity,
    identityFingerprint: providerRuntimeIdentityFingerprintV1(identity),
    previousResponseId: input.previousResponseId,
    reasoningSummaries: sanitizeSummaries(input.reasoningSummaries),
    manualReplayItems: sanitizeProviderReplayItemsV1(
      input.manualReplayItems ?? [],
    ),
    recordedAt,
    authority: { ...operationalAuthority },
  };
}

export function validateProviderRuntimeStateV1(
  state: ProviderRuntimeStateV1,
): ProviderRuntimeStateV1 {
  assertNoHiddenReasoning(state, "providerRuntimeState");
  if (
    state.contractType !== "ProviderRuntimeStateV1" ||
    state.contractVersion !== "1.0" ||
    state.mode !== "persisted"
  )
    throw new Error("Provider runtime state contract is incompatible.");
  const identity = createProviderRuntimeIdentityV1(state.identity);
  if (
    state.identityFingerprint !==
    providerRuntimeIdentityFingerprintV1(identity)
  )
    throw new Error("Provider runtime state identity fingerprint is invalid.");
  if (
    state.previousResponseId !== undefined &&
    (typeof state.previousResponseId !== "string" ||
      !/^[A-Za-z0-9._:-]{1,256}$/.test(state.previousResponseId))
  )
    throw new Error("Persisted provider response ID is invalid.");
  if (!Number.isFinite(Date.parse(state.recordedAt)))
    throw new Error("Persisted provider runtime timestamp is invalid.");
  if (
    state.authority?.sourceOfTruth !== false ||
    state.authority?.completionEvidence !== false ||
    state.authority?.approvalEvidence !== false ||
    state.authority?.durableProjectMemory !== false
  )
    throw new Error("Provider runtime state cannot carry project authority.");
  return {
    contractType: "ProviderRuntimeStateV1",
    contractVersion: "1.0",
    mode: "persisted",
    identity,
    identityFingerprint: state.identityFingerprint,
    previousResponseId: state.previousResponseId,
    reasoningSummaries: sanitizeSummaries(state.reasoningSummaries),
    manualReplayItems: sanitizeProviderReplayItemsV1(
      state.manualReplayItems,
    ),
    recordedAt: state.recordedAt,
    authority: { ...operationalAuthority },
  };
}

export function recordProviderRuntimeStateForAdapterV1(
  adapter: ProviderRuntimeAdapterV1,
  input: Parameters<typeof recordProviderRuntimeStateV1>[0],
) {
  if (
    !adapter.supportsPreviousResponseId &&
    !adapter.supportsManualReplay
  )
    throw new Error(
      `Adapter ${adapter.id} does not support provider continuation and cannot record provider runtime state.`,
    );
  if (input.previousResponseId && !adapter.supportsPreviousResponseId)
    throw new Error(
      `Adapter ${adapter.id} does not support previous_response_id continuation.`,
    );
  if (input.manualReplayItems?.length && !adapter.supportsManualReplay)
    throw new Error(
      `Adapter ${adapter.id} does not support manual replay continuation.`,
    );
  return recordProviderRuntimeStateV1(input);
}

export function selectProviderRuntimeContinuationV1(input: {
  mode?: ProviderReasoningModeV1;
  identity: ProviderRuntimeIdentityV1;
  state?: ProviderRuntimeStateV1;
  supportsPreviousResponseId?: boolean;
  supportsManualReplay?: boolean;
}): ProviderRuntimeDecisionV1 {
  const mode = input.mode ?? "off";
  if (mode === "off")
    return {
      mode,
      stateDisposition: "discard",
      strategy: "off",
      reason: "FEATURE_DISABLED",
      invalidatedBy: [],
    };
  if (mode === "current_turn")
    return {
      mode,
      stateDisposition: "discard",
      strategy: "current_turn",
      reason: "CURRENT_TURN_ONLY",
      invalidatedBy: [],
    };
  if (mode !== "persisted")
    throw new Error(`Unsupported provider reasoning mode: ${String(mode)}.`);
  const identity = createProviderRuntimeIdentityV1(input.identity);
  if (!input.state)
    return {
      mode,
      stateDisposition: "discard",
      strategy: "current_turn",
      reason: "NO_REUSABLE_STATE",
      invalidatedBy: [],
    };
  const state = validateProviderRuntimeStateV1(input.state);
  const invalidatedBy = changedProviderRuntimeIdentityV1(
    state.identity,
    identity,
  );
  if (invalidatedBy.length)
    return {
      mode,
      stateDisposition: "discard",
      strategy: "current_turn",
      reason: "IDENTITY_CHANGED",
      invalidatedBy,
    };
  if (input.supportsPreviousResponseId && state.previousResponseId)
    return {
      mode,
      stateDisposition: "retain",
      strategy: "previous_response_id",
      reason: "PREVIOUS_RESPONSE_ID_AVAILABLE",
      invalidatedBy: [],
      previousResponseId: state.previousResponseId,
    };
  if (input.supportsManualReplay && state.manualReplayItems.length)
    return {
      mode,
      stateDisposition: "retain",
      strategy: "manual_replay",
      reason: "MANUAL_REPLAY_AVAILABLE",
      invalidatedBy: [],
      manualReplayItems: sanitizeProviderReplayItemsV1(
        state.manualReplayItems,
      ),
    };
  return {
    mode,
    stateDisposition: "discard",
    strategy: "current_turn",
    reason: "PROVIDER_CONTINUATION_UNAVAILABLE",
    invalidatedBy: [],
  };
}
