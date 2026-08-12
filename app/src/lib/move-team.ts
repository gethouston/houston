import type { TeamRef } from "./share-via-team";

export type TeamMoveStage =
  | "cleanupSource"
  | "switching"
  | "recreate"
  | "placing";
export type TeamMoveFailureKind =
  | "unsupported_move"
  | "unmovable_volume"
  | "needs_upgrade"
  | "timeout"
  | "unknown";

export interface TeamMoveSource {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  context?: string;
  isDefault: boolean;
  agents: { id: string; name: string }[];
}

export type TeamMoveState =
  | { step: "pick"; creating: boolean; createError: string | null }
  | { step: "confirm"; target: TeamRef }
  | { step: "movingAgents"; target: TeamRef; index: number }
  | {
      step: "moveFailed";
      target: TeamRef;
      index: number;
      error: TeamMoveFailureKind;
    }
  | { step: TeamMoveStage; target: TeamRef; teamId?: string }
  | {
      step: "postscriptFailed";
      target: TeamRef;
      stage: TeamMoveStage;
      teamId?: string;
    }
  | { step: "invite"; target: TeamRef }
  | { step: "done"; target: TeamRef };

export const initialTeamMoveState = (): TeamMoveState => ({
  step: "pick",
  creating: false,
  createError: null,
});

export const confirmTeamMove = (target: TeamRef): TeamMoveState => ({
  step: "confirm",
  target,
});

export function startTeamAgents(state: TeamMoveState): TeamMoveState {
  if (state.step !== "confirm" && state.step !== "moveFailed") return state;
  return {
    step: "movingAgents",
    target: state.target,
    index: state.step === "moveFailed" ? state.index : 0,
  };
}

export function agentMoveDone(
  state: TeamMoveState,
  source: TeamMoveSource,
): TeamMoveState {
  if (state.step !== "movingAgents") return state;
  const next = state.index + 1;
  if (next < source.agents.length) return { ...state, index: next };
  return {
    step: source.isDefault ? "switching" : "cleanupSource",
    target: state.target,
  };
}

export function teamAgentMoveFailed(
  state: TeamMoveState,
  error: TeamMoveFailureKind,
): TeamMoveState {
  if (state.step !== "movingAgents") return state;
  return {
    step: "moveFailed",
    target: state.target,
    index: state.index,
    error,
  };
}

/**
 * What the failure face may honestly claim, as the copy key it needs and that
 * key's variables.
 *
 * Agents move ONE AT A TIME and the run stops at the first refusal, so the
 * failing agent's index IS the number that made it: everything from there on
 * was never attempted. "One of them could not move" would tell the user the
 * rest are already in the new team, and they would go looking for them there.
 *
 * `moveFailedFirst` counts the whole team, because nothing moved and the only
 * number worth saying is how big the job still is. `moveFailedNext` needs no
 * plural: it is only reachable with at least one agent moved and one refused.
 */
export function teamMoveFailureCopy(
  moved: number,
  total: number,
):
  | { key: "moveFailedFirst"; count: number }
  | { key: "moveFailedNext"; moved: number; total: number } {
  return moved <= 0
    ? { key: "moveFailedFirst", count: total }
    : { key: "moveFailedNext", moved, total };
}

export function postscriptDone(
  state: TeamMoveState,
  source: TeamMoveSource,
  teamId?: string,
): TeamMoveState {
  if (state.step === "cleanupSource")
    return { step: "switching", target: state.target };
  if (state.step === "switching")
    return source.isDefault
      ? { step: "invite", target: state.target }
      : { step: "recreate", target: state.target };
  if (state.step === "recreate")
    return { step: "placing", target: state.target, teamId };
  if (state.step === "placing") return { step: "invite", target: state.target };
  return state;
}

export function teamPostscriptFailed(state: TeamMoveState): TeamMoveState {
  if (
    state.step !== "cleanupSource" &&
    state.step !== "switching" &&
    state.step !== "recreate" &&
    state.step !== "placing"
  )
    return state;
  return {
    step: "postscriptFailed",
    target: state.target,
    stage: state.step as TeamMoveStage,
    ...("teamId" in state && state.teamId ? { teamId: state.teamId } : {}),
  };
}

export function retryTeamMove(state: TeamMoveState): TeamMoveState {
  if (state.step === "moveFailed") return startTeamAgents(state);
  if (state.step === "postscriptFailed")
    return {
      step: state.stage,
      target: state.target,
      ...(state.teamId ? { teamId: state.teamId } : {}),
    };
  return state;
}

export function finishTeamMove(state: TeamMoveState): TeamMoveState {
  return state.step === "invite"
    ? { step: "done", target: state.target }
    : state;
}

export function isTeamMoveDismissable(state: TeamMoveState): boolean {
  return ![
    "movingAgents",
    "cleanupSource",
    "switching",
    "recreate",
    "placing",
  ].includes(state.step);
}
