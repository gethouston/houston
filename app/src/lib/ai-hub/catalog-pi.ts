import type { CatalogModelEntry, ProviderCatalog } from "@houston/protocol";
import {
  modelDisplayName,
  toCanonicalProviderId,
} from "@houston/sdk/provider-catalog";
import {
  DROP_PI_PROVIDERS,
  isModelVisible,
  PROVIDER_ID_RENAME,
} from "../provider-overrides.ts";
import { normalizeKey } from "./catalog-key.ts";
import { detectLab } from "./catalog-lab.ts";
import type { Candidate } from "./catalog-merge.ts";
import type { RawModel } from "./catalog-snapshot.ts";

function entryToRaw(providerId: string, entry: CatalogModelEntry): RawModel {
  const raw: RawModel = {
    key: normalizeKey(entry.name),
    id: entry.id,
    name:
      modelDisplayName(toCanonicalProviderId(providerId), entry.id) ??
      entry.name,
  };
  if (entry.reasoning) raw.reasoning = true;
  if (entry.vision) raw.input = ["text", "image"];
  if (typeof entry.contextWindow === "number")
    raw.context = entry.contextWindow;
  if (typeof entry.maxTokens === "number") raw.output = entry.maxTokens;
  raw.costIn = entry.pricing.input;
  raw.costOut = entry.pricing.output;
  return raw;
}

export function piCatalogToCandidates(
  catalog: ProviderCatalog,
  visibleIds?: ReadonlySet<string>,
): Candidate[] {
  const candidates: Candidate[] = [];
  for (const provider of catalog) {
    if (DROP_PI_PROVIDERS.has(provider.id)) continue;
    const providerId = PROVIDER_ID_RENAME[provider.id] ?? provider.id;
    if (visibleIds && !visibleIds.has(providerId)) continue;
    const subscription = provider.auth === "oauth";
    for (const entry of provider.models) {
      if (!isModelVisible(providerId, entry.id)) continue;
      const raw = entryToRaw(providerId, entry);
      candidates.push({
        providerId,
        raw,
        subscription,
        lab: detectLab(providerId, raw),
      });
    }
  }
  return candidates;
}
