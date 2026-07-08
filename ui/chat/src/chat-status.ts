import type { ChatStatus } from "./chat-panel-types";
import type { FeedItem } from "./types";

/**
 * Derive the chat-panel status from the feed and the controller's loading
 * flag. The status decides whether [`ChatMessages`](./chat-messages.tsx)
 * renders the in-flight loading indicator (`"submitted"`) or hides it
 * because the actual stream is the progress signal (`"streaming"`).
 *
 * Only `assistant_text_streaming` counts as "streaming": it is the one
 * feed-item type whose progressively-appearing content is VISIBLE, so the
 * indicator would just compete with it. `thinking_streaming` used to count
 * too, but since HOU-448 the reasoning streams inside the collapsed-by-
 * default mission log — nothing on screen moves, so treating it as
 * "streaming" made the loading helmet flicker off during every thinking
 * stretch (HOU-655 follow-up). EVERY case where a turn is in flight and no
 * visible text is streaming resolves to "submitted" so the user sees a
 * loading indicator.
 *
 * The previous logic returned `"streaming"` whenever `isLoading` was
 * true and the chat had any prior items — which hid the indicator
 * during the multi-second silent stretches that Gemini introduces (it
 * emits an init line, optionally fires its auto `update_topic` tool,
 * then sits silent for 10-20s before bursting the entire response in
 * one batch). The indicator is the only signal during those stretches.
 */
export function deriveStatus(
  items: FeedItem[],
  isLoading: boolean,
): ChatStatus {
  const last = items[items.length - 1];
  if (last?.feed_type === "assistant_text_streaming") {
    return "streaming";
  }
  // Active turn → indicator visible. Covers:
  //   - brand-new chat with no items yet
  //   - user just sent (last == user_message)
  //   - provider mid-tool-cycle (last == tool_call / tool_result),
  //     waiting on the model's next chunk
  //   - reasoning streaming or just landed inside the collapsed
  //     mission log, still waiting on the response
  //   - any silent gap between tokens for batchy providers (Gemini)
  if (isLoading) return "submitted";
  // Idle but the user's message is the last thing on the feed — either the
  // send just fired and `isLoading` flips true on the next tick, or the
  // message is parked while the agent's engine warms up (HOU-693/713).
  // Both are "a reply is coming": treat as in-flight.
  if (last?.feed_type === "user_message") {
    return "submitted";
  }
  return "ready";
}
