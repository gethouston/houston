/**
 * Mid-session provider switch — the pure decision layer (frontend copy).
 *
 * Switching a live conversation to a different provider continues the SAME
 * conversation on the new provider: the runtime re-points its session, carrying
 * the full prior history across. Two ways that context comes over:
 *
 *   - `replay`    — carried verbatim. Lossless. Chosen when the conversation
 *                   comfortably fits the new model's window.
 *   - `summarize` — compacted to fit a smaller window. Lossy and spends a
 *                   summarizer call, so the UI gates it behind explicit consent.
 *
 * This decides only which COPY the consent dialog shows; the runtime makes the
 * real replay-vs-compact call against the same fit fraction. The context-window
 * catalog (`providers.ts`) is frontend-only, so the size check lives here.
 */

import type { FeedItem } from "@houston-ai/chat";

export type ProviderHandoffMode = "replay" | "summarize";

/**
 * Headroom kept free when deciding whether a conversation can be REPLAYED
 * verbatim into the new provider. The replayed transcript re-tokenizes
 * differently under the new model, and the new turn plus provider overhead need
 * room, so we only replay when the estimated size is under this fraction of the
 * target window. Below the fraction -> `replay`; at/above -> `summarize`.
 * Mirrors the runtime's REPLAY_FIT_FRACTION in `packages/runtime/src/session/chat.ts`.
 */
export const REPLAY_FIT_FRACTION = 0.8;

/**
 * Rough token estimate for a conversation from its visible text. Used only when
 * the leaving provider never reported usage (e.g. Gemini). ~4 chars per token,
 * counting the user/assistant text the runtime carries over (tool calls/results
 * are not counted here).
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
 * Decide how the consent dialog should describe a mid-session provider switch.
 *
 * Verbatim `replay` when the conversation fits the target window with headroom;
 * otherwise `summarize`. When the target window is unknown (`null`) we cannot
 * prove a fit, so we summarize to be safe (the dialog still gives the user the
 * final say).
 *
 * `targetWindowTokens` is the new model's DEFAULT context window — pass the
 * catalogued default (`getContextWindowConfig(provider, model)?.default`), never
 * a snapped-up estimate, since the new provider hasn't been observed yet.
 * `currentContextTokens` is the most accurate size (the leaving provider's last
 * reported context fill, or `null` when it never reported one); `estimatedTokens`
 * is the text-derived fallback. The larger of the two is used so a switch away
 * from a usage-reporting provider never under-counts.
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
