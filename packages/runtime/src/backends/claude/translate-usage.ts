import type { TokenUsage } from "@houston/runtime-client";
import { normalizeUsage } from "./translate-support";

export interface UsageTracker {
  noteRequestUsage(usage: unknown): void;
  noteCompactBoundary(postTokens: number): void;
  turnUsage(resultUsage: unknown): TokenUsage | null;
}

export function createUsageTracker(
  onContextTokens: (tokens: number) => void,
): UsageTracker {
  let lastRequestUsage: TokenUsage | null = null;
  const reportFill = (tokens: number) => {
    if (tokens > 0) onContextTokens(tokens);
  };

  function noteRequestUsage(usage: unknown): void {
    const requestUsage = normalizeUsage(usage);
    if (!requestUsage) return;
    lastRequestUsage = requestUsage;
    reportFill(requestUsage.context_tokens);
  }

  function noteCompactBoundary(postTokens: number): void {
    onContextTokens(postTokens);
    if (lastRequestUsage)
      lastRequestUsage = {
        ...lastRequestUsage,
        context_tokens: postTokens,
        cached_tokens: 0,
      };
  }

  function turnUsage(resultUsage: unknown): TokenUsage | null {
    const usage = lastRequestUsage ?? normalizeUsage(resultUsage);
    if (usage) reportFill(usage.context_tokens);
    return usage;
  }

  return { noteRequestUsage, noteCompactBoundary, turnUsage };
}
