/**
 * Subpath re-export of the shared provider tables (`@houston/sdk/provider-catalog`).
 *
 * The provider id DIALECT (pi's canonical `openai-codex` ↔ Houston's display
 * `openai`), each provider's DEFAULT MODEL, and the legacy MODEL ALIASES all
 * live once in `@houston/domain`. Surfaces import them from here rather than
 * restating them: the app used to carry its own copy of all three, and the
 * copies drifted — the icon path aliased the dialect while the label path did
 * not, and the Anthropic default read `claude-sonnet-5` in the app but
 * `claude-sonnet-4-6` in the migration that rewrites user data.
 *
 * This subpath (like `@houston/sdk/agent-name`) stays loadable under plain
 * `node --experimental-strip-types` — the app's unit-test runner — where the
 * barrels' extensionless internal imports do not resolve.
 */
export { MODEL_ALIASES } from "@houston/domain/model-aliases";
export { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
export {
  PROVIDER_CANONICAL_RENAME,
  PROVIDER_DISPLAY_RENAME,
  toCanonicalProviderId,
  toCanonicalProviderIdOrNull,
  toDisplayProviderId,
  toDisplayProviderIdOrNull,
} from "@houston/domain/provider-dialect";
