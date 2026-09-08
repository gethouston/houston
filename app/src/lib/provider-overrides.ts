/**
 * The Houston overrides layer's public face — every surface imports it here.
 *
 * The metadata tables are grouped by what the providers ARE:
 * `./provider-overrides/overrides.ts` assembles `PROVIDER_OVERRIDES` in catalog
 * order from the subscription, gateway, curated api-key and api-key groups
 * beside it. The rest of the layer: the override SHAPES (`./types.ts`), the id
 * dialect and the `openai-codex → openai` rename (`./dialect.ts`), what pi-ai
 * content stays hidden (`./pi-catalog-filters.ts`), the local
 * OpenAI-compatible provider pi has no concept of (`./local-provider.ts`), the
 * connect/hub id lists (`./connect-surfaces.ts`) and the one-line row copy
 * (`./descriptions.ts`).
 */
export * from "./provider-overrides/connect-surfaces.ts";
export * from "./provider-overrides/descriptions.ts";
export * from "./provider-overrides/dialect.ts";
export * from "./provider-overrides/local-provider.ts";
export * from "./provider-overrides/overrides.ts";
export * from "./provider-overrides/pi-catalog-filters.ts";
export type {
  ModelOverride,
  ProviderOverride,
} from "./provider-overrides/types.ts";
