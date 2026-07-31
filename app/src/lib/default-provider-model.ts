import { getDefaultModel, PROVIDERS, validModelOrNull } from "./providers.ts";

export interface PickDefaultProviderModelOptions {
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
  connectedProviders: ReadonlySet<string> | readonly string[];
}

/**
 * Selects a new agent's provider only from confirmed connections when any
 * exist, preserving the stored model only when it remains valid for that
 * provider. An empty confirmed set retains the non-blocking legacy fallback.
 */
export function pickDefaultProviderModel({
  lastUsedProvider,
  lastUsedModel,
  connectedProviders,
}: PickDefaultProviderModelOptions): {
  provider: string;
  model: string;
  confirmed: boolean;
} {
  const connected = new Set(connectedProviders);
  const confirmedProvider =
    lastUsedProvider && connected.has(lastUsedProvider)
      ? lastUsedProvider
      : PROVIDERS.find((candidate) => connected.has(candidate.id))?.id;
  const provider = confirmedProvider ?? lastUsedProvider ?? "anthropic";

  return {
    provider,
    model:
      provider === lastUsedProvider
        ? (validModelOrNull(provider, lastUsedModel) ??
          getDefaultModel(provider))
        : getDefaultModel(provider),
    confirmed: confirmedProvider !== undefined,
  };
}
