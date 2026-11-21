import type { ServerResponse } from "node:http";
import { addressesMission, recordConversationKind } from "@houston/domain";
import type { AssistantOperation } from "../assistant/catalog";
import type { AssistantOperationCtx } from "./assistant-operation-ctx";
import { refusedDirectoryUnavailable } from "./assistant-operation-params";
import { arg } from "./assistant-request-parts";
import { json } from "./http";

export const PROTECTED_CONVERSATION = "protected_conversation";

const CHAT_ID_SOURCE = "conversations.list";

export function chatAddressedItself(op: AssistantOperation): string | null {
  const chat = op.params.find((param) => param.source === CHAT_ID_SOURCE);
  if (!chat || !op.route) return null;
  return op.route.path.endsWith(`{${chat.name}}`) ? chat.name : null;
}

const MISSION_REFUSAL =
  "that chat belongs to a mission's card, not to the user's list of chats. Rename the mission with renameMission and remove it with deleteActivity, which take the card and its chat together - and tell the user the mission is what they are changing.";

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
