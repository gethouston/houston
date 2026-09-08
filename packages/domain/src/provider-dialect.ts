/**
 * The ONE provider-id dialect map: pi's CANONICAL id ↔ the DISPLAY id Houston's
 * surfaces render.
 *
 * Houston shows OpenAI's Codex subscription as `openai`, while pi (and therefore
 * every wire pin, agent config, activity row and routine pin) calls it
 * `openai-codex`. Every other provider id is spelled the same on both sides and
 * passes through untouched.
 *
 * Both halves of a provider's presentation must translate through THIS module:
 * the icon path used to alias the dialect while the label path did not, so a
 * conversation pinned to `openai-codex` drew the OpenAI mark beside the raw id
 * — and, worse, missed the catalog entirely and inherited another provider's
 * default model.
 *
 * A dependency-free LEAF on purpose: it is exposed as the
 * `@houston/domain/provider-dialect` subpath (re-exported by
 * `@houston/sdk/provider-catalog`) so surface code loads it under plain
 * `node --experimental-strip-types`, where a barrel's extensionless internal
 * imports do not resolve.
 *
 * TRADEOFF: this hard-codes that a bare `openai` means the Codex product. If
 * Houston ever offers platform-key OpenAI as its own provider, this map and the
 * catalog's `openai` drop (`DROP_PI_PROVIDERS`) must be removed together.
 */

/** Canonical pi provider id → the display id Houston's surfaces render. */
export const PROVIDER_DISPLAY_RENAME: Readonly<Record<string, string>> = {
  "openai-codex": "openai",
};

/** Inverse of {@link PROVIDER_DISPLAY_RENAME}: display id → canonical pi id. */
export const PROVIDER_CANONICAL_RENAME: Readonly<Record<string, string>> =
  Object.fromEntries(
    Object.entries(PROVIDER_DISPLAY_RENAME).map(([canonical, display]) => [
      display,
      canonical,
    ]),
  );

/**
 * The DISPLAY id for a provider id in either dialect. Unknown and
 * already-display ids pass through — the pi catalog is open (~35 providers and
 * drifting), so an id this map has never heard of is not invalid.
 */
export function toDisplayProviderId(id: string): string {
  return PROVIDER_DISPLAY_RENAME[id] ?? id;
}

/**
 * {@link toDisplayProviderId} for a value read off disk, where the field may be
 * absent: `null`/`""` stay `null` (absent, never a pick).
 */
export function toDisplayProviderIdOrNull(
  id: string | null | undefined,
): string | null {
  return id ? toDisplayProviderId(id) : null;
}

/**
 * The CANONICAL pi id for a provider id in either dialect. Applied before a
 * value leaves the client (a turn pin, an agent config write) and before any
 * lookup keyed by pi's own ids.
 */
export function toCanonicalProviderId(id: string): string {
  return PROVIDER_CANONICAL_RENAME[id] ?? id;
}

/**
 * {@link toCanonicalProviderId} for a value that may be absent: `null`/`""`
 * stay `null`.
 */
export function toCanonicalProviderIdOrNull(
  id: string | null | undefined,
): string | null {
  return id ? toCanonicalProviderId(id) : null;
}
