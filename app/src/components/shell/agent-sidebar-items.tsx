import { DropdownMenuItem } from "@houston-ai/core";
import type { SidebarLayout } from "@houston-ai/engine-client";
import type { SidebarGroupView, SidebarItem } from "@houston-ai/layout";
import {
  flatSidebarOrder,
  resolveSidebarSections,
} from "../../lib/agent-order";
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

interface BuildAgentSidebarListsArgs
  extends Omit<BuildAgentSidebarItemsArgs, "agents"> {
  agents: Agent[];
  layout: SidebarLayout;
}

/**
 * Derive the `AppSidebar` `items` + `groups` from the raw agents and the
 * sidebar layout. `items` is ALL agents in flat visible order (so the default
 * section and ⌘[/⌘] cycling agree); `groups` places the grouped subset by id,
 * each in its resolved order.
 */
export function buildAgentSidebarLists({
  agents,
  layout,
  ...itemArgs
}: BuildAgentSidebarListsArgs): {
  items: SidebarItem[];
  groups: SidebarGroupView[];
} {
  const resolved = resolveSidebarSections(agents, layout);
  const items = buildAgentSidebarItems({
    agents: flatSidebarOrder(agents, layout),
    ...itemArgs,
  });
  const groups: SidebarGroupView[] = resolved.groups.map(
    ({ group, agents: members }) => ({
      id: group.id,
      name: group.name,
      collapsed: group.collapsed,
      itemIds: members.map((a) => a.id),
    }),
  );
  return { items, groups };
}
