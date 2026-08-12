import type { ChatMessage } from "@houston/protocol";

/** Parse the owned gateway's narrow reply-after response. */
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
  // SAFETY: the owned gateway returns the protocol's verbatim ChatMessage.
  // The fields reconcile relies on are refined above; additive metadata stays
  // untouched so provider errors and attribution survive the projection.
  return message as ChatMessage;
}
