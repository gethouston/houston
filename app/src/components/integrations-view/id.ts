/**
 * The `viewMode` value for the top-level Integrations page.
 *
 * Deliberately NOT `"integrations"`: that slug was the per-agent Integrations
 * TAB's id. The tab (and the whole agent tab shell) is gone, but the id stays
 * as it is — renaming a `viewMode` buys nothing, and `"integrations-home"` still
 * says what it is next to `"dashboard"` / `"settings"`.
 */
export const INTEGRATIONS_VIEW_ID = "integrations-home";
