/**
 * The `viewMode` value for the top-level Integrations page.
 *
 * Deliberately NOT `"integrations"`: that slug is a per-agent STANDARD_TABS id
 * (the agent's own Integrations tab), so a top-level view sharing it would
 * shadow the agent tab. Like `"dashboard"` / `"settings"`, a top-level view id
 * must live OUTSIDE `STANDARD_TAB_IDS`.
 */
export const INTEGRATIONS_VIEW_ID = "integrations-home";
