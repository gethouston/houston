import type { TFunction } from "i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useSidebarLayout } from "../shell/../../hooks/use-sidebar-layout";

export interface AgentIdentityPatch {
  name?: string;
  colorId?: string;
}

export function useAgentIdentitySave(
  agent: Agent,
  t: TFunction<["shell", "teams", "agents"]>,
): (patch: AgentIdentityPatch) => Promise<void> {
  const agents = useAgentStore((state) => state.agents);
  const workspaceId = useWorkspaceStore((state) => state.current?.id);
  const sidebar = useSidebarLayout(workspaceId);
  const actions = useAgentActions({
    t,
    workspaceId,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });

  return async (patch) => {
    let id = agent.id;
    const { name, colorId } = patch;
    const releaseColor =
      name !== undefined && colorId !== undefined
        ? useAgentStore.getState().paint(id, { color: colorId })
        : () => {};
    if (name !== undefined) {
      try {
        const renamed = await actions.rename(id, name);
        if (renamed) id = renamed.id;
      } catch (err) {
        releaseColor(true);
        throw err;
      }
    }
    if (colorId === undefined) return;
    const recolor = actions.changeColor(id, colorId);
    releaseColor();
    await recolor;
  };
}
