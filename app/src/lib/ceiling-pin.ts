import type { ModelPin } from "./model-selector-lock.ts";

/**
 * What the composer knows about the catalog and the connected accounts when it
 * has to pick a model out of an agent's allowed-models ceiling on the user's
 * behalf (no stored choice, shared fallback outside the ceiling).
 */
export interface CeilingResolver {
  /** Whether `provider` offers `model` in the hydrated catalog. */
  offers: (provider: string, model: string) => boolean;
  /** Which catalogued provider offers `model`, or `null` when none does. */
  providerFor: (model: string) => string | null;
  /** Provider ids the acting user is CONFIRMED connected to, registry order. */
  connected: readonly string[];
}

/**
 * The provider/model the composer pins when the ceiling has to choose.
 *
 * A ceiling is the sorted union of EVERY provider's id for each allowed model
 * (`toggleModel`): "Claude Opus 5" contributes OpenRouter's
 * `anthropic/claude-opus-5` ahead of Anthropic's `claude-opus-5`. Taking the
 * first entry blindly therefore pinned a Claude-connected user to OpenRouter —
 * an account they never connected — and every send answered with a "reconnect
 * OpenRouter" card they could not act on (PRODUCT-1657). So the pick prefers
 * what can actually run:
 *
 *  1. an entry the fallback's own provider offers (it is already the
 *     connection-resolved composer provider);
 *  2. else an entry offered by any connected provider, in registry order;
 *  3. else the first entry on its catalogued provider — nothing connected can
 *     run this ceiling, and the resulting card names the provider truthfully.
 *
 * Effort always carries over from the fallback: activities and ceilings have no
 * effort field.
 */
export function pickCeilingPin(
  ceiling: readonly string[],
  fallback: ModelPin,
  resolver: CeilingResolver,
): ModelPin {
  const own = ceiling.find((model) =>
    resolver.offers(fallback.provider, model),
  );
  if (own !== undefined) return { ...fallback, model: own };
  for (const provider of resolver.connected) {
    const model = ceiling.find((candidate) =>
      resolver.offers(provider, candidate),
    );
    if (model !== undefined)
      return { provider, model, effort: fallback.effort };
  }
  const first = ceiling[0];
  return {
    provider: resolver.providerFor(first) ?? fallback.provider,
    model: first,
    effort: fallback.effort,
  };
}
