import type { ChatMessage } from "@houston/runtime-client";

// WHY: pi answers after compacting with no fill; a failed request records zero usage. ADR-0012
export function recordedContextFill(
  messages: readonly ChatMessage[],
): number | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;
    if (message.usage && message.usage.context_tokens > 0)
      return message.usage.context_tokens;
    if (message.compaction || message.providerSwitch || message.contextCleared)
      return undefined;
  }
  return undefined;
}
