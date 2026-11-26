import type { ProviderCatalog } from "@houston/protocol";
// Same self-contained-subpath rule as `./build-provider.ts`: the ONE provider
// dialect table, owned by `@houston/domain` and re-exported by the SDK.
import { toCanonicalProviderId } from "@houston/sdk/provider-catalog";

/**
 * Which model a provider's RETIRED catalog row runs as (`CatalogModelEntry.runsAs`):
 * the anthropic provider runs `claude-opus-5` as `claude-opus-5-5`. An
 * allowed-models ceiling written with the retired id admits the model it runs
 * as, on that provider only (`../ceiling-match.ts`).
 *
 * Indexed from the RAW host catalog, before `isCatalogEntryVisible` hides the retired
 * rows from every picker: the rows the picker never shows are exactly the ones
 * that carry the field. Keyed by pi's canonical provider id with lower-cased
 * model ids, the casing rule the gateway's clamp applies.
 */
const RUNS_AS = new Map<string, Map<string, string>>();

/** Rebuild the index from the host's `/v1/catalog` (`hydrateProviderCatalog`). */
export function indexRunsAs(catalog: ProviderCatalog): void {
  RUNS_AS.clear();
  for (const provider of catalog) {
    for (const entry of provider.models) {
      if (!entry.runsAs) continue;
      let rows = RUNS_AS.get(provider.id);
      if (!rows) {
        rows = new Map();
        RUNS_AS.set(provider.id, rows);
      }
      rows.set(entry.id.toLowerCase(), entry.runsAs);
    }
  }
}

/**
 * The model `provider`'s own row for `model` runs as, or `null` when that row
 * carries no `runsAs` (or does not exist). `provider` in either dialect.
 */
export function catalogRunsAs(provider: string, model: string): string | null {
  return (
    RUNS_AS.get(toCanonicalProviderId(provider))?.get(model.toLowerCase()) ??
    null
  );
}
