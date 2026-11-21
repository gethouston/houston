import { canRetryMoveError, type MoveErrorKind } from "@houston/sdk";
import type { TeamRef } from "./share-via-team";

export type TeamMoveStage = "createTarget" | "cleanupSource" | "switching";

export interface TeamMoveSource {
  id: string;
  workspaceId: string;
  name: string;
  icon?: string;
  color?: string;
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
      error: MoveErrorKind;
      parked?: true;
    }
  | { step: TeamMoveStage; target: TeamRef }
  | { step: "postscriptFailed"; target: TeamRef; stage: TeamMoveStage }
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
  return next < source.agents.length
    ? { ...state, index: next }
    : { step: "createTarget", target: state.target };
}

export function teamAgentMoveFailed(
  state: TeamMoveState,
  error: MoveErrorKind,
): TeamMoveState {
  if (state.step !== "movingAgents") return state;
  return {
    step: "moveFailed",
    target: state.target,
    index: state.index,
    error,
  };
}

export function canRetryTeamMove(
  state: Extract<TeamMoveState, { step: "moveFailed" }>,
): boolean {
  return state.parked === true || canRetryMoveError(state.error);
}

export function teamMoveFailureCopy(
  moved: number,
  total: number,
  error?: MoveErrorKind,
  name = "",
):
  | { key: "moveFailedFirst"; count: number }
  | { key: "moveFailedNext"; moved: number; total: number }
  | { key: "moveFailedNameTaken"; name: string }
  | {
      key: "moveFailedNextNameTaken";
      moved: number;
      total: number;
      name: string;
    } {
  if (error === "name_taken")
    return moved <= 0
      ? { key: "moveFailedNameTaken", name }
      : { key: "moveFailedNextNameTaken", moved, total, name };
  return moved <= 0
    ? { key: "moveFailedFirst", count: total }
    : { key: "moveFailedNext", moved, total };
}

export function postscriptDone(state: TeamMoveState): TeamMoveState {
  if (state.step === "createTarget")
    return { step: "cleanupSource", target: state.target };
  if (state.step === "cleanupSource")
    return { step: "switching", target: state.target };
  if (state.step === "switching")
    return { step: "invite", target: state.target };
  return state;
}

export function teamPostscriptFailed(state: TeamMoveState): TeamMoveState {
  if (
    state.step !== "createTarget" &&
    state.step !== "cleanupSource" &&
    state.step !== "switching"
  )
    return state;
  return {
    step: "postscriptFailed",
    target: state.target,
    stage: state.step,
  };
}

export function retryTeamMove(state: TeamMoveState): TeamMoveState {
  if (state.step === "moveFailed") return startTeamAgents(state);
  if (state.step === "postscriptFailed")
    return { step: state.stage, target: state.target };
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
    "createTarget",
    "cleanupSource",
    "switching",
  ].includes(state.step);
}
