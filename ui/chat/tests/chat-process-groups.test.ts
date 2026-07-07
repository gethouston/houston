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
