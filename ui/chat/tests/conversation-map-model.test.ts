import { deepEqual, equal } from "node:assert";
import { describe, it } from "node:test";
import { deriveConversationMoments } from "../src/conversation-map-model.ts";
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

describe("deriveConversationMoments", () => {
  it("indexes visible user, assistant, artifact, and error messages", () => {
    const moments = deriveConversationMoments([
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
    const moments = deriveConversationMoments([
      message({
        key: "thinking",
        reasoning: { content: "private", isStreaming: false },
      }),
      message({ key: "system", from: "system", content: "" }),
    ]);

    equal(moments.length, 0);
  });

  it("decodes an interaction-answers marker into a clean preview", () => {
    const body =
      '<!--houston:interaction-answers {"lines":[{"question":"To whom?","answer":"john@example.com"},{"question":"Saying what?","answer":"Running late"}]}-->\n\nTo whom?: john@example.com\nSaying what?: Running late';
    const moments = deriveConversationMoments([
      message({ key: "user-0", from: "user", content: body }),
    ]);

    equal(moments.length, 1);
    equal(
      moments[0].preview,
      "To whom?: john@example.com; Saying what?: Running late",
    );
  });

  it("uses an ASCII ellipsis when truncating a long preview", () => {
    const moments = deriveConversationMoments([
      message({ key: "long", content: "x".repeat(120) }),
    ]);

    equal(moments[0]?.preview.endsWith("..."), true);
  });

  it("caps long histories while preserving their beginning and end", () => {
    const moments = deriveConversationMoments(
      Array.from({ length: 40 }, (_, index) =>
        message({ key: `assistant-${index}`, content: `Response ${index}` }),
      ),
    );

    equal(moments.length, 24);
    equal(moments[0].messageKey, "assistant-0");
    equal(moments.at(-1)?.messageKey, "assistant-39");
  });
});
