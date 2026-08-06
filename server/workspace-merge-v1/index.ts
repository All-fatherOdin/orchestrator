import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  assertMergeReceiptV1,
  assertMergeRequestV1,
  assertWorkspaceAttemptV1,
  type MergeLeaseV1,
  type MergeReceiptV1,
  type MergeRequestV1,
  type MergeStateV1,
  type PlanReferenceV1,
  type WorkspaceAttemptStateV1,
  type WorkspaceAttemptV1,
} from "../change-control-v1/index.ts";

export type WorkspaceAttemptTransitionEventV1 = Readonly<{
  contractType: "WorkspaceAttemptTransitionEventV1";
  contractVersion: "1.0";
  eventId: string;
  sequence: number;
  workspaceAttemptId: string;
  previousState: WorkspaceAttemptStateV1 | null;
  state: WorkspaceAttemptStateV1;
  attempt: WorkspaceAttemptV1;
  previousHash: string | null;
  hash: string;
}>;

export type WorkspaceMutationAuthorityV1 = Readonly<{
  workspaceAttemptId: string;
  revision: number;
  headSha: string;
  leaseEpoch: number;
}>;

export type WorkspaceMutationAuthorityEventV1 = Readonly<{
  contractType: "WorkspaceMutationAuthorityEventV1";
  contractVersion: "1.0";
  eventId: string;
  sequence: number;
  workspaceAttemptId: string;
  previous: WorkspaceMutationAuthorityV1 | null;
  authority: WorkspaceMutationAuthorityV1;
  reason: "provisioned" | "command" | "checkpoint" | "lease_takeover";
  previousHash: string | null;
  hash: string;
}>;

export type WorkspaceRunRecordV1 = Record<string, unknown> & {
  workspaceAttempts?: WorkspaceAttemptV1[];
  workspaceAttemptEvents?: WorkspaceAttemptTransitionEventV1[];
  workspaceMutationAuthorities?: WorkspaceMutationAuthorityV1[];
  workspaceMutationAuthorityEvents?: WorkspaceMutationAuthorityEventV1[];
  mergeRequests?: MergeRequestV1[];
  mergeRequestEvents?: MergeRequestTransitionEventV1[];
  mergeReceipts?: MergeReceiptV1[];
};

export type MergeRequestTransitionEventV1 = Readonly<{
  contractType: "MergeRequestTransitionEventV1";
  contractVersion: "1.0";
  eventId: string;
  sequence: number;
  mergeRequestId: string;
  previousState: MergeStateV1 | null;
  state: MergeStateV1;
  request: MergeRequestV1;
  previousHash: string | null;
  hash: string;
}>;

export type MergeBoundaryV1 =
  | "queued_persisted"
  | "lease_persisted"
  | "validated_persisted"
  | "merge_applied"
  | "verifying_persisted"
  | "verification_completed"
  | "merge_commit_created"
  | "receipt_persisted"
  | "lease_released";

export type TargetLeaseMutexBoundaryV1 =
  | "dead_owner_observed"
  | "acquired";

export type MergeReplanEvidenceV1 = Readonly<{
  driftAssessmentId: string;
  mergeRequestId: string;
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  plan: PlanReferenceV1;
  expectedTargetSha: string;
  observedTargetSha: string;
  sourceSha: string;
  requiresArchitectReplan: true;
  requiresFreshHumanAuthorization: true;
}>;

export type MergeReplanRecordV1 = Readonly<{
  driftAssessmentId: string;
  evidenceRefs: readonly string[];
}>;

export type ExecuteMergeRequestInputV1 = Readonly<{
  statePath: string;
  repositoryPath: string;
  workspaceAttemptId: string;
  plan: PlanReferenceV1;
  verificationCommands: readonly string[];
  replanOnly?: boolean;
  transitionedBy?: string;
  onTargetLeaseMutexBoundary?: (
    boundary: TargetLeaseMutexBoundaryV1,
    owner: Readonly<{ pid: number; token: string }>,
  ) => void | Promise<void>;
  onReplanRequired?: (
    evidence: MergeReplanEvidenceV1,
  ) =>
    | string
    | MergeReplanRecordV1
    | void
    | Promise<string | MergeReplanRecordV1 | void>;
  onPersistedBoundary?: (
    boundary: MergeBoundaryV1,
  ) => void | Promise<void>;
}>;

export type ProvisionWorkspaceAttemptInputV1 = Readonly<{
  statePath: string;
  repositoryPath: string;
  ownedRoot: string;
  workspacePath: string;
  projectId: string;
  repositoryId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  runId: string;
  attemptId: string;
  plan: PlanReferenceV1;
  targetRef: string;
  baseSha: string;
  cleanupMaxAttempts?: number;
  transitionedBy?: string;
  onPersistedBoundary?: (
    boundary:
      | "provisioning_persisted"
      | "worktree_added"
      | "ownership_marker_persisted"
      | "provisioning_authority_persisted",
  ) => void | Promise<void>;
}>;

export type WorkspaceCheckpointBoundaryV1 =
  | "checkpoint_staged"
  | "checkpoint_committed"
  | "checkpoint_authority_persisted";

export type WorkspaceExecutionBoundaryV1 = "executor_returned";
export type WorkspaceSealBoundaryV1 = "sealed_persisted";
export type WorkspaceCleanupBoundaryV1 = "cleanup_worktree_removed";

export type WorkspaceCommandV1 = Readonly<{
  executable: string;
  args?: readonly string[];
  timeoutMs?: number;
}>;

export type WorkspaceCommandResultV1 = Readonly<{
  exitCode: number;
  timedOut: boolean;
  output: string;
  cwd: string;
}>;

export class WorkspaceLifecycleErrorV1 extends Error {
  constructor(
    readonly code:
      | "invalid_state"
      | "capability"
      | "identity"
      | "collision"
      | "containment"
      | "lease"
      | "ownership"
      | "dirty"
      | "command"
      | "quarantined",
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceLifecycleErrorV1";
  }
}

const allowedTransitions = new Map<WorkspaceAttemptStateV1 | null, Set<WorkspaceAttemptStateV1>>([
  [null, new Set(["provisioning"])],
  ["provisioning", new Set(["active", "recovery_pending", "quarantined"])],
  ["active", new Set(["sealed", "cleanup_pending", "recovery_pending", "quarantined"])],
  ["sealed", new Set(["merge_queued", "replan_required", "cleanup_pending", "recovery_pending", "quarantined"])],
  ["merge_queued", new Set(["merged", "replan_required", "recovery_pending", "quarantined"])],
  ["merged", new Set(["cleanup_pending", "cleaned", "recovery_pending", "quarantined"])],
  ["replan_required", new Set(["cleanup_pending", "recovery_pending", "quarantined"])],
  ["cleanup_pending", new Set(["cleaned", "recovery_pending", "quarantined"])],
  ["recovery_pending", new Set(["active", "sealed", "merge_queued", "merged", "replan_required", "cleanup_pending", "cleaned", "quarantined"])],
  ["cleaned", new Set()],
  ["quarantined", new Set()],
]);
const allowedMergeTransitions = new Map<
  MergeStateV1 | null,
  Set<MergeStateV1>
>([
  [null, new Set(["queued"])],
  ["queued", new Set(["validating", "replan_required", "recovery_pending", "quarantined"])],
  ["validating", new Set(["applying", "replan_required", "recovery_pending", "quarantined"])],
  ["applying", new Set(["verifying", "replan_required", "recovery_pending", "quarantined"])],
  ["verifying", new Set(["committed", "replan_required", "recovery_pending", "quarantined"])],
  ["committed", new Set()],
  ["replan_required", new Set()],
  ["recovery_pending", new Set(["queued", "validating", "applying", "verifying", "committed", "replan_required", "quarantined"])],
  ["quarantined", new Set()],
]);
const stateWriteChains = new Map<string, Promise<void>>();

export function serializeWorkspaceRunStateV1<T>(
  statePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = normalizedPath(statePath);
  const previous = stateWriteChains.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  const settled = next.then(() => undefined, () => undefined);
  stateWriteChains.set(key, settled);
  void settled.finally(() => {
    if (stateWriteChains.get(key) === settled) stateWriteChains.delete(key);
  }).catch(() => undefined);
  return next;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedPath(path: string): string {
  const result = resolve(path).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? result.toLowerCase() : result;
}

export function workspacePathContainedV1(root: string, candidate: string): boolean {
  const normalizedRoot = normalizedPath(root);
  const normalizedCandidate = normalizedPath(candidate);
  return (
    normalizedCandidate === normalizedRoot ||
    normalizedCandidate.startsWith(`${normalizedRoot}${process.platform === "win32" ? "\\" : "/"}`)
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function assertNoReparseEscape(root: string, candidate: string): Promise<void> {
  if (!isAbsolute(root) || !isAbsolute(candidate) || !workspacePathContainedV1(root, candidate))
    throw new WorkspaceLifecycleErrorV1("containment", "Workspace path is outside the owned root.");
  const canonicalRoot = await realpath(root);
  let cursor = resolve(candidate);
  while (!(await pathExists(cursor))) {
    const parent = dirname(cursor);
    if (parent === cursor)
      throw new WorkspaceLifecycleErrorV1("containment", "Workspace parent cannot be resolved.");
    cursor = parent;
  }
  const existing = await lstat(cursor);
  if (existing.isSymbolicLink())
    throw new WorkspaceLifecycleErrorV1("containment", "Workspace path crosses a symbolic link or junction.");
  const canonicalExisting = await realpath(cursor);
  if (!workspacePathContainedV1(canonicalRoot, canonicalExisting))
    throw new WorkspaceLifecycleErrorV1("containment", "Workspace path resolves outside the owned root.");
  const suffix = relative(cursor, resolve(candidate));
  let current = canonicalExisting;
  for (const component of suffix.split(/[\\/]/).filter(Boolean)) {
    current = join(current, component);
    if (await pathExists(current)) {
      const item = await lstat(current);
      if (item.isSymbolicLink())
        throw new WorkspaceLifecycleErrorV1("containment", "Workspace path crosses a symbolic link or junction.");
      const canonical = await realpath(current);
      if (!workspacePathContainedV1(canonicalRoot, canonical))
        throw new WorkspaceLifecycleErrorV1("containment", "Workspace reparse target escapes the owned root.");
    }
  }
}

async function runProcess(
  executable: string,
  args: readonly string[],
  cwd: string,
  timeoutMs = 120_000,
): Promise<WorkspaceCommandResultV1> {
  return new Promise((done) => {
    let output = "";
    let timedOut = false;
    const child = spawn(executable, [...args], {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const consume = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-64_000);
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      done({ exitCode: 1, timedOut, output: error.message, cwd });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      done({ exitCode: code ?? 1, timedOut, output: output.trim(), cwd });
    });
  });
}

async function git(cwd: string, args: readonly string[]) {
  return runProcess(
    "git",
    process.platform === "win32"
      ? ["-c", "core.longpaths=true", ...args]
      : args,
    cwd,
  );
}

async function gitValue(cwd: string, args: readonly string[], label: string) {
  const result = await git(cwd, args);
  if (result.exitCode !== 0 || !result.output)
    throw new WorkspaceLifecycleErrorV1("identity", `${label}: ${result.output || "Git returned no value."}`);
  return result.output.trim();
}

async function writeJsonAtomically(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  await rename(temporary, path);
}

async function readRunRecord(path: string): Promise<WorkspaceRunRecordV1> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("run record is not an object");
    return value as WorkspaceRunRecordV1;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new WorkspaceLifecycleErrorV1("invalid_state", `Cannot read canonical run state: ${String(error)}`);
  }
}

function eventHash(event: Omit<WorkspaceAttemptTransitionEventV1, "hash">) {
  return sha256(canonicalJson(event));
}

function authorityEventHash(
  event: Omit<WorkspaceMutationAuthorityEventV1, "hash">,
) {
  return sha256(canonicalJson(event));
}

function mergeEventHash(
  event: Omit<MergeRequestTransitionEventV1, "hash">,
) {
  return sha256(canonicalJson(event));
}

export function replayMergeRequestEventsV1(
  events: readonly MergeRequestTransitionEventV1[],
): Map<string, MergeRequestV1> {
  const requests = new Map<string, MergeRequestV1>();
  let previousHash: string | null = null;
  events.forEach((event, index) => {
    if (
      event.contractType !== "MergeRequestTransitionEventV1" ||
      event.contractVersion !== "1.0" ||
      event.sequence !== index + 1 ||
      event.previousHash !== previousHash
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Invalid merge event envelope at sequence ${index + 1}.`,
      );
    const { hash, ...unsigned } = event;
    if (mergeEventHash(unsigned) !== hash)
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Merge event hash mismatch at sequence ${event.sequence}.`,
      );
    assertMergeRequestV1(event.request);
    const current = requests.get(event.mergeRequestId);
    if (
      event.mergeRequestId !== event.request.mergeRequestId ||
      event.previousState !== event.request.previousState ||
      event.state !== event.request.state ||
      (current?.state ?? null) !== event.previousState ||
      !allowedMergeTransitions.get(event.previousState)?.has(event.state)
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Invalid merge transition at sequence ${event.sequence}.`,
      );
    requests.set(event.mergeRequestId, event.request);
    previousHash = event.hash;
  });
  return requests;
}

export function replayWorkspaceAttemptEventsV1(
  events: readonly WorkspaceAttemptTransitionEventV1[],
): Map<string, WorkspaceAttemptV1> {
  const attempts = new Map<string, WorkspaceAttemptV1>();
  let previousHash: string | null = null;
  events.forEach((event, index) => {
    if (
      event.contractType !== "WorkspaceAttemptTransitionEventV1" ||
      event.contractVersion !== "1.0" ||
      event.sequence !== index + 1 ||
      event.previousHash !== previousHash
    )
      throw new WorkspaceLifecycleErrorV1("invalid_state", `Invalid workspace event envelope at sequence ${index + 1}.`);
    const { hash, ...unsigned } = event;
    if (eventHash(unsigned) !== hash)
      throw new WorkspaceLifecycleErrorV1("invalid_state", `Workspace event hash mismatch at sequence ${event.sequence}.`);
    assertWorkspaceAttemptV1(event.attempt);
    if (
      event.workspaceAttemptId !== event.attempt.workspaceAttemptId ||
      event.previousState !== event.attempt.previousState ||
      event.state !== event.attempt.state
    )
      throw new WorkspaceLifecycleErrorV1("invalid_state", `Conflicting workspace event at sequence ${event.sequence}.`);
    const current = attempts.get(event.workspaceAttemptId);
    const actualPrevious = current?.state ?? null;
    if (
      actualPrevious !== event.previousState ||
      !allowedTransitions.get(actualPrevious)?.has(event.state)
    )
      throw new WorkspaceLifecycleErrorV1("invalid_state", `Invalid workspace transition at sequence ${event.sequence}.`);
    attempts.set(event.workspaceAttemptId, event.attempt);
    previousHash = hash;
  });
  return attempts;
}

export function replayWorkspaceMutationAuthorityEventsV1(
  events: readonly WorkspaceMutationAuthorityEventV1[],
): Map<string, WorkspaceMutationAuthorityV1> {
  const authorities = new Map<string, WorkspaceMutationAuthorityV1>();
  let previousHash: string | null = null;
  events.forEach((event, index) => {
    if (
      event.contractType !== "WorkspaceMutationAuthorityEventV1" ||
      event.contractVersion !== "1.0" ||
      event.sequence !== index + 1 ||
      event.previousHash !== previousHash
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Invalid workspace authority event envelope at sequence ${index + 1}.`,
      );
    const { hash, ...unsigned } = event;
    if (authorityEventHash(unsigned) !== hash)
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Workspace authority event hash mismatch at sequence ${event.sequence}.`,
      );
    const current = authorities.get(event.workspaceAttemptId) ?? null;
    if (
      canonicalJson(current) !== canonicalJson(event.previous) ||
      event.authority.workspaceAttemptId !== event.workspaceAttemptId ||
      event.authority.revision !== (current?.revision ?? 0) + 1 ||
      !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(event.authority.headSha) ||
      !Number.isInteger(event.authority.leaseEpoch) ||
      event.authority.leaseEpoch < 1 ||
      (current && event.authority.leaseEpoch < current.leaseEpoch) ||
      (event.reason === "lease_takeover" &&
        (!current ||
          event.authority.headSha !== current.headSha ||
          event.authority.leaseEpoch !== current.leaseEpoch + 1)) ||
      (event.reason === "checkpoint" &&
        (!current || event.authority.leaseEpoch !== current.leaseEpoch))
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Conflicting workspace mutation authority at sequence ${event.sequence}.`,
      );
    authorities.set(event.workspaceAttemptId, event.authority);
    previousHash = hash;
  });
  return authorities;
}

function validateWorkspaceRecord(record: WorkspaceRunRecordV1) {
  const attempts = replayWorkspaceAttemptEventsV1(
    record.workspaceAttemptEvents ?? [],
  );
  const authorities = replayWorkspaceMutationAuthorityEventsV1(
    record.workspaceMutationAuthorityEvents ?? [],
  );
  const snapshots = record.workspaceAttempts ?? [];
  if (
    snapshots.length !== attempts.size ||
    snapshots.some(
      (snapshot) =>
        canonicalJson(snapshot) !==
        canonicalJson(attempts.get(snapshot.workspaceAttemptId)),
    )
  )
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Workspace attempt snapshot conflicts with immutable replay.",
    );
  const authoritySnapshots = record.workspaceMutationAuthorities ?? [];
  if (
    authoritySnapshots.length !== authorities.size ||
    authoritySnapshots.some(
      (snapshot) =>
        canonicalJson(snapshot) !==
        canonicalJson(authorities.get(snapshot.workspaceAttemptId)),
    )
  )
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Workspace mutation authority snapshot conflicts with immutable replay.",
    );
  for (const attempt of attempts.values()) {
    const authority = authorities.get(attempt.workspaceAttemptId);
    if (
      attempt.state !== "provisioning" &&
      attempt.state !== "quarantined" &&
      !authority
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Workspace attempt ${attempt.workspaceAttemptId} has no canonical mutation authority.`,
      );
  }
  const requests = replayMergeRequestEventsV1(
    record.mergeRequestEvents ?? [],
  );
  const requestSnapshots = record.mergeRequests ?? [];
  if (
    requestSnapshots.length !== requests.size ||
    requestSnapshots.some(
      (snapshot) =>
        canonicalJson(snapshot) !==
        canonicalJson(requests.get(snapshot.mergeRequestId)),
    )
  )
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Merge request snapshot conflicts with immutable replay.",
    );
  const receipts = record.mergeReceipts ?? [];
  const receiptIds = new Set<string>();
  const requestReceiptIds = new Set<string>();
  for (const receipt of receipts) {
    assertMergeReceiptV1(receipt);
    const request = requests.get(receipt.mergeRequestId);
    const terminalEvents = (record.mergeRequestEvents ?? []).filter(
      (event) => event.eventId === receipt.transitionEventRef,
    );
    const terminalEvent = terminalEvents[0];
    const expectedResult =
      request?.state === "committed"
        ? "merged"
        : request?.state === "replan_required" ||
            request?.state === "recovery_pending" ||
            request?.state === "quarantined"
          ? request.state
          : undefined;
    let canonicalReceipt: MergeReceiptV1 | undefined;
    if (request && terminalEvent && expectedResult)
      canonicalReceipt = canonicalTerminalReceipt(
        request,
        expectedResult,
        terminalEvent.eventId,
      );
    if (
      receiptIds.has(receipt.mergeReceiptId) ||
      requestReceiptIds.has(receipt.mergeRequestId) ||
      !request ||
      terminalEvents.length !== 1 ||
      !terminalEvent ||
      terminalEvent.mergeRequestId !== request.mergeRequestId ||
      canonicalJson(terminalEvent.request) !== canonicalJson(request) ||
      terminalEvent.state !== request.state ||
      expectedResult === undefined ||
      !canonicalReceipt ||
      canonicalJson(receipt) !== canonicalJson(canonicalReceipt)
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        "Immutable merge receipt conflicts with its canonical terminal request event.",
      );
    receiptIds.add(receipt.mergeReceiptId);
    requestReceiptIds.add(receipt.mergeRequestId);
  }
  return { attempts, authorities, requests, receipts };
}

export async function canonicalWorkspaceRunFieldsV1(statePath: string) {
  const record = await readRunRecord(statePath);
  validateWorkspaceRecord(record);
  return {
    workspaceAttempts: structuredClone(record.workspaceAttempts ?? []),
    workspaceAttemptEvents: structuredClone(record.workspaceAttemptEvents ?? []),
    workspaceMutationAuthorities: structuredClone(
      record.workspaceMutationAuthorities ?? [],
    ),
    workspaceMutationAuthorityEvents: structuredClone(
      record.workspaceMutationAuthorityEvents ?? [],
    ),
    mergeRequests: structuredClone(record.mergeRequests ?? []),
    mergeRequestEvents: structuredClone(record.mergeRequestEvents ?? []),
    mergeReceipts: structuredClone(record.mergeReceipts ?? []),
  };
}

function markerPayload(attempt: Pick<WorkspaceAttemptV1, "runId" | "attemptId" | "repositoryId" | "workspacePath" | "branchRef">, nonce: string) {
  return {
    runId: attempt.runId,
    attemptId: attempt.attemptId,
    repositoryId: attempt.repositoryId,
    normalizedWorkspacePath: normalizedPath(attempt.workspacePath),
    branchRef: attempt.branchRef,
    creationNonce: nonce,
  };
}

function markerFor(attempt: Pick<WorkspaceAttemptV1, "runId" | "attemptId" | "repositoryId" | "workspacePath" | "branchRef">, nonce: string) {
  const payload = markerPayload(attempt, nonce);
  return { ...payload, markerSha256: sha256(canonicalJson(payload)) };
}

async function markerPath(workspacePath: string): Promise<string> {
  const gitFile = await readFile(join(workspacePath, ".git"), "utf8");
  const match = /^gitdir:\s*(.+)\s*$/i.exec(gitFile);
  if (!match) throw new WorkspaceLifecycleErrorV1("ownership", "Owned worktree has no private Git directory.");
  const gitDirectory = resolve(workspacePath, match[1]);
  return join(gitDirectory, "orchestrator-owner-v1.json");
}

export async function repositoryIdentityV1(repositoryPath: string) {
  const top = await gitValue(repositoryPath, ["rev-parse", "--show-toplevel"], "Repository root unavailable");
  return sha256(normalizedPath(await realpath(top)));
}

function leasePath(repositoryPath: string, attempt: WorkspaceAttemptV1) {
  return join(repositoryPath, ".git", "orchestrator-attempt-leases", `${sha256(`${attempt.repositoryId}\0${attempt.runId}\0${attempt.attemptId}`)}.json`);
}

async function acquireLease(repositoryPath: string, attempt: WorkspaceAttemptV1) {
  const path = leasePath(repositoryPath, attempt);
  await mkdir(dirname(path), { recursive: true });
  const lease = {
    contractType: "WorkspaceAttemptLeaseV1",
    contractVersion: "1.0",
    repositoryId: attempt.repositoryId,
    runId: attempt.runId,
    attemptId: attempt.attemptId,
    pid: process.pid,
    epoch: 1,
  };
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(JSON.stringify(lease));
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(path, "utf8")) as typeof lease;
    if (
      existing.contractType !== lease.contractType ||
      existing.contractVersion !== lease.contractVersion ||
      existing.repositoryId !== lease.repositoryId ||
      existing.runId !== lease.runId ||
      existing.attemptId !== lease.attemptId ||
      existing.pid !== process.pid
    )
      throw new WorkspaceLifecycleErrorV1("lease", "Workspace attempt lease is owned or malformed.");
  }
  return lease.epoch;
}

async function assertLease(
  repositoryPath: string,
  attempt: WorkspaceAttemptV1,
  expectedEpoch: number,
) {
  const value = JSON.parse(await readFile(leasePath(repositoryPath, attempt), "utf8")) as Record<string, unknown>;
  if (
    value.contractType !== "WorkspaceAttemptLeaseV1" ||
    value.contractVersion !== "1.0" ||
    value.repositoryId !== attempt.repositoryId ||
    value.runId !== attempt.runId ||
    value.attemptId !== attempt.attemptId ||
    value.pid !== process.pid ||
    typeof value.epoch !== "number" ||
    !Number.isInteger(value.epoch) ||
    value.epoch !== expectedEpoch
  )
    throw new WorkspaceLifecycleErrorV1("lease", "Workspace attempt lease no longer matches canonical ownership.");
}

async function appendAuthority(
  statePath: string,
  workspaceAttemptId: string,
  headSha: string,
  leaseEpoch: number,
  reason: WorkspaceMutationAuthorityEventV1["reason"],
) {
  return serializeWorkspaceRunStateV1(statePath, async () => {
    const record = await readRunRecord(statePath);
    const { attempts, authorities } = validateWorkspaceRecord(record);
    if (!attempts.has(workspaceAttemptId))
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        `Workspace attempt ${workspaceAttemptId} does not exist.`,
      );
    const events = record.workspaceMutationAuthorityEvents ?? [];
    const previous = authorities.get(workspaceAttemptId) ?? null;
    const authority: WorkspaceMutationAuthorityV1 = {
      workspaceAttemptId,
      revision: (previous?.revision ?? 0) + 1,
      headSha,
      leaseEpoch,
    };
    const unsigned: Omit<WorkspaceMutationAuthorityEventV1, "hash"> = {
      contractType: "WorkspaceMutationAuthorityEventV1",
      contractVersion: "1.0",
      eventId: `workspace-authority-${randomBytes(12).toString("hex")}`,
      sequence: events.length + 1,
      workspaceAttemptId,
      previous,
      authority,
      reason,
      previousHash: events.at(-1)?.hash ?? null,
    };
    const event = { ...unsigned, hash: authorityEventHash(unsigned) };
    await writeJsonAtomically(statePath, {
      ...record,
      workspaceMutationAuthorities: [
        ...(record.workspaceMutationAuthorities ?? []).filter(
          (candidate) =>
            candidate.workspaceAttemptId !== workspaceAttemptId,
        ),
        authority,
      ],
      workspaceMutationAuthorityEvents: [...events, event],
    });
    return authority;
  });
}

async function transition(
  statePath: string,
  previous: WorkspaceAttemptV1 | undefined,
  next: WorkspaceAttemptV1,
): Promise<WorkspaceAttemptV1> {
  assertWorkspaceAttemptV1(next);
  if (
    (previous?.state ?? null) !== next.previousState ||
    !allowedTransitions.get(next.previousState)?.has(next.state)
  )
    throw new WorkspaceLifecycleErrorV1("invalid_state", `Invalid transition ${String(next.previousState)} -> ${next.state}.`);
  return serializeWorkspaceRunStateV1(statePath, async () => {
    const record = await readRunRecord(statePath);
    const events = record.workspaceAttemptEvents ?? [];
    const replayed = validateWorkspaceRecord(record).attempts;
    const current = replayed.get(next.workspaceAttemptId);
    if ((current?.state ?? null) !== (previous?.state ?? null))
      throw new WorkspaceLifecycleErrorV1("invalid_state", "Canonical workspace state changed concurrently.");
    const unsigned: Omit<WorkspaceAttemptTransitionEventV1, "hash"> = {
      contractType: "WorkspaceAttemptTransitionEventV1",
      contractVersion: "1.0",
      eventId: `workspace-event-${randomBytes(12).toString("hex")}`,
      sequence: events.length + 1,
      workspaceAttemptId: next.workspaceAttemptId,
      previousState: next.previousState,
      state: next.state,
      attempt: next,
      previousHash: events.at(-1)?.hash ?? null,
    };
    const event = { ...unsigned, hash: eventHash(unsigned) };
    const attempts = [...(record.workspaceAttempts ?? []).filter(
      (attempt) => attempt.workspaceAttemptId !== next.workspaceAttemptId,
    ), next];
    await writeJsonAtomically(statePath, {
      ...record,
      workspaceAttempts: attempts,
      workspaceAttemptEvents: [...events, event],
    });
    return next;
  });
}

async function transitionMergeRequest(
  statePath: string,
  previous: MergeRequestV1 | undefined,
  next: MergeRequestV1,
): Promise<MergeRequestV1> {
  assertMergeRequestV1(next);
  if (
    (previous?.state ?? null) !== next.previousState ||
    !allowedMergeTransitions.get(next.previousState)?.has(next.state)
  )
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      `Invalid merge transition ${String(next.previousState)} -> ${next.state}.`,
    );
  return serializeWorkspaceRunStateV1(statePath, async () => {
    const record = await readRunRecord(statePath);
    const events = record.mergeRequestEvents ?? [];
    const current = validateWorkspaceRecord(record).requests.get(
      next.mergeRequestId,
    );
    if ((current?.state ?? null) !== (previous?.state ?? null))
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        "Canonical merge request changed concurrently.",
      );
    const unsigned: Omit<MergeRequestTransitionEventV1, "hash"> = {
      contractType: "MergeRequestTransitionEventV1",
      contractVersion: "1.0",
      eventId: `merge-event-${randomBytes(12).toString("hex")}`,
      sequence: events.length + 1,
      mergeRequestId: next.mergeRequestId,
      previousState: next.previousState,
      state: next.state,
      request: next,
      previousHash: events.at(-1)?.hash ?? null,
    };
    const event = { ...unsigned, hash: mergeEventHash(unsigned) };
    await writeJsonAtomically(statePath, {
      ...record,
      mergeRequests: [
        ...(record.mergeRequests ?? []).filter(
          (request) => request.mergeRequestId !== next.mergeRequestId,
        ),
        next,
      ],
      mergeRequestEvents: [...events, event],
    });
    return next;
  });
}

function evolveMergeRequest(
  request: MergeRequestV1,
  state: MergeStateV1,
  extras: Partial<MergeRequestV1> = {},
): MergeRequestV1 {
  const next = {
    ...request,
    ...extras,
    previousState: request.state,
    state,
    transitionedAt: new Date().toISOString(),
  };
  for (const key of Object.keys(next) as (keyof typeof next)[])
    if (next[key] === undefined) delete next[key];
  return next;
}

async function loadMergeRequest(
  statePath: string,
  mergeRequestId: string,
) {
  const record = await readRunRecord(statePath);
  const request = validateWorkspaceRecord(record).requests.get(mergeRequestId);
  if (!request)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      `Merge request ${mergeRequestId} does not exist.`,
    );
  return request;
}

function evolve(
  attempt: WorkspaceAttemptV1,
  state: WorkspaceAttemptStateV1,
  extras: Partial<WorkspaceAttemptV1> = {},
): WorkspaceAttemptV1 {
  const next = {
    ...attempt,
    ...extras,
    previousState: attempt.state,
    state,
    transitionedAt: new Date().toISOString(),
  };
  for (const key of Object.keys(next) as (keyof typeof next)[])
    if (next[key] === undefined) delete next[key];
  return next;
}

function appendEvidenceRefs(
  existing: readonly string[],
  ...references: readonly string[]
): string[] {
  const evidenceRefs = [...existing];
  const seen = new Set(existing);
  for (const reference of references) {
    if (seen.has(reference)) continue;
    evidenceRefs.push(reference);
    seen.add(reference);
  }
  return evidenceRefs;
}

async function loadAttempt(statePath: string, workspaceAttemptId: string) {
  const record = await readRunRecord(statePath);
  const replayed = validateWorkspaceRecord(record).attempts;
  const attempt = replayed.get(workspaceAttemptId);
  if (!attempt) throw new WorkspaceLifecycleErrorV1("invalid_state", `Workspace attempt ${workspaceAttemptId} does not exist.`);
  const snapshot = record.workspaceAttempts?.find((item) => item.workspaceAttemptId === workspaceAttemptId);
  if (!snapshot || canonicalJson(snapshot) !== canonicalJson(attempt))
    throw new WorkspaceLifecycleErrorV1("invalid_state", "Workspace snapshot conflicts with immutable replay.");
  return attempt;
}

async function loadAuthority(
  statePath: string,
  workspaceAttemptId: string,
) {
  const record = await readRunRecord(statePath);
  const authority = validateWorkspaceRecord(record).authorities.get(
    workspaceAttemptId,
  );
  if (!authority)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      `Workspace attempt ${workspaceAttemptId} has no canonical mutation authority.`,
    );
  return authority;
}

async function assertOwned(
  statePath: string,
  repositoryPath: string,
  attempt: WorkspaceAttemptV1,
  requireCanonicalHead = true,
) {
  const authority = await loadAuthority(statePath, attempt.workspaceAttemptId);
  await assertNoReparseEscape(attempt.ownedRoot, attempt.workspacePath);
  const top = await gitValue(attempt.workspacePath, ["rev-parse", "--show-toplevel"], "Workspace root unavailable");
  if (normalizedPath(await realpath(top)) !== normalizedPath(await realpath(attempt.workspacePath)))
    throw new WorkspaceLifecycleErrorV1("ownership", "Git workspace root does not match the canonical path.");
  if ((await repositoryIdentityV1(repositoryPath)) !== attempt.repositoryId)
    throw new WorkspaceLifecycleErrorV1("identity", "Repository identity changed.");
  const branch = await gitValue(attempt.workspacePath, ["symbolic-ref", "HEAD"], "Workspace branch unavailable");
  if (branch !== attempt.branchRef)
    throw new WorkspaceLifecycleErrorV1("ownership", "Workspace branch does not match canonical ownership.");
  const head = await gitValue(attempt.workspacePath, ["rev-parse", "HEAD^{commit}"], "Workspace HEAD unavailable");
  if (requireCanonicalHead && head !== authority.headSha)
    throw new WorkspaceLifecycleErrorV1(
      "ownership",
      "Workspace HEAD does not match canonical mutation authority.",
    );
  const expectedMarker = attempt.ownershipMarker;
  const observedMarker = JSON.parse(await readFile(await markerPath(attempt.workspacePath), "utf8")) as typeof expectedMarker;
  if (
    canonicalJson(observedMarker) !== canonicalJson(expectedMarker) ||
    sha256(canonicalJson(markerPayload(attempt, observedMarker.creationNonce))) !== observedMarker.markerSha256
  )
    throw new WorkspaceLifecycleErrorV1("ownership", "Ownership marker does not match canonical state.");
  await assertLease(repositoryPath, attempt, authority.leaseEpoch);
  return { head, authority };
}

async function preflight(input: ProvisionWorkspaceAttemptInputV1) {
  await mkdir(input.ownedRoot, { recursive: true });
  await assertNoReparseEscape(input.ownedRoot, input.workspacePath);
  const capability = await git(input.repositoryPath, ["worktree", "list", "--porcelain"]);
  if (capability.exitCode !== 0)
    throw new WorkspaceLifecycleErrorV1("capability", `Git worktree capability unavailable: ${capability.output}`);
  const top = await gitValue(input.repositoryPath, ["rev-parse", "--show-toplevel"], "Target root unavailable");
  if (normalizedPath(await realpath(top)) !== normalizedPath(await realpath(input.repositoryPath)))
    throw new WorkspaceLifecycleErrorV1("identity", "Configured target is not the repository top-level worktree.");
  if ((await repositoryIdentityV1(input.repositoryPath)) !== input.repositoryId)
    throw new WorkspaceLifecycleErrorV1("identity", "Configured repository identity does not match.");
  if ((await gitValue(input.repositoryPath, ["symbolic-ref", "HEAD"], "Target ref unavailable")) !== input.targetRef)
    throw new WorkspaceLifecycleErrorV1("identity", "Target ref changed.");
  if ((await gitValue(input.repositoryPath, ["rev-parse", "HEAD^{commit}"], "Target HEAD unavailable")) !== input.baseSha)
    throw new WorkspaceLifecycleErrorV1("identity", "Target HEAD changed.");
  if ((await git(input.repositoryPath, ["status", "--porcelain=v1", "-uall"])).output)
    throw new WorkspaceLifecycleErrorV1("dirty", "Target worktree is not clean.");
  if (await pathExists(input.workspacePath))
    throw new WorkspaceLifecycleErrorV1("collision", "Workspace path already exists.");
  const branchRef = `refs/heads/orchestrator/attempt/${input.runId}/${input.attemptId}`;
  const branch = await git(input.repositoryPath, ["show-ref", "--verify", "--quiet", branchRef]);
  if (branch.exitCode === 0)
    throw new WorkspaceLifecycleErrorV1("collision", "Attempt branch already exists.");
  if (capability.output.split(/\r?\n/).some((line) =>
    line.startsWith("worktree ") &&
    normalizedPath(line.slice("worktree ".length)) === normalizedPath(input.workspacePath)))
    throw new WorkspaceLifecycleErrorV1("collision", "Worktree metadata already owns the workspace path.");
}

export async function provisionWorkspaceAttemptV1(
  input: ProvisionWorkspaceAttemptInputV1,
): Promise<WorkspaceAttemptV1> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.runId) ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.attemptId))
    throw new WorkspaceLifecycleErrorV1("identity", "Run and attempt IDs are not safe Git ref components.");
  await preflight(input);
  const branchRef = `refs/heads/orchestrator/attempt/${input.runId}/${input.attemptId}`;
  const skeleton = {
    runId: input.runId,
    attemptId: input.attemptId,
    repositoryId: input.repositoryId,
    workspacePath: resolve(input.workspacePath),
    branchRef,
  };
  const marker = markerFor(skeleton, randomBytes(16).toString("hex"));
  const provisioning: WorkspaceAttemptV1 = {
    contractType: "WorkspaceAttemptV1",
    contractVersion: "1.0",
    workspaceAttemptId: `workspace-${input.runId}-${input.attemptId}`,
    projectId: input.projectId,
    repositoryId: input.repositoryId,
    changeId: input.changeId,
    waveId: input.waveId,
    taskId: input.taskId,
    runId: input.runId,
    attemptId: input.attemptId,
    plan: input.plan,
    ownedRoot: resolve(input.ownedRoot),
    workspacePath: resolve(input.workspacePath),
    branchRef,
    targetRef: input.targetRef,
    baseSha: input.baseSha,
    ownershipMarker: marker,
    previousState: null,
    state: "provisioning",
    cleanup: {
      mode: "non_destructive",
      maxAttempts: input.cleanupMaxAttempts ?? 3,
      attemptOrdinal: 0,
    },
    evidenceRefs: [`git:base:${input.baseSha}`, `git:target:${input.targetRef}`],
    transitionedAt: new Date().toISOString(),
    transitionedBy: input.transitionedBy ?? "workspace-controller:v1",
  };
  await transition(input.statePath, undefined, provisioning);
  await input.onPersistedBoundary?.("provisioning_persisted");
  const leaseEpoch = await acquireLease(input.repositoryPath, provisioning);
  const added = await git(input.repositoryPath, [
    "worktree", "add", "-b", branchRef.slice("refs/heads/".length),
    provisioning.workspacePath, provisioning.baseSha,
  ]);
  if (added.exitCode !== 0) {
    const failed = evolve(provisioning, "recovery_pending", {
      reason: `Provisioning failed and requires reconciliation: ${added.output || "unknown Git error"}`,
      evidenceRefs: [...provisioning.evidenceRefs, "git:worktree-add:failed"],
    });
    await transition(input.statePath, provisioning, failed);
    throw new WorkspaceLifecycleErrorV1("command", failed.reason!);
  }
  await input.onPersistedBoundary?.("worktree_added");
  await writeFile(await markerPath(provisioning.workspacePath), `${JSON.stringify(marker, null, 2)}\n`, { flag: "wx" });
  await input.onPersistedBoundary?.("ownership_marker_persisted");
  await appendAuthority(
    input.statePath,
    provisioning.workspaceAttemptId,
    provisioning.baseSha,
    leaseEpoch,
    "provisioned",
  );
  await input.onPersistedBoundary?.("provisioning_authority_persisted");
  await assertOwned(input.statePath, input.repositoryPath, provisioning);
  return transition(input.statePath, provisioning, evolve(provisioning, "active", {
    evidenceRefs: [...provisioning.evidenceRefs, `git:workspace:${provisioning.workspacePath}`],
  }));
}

export async function executeInWorkspaceAttemptV1(
  statePath: string,
  repositoryPath: string,
  workspaceAttemptId: string,
  command: WorkspaceCommandV1,
  onPersistedBoundary?: (
    boundary: WorkspaceExecutionBoundaryV1,
  ) => void | Promise<void>,
): Promise<WorkspaceCommandResultV1> {
  const attempt = await loadAttempt(statePath, workspaceAttemptId);
  if (attempt.state !== "active")
    throw new WorkspaceLifecycleErrorV1("invalid_state", "Only an active workspace attempt can execute commands.");
  await assertOwned(statePath, repositoryPath, attempt);
  const result = await runProcess(command.executable, command.args ?? [], attempt.workspacePath, command.timeoutMs);
  if (result.exitCode !== 0)
    throw new WorkspaceLifecycleErrorV1("command", `Workspace command failed (${result.exitCode}): ${result.output}`);
  await onPersistedBoundary?.("executor_returned");
  const { head, authority } = await assertOwned(
    statePath,
    repositoryPath,
    attempt,
    false,
  );
  if (head !== authority.headSha)
    await appendAuthority(
      statePath,
      workspaceAttemptId,
      head,
      authority.leaseEpoch,
      "command",
    );
  return result;
}

export async function checkpointWorkspaceAttemptV1(
  statePath: string,
  repositoryPath: string,
  workspaceAttemptId: string,
  paths: readonly string[],
  message: string,
  onPersistedBoundary?: (
    boundary: WorkspaceCheckpointBoundaryV1,
  ) => void | Promise<void>,
): Promise<string> {
  const attempt = await loadAttempt(statePath, workspaceAttemptId);
  if (attempt.state !== "active")
    throw new WorkspaceLifecycleErrorV1("invalid_state", "Only an active workspace attempt can checkpoint.");
  await assertOwned(statePath, repositoryPath, attempt);
  if (!paths.length || paths.some((path) => isAbsolute(path) || path.split(/[\\/]/).includes("..")))
    throw new WorkspaceLifecycleErrorV1("containment", "Checkpoint paths must be non-empty workspace-relative paths.");
  const add = await git(attempt.workspacePath, ["add", "--", ...paths]);
  if (add.exitCode !== 0)
    throw new WorkspaceLifecycleErrorV1("command", `Checkpoint staging failed: ${add.output}`);
  await onPersistedBoundary?.("checkpoint_staged");
  await assertOwned(statePath, repositoryPath, attempt);
  const commit = await git(attempt.workspacePath, ["commit", "--only", "-m", message.slice(0, 200), "--", ...paths]);
  if (commit.exitCode !== 0)
    throw new WorkspaceLifecycleErrorV1("command", `Checkpoint commit failed: ${commit.output}`);
  const head = await gitValue(attempt.workspacePath, ["rev-parse", "HEAD^{commit}"], "Checkpoint HEAD unavailable");
  await onPersistedBoundary?.("checkpoint_committed");
  const authority = await loadAuthority(statePath, workspaceAttemptId);
  await appendAuthority(
    statePath,
    workspaceAttemptId,
    head,
    authority.leaseEpoch,
    "checkpoint",
  );
  await onPersistedBoundary?.("checkpoint_authority_persisted");
  return head;
}

export async function sealWorkspaceAttemptV1(
  statePath: string,
  repositoryPath: string,
  workspaceAttemptId: string,
  onPersistedBoundary?: (
    boundary: WorkspaceSealBoundaryV1,
  ) => void | Promise<void>,
): Promise<WorkspaceAttemptV1> {
  const attempt = await loadAttempt(statePath, workspaceAttemptId);
  if (attempt.state !== "active")
    throw new WorkspaceLifecycleErrorV1("invalid_state", "Only an active workspace attempt can be sealed.");
  const { head } = await assertOwned(statePath, repositoryPath, attempt);
  const status = await git(attempt.workspacePath, ["status", "--porcelain=v1", "-uall"]);
  if (status.exitCode !== 0 || status.output)
    throw new WorkspaceLifecycleErrorV1("dirty", "Workspace must be clean before sealing.");
  const sealed = await transition(statePath, attempt, evolve(attempt, "sealed", {
    sealedSourceSha: head,
    evidenceRefs: [...attempt.evidenceRefs, `git:sealed:${head}`],
  }));
  await onPersistedBoundary?.("sealed_persisted");
  return sealed;
}

export async function recoverWorkspaceAttemptV1(
  statePath: string,
  repositoryPath: string,
  workspaceAttemptId: string,
): Promise<WorkspaceAttemptV1> {
  const attempt = await loadAttempt(statePath, workspaceAttemptId);
  if (attempt.state === "quarantined" || attempt.state === "cleaned") return attempt;
  try {
    const authority = await loadAuthority(statePath, workspaceAttemptId);
    const leaseEpoch = await recoverWorkspaceAttemptLeaseV1(repositoryPath, attempt);
    if (leaseEpoch === authority.leaseEpoch + 1)
      await appendAuthority(
        statePath,
        workspaceAttemptId,
        authority.headSha,
        leaseEpoch,
        "lease_takeover",
      );
    else if (leaseEpoch !== authority.leaseEpoch)
      throw new WorkspaceLifecycleErrorV1(
        "lease",
        "Observed lease epoch skipped canonical mutation authority.",
      );
    await assertOwned(statePath, repositoryPath, attempt);
    if (attempt.state === "provisioning" || attempt.state === "recovery_pending") {
      const head = await gitValue(attempt.workspacePath, ["rev-parse", "HEAD^{commit}"], "Recovery HEAD unavailable");
      const state: WorkspaceAttemptStateV1 =
        attempt.sealedSourceSha && head === attempt.sealedSourceSha ? "sealed" : "active";
      return transition(statePath, attempt, evolve(attempt, state, {
        reason: undefined,
        evidenceRefs: [...attempt.evidenceRefs, `recovery:reconciled:${state}`],
      }));
    }
    return attempt;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const next = evolve(attempt, "quarantined", {
      reason: `Recovery found ambiguous ownership evidence: ${reason}`,
      evidenceRefs: [...attempt.evidenceRefs, "recovery:ambiguous"],
    });
    return transition(statePath, attempt, next);
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Access denial is evidence that the PID exists but cannot be inspected;
    // treating it as dead could revoke a live owner.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function gitCommonDirectory(repositoryPath: string) {
  const common = await gitValue(
    repositoryPath,
    ["rev-parse", "--git-common-dir"],
    "Git common directory unavailable",
  );
  return resolve(repositoryPath, common);
}

async function targetLeasePath(
  repositoryPath: string,
  repositoryId: string,
  targetRef: string,
) {
  return join(
    await gitCommonDirectory(repositoryPath),
    "orchestrator-target-leases",
    `${sha256(`${repositoryId}\0${targetRef}`)}.json`,
  );
}

type PersistedTargetLeaseV1 = MergeLeaseV1 & {
  contractType: "TargetMergeLeaseV1";
  contractVersion: "1.0";
  mergeRequestId: string;
  pid: number;
  status: "active" | "released";
  releasedAt?: string;
};

type TargetLeaseMutexV1 = {
  contractType: "TargetLeaseMutexV1";
  contractVersion: "1.0";
  pid: number;
  token: string;
  acquiredAt: string;
};

function targetLeaseMutexPath(leasePath: string) {
  return `${leasePath}.lock`;
}

function targetLeaseMutexOwnerName(owner: TargetLeaseMutexV1) {
  return `owner-${owner.token}.json`;
}

async function readTargetLeaseMutex(
  lockPath: string,
): Promise<TargetLeaseMutexV1> {
  const names = await readdir(lockPath);
  if (names.length === 0) {
    const contention = new Error(
      "Target lease mutex takeover is removing the observed owner.",
    ) as NodeJS.ErrnoException;
    contention.code = "EBUSY";
    throw contention;
  }
  if (
    names.length > 1 ||
    !names[0].startsWith("owner-") ||
    !names[0].endsWith(".json")
  )
    throw new WorkspaceLifecycleErrorV1(
      "lease",
      "Target lease mutex is malformed; ownership cannot be proven.",
    );
  const observed = JSON.parse(
    await readFile(join(lockPath, names[0]), "utf8"),
  ) as TargetLeaseMutexV1;
  assertTargetLeaseMutex(observed);
  if (names[0] !== targetLeaseMutexOwnerName(observed))
    throw new WorkspaceLifecycleErrorV1(
      "lease",
      "Target lease mutex filename disagrees with its owner identity.",
    );
  return observed;
}

function assertTargetLeaseMutex(value: unknown): asserts value is TargetLeaseMutexV1 {
  const record = value as Partial<TargetLeaseMutexV1>;
  if (
    !record ||
    record.contractType !== "TargetLeaseMutexV1" ||
    record.contractVersion !== "1.0" ||
    typeof record.pid !== "number" ||
    !Number.isInteger(record.pid) ||
    record.pid < 1 ||
    typeof record.token !== "string" ||
    !record.token ||
    typeof record.acquiredAt !== "string" ||
    !record.acquiredAt
  )
    throw new WorkspaceLifecycleErrorV1(
      "lease",
      "Target lease mutex is malformed; ownership cannot be proven.",
    );
}

function isTransientTargetLeaseMutexError(error: unknown) {
  return ["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"].includes(
    (error as NodeJS.ErrnoException).code ?? "",
  );
}

async function targetLeaseMutexRetry(deadline: number) {
  if (Date.now() >= deadline)
    throw new WorkspaceLifecycleErrorV1(
      "lease",
      "Timed out on Windows target lease mutex filesystem contention.",
    );
  await new Promise((resolveWait) => setTimeout(resolveWait, 5));
}

async function acquireTargetLeaseMutex(
  leasePath: string,
  onBoundary?: ExecuteMergeRequestInputV1["onTargetLeaseMutexBoundary"],
): Promise<TargetLeaseMutexV1> {
  const lockPath = targetLeaseMutexPath(leasePath);
  await mkdir(dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 10_000;
  for (;;) {
    const candidate: TargetLeaseMutexV1 = {
      contractType: "TargetLeaseMutexV1",
      contractVersion: "1.0",
      pid: process.pid,
      token: randomBytes(24).toString("hex"),
      acquiredAt: new Date().toISOString(),
    };
    const candidatePath =
      `${lockPath}.${process.pid}.${candidate.token}.candidate`;
    await mkdir(candidatePath);
    await writeFile(
      join(candidatePath, targetLeaseMutexOwnerName(candidate)),
      JSON.stringify(candidate),
      { flag: "wx" },
    );
    let published = false;
    try {
      // The fully populated directory is published at the canonical name in
      // one filesystem operation. An existing owner is never overwritten.
      await rename(candidatePath, lockPath);
      published = true;
    } catch (error) {
      await rm(candidatePath, { recursive: true, force: true });
      if (!(await pathExists(lockPath))) {
        if (isTransientTargetLeaseMutexError(error)) {
          await targetLeaseMutexRetry(deadline);
          continue;
        }
        throw error;
      }
    }
    if (published) {
      try {
        await onBoundary?.("acquired", candidate);
        return candidate;
      } catch (error) {
        await releaseTargetLeaseMutex(leasePath, candidate);
        throw error;
      }
    }

    let observed: TargetLeaseMutexV1;
    try {
      observed = await readTargetLeaseMutex(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (isTransientTargetLeaseMutexError(error)) {
        await targetLeaseMutexRetry(deadline);
        continue;
      }
      throw error;
    }
    if (processIsAlive(observed.pid)) {
      await targetLeaseMutexRetry(deadline);
      continue;
    }
    await onBoundary?.("dead_owner_observed", observed);

    const observedOwnerPath = join(
      lockPath,
      targetLeaseMutexOwnerName(observed),
    );
    try {
      // Only the identity-named file that was observed dead is removable.
      // If another contender has already published a successor directory,
      // this old name cannot address the successor and takeover restarts.
      await unlink(observedOwnerPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (isTransientTargetLeaseMutexError(error)) {
        await targetLeaseMutexRetry(deadline);
        continue;
      }
      throw error;
    }
    try {
      await rmdir(lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      // On Windows, removal of the exact now-empty owner directory can race
      // filesystem visibility or a newly published owner and report
      // ENOTEMPTY. Never inspect and delete the new contents here: retrying
      // from the canonical path either observes the successor or fails closed
      // at the bounded contention deadline.
      if (isTransientTargetLeaseMutexError(error)) {
        await targetLeaseMutexRetry(deadline);
        continue;
      }
      throw new WorkspaceLifecycleErrorV1(
        "lease",
        "Target lease mutex changed during dead-owner recovery.",
      );
    }
  }
}

async function releaseTargetLeaseMutex(
  leasePath: string,
  ownership: TargetLeaseMutexV1,
) {
  const lockPath = targetLeaseMutexPath(leasePath);
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      const observed = await readTargetLeaseMutex(lockPath);
      if (
        observed.pid !== ownership.pid ||
        observed.token !== ownership.token ||
        canonicalJson(observed) !== canonicalJson(ownership)
      )
        throw new WorkspaceLifecycleErrorV1(
          "lease",
          "Target lease mutex ownership changed before release.",
        );
      await unlink(
        join(lockPath, targetLeaseMutexOwnerName(ownership)),
      );
      await rmdir(lockPath);
      return;
    } catch (error) {
      if (!isTransientTargetLeaseMutexError(error)) throw error;
      await targetLeaseMutexRetry(deadline);
    }
  }
}

async function withTargetLeaseMutex<T>(
  leasePath: string,
  operation: () => Promise<T>,
  onBoundary?: ExecuteMergeRequestInputV1["onTargetLeaseMutexBoundary"],
): Promise<T> {
  const ownership = await acquireTargetLeaseMutex(leasePath, onBoundary);
  try {
    return await operation();
  } finally {
    await releaseTargetLeaseMutex(leasePath, ownership);
  }
}

function validatePersistedTargetLease(
  existing: PersistedTargetLeaseV1,
  request: MergeRequestV1,
) {
  if (
    existing.contractType !== "TargetMergeLeaseV1" ||
    existing.contractVersion !== "1.0" ||
    existing.repositoryId !== request.repositoryId ||
    existing.targetRef !== request.targetRef ||
    !["active", "released"].includes(existing.status) ||
    !Number.isInteger(existing.epoch) ||
    existing.epoch < 1 ||
    typeof existing.pid !== "number"
  )
    throw new WorkspaceLifecycleErrorV1(
      "lease",
      "Persisted target lease is malformed or has conflicting identity.",
    );
}

async function acquireTargetLease(
  repositoryPath: string,
  request: MergeRequestV1,
  onBoundary?: ExecuteMergeRequestInputV1["onTargetLeaseMutexBoundary"],
): Promise<MergeLeaseV1> {
  const path = await targetLeasePath(
    repositoryPath,
    request.repositoryId,
    request.targetRef,
  );
  await mkdir(dirname(path), { recursive: true });
  return withTargetLeaseMutex(path, async () => {
    const makeLease = (epoch: number): PersistedTargetLeaseV1 => ({
      contractType: "TargetMergeLeaseV1",
      contractVersion: "1.0",
      leaseId: `target-lease-${sha256(`${request.repositoryId}\0${request.targetRef}`).slice(0, 32)}`,
      repositoryId: request.repositoryId,
      targetRef: request.targetRef,
      ownerRunId: request.runId,
      ownerAttemptId: request.attemptId,
      mergeRequestId: request.mergeRequestId,
      pid: process.pid,
      status: "active",
      epoch,
      acquiredAt: new Date().toISOString(),
    });
    let existing: PersistedTargetLeaseV1 | undefined;
    try {
      existing = JSON.parse(
        await readFile(path, "utf8"),
      ) as PersistedTargetLeaseV1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!existing) {
      const initial = makeLease(1);
      await writeJsonAtomically(path, initial);
      return mergeLeaseFromPersisted(initial);
    }
    validatePersistedTargetLease(existing, request);
    if (
      existing.status === "active" &&
      existing.pid === process.pid &&
      existing.mergeRequestId === request.mergeRequestId &&
      existing.ownerRunId === request.runId &&
      existing.ownerAttemptId === request.attemptId
    )
      return mergeLeaseFromPersisted(existing);
    if (existing.status === "active" && processIsAlive(existing.pid))
      throw new WorkspaceLifecycleErrorV1(
        "lease",
        "A live owner holds the repository target lease.",
      );
    const replacement = makeLease(existing.epoch + 1);
    await writeJsonAtomically(path, replacement);
    return mergeLeaseFromPersisted(replacement);
  }, onBoundary);
}

function mergeLeaseFromPersisted(
  persisted: PersistedTargetLeaseV1,
): MergeLeaseV1 {
  const {
    contractType,
    contractVersion,
    mergeRequestId,
    pid,
    status,
    releasedAt,
    ...lease
  } = persisted;
  void contractType;
  void contractVersion;
  void mergeRequestId;
  void pid;
  void status;
  void releasedAt;
  return lease;
}

async function assertTargetLeaseAtPath(
  path: string,
  request: MergeRequestV1,
) {
  if (!request.lease)
    throw new WorkspaceLifecycleErrorV1(
      "lease",
      "Canonical merge request has no target lease.",
    );
  const observed = JSON.parse(
    await readFile(path, "utf8"),
  ) as PersistedTargetLeaseV1;
  validatePersistedTargetLease(observed, request);
  if (
    observed.status !== "active" ||
    observed.mergeRequestId !== request.mergeRequestId ||
    observed.pid !== process.pid ||
    observed.repositoryId !== request.lease.repositoryId ||
    observed.targetRef !== request.lease.targetRef ||
    observed.ownerRunId !== request.lease.ownerRunId ||
    observed.ownerAttemptId !== request.lease.ownerAttemptId ||
    observed.leaseId !== request.lease.leaseId ||
    observed.epoch !== request.lease.epoch ||
    observed.acquiredAt !== request.lease.acquiredAt
  )
    throw new WorkspaceLifecycleErrorV1(
      "lease",
      "Observed target lease disagrees with canonical merge authority.",
    );
}

async function assertTargetLease(
  repositoryPath: string,
  request: MergeRequestV1,
) {
  const path = await targetLeasePath(
    repositoryPath,
    request.repositoryId,
    request.targetRef,
  );
  await withTargetLeaseMutex(path, () =>
    assertTargetLeaseAtPath(path, request),
  );
}

async function withCurrentTargetLease<T>(
  repositoryPath: string,
  request: MergeRequestV1,
  mutation: () => Promise<T>,
): Promise<T> {
  const path = await targetLeasePath(
    repositoryPath,
    request.repositoryId,
    request.targetRef,
  );
  return withTargetLeaseMutex(path, async () => {
    await assertTargetLeaseAtPath(path, request);
    return mutation();
  });
}

async function releaseTargetLease(
  repositoryPath: string,
  request: MergeRequestV1,
) {
  const path = await targetLeasePath(
    repositoryPath,
    request.repositoryId,
    request.targetRef,
  );
  await withTargetLeaseMutex(path, async () => {
    await assertTargetLeaseAtPath(path, request);
    const observed = JSON.parse(
      await readFile(path, "utf8"),
    ) as PersistedTargetLeaseV1;
    await writeJsonAtomically(path, {
      ...observed,
      status: "released",
      releasedAt: new Date().toISOString(),
    });
  });
}

async function runVerification(
  command: string,
  cwd: string,
  timeoutMs = 120_000,
): Promise<WorkspaceCommandResultV1> {
  return new Promise((done) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, [], {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const consume = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-64_000);
    };
    child.stdout?.on("data", consume);
    child.stderr?.on("data", consume);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      done({ exitCode: 1, timedOut, output: error.message, cwd });
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      done({
        exitCode: code ?? 1,
        timedOut,
        output: output.trim(),
        cwd,
      });
    });
  });
}

async function assertFreshMergeIdentities(
  statePath: string,
  repositoryPath: string,
  attempt: WorkspaceAttemptV1,
  request: MergeRequestV1,
) {
  await assertTargetLease(repositoryPath, request);
  if (
    attempt.state !== "merge_queued" ||
    attempt.mergeRequestId !== request.mergeRequestId ||
    attempt.sealedSourceSha !== request.sealedSourceSha ||
    attempt.branchRef !== request.sourceRef ||
    attempt.targetRef !== request.targetRef ||
    canonicalJson(attempt.plan) !== canonicalJson(request.plan) ||
    canonicalJson(request.plan) !== canonicalJson({
      planId: request.plan.planId,
      revision: request.plan.revision,
      planBaseSha: request.expectedTargetSha,
    })
  )
    throw new WorkspaceLifecycleErrorV1(
      "identity",
      "Merge request disagrees with sealed workspace or authorized plan/base.",
    );
  await assertOwned(statePath, repositoryPath, attempt);
  if ((await repositoryIdentityV1(repositoryPath)) !== request.repositoryId)
    throw new WorkspaceLifecycleErrorV1(
      "identity",
      "Target repository identity changed.",
    );
  const targetRef = await gitValue(
    repositoryPath,
    ["symbolic-ref", "HEAD"],
    "Target ref unavailable",
  );
  const targetSha = await gitValue(
    repositoryPath,
    ["rev-parse", "HEAD^{commit}"],
    "Target HEAD unavailable",
  );
  const sourceSha = await gitValue(
    repositoryPath,
    ["rev-parse", `${request.sourceRef}^{commit}`],
    "Source ref unavailable",
  );
  const status = await git(repositoryPath, [
    "status",
    "--porcelain=v1",
    "-uall",
  ]);
  if (
    targetRef !== request.targetRef ||
    sourceSha !== request.sealedSourceSha ||
    status.exitCode !== 0 ||
    status.output
  )
    throw new WorkspaceLifecycleErrorV1(
      status.output ? "dirty" : "identity",
      "Fresh target/source validation failed.",
    );
  const ancestry = await git(repositoryPath, [
    "merge-base",
    "--is-ancestor",
    request.expectedTargetSha,
    request.sealedSourceSha,
  ]);
  if (ancestry.exitCode !== 0)
    throw new WorkspaceLifecycleErrorV1(
      "identity",
      "Sealed source is not authorized ancestry from the exact plan base.",
    );
  return { targetSha, sourceSha };
}

async function exactSafeAbort(
  repositoryPath: string,
  request: MergeRequestV1,
) {
  return withCurrentTargetLease(repositoryPath, request, async () => {
    const head = await gitValue(
      repositoryPath,
      ["rev-parse", "HEAD^{commit}"],
      "Target HEAD unavailable during abort",
    );
    const mergeHead = await git(repositoryPath, [
      "rev-parse",
      "-q",
      "--verify",
      "MERGE_HEAD^{commit}",
    ]);
    if (
      head !== request.observedTargetSha ||
      mergeHead.exitCode !== 0 ||
      mergeHead.output !== request.sealedSourceSha
    )
      throw new WorkspaceLifecycleErrorV1(
        "quarantined",
        "In-progress merge fingerprints do not authorize automatic abort.",
      );
    const aborted = await git(repositoryPath, ["merge", "--abort"]);
    const afterHead = await gitValue(
      repositoryPath,
      ["rev-parse", "HEAD^{commit}"],
      "Target HEAD unavailable after abort",
    );
    const afterStatus = await git(repositoryPath, [
      "status",
      "--porcelain=v1",
      "-uall",
    ]);
    if (
      aborted.exitCode !== 0 ||
      afterHead !== request.observedTargetSha ||
      afterStatus.exitCode !== 0 ||
      afterStatus.output
    )
      throw new WorkspaceLifecycleErrorV1(
        "quarantined",
        "Exact merge abort could not restore the clean validated target.",
      );
    return `merge:safe-abort:${request.mergeRequestId}:${request.lease?.epoch}`;
  });
}

function terminalReceipt(
  request: MergeRequestV1,
  result: MergeReceiptV1["result"],
  transitionEventRef: string,
): MergeReceiptV1 {
  const receipt = canonicalTerminalReceipt(
    request,
    result,
    transitionEventRef,
  );
  assertMergeReceiptV1(receipt);
  return receipt;
}

function canonicalTerminalReceipt(
  request: MergeRequestV1,
  result: MergeReceiptV1["result"],
  transitionEventRef: string,
): MergeReceiptV1 {
  const base: MergeReceiptV1 = {
    contractType: "MergeReceiptV1",
    contractVersion: "1.0",
    mergeReceiptId: `merge-receipt-${sha256(
      canonicalJson({
        mergeRequestId: request.mergeRequestId,
        transitionEventRef,
      }),
    ).slice(0, 24)}`,
    mergeRequestId: request.mergeRequestId,
    workspaceAttemptId: request.workspaceAttemptId,
    projectId: request.projectId,
    repositoryId: request.repositoryId,
    runId: request.runId,
    attemptId: request.attemptId,
    targetRef: request.targetRef,
    expectedTargetSha: request.expectedTargetSha,
    sealedSourceSha: request.sealedSourceSha,
    result,
    evidenceRefs: appendEvidenceRefs(
      request.evidenceRefs,
      `merge:result:${result}`,
    ),
    persistedRunRef: `run:${request.runId}`,
    transitionEventRef,
    recordedAt: request.transitionedAt,
    recordedBy: request.transitionedBy,
  };
  if (result === "merged") {
    if (!request.mergeCommitSha || !request.observedTargetSha)
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        "Committed merge request lacks canonical commit identity.",
      );
    const verificationResults = request.verificationCommands.map(
      (command, index) => {
        const prefix =
          `merge:verification:${request.mergeRequestId}:${index + 1}:`;
        const matches = request.evidenceRefs.filter((reference) =>
          reference.startsWith(prefix),
        );
        if (matches.length !== 1)
          throw new WorkspaceLifecycleErrorV1(
            "invalid_state",
            `Verification command ${index + 1} lacks one exact canonical evidence reference.`,
          );
        return {
          command: command.command,
          exitCode: command.expectedExitCode,
          evidenceRef: matches[0],
        };
      },
    );
    return {
      ...base,
      mergeCommitSha: request.mergeCommitSha,
      mergeParents: [request.observedTargetSha, request.sealedSourceSha],
      verificationResults,
    };
  }
  if (!request.reason)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      `Terminal ${result} merge request lacks its canonical reason.`,
    );
  if (result === "replan_required") {
    if (
      !request.driftAssessmentId ||
      request.safeAbortEvidenceRef !== "merge:not-started" ||
      !request.evidenceRefs.includes(request.safeAbortEvidenceRef)
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        "Replan receipt lacks exact drift and not-started evidence.",
      );
    return {
      ...base,
      driftAssessmentId: request.driftAssessmentId,
      reason: request.reason,
    };
  }
  if (result === "recovery_pending") {
    if (
      !request.safeAbortEvidenceRef ||
      !request.safeAbortEvidenceRef.startsWith(
        `merge:safe-abort:${request.mergeRequestId}:`,
      ) ||
      !request.evidenceRefs.includes(request.safeAbortEvidenceRef)
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        "Recovery receipt lacks exact safe-abort evidence.",
      );
    return {
      ...base,
      recoveryEvidenceRef: request.safeAbortEvidenceRef,
      reason: request.reason,
    };
  }
  const quarantineEvidence = request.evidenceRefs.filter(
    (reference) =>
      reference === `merge:ambiguous:${request.mergeRequestId}` ||
      reference.startsWith("merge:target-ambiguous:"),
  );
  if (quarantineEvidence.length !== 1)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Quarantine receipt lacks one exact canonical quarantine evidence reference.",
    );
  return {
    ...base,
    quarantineEvidenceRef: quarantineEvidence[0],
    reason: request.reason,
  };
}

async function persistTerminalMerge(
  statePath: string,
  request: MergeRequestV1,
  requestState: Extract<
    MergeStateV1,
    "committed" | "replan_required" | "recovery_pending" | "quarantined"
  >,
  workspaceState: Extract<
    WorkspaceAttemptStateV1,
    "merged" | "replan_required" | "recovery_pending" | "quarantined"
  >,
  requestExtras: Partial<MergeRequestV1>,
  receiptExtras: Partial<MergeReceiptV1>,
) {
  return serializeWorkspaceRunStateV1(statePath, async () => {
    const record = await readRunRecord(statePath);
    const projected = validateWorkspaceRecord(record);
    const currentRequest = projected.requests.get(request.mergeRequestId);
    const currentAttempt = projected.attempts.get(request.workspaceAttemptId);
    const existingReceipt = projected.receipts.find(
      (receipt) => receipt.mergeRequestId === request.mergeRequestId,
    );
    if (existingReceipt) return existingReceipt;
    if (
      !currentRequest ||
      !currentAttempt ||
      currentRequest.state !== request.state ||
      currentAttempt.state !== "merge_queued" ||
      !allowedMergeTransitions
        .get(currentRequest.state)
        ?.has(requestState) ||
      !allowedTransitions.get(currentAttempt.state)?.has(workspaceState)
    )
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        "Terminal merge persistence found concurrent canonical state.",
      );
    const resultSpecificEvidenceRefs = [
      requestExtras.safeAbortEvidenceRef,
      receiptExtras.recoveryEvidenceRef,
      receiptExtras.quarantineEvidenceRef,
      ...(receiptExtras.verificationResults?.map(
        (result) => result.evidenceRef,
      ) ?? []),
    ].filter((reference): reference is string => !!reference);
    const nextRequest = evolveMergeRequest(
      currentRequest,
      requestState,
      {
        ...requestExtras,
        ...(requestState === "recovery_pending" &&
        receiptExtras.recoveryEvidenceRef
          ? { safeAbortEvidenceRef: receiptExtras.recoveryEvidenceRef }
          : {}),
        evidenceRefs: appendEvidenceRefs(
          requestExtras.evidenceRefs ?? currentRequest.evidenceRefs,
          ...resultSpecificEvidenceRefs,
        ),
      },
    );
    const nextAttempt = evolve(currentAttempt, workspaceState, {
      ...(requestExtras.driftAssessmentId
        ? { driftAssessmentId: requestExtras.driftAssessmentId }
        : {}),
      ...(requestExtras.reason ? { reason: requestExtras.reason } : {}),
      evidenceRefs: appendEvidenceRefs(
        currentAttempt.evidenceRefs,
        `merge:${requestState}:${request.mergeRequestId}`,
      ),
    });
    assertMergeRequestV1(nextRequest);
    assertWorkspaceAttemptV1(nextAttempt);
    const mergeEvents = record.mergeRequestEvents ?? [];
    const mergeUnsigned: Omit<MergeRequestTransitionEventV1, "hash"> = {
      contractType: "MergeRequestTransitionEventV1",
      contractVersion: "1.0",
      eventId: `merge-event-${randomBytes(12).toString("hex")}`,
      sequence: mergeEvents.length + 1,
      mergeRequestId: nextRequest.mergeRequestId,
      previousState: nextRequest.previousState,
      state: nextRequest.state,
      request: nextRequest,
      previousHash: mergeEvents.at(-1)?.hash ?? null,
    };
    const mergeEvent = {
      ...mergeUnsigned,
      hash: mergeEventHash(mergeUnsigned),
    };
    const workspaceEvents = record.workspaceAttemptEvents ?? [];
    const workspaceUnsigned: Omit<
      WorkspaceAttemptTransitionEventV1,
      "hash"
    > = {
      contractType: "WorkspaceAttemptTransitionEventV1",
      contractVersion: "1.0",
      eventId: `workspace-event-${randomBytes(12).toString("hex")}`,
      sequence: workspaceEvents.length + 1,
      workspaceAttemptId: nextAttempt.workspaceAttemptId,
      previousState: nextAttempt.previousState,
      state: nextAttempt.state,
      attempt: nextAttempt,
      previousHash: workspaceEvents.at(-1)?.hash ?? null,
    };
    const workspaceEvent = {
      ...workspaceUnsigned,
      hash: eventHash(workspaceUnsigned),
    };
    const result: MergeReceiptV1["result"] =
      requestState === "committed" ? "merged" : requestState;
    const receipt = terminalReceipt(
      nextRequest,
      result,
      mergeEvent.eventId,
    );
    await writeJsonAtomically(statePath, {
      ...record,
      mergeRequests: [
        ...(record.mergeRequests ?? []).filter(
          (candidate) =>
            candidate.mergeRequestId !== nextRequest.mergeRequestId,
        ),
        nextRequest,
      ],
      mergeRequestEvents: [...mergeEvents, mergeEvent],
      mergeReceipts: [...(record.mergeReceipts ?? []), receipt],
      workspaceAttempts: [
        ...(record.workspaceAttempts ?? []).filter(
          (candidate) =>
            candidate.workspaceAttemptId !== nextAttempt.workspaceAttemptId,
        ),
        nextAttempt,
      ],
      workspaceAttemptEvents: [...workspaceEvents, workspaceEvent],
    });
    return receipt;
  });
}

async function existingReceiptFor(
  statePath: string,
  mergeRequestId: string,
) {
  const record = await readRunRecord(statePath);
  return validateWorkspaceRecord(record).receipts.find(
    (receipt) => receipt.mergeRequestId === mergeRequestId,
  );
}

async function performMergeRequest(
  input: ExecuteMergeRequestInputV1,
  initial: MergeRequestV1,
): Promise<MergeReceiptV1> {
  let request = initial;
  const attempt = await loadAttempt(
    input.statePath,
    input.workspaceAttemptId,
  );
  const observed = await assertFreshMergeIdentities(
    input.statePath,
    input.repositoryPath,
    attempt,
    request,
  );
  if (observed.targetSha !== request.expectedTargetSha) {
    let driftAssessmentId = `merge-drift-${randomBytes(12).toString("hex")}`;
    const reason =
      "Target moved after plan authorization; architect replan and fresh human authorization are required.";
    const recorded = await input.onReplanRequired?.({
      driftAssessmentId,
      mergeRequestId: request.mergeRequestId,
      projectId: request.projectId,
      changeId: request.changeId,
      waveId: request.waveId,
      taskId: request.taskId,
      plan: request.plan,
      expectedTargetSha: request.expectedTargetSha,
      observedTargetSha: observed.targetSha,
      sourceSha: request.sealedSourceSha,
      requiresArchitectReplan: true,
      requiresFreshHumanAuthorization: true,
    });
    if (typeof recorded === "string") driftAssessmentId = recorded;
    else if (recorded) driftAssessmentId = recorded.driftAssessmentId;
    const linkedEvidenceRefs =
      typeof recorded === "object" ? recorded.evidenceRefs : [];
    const receipt = await persistTerminalMerge(
      input.statePath,
      request,
      "replan_required",
      "replan_required",
      {
        observedTargetSha: observed.targetSha,
        driftAssessmentId,
        safeAbortEvidenceRef: "merge:not-started",
        reason,
        evidenceRefs: appendEvidenceRefs(
          request.evidenceRefs,
          ...linkedEvidenceRefs,
        ),
      },
      {
        driftAssessmentId,
        reason,
        evidenceRefs: appendEvidenceRefs(
          request.evidenceRefs,
          ...linkedEvidenceRefs,
        ),
      },
    );
    await releaseTargetLease(
      input.repositoryPath,
      evolveMergeRequest(request, "replan_required", {
        observedTargetSha: observed.targetSha,
        driftAssessmentId,
        safeAbortEvidenceRef: "merge:not-started",
        reason,
      }),
    );
    await input.onPersistedBoundary?.("lease_released");
    return receipt;
  }
  if (input.replanOnly)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Drift-only recovery cannot apply a merge after the target returns to the authorized base.",
    );
  request = await transitionMergeRequest(
    input.statePath,
    request,
    evolveMergeRequest(request, "applying", {
      observedTargetSha: observed.targetSha,
      evidenceRefs: appendEvidenceRefs(
        request.evidenceRefs,
        `git:fresh-target:${observed.targetSha}`,
        `git:sealed-source:${observed.sourceSha}`,
      ),
    }),
  );
  await input.onPersistedBoundary?.("validated_persisted");
  const applied = await withCurrentTargetLease(
    input.repositoryPath,
    request,
    () =>
      git(input.repositoryPath, [
        "merge",
        "--no-ff",
        "--no-commit",
        request.sealedSourceSha,
      ]),
  );
  if (applied.exitCode !== 0) {
    try {
      const abortEvidence = await exactSafeAbort(
        input.repositoryPath,
        request,
      );
      const reason = `Pending merge failed and was safely aborted: ${applied.output || "merge conflict"}`;
      const receipt = await persistTerminalMerge(
        input.statePath,
        request,
        "recovery_pending",
        "recovery_pending",
        { reason, evidenceRefs: appendEvidenceRefs(request.evidenceRefs, abortEvidence) },
        { recoveryEvidenceRef: abortEvidence, reason },
      );
      await releaseTargetLease(
        input.repositoryPath,
        evolveMergeRequest(request, "recovery_pending", { reason }),
      );
      await input.onPersistedBoundary?.("lease_released");
      return receipt;
    } catch (error) {
      const reason = `Merge conflict could not be proven safe to abort: ${error instanceof Error ? error.message : String(error)}`;
      return persistTerminalMerge(
        input.statePath,
        request,
        "quarantined",
        "quarantined",
        { reason },
        {
          quarantineEvidenceRef: `merge:ambiguous:${request.mergeRequestId}`,
          reason,
        },
      );
    }
  }
  await input.onPersistedBoundary?.("merge_applied");
  const mergeHead = await gitValue(
    input.repositoryPath,
    ["rev-parse", "MERGE_HEAD^{commit}"],
    "Pending merge source unavailable",
  );
  const pendingHead = await gitValue(
    input.repositoryPath,
    ["rev-parse", "HEAD^{commit}"],
    "Pending merge target unavailable",
  );
  if (
    mergeHead !== request.sealedSourceSha ||
    pendingHead !== request.observedTargetSha
  )
    throw new WorkspaceLifecycleErrorV1(
      "quarantined",
      "Pending merge fingerprints changed after apply.",
    );
  request = await transitionMergeRequest(
    input.statePath,
    request,
    evolveMergeRequest(request, "verifying", {
      evidenceRefs: appendEvidenceRefs(
        request.evidenceRefs,
        `merge:pending:${pendingHead}:${mergeHead}`,
      ),
    }),
  );
  await input.onPersistedBoundary?.("verifying_persisted");
  const verificationResults: NonNullable<
    MergeReceiptV1["verificationResults"]
  >[number][] = [];
  for (const [index, command] of request.verificationCommands.entries()) {
    const result = await withCurrentTargetLease(
      input.repositoryPath,
      request,
      () => runVerification(command.command, input.repositoryPath),
    );
    if (
      result.exitCode !== command.expectedExitCode ||
      result.timedOut
    ) {
      try {
        const abortEvidence = await exactSafeAbort(
          input.repositoryPath,
          request,
        );
        const reason = `Pending-merge verification failed for command ${index + 1}.`;
        const receipt = await persistTerminalMerge(
          input.statePath,
          request,
          "recovery_pending",
          "recovery_pending",
          { reason, evidenceRefs: appendEvidenceRefs(request.evidenceRefs, abortEvidence) },
          { recoveryEvidenceRef: abortEvidence, reason },
        );
        await releaseTargetLease(
          input.repositoryPath,
          evolveMergeRequest(request, "recovery_pending", { reason }),
        );
        await input.onPersistedBoundary?.("lease_released");
        return receipt;
      } catch (error) {
        const reason = `Verification failure could not be safely aborted: ${error instanceof Error ? error.message : String(error)}`;
        return persistTerminalMerge(
          input.statePath,
          request,
          "quarantined",
          "quarantined",
          { reason },
          {
            quarantineEvidenceRef: `merge:ambiguous:${request.mergeRequestId}`,
            reason,
          },
        );
      }
    }
    verificationResults.push({
      command: command.command,
      exitCode: 0,
      evidenceRef: `merge:verification:${request.mergeRequestId}:${index + 1}:${sha256(result.output).slice(0, 16)}`,
    });
  }
  request = await transitionMergeRequest(
    input.statePath,
    request,
    evolveMergeRequest(request, "recovery_pending", {
      reason: "Verification passed; merge commit persistence is in progress.",
      evidenceRefs: appendEvidenceRefs(
        request.evidenceRefs,
        ...verificationResults.map((result) => result.evidenceRef),
      ),
    }),
  );
  await input.onPersistedBoundary?.("verification_completed");
  const committed = await withCurrentTargetLease(
    input.repositoryPath,
    request,
    () =>
      git(input.repositoryPath, [
        "commit",
        "-m",
        `orchestrator merge ${request.mergeRequestId}`,
      ]),
  );
  if (committed.exitCode !== 0)
    throw new WorkspaceLifecycleErrorV1(
      "command",
      `Identified merge commit failed: ${committed.output}`,
    );
  const mergeCommitSha = await gitValue(
    input.repositoryPath,
    ["rev-parse", "HEAD^{commit}"],
    "Merge commit unavailable",
  );
  const parents = (
    await gitValue(
      input.repositoryPath,
      ["show", "-s", "--format=%P", mergeCommitSha],
      "Merge parents unavailable",
    )
  ).split(/\s+/);
  if (
    parents.length !== 2 ||
    parents[0] !== request.observedTargetSha ||
    parents[1] !== request.sealedSourceSha
  )
    throw new WorkspaceLifecycleErrorV1(
      "quarantined",
      "Created commit is not the exact identified two-parent merge.",
    );
  await input.onPersistedBoundary?.("merge_commit_created");
  const receipt = await persistTerminalMerge(
    input.statePath,
    request,
    "committed",
    "merged",
    {
      mergeCommitSha,
      reason: undefined,
      evidenceRefs: appendEvidenceRefs(
        request.evidenceRefs,
        `git:merge-commit:${mergeCommitSha}`,
      ),
    },
    {
      mergeCommitSha,
      mergeParents: [parents[0], parents[1]],
      verificationResults,
    },
  );
  await input.onPersistedBoundary?.("receipt_persisted");
  await releaseTargetLease(
    input.repositoryPath,
    evolveMergeRequest(request, "committed", { mergeCommitSha }),
  );
  await input.onPersistedBoundary?.("lease_released");
  return receipt;
}

export async function executeMergeRequestV1(
  input: ExecuteMergeRequestInputV1,
): Promise<MergeReceiptV1> {
  if (!input.verificationCommands.length)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Merge requires at least one recorded verification command.",
    );
  let attempt = await loadAttempt(
    input.statePath,
    input.workspaceAttemptId,
  );
  if (
    attempt.state !== "sealed" ||
    !attempt.sealedSourceSha ||
    canonicalJson(attempt.plan) !== canonicalJson(input.plan)
  )
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Only the exact authorized sealed workspace can create a merge request.",
    );
  const existingRequests = (
    await canonicalWorkspaceRunFieldsV1(input.statePath)
  ).mergeRequests.filter(
    (request) => request.workspaceAttemptId === attempt.workspaceAttemptId,
  );
  if (existingRequests.length > 1)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "A sealed attempt has multiple merge requests.",
    );
  if (existingRequests.length === 1)
    return recoverMergeRequestV1(
      input,
      existingRequests[0].mergeRequestId,
    );
  const now = new Date().toISOString();
  let request: MergeRequestV1 = {
    contractType: "MergeRequestV1",
    contractVersion: "1.0",
    mergeRequestId: `merge-${randomBytes(12).toString("hex")}`,
    workspaceAttemptId: attempt.workspaceAttemptId,
    projectId: attempt.projectId,
    repositoryId: attempt.repositoryId,
    changeId: attempt.changeId,
    waveId: attempt.waveId,
    taskId: attempt.taskId,
    runId: attempt.runId,
    attemptId: attempt.attemptId,
    plan: attempt.plan,
    targetRef: attempt.targetRef,
    expectedTargetSha: attempt.plan.planBaseSha,
    sourceRef: attempt.branchRef,
    sealedSourceSha: attempt.sealedSourceSha,
    integrationStrategy: "merge_no_ff_no_commit",
    verificationCommands: input.verificationCommands.map((command) => ({
      command,
      expectedExitCode: 0,
    })),
    previousState: null,
    state: "queued",
    evidenceRefs: [
      `workspace:${attempt.workspaceAttemptId}`,
      `plan:${attempt.plan.planId}:${attempt.plan.revision}`,
    ],
    transitionedAt: now,
    transitionedBy: input.transitionedBy ?? "merge-controller:v1",
  };
  request = await transitionMergeRequest(
    input.statePath,
    undefined,
    request,
  );
  await input.onPersistedBoundary?.("queued_persisted");
  attempt = await transition(
    input.statePath,
    attempt,
    evolve(attempt, "merge_queued", {
      mergeRequestId: request.mergeRequestId,
      evidenceRefs: appendEvidenceRefs(
        attempt.evidenceRefs,
        `merge:queued:${request.mergeRequestId}`,
      ),
    }),
  );
  const lease = await acquireTargetLease(
    input.repositoryPath,
    request,
    input.onTargetLeaseMutexBoundary,
  );
  request = await transitionMergeRequest(
    input.statePath,
    request,
    evolveMergeRequest(request, "validating", {
      lease,
      evidenceRefs: appendEvidenceRefs(
        request.evidenceRefs,
        `lease:${lease.leaseId}:${lease.epoch}`,
      ),
    }),
  );
  await input.onPersistedBoundary?.("lease_persisted");
  return performMergeRequest(input, request);
}

export async function recoverMergeRequestV1(
  input: ExecuteMergeRequestInputV1,
  mergeRequestId: string,
): Promise<MergeReceiptV1> {
  const existing = await existingReceiptFor(input.statePath, mergeRequestId);
  if (existing) {
    const terminalRequest = await loadMergeRequest(
      input.statePath,
      mergeRequestId,
    );
    const path = await targetLeasePath(
      input.repositoryPath,
      terminalRequest.repositoryId,
      terminalRequest.targetRef,
    );
    if (await pathExists(path)) {
      const lease = JSON.parse(
        await readFile(path, "utf8"),
      ) as PersistedTargetLeaseV1;
      if (lease.status === "active")
        await releaseTargetLease(input.repositoryPath, terminalRequest);
      else if (
        lease.status !== "released" ||
        lease.mergeRequestId !== terminalRequest.mergeRequestId ||
        lease.epoch !== terminalRequest.lease?.epoch
      )
        throw new WorkspaceLifecycleErrorV1(
          "lease",
          "Terminal receipt disagrees with the persisted released lease.",
        );
    }
    return existing;
  }
  let request = await loadMergeRequest(input.statePath, mergeRequestId);
  if (
    request.workspaceAttemptId !== input.workspaceAttemptId ||
    canonicalJson(request.plan) !== canonicalJson(input.plan) ||
    canonicalJson(request.verificationCommands) !==
      canonicalJson(
        input.verificationCommands.map((command) => ({
          command,
          expectedExitCode: 0,
        })),
      )
  )
    throw new WorkspaceLifecycleErrorV1(
      "identity",
      "Recovery input disagrees with the canonical merge request.",
    );
  let attempt = await loadAttempt(
    input.statePath,
    input.workspaceAttemptId,
  );
  if (attempt.state === "sealed" && request.state === "queued") {
    attempt = await transition(
      input.statePath,
      attempt,
      evolve(attempt, "merge_queued", {
        mergeRequestId: request.mergeRequestId,
        evidenceRefs: appendEvidenceRefs(
          attempt.evidenceRefs,
          `merge:queued:${request.mergeRequestId}`,
        ),
      }),
    );
  }
  if (
    attempt.state !== "merge_queued" ||
    attempt.mergeRequestId !== request.mergeRequestId
  )
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Recovery found no exact workspace-to-merge-request binding.",
    );
  const lease = await acquireTargetLease(
    input.repositoryPath,
    request,
    input.onTargetLeaseMutexBoundary,
  );
  const acquiredNewLease =
    !request.lease ||
    canonicalJson(request.lease) !== canonicalJson(lease);
  if (acquiredNewLease) {
    if (request.state === "queued") {
      request = await transitionMergeRequest(
        input.statePath,
        request,
        evolveMergeRequest(request, "validating", { lease }),
      );
    } else if (request.state === "recovery_pending") {
      request = await transitionMergeRequest(
        input.statePath,
        request,
        evolveMergeRequest(request, "validating", {
          lease,
          reason: undefined,
        }),
      );
    } else if (
      ["validating", "applying", "verifying"].includes(request.state)
    ) {
      request = await transitionMergeRequest(
        input.statePath,
        request,
        evolveMergeRequest(request, "recovery_pending", {
          lease,
          reason:
            "Startup acquired the next monotonic target lease epoch.",
          evidenceRefs: appendEvidenceRefs(
            request.evidenceRefs,
            `lease:${lease.leaseId}:${lease.epoch}`,
          ),
        }),
      );
    } else {
      throw new WorkspaceLifecycleErrorV1(
        "invalid_state",
        "Terminal merge request cannot acquire a replacement lease.",
      );
    }
    await input.onPersistedBoundary?.("lease_persisted");
  }
  if (request.state === "validating")
    return performMergeRequest(input, request);
  if (input.replanOnly && request.state === "recovery_pending") {
    request = await transitionMergeRequest(
      input.statePath,
      request,
      evolveMergeRequest(request, "validating", {
        reason: undefined,
      }),
    );
    return performMergeRequest(input, request);
  }
  if (input.replanOnly)
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      `Drift-only recovery cannot reconcile merge state ${request.state}.`,
    );
  const head = await gitValue(
    input.repositoryPath,
    ["rev-parse", "HEAD^{commit}"],
    "Recovery target HEAD unavailable",
  );
  const recoveredCommit = await git(input.repositoryPath, [
    "show",
    "-s",
    "--format=%P%n%B",
    head,
  ]);
  const [recoveredParentLine = "", ...recoveredMessageLines] =
    recoveredCommit.output.split(/\r?\n/);
  const recoveredParents = recoveredParentLine.trim().split(/\s+/);
  const isIdentifiedRecoveredCommit =
    recoveredCommit.exitCode === 0 &&
    recoveredParents.length === 2 &&
    recoveredParents[0] === request.observedTargetSha &&
    recoveredParents[1] === request.sealedSourceSha &&
    recoveredMessageLines
      .join("\n")
      .includes(`orchestrator merge ${request.mergeRequestId}`);
  if (
    (request.mergeCommitSha && head === request.mergeCommitSha) ||
    isIdentifiedRecoveredCommit
  ) {
    const parents = recoveredParents;
    if (
      parents.length !== 2 ||
      parents[0] !== request.observedTargetSha ||
      parents[1] !== request.sealedSourceSha
    )
      throw new WorkspaceLifecycleErrorV1(
        "quarantined",
        "Recovered merge commit identity is ambiguous.",
      );
    const verificationResults = request.verificationCommands.map(
      (command, index) => ({
        command: command.command,
        exitCode: 0 as const,
        evidenceRef:
          request.evidenceRefs.find((reference) =>
            reference.startsWith(
              `merge:verification:${request.mergeRequestId}:${index + 1}:`,
            ),
          ) ??
          `merge:verification:${request.mergeRequestId}:${index + 1}:recovered`,
      }),
    );
    const receipt = await persistTerminalMerge(
      input.statePath,
      request,
      "committed",
      "merged",
      { mergeCommitSha: head },
      {
        mergeCommitSha: head,
        mergeParents: [parents[0], parents[1]],
        verificationResults,
      },
    );
    await releaseTargetLease(input.repositoryPath, request);
    return receipt;
  }
  const mergeHead = await git(input.repositoryPath, [
    "rev-parse",
    "-q",
    "--verify",
    "MERGE_HEAD^{commit}",
  ]);
  if (mergeHead.exitCode === 0) {
    if (
      mergeHead.output !== request.sealedSourceSha ||
      head !== request.observedTargetSha
    ) {
      const reason =
        "Startup found an in-progress merge with conflicting fingerprints.";
      return persistTerminalMerge(
        input.statePath,
        request,
        "quarantined",
        "quarantined",
        { reason },
        {
          quarantineEvidenceRef: `merge:ambiguous:${request.mergeRequestId}`,
          reason,
        },
      );
    }
    const abortEvidence = await exactSafeAbort(
      input.repositoryPath,
      request,
    );
    if (request.state !== "recovery_pending")
      request = await transitionMergeRequest(
        input.statePath,
        request,
        evolveMergeRequest(request, "recovery_pending", {
          reason: "Startup safely aborted the exact owned pending merge for idempotent retry.",
          evidenceRefs: appendEvidenceRefs(request.evidenceRefs, abortEvidence),
        }),
      );
    request = await transitionMergeRequest(
      input.statePath,
      request,
      evolveMergeRequest(request, "validating", {
        reason: undefined,
      }),
    );
  } else if (
    head !== request.expectedTargetSha &&
    head !== request.observedTargetSha
  ) {
    const reason =
      "Startup found target movement without an identified merge commit.";
    return persistTerminalMerge(
      input.statePath,
      request,
      "quarantined",
      "quarantined",
      { reason },
      {
        quarantineEvidenceRef: `merge:target-ambiguous:${head}`,
        reason,
      },
    );
  } else {
    if (request.state !== "recovery_pending")
      request = await transitionMergeRequest(
        input.statePath,
        request,
        evolveMergeRequest(request, "recovery_pending", {
          reason: "Startup reconciled a pre-commit merge boundary.",
        }),
      );
    request = await transitionMergeRequest(
      input.statePath,
      request,
      evolveMergeRequest(request, "validating", { reason: undefined }),
    );
  }
  return performMergeRequest(input, request);
}

export async function recoverWorkspaceAttemptLeaseV1(
  repositoryPath: string,
  attempt: WorkspaceAttemptV1,
): Promise<number> {
  const path = leasePath(repositoryPath, attempt);
  const existing = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  if (
    existing.contractType !== "WorkspaceAttemptLeaseV1" ||
    existing.contractVersion !== "1.0" ||
    existing.repositoryId !== attempt.repositoryId ||
    existing.runId !== attempt.runId ||
    existing.attemptId !== attempt.attemptId ||
    typeof existing.pid !== "number" ||
    typeof existing.epoch !== "number" ||
    !Number.isInteger(existing.epoch) ||
    existing.epoch < 1
  )
    throw new WorkspaceLifecycleErrorV1("lease", "Persisted workspace lease is malformed or conflicts with canonical ownership.");
  if (existing.pid === process.pid) return existing.epoch;
  if (processIsAlive(existing.pid))
    throw new WorkspaceLifecycleErrorV1("lease", "A live owner still holds the workspace attempt lease.");
  const replacement = {
    ...existing,
    pid: process.pid,
    epoch: existing.epoch + 1,
  };
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.recovery`;
  await writeFile(temporary, JSON.stringify(replacement), { flag: "wx" });
  const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  if (canonicalJson(current) !== canonicalJson(existing)) {
    await unlink(temporary).catch(() => undefined);
    throw new WorkspaceLifecycleErrorV1("lease", "Workspace lease changed during recovery.");
  }
  await rename(temporary, path);
  return replacement.epoch as number;
}

export async function cleanupWorkspaceAttemptV1(
  statePath: string,
  repositoryPath: string,
  workspaceAttemptId: string,
  onPersistedBoundary?: (
    boundary: WorkspaceCleanupBoundaryV1,
  ) => void | Promise<void>,
): Promise<WorkspaceAttemptV1> {
  let attempt = await loadAttempt(statePath, workspaceAttemptId);
  const cleanupFromMerged =
    attempt.state === "merged" ||
    attempt.evidenceRefs.includes("cleanup:from-merged");
  if (attempt.state === "cleaned" || attempt.state === "quarantined") return attempt;
  if (!["active", "sealed", "merged", "replan_required", "cleanup_pending", "recovery_pending"].includes(attempt.state))
    throw new WorkspaceLifecycleErrorV1("invalid_state", `State ${attempt.state} cannot enter cleanup.`);
  if (attempt.state !== "cleanup_pending") {
    const ordinal = attempt.cleanup.attemptOrdinal + 1;
    if (ordinal > attempt.cleanup.maxAttempts) {
      return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
        cleanup: {
          ...attempt.cleanup,
          attemptOrdinal: attempt.cleanup.maxAttempts,
        },
        reason: "Non-destructive cleanup retry budget is exhausted.",
        evidenceRefs: appendEvidenceRefs(
          attempt.evidenceRefs,
          "cleanup:retry-exhausted",
        ),
      }));
    }
    attempt = await transition(statePath, attempt, evolve(attempt, "cleanup_pending", {
      cleanup: { ...attempt.cleanup, attemptOrdinal: ordinal },
      evidenceRefs: appendEvidenceRefs(
        attempt.evidenceRefs,
        "cleanup:requested",
        ...(cleanupFromMerged ? ["cleanup:from-merged"] : []),
      ),
    }));
  }
  const ordinal = attempt.cleanup.attemptOrdinal;
  const retrying = attempt;
  if (!(await pathExists(retrying.workspacePath))) {
    const branch = await git(repositoryPath, [
      "show-ref",
      "--verify",
      "--hash",
      retrying.branchRef,
    ]);
    const worktrees = await git(repositoryPath, ["worktree", "list", "--porcelain"]);
    if (
      ((branch.exitCode === 0 &&
        branch.output === (retrying.sealedSourceSha ?? retrying.baseSha)) ||
        (cleanupFromMerged && branch.exitCode !== 0)) &&
      !worktrees.output
        .split(/\r?\n/)
        .some(
          (line) =>
            line.startsWith("worktree ") &&
            normalizedPath(line.slice("worktree ".length)) ===
              normalizedPath(retrying.workspacePath),
        )
    ) {
      if (cleanupFromMerged && branch.exitCode === 0) {
        const ancestry = await git(repositoryPath, [
          "merge-base",
          "--is-ancestor",
          retrying.sealedSourceSha!,
          retrying.targetRef,
        ]);
        if (ancestry.exitCode !== 0)
          return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
            reason: "Merged branch ancestry cannot be proven; non-force cleanup retained the ref.",
            evidenceRefs: appendEvidenceRefs(
              attempt.evidenceRefs,
              "cleanup:ancestry-unproven",
            ),
          }));
        const deleted = await git(repositoryPath, [
          "branch",
          "-d",
          retrying.branchRef.replace(/^refs\/heads\//, ""),
        ]);
        if (deleted.exitCode !== 0)
          return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
            reason: `Non-force merged branch deletion failed: ${deleted.output}`,
            evidenceRefs: appendEvidenceRefs(
              attempt.evidenceRefs,
              "cleanup:branch-retained",
            ),
          }));
      }
      await unlink(leasePath(repositoryPath, retrying)).catch(() => undefined);
      return transition(statePath, attempt, evolve(attempt, "cleaned", {
        recoveryReceiptRef: `cleanup:${retrying.workspaceAttemptId}:${ordinal}`,
        evidenceRefs: appendEvidenceRefs(
          attempt.evidenceRefs,
          "cleanup:non-force-removed",
        ),
      }));
    }
    return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
      reason: "Cleanup found ambiguous one-sided worktree persistence.",
      evidenceRefs: appendEvidenceRefs(
        attempt.evidenceRefs,
        "cleanup:ambiguous-one-sided",
      ),
    }));
  }
  await assertOwned(statePath, repositoryPath, retrying);
  const status = await git(retrying.workspacePath, ["status", "--porcelain=v1", "-uall"]);
  if (status.exitCode !== 0 || status.output) {
    return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
      reason: "Owned workspace is dirty or unreadable; automatic cleanup retained every artifact.",
      evidenceRefs: appendEvidenceRefs(attempt.evidenceRefs, "cleanup:dirty-retained"),
    }));
  }
  const removed = await git(repositoryPath, ["worktree", "remove", retrying.workspacePath]);
  if (removed.exitCode !== 0) {
    return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
      reason: `Non-force cleanup failed; artifacts retained: ${removed.output || "filesystem contention"}`,
      evidenceRefs: appendEvidenceRefs(attempt.evidenceRefs, "cleanup:non-force-failed"),
    }));
  }
  await onPersistedBoundary?.("cleanup_worktree_removed");
  if (cleanupFromMerged) {
    const ancestry = await git(repositoryPath, [
      "merge-base",
      "--is-ancestor",
      retrying.sealedSourceSha!,
      retrying.targetRef,
    ]);
    if (ancestry.exitCode !== 0)
      return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
        reason: "Merged branch ancestry cannot be proven after worktree removal; ref retained.",
        evidenceRefs: appendEvidenceRefs(
          attempt.evidenceRefs,
          "cleanup:ancestry-unproven",
        ),
      }));
    const deleted = await git(repositoryPath, [
      "branch",
      "-d",
      retrying.branchRef.replace(/^refs\/heads\//, ""),
    ]);
    if (deleted.exitCode !== 0)
      return transition(statePath, attempt, evolve(attempt, "recovery_pending", {
        reason: `Non-force merged branch deletion failed: ${deleted.output}`,
        evidenceRefs: appendEvidenceRefs(
          attempt.evidenceRefs,
          "cleanup:branch-retained",
        ),
      }));
  }
  await unlink(leasePath(repositoryPath, retrying)).catch(() => undefined);
  return transition(statePath, attempt, evolve(attempt, "cleaned", {
    recoveryReceiptRef: `cleanup:${retrying.workspaceAttemptId}:${ordinal}`,
    evidenceRefs: appendEvidenceRefs(attempt.evidenceRefs, "cleanup:non-force-removed"),
  }));
}

export async function inspectWorkspaceAttemptV1(
  statePath: string,
  workspaceAttemptId: string,
) {
  return loadAttempt(statePath, workspaceAttemptId);
}

export async function workspaceMutationContextV1(
  statePath: string,
  repositoryPath: string,
  workspaceAttemptId: string,
) {
  const attempt = await loadAttempt(statePath, workspaceAttemptId);
  if (attempt.state !== "active")
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Managed execution requires an active workspace attempt.",
    );
  const { authority } = await assertOwned(
    statePath,
    repositoryPath,
    attempt,
  );
  return {
    workspacePath: attempt.workspacePath,
    headSha: authority.headSha,
    leaseEpoch: authority.leaseEpoch,
  };
}

export async function workspaceReadContextV1(
  statePath: string,
  repositoryPath: string,
  workspaceAttemptId: string,
) {
  const attempt = await loadAttempt(statePath, workspaceAttemptId);
  if (
    attempt.state === "cleaned" ||
    attempt.state === "quarantined" ||
    !(await pathExists(attempt.workspacePath))
  )
    throw new WorkspaceLifecycleErrorV1(
      "invalid_state",
      "Managed reads require a retained canonical owned workspace.",
    );
  const { authority } = await assertOwned(
    statePath,
    repositoryPath,
    attempt,
  );
  return {
    workspacePath: attempt.workspacePath,
    headSha: authority.headSha,
    leaseEpoch: authority.leaseEpoch,
  };
}
