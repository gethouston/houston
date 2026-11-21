import {
  ANTHROPIC_LINEUP,
  anthropicLineupModel,
} from "@houston/domain/model-aliases";

export const ANTHROPIC_PROVIDER_ID = "anthropic";

const LINEUP_IDS: readonly string[] = Object.values(ANTHROPIC_LINEUP);

export function anthropicOfferedModelIds(
  catalogIds: readonly string[],
): string[] {
  return LINEUP_IDS.filter((id) => catalogIds.includes(id));
}

export function lineupModelId(provider: string, modelId: string): string {
  if (provider !== ANTHROPIC_PROVIDER_ID) return modelId;
  return anthropicLineupModel(modelId) ?? modelId;
}
