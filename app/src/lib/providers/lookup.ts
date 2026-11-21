import { toDisplayProviderId } from "@houston/sdk/provider-catalog";
import { BRAND_ALIASES } from "./brand-aliases.ts";
import { PROVIDERS } from "./catalog.ts";
import type { ProviderInfo } from "./types.ts";

export function providerName(id: string): string {
  const known = getProvider(id);
  if (known) return known.name;
  const parent = BRAND_ALIASES[toDisplayProviderId(id)];
  return (parent === undefined ? undefined : getProvider(parent)?.name) ?? id;
}

export function getProvider(id: string): ProviderInfo | undefined {
  const display = toDisplayProviderId(id);
  return PROVIDERS.find((p) => p.id === display);
}

export function validProviderOrNull(
  providerId: string | null | undefined,
): string | null {
  return (providerId && getProvider(providerId)?.id) || null;
}

const OPEN_CATALOG_PROVIDERS: ReadonlySet<string> = new Set([
  "openrouter",
  "opencode",
  "opencode-go",
  "openai-compatible",
]);

export function isOpenCatalogProvider(
  providerId: string | null | undefined,
): boolean {
  return (
    !!providerId && OPEN_CATALOG_PROVIDERS.has(toDisplayProviderId(providerId))
  );
}
