import type { AgentAssignment, OrgMember } from "@houston/engine-adapter";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { tauriAgents } from "../../lib/agents-facade";
import { analytics } from "../../lib/analytics";
import { tellOptimisticRefusal } from "../../lib/optimistic-write";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { accessWidened } from "./agent-access-diff.ts";

function patchAgent(
  agent: Agent,
  agentId: string,
  assignments: AgentAssignment[],
): Agent {
  if (agent.id !== agentId) return agent;
  return {
    ...agent,
    assignments,
    assignedUserIds: assignments.map((a) => a.userId),
  };
}

export type ShareSource = "share_dialog" | "agent_settings_people";

export interface ShareAgentVariables {
  agentId: string;
  assignments: AgentAssignment[];
  members: readonly OrgMember[];
}

export function useShareAgent(source: ShareSource) {
  const { t } = useTranslation("teams");
  return useMutation({
    mutationFn: ({ agentId, assignments }: ShareAgentVariables) =>
      tauriAgents.setAssignments(agentId, assignments),
    onMutate: ({ agentId, assignments }) => {
      const store = useAgentStore.getState();
      const snapshot = { agents: store.agents, current: store.current };
      useAgentStore.setState({
        agents: store.agents.map((a) => patchAgent(a, agentId, assignments)),
        current: store.current
          ? patchAgent(store.current, agentId, assignments)
          : null,
      });
      return snapshot;
    },
    onSuccess: (_data, { agentId, assignments, members }, snapshot) => {
      const before = snapshot?.agents.find((a) => a.id === agentId);
      if (!before) return;
      const widened = accessWidened({
        before,
        after: {
          assignments,
          assignedUserIds: assignments.map((a) => a.userId),
        },
        members,
      });
      if (widened) {
        analytics.track("agent_shared", { agent_id: agentId, source });
      }
    },
    onError: (err, _vars, snapshot) => {
      if (snapshot) {
        useAgentStore.setState({
          agents: snapshot.agents,
          current: snapshot.current,
        });
      }
      tellOptimisticRefusal("set_agent_assignments", err, {
        title: t("writeFailed.agentAccess.title"),
        description: t("writeFailed.agentAccess.description"),
      });
    },
    onSettled: () => {
      const workspaceId = useWorkspaceStore.getState().current?.id;
      if (workspaceId) {
        void useAgentStore.getState().loadAgents(workspaceId, { silent: true });
      }
    },
  });
}

export type ShareAgentMutation = ReturnType<typeof useShareAgent>;
