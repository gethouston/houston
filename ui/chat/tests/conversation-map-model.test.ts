import { deepEqual, equal } from "node:assert";
import { describe, it } from "node:test";
import { getChatDisplayItems } from "../src/chat-process-groups.ts";
import {
  deriveConversationMoments,
  searchConversationMoments,
} from "../src/conversation-map-model.ts";
import type { ChatMessage } from "../src/feed-to-messages.ts";

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    key: "message-0",
    from: "assistant",
    content: "",
    isStreaming: false,
    tools: [],
    fileChanges: [],
    ...overrides,
  };
}

function deriveMoments(messages: ChatMessage[]) {
  return deriveConversationMoments(getChatDisplayItems(messages, "ready"));
}

describe("deriveConversationMoments", () => {
  it("indexes visible user, assistant, artifact, and error messages", () => {
    const moments = deriveMoments([
      message({ key: "user-0", from: "user", content: "Find competitors" }),
      message({ key: "assistant-1", content: "I found three competitors" }),
      message({
        key: "assistant-2",
        content: "The report is ready",
        fileChanges: [{ path: "report.md", status: "created" }],
      }),
      message({
        key: "error-3",
        from: "system",
        providerError: {
          kind: "network_unreachable",
          provider: "openai",
          message: "Offline",
        },
      }),
    ]);

    deepEqual(
      moments.map(({ messageKey, type, position }) => ({
        messageKey,
        type,
        position,
      })),
      [
        { messageKey: "user-0", type: "user", position: 1 },
        { messageKey: "assistant-1", type: "assistant", position: 2 },
        { messageKey: "assistant-2", type: "artifact", position: 3 },
        { messageKey: "error-3", type: "error", position: 4 },
      ],
    );
  });

  it("never exposes internal thinking or empty system messages", () => {
    const moments = deriveMoments([
      message({
        key: "thinking",
        reasoning: { content: "private", isStreaming: false },
      }),
      message({ key: "system", from: "system", content: "" }),
    ]);

    equal(moments.length, 0);
  });

  it("uses the rendered anchor for a tool reply with visible content", () => {
    const moments = deriveMoments([
      message({
        key: "assistant-tool",
        content: "The researched answer",
        tools: [
          {
            name: "search",
            input: {},
            result: { content: "Found it", is_error: false },
          },
        ],
      }),
    ]);

    equal(moments.length, 1);
    equal(moments[0]?.messageKey, "assistant-tool-content");
  });

  it("decodes an interaction-answers marker into a clean preview", () => {
    const body =
      '<!--houston:interaction-answers {"lines":[{"question":"To whom?","answer":"john@example.com"},{"question":"Saying what?","answer":"Running late"}]}-->\n\nTo whom?: john@example.com\nSaying what?: Running late';
    const moments = deriveMoments([
      message({ key: "user-0", from: "user", content: body }),
    ]);

    equal(moments.length, 1);
    equal(
      moments[0].preview,
      "To whom?: john@example.com; Saying what?: Running late",
    );
  });

  it("uses an ASCII ellipsis when truncating a long preview", () => {
    const moments = deriveMoments([
      message({ key: "long", content: "x".repeat(120) }),
    ]);

    equal(moments[0]?.preview.endsWith("..."), true);
  });

  it("keeps every searchable moment from a long history", () => {
    const moments = deriveMoments(
      Array.from({ length: 40 }, (_, index) =>
        message({ key: `assistant-${index}`, content: `Response ${index}` }),
      ),
    );

    equal(moments.length, 40);
    equal(moments[0].messageKey, "assistant-0");
    equal(moments.at(-1)?.messageKey, "assistant-39");
  });
});

describe("searchConversationMoments", () => {
  const moments = deriveMoments([
    message({ key: "user-0", from: "user", content: "Plan the launch" }),
    message({ key: "assistant-1", content: "I reviewed the budget" }),
    message({ key: "user-2", from: "user", content: "Open São Paulo next" }),
  ]);

  it("shows user prompts as the conversation outline by default", () => {
    const result = searchConversationMoments(moments, "   ");

    equal(result.hasQuery, false);
    deepEqual(
      result.moments.map((moment) => moment.messageKey),
      ["user-0", "user-2"],
    );
    deepEqual(result.rangesById, {});
  });

  it("filters by an accent-insensitive exact phrase and highlights it", () => {
    const result = searchConversationMoments(moments, "  sao   PAULO ");

    equal(result.hasQuery, true);
    deepEqual(
      result.moments.map((moment) => moment.messageKey),
      ["user-2"],
    );
    deepEqual(
      result.rangesById["user-2"].map((range) =>
        result.moments[0].preview.slice(range.start, range.end),
      ),
      ["São Paulo"],
    );
  });

  it("searches every message before compacting the visible results", () => {
    const longHistory = deriveMoments(
      Array.from({ length: 60 }, (_, index) =>
        message({
          key: `assistant-${index}`,
          content:
            index === 37 ? "Needle in the full history" : `Response ${index}`,
        }),
      ),
    );

    const result = searchConversationMoments(longHistory, "needle");

    deepEqual(
      result.moments.map((moment) => moment.messageKey),
      ["assistant-37"],
    );
  });

  it("finds text beyond the default preview and shows it in a result excerpt", () => {
    const longMessage = deriveMoments([
      message({
        key: "assistant-long",
        content: `${"Opening context ".repeat(12)}hidden itinerary detail`,
      }),
    ]);

    const result = searchConversationMoments(longMessage, "itinerary");

    equal(result.moments.length, 1);
    equal(result.moments[0].preview.includes("itinerary"), true);
    deepEqual(
      result.rangesById["assistant-long"].map((range) =>
        result.moments[0].preview.slice(range.start, range.end),
      ),
      ["itinerary"],
    );
  });
});
