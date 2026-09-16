import {
  isActiveTopLevelView,
  SETTINGS_VIEW_ID,
} from "../lib/top-level-views.ts";
import { useUIStore } from "../stores/ui.ts";

/**
 * Whether Settings > Workspace management is the surface on screen. Pure so the
 * rule is node-testable; the hook below is the only way callers spell it.
 */
export function workspaceSectionActive(ui: {
  viewMode: string;
  settingsSection: string | null;
}): boolean {
  return (
    isActiveTopLevelView(ui.viewMode, SETTINGS_VIEW_ID) &&
    ui.settingsSection === "workspace"
  );
}

/**
 * The ONE active-gate every read behind Workspace management takes. Settings is
 * a kept-alive screen, so the dashboard, its org chart and its billing summary
 * stay mounted behind whatever the user navigates to next; without this gate
 * each of them refetches every time the window regains focus, off a screen
 * nobody is looking at. Written once here so a read cannot be added with the
 * rule spelled differently.
 */
export function useWorkspaceSectionActive(): boolean {
  return useUIStore(workspaceSectionActive);
}
