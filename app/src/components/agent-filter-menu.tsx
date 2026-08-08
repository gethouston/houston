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
 * The ONE "which agent am I looking at" menu, shared by every cross-agent
 * surface: Mission Control's board toolbar and both team sections (Routines,
 * Files). Keeping it in one component is what makes the idiom recognisable —
 * the same trigger, the same avatar rows, the same collapse behaviour wherever
 * the question is asked.
 *
 * `allowAll` is the one real difference between them. A board can show every
 * agent's missions at once, so it offers "All agents"; a Files tree cannot be
 * merged across agents without inventing a filesystem nobody has, so that
 * surface always has exactly one agent picked and drops the entry.
 */
export function AgentFilterMenu({
  agents,
  filterPath,
  onFilterPathChange,
  collapsed = false,
  allowAll = true,
}: {
  agents: Agent[];
  /** Selected agent's folder path, or `""` for all agents. */
  filterPath: string;
  onFilterPathChange: (path: string) => void;
  /** Collapse to the selected agent's avatar (a narrowed toolbar). */
  collapsed?: boolean;
  /** Offer the "All agents" entry. Off for surfaces that need one agent. */
  allowAll?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const selectedAgent = agents.find((agent) => agent.folderPath === filterPath);
  const label = selectedAgent?.name ?? t("filter.allAgents");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={label}
          >
            {selectedAgent ? (
              <AgentCardAvatar color={selectedAgent.color} />
            ) : (
              <ListFilter className="size-4" />
            )}
          </Button>
        ) : (
          <Button variant="ghost" className="rounded-full gap-1.5">
            {label}
            <ChevronDown className="size-3.5 text-ink-muted" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {allowAll && (
          <DropdownMenuItem onClick={() => onFilterPathChange("")}>
            {t("filter.allAgents")}
          </DropdownMenuItem>
        )}
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
