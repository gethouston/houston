import { useTranslation } from "react-i18next";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@houston-ai/core";
import { Archive, ChevronDown, ListFilter } from "lucide-react";
import { HoustonLogo } from "./shell/experience-card";
import { AgentCardAvatar } from "./shell/agent-card-avatar";
import type { Agent } from "../lib/types";
import { MissionSearchInput } from "./mission-search-input";
import { shortcutLabel } from "../lib/shortcuts";

interface MissionControlToolbarProps {
  agents: Agent[];
  filterPath: string;
  search: string;
  isSearchingText: boolean;
  onFilterPathChange: (path: string) => void;
  onSearchChange: (value: string) => void;
  /** Whether the Archived view is currently showing (highlights the toggle). */
  archivedActive: boolean;
  /** Toggle between the active board and the cross-agent Archived view. */
  onToggleArchived: () => void;
  /** "New mission" trigger. Present in both the active and archived toolbars. */
  onNewMission?: () => void;
  /** Compact layout: a chat panel is open, so the board is narrow. Shrinks the
   *  search placeholder and collapses the buttons to icons so the title stays
   *  on one line. The search itself flexes to fill whatever space is left. */
  collapsed: boolean;
}

export function MissionControlToolbar({
  agents,
  filterPath,
  search,
  isSearchingText,
  onFilterPathChange,
  onSearchChange,
  archivedActive,
  onToggleArchived,
  onNewMission,
  collapsed,
}: MissionControlToolbarProps) {
  const { t } = useTranslation("dashboard");
  const selectedAgent = agents.find((agent) => agent.folderPath === filterPath);

  return (
    <div className="shrink-0 px-5 pt-4">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="shrink-0 text-xl font-semibold text-foreground">{t("title")}</h1>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <MissionSearchInput
            value={search}
            isSearchingText={isSearchingText}
            labels={{
              placeholder: collapsed ? t("search.placeholderShort") : t("search.placeholder"),
              clear: t("search.clear"),
              searchingText: t("search.searchingText"),
            }}
            className="relative min-w-0 flex-1 max-w-[320px]"
            onChange={onSearchChange}
          />
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {collapsed ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    aria-label={selectedAgent?.name ?? t("filter.allAgents")}
                  >
                    {selectedAgent ? (
                      <AgentCardAvatar color={selectedAgent.color} />
                    ) : (
                      <ListFilter className="size-4" />
                    )}
                  </Button>
                ) : (
                  <Button variant="outline" className="rounded-full gap-1.5">
                    {selectedAgent?.name ?? t("filter.allAgents")}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onFilterPathChange("")}>
                  {t("filter.allAgents")}
                </DropdownMenuItem>
                {agents.map((agent) => (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => onFilterPathChange(agent.folderPath)}
                    className="gap-2"
                  >
                    <AgentCardAvatar color={agent.color} />
                    {agent.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={archivedActive ? "secondary" : "outline"}
                  size={collapsed ? "icon" : "default"}
                  className={cn("rounded-full", !collapsed && "gap-1.5")}
                  onClick={onToggleArchived}
                  aria-label={t("archived.button")}
                >
                  <Archive className="size-4" />
                  {!collapsed && t("archived.button")}
                </Button>
              </TooltipTrigger>
              {collapsed && <TooltipContent side="bottom">{t("archived.button")}</TooltipContent>}
            </Tooltip>
            {onNewMission && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    data-keep-panel-open
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
        </div>
      </div>
    </div>
  );
}
