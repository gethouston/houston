import { useEffect } from "react";
import type { Agent } from "../../../lib/types";
import { useAgentStore } from "../../../stores/agents";
import { useUIStore } from "../../../stores/ui";
import { useIsActiveView } from "../../shell/keep-alive-views";

export function usePendingTeamRoutineChat({
  agent,
  onOpen,
}: {
  agent: Agent;
  onOpen: () => void;
}): void {
  const pending = useUIStore((s) => s.pendingRoutineChat);
  const clearPending = useUIStore((s) => s.setPendingRoutineChat);
  const agents = useAgentStore((s) => s.agents);
  const isActiveScreen = useIsActiveView();

  useEffect(() => {
    if (!isActiveScreen || !pending) return;
    if (pending.agentId === agent.id) {
      onOpen();
      return;
    }
    if (!agents.some((a) => a.id === pending.agentId)) clearPending(null);
  }, [isActiveScreen, pending, agent.id, agents, clearPending, onOpen]);
}
