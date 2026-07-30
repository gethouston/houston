/**
 * The non-agent, top-level views: full-window surfaces reached from the sidebar
 * rather than from an agent's tab bar. `workspace-shell.tsx` renders each one
 * and treats every other `viewMode` as an agent tab; `sidebar.tsx` highlights
 * the matching nav item. Both predicates source from this one set so a new
 * top-level view (like the AI hub) can't be added to one and forgotten in the
 * other.
 *
 * Usage, Permissions and Admin are NOT here: they are settings sections now
 * (HOU-788), reached from the Settings index — see `lib/settings-sections.ts`.
 * A read those sections own is therefore active while `settings` is, not while
 * some screen of its own is.
 */
import { INTEGRATIONS_VIEW_ID } from "../components/integrations-view/id.ts";
import { SKILLS_VIEW_ID } from "../components/skills-view/id.ts";
import { STORE_VIEW_ID } from "../components/store-view/id.ts";

export { INTEGRATIONS_VIEW_ID, SKILLS_VIEW_ID, STORE_VIEW_ID };

export const DASHBOARD_VIEW_ID = "dashboard";
export const SETTINGS_VIEW_ID = "settings";
export const AI_HUB_VIEW_ID = "ai-hub";

export type TopLevelViewId =
  | typeof DASHBOARD_VIEW_ID
  | typeof SETTINGS_VIEW_ID
  | typeof AI_HUB_VIEW_ID
  | typeof INTEGRATIONS_VIEW_ID
  | typeof SKILLS_VIEW_ID
  | typeof STORE_VIEW_ID;

export const TOP_LEVEL_VIEWS = new Set<TopLevelViewId>([
  DASHBOARD_VIEW_ID,
  SETTINGS_VIEW_ID,
  AI_HUB_VIEW_ID,
  INTEGRATIONS_VIEW_ID,
  SKILLS_VIEW_ID,
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
 * this caller (the AI Models hub hides from plain members). The sidebar entry is
 * already hidden, so a STALE `viewMode` (e.g. the role changed on a space switch
 * while the page was open) would otherwise fall through every render branch and
 * strand the user on the shell's engine pane with no way back; the workspace
 * shell resets a blocked view to the dashboard. Pure so the fallback rule is
 * unit-tested.
 */
export function blockedTopLevelView(
  viewMode: string,
  gates: {
    showAiModels: boolean;
  },
): boolean {
  return viewMode === AI_HUB_VIEW_ID && !gates.showAiModels;
}
