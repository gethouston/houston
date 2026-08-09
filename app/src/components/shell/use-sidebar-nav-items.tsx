import type { SidebarNavSection } from "@houston-ai/layout";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { isTopLevelView } from "../../lib/top-level-views";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useMentionInbox } from "../board/use-mention-inbox";
import type { SidebarChromeT } from "./sidebar-chrome";
import { buildSidebarNavItems } from "./sidebar-nav-sections";

/**
 * The rail's top-level nav sections and which row is lit.
 *
 * Every entry navigates AND closes the mobile drawer — the one rule both
 * callbacks below share, so they are paired here instead of being repeated at
 * the call site. The active id comes from the same place because it answers the
 * same question: only a TOP-LEVEL view lights a nav row, and a team screen
 * lights a team row instead (`useSidebarTeamsModel`).
 *
 * Every entry now POINTS AT A SCREEN. The one that never did, "Guide me", left
 * for the footer's help control (`sidebar-help-menu.tsx`), which is why arming
 * the tour is no longer composed here.
 */
export function useSidebarNavItems(
  t: SidebarChromeT,
  closeMobileSidebar: () => void,
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
  return {
    navSections: buildSidebarNavItems({
      t,
      showAiModels,
      showOrganization,
      showSkills,
      mentionCount,
      folds: {
        myAccounts: {
          collapsed: myAccountsCollapsed,
          onToggle: toggleMyAccounts,
        },
        workspace: { collapsed: workspaceCollapsed, onToggle: toggleWorkspace },
      },
      setViewMode: (view) => {
        setViewMode(view);
        closeMobileSidebar();
      },
    }),
    activeNavId: isTopLevelView(viewMode) ? viewMode : undefined,
  };
}
