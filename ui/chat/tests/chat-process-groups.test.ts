import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { getChatDisplayItems } from "../src/chat-process-groups.ts";
import type { ChatMessage } from "../src/feed-to-messages.ts";

function assistant(key: string, over: Partial<ChatMessage>): ChatMessage {
  return {
    key,
    from: "assistant",
    content: "",
    isStreaming: false,
    tools: [],
    fileChanges: [],
    ...over,
  };
}

const user: ChatMessage = {
  key: "user-0",
  from: "user",
  content: "go",
  isStreaming: false,
  tools: [],
  fileChanges: [],
};

// HOU-717: the process block's React key must be STABLE while a turn streams.
// It used to encode the LAST segment too, so every new thinking/tool block
// changed the key, remounted the block, and snapped the user's open mission
// log shut mid-run.
describe("process item key stability", () => {
  it("keeps the same key as segments stream in, and across settle", () => {
    const thinking = assistant("assistant-1", {
      reasoning: { content: "hmm", isStreaming: true },
    });
    const early = getChatDisplayItems([user, thinking], "streaming");
    const earlyProcess = early.find((i) => i.kind === "process");

    const withTool = assistant("assistant-2", {
      tools: [{ name: "bash", input: { cmd: "ls" } }],
    });
    const later = getChatDisplayItems([user, thinking, withTool], "streaming");
    const laterProcess = later.find((i) => i.kind === "process");

    const settled = getChatDisplayItems([user, thinking, withTool], "ready");
    const settledProcess = settled.find((i) => i.kind === "process");

    strictEqual(earlyProcess?.key, laterProcess?.key);
    strictEqual(laterProcess?.key, settledProcess?.key);
  });

  it("gives distinct process blocks distinct keys", () => {
    const first = assistant("assistant-1", {
      tools: [{ name: "bash", input: {} }],
    });
    const secondUser: ChatMessage = { ...user, key: "user-2" };
    const second = assistant("assistant-3", {
      tools: [{ name: "read", input: {} }],
    });
    const items = getChatDisplayItems(
      [user, first, secondUser, second],
      "ready",
    );
    const keys = items.filter((i) => i.kind === "process").map((i) => i.key);
    strictEqual(keys.length, 2);
    strictEqual(new Set(keys).size, 2);
  });
});

// The setup-chat bug: an assistant message with empty text content and no
// tools/reasoning rendered as a bare avatar + empty bubble floating under the
// real message. Such messages are dropped unless they are the actively
// streaming tail (which legitimately starts empty).
describe("empty assistant message suppression", () => {
  const messageItems = (
    messages: ChatMessage[],
    status: "ready" | "streaming",
  ) =>
    getChatDisplayItems(messages, status).filter((i) => i.kind === "message");

  it("drops an empty, non-streaming assistant message", () => {
    const empty = assistant("assistant-1", { content: "" });
    const items = messageItems([user, empty], "ready");
    // Only the user message survives.
    strictEqual(items.length, 1);
    strictEqual(items[0].kind === "message" && items[0].message.from, "user");
  });

  it("drops a whitespace-only, non-streaming assistant message", () => {
    const blank = assistant("assistant-1", { content: "  \n\t " });
    const items = messageItems([user, blank], "ready");
    strictEqual(items.length, 1);
    strictEqual(items[0].kind === "message" && items[0].message.from, "user");
  });

  it("keeps an empty assistant message while it is the streaming tail", () => {
    const streaming = assistant("assistant-1", {
      content: "",
      isStreaming: true,
    });
    const items = messageItems([user, streaming], "streaming");
    strictEqual(items.length, 2);
    strictEqual(
      items[1].kind === "message" && items[1].message.from,
      "assistant",
    );
  });

  it("keeps an empty-but-reasoning assistant message (as a process block)", () => {
    const thinking = assistant("assistant-1", {
      content: "",
      reasoning: { content: "hmm", isStreaming: false },
    });
    const items = getChatDisplayItems([user, thinking], "ready");
    const process = items.find((i) => i.kind === "process");
    strictEqual(Boolean(process), true);
  });
});
