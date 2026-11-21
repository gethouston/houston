import {
  humanizedModelName,
  modelDisplayName,
  toCanonicalProviderId,
} from "@houston/sdk/provider-catalog";
import { getModel, PROVIDERS, providerName } from "./providers.ts";

export function modelDisplayLabel(
  provider: string,
  model: string,
  activeModel?: string,
): string | null {
  const curated =
    getModel(provider, model)?.label ??
    modelDisplayName(toCanonicalProviderId(provider), model);
  if (curated) return curated;
  if (activeModel) return activeModel;
  return model ? humanizedModelName(model) : null;
}

export function providerForModel(model: string): string | null {
  return (
    PROVIDERS.find((provider) =>
      provider.models.some((candidate) => candidate.id === model),
    )?.id ?? null
  );
}

export function providerOffersModel(provider: string, model: string): boolean {
  return getModel(provider, model) !== undefined;
}

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
