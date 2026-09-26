import type { SidebarGroupView, SidebarItem } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import { useTeams } from "../../hooks/use-teams";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import type { AgentItemArgs } from "./agent-sidebar-items";
import { buildTeamSidebarLists } from "./team-sidebar-lists";
import {
  type TeamActivateHandlers,
  useTeamActivate,
} from "./use-team-activate";

type TeamsModelT = TFunction<
  ["shell", "common", "portable", "teams", "dashboard"]
>;

export interface SidebarTeamsModel extends TeamActivateHandlers {
  /** Personal folders in sidebar order. */
  teams: TeamView[];
  /** The agent row the rail draws as selected, or null for none. */
  selectedAgentId: string | null;
  items: SidebarItem[];
  groups: SidebarGroupView[];
}

export function useSidebarTeamsModel(args: {
  t: TeamsModelT;
  /** Every agent in the workspace. */
  agents: Agent[];
  sidebar: UseSidebarLayout;
  summaries: AgentItemArgs["summaries"];
}): SidebarTeamsModel {
  const { t, agents, sidebar } = args;
  const viewMode = useUIStore((s) => s.viewMode);
  const activeAgentId = useUIStore((s) => s.activeAgentId);

  const teams = useTeams();
  const selectedAgentId =
    viewMode === "agent" && agents.some((agent) => agent.id === activeAgentId)
      ? activeAgentId
      : null;

  const activate = useTeamActivate({
    teams,
    sidebar,
  });

  const { items, groups } = buildTeamSidebarLists({
    agents,
    layout: sidebar.layout,
    teams,
    summaries: args.summaries,
    runningLabel: (count) => t("shell:sidebar.runningCount", { count }),
    needsYouLabel: (count) => t("shell:sidebar.needsYouCount", { count }),
  });

  return {
    ...activate,
    teams,
    selectedAgentId,
    items,
    groups,
  };
}
