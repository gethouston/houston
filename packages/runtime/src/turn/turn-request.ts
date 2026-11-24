import type { WireFrame } from "@houston/runtime-client";
import { claudePlanBinding } from "../auth/claude-plan";
import { turnTokenExpiry } from "./turn-deadline";
import type { TurnSessionRequest } from "./turn-session";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import type { TurnOutcome } from "./turn-session-types";
import type { TurnRequest } from "./types";

export function turnProvider(
  turn: Pick<TurnRequest, "provider" | "credential">,
): string {
  return turn.provider || turn.credential?.provider || "";
}

export function turnSessionRequest(
  turn: TurnRequest,
  turnId: string,
  emit: (frame: WireFrame) => void,
  signal: AbortSignal,
  sandbox?: TurnSessionRequest["sandbox"],
  timings?: Record<string, number>,
  startup?: TurnSessionStartupTask,
): TurnSessionRequest {
  const claudePlan = claudePlanBinding(turn.credential);
  return {
    conversationId: turn.conversationId,
    text: turn.text,
    provider: turnProvider(turn),
    emit,
    signal,
    nonce: turn.nonce,
    pin: { model: turn.model, effort: turn.effort },
    mode: turn.mode,
    nextStepSuggestions: turn.nextStepSuggestions,
    timezone: turn.timezone,
    liveMode: turn.liveMode,
    turnId,
    displayText: turn.displayText,
    mentions: turn.mentions,
    ...(turn.missionTitle ? { missionTitle: turn.missionTitle } : {}),
    ...(turn.routine ? { routineFire: true } : {}),
    ...(turn.claim ? { claimed: true } : {}),
    author: turn.actingAs,
    ...(claudePlan ? { claudePlan } : {}),
    tokenExpiresAt: turnTokenExpiry(turn.hostToken, Date.now()),
    ...(turn.grant ? { grant: { scopes: turn.grant.scopes } } : {}),
    ...(turn.coordinator ? { role: "coordinator" as const } : {}),
    ...(sandbox ? { sandbox } : {}),
    ...(timings ? { timings } : {}),
    ...(startup ? { startup } : {}),
    ...(turn.workspaceContext !== undefined || turn.userContext !== undefined
      ? {
          context: {
            workspace: turn.workspaceContext ?? "",
            user: turn.userContext ?? "",
          },
        }
      : {}),
  };
}

export function turnIsUnconnected(
  turn: Pick<TurnRequest, "credential">,
): boolean {
  return !turn.credential;
}

export function unconnectedTurnOutcome(
  turn: TurnRequest,
  turnId: string,
  emit: (frame: WireFrame) => void,
): TurnOutcome {
  emit({
    type: "user",
    data: {
      content: turn.text,
      ts: Date.now(),
      nonce: turn.nonce,
      mentions: turn.mentions,
    },
    turnId,
  });
  return { error: "No provider connected. Connect your subscription first." };
}
