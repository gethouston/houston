/**
 * How a provider/model pair is NAMED, in one place.
 *
 * The chat picker's trigger, the quota cards and the routine screen's model row
 * show the same pair and must never disagree about what to call it, so the
 * label chain lives here rather than inside any of them: the hydrated catalog's
 * curated label, then the shared display table (a provider keeps far more
 * runnable ids than the picker shows — a pin to one of those has no catalog row
 * but still has a name), then the engine-reported configured model (the local
 * OpenAI-compatible provider has no catalog entry at all), and finally a name
 * derived from the id itself. A raw model id is never a label. `null` only when
 * there is no model at all — each caller decides its own last-resort copy,
 * which is translated and therefore cannot live in this i18n-free module.
 */

import {
  humanizedModelName,
  modelDisplayName,
  toCanonicalProviderId,
} from "@houston/sdk/provider-catalog";
import { getModel, PROVIDERS, providerName } from "./providers.ts";

/**
 * The model's human label. `activeModel` is the engine's
 * `ProviderStatus.active_model`, which is the ONLY name a local
 * OpenAI-compatible model has.
 */
export function modelDisplayLabel(
  provider: string,
  model: string,
  activeModel?: string,
): string | null {
  const curated =
    getModel(provider, model)?.label ??
    // The shared table is keyed by pi's canonical ids; the app speaks display
    // ones.
    modelDisplayName(toCanonicalProviderId(provider), model);
  if (curated) return curated;
  if (activeModel) return activeModel;
  return model ? humanizedModelName(model) : null;
}

/**
 * Which catalogued provider offers `model`, or `null` when none does. The
 * lookup `resolvePersonalModelPin` needs to carry a ceiling's first model onto
 * a provider that can actually run it.
 */
export function providerForModel(model: string): string | null {
  return (
    PROVIDERS.find((provider) =>
      provider.models.some((candidate) => candidate.id === model),
    )?.id ?? null
  );
}

/** Whether the catalogued `provider` offers `model` (hydrated catalog lookup). */
export function providerOffersModel(provider: string, model: string): boolean {
  return getModel(provider, model) !== undefined;
}

/**
 * The RESOLVED pair as one line — "Claude · Opus 5". Shown wherever a surface
 * must name the account AND the model it will run on (the routine screen: a
 * model name alone never said which AI account was about to be billed).
 * `null` when the pair is not resolved yet.
 */
export function providerModelLabel(
  provider: string,
  model: string,
  activeModel?: string,
): string | null {
  if (!provider) return null;
  const label = modelDisplayLabel(provider, model, activeModel);
  return label
    ? `${providerName(provider)} · ${label}`
    : providerName(provider);
}
