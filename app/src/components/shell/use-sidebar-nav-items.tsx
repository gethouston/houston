import type { SidebarNavSection } from "@houston-ai/layout";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import type { NavMode } from "../../lib/nav-stack";
import { isTopLevelView } from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import type { SidebarChromeT } from "./sidebar-chrome";
import { buildSidebarNavItems } from "./sidebar-nav-sections";

/**
 * The rail's top-level nav sections and which row is lit.
 *
 * Every entry navigates AND closes the phone's More menu — the one rule both
 * callbacks below share, so they are paired here instead of being repeated at
 * the call site. The active id comes from the same place because it answers the
 * same question: only a destination view lights a nav row. Employee screens
 * light their employee row instead (`useSidebarTeamsModel`).
 *
 * Every entry points at a screen.
 *
 * The rail's FOOTER cluster is not here either: Academy, Admin, and Settings
 * are drawn by `sidebar-footer.tsx`, below the AI Employees the rail lists.
 */
export function useSidebarNavItems(
  t: SidebarChromeT,
  closeMobileMenu: () => void,
  opts?: {
    /** How the destination lands on the nav stack; default `push` (the rail).
     *  The phone's More menu passes `reset`: reaching a destination from the
     *  menu is a tab-level move, not a level pushed onto the current tree. */
    nav?: NavMode;
  },
): { navSections: SidebarNavSection[]; activeNavId: string | undefined } {
  const { showAiModels, showAssistant, showSkills } = useSurfaceGates();
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  return {
    navSections: buildSidebarNavItems({
      t,
      showAiModels,
      showAssistant,
      showSkills,
      setViewMode: (view) => {
        setViewMode(view, opts?.nav ? { nav: opts.nav } : undefined);
        closeMobileMenu();
      },
    }),
    activeNavId: isTopLevelView(viewMode) ? viewMode : undefined,
  };
}
