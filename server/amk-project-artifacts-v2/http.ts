import { createHash } from "node:crypto";
import type { Express, Request, Response } from "express";
import {
  projectReviewReceiptV1,
  projectVerificationReceiptV2,
} from "./evidence-projections.ts";
import {
  AMK_V5_PINNED_COMMIT,
  canonicalProjectionJson,
  projectTaskContractV3,
  projectWorkItemGraphV1,
} from "./projections.ts";
import type { AmkRunProjectionSourceV1, AmkRunSourceDescriptorV1 } from "./run-source.ts";
import type { AmkQueueProjectionSourceV1, AmkQueueSourceDescriptorV1 } from "./queue-source.ts";

export const AMK_HTTP_REQUEST_MAX_BYTES = 8 * 1024;
export const AMK_HTTP_RESPONSE_MAX_BYTES = 512 * 1024;
export const AMK_HTTP_MAX_TASKS = 100;
export const AMK_HTTP_MAX_EVIDENCE = 100;
export const AMK_HTTP_MAX_DISCOVERY = 50;
const AMK_RAW_JSON_BODY_BYTES = Symbol("amkRawJsonBodyBytes");

export const AMK_HTTP_CONTRACTS = [
  "TaskContractV3", "WorkItemGraphV1", "VerificationReceiptV2", "ReviewReceiptV1",
] as const;
export type AmkHttpContractV1 = (typeof AMK_HTTP_CONTRACTS)[number];

type AmkProjectionRequestBaseV1 = Readonly<{
  contractType: "AmkProjectArtifactsProjectionRequestV1";
  contractVersion: "1.0";
  requestId: string;
  projectId: string;
  sourceHash: string;
  sourceByteLength: number;
  sourceWatermark: string;
  contracts: readonly AmkHttpContractV1[];
}>;
export type AmkProjectionRequestV1 = AmkProjectionRequestBaseV1 & (
  | Readonly<{ selectorKind: "run"; runId: string }>
  | Readonly<{ selectorKind: "queue"; queueId: string }>
);

type AmkProjectionSourceV1 = AmkRunProjectionSourceV1 | AmkQueueProjectionSourceV1;
type AmkSourceDescriptorV1 = AmkRunSourceDescriptorV1 | AmkQueueSourceDescriptorV1;

export type AmkRunSourceAdapterV1 = Readonly<{
  list(): Promise<readonly AmkSourceDescriptorV1[]>;
  load(selectorKind: "run" | "queue", sourceId: string): Promise<AmkProjectionSourceV1 | undefined>;
}>;

export class AmkHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) { super(message); }
}

export function captureAmkJsonBodyByteLengthV1(
  request: Request,
  _response: Response,
  body: Buffer,
): void {
  Object.defineProperty(request, AMK_RAW_JSON_BODY_BYTES, {
    value: body.byteLength,
    configurable: false,
    enumerable: false,
    writable: false,
  });
}

function requestBodyByteLength(request: Request): number {
  const captured = (request as Request & { [AMK_RAW_JSON_BODY_BYTES]?: number })[AMK_RAW_JSON_BODY_BYTES];
  return captured ?? Buffer.byteLength(JSON.stringify(request.body ?? null), "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertResponseSize(value: unknown): void {
  if (Buffer.byteLength(canonicalProjectionJson(value), "utf8") > AMK_HTTP_RESPONSE_MAX_BYTES)
    throw new AmkHttpError(413, "RESPONSE_TOO_LARGE", "Projection response exceeds the fixed response limit.");
}

function parseRequest(value: unknown): AmkProjectionRequestV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AmkHttpError(400, "REQUEST_INVALID", "Request must be a closed JSON object.");
  const input = value as Record<string, unknown>;
  const allowed = new Set([
    "contractType", "contractVersion", "requestId", "projectId", "selectorKind", "runId", "queueId", "sourceHash",
    "sourceByteLength", "sourceWatermark", "contracts",
  ]);
  if (Object.keys(input).some((key) => !allowed.has(key)))
    throw new AmkHttpError(400, "REQUEST_UNKNOWN_FIELD", "Request contains an unsupported field.");
  if (input.contractType !== "AmkProjectArtifactsProjectionRequestV1" || input.contractVersion !== "1.0")
    throw new AmkHttpError(400, "REQUEST_CONTRACT_INVALID", "Request contract identity is invalid.");
  if (typeof input.requestId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(input.requestId))
    throw new AmkHttpError(400, "REQUEST_ID_INVALID", "requestId is invalid.");
  const runSelector = input.selectorKind === "run" && typeof input.runId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(input.runId) && input.queueId === undefined;
  const queueSelector = input.selectorKind === "queue" && typeof input.queueId === "string" &&
    /^QUEUE-[a-f0-9]{64}$/.test(input.queueId) && input.runId === undefined;
  if (typeof input.projectId !== "string" || !/^PROJECT-[a-f0-9]{64}$/.test(input.projectId) ||
      (!runSelector && !queueSelector) ||
      typeof input.sourceHash !== "string" || !/^[a-f0-9]{64}$/.test(input.sourceHash) ||
      !Number.isSafeInteger(input.sourceByteLength) || Number(input.sourceByteLength) < 0 ||
      typeof input.sourceWatermark !== "string" || !/^AMK-(?:RUN|QUEUE)-[a-f0-9]{64}-[0-9]+$/.test(input.sourceWatermark))
    throw new AmkHttpError(400, "SOURCE_SELECTOR_INVALID", "Source selector is invalid.");
  if (!Array.isArray(input.contracts) || input.contracts.length === 0 ||
      input.contracts.some((item) => !AMK_HTTP_CONTRACTS.includes(item as AmkHttpContractV1)) ||
      new Set(input.contracts).size !== input.contracts.length)
    throw new AmkHttpError(400, "CONTRACT_SELECTION_INVALID", "contracts must be a unique non-empty supported subset.");
  return input as AmkProjectionRequestV1;
}

function publicProjection(result: {
  contractType: string;
  contractVersion: string;
  projectionVersion: string;
  pinnedAmkCommit: string;
  schemaSha256: string;
  status: string;
  reasonCodes: readonly string[];
  artifact: unknown;
  projectionId: string;
  readOnly: true;
  navigationOnly: true;
  activated: false;
  filesModified: false;
}) {
  const artifactJson = result.artifact === null ? null : canonicalProjectionJson(result.artifact);
  return {
    contractType: result.contractType,
    contractVersion: result.contractVersion,
    projectionVersion: result.projectionVersion,
    pinnedAmkCommit: result.pinnedAmkCommit,
    schemaSha256: result.schemaSha256,
    status: result.status,
    reasonCodes: [...new Set([...result.reasonCodes, "HTTP_ARTIFACT_REDACTED_BY_PRIVACY_POLICY"])].sort(),
    projectionId: result.projectionId,
    artifact: null,
    artifactAvailable: false,
    artifactSha256: artifactJson === null ? null : sha256(artifactJson),
    artifactByteLength: artifactJson === null ? 0 : Buffer.byteLength(artifactJson, "utf8"),
    readOnly: true as const,
    navigationOnly: true as const,
    activated: false as const,
    filesModified: false as const,
  };
}

function sourceId(request: AmkProjectionRequestV1): string {
  return request.selectorKind === "run" ? request.runId : request.queueId;
}

function descriptorId(source: AmkProjectionSourceV1): string {
  return source.descriptor.selectorKind === "run" ? source.descriptor.runId : source.descriptor.queueId;
}

function sameSelector(request: AmkProjectionRequestV1, source: AmkProjectionSourceV1): boolean {
  const descriptor = source.descriptor;
  return request.projectId === descriptor.projectId && request.selectorKind === descriptor.selectorKind &&
    sourceId(request) === descriptorId(source) &&
    request.sourceHash === descriptor.sourceHash && request.sourceByteLength === descriptor.sourceByteLength &&
    request.sourceWatermark === descriptor.sourceWatermark;
}

export class AmkProjectArtifactsServiceV1 {
  constructor(private readonly adapter: AmkRunSourceAdapterV1) {}

  async discover() {
    const sources = (await this.adapter.list())
      .slice(0, AMK_HTTP_MAX_DISCOVERY)
      .map((source) => ({ ...source }));
    const response = {
      contractType: "AmkProjectArtifactsDiscoveryV1" as const,
      contractVersion: "1.0" as const,
      pinnedAmkCommit: AMK_V5_PINNED_COMMIT,
      supportedContracts: [...AMK_HTTP_CONTRACTS],
      selectorKinds: ["run", "queue"] as const,
      limits: {
        requestBytes: AMK_HTTP_REQUEST_MAX_BYTES,
        responseBytes: AMK_HTTP_RESPONSE_MAX_BYTES,
        tasks: AMK_HTTP_MAX_TASKS,
        evidenceItems: AMK_HTTP_MAX_EVIDENCE,
        sources: AMK_HTTP_MAX_DISCOVERY,
      },
      sources,
      readOnly: true as const,
      navigationOnly: true as const,
      activated: false as const,
      filesModified: false as const,
    };
    assertResponseSize(response);
    return response;
  }

  async project(rawRequest: unknown) {
    const request = parseRequest(rawRequest);
    const source = await this.adapter.load(request.selectorKind, sourceId(request));
    if (!source) throw new AmkHttpError(404, "SOURCE_NOT_FOUND", "Selected source was not found.");
    if (request.projectId !== source.descriptor.projectId || request.selectorKind !== source.descriptor.selectorKind || sourceId(request) !== descriptorId(source))
      throw new AmkHttpError(409, "SOURCE_CONFLICT", "Selected source identity conflicts with the current source.");
    if (!sameSelector(request, source))
      throw new AmkHttpError(409, "SOURCE_STALE", "Selected source hash or watermark is stale.");
    if (source.taskEvidence.tasks.length > AMK_HTTP_MAX_TASKS ||
        source.verificationEvidence.length + source.reviewEvidence.length > AMK_HTTP_MAX_EVIDENCE)
      throw new AmkHttpError(413, "SOURCE_LIMIT_EXCEEDED", "Selected source exceeds projection limits.");

    const results: ReturnType<typeof publicProjection>[] = [];
    for (const contract of request.contracts) {
      if (contract === "TaskContractV3") for (const task of source.taskEvidence.tasks) {
        results.push(publicProjection(projectTaskContractV3({
          evidence: source.taskEvidence,
          taskKey: task.key!,
        })));
      }
      if (contract === "WorkItemGraphV1")
        results.push(publicProjection(projectWorkItemGraphV1({ evidence: source.taskEvidence })));
      if (contract === "VerificationReceiptV2") for (const evidence of source.verificationEvidence)
        results.push(publicProjection(projectVerificationReceiptV2({ evidence })));
      if (contract === "ReviewReceiptV1") for (const evidence of source.reviewEvidence)
        results.push(publicProjection(projectReviewReceiptV1({ evidence })));
    }

    const current = await this.adapter.load(request.selectorKind, sourceId(request));
    if (!current || !sameSelector(request, current))
      throw new AmkHttpError(409, "SOURCE_STALE", "Source changed while projections were being built.");
    const body = {
      contractType: "AmkProjectArtifactsProjectionResponseV1" as const,
      contractVersion: "1.0" as const,
      requestId: request.requestId,
      source: { ...current.descriptor },
      results,
      readOnly: true as const,
      navigationOnly: true as const,
      activated: false as const,
      filesModified: false as const,
    };
    const response = { ...body, responseId: `AMK-HTTP-${sha256(canonicalProjectionJson(body))}` };
    assertResponseSize(response);
    return response;
  }
}

function sendError(response: Response, error: unknown) {
  const failure = error instanceof AmkHttpError
    ? error
    : new AmkHttpError(503, "SOURCE_UNAVAILABLE", "Projection source is unavailable.");
  return response.status(failure.status).json({
    contractType: "AmkProjectArtifactsErrorV1",
    contractVersion: "1.0",
    code: failure.code,
    message: failure.message,
    readOnly: true,
    navigationOnly: true,
    activated: false,
    filesModified: false,
  });
}

export function installAmkProjectArtifactsRoutesV1(app: Express, service: AmkProjectArtifactsServiceV1) {
  app.get("/api/amk-project-artifacts/v1", async (_request: Request, response: Response) => {
    try { return response.json(await service.discover()); }
    catch (error) { return sendError(response, error); }
  });
  app.post("/api/amk-project-artifacts/v1/project", async (request: Request, response: Response) => {
    try {
      if (requestBodyByteLength(request) > AMK_HTTP_REQUEST_MAX_BYTES)
        throw new AmkHttpError(413, "REQUEST_TOO_LARGE", "Projection request exceeds the fixed request limit.");
      return response.json(await service.project(request.body));
    } catch (error) { return sendError(response, error); }
  });
}
