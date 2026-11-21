import { spokenModelRows } from "@houston/domain/provider-model-display";
import type { CatalogProvider } from "@houston/protocol";
import { hostProvider, isKnownProvider } from "./lookup";

export function withMissionPin(provider: CatalogProvider): CatalogProvider {
  if (!isKnownProvider(provider.id)) return provider;
  const name = hostProvider(provider.id)?.name;
  return {
    ...provider,
    pin: {
      ...(name ? { name } : {}),
      models: spokenModelRows(provider.id),
    },
  };
}
