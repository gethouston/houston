/**
 * The provider catalog's public face — every surface imports it from here.
 *
 * The catalog is BUILT in `./providers/build-provider.ts` (one pi provider →
 * one Houston card) and `./providers/catalog.ts` (the live `PROVIDERS` array +
 * its in-place hydration), and READ through `./providers/lookup.ts` (find a
 * provider), `./providers/visibility.ts` (which providers a surface shows) and
 * `./providers/model-values.ts` (one model's label, window, effort). The shapes
 * and the effort vocabulary live in `./providers/types.ts`.
 */
export { deriveEffortLevels } from "./providers/build-provider.ts";
export * from "./providers/catalog.ts";
export * from "./providers/lookup.ts";
export * from "./providers/model-values.ts";
export * from "./providers/types.ts";
export * from "./providers/visibility.ts";
