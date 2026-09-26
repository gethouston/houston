import type { ResumeOptions, ResumeOutcome } from "./move-resume";
import type { TeamMoveSource, TeamMoveState } from "./move-team";
import type { PendingAgentMove } from "./pending-move";
import type { PendingTeamMove } from "./pending-team-move";

export function teamMoveAgentsSettled(pending: PendingTeamMove): boolean {
  const moved = new Set(pending.movedAgentIds);
  return pending.agentIds.every((id) => moved.has(id));
}

export function resumedTeamMove(
  pending: PendingTeamMove,
  visibleSource: TeamMoveSource,
): { source: TeamMoveSource; state: TeamMoveState } {
  const source: TeamMoveSource = {
    ...pending.sourceTeam,
    agents: pending.agentIds.map(
      (id) =>
        visibleSource.agents.find((agent) => agent.id === id) ?? {
          id,
          name: id,
        },
    ),
  };
  const target = { slug: pending.targetSlug, name: pending.targetName };
  const stage = pending.postscriptStage ?? "createTarget";
  const state: TeamMoveState =
    teamMoveAgentsSettled(pending) || pending.postscriptStage
      ? { step: "postscriptFailed", target, stage }
      : {
          step: "moveFailed",
          target,
          index: pending.movedAgentIds.length,
          error: "unknown",
        };
  return { source, state };
}

export interface TeamMoveDriverWire {
  readAgentMove(agentId: string): PendingAgentMove | undefined;
  recordAgentMove(move: PendingAgentMove): void;
  updateAgentMoveId(agentId: string, moveId: string): void;
  clearAgentMove(agentId: string): void;
  markAgentMoved(agentId: string): void;
  resumeAgentMove(
    pending: PendingAgentMove,
    options: ResumeOptions,
  ): Promise<ResumeOutcome>;
  runPostscript(): Promise<void>;
}

export type TeamMoveDriverOutcome =
  | { outcome: "done" }
  | { outcome: "failed"; agentId: string };

export async function drivePendingTeamMove(
  pending: PendingTeamMove,
  wire: TeamMoveDriverWire,
): Promise<TeamMoveDriverOutcome> {
  const moved = new Set(pending.movedAgentIds);
  for (const agentId of pending.agentIds) {
    if (moved.has(agentId)) continue;
    const existingMove = wire.readAgentMove(agentId);
    const agentMove = existingMove ?? {
      agentId,
      agentName: agentId,
      teamSlug: pending.targetSlug,
      teamName: pending.targetName,
      moveId: "",
      startedAt: Date.now(),
    };
    if (!existingMove) wire.recordAgentMove(agentMove);
    const result = await wire.resumeAgentMove(agentMove, {
      onMoveAccepted: (moveId) => wire.updateAgentMoveId(agentId, moveId),
    });
    if (result.outcome !== "done") return { outcome: "failed", agentId };
    wire.clearAgentMove(agentId);
    wire.markAgentMoved(agentId);
    moved.add(agentId);
  }
  await wire.runPostscript();
  return { outcome: "done" };
}
