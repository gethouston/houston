/**
 * Token pricing used to estimate session cost in USD.
 *
 * When the provider CLI reports an exact `cost_usd` (Claude on API-key billing),
 * that value is used directly and this table is never consulted. When it does
 * not (Claude on a subscription, or Codex, which never report cost), cost is
 * estimated here from token usage at each provider's published API rates. For
 * subscription users this is an API-equivalent estimate of value, not a literal
 * charge.
 *
 * Only models Houston's picker can select are priced (see `providers.ts`). To
 * support a new model, add it to the picker AND add its row here.
 *
 * Prices in USD per million tokens. Sources (verified June 2026):
 *   Anthropic: platform.claude.com/docs/en/docs/about-claude/pricing
 *   OpenAI: developers.openai.com/api/docs/pricing
 *
 * Cache-write caveat: the persisted TokenUsage folds cache-creation (write)
 * tokens into `context_tokens` without separating them, so this estimate prices
 * them at the base input rate rather than the 1.25x cache-write rate. The
 * resulting estimate is therefore a slight under-count on cache-heavy turns.
 * It is acceptable for an estimate, and exact figures come from `cost_usd` when
 * the CLI provides them.
 */
interface ModelPricing {
  /** Cost per million fresh input tokens. */
  input: number;
  /** Cost per million output tokens. */
  output: number;
  /** Cost per million cache-read tokens. */
  cacheRead: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-8": { input: 5.0, output: 25.0, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5.0, output: 25.0, cacheRead: 0.5 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3 },
  // OpenAI (Codex)
  "gpt-5.5": { input: 5.0, output: 30.0, cacheRead: 0.5 },
};

/**
 * Legacy shorthand model ids that older agent configs may still hold, mapped to
 * the catalog id they denote. Mirrors `LEGACY_MODEL_ALIASES` in providers.ts.
 */
const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
};

function getPricing(model: string): ModelPricing | null {
  const resolved = MODEL_ALIASES[model] ?? model;
  if (PRICING[resolved]) return PRICING[resolved];
  // Prefix fall-back so a date- or variant-suffixed id still resolves to its
  // base model's rate (e.g. "claude-sonnet-4-6-20260101", "gpt-5.5-2026...").
  for (const [key, price] of Object.entries(PRICING)) {
    if (resolved.startsWith(key)) return price;
  }
  return null;
}

/**
 * Estimate cost in USD from token counts.
 * Returns null when the model is unpriced, so the caller shows token usage
 * instead of a cost.
 *
 * `cachedTokens` are billed at the cheaper cacheRead rate; the remaining
 * `contextTokens - cachedTokens` are billed at the full input rate.
 */
export function calcTokenCost(
  model: string,
  contextTokens: number,
  outputTokens: number,
  cachedTokens: number,
): number | null {
  const p = getPricing(model);
  if (!p) return null;
  const fresh = Math.max(0, contextTokens - cachedTokens);
  return (fresh * p.input + cachedTokens * p.cacheRead + outputTokens * p.output) / 1_000_000;
}
