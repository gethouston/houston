import type { ProviderCatalog } from "@houston/protocol";
import {
  addCandidate,
  compareModels,
  type Draft,
  finalize,
  foldEnrichment,
} from "./catalog-merge.ts";
import { piCatalogToCandidates } from "./catalog-pi.ts";
import { snapshotModels } from "./catalog-snapshot.ts";
import type { CatalogModel, HubCatalog } from "./catalog-types.ts";

/**
 * Build the hub catalog from the pi-ai catalog (the host's `GET /v1/catalog` =
 * the RUNNABLE set), optionally enriched by the baked models.dev snapshot.
 *
 * pi-ai is authoritative: every hub model exists because pi-ai can run it, with
 * pi's own pricing, context window, reasoning, and vision. The catalog is already
 * scoped to what this host can run (all providers on desktop, ~3 in a cloud pod).
 * Pass `visibleProviderIds` (the `getVisibleProviders` set) to scope the hub to
 * EXACTLY the providers the picker shows, so the AI Models tab and the picker
 * stay identical. The snapshot is folded in second as OPTIONAL
 * enrichment (`foldEnrichment`): a snapshot model fills the metadata pi-ai lacks
 * (description / toolCall / imageGen / knowledge / releaseDate) on a model that
 * ALSO exists in pi-ai, and a snapshot-only model is dropped.
 */
export function loadHubCatalog(
  catalog: ProviderCatalog,
  opts: { enrich?: boolean; visibleProviderIds?: ReadonlySet<string> } = {},
): HubCatalog {
  const { enrich = true, visibleProviderIds } = opts;
  const drafts = new Map<string, Draft>();

  for (const cand of piCatalogToCandidates(catalog, visibleProviderIds))
    addCandidate(drafts, cand);
  if (enrich) for (const raw of snapshotModels()) foldEnrichment(drafts, raw);

  const models = [...drafts.entries()]
    .map(([key, draft]) => finalize(key, draft))
    .sort(compareModels);

  const byKey = new Map(models.map((m) => [m.key, m]));
  const byProvider = new Map<string, CatalogModel[]>();
  let offerCount = 0;
  for (const model of models)
    for (const offer of model.offers) {
      offerCount++;
      const list = byProvider.get(offer.providerId);
      if (list) list.push(model);
      else byProvider.set(offer.providerId, [model]);
    }

  return { models, byKey, byProvider, modelCount: models.length, offerCount };
}
