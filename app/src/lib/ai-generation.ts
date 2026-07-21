/**
 * Builds the PostHog LLM-observability `$ai_generation` payload from a turn's
 * `final_result` feed item. Pure — no posthog import — so the mapping is unit
 * testable and the privacy rule is structural: ONLY the metadata fields below
 * can ever leave the app. Prompt/response content has no code path in.
 *
 * Property names follow PostHog's LLM-observability convention ($ai_*), which
 * is what the "Houston / 7. AI Usage" dashboard tiles (cost, latency, error
 * rate by model) are built on.
 */

export interface AiGenerationInput {
  /** Normalized per-turn token usage, absent when the provider reports none. */
  usage?: {
    context_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  } | null;
  /** Estimated turn cost, when the backend computed one. */
  costUsd?: number | null;
  /** Wall-clock turn duration. */
  durationMs?: number | null;
  /**
   * The agent's configured brain. An approximation of the model that served
   * THIS turn (a per-send override or a mid-session provider switch can
   * diverge); omitted entirely when the config has no pins.
   */
  provider?: string;
  model?: string;
  /** Groups the turn's generation under its conversation. */
  sessionKey: string;
}

export type AiGenerationProps = Record<string, string | number | boolean>;

export function buildAiGenerationProps(
  input: AiGenerationInput,
): AiGenerationProps {
  const props: AiGenerationProps = {
    $ai_trace_id: input.sessionKey,
    $ai_is_error: false,
  };
  if (input.provider) props.$ai_provider = input.provider;
  if (input.model) props.$ai_model = input.model;
  if (input.usage) {
    // `context_tokens` is the full prompt of the last request
    // (cache-inclusive) — what the provider bills as input.
    props.$ai_input_tokens = input.usage.context_tokens;
    props.$ai_output_tokens = input.usage.output_tokens;
    props.$ai_cache_read_input_tokens = input.usage.cached_tokens;
  }
  if (typeof input.durationMs === "number" && input.durationMs >= 0) {
    // PostHog expects seconds.
    props.$ai_latency = Math.round(input.durationMs) / 1000;
  }
  if (typeof input.costUsd === "number" && input.costUsd >= 0) {
    props.$ai_total_cost_usd = input.costUsd;
  }
  return props;
}
