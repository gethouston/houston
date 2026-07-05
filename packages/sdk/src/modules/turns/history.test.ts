import type { ChatMessage } from "@houston/runtime-client";
import { describe, expect, it } from "vitest";
import { historyToFeed } from "./history";

describe("historyToFeed", () => {
  it("folds a user + assistant turn into user_message, assistant_text, final_result", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "hi", ts: 1 },
      {
        role: "assistant",
        content: "hello",
        ts: 2,
        usage: { context_tokens: 10, output_tokens: 2, cached_tokens: 0 },
      },
    ];
    expect(historyToFeed(messages)).toEqual([
      { feed_type: "user_message", data: "hi", author: undefined },
      { feed_type: "assistant_text", data: "hello" },
      {
        feed_type: "final_result",
        data: {
          result: "hello",
          cost_usd: null,
          duration_ms: null,
          usage: { context_tokens: 10, output_tokens: 2, cached_tokens: 0 },
        },
      },
    ]);
  });

  it("carries the pi provider id through unchanged by default (identity map)", () => {
    const feed = historyToFeed([
      {
        role: "assistant",
        content: "on codex now",
        ts: 1,
        providerSwitch: { provider: "openai-codex", summarized: false },
      },
    ]);
    expect(feed.find((f) => f.feed_type === "provider_switched")?.data).toEqual(
      {
        provider: "openai-codex",
        summarized: false,
        pre_tokens: undefined,
      },
    );
  });

  it("applies a caller's provider map to switch dividers and error cards", () => {
    const map = (id: string) => (id === "openai-codex" ? "openai" : id);
    const feed = historyToFeed(
      [
        {
          role: "assistant",
          content: "",
          ts: 1,
          providerError: {
            kind: "unauthenticated",
            provider: "openai-codex",
            cause: "token_revoked",
            message: "Your session has ended. Please log in again.",
          },
        },
      ],
      map,
    );
    expect(feed.find((f) => f.feed_type === "provider_error")?.data).toEqual({
      kind: "unauthenticated",
      provider: "openai",
      cause: "token_revoked",
      message: "Your session has ended. Please log in again.",
    });
  });

  it("replays tool calls and preserves a multiplayer author on user messages", () => {
    const feed = historyToFeed([
      {
        role: "user",
        content: "run it",
        ts: 1,
        author: { userId: "u1", name: "Ada" },
      },
      {
        role: "assistant",
        content: "done",
        ts: 2,
        tools: [{ name: "shell", isError: true }],
      },
    ]);
    expect(feed[0]).toEqual({
      feed_type: "user_message",
      data: "run it",
      author: { userId: "u1", name: "Ada" },
    });
    expect(feed).toContainEqual({
      feed_type: "tool_call",
      data: { name: "shell", input: {} },
    });
    expect(feed).toContainEqual({
      feed_type: "tool_result",
      data: { content: "", is_error: true },
    });
  });
});
