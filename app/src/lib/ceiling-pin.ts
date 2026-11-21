import { type RunsAsLookup, runnableEntry } from "./ceiling-match.ts";
import type { ModelPin } from "./model-selector-lock.ts";

export interface CeilingResolver {
  offers: (provider: string, model: string) => boolean;
  providerFor: (model: string) => string | null;
  runsAs: RunsAsLookup;
  connected: readonly string[];
}

export function pickCeilingPin(
  ceiling: readonly string[],
  fallback: ModelPin,
  resolver: CeilingResolver,
): ModelPin {
  const own = firstRunnable(ceiling, fallback.provider, resolver);
  if (own !== null) return { ...fallback, model: own };
  for (const provider of resolver.connected) {
    const model = firstRunnable(ceiling, provider, resolver);
    if (model !== null) return { provider, model, effort: fallback.effort };
  }
  const first = ceiling[0];
  const provider = resolver.providerFor(first) ?? fallback.provider;
  return {
    provider,
    model: resolver.runsAs(provider, first) ?? first,
    effort: fallback.effort,
  };
}

function firstRunnable(
  ceiling: readonly string[],
  provider: string,
  resolver: CeilingResolver,
): string | null {
  for (const entry of ceiling) {
    const model = runnableEntry(
      provider,
      entry,
      resolver.offers,
      resolver.runsAs,
    );
    if (model !== null) return model;
  }
  return null;
}
