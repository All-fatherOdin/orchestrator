export const EXECUTOR_OUTCOME_MARKER_V1 = "ORCHESTRATOR_EXECUTOR_OUTCOME_V1";

function uniqueCommands(project, task) {
  return [...(project.verificationCommands ?? []), ...(task.verificationCommands ?? [])]
    .filter((command, index, commands) => commands.indexOf(command) === index);
}

function freezeContract(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeContract(child);
  }
  return value;
}

function parseTaskContract(prompt) {
  const match = prompt.match(
    /^Goal: ([^\r\n]+)\r?\nSuccess criteria:\r?\n((?:- [^\r\n]+\r?\n)+)Output requirements:\r?\n((?:- [^\r\n]+(?:\r?\n|$))+)$/
  );
  if (!match) {
    return {
      goal: undefined,
      successCriteria: undefined,
      outputRequirements: undefined,
    };
  }
  const items = (block) =>
    block
      .trim()
      .split(/\r?\n/)
      .map((line) => line.slice(2));
  return {
    goal: match[1],
    successCriteria: items(match[2]),
    outputRequirements: items(match[3]),
  };
}

/**
 * Production-owned projection of every semantic input consumed by buildPrompt.
 * Both legacy rendering and isolated compact benchmarks consume this shape.
 */
export function createLegacyPromptContractV1({ task, project, authorization }) {
  const taskContract = parseTaskContract(task.prompt);
  return freezeContract({
    task: task.prompt,
    ...taskContract,
    allowedPaths: [...(task.allowedPaths ?? [])],
    verificationCommands: uniqueCommands(project, task),
    executionGuards: [...(task.executionGuards ?? [])],
    context: task.context
      ? {
          version: 1,
          provider: task.context.provider,
          fallbackReason: task.context.fallbackReason ?? "",
          sources: task.context.bundle.sources.map((source) => ({
            path: source.path,
            priority: source.priority,
            authority: source.authority,
            inclusionReason: source.inclusion_reason,
          })),
        }
      : undefined,
    authorization: {
      enabled: authorization.enabled,
      decision: authorization.decision,
      reason: authorization.reason,
      intent: authorization.intent,
      technicalPermission: authorization.technicalPermission,
      sideEffectRisk: authorization.sideEffectRisk,
      scopeFingerprint: authorization.scopeFingerprint,
      allowedPaths: [...(authorization.allowedPaths ?? [])],
      verificationCommands: [...(authorization.verificationCommands ?? [])],
    },
    executorOutcomeContractVersion: task.executorOutcomeContractVersion,
  });
}

/**
 * The production legacy prompt renderer. Keep its output byte-for-byte aligned
 * with the pre-extraction buildPrompt implementation.
 */
export function renderLegacyPromptV1(input) {
  const paths = input.allowedPaths.length
    ? `\nAllowed paths: ${input.allowedPaths.join(", ")}`
    : "";
  const authorization = input.authorization;
  const checks = authorization.enabled
    ? authorization.verificationCommands.length
      ? `\n- Do not run verification commands yourself. The orchestrator's verification phase may run only these declared commands:\n${authorization.verificationCommands.map((command) => `  - ${command}`).join("\n")}`
      : "\n- No verification commands are authorized; do not invent or run substitutes."
    : input.verificationCommands.length
      ? `\n- Run these verification commands when relevant:\n${input.verificationCommands.map((command) => `  - ${command}`).join("\n")}`
      : "\n- Run relevant verification commands.";
  const guards = input.executionGuards.length
    ? `\n- Stop if any execution guard applies:\n${input.executionGuards.map((guard) => `  - ${guard}`).join("\n")}`
    : "";
  const context = input.context
    ? `\n\nContext Contract v1 (${input.context.provider}${input.context.fallbackReason ? `; controlled fallback: ${input.context.fallbackReason}` : ""}):\n${input.context.sources.map((source) => `- ${source.path} [${source.priority}; ${source.authority}] — ${source.inclusionReason}`).join("\n")}`
    : "";
  const authorizationBoundary = authorization.enabled
    ? `\n- Authorization boundary: ${authorization.decision} (${authorization.reason}). Intent=${authorization.intent}; permission=${authorization.technicalPermission}; risk=${authorization.sideEffectRisk}; scope=${authorization.scopeFingerprint}. The sandbox does not command-allowlist executor shell commands; this contract does not pre-authorize arbitrary commands. Do not perform any action outside this exact contract.`
    : "";
  const executorOutcomeContract = input.executorOutcomeContractVersion === 1
    ? `\n- Executor outcome contract v1 (required): End the final response with exactly one standalone line \`${EXECUTOR_OUTCOME_MARKER_V1}: COMPLETED\` only if the requested outcome was delivered. If an execution guard applies or the outcome was not delivered, use \`${EXECUTOR_OUTCOME_MARKER_V1}: STOPPED\` instead.`
    : "";
  return `Work on this single task in the current repository.\n\nTask: ${input.task}${paths}${context}\n\nRequirements:\n- Read repository instructions, especially AGENTS.md, before changing code.\n- Keep changes within the task scope.${checks}${guards}${authorizationBoundary}\n- Do not create git commits.\n- Finish with changed files, checks run, and remaining risks.${executorOutcomeContract}`;
}

export function renderProductionLegacyPromptV1(args) {
  return renderLegacyPromptV1(createLegacyPromptContractV1(args));
}
