import type { ChatStatus } from "./chat-panel-types";
import type { FeedItem } from "./types";

export function deriveStatus(
  items: FeedItem[],
  isLoading: boolean,
): ChatStatus {
  const last = items[items.length - 1];
  if (last?.feed_type === "assistant_text_streaming") {
    return "streaming";
  }
  if (endsOnProviderError(items)) return "ready";
  if (isLoading) return "submitted";
  if (last?.feed_type === "user_message") {
    return "submitted";
  }
  return "ready";
}

function endsOnProviderError(items: FeedItem[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const type = items[i].feed_type;
    if (type === "final_result" || type === "system_message") continue;
    return type === "provider_error";
  }
  return false;
}
