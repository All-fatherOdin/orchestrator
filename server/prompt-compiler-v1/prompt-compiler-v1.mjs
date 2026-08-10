export const PROMPT_COMPILER_V1 = "OPC/1";
export const EXECUTOR_OUTCOME_MARKER_V1 = "ORCHESTRATOR_EXECUTOR_OUTCOME_V1";

export const PROTECTED_INVARIANTS_V1 = Object.freeze({
  singleTask: "One current-repository task.",
  repositoryInstructions:
    "Read AGENTS.md and repository instructions before edits.",
  taskScope: "Only task scope may change.",
  noCommit: "No commits.",
  completionReport: "Finish: changed files, checks run, remaining risks.",
  arbitraryCommands:
    "Shell has no command allowlist; AUTHZ grants no arbitrary commands.",
  authorizationBoundary: "Only AUTHZ actions.",
  verificationOwner:
    "Executor: no verification. Orchestrator: only listed commands:",
  stopSemantics: "Any guard: stop; report STOPPED.",
});

const STABLE_PREFIX = [
  PROMPT_COMPILER_V1,
  PROTECTED_INVARIANTS_V1.singleTask,
  PROTECTED_INVARIANTS_V1.repositoryInstructions,
  PROTECTED_INVARIANTS_V1.taskScope,
  PROTECTED_INVARIANTS_V1.noCommit,
].join("\n");

const RESERVED_CONTROL_LINES = new Set([
  "GOAL",
  "SUCCESS",
  "OUTPUT",
  "ALLOWED",
  "AUTHZ",
  "SOURCES path|priority|authority|why",
  "VERIFY",
  "STOP",
  "FINAL",
]);

function requireObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object.`);
  }
  return value;
}

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
  const text = value.trim();
  if (/[\r\n]/.test(text)) {
    throw new TypeError(`${name} must be a single line.`);
  }
  return text;
}

function requireCompactText(value, name, { record = false } = {}) {
  const text = requireText(value, name);
  if (RESERVED_CONTROL_LINES.has(text)) {
    throw new TypeError(`${name} cannot equal a reserved control line.`);
  }
  if (record && text.includes("|")) {
    throw new TypeError(`${name} cannot contain the reserved delimiter "|".`);
  }
  return text;
}

function requirePromptText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be non-empty text.`);
  }
  return value;
}

function requireTextList(value, name, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${name} must be ${allowEmpty ? "an" : "a non-empty"} array.`);
  }
  return value.map((item, index) => requireText(item, `${name}[${index}]`));
}

function requireCompactTextList(value, name, options = {}) {
  const { allowEmpty = false, record = false } = options;
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${name} must be ${allowEmpty ? "an" : "a non-empty"} array.`);
  }
  return value.map((item, index) =>
    requireCompactText(item, `${name}[${index}]`, { record }),
  );
}

function list(items, empty = "(none)") {
  return items.length ? items.join("\n") : empty;
}

function sameOrderedValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeContext(value) {
  const context = requireObject(value, "context");
  if (context.version !== 1) {
    throw new TypeError("context.version must be 1.");
  }
  const sources = context.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new TypeError("context.sources must be a non-empty array.");
  }
  return {
    provider: requireCompactText(context.provider, "context.provider", { record: true }),
    fallbackReason: context.fallbackReason
      ? requireCompactText(context.fallbackReason, "context.fallbackReason", { record: true })
      : "",
    sources: sources.map((value, index) => {
      const source = requireObject(value, `context.sources[${index}]`);
      return {
        path: requireCompactText(source.path, `context.sources[${index}].path`, {
          record: true,
        }),
        priority: requireCompactText(source.priority, `context.sources[${index}].priority`, {
          record: true,
        }),
        authority: requireCompactText(
          source.authority,
          `context.sources[${index}].authority`,
          { record: true },
        ),
        inclusionReason: requireCompactText(
          source.inclusionReason,
          `context.sources[${index}].inclusionReason`,
          { record: true },
        ),
      };
    }),
  };
}

function normalizeAuthorization(value, verificationCommands) {
  const authorization = requireObject(value, "authorization");
  if (authorization.enabled !== true) {
    throw new TypeError("authorization.enabled must be true.");
  }
  if (authorization.decision !== "authorized") {
    throw new Error("authorization decision must be authorized.");
  }
  const normalized = {
    decision: authorization.decision,
    reason: requireCompactText(authorization.reason, "authorization.reason", { record: true }),
    intent: requireCompactText(authorization.intent, "authorization.intent", { record: true }),
    technicalPermission: requireCompactText(
      authorization.technicalPermission,
      "authorization.technicalPermission",
      { record: true },
    ),
    sideEffectRisk: requireCompactText(
      authorization.sideEffectRisk,
      "authorization.sideEffectRisk",
      { record: true },
    ),
    scopeFingerprint: requireCompactText(
      authorization.scopeFingerprint,
      "authorization.scopeFingerprint",
      { record: true },
    ),
    allowedPaths: requireCompactTextList(authorization.allowedPaths, "authorization.allowedPaths", {
      allowEmpty: true,
    }),
    verificationCommands: requireCompactTextList(
      authorization.verificationCommands,
      "authorization.verificationCommands",
      { allowEmpty: true },
    ),
  };
  if (!sameOrderedValues(normalized.verificationCommands, verificationCommands)) {
    throw new Error(
      "authorization verification commands must exactly match task verification commands.",
    );
  }
  if (
    normalized.intent !== "apply" &&
    (normalized.technicalPermission !== "read_only" ||
      normalized.sideEffectRisk !== "none")
  ) {
    throw new Error("non-apply authorization must be read-only with no side-effect risk.");
  }
  if (
    normalized.intent !== "apply" &&
    normalized.allowedPaths.length
  ) {
    throw new Error("non-apply authorization cannot declare writable allowed paths.");
  }
  return normalized;
}

function assertProtectedInvariants(prompt, requiredIds) {
  for (const [id, invariant] of Object.entries(PROTECTED_INVARIANTS_V1)) {
    const occurrences = prompt.split(invariant).length - 1;
    if (occurrences > 1 || (requiredIds.has(id) && occurrences !== 1)) {
      throw new Error(
        `Protected invariant ${id} must appear exactly once; found ${occurrences}.`,
      );
    }
  }
}

function genericList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function compileGenericStablePrefix(governanceValue) {
  const governance = requireObject(governanceValue, "governance");
  const version = requireText(governance.version, "governance.version");
  if (!Array.isArray(governance.requiredInvariants) || !governance.requiredInvariants.length) {
    throw new TypeError("governance.requiredInvariants must be a non-empty array.");
  }
  const invariants = governance.requiredInvariants.map((value, index) => {
    const invariant = requireObject(value, `governance.requiredInvariants[${index}]`);
    return {
      id: requireText(invariant.id, `governance.requiredInvariants[${index}].id`),
      text: requireText(invariant.text, `governance.requiredInvariants[${index}].text`),
    };
  });
  const rules = requireTextList(governance.rules, "governance.rules");
  return {
    invariants,
    prefix: [
      `# Stable Governance Contract (${version})`,
      "## Required Invariants",
      genericList(invariants.map(({ id, text }) => `[${id}] ${text}`)),
      "## Governance Rules",
      genericList(rules),
    ].join("\n\n"),
  };
}

function compileGenericCompatibility({ governance, toolContract: toolValue, task: taskValue }) {
  const { invariants, prefix } = compileGenericStablePrefix(governance);
  const toolContract = requireObject(toolValue, "toolContract");
  const task = requireObject(taskValue, "task");
  const toolVersion = requireText(toolContract.version, "toolContract.version");
  const allowedTools = requireTextList(toolContract.allowedTools, "toolContract.allowedTools");
  const toolRules = requireTextList(toolContract.rules, "toolContract.rules");
  const goal = requireText(task.goal, "task.goal");
  const success = requireTextList(task.successCriteria, "task.successCriteria");
  const output = requireText(task.outputContract, "task.outputContract");
  const scope = requireTextList(task.allowedScope, "task.allowedScope");
  const verification = requireTextList(task.verificationCommands, "task.verificationCommands");
  const stops = requireTextList(task.stopRules, "task.stopRules");
  const prompt = [
    prefix,
    `# Tool Contract (${toolVersion})`,
    "## Allowed Tools",
    genericList(allowedTools),
    "## Tool Rules",
    genericList(toolRules),
    "# Dynamic Task Data",
    "## Goal",
    goal,
    "## Success Criteria",
    genericList(success),
    "## Output Contract",
    output,
    "## Allowed Scope",
    genericList(scope),
    "## Verification Commands",
    genericList(verification),
    "## Stop Rules",
    genericList(stops),
  ].join("\n\n");
  for (const invariant of invariants) {
    const occurrences = prompt.split(invariant.text).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Required invariant ${invariant.id} must appear exactly once; found ${occurrences}.`,
      );
    }
  }
  return prompt;
}

export function compileStablePrefixV1(input) {
  if (input?.governance) {
    return compileGenericStablePrefix(input.governance);
  }
  return STABLE_PREFIX;
}

/**
 * Compiles the semantic fields represented by the current production
 * buildPrompt(task, project) contract. Runtime state and volatile values are
 * deliberately outside the accepted projection and are never rendered.
 */
export function compilePromptV1(input) {
  requireObject(input, "input");
  if (input.governance && input.toolContract && input.task) {
    return compileGenericCompatibility(input);
  }
  if (input.executorOutcomeContractVersion !== 1) {
    throw new Error("Executor outcome contract v1 is required.");
  }

  const task = requirePromptText(input.task, "task");
  const goal = requireCompactText(input.goal, "goal");
  const successCriteria = requireCompactTextList(input.successCriteria, "successCriteria");
  const outputRequirements = requireCompactTextList(input.outputRequirements, "outputRequirements");
  const reconstructedTask = [
    `Goal: ${goal}`,
    "Success criteria:",
    ...successCriteria.map((criterion) => `- ${criterion}`),
    "Output requirements:",
    ...outputRequirements.map((requirement) => `- ${requirement}`),
  ].join("\n");
  if (task !== reconstructedTask) {
    throw new Error("task and projected goal/success/output semantics must exactly match.");
  }
  const allowedPaths = requireCompactTextList(input.allowedPaths, "allowedPaths", {
    allowEmpty: true,
  });
  const verificationCommands = requireCompactTextList(
    input.verificationCommands,
    "verificationCommands",
    { allowEmpty: true },
  );
  const executionGuards = requireCompactTextList(input.executionGuards, "executionGuards", {
    allowEmpty: true,
  });
  const context = normalizeContext(input.context);
  const authorization = normalizeAuthorization(input.authorization, verificationCommands);
  const readOnly = authorization.intent !== "apply";

  if (readOnly && allowedPaths.length) {
    throw new Error("read-only authorization cannot declare writable allowed paths.");
  }
  if (!readOnly && allowedPaths.length === 0) {
    throw new Error("apply authorization requires at least one allowed path.");
  }
  if (!readOnly && !sameOrderedValues(authorization.allowedPaths, allowedPaths)) {
    throw new Error("authorization allowed paths must exactly match task allowed paths.");
  }
  const authorizationLines = [
    authorization.technicalPermission === authorization.sideEffectRisk
      ? `${authorization.decision}(${authorization.reason})|intent=${authorization.intent}|permission+risk=${authorization.technicalPermission}|scope=${authorization.scopeFingerprint}`
      : `${authorization.decision}(${authorization.reason})|intent=${authorization.intent}|permission=${authorization.technicalPermission}|risk=${authorization.sideEffectRisk}|scope=${authorization.scopeFingerprint}`,
    PROTECTED_INVARIANTS_V1.arbitraryCommands,
    PROTECTED_INVARIANTS_V1.authorizationBoundary,
  ];
  if (readOnly) {
    authorizationLines.push("Do not modify files or cause side effects.");
  }

  const verificationLines = authorization.verificationCommands.length
    ? [
        PROTECTED_INVARIANTS_V1.verificationOwner,
        list(authorization.verificationCommands),
      ]
    : ["No verification commands are authorized; do not invent or run substitutes."];

  const outcomeContract =
    `Exactly one standalone final line: ${EXECUTOR_OUTCOME_MARKER_V1}: COMPLETED iff delivered and no guard; otherwise ${EXECUTOR_OUTCOME_MARKER_V1}: STOPPED.`;
  const prompt = [
    STABLE_PREFIX,
    "GOAL",
    goal,
    "SUCCESS",
    list(successCriteria),
    "OUTPUT",
    list(outputRequirements),
    "ALLOWED",
    list(allowedPaths, "(read-only; no writable paths)"),
    "AUTHZ",
    authorizationLines.join("\n"),
    "SOURCES path|priority|authority|why",
    `v1|provider=${context.provider}${context.fallbackReason ? `|fallback=${context.fallbackReason}` : ""}`,
    ...context.sources.map(
      (source) =>
        `${source.path}|${source.priority}|${source.authority}|${source.inclusionReason}`,
    ),
    "VERIFY",
    ...verificationLines,
    ...(executionGuards.length
      ? ["STOP", PROTECTED_INVARIANTS_V1.stopSemantics, list(executionGuards)]
      : []),
    "FINAL",
    PROTECTED_INVARIANTS_V1.completionReport,
    outcomeContract,
  ].join("\n");

  const requiredIds = new Set([
    "singleTask",
    "repositoryInstructions",
    "taskScope",
    "noCommit",
    "completionReport",
    "authorizationBoundary",
    "arbitraryCommands",
    ...(executionGuards.length ? ["stopSemantics"] : []),
    ...(authorization.verificationCommands.length ? ["verificationOwner"] : []),
  ]);
  assertProtectedInvariants(prompt, requiredIds);
  for (const outcome of ["COMPLETED", "STOPPED"]) {
    const marker = `${EXECUTOR_OUTCOME_MARKER_V1}: ${outcome}`;
    const occurrences = prompt.split(marker).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Executor outcome marker ${outcome} must appear exactly once; found ${occurrences}.`,
      );
    }
  }
  return prompt;
}

export function comparePromptSizes({ legacyPrompt, compiledPrompt }) {
  const legacyBytes = Buffer.byteLength(requirePromptText(legacyPrompt, "legacyPrompt"), "utf8");
  const compiledBytes = Buffer.byteLength(requirePromptText(compiledPrompt, "compiledPrompt"), "utf8");
  return Object.freeze({
    legacyBytes,
    compiledBytes,
    deltaBytes: compiledBytes - legacyBytes,
    ratio: compiledBytes / legacyBytes,
  });
}
