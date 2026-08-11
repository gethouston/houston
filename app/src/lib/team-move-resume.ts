import type { AgentTeam } from "@houston-ai/engine-client";
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

export function teamMoveAgentsSettled(
  pending: PendingTeamMove,
  pendingAgentIds: readonly string[],
): boolean {
  const active = new Set(pendingAgentIds);
  return pending.agentIds.every((id) => !active.has(id));
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

  const existing = reconcileTeamByName(
    await wire.listTargetTeams(),
    pending.sourceTeam.name,
  );
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
