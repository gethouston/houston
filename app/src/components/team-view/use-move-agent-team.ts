import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import type { TeamView } from "../../lib/teams-model";
import { useWorkspaceStore } from "../../stores/workspaces";

export function useMoveAgentTeam(): (
  agentId: string,
  team: TeamView | null,
) => void {
  const workspaceId = useWorkspaceStore((store) => store.current?.id);
  const sidebar = useSidebarLayout(workspaceId);
  return (agentId, team) => {
    sidebar.moveItem(agentId, {
      groupId: team?.id ?? null,
      beforeItemId: null,
    });
  };
}
