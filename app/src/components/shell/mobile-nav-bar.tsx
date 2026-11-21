import {
  FloatingNavBar,
  type FloatingNavBarItem,
  HoustonHelmet,
} from "@houston-ai/core";
import { Ellipsis, SquarePen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { activeMobileTab } from "../../lib/mobile-tabs";
import { startNewMission } from "../../lib/new-mission";
import { newMissionScopeFor } from "../../lib/new-mission-scope";
import { openAgentsTab } from "../../lib/open-mobile-tab";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { teamActivityRollup } from "./agent-activity-summary-model";
import { NeedsYouChip } from "./agent-sidebar-status";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";
import { tourAnchor } from "./workspace-tour-steps";

export function MobileNavBar() {
  const { t } = useTranslation("shell");
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
      onSelect: () => openAgentsTab(),
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
        dataAttrs: tourAnchor("newMission"),
        onSelect: () =>
          startNewMission(newMissionScopeFor(useUIStore.getState())),
      }}
    />
  );
}
