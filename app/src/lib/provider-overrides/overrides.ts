import { API_KEY_OVERRIDES } from "./overrides-api-key.ts";
import { CURATED_API_KEY_OVERRIDES } from "./overrides-api-key-curated.ts";
import { GATEWAY_OVERRIDES } from "./overrides-gateway.ts";
import { SUBSCRIPTION_OVERRIDES } from "./overrides-subscription.ts";
import type { ProviderOverride } from "./types.ts";

/**
 * Houston's provider/model catalog is now DYNAMIC: the runnable set (providers,
 * models, context windows, thinking levels, pricing, vision/reasoning flags)
 * comes from pi-ai over the host's `GET /v1/catalog` route and is hydrated into
 * `PROVIDERS` at runtime (see `hydrateProviderCatalog`).
 *
 * pi-ai does NOT ship the Houston-specific presentation metadata, though: brand
 * names (its provider `name` is a titleized id like "Openrouter" or an OAuth
 * subscription string) and per-model descriptions. This module carries ONLY
 * that missing metadata, keyed by the Houston provider id, so the hydrator can
 * layer it over pi's catalog. Model NAMES are not here: they are shared
 * vocabulary — the picker, the error cards and the assistant's spoken-name
 * ladder must all say "Opus 5" — so they live once in `@houston/domain`
 * (`model-display-names.ts`), which `buildProvider` reads. A model's reasoning-effort set is NO
 * longer curated here: it is derived from pi's per-model thinking levels
 * (`deriveEffortLevels`), the same source the runtime clamps against, so the two
 * can't drift. An override may still pin `effortLevels` for a genuine gateway cap
 * pi doesn't encode, but none currently need it. The per-model CONTEXT-WINDOW
 * overrides (defaults + credit-gated
 * snap-up ceilings) live in `@houston/protocol` (`MODEL_WINDOW_OVERRIDES`), shared
 * verbatim with the runtime's autocompact so the bar and the engine agree.
 */

/**
 * Houston presentation metadata for the ten first-class providers, keyed by
 * Houston provider id (post-rename for OpenAI). pi supplies everything else.
 * Insertion order sets the catalog order (the local provider is appended last).
 */
export const PROVIDER_OVERRIDES: Record<string, ProviderOverride> = {
  ...SUBSCRIPTION_OVERRIDES,
  ...GATEWAY_OVERRIDES,
  ...CURATED_API_KEY_OVERRIDES,
  ...API_KEY_OVERRIDES,
};
