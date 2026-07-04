import type { TokenUsage } from "@houston/runtime-client";

/**
 * Normalize the Claude Agent SDK's token usage into Houston's `TokenUsage`,
 * BYTE-MATCHING the pi normalization (`backends/pi/wire.ts`): the prompt filling
 * the window is everything but output, so `context_tokens = total - output` where
 * `total = input + output + cache_read + cache_creation`, and `cached_tokens` is
 * the cache-read portion. Reads the SDK's snake_case `BetaUsage` fields; a missing
 * field counts as 0. Returns null when there is no input signal at all (no
 * misleading zero usage), and clamps a degenerate output > total to keep context
 * non-negative.
 */
export function normalizeUsage(u: unknown): TokenUsage | null {
  const usage = u as
    | {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
      }
    | null
    | undefined;
  if (!usage || typeof usage.input_tokens !== "number") return null;
  const input = usage.input_tokens;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const total = input + output + cacheRead + cacheCreation;
  return {
    context_tokens: Math.max(0, total - output),
    output_tokens: output,
    cached_tokens: cacheRead,
  };
}

export interface ToolBlock {
  id: string;
  name: string;
  /** Accumulated `input_json_delta` fragments; parsed at content_block_stop. */
  json: string;
  /** The start block's `input`, used when no json deltas arrived. */
  input: unknown;
}

/** Parse a completed tool call's accumulated input; never drops silently. */
export function parseArgs(tb: ToolBlock): unknown {
  if (!tb.json) return tb.input ?? {};
  try {
    return JSON.parse(tb.json);
  } catch (err) {
    console.error(
      `[claude] failed to parse tool "${tb.name}" input JSON: ${
        err instanceof Error ? err.message : String(err)
      } :: ${tb.json}`,
    );
    return {};
  }
}

/**
 * Minimal structural view of the SDK's `BetaRawMessageStreamEvent` — a deep,
 * version-coupled external union. We read only the fields below and narrow
 * defensively by the `type` discriminant.
 */
export interface EventLike {
  type?: string;
  index?: number;
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
  };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
}

/** A `tool_result` block off a user message (external `BetaContentBlockParam`). */
export interface UserContentBlock {
  type?: string;
  tool_use_id?: string;
  is_error?: boolean;
}
