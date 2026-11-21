import type { SidebarGroupView, SidebarItem } from "@houston-ai/layout";
import type { TFunction } from "i18next";
import type { UseSidebarLayout } from "../../hooks/use-sidebar-layout";
import { useTeams } from "../../hooks/use-teams";
import type { TeamView } from "../../lib/teams-model";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import type { AgentItemArgs } from "./agent-sidebar-items";
import { buildTeamSidebarLists } from "./team-sidebar-lists";
import { useFirstDayInvites } from "./use-first-day-invites";
import {
  type TeamActivateHandlers,
  useTeamActivate,
} from "./use-team-activate";

type TeamsModelT = TFunction<
  ["shell", "common", "portable", "teams", "dashboard"]
>;

export interface SidebarTeamsModel extends TeamActivateHandlers {
  teams: TeamView[];
  selectedAgentId: string | null;
  items: SidebarItem[];
  groups: SidebarGroupView[];
}

export function useSidebarTeamsModel(args: {
  t: TeamsModelT;
  agents: Agent[];
  sidebar: UseSidebarLayout;
  summaries: AgentItemArgs["summaries"];
}): SidebarTeamsModel {
  const { t, agents, sidebar } = args;
  const viewMode = useUIStore((s) => s.viewMode);
  const activeAgentId = useUIStore((s) => s.activeAgentId);

  const teams = useTeams();
  const invites = useFirstDayInvites(agents, args.summaries);
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
    newLabel: t("shell:sidebar.newAgent"),
    invitesFirstDay: (agent) => invites.has(agent.id),
  });

  return {
    ...activate,
    teams,
    selectedAgentId,
    items,
    groups,
  };
}
