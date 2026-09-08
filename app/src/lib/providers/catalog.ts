import type { ProviderCatalog } from "@houston/protocol";
import { PROVIDER_ID_RENAME } from "../provider-overrides/dialect.ts";
import { LOCAL_PROVIDER } from "../provider-overrides/local-provider.ts";
import { PROVIDER_OVERRIDES } from "../provider-overrides/overrides.ts";
import {
  DROP_PI_PROVIDERS,
  REGIONAL_SUFFIX,
} from "../provider-overrides/pi-catalog-filters.ts";
import { buildProvider, defaultModelFor } from "./build-provider.ts";
import type { ProviderInfo } from "./types.ts";

/**
 * The LIVE provider catalog: the seed built from the Houston overrides alone,
 * rebuilt in place from the host's pi-ai catalog once it arrives. Every read
 * helper (`./lookup.ts`, `./visibility.ts`, `./model-values.ts`) reads it.
 */

/**
 * The full provider list built from a pi catalog: drop the pi providers that
 * collide with a rename (`DROP_PI_PROVIDERS`, applied first), rename ids
 * (`PROVIDER_ID_RENAME` — pi `openai-codex` → Houston `openai`), layer on the
 * Houston overrides, then append the local OpenAI-compatible provider pi has no
 * concept of.
 */
function buildCatalog(catalog: ProviderCatalog): ProviderInfo[] {
  // Ids present after drops/renames, so the regional filter below can tell a
  // duplicate deployment apart from a provider whose ONLY deployment is
  // regional (which stays visible rather than vanishing entirely).
  const finalIds = new Set(
    catalog
      .filter((p) => !DROP_PI_PROVIDERS.has(p.id))
      .map((p) => PROVIDER_ID_RENAME[p.id] ?? p.id),
  );
  const built: ProviderInfo[] = [];
  for (const piProvider of catalog) {
    if (DROP_PI_PROVIDERS.has(piProvider.id)) continue;
    const finalId = PROVIDER_ID_RENAME[piProvider.id] ?? piProvider.id;
    // Regional duplicates (…-cn / -sgp / -ams) of a provider that also ships
    // its standard deployment are hidden — one card per provider.
    const parent = finalId.replace(REGIONAL_SUFFIX, "");
    if (parent !== finalId && finalIds.has(parent)) continue;
    built.push(buildProvider(piProvider, finalId, PROVIDER_OVERRIDES[finalId]));
  }
  built.push({ ...LOCAL_PROVIDER });
  return built;
}

/**
 * Seed the provider list from the Houston overrides ALONE — every first-class
 * provider with its metadata but an EMPTY model list, plus the local provider —
 * so every helper below works before the pi catalog has loaded (nothing throws,
 * the connect surfaces render their cards) and the picker fills in models once
 * `hydrateProviderCatalog` runs.
 */
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

/**
 * The live provider catalog. A MUTABLE array with a STABLE reference: it starts
 * as the override-only seed and is rebuilt IN PLACE by `hydrateProviderCatalog`
 * from the host's `/v1/catalog` payload, so every module that imported `PROVIDERS`
 * sees the hydrated set at read time without re-importing. All the helpers below
 * read this array.
 */
export const PROVIDERS: ProviderInfo[] = buildSeed();

/**
 * Replace `PROVIDERS` in place with the catalog built from the host's pi-ai
 * catalog (`useProviderCatalog` calls this on fetch). Mutates the existing array
 * rather than reassigning so live `PROVIDERS` importers pick up the new set.
 */
export function hydrateProviderCatalog(catalog: ProviderCatalog): void {
  // An empty catalog is NOT a deployment with zero providers: every deployment
  // serves the full pi-ai set, so `[]` means a broken host or empty registry.
  // Rebuilding from it would wipe the override seed down to just the local
  // provider, emptying the picker + connect surfaces, so the seed is kept and
  // the UI stays populated.
  //
  // Nothing is logged here: the query that OWNS the fetch already counts a
  // 200-but-empty catalog as a failure and surfaces it once, with authored copy
  // and a Sentry report (`hooks/use-provider-catalog.ts` ->
  // `deriveCatalogFailure` -> `useQueryErrorToast`). A console line here would
  // be a second, unreported account of the same event.
  if (catalog.length === 0) return;
  const built = buildCatalog(catalog);
  PROVIDERS.length = 0;
  PROVIDERS.push(...built);
}
