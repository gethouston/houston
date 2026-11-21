import type { ServerResponse } from "node:http";
import { json } from "./http";
import { type LiveTurn, liveTurns } from "./live-turn";

export type TurnAuthorization =
  | { ok: true; turn: LiveTurn }
  | { ok: false; status: number; body: { error: string; code: string } };

export function authorizeTurnWrite(
  agentId: string,
  conversationId: string | undefined,
): TurnAuthorization {
  const turn = conversationId
    ? liveTurns.get(agentId, conversationId)
    : undefined;
  if (!turn) {
    return {
      ok: false,
      status: 400,
      body: {
        error:
          "this only works during a turn, in the chat the turn is running in",
        code: "not_in_turn",
      },
    };
  }
  if (turn.mode === "plan") {
    return {
      ok: false,
      status: 403,
      body: {
        error:
          "this chat is in Plan mode, so nothing is changed yet. Finish the plan and tell the user to switch to Execute when they want it done.",
        code: "plan_mode",
      },
    };
  }
  return { ok: true, turn };
}

export function refusedOutsideExecuteTurn(
  agentId: string,
  conversationId: string | undefined,
  res: ServerResponse,
): boolean {
  const authorized = authorizeTurnWrite(agentId, conversationId);
  if (authorized.ok) return false;
  json(res, authorized.status, authorized.body);
  return true;
}
