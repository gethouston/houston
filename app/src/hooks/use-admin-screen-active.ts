import { useIsMobile } from "@houston-ai/core";
import { ADMIN_VIEW_ID, isActiveTopLevelView } from "../lib/top-level-views.ts";
import { useUIStore } from "../stores/ui.ts";

export function adminScreenActive(
  ui: { viewMode: string; chatAgentId: string | null },
  isMobile: boolean,
): boolean {
  return (
    isActiveTopLevelView(ui.viewMode, ADMIN_VIEW_ID) &&
    (!isMobile || ui.chatAgentId === null)
  );
}

export function useAdminScreenActive(): boolean {
  const isMobile = useIsMobile();
  return useUIStore((ui) => adminScreenActive(ui, isMobile));
}
