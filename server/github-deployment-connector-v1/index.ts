import { createHash } from "node:crypto";
import Ajv2020 from "ajv8/dist/2020.js";
import connectorSchema from "./schemas/github-deployment-connector-v1.schema.json";
import {
  OperationalOutcomeErrorV1,
  type DeploymentObservationV1,
  type OperationalOutcomeImportRequestV1,
  type OperationalOutcomeMutationReceiptV1,
  type OperationalOutcomePreviewV1,
  type OperationalOutcomeProjectionV1,
  type OperationalWatermarkV1,
} from "../operational-outcomes-v1/index.ts";

export const GITHUB_DEPLOYMENT_CONNECTOR_VERSION_V1 = "github-deployments-v1";
export const GITHUB_REST_API_VERSION_V1 = "2026-03-10";
export const GITHUB_DEPLOYMENT_CONNECTOR_LIMITS_V1 = Object.freeze({
  requestBytes: 8 * 1024,
  responseBytes: 256 * 1024,
  totalResponseBytes: 512 * 1024,
  timeoutMs: 10_000,
});

export type GitHubDeploymentConnectorReasonCodeV1 =
  | "CONNECTOR_NOT_CONFIGURED"
  | "CONNECTOR_SECRET_UNAVAILABLE"
  | "CONNECTOR_SOURCE_INVALID"
  | "CONNECTOR_REQUEST_INVALID"
  | "CONNECTOR_REMOTE_UNAUTHORIZED"
  | "CONNECTOR_REMOTE_NOT_FOUND"
  | "CONNECTOR_REMOTE_RATE_LIMITED"
  | "CONNECTOR_REMOTE_TIMEOUT"
  | "CONNECTOR_REMOTE_TOO_LARGE"
  | "CONNECTOR_REMOTE_INVALID"
  | "CONNECTOR_REMOTE_UNAVAILABLE"
  | "CONNECTOR_REMOTE_IDENTITY_MISMATCH"
  | "CONNECTOR_REMOTE_STATE_UNSUPPORTED"
  | "CONNECTOR_REMOTE_SNAPSHOT_CHANGED"
  | "CONNECTOR_PROJECT_WATERMARK_CHANGED"
  | "CONNECTOR_RESULT_AMBIGUOUS"
  | "CONNECTOR_PHASE10_REJECTED";

export class GitHubDeploymentConnectorErrorV1 extends Error {
  constructor(
    readonly reasonCode: GitHubDeploymentConnectorReasonCodeV1,
    message: string,
    readonly status = 400,
    readonly retryAfterSeconds?: number,
    readonly rateLimitResetAt?: string,
  ) {
    super(message);
    this.name = "GitHubDeploymentConnectorErrorV1";
  }
}

export type GitHubDeploymentConnectorConfigV1 = Readonly<{
  apiOrigin: "https://api.github.com";
  apiVersion: typeof GITHUB_REST_API_VERSION_V1;
  owner: string;
  repository: string;
  productionEnvironment: string;
  sourceId: string;
  token?: string;
  repositoryFingerprint: string;
}>;

type RuntimeEnvironmentV1 = Record<string, string | undefined>;
const CONFIG_KEYS = Object.freeze({
  owner: "ORCHESTRATOR_GITHUB_DEPLOYMENTS_OWNER",
  repository: "ORCHESTRATOR_GITHUB_DEPLOYMENTS_REPOSITORY",
  productionEnvironment: "ORCHESTRATOR_GITHUB_DEPLOYMENTS_PRODUCTION_ENVIRONMENT",
  sourceId: "ORCHESTRATOR_GITHUB_DEPLOYMENTS_SOURCE_ID",
  token: "ORCHESTRATOR_GITHUB_DEPLOYMENTS_TOKEN",
});
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const OWNER = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/;
const REPOSITORY = /^[A-Za-z0-9._-]{1,100}$/;
const DECIMAL_ID = /^[1-9][0-9]{0,19}$/;
const GIT_OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256 = /^[a-f0-9]{64}$/;

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function repositoryFingerprint(owner: string, repository: string) {
  return sha256(`github.com\0${owner.toLowerCase()}\0${repository.toLowerCase()}`);
}

export function loadGitHubDeploymentConnectorConfigV1(
  environment: RuntimeEnvironmentV1 = process.env,
): GitHubDeploymentConnectorConfigV1 | undefined {
  const values = Object.fromEntries(
    Object.entries(CONFIG_KEYS).map(([name, key]) => [name, environment[key]]),
  ) as Record<keyof typeof CONFIG_KEYS, string | undefined>;
  if (Object.values(values).every((value) => value === undefined)) return undefined;
  const required = [
    values.owner,
    values.repository,
    values.productionEnvironment,
    values.sourceId,
  ];
  if (required.some((value) => value === undefined || value.length === 0))
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_NOT_CONFIGURED",
      "GitHub deployment connector configuration is incomplete.",
      503,
    );
  if (
    !OWNER.test(values.owner!) ||
    !REPOSITORY.test(values.repository!) ||
    !IDENTIFIER.test(values.sourceId!) ||
    values.productionEnvironment!.length > 128 ||
    values.productionEnvironment!.trim() !== values.productionEnvironment ||
    /[\u0000-\u001f\u007f]/.test(values.productionEnvironment!) ||
    (values.token !== undefined && (values.token.length === 0 || values.token.length > 4096))
  )
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_NOT_CONFIGURED",
      "GitHub deployment connector configuration is invalid.",
      503,
    );
  const config = {
    apiOrigin: "https://api.github.com",
    apiVersion: GITHUB_REST_API_VERSION_V1,
    owner: values.owner!,
    repository: values.repository!,
    productionEnvironment: values.productionEnvironment!,
    sourceId: values.sourceId!,
    repositoryFingerprint: repositoryFingerprint(values.owner!, values.repository!),
  } as GitHubDeploymentConnectorConfigV1;
  if (values.token)
    Object.defineProperty(config, "token", {
      value: values.token,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  return Object.freeze(config);
}

type BaseRequestV1 = Readonly<{
  contractVersion: "1.0";
  requestId: string;
  idempotencyKey: string;
  projectId: string;
  changeId: string;
  actor: string;
  observedProject: OperationalWatermarkV1;
  sourceId: string;
  deploymentId: string;
  deploymentStatusId: string;
}>;

export type GitHubDeploymentConnectorPreviewRequestV1 = BaseRequestV1 &
  Readonly<{
    contractType: "GitHubDeploymentConnectorPreviewRequestV1";
    confirm: false;
  }>;

export type GitHubDeploymentConnectorExecuteRequestV1 = BaseRequestV1 &
  Readonly<{
    contractType: "GitHubDeploymentConnectorExecuteRequestV1";
    confirm: true;
    remoteSnapshotHash: string;
    contentHash: string;
  }>;

export type GitHubDeploymentObservationSummaryV1 = Readonly<{
  observationId: string;
  sourceRecordId: string;
  deploymentId: string;
  deploymentStatusId: string;
  occurredAt: string;
  commitSha: string;
  treeSha: string;
  environmentClass: "production";
  outcome: "succeeded" | "failed";
  evidenceRefs: readonly string[];
}>;

type ConnectorPreviewReasonCodeV1 =
  | "CONNECTOR_SOURCE_INVALID"
  | "CONNECTOR_REMOTE_IDENTITY_MISMATCH"
  | "CONNECTOR_PROJECT_WATERMARK_CHANGED"
  | "CONNECTOR_PHASE10_REJECTED";

export type GitHubDeploymentConnectorPreviewV1 = Readonly<{
  contractType: "GitHubDeploymentConnectorPreviewV1";
  contractVersion: "1.0";
  requestId: string;
  allowed: boolean;
  reasonCodes: readonly ConnectorPreviewReasonCodeV1[];
  remoteSnapshotHash: string;
  contentHash: string;
  sourceWatermark: OperationalWatermarkV1;
  observationCount: 1;
  wouldMutate: false;
  observation: GitHubDeploymentObservationSummaryV1;
}>;

const validator = new Ajv2020({ allErrors: true, strict: true }).compile(
  connectorSchema,
);

function serializedBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REQUEST_INVALID",
      "GitHub deployment connector request is invalid.",
    );
  }
}

function parseRequestV1<T>(value: unknown, contractType: string): T {
  if (
    serializedBytes(value) > GITHUB_DEPLOYMENT_CONNECTOR_LIMITS_V1.requestBytes ||
    !validator(value) ||
    (value as { contractType?: unknown } | null)?.contractType !== contractType
  )
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REQUEST_INVALID",
      "GitHub deployment connector request is invalid.",
      serializedBytes(value) > GITHUB_DEPLOYMENT_CONNECTOR_LIMITS_V1.requestBytes
        ? 413
        : 400,
    );
  return Object.freeze(structuredClone(value)) as T;
}

export function parseGitHubDeploymentConnectorPreviewRequestV1(
  value: unknown,
): GitHubDeploymentConnectorPreviewRequestV1 {
  return parseRequestV1(
    value,
    "GitHubDeploymentConnectorPreviewRequestV1",
  );
}

export function parseGitHubDeploymentConnectorExecuteRequestV1(
  value: unknown,
): GitHubDeploymentConnectorExecuteRequestV1 {
  return parseRequestV1(
    value,
    "GitHubDeploymentConnectorExecuteRequestV1",
  );
}

function parsePreviewV1(value: unknown): GitHubDeploymentConnectorPreviewV1 {
  if (
    !validator(value) ||
    (value as { contractType?: unknown } | null)?.contractType !==
      "GitHubDeploymentConnectorPreviewV1"
  )
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_INVALID",
      "GitHub deployment connector produced an invalid preview.",
      500,
    );
  return Object.freeze(structuredClone(value)) as GitHubDeploymentConnectorPreviewV1;
}

type FetchV1 = (input: string, init?: RequestInit) => Promise<Response>;
type ConnectorAuthorityV1 = Readonly<{
  getChangeDetails(projectId: string, changeId: string): Promise<Readonly<Record<string, unknown>>>;
  getOperationalOutcomeProjectionV1(
    projectId: string,
    changeId: string,
  ): Promise<OperationalOutcomeProjectionV1>;
  previewOperationalOutcomeImportV1(value: unknown): Promise<OperationalOutcomePreviewV1>;
  executeOperationalOutcomeImportV1(value: unknown): Promise<OperationalOutcomeMutationReceiptV1>;
}>;

type RemoteBudgetV1 = { remaining: number };
type RemoteRecordV1 = Record<string, unknown>;

function remoteRecord(value: unknown): RemoteRecordV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_INVALID",
      "GitHub returned an invalid bounded response.",
      502,
    );
  return value as RemoteRecordV1;
}

function boundedHeaderInteger(value: string | null, maximum: number) {
  if (!value || !/^[0-9]{1,12}$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= maximum
    ? parsed
    : undefined;
}

function rateLimitError(response: Response) {
  const retryAfterSeconds = boundedHeaderInteger(
    response.headers.get("retry-after"),
    86_400,
  );
  const reset = boundedHeaderInteger(
    response.headers.get("x-ratelimit-reset"),
    9_999_999_999,
  );
  const rateLimitResetAt = reset === undefined
    ? undefined
    : new Date(reset * 1000).toISOString();
  return new GitHubDeploymentConnectorErrorV1(
    "CONNECTOR_REMOTE_RATE_LIMITED",
    "GitHub deployment connector is rate limited.",
    429,
    retryAfterSeconds,
    rateLimitResetAt,
  );
}

async function readBoundedJsonV1(
  response: Response,
  budget: RemoteBudgetV1,
  controller: AbortController,
): Promise<unknown> {
  const declared = boundedHeaderInteger(
    response.headers.get("content-length"),
    Number.MAX_SAFE_INTEGER,
  );
  if (
    declared !== undefined &&
    (declared > GITHUB_DEPLOYMENT_CONNECTOR_LIMITS_V1.responseBytes ||
      declared > budget.remaining)
  ) {
    controller.abort();
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_TOO_LARGE",
      "GitHub response exceeded the connector limit.",
      413,
    );
  }
  if (!response.body)
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_INVALID",
      "GitHub returned an empty response.",
      502,
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (
      bytes > GITHUB_DEPLOYMENT_CONNECTOR_LIMITS_V1.responseBytes ||
      bytes > budget.remaining
    ) {
      controller.abort();
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_TOO_LARGE",
        "GitHub response exceeded the connector limit.",
        413,
      );
    }
    chunks.push(value);
  }
  budget.remaining -= bytes;
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(combined));
  } catch {
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_INVALID",
      "GitHub returned invalid UTF-8 JSON.",
      502,
    );
  }
}

async function fetchRemoteJsonV1(
  fetcher: FetchV1,
  config: GitHubDeploymentConnectorConfigV1,
  path: string,
  budget: RemoteBudgetV1,
): Promise<unknown> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GITHUB_DEPLOYMENT_CONNECTOR_LIMITS_V1.timeoutMs);
  timer.unref?.();
  try {
    const response = await fetcher(`${config.apiOrigin}${path}`, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${config.token}`,
        "x-github-api-version": config.apiVersion,
      },
    });
    if (
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("retry-after") !== null ||
          response.headers.get("x-ratelimit-remaining") === "0"))
    )
      throw rateLimitError(response);
    if (response.status === 401 || response.status === 403)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_UNAUTHORIZED",
        "GitHub deployment connector authorization failed.",
        502,
      );
    if (response.status === 404)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_NOT_FOUND",
        "GitHub deployment evidence was not found.",
        404,
      );
    if (!response.ok)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_UNAVAILABLE",
        "GitHub deployment connector is unavailable.",
        503,
      );
    return await readBoundedJsonV1(response, budget, controller);
  } catch (error) {
    if (error instanceof GitHubDeploymentConnectorErrorV1) throw error;
    if (
      timedOut ||
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_TIMEOUT",
        "GitHub deployment connector timed out.",
        504,
      );
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_UNAVAILABLE",
      "GitHub deployment connector is unavailable.",
      503,
    );
  } finally {
    clearTimeout(timer);
  }
}

function exactRemoteId(value: unknown, expected: string) {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? String(value)
      : typeof value === "string" && DECIMAL_ID.test(value)
        ? value
        : undefined;
  if (normalized !== expected)
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
      "GitHub deployment identity did not match.",
      409,
    );
  return normalized;
}

function exactGitObject(value: unknown) {
  if (typeof value !== "string" || !GIT_OBJECT_ID.test(value))
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_INVALID",
      "GitHub returned an invalid Git object identity.",
      502,
    );
  return value;
}

function canonicalTimestamp(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_INVALID",
      "GitHub returned an invalid timestamp.",
      502,
    );
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed))
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_INVALID",
      "GitHub returned an invalid timestamp.",
      502,
    );
  return new Date(parsed).toISOString();
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

type RemoteSnapshotV1 = Readonly<{
  observation: DeploymentObservationV1;
  summary: GitHubDeploymentObservationSummaryV1;
  remoteSnapshotHash: string;
}>;

async function fetchSnapshotV1(
  fetcher: FetchV1,
  config: GitHubDeploymentConnectorConfigV1,
  request: BaseRequestV1,
  targetCommitSha: string,
  targetTreeSha: string,
): Promise<RemoteSnapshotV1> {
  const owner = encodeURIComponent(config.owner);
  const repository = encodeURIComponent(config.repository);
  const root = `/repos/${owner}/${repository}`;
  const expectedRepositoryUrl = `${config.apiOrigin}${root}`;
  const expectedDeploymentUrl = `${expectedRepositoryUrl}/deployments/${request.deploymentId}`;
  const budget = { remaining: GITHUB_DEPLOYMENT_CONNECTOR_LIMITS_V1.totalResponseBytes };
  const deployment = remoteRecord(await fetchRemoteJsonV1(
    fetcher,
    config,
    `${root}/deployments/${request.deploymentId}`,
    budget,
  ));
  exactRemoteId(deployment.id, request.deploymentId);
  if (deployment.repository_url !== expectedRepositoryUrl)
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
      "GitHub repository identity did not match.",
      409,
    );
  const status = remoteRecord(await fetchRemoteJsonV1(
    fetcher,
    config,
    `${root}/deployments/${request.deploymentId}/statuses/${request.deploymentStatusId}`,
    budget,
  ));
  exactRemoteId(status.id, request.deploymentStatusId);
  if (
    status.repository_url !== expectedRepositoryUrl ||
    status.deployment_url !== expectedDeploymentUrl
  )
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
      "GitHub deployment status identity did not match.",
      409,
    );
  const commitSha = exactGitObject(deployment.sha);
  const commit = remoteRecord(await fetchRemoteJsonV1(
    fetcher,
    config,
    `${root}/git/commits/${commitSha}`,
    budget,
  ));
  if (exactGitObject(commit.sha) !== commitSha)
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
      "GitHub commit identity did not match.",
      409,
    );
  const tree = remoteRecord(commit.tree);
  const treeSha = exactGitObject(tree.sha);
  if (commitSha !== targetCommitSha || treeSha !== targetTreeSha)
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
      "GitHub deployment target did not match the selected change.",
      409,
    );
  if (
    deployment.production_environment !== true ||
    deployment.environment !== config.productionEnvironment ||
    status.environment !== config.productionEnvironment
  )
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
      "GitHub production environment identity did not match.",
      409,
    );
  const state = status.state;
  const outcome = state === "success"
    ? "succeeded"
    : state === "failure" || state === "error"
      ? "failed"
      : undefined;
  if (!outcome)
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_STATE_UNSUPPORTED",
      "GitHub deployment status is not a supported terminal state.",
      409,
    );
  const occurredAt = canonicalTimestamp(status.created_at);
  const sourceRecordId =
    `ghd:${config.repositoryFingerprint.slice(0, 16)}:${request.deploymentId}:${request.deploymentStatusId}`;
  const observationId =
    `ghdo:${sha256(`${request.sourceId}\0${sourceRecordId}`).slice(0, 32)}`;
  const evidenceRefs = Object.freeze([
    `github-repository:${config.repositoryFingerprint}`,
    `github-deployment:${request.deploymentId}`,
    `github-deployment-status:${request.deploymentStatusId}`,
    `github-commit:${commitSha}`,
  ]);
  const observation: DeploymentObservationV1 = Object.freeze({
    contractType: "DeploymentObservationV1",
    contractVersion: "1.0",
    observationId,
    sourceRecordId,
    occurredAt,
    evidenceRefs,
    changeId: request.changeId,
    commitSha,
    treeSha,
    environmentClass: "production",
    outcome,
  });
  const snapshot = {
    adapterVersion: GITHUB_DEPLOYMENT_CONNECTOR_VERSION_V1,
    apiVersion: config.apiVersion,
    repositoryFingerprint: config.repositoryFingerprint,
    deploymentId: request.deploymentId,
    deploymentStatusId: request.deploymentStatusId,
    deploymentSha: commitSha,
    deploymentEnvironment: config.productionEnvironment,
    productionEnvironment: true,
    statusState: state,
    statusCreatedAt: occurredAt,
    commitSha,
    treeSha,
  };
  const summary: GitHubDeploymentObservationSummaryV1 = Object.freeze({
    observationId,
    sourceRecordId,
    deploymentId: request.deploymentId,
    deploymentStatusId: request.deploymentStatusId,
    occurredAt,
    commitSha,
    treeSha,
    environmentClass: "production",
    outcome,
    evidenceRefs,
  });
  return Object.freeze({
    observation,
    summary,
    remoteSnapshotHash: sha256(canonicalJson(snapshot)),
  });
}

function exactTargetDetails(details: Readonly<Record<string, unknown>>) {
  const targetCommitSha = details.targetCommitSha;
  const targetTreeSha = details.targetTreeSha;
  if (
    typeof targetCommitSha !== "string" ||
    typeof targetTreeSha !== "string" ||
    !GIT_OBJECT_ID.test(targetCommitSha) ||
    !GIT_OBJECT_ID.test(targetTreeSha)
  )
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
      "Selected change lacks exact deployment target identities.",
      409,
    );
  return { targetCommitSha, targetTreeSha };
}

function assertWatermark(
  observed: OperationalWatermarkV1,
  current: OperationalWatermarkV1,
) {
  if (observed.sequence !== current.sequence || observed.hash !== current.hash)
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_PROJECT_WATERMARK_CHANGED",
      "Project watermark changed before connector preview.",
      409,
    );
}

function assertSource(
  config: GitHubDeploymentConnectorConfigV1,
  request: BaseRequestV1,
  projection: OperationalOutcomeProjectionV1,
) {
  const source = projection.sources.find((item) => item.sourceId === request.sourceId);
  if (
    request.sourceId !== config.sourceId ||
    !source ||
    source.status !== "active" ||
    source.family !== "deployment" ||
    source.sourceSystem !== "github-deployments" ||
    source.formatVersion !== GITHUB_DEPLOYMENT_CONNECTOR_VERSION_V1 ||
    !source.allowedKinds.includes("deployment")
  )
    throw new GitHubDeploymentConnectorErrorV1(
      "CONNECTOR_SOURCE_INVALID",
      "Configured GitHub deployment source is unavailable.",
      409,
    );
}

function phase10Reason(reasonCodes: readonly string[]): ConnectorPreviewReasonCodeV1[] {
  return [...new Set(reasonCodes.map((reason): ConnectorPreviewReasonCodeV1 => {
    if (reason === "OUTCOME_PROJECT_WATERMARK_CHANGED")
      return "CONNECTOR_PROJECT_WATERMARK_CHANGED";
    if (reason.startsWith("OUTCOME_SOURCE_")) return "CONNECTOR_SOURCE_INVALID";
    if (reason.startsWith("OUTCOME_IDENTITY_"))
      return "CONNECTOR_REMOTE_IDENTITY_MISMATCH";
    return "CONNECTOR_PHASE10_REJECTED";
  }))];
}

function mapPhase10Error(error: unknown): never {
  if (error instanceof OperationalOutcomeErrorV1) {
    const reason = phase10Reason([error.reasonCode])[0];
    throw new GitHubDeploymentConnectorErrorV1(
      reason,
      "Phase 10 rejected the GitHub deployment observation.",
      error.status,
    );
  }
  throw new GitHubDeploymentConnectorErrorV1(
    "CONNECTOR_RESULT_AMBIGUOUS",
    "GitHub deployment import result is ambiguous.",
    503,
  );
}

export class GitHubDeploymentConnectorServiceV1 {
  constructor(
    private readonly config: GitHubDeploymentConnectorConfigV1 | undefined,
    private readonly authority: ConnectorAuthorityV1,
    private readonly fetcher: FetchV1 = fetch,
  ) {}

  private configuration() {
    if (!this.config)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_NOT_CONFIGURED",
        "GitHub deployment connector is not configured.",
        503,
      );
    return this.config;
  }

  private configured() {
    const config = this.configuration();
    if (!config.token)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_SECRET_UNAVAILABLE",
        "GitHub deployment connector secret is unavailable.",
        503,
      );
    return config;
  }

  private async preflight(request: BaseRequestV1) {
    const config = this.configured();
    let projection: OperationalOutcomeProjectionV1;
    let details: Readonly<Record<string, unknown>>;
    try {
      projection = await this.authority.getOperationalOutcomeProjectionV1(
        request.projectId,
        request.changeId,
      );
      details = await this.authority.getChangeDetails(
        request.projectId,
        request.changeId,
      );
    } catch {
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
        "Selected change evidence is unavailable.",
        409,
      );
    }
    assertWatermark(request.observedProject, projection.watermark);
    assertSource(config, request, projection);
    return { config, projection, ...exactTargetDetails(details) };
  }

  private importRequest(
    request: BaseRequestV1,
    observation: DeploymentObservationV1,
    confirm: boolean,
  ): OperationalOutcomeImportRequestV1 {
    return {
      contractType: "OperationalOutcomeImportRequestV1",
      contractVersion: "1.0",
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      projectId: request.projectId,
      changeId: request.changeId,
      actor: request.actor,
      observedProject: { ...request.observedProject },
      sourceId: request.sourceId,
      observations: [observation],
      confirm,
    };
  }

  async preview(value: unknown): Promise<GitHubDeploymentConnectorPreviewV1> {
    const request = parseGitHubDeploymentConnectorPreviewRequestV1(value);
    const { config, targetCommitSha, targetTreeSha } = await this.preflight(request);
    const snapshot = await fetchSnapshotV1(
      this.fetcher,
      config,
      request,
      targetCommitSha,
      targetTreeSha,
    );
    let preview: OperationalOutcomePreviewV1;
    try {
      preview = await this.authority.previewOperationalOutcomeImportV1(
        this.importRequest(request, snapshot.observation, false),
      );
    } catch (error) {
      return mapPhase10Error(error);
    }
    return parsePreviewV1({
      contractType: "GitHubDeploymentConnectorPreviewV1",
      contractVersion: "1.0",
      requestId: request.requestId,
      allowed: preview.allowed,
      reasonCodes: phase10Reason(preview.reasonCodes),
      remoteSnapshotHash: snapshot.remoteSnapshotHash,
      contentHash: preview.contentHash,
      sourceWatermark: preview.sourceWatermark,
      observationCount: 1,
      wouldMutate: false,
      observation: snapshot.summary,
    });
  }

  async execute(value: unknown): Promise<OperationalOutcomeMutationReceiptV1> {
    const request = parseGitHubDeploymentConnectorExecuteRequestV1(value);
    const config = this.configuration();
    if (request.sourceId !== config.sourceId)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_SOURCE_INVALID",
        "Configured GitHub deployment source is unavailable.",
        409,
      );
    let current: OperationalOutcomeProjectionV1;
    try {
      current = await this.authority.getOperationalOutcomeProjectionV1(
        request.projectId,
        request.changeId,
      );
    } catch {
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
        "Selected change evidence is unavailable.",
        409,
      );
    }
    const exactReceipt = current.receipts.find(
      (receipt) =>
        receipt.requestId === request.requestId &&
        receipt.idempotencyKey === request.idempotencyKey &&
        receipt.contentHash === request.contentHash &&
        receipt.actor === request.actor &&
        receipt.operationKind === "import-observations",
    );
    if (exactReceipt) return exactReceipt;
    if (current.receipts.some(
      (receipt) =>
        receipt.requestId === request.requestId ||
        receipt.idempotencyKey === request.idempotencyKey,
    ))
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_PHASE10_REJECTED",
        "Phase 10 receipt identity conflicts with this request.",
        409,
      );
    if (!config.token)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_SECRET_UNAVAILABLE",
        "GitHub deployment connector secret is unavailable.",
        503,
      );
    assertSource(config, request, current);
    assertWatermark(request.observedProject, current.watermark);
    let details: Readonly<Record<string, unknown>>;
    try {
      details = await this.authority.getChangeDetails(request.projectId, request.changeId);
    } catch {
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_IDENTITY_MISMATCH",
        "Selected change evidence is unavailable.",
        409,
      );
    }
    const targets = exactTargetDetails(details);
    const snapshot = await fetchSnapshotV1(
      this.fetcher,
      config,
      request,
      targets.targetCommitSha,
      targets.targetTreeSha,
    );
    if (snapshot.remoteSnapshotHash !== request.remoteSnapshotHash)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_SNAPSHOT_CHANGED",
        "GitHub deployment snapshot changed after preview.",
        409,
      );
    const importRequest = this.importRequest(request, snapshot.observation, true);
    let preview: OperationalOutcomePreviewV1;
    try {
      preview = await this.authority.previewOperationalOutcomeImportV1(importRequest);
    } catch (error) {
      return mapPhase10Error(error);
    }
    if (preview.contentHash !== request.contentHash)
      throw new GitHubDeploymentConnectorErrorV1(
        "CONNECTOR_REMOTE_SNAPSHOT_CHANGED",
        "Generated Phase 10 content changed after preview.",
        409,
      );
    if (!preview.allowed)
      throw new GitHubDeploymentConnectorErrorV1(
        phase10Reason(preview.reasonCodes)[0] ?? "CONNECTOR_PHASE10_REJECTED",
        "Phase 10 rejected the GitHub deployment observation.",
        409,
      );
    try {
      return await this.authority.executeOperationalOutcomeImportV1(importRequest);
    } catch (error) {
      return mapPhase10Error(error);
    }
  }
}
