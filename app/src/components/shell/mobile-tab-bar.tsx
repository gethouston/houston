import { cn } from "@houston-ai/core";
import { Settings, SquareKanban, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { activeMobileTab, type MobileTabId } from "../../lib/mobile-tabs";
import { openMobileTab } from "../../lib/open-mobile-tab";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { teamActivityRollup } from "./agent-activity-summary-model";
import { NeedsYouChip } from "./agent-sidebar-status";
import { useAgentActivitySummaries } from "./use-agent-activity-summaries";

/**
 * The mobile (<768px) bottom tab bar: Agents · Tasks · Settings, the adopted
 * three-tab IA (`lib/mobile-tabs.ts` holds the rules). CSS-hidden at md+ like
 * `MobileTopBar`, so it appears instantly on resize with no re-render flicker,
 * and transparent so it melts into the window gutter the way the rail does.
 *
 * The Tasks tab wears the rail's own count badge (`NeedsYouChip`) with the
 * cross-agent needs-you sum — the user's review queue, the same number the
 * team headers roll up, never a second badge shape invented for the bar.
 */
export function MobileTabBar() {
  const { t } = useTranslation(["shell", "dashboard"]);
  const viewMode = useUIStore((s) => s.viewMode);
  const teamSection = useUIStore((s) => s.teamSection);
  const teamAgentFocus = useUIStore((s) => s.teamAgentFocus);
  const agents = useAgentStore((s) => s.agents);
  const summaries = useAgentActivitySummaries(agents);
  const active = activeMobileTab({ viewMode, teamSection, teamAgentFocus });
  const needsYouCount = teamActivityRollup(
    agents.map((a) => a.id),
    summaries,
  ).needsYouCount;

  const tabs: {
    id: MobileTabId;
    label: string;
    Icon: typeof Users;
    badgeCount?: number;
  }[] = [
    { id: "agents", label: t("shell:tabBar.agents"), Icon: Users },
    {
      id: "mission-control",
      label: t("shell:tabBar.missionControl"),
      Icon: SquareKanban,
      badgeCount: needsYouCount,
    },
    { id: "settings", label: t("shell:tabBar.settings"), Icon: Settings },
  ];

  return (
    <nav
      aria-label={t("shell:tabBar.label")}
      data-testid="mobile-tab-bar"
      className="flex shrink-0 items-stretch px-2 pb-safe md:hidden"
    >
      {tabs.map(({ id, label, Icon, badgeCount }) => (
        <button
          key={id}
          type="button"
          data-tab={id}
          aria-current={active === id ? "page" : undefined}
          onClick={() => openMobileTab(id)}
          className={cn(
            "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors active:scale-95 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus",
            active === id ? "text-ink" : "text-ink-muted",
          )}
        >
          <span className="relative">
            <Icon className="size-5" />
            {badgeCount !== undefined && badgeCount > 0 && (
              <span className="absolute -right-6 -top-1.5">
                <NeedsYouChip
                  count={badgeCount}
                  label={t("shell:sidebar.needsYouCount", {
                    count: badgeCount,
                  })}
                />
              </span>
            )}
          </span>
          <span className="text-xs font-weight-510">{label}</span>
        </button>
      ))}
    </nav>
  );
}
