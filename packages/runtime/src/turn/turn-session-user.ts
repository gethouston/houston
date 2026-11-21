import { join } from "node:path";
import type { ChatMessage, WireFrame } from "@houston/runtime-client";
import type { MessageAuthor } from "../session/attribution";
import {
  appendUserMessageAt,
  loadConversation,
} from "../store/conversation-file";
import type { TurnSessionRequest } from "./turn-session-types";

export interface RecordedPooledUser {
  canonicalMessages: ChatMessage[];
  priorAuthors: ReadonlyArray<MessageAuthor | undefined>;
}

export function recordPooledUserTurn(
  dataDir: string,
  turn: TurnSessionRequest,
  emit: (frame: WireFrame) => void,
): RecordedPooledUser {
  const { conversationId, text, author, turnId, nonce, displayText, mentions } =
    turn;
  const conversationsDir = join(dataDir, "conversations");
  const canonicalMessages =
    loadConversation(conversationsDir, conversationId)?.messages ?? [];
  const priorAuthors = author
    ? canonicalMessages
        .filter((message) => message.role === "user")
        .map((message) => message.author)
    : [];
  appendUserMessageAt(conversationsDir, conversationId, text, {
    author,
    turnId,
    nonce,
    displayText,
    mentions,
  });
  emit({
    type: "user",
    data: { content: text, ts: Date.now(), nonce, mentions },
  });
  return { canonicalMessages, priorAuthors };
}
