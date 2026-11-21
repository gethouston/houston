export interface AiGenerationInput {
  usage?: {
    context_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  } | null;
  costUsd?: number | null;
  durationMs?: number | null;
  provider?: string;
  model?: string;
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
    props.$ai_input_tokens = input.usage.context_tokens;
    props.$ai_output_tokens = input.usage.output_tokens;
    props.$ai_cache_read_input_tokens = input.usage.cached_tokens;
  }
  if (typeof input.durationMs === "number" && input.durationMs >= 0) {
    props.$ai_latency = Math.round(input.durationMs) / 1000;
  }
  if (typeof input.costUsd === "number" && input.costUsd >= 0) {
    props.$ai_total_cost_usd = input.costUsd;
  }
  return props;
}
