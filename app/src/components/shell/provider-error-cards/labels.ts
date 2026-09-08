/**
 * How a typed provider error NAMES the provider and the model it is about.
 *
 * The wire carries pi's CANONICAL ids (`openai-codex`) and raw model ids, while
 * the catalog these cards read is keyed by Houston's DISPLAY ids — so an
 * unaliased lookup printed the raw string back at the user ("openai-codex ran
 * out of room"). Both lookups go through the shared naming helpers, which own
 * the dialect translation and the name-of-last-resort.
 *
 * A `.ts` sibling of `shared.tsx` on purpose: pure, so the app's
 * `node --experimental-strip-types` unit tests load it.
 */

import { modelDisplayLabel } from "../../../lib/model-labels.ts";
import { getProvider } from "../../../lib/providers.ts";

/**
 * The provider's brand name, falling back to the id when it isn't catalogued —
 * the ONE naming helper, re-exported under the name the cards read it by. A
 * second copy of the fallback chain is exactly how the label path and the icon
 * path drifted apart before.
 */
export { providerName as providerLabel } from "../../../lib/providers.ts";

/**
 * The model's name for a card, in either provider dialect. Never the raw id: an
 * id the catalog has never seen is still named (`modelDisplayLabel` derives one
 * from the id), and only a card about NO model falls back to the empty string.
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
