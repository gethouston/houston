import {
  MINIMAX_PROVIDER,
  MINIMAX_RETIRED_MODELS,
} from "@houston/domain/minimax-retired";

export { MINIMAX_PROVIDER };

export function minimaxServedModelId(
  provider: string,
  modelId: string,
  fallback: string,
): string {
  return provider === MINIMAX_PROVIDER && MINIMAX_RETIRED_MODELS.has(modelId)
    ? fallback
    : modelId;
}

export function minimaxOfferedModelIds(
  catalogIds: readonly string[],
): string[] {
  return catalogIds.filter((id) => !MINIMAX_RETIRED_MODELS.has(id));
}
