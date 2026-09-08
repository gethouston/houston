import type { TokenUsage } from "@houston/runtime-client";
import { normalizeUsage } from "./translate-support";

/** The per-turn context-fill accounting behind a translator's usage frames. */
export interface UsageTracker {
  /** Record one assistant request's usage as the live context fill. */
  noteRequestUsage(usage: unknown): void;
  /** Re-anchor the tracked fill to a compact boundary's post-compaction size. */
  noteCompactBoundary(postTokens: number): void;
  /** The turn's usage frame, or null when no usage signal ever arrived. */
  turnUsage(resultUsage: unknown): TokenUsage | null;
}

/**
 * Track what actually sizes the context window across a turn. The newest
 * PER-REQUEST usage — not the result message's turn-cumulative aggregate — is
 * the fill: each tool round-trip re-sends the whole context (mostly cache
 * reads), so the aggregate over an agentic turn reads ~N× the real fill and
 * once made a 3-message Claude chat report a full 1M window. Mirrors pi, whose
 * turn_end usage is the final assistant message's own request.
 */
export function createUsageTracker(
  onContextTokens: (tokens: number) => void,
): UsageTracker {
  let lastRequestUsage: TokenUsage | null = null;

  function noteRequestUsage(usage: unknown): void {
    const requestUsage = normalizeUsage(usage);
    if (!requestUsage) return;
    lastRequestUsage = requestUsage;
    onContextTokens(requestUsage.context_tokens);
  }

  function noteCompactBoundary(postTokens: number): void {
    onContextTokens(postTokens);
    // The compaction just shrank the context: a request usage seen
    // BEFORE the boundary no longer describes the fill, so re-anchor
    // it — else a boundary arriving as the turn's last signal would
    // resurrect the pre-compaction fill on the result's usage frame.
    if (lastRequestUsage)
      lastRequestUsage = {
        ...lastRequestUsage,
        context_tokens: postTokens,
        cached_tokens: 0,
      };
  }

  function turnUsage(resultUsage: unknown): TokenUsage | null {
    // The turn's usage frame is the LAST request's usage (the current context
    // fill — pi parity), never the result's turn-cumulative aggregate. The
    // aggregate is only the fallback when no assistant usage arrived, where
    // the two coincide (a turn of exactly one request).
    const usage = lastRequestUsage ?? normalizeUsage(resultUsage);
    if (usage) onContextTokens(usage.context_tokens);
    return usage;
  }

  return { noteRequestUsage, noteCompactBoundary, turnUsage };
}
