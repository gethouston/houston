/**
 * Mid-session provider switch — the pure decision layer.
 *
 * Provider CLI sessions are not portable across providers (Claude's resume id
 * means nothing to Codex), so switching a live conversation to a different
 * provider runs a FRESH session on the new provider, seeded with prior context.
 * Two ways to carry that context over:
 *
 *   - `replay`    — re-send the full transcript verbatim. Lossless. Chosen when
 *                   the conversation comfortably fits the new model's window.
 *   - `summarize` — AI-summarize the conversation to fit. Lossy and spends a
 *                   summarizer call, so the UI gates it behind explicit consent.
 *
 * The size check lives here (frontend) because the context-window catalog
 * (`providers.ts`) is frontend-only — the engine has no per-model window table.
 */

import type { FeedItem } from "@houston-ai/chat";

export type ProviderHandoffMode = "replay" | "summarize";

/**
 * Headroom kept free when deciding whether a conversation can be REPLAYED
 * verbatim into the new provider. The replayed transcript re-tokenizes
 * differently under the new model, and the new turn plus provider overhead need
 * room, so we only replay when the estimated size is under this fraction of the
 * target window. Below the fraction → `replay`; at/above → `summarize`.
 */
export const REPLAY_FIT_FRACTION = 0.8;

/**
 * Rough token estimate for a conversation from its visible text. Used only when
 * the leaving provider never reported usage (e.g. Gemini). ~4 chars per token,
 * counting the user/assistant text the engine would replay — tool calls and
 * results are dropped by the engine's `render_visible_entries`, so they are
 * excluded here too.
 */
export function estimateConversationTokens(
  items: FeedItem[] | undefined,
): number {
  if (!items) return 0;
  let chars = 0;
  for (const item of items) {
    if (
      (item.feed_type === "user_message" ||
        item.feed_type === "assistant_text") &&
      typeof item.data === "string"
    ) {
      chars += item.data.length;
    }
  }
  return Math.ceil(chars / 4);
}

/**
 * Decide how to carry a conversation across a mid-session provider switch.
 *
 * Verbatim `replay` when the conversation fits the target window with headroom.
 * Otherwise `summarize`. When the target window is unknown (`null`) we cannot
 * prove a fit, so we summarize to be safe (the consent dialog still gives the
 * user the final say).
 *
 * `targetWindowTokens` is the new model's DEFAULT context window — pass the
 * catalogued default (`getContextWindowConfig(provider, model)?.default`), never
 * a snapped-up estimate, since the new provider hasn't been observed yet.
 * `currentContextTokens` is the most accurate size (the leaving provider's last
 * reported context fill, or `null` when it never reported one).
 * `estimatedTokens` is the text-derived fallback. The larger of the two is used
 * so a switch away from a usage-reporting provider never under-counts.
 *
 * Pure (the window is passed in, not looked up) so it unit-tests without the
 * provider catalog module.
 */
export function decideHandoffMode(args: {
  currentContextTokens: number | null;
  estimatedTokens: number;
  targetWindowTokens: number | null | undefined;
}): ProviderHandoffMode {
  if (args.targetWindowTokens == null) return "summarize";
  const size = Math.max(args.currentContextTokens ?? 0, args.estimatedTokens);
  return size <= args.targetWindowTokens * REPLAY_FIT_FRACTION
    ? "replay"
    : "summarize";
}
