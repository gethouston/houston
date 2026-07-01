import { DropdownMenuItem } from "@houston-ai/core";
import type { SidebarItem } from "@houston-ai/layout";
import type { Agent } from "../../lib/types";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { AgentSidebarColorMenu } from "./agent-sidebar-color-menu";
import { AgentSidebarIcon, NeedsYouChip } from "./agent-sidebar-status";

interface BuildAgentSidebarItemsArgs {
  agents: Agent[];
  summaries: Record<string, AgentActivitySummary>;
  runningLabel: (count: number) => string;
  needsYouLabel: (count: number) => string;
  onChangeColor: (agentId: string, color: string) => void;
  onShareAgent: (agentId: string) => void;
  shareLabel: string;
}

export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
  needsYouLabel,
  onChangeColor,
  onShareAgent,
  shareLabel,
}: BuildAgentSidebarItemsArgs): SidebarItem[] {
  return agents.map((agent) => {
    const summary = summaries[agent.id] ?? {
      needsYouCount: 0,
      runningCount: 0,
    };
    const hasRunning = summary.runningCount > 0;

    return {
      id: agent.id,
      name: agent.name,
      icon: (
        <AgentSidebarIcon
          color={agent.color}
          running={hasRunning}
          runningLabel={runningLabel(summary.runningCount)}
        />
      ),
      trailing:
        summary.needsYouCount > 0 ? (
          <NeedsYouChip
            count={summary.needsYouCount}
            label={needsYouLabel(summary.needsYouCount)}
          />
        ) : undefined,
      menuContent: (
        <>
          <AgentSidebarColorMenu
            color={agent.color}
            onChange={(color) => onChangeColor(agent.id, color)}
          />
          <DropdownMenuItem onClick={() => onShareAgent(agent.id)}>
            {shareLabel}
          </DropdownMenuItem>
        </>
      ),
    };
  });
}
