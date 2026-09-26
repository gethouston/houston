import type { TFunction } from "i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useSidebarLayout } from "../shell/../../hooks/use-sidebar-layout";

/** What a "Change color & name" surface can change. Both halves optional: the
 *  dialog sends only the fields the user actually touched. */
export interface AgentIdentityPatch {
  name?: string;
  colorId?: string;
}

/**
 * The ONE save path behind every "Change color & name" surface (the sidebar
 * menu's dialog, the Agents pane's Color & Name row).
 *
 * SEQUENCED, never parallel: a rename moves the agent's folder-derived id, so
 * the colour write must target whatever id the rename settles on. A refused
 * rename (conflict toast) still applies the colour to the old id.
 *
 * REJECTS on failure, after `call()` has already toasted and reported it. The
 * caller owns nothing but the rejection: it must await this and stop the error
 * there, never leave it as an unhandled promise.
 */
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
    if (patch.name !== undefined) {
      const renamed = await actions.rename(id, patch.name);
      if (renamed) id = renamed.id;
    }
    if (patch.colorId !== undefined)
      await actions.changeColor(id, patch.colorId);
  };
}
