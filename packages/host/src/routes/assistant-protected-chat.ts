import type { ServerResponse } from "node:http";
import { addressesMission, recordConversationKind } from "@houston/domain";
import type { AssistantOperation } from "../assistant/catalog";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { refusedDirectoryUnavailable } from "./assistant-operation-params";
import { arg } from "./assistant-request-parts";
import { json } from "./http";

/**
 * THE CHATS THAT ARE NOT THE ASSISTANT'S TO RENAME OR DELETE: the one this turn
 * is running in, and the ones a mission card or a routine owns.
 *
 * Who owns a chat is answered from three places, because no single one of them
 * knows: the calling turn's own conversation, the address Houston mints for a
 * record (`@houston/domain` conversation-keys), and the agent's board, which is
 * the only place a mission's non-conventional chat address is written down.
 */

/** The one refusal a caller gets for a chat that is not its to change. Named on
 *  the runtime's side too (`session/tools/assistant-result.ts`), so the model
 *  hears a final state instead of a gateway error worth retrying. */
export const PROTECTED_CONVERSATION = "protected_conversation";

/** The read every chat-naming parameter declares as where its value comes from
 *  (`ui/engine-client/scripts/assistant-entity-rules.ts`). */
const CHAT_ID_SOURCE = "conversations.list";

/**
 * The parameter a route addresses THE CHAT ITSELF by: a chat id that is the
 * last thing in the path, which is the shape of an operation acting on the
 * chat's own existence or name. `…/conversations/{conversationId}/cancel` also
 * names a chat, but acts on what is happening inside one — stopping a mission's
 * turn is a thing the assistant must keep being able to do.
 */
export function chatAddressedItself(op: AssistantOperation): string | null {
  const chat = op.params.find((param) => param.source === CHAT_ID_SOURCE);
  if (!chat || !op.route) return null;
  return op.route.path.endsWith(`{${chat.name}}`) ? chat.name : null;
}

const MISSION_REFUSAL =
  "that chat belongs to a mission's card, not to the user's list of chats. Rename the mission with renameMission and remove it with deleteActivity, which take the card and its chat together - and tell the user the mission is what they are changing.";

/**
 * Why this chat may not be renamed or deleted from here, read from the ID
 * ALONE — the conversation this turn runs in, and the addresses Houston mints
 * for a record.
 *
 * Case-insensitively, because the store keeps a conversation in a file named
 * after its id: macOS and Windows answer `ACTIVITY-m1` with `activity-m1`'s
 * transcript, so a case-sensitive read would refuse the spelling and delete
 * the chat.
 */
function protectedChat(
  id: string,
  conversationId: string | undefined,
): string | null {
  if (id.toLowerCase() === conversationId?.toLowerCase()) {
    return "that is the chat you are talking in, so it cannot be renamed or deleted from inside itself - doing it would end this conversation mid-answer. Tell the user they can do it themselves from their list of chats.";
  }
  const kind = recordConversationKind(id);
  if (kind === "mission") return MISSION_REFUSAL;
  if (kind === "routine") {
    return "that chat belongs to a routine's runs, not to the user's list of chats. Change the routine itself with updateRoutine or deleteRoutine, and tell the user the routine is what they are changing.";
  }
  return null;
}

/**
 * THE BOARD ITSELF, for the missions whose chat the convention does not spell.
 *
 * A mission's `session_key` is usually `activity-<id>`, but live boards carry
 * cards that were keyed otherwise — a `welcome-` chat, a card whose key was
 * patched after an engine assigned its own id (`app/src/lib/warming-sends.ts`).
 * Those read as ordinary chats from the id alone, and deleting one leaves the
 * card on the board pointing at nothing. The agent's own board is the only
 * place that spelling is written down, so the guard reads it.
 *
 * A board that cannot be read is REFUSED, never treated as a board with no
 * mission on it: an unavailable list must not authorize a delete the board
 * would have forbidden, and the same read failing during identifier resolution
 * already answers this way (`assistant-operation-params.ts`).
 */
async function claimedByBoard(
  ctx: AssistantOperationCtx,
  op: AssistantOperation,
  params: Record<string, unknown>,
  id: string,
): Promise<boolean | "unreadable"> {
  const agent = op.params.find((param) => param.resolver === "agents");
  const agentId = agent ? arg(params, agent.name) : undefined;
  if (typeof agentId !== "string" || !agentId) return false;
  try {
    const missions = await ctx.directory.activities(agentId);
    return missions.some((mission) =>
      addressesMission({ id: mission.id, session_key: mission.sessionKey }, id),
    );
  } catch (error) {
    console.error("[assistant] could not read the agent's board", error);
    return "unreadable";
  }
}

/**
 * Deleting the conversation the assistant is speaking in disposes the live
 * session mid-turn: the user watches the answer they are waiting for vanish,
 * along with everything they said to get it. A mission's or a routine's
 * transcript is the same mistake one step out — the chat is the card's, and
 * removing or retitling it from here leaves the card pointing at nothing, with
 * no screen anywhere that would let the person undo it.
 *
 * Refused with the sentence the model repeats to the user, exactly as the board
 * refuses a move of the mission its own conversation belongs to
 * (`routes/missions-manage.ts`). Reads are untouched: the assistant must be
 * able to look at any of these to talk about them.
 */
export async function refusedProtectedChat(
  ctx: AssistantOperationCtx,
  op: AssistantOperation,
  params: Record<string, unknown>,
  res: ServerResponse,
): Promise<boolean> {
  if (op.route?.method === "GET") return false;
  const name = chatAddressedItself(op);
  if (name === null) return false;
  const id = arg(params, name);
  if (typeof id !== "string") return false;
  const named = protectedChat(id, ctx.conversationId);
  if (named === null) {
    const board = await claimedByBoard(ctx, op, params, id);
    if (board === "unreadable") return refusedDirectoryUnavailable(res);
    if (!board) return false;
  }
  json(res, 409, {
    error: named ?? MISSION_REFUSAL,
    code: PROTECTED_CONVERSATION,
  });
  return true;
}
