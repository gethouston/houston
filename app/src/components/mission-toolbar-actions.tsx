import type { KanbanItem } from "@houston-ai/board";
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import { Archive, AtSign } from "lucide-react";
import { useTranslation } from "react-i18next";
import { shortcutLabel } from "../lib/shortcuts";
import type { Agent } from "../lib/types";
import { AgentFilterMenu } from "./agent-filter-menu";
import { mentionCountLabel } from "./board/mentions-inbox-view-model";
import { MissionPersonFilter } from "./mission-person-filter";
import { HoustonLogo } from "./shell/experience-card";

/**
 * The right-hand control cluster of the Mission Control bar: filter by agent,
 * filter by person, the Mentions and Archived mode pills, and "New mission".
 *
 * Every control is opt-in by callback presence, so each Mission Control mode
 * shows exactly the chrome it can act on: the active board takes all of them,
 * the Archived view drops the person filter, and the Mentions inbox drops
 * everything but its own pill. That also keeps the single-player desktop
 * byte-identical to before — no `onToggleMentions`, no Mentions chrome.
 */
/** The Mentions-inbox entry point the toolbar renders (multiplayer only). */
export interface MissionsToolbarMentions {
  onShow: () => void;
  /** Unread mention count shown on the control. */
  count: number;
}

export interface MissionToolbarActionsProps {
  agents: Agent[];
  /** Visible board items (post agent-filter) — feeds the person-filter roster.
   *  Omitted by the Archived toolbar, which has no attribution filter. */
  items?: KanbanItem[];
  filterPath?: string;
  /** Selected person for the attribution filter, or `null` for Everyone. */
  filterUserId?: string | null;
  /** When set, renders the filter-by-agent menu. Omitted by the Mentions
   *  inbox, whose rows already name their agent. */
  onFilterPathChange?: (path: string) => void;
  /** When set, renders the filter-by-person control (active board only). */
  onFilterUserIdChange?: (userId: string | null) => void;
  /** Opens the cross-agent Archived view. When omitted, no Archived control
   *  renders -- the Archived view itself leaves it out, because there its own
   *  labelled back button is the single way home (HOU-1043). */
  onShowArchived?: () => void;
  /** Whether the Mentions inbox is currently showing (highlights the control
   *  and switches the title line). */
  mentionsActive?: boolean;
  /** Toggle between the active board and the Mentions inbox. Multiplayer only:
   *  omit it and single player gains no Mentions chrome at all. */
  onToggleMentions?: () => void;
  /** Unread mention count shown on the Mentions control. 0 renders no number. */
  mentionCount?: number;
  /** "New mission" trigger. Present in both the active and archived toolbars. */
  onNewMission?: () => void;
  /** Compact layout: a chat panel is open, so the board is narrow. Collapses
   *  the buttons to icons so the title stays on one line. */
  collapsed: boolean;
}

export function MissionToolbarActions({
  agents,
  items,
  filterPath = "",
  filterUserId,
  onFilterPathChange,
  onFilterUserIdChange,
  onShowArchived,
  mentionsActive = false,
  onToggleMentions,
  mentionCount = 0,
  onNewMission,
  collapsed,
}: MissionToolbarActionsProps) {
  const { t } = useTranslation("dashboard");
  const hasMentionCount = mentionCount > 0;
  const mentionsLabel = hasMentionCount
    ? t("mentions.ariaCount", { count: mentionCount })
    : t("mentions.button");

  return (
    <div className="flex shrink-0 items-center gap-2">
      {onFilterPathChange && (
        <AgentFilterMenu
          agents={agents}
          filterPath={filterPath}
          onFilterPathChange={onFilterPathChange}
          collapsed={collapsed}
        />
      )}
      {onFilterUserIdChange && (
        <MissionPersonFilter
          items={items ?? []}
          filterUserId={filterUserId ?? null}
          onFilterUserIdChange={onFilterUserIdChange}
          collapsed={collapsed}
        />
      )}
      {onToggleMentions && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={mentionsActive ? "secondary" : "ghost"}
              size={collapsed && !hasMentionCount ? "icon" : "default"}
              className={cn(
                "rounded-full",
                (!collapsed || hasMentionCount) && "gap-1.5",
              )}
              onClick={onToggleMentions}
              aria-label={mentionsLabel}
            >
              <AtSign className="size-4" />
              {!collapsed && t("mentions.button")}
              {hasMentionCount && (
                <span className="text-sm font-medium tabular-nums">
                  {mentionCountLabel(mentionCount)}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="bottom">{mentionsLabel}</TooltipContent>
          )}
        </Tooltip>
      )}
      {onShowArchived && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              // Outline, not ghost: the archive is a place users go looking for,
              // so its door reads as a real control -- one rank below the single
              // filled "New mission" CTA beside it (HOU-1043).
              variant="outline"
              size={collapsed ? "icon" : "default"}
              className={cn("rounded-full", !collapsed && "gap-1.5")}
              onClick={onShowArchived}
              aria-label={t("archived.button")}
            >
              <Archive className="size-4" />
              {!collapsed && t("archived.button")}
            </Button>
          </TooltipTrigger>
          {collapsed && (
            <TooltipContent side="bottom">
              {t("archived.button")}
            </TooltipContent>
          )}
        </Tooltip>
      )}
      {onNewMission && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size={collapsed ? "icon" : "default"}
              className={cn(collapsed && "rounded-full")}
              onClick={onNewMission}
              aria-label={t("empty.newMission")}
            >
              <HoustonLogo size={16} />
              {!collapsed && t("empty.newMission")}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {collapsed ? t("empty.newMission") : shortcutLabel("newMission")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
