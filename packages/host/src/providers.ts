/**
 * The host's provider facade: everything outside `./providers/` imports the
 * provider surface from here. The pieces live next door — the catalog data in
 * `./providers/catalog`, its shape in `./providers/types`, and the lookups /
 * predicates over it in `./providers/lookup`.
 */

// The api-key-provider gate is pi-derived (any pi provider that isn't OAuth),
// not the curated `./providers/catalog` — see ./providers/api-key. Re-exported
// here so the connect route + dispatch keep importing it from the one provider
// facade.
export { isApiKeyProvider } from "./providers/api-key";
export { PROVIDERS } from "./providers/catalog";
export {
  CLOUD_PROVIDERS,
  hostProvider,
  isCloudProvider,
  isKnownProvider,
  isTurnServable,
  OPENAI_COMPATIBLE,
  providerName,
} from "./providers/lookup";
export type { HostProvider, ProviderAuthMethod } from "./providers/types";
