import { join, posix } from "node:path";
import { LazyReadRefusedError } from "@houston/host/src/vfs";
import type { ChatMessage } from "@houston/protocol";
import {
  appendAssistantMessageAt,
  loadConversation,
  type StoredConversation,
  saveConversation,
} from "../store/conversation-file";
import type { AbandonedTurn } from "./op-grammar-reconcile";
import type { TurnFilesystem } from "./turn-filesystem";

/** What settling a dead turn's chat did. */
export type ChatSettle =
  /** The chat's interruption reply for the turn, for the transcript store:
   *  this op wrote it, or an earlier attempt did. */
  | { line: ChatMessage; written: boolean }
  /** Nothing to write: the turn answered, or the chat moved on past it. */
  | { skipped: "answered" | "superseded" | "unknown_turn" }
  /** The transcript is over the worker's read cap. */
  | { tooLarge: true }
  /** The read was refused as sign-in state (never a real chat path). */
  | { privateRefused: true };

/**
 * Give a dead turn the reply its sandbox never wrote: the interruption line
 * the engine writes for a turn it died on (settle-interrupted-turns.ts), which
 * every surface already renders. The sandbox never synced the chat either, so
 * the user message comes from the transcript store, which got it the moment
 * the turn started; written into the file first, the two copies stay equal
 * and the store's file-to-database repair keeps both lines.
 *
 * Only ever at the end of the chat: a turn that answered, or a chat with
 * anything after the dead message, is left exactly as it is. A line landing
 * under a later turn would read as that turn's ending.
 */
export async function settleAbandonedChat(
  filesystem: TurnFilesystem,
  conversationId: string,
  abandoned: AbandonedTurn,
): Promise<ChatSettle> {
  const { turnId, userMessage } = abandoned;
  const fileRel = posix.join(
    filesystem.dataRel,
    "conversations",
    `${encodeURIComponent(conversationId)}.json`,
  );
  try {
    // Materialize the one chat on a lazy tree; the file helpers read disk.
    await filesystem.vfs.readBytes(fileRel);
  } catch (error) {
    if (error instanceof LazyReadRefusedError)
      return error.reason === "private"
        ? { privateRefused: true }
        : { tooLarge: true };
    throw error;
  }
  const dir = join(filesystem.dataDir, "conversations");
  const existing = loadConversation(dir, conversationId);
  const messages = existing?.messages ?? [];
  const reply = messages.findLast(
    (m) => m.role === "assistant" && m.turnId === turnId,
  );
  // A retry finds the line an earlier attempt wrote: still the store's to get.
  if (reply?.interrupted) return { line: reply, written: false };
  if (reply) return { skipped: "answered" };
  const userIndex = messages.findLastIndex(
    (m) => m.role === "user" && m.turnId === turnId,
  );
  // The chat file's own copy first; the transcript store's only when the
  // file never got the message.
  if (userIndex < 0 && !userMessage) return { skipped: "unknown_turn" };
  const after =
    userIndex >= 0
      ? messages.slice(userIndex + 1)
      : messages.filter((m) => m.ts >= (userMessage?.ts ?? 0));
  if (after.length > 0) return { skipped: "superseded" };
  if (userIndex < 0 && userMessage) {
    const conversation: StoredConversation = existing ?? {
      id: conversationId,
      title: userMessage.content.slice(0, 60) || "New chat",
      createdAt: userMessage.ts,
      updatedAt: userMessage.ts,
      messages: [],
    };
    conversation.messages.push(userMessage);
    conversation.updatedAt = Date.now();
    saveConversation(dir, conversation);
  }
  const written = appendAssistantMessageAt(dir, conversationId, "", {
    interrupted: { cause: "sandbox_lost" },
    turnId,
  });
  if (!written) throw new Error(`conversation ${conversationId} vanished`);
  return { line: written.message, written: true };
}
