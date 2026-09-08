/**
 * The data tables for the legacy → pi provider/model migration (see
 * `provider-model.ts` for the mapping logic), gathered from the cohesive leaf
 * modules that own them:
 *
 * | Module                        | Owns                                      |
 * | ----------------------------- | ----------------------------------------- |
 * | `provider-ids.ts`             | `ProviderId`, `isProviderId`, `DEFAULT_PROVIDER` |
 * | `provider-dialect.ts`         | canonical ↔ display id rename             |
 * | `provider-default-models.ts`  | `DEFAULT_MODEL` (every surface's default) |
 * | `provider-valid-models.ts`    | `VALID_MODELS`                            |
 * | `provider-name-aliases.ts`    | `PROVIDER_ALIASES`                        |
 * | `model-aliases.ts`            | `MODEL_ALIASES`                           |
 *
 * Each leaf is dependency-free — no import at all, a type-only one, or (in
 * `provider-name-aliases.ts`) a value import of a sibling leaf — so it can be
 * exposed as a package subpath and loaded under plain
 * `node --experimental-strip-types`, which is what lets the app catalog read
 * these values rather than restate them. A leaf that IS exposed as a subpath
 * reaches a sibling through the package subpath (`model-aliases.ts` reads
 * `@houston/domain/provider-default-models`): that runner resolves no
 * extensionless relative specifier, and a `.ts` one is a type error under this
 * package's emitting tsconfig.
 *
 * The catalog is hard-coded (NOT read from pi-ai) so `@houston/domain` stays
 * free of the pi-ai dependency and the open/closed boundary. The valid-model
 * sets were captured from `getModels("anthropic")` / `getModels("openai-codex")`
 * — keep them current as pi's catalog moves (a stale entry only ever means we
 * migrate to the provider default + emit a diagnostic, never a throw).
 */

export { MODEL_ALIASES } from "./model-aliases";
export { DEFAULT_MODEL } from "./provider-default-models";
export {
  PROVIDER_CANONICAL_RENAME,
  PROVIDER_DISPLAY_RENAME,
  toCanonicalProviderId,
  toCanonicalProviderIdOrNull,
  toDisplayProviderId,
  toDisplayProviderIdOrNull,
} from "./provider-dialect";
export {
  DEFAULT_PROVIDER,
  isProviderId,
  type ProviderId,
} from "./provider-ids";
export { PROVIDER_ALIASES } from "./provider-name-aliases";
export { VALID_MODELS } from "./provider-valid-models";
