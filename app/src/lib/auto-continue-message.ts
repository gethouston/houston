import {
  encodeAutoContinue,
  isAutoContinue,
} from "@houston/protocol/auto-continue";
import type { FeedItem } from "@houston-ai/chat";

export function encodeAutoContinueMessage(text: string): string {
  return encodeAutoContinue(text);
}

export function isAutoContinueMessage(content: string): boolean {
  return isAutoContinue(content);
}

export function filterAutoContinueFeedItems(items: FeedItem[]): FeedItem[] {
  return items.filter(
    (item) =>
      !(item.feed_type === "user_message" && isAutoContinueMessage(item.data)),
  );
}
