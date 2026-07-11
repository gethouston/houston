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
      { feed_type: "user_message", data: "hi", author: undefined, ts: 1 },
      { feed_type: "assistant_text", data: "hello", ts: 2 },
      {
        feed_type: "final_result",
        data: {
          result: "hello",
          cost_usd: null,
          duration_ms: null,
          usage: { context_tokens: 10, output_tokens: 2, cached_tokens: 0 },
        },
        ts: 2,
      },
    ]);
  });

  it("renders displayText as the user bubble when the stored prompt carried hidden text", () => {
    const feed = historyToFeed([
      {
        role: "user",
        content: "HIDDEN directive + /abs/path/to/file.pdf",
        displayText: "Summarize my file",
        ts: 1,
      },
    ]);
    expect(feed[0]).toEqual({
      feed_type: "user_message",
      data: "Summarize my file",
      author: undefined,
      ts: 1,
    });
  });

  it("falls back to content for a plain user message with no displayText", () => {
    const feed = historyToFeed([{ role: "user", content: "hi", ts: 1 }]);
    expect(feed[0]).toEqual({
      feed_type: "user_message",
      data: "hi",
      author: undefined,
      ts: 1,
    });
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
      ts: 1,
    });
    expect(feed).toContainEqual({
      feed_type: "tool_call",
      data: { name: "shell", input: {} },
      ts: 2,
    });
    expect(feed).toContainEqual({
      feed_type: "tool_result",
      data: { content: "", is_error: true },
      ts: 2,
    });
  });

  it("replays persisted reasoning before the tool calls, with their inputs (HOU-717)", () => {
    const feed = historyToFeed([
      { role: "user", content: "run it", ts: 1 },
      {
        role: "assistant",
        content: "done",
        ts: 2,
        thinking: "first list the files, then decide",
        tools: [
          {
            name: "bash",
            input: { cmd: "ls" },
            result: "file-a\nfile-b",
            isError: false,
          },
        ],
      },
    ]);
    const thinkingIdx = feed.findIndex((f) => f.feed_type === "thinking");
    const toolIdx = feed.findIndex((f) => f.feed_type === "tool_call");
    expect(feed[thinkingIdx]).toEqual({
      feed_type: "thinking",
      data: "first list the files, then decide",
      ts: 2, // additive: every frame carries its source message's epoch-ms ts
    });
    expect(thinkingIdx).toBeLessThan(toolIdx);
    expect(feed[toolIdx]).toEqual({
      feed_type: "tool_call",
      data: { name: "bash", input: { cmd: "ls" } },
      ts: 2,
    });
    // The persisted output preview replays as the tool's result.
    expect(feed[toolIdx + 1]).toEqual({
      feed_type: "tool_result",
      data: { content: "file-a\nfile-b", is_error: false },
      ts: 2,
    });
  });

  it("replays a persisted file-change summary after the assistant text", () => {
    const feed = historyToFeed([
      { role: "user", content: "make a report", ts: 1 },
      {
        role: "assistant",
        content: "Report ready.",
        ts: 2,
        fileChanges: { created: ["report.pdf"], modified: ["notes.md"] },
      },
    ]);
    const textIdx = feed.findIndex((f) => f.feed_type === "assistant_text");
    const changesIdx = feed.findIndex((f) => f.feed_type === "file_changes");
    expect(changesIdx).toBeGreaterThan(textIdx);
    expect(feed[changesIdx].data).toEqual({
      created: ["report.pdf"],
      modified: ["notes.md"],
    });
  });

  it("stamps every frame with its source ChatMessage.ts (epoch ms)", () => {
    const feed = historyToFeed([
      { role: "user", content: "go", ts: 1000 },
      {
        role: "assistant",
        content: "did it",
        ts: 2000,
        tools: [{ name: "shell", isError: false }],
        fileChanges: { created: ["a.txt"], modified: [] },
        usage: { context_tokens: 5, output_tokens: 1, cached_tokens: 0 },
      },
    ]);
    // The user frame carries the user message's ts.
    expect(feed.find((f) => f.feed_type === "user_message")?.ts).toBe(1000);
    // Every frame folded from the assistant message carries ITS ts — including
    // the tool, file-change, and final_result frames, not just the text bubble.
    for (const type of [
      "tool_call",
      "tool_result",
      "assistant_text",
      "file_changes",
      "final_result",
    ]) {
      expect(feed.find((f) => f.feed_type === type)?.ts).toBe(2000);
    }
  });
});
