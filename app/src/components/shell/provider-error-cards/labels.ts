/**
 * How a typed provider error NAMES the provider and the model it is about.
 *
 * The wire carries pi's CANONICAL ids (`openai-codex`) and raw model ids, while
 * the catalog these cards read is keyed by Houston's DISPLAY ids and holds the
 * curated labels — so an unaliased lookup printed the raw string back at the
 * user ("openai-codex ran out of room"). Both lookups go through the app
 * catalog, which owns the dialect translation.
 *
 * A `.ts` sibling of `shared.tsx` on purpose: pure, so the app's
 * `node --experimental-strip-types` unit tests load it.
 */

import { modelDisplayLabel } from "../../../lib/model-labels.ts";
import { getProvider } from "../../../lib/providers.ts";

/** The provider's brand name, falling back to the id when it isn't catalogued. */
export function providerLabel(id: string): string {
  return getProvider(id)?.name ?? id;
}

/**
 * The model's curated label for a card, in either provider dialect. Falls back
 * to the raw id — an id the catalog has never seen is still the truest name the
 * card can print for it.
 */
export function providerErrorModelLabel(
  provider: string,
  model: string,
): string {
  return modelDisplayLabel(provider, model) ?? model;
}

/**
 * The provider's public status page, for the "is it them or us" CTA. Only the
 * providers whose outages Houston can point at have one; everything else shows
 * no button. Keyed by Houston DISPLAY ids (`google`, not "gemini" — that is the
 * model family, and the branch spelled that way never matched).
 */
export function statusPageUrl(provider: string): string | null {
  switch (getProvider(provider)?.id ?? provider) {
    case "anthropic":
      return "https://status.anthropic.com/";
    case "openai":
      return "https://status.openai.com/";
    case "google":
      return "https://status.cloud.google.com/";
    case "github-copilot":
      return "https://www.githubstatus.com/";
    default:
      return null;
  }
}
