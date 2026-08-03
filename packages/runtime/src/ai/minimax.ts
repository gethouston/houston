import type { Api, Model } from "@earendil-works/pi-ai";
import { getModel } from "@earendil-works/pi-ai/compat";

/**
 * MiniMax "token plan" (a.k.a. coding plan) support.
 *
 * MiniMax sells a subscription "Token Plan" (platform.minimax.io/subscribe/token-plan)
 * whose key is SEPARATE from a pay-as-you-go key and NOT interchangeable. Both plans
 * talk to the SAME Anthropic-compatible endpoint (`https://api.minimax.io/anthropic`,
 * which pi-ai's `minimax` provider already targets), but MiniMax's official Claude
 * Code config for the plan uses the model id `MiniMax-M3[1m]` (the 1M-context coding
 * tier) — NOT the bare `MiniMax-M3` that pi-ai ships. A token-plan user pointed at
 * bare `MiniMax-M3` is billed against pay-as-you-go (empty balance) and sees
 * "API usage ran out" (HOU-1160).
 *
 * pi-ai's `minimax` catalog has no `[1m]` variant, so we hand-build the model on the
 * SAME provider (same endpoint, same `anthropic-messages` api, same api-key auth) —
 * mirroring the openai-compatible hand-built path. The `minimax` provider is a
 * built-in pi provider, so pi's stream dispatch (`requireProvider("minimax")`) runs
 * the hand-built model verbatim, sending `MiniMax-M3[1m]` as the wire model id.
 */

export const MINIMAX_PROVIDER = "minimax";

/** The base pay-as-you-go model the token-plan variant is derived from. */
export const MINIMAX_BASE_MODEL_ID = "MiniMax-M3";

/** MiniMax's documented token/coding-plan model id (1M-context tier). */
export const MINIMAX_TOKEN_PLAN_MODEL_ID = "MiniMax-M3[1m]";

/**
 * Build the token-plan pi model by cloning pi-ai's `MiniMax-M3` (same provider,
 * baseUrl, api, pricing, 1M context window) and overriding only the wire id. Throws
 * if pi ever drops the base model, so a turn fails with a readable reason rather than
 * a downstream `undefined` TypeError (beta no-silent-failure).
 */
export function buildMinimaxTokenPlanModel(): Model<Api> {
  const base = getModel(MINIMAX_PROVIDER, MINIMAX_BASE_MODEL_ID);
  if (!base)
    throw new Error(
      `minimax base model "${MINIMAX_BASE_MODEL_ID}" is unavailable; cannot build the token-plan model`,
    );
  return {
    ...base,
    id: MINIMAX_TOKEN_PLAN_MODEL_ID,
    name: MINIMAX_TOKEN_PLAN_MODEL_ID,
  };
}

/**
 * The token-plan model when (provider, modelId) name it, else undefined. Kept as a
 * single predicate so every resolution seam (safeGetModel, the picker id list) agrees
 * on what the extra minimax id is.
 */
export function minimaxTokenPlanModelFor(
  provider: string,
  modelId: string,
): Model<Api> | undefined {
  if (provider === MINIMAX_PROVIDER && modelId === MINIMAX_TOKEN_PLAN_MODEL_ID)
    return buildMinimaxTokenPlanModel();
  return undefined;
}
