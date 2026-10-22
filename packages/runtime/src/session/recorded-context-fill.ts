import type { ChatMessage } from "@houston/runtime-client";

/**
 * The context fill a conversation's last reply recorded: the size of the last
 * request it sent. A compaction or a provider switch with no reply after it
 * leaves the fill unknown, exactly as pi answers after compacting. A reply
 * whose request failed records zero usage, which says nothing about the fill.
 */
export function recordedContextFill(
  messages: readonly ChatMessage[],
): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    if (message.usage && message.usage.context_tokens > 0)
      return message.usage.context_tokens;
    if (message.compaction || message.providerSwitch) return undefined;
  }
  return undefined;
}
