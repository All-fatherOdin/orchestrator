export const EXECUTOR_OUTCOME_MARKER_V1: "ORCHESTRATOR_EXECUTOR_OUTCOME_V1";

export interface LegacyPromptRendererArgsV1 {
  readonly task: unknown;
  readonly project: unknown;
  readonly authorization: unknown;
}

export type LegacyPromptContractV1 = Readonly<Record<string, unknown>>;

export function createLegacyPromptContractV1(
  args: LegacyPromptRendererArgsV1,
): LegacyPromptContractV1;

export function renderLegacyPromptV1(input: LegacyPromptContractV1): string;

export function renderProductionLegacyPromptV1(
  args: LegacyPromptRendererArgsV1,
): string;
