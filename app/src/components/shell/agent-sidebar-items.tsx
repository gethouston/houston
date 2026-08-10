import type { SidebarItem } from "@houston-ai/layout";
import type { ReactNode } from "react";
import type { Agent } from "../../lib/types";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { AgentSidebarIcon, NeedsYouChip } from "./agent-sidebar-status";

/** Everything an agent row needs beyond the agents themselves. */
export interface AgentItemArgs {
  summaries: Record<string, AgentActivitySummary>;
  runningLabel: (count: number) => string;
  needsYouLabel: (count: number) => string;
}

/** The needs-you count a row shows at its right edge, ready to render. */
export interface NeedsYouSignal {
  count: number;
  label: string;
}

interface BuildAgentSidebarItemsArgs extends AgentItemArgs {
  agents: Agent[];
  /** A manager's row menu. It receives the row's needs-you signal because the
   *  two SHARE the right edge: the menu renders the count at rest and swaps
   *  itself in on hover/focus, so only one of them can own the slot. */
  menuFor?: (agent: Agent, needsYou: NeedsYouSignal | null) => ReactNode;
}

/**
 * The rail's agent rows carry their actionable needs-you count on the right
 * edge and, for managers, a host-supplied menu that REPLACES the count while
 * the row is hovered, focused, or its menu is open. The unread dot stays
 * absent.
 *
 * What survives is the one thing a row can say without asking to be read: the
 * running ring around the avatar (motion, not a number).
 */
export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
  needsYouLabel,
  menuFor,
}: BuildAgentSidebarItemsArgs): SidebarItem[] {
  return agents.map((agent) => {
    const summary = summaries[agent.id] ?? {
      needsYouCount: 0,
      runningCount: 0,
    };

    const needsYou: NeedsYouSignal | null =
      summary.needsYouCount > 0
        ? {
            count: summary.needsYouCount,
            label: needsYouLabel(summary.needsYouCount),
          }
        : null;
    const affordance = menuFor?.(agent, needsYou);
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
      // With a menu, the chip moves INTO the affordance slot (the menu draws it
      // at rest); without one, it rides the row's own trailing slot.
      ...(affordance
        ? { affordance }
        : needsYou
          ? {
              trailing: (
                <NeedsYouChip count={needsYou.count} label={needsYou.label} />
              ),
            }
          : {}),
    };
  });
}
