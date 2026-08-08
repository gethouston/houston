import { useEffect } from "react";
import type { Agent } from "../../../lib/types";
import { useUIStore } from "../../../stores/ui";
import { useIsActiveView } from "../../shell/keep-alive-views";

/**
 * The one-shot nav for a routine chat with no board card (#401): a
 * session-finished notification names the OWNING agent and the activity, and
 * this section is where that chat lives now.
 *
 * The owner rides along with the id because this list is CROSS-AGENT — an id
 * alone would have the surface guess whose chat it is, and guess wrong the
 * moment two agents are in view. Resolving the id to a routine or an unclaimed
 * draft is the per-agent machinery's job, so all this does is mount that
 * owner's chat host with a `pending` request and let it settle.
 *
 * A dropdown narrowed to somebody else is stale the moment the notification
 * asks for this agent, so the pin moves with it. A target naming an agent this
 * team does not hold can never be shown here, so it is dropped rather than left
 * armed forever.
 */
export function usePendingTeamRoutineChat({
  teamAgents,
  scoped,
  onOpen,
}: {
  /** Every agent in the team, pin or no pin. */
  teamAgents: Agent[];
  /** The agents currently in view (the whole team, or the pinned one). */
  scoped: Agent[];
  /** Mount this owner's chat host on the pending target. */
  onOpen: (agentId: string) => void;
}): void {
  const pending = useUIStore((s) => s.pendingRoutineChat);
  const clearPending = useUIStore((s) => s.setPendingRoutineChat);
  const setTeamAgentFilter = useUIStore((s) => s.setTeamAgentFilter);
  const isActiveScreen = useIsActiveView();

  useEffect(() => {
    if (!isActiveScreen || !pending) return;
    const owner = teamAgents.find((a) => a.id === pending.agentId);
    if (!owner) {
      clearPending(null);
      return;
    }
    if (!scoped.some((a) => a.id === owner.id)) setTeamAgentFilter(owner.id);
    onOpen(owner.id);
  }, [
    isActiveScreen,
    pending,
    teamAgents,
    scoped,
    clearPending,
    setTeamAgentFilter,
    onOpen,
  ]);
}
