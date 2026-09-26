import { useEffect } from "react";
import type { Agent } from "../../../lib/types";
import { useAgentStore } from "../../../stores/agents";
import { useUIStore } from "../../../stores/ui";
import { useIsActiveView } from "../../shell/keep-alive-views";

/**
 * The one-shot nav for a routine chat with no board card (#401): a
 * session-finished notification names the OWNING agent and the activity, and
 * this section is where that chat lives.
 *
 * Resolving the id to a routine or an unclaimed draft is the per-agent
 * machinery's job, so all this does is mount the employee's chat host with a
 * `pending` request and let it settle. A target naming another employee stays
 * armed for that employee's section; one naming an employee the roster no
 * longer holds can never be shown, so it is dropped rather than left armed
 * forever.
 */
export function usePendingTeamRoutineChat({
  agent,
  onOpen,
}: {
  agent: Agent;
  /** Mount the employee's chat host on the pending target. */
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
