import type {
  ContextBundleV1,
  ContextProviderResult,
  ContextReceiptV1,
  ContextSourceV1,
} from "../index.ts";

export const CONTEXT_PTC_OPERATIONS = [
  "filter",
  "join",
  "rank",
  "deduplicate",
  "aggregate",
  "schema_validate",
] as const;

export type ContextPtcOperation = typeof CONTEXT_PTC_OPERATIONS[number];

export type ContextPtcCallerV1 = {
  type: "context_router";
  request_id: string;
};

export type ContextPtcCallV1 = {
  call_id: string;
  caller: ContextPtcCallerV1;
  operation: ContextPtcOperation;
  input: ContextProviderResult;
};

export type ContextPtcCallResultV1 = {
  call_id: string;
  caller: ContextPtcCallerV1;
  output: ContextProviderResult;
  reason_codes: string[];
};

export type ContextPtcToolDescriptor = {
  operation: ContextPtcOperation;
  readOnly: boolean;
  approvalSensitive: boolean;
};

export interface ContextPtcExecutor {
  describe(operation: ContextPtcOperation): ContextPtcToolDescriptor | undefined;
  execute(call: ContextPtcCallV1): Promise<ContextPtcCallResultV1>;
}

export type ContextPtcCallReceiptV1 = {
  call_id: string;
  caller: ContextPtcCallerV1;
  operation: ContextPtcOperation;
  attempts: number;
  reason_codes: string[];
};

export type ContextProgrammaticReductionV1 = {
  state: "applied" | "direct_fallback";
  reason_codes: string[];
  call_receipts: ContextPtcCallReceiptV1[];
  input_source_paths: string[];
  retained_evidence_refs: string[];
  requires_direct_final_validation: true;
};

export type ContextPtcOptions = {
  enabled?: boolean;
  executor?: ContextPtcExecutor;
  maxAttempts?: number;
};

export class ContextPtcFailure extends Error {
  constructor(
    readonly reasonCode: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

const operationSet = new Set<string>(CONTEXT_PTC_OPERATIONS);

function cloneResult(result: ContextProviderResult): ContextProviderResult {
  return structuredClone(result);
}

function sameCaller(left: ContextPtcCallerV1, right: ContextPtcCallerV1) {
  return left.type === right.type && left.request_id === right.request_id;
}

function sourceEvidence(sources: ContextSourceV1[]) {
  return [...new Set(sources.flatMap((source) => source.evidence_refs ?? []))].sort();
}

function sourceIdentity(source: ContextSourceV1) {
  const { evidence_refs: _evidenceRefs, ...identity } = source;
  return JSON.stringify(identity);
}

function rankSources(sources: ContextSourceV1[]) {
  const priority = (value: string) => {
    const match = /^P(\d+)$/i.exec(value);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };
  return [...sources].sort((left, right) =>
    priority(left.priority) - priority(right.priority) ||
    left.path.localeCompare(right.path, "en") ||
    sourceIdentity(left).localeCompare(sourceIdentity(right), "en"));
}

function deduplicateSources(sources: ContextSourceV1[]) {
  const byPath = new Map<string, ContextSourceV1>();
  for (const source of sources) {
    const key = source.path.replace(/\\/g, "/").toLowerCase();
    const existing = byPath.get(key);
    if (!existing) {
      byPath.set(key, structuredClone(source));
      continue;
    }
    if (sourceIdentity(existing) !== sourceIdentity(source))
      throw new ContextPtcFailure(
        "PTC_SEMANTIC_CONFLICT",
        `Programmatic reduction cannot resolve conflicting metadata for ${source.path}.`,
      );
    const evidence = [...new Set([...(existing.evidence_refs ?? []), ...(source.evidence_refs ?? [])])].sort();
    if (evidence.length) existing.evidence_refs = evidence;
  }
  return [...byPath.values()];
}

function aggregate(result: ContextProviderResult) {
  const output = cloneResult(result);
  const selected = output.bundle.selection.selected_source_count;
  const visible = output.bundle.sources.length;
  if (selected < visible)
    throw new ContextPtcFailure("PTC_OUTPUT_INVALID", "Selected source count is smaller than the reduced source set.");
  const omitted = selected - visible;
  output.bundle.selection.omitted_source_count = omitted;
  output.bundle.selection.truncated = omitted > 0;
  output.receipt.counts.selected_sources = selected;
  output.receipt.counts.omitted_sources = omitted;
  return output;
}

function ensureDirectHandoffComplete(
  result: ContextProviderResult,
  validate: (kind: "bundle" | "receipt", payload: ContextBundleV1 | ContextReceiptV1) => unknown,
) {
  validate("bundle", result.bundle);
  validate("receipt", result.receipt);
  if (
    result.bundle.request_id !== result.receipt.request_id ||
    result.bundle.bundle_id !== result.receipt.bundle_id ||
    result.bundle.sources.length > result.bundle.selection.max_sources ||
    result.receipt.counts.requested_max_sources !== result.bundle.selection.max_sources ||
    result.receipt.counts.selected_sources !== result.bundle.selection.selected_source_count ||
    result.receipt.counts.omitted_sources !== result.bundle.selection.omitted_source_count ||
    result.receipt.changed_paths.length !== 0 ||
    Object.values(result.bundle.scope_expansion).some(Boolean) ||
    Object.values(result.receipt.scope_expansion).some(Boolean)
  ) {
    throw new ContextPtcFailure("PTC_OUTPUT_INVALID", "Programmatic output is incomplete or inconsistent for direct handoff.");
  }
}

export class LocalDeterministicContextPtcExecutor implements ContextPtcExecutor {
  describe(operation: ContextPtcOperation): ContextPtcToolDescriptor | undefined {
    if (!operationSet.has(operation)) return undefined;
    return { operation, readOnly: true, approvalSensitive: false };
  }

  async execute(call: ContextPtcCallV1): Promise<ContextPtcCallResultV1> {
    const output = cloneResult(call.input);
    const before = output.bundle.sources.length;
    switch (call.operation) {
      case "filter":
        output.bundle.sources = output.bundle.sources.filter((source) => Boolean(source.path));
        break;
      case "join":
        for (const source of output.bundle.sources)
          if (source.evidence_refs) source.evidence_refs = [...new Set(source.evidence_refs)].sort();
        break;
      case "rank":
        output.bundle.sources = rankSources(output.bundle.sources);
        break;
      case "deduplicate":
        output.bundle.sources = deduplicateSources(output.bundle.sources);
        break;
      case "aggregate":
        return {
          call_id: call.call_id,
          caller: call.caller,
          output: aggregate(output),
          reason_codes: before === output.bundle.sources.length ? [] : ["PTC_REDUCED"],
        };
      case "schema_validate":
        break;
    }
    return {
      call_id: call.call_id,
      caller: call.caller,
      output,
      reason_codes: before === output.bundle.sources.length ? [] : ["PTC_REDUCED"],
    };
  }
}

const pipeline = [...CONTEXT_PTC_OPERATIONS];

export async function applyContextProgrammaticReductionV1(
  routed: ContextProviderResult,
  options: ContextPtcOptions,
  validate: (kind: "bundle" | "receipt", payload: ContextBundleV1 | ContextReceiptV1) => unknown,
): Promise<ContextProviderResult & { programmaticReduction?: ContextProgrammaticReductionV1 }> {
  if (options.enabled !== true) return routed;

  const executor = options.executor ?? new LocalDeterministicContextPtcExecutor();
  const maxAttempts = options.maxAttempts ?? 2;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2)
    throw new ContextPtcFailure("PTC_CONFIGURATION_INVALID", "Programmatic reduction allows one or two attempts.");

  const inputSourcePaths = routed.bundle.sources.map((source) => source.path);
  const retainedEvidenceRefs = sourceEvidence(routed.bundle.sources);
  const requiredEvidence = new Set(retainedEvidenceRefs);
  const caller: ContextPtcCallerV1 = { type: "context_router", request_id: routed.bundle.request_id };
  const receipts: ContextPtcCallReceiptV1[] = [];
  const deterministicReference = new LocalDeterministicContextPtcExecutor();

  try {
    ensureDirectHandoffComplete(routed, validate);
    for (const operation of pipeline) {
      const descriptor = executor.describe(operation);
      if (!descriptor || descriptor.operation !== operation || !descriptor.readOnly || descriptor.approvalSensitive)
        throw new ContextPtcFailure("PTC_TOOL_DENIED", `Programmatic operation ${operation} is not safely executable.`);
    }

    let current = cloneResult(routed);
    for (let index = 0; index < pipeline.length; index += 1) {
      const operation = pipeline[index];
      const call_id = `ptc-${routed.bundle.request_id}-${index + 1}`;
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          const response = await executor.execute({ call_id, caller, operation, input: cloneResult(current) });
          if (response.call_id !== call_id || !sameCaller(response.caller, caller))
            throw new ContextPtcFailure("PTC_LINKAGE_MISMATCH", "Programmatic provider lost call_id or caller linkage.");
          if (
            !Array.isArray(response.reason_codes) ||
            new Set(response.reason_codes).size !== response.reason_codes.length ||
            response.reason_codes.some((code) => !/^[A-Z][A-Z0-9_]*$/.test(code))
          )
            throw new ContextPtcFailure("PTC_REASON_CODE_INVALID", "Programmatic provider returned invalid reason codes.");
          const outputEvidence = new Set(sourceEvidence(response.output.bundle.sources));
          if ([...requiredEvidence].some((reference) => !outputEvidence.has(reference)))
            throw new ContextPtcFailure("PTC_EVIDENCE_LOST", "Programmatic reduction dropped evidence references.");
          const expected = await deterministicReference.execute({
            call_id,
            caller,
            operation,
            input: cloneResult(current),
          });
          if (JSON.stringify(response.output) !== JSON.stringify(expected.output))
            throw new ContextPtcFailure(
              "PTC_NONDETERMINISTIC_OUTPUT",
              `Programmatic operation ${operation} diverged from its deterministic contract.`,
            );
          current = response.output;
          receipts.push({ call_id, caller, operation, attempts: attempt, reason_codes: response.reason_codes });
          break;
        } catch (error) {
          if (error instanceof ContextPtcFailure && error.retryable && attempt < maxAttempts) continue;
          if (error instanceof ContextPtcFailure && error.retryable)
            throw new ContextPtcFailure("PTC_RETRY_EXHAUSTED", error.message);
          throw error;
        }
      }
    }

    ensureDirectHandoffComplete(current, validate);
    current.receipt.reason_codes = [...new Set([...current.receipt.reason_codes, "PTC_APPLIED"])];
    current.receipt.checks = [
      ...current.receipt.checks.filter((check) => check.check_id !== "programmatic_reduction"),
      { check_id: "programmatic_reduction", status: "pass", reason_codes: ["PTC_APPLIED"] },
    ];
    ensureDirectHandoffComplete(current, validate);
    return {
      ...current,
      programmaticReduction: {
        state: "applied",
        reason_codes: ["PTC_APPLIED"],
        call_receipts: receipts,
        input_source_paths: inputSourcePaths,
        retained_evidence_refs: retainedEvidenceRefs,
        requires_direct_final_validation: true,
      },
    };
  } catch (error) {
    const reasonCode = error instanceof ContextPtcFailure ? error.reasonCode : "PTC_EXECUTION_FAILED";
    ensureDirectHandoffComplete(routed, validate);
    return {
      ...routed,
      programmaticReduction: {
        state: "direct_fallback",
        reason_codes: [reasonCode],
        call_receipts: receipts,
        input_source_paths: inputSourcePaths,
        retained_evidence_refs: retainedEvidenceRefs,
        requires_direct_final_validation: true,
      },
    };
  }
}
