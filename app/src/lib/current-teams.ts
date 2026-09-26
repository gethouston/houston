import { getCurrentSidebarLayout } from "../hooks/use-sidebar-layout.ts";
import { useAgentStore } from "../stores/agents.ts";
import { useWorkspaceStore } from "../stores/workspaces.ts";
import { resolveTeams, type TeamView } from "./teams-model.ts";

export function currentTeams(): TeamView[] {
  const workspace = useWorkspaceStore.getState().current;
  if (!workspace) return [];
  return resolveTeams(
    useAgentStore.getState().agents,
    getCurrentSidebarLayout(workspace.id),
  );
}
