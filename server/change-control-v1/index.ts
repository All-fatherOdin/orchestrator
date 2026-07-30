import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

export const CHANGE_CONTROL_EVENT_TYPES = [
  "change.created",
  "change.planned",
  "change.activated",
  "change.completed",
  "change.cancelled",
  "wave.created",
  "wave.readied",
  "wave.dispatched",
  "wave.dispatch-overridden",
  "wave.started",
  "wave.completed",
  "wave.halted",
  "task.created",
  "task.readied",
  "task.started",
  "task.accepted",
  "task.failed",
  "task.halted",
] as const;

export type ChangeControlEventType =
  (typeof CHANGE_CONTROL_EVENT_TYPES)[number];
export type ChangeStatus =
  | "draft"
  | "planned"
  | "active"
  | "completed"
  | "cancelled";
export type WaveStatus =
  | "draft"
  | "ready"
  | "dispatched"
  | "running"
  | "completed"
  | "halted";
export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "accepted"
  | "failed"
  | "halted";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ChangeControlEvent = Readonly<{
  id: string;
  sequence: number;
  type: ChangeControlEventType;
  occurredAt: string;
  projectId: string;
  changeId: string;
  waveId?: string;
  taskId?: string;
  actor: string;
  causationId: string;
  correlationId: string;
  payload: Readonly<JsonObject>;
  previousHash: string | null;
  hash: string;
}>;

export type ChangeProjection = Readonly<{
  projectId: string;
  changeId: string;
  status: ChangeStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastActor: string;
  details: Readonly<JsonObject>;
}>;

export type ChangeAggregate = Readonly<{
  change: ChangeProjection;
  events: readonly ChangeControlEvent[];
}>;

export type WaveDependencyReadinessReason = Readonly<{
  code: "WAVE_DEPENDENCY_NOT_COMPLETED";
  dependencyWaveId: string;
  status: WaveStatus;
}>;

export type WaveReadinessReason =
  | WaveDependencyReadinessReason
  | Readonly<{ code: "NO_READY_TASKS" }>;

export type DispatchReadinessReason =
  | Readonly<{ code: "WAVE_STATUS_NOT_READY"; status: WaveStatus }>
  | WaveReadinessReason;

export type TaskProjection = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  taskId: string;
  status: TaskStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastActor: string;
  dependsOn: readonly string[];
  details: Readonly<JsonObject>;
}>;

export type WaveProjection = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  status: WaveStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastActor: string;
  dependsOn: readonly string[];
  details: Readonly<JsonObject>;
  tasks: readonly TaskProjection[];
  readiness: Readonly<{
    ready: boolean;
    reasons: readonly WaveReadinessReason[];
  }>;
}>;

export type WaveAggregate = Readonly<{
  wave: WaveProjection;
  events: readonly ChangeControlEvent[];
}>;

export type ExecutionBucketItem = Readonly<{
  projectId: string;
  changeId: string;
  waveId: string;
  readyAt: string;
  readySequence: number;
}>;

type Ledger = {
  version: 1;
  projectId: string;
  events: ChangeControlEvent[];
};

type EventDraft = Omit<
  ChangeControlEvent,
  "sequence" | "previousHash" | "hash"
>;

export class ChangeControlError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "CONFLICT"
      | "NOT_READY"
      | "CORRUPT_LEDGER",
    readonly status: 400 | 404 | 409 | 500,
    readonly reasons?: readonly DispatchReadinessReason[],
  ) {
    super(message);
    this.name = "ChangeControlError";
  }
}

export type CreateChangeInput = {
  changeId?: string;
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type TransitionChangeInput = {
  to: ChangeStatus;
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type CreateTaskInput = {
  taskId: string;
  dependsOn?: string[];
  payload?: JsonObject;
};

export type CreateWaveInput = {
  waveId?: string;
  actor: string;
  dependsOn?: string[];
  tasks: CreateTaskInput[];
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type TransitionWaveInput = {
  to: "running" | "completed" | "halted";
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type TransitionTaskInput = {
  to: "running" | "accepted" | "failed" | "halted";
  actor: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type DispatchWaveInput = {
  actor: string;
  sendAnyway?: boolean;
  reason?: string;
  causationId?: string;
  correlationId?: string;
  payload?: JsonObject;
};

export type ChangeControlStoreOptions = {
  now?: () => string;
  createId?: () => string;
};

const eventTypeSet = new Set<string>(CHANGE_CONTROL_EVENT_TYPES);
const changeEventTypes = new Set<ChangeControlEventType>([
  "change.created",
  "change.planned",
  "change.activated",
  "change.completed",
  "change.cancelled",
]);
const waveEventTypes = new Set<ChangeControlEventType>([
  "wave.created",
  "wave.readied",
  "wave.dispatched",
  "wave.dispatch-overridden",
  "wave.started",
  "wave.completed",
  "wave.halted",
]);
const changeTargetForType = {
  "change.created": "draft",
  "change.planned": "planned",
  "change.activated": "active",
  "change.completed": "completed",
  "change.cancelled": "cancelled",
} as const;
const typeForTarget: Record<Exclude<ChangeStatus, "draft">, ChangeControlEventType> = {
  planned: "change.planned",
  active: "change.activated",
  completed: "change.completed",
  cancelled: "change.cancelled",
};
const legalTargets: Record<ChangeStatus, readonly ChangeStatus[]> = {
  draft: ["planned"],
  planned: ["active"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};
const waveTargetForType = {
  "wave.created": "draft",
  "wave.readied": "ready",
  "wave.dispatched": "dispatched",
  "wave.dispatch-overridden": "dispatched",
  "wave.started": "running",
  "wave.completed": "completed",
  "wave.halted": "halted",
} as const;
const waveTypeForTarget: Record<
  TransitionWaveInput["to"],
  ChangeControlEventType
> = {
  running: "wave.started",
  completed: "wave.completed",
  halted: "wave.halted",
};
const legalWaveTargets: Record<WaveStatus, readonly WaveStatus[]> = {
  draft: ["ready"],
  ready: ["dispatched"],
  dispatched: ["running"],
  running: ["completed", "halted"],
  completed: [],
  halted: [],
};
const taskTargetForType = {
  "task.created": "pending",
  "task.readied": "ready",
  "task.started": "running",
  "task.accepted": "accepted",
  "task.failed": "failed",
  "task.halted": "halted",
} as const;
const taskTypeForTarget: Record<
  TransitionTaskInput["to"],
  ChangeControlEventType
> = {
  running: "task.started",
  accepted: "task.accepted",
  failed: "task.failed",
  halted: "task.halted",
};
const legalTaskTargets: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["ready"],
  ready: ["running"],
  running: ["accepted", "failed", "halted"],
  accepted: [],
  failed: [],
  halted: [],
};
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function invalid(message: string): never {
  throw new ChangeControlError(message, "INVALID_INPUT", 400);
}

function corrupt(message: string): never {
  throw new ChangeControlError(message, "CORRUPT_LEDGER", 500);
}

function requireIdentifier(value: unknown, field: string) {
  if (typeof value !== "string" || !identifierPattern.test(value))
    invalid(
      `${field} must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.`,
    );
  return value;
}

function requireIdentity(value: unknown, field: string) {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length < 1 ||
    value.length > 256
  )
    invalid(`${field} must be a non-empty string of at most 256 characters.`);
  return value;
}

function normalizeJson(value: unknown, path = "payload"): JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  )
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalid(`${path} contains a non-finite number.`);
    return value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => normalizeJson(item, `${path}[${index}]`));
  if (typeof value !== "object") invalid(`${path} must contain only JSON values.`);

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    invalid(`${path} must contain only plain JSON objects.`);
  const result = Object.create(null) as JsonObject;
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) invalid(`${path}.${key} cannot be undefined.`);
    result[key] = normalizeJson(item, `${path}.${key}`);
  }
  return result;
}

function normalizePayload(value: unknown): JsonObject {
  const normalized = normalizeJson(value ?? {});
  if (
    normalized === null ||
    Array.isArray(normalized) ||
    typeof normalized !== "object"
  )
    invalid("payload must be a JSON object.");
  return normalized;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function eventHash(event: Omit<ChangeControlEvent, "hash">) {
  return createHash("sha256")
    .update(canonicalJson(event as unknown as JsonObject))
    .digest("hex");
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

function requireTimestamp(value: unknown) {
  if (
    typeof value !== "string" ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    corrupt("An event has an invalid occurredAt timestamp.");
  return value;
}

function requireStoredIdentity(value: unknown, field: string) {
  try {
    return requireIdentity(value, field);
  } catch {
    return corrupt(`An event has an invalid ${field}.`);
  }
}

function requireStoredIdentifier(value: unknown, field: string) {
  try {
    return requireIdentifier(value, field);
  } catch {
    return corrupt(`An event has an invalid ${field}.`);
  }
}

type StoredWaveProjection = Omit<WaveProjection, "tasks" | "readiness">;
type ProjectedLedger = {
  projections: Map<string, ChangeProjection>;
  waves: Map<string, StoredWaveProjection>;
  tasks: Map<string, TaskProjection>;
  taskCreatedSequences: Map<string, number>;
  eventsByChange: Map<string, ChangeControlEvent[]>;
  eventsByWave: Map<string, ChangeControlEvent[]>;
};

function waveKey(changeId: string, waveId: string) {
  return `${changeId}\u0000${waveId}`;
}

function taskKey(changeId: string, waveId: string, taskId: string) {
  return `${changeId}\u0000${waveId}\u0000${taskId}`;
}

function requireStoredStringArray(value: unknown, field: string) {
  if (!Array.isArray(value)) corrupt(`An event has an invalid ${field}.`);
  const result = value.map((item) => requireStoredIdentifier(item, field));
  if (new Set(result).size !== result.length)
    corrupt(`An event has duplicate values in ${field}.`);
  return result;
}

function requireStoredData(event: ChangeControlEvent) {
  const data = event.payload.data;
  if (data === null || Array.isArray(data) || typeof data !== "object")
    corrupt(`Event ${event.id} has an invalid typed payload.`);
  return data as JsonObject;
}

function assertPayloadKeys(
  event: ChangeControlEvent,
  expected: readonly string[],
) {
  if (Object.keys(event.payload).sort().join(",") !== [...expected].sort().join(","))
    corrupt(`Event ${event.id} has an invalid typed payload.`);
}

function taskDependenciesAccepted(
  task: TaskProjection,
  tasks: ReadonlyMap<string, TaskProjection>,
) {
  return task.dependsOn.every(
    (dependencyId) =>
      tasks.get(taskKey(task.changeId, task.waveId, dependencyId))?.status ===
      "accepted",
  );
}

function waveReadinessReasons(
  wave: StoredWaveProjection,
  waves: ReadonlyMap<string, StoredWaveProjection>,
  tasks: ReadonlyMap<string, TaskProjection>,
): WaveReadinessReason[] {
  const reasons: WaveReadinessReason[] = [];
  for (const dependencyWaveId of wave.dependsOn) {
    const dependency = waves.get(waveKey(wave.changeId, dependencyWaveId));
    if (!dependency)
      corrupt(
        `Wave ${wave.waveId} has missing dependency ${dependencyWaveId}.`,
      );
    if (dependency.status !== "completed")
      reasons.push({
        code: "WAVE_DEPENDENCY_NOT_COMPLETED",
        dependencyWaveId,
        status: dependency.status,
      });
  }
  const hasReadyTask = [...tasks.values()].some(
    (task) =>
      task.changeId === wave.changeId &&
      task.waveId === wave.waveId &&
      task.status === "ready",
  );
  if (!hasReadyTask) reasons.push({ code: "NO_READY_TASKS" });
  return reasons;
}

function dispatchReadinessReasons(
  wave: StoredWaveProjection,
  waves: ReadonlyMap<string, StoredWaveProjection>,
  tasks: ReadonlyMap<string, TaskProjection>,
): DispatchReadinessReason[] {
  const reasons: DispatchReadinessReason[] = [];
  if (wave.status !== "ready")
    reasons.push({ code: "WAVE_STATUS_NOT_READY", status: wave.status });
  reasons.push(...waveReadinessReasons(wave, waves, tasks));
  return reasons;
}

function assertTaskGraph(
  wave: StoredWaveProjection,
  tasks: ReadonlyMap<string, TaskProjection>,
) {
  const waveTasks = [...tasks.values()].filter(
    (task) =>
      task.changeId === wave.changeId && task.waveId === wave.waveId,
  );
  if (waveTasks.length === 0)
    corrupt(`Wave ${wave.waveId} must contain at least one task.`);
  const byId = new Map(waveTasks.map((task) => [task.taskId, task]));
  for (const task of waveTasks) {
    for (const dependencyId of task.dependsOn) {
      if (!byId.has(dependencyId))
        corrupt(
          `Task ${task.taskId} has missing dependency ${dependencyId}.`,
        );
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visiting.has(taskId))
      corrupt(`Wave ${wave.waveId} contains a task dependency cycle.`);
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId)!.dependsOn)
      visit(dependencyId);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of waveTasks) visit(task.taskId);
}

function validateAndProject(ledger: Ledger): ProjectedLedger {
  if (ledger.version !== 1 || !Array.isArray(ledger.events))
    corrupt("Unsupported change-control ledger format.");
  requireStoredIdentifier(ledger.projectId, "projectId");

  const projections = new Map<string, ChangeProjection>();
  const waves = new Map<string, StoredWaveProjection>();
  const tasks = new Map<string, TaskProjection>();
  const taskCreatedSequences = new Map<string, number>();
  const eventsByChange = new Map<string, ChangeControlEvent[]>();
  const eventsByWave = new Map<string, ChangeControlEvent[]>();
  const eventIds = new Set<string>();
  let previousHash: string | null = null;

  ledger.events.forEach((candidate, index) => {
    if (!candidate || typeof candidate !== "object")
      corrupt(`Ledger event ${index + 1} is invalid.`);
    const event = candidate as ChangeControlEvent;
    if (event.sequence !== index + 1)
      corrupt(`Ledger sequence must be contiguous at event ${index + 1}.`);
    if (!eventTypeSet.has(event.type))
      corrupt(`Unknown change-control event type: ${String(event.type)}.`);
    requireStoredIdentifier(event.id, "id");
    requireStoredIdentifier(event.projectId, "projectId");
    requireStoredIdentifier(event.changeId, "changeId");
    requireStoredIdentity(event.actor, "actor");
    requireStoredIdentity(event.causationId, "causationId");
    requireStoredIdentity(event.correlationId, "correlationId");
    requireTimestamp(event.occurredAt);
    if (event.projectId !== ledger.projectId)
      corrupt(`Event ${event.id} belongs to a different project.`);
    if (eventIds.has(event.id)) corrupt(`Duplicate event ID: ${event.id}.`);
    eventIds.add(event.id);
    if (event.previousHash !== previousHash)
      corrupt(`Broken previousHash chain at event ${event.id}.`);
    const { hash, ...hashInput } = event;
    if (
      typeof hash !== "string" ||
      hash.length !== 64 ||
      eventHash(hashInput) !== hash
    )
      corrupt(`Invalid hash at event ${event.id}.`);

    if (changeEventTypes.has(event.type)) {
      if (event.waveId !== undefined || event.taskId !== undefined)
        corrupt(`Change event ${event.id} has unexpected entity IDs.`);
      const current = projections.get(event.changeId);
      requireStoredData(event);
      if (event.type === "change.created") {
        assertPayloadKeys(event, ["data", "status"]);
        if (event.payload.status !== "draft" || current)
          corrupt(`Event ${event.id} has an invalid change.created payload.`);
        projections.set(event.changeId, {
          projectId: event.projectId,
          changeId: event.changeId,
          status: "draft",
          sequence: event.sequence,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          createdBy: event.actor,
          lastActor: event.actor,
          details: event.payload.data as JsonObject,
        });
        eventsByChange.set(event.changeId, [event]);
      } else {
        if (!current)
          corrupt(`Transition event ${event.id} precedes change creation.`);
        const target =
          changeTargetForType[
            event.type as keyof typeof changeTargetForType
          ];
        assertPayloadKeys(event, ["data", "from", "to"]);
        if (
          event.payload.from !== current.status ||
          event.payload.to !== target ||
          !legalTargets[current.status].includes(target)
        )
          corrupt(
            `Illegal persisted transition for ${event.changeId}: ${current.status} -> ${target}.`,
          );
        projections.set(event.changeId, {
          ...current,
          status: target,
          sequence: event.sequence,
          updatedAt: event.occurredAt,
          lastActor: event.actor,
        });
        eventsByChange.get(event.changeId)!.push(event);
      }
    } else if (waveEventTypes.has(event.type)) {
      const waveId = requireStoredIdentifier(event.waveId, "waveId");
      if (event.taskId !== undefined)
        corrupt(`Wave event ${event.id} has an unexpected taskId.`);
      const key = waveKey(event.changeId, waveId);
      const current = waves.get(key);
      requireStoredData(event);
      if (event.type === "wave.created") {
        assertPayloadKeys(event, ["data", "dependsOn", "status"]);
        if (event.payload.status !== "draft" || current)
          corrupt(`Event ${event.id} has an invalid wave.created payload.`);
        if (!projections.has(event.changeId))
          corrupt(`Wave ${waveId} precedes change creation.`);
        const dependsOn = requireStoredStringArray(
          event.payload.dependsOn,
          "dependsOn",
        );
        if (dependsOn.includes(waveId))
          corrupt(`Wave ${waveId} cannot depend on itself.`);
        for (const dependencyWaveId of dependsOn) {
          const dependency = waves.get(
            waveKey(event.changeId, dependencyWaveId),
          );
          if (!dependency)
            corrupt(
              `Wave ${waveId} has missing dependency ${dependencyWaveId}.`,
            );
        }
        waves.set(key, {
          projectId: event.projectId,
          changeId: event.changeId,
          waveId,
          status: "draft",
          sequence: event.sequence,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          createdBy: event.actor,
          lastActor: event.actor,
          dependsOn,
          details: event.payload.data as JsonObject,
        });
        eventsByWave.set(key, [event]);
      } else {
        if (!current)
          corrupt(`Wave transition ${event.id} precedes wave creation.`);
        const target =
          waveTargetForType[event.type as keyof typeof waveTargetForType];
        if (event.type === "wave.dispatch-overridden") {
          assertPayloadKeys(event, [
            "data",
            "from",
            "reason",
            "reasons",
            "to",
          ]);
          requireStoredIdentity(event.payload.reason, "reason");
          const expectedReasons = dispatchReadinessReasons(
            current,
            waves,
            tasks,
          );
          if (
            current.status !== "draft" ||
            event.payload.from !== current.status ||
            event.payload.to !== "dispatched" ||
            canonicalJson(event.payload.reasons as JsonValue) !==
              canonicalJson(expectedReasons as unknown as JsonValue)
          )
            corrupt(`Event ${event.id} has an invalid dispatch override.`);
        } else {
          assertPayloadKeys(event, ["data", "from", "to"]);
          if (
            event.payload.from !== current.status ||
            event.payload.to !== target ||
            !legalWaveTargets[current.status].includes(target)
          )
            corrupt(
              `Illegal persisted wave transition for ${waveId}: ${current.status} -> ${target}.`,
            );
          if (
            event.type === "wave.readied" &&
            waveReadinessReasons(current, waves, tasks).length > 0
          )
            corrupt(`Wave ${waveId} was readied with unmet dependencies.`);
          if (
            event.type === "wave.dispatched" &&
            dispatchReadinessReasons(current, waves, tasks).length > 0
          )
            corrupt(`Wave ${waveId} was dispatched while not ready.`);
          if (event.type === "wave.completed") {
            const waveTasks = [...tasks.values()].filter(
              (task) =>
                task.changeId === event.changeId && task.waveId === waveId,
            );
            if (
              waveTasks.length === 0 ||
              waveTasks.some((task) => task.status !== "accepted")
            )
              corrupt(`Wave ${waveId} completed before all tasks were accepted.`);
          }
        }
        waves.set(key, {
          ...current,
          status: target,
          sequence: event.sequence,
          updatedAt: event.occurredAt,
          lastActor: event.actor,
        });
        eventsByWave.get(key)!.push(event);
      }
    } else {
      const waveId = requireStoredIdentifier(event.waveId, "waveId");
      const taskId = requireStoredIdentifier(event.taskId, "taskId");
      const wave = waves.get(waveKey(event.changeId, waveId));
      if (!wave) corrupt(`Task event ${event.id} precedes wave creation.`);
      const key = taskKey(event.changeId, waveId, taskId);
      const current = tasks.get(key);
      requireStoredData(event);
      if (event.type === "task.created") {
        assertPayloadKeys(event, ["data", "dependsOn", "status"]);
        if (event.payload.status !== "pending" || current)
          corrupt(`Event ${event.id} has an invalid task.created payload.`);
        const dependsOn = requireStoredStringArray(
          event.payload.dependsOn,
          "dependsOn",
        );
        if (dependsOn.includes(taskId))
          corrupt(`Task ${taskId} cannot depend on itself.`);
        tasks.set(key, {
          projectId: event.projectId,
          changeId: event.changeId,
          waveId,
          taskId,
          status: "pending",
          sequence: event.sequence,
          createdAt: event.occurredAt,
          updatedAt: event.occurredAt,
          createdBy: event.actor,
          lastActor: event.actor,
          dependsOn,
          details: event.payload.data as JsonObject,
        });
        taskCreatedSequences.set(key, event.sequence);
      } else {
        if (!current)
          corrupt(`Task transition ${event.id} precedes task creation.`);
        const target =
          taskTargetForType[event.type as keyof typeof taskTargetForType];
        assertPayloadKeys(event, ["data", "from", "to"]);
        if (
          event.payload.from !== current.status ||
          event.payload.to !== target ||
          !legalTaskTargets[current.status].includes(target)
        )
          corrupt(
            `Illegal persisted task transition for ${taskId}: ${current.status} -> ${target}.`,
          );
        if (
          event.type === "task.readied" &&
          !taskDependenciesAccepted(current, tasks)
        )
          corrupt(`Task ${taskId} was readied with unmet dependencies.`);
        if (
          event.type === "task.started" &&
          !["dispatched", "running"].includes(wave.status)
        )
          corrupt(`Task ${taskId} started before its wave was dispatched.`);
        tasks.set(key, {
          ...current,
          status: target,
          sequence: event.sequence,
          updatedAt: event.occurredAt,
          lastActor: event.actor,
        });
      }
      eventsByWave.get(waveKey(event.changeId, waveId))!.push(event);
    }
    previousHash = hash;
  });

  for (const wave of waves.values()) assertTaskGraph(wave, tasks);

  return {
    projections,
    waves,
    tasks,
    taskCreatedSequences,
    eventsByChange,
    eventsByWave,
  };
}

function immutableAggregate(
  projection: ChangeProjection,
  events: readonly ChangeControlEvent[],
): ChangeAggregate {
  return deepFreeze({
    change: structuredClone(projection),
    events: structuredClone(events),
  });
}

function publicWaveProjection(
  wave: StoredWaveProjection,
  projected: ProjectedLedger,
): WaveProjection {
  const tasks = [...projected.tasks.values()]
    .filter(
      (task) =>
        task.changeId === wave.changeId && task.waveId === wave.waveId,
    )
    .sort(
      (left, right) =>
        projected.taskCreatedSequences.get(
          taskKey(left.changeId, left.waveId, left.taskId),
        )! -
        projected.taskCreatedSequences.get(
          taskKey(right.changeId, right.waveId, right.taskId),
        )!,
    );
  const reasons = waveReadinessReasons(
    wave,
    projected.waves,
    projected.tasks,
  );
  return {
    ...wave,
    tasks,
    readiness: {
      ready: wave.status === "ready" && reasons.length === 0,
      reasons,
    },
  };
}

function immutableWaveAggregate(
  wave: StoredWaveProjection,
  events: readonly ChangeControlEvent[],
  projected: ProjectedLedger,
): WaveAggregate {
  return deepFreeze({
    wave: structuredClone(publicWaveProjection(wave, projected)),
    events: structuredClone(events),
  });
}

async function readLedger(file: string, projectId: string): Promise<Ledger> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Ledger;
    if (!parsed || typeof parsed !== "object")
      corrupt("The change-control ledger root is invalid.");
    if (parsed.projectId !== projectId)
      corrupt("The change-control ledger project identity does not match its path.");
    validateAndProject(parsed);
    return parsed;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return { version: 1, projectId, events: [] };
    if (error instanceof ChangeControlError) throw error;
    throw new ChangeControlError(
      "The change-control ledger is not valid JSON.",
      "CORRUPT_LEDGER",
      500,
    );
  }
}

async function writeAtomically(file: string, ledger: Ledger) {
  const directory = dirname(file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(directory, { recursive: true });
  const directoryHandle = await open(directory, "r").catch(() => undefined);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx");
    await handle.writeFile(JSON.stringify(ledger, null, 2), "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    await directoryHandle?.sync().catch(() => undefined);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
    throw error;
  } finally {
    await directoryHandle?.close().catch(() => undefined);
  }
}

function normalizeDependencies(value: unknown, field: string) {
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value)) invalid(`${field} must be an array of IDs.`);
  const result = value.map((item) => requireIdentifier(item, field)).sort();
  if (new Set(result).size !== result.length)
    invalid(`${field} cannot contain duplicate IDs.`);
  return result;
}

function normalizeTasks(value: unknown) {
  if (!Array.isArray(value) || value.length === 0)
    invalid("tasks must be a non-empty array.");
  const tasks = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      invalid(`tasks[${index}] must be an object.`);
    const input = candidate as CreateTaskInput;
    return {
      taskId: requireIdentifier(input.taskId, `tasks[${index}].taskId`),
      dependsOn: normalizeDependencies(
        input.dependsOn,
        `tasks[${index}].dependsOn`,
      ),
      payload: normalizePayload(input.payload),
    };
  });
  const byId = new Map<string, (typeof tasks)[number]>();
  for (const task of tasks) {
    if (byId.has(task.taskId))
      invalid(`Duplicate task ID: ${task.taskId}.`);
    byId.set(task.taskId, task);
  }
  for (const task of tasks) {
    if (task.dependsOn.includes(task.taskId))
      invalid(`Task ${task.taskId} cannot depend on itself.`);
    for (const dependencyId of task.dependsOn) {
      if (!byId.has(dependencyId))
        invalid(
          `Task ${task.taskId} has missing dependency ${dependencyId}.`,
        );
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string) => {
    if (visiting.has(taskId))
      invalid("The wave task graph contains a dependency cycle.");
    if (visited.has(taskId)) return;
    visiting.add(taskId);
    for (const dependencyId of byId.get(taskId)!.dependsOn)
      visit(dependencyId);
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.taskId);
  return tasks;
}

export class ChangeControlStore {
  private readonly writeChains = new Map<string, Promise<void>>();
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(
    private readonly rootDirectory: string,
    options: ChangeControlStoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? randomUUID;
  }

  private file(projectId: string) {
    const digest = createHash("sha256").update(projectId).digest("hex");
    return join(this.rootDirectory, "projects", `${digest}.json`);
  }

  private serialize<T>(projectId: string, operation: () => Promise<T>) {
    const previous = this.writeChains.get(projectId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);
    const settled = next.then(() => undefined, () => undefined);
    this.writeChains.set(projectId, settled);
    void settled
      .finally(() => {
        if (this.writeChains.get(projectId) === settled)
          this.writeChains.delete(projectId);
      })
      .catch(() => undefined);
    return next;
  }

  private append(ledger: Ledger, draft: EventDraft) {
    const previous = ledger.events.at(-1);
    const hashInput: Omit<ChangeControlEvent, "hash"> = {
      ...draft,
      sequence: ledger.events.length + 1,
      previousHash: previous?.hash ?? null,
    };
    const event = deepFreeze({
      ...hashInput,
      hash: eventHash(hashInput),
    }) as ChangeControlEvent;
    ledger.events.push(event);
    return event;
  }

  private refreshTaskReadiness(
    ledger: Ledger,
    changeId: string,
    waveId: string,
    actor: string,
    causationId: string,
    correlationId: string,
  ) {
    let projected = validateAndProject(ledger);
    const pending = [...projected.tasks.values()]
      .filter(
        (task) =>
          task.changeId === changeId &&
          task.waveId === waveId &&
          task.status === "pending",
      )
      .sort(
        (left, right) =>
          projected.taskCreatedSequences.get(
            taskKey(left.changeId, left.waveId, left.taskId),
          )! -
          projected.taskCreatedSequences.get(
            taskKey(right.changeId, right.waveId, right.taskId),
          )!,
      );
    for (const task of pending) {
      const current = projected.tasks.get(
        taskKey(changeId, waveId, task.taskId),
      )!;
      if (!taskDependenciesAccepted(current, projected.tasks)) continue;
      this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type: "task.readied",
        occurredAt: this.now(),
        projectId: ledger.projectId,
        changeId,
        waveId,
        taskId: task.taskId,
        actor,
        causationId,
        correlationId,
        payload: { from: "pending", to: "ready", data: {} },
      });
      projected = validateAndProject(ledger);
    }
  }

  private refreshWaveReadiness(
    ledger: Ledger,
    changeId: string,
    actor: string,
    causationId: string,
  ) {
    let projected = validateAndProject(ledger);
    const drafts = [...projected.waves.values()]
      .filter(
        (wave) => wave.changeId === changeId && wave.status === "draft",
      )
      .sort((left, right) => left.sequence - right.sequence);
    for (const wave of drafts) {
      const current = projected.waves.get(waveKey(changeId, wave.waveId))!;
      if (
        waveReadinessReasons(
          current,
          projected.waves,
          projected.tasks,
        ).length > 0
      )
        continue;
      const firstEvent = projected.eventsByWave.get(
        waveKey(changeId, wave.waveId),
      )![0];
      this.append(ledger, {
        id: requireIdentifier(this.createId(), "id"),
        type: "wave.readied",
        occurredAt: this.now(),
        projectId: ledger.projectId,
        changeId,
        waveId: wave.waveId,
        actor,
        causationId,
        correlationId: firstEvent.correlationId,
        payload: { from: "draft", to: "ready", data: {} },
      });
      projected = validateAndProject(ledger);
    }
  }

  async create(
    projectIdValue: string,
    input: CreateChangeInput,
  ): Promise<ChangeAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const actor = requireIdentity(input?.actor, "actor");
    const changeId = requireIdentifier(
      input?.changeId ?? this.createId(),
      "changeId",
    );
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const current = validateAndProject(ledger);
      if (current.projections.has(changeId))
        throw new ChangeControlError(
          `Change ${changeId} already exists.`,
          "CONFLICT",
          409,
        );
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: "change.created",
        occurredAt: this.now(),
        projectId,
        changeId,
        actor,
        causationId: requireIdentity(input.causationId ?? id, "causationId"),
        correlationId: requireIdentity(
          input.correlationId ?? changeId,
          "correlationId",
        ),
        payload: { status: "draft", data },
      });
      const projected = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableAggregate(
        projected.projections.get(changeId)!,
        projected.eventsByChange.get(changeId)!,
      );
    });
  }

  async list(projectIdValue: string): Promise<readonly ChangeProjection[]> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const { projections } = validateAndProject(ledger);
    return deepFreeze(
      [...projections.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .map((projection) => structuredClone(projection)),
    );
  }

  async get(
    projectIdValue: string,
    changeIdValue: string,
  ): Promise<ChangeAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    const projection = projected.projections.get(changeId);
    if (!projection)
      throw new ChangeControlError(
        `Change ${changeId} was not found.`,
        "NOT_FOUND",
        404,
      );
    return immutableAggregate(
      projection,
      projected.eventsByChange.get(changeId)!,
    );
  }

  async transition(
    projectIdValue: string,
    changeIdValue: string,
    input: TransitionChangeInput,
  ): Promise<ChangeAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const actor = requireIdentity(input?.actor, "actor");
    const target = input?.to;
    if (
      target === "draft" ||
      !["planned", "active", "completed", "cancelled"].includes(target)
    )
      invalid(`Unknown or unsupported change transition target: ${String(target)}.`);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const current = projected.projections.get(changeId);
      if (!current)
        throw new ChangeControlError(
          `Change ${changeId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (!legalTargets[current.status].includes(target))
        throw new ChangeControlError(
          `Illegal change transition: ${current.status} -> ${target}.`,
          "CONFLICT",
          409,
        );
      const id = requireIdentifier(this.createId(), "id");
      const changeEvents = projected.eventsByChange.get(changeId)!;
      const previousEvent = changeEvents.at(-1)!;
      const firstEvent = changeEvents[0];
      this.append(ledger, {
        id,
        type: typeForTarget[target],
        occurredAt: this.now(),
        projectId,
        changeId,
        actor,
        causationId: requireIdentity(
          input.causationId ?? previousEvent.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? firstEvent.correlationId,
          "correlationId",
        ),
        payload: { from: current.status, to: target, data },
      });
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableAggregate(
        next.projections.get(changeId)!,
        next.eventsByChange.get(changeId)!,
      );
    });
  }

  async createWave(
    projectIdValue: string,
    changeIdValue: string,
    input: CreateWaveInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const actor = requireIdentity(input?.actor, "actor");
    const waveId = requireIdentifier(
      input?.waveId ?? this.createId(),
      "waveId",
    );
    const dependsOn = normalizeDependencies(input?.dependsOn, "dependsOn");
    if (dependsOn.includes(waveId))
      invalid(`Wave ${waveId} cannot depend on itself.`);
    const tasks = normalizeTasks(input?.tasks);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const change = projected.projections.get(changeId);
      if (!change)
        throw new ChangeControlError(
          `Change ${changeId} was not found.`,
          "NOT_FOUND",
          404,
        );
      if (["completed", "cancelled"].includes(change.status))
        throw new ChangeControlError(
          `Cannot add a wave to ${change.status} change ${changeId}.`,
          "CONFLICT",
          409,
        );
      if (projected.waves.has(waveKey(changeId, waveId)))
        throw new ChangeControlError(
          `Wave ${waveId} already exists in change ${changeId}.`,
          "CONFLICT",
          409,
        );
      for (const dependencyWaveId of dependsOn) {
        if (!projected.waves.has(waveKey(changeId, dependencyWaveId)))
          invalid(
            `Wave ${waveId} has missing dependency ${dependencyWaveId}.`,
          );
      }

      const changeEvents = projected.eventsByChange.get(changeId)!;
      const waveEventId = requireIdentifier(this.createId(), "id");
      const causationId = requireIdentity(
        input.causationId ?? changeEvents.at(-1)!.id,
        "causationId",
      );
      const correlationId = requireIdentity(
        input.correlationId ?? changeEvents[0].correlationId,
        "correlationId",
      );
      this.append(ledger, {
        id: waveEventId,
        type: "wave.created",
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        actor,
        causationId,
        correlationId,
        payload: { status: "draft", dependsOn, data },
      });
      for (const task of tasks) {
        this.append(ledger, {
          id: requireIdentifier(this.createId(), "id"),
          type: "task.created",
          occurredAt: this.now(),
          projectId,
          changeId,
          waveId,
          taskId: task.taskId,
          actor,
          causationId: waveEventId,
          correlationId,
          payload: {
            status: "pending",
            dependsOn: task.dependsOn,
            data: task.payload,
          },
        });
      }
      this.refreshTaskReadiness(
        ledger,
        changeId,
        waveId,
        actor,
        waveEventId,
        correlationId,
      );
      this.refreshWaveReadiness(
        ledger,
        changeId,
        actor,
        waveEventId,
      );
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      const wave = next.waves.get(waveKey(changeId, waveId))!;
      return immutableWaveAggregate(
        wave,
        next.eventsByWave.get(waveKey(changeId, waveId))!,
        next,
      );
    });
  }

  async listWaves(
    projectIdValue: string,
    changeIdValue: string,
  ): Promise<readonly WaveProjection[]> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    if (!projected.projections.has(changeId))
      throw new ChangeControlError(
        `Change ${changeId} was not found.`,
        "NOT_FOUND",
        404,
      );
    return deepFreeze(
      [...projected.waves.values()]
        .filter((wave) => wave.changeId === changeId)
        .sort((left, right) => left.sequence - right.sequence)
        .map((wave) =>
          structuredClone(publicWaveProjection(wave, projected)),
        ),
    );
  }

  async getWave(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    const wave = projected.waves.get(waveKey(changeId, waveId));
    if (!wave)
      throw new ChangeControlError(
        `Wave ${waveId} was not found in change ${changeId}.`,
        "NOT_FOUND",
        404,
      );
    return immutableWaveAggregate(
      wave,
      projected.eventsByWave.get(waveKey(changeId, waveId))!,
      projected,
    );
  }

  async dispatchWave(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: DispatchWaveInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const actor = requireIdentity(input?.actor, "actor");
    const sendAnyway = input?.sendAnyway === true;
    const reason = sendAnyway
      ? requireIdentity(input?.reason, "reason")
      : undefined;
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const key = waveKey(changeId, waveId);
      const wave = projected.waves.get(key);
      if (!wave)
        throw new ChangeControlError(
          `Wave ${waveId} was not found in change ${changeId}.`,
          "NOT_FOUND",
          404,
        );
      const reasons = dispatchReadinessReasons(
        wave,
        projected.waves,
        projected.tasks,
      );
      if (reasons.length > 0 && !sendAnyway)
        throw new ChangeControlError(
          `Wave ${waveId} is not ready for dispatch.`,
          "NOT_READY",
          409,
          deepFreeze(structuredClone(reasons)),
        );
      if (reasons.length > 0 && wave.status !== "draft")
        throw new ChangeControlError(
          `Send-anyway cannot dispatch a ${wave.status} wave.`,
          "CONFLICT",
          409,
        );
      const waveEvents = projected.eventsByWave.get(key)!;
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type:
          reasons.length > 0
            ? "wave.dispatch-overridden"
            : "wave.dispatched",
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        actor,
        causationId: requireIdentity(
          input.causationId ?? waveEvents.at(-1)!.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload:
          reasons.length > 0
            ? {
                from: wave.status,
                to: "dispatched",
                reason: reason!,
                reasons: structuredClone(reasons) as unknown as JsonValue,
                data,
              }
            : { from: "ready", to: "dispatched", data },
      });
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableWaveAggregate(
        next.waves.get(key)!,
        next.eventsByWave.get(key)!,
        next,
      );
    });
  }

  async transitionWave(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    input: TransitionWaveInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const actor = requireIdentity(input?.actor, "actor");
    const target = input?.to;
    if (!["running", "completed", "halted"].includes(target))
      invalid(`Unknown or unsupported wave transition target: ${String(target)}.`);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const key = waveKey(changeId, waveId);
      const wave = projected.waves.get(key);
      if (!wave)
        throw new ChangeControlError(
          `Wave ${waveId} was not found in change ${changeId}.`,
          "NOT_FOUND",
          404,
        );
      if (!legalWaveTargets[wave.status].includes(target))
        throw new ChangeControlError(
          `Illegal wave transition: ${wave.status} -> ${target}.`,
          "CONFLICT",
          409,
        );
      if (
        target === "completed" &&
        [...projected.tasks.values()].some(
          (task) =>
            task.changeId === changeId &&
            task.waveId === waveId &&
            task.status !== "accepted",
        )
      )
        throw new ChangeControlError(
          `Wave ${waveId} cannot complete before all tasks are accepted.`,
          "CONFLICT",
          409,
        );
      const waveEvents = projected.eventsByWave.get(key)!;
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: waveTypeForTarget[target],
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        actor,
        causationId: requireIdentity(
          input.causationId ?? waveEvents.at(-1)!.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload: { from: wave.status, to: target, data },
      });
      if (target === "completed")
        this.refreshWaveReadiness(ledger, changeId, actor, id);
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableWaveAggregate(
        next.waves.get(key)!,
        next.eventsByWave.get(key)!,
        next,
      );
    });
  }

  async transitionTask(
    projectIdValue: string,
    changeIdValue: string,
    waveIdValue: string,
    taskIdValue: string,
    input: TransitionTaskInput,
  ): Promise<WaveAggregate> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const changeId = requireIdentifier(changeIdValue, "changeId");
    const waveId = requireIdentifier(waveIdValue, "waveId");
    const taskId = requireIdentifier(taskIdValue, "taskId");
    const actor = requireIdentity(input?.actor, "actor");
    const target = input?.to;
    if (!["running", "accepted", "failed", "halted"].includes(target))
      invalid(`Unknown or unsupported task transition target: ${String(target)}.`);
    const data = normalizePayload(input?.payload);

    return this.serialize(projectId, async () => {
      const file = this.file(projectId);
      const ledger = await readLedger(file, projectId);
      const projected = validateAndProject(ledger);
      const waveLookupKey = waveKey(changeId, waveId);
      const wave = projected.waves.get(waveLookupKey);
      const key = taskKey(changeId, waveId, taskId);
      const task = projected.tasks.get(key);
      if (!wave || !task)
        throw new ChangeControlError(
          `Task ${taskId} was not found in wave ${waveId}.`,
          "NOT_FOUND",
          404,
        );
      if (!legalTaskTargets[task.status].includes(target))
        throw new ChangeControlError(
          `Illegal task transition: ${task.status} -> ${target}.`,
          "CONFLICT",
          409,
        );
      if (
        target === "running" &&
        !["dispatched", "running"].includes(wave.status)
      )
        throw new ChangeControlError(
          `Task ${taskId} cannot start before wave ${waveId} is dispatched.`,
          "CONFLICT",
          409,
        );
      const waveEvents = projected.eventsByWave.get(waveLookupKey)!;
      const taskEvents = waveEvents.filter(
        (event) => event.taskId === taskId,
      );
      const id = requireIdentifier(this.createId(), "id");
      this.append(ledger, {
        id,
        type: taskTypeForTarget[target],
        occurredAt: this.now(),
        projectId,
        changeId,
        waveId,
        taskId,
        actor,
        causationId: requireIdentity(
          input.causationId ?? taskEvents.at(-1)!.id,
          "causationId",
        ),
        correlationId: requireIdentity(
          input.correlationId ?? waveEvents[0].correlationId,
          "correlationId",
        ),
        payload: { from: task.status, to: target, data },
      });
      if (target === "accepted")
        this.refreshTaskReadiness(
          ledger,
          changeId,
          waveId,
          actor,
          id,
          waveEvents[0].correlationId,
        );
      const next = validateAndProject(ledger);
      await writeAtomically(file, ledger);
      return immutableWaveAggregate(
        next.waves.get(waveLookupKey)!,
        next.eventsByWave.get(waveLookupKey)!,
        next,
      );
    });
  }

  async executionBucket(
    projectIdValue: string,
  ): Promise<readonly ExecutionBucketItem[]> {
    const projectId = requireIdentifier(projectIdValue, "projectId");
    const ledger = await readLedger(this.file(projectId), projectId);
    const projected = validateAndProject(ledger);
    const items = [...projected.waves.values()]
      .filter(
        (wave) =>
          wave.status === "ready" &&
          waveReadinessReasons(
            wave,
            projected.waves,
            projected.tasks,
          ).length === 0,
      )
      .map((wave) => ({
        projectId,
        changeId: wave.changeId,
        waveId: wave.waveId,
        readyAt: wave.updatedAt,
        readySequence: wave.sequence,
      }))
      .sort(
        (left, right) =>
          left.readySequence - right.readySequence ||
          left.waveId.localeCompare(right.waveId),
      );
    return deepFreeze(structuredClone(items));
  }
}
