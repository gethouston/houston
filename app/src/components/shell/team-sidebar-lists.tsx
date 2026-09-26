import type { SidebarLayout } from "@houston/engine-adapter";
import type { SidebarGroupView, SidebarItem } from "@houston-ai/layout";
import { flatSidebarOrder } from "../../lib/agent-order";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import {
  type AgentItemArgs,
  buildAgentSidebarItems,
} from "./agent-sidebar-items";
import { TeamFolderMenu } from "./team-folder-menu";
import { teamHeaderSignals } from "./team-header-signals";
import { teamCollapsedLookup } from "./team-sidebar-model";

export interface BuildTeamSidebarListsArgs extends AgentItemArgs {
  agents: Agent[];
  layout: SidebarLayout;
  teams: TeamView[];
}

export function buildTeamSidebarLists({
  agents,
  layout,
  teams,
  ...itemArgs
}: BuildTeamSidebarListsArgs): {
  items: SidebarItem[];
  groups: SidebarGroupView[];
} {
  const isCollapsed = teamCollapsedLookup(layout);
  const items = buildAgentSidebarItems({
    agents: flatSidebarOrder(agents, layout),
    ...itemArgs,
  });
  const headerSignals = teamHeaderSignals(itemArgs);
  const groups = teams.map((team) => {
    const collapsed = isCollapsed(team);
    return {
      id: team.id,
      name: team.name,
      collapsed,
      ...headerSignals(team, collapsed),
      affordance: <TeamFolderMenu team={team} />,
      itemIds: team.agents.map((agent) => agent.id),
    };
  });
  return { items, groups };
}
