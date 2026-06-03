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

/**
 * How full the context window is, 0-100, or `null` when usage or the window
 * isn't known. Rounded and clamped so the displayed gauge and the autocompact
 * trigger agree on the same number. Shared by `ContextIndicator` (display) and
 * `shouldAutocompactForSession` (the trigger decision).
 */
export function contextFillPercent(
  usage: TokenUsage | null,
  windowTokens: number | null | undefined,
): number | null {
  if (!usage || windowTokens == null || windowTokens <= 0) return null;
  return Math.min(
    100,
    Math.max(0, Math.round((usage.context_tokens / windowTokens) * 100)),
  );
}

/**
 * Whether to proactively compact this turn: autocompact is enabled and the
 * context is at/over the user's threshold. `percent` null (unknown usage or
 * window) means we can't tell, so we don't compact. Self-limiting: after a
 * compaction the next turn's fill is small, so this won't re-fire until the
 * window fills again.
 */
export function shouldAutocompact(opts: {
  percent: number | null;
  enabled: boolean;
  threshold: number;
}): boolean {
  if (!opts.enabled || opts.percent == null) return false;
  return opts.percent >= opts.threshold;
}

/**
 * Autocompact threshold (percent-full at which the next turn proactively
 * compacts). Not a user setting — a tuning constant with an optional
 * build-time override via `VITE_AUTOCOMPACT_THRESHOLD` (read in
 * `lib/autocompact.ts`). Defaults to 93, just below the provider CLIs' own
 * ~95% auto-compaction so Houston compacts cleanly at a turn boundary first.
 */
export const DEFAULT_AUTOCOMPACT_THRESHOLD = 93;
export const MIN_AUTOCOMPACT_THRESHOLD = 1;
export const MAX_AUTOCOMPACT_THRESHOLD = 99;

/**
 * Parse + clamp the `VITE_AUTOCOMPACT_THRESHOLD` build-time env value. Empty,
 * missing, or non-numeric falls back to the default; valid values are rounded
 * and clamped to [1, 99]. Pure (takes the raw string, not `import.meta.env`)
 * so it's unit-testable without a Vite environment.
 */
export function resolveThreshold(raw: string | undefined): number {
  if (raw == null || raw === "") return DEFAULT_AUTOCOMPACT_THRESHOLD;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_AUTOCOMPACT_THRESHOLD;
  return Math.min(
    MAX_AUTOCOMPACT_THRESHOLD,
    Math.max(MIN_AUTOCOMPACT_THRESHOLD, Math.round(n)),
  );
}
