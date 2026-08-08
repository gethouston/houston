import type { SidebarNavItemEntry } from "@houston-ai/layout";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { isTopLevelView } from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import { buildSidebarNavItems, type SidebarChromeT } from "./sidebar-chrome";

/**
 * The rail's top-level nav entries and which one is lit.
 *
 * Every entry navigates AND closes the mobile drawer — the one rule both
 * callbacks below share, so they are paired here instead of being repeated at
 * the call site. The active id comes from the same place because it answers the
 * same question: only a TOP-LEVEL view lights a nav row, and a team screen
 * lights a team row instead (`useSidebarTeamsModel`).
 */
export function useSidebarNavItems(
  t: SidebarChromeT,
  closeMobileSidebar: () => void,
): { navItems: SidebarNavItemEntry[]; activeNavId: string | undefined } {
  // Teams v2: in a Teams workspace the AI Models hub is owner/admin territory
  // (org-level provider credentials + admin model policy), so plain members lose
  // its nav entry too — they pick their model per agent in the composer.
  const { showAiModels } = useSurfaceGates();
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const openSettings = useUIStore((s) => s.openSettings);
  return {
    navItems: buildSidebarNavItems({
      t,
      showAiModels,
      setViewMode: (view) => {
        setViewMode(view);
        closeMobileSidebar();
      },
      openSettingsIndex: () => {
        openSettings(null);
        closeMobileSidebar();
      },
    }),
    activeNavId: isTopLevelView(viewMode) ? viewMode : undefined,
  };
}
