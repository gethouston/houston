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
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
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
  onNewMission: () => void;
}

export function MissionControlToolbar({
  agents,
  filterPath,
  search,
  isSearchingText,
  onFilterPathChange,
  onSearchChange,
  onNewMission,
}: MissionControlToolbarProps) {
  const { t } = useTranslation("dashboard");
  const selectedAgent = agents.find((agent) => agent.folderPath === filterPath);

  return (
    <div className="shrink-0 px-5 pt-4">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center">
        <h1 className="text-xl font-semibold text-foreground">
          {t("title")}
        </h1>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:ml-auto">
          <MissionSearchInput
            value={search}
            isSearchingText={isSearchingText}
            labels={{
              placeholder: t("search.placeholder"),
              clear: t("search.clear"),
              searchingText: t("search.searchingText"),
            }}
            className="relative sm:w-[280px] lg:w-[320px]"
            onChange={onSearchChange}
          />
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-full gap-1.5">
                  {selectedAgent?.name ?? t("filter.allAgents")}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
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
                <Button data-keep-panel-open onClick={onNewMission}>
                  <HoustonLogo size={16} />
                  {t("empty.newMission")}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {shortcutLabel("newMission")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
