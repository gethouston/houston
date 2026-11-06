import type { WireFrame } from "@houston/runtime-client";
import { claudePlanBinding } from "../auth/claude-plan";
import { turnTokenExpiry } from "./turn-deadline";
import type { TurnSessionRequest } from "./turn-session";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import type { TurnOutcome } from "./turn-session-types";
import type { TurnRequest } from "./types";

/**
 * A dispatched pin outranks the credential so a mismatched credential fails
 * on the provider the user chose. Legacy dispatches have no provider pin and
 * run on the credential's provider.
 */
export function turnProvider(
  turn: Pick<TurnRequest, "provider" | "credential">,
): string {
  return turn.provider || turn.credential?.provider || "";
}

/** Project the accepted envelope onto the provider-agnostic turn session. */
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
    author: turn.actingAs,
    ...(claudePlan ? { claudePlan } : {}),
    tokenExpiresAt: turnTokenExpiry(turn.hostToken, Date.now()),
    ...(turn.grant ? { grant: { scopes: turn.grant.scopes } } : {}),
    ...(turn.coordinator ? { role: "coordinator" as const } : {}),
    ...(sandbox ? { sandbox } : {}),
    ...(timings ? { timings } : {}),
    ...(startup ? { startup } : {}),
    // Either context field present means "use these" (each defaults to ""),
    // mirroring the long-lived server's message-send contract.
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

/**
 * A turn dispatched with no credential never runs: it ends in
 * unconnectedTurnOutcome. Keyed on the credential alone, never on the
 * provider: the gateway also withholds the credential for a custom provider
 * it proved absent.
 */
export function turnIsUnconnected(
  turn: Pick<TurnRequest, "credential">,
): boolean {
  return !turn.credential;
}

/**
 * A turn with no credential: echo the user's message, then fail with the
 * reconnect instruction (the workspace is not connected yet). The echo is
 * not persisted, so it has no transcript row behind it.
 */
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
