import type { AgentTeam } from "@houston-ai/engine-client";
import type { ResumeOptions, ResumeOutcome } from "./move-resume";
import type { PendingAgentMove } from "./pending-move";
import type { PendingTeamMove } from "./pending-team-move";

export interface TeamMovePostscriptWire {
  deleteSource(teamId: string): Promise<void>;
  switchTarget(slug: string): Promise<void>;
  listTargetTeams(): Promise<AgentTeam[]>;
  createTargetTeam(input: {
    name: string;
    icon?: string;
    color?: string;
  }): Promise<AgentTeam>;
  updateTargetTeam(
    teamId: string,
    patch: { context: string },
  ): Promise<unknown>;
  placeAgent(agentId: string, teamId: string): Promise<void>;
}

export interface TeamMovePostscriptOptions {
  isMissingSource?: (error: unknown) => boolean;
  onTeamCreated?: (teamId: string) => void;
}

export function reconcileTeamByName(
  teams: readonly AgentTeam[],
  name: string,
): AgentTeam | null {
  const wanted = name.trim().toLocaleLowerCase();
  return (
    teams.find((team) => team.name.trim().toLocaleLowerCase() === wanted) ??
    null
  );
}

export function teamMoveAgentsSettled(pending: PendingTeamMove): boolean {
  const moved = new Set(pending.movedAgentIds);
  return pending.agentIds.every((id) => moved.has(id));
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
    const agentMove = existingMove ?? createPendingAgentMove(pending, agentId);
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

function createPendingAgentMove(
  pending: PendingTeamMove,
  agentId: string,
): PendingAgentMove {
  return {
    agentId,
    agentName: agentId,
    teamSlug: pending.targetSlug,
    teamName: pending.targetName,
    moveId: "",
    startedAt: Date.now(),
  };
}

export async function completeTeamMovePostscript(
  pending: PendingTeamMove,
  wire: TeamMovePostscriptWire,
  options: TeamMovePostscriptOptions = {},
): Promise<string | undefined> {
  if (!pending.sourceTeam.isDefault) {
    try {
      await wire.deleteSource(pending.sourceTeam.id);
    } catch (error) {
      if (!options.isMissingSource?.(error)) throw error;
    }
  }
  await wire.switchTarget(pending.targetSlug);
  if (pending.sourceTeam.isDefault) return undefined;

  const teams = await wire.listTargetTeams();
  const existing =
    teams.find((team) => team.id === pending.createdTeamId) ??
    reconcileTeamByName(teams, pending.sourceTeam.name);
  const team =
    existing ??
    (await wire.createTargetTeam({
      name: pending.sourceTeam.name,
      ...(pending.sourceTeam.icon ? { icon: pending.sourceTeam.icon } : {}),
      ...(pending.sourceTeam.color ? { color: pending.sourceTeam.color } : {}),
    }));
  options.onTeamCreated?.(team.id);
  if (pending.sourceTeam.context) {
    await wire.updateTargetTeam(team.id, {
      context: pending.sourceTeam.context,
    });
  }
  for (const agentId of pending.agentIds) {
    await wire.placeAgent(agentId, team.id);
  }
  return team.id;
}
