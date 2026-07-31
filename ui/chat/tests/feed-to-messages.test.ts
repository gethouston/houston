import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  getChatDisplayItems,
  shouldShowThinkingIndicator,
} from "../src/chat-process-groups.ts";
import { deriveStatus } from "../src/chat-status.ts";
import { feedItemsToMessages } from "../src/feed-to-messages.ts";
import type { FeedItem } from "../src/types.ts";

const user = (text: string): FeedItem => ({
  feed_type: "user_message",
  data: text,
  id: "u1",
});

const streamText = (text: string, id = "t1"): FeedItem => ({
  feed_type: "assistant_text_streaming",
  data: text,
  id,
});

const finalText = (text: string, id = "t1"): FeedItem => ({
  feed_type: "assistant_text",
  data: text,
  id,
});

const toolCall = (name: string, id: string, input: unknown = {}): FeedItem => ({
  feed_type: "tool_call",
  data: { name, input },
  id,
});

const toolResult = (content: string, id: string): FeedItem => ({
  feed_type: "tool_result",
  data: { content, is_error: false },
  id,
});

// HOU-1047: providers that narrate BEFORE running tools (OpenAI's style —
// "Let me connect to anakin.io…" then the actual integration calls) keep the
// text message open when the first tool_call arrives. The tools used to fuse
// into that text message, so the grouping layer rendered the mission log
// INACTIVE above the text and the chat bottom showed only the generic loading
// indicator while the agent worked. A tool call after visible content must
// start a fresh process-only message instead.
describe("tool_call after streamed narration (HOU-1047)", () => {
  const feed = [
    user("connect to anakin"),
    streamText("Let me connect to anakin.io for you."),
    toolCall("integration_execute", "c1", { app: "anakin" }),
    toolResult("ok", "r1"),
    toolCall("integration_execute", "c2", { app: "anakin" }),
  ];

  it("splits the narration and the tools into separate messages", () => {
    const messages = feedItemsToMessages(feed);
    strictEqual(messages.length, 3);
    strictEqual(messages[1].from, "assistant");
    strictEqual(messages[1].content, "Let me connect to anakin.io for you.");
    deepStrictEqual(messages[1].tools, []);
    strictEqual(messages[2].from, "assistant");
    strictEqual(messages[2].content, "");
    strictEqual(messages[2].tools.length, 2);
  });

  it("renders a live trailing mission log, not the loading indicator", () => {
    const messages = feedItemsToMessages(feed);
    const status = deriveStatus(feed, true);
    strictEqual(status, "submitted");
    const items = getChatDisplayItems(messages, status);
    const last = items[items.length - 1];
    strictEqual(last.kind, "process");
    strictEqual(last.kind === "process" && last.isActive, true);
    // The active process block IS the progress surface — the standalone
    // thinking indicator must not double up under it.
    strictEqual(shouldShowThinkingIndicator(items, status), false);
  });

  it("keeps the process block's key stable while more tools stream in", () => {
    const early = getChatDisplayItems(
      feedItemsToMessages(feed.slice(0, 4)),
      "submitted",
    );
    const later = getChatDisplayItems(feedItemsToMessages(feed), "submitted");
    const earlyKey = early.find((i) => i.kind === "process")?.key;
    const laterKey = later.find((i) => i.kind === "process")?.key;
    strictEqual(Boolean(earlyKey), true);
    strictEqual(earlyKey, laterKey);
  });

  it("keeps the same process key when the turn settles (no remount/jump)", () => {
    // Production symptom #2: at settle the final assistant_text finalizes the
    // text entry (positioned before the tools), which used to re-group the
    // tools into their own message for the first time — the log teleported
    // from above the text to a "new" block below it. With the split applied
    // live, the trailing block exists during the run and must settle in place:
    // same key, active -> inactive, no remount.
    const live = getChatDisplayItems(feedItemsToMessages(feed), "submitted");
    const settledFeed = [
      user("connect to anakin"),
      finalText("Let me connect to anakin.io for you."),
      ...feed.slice(2),
      {
        feed_type: "final_result",
        data: { result: "", cost_usd: null, duration_ms: null, usage: null },
        id: "fr1",
      } satisfies FeedItem,
    ];
    const settled = getChatDisplayItems(
      feedItemsToMessages(settledFeed),
      "ready",
    );
    const liveProcess = live[live.length - 1];
    const settledProcess = settled[settled.length - 1];
    strictEqual(liveProcess.kind, "process");
    strictEqual(settledProcess.kind, "process");
    strictEqual(
      liveProcess.kind === "process" && liveProcess.key,
      settledProcess.kind === "process" && settledProcess.key,
    );
    strictEqual(
      settledProcess.kind === "process" && settledProcess.isActive,
      false,
    );
  });

  it("splits a second tool phase off a tools-then-text message", () => {
    // Claude-style opening (tools before any text) followed by narration and
    // then ANOTHER round of tools: the first phase's log settles above the
    // text, and the new phase must start a fresh LIVE trailing log below it —
    // not silently grow the settled one above.
    const multiPhase = [
      user("top 5 hacker news"),
      toolCall("integration_search", "c1", {}),
      toolResult("apps", "r1"),
      streamText("I'll fetch the current Hacker News front page."),
      toolCall("bash", "c2", { cmd: "curl hn" }),
    ];
    const messages = feedItemsToMessages(multiPhase);
    strictEqual(messages.length, 3);
    strictEqual(messages[1].tools.length, 1);
    strictEqual(
      messages[1].content,
      "I'll fetch the current Hacker News front page.",
    );
    strictEqual(messages[2].content, "");
    strictEqual(messages[2].tools.length, 1);
    const items = getChatDisplayItems(messages, "submitted");
    const kinds = items.map((i) => i.kind);
    // settled phase-1 log, text bubble, live phase-2 log
    deepStrictEqual(kinds, ["message", "process", "message", "process"]);
    const first = items[1];
    const last = items[3];
    strictEqual(first.kind === "process" && first.isActive, false);
    strictEqual(last.kind === "process" && last.isActive, true);
    strictEqual(shouldShowThinkingIndicator(items, "submitted"), false);
  });

  it("settles to the text bubble above an inactive mission log", () => {
    const settled = [
      user("connect to anakin"),
      finalText("Let me connect to anakin.io for you. Done!"),
      toolCall("integration_execute", "c1", { app: "anakin" }),
      toolResult("ok", "r1"),
      {
        feed_type: "final_result",
        data: { result: "", cost_usd: null, duration_ms: null, usage: null },
        id: "fr1",
      } satisfies FeedItem,
    ];
    const messages = feedItemsToMessages(settled);
    const items = getChatDisplayItems(messages, "ready");
    const kinds = items.map((i) => i.kind);
    deepStrictEqual(kinds, ["message", "message", "process"]);
    const process = items[2];
    strictEqual(process.kind === "process" && process.isActive, false);
  });
});

describe("tool_call placeholder dedup across the narration flush", () => {
  it("replaces the null-input placeholder inside the fresh tools message", () => {
    const messages = feedItemsToMessages([
      user("go"),
      streamText("Narrating first."),
      toolCall("bash", "c1", null),
      toolCall("bash", "c2", { cmd: "ls" }),
    ]);
    strictEqual(messages.length, 3);
    strictEqual(messages[2].tools.length, 1);
    deepStrictEqual(messages[2].tools[0].input, { cmd: "ls" });
  });

  it("keeps appending to a tools-only message (no spurious splits)", () => {
    const messages = feedItemsToMessages([
      user("go"),
      toolCall("bash", "c1", { cmd: "ls" }),
      toolResult("ok", "r1"),
      toolCall("read", "c2", { path: "a.ts" }),
    ]);
    strictEqual(messages.length, 2);
    strictEqual(messages[1].tools.length, 2);
    strictEqual(messages[1].content, "");
  });

  it("matches a tool_result to the call that moved into the new message", () => {
    const messages = feedItemsToMessages([
      user("go"),
      streamText("Narrating first."),
      toolCall("bash", "c1", { cmd: "ls" }),
      toolResult("listing", "r1"),
    ]);
    strictEqual(messages[2].tools[0].result?.content, "listing");
  });
});
