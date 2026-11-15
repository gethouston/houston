/**
 * MiniMax ids Houston once stored that MiniMax's API never served.
 *
 * `MiniMax-M3[1m]` came from MiniMax's Claude Code setup, where `[1m]` is a
 * client-side marker Claude Code strips before the request. Sent verbatim it
 * fails every turn with `unknown model 'MiniMax-M3[1m]' (2013)`, on either key
 * kind. Conversations pinned to it run on the provider default instead, the
 * model both pay-as-you-go and M Plan / Token Plan keys serve.
 */

export const MINIMAX_PROVIDER = "minimax";

const MINIMAX_UNSERVED_IDS = new Set(["MiniMax-M3[1m]"]);

/** `modelId`, or `fallback` when it is a MiniMax id the API rejects. */
export function minimaxServedModelId(
  provider: string,
  modelId: string,
  fallback: string,
): string {
  return provider === MINIMAX_PROVIDER && MINIMAX_UNSERVED_IDS.has(modelId)
    ? fallback
    : modelId;
}
