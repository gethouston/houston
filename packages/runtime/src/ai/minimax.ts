import {
  MINIMAX_PROVIDER,
  MINIMAX_RETIRED_MODELS,
} from "@houston/domain/minimax-retired";

export { MINIMAX_PROVIDER };

/** `modelId`, or `fallback` when it is a MiniMax id the API no longer serves. */
export function minimaxServedModelId(
  provider: string,
  modelId: string,
  fallback: string,
): string {
  return provider === MINIMAX_PROVIDER && MINIMAX_RETIRED_MODELS.has(modelId)
    ? fallback
    : modelId;
}

/** pi's `minimax` catalog minus the retired ids, so no choice list offers one. */
export function minimaxOfferedModelIds(
  catalogIds: readonly string[],
): string[] {
  return catalogIds.filter((id) => !MINIMAX_RETIRED_MODELS.has(id));
}
