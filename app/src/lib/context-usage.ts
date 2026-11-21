import { compactionWindow } from "@houston/protocol/model-windows";
import type { FeedItem, TokenUsage } from "@houston-ai/chat";
import type { ContextWindowConfig } from "./providers";

export interface SessionContextUsage {
  latest: TokenUsage | null;
  peakContextTokens: number;
}

export function sessionContextUsage(
  items: FeedItem[] | undefined,
): SessionContextUsage {
  let latest: TokenUsage | null = null;
  let peakContextTokens = 0;
  if (!items) return { latest, peakContextTokens };
  for (const item of items) {
    if (item.feed_type === "provider_switched") {
      latest = null;
      peakContextTokens = 0;
      continue;
    }
    if (item.feed_type === "context_cleared") {
      latest = null;
      continue;
    }
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

export function effectiveContextWindow(
  cfg: ContextWindowConfig | undefined,
  peakContextTokens: number,
): number | null {
  if (!cfg) return null;
  const estimate = peakContextTokens > cfg.default ? cfg.max : cfg.default;
  return compactionWindow(estimate, cfg.inputLimit);
}

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
