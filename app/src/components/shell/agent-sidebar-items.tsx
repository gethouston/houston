import type { SidebarItem } from "@houston-ai/layout";
import type { Agent } from "../../lib/types";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { AgentSidebarIcon } from "./agent-sidebar-status";

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
 * The rail's agent rows: an avatar and a name — nothing else.
 *
 * **No needs-you count, no unread dot.** Any mark on a row that had something
 * waiting turned the rail into a scoreboard: dots and numbers competed with the
 * names for a 220px column, and a rail's job is to say what exists and where
 * you are, not to keep score. The signals still exist where they can be acted
 * on — the team's board, and the ROLLUP a folded team's header carries on
 * behalf of rows that are not on screen at all. Names get the space back.
 *
 * **No "..." menu either.** An agent is renamed, recoloured, moved and deleted
 * on its team's Manage agents page, which is also where it is configured, so
 * there is exactly one door onto all of it.
 *
 * What survives is the one thing a row can say without asking to be read: the
 * running ring around the avatar (motion, not a number).
 */
export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
}: BuildAgentSidebarItemsArgs): SidebarItem[] {
  return agents.map((agent) => {
    const summary = summaries[agent.id] ?? {
      needsYouCount: 0,
      runningCount: 0,
    };

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
    };
  });
}
