import thresholds from "./thresholds.json";

export const RESPONSES_MULTI_AGENT_PILOT_VERSION =
  "responses-multi-agent-pilot-v1";

/**
 * This module is an offline decision contract, not a production adapter.
 * The active server does not import it and there is intentionally no
 * environment variable that can turn Responses API delegation on.
 */
export const RESPONSES_MULTI_AGENT_PRODUCTION_ENABLED = false as const;

export type PilotCompatibilityV1 = {
  responsesApiMultiAgent: boolean;
  maxToolCalls: boolean;
  explicitCompaction: boolean;
  reasoningSummary: boolean;
  providerRuntimeRoute: boolean;
  productionDisabled: boolean;
};

export function assertPilotShapeV1(input: {
  subagentCount: number;
  rootSynthesisCount: number;
  writeScopes: readonly (readonly string[])[];
}) {
  if (
    !Number.isInteger(input.subagentCount) ||
    input.subagentCount < 1 ||
    input.subagentCount > thresholds.execution.maximumConcurrentSubagents
  ) {
    throw new Error(
      `Responses API pilot permits 1-${thresholds.execution.maximumConcurrentSubagents} subagents.`,
    );
  }
  if (
    input.rootSynthesisCount !== thresholds.execution.requiredRootSyntheses
  ) {
    throw new Error("Responses API pilot requires exactly one root synthesis.");
  }
  const owners = new Map<string, number>();
  input.writeScopes.forEach((scope, owner) => {
    if (scope.length === 0)
      throw new Error(`Subagent ${owner + 1} has no bounded write scope.`);
    scope.forEach((path) => {
      const normalized = path
        .replaceAll("\\", "/")
        .replace(/^\.\/|\/$/g, "")
        .toLowerCase();
      for (const [ownedPath, previous] of owners) {
        if (
          normalized === ownedPath ||
          normalized.startsWith(`${ownedPath}/`) ||
          ownedPath.startsWith(`${normalized}/`)
        )
          throw new Error(
            `Write scope ${path} overlaps subagents ${previous + 1} and ${owner + 1}.`,
          );
      }
      owners.set(normalized, owner);
    });
  });
  return true;
}

export function compatibilityGateV1(
  compatibility: PilotCompatibilityV1,
): "GO" | "NO" {
  return compatibility.responsesApiMultiAgent &&
    compatibility.maxToolCalls &&
    compatibility.explicitCompaction &&
    compatibility.reasoningSummary &&
    compatibility.providerRuntimeRoute &&
    compatibility.productionDisabled
    ? "GO"
    : "NO";
}
