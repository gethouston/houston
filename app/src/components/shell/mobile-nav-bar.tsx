import {
  FloatingNavBar,
  type FloatingNavBarItem,
  HoustonHelmet,
} from "@houston-ai/core";
import { Ellipsis, SquarePen, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { activeMobileTab } from "../../lib/mobile-tabs";
import { startNewMission } from "../../lib/new-mission";
import { newMissionScopeFor } from "../../lib/new-mission-scope";
import { openMobileTab } from "../../lib/open-mobile-tab";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { teamActivityRollup } from "./agent-activity-summary-model";
import { NeedsYouChip } from "./agent-sidebar-status";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { tourAnchor } from "./workspace-tour-steps";

/**
 * The phone (<768px) nav bar: a floating pill of Agents · Teams · More with
 * the compose button beside it (`lib/mobile-tabs.ts` holds the rules).
 * CSS-hidden at md+, so it appears instantly on resize with no re-render
 * flicker.
 *
 * The Agents item wears the rail's own count badge (`NeedsYouChip`) with the
 * cross-agent needs-you sum — the user's review queue, the same number the
 * team headers roll up, never a second badge shape invented for the bar.
 *
 * More is a MENU, not a destination, so tapping it opens the card over the
 * shell instead of navigating; it lights while that card is up (announced as
 * expanded, so the screen behind the card stays the one current page) as well
 * as while the location behind it belongs to neither tree.
 */
export function MobileNavBar() {
  const { t } = useTranslation(["shell", "dashboard"]);
  const viewMode = useUIStore((s) => s.viewMode);
  const moreOpen = useUIStore((s) => s.mobileMoreOpen);
  const setMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  const agents = useAgentStore((s) => s.agents);
  const summaries = useAgentActivitySummaries(agents);
  const active = activeMobileTab({ viewMode });
  const needsYouCount = teamActivityRollup(
    agents.map((a) => a.id),
    summaries,
  ).needsYouCount;

  const items: FloatingNavBarItem[] = [
    {
      id: "agents",
      label: t("shell:tabBar.agents"),
      // The helmet is what an agent looks like everywhere else in Houston;
      // `currentColor` so it takes the item's ink like the Lucide glyphs.
      icon: <HoustonHelmet size={20} color="currentColor" />,
      active: active === "agents",
      badge:
        needsYouCount > 0 ? (
          <NeedsYouChip
            count={needsYouCount}
            label={t("shell:sidebar.needsYouCount", { count: needsYouCount })}
          />
        ) : undefined,
      dataAttrs: { ...tourAnchor("mobileAgentsTab"), "data-tab": "agents" },
      onSelect: () => openMobileTab("agents"),
    },
    {
      id: "teams",
      label: t("shell:tabBar.teams"),
      icon: <Users className="size-5" />,
      active: active === "teams",
      dataAttrs: { "data-tab": "teams" },
      onSelect: () => openMobileTab("teams"),
    },
    {
      id: "more",
      label: t("shell:tabBar.more"),
      icon: <Ellipsis className="size-5" />,
      active: active === "more",
      expanded: moreOpen,
      dataAttrs: { ...tourAnchor("mobileMenu"), "data-tab": "more" },
      onSelect: () => setMoreOpen(true),
    },
  ];

  return (
    <FloatingNavBar
      label={t("shell:tabBar.label")}
      dataAttrs={{ "data-testid": "mobile-nav-bar" }}
      className="md:hidden"
      items={items}
      action={{
        label: t("shell:sidebar.newMission"),
        icon: <SquarePen className="size-5" />,
        // The compose reads its subject off where the user is standing: a
        // drilled agent, a team's roster, or the shared fallback.
        onSelect: () =>
          startNewMission(newMissionScopeFor(useUIStore.getState())),
      }}
    />
  );
}
