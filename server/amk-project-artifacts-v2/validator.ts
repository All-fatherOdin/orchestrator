import Ajv2020, { type ValidateFunction } from "ajv8/dist/2020.js";
import reviewReceiptV1Schema from "./schemas/review-receipt-v1.schema.json";
import taskContractV3Schema from "./schemas/task-contract-v3.schema.json";
import verificationReceiptV2Schema from "./schemas/verification-receipt-v2.schema.json";
import workItemGraphV1Schema from "./schemas/work-item-graph-v1.schema.json";

export const SUPPORTED_AMK_PROJECT_ARTIFACTS_V2 = [
  "TaskContractV3",
  "WorkItemGraphV1",
  "VerificationReceiptV2",
  "ReviewReceiptV1",
] as const;

export type AmkProjectArtifactV2Contract =
  (typeof SUPPORTED_AMK_PROJECT_ARTIFACTS_V2)[number];

export const AMK_PROJECT_ARTIFACT_V2_REASON_CODES = [
  "SCHEMA_INVALID",
  "UNKNOWN_CONTRACT",
  "TASK_CAPABILITY_REGISTRY_REQUIRED",
  "TASK_DESIGN_PROBE_REQUIRED",
  "TASK_EXPLORATION_MAP_REQUIRED",
  "TASK_HIGH_RISK_ADVERSARIAL_REVIEW_REQUIRED",
  "TASK_HIGH_RISK_CHALLENGE_REQUIRED",
  "TASK_MULTI_SESSION_GRAPH_REQUIRED",
  "TASK_MULTI_SESSION_TRACER_GRAPH_REQUIRED",
  "TASK_REVIEW_RECEIPT_REQUIRED",
  "TASK_SIGNIFICANT_REVIEW_REQUIRED",
  "TASK_TRIAGE_ARTIFACT_REQUIRED",
  "WORK_GRAPH_CYCLE",
  "WORK_GRAPH_FRONTIER_MISMATCH",
  "WORK_GRAPH_UNKNOWN_BLOCKER",
  "WORK_ITEM_REQUIRES_SPLIT",
  "VERIFICATION_PASS_EVIDENCE_REQUIRED",
  "REVIEW_AUTHOR_REASONING_FORBIDDEN",
  "REVIEW_MUTATION_FORBIDDEN",
  "REVIEW_REPAIR_AUTHORITY_FORBIDDEN",
  "REVIEW_PASSED_WITH_BLOCKING_FINDING",
  "TASK_GRAPH_REF_UNRESOLVED",
  "TASK_NON_DELIVERY_MODE_MUTATION_FORBIDDEN",
  "TASK_REQUIRED_REVIEW_NOT_ACCEPTED",
] as const;

export type AmkProjectArtifactV2ReasonCode =
  (typeof AMK_PROJECT_ARTIFACT_V2_REASON_CODES)[number];

export type AmkProjectArtifactV2Validation = Readonly<{
  contract: string;
  schemaValid: boolean;
  semanticReasonCodes: readonly AmkProjectArtifactV2ReasonCode[];
  reasonCodes: readonly AmkProjectArtifactV2ReasonCode[];
  valid: boolean;
}>;

export type AmkProjectArtifactV2BundleValidation = Readonly<{
  contracts: Readonly<Record<string, AmkProjectArtifactV2Validation>>;
  crossContractReasonCodes: readonly AmkProjectArtifactV2ReasonCode[];
  reasonCodes: readonly AmkProjectArtifactV2ReasonCode[];
  valid: boolean;
}>;

const ajv = new Ajv2020({ allErrors: true, strict: true });
const schemas = {
  TaskContractV3: taskContractV3Schema,
  WorkItemGraphV1: workItemGraphV1Schema,
  VerificationReceiptV2: verificationReceiptV2Schema,
  ReviewReceiptV1: reviewReceiptV1Schema,
} satisfies Record<AmkProjectArtifactV2Contract, object>;

const validators = Object.fromEntries(
  SUPPORTED_AMK_PROJECT_ARTIFACTS_V2.map((contract) => [
    contract,
    ajv.compile(schemas[contract]),
  ]),
) as Record<AmkProjectArtifactV2Contract, ValidateFunction>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const sortedCodes = (
  codes: readonly AmkProjectArtifactV2ReasonCode[],
): AmkProjectArtifactV2ReasonCode[] => [...new Set(codes)].sort(compareText);

const isContract = (value: string): value is AmkProjectArtifactV2Contract =>
  (SUPPORTED_AMK_PROJECT_ARTIFACTS_V2 as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const records = (value: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const strings = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function taskReasons(payload: unknown): AmkProjectArtifactV2ReasonCode[] {
  const profile = isRecord(payload) && isRecord(payload.workflow_profile)
    ? payload.workflow_profile
    : {};
  const reasons: AmkProjectArtifactV2ReasonCode[] = [];
  const mode = profile.mode;
  const multiSessionDelivery = mode === "delivery" && profile.task_scale === "multi_session";
  if (multiSessionDelivery && !profile.work_item_graph_ref)
    reasons.push("TASK_MULTI_SESSION_GRAPH_REQUIRED");
  if (multiSessionDelivery && profile.delivery_strategy !== "tracer_graph")
    reasons.push("TASK_MULTI_SESSION_TRACER_GRAPH_REQUIRED");
  const requiredReference = {
    exploration: ["exploration_map_ref", "TASK_EXPLORATION_MAP_REQUIRED"],
    triage: ["triage_item_ref", "TASK_TRIAGE_ARTIFACT_REQUIRED"],
    design_probe: ["design_probe_ref", "TASK_DESIGN_PROBE_REQUIRED"],
    review: ["review_receipt_refs", "TASK_REVIEW_RECEIPT_REQUIRED"],
  } as const;
  const requirement = typeof mode === "string"
    ? requiredReference[mode as keyof typeof requiredReference]
    : undefined;
  if (requirement) {
    const value = profile[requirement[0]];
    if (!value || (Array.isArray(value) && strings(value).length === 0)) reasons.push(requirement[1]);
  }
  if (mode === "delivery" && (profile.risk_class === "high" || profile.risk_class === "irreversible")) {
    if (!profile.plan_challenge_ref) reasons.push("TASK_HIGH_RISK_CHALLENGE_REQUIRED");
    if (profile.review_policy !== "adversarial" || strings(profile.review_receipt_refs).length === 0)
      reasons.push("TASK_HIGH_RISK_ADVERSARIAL_REVIEW_REQUIRED");
  } else if (
    mode === "delivery" && profile.risk_class === "significant" &&
    (profile.review_policy !== "fresh_context" || strings(profile.review_receipt_refs).length === 0)
  ) reasons.push("TASK_SIGNIFICANT_REVIEW_REQUIRED");
  if (
    (profile.capability_impact === "adds" || profile.capability_impact === "changes") &&
    strings(profile.capability_refs).length === 0
  ) reasons.push("TASK_CAPABILITY_REGISTRY_REQUIRED");
  return sortedCodes(reasons);
}

function hasCycle(items: readonly Record<string, unknown>[]): boolean {
  const graph = new Map(items.map((item) => [item.id, strings(item.blocked_by)]));
  const state = new Map<unknown, "visiting" | "visited">();
  const visit = (id: unknown): boolean => {
    state.set(id, "visiting");
    for (const dependency of graph.get(id) ?? []) {
      if (!graph.has(dependency)) continue;
      if (state.get(dependency) === "visiting" ||
          (state.get(dependency) === undefined && visit(dependency))) return true;
    }
    state.set(id, "visited");
    return false;
  };
  return [...graph.keys()].some((id) => state.get(id) === undefined && visit(id));
}

function workItemFrontier(payload: unknown): string[] {
  const items = isRecord(payload) ? records(payload.items) : [];
  const status = new Map(items.map((item) => [item.id, item.status]));
  return items
    .filter((item) => item.status === "accepted" && item.context_fit === "fresh_context" &&
      strings(item.blocked_by).every((reference) => status.get(reference) === "verified"))
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string")
    .sort(compareText);
}

function graphReasons(payload: unknown): AmkProjectArtifactV2ReasonCode[] {
  const record = isRecord(payload) ? payload : {};
  const items = records(record.items);
  const ids = new Set(items.map((item) => item.id));
  const reasons: AmkProjectArtifactV2ReasonCode[] = [];
  if (items.some((item) => strings(item.blocked_by).some((reference) => !ids.has(reference))))
    reasons.push("WORK_GRAPH_UNKNOWN_BLOCKER");
  if (hasCycle(items)) reasons.push("WORK_GRAPH_CYCLE");
  if (items.some((item) => item.status === "accepted" && item.context_fit === "requires_split"))
    reasons.push("WORK_ITEM_REQUIRES_SPLIT");
  const assertion = isRecord(record.frontier_assertion) ? strings(record.frontier_assertion.item_ids) : [];
  if (JSON.stringify([...assertion].sort(compareText)) !== JSON.stringify(workItemFrontier(payload)))
    reasons.push("WORK_GRAPH_FRONTIER_MISMATCH");
  return sortedCodes(reasons);
}

function verificationReasons(payload: unknown): AmkProjectArtifactV2ReasonCode[] {
  if (isRecord(payload) && payload.status === "passed" && strings(payload.evidence_refs).length === 0)
    return ["VERIFICATION_PASS_EVIDENCE_REQUIRED"];
  return [];
}

function reviewReasons(payload: unknown): AmkProjectArtifactV2ReasonCode[] {
  const record = isRecord(payload) ? payload : {};
  const reasons: AmkProjectArtifactV2ReasonCode[] = [];
  if (record.author_reasoning_included !== false) reasons.push("REVIEW_AUTHOR_REASONING_FORBIDDEN");
  if (record.mutation_performed !== false) reasons.push("REVIEW_MUTATION_FORBIDDEN");
  if (record.repair_authorized !== false) reasons.push("REVIEW_REPAIR_AUTHORITY_FORBIDDEN");
  if (record.status === "passed" && records(record.findings).some((finding) => finding.blocking === true))
    reasons.push("REVIEW_PASSED_WITH_BLOCKING_FINDING");
  return sortedCodes(reasons);
}

function semanticReasons(
  contract: AmkProjectArtifactV2Contract,
  payload: unknown,
): AmkProjectArtifactV2ReasonCode[] {
  switch (contract) {
    case "TaskContractV3": return taskReasons(payload);
    case "WorkItemGraphV1": return graphReasons(payload);
    case "VerificationReceiptV2": return verificationReasons(payload);
    case "ReviewReceiptV1": return reviewReasons(payload);
  }
}

export function validateAmkProjectArtifactV2(
  contract: string,
  payload: unknown,
): AmkProjectArtifactV2Validation {
  if (!isContract(contract)) return Object.freeze({
    contract,
    schemaValid: false,
    semanticReasonCodes: Object.freeze([]),
    reasonCodes: Object.freeze<readonly AmkProjectArtifactV2ReasonCode[]>(["UNKNOWN_CONTRACT"]),
    valid: false,
  });
  const schemaValid = validators[contract](payload);
  const semanticReasonCodes = sortedCodes(semanticReasons(contract, payload));
  const reasonCodes = sortedCodes([
    ...(schemaValid ? [] : ["SCHEMA_INVALID" as const]),
    ...semanticReasonCodes,
  ]);
  return Object.freeze({
    contract,
    schemaValid,
    semanticReasonCodes: Object.freeze(semanticReasonCodes),
    reasonCodes: Object.freeze(reasonCodes),
    valid: reasonCodes.length === 0,
  });
}

function crossContractReasons(
  bundle: Record<string, unknown>,
  results: Readonly<Record<string, AmkProjectArtifactV2Validation>>,
): AmkProjectArtifactV2ReasonCode[] {
  const task = isRecord(bundle.TaskContractV3) ? bundle.TaskContractV3 : undefined;
  const profile = task && isRecord(task.workflow_profile) ? task.workflow_profile : undefined;
  if (!profile) return [];
  const reasons: AmkProjectArtifactV2ReasonCode[] = [];
  if (
    ["exploration", "triage", "design_probe", "review"].includes(profile.mode as string) &&
    (task?.intent === "stage" || task?.intent === "apply" || task?.permission_mode === "apply")
  ) reasons.push("TASK_NON_DELIVERY_MODE_MUTATION_FORBIDDEN");
  const graphReference = profile.work_item_graph_ref;
  const graph = isRecord(bundle.WorkItemGraphV1) ? bundle.WorkItemGraphV1 : undefined;
  if (
    typeof graphReference === "string" &&
    (!results.WorkItemGraphV1?.valid || graph?.graph_id !== graphReference)
  ) reasons.push("TASK_GRAPH_REF_UNRESOLVED");

  const requiredProfile = profile.risk_class === "high" || profile.risk_class === "irreversible"
    ? "adversarial"
    : profile.risk_class === "significant" ? "fresh_context" : undefined;
  if (requiredProfile) {
    const reviews = [bundle.ReviewReceiptV1].flat().filter(isRecord);
    const acceptedReviewIds = new Set(reviews
      .filter((review) => results.ReviewReceiptV1?.valid && review.status === "passed" &&
        review.owner_disposition === "accepted" && review.profile === requiredProfile)
      .map((review) => review.review_id)
      .filter((id): id is string => typeof id === "string"));
    if (!strings(profile.review_receipt_refs).some((reference) => acceptedReviewIds.has(reference)))
      reasons.push("TASK_REQUIRED_REVIEW_NOT_ACCEPTED");
  }
  return sortedCodes(reasons);
}

export function validateAmkProjectArtifactBundleV2(
  value: unknown,
): AmkProjectArtifactV2BundleValidation {
  const bundle = isRecord(value) ? value : {};
  const contracts: Record<string, AmkProjectArtifactV2Validation> = {};
  for (const [contract, payload] of Object.entries(bundle))
    contracts[contract] = validateAmkProjectArtifactV2(contract, payload);
  const crossContractReasonCodes = crossContractReasons(bundle, contracts);
  const reasonCodes = sortedCodes([
    ...Object.values(contracts).flatMap((result) => result.reasonCodes),
    ...crossContractReasonCodes,
    ...(isRecord(value) ? [] : ["SCHEMA_INVALID" as const]),
  ]);
  return Object.freeze({
    contracts: Object.freeze(contracts),
    crossContractReasonCodes: Object.freeze(crossContractReasonCodes),
    reasonCodes: Object.freeze(reasonCodes),
    valid: reasonCodes.length === 0 && Object.keys(contracts).length > 0,
  });
}
