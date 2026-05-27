import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { mergeFeedHistory, mergeFeedItem } from "../src/feed-merge.ts";
import type { FeedItem } from "../src/types.ts";

const user = (text: string): FeedItem => ({ feed_type: "user_message", data: text });
const assistant = (text: string): FeedItem => ({ feed_type: "assistant_text", data: text });
const stream = (text: string): FeedItem => ({
  feed_type: "assistant_text_streaming",
  data: text,
});
const finalResult = (text: string): FeedItem => ({
  feed_type: "final_result",
  data: {
    result: text,
    cost_usd: null,
    duration_ms: null,
  },
});

describe("mergeFeedItem", () => {
  it("replaces a streaming assistant item with the final item", () => {
    const items = [user("ping?"), stream("Pong")];

    deepStrictEqual(
      mergeFeedItem(items, assistant("Pong. What can I help you with?")),
      [user("ping?"), assistant("Pong. What can I help you with?")],
    );
  });

  it("drops a duplicate final assistant item after final_result", () => {
    const items = [
      user("ping?"),
      assistant("Pong. What can I help you with?"),
      finalResult("Pong. What can I help you with?"),
    ];

    const next = mergeFeedItem(items, assistant("Pong. What can I help you with?"));

    strictEqual(next, items);
  });
});

describe("mergeFeedHistory", () => {
  it("drops stale streaming text when history already has the final answer", () => {
    const history = [
      user("ping?"),
      assistant("Pong. What can I help you with?"),
      finalResult("Pong. What can I help you with?"),
    ];
    const current = [
      user("ping?"),
      stream("Pong. What can I help you with?"),
    ];

    deepStrictEqual(mergeFeedHistory(history, current), history);
  });

  it("keeps live tail items that are not in persisted history", () => {
    const history = [
      user("ping?"),
      assistant("Pong. What can I help you with?"),
      finalResult("Pong. What can I help you with?"),
    ];
    const current = [
      user("ping?"),
      assistant("Pong. What can I help you with?"),
      finalResult("Pong. What can I help you with?"),
      user("now say it shorter"),
      stream("Pong."),
    ];

    deepStrictEqual(
      mergeFeedHistory(history, current),
      [
        ...history,
        user("now say it shorter"),
        stream("Pong."),
      ],
    );
  });
});
