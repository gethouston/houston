import type { AgentAssignment } from "@houston-ai/engine-client";
import { useMutation } from "@tanstack/react-query";
import { tauriAgents } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";

/**
 * Optimistic write for the Share dialog (Teams v2). Sends the explicit
 * `{userId, access}[]` roster via `tauriAgents.setAssignments`, which routes
 * through `call()` — so a failure already surfaces as a red toast with the
 * Report-bug affordance AND reports to Sentry (no `onError` toast here would
 * double it). This hook adds only the OPTIMISTIC part `call()` can't: it patches
 * the agent's `assignments` / `assignedUserIds` in the Zustand agent store so
 * the dialog and the chat "Shared agent" note update on click, and rolls that
 * patch back if the write fails. `onSettled` reloads the agent list so the
 * server's authoritative shape wins once the round-trip lands.
 */
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

export function useShareAgent() {
  return useMutation({
    mutationFn: ({
      agentId,
      assignments,
    }: {
      agentId: string;
      assignments: AgentAssignment[];
    }) => tauriAgents.setAssignments(agentId, assignments),
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
    onError: (_err, _vars, snapshot) => {
      // Roll the optimistic patch back; call() already toasted + reported.
      if (snapshot) {
        useAgentStore.setState({
          agents: snapshot.agents,
          current: snapshot.current,
        });
      }
    },
    onSettled: () => {
      const workspaceId = useWorkspaceStore.getState().current?.id;
      if (workspaceId) {
        void useAgentStore.getState().loadAgents(workspaceId, { silent: true });
      }
    },
  });
}
