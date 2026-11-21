import { toDisplayProviderIdOrNull } from "./provider-overrides.ts";
import { getDefaultModel, PROVIDERS, validModelOrNull } from "./providers.ts";

export interface PickDefaultProviderModelOptions {
  lastUsedProvider: string | null | undefined;
  lastUsedModel: string | null | undefined;
  connectedProviders: ReadonlySet<string> | readonly string[];
}

export function pickDefaultProviderModel({
  lastUsedProvider,
  lastUsedModel,
  connectedProviders,
}: PickDefaultProviderModelOptions): {
  provider: string;
  model: string;
  confirmed: boolean;
} {
  const connected = new Set(
    [...connectedProviders].map((id) => toDisplayProviderIdOrNull(id) ?? id),
  );
  const lastUsed = toDisplayProviderIdOrNull(lastUsedProvider);
  const confirmedProvider =
    lastUsed && connected.has(lastUsed)
      ? lastUsed
      : PROVIDERS.find((candidate) => connected.has(candidate.id))?.id;
  const provider = confirmedProvider ?? lastUsed ?? "anthropic";

  return {
    provider,
    model:
      provider === lastUsed
        ? (validModelOrNull(provider, lastUsedModel) ??
          getDefaultModel(provider))
        : getDefaultModel(provider),
    confirmed: confirmedProvider !== undefined,
  };
}
