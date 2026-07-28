import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown, ListFilter } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Agent } from "../lib/types";
import { AgentCardAvatar } from "./shell/agent-card-avatar";

/**
 * Mission Control's filter-by-agent menu, sibling of {@link MissionPersonFilter}
 * and shaped the same way: an "everything" default plus one row per agent,
 * collapsing to the selected agent's avatar when a chat panel narrows the bar.
 */
export function MissionAgentFilter({
  agents,
  filterPath,
  onFilterPathChange,
  collapsed,
}: {
  agents: Agent[];
  /** Selected agent's folder path, or `""` for all agents. */
  filterPath: string;
  onFilterPathChange: (path: string) => void;
  collapsed: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const selectedAgent = agents.find((agent) => agent.folderPath === filterPath);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Button
            variant="ghost"
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
          <Button variant="ghost" className="rounded-full gap-1.5">
            {selectedAgent?.name ?? t("filter.allAgents")}
            <ChevronDown className="size-3.5 text-ink-muted" />
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
  );
}
