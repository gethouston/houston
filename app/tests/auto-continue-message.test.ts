import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FeedItem } from "@houston-ai/chat";
import {
  encodeAutoContinueMessage,
  filterAutoContinueFeedItems,
  isAutoContinueMessage,
} from "../src/lib/auto-continue-message.ts";

describe("auto-continue message encoding", () => {
  it("round-trips: an encoded message is recognized", () => {
    const encoded = encodeAutoContinueMessage(
      "I've connected Google Drive. Please continue.",
    );
    strictEqual(isAutoContinueMessage(encoded), true);
  });

  it("keeps the agent-facing instruction in the payload", () => {
    const encoded = encodeAutoContinueMessage("please continue");
    strictEqual(encoded.includes("please continue"), true);
  });

  it("does not flag an ordinary user message", () => {
    strictEqual(
      isAutoContinueMessage("I've connected Google Drive. Please continue."),
      false,
    );
  });
});

describe("filterAutoContinueFeedItems", () => {
  it("drops only the auto-continue user message, preserving order", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "real question" },
      { feed_type: "user_message", data: encodeAutoContinueMessage("auto") },
      { feed_type: "assistant_text", data: "answer" },
    ];
    const filtered = filterAutoContinueFeedItems(items);
    deepStrictEqual(
      filtered.map((i) => i.feed_type),
      ["user_message", "assistant_text"],
    );
    strictEqual(
      filtered[0].feed_type === "user_message" && filtered[0].data,
      "real question",
    );
  });

  it("only hides user_message turns, never assistant/tool items", () => {
    // Defensive: an assistant message that happens to start with the marker
    // is still a real assistant turn and must survive.
    const items: FeedItem[] = [
      { feed_type: "assistant_text", data: encodeAutoContinueMessage("x") },
    ];
    strictEqual(filterAutoContinueFeedItems(items).length, 1);
  });

  it("is a no-op for a feed without auto-continue messages", () => {
    const items: FeedItem[] = [
      { feed_type: "user_message", data: "hello" },
      { feed_type: "assistant_text", data: "hi" },
    ];
    strictEqual(filterAutoContinueFeedItems(items).length, 2);
  });
});
