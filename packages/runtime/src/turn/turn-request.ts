import type { WireFrame } from "@houston/runtime-client";
import { claudePlanBinding } from "../auth/claude-plan";
import type { EarlyTurnSession } from "./turn-early-session";
import type { TurnSessionRequest } from "./turn-session";
import type { TurnSessionStartupTask } from "./turn-session-startup";
import type { TurnOutcome, TurnSandboxHandle } from "./turn-session-types";
import type { TurnRequest } from "./types";

/** Project the accepted envelope onto the provider-agnostic turn session. */
export function turnSessionRequest(
  turn: TurnRequest,
  turnId: string,
  emit: (frame: WireFrame) => void,
  signal: AbortSignal,
  sandbox?: TurnSandboxHandle,
  timings?: Record<string, number>,
  startup?: TurnSessionStartupTask,
  early?: EarlyTurnSession,
): TurnSessionRequest {
  const claudePlan = claudePlanBinding(turn.credential);
  return {
    conversationId: turn.conversationId,
    text: turn.text,
    // The turn's PIN outranks the attached credential: a dispatcher that
    // serves a different provider's credential must fail as the PINNED
    // provider's auth error, never silently run (and bill) the turn on a
    // provider the user did not pick. Legacy dispatches carry
    // no pin, so the credential's provider stays the selection there.
    provider: turn.provider || turn.credential?.provider || "",
    emit,
    signal,
    nonce: turn.nonce,
    pin: { model: turn.model, effort: turn.effort },
    mode: turn.mode,
    liveMode: turn.liveMode,
    turnId,
    displayText: turn.displayText,
    mentions: turn.mentions,
    ...(turn.missionTitle ? { missionTitle: turn.missionTitle } : {}),
    author: turn.actingAs,
    ...(claudePlan ? { claudePlan } : {}),
    ...(turn.grant ? { grant: { scopes: turn.grant.scopes } } : {}),
    ...(turn.coordinator ? { role: "coordinator" as const } : {}),
    ...(sandbox ? { sandbox } : {}),
    ...(timings ? { timings } : {}),
    ...(startup ? { startup } : {}),
    ...(early ? { early } : {}),
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
