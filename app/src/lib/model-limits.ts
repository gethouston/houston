/**
 * Context-window limits per provider + model. Drives the
 * `<ContextMeter />` wheel (Phase 2 of RFC #248 / `advanced.context_meter`).
 *
 * Values are the conservative documented limits. The Anthropic [1m] context
 * variants are opt-in via CLI flag — when Houston starts exposing that toggle
 * we'll add `sonnet-1m` / `opus-1m` entries.
 *
 * Sources (2026-05):
 *   - Anthropic Claude 4.x: 200K standard context.
 *   - OpenAI GPT-5.5: 256K (Codex CLI default).
 *   - Google Gemini 2.5 Pro: 1M (the CLI exposes the long-context variant).
 *
 * Keep the values flat (numbers, not strings) so the meter's percentage math
 * stays trivial. Add to this table whenever a new model lands in `providers.ts`.
 */

export const MODEL_CONTEXT_LIMITS: Record<string, Record<string, number>> = {
  anthropic: {
    sonnet: 200_000,
    opus: 200_000,
  },
  openai: {
    "gpt-5.5": 256_000,
  },
  gemini: {
    "gemini-2.5-pro": 1_000_000,
  },
};

/** Used when (provider, model) is unknown. Safe-ish for any modern coding model. */
export const FALLBACK_CONTEXT_LIMIT = 200_000;

export function getContextLimit(
  providerId: string | null | undefined,
  modelId: string | null | undefined,
): number {
  if (!providerId || !modelId) return FALLBACK_CONTEXT_LIMIT;
  return MODEL_CONTEXT_LIMITS[providerId]?.[modelId] ?? FALLBACK_CONTEXT_LIMIT;
}

/** Pretty-print a token count like `34.5k`, `1.2M`, `12`. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
