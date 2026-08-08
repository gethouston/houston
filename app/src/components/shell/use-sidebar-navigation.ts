import {
  DEFAULT_TEAM_ID,
  type TeamView,
  teamOfAgent,
} from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * Where a click in the rail takes the user. Both destinations close the mobile
 * drawer on the way out, so the screen they asked for is immediately visible.
 */
export function useSidebarNavigation(args: {
  /** Every team the caller can see — an agent's own team is looked up here. */
  teams: TeamView[];
  closeMobileSidebar: () => void;
}) {
  const { teams, closeMobileSidebar } = args;
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const openTeamView = useUIStore((s) => s.openTeamView);

  const switchWorkspace = async (wsId: string) => {
    if (wsId === currentWorkspace?.id) return;
    const ws = workspaces.find((s) => s.id === wsId);
    if (!ws) return;
    closeMobileSidebar();
    setCurrentWorkspace(ws);
    await loadAgents(ws.id);
  };

  /**
   * Clicking an agent opens ITS TEAM's Mission Control, pre-filtered to that
   * agent, instead of the agent's own tab: the board is where its work lives.
   * The agent store's `current` still moves with it so the command palette and
   * ⌘[ / ⌘] cycling keep pointing at the agent the user just picked.
   */
  const selectAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    openTeamView(
      teamOfAgent(teams, agentId)?.id ?? DEFAULT_TEAM_ID,
      "mission-control",
      {
        agentFilter: agent.id,
      },
    );
    closeMobileSidebar();
  };

  return { switchWorkspace, selectAgent };
}
