import { DropdownMenuItem } from "@houston-ai/core";
import type { SidebarItem } from "@houston-ai/layout";
import type { Agent } from "../../lib/types";
import type { AgentActivitySummary } from "./agent-activity-summary-model";
import { AgentSidebarColorMenu } from "./agent-sidebar-color-menu";
import {
  AgentSidebarIcon,
  NeedsYouChip,
  UnreadDot,
} from "./agent-sidebar-status";

/** Everything an agent row needs beyond the agents themselves. */
export interface AgentItemArgs {
  summaries: Record<string, AgentActivitySummary>;
  runningLabel: (count: number) => string;
  needsYouLabel: (count: number) => string;
  unreadLabel: (count: number) => string;
  onChangeColor: (agentId: string, color: string) => void;
  onShareAgent: (agentId: string) => void;
  shareLabel: string;
}

interface BuildAgentSidebarItemsArgs extends AgentItemArgs {
  agents: Agent[];
}

export function buildAgentSidebarItems({
  agents,
  summaries,
  runningLabel,
  needsYouLabel,
  unreadLabel,
  onChangeColor,
  onShareAgent,
  shareLabel,
}: BuildAgentSidebarItemsArgs): SidebarItem[] {
  return agents.map((agent) => {
    const summary = summaries[agent.id] ?? {
      needsYouCount: 0,
      runningCount: 0,
      unreadCount: 0,
    };
    const hasRunning = summary.runningCount > 0;
    const hasUnread = summary.unreadCount > 0;
    const needsYou = summary.needsYouCount > 0;

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
      // Both signals can show at once, dot first: an agent with something
      // urgent may ALSO have unread news, and hiding one behind the other
      // would make the rail lie about what is waiting. Nothing to say leaves
      // `trailing` undefined, exactly as before.
      trailing:
        hasUnread || needsYou ? (
          <span className="flex items-center gap-1.5">
            {hasUnread ? (
              <UnreadDot label={unreadLabel(summary.unreadCount)} />
            ) : null}
            {needsYou ? (
              <NeedsYouChip
                count={summary.needsYouCount}
                label={needsYouLabel(summary.needsYouCount)}
              />
            ) : null}
          </span>
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
