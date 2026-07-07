/**
 * Pure action → provider routing (no I/O), shared by the sandbox proxy and the
 * grant policy. Custom (bring-your-own-key) integrations run behind a provider
 * whose actions are all named `CUSTOM_<SLUG uppercased>_REQUEST`; every other
 * action belongs to the default provider (Composio today). Keeping the rule in
 * ONE tested place means the search fan-out, execute routing, and grant
 * enforcement can never drift on how a `CUSTOM_` action is recognized.
 */

/** The provider id that serves custom, per-user API-key integrations. */
export const CUSTOM_PROVIDER_ID = "custom";

/** Every custom integration's single tool: `CUSTOM_<SLUG>_REQUEST`. */
const CUSTOM_ACTION_RE = /^CUSTOM_(.+)_REQUEST$/i;

/** True when an action belongs to the custom provider (by naming convention). */
export function isCustomAction(action: string): boolean {
  return /^CUSTOM_/i.test(action);
}

/**
 * The custom integration slug an action addresses, or null when the action is
 * not a well-formed `CUSTOM_<SLUG>_REQUEST`. The slug is the lowercased middle
 * segment (a slug keeps its underscores, e.g. `CUSTOM_ACME_CRM_REQUEST` →
 * `acme_crm`), so grant enforcement matches it EXACTLY against the toolkit slug
 * rather than by a loose prefix that could mis-attribute one integration to
 * another with a shared leading segment.
 */
export function customActionSlug(action: string): string | null {
  const m = action.match(CUSTOM_ACTION_RE);
  return m?.[1] ? m[1].toLowerCase() : null;
}

/**
 * The provider that must run an action: the custom provider for a `CUSTOM_`
 * action when it is registered, else the default (first-registered) provider.
 * `providerIds` must be non-empty (the caller has already resolved a wired
 * registry).
 */
export function providerForAction(
  action: string,
  providerIds: string[],
): string {
  if (isCustomAction(action) && providerIds.includes(CUSTOM_PROVIDER_ID)) {
    return CUSTOM_PROVIDER_ID;
  }
  const [first] = providerIds;
  if (!first) throw new Error("providerForAction: no providers registered");
  return first;
}
