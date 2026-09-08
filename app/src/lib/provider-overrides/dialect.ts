/**
 * The provider id DIALECT, re-exported from the ONE table that owns it
 * (`@houston/domain` `provider-dialect.ts`, reached through
 * `@houston/sdk/provider-catalog`).
 *
 * pi-ai's OAuth OpenAI provider is `openai-codex`, but Houston's frontend
 * card/logo/connect uses the id `openai`. The hydrator renames it so the
 * override below (keyed `openai`) and the `openai` logo apply. pi ALSO ships a
 * DIRECT api-key `openai` provider (~42 models) that would collide with the
 * rename, so it is dropped first (see `DROP_PI_PROVIDERS`).
 *
 * The app used to restate this map, and the copies drifted: the logo table
 * aliased `openai-codex` while the label lookups did not, so a conversation
 * pinned to the canonical id drew the OpenAI mark beside the raw string — and
 * missed the catalog, inheriting another provider's default model.
 */
export {
  PROVIDER_DISPLAY_RENAME as PROVIDER_ID_RENAME,
  toCanonicalProviderId,
  toDisplayProviderId,
  toDisplayProviderIdOrNull,
} from "@houston/sdk/provider-catalog";
