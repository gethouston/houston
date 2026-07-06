import { PROVIDERS } from "../providers.ts";
import { detectLab } from "./catalog-lab.ts";
import {
  addCandidate,
  compareModels,
  curatedRaw,
  type Draft,
  finalize,
} from "./catalog-merge.ts";
import type { RawModel } from "./catalog-snapshot.ts";
import { loadRawCatalog } from "./catalog-snapshot.ts";
import type { CatalogModel, HubCatalog } from "./catalog-types.ts";

// API-key gateways contribute their full model lists straight from the snapshot.
// `opencode` already includes OpenCode Go's models (folded at generation).
const API_KEY_GATEWAYS = [
  "opencode",
  "openrouter",
  "deepseek",
  "google",
  "amazon-bedrock",
  "minimax",
];
// Subscription providers: the plan can only run the curated set from PROVIDERS,
// so their offers come from there (enriched with snapshot specs), never the
// full snapshot list.
const OAUTH_PROVIDERS = ["openai", "anthropic", "github-copilot"];

/**
 * Build the hub catalog from the baked snapshot for a set of visible providers.
 * Offers from non-visible providers are dropped; models with no remaining
 * offer never appear. The snapshot import is memoized; the merge runs per call.
 *
 * `liveOpenRouter` folds the LIVE OpenRouter catalog (already mapped to raw
 * entries by `catalog-live.ts`) into the `openrouter` bucket before the merge,
 * so a live offer attaches to a matching snapshot model and OpenRouter-only
 * models appear as new entries. The snapshot singleton is never mutated. Empty
 * when the deployment can't reach OpenRouter (web/cloud, no key, or offline).
 */
export async function loadHubCatalog(
  visibleProviderIds: string[],
  liveOpenRouter: RawModel[] = [],
): Promise<HubCatalog> {
  const raw = await loadRawCatalog();
  const visible = new Set(visibleProviderIds);
  const opencodeVisible = visible.has("opencode") || visible.has("opencode-go");
  const drafts = new Map<string, Draft>();

  for (const providerId of API_KEY_GATEWAYS) {
    const isVisible =
      providerId === "opencode" ? opencodeVisible : visible.has(providerId);
    if (!isVisible) continue;
    const snapshotModels = raw.providers[providerId]?.models ?? [];
    const models =
      providerId === "openrouter"
        ? [...snapshotModels, ...liveOpenRouter]
        : snapshotModels;
    for (const model of models)
      addCandidate(drafts, {
        providerId,
        raw: model,
        subscription: false,
        lab: detectLab(providerId, model),
      });
  }

  for (const providerId of OAUTH_PROVIDERS) {
    if (!visible.has(providerId)) continue;
    const bucket = raw.providers[providerId]?.models ?? [];
    const byId = new Map(bucket.map((m) => [m.id, m]));
    const curated = PROVIDERS.find((p) => p.id === providerId)?.models ?? [];
    for (const model of curated) {
      const entry = curatedRaw(model, byId.get(model.id));
      addCandidate(drafts, {
        providerId,
        raw: entry,
        subscription: true,
        lab: detectLab(providerId, entry),
      });
    }
  }

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
