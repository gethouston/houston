import type { ChatDisplayItem } from "./chat-process-groups";
import type { ChatMessage } from "./feed-to-messages";

export const AGENT_RUN_KEY = "agent";

export function senderRunKey(message: ChatMessage): string {
  if (message.from === "user") return `user:${message.author?.userId ?? ""}`;
  if (message.from === "system") return `system:${message.key}`;
  return AGENT_RUN_KEY;
}

export function senderRunStarts(
  items: readonly ChatDisplayItem[],
): Set<string> {
  const starts = new Set<string>();
  let previous: string | undefined;
  for (const item of items) {
    if (item.kind === "process") continue;
    const key = senderRunKey(item.message);
    if (key !== previous) starts.add(item.message.key);
    previous = key;
  }
  return starts;
}
