import { useIsMobile } from "@houston-ai/core";
import { ADMIN_VIEW_ID, isActiveTopLevelView } from "../lib/top-level-views.ts";
import { useUIStore } from "../stores/ui.ts";

/**
 * Whether Admin is the surface on screen. Pure so the rule is node-testable.
 */
export function adminScreenActive(
  ui: { viewMode: string; chatAgentId: string | null },
  isMobile: boolean,
): boolean {
  return (
    isActiveTopLevelView(ui.viewMode, ADMIN_VIEW_ID) &&
    (!isMobile || ui.chatAgentId === null)
  );
}

/**
 * The ONE active-gate every Admin read takes. Admin is a kept-alive screen,
 * so the dashboard, its org chart and its billing summary
 * stay mounted behind whatever the user navigates to next; without this gate
 * each of them refetches every time the window regains focus, off a screen
 * nobody is looking at. Written once here so a read cannot be added with the
 * rule spelled differently.
 */
export function useAdminScreenActive(): boolean {
  const isMobile = useIsMobile();
  return useUIStore((ui) => adminScreenActive(ui, isMobile));
}
