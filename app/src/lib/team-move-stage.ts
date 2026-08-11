import type { AgentTeam } from "@houston-ai/engine-client";
import {
  postscriptDone,
  type TeamMoveSource,
  type TeamMoveState,
} from "./move-team.ts";
import { reconcileTeamByName } from "./team-move-resume.ts";

export interface TeamMoveStageWire {
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
  isMissingSource(error: unknown): boolean;
}

export async function runTeamMoveStage(
  state: TeamMoveState,
  source: TeamMoveSource,
  wire: TeamMoveStageWire,
): Promise<{ state: TeamMoveState; createdTeamId?: string }> {
  if (state.step === "cleanupSource") {
    try {
      await wire.deleteSource(source.id);
    } catch (error) {
      if (!wire.isMissingSource(error)) throw error;
    }
    return { state: postscriptDone(state, source) };
  }
  if (state.step === "switching") {
    await wire.switchTarget(state.target.slug);
    return { state: postscriptDone(state, source) };
  }
  if (state.step === "recreate") {
    const existing = reconcileTeamByName(
      await wire.listTargetTeams(),
      source.name,
    );
    const team =
      existing ??
      (await wire.createTargetTeam({
        name: source.name,
        ...(source.icon ? { icon: source.icon } : {}),
        ...(source.color ? { color: source.color } : {}),
      }));
    if (source.context) {
      await wire.updateTargetTeam(team.id, { context: source.context });
    }
    return {
      state: postscriptDone(state, source, team.id),
      createdTeamId: team.id,
    };
  }
  if (state.step === "placing") {
    if (!state.teamId) throw new Error("target team id missing");
    for (const agent of source.agents) {
      await wire.placeAgent(agent.id, state.teamId);
    }
    return { state: postscriptDone(state, source) };
  }
  return { state };
}
