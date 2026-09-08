import type { ServerResponse } from "node:http";
import { json } from "./http";
import { type LiveTurn, liveTurns } from "./live-turn";

/**
 * PLAN MODE IS THE HOST'S TO ENFORCE, not the runtime's alone - and it is the
 * same rule wherever a runtime asks the host to change something on its behalf
 * (the catalogued Houston operations, the mission board, the user's memory).
 *
 * Plan means the user asked for a proposal and not for the work itself. The
 * runtime withholds its acting tools in that mode, but the host is the process
 * that HOLDS the credential and owns the files: a runtime that skipped its own
 * check (a bug, a fork, a prompt-injected turn addressing these routes directly
 * with the sandbox token it already carries) must still not get a write
 * performed for it. So the mode is read from the host's own record of the turn
 * (`live-turn.ts`), never from the request.
 *
 * FAIL CLOSED: no record for the conversation the caller names means no turn
 * the host started is running there, and an unattributable write is refused the
 * same way `start_mission` has always refused one. Reads are never gated - a
 * plan is built out of what is there, and refusing to LOOK would leave the
 * model proposing blind.
 */

/** The live turn this call belongs to, or the refusal that replaces it. */
export type TurnAuthorization =
  | { ok: true; turn: LiveTurn }
  | { ok: false; status: number; body: { error: string; code: string } };

/**
 * The turn a `/sandbox/*` write runs inside: the host's own record for the
 * agent AND the conversation the caller named, in execute mode.
 */
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

/**
 * Answer the refusal when this write may not happen, and true when the request
 * is finished. False means the turn is live and in execute mode.
 */
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
