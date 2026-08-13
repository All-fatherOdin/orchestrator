import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import schema from "./schemas/context-budget-v1.schema.json";

export const CONTEXT_BUDGET_CONTRACT_VERSION_V1 = "1.0" as const;
export const CONTEXT_BUDGET_MEASUREMENT_POLICY_V1 = "context-budget-measurement-v1" as const;
export const CONTEXT_BUDGET_ESTIMATOR_V1 = "utf8-bytes-div-4-ceil-v1" as const;

export type ContextBudgetSourceClassV1 =
  | "repository_instructions"
  | "selected_context_profile"
  | "project_status_contract"
  | "fixed_prompt_prefix"
  | "host_owner_instructions"
  | "host_skill_tool_descriptions";

export type ContextBudgetReasonCodeV1 =
  | "CONTEXT_BUDGET_BASELINE_INVALID"
  | "CONTEXT_BUDGET_BASELINE_IDENTITY_CHANGED"
  | "CONTEXT_BUDGET_SOURCE_MISSING"
  | "CONTEXT_BUDGET_SOURCE_INVALID_UTF8"
  | "CONTEXT_BUDGET_SOURCE_ESCAPE"
  | "CONTEXT_BUDGET_SOURCE_CHANGED"
  | "CONTEXT_BUDGET_SOURCE_DUPLICATE"
  | "CONTEXT_BUDGET_HELPER_UNAVAILABLE"
  | "CONTEXT_BUDGET_HELPER_MISMATCH"
  | "CONTEXT_BUDGET_PREFIX_UNAVAILABLE"
  | "CONTEXT_BUDGET_TOKENIZER_UNAVAILABLE"
  | "CONTEXT_BUDGET_TOKEN_INCOMPARABLE"
  | "CONTEXT_BUDGET_COUNT_LIMIT"
  | "CONTEXT_BUDGET_BYTE_LIMIT"
  | "CONTEXT_BUDGET_TOKEN_WARNING"
  | "CONTEXT_BUDGET_GROWTH_WARNING"
  | "CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED"
  | "CONTEXT_BUDGET_PRIVACY_REJECTED"
  | "CONTEXT_BUDGET_INTERNAL_CONFLICT";

export class ContextBudgetErrorV1 extends Error {
  constructor(readonly reasonCode: ContextBudgetReasonCodeV1, message: string) {
    super(message);
    this.name = "ContextBudgetErrorV1";
  }
}

export type TokenEvidenceV1 = Readonly<{
  state: "measured" | "estimated" | "unsupported" | "incomparable";
  identity: string;
  count?: number;
  tokenizerName?: string;
  tokenizerVersion?: string;
  artifactHash?: string;
  configurationHash?: string;
}>;

export type ContextBudgetEnvelopeV1 = Readonly<{
  maxSourceCount?: number;
  maxBytes?: number;
  maxTokens?: number;
  mode?: "hard" | "advisory";
}>;

export type ContextBudgetBaselineSourceV1 = Readonly<{
  sourceClass: ContextBudgetSourceClassV1;
  identity: string;
  sha256: string;
  byteCount: number;
  tokenEvidence: TokenEvidenceV1;
  envelope: ContextBudgetEnvelopeV1;
}>;

export type ContextBudgetUnsupportedSourceV1 = Readonly<{
  sourceClass: "host_owner_instructions" | "host_skill_tool_descriptions";
  state: "unsupported";
  reasonCode: "CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED";
}>;

export type ContextBudgetBaselineV1 = Readonly<{
  contractType: "ContextBudgetBaselineV1";
  contractVersion: "1.0";
  baselineId: string;
  revision: number;
  measurementPolicyId: typeof CONTEXT_BUDGET_MEASUREMENT_POLICY_V1;
  profiles: ReadonlyArray<Readonly<{ profile: string; maxSources: number; expectedPaths: ReadonlyArray<string> }>>;
  sources: ReadonlyArray<ContextBudgetBaselineSourceV1>;
  unsupportedSources: ReadonlyArray<ContextBudgetUnsupportedSourceV1>;
  sourceSetHash: string;
  baselineHash: string;
}>;

export type ContextBudgetCurrentSourceV1 = Readonly<{
  sourceClass: ContextBudgetSourceClassV1;
  identity: string;
  sha256: string;
  byteCount: number;
  tokenEvidence: TokenEvidenceV1;
}>;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateContract = ajv.compile(schema);
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_IDENTITY = /^(?![A-Za-z]:|\/|.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.][A-Za-z0-9_./:-]*$/;
const OBSERVABLE_CLASSES = new Set<ContextBudgetSourceClassV1>([
  "repository_instructions", "selected_context_profile", "project_status_contract", "fixed_prompt_prefix",
]);

export function canonicalJsonV1(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJsonV1).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonV1(object[key])}`).join(",")}}`;
}

export function sha256V1(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function withoutKey<T extends Record<string, unknown>>(value: T, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

export function estimateTokensV1(byteCount: number): TokenEvidenceV1 {
  if (!Number.isSafeInteger(byteCount) || byteCount < 0)
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_INTERNAL_CONFLICT", "Byte count is invalid.");
  return Object.freeze({ state: "estimated", identity: CONTEXT_BUDGET_ESTIMATOR_V1, count: Math.ceil(byteCount / 4) });
}

export function sourceSetHashV1(sources: ReadonlyArray<ContextBudgetBaselineSourceV1 | ContextBudgetCurrentSourceV1>) {
  const projection = sources.map(({ sourceClass, identity, sha256, byteCount }) => ({ sourceClass, identity, sha256, byteCount }));
  return sha256V1(canonicalJsonV1(projection));
}

export function baselineHashV1(baseline: Omit<ContextBudgetBaselineV1, "baselineHash"> | ContextBudgetBaselineV1) {
  return sha256V1(canonicalJsonV1(withoutKey(baseline as unknown as Record<string, unknown>, "baselineHash")));
}

export function createContextBudgetBaselineV1(input: Readonly<{
  baselineId: string;
  revision: number;
  profiles: ContextBudgetBaselineV1["profiles"];
  sources: ContextBudgetBaselineV1["sources"];
}>) {
  const unsupportedSources: ContextBudgetUnsupportedSourceV1[] = [
    { sourceClass: "host_owner_instructions", state: "unsupported", reasonCode: "CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED" },
    { sourceClass: "host_skill_tool_descriptions", state: "unsupported", reasonCode: "CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED" },
  ];
  const withoutHash = {
    contractType: "ContextBudgetBaselineV1" as const,
    contractVersion: CONTEXT_BUDGET_CONTRACT_VERSION_V1,
    baselineId: input.baselineId,
    revision: input.revision,
    measurementPolicyId: CONTEXT_BUDGET_MEASUREMENT_POLICY_V1,
    profiles: input.profiles,
    sources: input.sources,
    unsupportedSources,
    sourceSetHash: sourceSetHashV1(input.sources),
  };
  const baseline = { ...withoutHash, baselineHash: baselineHashV1(withoutHash) };
  assertContextBudgetBaselineV1(baseline);
  return Object.freeze(baseline);
}

function semanticTokenEvidence(value: TokenEvidenceV1) {
  if (value.state === "measured") {
    if (!Number.isSafeInteger(value.count) || value.count! < 0 || !value.tokenizerName || !value.tokenizerVersion || !SHA256.test(value.artifactHash ?? "") || !SHA256.test(value.configurationHash ?? ""))
      throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_INVALID", "Measured token evidence is incomplete.");
  } else if (value.state === "estimated") {
    if (value.identity !== CONTEXT_BUDGET_ESTIMATOR_V1 || !Number.isSafeInteger(value.count) || value.count! < 0)
      throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_INVALID", "Estimated token evidence is invalid.");
  } else if (value.count !== undefined) {
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_INVALID", "Unsupported token evidence cannot have a count.");
  }
}

export function assertContextBudgetBaselineV1(value: unknown): asserts value is ContextBudgetBaselineV1 {
  if (!validateContract(value) || (value as { contractType?: string })?.contractType !== "ContextBudgetBaselineV1")
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_INVALID", "Context budget baseline does not match its closed schema.");
  const baseline = value as ContextBudgetBaselineV1;
  const identities = new Set<string>();
  for (const source of baseline.sources) {
    if (!OBSERVABLE_CLASSES.has(source.sourceClass) || !SAFE_IDENTITY.test(source.identity) || identities.has(source.identity) || !SHA256.test(source.sha256))
      throw new ContextBudgetErrorV1(identities.has(source.identity) ? "CONTEXT_BUDGET_SOURCE_DUPLICATE" : "CONTEXT_BUDGET_BASELINE_INVALID", "Context budget source identity is invalid.");
    identities.add(source.identity);
    semanticTokenEvidence(source.tokenEvidence);
    if (source.tokenEvidence.state === "estimated" && source.tokenEvidence.count !== Math.ceil(source.byteCount / 4))
      throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_INVALID", "Estimated token count does not match its estimator.");
  }
  const unsupported = baseline.unsupportedSources.map((source) => source.sourceClass).sort().join(",");
  if (unsupported !== "host_owner_instructions,host_skill_tool_descriptions")
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_INVALID", "Both host-owned source classes must remain unsupported.");
  if (baseline.sourceSetHash !== sourceSetHashV1(baseline.sources) || baseline.baselineHash !== baselineHashV1(baseline))
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_BASELINE_IDENTITY_CHANGED", "Context budget baseline identity changed.");
}

function relativeDelta(current: number, baseline: number): string | null {
  return baseline === 0 ? null : ((current - baseline) / baseline).toFixed(6);
}

function comparableTokens(current: TokenEvidenceV1, baseline: TokenEvidenceV1): number | null {
  return current.state === baseline.state && current.identity === baseline.identity && current.count !== undefined && baseline.count !== undefined
    ? current.count - baseline.count
    : null;
}

export function buildContextBudgetReportV1(input: Readonly<{
  requestId: string;
  baseline: ContextBudgetBaselineV1;
  baselineBytes: Uint8Array;
  currentSources: ReadonlyArray<ContextBudgetCurrentSourceV1>;
  project: Readonly<{ head: string; dirty: boolean; overlappingPaths: ReadonlyArray<string> }>;
}>) {
  assertContextBudgetBaselineV1(input.baseline);
  if (!/^[a-z][a-z0-9._:-]{0,127}$/.test(input.requestId) || !/^[a-f0-9]{40,64}$/.test(input.project.head))
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_INTERNAL_CONFLICT", "Report request identity is invalid.");
  const current = new Map<string, ContextBudgetCurrentSourceV1>();
  for (const source of input.currentSources) {
    if (current.has(source.identity)) throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_DUPLICATE", "Current source identity is duplicated.");
    current.set(source.identity, source);
    semanticTokenEvidence(source.tokenEvidence);
  }
  const classCounts = new Map<ContextBudgetSourceClassV1, number>();
  for (const source of input.currentSources) classCounts.set(source.sourceClass, (classCounts.get(source.sourceClass) ?? 0) + 1);
  const allReasons = new Set<ContextBudgetReasonCodeV1>();
  let hardFailure = input.project.overlappingPaths.length > 0;
  if (hardFailure) allReasons.add("CONTEXT_BUDGET_SOURCE_CHANGED");
  const results = input.baseline.sources.map((baselineSource) => {
    const source = current.get(baselineSource.identity);
    if (!source || source.sourceClass !== baselineSource.sourceClass)
      throw new ContextBudgetErrorV1("CONTEXT_BUDGET_SOURCE_MISSING", "A required context budget source is missing.");
    const reasons = new Set<ContextBudgetReasonCodeV1>();
    const mode = baselineSource.envelope.mode ?? "advisory";
    let envelopeStatus: "pass" | "advisory" | "fail" = "pass";
    const breach = (code: ContextBudgetReasonCodeV1, blocking: boolean) => {
      reasons.add(code); allReasons.add(code);
      if (blocking) { hardFailure = true; envelopeStatus = "fail"; }
      else if (envelopeStatus === "pass") envelopeStatus = "advisory";
    };
    if (baselineSource.envelope.maxSourceCount !== undefined && (classCounts.get(source.sourceClass) ?? 0) > baselineSource.envelope.maxSourceCount)
      breach("CONTEXT_BUDGET_COUNT_LIMIT", mode === "hard");
    if (baselineSource.envelope.maxBytes !== undefined && source.byteCount > baselineSource.envelope.maxBytes)
      breach("CONTEXT_BUDGET_BYTE_LIMIT", mode === "hard");
    if (baselineSource.envelope.maxTokens !== undefined && source.tokenEvidence.count !== undefined && source.tokenEvidence.count > baselineSource.envelope.maxTokens)
      breach("CONTEXT_BUDGET_TOKEN_WARNING", false);
    if (source.sha256 !== baselineSource.sha256 || source.byteCount !== baselineSource.byteCount)
      breach("CONTEXT_BUDGET_GROWTH_WARNING", false);
    const tokenDelta = comparableTokens(source.tokenEvidence, baselineSource.tokenEvidence);
    if (tokenDelta === null && source.tokenEvidence.identity !== baselineSource.tokenEvidence.identity)
      breach("CONTEXT_BUDGET_TOKEN_INCOMPARABLE", false);
    const byteDelta = source.byteCount - baselineSource.byteCount;
    return {
      ...source,
      baseline: { sha256: baselineSource.sha256, byteCount: baselineSource.byteCount, tokenEvidence: baselineSource.tokenEvidence },
      change: { state: byteDelta === 0 ? "unchanged" : byteDelta > 0 ? "increased" : "decreased", byteDelta, byteRelativeDelta: relativeDelta(source.byteCount, baselineSource.byteCount), tokenDelta },
      envelopeStatus,
      reasonCodes: [...reasons].sort(),
    };
  });
  if (current.size !== input.baseline.sources.length)
    throw new ContextBudgetErrorV1("CONTEXT_BUDGET_INTERNAL_CONFLICT", "Current source set does not match the accepted baseline.");
  allReasons.add("CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED");
  const totalsBytes = results.reduce((sum, source) => sum + source.byteCount, 0);
  const allEstimated = results.every((source) => source.tokenEvidence.state === "estimated" && source.tokenEvidence.identity === CONTEXT_BUDGET_ESTIMATOR_V1);
  const totalsTokenEvidence: TokenEvidenceV1 = allEstimated
    ? { state: "estimated", identity: CONTEXT_BUDGET_ESTIMATOR_V1, count: results.reduce((sum, source) => sum + (source.tokenEvidence.count ?? 0), 0) }
    : { state: "incomparable", identity: "mixed-token-evidence-v1" };
  const reasonCodes = [...allReasons].sort();
  const withoutHash = {
    contractType: "ContextBudgetReportV1" as const,
    contractVersion: CONTEXT_BUDGET_CONTRACT_VERSION_V1,
    requestId: input.requestId,
    baseline: { baselineId: input.baseline.baselineId, revision: input.baseline.revision, byteLength: input.baselineBytes.byteLength, sha256: sha256V1(input.baselineBytes), baselineHash: input.baseline.baselineHash },
    project: { ...input.project, overlappingPaths: [...input.project.overlappingPaths].sort() },
    measurementPolicyId: CONTEXT_BUDGET_MEASUREMENT_POLICY_V1,
    sources: results,
    unsupportedSources: input.baseline.unsupportedSources,
    totals: { sourceCount: results.length, byteCount: totalsBytes, tokenEvidence: totalsTokenEvidence },
    outcome: hardFailure ? "fail" as const : reasonCodes.some((code) => code !== "CONTEXT_BUDGET_HOST_SOURCE_UNSUPPORTED") ? "pass-with-warnings" as const : "pass" as const,
    reasonCodes,
    wouldMutate: false as const,
    scopeExpansion: { runtime: false as const, externalSystem: false as const, data: false as const, projectMapMutated: false as const },
  };
  const report = { ...withoutHash, reportHash: sha256V1(canonicalJsonV1(withoutHash)) };
  if (!validateContract(report)) throw new ContextBudgetErrorV1("CONTEXT_BUDGET_INTERNAL_CONFLICT", "Generated report failed its closed schema.");
  return Object.freeze(report);
}
