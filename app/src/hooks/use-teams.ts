import { useMemo } from "react";
import { resolveTeams, type TeamView } from "../lib/teams-model.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { useSidebarLayoutValue } from "./use-sidebar-layout.ts";

/**
 * The active workspace's teams: its named sidebar groups plus the trailing
 * default team that wears the workspace's own name. The ONE place the three
 * inputs (agents, stored layout, workspace name) are composed, so the sidebar's
 * team rows and the team view can never disagree about what a team contains.
 *
 * With no workspace there are no teams at all — an empty list, which is exactly
 * what `blockedTeamView` reads to send an open team view back to the dashboard.
 */
export function useTeams(): TeamView[] {
  const agents = useAgentStore((s) => s.agents);
  const workspace = useWorkspaceStore((s) => s.current);
  const layout = useSidebarLayoutValue(workspace?.id);
  const workspaceName = workspace?.name;
  return useMemo(
    () =>
      workspaceName === undefined
        ? []
        : resolveTeams(agents, layout, workspaceName),
    [agents, layout, workspaceName],
  );
}
