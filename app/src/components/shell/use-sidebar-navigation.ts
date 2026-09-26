import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

/** Rail navigation closes the phone's More menu after a selection. */
export function useSidebarNavigation(args: { closeMobileMenu: () => void }) {
  const { closeMobileMenu } = args;
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const setCurrentWorkspace = useWorkspaceStore((s) => s.setCurrent);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const openAgentView = useUIStore((s) => s.openAgentView);

  const switchWorkspace = async (wsId: string) => {
    if (wsId === currentWorkspace?.id) return;
    const ws = workspaces.find((s) => s.id === wsId);
    if (!ws) return;
    closeMobileMenu();
    setCurrentWorkspace(ws);
    await loadAgents(ws.id);
  };

  /** Keep the current-agent store aligned with the focused Tasks screen. */
  const selectAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent) return;
    setCurrentAgent(agent);
    openAgentView(agent.id, "mission-control");
    closeMobileMenu();
  };

  return { switchWorkspace, selectAgent };
}
