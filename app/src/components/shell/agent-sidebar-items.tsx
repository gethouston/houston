import type { SidebarItem } from "@houston-ai/layout";
import type { Agent } from "../../lib/types";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { AgentSidebarIcon, NeedsYouChip } from "./agent-sidebar-status";

/** Everything an agent row needs beyond the agents themselves. */
export interface AgentItemArgs {
  summaries: Record<string, AgentActivitySummary>;
  runningLabel: (count: number) => string;
  needsYouLabel: (count: number) => string;
}

interface BuildAgentSidebarItemsArgs extends AgentItemArgs {
  agents: Agent[];
}

/**
 * The rail's agent rows carry their actionable needs-you count on the right
 * edge. The unread dot stays absent.
 *
 * What survives is the one thing a row can say without asking to be read: the
 * running ring around the avatar (motion, not a number).
 */
export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
  needsYouLabel,
}: BuildAgentSidebarItemsArgs): SidebarItem[] {
  return agents.map((agent) => {
    const summary = summaries[agent.id] ?? {
      needsYouCount: 0,
      runningCount: 0,
    };

    const needsYou =
      summary.needsYouCount > 0
        ? {
            count: summary.needsYouCount,
            label: needsYouLabel(summary.needsYouCount),
          }
        : null;
    return {
      id: agent.id,
      name: agent.name,
      icon: (
        <AgentSidebarIcon
          color={agent.color}
          running={summary.runningCount > 0}
          runningLabel={runningLabel(summary.runningCount)}
        />
      ),
      ...(needsYou
        ? {
            trailing: (
              <NeedsYouChip count={needsYou.count} label={needsYou.label} />
            ),
          }
        : {}),
    };
  });
}
