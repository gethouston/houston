import type { StoredConversation } from "../store/stored-conversation";
import { ID, str } from "./op-grammar-fields";

export type ConversationOp = {
  kind: "conversation";
  action: "rename" | "delete" | "truncate" | "import" | "dismiss-interaction";
  conversationId: string;
  title?: string;
  body?: string;
  transcript?: StoredConversation | null;
};

export function parseConversationOp(
  raw: Record<string, unknown>,
): ConversationOp {
  const action = raw.action;
  if (
    action !== "rename" &&
    action !== "delete" &&
    action !== "truncate" &&
    action !== "import" &&
    action !== "dismiss-interaction"
  )
    throw new Error("invalid 'op.action'");
  const conversationId = str(raw.conversationId, "op.conversationId");
  if (
    !ID.test(conversationId) ||
    conversationId.includes("..") ||
    conversationId.startsWith("/")
  )
    throw new Error("invalid 'op.conversationId'");
  if (action === "rename" && typeof raw.title !== "string")
    throw new Error("rename needs 'op.title'");
  let transcript: StoredConversation | null | undefined;
  if ("transcript" in raw) {
    if (raw.transcript === null) transcript = null;
    else {
      const value = raw.transcript as Partial<StoredConversation> | undefined;
      if (
        !value ||
        value.id !== conversationId ||
        typeof value.title !== "string" ||
        typeof value.createdAt !== "number" ||
        typeof value.updatedAt !== "number" ||
        !Array.isArray(value.messages) ||
        value.archived ||
        value.messages.some(
          (m) =>
            !m ||
            typeof m.content !== "string" ||
            typeof m.ts !== "number" ||
            (m.role !== "user" && m.role !== "assistant"),
        )
      )
        throw new Error("invalid 'op.transcript'");
      transcript = value as StoredConversation;
    }
  }
  return {
    kind: "conversation",
    action,
    conversationId,
    ...(typeof raw.title === "string" ? { title: raw.title } : {}),
    ...(typeof raw.body === "string" ? { body: raw.body } : {}),
    ...(transcript !== undefined ? { transcript } : {}),
  };
}
