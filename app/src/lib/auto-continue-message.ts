/**
 * A "continue the task" message Houston sends to the agent on the user's
 * behalf when something completes out-of-band and the agent should resume
 * without the user retyping.
 *
 * The provider has no "resume without a prompt" concept, so the agent needs
 * a user turn to continue. But the user never typed it, and showing a fake
 * "I've connected X. Please continue." bubble reads as if they did. So we
 * tag the message with a marker: the agent still receives the instruction
 * (it ignores the leading HTML comment, exactly like the Skill marker in
 * `lib/skill-message.ts`), while the transcript filters the bubble out.
 *
 * The marker rides inside the persisted message, which the engine preserves
 * verbatim (that is how Skill cards survive a reload), so the same filter
 * applies to the optimistic path AND to the message replayed on reload.
 */

import {
  encodeAutoContinue,
  isAutoContinue,
} from "@houston/protocol/auto-continue";
import type { FeedItem } from "@houston-ai/chat";

/** Wrap agent-bound text so the transcript can recognize and hide it. */
export function encodeAutoContinueMessage(text: string): string {
  return encodeAutoContinue(text);
}

/** True for a message Houston auto-sent to resume a task. */
export function isAutoContinueMessage(content: string): boolean {
  return isAutoContinue(content);
}

/**
 * Drop auto-continue user messages from a feed before it is rendered. Only
 * `user_message` turns qualify — an assistant/tool item is never an
 * auto-continue, even if its content somehow started with the marker.
 */
export function filterAutoContinueFeedItems(items: FeedItem[]): FeedItem[] {
  return items.filter(
    (item) =>
      !(item.feed_type === "user_message" && isAutoContinueMessage(item.data)),
  );
}
