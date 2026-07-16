/**
 * The `viewMode` value for the top-level Permissions view (Teams v2). ONE place
 * manages permissions: People (who can use each agent) + Agents (what each agent
 * may use). Owner/admin-only, gated exactly like the Organization dashboard.
 *
 * Like `ORGANIZATION_VIEW_ID`, this must live OUTSIDE `STANDARD_TAB_IDS` so it
 * never shadows a per-agent tab. Kept in its own module (not the view file) so
 * `top-level-views.ts` and the blocked-app CTA can import the id without pulling
 * the React component into those pure libs.
 */
export const PERMISSIONS_VIEW_ID = "permissions";
