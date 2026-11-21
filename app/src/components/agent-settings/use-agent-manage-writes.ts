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
      } catch {}
    },
    remove: async () => {
      try {
        await actions.remove(agent.id);
      } catch {}
    },
  };
}
