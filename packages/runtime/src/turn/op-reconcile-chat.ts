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

export type ChatSettle =
  | { line: ChatMessage; written: boolean }
  | { skipped: "answered" | "superseded" | "unknown_turn" }
  | { tooLarge: true }
  | { privateRefused: true };

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
  if (reply?.interrupted) return { line: reply, written: false };
  if (reply) return { skipped: "answered" };
  const userIndex = messages.findLastIndex(
    (m) => m.role === "user" && m.turnId === turnId,
  );
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
