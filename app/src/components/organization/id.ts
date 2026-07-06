/**
 * The `viewMode` value for the top-level Organization dashboard (Teams v2).
 *
 * Like `INTEGRATIONS_VIEW_ID`, this must live OUTSIDE `STANDARD_TAB_IDS` so it
 * never shadows a per-agent tab. Kept in its own module (not the view file) so
 * `top-level-views.ts` can import the id without pulling the React component
 * into that pure lib.
 */
export const ORGANIZATION_VIEW_ID = "organization";
