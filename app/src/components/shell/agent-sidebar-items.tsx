import type { SidebarItem } from "@houston-ai/layout";
import type { Agent } from "../../lib/types";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { agentRowLine } from "./agent-row-line";
import { AgentRowLineText } from "./agent-row-parts";
import {
  AgentSidebarIcon,
  NeedsYouChip,
  NewAgentChip,
} from "./agent-sidebar-status";

export interface AgentItemArgs {
  summaries: Record<string, AgentActivitySummary>;
  runningLabel: (count: number) => string;
  needsYouLabel: (count: number) => string;
  newLabel: string;
  invitesFirstDay: (agent: Agent) => boolean;
}

interface BuildAgentSidebarItemsArgs extends AgentItemArgs {
  agents: Agent[];
}

const NO_ACTIVITY: AgentActivitySummary = {
  needsYouCount: 0,
  runningCount: 0,
  headline: null,
  history: "unknown",
};

export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
  needsYouLabel,
  newLabel,
  invitesFirstDay,
}: BuildAgentSidebarItemsArgs): SidebarItem[] {
  return agents.map((agent) => {
    const summary = summaries[agent.id] ?? NO_ACTIVITY;
    const line = agentRowLine(agent, summary, invitesFirstDay(agent));
    return {
      id: agent.id,
      name: agent.name,
      subtitle: <AgentRowLineText line={line} />,
      icon: (
        <AgentSidebarIcon
          color={agent.color}
          running={summary.runningCount > 0}
          runningLabel={runningLabel(summary.runningCount)}
        />
      ),
      ...(summary.needsYouCount > 0
        ? {
            trailing: (
              <NeedsYouChip
                count={summary.needsYouCount}
                label={needsYouLabel(summary.needsYouCount)}
              />
            ),
          }
        : line.kind === "firstDay"
          ? { trailing: <NewAgentChip label={newLabel} /> }
          : {}),
    };
  });
}
