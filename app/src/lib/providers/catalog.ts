import type { ProviderCatalog } from "@houston/protocol";
import { PROVIDER_ID_RENAME } from "../provider-overrides/dialect.ts";
import { LOCAL_PROVIDER } from "../provider-overrides/local-provider.ts";
import { PROVIDER_OVERRIDES } from "../provider-overrides/overrides.ts";
import {
  DROP_PI_PROVIDERS,
  REGIONAL_SUFFIX,
} from "../provider-overrides/pi-catalog-filters.ts";
import { buildProvider, defaultModelFor } from "./build-provider.ts";
import { indexRunsAs } from "./runs-as.ts";
import type { ProviderInfo } from "./types.ts";

function buildCatalog(catalog: ProviderCatalog): ProviderInfo[] {
  const finalIds = new Set(
    catalog
      .filter((p) => !DROP_PI_PROVIDERS.has(p.id))
      .map((p) => PROVIDER_ID_RENAME[p.id] ?? p.id),
  );
  const built: ProviderInfo[] = [];
  for (const piProvider of catalog) {
    if (DROP_PI_PROVIDERS.has(piProvider.id)) continue;
    const finalId = PROVIDER_ID_RENAME[piProvider.id] ?? piProvider.id;
    const parent = finalId.replace(REGIONAL_SUFFIX, "");
    if (parent !== finalId && finalIds.has(parent)) continue;
    built.push(buildProvider(piProvider, finalId, PROVIDER_OVERRIDES[finalId]));
  }
  built.push({ ...LOCAL_PROVIDER });
  return built;
}

function buildSeed(): ProviderInfo[] {
  const seed: ProviderInfo[] = [];
  for (const [id, override] of Object.entries(PROVIDER_OVERRIDES)) {
    seed.push({
      id,
      name: override.name ?? id,
      subtitle: override.subtitle ?? "",
      installUrl: override.installUrl ?? "",
      cost: override.cost ?? "",
      models: [],
      defaultModel: defaultModelFor(id, []),
      auth: override.auth ?? "apiKey",
      apiKeyUrl: override.apiKeyUrl,
      copilotConnect: override.copilotConnect,
      gatewayIds: override.gatewayIds,
    });
  }
  seed.push({ ...LOCAL_PROVIDER });
  return seed;
}

export const PROVIDERS: ProviderInfo[] = buildSeed();

export function hydrateProviderCatalog(catalog: ProviderCatalog): void {
  if (catalog.length === 0) return;
  indexRunsAs(catalog);
  const built = buildCatalog(catalog);
  PROVIDERS.length = 0;
  PROVIDERS.push(...built);
}
