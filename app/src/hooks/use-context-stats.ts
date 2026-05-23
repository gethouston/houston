/**
 * `useContextStats` — derives the data behind `<ContextMeter />` from a chat
 * session's feed items. Authoritative `input_tokens` come from the latest
 * `FinalResult` (provider-reported, chronologically last wins); the
 * per-category breakdown is estimated via a chars/4 heuristic over feed-item
 * payloads. Truth + best-effort detail in one hook.
 *
 * Phase 2 of RFC #248 / `advanced.context_meter`.
 */
import { useMemo } from "react";
import type { FeedItem } from "@houston-ai/chat";
import { getContextLimit } from "../lib/model-limits";

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface BreakdownRow {
  /** Stable i18n key suffix (see `composer.contextMeter.breakdown.<key>`). */
  key:
    | "user_messages"
    | "assistant_messages"
    | "thinking"
    | "tool_input"
    | "tool_output"
    | "system";
  tokens: number;
  percent: number;
}

export interface ContextStats {
  /** Context fill the model actually saw last turn. Falls back to the
   *  estimated sum when no `FinalResult` has token data yet. */
  usedTokens: number;
  /** Model's documented context window (or FALLBACK_CONTEXT_LIMIT). */
  maxTokens: number;
  /** `usedTokens / maxTokens * 100`, NOT clamped — the popover can decide. */
  usagePercent: number;
  /** True when at least one `FinalResult` carried `input_tokens`. */
  hasRealData: boolean;
  breakdown: BreakdownRow[];
  freeTokens: number;
  freePercent: number;
  turnCount: number;
  totalDurationMs: number;
  totalCostUsd: number;
  /** `cache_read_input_tokens / input_tokens` from the latest `FinalResult`,
   *  or null when not provided. */
  cacheHitRate: number | null;
  toolCallCount: number;
  fileChangeCount: number;
}

export function useContextStats(
  feedItems: FeedItem[],
  provider: string | null | undefined,
  model: string | null | undefined,
): ContextStats {
  return useMemo(() => {
    const maxTokens = getContextLimit(provider, model);

    let latestUsed = 0;
    let hasRealData = false;
    let cacheHitRate: number | null = null;
    let totalCostUsd = 0;
    let totalDurationMs = 0;
    let turnCount = 0;

    let userTokens = 0;
    let assistantTokens = 0;
    let thinkingTokens = 0;
    let toolInputTokens = 0;
    let toolOutputTokens = 0;
    let systemTokens = 0;
    let toolCallCount = 0;
    let fileChangeCount = 0;

    for (const item of feedItems) {
      switch (item.feed_type) {
        case "user_message":
          userTokens += estimateTokens(item.data);
          break;
        case "assistant_text":
        case "assistant_text_streaming":
          assistantTokens += estimateTokens(item.data);
          break;
        case "thinking":
        case "thinking_streaming":
          thinkingTokens += estimateTokens(item.data);
          break;
        case "system_message":
          systemTokens += estimateTokens(item.data);
          break;
        case "tool_call":
          toolInputTokens += estimateTokens(JSON.stringify(item.data.input));
          toolCallCount += 1;
          break;
        case "tool_result":
          toolOutputTokens += estimateTokens(item.data.content);
          break;
        case "file_changes":
          fileChangeCount += 1;
          break;
        case "final_result":
          turnCount += 1;
          if (item.data.cost_usd != null) totalCostUsd += item.data.cost_usd;
          if (item.data.duration_ms != null) totalDurationMs += item.data.duration_ms;
          if (item.data.input_tokens != null) {
            latestUsed = item.data.input_tokens;
            hasRealData = true;
            if (
              item.data.cache_read_input_tokens != null &&
              item.data.input_tokens > 0
            ) {
              cacheHitRate =
                item.data.cache_read_input_tokens / item.data.input_tokens;
            }
          }
          break;
      }
    }

    const estimatedSum =
      userTokens +
      assistantTokens +
      thinkingTokens +
      toolInputTokens +
      toolOutputTokens +
      systemTokens;
    const usedTokens = hasRealData ? latestUsed : estimatedSum;

    const seeds: BreakdownRow[] = [
      { key: "user_messages", tokens: userTokens, percent: 0 },
      { key: "assistant_messages", tokens: assistantTokens, percent: 0 },
      { key: "thinking", tokens: thinkingTokens, percent: 0 },
      { key: "tool_input", tokens: toolInputTokens, percent: 0 },
      { key: "tool_output", tokens: toolOutputTokens, percent: 0 },
      { key: "system", tokens: systemTokens, percent: 0 },
    ];
    const breakdown: BreakdownRow[] = seeds.map((b) => ({
      key: b.key,
      tokens: b.tokens,
      percent: usedTokens > 0 ? (b.tokens / usedTokens) * 100 : 0,
    }));

    const freeTokens = Math.max(0, maxTokens - usedTokens);
    const freePercent = (freeTokens / maxTokens) * 100;
    const usagePercent = (usedTokens / maxTokens) * 100;

    return {
      usedTokens,
      maxTokens,
      usagePercent,
      hasRealData,
      breakdown,
      freeTokens,
      freePercent,
      turnCount,
      totalDurationMs,
      totalCostUsd,
      cacheHitRate,
      toolCallCount,
      fileChangeCount,
    };
  }, [feedItems, provider, model]);
}
