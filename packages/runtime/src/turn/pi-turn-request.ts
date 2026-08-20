import type { WireFrame } from "@houston/runtime-client";
import type { PiTurnRequest } from "./turn-session";
import type { TurnRequest } from "./types";

/** Project the accepted envelope onto the pi turn the session runs. */
export function piTurnRequest(
  turn: TurnRequest,
  turnId: string,
  emit: (frame: WireFrame) => void,
  signal: AbortSignal,
): PiTurnRequest {
  return {
    conversationId: turn.conversationId,
    text: turn.text,
    provider: turn.credential?.provider ?? "",
    emit,
    signal,
    nonce: turn.nonce,
    pin: { model: turn.model, effort: turn.effort },
    mode: turn.mode,
    turnId,
    displayText: turn.displayText,
    mentions: turn.mentions,
    author: turn.actingAs,
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
