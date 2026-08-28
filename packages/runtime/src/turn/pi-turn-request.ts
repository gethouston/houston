import type { WireFrame } from "@houston/runtime-client";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import type { PiTurnRequest } from "./turn-session";
import type { TurnRequest } from "./types";

/** Project the accepted envelope onto the pi turn the session runs. */
export function piTurnRequest(
  turn: TurnRequest,
  turnId: string,
  emit: (frame: WireFrame) => void,
  signal: AbortSignal,
  sandbox?: { call: SandboxFetch },
): PiTurnRequest {
  return {
    conversationId: turn.conversationId,
    text: turn.text,
    // The turn's PIN outranks the attached credential: a dispatcher that
    // serves a different provider's credential must fail as the PINNED
    // provider's auth error, never silently run (and bill) the turn on a
    // provider the user did not pick (PRODUCT-1515). Legacy dispatches carry
    // no pin, so the credential's provider stays the selection there.
    provider: turn.provider || turn.credential?.provider || "",
    emit,
    signal,
    nonce: turn.nonce,
    pin: { model: turn.model, effort: turn.effort },
    mode: turn.mode,
    turnId,
    displayText: turn.displayText,
    mentions: turn.mentions,
    author: turn.actingAs,
    ...(turn.grant ? { grant: { scopes: turn.grant.scopes } } : {}),
    ...(sandbox ? { sandbox } : {}),
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
