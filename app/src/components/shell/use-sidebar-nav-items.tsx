import type { SidebarNavSection } from "@houston-ai/layout";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import type { NavMode } from "../../lib/nav-stack";
import { isTopLevelView } from "../../lib/top-level-views";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useMentionInbox } from "../board/use-mention-inbox";
import type { SidebarChromeT } from "./sidebar-chrome";
import { buildSidebarNavItems, type SectionFold } from "./sidebar-nav-sections";

/**
 * The rail's top-level nav sections and which row is lit.
 *
 * Every entry navigates AND closes the phone's More menu — the one rule both
 * callbacks below share, so they are paired here instead of being repeated at
 * the call site. The active id comes from the same place because it answers the
 * same question: only a TOP-LEVEL view lights a nav row, and a team screen
 * lights a team row instead (`useSidebarTeamsModel`).
 *
 * Every entry now POINTS AT A SCREEN. The one that never did, "Guide me", left
 * for the footer's help control (`sidebar-help-menu.tsx`), which is why arming
 * the tour is no longer composed here.
 *
 * One row carries live state in its trailing slot, and it gets it here rather
 * than inside the pure nav model: the Inbox's unread mentions.
 */
export function useSidebarNavItems(
  t: SidebarChromeT,
  closeMobileMenu: () => void,
  opts?: {
    /** How the destination lands on the nav stack; default `push` (the rail).
     *  The phone's More menu passes `reset`: reaching a destination from the
     *  menu is a tab-level move, not a level pushed onto the current tree. */
    nav?: NavMode;
    /** Draw every labelled band open, whatever the rail's persisted folds
     *  say. The menu lists its rows flat, so a fold there would hide
     *  destinations that have no band to unfold. */
    unfolded?: boolean;
  },
): { navSections: SidebarNavSection[]; activeNavId: string | undefined } {
  const { showAiModels, showOrganization, showSkills } = useSurfaceGates();
  const agents = useAgentStore((s) => s.agents);
  // The Inbox row carries the count the header bell carries, and it costs
  // nothing to put it here: `useMentionInbox` reads the SHARED
  // `all-conversations` key every board already reads, so the rail joins the
  // one sweep instead of starting a second cross-agent fan-out.
  const { mentionCount } = useMentionInbox(agents);
  // The two new bands fold and persist exactly like `teamsSectionCollapsed`
  // does for "Your teams" — three bands, one rule, one storage shape.
  const myAccountsCollapsed = useUIStore((s) => s.myAccountsSectionCollapsed);
  const toggleMyAccounts = useUIStore(
    (s) => s.toggleMyAccountsSectionCollapsed,
  );
  const workspaceCollapsed = useUIStore((s) => s.workspaceSectionCollapsed);
  const toggleWorkspace = useUIStore((s) => s.toggleWorkspaceSectionCollapsed);
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const openFold: SectionFold = { collapsed: false, onToggle: noop };
  return {
    navSections: buildSidebarNavItems({
      t,
      showAiModels,
      showOrganization,
      showSkills,
      mentionCount,
      folds: opts?.unfolded
        ? { myAccounts: openFold, workspace: openFold }
        : {
            myAccounts: {
              collapsed: myAccountsCollapsed,
              onToggle: toggleMyAccounts,
            },
            workspace: {
              collapsed: workspaceCollapsed,
              onToggle: toggleWorkspace,
            },
          },
      setViewMode: (view) => {
        setViewMode(view, opts?.nav ? { nav: opts.nav } : undefined);
        closeMobileMenu();
      },
    }),
    activeNavId: isTopLevelView(viewMode) ? viewMode : undefined,
  };
}

/** The toggle a band that cannot fold still has to carry. */
function noop(): void {}
