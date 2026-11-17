import {
  MINIMAX_PROVIDER,
  MINIMAX_RETIRED_MODELS,
} from "@houston/domain/minimax-retired";
import { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
import type { CatalogProvider } from "@houston/protocol";

export { MINIMAX_PROVIDER };

/**
 * MiniMax's retired ids stay in the catalog as rows carrying `runsAs` = the
 * MiniMax default, the way `./anthropic-catalog` keeps retired Claude ids, so
 * an allowed-models ceiling written with one still admits the model a turn on
 * it runs (the gateway's clamp and the app read the field). The app hides
 * these rows from every picker (`VISIBLE_MODELS`).
 *
 * pi still ships the M2.7 rows; `MiniMax-M3[1m]` was never a pi row, so it is
 * cloned from the default's row under its own id.
 */
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
