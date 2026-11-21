import {
  MINIMAX_PROVIDER,
  MINIMAX_RETIRED_MODELS,
} from "@houston/domain/minimax-retired";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import type { CatalogProvider } from "@houston/protocol";

export { MINIMAX_PROVIDER };

export function withMinimaxRetired(provider: CatalogProvider): CatalogProvider {
  const runsAs = DEFAULT_MODEL.minimax;
  const base = provider.models.find((m) => m.id === runsAs);
  if (!runsAs || !base) return provider;
  const models = provider.models.map((entry) =>
    MINIMAX_RETIRED_MODELS.has(entry.id) ? { ...entry, runsAs } : entry,
  );
  for (const id of MINIMAX_RETIRED_MODELS)
    if (!models.some((m) => m.id === id))
      models.push({ ...base, id, name: id, runsAs });
  return { ...provider, models };
}
