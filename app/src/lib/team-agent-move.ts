import { type ResumeOutcome, resumePendingMove } from "./move-resume";
import {
  claimMove,
  clearPendingMove,
  readPendingMoves,
  recordPendingMove,
  releaseMove,
  updatePendingMoveId,
} from "./pending-move";
import { MOVE_POLL_TIMEOUT_MS, type TeamRef } from "./share-via-team";
import { tauriOrg } from "./tauri";

export async function moveTeamAgent(
  agent: { id: string; name: string },
  target: TeamRef,
): Promise<ResumeOutcome> {
  if (!claimMove(agent.id)) return { outcome: "inProgress" };
  const existing = readPendingMoves().find((move) => move.agentId === agent.id);
  if (existing && existing.teamSlug !== target.slug) {
    releaseMove(agent.id);
    throw new Error("agent has a pending move to another space");
  }
  let pending = existing ?? {
    agentId: agent.id,
    agentName: agent.name,
    teamSlug: target.slug,
    teamName: target.name,
    moveId: "",
    startedAt: Date.now(),
  };
  try {
    if (!existing) recordPendingMove(pending);
    const wire = {
      moveAgent: async (id: string, to: string) => {
        const start = await tauriOrg.moveAgent(id, to, { toast: false });
        updatePendingMoveId(id, start.moveId);
        pending = { ...pending, moveId: start.moveId };
        return start;
      },
      moveStatus: (id: string, moveId: string) =>
        tauriOrg.moveStatus(id, moveId, { toast: false }),
    };
    let result = await resumePendingMove(pending, wire);
    const deadline = Date.now() + MOVE_POLL_TIMEOUT_MS;
    while (result.outcome === "inProgress" && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      result = await resumePendingMove(pending, wire);
    }
    if (result.outcome === "done") clearPendingMove(agent.id);
    else if ("moveId" in result && result.moveId)
      updatePendingMoveId(agent.id, result.moveId);
    return result;
  } finally {
    releaseMove(agent.id);
  }
}
