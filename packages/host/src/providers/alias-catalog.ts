import { canonicalModelId } from "@houston/domain/canonical-model-id";
import { modelAliasesFor } from "@houston/domain/model-aliases";
import type { CatalogProvider } from "@houston/protocol";

/**
 * Every renamed id in the domain's alias table (`MODEL_ALIASES`) stays in the
 * catalog as a row carrying `runsAs` = the model a turn on it runs, the way
 * `./minimax-catalog` keeps MiniMax's retired ids, so an allowed-models
 * ceiling written with a dropped id still admits its successor (the gateway's
 * clamp and the app read the field). The app hides every `runsAs` row from
 * its pickers.
 *
 * A row pi dropped is cloned from its successor's row under the old id. The
 * target is `canonicalModelId`, the same rename the runtime and the app's turn
 * pin apply, so the catalog never names a model a turn would not run.
 */
export function withModelAliases(provider: CatalogProvider): CatalogProvider {
  const renames = Object.keys(modelAliasesFor(provider.id)).flatMap((id) => {
    const runsAs = canonicalModelId(provider.id, id);
    return runsAs && runsAs !== id ? [[id, runsAs] as const] : [];
  });
  if (renames.length === 0) return provider;
  const runsAsById = new Map(renames);
  const models = provider.models.map((entry) => {
    const runsAs = runsAsById.get(entry.id);
    return runsAs ? { ...entry, runsAs } : entry;
  });
  for (const [id, runsAs] of renames) {
    if (models.some((m) => m.id === id)) continue;
    const base = provider.models.find((m) => m.id === runsAs);
    if (base) models.push({ ...base, id, name: id, runsAs });
  }
  return { ...provider, models };
}
