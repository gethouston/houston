/**
 * Subpath re-export of the shared provider tables (`@houston/sdk/provider-catalog`).
 *
 * The provider id DIALECT (pi's canonical `openai-codex` ↔ Houston's display
 * `openai`), each provider's DEFAULT MODEL, the curated MODEL DISPLAY NAMES and
 * the legacy MODEL ALIASES all live once in `@houston/domain`. Surfaces import
 * them from here rather than restating them: the app used to carry its own copy
 * of each, and the copies drifted — the icon path aliased the dialect while the
 * label path did not, the Anthropic default read `claude-sonnet-5` in the app
 * but `claude-sonnet-4-6` in the migration that rewrites user data, and the
 * picker's model names were hand-synced against the assistant's.
 *
 * This subpath (like `@houston/sdk/agent-name`) stays loadable under plain
 * `node --experimental-strip-types` — the app's unit-test runner — where the
 * barrels' extensionless internal imports do not resolve.
 */

export { MODEL_ALIASES, modelAliasesFor } from "@houston/domain/model-aliases";
export {
  humanizedModelName,
  MODEL_DISPLAY,
  modelDisplayName,
} from "@houston/domain/model-display-names";
export { DEFAULT_MODEL } from "@houston/domain/provider-default-models";
export {
  PROVIDER_CANONICAL_RENAME,
  PROVIDER_DISPLAY_RENAME,
  toCanonicalProviderId,
  toCanonicalProviderIdOrNull,
  toDisplayProviderId,
  toDisplayProviderIdOrNull,
} from "@houston/domain/provider-dialect";
