import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../hooks/use-agent-actions";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  type AgentIdentityPatch,
  useAgentIdentitySave,
} from "../agent-actions/use-agent-identity-save";

/**
 * The Manage section's two writes on its AI Employee: save the name and
 * colour, and delete it.
 *
 * Both are optimistic and reject only AFTER `useAgentActions` rolled the row
 * back and told the person, so there is exactly one surface already. Awaiting
 * them here is what stops that rejection from escaping the handler unhandled;
 * the catch adds no second surface and hides nothing.
 */
export function useAgentManageWrites(agent: Agent) {
  const { t } = useTranslation(["shell", "teams", "agents", "settings"]);
  const workspaceId = useWorkspaceStore((state) => state.current?.id);
  const agents = useAgentStore((state) => state.agents);
  const sidebar = useSidebarLayout(workspaceId);
  const actions = useAgentActions({
    t,
    workspaceId,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });
  const saveIdentity = useAgentIdentitySave(agent, t);
  return {
    saveIdentity: async (patch: AgentIdentityPatch) => {
      try {
        await saveIdentity(patch);
      } catch {
        // Already rolled back and told by `useAgentActions`.
      }
    },
    remove: async () => {
      try {
        await actions.remove(agent.id);
      } catch {
        // Already rolled back and told by `useAgentActions`.
      }
    },
  };
}
