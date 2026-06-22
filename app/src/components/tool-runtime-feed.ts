import type { ChatMessage, FeedItem } from "@houston-ai/chat";

export function hasToolRuntimeError(items: readonly FeedItem[]): boolean {
  return items.some((item) => item.feed_type === "tool_runtime_error");
}

export function isToolRuntimeErrorMessage(
  msg: ChatMessage,
): msg is ChatMessage & {
  runtimeError: NonNullable<ChatMessage["runtimeError"]>;
} {
  return msg.runtimeError !== undefined;
}
