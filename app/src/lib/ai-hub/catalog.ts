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
