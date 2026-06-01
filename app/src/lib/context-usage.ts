import type { FeedItem, TokenUsage } from "@houston-ai/chat";
import type { ContextWindowConfig } from "./providers";

export interface SessionContextUsage {
  /** Current fill: usage from the most recent completed turn, or null when no
   *  turn has reported usage yet. */
  latest: TokenUsage | null;
  /** Session high-water mark of `context_tokens`. Proves a LOWER BOUND on the
   *  real context window: Claude Code / Codex auto-compact before the limit,
   *  so observed usage can never exceed the true window. Used to snap the
   *  estimated window up when a plan/credit-gated larger window is in play. */
  peakContextTokens: number;
}

/**
 * Fold a session's feed into the current fill + observed peak. `final_result`
 * items are persisted and replayed into the feed store, so this is stable
 * across a history reload. Scans forward so `latest` ends as the last turn.
 */
export function sessionContextUsage(
  items: FeedItem[] | undefined,
): SessionContextUsage {
  let latest: TokenUsage | null = null;
  let peakContextTokens = 0;
  if (!items) return { latest, peakContextTokens };
  for (const item of items) {
    if (item.feed_type === "final_result" && item.data.usage) {
      latest = item.data.usage;
      peakContextTokens = Math.max(
        peakContextTokens,
        item.data.usage.context_tokens,
      );
    }
  }
  return { latest, peakContextTokens };
}

/**
 * The window to divide by, given the model's catalogued config and the
 * session's observed peak. Self-correcting: starts at the per-model default
 * and snaps UP to the ceiling once observed usage exceeds the default, which
 * proves the real (plan/credit-gated) window is the larger one. Returns null
 * when the model has no catalogued window, so the caller falls back to a raw
 * token count.
 *
 * The result is floored at the observed peak, so even a mis-catalogued ceiling
 * can't make the indicator read over 100% — that guarantee lives here in the
 * data layer, with the component's clamp as defense in depth.
 */
export function effectiveContextWindow(
  cfg: ContextWindowConfig | undefined,
  peakContextTokens: number,
): number | null {
  if (!cfg) return null;
  const estimate = peakContextTokens > cfg.default ? cfg.max : cfg.default;
  return Math.max(estimate, peakContextTokens);
}
