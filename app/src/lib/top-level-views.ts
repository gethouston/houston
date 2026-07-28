/**
 * The non-agent, top-level views: full-window surfaces reached from the sidebar
 * rather than from an agent's tab bar. `workspace-shell.tsx` renders each one
 * and treats every other `viewMode` as an agent tab; `sidebar.tsx` highlights
 * the matching nav item. Both predicates source from this one set so a new
 * top-level view (like the AI hub) can't be added to one and forgotten in the
 * other.
 */
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id.ts";
import { ORGANIZATION_VIEW_ID } from "../components/organization/id.ts";
import { PERMISSIONS_VIEW_ID } from "../components/permissions/id.ts";
import { STORE_VIEW_ID } from "../components/store-view/id.ts";
import { USAGE_VIEW_ID } from "../components/usage-view/id.ts";

export {
  INTEGRATIONS_VIEW_ID,
  ORGANIZATION_VIEW_ID,
  PERMISSIONS_VIEW_ID,
  STORE_VIEW_ID,
  USAGE_VIEW_ID,
};

export const DASHBOARD_VIEW_ID = "dashboard";
export const SETTINGS_VIEW_ID = "settings";
export const AI_HUB_VIEW_ID = "ai-hub";

export type TopLevelViewId =
  | typeof DASHBOARD_VIEW_ID
  | typeof SETTINGS_VIEW_ID
  | typeof AI_HUB_VIEW_ID
  | typeof USAGE_VIEW_ID
  | typeof INTEGRATIONS_VIEW_ID
  | typeof ORGANIZATION_VIEW_ID
  | typeof PERMISSIONS_VIEW_ID
  | typeof STORE_VIEW_ID;

export const TOP_LEVEL_VIEWS = new Set<TopLevelViewId>([
  DASHBOARD_VIEW_ID,
  SETTINGS_VIEW_ID,
  AI_HUB_VIEW_ID,
  USAGE_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  ORGANIZATION_VIEW_ID,
  PERMISSIONS_VIEW_ID,
  STORE_VIEW_ID,
]);

/** Whether a `viewMode` is a top-level (non-agent) view. */
export function isTopLevelView(viewMode: string): boolean {
  return TOP_LEVEL_VIEWS.has(viewMode as TopLevelViewId);
}

/** Whether a kept-alive top-level surface is the one currently on screen. */
export function isActiveTopLevelView(
  activeViewMode: string,
  viewId: TopLevelViewId,
): boolean {
  return activeViewMode === viewId;
}

/**
 * Whether a top-level `viewMode` points at a view whose Teams gate is off for
 * this caller (the AI Models hub hides from plain members, Organization from
 * members / single-player). The sidebar entry is already hidden, so a STALE
 * `viewMode` (e.g. the role changed on a space switch while the page was open)
 * would otherwise fall through every render branch and strand the user on the
 * shell's engine pane with no way back; the workspace shell resets a blocked
 * view to the dashboard. Pure so the fallback rule is unit-tested.
 */
export function blockedTopLevelView(
  viewMode: string,
  gates: {
    showOrganization: boolean;
    showAiModels: boolean;
  },
): boolean {
  if (viewMode === ORGANIZATION_VIEW_ID) return !gates.showOrganization;
  // Permissions shares the Organization gate exactly (multiplayer owner/admin).
  if (viewMode === PERMISSIONS_VIEW_ID) return !gates.showOrganization;
  if (viewMode === AI_HUB_VIEW_ID) return !gates.showAiModels;
  // The Usage page reads the same workspace-central provider accounts the AI
  // Models hub manages, so it shares the hub's Teams gate exactly.
  if (viewMode === USAGE_VIEW_ID) return !gates.showAiModels;
  return false;
}
