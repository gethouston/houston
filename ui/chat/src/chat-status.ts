import type { ChatStatus } from "./chat-panel-types";
import type { FeedItem } from "./types";

/**
 * Derive the chat-panel status from the feed and the controller's loading
 * flag. The status decides whether [`ChatMessages`](./chat-messages.tsx)
 * renders the thinking indicator (`"submitted"`) or hides it because the
 * actual stream is the progress signal (`"streaming"`).
 *
 * The two streaming-class feed-item types below carry visible
 * progressively-appearing content; while one of them is the most recent
 * item, the indicator would just compete with the streaming text, so we
 * yield "streaming" instead. EVERY other case where a turn is in flight
 * resolves to "submitted" so the user sees a thinking indicator.
 *
 * The previous logic returned `"streaming"` whenever `isLoading` was
 * true and the chat had any prior items — which hid the indicator
 * during the multi-second silent stretches that Gemini introduces (it
 * emits an init line, optionally fires its auto `update_topic` tool,
 * then sits silent for 10-20s before bursting the entire response in
 * one batch). The indicator is the only signal during those stretches.
 */
export function deriveStatus(items: FeedItem[], isLoading: boolean): ChatStatus {
  const last = items[items.length - 1];
  if (
    last?.feed_type === "assistant_text_streaming" ||
    last?.feed_type === "thinking_streaming"
  ) {
    return "streaming";
  }
  // Active turn → indicator visible. Covers:
  //   - brand-new chat with no items yet
  //   - user just sent (last == user_message)
  //   - provider mid-tool-cycle (last == tool_call / tool_result),
  //     waiting on the model's next chunk
  //   - thinking block just landed, still waiting on the response
  //   - any silent gap between tokens for batchy providers (Gemini)
  if (isLoading) return "submitted";
  // Idle but the user just typed and sent — the optimistic
  // user_message is on the feed and we're waiting for `isLoading`
  // to flip true on the next tick. Treat as in-flight.
  if (last?.feed_type === "user_message") return "submitted";
  return "ready";
}
