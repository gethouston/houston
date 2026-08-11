import type { TFunction } from "i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import { useCapabilities } from "../../hooks/use-capabilities";
import { hasAgentTeams } from "../../lib/org-roles";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useSidebarOverlayLayout } from "../shell/use-sidebar-overlay-layout";

/**
 * The ONE save path behind every "Change color & name" surface (the sidebar
 * menu's dialog, the Agents pane's Color & Name row).
 *
 * SEQUENCED, never parallel: a rename moves the agent's folder-derived id, so
 * the colour write must target whatever id the rename settles on. A refused
 * rename (conflict toast) still applies the colour to the old id.
 */
export function useAgentIdentitySave(
  agent: Agent,
  t: TFunction<["shell", "teams", "agents"]>,
): (patch: { name?: string; colorId?: string }) => Promise<void> {
  const { capabilities } = useCapabilities();
  const agents = useAgentStore((state) => state.agents);
  const workspaceId = useWorkspaceStore((state) => state.current?.id);
  const sidebar = useSidebarOverlayLayout(
    workspaceId,
    hasAgentTeams(capabilities),
  );
  const actions = useAgentActions({
    t,
    workspaceId,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });

  return async (patch) => {
    let id = agent.id;
    if (patch.name !== undefined) {
      const renamed = await actions.rename(id, patch.name);
      if (renamed) id = renamed.id;
    }
    if (patch.colorId !== undefined)
      await actions.changeColor(id, patch.colorId);
  };
}
