import { pushPendingUserMessage } from "@houston/engine-adapter/turn-stream";
import { conversationStore } from "@houston/engine-adapter/vm";
import { conversationScope } from "@houston/sdk";
import { expect, test } from "vitest";

type FeedEntry = {
  feed_type: string;
  data: unknown;
  author?: { userId: string; name?: string };
};

function feedOf(agentPath: string, sessionKey: string): FeedEntry[] {
  const snapshot = conversationStore.getSnapshot(
    conversationScope(agentPath, sessionKey),
  ) as { feed?: FeedEntry[] } | undefined;
  return snapshot?.feed ?? [];
}

test("a warming bubble carries the acting user, so it is attributed at once", () => {
  pushPendingUserMessage("Houston/Bo", "warm-authored", "book the flight", {
    userId: "user_a",
    name: "Ada Lovelace",
  });
  const feed = feedOf("Houston/Bo", "warm-authored");
  expect(feed).toHaveLength(1);
  expect(feed[0]?.feed_type).toBe("user_message");
  expect(feed[0]?.data).toBe("book the flight");
  expect(feed[0]?.author).toEqual({ userId: "user_a", name: "Ada Lovelace" });
});

test("no acting user (single-player / signed out) leaves the bubble authorless", () => {
  pushPendingUserMessage("Houston/Bo", "warm-anon", "book the flight");
  const feed = feedOf("Houston/Bo", "warm-anon");
  expect(feed).toHaveLength(1);
  expect(feed[0]).not.toHaveProperty("author");
});
