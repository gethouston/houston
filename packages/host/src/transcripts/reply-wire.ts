import type { ChatMessage } from "@houston/protocol";

export function parseReplyAfter(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object") {
    throw new Error("transcript reply-after returned a non-object body");
  }
  const body = value as Record<string, unknown>;
  if (body.found === false) return null;
  const message = body.message;
  if (!message || typeof message !== "object") {
    throw new Error("transcript reply-after omitted its assistant message");
  }
  const fields = message as Record<string, unknown>;
  if (
    fields.role !== "assistant" ||
    typeof fields.content !== "string" ||
    typeof fields.ts !== "number" ||
    !Number.isFinite(fields.ts)
  ) {
    throw new Error("transcript reply-after returned an invalid message");
  }
  return message as ChatMessage;
}
